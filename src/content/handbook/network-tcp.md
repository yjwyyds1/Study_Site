---
title: "Socket 编程、协议分帧、非阻塞 I/O、epoll 与高并发架构"
description: "手把手写出 POSIX Socket 服务端与客户端，彻底解决 EINTR/短写/分帧粘包，掌握非阻塞 EAGAIN、poll 超时预算、epoll LT/ET、Reactor 事件循环与 C10K 背压控制（NET-31 ~ NET-40）。"
order: 92
category: "计算机网络"
tags: ["C++20", "网络编程", "Socket", "协议分帧", "epoll", "Reactor"]
related: ["handbook/net-transport-tcp", "handbook/net-app-sec", "handbook/concurrency-queue", "labs/logscan-service"]
sources: ["network-framing.cpp"]
---

## 本篇总览（NET-31 ~ NET-40）

前面学会了网购快递和 TCP 状态机，本篇直接上**真实 C++20 网络编程代码**，从单连接 `socket/bind/listen/accept`（`NET-31`）、`getaddrinfo` 解析（`NET-32`）、短读写循环（`NET-33`）、4 字节长度头分帧（`NET-34`/`NET-35`），一路打通非阻塞与 `EAGAIN`（`NET-36`）、`select/poll` 超时预算（`NET-37`）、Linux `epoll` 原理与 LT/ET（`NET-38`）、Reactor 与零拷贝（`NET-39`），直到 C10K 背压架构检查表（`NET-40`）。

## 阅读路标：主线必读 vs 进阶深潜

| 阅读层级 | 对应章节 | 学完能解决 `LogScan` 什么问题 | 首遍建议 |
| --- | --- | --- | --- |
| **主线必读** | `NET-34`/`NET-35`：长度前缀分帧器（`network-framing.cpp`） | 先在纯内存跑通粘包/半包拆解（`v3` E3a 核心） | 必读（动手运行） |
| **主线必读** | `NET-31`/`NET-33`：健壮的 Linux TCP 服务端与客户端 | 写出带 `UniqueFd`、`SO_REUSEADDR`、`EINTR` 与 `send_all` 的服务 | 必读 |
| **主线必读** | `NET-37`：`poll()` + `steady_clock` 截止时间 | 防慢客户端发送半帧卡死（`v3` E3c 超时验收） | 必读 |
| **进阶深潜** | `NET-32` & `NET-36`–`NET-40`：`getaddrinfo`、`epoll` 与 Reactor | 多候选域名解析、百万级连接 `epoll` LT/ET 与零拷贝背压 | 二遍深潜 |

## 一、Socket API 生命周期与端点封装（NET-31）

Linux 下服务端创建并接收连接遵循固定的“五步曲”：**`socket()` 创建插孔 → `setsockopt(SO_REUSEADDR)` 避开重启端口占用 → `bind()` 占住门牌号和房间号 → `listen()` 开张排队等待 → `accept()` 从全连接队列拎出一位顾客**。五元组 `{协议, 源IP, 源端口, 目的IP, 目的端口}` 唯一标识内核里的一条活跃 TCP 连接。

### 1. ip route 核对本机回环路由与 `127.0.0.1` vs `0.0.0.0`

| 地址 | 协议族 | 含义与常见用途 |
| --- | --- | --- |
| `127.0.0.1` / `::1` | IPv4 / IPv6 | **仅本机回环**。只有本机进程能连，局域网其他机器连不上 |
| `0.0.0.0` / `::` | 通配地址 | **监听本机所有网卡 IP**，对外开放服务必须绑通配或具体内网 IP |

```bash
ip route get 127.0.0.1
ip -6 route get ::1
```

## 二、DNS 名字解析与 `getaddrinfo` 候选遍历（NET-32）

真实程序里很少写死 `"127.0.0.1"`，而是传主机名。Linux 按 `/etc/nsswitch.conf` 先查 `/etc/hosts` 再查 DNS 的 **A/AAAA** 记录。一个域名常返回多个候选地址，必须用 `getaddrinfo` 遍历整条链表逐一尝试 `connect`，并用 RAII 确保 `freeaddrinfo` 绝不泄露：

```cpp
#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>
#include <iostream>
#include <memory>

struct AddrInfoDeleter {
    void operator()(addrinfo* p) const noexcept {
        if (p) ::freeaddrinfo(p);
    }
};
using AddrInfoPtr = std::unique_ptr<addrinfo, AddrInfoDeleter>;

int connect_host(const char* host, const char* port) {
    addrinfo hints{};
    hints.ai_family = AF_UNSPEC;     // 允许 IPv4 或 IPv6
    hints.ai_socktype = SOCK_STREAM; // TCP 字节流

    addrinfo* raw_res = nullptr;
    int rc = ::getaddrinfo(host, port, &hints, &raw_res);
    if (rc != 0) {
        std::cerr << "getaddrinfo 失败: " << ::gai_strerror(rc) << '\n';
        return -1;
    }
    AddrInfoPtr res(raw_res);

    for (addrinfo* p = res.get(); p != nullptr; p = p->ai_next) {
        int fd = ::socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (fd < 0) continue;
        if (::connect(fd, p->ai_addr, p->ai_addrlen) == 0) {
            return fd; // 成功连上第一个可达候选！
        }
        ::close(fd);
    }
    return -1;
}
```

## 三、协议定界方案与长度前缀分帧器（NET-34 / NET-35）

| 协议定界方式 | 优点 | 缺点与适用场景 |
| --- | --- | --- |
| **分隔符定界（`\n` / `\r\n`）** | 人类可读，调试方便（Redis RESP、HTTP 首部） | 正文出现 `\n` 必须转义，扫完整报文才能定长 |
| **长度前缀定界（4B 大端 + 载荷）** | `O(1)` 读头知长度、支持任意二进制、防扫描全包 | 必须先验 `len <= kMaxFrameBytes` 防 OOM（**NET-34 主推**） |

```text
发送端调用两次 send:  send("INFO ready")   +   send("ERROR timeout")
TCP 字节流眼里只有:   I N F O   r e a d y E R R O R   t i m e o u t   (完全没有边界！)
```

解决办法是制定**应用层分帧协议**：每条消息前面固定贴一个 **4 字节大端无符号整数**，写明后面消息体有多少字节：

```text
[ 4 字节长度: 00 00 00 0A ] [ 10 字节正文: "INFO ready" ] [ 4 字节长度: 00 00 00 0D ] [ 13 字节正文: "ERROR timeout" ]
```

接收端维护一个 `std::vector<std::uint8_t> recv_buf`（每个连接独立一个缓冲区），每次 `recv()` 收到新字节就全追加到末尾，然后循环做三步检查：
1. `recv_buf.size() < 4`：连 4 字节长度头都没凑齐 → **等下一次 `recv`**。
2. 先检查长度上限 `len > kMaxFrameBytes`（如 `64 KiB`）再计算 `4 + len`（防止 `uint32_t` 整数溢出和恶意 4GB 超长包打爆内存）！如果 `recv_buf.size() < 4 + len`：正文只到了一半（半包） → **继续等下一次 `recv`**。
3. 凑够了 `4 + len` 字节：切出完整正文交给业务层，并从 `recv_buf` 头部擦除这 `4 + len` 字节，**继续 `while` 检查缓冲区里是不是还粘着下一条消息**。

## 第三部分：核心分帧编解码器（Windows / Linux 通用）

在练习目录新建 `network-framing.cpp` 并写入下面的代码，先在 Windows PowerShell 跑通内存模拟，看清粘包和半包是怎么被拆开的：

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

## 四、短读短写循环与健壮 Linux TCP 服务端/客户端（NET-33）

下面把原型升级为工程级 POSIX Socket 代码，补齐 4 个关键防线：**`UniqueFd` RAII 独占描述符**、`SO_REUSEADDR`、`EINTR` 信号中断重试、以及 **短写循环 `send_all`**。

### 1. 服务端 `tcp_server.cpp`（监听 `127.0.0.1:9090`，区分正常 EOF 与半帧截断）

```cpp
#include <arpa/inet.h>
#include <cerrno>
#include <cstdint>
#include <iostream>
#include <netinet/in.h>
#include <optional>
#include <string>
#include <sys/socket.h>
#include <unistd.h>
#include <utility>
#include <vector>

constexpr std::uint32_t kMaxFrameBytes = 64 * 1024; // 上限 64 KiB，防超长包 OOM

class UniqueFd {
public:
    UniqueFd() = default;
    explicit UniqueFd(int fd) noexcept : fd_(fd) {}
    ~UniqueFd() { reset(); }
    UniqueFd(const UniqueFd&) = delete;
    UniqueFd& operator=(const UniqueFd&) = delete;
    UniqueFd(UniqueFd&& other) noexcept : fd_(std::exchange(other.fd_, -1)) {}
    UniqueFd& operator=(UniqueFd&& other) noexcept {
        if (this != &other) { reset(); fd_ = std::exchange(other.fd_, -1); }
        return *this;
    }
    int get() const noexcept { return fd_; }
    explicit operator bool() const noexcept { return fd_ >= 0; }
    void reset(int new_fd = -1) noexcept {
        if (fd_ >= 0) ::close(fd_);
        fd_ = new_fd;
    }
private:
    int fd_ = -1;
};

std::optional<std::string> try_decode_frame(std::vector<std::uint8_t>& buf, bool& bad_frame) {
    if (buf.size() < 4) return std::nullopt;
    std::uint32_t len = (static_cast<std::uint32_t>(buf[0]) << 24) |
                        (static_cast<std::uint32_t>(buf[1]) << 16) |
                        (static_cast<std::uint32_t>(buf[2]) << 8) |
                        static_cast<std::uint32_t>(buf[3]);
    if (len > kMaxFrameBytes) {
        bad_frame = true; // 仅收到 4 字节超限头就立即拒绝，不等正文！
        return std::nullopt;
    }
    if (buf.size() - 4 < len) return std::nullopt;
    std::string msg(buf.begin() + 4, buf.begin() + 4 + len);
    buf.erase(buf.begin(), buf.begin() + 4 + len);
    return msg;
}

int main() {
    UniqueFd listen_fd(::socket(AF_INET, SOCK_STREAM, 0));
    if (!listen_fd) { std::perror("socket"); return 1; }

    int opt = 1;
    ::setsockopt(listen_fd.get(), SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9090);
    ::inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (::bind(listen_fd.get(), reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0 ||
        ::listen(listen_fd.get(), 16) < 0) {
        std::perror("bind/listen failed");
        return 1;
    }
    std::cout << "服务端已启动，监听 127.0.0.1:9090 ...\n";

    int raw_client = -1;
    do {
        raw_client = ::accept(listen_fd.get(), nullptr, nullptr);
    } while (raw_client < 0 && errno == EINTR);
    if (raw_client < 0) { std::perror("accept"); return 1; }
    UniqueFd client_fd(raw_client);

    std::vector<std::uint8_t> recv_buf;
    std::uint8_t tmp[1024];

    while (true) {
        ssize_t n = ::recv(client_fd.get(), tmp, sizeof(tmp), 0);
        if (n < 0) {
            if (errno == EINTR) continue; // 被信号打断，安全重试
            std::perror("recv error");
            break;
        }
        if (n == 0) {
            if (!recv_buf.empty()) {
                std::cerr << "连接异常截断：收到半帧后遇到 EOF，剩余 "
                          << recv_buf.size() << " 字节\n";
            } else {
                std::cout << "客户端在消息边界正常断开连接\n";
            }
            break;
        }
        recv_buf.insert(recv_buf.end(), tmp, tmp + n);
        bool bad_frame = false;
        while (auto msg = try_decode_frame(recv_buf, bad_frame)) {
            std::cout << "[收到完整日志] " << *msg << '\n';
        }
        if (bad_frame) {
            std::cerr << "收到超限长度头（> " << kMaxFrameBytes << "B），断开连接\n";
            break;
        }
    }
    return 0; // UniqueFd 析构按逆序自动关闭 client_fd 和 listen_fd
}
```

### 2. 客户端 `tcp_client.cpp`（粘包发送 + 处理 `EINTR` 的 `send_all`）

```cpp
#include <arpa/inet.h>
#include <cerrno>
#include <cstdint>
#include <iostream>
#include <netinet/in.h>
#include <string_view>
#include <sys/socket.h>
#include <unistd.h>
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

bool send_all(int fd, const std::uint8_t* data, std::size_t size) {
    std::size_t sent = 0;
    while (sent < size) {
        ssize_t n = ::send(fd, data + sent, size - sent, 0);
        if (n < 0) {
            if (errno == EINTR) continue; // 信号中断则重试
            std::perror("send failed");
            return false;
        }
        if (n == 0) return false;
        sent += static_cast<std::size_t>(n);
    }
    return true;
}

int main() {
    int fd = ::socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { std::perror("socket"); return 1; }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9090);
    ::inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (::connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        std::perror("connect failed");
        ::close(fd);
        return 1;
    }

    auto payload = encode_frame("INFO service started");
    auto second = encode_frame("ERROR connection lost");
    payload.insert(payload.end(), second.begin(), second.end());

    if (!send_all(fd, payload.data(), payload.size())) {
        ::close(fd);
        return 1;
    }
    ::shutdown(fd, SHUT_WR); // 发出半关闭 FIN，告知服务端请求已发完
    ::close(fd);
    return 0;
}
```

在 WSL2 Ubuntu 开两个终端编译并运行：

```bash
# 终端 1（服务端）
g++ -std=c++20 -Wall -Wextra -Wpedantic tcp_server.cpp -o tcp_server && ./tcp_server

# 终端 2（客户端）
g++ -std=c++20 -Wall -Wextra -Wpedantic tcp_client.cpp -o tcp_client && ./tcp_client
```

## 五、I/O 多路复用、非阻塞 EAGAIN、epoll 与 Reactor 高并发（NET-36 ~ NET-40）

### 1. 非阻塞 Socket 与 `EAGAIN / EWOULDBLOCK`（NET-36）

给 fd 加上 `O_NONBLOCK` 标志后，`recv()` / `send()` 在内核缓冲区没数据时**不再死等卡住当前线程**，而是立刻返回 `-1` 并置 `errno == EAGAIN`（或等价的 `EWOULDBLOCK`），告诉你“现在没活干，先去照顾其他连接”。搭配 `readv` / `writev` 分散聚集读写，还能一次把长度头和正文两块零拷贝发进内核。

### 2. `select` vs `poll` 与 `steady_clock` 截止时间（NET-37）

阻塞式 `recv()` 会被发完 4 字节就装睡的慢客户端无限挂死。必须用 `poll()` 配合单调时钟 `std::chrono::steady_clock` 扣减剩余超时预算（被 `EINTR` 打断时绝不重置预算）：

```cpp
#include <chrono>
#include <poll.h>

// 在单连接读循环中等待可读，直至总截止时间 deadline 到期
int wait_readable_until(int fd, std::chrono::steady_clock::time_point deadline) {
    while (true) {
        auto now = std::chrono::steady_clock::now();
        if (now >= deadline) return 0; // 超时（0 表示超时退出）
        auto rem_ms = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - now).count();
        if (rem_ms <= 0) rem_ms = 1;

        pollfd pfd{fd, POLLIN, 0};
        int rc = ::poll(&pfd, 1, static_cast<int>(rem_ms));
        if (rc < 0 && errno == EINTR) continue; // 被信号打断时重算剩余时间，不重置预算！
        return rc; // >0 就绪，0 超时，<0 出错
    }
}
```

> 关键原则：**绝不用 `system_clock` 算超时**（NTP 对时回调会导致时间跳变），必须用单调递增的 `steady_clock`；被 `EINTR` 打断重新 `poll` 时只用 `deadline - now` 剩余预算，避免“每次中断重置超时”被慢速攻击拖死。

### 3. Linux `epoll` 原理、LT 与 ET 模式及 Reactor 事件循环（NET-38 / NET-39）

`select` 最多只能盯 1024 个 fd，且 `select` 和 `poll` 每次调用都要把全部几万个 fd 列表从用户态复制到内核、再挨个扫一遍谁就绪（$\mathcal{O}(N)$）。Linux 独占的 **`epoll`** 用两招降到 **$\mathcal{O}(就绪数)$**：
1. **`epoll_ctl` 注册进内核红黑树**：长连接只注册 1 次，不用每次把全部 fd 重新拷贝进内核。
2. **`epoll_wait` 直接拿就绪双向链表**：网卡中断触发内核回调，直接把活跃 socket 塞进 `rdllist`，即便挂着 10 万条空闲连接、只有 5 条有数据，`epoll_wait` 也只返回这 5 条！

| 触发模式 | 行为差异 | 代码避坑关键点 |
| --- | --- | --- |
| **水平触发 LT**（默认，稳妥首选） | 只要内核接收缓冲里还有数据没读完，下次 `epoll_wait` 仍会继续提醒你 | 读不完也不丢事件；注意**写事件 `EPOLLOUT` 只在发送缓冲区积压未写完时才挂载**，发完立刻摘掉防 CPU 100% 空转 |
| **边缘触发 ET**（高阶极致） | 只在状态从“空→有”那一瞬间通知你 **1 次**！ | **必须配合 `O_NONBLOCK` 写 `while` 读/写直到 `EAGAIN`**，否则剩半包永远等不到下次通知 |

**Reactor 单线程 / One-Loop-Per-Thread 架构（NET-39）**：主线程 `accept` 收到新连接后按轮询分发给多个工作线程各自的 `epoll` 事件循环（零锁管理单连接 `recv_buf`/`send_buf`），若要传输本地大日志文件直接调用零拷贝 **`sendfile(out_fd, in_fd, ...)`** 绕过用户态往返搬运。

### 4. 背压控制、资源上限与 C10K/C10M 工程检查表（NET-40）

- **每个连接独立状态**：保存 `{ fd, recv_buf, send_buf, deadline }`；`POLLIN`/`EPOLLIN` 就绪时排干读缓冲直到 `EAGAIN`。
- **三项硬预算与背压**：限制**最大并发连接数**（超限即拒）、限制**单连接缓冲上限**；当后端工作队列（如 LogScan v3 `BoundedQueue`）满载时，**立刻从 `poll`/`epoll` 摘掉对应连接的读监听位**，停止从内核取数据——内核收满 `rwnd=0` 后自动通过 TCP 滑动窗口把背压传回客户端减速！
- **优雅停机（Graceful Shutdown）**：收到 `SIGINT`/`SIGTERM` 先关掉监听 socket 停止 `accept`，排空已在队列里的请求回发 ACK 并 `fsync` 落盘后再全部 `close`。
- （注：HTTP 与 TLS/HTTPS 边界已系统拆解在下一篇 [应用层与网络安全：DNS、HTTP/1.1~3 与 TLS 握手](../net-app-sec/)）。

## 常见 1 行反例坑（对照排查）

- `if (auto m = try_decode(buf))` 只拆 1 次而不是 `while` → 客户端粘包发 2 条时，第 2 条滞留在 `buf` 里直到下次才处理甚至随连接关闭丢失。
- 跳过 `len > kMaxFrameBytes` 检查直接 `buf.size() < 4 + len` → 对端发 `FF FF FF FF` 时无符号溢出或申请 4GB 内存导致 OOM。
- `send(fd, buf, len, 0)` 不写循环 → 发送大帧或内核缓冲满时发生短写，剩余字节静默丢失。
- 忘记处理 `errno == EINTR` → 进程收到信号后 `accept`/`recv`/`poll` 提前返回 `-1`，误判为断连。
- 用 `system_clock` 计算 `poll` 超时 → 系统校时时超时突然提前或变成负数挂起。

## 本课常见报错急救室

| 报错现象 / 关键字 | 一句话根因 | 精准修复命令 / 写法 |
| --- | --- | --- |
| `bind/listen failed: Address already in use`（`EADDRINUSE`） | 端口被未退出的旧进程占着，或刚重启的服务端口正处于 60 秒 `TIME_WAIT` 状态。 | `ss -lntp \| grep 9090` 查占用进程；在 `bind()` 前加 `setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt))`。 |
| 服务端向断开的客户端写回执时进程直接崩掉（`SIGPIPE` / 退出码 `141`） | 对端已关闭连接，继续调 `send`/`write` 触发内核 `SIGPIPE` 默认杀死进程。 | 在 `main` 开头加 `std::signal(SIGPIPE, SIG_IGN);`，并在 `send_all` 里对 `errno == EPIPE` 安全断连。 |
| 非阻塞 Socket 上 `recv` 返回 `-1` 且 `errno == EAGAIN`（`Resource temporarily unavailable`） | 非阻塞 `O_NONBLOCK` 套接字当前内核缓冲区已读空（或触发了 `SO_RCVTIMEO` 超时），不是坏连接。 | 非阻塞读循环遇 `EAGAIN`/`EWOULDBLOCK` 应 `break` 等下次 `poll` 就绪；若设了读超时则按慢连接关闭。 |
| `connect failed: Connection refused`（`ECONNREFUSED`） | 服务端还没 `listen`，或服务端只绑 `127.0.0.1` 而客户端连了 `::1`（IPv4/IPv6 不一致）。 | `ss -lntp \| grep 9090` 确认服务端监听端口与协议族，统一连 `127.0.0.1:9090`。 |

## 5 个梯度微练习

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

### 练习 3（为什么必须先检查 `kMaxFrameBytes`？）

如果去掉 `len > kMaxFrameBytes` 的检查，有人往你的端口发 4 个字节 `FF FF FF FF`（约 4GB），服务端会发生什么？

<details>
<summary>核对答案</summary>

服务端会认为接下来还有 4GB 正文要收，一直傻等并不断把数据塞进 `recv_buf` 直到耗尽服务器内存被系统 OOM Kill；若写成 `buf.size() < 4 + len` 且 `len` 为 `uint32_t`，甚至可能发生 32 位整数加法回绕。任何协议解码器都必须在读取头之后、计算总长之前立即校验长度上限。

</details>

### 练习 4（半包发送与截断 EOF 实验）

修改上面的 `tcp_client.cpp` 做两组对照实验：
1. 先把 `payload` 的前 `6` 个字节 `send` 出去，`sleep(1)` 后再发剩余字节，验证服务端能否完整拆出两条；
2. 只发送前 `6` 个字节后直接 `close(fd)`，观察新版 `tcp_server.cpp` 是否准确打印“连接异常截断”。

<details>
<summary>参考提示</summary>

第 1 组里，服务端先收到 6 字节满足 `buf.size() - 4 < len`，保留在 `recv_buf` 等 1 秒，收齐后 `while` 拆出两条并正常 EOF；第 2 组里，`recv` 返回 `0` 时 `!recv_buf.empty()` 为真，服务端能明确区分“正常边界断开”和“半帧截断”。

</details>

### 练习 5（`getaddrinfo` 与 `steady_clock` 截止时间）

为什么上面的 `wait_readable_until` 在收到 `EINTR` 时要重新计算 `deadline - now`，而不是每次直接传固定的 `5000 ms` 给 `poll`？如果把固定超时传进循环会有什么漏洞？

<details>
<summary>核对答案</summary>

如果每次被信号打断后都重新传 `5000 ms`，在频繁信号或恶意慢速发送场景下，单个帧的总等待时间会被无限拉长，无法遵守整帧截止时间契约。保存绝对 `deadline` 并按 `deadline - steady_clock::now()` 计算剩余毫秒数，才能保证总等待时间严格有界。

</details>
