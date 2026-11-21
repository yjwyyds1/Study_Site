---
title: "《Beej's Guide to Network Programming》完整中文实战：从 addrinfo、TCP/UDP 到 select/poll 多人聊天室与二进制序列化"
description: "完整融合全球口碑第一的网络编程经典《Beej's Guide to Network Programming》（简体中文版）全书核心代码与心智模型：流套接字与数据报套接字、IPv4/IPv6 双栈 addrinfo 与 inet_ntop、socket/bind/listen/accept/connect 系统调用全解、sendall 短写循环、select/poll 多人广播聊天室完整服务端、IEEE-754 浮点与整数跨平台二进制打包（pack754/packi32）及经典 FAQ 排坑。"
order: 91
category: "计算机网络"
tags: ["Beej's Guide", "Socket", "getaddrinfo", "TCP", "UDP", "select", "poll", "多人聊天室", "序列化"]
related: ["handbook/net-zero-start", "handbook/net-transport-tcp", "handbook/network-tcp", "handbook/mach-zero-start"]
sources: []
---

# 《Beej's Guide to Network Programming》完整中文实战：从 addrinfo、TCP/UDP 到 select/poll 多人聊天室与二进制序列化

> **为什么全世界学 Socket 编程的第一站永远是《Beej's Guide to Network Programming》？**
> 自 1995 年 Brian "Beej" Hall 写下第一版以来，《Beej's Guide》凭借风趣幽默的语言、彻底拥抱现代 IPv4/IPv6 双栈（`getaddrinfo`）的工业级规范，以及手把手带你写出**多人广播聊天室（`selectserver` / `pollserver`）**和**跨平台二进制序列化器（`pack754` / `packi32`）**的硬核代码，成为了全球各大高校（Stanford、MIT、CMU、UCB）网络课的指定实战圣经。
>
> 本篇基于《Beej's Guide to Network Programming》最新简体中文版全书九章内容，将其核心心智模型、每一个系统调用的防坑细节与经典实战源码全部升级为**可直接一键编译自测的现代 C++20 / POSIX 完整程序**（覆盖 **NET-51 ~ NET-58** 八大章节），让你无需翻阅零散网页，一篇文章彻底吃透 Beej 全书精髓。

---

## 一、Beej 网络心智与两类套接字：SOCK_STREAM（TCP）vs SOCK_DGRAM（UDP）及网络字节序 (NET-51)

Beej 在全书开篇问了一个直击灵魂的问题：**“我平时在 Unix/Linux 里读写文件用的是整数文件描述符（File Descriptor，`int fd`），网络上两台机器隔着几千公里，怎么互相说话？”**

答案就是 Unix 最伟大的抽象：**在 Unix 里，一切皆文件（Everything in Unix is a file）！**
网络套接字（Socket）在你的 C/C++ 程序眼里，不过是内核返回给你的**另一个普通的 `int` 类型文件描述符**。一旦连接建立，你通过 `send()` / `recv()`（甚至普通的 `write()` / `read()`）往这个整数 `fd` 里塞字节，内核的 TCP/IP 协议栈与网卡就会跨越半个地球把字节送到对端进程的 `fd` 里。

### 1. Internet 套接字的两大阵营：`SOCK_STREAM` vs `SOCK_DGRAM`

虽然内核支持几十种套接字类型（比如路由套接字、蓝牙套接字、Unix 域本地套接字），但跑在 IP 网络上的 Internet 套接字（`AF_INET` / `AF_INET6`）99% 只分两大门派：

| 对比维度 | 流格式套接字 **`SOCK_STREAM`（基于 TCP）** | 数据报格式套接字 **`SOCK_DGRAM`（基于 UDP）** |
| --- | --- | --- |
| **Beej 经典比喻** | **打电话**：必须先拨号接通（`connect` 三次握手），双方建立一条专属管道；你说 `"1, 2, 3"`，对方一定按顺序听到 `"1, 2, 3"`。 | **往邮筒塞明信片**：不需要预先建立连接（无连接），每张明信片贴上对方的 IP 和端口直接塞进邮筒（`sendto`）；后寄的可能先到，也可能在半路寄丢了。 |
| **底层传输协议** | **TCP**（Transmission Control Protocol，RFC 793） | **UDP**（User Datagram Protocol，RFC 768） |
| **可靠性与顺序** | **100% 可靠且严格保序**：如果半路丢包，内核 TCP 自动超时重传；如果乱序到达，内核自动排好序再交给应用层。 | **不可靠、无序**：发出去就不管了，不重传、不保序；但**一旦收到一个包，它的内容是经过校验和检查、不会残缺一半的**。 |
| **消息边界（粘包问题）** | **无消息边界（连续字节流）**：你连调两次 `send(fd, "Hi", 2, 0)`，对端一次 `recv()` 可能直接读出 `"HiHi"`（粘包），也可能只读出 `"H"`（半包）。 | **天然保留数据包边界**：发送端每次 `sendto()` 发出的一个数据包，接收端一次 `recvfrom()` 就完整取走这一个包，绝不会把两个包粘在一起！ |
| **典型应用场景** | HTTP/HTTPS 网页、SSH 终端、数据库连接、聊天室（`selectserver`） | 多人实时竞技游戏状态同步、音视频会议（RTP/QUIC）、DHCP、DNS 查询、局域网广播 |

### 2. 数据包逐层封装（Data Encapsulation）

当你调用 `sendto()` 发送一段聊天文本 `"Hello Beej"` 时，操作系统内核就像套俄罗斯套娃一样，从上到下每一层在数据前面贴上一层协议头（Header）：

```text
+-----------------+------------+------------+----------------------+------------------+
| 以太网帧头 (14B) | IP 头(20B) | UDP 头(8B) | 应用层载荷 "Hello..." | 以太网 FCS 尾(4B)|
+-----------------+------------+------------+----------------------+------------------+
|<---------------- 网卡在物理网线上发出的完整以太网帧 (Ethernet Frame) ---------------->|
                  |<---------- 路由器看到的 IP 数据包 ------------>|
                               |<---- 传输层看到的 UDP 数据报 ---->|
```

Beej 特别叮嘱初学者：**使用 `SOCK_STREAM` 和 `SOCK_DGRAM` 时，你完全不需要自己动手拼装 TCP/UDP 头、IP 头或以太网帧头！** 你只需要把应用层正文（Payload）交给 `send()` 或 `sendto()`，内核会自动帮你把外面三层信封套好；只有极其底层的原始套接字（`SOCK_RAW`，比如手写 `ping` 或路由协议）才需要自己操心 IP 头。

### 3. 主机字节序（Host Byte Order）vs 网络字节序（Network Byte Order）

假设你想在网络上传输一个 16 位无符号端口号 `0xB34F`（十进制 `45903`）：
- **网络字节序（Network Byte Order）**：TCP/IP 协议族强制规定，所有跨网络传输的协议头多字节整数一律采用**大端序（Big-Endian）**——即高字节 `B3` 存在低内存地址（先发出去），低字节 `4F` 存在高内存地址（后发出去）。
- **主机字节序（Host Byte Order）**：我们日常使用的 x86 / x86_64 以及绝大多数 ARM CPU 采用的都是**小端序（Little-Endian）**——即在内存里反过来存成 `4F B3`！

如果你不加转换直接把 x86 内存里的端口号 `8080`（`0x1F90`）塞进地址结构体，网卡按内存顺序发出去就变成了 `0x901F`（十进制 `36895` 端口），客户端永远连不上！

为此，Beej 规定了一条铁律：**凡是要放进 Socket 地址结构体（如 `sin_port`）或二进制网络包头里的整数，发出前一律调用 `htons()` / `htonl()` 转为网络字节序；从网络读回来后一律调用 `ntohs()` / `ntohl()` 转回主机字节序！**（即使你的机器恰好是大端机，这些函数也会自动编译为空操作，保证代码 100% 跨平台可移植）：

| 转换函数 | 记忆口诀（`h`=Host 主机，`n`=Network 网络，`s`=Short 16位，`l`=Long 32位） | 典型用途 |
| --- | --- | --- |
| **`htons(uint16_t)`** | **H**ost **to** **N**etwork **S**hort | 将 16 位端口号转为网络大端序（如 `htons(3490)`） |
| **`htonl(uint32_t)`** | **H**ost **to** **N**etwork **L**ong | 将 32 位 IPv4 地址或 4 字节消息长度前缀转为网络大端序 |
| **`ntohs(uint16_t)`** | **N**etwork **to** **H**ost **S**hort | 从网络结构体读出对端 16 位端口号转回本机字节序打印 |
| **`ntohl(uint32_t)`** | **N**etwork **to** **H**ost **L**ong | 从网络包头读出 32 位整数转回本机字节序参与运算 |

---

## 二、现代 IPv4/IPv6 双栈地址结构体：addrinfo、sockaddr_storage 与 inet_pton/inet_ntop (NET-52)

在 20 年前的古老教材里，大家直接手填 `struct sockaddr_in`，并调用 `gethostbyname()` 和 `inet_aton()` / `inet_ntoa()`。
**Beej 在新版指南中用最大字号警告：彻底忘掉 `gethostbyname()` 和 `inet_ntoa()`！** 因为它们既不支持 IPv6，内部还使用静态全局变量导致多线程并发时数据互相覆盖崩溃！

现代网络编程只有一套黄金标准：**`getaddrinfo()` + `struct sockaddr_storage` + `inet_pton()` / `inet_ntop()`**。

### 1. 四大核心地址结构体的指针转换关系图解

初学者看 Socket 代码最头晕的就是各种 `sockaddr*` 强制类型转换。其实它们只是为了在 C 语言里实现“多态”而设计的**等长或兼容头部结构体**：

```text
  [ getaddrinfo() 返回的链表节点 ]
  struct addrinfo {
      int              ai_flags;      // AI_PASSIVE (用于 bind 监听)
      int              ai_family;     // AF_INET (IPv4) / AF_INET6 (IPv6) / AF_UNSPEC (双栈通吃!)
      int              ai_socktype;   // SOCK_STREAM (TCP) / SOCK_DGRAM (UDP)
      int              ai_protocol;   // 0 (自动匹配 TCP/UDP)
      size_t           ai_addrlen;    // 下面 ai_addr 指向的结构体字节长度
      struct sockaddr *ai_addr;   ----+  (指向具体的 IPv4 或 IPv6 地址结构体)
      char            *ai_canonname;  |
      struct addrinfo *ai_next;       |  (指向链表下一个候选地址节点)
  };                                  |
                                      v
  +-----------------------------------+-----------------------------------+
  | 通用基类视图 (16B)                | 当 ai_family == AF_INET (IPv4, 16B)
  | struct sockaddr {                 | struct sockaddr_in {
  |     sa_family_t sa_family;        |     sa_family_t    sin_family;   // AF_INET
  |     char        sa_data[14];      |     in_port_t      sin_port;     // 16位端口 (必须 htons!)
  | };                                |     struct in_addr sin_addr;     // 32位 IPv4 地址
  |                                   |     unsigned char  sin_zero[8];  // 填充对齐到 16B
  |                                   | };
  +-----------------------------------+-----------------------------------+
  | 当 ai_family == AF_INET6 (IPv6, 28B)
  | struct sockaddr_in6 {
  |     sa_family_t     sin6_family;   // AF_INET6
  |     in_port_t       sin6_port;     // 16位端口 (必须 htons!)
  |     uint32_t        sin6_flowinfo; // IPv6 流标签
  |     struct in6_addr sin6_addr;     // 128位 (16字节) IPv6 地址
  |     uint32_t        sin6_scope_id; // 作用域 ID
  | };
  +-----------------------------------------------------------------------+
  | 万能接收容器 (128B)：当你调用 accept() 或 recvfrom() 前还不知道连上来的是 IPv4 还是 IPv6 时使用！
  | struct sockaddr_storage {
  |     sa_family_t  ss_family;        // 先读这个字段！是 AF_INET 就强转为 sockaddr_in*，是 AF_INET6 就强转为 sockaddr_in6*
  |     char         __ss_padding[...];// 保证比 sockaddr_in 和 sockaddr_in6 都要大！
  | };
  +-----------------------------------------------------------------------+
```

### 2. IP 地址字符串与二进制互转：`inet_pton` 与 `inet_ntop`

- **`inet_pton(af, src_str, dst_bin)`**（**P**resentation **to** **N**etwork，可读文本转二进制网络字节序）：
  例如 `inet_pton(AF_INET, "10.12.110.57", &(sa.sin_addr))` 或 `inet_pton(AF_INET6, "2001:db8::1", &(sa6.sin6_addr))`。注意：它返回 `1` 表示成功，返回 `0` 表示输入的 IP 字符串格式非法，返回 `-1` 表示协议族错误。
- **`inet_ntop(af, src_bin, dst_str, size)`**（**N**etwork **to** **P**resentation，二进制转可读字符串）：
  用于把 `accept()` 或 `getaddrinfo()` 拿到的二进制 IP 打印出来。接收缓冲区的长度直接用标准宏 **`INET6_ADDRSTRLEN`**（46 字节，足够装下最长的 IPv6 字符串，当然也装得下 16 字节的 `INET_ADDRSTRLEN` IPv4 字符串）。

### 3. Beej 经典程序一：`showip.cpp`（遍历打印域名的 IPv4/IPv6 双栈地址链表）

下面我们将 Beej 第 5.1 节著名的 `showip.c` 完整呈现为可直接运行的现代 C++20 程序（同时演示如何用 `getaddrinfo` 解析本机与 `localhost` 双栈地址并调用 `inet_ntop` 打印）：

```cpp
// 文件名: showip.cpp —— Beej 经典 getaddrinfo + inet_ntop 双栈地址解析器
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <cstring>
#include <iostream>
#include <vector>

void show_host_ips(const char* hostname, const char* service = nullptr) {
    struct addrinfo hints{};
    struct addrinfo* res = nullptr;

    hints.ai_family = AF_UNSPEC;     // AF_UNSPEC: 不限 IPv4 或 IPv6，双栈通吃！
    hints.ai_socktype = SOCK_STREAM; // 只看 TCP 流套接字对应的地址项

    int status = ::getaddrinfo(hostname, service, &hints, &res);
    if (status != 0) {
        std::cerr << "getaddrinfo(" << (hostname ? hostname : "NULL")
                  << ") error: " << ::gai_strerror(status) << "\n";
        return;
    }

    std::cout << "=== IP addresses for [" << (hostname ? hostname : "0.0.0.0/:: (AI_PASSIVE)") << "] ===\n";

    for (struct addrinfo* p = res; p != nullptr; p = p->ai_next) {
        void* addr = nullptr;
        const char* ipver = nullptr;
        uint16_t port = 0;

        // 根据 ai_family 区分 IPv4 (AF_INET) 与 IPv6 (AF_INET6)，取出对应的二进制地址字段指针
        if (p->ai_family == AF_INET) {
            auto* ipv4 = reinterpret_cast<struct sockaddr_in*>(p->ai_addr);
            addr = &(ipv4->sin_addr);
            port = ntohs(ipv4->sin_port);
            ipver = "IPv4";
        } else if (p->ai_family == AF_INET6) {
            auto* ipv6 = reinterpret_cast<struct sockaddr_in6*>(p->ai_addr);
            addr = &(ipv6->sin6_addr);
            port = ntohs(ipv6->sin6_port);
            ipver = "IPv6";
        } else {
            continue;
        }

        // 使用 inet_ntop 将二进制网络地址转换为人类可读的文本字符串
        char ipstr[INET6_ADDRSTRLEN]{};
        ::inet_ntop(p->ai_family, addr, ipstr, sizeof(ipstr));
        std::cout << "  " << ipver << ": " << ipstr << " (port: " << port << ")\n";
    }

    // 铁律：用完 getaddrinfo 分配的链表后，必须调用 freeaddrinfo 释放内存！
    ::freeaddrinfo(res);
}

int main() {
    show_host_ips("localhost", "8080");
    show_host_ips("127.0.0.1", "3490");
    show_host_ips("::1", "3490");
    return 0;
}
```

在终端一键编译并运行验证：

```bash
g++ -std=c++20 -O2 -Wall -Wextra showip.cpp -o /tmp/showip && /tmp/showip
```

---

## 三、Beej 系统调用全套拆解：从 getaddrinfo → socket → bind → listen → accept 到 connect (NET-53)

Beej 第 5 章按时间线拆解了一个网络程序从出生到销毁经历的每一个系统调用。只要看懂下面这张生命周期流程图与五大核心防坑点，所有客户端与服务端模板都能信手拈来：

```text
   【TCP 服务端 (Server)】                         【TCP 客户端 (Client)】
1. getaddrinfo(NULL, "3490", AI_PASSIVE)        1. getaddrinfo("server_ip", "3490")
               │                                               │
2. socket(p->ai_family, p->ai_socktype, ...)    2. socket(p->ai_family, p->ai_socktype, ...)
               │                                               │
3. setsockopt(SO_REUSEADDR)  <-- 防重启端口占用!               │
               │                                               │
4. bind(listener_fd, p->ai_addr, p->ai_addrlen)                │
               │                                               │
5. listen(listener_fd, BACKLOG)                                │
               │                                               │
6. accept(listener_fd, &their_addr, &sin_size) <═══ 3. connect(sockfd, p->ai_addr, p->ai_addrlen)
      │ (返回全新的已连接套接字 new_fd!)            (触发 TCP 三次握手!)
      ▼                                                        ▼
7. send(new_fd) / recv(new_fd)              <═══> 4. recv(sockfd) / send(sockfd)
      │                                                        │
8. close(new_fd)                            <═══> 5. close(sockfd)
```

### 1. `getaddrinfo()`：为什么服务端传 `AI_PASSIVE` 和 `NULL`？

- 当你写**客户端**要连接远端服务器时，你调用 `getaddrinfo("203.0.113.50", "3490", &hints, &res)`，不需要设置 `AI_PASSIVE`。
- 当你写**服务端**要在本地监听端口时，把 `hints.ai_flags = AI_PASSIVE;` 设上，并把第一个主机名参数传 **`NULL`（`nullptr`）**！这样 `getaddrinfo` 会自动帮你填入**通配地址**（IPv4 的 `0.0.0.0` / `INADDR_ANY`，或 IPv6 的 `::` / `in6addr_any`），让你的服务自动监听本机所有网卡的 `3490` 端口。
- 如果 `getaddrinfo()` 返回非 0 错误码，千万别用 `perror()`（它不设置 `errno`），必须用专门的 **`gai_strerror(status)`** 打印可读错误原因。

### 2. `socket()` 与 `bind()`：为什么 `bind()` 前必须加 `SO_REUSEADDR`？

- **`int sockfd = socket(p->ai_family, p->ai_socktype, p->ai_protocol);`**
  直接把 `getaddrinfo` 链表节点 `p` 里的三个字段传给 `socket()`，完全不用硬编码 `AF_INET` 或 `PF_INET`！失敗时返回 `-1` 并设置 `errno`。
- **`bind(sockfd, p->ai_addr, p->ai_addrlen);`**
  把套接字绑定到本机的指定 IP 和端口号上。注意：**低于 1024 的端口号（`1 ~ 1023`）属于系统保留特权端口**（如 HTTP `80`、SSH `22`），普通用户进程绑定会报 `EACCES (Permission denied)`，开发测试应选择 `1024 ~ 65535` 之间的端口（Beej 最爱的端口是 `"3490"` 或 `"9034"`）。
- **⚠️ Beej 必背防坑：为什么 `bind()` 前一定要加 `setsockopt(..., SO_REUSEADDR, ...)`？**
  当你重启一个刚崩溃或刚主动关闭的服务端进程时，经常会遇到一句令人抓狂的报错：
  ```text
  bind: Address already in use
  ```
  这是因为刚才断开的旧 TCP 连接还在内核里处于 **`TIME_WAIT` 状态**（默认要停留 1~2 分钟等待网络中迷途的旧数据包消亡）。如果不加处理，这 1~2 分钟内你的服务端根本重启不起来！
  只要在 `socket()` 之后、`bind()` 之前加上下面 4 行标准代码，内核就会允许你立即重新绑定处于 `TIME_WAIT` 状态的端口：
  ```cpp
  int yes = 1;
  if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int)) == -1) {
      perror("setsockopt");
      exit(1);
  }
  ```

### 3. `listen()` 与 `accept()`：分清“迎宾员 `listener_fd`”与“专属服务员 `new_fd`”！

很多新手第一次看 `accept()` 都会惊讶：**“我明明已经调过一次 `socket()` 拿到了一个 `listener_fd`，为什么 `accept()` 的返回值又给了我一个全新的 `new_fd`？”**

Beej 给出了最生动的解释：
- **`listener_fd`（监听套接字）**就像站在餐厅门口的**唯一一位迎宾员**：调完 `listen(listener_fd, BACKLOG)`（`BACKLOG` 通常设为 `10` 或 `128`，表示允许在门外排队等待 `accept` 的已完成三次握手的最大连接数）后，迎宾员一辈子只干一件事——在门口接客。
- 每当有一个客户端 `connect()` 过来，`accept(listener_fd, (struct sockaddr*)&their_addr, &addr_size)` 就会为你**克隆指派一位全新的专属服务员 `new_fd`（已连接套接字）**专门伺候这一桌客人！
- 之后你和这个客户端之间的所有 `send(new_fd, ...)` 和 `recv(new_fd, ...)` **全部通过 `new_fd` 进行**；而门口的 `listener_fd` 继续回去调用下一次 `accept()` 迎接下一位客人！如果服务端总共只需要接待一个客人就关门下班，甚至可以在 `accept()` 拿到 `new_fd` 后立刻 `close(listener_fd)`。

### 4. `connect()`、`close()` vs `shutdown()`、以及 `getpeername()` / `gethostname()`

- **客户端为什么调用 `connect()` 前不需要调用 `bind()`？**
  因为客户端根本不在乎自己用本机的哪个临时端口号发请求！当你直接调用 `connect(sockfd, p->ai_addr, p->ai_addrlen)` 时，内核如果发现这个 `sockfd` 还没绑端口，会**自动从本地临时端口池（Ephemeral Ports，如 `32768 ~ 60999`）里挑一个空闲端口帮它绑定**。
- **`close(fd)` vs `shutdown(fd, how)`**：
  - `close(fd)` 会将套接字的引用计数减 1，当计数归零时彻底释放描述符并双向关闭读写。
  - `shutdown(fd, how)` 则支持**精细的半关闭（Half-Close）**：
    - `how = SHUT_RD`（或 `0`）：关闭读端，不再接收数据；
    - `how = SHUT_WR`（或 `1`）：**关闭写端（向对端发送 TCP `FIN` 包告诉对方“我说完了”），但依然保留读端继续接收对端发来的剩余响应**！
    - `how = SHUT_RDWR`（或 `2`）：同时关闭读写（注意：`shutdown()` 不会释放 `fd` 编号，最后依然必须调用 `close(fd)` 回收描述符！）。
- **`getpeername(sockfd, &addr, &len)` 与 `gethostname(buf, size)`**：
  - 如果你在某个函数里只拿到了一个已连接的 `new_fd`，想知道对端客户端的 IP 和端口是多少，调用 **`getpeername()`** 就能随时查出来（Beej 的一个实用冷知识：提取对端地址的结构体辅助函数 **`get_in_addr(struct sockaddr *sa)`** 可以让你用两行代码通吃 IPv4 和 IPv6！）。
  - **`gethostname()`** 则返回当前这台机器自己的主机名。

---

## 四、TCP 端到端客户-服务器与 UDP 无连接 talker/listener 完整可运行实现 (NET-54)

在 Beej 第 6 章中，总共给出了四个经典骨架程序：
1. **TCP 流服务器（`server.c`）** 与 **TCP 流客户端（`client.c`）**：使用 `SOCK_STREAM`，走完 `socket → setsockopt → bind → listen → accept → send/recv`。
2. **UDP 数据报监听者（`listener.c`）** 与 **UDP 数据报说话者（`talker.c`）**：使用 `SOCK_DGRAM`。
   - 注意看 UDP 的最大特点：**UDP `listener` 只需要 `socket() → bind()`，根本没有 `listen()` 和 `accept()`！** 它直接调 **`recvfrom(sockfd, buf, len, 0, (struct sockaddr*)&their_addr, &addr_len)`** 阻塞等待，任何一个发来的数据包都会直接把发送方的地址填进 `their_addr`。
   - **UDP `talker` 甚至连 `bind()` 和 `connect()` 都不需要！** 拿到 `getaddrinfo` 的目标地址后，直接调 **`sendto(sockfd, msg, len, 0, p->ai_addr, p->ai_addrlen)`** 把明信片丢进邮筒就完事了！

> **💡 Beej 的隐藏彩蛋：UDP 套接字其实也可以调用 `connect()`！**
> 如果你在 `SOCK_DGRAM`（UDP）套接字上调用了 `connect(udp_fd, server_addr, addrlen)`，内核并不会在网络上发任何握手包（它依然是无连接的 UDP），但内核会在内部记住这个默认的目标地址！一旦对 UDP 调了 `connect()`，后续你就不必每次都填冗长的 `sendto()` / `recvfrom()` 了，直接调简洁的 `send()` 和 `recv()` 就能只和这一个目标收发 UDP 数据报！

下面我们用一个**单文件自包含 C++20 闭环验证程序 `beej_tcp_udp_demo.cpp`**，在一个进程内利用线程同时跑通 **Beej 标准双栈 TCP 服务端 + 客户端** 以及 **Beej 标准 UDP `listener` + `talker`**，你可以直接复制到 WSL2 / Linux 一键编译运行：

```cpp
// 文件名: beej_tcp_udp_demo.cpp —— Beej 第 6 章 TCP Server/Client 与 UDP Listener/Talker 完整可运行闭环
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>

// Beej 招牌辅助函数：无论传入的是 IPv4 还是 IPv6 sockaddr，统一返回指向内部 sin_addr / sin6_addr 的 void*
void* get_in_addr(struct sockaddr* sa) {
    if (sa->sa_family == AF_INET) {
        return &((reinterpret_cast<struct sockaddr_in*>(sa))->sin_addr);
    }
    return &((reinterpret_cast<struct sockaddr_in6*>(sa))->sin6_addr);
}

// ============================================================================
// 1. Beej TCP Stream Server & Client (SOCK_STREAM)
// ============================================================================
void run_beej_tcp_demo() {
    const char* PORT = "13490";

    // 先在主线程完成服务端 socket -> setsockopt -> bind -> listen，确保端口就绪后再启动客户端线程
    struct addrinfo hints{}, *servinfo = nullptr, *p = nullptr;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_PASSIVE; // 使用本机通配 IP

    int rv = ::getaddrinfo("127.0.0.1", PORT, &hints, &servinfo);
    if (rv != 0) {
        std::cerr << "TCP server getaddrinfo: " << ::gai_strerror(rv) << "\n";
        return;
    }

    int listener_fd = -1;
    int yes = 1;
    for (p = servinfo; p != nullptr; p = p->ai_next) {
        listener_fd = ::socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (listener_fd == -1) continue;

        ::setsockopt(listener_fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));

        if (::bind(listener_fd, p->ai_addr, p->ai_addrlen) == -1) {
            ::close(listener_fd);
            continue;
        }
        break; // 成功绑定第一个可用地址！
    }
    ::freeaddrinfo(servinfo);

    if (p == nullptr || ::listen(listener_fd, 10) == -1) {
        std::cerr << "TCP server: failed to bind/listen\n";
        return;
    }
    std::cout << "[TCP Server] Listening on 127.0.0.1:" << PORT << "...\n";

    // 启动 Beej TCP Client 线程发起连接
    std::thread client_thread([PORT]() {
        struct addrinfo c_hints{}, *c_info = nullptr, *cp = nullptr;
        c_hints.ai_family = AF_UNSPEC;
        c_hints.ai_socktype = SOCK_STREAM;

        if (::getaddrinfo("127.0.0.1", PORT, &c_hints, &c_info) != 0) return;

        int sockfd = -1;
        for (cp = c_info; cp != nullptr; cp = cp->ai_next) {
            sockfd = ::socket(cp->ai_family, cp->ai_socktype, cp->ai_protocol);
            if (sockfd == -1) continue;
            if (::connect(sockfd, cp->ai_addr, cp->ai_addrlen) == -1) {
                ::close(sockfd);
                continue;
            }
            break;
        }
        ::freeaddrinfo(c_info);
        if (cp == nullptr) return;

        char buf[128]{};
        ssize_t numbytes = ::recv(sockfd, buf, sizeof(buf) - 1, 0);
        if (numbytes > 0) {
            buf[numbytes] = '\0';
            std::cout << "[TCP Client] Received (" << numbytes << " bytes): '" << buf << "'\n";
        }
        ::close(sockfd);
    });

    // 服务端 accept() 接收连接并发送 "Hello, world!"
    struct sockaddr_storage their_addr{};
    socklen_t sin_size = sizeof(their_addr);
    int new_fd = ::accept(listener_fd, reinterpret_cast<struct sockaddr*>(&their_addr), &sin_size);
    if (new_fd != -1) {
        char s[INET6_ADDRSTRLEN]{};
        ::inet_ntop(their_addr.ss_family,
                    get_in_addr(reinterpret_cast<struct sockaddr*>(&their_addr)),
                    s, sizeof(s));
        std::cout << "[TCP Server] Got connection from " << s << "\n";

        const char* msg = "Hello, world! (from Beej TCP Server)";
        ::send(new_fd, msg, std::strlen(msg), 0);
        ::close(new_fd);
    }

    client_thread.join();
    ::close(listener_fd);
}

// ============================================================================
// 2. Beej UDP Datagram Listener & Talker (SOCK_DGRAM)
// ============================================================================
void run_beej_udp_demo() {
    const char* UDP_PORT = "14950";

    struct addrinfo hints{}, *servinfo = nullptr, *p = nullptr;
    hints.ai_family = AF_INET;      // IPv4 UDP 演示
    hints.ai_socktype = SOCK_DGRAM; // 数据报套接字！

    if (::getaddrinfo("127.0.0.1", UDP_PORT, &hints, &servinfo) != 0) return;

    int listener_fd = -1;
    for (p = servinfo; p != nullptr; p = p->ai_next) {
        listener_fd = ::socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (listener_fd == -1) continue;
        if (::bind(listener_fd, p->ai_addr, p->ai_addrlen) == -1) {
            ::close(listener_fd);
            continue;
        }
        break;
    }
    ::freeaddrinfo(servinfo);
    if (p == nullptr) return;

    std::cout << "\n[UDP Listener] Waiting to recvfrom on 127.0.0.1:" << UDP_PORT << " (no listen/accept needed!)...\n";

    // 启动 UDP Talker 线程直接调用 sendto 发送无连接数据报
    std::thread talker_thread([UDP_PORT]() {
        struct addrinfo t_hints{}, *t_info = nullptr, *tp = nullptr;
        t_hints.ai_family = AF_INET;
        t_hints.ai_socktype = SOCK_DGRAM;

        if (::getaddrinfo("127.0.0.1", UDP_PORT, &t_hints, &t_info) != 0) return;

        int talk_fd = -1;
        for (tp = t_info; tp != nullptr; tp = tp->ai_next) {
            talk_fd = ::socket(tp->ai_family, tp->ai_socktype, tp->ai_protocol);
            if (talk_fd != -1) break;
        }
        if (tp != nullptr) {
            const char* dgram = "Beej UDP Datagram Packet #1";
            ssize_t sent = ::sendto(talk_fd, dgram, std::strlen(dgram), 0, tp->ai_addr, tp->ai_addrlen);
            std::cout << "[UDP Talker] Sent " << sent << " bytes via sendto()\n";
            ::close(talk_fd);
        }
        ::freeaddrinfo(t_info);
    });

    struct sockaddr_storage their_addr{};
    socklen_t addr_len = sizeof(their_addr);
    char buf[128]{};
    ssize_t numbytes = ::recvfrom(listener_fd, buf, sizeof(buf) - 1, 0,
                                  reinterpret_cast<struct sockaddr*>(&their_addr), &addr_len);
    if (numbytes > 0) {
        buf[numbytes] = '\0';
        char s[INET6_ADDRSTRLEN]{};
        ::inet_ntop(their_addr.ss_family,
                    get_in_addr(reinterpret_cast<struct sockaddr*>(&their_addr)),
                    s, sizeof(s));
        std::cout << "[UDP Listener] Got packet from " << s << " (" << numbytes
                  << " bytes): '" << buf << "'\n";
    }

    talker_thread.join();
    ::close(listener_fd);
}

int main() {
    run_beej_tcp_demo();
    run_beej_udp_demo();
    return 0;
}
```

一键编译运行，同时验收 TCP 与 UDP 双模通信：

```bash
g++ -std=c++20 -O2 -Wall -Wextra -pthread beej_tcp_udp_demo.cpp -o /tmp/beej_tcp_udp_demo && /tmp/beej_tcp_udp_demo
```

---

## 五、处理部分发送 sendall() 与应用层数据封装（Packet Encapsulation） (NET-55)

到了第 7 章，Beej 抛出了一个让所有初学者倒吸一口凉气的真相：

### 1. 为什么你让 `send(fd, buf, 1000, 0)` 发 1000 字节，内核有时只返回 `412`？

很多同学写代码从来不检查 `send()` 的返回值，默认“只要我传了 `1000` 字节，内核就一定会帮我把 `1000` 字节全发出去”。
**大错特错！**
- 每个 TCP 套接字在操作系统内核里都有一块有限大小的**发送缓冲区（Send Buffer，SO_SNDBUF）**。
- 如果当前网络拥塞或者对端接收得慢，内核发送缓冲区里刚好只剩下 `412` 字节的空闲空间，那么 `send(fd, buf, 1000, 0)` 会把前 `412` 字节拷进内核缓冲区，然后**立刻返回 `412`**！
- 剩下的 `1000 - 412 = 588` 字节**还在你的用户态内存 `buf + 412` 里躺着，内核连碰都没碰它**！如果你不检查返回值继续往下跑，这 588 字节就彻底人间蒸发了，导致对端收到残缺错乱的数据流！

### 2. Beej 标准 `sendall()` 实现与协议分帧封装

为了让你的程序百分之百把整块缓冲区发干净，Beej 写出了全书使用频率最高的辅助函数 **`sendall()`**——在一个 `while` 循环里不断调用 `send()` 并推进已发送偏移量 `total`，直到 `bytesleft == 0` 或者发生真正的底层错误（`-1`）为止，并且通过指针参数 `*len` 准确告知调用方实际发出了多少字节：

```cpp
// 文件名: beej_sendall_demo.cpp —— Beej 第 7.4 节标准 sendall() 实现与短写自测
#include <sys/socket.h>
#include <unistd.h>
#include <cassert>
#include <cstring>
#include <iostream>
#include <string>

// Beej 标准 sendall():
// 参数 s: socket 描述符
// 参数 buf: 待发送的字节缓冲区指针
// 参数 len: [输入/输出] 传入想要发送的总字节数；返回时被改写为实际成功发出的总字节数
// 返回值: 全部发送成功返回 0，中途出错返回 -1
int sendall(int s, const char* buf, int* len) {
    int total = 0;        // 已经成功发送了多少字节
    int bytesleft = *len; // 还剩多少字节等待发送
    int n = 0;

    while (total < *len) {
        n = ::send(s, buf + total, bytesleft, 0);
        if (n == -1) {
            break; // 发生底层错误，跳出循环
        }
        total += n;
        bytesleft -= n;
    }

    *len = total; // 将实际已发出的字节数写回 *len 供调用者排查
    return (n == -1) ? -1 : 0;
}

int main() {
    // 使用本地 socketpair 验证 sendall() 发送 64KB 载荷并完整读回
    int sv[2];
    if (::socketpair(AF_UNIX, SOCK_STREAM, 0, sv) == -1) return 1;

    std::string payload(65536, 'B');
    payload.front() = '<';
    payload.back() = '>';

    int len = static_cast<int>(payload.size());
    int rc = sendall(sv[0], payload.data(), &len);
    assert(rc == 0 && len == 65536);

    // 接收端同样必须循环 recv 直到收齐 65536 字节（解决 TCP 流粘包/半包）
    std::string received(65536, '\0');
    int rx_total = 0;
    while (rx_total < 65536) {
        ssize_t n = ::recv(sv[1], received.data() + rx_total, 65536 - rx_total, 0);
        if (n <= 0) break;
        rx_total += static_cast<int>(n);
    }

    assert(rx_total == 65536 && received == payload);
    std::cout << "[sendall test] Successfully transmitted and verified all "
              << rx_total << " bytes!\n";

    ::close(sv[0]);
    ::close(sv[1]);
    return 0;
}
```

一键编译运行验证 `sendall()`：

```bash
g++ -std=c++20 -O2 -Wall -Wextra beej_sendall_demo.cpp -o /tmp/beej_sendall_demo && /tmp/beej_sendall_demo
```

> **数据封装（Data Encapsulation）小结**：
> 发送端用 `sendall()` 保证了数据全发出去，那接收端怎么知道一条聊天消息到哪里算结束呢？
> Beej 在 7.5 节指出：对于 `SOCK_STREAM`（TCP），你必须在应用层自己规定**封包格式（Packet Format）**——例如**每个包开头第一个字节（或前 2 字节 `htons(len)`）写明本包的总长度**，然后紧跟用户名和聊天正文。接收端每次先将收到的数据追加进自己的 `buffer`，检查 `buffer` 是否已经凑够了包头声明的长度：一旦凑够就切出一整包处理，没凑够就等下一次 `recv()` 继续拼装！

---

## 六、Beej 招牌实战（上）：用 select() 构建同步 I/O 多路复用多人广播聊天室服务端 (NET-56)

如果我们的聊天室服务器同时有 50 个客户端连上来：
- 假如你直接对第 1 个客户端调 `recv(fd1, ...)`，但 1 号客人此时在发呆没打字，你的单线程服务器就会**死死阻塞在 `fd1` 上**，此时 2 号、3 号客人发来再多消息也没人搭理！
- 难道必须给每个客人都 `fork()` 一个子进程或开一个线程吗？不用！Beej 第 7.2 节展示了经典利器——**`select()` 同步 I/O 多路复用**：把所有客人的 `fd` 加上门口迎宾员 `listener_fd` 装进同一个集合里交给内核，让内核帮你同时盯着所有人：“**谁那儿有动静（有新连接连上来，或者有客户端发来了数据），就唤醒我处理谁！**”

### 1. `fd_set` 位图与四大操作宏

`select()` 使用 `fd_set` 结构体（底层是一个定长位图，通常最大支持 `FD_SETSIZE = 1024`）来表示一组文件描述符，完全通过四个标准宏来操控：

| 宏定义 | 核心作用 |
| --- | --- |
| **`FD_ZERO(fd_set *set)`** | 将集合清零（初始化时必调，否则里面全是栈上的垃圾位） |
| **`FD_SET(int fd, fd_set *set)`** | 将描述符 `fd` 添加进集合 `set` 中 |
| **`FD_CLR(int fd, fd_set *set)`** | 将描述符 `fd` 从集合 `set` 中移除（客户端断开连接并 `close(fd)` 时必调！） |
| **`FD_ISSET(int fd, fd_set *set)`** | 在 `select()` 返回后，测试 `fd` 是否依然留在就绪集合 `set` 中（即该 `fd` 是否可读/可写） |

### 2. ⚠️ `select()` 的头号致命陷阱：为什么必须维护 `master` 和 `read_fds` 两套集合？

看看 `select()` 的函数原型：
```cpp
int select(int numfds, fd_set *readfds, fd_set *writefds, fd_set *exceptfds, struct timeval *timeout);
```
- **第一个小坑**：第一个参数 **`numfds` 必须填当前所有被监控描述符中的最大值加 1（即 `fdmax + 1`）**，千万不能只填 `fdmax`！因为内核是从 `0` 循环检查到 `numfds - 1` 的。
- **第二个致命大坑**：当你把 `readfds` 传给 `select()` 时，**内核会直接原地篡改你传进去的那个 `fd_set` 变量**——把所有没动静的 `fd` 全部从集合里抹掉，只留下本轮真正有数据可读的 `fd`！
  如果你只用一个 `fd_set` 变量直接传给 `select()`，第一轮调完后，当时没说话的客户端就全部从监控名单里永久丢失了！
  **Beej 的标准解法**：永远定义两个集合——**`master`（主名册，持久保存当前所有在线的 `fd`）** 和 **`read_fds`（每轮传给 `select` 的临时复印件）**。在每次 `for(;;)` 主循环调用 `select()` 的**前一行**，必须写上一句：
  ```cpp
  read_fds = master; // 每次调用 select 前，先从主名册复印一份临时集合！
  ```
- **第三个小坑**：在 Linux 上，`select()` 还会原地修改传入的 `struct timeval timeout`（减去已经睡掉的时间），所以如果需要周期性超时，每次循环前也必须重新给 `tv.tv_sec` 和 `tv.tv_usec` 赋值。

### 3. Beej `selectserver.cpp` 多人广播聊天室完整代码与自动联机验证

下面给出 Beej 第 7.2 节完整的 `select()` 多人聊天室服务端逻辑：
- 当 `FD_ISSET(i, &read_fds)` 命中时，分两条分支：
  1. **如果 `i == listener`（迎宾员响了）**：说明有新客户端拨号进来！调用 `accept()` 拿到 `newfd`，将 `newfd` 用 `FD_SET(newfd, &master)` 加入主名册，并更新最大编号 `if (newfd > fdmax) fdmax = newfd;`。
  2. **如果 `i != listener`（某个老客人说话了）**：调用 `recv(i, buf, ...)`：
     - 如果 `nbytes <= 0`（等于 `0` 代表客户端优雅关闭了连接；小于 `0` 代表出错），立即 `close(i)` 并调用 **`FD_CLR(i, &master)`** 把它从主名册除名！
     - 如果 `nbytes > 0`（收到了聊天消息），遍历 `0 ~ fdmax`：**只要 `FD_ISSET(j, &master)` 在主名册里，且 `j != listener`（别发给迎宾员）且 `j != i`（别发回给说话者自己），就调用 `sendall()` 把这条消息广播给所有其他在线客人们！**

为了让你在本地终端一行命令就能亲眼看到多人聊天室广播效果，我们在 `main()` 中启动该 `select` 聊天室服务端，并用两个客户端连接上去互发消息验证：

```cpp
// 文件名: beej_selectserver.cpp —— Beej 第 7.2 节经典 select() 多人广播聊天室服务端 + 双客户端联机自测
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>

// 创建并绑定本地监听套接字
int create_listener(const char* port) {
    struct addrinfo hints{}, *ai = nullptr, *p = nullptr;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_PASSIVE;

    if (::getaddrinfo("127.0.0.1", port, &hints, &ai) != 0) return -1;

    int listener = -1;
    int yes = 1;
    for (p = ai; p != nullptr; p = p->ai_next) {
        listener = ::socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (listener < 0) continue;
        ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
        if (::bind(listener, p->ai_addr, p->ai_addrlen) < 0) {
            ::close(listener);
            continue;
        }
        break;
    }
    ::freeaddrinfo(ai);
    if (p == nullptr || ::listen(listener, 10) == -1) return -1;
    return listener;
}

int connect_to_chat(const char* port) {
    struct addrinfo hints{}, *ai = nullptr;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    if (::getaddrinfo("127.0.0.1", port, &hints, &ai) != 0) return -1;
    int fd = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
    if (fd >= 0 && ::connect(fd, ai->ai_addr, ai->ai_addrlen) == -1) {
        ::close(fd);
        fd = -1;
    }
    ::freeaddrinfo(ai);
    return fd;
}

int main() {
    const char* PORT = "19034"; // Beej selectserver 经典端口 9034 的本地测试版
    int listener = create_listener(PORT);
    if (listener == -1) return 1;

    fd_set master;   // 主名册：保存所有当前活跃的 fd (listener + 所有在线客户端)
    fd_set read_fds; // 临时集合：每轮拷贝给 select() 原地修改用
    FD_ZERO(&master);
    FD_ZERO(&read_fds);

    // 将迎宾员 listener 放入主名册，并记录当前最大 fd
    FD_SET(listener, &master);
    int fdmax = listener;

    std::cout << "[selectserver] Multi-person chat server running on 127.0.0.1:" << PORT << "\n";

    // 启动模拟客户端线程：Alice 和 Bob 先后进房间，Alice 发言，Bob 收到广播后断开
    std::thread clients_sim([PORT]() {
        int alice = connect_to_chat(PORT);
        int bob = connect_to_chat(PORT);
        ::usleep(30000); // 等待服务端 accept 完毕

        const char* msg = "Hello everyone in Beej's select() chat room!\n";
        ::send(alice, msg, std::strlen(msg), 0);

        char rx[256]{};
        ssize_t n = ::recv(bob, rx, sizeof(rx) - 1, 0);
        if (n > 0) {
            rx[n] = '\0';
            std::cout << "[Client Bob (fd=" << bob << ")] Received broadcast: " << rx;
        }

        // Alice 和 Bob 离开聊天室
        ::close(alice);
        ::close(bob);
    });

    // 运行 4 轮事件循环处理：1. Alice 进房 2. Bob 进房 3. Alice 发广播 4. 客户端断开连接
    int disconnected_clients = 0;
    while (disconnected_clients < 2) {
        read_fds = master; // ⚠️ 核心铁律：每次调 select() 前必须从 master 拷贝一份！

        struct timeval tv{2, 0};
        if (::select(fdmax + 1, &read_fds, nullptr, nullptr, &tv) == -1) {
            perror("select");
            break;
        }

        // 遍历现有连接寻找有数据可读的 fd
        for (int i = 0; i <= fdmax; ++i) {
            if (!FD_ISSET(i, &read_fds)) continue;

            if (i == listener) {
                // 分支 A: 迎宾员 listener 就绪 -> 处理新客户端连接
                struct sockaddr_storage remoteaddr{};
                socklen_t addrlen = sizeof(remoteaddr);
                int newfd = ::accept(listener, reinterpret_cast<struct sockaddr*>(&remoteaddr), &addrlen);
                if (newfd != -1) {
                    FD_SET(newfd, &master); // 加入主名册
                    if (newfd > fdmax) fdmax = newfd;
                    std::cout << "[selectserver] New connection accepted on socket fd=" << newfd << "\n";
                }
            } else {
                // 分支 B: 已连接的客户端 i 发来数据或断开连接
                char buf[256]{};
                ssize_t nbytes = ::recv(i, buf, sizeof(buf), 0);
                if (nbytes <= 0) {
                    if (nbytes == 0) {
                        std::cout << "[selectserver] Socket fd=" << i << " hung up\n";
                    } else {
                        perror("recv");
                    }
                    ::close(i);
                    FD_CLR(i, &master); // ⚠️ 从主名册中除名！
                    disconnected_clients++;
                } else {
                    // 收到有效聊天数据 -> 广播给主名册里除 listener 和发送者 i 之外的所有人！
                    for (int j = 0; j <= fdmax; ++j) {
                        if (FD_ISSET(j, &master) && j != listener && j != i) {
                            ::send(j, buf, nbytes, 0);
                        }
                    }
                }
            }
        }
    }

    clients_sim.join();
    ::close(listener);
    return 0;
}
```

一键编译运行 `beej_selectserver.cpp`：

```bash
g++ -std=c++20 -O2 -Wall -Wextra -pthread beej_selectserver.cpp -o /tmp/beej_selectserver && /tmp/beej_selectserver
```

---

## 七、Beej 招牌实战（下）：用 poll() 动态数组重构高可读性多人聊天室服务端 (NET-57)

用完 `select()` 后，Beej 在第 7.3 节紧接着介绍了它的现代升级版——**`poll()`**。

### 1. 为什么 `poll()` 比 `select()` 更好用？

1. **彻底打破 `FD_SETSIZE = 1024` 硬上限**：`select()` 的 `fd_set` 位图大小在 glibc 编译时就焊死为 1024 位，只要你的进程打开的文件描述符编号 $\ge 1024$，调 `FD_SET` 就会直接越界踩内存崩溃！而 `poll()` 接收的是由你自己分配的 `struct pollfd` 动态数组（在 C++ 里直接用 **`std::vector<struct pollfd>`**），想装 5000 个还是 50000 个连接完全随你动态扩容！
2. **输入事件 `events` 与输出就绪 `revents` 分离，无需每轮拷贝整个集合！**
   看看 `struct pollfd` 的精巧设计：
   ```cpp
   struct pollfd {
       int   fd;      // 要监控的套接字描述符
       short events;  // 【你告诉内核】你想监控什么事件（如 POLLIN 可读、POLLOUT 可写）
       short revents; // 【内核返回给你】本轮实际发生了什么事件（如 POLLIN、POLLHUP 挂断、POLLERR 错误）
   };
   ```
   因为内核只修改 `revents` 字段，**绝不会破坏你填好的 `fd` 和 `events = POLLIN`**，所以你再也不用像 `select()` 那样每轮循环都把主集合复印一遍了！
3. **更高效的遍历与 $O(1)$ 尾部覆盖删除法**：
   `select()` 必须从 `0` 一路空转循环到 `fdmax`（哪怕你总共只有 2 个连接：`fd=3` 和 `fd=900`，也得循环 901 次）；而 `poll()` 只需要紧凑遍历 `pfds` 数组里实际存在的几个元素！
   当数组下标 `i` 处的客户端断开连接时，Beej 教了一个极其实用的 **$O(1)$ 删除技巧**：直接把数组**最后一个元素 `pfds.back()` 覆盖到 `pfds[i]` 上，然后 `pfds.pop_back()`**（记得把循环变量 `i--`，免得漏检查刚搬过来的那个末尾元素）！

### 2. Beej `pollserver.cpp`（现代 C++20 `std::vector<pollfd>` 多人聊天室完整实现）

下面给出用 `std::vector<pollfd>` 重构的 Beej 第 7.3 节 `pollserver.cpp` 完整代码，包含三个客户端（Alice、Bob、Charlie）同时在线群聊广播与 $O(1)$ 下线移除自测：

```cpp
// 文件名: beej_pollserver.cpp —— Beej 第 7.3 节 poll() 动态数组多人广播聊天室 + 三客户端群聊自测
#include <arpa/inet.h>
#include <netdb.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

int create_poll_listener(const char* port) {
    struct addrinfo hints{}, *ai = nullptr, *p = nullptr;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_PASSIVE;

    if (::getaddrinfo("127.0.0.1", port, &hints, &ai) != 0) return -1;

    int listener = -1, yes = 1;
    for (p = ai; p != nullptr; p = p->ai_next) {
        listener = ::socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (listener < 0) continue;
        ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int));
        if (::bind(listener, p->ai_addr, p->ai_addrlen) < 0) {
            ::close(listener);
            continue;
        }
        break;
    }
    ::freeaddrinfo(ai);
    if (p == nullptr || ::listen(listener, 10) == -1) return -1;
    return listener;
}

int main() {
    const char* PORT = "19035";
    int listener = create_poll_listener(PORT);
    if (listener == -1) return 1;

    // 使用 std::vector<pollfd> 代替 Beej C 版中的 malloc/realloc 手动扩容
    std::vector<struct pollfd> pfds;
    pfds.push_back(pollfd{listener, POLLIN, 0});

    std::cout << "[pollserver] Waiting for connections on 127.0.0.1:" << PORT << "...\n";

    // 启动 3 个客户端 (Alice, Bob, Charlie) 验证群聊广播
    std::thread sim_thread([PORT]() {
        auto dial = [PORT]() {
            struct addrinfo hints{}, *ai = nullptr;
            hints.ai_family = AF_INET;
            hints.ai_socktype = SOCK_STREAM;
            ::getaddrinfo("127.0.0.1", PORT, &hints, &ai);
            int fd = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
            ::connect(fd, ai->ai_addr, ai->ai_addrlen);
            ::freeaddrinfo(ai);
            return fd;
        };

        int alice = dial();
        int bob = dial();
        int charlie = dial();
        ::usleep(30000);

        const char* msg = "[Alice]: poll() scales without FD_SETSIZE limit!\n";
        ::send(alice, msg, std::strlen(msg), 0);

        char buf1[256]{}, buf2[256]{};
        ssize_t n1 = ::recv(bob, buf1, sizeof(buf1) - 1, 0);
        ssize_t n2 = ::recv(charlie, buf2, sizeof(buf2) - 1, 0);
        if (n1 > 0) std::cout << "  -> Bob received: " << buf1;
        if (n2 > 0) std::cout << "  -> Charlie received: " << buf2;

        ::close(alice);
        ::close(bob);
        ::close(charlie);
    });

    int closed_count = 0;
    while (closed_count < 3) {
        int poll_count = ::poll(pfds.data(), static_cast<nfds_t>(pfds.size()), 2000);
        if (poll_count == -1) {
            perror("poll");
            break;
        }

        // 遍历当前紧凑的 pollfd 数组
        for (size_t i = 0; i < pfds.size(); ++i) {
            // 检查 revents 是否包含可读 (POLLIN) 或对端挂断 (POLLHUP)
            if (!(pfds[i].revents & (POLLIN | POLLHUP))) continue;

            if (pfds[i].fd == listener) {
                // 迎宾员 listener 可读 -> accept 新连接并 push_back 到 pfds 末尾
                struct sockaddr_storage remoteaddr{};
                socklen_t addrlen = sizeof(remoteaddr);
                int newfd = ::accept(listener, reinterpret_cast<struct sockaddr*>(&remoteaddr), &addrlen);
                if (newfd != -1) {
                    pfds.push_back(pollfd{newfd, POLLIN, 0});
                    std::cout << "[pollserver] New client fd=" << newfd
                              << " joined (total fds=" << pfds.size() << ")\n";
                }
            } else {
                // 普通客户端可读
                char buf[256]{};
                int sender_fd = pfds[i].fd;
                ssize_t nbytes = ::recv(sender_fd, buf, sizeof(buf), 0);

                if (nbytes <= 0) {
                    if (nbytes == 0) {
                        std::cout << "[pollserver] Client fd=" << sender_fd << " left the room\n";
                    } else {
                        perror("recv");
                    }
                    ::close(sender_fd);
                    // ⚠️ Beej 招牌 O(1) 删除技巧：用数组最后一个元素覆盖当前位置 i，然后 pop_back()！
                    pfds[i] = pfds.back();
                    pfds.pop_back();
                    --i; // 回退下标，确保下一轮循环检查刚才从末尾搬过来的那个元素！
                    closed_count++;
                } else {
                    // 广播给除 listener 和 sender_fd 之外的所有在线客户端
                    for (const auto& target : pfds) {
                        if (target.fd != listener && target.fd != sender_fd) {
                            ::send(target.fd, buf, nbytes, 0);
                        }
                    }
                }
            }
        }
    }

    sim_thread.join();
    ::close(listener);
    return 0;
}
```

一键编译运行 `beej_pollserver.cpp`：

```bash
g++ -std=c++20 -O2 -Wall -Wextra -pthread beej_pollserver.cpp -o /tmp/beej_pollserver && /tmp/beej_pollserver
```

---

## 八、跨平台二进制序列化（pack754 / packi32）、UDP 广播（SO_BROADCAST）与 Beej FAQ 排坑宝典 (NET-58)

在《Beej's Guide》压轴的第 7.5 ~ 9 章中，解答了网络工程师进入深水区后必然遇到的三大终极问题：**跨平台结构体与浮点数怎么序列化？UDP 局域网广播怎么发？线上最诡异的 10 个网络故障怎么排？**

### 1. 为什么直接 `send(fd, &my_struct, sizeof(my_struct), 0)` 是跨平台自杀行为？

很多新手图省事，定义一个 `struct Player { char rank; int32_t hp; double speed; };`，然后直接把结构体指针强转成 `char*` 丢给 `send()`。
Beej 指出了这么做的**三大致命死穴**：
1. **结构体内存对齐填充（Struct Padding）各不相同**：不同编译器（GCC vs MSVC）、不同架构（32位 vs 64位）为了对齐内存，会在 `char rank` 后面偷偷塞进 3 个或 7 个字节的随机垃圾填充位，导致两端 `sizeof(Player)` 根本不一样！
2. **多字节整数大小端不一致**：没经过大端位运算打包的 `int32_t` 在不同架构间读出来全是乱码。
3. **浮点数（`float` / `double`）没有标准 `htonf()`**：虽然绝大多数现代 CPU 都遵循 IEEE-754 浮点标准，但 C 标准库并未规定跨网络传输浮点数的字节序转换函数。

### 2. Beej 传世经典：纯位运算二进制打包器（`packi16`/`packi32` 与 IEEE-754 浮点编码 `pack754`）

为了彻底摆脱编译器对齐和主机字节序的束缚，Beej 在第 7.5 节手写了一套**零外部依赖、纯位运算大端序列化引擎**：
- **`packi16` / `packi32` / `packi64`**：用位移操作（`>> 8`、`>> 16`、`>> 24`）把 16/32/64 位整数逐字节按**大端序**拆进紧凑的 `unsigned char* buf` 字节流；解包时（`unpacki16` / `unpacki32`）若遇到有符号负数（最高位符号位 `1`），自动进行二补数符号扩展还原！
- **`pack754(long double f, unsigned bits, unsigned expbits)`**：把任意 `float`（32 位，8 位指数）或 `double`（64 位，11 位指数）通过归一化尾数（Significand）与偏置指数（Biased Exponent）直接编码为一个无符号 32/64 位整数，然后再按大端字节序发上网络！

下面将 Beej 第 7.5 节这套著名的二进制序列化引擎完整呈现并附上精度校验 `main()`：

```cpp
// 文件名: beej_pack_serialization.cpp —— Beej 第 7.5 节跨平台整数与 IEEE-754 浮点数二进制打包/解包引擎
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>

// ============================================================================
// 1. Beej IEEE-754 浮点数编码器 (pack754 / unpack754)
// ============================================================================
uint64_t pack754(long double f, unsigned bits, unsigned expbits) {
    long double fnorm;
    int shift;
    long long sign, exp, significand;
    unsigned significandbits = bits - expbits - 1; // -1 为符号位

    if (f == 0.0) return 0; // 0 的特殊编码

    // 提取符号位并将数值转为正数
    if (f < 0) {
        sign = 1;
        fnorm = -f;
    } else {
        sign = 0;
        fnorm = f;
    }

    // 将 fnorm 归一化到 [1.0, 2.0) 区间，同时记录指数位移 shift
    shift = 0;
    while (fnorm >= 2.0) { fnorm /= 2.0; shift++; }
    while (fnorm < 1.0)  { fnorm *= 2.0; shift--; }
    fnorm = fnorm - 1.0; // 去掉隐含的前导 1

    // 计算尾数整数表达（加 0.5 四舍五入）
    significand = static_cast<long long>(fnorm * ((1LL << significandbits) + 0.5f));

    // 计算加上偏移量 (Bias) 后的指数
    exp = shift + ((1 << (expbits - 1)) - 1);

    // 拼装最终的 32/64 位无符号整数: [符号位 | 指数位 | 尾数位]
    return (static_cast<uint64_t>(sign) << (bits - 1)) |
           (static_cast<uint64_t>(exp) << (bits - expbits - 1)) |
           static_cast<uint64_t>(significand);
}

long double unpack754(uint64_t i, unsigned bits, unsigned expbits) {
    long double result;
    long long shift;
    unsigned bias;
    unsigned significandbits = bits - expbits - 1;

    if (i == 0) return 0.0;

    // 还原尾数并补回隐含的前导 1.0
    result = static_cast<long double>(i & ((1ULL << significandbits) - 1));
    result /= (1ULL << significandbits);
    result += 1.0f;

    // 还原指数并按 2^shift 缩放
    bias = (1 << (expbits - 1)) - 1;
    shift = static_cast<long long>((i >> significandbits) & ((1ULL << expbits) - 1)) - bias;
    while (shift > 0) { result *= 2.0; shift--; }
    while (shift < 0) { result /= 2.0; shift++; }

    // 还原符号位
    result *= ((i >> (bits - 1)) & 1) ? -1.0 : 1.0;
    return result;
}

#define pack754_32(f)   (static_cast<uint32_t>(pack754((f), 32, 8)))
#define pack754_64(f)   (pack754((f), 64, 11))
#define unpack754_32(i) (static_cast<float>(unpack754((i), 32, 8)))
#define unpack754_64(i) (static_cast<double>(unpack754((i), 64, 11)))

// ============================================================================
// 2. Beej 大端序整数逐字节打包与带符号扩展解包 (packi16/32 & unpacki16/u16/i32/u32)
// ============================================================================
void packi16(unsigned char* buf, uint16_t i) {
    *buf++ = static_cast<unsigned char>(i >> 8);
    *buf++ = static_cast<unsigned char>(i & 0xFF);
}

void packi32(unsigned char* buf, uint32_t i) {
    *buf++ = static_cast<unsigned char>(i >> 24);
    *buf++ = static_cast<unsigned char>((i >> 16) & 0xFF);
    *buf++ = static_cast<unsigned char>((i >> 8) & 0xFF);
    *buf++ = static_cast<unsigned char>(i & 0xFF);
}

uint16_t unpacku16(const unsigned char* buf) {
    return (static_cast<uint16_t>(buf[0]) << 8) | buf[1];
}

int16_t unpacki16(const unsigned char* buf) {
    uint16_t i2 = unpacku16(buf);
    // 如果最高位 (0x8000) 为 1，进行有符号负数补码还原
    return (i2 <= 0x7fffu) ? static_cast<int16_t>(i2) : static_cast<int16_t>(-1 - static_cast<int16_t>(0xffffu - i2));
}

uint32_t unpacku32(const unsigned char* buf) {
    return (static_cast<uint32_t>(buf[0]) << 24) |
           (static_cast<uint32_t>(buf[1]) << 16) |
           (static_cast<uint32_t>(buf[2]) << 8)  |
           buf[3];
}

int32_t unpacki32(const unsigned char* buf) {
    uint32_t i2 = unpacku32(buf);
    return (i2 <= 0x7fffffffu) ? static_cast<int32_t>(i2)
                               : static_cast<int32_t>(-1 - static_cast<int32_t>(0xffffffffu - i2));
}

int main() {
    // 动手验证：将负数 int16、负数 int32 与 float 3.1415926 打包进紧凑的 10 字节网络包并还原
    unsigned char wire_packet[10]{};
    int16_t orig_s16 = -3490;
    int32_t orig_s32 = -1000000;
    float   orig_f32 = -3.1415926f;

    packi16(wire_packet + 0, static_cast<uint16_t>(orig_s16));
    packi32(wire_packet + 2, static_cast<uint32_t>(orig_s32));
    packi32(wire_packet + 6, pack754_32(orig_f32));

    // 模拟对端从字节流按大端序解包
    int16_t rx_s16 = unpacki16(wire_packet + 0);
    int32_t rx_s32 = unpacki32(wire_packet + 2);
    float   rx_f32 = unpack754_32(unpacku32(wire_packet + 6));

    std::cout << std::fixed << std::setprecision(7);
    std::cout << "=== Beej Binary Serialization Verification (10-byte wire packet) ===\n"
              << "  int16 : orig=" << orig_s16 << " -> unpacked=" << rx_s16 << "\n"
              << "  int32 : orig=" << orig_s32 << " -> unpacked=" << rx_s32 << "\n"
              << "  float : orig=" << orig_f32 << " -> unpacked=" << rx_f32 << "\n";
    return 0;
}
```

一键编译运行验证 Beej 二进制打包器：

```bash
g++ -std=c++20 -O2 -Wall -Wextra beej_pack_serialization.cpp -o /tmp/beej_pack && /tmp/beej_pack
```

### 3. UDP 局域网广播（`SO_BROADCAST`）核心法则

为什么你平时直接拿一个普通的 UDP 套接字调用 `sendto()` 发往局域网广播地址（如 `192.168.1.255` 或 `255.255.255.255`），内核会直接返回 `-1` 并报错 **`EACCES (Permission denied)`**？

Beej 在第 7.6 节揭秘：因为局域网广播包会强行唤醒同一子网内的每一台机器处理中断，为了防止程序员手滑把单播 IP 写错成广播 IP 引发全网广播风暴，**POSIX 强制规定：必须先显式调用 `setsockopt` 打开 `SO_BROADCAST` 保险开关，才允许发送广播包**！

```cpp
int broadcast = 1;
// 打开这把安全锁后，该 UDP 套接字才被允许向子网广播地址调用 sendto()！
if (setsockopt(sockfd, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast)) == -1) {
    perror("setsockopt (SO_BROADCAST)");
    exit(1);
}
```

### 4. Beej 第 8 章 10 大经典 FAQ 排坑速查宝典

最后，我们将《Beej's Guide》第 8 章最精华的工程排坑问答浓缩为一张随查随用的救急表：

| 序号 | 经典故障现象 / 灵魂发问 | Beej 权威根因剖析与根治处方 |
| --- | --- | --- |
| **1** | **服务端运行得好好的，某个客户端突然异常强退，为什么紧接着我调 `send()` 时整个服务端进程一句话没留就直接暴毙退出了？** | **头号杀手：`SIGPIPE` 信号！** 当对端已经关闭了连接（或发来了 `RST`），你再往这个断开的 `fd` 调用 `send()` 时，内核会向你的进程发送 **`SIGPIPE` 信号**，而该信号的默认行为是**直接杀死你的进程**！<br>**根治**：在 `main()` 开头加上 `signal(SIGPIPE, SIG_IGN);` 全局忽略它，或者每次 `send()` 的第四个参数传入 **`MSG_NOSIGNAL`** 标志，让它只安静地返回 `-1`（`errno = EPIPE`）而不杀进程。 |
| **2** | **`bind()` 报错 `Address already in use` 怎么办？** | 旧连接正处于 `TIME_WAIT` 状态。在 `socket()` 后、`bind()` 前必加 **`setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(int))`**。 |
| **3** | **如何正确判断对端 TCP 客户端已经正常关闭了连接？** | 看 **`recv()` 的返回值等于 `0`**！在 TCP 中，`recv() == 0` 唯一且确定的含义就是对端调用了 `close()` 或 `shutdown(SHUT_WR)` 发来了 `FIN` 包（绝不是“暂时没收到数据”！暂时没数据在阻塞模式下会一直等，在非阻塞模式下会返回 `-1` 且 `errno == EAGAIN / EWOULDBLOCK`）。 |
| **4** | **`recv()` 返回 `-1` 且 `errno == ECONNRESET` (`Connection reset by peer`) 是怎么回事？** | 说明对端不是温柔地调 `close()` 四次挥手，而是进程直接崩溃被强杀、拔网线后重连、或者你在还有未读接收缓冲数据时强关连接，导致对端内核直接甩过来一记粗暴的 **`TCP RST`（复位报文）**。按客户端下线清理即可。 |
| **5** | **用 `fork()` 多进程模型处理并发客户端时，`ps aux` 看到满屏 `<defunct>` 僵尸进程（Zombie）怎么办？** | 子进程处理完客户端退出后，父进程如果没有调用 `waitpid()` 回收它的退出状态，子进程就会变成僵尸。必须在父进程开头用 `sigaction` 注册 **`SIGCHLD` 信号处理器**，在里面写 **`while (waitpid(-1, NULL, WNOHANG) > 0);`** 循环非阻塞收尸！ |
| **6** | **我怎么给 `connect()`、`accept()` 或 `recv()` 设置超时时间，防止网络卡死时程序永远挂住？** | 首选方案：把套接字放进 **`select()` 或 `poll()`** 里，利用它们的 `timeout` 参数等待可读/可写就绪后再调 `recv()`；备选方案：用 `setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv))` 设置接收超时。 |
| **7** | **为什么我用 `send()` 发了 3 次小字符串，对端一次 `recv()` 全读出来了（粘包）？** | 因为 `SOCK_STREAM`（TCP）是**无边界的连续字节流**！内核的 Nagle 算法还会自动把多次小写入合并成一个 TCP 段发出去。**根治**：在应用层设计分帧协议（如每条消息前加 2/4 字节长度头 `htons(len)`，或以 `\n` 分隔符切包）。 |
| **8** | **怎么把阻塞套接字改成非阻塞（Non-blocking）？** | 包含 `<fcntl.h>`，调用 **`fcntl(sockfd, F_SETFL, O_NONBLOCK)`**（更严谨的做法是先 `int flags = fcntl(fd, F_GETFL, 0);` 再 `fcntl(fd, F_SETFL, flags | O_NONBLOCK);`）。 |
| **9** | **客户端在 NAT 路由器后面，服务端怎么主动连它？** | 内网私有 IP（如 `192.168.x.x`）无法从公网直接主动发起连接。必须由内网客户端主动向公网服务器发起长连接（或配置路由器端口映射 Port Forwarding / 使用 STUN UDP 打洞）。 |
| **10** | **我已经把数据加密（或压缩）了，怎么发？** | 先在用户态内存缓冲区里把明文打包序列化，然后调用加密库（或直连 OpenSSL TLS）对整块字节缓冲区加密，最后在最外层贴上 4 字节密文总长度头，调 `sendall()` 发出即可。 |

---

## 本篇核心考点与 API 速查总表 (NET-51 ~ NET-58)

| 课程编号 | 章节主题 | 核心系统调用与必背防坑铁律 |
| --- | --- | --- |
| **NET-51** | 套接字分类与字节序 | `SOCK_STREAM`（TCP 字节流无边界）vs `SOCK_DGRAM`（UDP 数据报保边界），`htons`/`htonl`/`ntohs`/`ntohl` |
| **NET-52** | 双栈地址与 IP 转换 | `struct addrinfo`、`struct sockaddr_storage`（万能接收容器）、`inet_pton` / `inet_ntop`（彻底淘汰 `inet_ntoa`） |
| **NET-53** | 系统调用全生命周期 | `getaddrinfo` + `freeaddrinfo`、**`setsockopt(SO_REUSEADDR)`**、区分 `listener_fd` 与 `accept` 返回的 `new_fd`、`shutdown` |
| **NET-54** | TCP 与 UDP 收发闭环 | TCP `send`/`recv` vs UDP 无连接 `listener`（`bind`+`recvfrom`）与 `talker`（直调 `sendto`） |
| **NET-55** | 部分发送与数据封装 | **`sendall()` 循环补发**防内核发送缓冲区满导致短写截断、应用层包头定界封装 |
| **NET-56** | `select()` 多人聊天室 | `FD_ZERO`/`FD_SET`/`FD_CLR`/`FD_ISSET`、**每轮调 `select(fdmax+1, ...)` 前必写 `read_fds = master;`** |
| **NET-57** | `poll()` 动态数组重构 | `std::vector<pollfd>` 无 1024 上限、`events` 与 `revents` 分离免拷贝、断开连接时 **`pfds[i] = pfds.back(); pfds.pop_back();`** $O(1)$ 删除 |
| **NET-58** | 跨平台序列化与排坑 | `packi16`/`packi32` 大端逐字节打包、**`pack754` IEEE-754 浮点编码**、UDP `SO_BROADCAST`、忽略 **`SIGPIPE`** 防进程静默暴毙 |
