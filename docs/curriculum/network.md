# 计算机网络与服务协议（NET）

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

面向零基础到工业级 C++20 网络编程，沿着“零基础直觉与五层模型 → 链路层与 IP/CIDR/路由 → 传输层 TCP/UDP 深潜 → Socket 分帧与 epoll Reactor 编程 → DNS/HTTP3/TLS 与负载均衡”共 **50 节（NET-01 ~ NET-50）**，并无缝衔接到 [LogScan v3 有界 TCP 服务](../../src/content/labs/logscan-service.md)。

## 第一篇 网络基础直觉与五层封装（NET-01 ~ NET-08）

### 零基础从寄快递到 Socket

- 入口：会写基础 C++ 与终端命令行。
- 能力：建立 IP、端口、MAC/ARP、TCP 字节流粘包与 Socket 描述符的完整直觉。

<a id="net-01"></a>

#### NET-01 电路交换 vs 分组交换：互联网为什么切包裹

- 先修：[CPP-02](cpp.md#cpp-02)
- 状态：已有[第 0 课：网络模型、IP/端口、ARP 与为什么 TCP 会粘包](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. 专线独占（电路交换）与混流接力（分组交换）
  2. 分组交换的高利用率与乱序丢包副作用
  3. 为什么需要传输层在不可靠网路之上补齐可靠性

<a id="net-02"></a>

#### NET-02 TCP/IP 五层与 OSI 七层模型及逐层封装

- 先修：[NET-01](#net-01)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. 为何需要协议分层解耦网卡与上层应用
  2. 封装加头与解封装拆信封全路径图
  3. 五层核心协议与代表硬件设备对照

<a id="net-03"></a>

#### NET-03 带宽、延迟（RTT）、抖动与丢包率

- 先修：[NET-01](#net-01)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. 带宽（车道宽）vs 延迟 RTT（光速往返）本质区分
  2. 抖动对音视频与实时交互的致命影响
  3. 1%~2% 丢包如何拖垮 TCP 网页与文件下载

<a id="net-04"></a>

#### NET-04 IP 地址（127.0.0.1 vs 0.0.0.0）与 65535 个端口

- 先修：[NET-02](#net-02)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. IP 定位主机 vs 端口号定位进程房间号
  2. 本机测试 `127.0.0.1` 与全网卡监听 `0.0.0.0` 差异
  3. 知名端口、注册端口与客户端临时端口区间划分

<a id="net-05"></a>

#### NET-05 MAC 地址、ARP 地址解析与局域网下一跳

- 先修：[NET-04](#net-04)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. IP（通讯地址）与 MAC（网卡身份证）分工
  2. ARP 局域网广播问路与本地 `ip neigh` 缓存表
  3. 跨路由器转发时源目 IP 不变而源目 MAC 逐跳更换

<a id="net-06"></a>

#### NET-06 打电话（TCP）vs 寄明信片（UDP）

- 先修：[NET-02](#net-02)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. 连接建立、可靠重传与包边界差异全对照
  2. TCP 队头阻塞代价 vs UDP 8 字节轻装极速
  3. 网页/数据库与直播/游戏/DNS 的协议选型

<a id="net-07"></a>

#### NET-07 为什么 TCP 会粘包与半包？4 字节长度头定界

- 先修：[NET-06](#net-06)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)（含[分帧示例](../../public/examples/network-framing.cpp)）。
- 小节
  1. TCP 无消息边界“连续水管”本质
  2. 发送合批导致的粘包与截断到达导致的半包
  3. 固定长度、分隔符与 4 字节长度前缀框定法

<a id="net-08"></a>

#### NET-08 C/S 与 P2P 架构、Socket 直觉及 nc 破冰实验

- 先修：[NET-04](#net-04)
- 状态：已有[第 0 课：网络模型与封装](../../src/content/handbook/net-zero-start.md)。
- 小节
  1. 客户端主动拨号 vs 服务端被动监听模型
  2. Socket 作为整数文件描述符 `fd` 的读写抽象
  3. 两个终端用 `nc` 现场跑通 `127.0.0.1:9090` 通信

## 第二篇 链路层与网络层路由寻址（NET-09 ~ NET-18）

### 以太网、CIDR、ICMP、NAT 与 IPv6

<a id="net-09"></a>

#### NET-09 链路层成帧、MTU 限制与 CRC 差错校验

- 先修：[NET-05](#net-05)
- 状态：已有[链路层与网络层：以太网、IPv4/CIDR、路由、ICMP、NAT 与 IPv6](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. 以太网帧字段与前导码/FCS 结构
  2. 1500B 标准 MTU 边界与分片隐患
  3. 链路层校验失败直接丢包与上层重传职责划分

<a id="net-10"></a>

#### NET-10 交换机 MAC 自学习表、生成树与 VLAN 隔离

- 先修：[NET-09](#net-09)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. 交换机端口学习 MAC 与未知单播泛洪机制
  2. 冗余接线引起广播风暴与 STP 破环原理
  3. IEEE 802.1Q VLAN 标签逻辑切分广播域

<a id="net-11"></a>

#### NET-11 IPv4 首部全景、TTL 与 IP 分片陷阱

- 先修：[NET-02](#net-02)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. IPv4 20 字节核心字段（版本/总长/TTL/协议号/校验和）
  2. TTL 防止路由成环数据包无限兜圈
  3. 为何设置 DF 禁止 IP 分片并用 TCP MSS 提前切块

<a id="net-12"></a>

#### NET-12 子网掩码与 CIDR 划分实战手算

- 先修：[NET-04](#net-04)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. CIDR `IP/前缀长度` 告别死板分类地址
  2. 给定地址掩码手算网络号、广播地址与可用主机范围
  3. `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` 三大私网段

<a id="net-13"></a>

#### NET-13 最长前缀匹配与路由器转发表查询

- 先修：[NET-12](#net-12)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. 路由器如何依据 `ip route` 决定出口网卡与下一跳
  2. 多条规则命中时最长前缀匹配优先规则
  3. `0.0.0.0/0` 默认网关兜底机制

<a id="net-14"></a>

#### NET-14 动态路由协议全局视野：RIP、OSPF 与 BGP

- 先修：[NET-13](#net-13)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. 内部网关协议 RIP 跳数局限 vs OSPF 链路状态 Dijkstra
  2. 自治系统 AS 与支撑公网的 BGP 边界路由策略
  3. 商业选路优先于物理最短路径的互联网事实

<a id="net-15"></a>

#### NET-15 ICMP 诊断原理：ping 与 traceroute

- 先修：[NET-11](#net-11)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. ICMP 寄生于 IP 包内（无端口概念）的工作定位
  2. `ping` Echo Request/Reply 测量往返 RTT 与丢包
  3. `traceroute` 递增 TTL=1..N 触发沿途路由器回错曝光全路径

<a id="net-16"></a>

#### NET-16 NAT 网络地址转换与 P2P 内网穿透

- 先修：[NET-12](#net-12)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. NAPT 转换内网 IP+端口共享单个公网 IP 的映射表
  2. 为何公网主机无法直接反向发起连接内网主机
  3. STUN/TURN 内网打洞建立直连的思路

<a id="net-17"></a>

#### NET-17 DHCP 四步自动获取 IP 租约（DORA 流程）

- 先修：[NET-10](#net-10)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. Discover / Offer / Request / ACK 广播问答四步曲
  2. 租期续约、子网掩码、网关与 DNS 下发内容
  3. 断网重连后 IP 变动隐患与静态绑定

<a id="net-18"></a>

#### NET-18 IPv6 革新：128 位地址、简化首部与双栈

- 先修：[NET-12](#net-12)
- 状态：已有[链路层与网络层正文](../../src/content/handbook/net-link-ip.md)。
- 小节
  1. 128 位缩写格式与告别 NAT 复杂地址复用
  2. 固定 40B 首部取消沿途分片与校验和提速路由
  3. SLAAC 无状态自动配置与 `getaddrinfo` 双栈适配

## 第三篇 传输层深潜：TCP 机制与拥塞控制（NET-19 ~ NET-30）

### UDP、握手挥手、滑动窗口与调优

<a id="net-19"></a>

#### NET-19 UDP 8 字节首部与用户态可靠 UDP（QUIC/KCP）

- 先修：[NET-06](#net-06)
- 状态：已有[传输层深潜：UDP、TCP 握手挥手、状态机、滑动窗口与拥塞控制](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. UDP 极简 8 字节首部字段与无连接收发
  2. 为什么 OS 内核 TCP 升级慢导致游戏和 HTTP3 倒向 UDP
  3. 在 UDP 之上自建确认/重传/前向纠错消除队头阻塞

<a id="net-20"></a>

#### NET-20 TCP 20 字节首部全景与核心标志位

- 先修：[NET-06](#net-06)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 32 位序号 SEQ 与期望确认号 ACK 含义
  2. 五大核心开关位：`SYN`、`ACK`、`FIN`、`RST`、`PSH`
  3. 窗口字段 `rwnd` 与常见 TCP 可选头

<a id="net-21"></a>

#### NET-21 TCP 三次握手深潜、ISN 与 SYN Flood 防御

- 先修：[NET-20](#net-20)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 为何三次握手不能省成两次（双向能力确认与历史失效连接防范）
  2. 随机初始化序列号 ISN 防窜扰
  3. 半连接/全连接队列与 SYN Cookies 抗洪泛机制

<a id="net-22"></a>

#### NET-22 TCP 四次挥手与 11 个状态机流转

- 先修：[NET-21](#net-21)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 全双工半关闭决定为何 `ACK` 与 `FIN` 拆开分两步发
  2. 完整状态机：`FIN_WAIT_1/2`、`CLOSE_WAIT`、`LAST_ACK`、`TIME_WAIT`
  3. 线上大量 `CLOSE_WAIT` 必是应用忘了 `close(fd)` 排错定位

<a id="net-23"></a>

#### NET-23 TIME_WAIT（2MSL）意义、端口耗尽与 SO_REUSEADDR

- 先修：[NET-22](#net-22)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 2MSL 停留解决重传末包 `ACK` 与旧包迷途过期问题
  2. `SO_REUSEADDR` 解决服务重启报 `Address already in use`
  3. 高并发下避免由服务端主动关闭产生海量 `TIME_WAIT`

<a id="net-24"></a>

#### NET-24 可靠传输底座：ARQ、GBN 与选择重传 SACK

- 先修：[NET-20](#net-20)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 停等协议低带宽利用瓶颈分析
  2. 流水线发送下 GBN 全退回浪费 vs SACK 精准只重传丢包分段
  3. SACK 选项在现代高延迟网络中的收益

<a id="net-25"></a>

#### NET-25 滑动窗口、流量控制（rwnd）与零窗口探测

- 先修：[NET-24](#net-24)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 发送窗 4 类字节状态划分（已确认 / 已发待确认 / 允许发 / 禁用）
  2. `rwnd=0` 刹车与零窗口持续探测防死锁
  3. Window Scale 缩放因子突破 64KB 窗口上限

<a id="net-26"></a>

#### NET-26 超时重传 RTO 与 3 次冗余 ACK 快速重传

- 先修：[NET-25](#net-25)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 基于平滑 RTT 与方差动态计算 RTO 及指数退避
  2. 收到 3 次重复 ACK 不等定时器熬完当场快重传
  3. 重传粒度差异对卡顿体感的影响

<a id="net-27"></a>

#### NET-27 拥塞控制（cwnd）：慢启动、Cubic 与 Google BBR

- 先修：[NET-25](#net-25)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 在途数据上限 `min(cwnd, rwnd)` 双重约束
  2. 慢启动指数攀升、拥塞避免线性试探与快恢复
  3. BBR 不靠塞满队列丢包、直测真实带宽延迟积革命

<a id="net-28"></a>

#### NET-28 Nagle 算法、延迟确认 40ms 卡顿与 TCP_NODELAY

- 先修：[NET-25](#net-25)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. Nagle 攒包机制与接收方 40ms Delayed ACK 机制
  2. 小包两次写入撞上延迟确认引发每次请求硬卡 40ms 死结
  3. 开启 `TCP_NODELAY` 与应用层拼好整帧一次发出

<a id="net-29"></a>

#### NET-29 TCP Keepalive 内核保活 vs 应用层心跳设计

- 先修：[NET-22](#net-22)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. 断电/拔网线无 FIN 导致的僵尸半打开连接
  2. 内核 2 小时默认保活滞后且无法检测进程假死
  3. 业务层 `PING/PONG` 心跳保活长连接与 NAT 穿透映射

<a id="net-30"></a>

#### NET-30 半关闭 shutdown、RST 复位与 SIGPIPE 杀进程防线

- 先修：[NET-22](#net-22)
- 状态：已有[传输层深潜正文](../../src/content/handbook/net-transport-tcp.md)。
- 小节
  1. `close()` 销毁句柄 vs `shutdown(SHUT_WR)` 发 FIN 保读
  2. 异常复位报文 `RST` 常见触发场景
  3. 忽略 `SIGPIPE` 防止单个客户端异常断开导致全服被内核杀死

## 第四篇 C++20 Socket 实战、分帧与 epoll Reactor（NET-31 ~ NET-40）

### 工业级网络服务编码实现

<a id="net-31"></a>

#### NET-31 POSIX Socket 服务端监听与 UniqueFd RAII

- 先修：[NET-21](#net-21)、[CPP-11](cpp.md#cpp-11)
- 状态：已有[Socket 编程、协议分帧、非阻塞 I/O、epoll 与高并发架构](../../src/content/handbook/network-tcp.md)。
- 小节
  1. `socket/setsockopt/bind/listen/accept` 五步曲与五元组
  2. 用独占移动语义 `UniqueFd` 绝不泄漏任何套接字句柄
  3. `ip route` 对照回环 `127.0.0.1` 与通配地址行为

<a id="net-32"></a>

#### NET-32 getaddrinfo 多候选域名解析与 connect 连接

- 先修：[NET-31](#net-31)、[NET-18](#net-18)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. 用 `AF_UNSPEC` 同时兼容 IPv4/IPv6 返回链表
  2. `UniquePtr` 自定义删除器自动 `freeaddrinfo`
  3. 顺序遍历所有候选 IP 直至首次 `connect` 成功

<a id="net-33"></a>

#### NET-33 阻塞模式短读短写循环（send_all / recv）与 EINTR

- 先修：[NET-31](#net-31)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. 为什么单次 `send`/`recv` 可能只处理部分字节
  2. 写循环处理 `errno == EINTR` 重试与异常断连退出
  3. `recv() == 0` 对端正常关闭与 `!recv_buf.empty()` 截断判定

<a id="net-34"></a>

#### NET-34 长度前缀分帧编码器与防 4GB 溢出护栏

- 先修：[NET-07](#net-07)、[NET-33](#net-33)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)（含[分帧示例](../../public/examples/network-framing.cpp)）。
- 小节
  1. 4 字节大端无符号长度头编解码细节
  2. 必须先校验 `len <= kMaxFrameBytes` 防溢出和 OOM
  3. 使用 `while` 循环而非 `if` 排干缓冲内所有黏连帧

<a id="net-35"></a>

#### NET-35 定长、分隔符与长度前缀三大协议对比

- 先修：[NET-34](#net-34)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. 文本行 `\n` 分隔的转义负担 vs 二进制长度头 O(1) 定长
  2. 字节缓冲区追加、切片与擦除追踪演示
  3. 半包到达后再补齐的边界单元测试构造

<a id="net-36"></a>

#### NET-36 非阻塞 Socket（O_NONBLOCK）与 EAGAIN / EWOULDBLOCK

- 先修：[NET-33](#net-33)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. `fcntl` 开启 `O_NONBLOCK` 告别单线程卡死
  2. 正确识别 `EAGAIN / EWOULDBLOCK` 表示“已读空/写满等待下轮就绪”
  3. `readv`/`writev` 分散聚集读写减少复制开销

<a id="net-37"></a>

#### NET-37 select / poll 多路复用与 steady_clock 超时预算

- 先修：[NET-36](#net-36)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. `poll()` 等待 `POLLIN` 防止慢客户端发半帧无限挂死
  2. 用单调时钟 `steady_clock` 算 `deadline - now` 防 NTP 跳变
  3. `EINTR` 被中断时只续用剩余预算而不重置超时

<a id="net-38"></a>

#### NET-38 Linux epoll 底层原理与 LT / ET 模式实战

- 先修：[NET-37](#net-37)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. 为何 `epoll` 用红黑树 + 就绪双向链表把复杂度从 O(N) 降到 O(活跃数)
  2. 水平触发 LT 安全写法与 `EPOLLOUT` 防 CPU 空转摘除规则
  3. 边缘触发 ET 强制循环读写直至 `EAGAIN` 铁律

<a id="net-39"></a>

#### NET-39 Reactor 事件循环架构与零拷贝 sendfile

- 先修：[NET-38](#net-38)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)。
- 小节
  1. 主从 Reactor 与 `One-Loop-Per-Thread` 线程模型
  2. 每个连接独立状态机 `ConnState { recv_buf, send_buf, deadline }`
  3. 大文件直接走内核态零拷贝 `sendfile()`

<a id="net-40"></a>

#### NET-40 服务端背压控制、连接预算与 LogScan v3 集成

- 先修：[NET-39](#net-39)
- 状态：已有[Socket 编程与高并发架构正文](../../src/content/handbook/network-tcp.md)与[LogScan v3 实验](../../src/content/labs/logscan-service.md)。
- 小节
  1. 最大并发数限制、单连接缓冲预算与 OOM 防御
  2. 下游队列满时摘掉 `POLLIN/EPOLLIN` 借 TCP 滑动窗口反压客户端
  3. `SIGTERM` 停机先停 accept 再排空在途请求与落盘

## 第五篇 应用层协议演进、TLS 安全与高可用架构（NET-41 ~ NET-50）

### DNS、HTTP/1.1~3、加密证书与负载均衡

<a id="net-41"></a>

#### NET-41 DNS 层次域名树与递归/迭代解析流程

- 先修：[NET-32](#net-32)
- 状态：已有[应用层与网络安全：DNS、HTTP/1.1~3、WebSocket、密码学与 TLS](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. 浏览器缓存 / hosts / 本地递归解析器分工
  2. 根服务器 `.` → 顶级域 `.com` → 权威域名服务器迭代寻路
  3. UDP 53 与 TCP 53 场景区分

<a id="net-42"></a>

#### NET-42 DNS 常见记录（A/AAAA/CNAME/MX/TXT）与 TTL 陷阱

- 先修：[NET-41](#net-41)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. A、AAAA、CNAME 别名与 TXT 验证记录用途
  2. TTL 缓存机制与上线换服务器 IP 前提前降 TTL 操作
  3. DNS 轮询与智能解析（GeoDNS）

<a id="net-43"></a>

#### NET-43 HTTP/1.1 报文结构、幂等性、状态码与 Keep-Alive

- 先修：[NET-34](#net-34)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. 请求/响应行、Header 首部与空行分界结构
  2. `GET`/`PUT`/`DELETE` 幂等性与 `POST` 业务幂等键重试防御
  3. `2xx/3xx/4xx/5xx` 状态码与 `Content-Length`/`chunked` 分帧

<a id="net-44"></a>

#### NET-44 HTTP/1.1 队头阻塞 vs HTTP/2 多路复用与 HPACK

- 先修：[NET-43](#net-43)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. HTTP/1.1 串行阻塞迫使开 6 条连接的困境
  2. HTTP/2 二进制分帧按 `Stream ID` 交错并发多路复用
  3. HPACK 动态字典大幅压缩重复请求头

<a id="net-45"></a>

#### NET-45 HTTP/3 与 QUIC：UDP 之上消灭 TCP 队头阻塞

- 先修：[NET-44](#net-44)、[NET-19](#net-19)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. HTTP/2 仍受制于单条 TCP 丢包连坐阻塞全流的问题
  2. QUIC 基于 UDP 让各 Stream 彻底独立与内置 TLS 1.3
  3. 0-RTT 秒连与 Connection ID 移动网络切换不断线

<a id="net-46"></a>

#### NET-46 WebSocket 全双工长连接与 gRPC / Protobuf

- 先修：[NET-44](#net-44)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. HTTP `101 Switching Protocols` 升级为双向推送通道
  2. gRPC 基于 HTTP/2 与二进制 Protobuf 强接口契约
  3. 双向流、Deadline 超时透传与 JSON 文本体积对比

<a id="net-47"></a>

#### NET-47 现代密码学三积木：对称、非对称与数字签名

- 先修：[NET-02](#net-02)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. AES-GCM/ChaCha20 对称加密承担高速正文传输
  2. ECDHE/RSA 非对称密码安全碰头协商临时钥匙
  3. SHA-256 哈希与数字签名保证内容未被篡改

<a id="net-48"></a>

#### NET-48 数字证书与 CA 信任链防中间人攻击

- 先修：[NET-47](#net-47)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. 没有身份公证时公钥直接被黑客掉包的中间人危机
  2. 浏览器内置 Root CA 逐级验签与域名 SAN 校对
  3. 自签名证书、域名不符与过期报错排查逻辑

<a id="net-49"></a>

#### NET-49 TLS 1.2 vs TLS 1.3（1-RTT 握手与前向保密）

- 先修：[NET-48](#net-48)、[NET-21](#net-21)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. TLS 1.2 2-RTT 握手延迟与废除老旧套件原因
  2. TLS 1.3 首包附带 ECDHE 公钥实现 1-RTT 极速建连
  3. 完美前向保密（PFS）确保长期私钥泄密也不危及历史密文

<a id="net-50"></a>

#### NET-50 网络安全防线与四层/七层负载均衡架构

- 先修：[NET-49](#net-49)、[NET-40](#net-40)
- 状态：已有[应用层与网络安全正文](../../src/content/handbook/net-app-sec.md)。
- 小节
  1. ARP 欺骗、DNS 劫持与 Web XSS/CSRF/CORS 防御清单
  2. 四层负载均衡（LVS IPVS 仅转发五元组）高吞吐原理
  3. 七层负载均衡（Nginx/Envoy 卸载 TLS、按 URL 路由与熔断限流）
