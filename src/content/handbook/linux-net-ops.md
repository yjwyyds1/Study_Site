---
title: "Linux 网络运维、端口排错、抓包与安全传输"
description: "系统掌握 LNX-33 至 LNX-40：iproute2 接口与路由、ss/lsof 端口与套接字状态、ping/traceroute/mtr 连通性、DNS 解析链与 dig/getent、curl/wget HTTP 调试、tcpdump 抓包看懂 SYN/ACK/FIN、SSH 密钥与端口转发，以及 rsync 同步与 ufw/iptables 防火墙。"
order: 75
category: "Linux 实践"
tags: ["Linux", "网络排错", "ip", "ss", "DNS", "curl", "tcpdump", "SSH", "rsync", "ufw"]
related: ["handbook/network-tcp", "handbook/linux-perm-admin", "handbook/linux-process-io", "handbook/linux-debug-elf"]
sources: []
---

## 本课只解决这 1 个问题

写服务端或调试线上接口时，最常见的一句话是：“**我本机明明通的，怎么部署到 Linux 上就连不上了？**”背后的原因千奇百怪：服务端只监听在 `127.0.0.1` 忘了写 `0.0.0.0`、`/etc/hosts` 和 DNS 不一致、防火墙 `DROP` 导致请求干等超时、SSH 密钥权限太宽被拒绝、或者 `rsync` 少写一个斜杠把目录嵌套了一层。

本课覆盖 **LNX-33 至 LNX-40**，帮你建立一套**从链路层、IP 路由、端口状态、DNS、HTTP 到 `tcpdump` 抓包与 SSH/防火墙**的完整 Linux 网络排错与安全传输工具箱。

前置要求：理解基础 IP/端口与 TCP 概念（可对照阅读[网络编程与 TCP 协议实战](../network-tcp/)）。

## 阅读路线与排查分层图

线上遇到“连不上”，永远按照**从下到上、从内到外**的顺序逐层排除：

| 编号 | 网络层级 / 主题 | 核心问题 | 必会命令 |
| :---: | --- | --- | --- |
| **LNX-33** | 接口、IP 与路由 | 网卡起来没？IP/网关对不对？回环和物理网卡区别？ | `ip addr`, `ip route`, `ip link` |
| **LNX-34** | 监听端口与连接态 | 进程真的在监听吗？绑在 `127.0.0.1` 还是 `0.0.0.0`？ | `ss -tulpn`, `ss -tan`, `lsof -i` |
| **LNX-35** | 连通性与路由追踪 | 包能走到对端吗？在哪一跳开始丢包或超时？ | `ping`, `traceroute`, `mtr` |
| **LNX-36** | DNS 域名解析 | 域名到底解析成哪个 IP 了？走 `/etc/hosts` 还是 DNS？ | `getent`, `dig`, `nslookup` |
| **LNX-37** | HTTP 命令行测试 | TLS 握手、状态码、请求头和超时到底卡在哪一步？ | `curl -v/-I/-X/-d/-H`, `wget` |
| **LNX-38** | 抓包剖析 | 谁发了 `SYN` 谁回了 `RST`/`FIN`？用数据包铁证说话 | `tcpdump -i lo ... -nn -X` |
| **LNX-39** | SSH 密钥与隧道 | 免密登录、跳板机配置，以及用 `-L` 安全穿透内网端口 | `ssh-keygen`, `~/.ssh/config`, `ssh -L` |
| **LNX-40** | 文件同步与防火墙 | 增量镜像同步不误删，`ufw`/`iptables` 默认拒绝放行模型 | `scp`, `sftp`, `rsync`, `ufw`, `iptables` |

---

## 一、网络接口、IP、路由与回环（LNX-33）

老旧教程里常见的 `ifconfig` 和 `route` 所属的 `net-tools` 早已停止维护，现代 Linux 统一使用 **`iproute2` 套件（`ip` 命令）**。

### 1. 看懂网卡与 IP：`ip link` 与 `ip addr`

```bash
# 极简一览表（最适合第一眼核对网卡状态与 IP）
$ ip -br addr
lo               UNKNOWN        127.0.0.1/8 ::1/128
eth0             UP             172.24.112.15/20 fe80::215:5dff:fe12:3456/64
```

想看详细链路状态和 MTU，运行 `ip link show` 或 `ip addr show dev eth0`：

```bash
$ ip addr show dev eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:15:5d:12:34:56 brd ff:ff:ff:ff:ff:ff
    inet 172.24.112.15/20 brd 172.24.127.255 scope global eth0
       valid_lft forever preferred_lft forever
```

读懂这几处关键信息：
- **`UP` vs `LOWER_UP`**：尖括号里的 `UP` 表示管理员在软件层面启用了网卡；`LOWER_UP` 表示物理链路/虚拟网桥确实接通了（网线插好了）。如果只见 `UP` 不见 `LOWER_UP` 且 `state DOWN`，说明网线或底层虚拟交换机没连上。
- **`mtu 1500`**：最大传输单元（字节），常见 VPN/隧道下如果包过大不通，往往是 MTU 不匹配。
- **`172.24.112.15/20`**：CIDR 表示法，`/20` 代表子网掩码前 20 位为网络位（`255.255.240.0`），同一子网的主机直接二层 ARP 通信，跨子网才走网关。

### 2. 回环接口 `lo` vs 物理/虚拟网卡 `eth0`，以及 `127.0.0.1` vs `0.0.0.0`

| 地址 / 接口 | 本质含义 | 数据包会不会离开本机？ | 服务端监听效果 |
| --- | --- | :---: | --- |
| **`lo` (`127.0.0.1/8`)** | 内核软件回环接口（Loopback） | **绝对不走物理网卡** | 仅允许**本机进程**通过 `127.0.0.1` 或 `localhost` 访问；局域网/公网流量一概进不来！ |
| **`eth0` / `ens33`** | 对外网络接口（有具体局域网或公网 IP） | 走外部网络 | 若只绑定 `172.24.112.15`，则只有发往该 IP 的流量能连入，本机连 `127.0.0.1` 反而连不上 |
| **`0.0.0.0`（IPv4） / `::`（IPv6）** | **通配地址（INADDR_ANY）** | — | **监听本机所有网卡**（包括 `lo` 和 `eth0`），本机和外部主机都能访问 |

### 3. 查看与验证路由表：`ip route`

```bash
$ ip route show
default via 172.24.112.1 dev eth0 proto kernel
172.24.112.0/20 dev eth0 proto kernel scope link src 172.24.112.15
```

- `172.24.112.0/20 dev eth0`：发往同网段 `172.24.112.x` 的包直接从 `eth0` 走二层直连出去。
- `default via 172.24.112.1 dev eth0`：其余所有外网目的地址走默认网关 `172.24.112.1`（遵循**最长前缀匹配**原则）。
- **排错神技 `ip route get <目标IP>`**：不用自己心算子网掩码，直接问内核“去 `8.8.8.8` 到底走哪张网卡、用哪个源 IP、发给谁”：
  ```bash
  $ ip route get 8.8.8.8
  8.8.8.8 via 172.24.112.1 dev eth0 src 172.24.112.15 uid 1000
  ```

---

## 二、监听端口与套接字状态（LNX-34）

同样地，老命令 `netstat` 已被更快、直接通过 Netlink 从内核拿数据的 **`ss`（Socket Statistics）** 取代。

### 1. `ss` 核心参数速查

| 参数 | 含义 | 记忆口诀 |
| :---: | --- | --- |
| `-t` | 仅显示 TCP 套接字 | TCP |
| `-u` | 仅显示 UDP 套接字 | UDP |
| `-l` | 仅显示正在监听（`LISTEN`）的端口 | Listening |
| `-a` | 显示所有状态（包括 `ESTABLISHED`、`TIME-WAIT` 等） | All |
| `-p` | 显示占用该端口的进程名与 PID（看他人进程需 `sudo`） | Process |
| `-n` | **不反查主机名和服务名**（直接显示数字 IP 与端口号，速度极快） | Numeric |

### 2. 看懂 `ss -tulpn`（排查“服务起没起来、谁在监听”）

```bash
$ sudo ss -tulpn
Netid State   Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
udp   UNCONN  0      0      127.0.0.53%lo:53    0.0.0.0:*         users:(("systemd-resolve",pid=412,fd=13))
tcp   LISTEN  0      128    127.0.0.1:5432      0.0.0.0:*         users:(("postgres",pid=920,fd=5))
tcp   LISTEN  0      511    0.0.0.0:8080        0.0.0.0:*         users:(("logscan_srv",pid=2105,fd=4))
```

重点盯住三列：
1. **`Local Address:Port`**：`postgres` 监听在 `127.0.0.1:5432`，外部机器绝对连不上！而 `logscan_srv` 监听在 `0.0.0.0:8080`，允许任何接口连入。
2. **`Recv-Q` / `Send-Q`（在 `LISTEN` 状态下有特殊含义！）**：对 `LISTEN` 套接字而言，`Send-Q` 是全连接队列上限（`listen(fd, backlog)` 设的值，受 `somaxconn` 限制），`Recv-Q` 是当前队列里积压着还没来得及被 `accept()` 取走的已完成握手连接数！如果 `Recv-Q` 接近 `Send-Q`，说明服务端 `accept` 处理太慢，客户端要开始丢连接了。
3. **`Process`**：不加 `sudo` 时，只能看到当前自己用户的进程名，看系统服务必须加 `sudo ss -tulpn`。

### 3. `ss -tan` 与连接状态排查、临时端口（Ephemeral Ports）

用 `ss -tan`（或汇总统计 `ss -s`）看活跃连接状态：

| TCP 状态 | 含义 | 大量堆积意味着什么？ |
| --- | --- | --- |
| `LISTEN` | 服务端等待连接 | 正常监听中 |
| `SYN-RECV` | 收到 `SYN`，等对端第三次握手的 `ACK` | 暴增可能是遭受 SYN Flood 攻击，或半连接队列被塞满 |
| `ESTABLISHED` | 正常双向数据传输中 | 当前活跃连接数 |
| **`TIME-WAIT`** | 主动关闭连接方等待 `2MSL`（约 60 秒） | 正常现象；但短连接压测客户端若 `TIME-WAIT` 几万个，可能耗尽**临时端口** |
| **`CLOSE-WAIT`** | 收到对端 `FIN`，内核等着**本端程序调用 `close()`** | **程序代码 Bug（FD 泄露）！** 说明对端早断了，但你的 C++/Java 代码忘了 `close(fd)` |

另外也可以用 `sudo lsof -i :8080` 快速查看占用 8080 端口的所有监听及活跃连接。

**什么是临时端口（Ephemeral Ports）？**
当你作为客户端执行 `curl http://example.com:80` 时，目的端口是固定 `80`，但你的本机必须随机挑一个空闲源端口用于回包通信，这就是临时端口：

```bash
$ cat /proc/sys/net/ipv4/ip_local_port_range
32768	60999
```
可见一台默认配置的 Linux 主机对外发起 TCP 连接时，只有约 `28232` 个临时端口可供同一目标 `IP:Port` 复用。如果高频发起短连接而不复用连接池，就会把临时端口耗尽，报错 `Cannot assign requested address` (`EADDRNOTAVAIL`)。

---

## 三、连通性与路由追踪（LNX-35）

### 1. `ping`：测试三层可达性与延迟抖动

```bash
$ ping -c 4 -W 2 1.1.1.1
PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=57 time=12.1 ms
64 bytes from 1.1.1.1: icmp_seq=3 ttl=57 time=12.8 ms
64 bytes from 1.1.1.1: icmp_seq=4 ttl=57 time=12.2 ms

--- 1.1.1.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3005ms
rtt min/avg/max/mdev = 12.104/12.375/12.811/0.273 ms
```

- `-c 4`：发 4 个包就停（Linux 的 `ping` 默认无限发，写脚本务必加 `-c`！）。
- `-W 2`：单个回包超时 2 秒。
- `-I eth0`：多网卡主机上强制指定从哪张网卡发出。

> [!WARNING]
> **ICMP 排错的双向误区**：
> - **`ping` 不通 ≠ 对方挂了**：很多云服务器安全组默认禁用了 ICMP Echo，但 `80/443` TCP 端口是通的！此时应改用 `curl`、`nc -vz <ip> <port>` 或 `traceroute -T -p 443` 测 TCP 端口。
> - **`ping` 通 ≠ 服务能连上**：`ping` 只能证明 IP 层路通，不管对方进程有没有监听 8080 端口，也不管防火墙是否放行 TCP 8080。

### 2. `traceroute` 与 `mtr`：定位在哪一跳卡住/丢包

`traceroute` 的原理十分巧妙：依次发送 `TTL=1, 2, 3...` 的探测包，沿途每一台路由器把 TTL 减到 `0` 时，就会向你回送一条 `ICMP Time Exceeded`，从而暴露出整条路径：

```bash
# -n 禁用反向 DNS 查询（避免每跳卡几秒）
traceroute -n 1.1.1.1
# 若普通 UDP 探测被防火墙屏蔽，可改用 TCP SYN 探测目标 443 端口：
sudo traceroute -n -T -p 443 example.com
```

但 `traceroute` 每跳只发 3 个包，看不出间歇性丢包。生产排错更常用 **`mtr`（My Traceroute）**，它把 `ping` 和 `traceroute` 合二为一并持续采样：

```bash
# 汇总模式（-r），对每个节点发 20 个包（-c 20），不查 DNS（-n）
mtr -n -r -c 20 1.1.1.1
```

**看懂 `mtr` 丢包率的核心技巧**：
- 如果第 3 跳显示 `Loss% = 40%`，但第 4、5、6 跳一直到终点**全都是 `0.0%` 丢包**——这**不是网络故障**！仅仅是第 3 跳那台骨干路由器为了保护 CPU，对直接发给自己的 ICMP TTL 超时回包做了**限速（Rate Limiting）**，真正转发业务流量的硬件芯片完全正常。
- 只有当**从第 N 跳开始一直延续到最后一跳都在丢包**，才说明第 N 跳附近的链路真的发生了拥塞或丢包。

---

## 四、DNS 解析排错（LNX-36）

程序连不上 `api.example.com` 时，必须先确认：**它到底走本地 `/etc/hosts` 还是 DNS 服务器？解析出的是什么 IP？**

### 1. Linux 真实的解析顺序：`/etc/nsswitch.conf`

打开 `/etc/nsswitch.conf`，看 `hosts:` 这一行：

```text
hosts:          files dns
```
这意味着普通应用程序（`curl`、`ping`、C++ `getaddrinfo()`）查域名时：
1. 先查 **`files`** —— 即本地静态映射文件 **`/etc/hosts`**；
2. 找不到再去查 **`dns`** —— 读取 **`/etc/resolv.conf`** 里的 `nameserver` 地址发 UDP/TCP 53 端口查询（在现代 Ubuntu 中，`/etc/resolv.conf` 常指向本地缓存代理 `127.0.0.53`，由 `systemd-resolved` 管理，可用 `resolvectl status` 看上游真实 DNS）。

### 2. `getent` vs `dig` / `nslookup`（必避大坑！）

| 工具 | 是否读取 `/etc/hosts`？ | 核心作用与常用命令 |
| --- | :---: | --- |
| **`getent hosts <域名>`** | **是**（完全遵循 `nsswitch.conf`） | **最真实地模拟 `curl`/C++ 程序最终拿到的 IP** |
| **`dig <域名>`** | **否**（直接绕过 `/etc/hosts` 问 DNS！） | 专门排查 DNS 服务器记录、TTL、CNAME 链与响应状态 |
| **`nslookup <域名>`** | **否** | 快速交互式或单次查询 DNS A/AAAA 记录 |

> [!CAUTION]
> **经典排错陷阱**：你在 `/etc/hosts` 里加了一行 `127.0.0.1 api.dev`，结果用 `dig api.dev` 发现返回的还是公网 IP，以为改 `/etc/hosts` 没生效！其实是因为 **`dig` 和 `nslookup` 专查 DNS 协议，根本不看 `/etc/hosts`**。验证本机最终解析结果请永远使用 **`getent hosts api.dev`**！

### 3. 读懂 `dig` 输出关键字段

```bash
$ dig example.com +noall +answer +comments
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 48210
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
example.com.            1842    IN      A       93.184.215.14
```

常用 `dig` 组合：
- `dig +short example.com`：只输出解析结果 IP（脚本最爱）。
- `dig @8.8.8.8 example.com`：绕过本地 `/etc/resolv.conf`，直接指定问 `8.8.8.8`（用来排查是不是本地 DNS 缓存污染或公司内网 DNS 挂了）。
- `dig example.com AAAA` / `MX` / `TXT`：指定查询 IPv6 / 邮件 / TXT 记录。
- `dig -x 93.184.215.14`：PTR 反向解析（IP 查域名）。
- **三大常见状态码**：`NOERROR`（正常，即使无该类型记录也可能为空答案）、`NXDOMAIN`（域名根本不存在）、`SERVFAIL`（上游 DNS 自身出错或 DNSSEC 校验失败）。

---

## 五、HTTP 命令行测试：`curl` 与 `wget`（LNX-37）

写后端 API 和健康检查脚本时，`curl` 是绝对主力。

### 1. `curl` 必备参数表

| 参数 | 作用 | 典型示例 |
| --- | --- | --- |
| **`-v`** | 打印完整全过程（DNS、TCP、TLS 握手、请求头、响应头） | `curl -v https://example.com` |
| **`-I`** | 发送 `HEAD` 请求，只看响应头不下载正文 | `curl -I https://example.com` |
| **`-i`** | 同时输出响应头和响应正文 | `curl -i http://127.0.0.1:8080/health` |
| **`-X`** | 指定 HTTP 方法（`GET`/`POST`/`PUT`/`DELETE`） | `curl -X DELETE http://127.0.0.1:8080/items/3` |
| **`-H`** | 添加自定义请求头（可多次使用） | `curl -H "Authorization: Bearer tok" ...` |
| **`-d`** | 发送请求体（默认会切为 `POST`；大文件用 `--data-binary @data.json`） | `curl -X POST -H "Content-Type: application/json" -d '{"msg":"hi"}' http://127.0.0.1:8080/log` |
| **`-L`** | 自动跟随 `301`/`302` 重定向 | `curl -L http://example.com` |
| **`-f` (`--fail`)** | **脚本必加**：默认 `curl` 遇到 `404`/`500` 依然返回退出码 `0`！加 `-f` 后 HTTP >= 400 会返回非零退出码 `22` | `curl -fsS http://127.0.0.1:8080/health` |
| **`-sS`** | `-s` 静默隐藏进度条，`-S` 保证出错时依然打印错误信息 | `curl -sS ...` |
| **`--connect-timeout` / `--max-time`** | **脚本保命参数**：限制建连超时与总超时（秒），防止网络卡死挂住整个 CI/脚本 | `curl --connect-timeout 3 --max-time 10 ...` |
| **`--resolve`** | **不改 `/etc/hosts` 测试指定节点**：强行把域名解析到某 IP（保留 TLS SNI 和 `Host` 头） | `curl --resolve api.test:443:127.0.0.1 https://api.test/ping` |
| **`-o /dev/null -w ...`** | 丢弃响应体，只格式化打印状态码与各阶段耗时 | `curl -s -o /dev/null -w "code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" https://example.com` |

### 2. `curl` 常用退出码对照

| 退出码 | 含义 | 根因方向 |
| :---: | --- | --- |
| `0` | 传输成功 | 注意：未加 `-f` 时，HTTP `500` 也返回 `0`！ |
| `6` | 无法解析主机名（Could not resolve host） | 检查拼写、`getent`、`/etc/resolv.conf` |
| `7` | 连接主机失败（Failed to connect） | 目标拒绝连接（`ECONNREFUSED`，服务没起或端口错） |
| `22` | HTTP 页面返回错误（>= 400） | 仅在带 `-f`/`--fail` 时返回 |
| `28` | 操作超时（Operation timed out） | 超过 `--connect-timeout` 或 `--max-time`（常见于防火墙丢包或后端死锁） |
| `60` | SSL/TLS 证书校验失败 | 证书过期、自签名证书未信任、或系统时间不对 |

### 3. `wget` 简洁下载利器

`wget` 专精于文件下载与断点续传：
- `wget -O app.tar.gz https://example.com/release.tar.gz`：指定保存文件名。
- `wget -c https://example.com/big.iso`：断点续传（`Continue`）。
- `wget -qO- https://example.com/install.sh`：静默输出到标准输出（不落盘）。

---

## 六、抓包基础：`tcpdump` 看懂 SYN/ACK/FIN（LNX-38）

当业务日志模棱两可——服务端说“我没收到请求”，客户端说“我发过去了然后超时”——**抓包是唯一不会撒谎的裁判**。

### 1. `tcpdump` 核心参数与 BPF 过滤表达式

```bash
# 经典本机回环排错命令（捕获 lo 上 8080 端口，不解析域名/端口名，打印 Hex+ASCII 载荷）
sudo tcpdump -i lo port 8080 -nn -X
```

| 参数 | 作用 | 说明 |
| --- | --- | --- |
| `-i lo` / `-i eth0` / `-i any` | 指定抓包网卡 | 测本机进程间通信必须用 `-i lo` 或 `-i any`！ |
| `-nn` | **必加**：不把 IP 反解成域名，也不把端口号转成服务名（如 `8080` 不转 `http-alt`） | 又快又清晰 |
| `-X` / `-A` | 打印数据包载荷：`Hex + ASCII` / 仅 `ASCII` | 看明文 HTTP/Redis/自定义文本协议 |
| `-c 50` | 抓满 50 个包自动退出 | 防止高并发服务器上刷屏打死终端 |
| `-w out.pcap` / `-r out.pcap` | 原始包存盘 / 离线回放 | 线上先 `-w` 存文件，拖回本地用 Wireshark 图形化分析 |
| `-S` | 打印绝对序列号（默认第一包后打印相对序列号 `1, 2...` 反而更好读） | — |

BPF 过滤语法可按逻辑自由组合（`and` / `or` / `not`）：
- `host 10.0.0.5 and tcp port 9090`
- `portrange 8000-8090`
- 只抓握手/挥手/复位控制包：`sudo tcpdump -i any -nn 'tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0 and port 8080'`

### 2. 逐行读懂三次握手、数据传输与四次挥手输出

下面是一次真实的本机 HTTP 请求抓包片段（已简化时间戳）：

```text
10:01:00.001 IP 127.0.0.1.51422 > 127.0.0.1.8080: Flags [S], seq 3100, win 65495, length 0
10:01:00.001 IP 127.0.0.1.8080 > 127.0.0.1.51422: Flags [S.], seq 9200, ack 3101, win 65495, length 0
10:01:00.001 IP 127.0.0.1.51422 > 127.0.0.1.8080: Flags [.], ack 1, win 512, length 0
10:01:00.002 IP 127.0.0.1.51422 > 127.0.0.1.8080: Flags [P.], seq 1:78, ack 1, win 512, length 77: HTTP: GET /health HTTP/1.1
10:01:00.003 IP 127.0.0.1.8080 > 127.0.0.1.51422: Flags [P.], seq 1:115, ack 78, win 512, length 114: HTTP: HTTP/1.1 200 OK
10:01:00.003 IP 127.0.0.1.51422 > 127.0.0.1.8080: Flags [F.], seq 78, ack 115, win 512, length 0
10:01:00.003 IP 127.0.0.1.8080 > 127.0.0.1.51422: Flags [F.], seq 115, ack 79, win 512, length 0
10:01:00.003 IP 127.0.0.1.51422 > 127.0.0.1.8080: Flags [.], ack 116, win 512, length 0
```

认准 **`Flags [...]`** 里的字母组合：
- **`[S]`**：**SYN**（客户端发起连接请求，携带初始序列号 `seq 3100`）。
- **`[S.]`**：**SYN + ACK**（`tcpdump` 用英文句号 `.` 表示 `ACK` 标志！服务端同意建连，确认号 `ack 3101`）。
- **`[.]`**：纯 **ACK**（确认收到）。
- **`[P.]`**：**PSH + ACK**（真正携带应用层载荷的数据包，注意末尾 `length 77` 和 `length 114`）。
- **`[F.]`**：**FIN + ACK**（正常发起关闭半连接）。
- **`[R]` / `[R.]`**：**RST（复位）**！抓到 `[R]` 说明对端端口根本没人监听（`ECONNREFUSED`），或者某一方强制异常断开了连接。
- 如果只有客户端连续发出 `[S]` 却**没有任何回包**（`1s, 2s, 4s...` 重传），说明包在路上被防火墙静默 `DROP` 掉了，或路由不可达！

---

## 七、SSH 密钥、配置与端口转发隧道（LNX-39）

### 1. SSH 密钥生成、分发与致命权限铁律

相比每次输入密码（且容易被暴力破解），工程里一律使用 **Ed25519 非对称密钥**登录：

```bash
# 1. 生成高强度、短小且快的 Ed25519 密钥对（默认保存在 ~/.ssh/id_ed25519 与 .pub）
ssh-keygen -t ed25519 -C "alice@workstation"

# 2. 一键把公钥追加到目标服务器的 ~/.ssh/authorized_keys 中
ssh-copy-id -i ~/.ssh/id_ed25519.pub alice@192.168.1.50
```

**为什么首次连接会弹出 `Are you sure you want to continue connecting (yes/no)`？**
SSH 采用 TOFU（首次信任）机制：它会把服务器发来的公钥指纹记录在本地 **`~/.ssh/known_hosts`**。如果以后服务器重装系统换了密钥，SSH 会弹出刺眼的 `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!` 拦截登录以防中间人攻击；确认是重装而非劫持后，用 `ssh-keygen -R <host>` 删除旧指纹即可。

> [!CAUTION]
> **SSH 密钥死活不生效？90% 是文件权限太宽被 SSH 拒绝了！**
> OpenSSH 处于安全铁律，只要发现私钥或目录可能被其他用户偷看/篡改，会直接报错 `UNPROTECTED PRIVATE KEY FILE!` 或默默回退到密码登录。必须保证：
> - 本机私钥：`chmod 600 ~/.ssh/id_ed25519`
> - 本机与远端 `.ssh` 目录：`chmod 700 ~/.ssh`
> - 远端授权公钥文件：`chmod 600 ~/.ssh/authorized_keys`
> - 远端家目录本身不能对同组或他人可写（如 `chmod 755 ~` 或 `700 ~`）。

### 2. `~/.ssh/config` 简化登录与跳板机

每次敲 `ssh -i ~/.ssh/prod_key -p 2222 deploy@10.20.30.40` 太折磨了。把配置写进本机 `~/.ssh/config`（权限需 `600`）：

```text
# 先配跳板机
Host bastion
    HostName 203.0.113.10
    User ops
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60

# 再配内网目标机（自动通过 bastion 跳转！）
Host prod-db
    HostName 10.0.1.25
    User deploy
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519
```
配置完之后，终端直接敲 **`ssh prod-db`** 即可一步直达内网机器！

### 3. SSH 本地端口转发隧道（`-L`）

假设远程服务器 `prod-db` 上跑着一个只监听在 `127.0.0.1:5432` 的 PostgreSQL 数据库（出于安全不对外网开放 5432 端口）。你如何在本地电脑安全连接它？用 **`ssh -L`**：

```text
本地客户端 ──▶ 本机 127.0.0.1:15432 ══[ SSH 加密隧道 ]══▶ prod-db 视角访问 127.0.0.1:5432
```

```bash
# -N 不打开远程交互 Shell，只维持端口转发隧道
ssh -N -L 15432:127.0.0.1:5432 prod-db
```
这条命令的语法口诀是：**`-L 本地端口:远端视角的目标IP:远端目标端口 跳板或目标SSH主机`**。随后你在本机连接 `127.0.0.1:15432`，所有流量都会通过 SSH 加密隧道安全送到远端数据库的 `5432` 端口！

*(补充：`-R` 是反向转发，把远端端口映射回你本地测试服务；`-D 1080` 是开一个本地 SOCKS5 动态代理。)*

---

## 八、远程文件传输与防火墙模型（LNX-40）

### 1. `scp`、`sftp` 与 `rsync` 对比

| 工具 | 特点与最佳适用场景 | 经典命令示例 |
| --- | --- | --- |
| **`scp`** | 简单一次性整文件/目录拷贝（注意端口参数是大写 **`-P`**！） | `scp -P 2222 -r ./build/ prod-db:/opt/app/` |
| **`sftp`** | 交互式加密文件管理（支持 `ls`, `cd`, `lcd`, `get`, `put`） | `sftp prod-db` |
| **`rsync`** | **工程首选增量同步**：只传有差异的文件块，支持保留权限符号链接与镜像删除 | `rsync -avz --progress src/ prod-db:/opt/src/` |

### 2. 吃透 `rsync` 的两个核心细节（`-avz --progress --delete` 与尾部 `/`）

- `-a`（archive 归档模式，等价 `-rlptgoD`）：递归同步，并保留符号链接、权限、修改时间、所属组与所有者。
- `-v`（verbose）：打印传输文件名。
- `-z`（compress）：传输过程压缩文本/日志数据省带宽。
- `--progress`：实时显示单文件进度条和传输速率。
- `--delete`：**镜像同步**——把目标目录里有、但源目录里已经删掉的文件也一并删除！
- **`--dry-run`（`-n`）**：**使用 `--delete` 前务必先加 `-n` 试跑一次**，确认列表里没有误删重要文件再去掉 `-n`！

> [!IMPORTANT]
> **`rsync` 致命的尾部斜杠 `/` 差异！**
> - `rsync -avz dirA/ prod-db:/tmp/dest/`：末尾**有 `/`**，只把 `dirA` **里面的内容**同步进 `/tmp/dest/`。
> - `rsync -avz dirA prod-db:/tmp/dest/`：末尾**没有 `/`**，会把 **`dirA` 整个目录本身**放到 `/tmp/dest/dirA/` 下面！

### 3. 防火墙模型：`ufw` 与 `iptables`

Linux 防火墙的黄金安全模型永远是：**默认拒绝所有入站（Default Deny Incoming） + 允许已建立连接的回包（Stateful `ESTABLISHED,RELATED`） + 白名单放行明确需要的端口**。

#### 新手友好的 `ufw`（Ubuntu/Debian 默认前端）

```bash
sudo ufw default deny incoming     # 默认禁止一切外部主动连入
sudo ufw default allow outgoing    # 默认允许本机主动访问外网

# ⚠️ 致命顺序：在开启 ufw 前，必须先放行 SSH 端口，否则立刻把自己锁在服务器外！
sudo ufw allow 22/tcp
sudo ufw allow 8080/tcp
sudo ufw allow from 10.0.0.0/24 to any port 5432   # 仅允许内网网段连 5432

sudo ufw enable                    # 激活防火墙
sudo ufw status numbered           # 带编号查看规则（删规则用 sudo ufw delete <编号>）
```

#### 底层引擎视角：`iptables`（及现代 `nftables`）

`ufw` 底层其实就是在帮你写内核 Netfilter 规则（传统接口 `iptables`，现代逐步过渡到 `nftables`）。理解 `iptables` 只需记住**表（Table）-> 链（Chain）-> 规则（Rule）-> 动作（Target）**：
- `INPUT` 链：目标地址是本机的入站包；`OUTPUT` 链：本机发出的出站包；`FORWARD` 链：经过本机转发的包（如路由器/Docker 容器网桥）。
- **`ACCEPT` vs `DROP` vs `REJECT`**：
  - `ACCEPT`：放行。
  - `DROP`：**静默丢弃**，不回任何消息——客户端只能干等到超时（常用于公网防扫描）。
  - `REJECT`：明确拒绝并回送 ICMP 不可达或 TCP `RST`——客户端毫秒级收到失败（常用于内网快速失败排错）。

```bash
# 仅查看当前 filter 表入站规则（加 -n 跳过 DNS 解析，-v 看命中包数）
sudo iptables -L INPUT -n -v --line-numbers
```

---

## 本课网络排错决策矩阵

| 现象 | 第一嫌疑 | 排查组合拳 |
| --- | --- | --- |
| `Connection refused` (`curl` 退出码 `7`) | 服务没启、端口写错、或只绑了 `127.0.0.1` | `sudo ss -tulpn \| grep <端口>` 看监听地址；本机先 `curl 127.0.0.1:<端口>` |
| `Connection timed out` (`curl` 退出码 `28`) | 防火墙 `DROP`、路由不通或服务卡死 | `ip route get <目标IP>` -> `sudo ufw status` -> `sudo tcpdump -i any port <端口> -nn` 看有没有回包 |
| 本机通、另一台机器连不上 | 服务绑在 `127.0.0.1`，或云安全组/`ufw` 未放行 | `ss -tulpn` 核对是否为 `0.0.0.0:<端口>`；`sudo ufw status`；`tcpdump` 看包是否到达宿主机网卡 |
| 域名解析结果和预期不符 | `/etc/hosts` 与 DNS 冲突或缓存 | `getent hosts <域名>` 对照 `dig <域名>` 与 `/etc/hosts` |
| SSH 密钥登录依然要求输密码 | 私钥或 `.ssh` / `authorized_keys` 权限太宽 | `ssh -vvv user@host` 看调试日志；检查 `700`/`600` 权限 |

---

## 6 个梯度微练习

### 练习 1（`127.0.0.1` vs `0.0.0.0` 与 `CLOSE-WAIT`）
你在服务器 `10.0.1.20` 上执行 `sudo ss -tanp`，看到如下输出：
```text
State      Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN     0      128    127.0.0.1:8080      0.0.0.0:*         users:(("api_srv",pid=410,fd=3))
CLOSE-WAIT 1      0      10.0.1.20:8080      10.0.1.99:54102   users:(("old_srv",pid=380,fd=19))
```
1. 同网段的机器 `10.0.1.99` 此时能否连上 `10.0.1.20:8080` 上的 `api_srv`？为什么？
2. 第二行 `old_srv` 出现大量 `CLOSE-WAIT` 是谁的代码出了问题？

<details>
<summary>核对答案</summary>

1. **不能**。`api_srv` 的 `Local Address:Port` 是 `127.0.0.1:8080`，只绑定了软件回环接口 `lo`，不接收从物理网卡 `eth0` (`10.0.1.20`) 进来的外部流量。需将服务端监听地址改为 `0.0.0.0:8080`（或 `::`）。
2. **`old_srv` 本端服务端代码出了问题**。`CLOSE-WAIT` 表示对端 `10.0.1.99` 已经主动发送 `FIN` 关闭连接，内核通知了 `old_srv`（`read` 会返回 `0`），但 `old_srv` 忘记调用 `close(fd)` 释放套接字，导致 FD 泄露。

</details>

### 练习 2（`dig` 与 `getent` 的差异）
开发测试时你在 `/etc/hosts` 里写入 `127.0.0.1 pay.local.test`，保存后立刻在终端执行 `dig pay.local.test +short`，结果返回 `NXDOMAIN`（找不到）。你怀疑 `/etc/hosts` 格式写错了，这判断对吗？应该用哪条命令验证真实解析？

<details>
<summary>核对答案</summary>

判断**不对**。`dig` 和 `nslookup` 是纯粹的 DNS 协议查询工具，直接向 `/etc/resolv.conf` 里的 DNS 服务器发请求，**完全不读取 `/etc/hosts`**。要验证遵循 `/etc/nsswitch.conf`（`files dns`）的真实解析结果，应运行 **`getent hosts pay.local.test`**，此时就会正确返回 `127.0.0.1`。

</details>

### 练习 3（解读 `tcpdump` 异常片段）
你在排错时抓包看到客户端与服务端之间只有如下往来：
```text
12:00:01.100 IP 10.0.0.2.49100 > 10.0.0.8.9090: Flags [S], seq 1000, win 64240, length 0
12:00:01.101 IP 10.0.0.8.9090 > 10.0.0.2.49100: Flags [R.], seq 0, ack 1001, win 0, length 0
```
再换一个端口 `9091` 抓包，只看到：
```text
12:05:00.000 IP 10.0.0.2.49200 > 10.0.0.8.9091: Flags [S], seq 2000, win 64240, length 0
12:05:01.020 IP 10.0.0.2.49200 > 10.0.0.8.9091: Flags [S], seq 2000, win 64240, length 0
12:05:03.040 IP 10.0.0.2.49200 > 10.0.0.8.9091: Flags [S], seq 2000, win 64240, length 0
```
分别说明 `9090` 和 `9091` 发生了什么故障？

<details>
<summary>核对答案</summary>

- **端口 `9090`**：服务端明确回了一个 **`[R.]`（RST-ACK）** 包，说明网络链路完全可达、包到达了 `10.0.0.8` 的内核，但 **`9090` 端口没有进程在监听**（或被防火墙以 `REJECT` 策略拒绝），客户端立即收到 `ECONNREFUSED`。
- **端口 `9091`**：客户端每隔 `1s, 2s` 不断重传 `[S]` 却**收不到任何回包**，这是典型的防火墙 **`DROP`（静默丢包）** 或中间路由黑洞现象，客户端最终会在超时后报错 `ETIMEDOUT`。

</details>

### 练习 4（`curl` 脚本健壮性与 SSH 隧道）
1. 为什么在自动化健康检查脚本里写 `curl -s http://127.0.0.1:8080/health || echo "DOWN"` 是危险的（即使接口返回 `500 Internal Server Error` 也不会打印 `DOWN`）？该怎么修正？
2. 某远程跳板机 `bastion` 后有一台内网数据库 `10.0.2.88:3306`，如何用一条 `ssh -L` 命令让你在本机访问 `127.0.0.1:13306` 就等同于连到那台内网数据库？

<details>
<summary>核对答案</summary>

1. `curl` 默认只要收到 HTTP 响应（哪怕是 `404` 或 `500`），退出码依然是 `0`；且不设超时可能在服务端假死时永久卡住脚本。正确写法必须加上 **`-f`（或 `--fail`）和超时参数**：
   ```bash
   curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/health > /dev/null || echo "DOWN"
   ```
2. 执行 `ssh -N -L 13306:10.0.2.88:3306 user@bastion`（前段 `13306` 是本机监听端口，中间 `10.0.2.88:3306` 是从 `bastion` 视角出发的目的地）。

</details>

### 练习 5（`rsync` 斜杠与防火墙锁死预防）
1. 你要把本地 `./dist/` 里的静态文件同步并镜像到远程 `/var/www/site/`，下面两条命令哪条会把 `/var/www/site/dist/` 多套一层目录？使用 `--delete` 前应该加哪个参数先检查？
   - A: `rsync -avz --delete ./dist/ prod:/var/www/site/`
   - B: `rsync -avz --delete ./dist prod:/var/www/site/`
2. 在一台新买的云服务器上配置 `ufw`，如果你直接先敲了 `sudo ufw default deny incoming && sudo ufw enable`，会发生什么灾难？

<details>
<summary>核对答案</summary>

1. **B 会多套一层 `/var/www/site/dist/`**（因为源路径 `./dist` 末尾没有斜杠 `/`）；A 才是将 `./dist` 内部内容直接镜像进 `/var/www/site/`。使用 `--delete` 前务必先加 **`--dry-run`（或 `-n`）** 演练核对输出列表。
2. 你自己的当前 SSH 会话或后续重连 SSH（22 端口）会被防火墙拦截导致**直接失联锁死在服务器外**！必须先执行 `sudo ufw allow 22/tcp`（若改过 SSH 端口则放行对应端口），确认放行规则后再 `sudo ufw enable`。

</details>

### 练习 6（动手实操：回环监听与 `tcpdump` / `curl` 联调）
在 WSL2 或 Linux 终端中，用 Python 一行命令临时起一个本机 HTTP 测试服务，完成下面三步实操：
1. 在终端 A 运行 `python3 -m http.server 18080 --bind 127.0.0.1`；
2. 在终端 B 分别用 `ss -tlnp | grep 18080` 查看监听队列，再用 `curl -v http://127.0.0.1:18080/` 观察完整 HTTP 握手与响应头；
3. （可选，需 `sudo`）开终端 C 运行 `sudo tcpdump -i lo port 18080 -nn -c 12`，观察终端 B 再请求一次时输出的 `Flags [S]`、`[S.]`、`[P.]` 和 `[F.]`。

<details>
<summary>实操参考要点</summary>

- `ss -tlnp | grep 18080` 会看到 `127.0.0.1:18080` 处于 `LISTEN` 状态，进程为 `python3`。
- `curl -v` 中以 `*` 开头的是建连调试信息，以 `>` 开头的是发出的 HTTP 请求头，以 `<` 开头的是服务端返回的 `HTTP/1.0 200 OK` 等响应头。实操完记得按 `Ctrl+C` 关掉测试服务器。

</details>
