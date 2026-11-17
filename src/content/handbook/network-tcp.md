---
title: "网络编程：TCP 通信、粘包拆包与真实 Socket"
description: "先在内存理解长度前缀分帧，再写出真正可运行的 Linux TCP 服务端与客户端，彻底解决粘包、半包与超长包攻击。"
order: 90
tags: ["C++20", "网络编程", "TCP", "Socket", "协议分帧"]
related: ["handbook/concurrency-queue", "handbook/linux-process-io", "labs/logscan-service"]
sources: ["network-framing.cpp"]
---

## 本课只解决这 1 个问题

写网络程序时，新手 99% 会掉进一个误区：以为客户端调一次 `send("INFO ready")`，服务端调一次 `recv()` 就刚好收到 `"INFO ready"`。实际上 **TCP 是没有消息边界的字节流**，两次 `send` 可能粘成一坨到，一次 `send` 也可能被拆成两半到。

本课先用纯 C++ 代码实现**长度前缀分帧器**（Windows/Linux 都能跑），再给出**真实的 Linux TCP 服务端与客户端代码**，让你亲眼看到跨进程收发与拆包。

前置要求：会用 `std::vector`、`std::string_view`、`std::optional`，了解基本 Linux 终端操作。

## 心智模型：水管 vs 贴了长度标签的快递箱

```text
发送端调用两次 send:  send("INFO ready")   +   send("ERROR timeout")
TCP 字节流眼里只有:   I N F O   r e a d y E R R O R   t i m e o u t   (完全没有边界！)
```

解决办法是制定**应用层分帧协议**：每条消息前面固定贴一个 **4 字节大端无符号整数**，写明后面消息体有多少字节：

```text
[ 4 字节长度: 00 00 00 0A ] [ 10 字节正文: "INFO ready" ] [ 4 字节长度: 00 00 00 0D ] [ 13 字节正文: "ERROR timeout" ]
```

接收端维护一个 `std::vector<std::uint8_t> recv_buf`（每个连接独立一个缓冲区），每次 `recv()` 收到新字节就全追加到末尾，然后循环做两步检查：
1. `recv_buf.size() < 4`：连 4 字节长度头都没凑齐 → **等下一次 `recv`**。
2. 读出长度 `len`，如果 `recv_buf.size() < 4 + len`：正文只到了一半（半包） → **继续等下一次 `recv`**。
3. 凑够了 `4 + len` 字节：切出完整正文交给业务层，并从 `recv_buf` 头部擦除这 `4 + len` 字节，**继续 `while` 检查缓冲区里是不是还粘着下一条消息**。

## 第一部分：核心分帧编解码器（Windows / Linux 通用）

把 `network-framing.cpp` 下载到练习目录，先在 Windows PowerShell 跑通内存模拟，看清粘包和半包是怎么被拆开的：

{{example:network-framing.cpp}}

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic network-framing.cpp -o network-framing.exe
.\network-framing.exe
```

字节缓冲区状态追踪表（对照程序里的 7 字节半包 + 剩余字节）：

| 步骤 | `recv_buf` 总字节数 | 前 4 字节解出的 `len` | 满足 `4 + len` 吗？ | 动作 |
| --- | ---: | ---: | --- | --- |
| 第 1 次到达 7 字节 | 7 | `10` | `7 < 14`（不够） | 返回 `std::nullopt`，保留这 7 字节继续等 |
| 第 2 次到达剩余字节 | 31 | `10` | `31 >= 14`（够了） | 切出 `"INFO ready"`，擦除前 14 字节，剩 17 字节 |
| `while` 下一轮检查 | 17 | `13` | `17 >= 17`（够了） | 切出 `"ERROR timeout"`，擦除 17 字节，剩 0 字节 |
| `while` 再检查 | 0 | — | `< 4` | 返回 `std::nullopt`，等待下次网络数据 |

## 第二部分：真实的 Linux TCP 服务端与客户端（WSL2 实操）

光在内存模拟不过瘾，在 WSL2 Ubuntu 里用真实的 POSIX Socket 把两个程序跑起来！

### 1. 服务端 `tcp_server.cpp`（监听 `127.0.0.1:9090`）

新建 `tcp_server.cpp`（复用上面的 `try_decode_frame`）：

```cpp
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdint>
#include <iostream>
#include <optional>
#include <string>
#include <vector>

constexpr std::uint32_t kMaxFrameBytes = 64 * 1024; // 防恶意超大包打爆内存

std::optional<std::string> try_decode_frame(std::vector<std::uint8_t>& buf, bool& bad_frame) {
    if (buf.size() < 4) return std::nullopt;
    std::uint32_t len = (static_cast<std::uint32_t>(buf[0]) << 24) |
                        (static_cast<std::uint32_t>(buf[1]) << 16) |
                        (static_cast<std::uint32_t>(buf[2]) << 8) |
                        static_cast<std::uint32_t>(buf[3]);
    if (len > kMaxFrameBytes) {
        bad_frame = true; // 超过 64KB，直接标记异常并断开连接
        return std::nullopt;
    }
    if (buf.size() < 4 + len) return std::nullopt;
    std::string msg(buf.begin() + 4, buf.begin() + 4 + len);
    buf.erase(buf.begin(), buf.begin() + 4 + len);
    return msg;
}

int main() {
    int listen_fd = ::socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    ::setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)); // 允许快速重启端口

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9090);
    ::inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (::bind(listen_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0 ||
        ::listen(listen_fd, 16) < 0) {
        std::perror("bind/listen failed");
        return 1;
    }
    std::cout << "服务端已启动，监听 127.0.0.1:9090 ...\n";

    int client_fd = ::accept(listen_fd, nullptr, nullptr);
    std::vector<std::uint8_t> recv_buf;
    std::uint8_t tmp[1024];

    while (true) {
        ssize_t n = ::recv(client_fd, tmp, sizeof(tmp), 0);
        if (n == 0) {
            std::cout << "客户端正常断开连接\n";
            break;
        }
        if (n < 0) {
            std::perror("recv error");
            break;
        }
        recv_buf.insert(recv_buf.end(), tmp, tmp + n);
        bool bad_frame = false;
        while (auto msg = try_decode_frame(recv_buf, bad_frame)) {
            std::cout << "[收到完整日志] " << *msg << '\n';
        }
        if (bad_frame) {
            std::cerr << "收到超长异常包，断开连接\n";
            break;
        }
    }

    ::close(client_fd);
    ::close(listen_fd);
    return 0;
}
```

### 2. 客户端 `tcp_client.cpp`（故意把两条消息粘在一起发出去！）

```cpp
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdint>
#include <iostream>
#include <string_view>
#include <vector>

std::vector<std::uint8_t> encode_frame(std::string_view msg) {
    std::uint32_t len = static_cast<std::uint32_t>(msg.size());
    std::vector<std::uint8_t> out{
        static_cast<std::uint8_t>((len >> 24) & 0xFF),
        static_cast<std::uint8_t>((len >> 16) & 0xFF),
        static_cast<std::uint8_t>((len >> 8) & 0xFF),
        static_cast<std::uint8_t>(len & 0xFF),
    };
    out.insert(out.end(), msg.begin(), msg.end());
    return out;
}

int main() {
    int fd = ::socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9090);
    ::inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (::connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        std::perror("connect failed");
        return 1;
    }

    // 故意把两条帧拼成一个大数组一次 send，制造真实粘包！
    auto payload = encode_frame("INFO service started");
    auto second = encode_frame("ERROR connection lost");
    payload.insert(payload.end(), second.begin(), second.end());

    // 严谨做法：循环 send 直到全部发完（防止内核发送缓冲满导致只发出一部分）
    std::size_t sent = 0;
    while (sent < payload.size()) {
        ssize_t n = ::send(fd, payload.data() + sent, payload.size() - sent, 0);
        if (n <= 0) break;
        sent += static_cast<std::size_t>(n);
    }

    ::close(fd);
    return 0;
}
```

在 WSL2 Ubuntu 开两个终端编译并运行：

```bash
# 终端 1（服务端）
g++ -std=c++20 -Wall -Wextra tcp_server.cpp -o tcp_server && ./tcp_server

# 终端 2（客户端）
g++ -std=c++20 -Wall -Wextra tcp_client.cpp -o tcp_client && ./tcp_client
```

终端 1 会干净地拆出两条日志并打印 `客户端正常断开连接`。

## 4 个微练习

### 练习 1（为什么要有 `SO_REUSEADDR`？）

如果不加 `setsockopt(..., SO_REUSEADDR, ...)`，服务端刚按 `Ctrl+C` 关掉再立刻重开，常常会报错 `Address already in use`，为什么？

<details>
<summary>核对答案</summary>

TCP 连接断开时主动关闭的一方会进入 `TIME_WAIT` 状态（通常持续 60 秒）以确保网络中残留的旧包彻底消散。加上 `SO_REUSEADDR` 允许开发和重启服务时立即复用处于 `TIME_WAIT` 状态的端口。

</details>

### 练习 2（为什么 `recv` 后要用 `while` 而不是 `if`？）

在 `tcp_server.cpp` 里，如果把 `while (auto msg = try_decode_frame(...))` 改成 `if (...)`，上面 `tcp_client.cpp` 一次发送 2 条粘包消息时会发生什么？

<details>
<summary>核对答案</summary>

`if` 只会拆出第一条 `"INFO service started"`；紧接着客户端关闭连接，服务端 `recv` 返回 `0` 退出循环，第二条 `"ERROR connection lost"` 留在 `recv_buf` 里**直接被丢掉了**！

</details>

### 练习 3（为什么必须限制 `kMaxFrameBytes`？）

如果去掉 `len > kMaxFrameBytes` 的检查，有人往你的端口发 4 个字节 `FF FF FF FF`（约 4GB），服务端会发生什么？

<details>
<summary>核对答案</summary>

服务端会认为接下来还有 4GB 正文要收，一直傻等并不断把数据塞进 `recv_buf` 直到耗尽服务器内存被系统 OOM Kill。任何网络协议解码器都必须检查长度上限。

</details>

### 练习 4（动手模拟半包发送）

修改上面的 `tcp_client.cpp`，先把 `payload` 的前 `6` 个字节 `send` 出去，调用 `sleep(1)` 睡 1 秒，再把剩下的字节 `send` 出去，观察服务端是不是依然能完美等齐并拆出两条完整消息。
