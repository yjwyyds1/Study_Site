---
title: "I/O 系统、文件系统、页缓存、零拷贝与 Linux 容器底层原理"
description: "从轮询/中断/DMA 与 VFS 抽象出发，贯通 fd/打开文件描述/inode 三层模型、dentry 与硬软链接、ext4 inode/Extent、崩溃一致性 WAL 日志、CoW 文件系统与 SSD FTL、Page Cache 与 fsync/O_DIRECT、blk-mq 调度、零拷贝 sendfile/splice、epoll vs io_uring 及 Linux Namespaces/Cgroups 容器内核本质。"
order: 74
category: "操作系统"
tags: ["操作系统", "VFS", "inode", "日志文件系统", "PageCache", "零拷贝", "io_uring", "容器原理"]
related: ["handbook/os-process-vmem", "handbook/linux-process-io", "handbook/storage-sqlite", "handbook/network-tcp"]
sources: []
---

## 本篇解决的核心问题 (OS-39 ~ OS-50)

写完代码调用 `write()` 立刻返回成功了，拔掉电源文件怎么还是空的？为什么改了文件名 `mv app.log app.log.1`，正在跑的程序依然能从旧 `fd` 里读出日志？为什么百万并发服务器要用 `sendfile` 和 `io_uring`？大家常说的 Docker 容器，在内核眼里到底是个什么东西？

本篇覆盖 **`OS-39` 至 `OS-50`**，完成操作系统三大支柱的最后一块拼图——**I/O 硬件交互、持久化文件系统与容器隔离机制**。

---

## 一、I/O 设备交互：轮询、硬件中断与 DMA (OS-39)

CPU 的运算速度是纳秒级（`~0.3 ns`/周期），而磁盘或网络 I/O 是微秒甚至毫秒级。CPU 怎样与慢速外设打交道？演化出三代方式：

| 交互方式 | 生活比喻 | 工作原理 | 适用场景与痛点 |
| --- | --- | --- | --- |
| **轮询（Polling / PIO）** | **一直死盯着烧水壶看开没开** | CPU 死循环不断读外设 `STATUS` 寄存器，直到 `READY == 1` | 延迟最低但空烧 100% CPU；仅适合超高速微秒内完成设备或万兆网卡高负载下的 **NAPI 混合轮询** |
| **中断（Interrupt / IRQ）** | **水壶装哨子，响了再回来关火** | CPU 发完命令就切去跑别的进程；外设做完后拉高 IRQ 引脚发硬件中断通知 CPU | 释放了 CPU 算力；但如果每秒来 100 万个网卡小包，**中断风暴**会让 CPU 疲于进出中断处理程序 |
| **DMA（直接内存访问）** | **雇搬运工把整箱水直接搬进仓库** | CPU 只给 DMA 控制器下达“源设备、目标物理内存地址、长度”；DMA 独自搬运整块数据，全部搬完才发 **1 次中断** | **大块磁盘/网卡传输核心！** 彻底解放 CPU，避免让宝贵的 CPU 核心逐字节搬砖 |

```text
  [1. CPU 下达 DMA 任务] ──(MMIO 写控制寄存器: 目标 RAM 物理地址 + 4KB)──▶ [DMA 控制器]
  [2. CPU 去跑其他进程!]                                                       │ (不经过 CPU!)
                                                                                ▼
  [4. 收到 1 次 IRQ 中断, 唤醒等待进程] ◀──(仅全部搬完发一次通知!)── [外设数据直写内存条 DRAM]
```

---

## 二、块设备、字符设备与 VFS（虚拟文件系统）抽象 (OS-40)

市面上的存储与外设五花八门：HDD、NVMe SSD、USB 串口、`/dev/urandom`、ext4、XFS、Btrfs、procfs……操作系统如何做到让开发者用统一的 `open()`、`read()`、`write()` 通吃一切？

1. **块设备（Block Device）vs 字符设备（Character Device）**：
   - **块设备**（`/dev/nvme0n1`、`/dev/sda`）：必须以固定扇区/块（512B 或 4KB）为单位**随机寻址读写**，内核通常为其开启**页缓存（Page Cache）**。
   - **字符设备**（`/dev/tty`、`/dev/null`、`/dev/urandom`）：按顺序吐出或吞入**无边界字节流**，一般不支持随机 `lseek` 跳跃。
2. **VFS（Virtual File System，虚拟文件系统）**：
   Linux 用 C 语言结构体里的函数指针表（相当于面向对象里的“纯虚接口”）在内核搭起一层统一抽象：

```text
  用户态 syscall:   open()       read()       write()       close()
                      │            │            │             │
                      ▼            ▼            ▼             ▼
  ╔═══════════════════════════════════════════════════════════════╗
  ║   VFS 统一对象接口: super_block · inode · dentry · file        ║
  ║   (file->f_op->read_iter 虚表分发！)                           ║
  ╠══════════════╦═══════════════╦═══════════════╦════════════════╣
  ║   ext4 驱动  ║   XFS 驱动    ║  Btrfs 驱动   ║  procfs/tmpfs  ║
  ╚══════════════╩═══════════════╩═══════════════╩════════════════╝
```

只要某套文件系统或伪文件系统实现了 VFS 规定的 `file_operations` 与 `inode_operations`，就能瞬间无缝接入 Linux 的所有系统调用！

---

## 三、文件描述符三层模型：每进程 fd 表 → 打开文件描述 → inode (OS-41)

把一个整型 `int fd = 3` 彻底追到底，内核里其实连着**三张表**：

```text
  1. 每进程 fd 表 (FD Table)      2. 系统级打开文件描述 (struct file)       3. 系统级 inode 表
  ┌─────────────────────┐        ┌───────────────────────────────────┐     ┌───────────────┐
  │ fd 3 ───────────────┼───────▶│ 描述 A: offset=1, flags=O_RDONLY  ┼────▶│               │
  │ fd 4 (dup/fork继承) ─┼───────┘  (共享同一个读写位置 offset!)      │     │ inode #402    │
  ├─────────────────────┤        ┌───────────────────────────────────┤     │ 内容: "ABC"   │
  │ fd 5 (独立再 open)  ─┼───────▶│ 描述 B: offset=0, flags=O_RDONLY  ┼────▶│               │
  └─────────────────────┘        └───────────────────────────────────┘     └───────────────┘
```

- **每次成功的 `open()`** 都会新建一条**打开文件描述（`struct file`）**，里面记录独立的**当前读写偏移量 `offset`** 和打开标志。
- **`dup()` / `dup2()` / `fork()` 继承**只复制指针指向**同一条**打开文件描述——因此多个 fd 会**互相推动同一个 `offset`**！这也是为什么如果父子进程或线程对同一文件各自顺序写而不加锁或 `O_APPEND`，不会写乱或互相覆盖的底层原因。
- **`FD_CLOEXEC`（`O_CLOEXEC`）**：标记该 fd 在随后执行 `execve()` 替换新程序时由内核自动关闭，防止文件句柄意外泄露给子进程。

### 可运行 POSIX/C++20 实验：验证 `dup` 共享偏移 vs 二次 `open` 独立偏移

```cpp
// Linux / WSL2 编译: g++ -std=c++20 fd_3layer.cpp -o fd_3layer
#include <fcntl.h>
#include <iostream>
#include <unistd.h>

int main() {
    const char* path = "/tmp/os41_abc.txt";
    int wfd = ::open(path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    ::write(wfd, "ABC", 3);
    ::close(wfd);

    int fd1 = ::open(path, O_RDONLY); // 新建描述 A (offset=0)
    int fd2 = ::dup(fd1);             // 复用描述 A！
    int fd3 = ::open(path, O_RDONLY); // 新建描述 B (offset=0)

    char c1{}, c2{}, c3{};
    ::read(fd1, &c1, 1); // 读到 'A', 描述 A offset -> 1
    ::read(fd2, &c2, 1); // 接着描述 A offset=1 读到 'B'！
    ::read(fd3, &c3, 1); // 从描述 B 自己 offset=0 读到 'A'！

    std::cout << "fd1=" << c1 << ", fd2(dup)=" << c2 << ", fd3(re-open)=" << c3 << '\n';
    ::close(fd1); ::close(fd2); ::close(fd3);
    ::unlink(path);
    return 0;
}
```

---

## 四、目录、硬链接、软链接与 `dentry` 缓存 (OS-42)

在 UNIX/Linux 里，**“文件名”和“文件本体”是彻底分离的**：文件名仅仅是目录文件里的一条 `(文件名 → inode 编号)` 映射记录（Directory Entry，简称 `dentry`）。

```text
  目录内容 (Directory Data)          inode 元数据实体              磁盘数据块
  ┌────────────────────────┐        ┌────────────────────────┐    ┌───────────────┐
  │ "app.log"  ──▶ ino=402 │ ─────▶ │ inode #402             │ ─▶ │ "INFO ok\n"   │
  │ "app.hard" ──▶ ino=402 │ ──┘    │ nlink=2, size=8, mode  │    └───────────────┘
  └────────────────────────┘        └────────────────────────┘
  ┌────────────────────────┐        ┌────────────────────────┐
  │ "app.sym"  ──▶ ino=519 │ ─────▶ │ inode #519 (Symlink)   │ ──内部只存字符串 "app.log"
  └────────────────────────┘        └────────────────────────┘
```

- **硬链接（`ln app.log app.hard`）**：给同一个 `inode #402` 再起一个门牌别名，`nlink` 计数变为 `2`。删掉 `app.log` 只相当于摘下一块门牌（`nlink` 减为 `1`），文件数据毫发无损（注意：硬链接不能跨分区，也不允许普通用户对目录建硬链接以防目录树成环）。
- **符号链接 / 软链接（`ln -s app.log app.sym`）**：是一个独立的特殊文件（`inode #519`），里面仅保存目标路径文本。一旦 `app.log` 被删或改名，软链接瞬间变成**悬空死链（`ENOENT`）**。
- **为什么日志文件改名甚至 `unlink` 删除后，已经打开它的程序还能继续读？**  
  因为 `open()` 成功时内核早已把打开文件描述绑定到了 **`inode` 对象**而非路径字符串！只有当 **`nlink == 0`（所有目录硬链接全删）且 `i_count == 0`（所有打开它的进程全部 `close(fd)`）** 两个条件同时成立时，内核才会真正回收磁盘数据块。（这就是线上删掉几十 GB 大日志却发现 `df -h` 空间没释放的经典原因：进程还握着 fd 没关！）。
- **`dentry` 缓存（`dcache`）**：为了避免每次 `open("/usr/local/bin/g++")` 都去磁盘慢吞吞解析四级目录，内核在内存维护了哈希表 `dcache`（甚至包含“某路径不存在”的 **Negative Dentry 负缓存**）加速路径查找。

---

## 五、经典文件系统布局：ext4 / UNIX inode 结构与 Extent (OS-43)

把一整块硬盘分区格式化成 ext4 时，磁盘被规整地切分成多个**块组（Block Group）**：

```text
  [Boot] [ Block Group 0: Superblock | Group Desc | Data Bitmap | Inode Bitmap | Inode Table | Data Blocks ] [ Group 1 ... ]
```

在每个 `inode` 里，怎么记录“第 $k$ 个逻辑文件块对应磁盘上哪个物理块号”？

1. **经典 UNIX 多级指针索引**（ext2/ext3）：
   - **12 个直接指针（Direct Blocks）**：直接指向前 12 个 4KB 数据块（覆盖 `48 KB` 以内的小文件，一次磁盘寻址即可！）。
   - **1 个一级间接块**（4KB 块可存 $1024$ 个 4B 块号 → 覆盖 `4 MB`）。
   - **1 个二级间接块**（$1024^2$ 个块 → 覆盖 `4 GB`）。
   - **1 个三级间接块**（$1024^3$ 个块 → 覆盖 `4 TB`）。
   - **短板**：大文件（如 10GB 视频）如果存连续磁盘块，经典索引依然要记录几百万个散碎块号，元数据膨胀且查找跳数多！
2. **现代 ext4 / XFS 的 Extent 树**：
   改用区间段描述符 **`Extent = (逻辑起始块, 连续块长度, 物理起始块)`**！哪怕一个 100MB 连续文件，只需要 **1 条短短的 12 字节 Extent** 就能全部描述完毕，极大压缩元数据并大幅提速顺序读写。

---

## 六、崩溃一致性：`fsck` 扫描与日志文件系统（Journaling / WAL） (OS-44)

往文件追加写入一个新 4KB 数据块时，文件系统必须在磁盘上修改 **3 个不同位置**：① `Data Bitmap` 标记新块已占用、② 更新 `inode` 的大小与块指针、③ 写入实际 `Data Block`。

如果在只写完 ① 和 ②、还没写 ③ 时**突然拔掉电源**，磁盘就会陷入灾难性的**不一致状态**：`inode` 指向了一个还没写数据的垃圾旧磁盘块（泄密隐私或文件损坏）！

- **古老解法：`fsck`（File System Checker）**：重启后全盘扫描所有 bitmap 和 inode 修复对齐。但在几十 TB 的大容量磁盘上，开机 `fsck` 动辄要扫**好几个小时**！
- **现代解法：预写式日志（Journaling / WAL，如 ext4 / XFS）**：借鉴数据库事务！修改真正原位数据前，先把这批变更记录打包写进磁盘一块专门的循环日志区（Journal）：

```text
  WAL 提交两阶段:
    1. [Journal Write]  写事务开始标记 TxB + 待修改元数据(或数据)到日志区
    2. [Journal Commit] 全部写落盘后写入 TxE 提交标记 (磁盘保证 TxE 原子落盘)
    3. [Checkpoint]     事后从容把变更写回磁盘真正的 inode / bitmap 位置
    若 Checkpoint 途中突然断电？开机只需重放最近几秒内已写 TxE 的日志 (毫秒级恢复！)
```

| ext4 日志模式 | 数据块写入时机 | 性能 | 崩溃安全性 |
| --- | --- | :---: | --- |
| **`data=journal`** | 元数据与用户数据**双倍写入**日志区 | 最慢（2x 写放大） | 最高（数据和元数据绝对一致） |
| **`data=ordered`（ext4 默认）** | **先写用户数据块到正式位置**，再写元数据进日志并提交 | 较高 | 极佳（绝不会出现指向垃圾数据的幽灵指针） |
| **`data=writeback`** | 只记元数据日志，数据块顺序随意 | 最高 | 最低（断电后新追加文件尾可能留存别人删过的旧数据碎片） |

---

## 七、写时复制文件系统（Btrfs / ZFS）与 SSD 闪存转换层 FTL (OS-45)

除了 WAL 原地更新覆盖，还有一类更彻底的现代文件系统——**Copy-on-Write 文件系统（如 Btrfs、ZFS、Apple APFS）**：

- **永不原地覆盖旧数据块！** 修改文件第 5 块时，把新内容写到一个全新空闲块 `B_new`，然后顺着 B 树一路往上写新父节点，最后在磁盘超级块（Uberblock）里执行**一次原子的根指针切换**！
- **惊人红利**：① **秒级零拷贝快照**（保留旧根指针就是一份完整历史快照！）；② **端到端数据校验和**（彻底防静默位翻转）；③ 永远没有崩溃半写破坏（旧树依然完好）。

### 固态硬盘（SSD）内部到底在忙什么？`FTL` 的秘密

程序员以为 SSD 像内存一样想改哪个扇区就改哪个扇区——**完全不是！** NAND 闪存有两条极其苛刻的物理铁律：
1. **读/写按页（Page, 4KB–16KB），但擦除必须按整个大擦除块（Erase Block, 几 MB）进行，且必须“先擦除后才能写”**！
2. 每个闪存单元只能承受有限次擦写寿命（P/E Cycle）。

于是 SSD 主控芯片内置了一套微型操作系统——**FTL（Flash Translation Layer，闪存转换层）**：它对外伪装成一个普通块设备（暴露逻辑块号 `LBA`），内部却偷偷把所有覆盖写重定向到新擦好的空白闪存页上，并在后台默默执行**垃圾回收（GC，搬移有效页再擦除整块，带来写放大 WAF）**与**磨损均衡（Wear Leveling）**。如果 OS 删掉文件后能通过 **`TRIM`（`fstrim`）** 命令提前告知 FTL“这些页已经废弃不用搬移了”，就能大幅延长 SSD 寿命并避免掉速！

---

## 八、页缓存（Page Cache）、脏页回写与 `fsync` / `O_DIRECT` (OS-46)

当你在 C++ 里调用 `::write(fd, buf, 4096)` 并看到它返回 `4096` 时，数据**大概率根本没有碰到固态硬盘**！

```text
  [1. C++ 用户态缓冲区]  ── flush() / write() ──▶  [2. 内核页缓存 Page Cache (标记为 Dirty 脏页)]
    (如 std::ofstream)                                  │  • 进程崩溃 (kill -9) 不丢数据！
    (进程崩溃就会丢失!)                                  │  • 断电重启必丢！(内核仅每 ~5-30s 异步回写)
                                                         │
                                                    fsync(fd) / fdatasync(fd)
                                                         ▼
                                                    [3. 持久化磁盘介质]
                                                (原子替换文件还需 fsync 父目录!)
```

- **`fsync(fd)` vs `fdatasync(fd)`**：
  - `fsync` 强制把文件脏页 **连同** `inode` 元数据（如修改时间、大小）全部冲刷落盘。
  - `fdatasync` 只冲刷数据及找回数据必需的元数据（如 `size` 变大时的指针），**若文件大小未变（覆盖写 WAL 预分配文件），能省下一次多余元数据磁盘 I/O**，数据库极爱用它！
- **`O_DIRECT`（绕过 Page Cache）**：MySQL InnoDB、RocksDB 等数据库自己已经在用户态精心维护了 Buffer Pool，如果再经过内核 Page Cache 就会造成**双份内存缓存浪费**。加上 `O_DIRECT` 打开文件可直接由 DMA 在用户缓冲区与磁盘间搬运（要求缓冲区地址与读写长度必须按 `512B`/`4KB` 块对齐）。
- **原子安全落盘写配置五步法**：写临时文件 `cfg.tmp` → `fsync(tmp_fd)` → `close(tmp_fd)` → `rename("cfg.tmp", "cfg.json")` → **`fsync(dir_fd)`**（确保新目录项也落盘，断电绝不出现半截配置文件！）。

---

## 九、块设备 I/O 调度器：电梯算法、`mq-deadline`、BFQ 与 NVMe 多队列 (OS-47)

在机械硬盘（HDD）时代，磁头移动寻道一次动辄 **5–10 ms**，如果直接按 FIFO 乱序发请求，磁头会疯狂左右抽搐。为此 OS 设计了**电梯算法（SCAN / C-SCAN）**把相邻磁道请求合并排队按单向扫过。

但如今的 **NVMe SSD** 内部拥有几十条并行 NAND 通道，**随机读与顺序读寻道成本几乎都是零**，单条全局队列锁反而成了千万级 IOPS 的最大瓶颈！

现代 Linux 内核全面转向 **`blk-mq`（Multi-Queue Block I/O Layer，多队列块层）**：
- **Per-CPU 软件提交队列** → 映射到 **NVMe 硬件多发送/完成队列**（无全局锁竞争！）。
- **常见调度器选型**（查看 `/sys/block/<dev>/queue/scheduler`）：
  - **`none`**：NVMe SSD 最常用，几乎不做复杂重排直通硬件多队列。
  - **`mq-deadline`**：给读/写请求加上最长过期截止时间（默认读 `500ms`、写 `5s`），防止大量顺序写饿死随机读，适合 SATA SSD / HDD / 虚拟机。
  - **`bfq`（Budget Fair Queueing）**：按带宽预算公平分配，保证桌面交互或小文件访问不被后台大拷贝卡死。

---

## 十、零拷贝 I/O：`read+write` 拷贝解剖、`sendfile`、`splice` 与 `mmap` (OS-48)

假设你要写一个静态文件服务器（如 Nginx），把硬盘上的 `1 GB` 视频通过网卡 Socket 发给客户端。最朴素的 `while (read(file_fd, buf, 4096) > 0) write(sock_fd, buf, n);` 到底有多浪费？

```text
  传统 read() + write(): 【4 次用户态/内核态切换 + 4 次数据拷贝！】
    磁盘 ──(1.DMA拷贝)──▶ 内核 Page Cache ──(2.CPU拷贝)──▶ 用户态 buf[]
                                                               │
    网卡 ◀──(4.DMA拷贝)── 内核 Socket 缓冲 ◀──(3.CPU拷贝)──────┘

  零拷贝 sendfile(sock_fd, file_fd, &offset, len): 【2 次切换 + 仅 DMA 拷贝！】
    磁盘 ──(1.DMA拷贝)──▶ 内核 Page Cache ══════════════════▶ 网卡 DMA (支持 SG-DMA 时仅拷描述符!)
```

- **`sendfile(out_fd, in_fd, ...)`**：全程数据**一次都不经过用户态 `buf[]`**，直接由内核态把 Page Cache 描述符交给网卡散聚 DMA（Scatter-Gather DMA），CPU 拷贝降为 **`0` 次**！
- **`mmap` + `write`**：把文件 Page Cache 直接映射进用户空间省去 `read` 的 CPU 拷贝，但仍需一次内核内复制到 Socket 缓冲（且 `mmap` 大文件遇到磁盘坏块会发 `SIGBUS`）。
- **`splice(fd_in, ..., fd_out, ...)`**：在任意两个内核 fd 之间通过**内核管道缓冲区（Pipe Buffer）**做零拷贝数据搬运（突破了早期 `sendfile` 输出端必须是 Socket 的限制）。

### 可运行 POSIX/C++20 片段：`sendfile` 零拷贝传输示例

```cpp
// Linux / WSL2 编译: g++ -std=c++20 sendfile_demo.cpp -o sendfile_demo
#include <fcntl.h>
#include <iostream>
#include <sys/sendfile.h>
#include <sys/stat.h>
#include <unistd.h>

int main() {
    const char* src_path = "/tmp/os48_src.txt";
    const char* dst_path = "/tmp/os48_dst.txt";
    int w = ::open(src_path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    ::write(w, "Zero-copy payload via Linux kernel!\n", 36);
    ::close(w);

    int in_fd  = ::open(src_path, O_RDONLY);
    int out_fd = ::open(dst_path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    struct stat st{};
    ::fstat(in_fd, &st);

    off_t offset = 0;
    ssize_t sent = ::sendfile(out_fd, in_fd, &offset, st.st_size);
    std::cout << "sendfile 零拷贝写入字节数: " << sent << '\n';

    ::close(in_fd); ::close(out_fd);
    ::unlink(src_path); ::unlink(dst_path);
    return 0;
}
```

---

## 十一、异步与多路复用 I/O 进阶：`epoll` 就绪通知与 `io_uring` 完成队列 (OS-49)

面对 10 万条并发连接（C10K / C100K），操作系统提供两代截然不同的等待范式：

```text
  1. 就绪通知模型 (select / poll / epoll):
     app 问内核“谁可读？” ──▶ 内核答“fd 5 就绪” ──▶ app 自己调 read(5, buf, n) 拷数据
     • 必须牢记：epoll 通知可读 ≠ 完整一条消息到达！(TCP 半包仍需自己循环缓冲拼帧)

  2. 异步完成模型 (Linux io_uring):
     app 把【读请求 + buf 指针】放进用户/内核共享的提交环 SQ
        ──▶ 内核后台全自动做完 I/O 拷贝后，把结果放进完成环 CQ！
     • 高吞吐时可用 SQPOLL 模式把系统调用次数压到几乎为 0！
     • 生命周期铁律：CQ 确认完成前，app 绝不能释放或覆盖已提交出去的缓冲区！
```

---

## 十二、容器的操作系统真相：Linux Namespaces 与 Cgroups (OS-50)

很多开发者刚接触 Docker 时以为“容器是一台轻量级虚拟机”。**其实宿主机上根本没有第二个操作系统内核——容器在 Linux 眼里就是一个普通进程（或进程树），只不过给它戴上了两副内核面具！**

```text
  ╔══════════════════════════════════════════════════════════════╗
  ║                    普通宿主机 Linux 进程                      ║
  ╠═══════════════════════════════╦══════════════════════════════╣
  ║   面具 1: Linux Namespaces    ║   面具 2: Linux Cgroups v2    ║
  ║  【隔离视野: 你能看到什么】     ║  【资源限额: 你能吃多少】      ║
  ║  • PID:   容器内自己是 PID 1   ║  • cpu.max:    最多吃 2 核    ║
  ║  • NET:   独立网卡 veth / IP   ║  • memory.max: 超 512MB OOM  ║
  ║  • MNT:   独立根文件系统 /     ║  • pids.max:   防 fork 炸弹   ║
  ║  • UTS:   独立主机名 hostname  ║  • io.max:     磁盘 IOPS 上限 ║
  ║  • IPC / USER (容器内伪 root)  ║                              ║
  ╚═══════════════════════════════╩══════════════════════════════╝
             │                                   │
             └───────────────┬───────────────────┘
                             ▼
             共用宿主机唯一的一个 Linux 内核 (Ring 0)！
```

- **Namespaces（`clone` / `unshare` / `setns`）**：负责**障眼法（视野隔离）**。例如容器内 `ps aux` 看到的 `PID 1`，在宿主机全局进程表里其实可能叫 `PID 28491`；容器里以为自己是以 `UID 0 (root)` 跑的，经过 `USER` Namespace 映射后在宿主机上可能只是个毫无特权的普通用户 `UID 100000`。
- **Cgroups v2（Control Groups，`/sys/fs/cgroup/`）**：负责**配额账本（资源限制）**。没有 Cgroups 的容器一旦发生内存泄露或死循环，瞬间就能吃光整台宿主机内存拖死其他业务；有了 Cgroups，内核调度器和页分配器会硬性掐断超额的 CPU 时间片并仅在容器组内触发局部 OOM Killer。

### 实验（Linux / WSL2）：用 C++20 读取当前进程所处的 Cgroup 与 Namespace 编号

```cpp
// Linux / WSL2 编译: g++ -std=c++20 container_probe.cpp -o container_probe
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

int main() {
    namespace fs = std::filesystem;
    std::cout << "--- 当前进程的 Linux Namespaces 编号 (/proc/self/ns) ---\n";
    std::error_code ec;
    for (const auto& entry : fs::directory_iterator("/proc/self/ns", ec)) {
        auto target = fs::read_symlink(entry.path(), ec);
        if (!ec) {
            std::cout << "  " << entry.path().filename().string()
                      << " -> " << target.string() << '\n';
        }
    }

    std::cout << "\n--- 当前进程的 Cgroup 归属 (/proc/self/cgroup) ---\n";
    std::ifstream cg("/proc/self/cgroup");
    std::string line;
    while (std::getline(cg, line)) {
        std::cout << "  " << line << '\n';
    }
    return 0;
}
```

---

## 本课微练习 (OS-39 ~ OS-50)

### 练习 1（日志轮转与三层打开状态）
服务进程 A 正打开着 `/var/log/app.log`（持有 `fd = 3`）不断读取。此时运维执行 `mv /var/log/app.log /var/log/app.log.1`，并新建了一个空的 `/var/log/app.log`。请问：
1. 进程 A 用原 `fd = 3` 继续 `read()` 读到的是旧文件还是新空文件？
2. 进程 B 此时调用 `open("/var/log/app.log", O_RDONLY)` 打开的又是哪一个？

<details>
<summary>核对答案</summary>

1. 进程 A 读到的仍然是**旧文件**（`app.log.1` 对应的原 `inode`），因为 `fd = 3` 在当年 `open` 时就已经绑定了原 `inode`，`mv` 只改了目录里的文件名指向。
2. 进程 B 按路径重新解析目录项，打开的是**新建的空文件**（拥有全新的 `inode` 编号）。

</details>

### 练习 2（UNIX inode 最大文件容量估算）
假设磁盘块大小 `4 KB`，每个物理块号占 `4 字节`（每块可放 `1024` 个块号）。一个 inode 有 `12` 个直接指针、`1` 个一级间接指针、`1` 个二级间接指针。若仅启用到二级间接指针，单个文件最大能有多大？

<details>
<summary>核对答案</summary>

- 直接块：`12 × 4 KB = 48 KB`
- 一级间接：`1024 × 4 KB = 4 MB`
- 二级间接：`1024 × 1024 × 4 KB = 4 GB`
合计最大约 **`4 GB + 4 MB + 48 KB`**（若再加上三级间接，理论上可达 `4 TB` 以上）。

</details>

### 练习 3（`write()`、`fsync()` 与原子替换）
为什么数据库写完一条 WAL 日志调用 `::write()` 返回正数后还不够，必须紧接着调 `::fsync()`（或 `::fdatasync()`）？如果要原子替换一个配置文件，为什么还要额外 `fsync` 它所在的**父目录**？

<details>
<summary>核对答案</summary>

1. `::write()` 只是把用户态数据拷贝进内核的 **Page Cache** 内存就立刻返回了。如果此时机器突然断电，内存里的脏页全部蒸发丢失；只有 `fsync`/`fdatasync` 才会阻塞直到磁盘真正把数据刷到持久介质。
2. 创建新文件或 `rename` 改名修改的是**父目录文件里的数据块（目录项映射）**。如果不对父目录 `fd` 调用 `fsync`，断电重启后虽然新文件数据块和 inode 已经落盘，目录里却找不到它的名字！

</details>

### 练习 4（容器隔离与宿主机关系）
宿主机上用 Docker 启动了一个 `nginx` 容器，在容器内运行 `ps aux` 看到 `nginx` 主进程是 `PID 1`，同时你在容器内 `rm -rf` 删掉了 `/etc` 目录，宿主机上的 `/etc` 会被删掉吗？如果容器里的程序发生死循环吃满内存，且没有配 Cgroups `memory.max`，会发生什么？

<details>
<summary>核对答案</summary>

1. 宿主机 `/etc` **不会受影响**，因为容器工作在独立的 **Mount（`MNT`）Namespace** 下，看到的 `/` 是打包好的镜像联合文件系统，而不是宿主机根目录；看到的 `PID 1` 也是 **PID Namespace** 映射出的局部编号。
2. 因为容器与宿主机共用同一个内核，如果不设 **Cgroups `memory.max`** 限额，容器内的内存泄露会直接耗尽整台宿主机的物理内存，进而触发宿主机全局 OOM Killer，甚至误杀宿主机上的关键系统进程！

</details>
