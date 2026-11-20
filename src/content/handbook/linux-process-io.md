---
title: "Linux 系统调用、文件描述符、进程控制与信号 I/O"
description: "覆盖 LNX-41 至 LNX-46 及进阶事件 I/O：系统调用与 errno、FD 表与最小未用分配、open/read/write 短读写循环、dup2 重定向与匿名 pipe 关闭顺序、fork/execve/waitpid 防僵尸进程、sigaction 与 SA_RESTART，以及 WSL2/gdb/mmap/epoll 实战。"
order: 70
category: "Linux 实践"
tags: ["Linux", "WSL2", "系统调用", "文件描述符", "pipe", "fork", "信号", "epoll", "gdb", "strace"]
related: ["handbook/os-process-vmem", "handbook/linux-perm-admin", "handbook/linux-debug-elf", "handbook/concurrency-queue", "labs/logscan-service"]
sources: []
---

## 本课只解决这 1 个问题

写完单机命令行工具后，绝大多数 C++ 后端与系统工程项目最终都部署在 Linux 上。想要写出不会泄露句柄、不会僵尸横行、不会在管道和信号下随机卡死或崩溃的底层程序，你必须穿过 C++ 标准库，看懂进程与内核直接对话的接口。本课系统覆盖 **LNX-41 至 LNX-46**，并衔接 WSL2 环境搭建、`gdb`、`mmap` 与 `epoll`：**亲手用 C++ 代码观察系统调用与 `errno`、文件描述符分配规则与短读写循环、`dup2`/管道关闭顺序、`fork/execve/waitpid` 子进程回收、`sigaction` 与 `SA_RESTART` 优雅退出，以及 `mmap` 和 `epoll` 事件循环骨架**。

前置要求：已经完成 `LogScan v0.1` 多文件构建，会用基本终端命令；建议对照阅读[操作系统核心：进程、线程、死锁与虚拟内存](../os-process-vmem/)。

## 阅读路标：主线必读 vs 进阶深潜

如果你正在推进 `LogScan v2` / `v3`，建议按“先搭 WSL2 环境与打通系统调用/FD/管道/进程/信号，再深潜 `mmap` 与 `epoll`”的顺序阅读：

| 阅读层级 | 对应章节 | 学完能解决 `LogScan` 什么问题 | 首遍建议 |
| --- | --- | --- | --- |
| **前置准备** | 环境准备：WSL2 Ubuntu 与 `gdb` 抓崩溃 | 搭好 Linux 编译环境，避开 `/mnt/d/` 慢速与权限坑，用 `gdb` 定位段错误 | 必读 |
| **主线必读** | 一、系统调用与 `errno`（**LNX-41**） | 分清用户态与内核态边界，正确读取 `errno`、排查 `EACCES`/`EINTR` | 必读 |
| **主线必读** | 二、FD 表与最小未用分配规则（**LNX-42**） | 看懂 `0/1/2` 与最小未用分配、三层内核模型与 RAII `UniqueFd` / `O_CLOEXEC` | 必读 |
| **主线必读** | 三、`open`/`read`/`write`/`close` 与短读写（**LNX-43**） | 掌握 POSIX 文件 I/O、完整 `write_all`/`read_all` 短读写循环与 `strace` 观察 | 必读 |
| **主线必读** | 四、`dup2` 重定向与匿名 `pipe` 关闭顺序（**LNX-44**） | 理解 `> out 2>&1` 接线原理与“为什么读端等不到 EOF” | 必读 |
| **主线必读** | 五、`fork`/`execve`/`waitpid` 与防僵尸（**LNX-45**） | 掌握子进程创建、程序替换、`_exit` 铁律与 `WIFEXITED` 回收 | 必读 |
| **主线必读** | 六、信号与 `SA_RESTART` 优雅退出（**LNX-46**） | 写出 `SIGTERM`/`SIGCHLD` 排空、防 `SIGPIPE` 崩溃与 `SA_RESTART` 取舍 | 必读 |
| **进阶深潜** | 七、`mmap` 只读文件映射与边界 | 大文件零拷贝读取、页对齐检查、0 字节守卫与 `SIGBUS` 防护 | 二遍深潜 |
| **进阶深潜** | 八、`epoll` 事件循环与 `systemd` | 掌握高并发多路复用 LT/ET 模式与服务后台托管 | `LT` 为 `v3` 基础，`ET` 二遍深潜 |

## 环境准备：在 Windows 上搭好 WSL2 Ubuntu 与构建目录

不需要装笨重的虚拟机。以管理员身份打开 PowerShell，执行一行命令安装 WSL2（默认安装 Ubuntu）：

```powershell
wsl --install
```

安装并重启电脑后，从开始菜单打开 **Ubuntu**，按提示设置用户名和密码，然后一次性装好 C++ 编译与诊断全家桶：

```bash
sudo apt update
sudo apt install -y g++ cmake ninja-build gdb strace
```

**路径与构建铁律**：
- 在 WSL 里访问 Windows 盘符是 `/mnt/d/...`，但**千万不要把大项目放在 `/mnt/d/` 下编译**（跨文件系统协议转换会让 CMake 编译慢 5~10 倍，且 Windows 挂载盘上的 POSIX 权限位不完整）。
- 在 Ubuntu 原生文件系统建独立工作区与隔离构建目录：`mkdir -p ~/cpp-work && cd ~/cpp-work`。编译多文件工程时使用独立构建目录 `cmake -S . -B build -G Ninja && cmake --build build && ctest --test-dir build --output-on-failure`，样本路径尽量传绝对路径避免切换目录找不到文件。

---

## 一、系统调用与 `errno` 错误处理（LNX-41）

普通 C++ 函数（比如 `std::sort`）全程只在**用户态（User Space）**运行；但只要涉及读磁盘、开网络、创建进程、收发信号，应用程序无权直接操作硬件，必须通过 CPU 的特权指令（如 x86-64 上的 `syscall`）陷入**内核态（Kernel Space）**，请 Linux 内核代劳——这就是**系统调用（System Call）**。

### 1. glibc 封装层与 `errno` 的三条铁律

你在 C++ 里调用 `::open()`、`::read()`、`::fork()` 时，实际先调用的是 C 运行库（`glibc`）提供的薄封装函数：它把参数放进寄存器、触发 `syscall`，如果内核返回负值错误码，`glibc` 会将其转为全局线程局部变量 **`errno`**，并向你的代码统一返回 **`-1`**（指针函数如 `mmap` 则返回 `MAP_FAILED`）。

使用 `errno` 必须遵守**三条铁律**：

1. **只在失败时检查 `errno`**：系统调用成功时，内核**不会**把 `errno` 清零！里面可能还留着上一次失败的值。必须先判断 `ret == -1`（或 `ret < 0`），再去读 `errno`。
2. **失败后立刻保存 `errno`**：任何后续库函数（哪怕是一句 `std::cerr << ...` 或 `malloc`）内部都可能悄悄触发别的系统调用并**覆写 `errno`**！工程习惯：
   ```cpp
   ssize_t n = ::read(fd, buf, sizeof(buf));
   if (n < 0) {
       int saved_errno = errno; // 立即存起来！
       std::cerr << "read 失败 (" << saved_errno << "): "
                 << std::strerror(saved_errno) << '\n';
   }
   ```
3. **多线程安全**：现代 Linux 中 `errno` 早已不是全局变量，而是展开为每线程独立的宏（`__errno_location()`），因此多线程各自读取自己的 `errno` 不会串线；但注意 `std::strerror(errno)` 在极老标准里不是线程安全的，跨线程打日志建议用 `strerror_r` 或先转成 `std::error_code(saved_errno, std::generic_category()).message()`。

### 2. 必须刻在脑子里的常见 `errno` 速查表

| `errno` 宏名 | 典型数值 (x86_64) | 内核含义 | 常见根因与工程对策 |
| --- | :---: | --- | --- |
| **`ENOENT`** | `2` | No such file or directory | 路径拼写错、工作目录不对、文件尚未创建 |
| **`EACCES`** | `13` | Permission denied | 目标文件缺权限，或**沿途任一父目录缺少 `x` 搜索位**（注意：仅凭 `EACCES` 不能断定末级文件一定存在！） |
| **`EINTR`** | `4` | Interrupted system call | 阻塞系统调用（`read`/`waitpid`/`accept`）半路被信号打断；**应立即在 `while` 循环里重试** |
| **`EAGAIN` / `EWOULDBLOCK`** | `11` | Resource temporarily unavailable | 对 `O_NONBLOCK` 非阻塞 FD 读写时，内核缓冲区暂无数据或已满；**不算真错误，等下次 `epoll` 就绪再试** |
| **`EBADF`** | `9` | Bad file descriptor | 传入了负数、已 `close` 或从未打开过的 FD |
| **`EMFILE`** | `24` | Too many open files | 当前进程打开的 FD 达到 `ulimit -n` 上限（**典型 FD 泄露信号！**） |
| **`EPIPE`** | `32` | Broken pipe | 往“读端已全部关闭”的管道或 Socket 写数据（需先忽略 `SIGPIPE` 才会收到此 `errno`） |
| **`EEXIST`** | `17` | File exists | 带 `O_CREAT \| O_EXCL` 原子建文件时目标已存在 |

> [!NOTE]
> **路径查找与 `EACCES` 边界**：即使目标文件本身权限是 `644`（人人都可读），只要**沿途任一父目录缺少 `x`（搜索）位**，内核依然会在路径遍历阶段直接拒绝并返回 `EACCES`。用 `ls -ld <各级目录> <文件>` 或 `namei -l <路径>` 核对每一级的 `x` 位。

---

## 二、文件描述符表、三层内核模型与最小未用 FD 规则（LNX-42）

Linux 启动一个程序时，内核会为这个**进程**维护一张“打开的文件清单”，表里的整数编号叫**文件描述符（fd, File Descriptor）**。

```text
进程的文件描述符表：
  fd 0 ──→ 标准输入 (stdin)
  fd 1 ──→ 标准输出 (stdout，std::cout 往这里写)
  fd 2 ──→ 标准错误 (stderr，std::cerr 往这里写)
  fd 3 ──→ sample.log       (新打开的第一个文件通常分到 3)
  fd 4 ──→ output.db        (下一个打开的文件分到 4)
```

### 1. 进程 FD 表 -> 打开文件描述 -> inode 三层模型

为什么 `dup2` 重定向或者 `fork()` 之后，父子进程写同一个文件不会互相覆盖偏移量？因为内核维护了**三张表**：

```text
[ 进程 A 的 FD 表 ]        [ 内核全局 Open File Description ]        [ 文件系统 Inode ]
  fd 0 -> stdin              (引用计数, 当前读写偏移 offset,             (文件权限, 大小,
  fd 1 -> stdout              状态标志 O_RDONLY / O_APPEND...)            磁盘块指针...)
  fd 3 ───────────────▶  [ 打开文件表项 #1: offset=128 ] ──────────▶  [ app.log inode ]
  fd 4 ─────(dup2)────↗  (同一表项共享同一个 offset！)
```

- **各自独立 `open()` 同一个文件**：会在内核创建**两个不同的** Open File Description 表项，各自维护独立的 `offset`（可能会互相覆盖写入！）。
- **通过 `dup`/`dup2` 或 `fork()` 继承来的 FD**：指向内核**同一个** Open File Description 表项，**共享同一个文件偏移量 `offset`**！这也是 Shell 执行 `> run.log 2>&1` 后，标准输出和标准错误能按顺序交错写入同一份日志而不打架的底层原因。

### 2. 最小未用 FD 分配规则（Lowest-Unused FD）

POSIX 明确规定：**每次 `open()`、`pipe()`、`socket()`、`accept()`、`dup()` 需要分配新文件描述符时，内核保证返回当前进程 FD 表中“最小且尚未被占用的非负整数”。**

例如：
1. 程序刚启动时，`0`、`1`、`2` 已被占用；
2. 第一次 `open("a.log")` 返回 `3`；第二次 `open("b.log")` 返回 `4`；
3. 调用 `::close(3)` 关掉 `a.log` 后，`3` 号槽位腾空；
4. 紧接着 `open("c.log")` **必然分到 `3`**（而不是 `5`）！
5. 经典重定向技巧就是利用这一条：如果先 `::close(1)` 关掉标准输出，紧接着 `::open("out.txt", ...)`，新文件就会拿到 `fd = 1`，于是后续所有 `printf`/`std::cout` 就全写进 `out.txt` 了（现代代码用更原子的 `dup2`，见第四节）。

### 3. `O_CLOEXEC` 与 RAII `UniqueFd` 封装

直接拿裸 `int fd` 一旦中途抛异常或 `return` 早退就会泄露句柄，最终触发 `Too many open files`（`EMFILE`）。此外，如果服务进程后续要 `fork` + `execve` 启动子进程，父进程打开的敏感文件或监听套接字默认会**被子进程原封不动继承过去**！

因此工程实践有两条死规矩：
1. 所有 `open` 一律加上 **`O_CLOEXEC`**（`epoll_create1(EPOLL_CLOEXEC)`、`socket(..., SOCK_CLOEXEC, ...)`、`pipe2(fds, O_CLOEXEC)`），保证一旦调用 `execve` 换装新程序，内核自动把这些 FD 关掉；
2. C++ 里永远用只支持移动、析构自动 `::close` 的 **RAII `UniqueFd`** 管住每一个句柄：

```cpp
#include <unistd.h>
#include <utility>

class UniqueFd {
public:
    UniqueFd() = default;
    explicit UniqueFd(int fd) noexcept : fd_(fd) {}
    ~UniqueFd() { reset(); }

    UniqueFd(const UniqueFd&) = delete;
    UniqueFd& operator=(const UniqueFd&) = delete;

    UniqueFd(UniqueFd&& other) noexcept : fd_(std::exchange(other.fd_, -1)) {}
    UniqueFd& operator=(UniqueFd&& other) noexcept {
        if (this != &other) {
            reset(std::exchange(other.fd_, -1));
        }
        return *this;
    }

    int get() const noexcept { return fd_; }
    explicit operator bool() const noexcept { return fd_ >= 0; }

    void reset(int new_fd = -1) noexcept {
        if (fd_ >= 0) {
            ::close(fd_); // 析构自动关闭，杜绝任何路径泄露 fd
        }
        fd_ = new_fd;
    }

private:
    int fd_ = -1;
};
```

### 4. `/proc` 透视运行中的进程 FD

启动后台任务 `./server &`，用 `$!` 记住它的 PID，再直接读取内核暴露的虚拟文件系统 `/proc/<PID>/`：
- `ls -l /proc/<PID>/fd`：实时查看进程当前打开的所有文件与 Socket（查 fd 泄露神器）。
- `ls -l /proc/<PID>/cwd`：查看进程当前工作目录（排查相对路径找错文件）。
- `grep -E "State|Threads|VmRSS" /proc/<PID>/status`：核对进程运行状态、线程数和真实占用的物理内存（`VmRSS`）。

---

## 三、`open` / `read` / `write` / `close` 与短读写循环（LNX-43）

### 1. 动手实验一：用 C++ 直接调用 Linux 系统调用打开与读取文件

在 `~/cpp-work` 新建 `fd_demo.cpp`（注意这是 Linux POSIX 接口，在 WSL Ubuntu 里编译）：

```cpp
#include <fcntl.h>    // open
#include <unistd.h>   // read, write, close
#include <iostream>
#include <cstring>

int main() {
    // 1. 直接向 Linux 内核申请打开文件（如果不存在就报错）
    int fd = ::open("test.txt", O_RDONLY | O_CLOEXEC);
    if (fd < 0) {
        int saved = errno;
        std::cerr << "open 失败，错误码 errno=" << saved
                  << " (" << std::strerror(saved) << ")\n";
        return 1;
    }

    std::cout << "成功打开文件，内核分配的 fd = " << fd << '\n';

    // 2. 从 fd 读取最多 64 字节
    char buf[64]{};
    ssize_t n = ::read(fd, buf, sizeof(buf) - 1);
    if (n > 0) {
        std::cout << "读到 " << n << " 字节: " << buf << '\n';
    }

    // 3. 必须手动关闭！否则会泄露文件描述符
    ::close(fd);
    return 0;
}
```

在 Ubuntu 终端编译并故意先不创建 `test.txt` 跑一次，再用 `strace` 透视内核发生了什么：

```bash
g++ -std=c++20 -Wall -Wextra fd_demo.cpp -o fd_demo
./fd_demo
strace -e trace=openat ./fd_demo
```

你会看到：`./fd_demo` 打印 `open 失败，错误码 errno=2 (No such file or directory)`；而 `strace` 会把程序向内核发起的那次调用原原本本打出来：

```text
openat(AT_FDCWD, "test.txt", O_RDONLY|O_CLOEXEC) = -1 ENOENT (No such file or directory)
```

接着创建文件再跑一次：

```bash
echo "hello linux" > test.txt
./fd_demo
```

此时输出 `成功打开文件，内核分配的 fd = 3`（因为 `0/1/2` 已经被标准输入/输出/错误占用了）。

<details>
<summary>深入一步：缓冲 I/O vs 无缓冲系统调用，以及 O_CREAT 权限陷阱</summary>

1. **缓冲优化**：每次调用 `::read()` 都是一次用户态到内核态的系统调用切换。`std::ifstream` / `FILE*` 会在用户态申请 4KB~8KB 缓冲区，一次读一大块再逐行切给你，比 1 字节 1 字节调 `::read()` 快几个数量级。
2. **创建文件时的第 3 个参数 `mode`**：使用 `O_CREAT` 时**必须传第三个权限参数**（如 `0644`），否则内核会从栈垃圾值里抓一个随机权限！且实际落盘权限等于 `mode & ~umask`。

</details>

### 2. 致命细节：短读（Short Read）与短写（Partial Write）循环

对普通本地小文件调一次 `read`/`write` 通常能一次搞定，但一旦面对**管道（pipe）、TCP Socket、终端或大块写入**：
- 调用 `::write(fd, buf, 4096)` **可能只写入了 `1200` 字节就返回 `1200`**（比如内核发送缓冲区快满了）！如果你不检查返回值继续写剩下的 `2896` 字节，数据就会静默截断丢失！
- 调用 `::read(fd, buf, 100)` **可能先返回 `17` 字节**，也可能在阻塞途中被信号打断返回 `-1` 且 `errno == EINTR`！只有明确返回 **`0`** 才代表 **EOF（对端关闭或文件结尾）**。

### 3. 动手实验二：工业级 `write_all` 与 `read_exact` 循环（可编译运行）

新建 `io_loop_demo.cpp` 验证完整创建写入与短读写处理：

```cpp
// LNX-43: 完整处理 Partial Write、Partial Read 与 EINTR 的安全循环
#include <fcntl.h>
#include <unistd.h>
#include <cerrno>
#include <cstddef>
#include <cstring>
#include <iostream>
#include <string>

bool write_all(int fd, const char* data, std::size_t len) {
    std::size_t written = 0;
    while (written < len) {
        ssize_t n = ::write(fd, data + written, len - written);
        if (n > 0) {
            written += static_cast<std::size_t>(n);
        } else if (n < 0 && errno == EINTR) {
            continue; // 被信号打断，安全重试
        } else {
            return false; // 遇到 EPIPE / EAGAIN / 硬件错误等
        }
    }
    return true;
}

ssize_t read_up_to(int fd, char* buf, std::size_t cap) {
    std::size_t total = 0;
    while (total < cap) {
        ssize_t n = ::read(fd, buf + total, cap - total);
        if (n > 0) {
            total += static_cast<std::size_t>(n);
        } else if (n == 0) {
            break; // EOF：对端关闭或文件读完
        } else if (errno == EINTR) {
            continue; // 被信号打断，安全重试
        } else {
            return -1; // 真正出错
        }
    }
    return static_cast<ssize_t>(total);
}

int main() {
    const std::string payload = "line1: syscall write_all\nline2: partial safe\n";
    int wfd = ::open("out_loop.txt", O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (wfd < 0 || !write_all(wfd, payload.data(), payload.size())) {
        std::cerr << "写入失败: " << std::strerror(errno) << '\n';
        if (wfd >= 0) ::close(wfd);
        return 1;
    }
    ::close(wfd);

    int rfd = ::open("out_loop.txt", O_RDONLY | O_CLOEXEC);
    char buf[128]{};
    ssize_t got = (rfd >= 0) ? read_up_to(rfd, buf, sizeof(buf) - 1) : -1;
    if (rfd >= 0) ::close(rfd);
    if (got < 0) return 1;

    std::cout << "完整读回 " << got << " 字节:\n" << buf;
    return 0;
}
```

```bash
g++ -std=c++20 -Wall -Wextra io_loop_demo.cpp -o io_loop_demo && ./io_loop_demo
```

---

## 四、`dup2` 重定向与匿名 `pipe` 关闭顺序（LNX-44）

### 1. Shell 引号、重定向顺序与 `dup2` 底层原理

在终端写命令和脚本时，3 条铁律直接对应底层 FD 操作：
- **带空格文件名必须加引号**：`./logscan "two words.log"` 只传 1 个参数；不加引号会被 Shell 拆成 `two` 和 `words.log` 两个参数。
- **重定向从左到右生效**：`>` 覆盖 stdout、`>>` 追加 stdout、`2>` 重定向 stderr。合并双流到同一文件**必须写 `> run.log 2>&1`**（底层逻辑：先 `open("run.log")` 再调 `dup2(logfd, 1)` 让 fd 1 指向 `run.log`，随后调 **`dup2(1, 2)`** 把 fd 2 指向 fd 1 当前目标）；若反写成 `2>&1 > run.log`，则 `dup2(1, 2)` 发生时 fd 1 还指着屏幕，结果 stderr 仍打到屏幕！
- **管道与退出码 `$?`**：默认情况下 `false | cat` 的 `$?` 是最后一个命令 `cat` 的 `0`，直接掩盖了上游失败！Bash 工程脚本开头务必加上 **`set -euo pipefail`**，让管道中任一环节非零退出都立即暴露。
- **排错过滤组合拳**：`grep -n "ERROR" app.log`（按行过滤）、`awk '{print $1, $3}'`（按列提取）、`find . -name "*.log" -print0 | xargs -0 wc -l`（安全批量统计含空格文件名）。

### 2. 匿名管道 `pipe` + `dup2` 接线与关闭顺序

命令行里一句 `cat app.log | grep ERROR`，背后就是内核匿名管道（`pipe`）+ `fork()` + `dup2()` 的经典配合。**新手 90% 的卡死，都出在“忘了关闲置写端”**。

```text
  1. pipe(fds) 创建内核单向通道: fds[0]=读端, fds[1]=写端
  2. fork() 后父子各持一份，此时【写端引用计数 = 2】！
     父进程: fds[0], fds[1]        子进程: fds[0], fds[1]
        │                             │
        ▼ close(fds[1]) (必须!)       ▼ dup2(fds[1], STDOUT_FILENO)
     父进程只留 fds[0] 读             close(fds[0]); close(fds[1]);
     (此时写端只剩子进程 1 份!)       子进程 stdout 写入管道 → 写完 exit/close
                                      (写端计数 1→0，父进程 read() 收到 0 = EOF!)
```

- **为什么少关一个写端就会永远卡在 `read()`？** 内核只有在**所有指向该管道写端的 fd 全部关闭**（写端引用计数归 `0`）时，才会给读端返回 `0`（EOF）。如果子进程退出时已经关了自己的写端，但**父进程自己手里还攥着最初的 `fds[1]` 没关**，内核认为“还有人可能继续写”，父进程的 `read(fds[0], ...)` 就会**永远阻塞**（若设了 `O_NONBLOCK` 则一直返回 `-1` 且 `errno == EAGAIN`）。
- **`dup2(oldfd, newfd)` 接线铁律**：`dup2(fds[1], STDOUT_FILENO)` 会原子地关闭原本的 `1` 号 fd（若已打开），再把 `1` 号 fd 接到管道写端。接完后必须**立刻把原来的 `fds[0]` 和 `fds[1]` 关掉**，否则既泄露描述符，又会多出一份写端引用！

### 3. 动手实验三：`pipe` + `fork` + `dup2`（可编译运行）

```cpp
// LNX-44: pipe + fork + dup2 接线与严格关闭顺序（在 Linux / WSL2 编译运行）
#include <sys/wait.h>
#include <unistd.h>
#include <cerrno>
#include <iostream>

int main() {
    int fds[2]{};
    if (::pipe(fds) < 0) return 1;

    pid_t pid = ::fork();
    if (pid == 0) {
        ::close(fds[0]);                    // 子进程不读，先关读端
        ::dup2(fds[1], STDOUT_FILENO);      // 把标准输出接到管道写端
        ::close(fds[1]);                    // 接线完成，关掉原临时编号！
        ::write(STDOUT_FILENO, "ABC", 3);   // 模拟写数据到 stdout
        ::_exit(0);                         // 退出时内核自动关闭子进程的 fd 1
    }

    ::close(fds[1]); // 致命关键！若漏掉这一行，下面 read 读完 "ABC" 后将永久卡死！
    char buf[16]{};
    while (true) {
        ssize_t n = ::read(fds[0], buf, sizeof(buf) - 1);
        if (n > 0) {
            buf[n] = '\0';
            std::cout << "父进程读到 " << n << " 字节: " << buf << '\n';
        } else if (n == 0) {
            std::cout << "父进程收到 EOF (n == 0)，管道正常结束\n";
            break;
        } else if (errno == EINTR) {
            continue;
        } else {
            break;
        }
    }
    ::close(fds[0]);
    ::waitpid(pid, nullptr, 0);
    return 0;
}
```

---

## 五、`fork` / `execve` / `waitpid` 与僵尸进程防范（LNX-45）

Linux 创建并运行一个外部子程序，永远拆成优雅的两步：**先 `fork()` 复制出一个分身，再在分身里用 `execve()` 变身成目标程序**（中间正好留出窗口做 `dup2` 重定向、切目录、降权限！）。

### 1. 三个系统调用的关键细节

| 系统调用 | 核心机制 | 极易踩的坑 |
| --- | --- | --- |
| **`fork()`** | 一次调用、两次返回：父进程拿到**子进程 PID（> 0）**，子进程拿到 **`0`**，失败返回 `-1`。采用写时复制（COW），几乎不立即拷贝物理内存 | 在**多线程程序**里调 `fork()` 极其危险：只复制调用线程，其他线程持有的 `malloc` 锁可能永远锁死！因此多线程程序 `fork` 后子进程只能立刻调异步信号安全函数和 `execve`/`_exit` |
| **`execve()`** / `execvp()` | **原地替换**当前进程的代码段/数据段/堆栈，**PID 保持不变**，且未带 `O_CLOEXEC` 的 FD 全部保留。**只要 `exec` 成功，它就永远不会返回！** | 只要 `exec` 后面那行代码被执行了，说明 `exec` 一定失败了（如 `ENOENT`/`EACCES`）！此时子进程**必须调 `::_exit(127)`**，绝不能调 `return` 或 `std::exit()`——否则会去冲刷父进程继承来的 `stdout`/`FILE*` 缓冲区，把同一句话打印两遍！ |
| **`waitpid()`** | 阻塞（`0`）或非阻塞（`WNOHANG`）等待子进程结束，并回收其内核 PCB 残骸与退出码 | **不调 `waitpid` 就会产生僵尸进程（`Z` 态）**，占用 PID 名额直至耗尽；如果父进程先死，子进程变成**孤儿进程**，会被 PID 1（`systemd`）自动收养并回收 |

### 2. 拆解 `waitpid` 的 `status` 整数

`waitpid(pid, &status, 0)` 填回的 `status` **不是单纯的退出码**，而是一个编码了“正常退出还是被信号杀死”的位字段，必须用标准宏解码：
- `WIFEXITED(status)` 为真 → 正常 `exit`/`return` 退出，用 **`WEXITSTATUS(status)`** 拿退出码（0~255）。
- `WIFSIGNALED(status)` 为真 → 被信号（如 `SIGSEGV` 11 / `SIGKILL` 9）杀死的，用 **`WTERMSIG(status)`** 拿信号编号（Shell 里看到的退出码 `128 + sig` 就是这么来的！）。

### 3. 动手实验四：`fork` + `execvp` + `waitpid` 安全拉起外部命令（可编译运行）

新建 `spawn_demo.cpp`：

```cpp
// LNX-45: fork + execvp + waitpid 标准子进程托管与退出码解码
#include <sys/wait.h>
#include <unistd.h>
#include <cerrno>
#include <cstring>
#include <iostream>

int main() {
    pid_t pid = ::fork();
    if (pid < 0) {
        std::cerr << "fork 失败: " << std::strerror(errno) << '\n';
        return 1;
    }

    if (pid == 0) {
        // 子进程：变身成 ls -ld /tmp
        char* const argv[] = {
            const_cast<char*>("ls"),
            const_cast<char*>("-ld"),
            const_cast<char*>("/tmp"),
            nullptr
        };
        ::execvp("ls", argv);
        // 只有 execvp 失败才会走到这里！必须用 _exit，不可用 std::exit 或 return！
        ::_exit(127);
    }

    int status = 0;
    while (::waitpid(pid, &status, 0) < 0) {
        if (errno == EINTR) continue;
        std::cerr << "waitpid 失败: " << std::strerror(errno) << '\n';
        return 1;
    }

    if (WIFEXITED(status)) {
        std::cout << "子进程 PID=" << pid << " 正常退出，退出码 = "
                  << WEXITSTATUS(status) << '\n';
    } else if (WIFSIGNALED(status)) {
        std::cout << "子进程 PID=" << pid << " 被信号杀死，信号 = "
                  << WTERMSIG(status) << '\n';
    }
    return 0;
}
```

---

## 六、信号处理 `SIGINT`/`SIGTERM`/`SIGPIPE`/`SIGCHLD` 与 `SA_RESTART`（LNX-46）

生产服务不能靠 `kill -9` 粗暴拔电源，否则正在写的归档和内存队列会直接截断丢失。先分清 5 个最核心的信号：

| 信号 | 触发方式 / 常见来源 | 能否捕获/忽略？ | 工程标准处理策略 |
| --- | --- | :---: | --- |
| **`SIGINT`** | 终端按 `Ctrl+C` | 可以 | 与 `SIGTERM` 共用优雅退出标志 |
| **`SIGTERM`** | `kill <PID>` / `systemctl stop` | 可以 | **停止接收新请求 → 排空队列 → 关闭退出** |
| **`SIGKILL`** | `kill -9 <PID>` | **绝对不可捕获/阻塞** | 内核直接终结进程，仅作死锁兜底 |
| **`SIGPIPE`** | 向已关闭读端的管道/Socket 写数据 | 可以 | **服务端必设 `SIG_IGN`**，否则默认直接崩溃！改为检查 `write`/`send` 返回 `-1` 且 `errno == EPIPE` |
| **`SIGCHLD`** | 子进程结束或暂停时发给父进程 | 可以（默认忽略但会留僵尸） | 在信号标志或异步安全回调中循环 `while (waitpid(-1, &st, WNOHANG) > 0)`，**绝不漏收任何同时死亡的子进程** |

### 1. 异步信号安全（Async-Signal-Safe）铁律

当信号到达时，主线程可能在任意指令位置被中断——万一主线程当时正拿着 `malloc` 堆锁或 `std::cout` 内部锁，你在信号处理函数里又去调 `std::cout`、`new`/`malloc` 或加 `std::mutex`，**程序会立刻死锁或破坏堆内存**！

唯一安全的做法是：**用 `sigaction` 注册处理函数，在里面只改写一个 `volatile std::sig_atomic_t` 标志（或向 `self-pipe`/`eventfd` 写 1 字节）**，把清理工作留给主循环：

```cpp
#include <csignal>
#include <atomic>

volatile std::sig_atomic_t g_stop_requested = 0;

void handle_signal(int /*sig*/) {
    g_stop_requested = 1; // 仅做原子整数赋值，绝对不调用 cout / malloc / lock！
}

void install_signal_handlers() {
    std::signal(SIGPIPE, SIG_IGN); // 防止对端断连触发 SIGPIPE 杀掉服务
    struct sigaction sa{};
    sa.sa_handler = handle_signal;
    sigemptyset(&sa.sa_mask);
    // 注意：这里故意不设 SA_RESTART，让被阻塞的 accept()/read() 能立刻以 EINTR 返回，
    // 从而在主循环里及时检测到 g_stop_requested == 1！
    sa.sa_flags = 0;
    sigaction(SIGINT, &sa, nullptr);
    sigaction(SIGTERM, &sa, nullptr);
}
```

### 2. 深入两个工程难点：`SA_RESTART` 取舍与 `SIGCHLD` 防合并丢失

1. **`SA_RESTART` 标志到底该不该设？**
   假设你的主线程正卡在 `::read(STDIN_FILENO, ...)` 或 `::accept(listen_fd, ...)` 等待输入/新连接，此时按下了 `Ctrl+C`（`SIGINT`）：
   - **若设置了 `sa.sa_flags = SA_RESTART`**：信号处理函数把 `g_stop_requested` 设为 `1` 返回后，**Linux 内核会自动重启刚才被中断的 `read()`/`accept()`**！结果你的程序虽然收到了退出信号，却依然死死卡在 `accept()` 里**迟迟退不出来**！
   - **若不设 `SA_RESTART`（`sa_flags = 0`）**：`read()`/`accept()` 会立刻返回 `-1` 且 `errno == EINTR`，代码跳回 `while (!g_stop_requested)` 条件检查后就能**毫秒级优雅退出**！
   - *(例外：如果某个信号如 `SIGCHLD` 或 `SIGALRM` 不是用来触发退出的，只是统计或后台回收，设置 `SA_RESTART` 可以少写外层的 `EINTR` 重试。注意：在 Linux 上即使设了 `SA_RESTART`，`epoll_wait` 和带 `SO_RCVTIMEO` 超时的 Socket 也**不会**自动重启。)*
2. **为什么收割 `SIGCHLD` 必须写 `while` 循环？**
   Linux 常规信号（1~31）是**用位图记录、不排队的**！如果 3 个子进程在同一毫秒内同时结束，父进程很可能**只收到 1 次 `SIGCHLD`**。如果回调里只调用一次 `waitpid(-1, ...)`，另外 2 个子进程就会永久变成僵尸进程！正确写法是在主循环检查标志（或遵循 POSIX 允许在异步信号安全函数 `waitpid` 里）写：
   ```cpp
   // 在 SIGCHLD 处理中或主循环检测到 g_child_exited 时循环排干：
   int st = 0;
   while (::waitpid(-1, &st, WNOHANG) > 0) {
       // 成功回收一个已退出子进程，继续检查是否还有其他已退出的子进程
   }
   ```

---

## 七、进阶深潜一：用 `gdb` 抓出段错误与 `mmap` 只读映射

### 1. 用 `gdb` 抓出段错误（Segmentation Fault）崩溃现场

程序在 Linux 上最吓人的报错就是一句冰冷的 `Segmentation fault (core dumped)`，连哪一行炸的都不告诉你。学会用 `gdb` 两分钟就能定位到具体行号。

新建 `crash_demo.cpp`，故意写一个解引用空指针的崩溃：

```cpp
#include <iostream>

void print_first(const int* ptr) {
    std::cout << *ptr << '\n'; // 如果 ptr 是 nullptr，这里直接段错误！
}

int main() {
    int* p = nullptr;
    print_first(p);
    return 0;
}
```

**关键**：编译时必须加 `-g`（保留源码行号信息）：

```bash
g++ -std=c++20 -g -O0 crash_demo.cpp -o crash_demo
gdb ./crash_demo
```

进入 `gdb` 交互界面后，依次敲 4 个命令：
1. `run`：启动程序，它会在崩溃那一行立刻停住。
2. `bt`（backtrace）：打印完整函数调用栈，你会清楚看到 `main` 调用了 `print_first`，并精确停在 `*ptr` 那一行。
3. `print ptr`：查看当时指针的值，显示 `0x0`（空指针）。
4. `quit`：退出调试器。

### 2. `mmap` 只读文件映射与三条安全边界

读取几百 MB 的只读日志时，常规 `read()` 需要先把数据从内核页缓存拷贝到用户态 `buf`；而 `mmap(..., PROT_READ, MAP_PRIVATE, fd, offset)` 能把文件直接映射成进程虚拟地址空间里的一段只读指针，省掉那次用户态拷贝。但 `mmap` 有**三条必须守住的安全边界**：

1. **偏移量必须按页对齐（Page-Aligned `offset`）**：`mmap` 的最后一个参数 `offset` 必须是系统页大小（`::sysconf(_SC_PAGESIZE)`，通常 `4096` 字节）的整数倍。哪怕只传 `offset = 100`，`mmap` 也会直接失败返回 `MAP_FAILED` 并置 `errno = EINVAL`。若需要从非对齐偏移开始读，必须向下取整到页边界映射，再在返回指针上加余数偏移。
2. **空文件（0 字节）必须提前跳过**：如果用 `fstat(fd, &st)` 测得 `st.st_size == 0`，**绝不能调用 `mmap(..., 0, ...)`**（POSIX 规定长度为 `0` 必定失败返回 `MAP_FAILED` + `EINVAL`）。正确做法是直接返回空视图或空校验和，跳过映射。
3. **底层文件被外部截断时的 `SIGBUS` 致命陷阱**：`mmap` 不会把文件快照拷走！如果在映射期间，另一个进程把该文件 `ftruncate` 截短了，当你继续解引用超出新文件末尾的映射页时，内核无法从磁盘调页，会直接向进程发送 **`SIGBUS`** 崩溃信号！因此 `mmap` 只适合**大小不变或由本进程独占只读**的稳定文件；若文件可能被其他进程改写截短，老老实实用显式 `read()` 循环更安全。

```cpp
// 安全只读 mmap 封装（含空文件守卫、页对齐检查与 RAII munmap）
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <stdexcept>

class ReadOnlyMmap {
public:
    ReadOnlyMmap(int fd, off_t offset, std::size_t length) {
        long page_size = ::sysconf(_SC_PAGESIZE);
        if (offset < 0 || (offset % page_size) != 0) {
            throw std::invalid_argument("mmap offset 必须按系统页大小对齐");
        }
        struct stat st{};
        if (::fstat(fd, &st) < 0) {
            throw std::runtime_error(std::strerror(errno));
        }
        if (st.st_size == 0 || offset >= st.st_size) {
            return; // 空文件守卫：保持 data_=nullptr, size_=0，跳过 mmap！
        }
        std::size_t avail = static_cast<std::size_t>(st.st_size - offset);
        size_ = (length == 0 || length > avail) ? avail : length;
        void* p = ::mmap(nullptr, size_, PROT_READ, MAP_PRIVATE, fd, offset);
        if (p == MAP_FAILED) {
            size_ = 0;
            throw std::runtime_error(std::strerror(errno));
        }
        data_ = static_cast<const std::uint8_t*>(p);
    }

    ~ReadOnlyMmap() {
        if (data_ && size_ > 0) {
            ::munmap(const_cast<std::uint8_t*>(data_), size_);
        }
    }
    ReadOnlyMmap(const ReadOnlyMmap&) = delete;
    ReadOnlyMmap& operator=(const ReadOnlyMmap&) = delete;

    const std::uint8_t* data() const noexcept { return data_; }
    std::size_t size() const noexcept { return size_; }

private:
    const std::uint8_t* data_ = nullptr;
    std::size_t size_ = 0;
};
```

---

## 八、进阶深潜二：`epoll` 事件循环与 `systemd` 用户服务

当服务端同时管几千个 TCP 连接时，靠 `epoll` 用一个循环就能监听所有就绪事件：

```text
  epoll_create1(EPOLL_CLOEXEC) ──▶ 创建内核事件表 epfd
       │
       ▼  epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev)  ──▶ 注册监听套接字与客户端连接
       │
       ▼  while (!g_stop_requested) {
              int n = epoll_wait(epfd, events, MAX_EV, 500 /*ms 超时以便检查退出标志*/);
              // 处理所有就绪 fd：可读时 read 并推进每连接解析缓冲，可写时 flush 发送缓冲
          }
```

**水平触发（LT）vs 边沿触发（ET）的关键差异**：
- **水平触发（LT，默认）**：只要内核接收缓冲区里还有未读完的字节，下次 `epoll_wait` 仍会继续通知你“可读”。逻辑简单、不易漏事件，是入门和大多数服务的首选。
- **边沿触发（ET，`EPOLLET`）**：只在缓冲区状态从“无数据”变成“有数据”的那一瞬间通知**一次**！如果这次只读了一半，剩下的数据永远不会再触发通知。因此使用 ET **必须把 fd 设为 `O_NONBLOCK`，并在循环里连续 `read`/`write` 直到返回 `-1` 且 `errno == EAGAIN`（或 `EWOULDBLOCK`）**。

```cpp
// Linux epoll 最小事件循环 + ET 排干读骨架
int epfd = ::epoll_create1(EPOLL_CLOEXEC);
epoll_event ev{.events = EPOLLIN | EPOLLET, .data = {.fd = client_fd}}; // 需先将 client_fd 设为 O_NONBLOCK
::epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

epoll_event events[16]{};
while (!g_stop_requested) {
    int ready = ::epoll_wait(epfd, events, 16, 500);
    if (ready < 0 && errno == EINTR) continue; // 被信号打断，回到循环条件检查 g_stop_requested
    for (int i = 0; i < ready; ++i) {
        int fd = events[i].data.fd;
        char buf[1024];
        while (true) {
            ssize_t n = ::read(fd, buf, sizeof(buf));
            if (n > 0) { /* 追加到该连接的接收缓冲 */ continue; }
            if (n == 0) { ::close(fd); break; } // 对端关闭 (EOF)
            if (errno == EAGAIN || errno == EWOULDBLOCK) break; // 本轮数据已排干
            if (errno == EINTR) continue;
            ::close(fd); break;
        }
    }
}
```

写好服务后，在普通用户目录下用 `systemd --user` 托管运行（无需 root）：

```ini
# ~/.config/systemd/user/logscan.service
[Unit]
Description=LogScan TCP Service

[Service]
ExecStart=%h/cpp-work/build/logscan_srv --port 9090
Restart=on-failure
KillSignal=SIGTERM
TimeoutStopSec=10

[Install]
WantedBy=default.target
```

常用运维命令：`systemctl --user daemon-reload && systemctl --user start logscan`、查看状态 `systemctl --user status logscan`、实时看标准输出/错误日志 `journalctl --user -u logscan -f`。

## 工程排错与反例速查

| 场景 | 命令 | 看什么 |
| --- | --- | --- |
| 看服务进程还在不在、占多少内存 | `ps aux \| grep logscan` | PID、CPU%、RSS 物理内存 |
| 看进程现在打开了哪些文件 | `ls -l /proc/<PID>/fd` | 查文件描述符有没有泄露 |
| 查打不开文件/连接被拒的真实原因 | `strace -f ./app` | 看哪一个系统调用返回 `-1` 和 `errno` |
| 崩溃停在哪一行 | `gdb ./app` → `run` → `bt` | 函数调用栈与崩溃行号 |

**1 行反例陷阱**：
- `2>&1 > out.log` → 错误顺序！stderr 仍打到屏幕，只有 stdout 进了文件；正确写法是 `> out.log 2>&1`。
- `pipe(fds)` 后 `fork()`，父进程只调 `read(fds[0])` 忘了 `close(fds[1])` → 写端引用计数永远不为 `0`，`read` 死等不到 `EOF`。
- `fork()` 后子进程 `execve()` 失败却写了 `return 1` 或 `exit(1)` → 会冲刷父进程继承的 `FILE*` 缓冲区导致日志/输出重复两遍；正确写法是 `::_exit(127)`。
- `mmap(nullptr, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0)` 直接对空文件或非页对齐偏移调用 → 立刻返回 `MAP_FAILED` (`EINVAL`)；若映射文件被外部截短还会触发 `SIGBUS` 崩溃。
- 在 `SIGINT`/`SIGTERM` handler 里打印 `std::cerr << "bye\n"` → 非异步信号安全，高并发下随机死锁或崩溃。

## 本课常见报错急救室

| 报错现象 / 关键字 | 一句话根因 | 精准修复命令 / 写法 |
| --- | --- | --- |
| `openat(...) = -1 EACCES (Permission denied)` | 目标文件缺权限、沿途父目录缺少 `x` 搜索位，或项目放在 `/mnt/c` 跨盘权限异常。 | `ls -ld <各级目录> <文件>` 核对 `x`/`r` 位，执行 `chmod +x <目录>`，并把工程放在 `~/cpp-work`。 |
| 进程写入已断开的管道/Socket 后静默退出（退出码 `141`） | 向读端已关闭的通道写入触发内核 `SIGPIPE`（`128 + 13 = 141`），默认动作直接杀进程。 | 启动时设置 `std::signal(SIGPIPE, SIG_IGN);` 并检查 `write`/`send` 的 `errno == EPIPE`。 |
| `mmap failed: Invalid argument`（`EINVAL`） | 对 0 字节空文件传了 `length == 0`，或 `offset` 不是系统页大小（4096）的整数倍。 | 先 `fstat` 判 `st_size == 0` 跳过映射，并保证 `offset % sysconf(_SC_PAGESIZE) == 0`。 |
| `gdb` 里 `bt` 只显示 `0x00005555...` 十六进制地址 | 编译时漏加 `-g` 调试符号，或开了高优化导致内联折叠。 | `g++ -std=c++20 -g -O0 crash_demo.cpp -o crash_demo && gdb -ex run -ex bt ./crash_demo` |

## 6 个梯度微练习

### 练习 1（读 `strace`、`errno` 与权限边界）
线上同事说 `./logscan /srv/logs/app.log` 报错退出，你用 `strace` 看到：

```text
openat(AT_FDCWD, "/srv/logs/app.log", O_RDONLY) = -1 EACCES (Permission denied)
```

此时能否断定 `/srv/logs/app.log` 这个文件一定存在？如果把它改成 `chmod 644 /srv/logs/app.log` 后依然报 `EACCES`，最该检查哪里？另外，为什么不能先调 `std::cerr << "fail"` 再去读取 `errno`？

<details>
<summary>核对答案</summary>

1. **不能**直接断定末级文件一定存在。如果父目录 `/srv` 或 `/srv/logs` 缺少搜索位（`x` 权限），内核在路径遍历阶段就会返回 `EACCES`，根本到不了末级文件检查。用 `ls -ld /srv /srv/logs /srv/logs/app.log` 逐级核对目录的 `x` 位与文件 `r` 位。
2. 因为 `std::cerr << ...` 内部会触发 `write` 等系统调用或库调用，如果其中任意环节触动了 `errno`，原来的错误码就被覆盖丢失了。系统调用失败后必须**第一时间保存 `int saved = errno;`**。

</details>

### 练习 2（分析 `fd` 编号与管道重定向）
如果程序先打开 `a.log`（得到 `fd = 3`），再打开 `b.log`（得到 `fd = 4`），然后调用 `::close(3)` 把 `a.log` 关掉，紧接着又打开 `c.log`，Linux 通常会给 `c.log` 分配几号 `fd`？此外，在 Bash 里执行 `false | cat; echo $?` 与 `set -o pipefail; false | cat; echo $?` 输出分别是什么？

<details>
<summary>核对答案</summary>

`c.log` 通常分到 **`3`**（POSIX 规定 `open` 分配当前最小未用非负整数）。Bash 默认下 `false | cat` 输出 **`0`**（掩盖了 `false` 的失败）；开启 `pipefail` 后输出 **`1`**（取管道中最右一个非零退出码）。

</details>

### 练习 3（为什么 `gdb` 看不见行号？）
如果编译时只敲了 `g++ crash_demo.cpp -o crash_demo`（忘了加 `-g`），进 `gdb` 敲 `bt` 会发生什么？

<details>
<summary>核对答案</summary>

只能看到函数名和十六进制内存地址（如 `0x0000555555555169 in print_first(int const*) ()`），看不到具体 `.cpp` 文件名和行号，也无法用 `print` 打印局部变量名。调试构建务必带 `-g`。

</details>

### 练习 4（信号与 `epoll` 边沿触发陷阱）
某基于 `epoll` 的 TCP 服务端开启了 `EPOLLET`（边沿触发），但每次可读事件只调了一次 `recv(fd, buf, 64, 0)`。当客户端一次性发来 200 字节后不再发送新数据时，服务端会出现什么现象？如果此时向一个对端已 `close` 的 Socket 连续写两次，而服务端忘了忽略 `SIGPIPE`，又会发生什么？

<details>
<summary>核对答案</summary>

1. 第一次只读走 64 字节，缓冲区里还剩 136 字节；因为处于 `EPOLLET` 模式且没有新数据到达，**`epoll_wait` 不会再次通知**，剩余 136 字节会一直卡死在内核缓冲区里！必须将 `fd` 设为 `O_NONBLOCK` 并循环 `recv` 直到 `EAGAIN`。
2. 对端关闭连接后第一次写通常收到 RST，第二次再向已关闭管道/Socket 写时内核向进程发送 `SIGPIPE`，默认动作是**直接杀死进程**；服务端必须设置 `SIG_IGN` 忽略 `SIGPIPE` 并处理 `errno == EPIPE`。

</details>

### 练习 5（`fork/execve` 缓冲陷阱与 `SIGCHLD`/`SA_RESTART`）
1. 某进程执行 `std::cout << "start";`（**没有换行且未 `flush`**）后立刻 `fork()`，子进程随即 `execvp` 失败，于是子进程调用 `return 1;` 退出。标准输出会出现什么怪现象？怎么修？
2. 父进程用 `sigaction` 监听 `SIGCHLD`，如果处理器里只调用了**一次** `waitpid(-1, &st, WNOHANG)`，当 5 个子进程同一瞬间退出时会发生什么？如果给拦截 `SIGTERM` 的阻塞 `accept()` 注册了 `SA_RESTART`，又会发生什么？

<details>
<summary>核对答案</summary>

1. `"start"` 还在用户态 `stdio` 缓冲区里没有落到内核。`fork()` 把缓冲区也复制给了子进程，子进程 `return 1` 退出时会自动冲刷一遍缓冲区，父进程结束时又冲刷一遍——于是屏幕会打印**两遍 `"start"`**！修复方式：`fork()` 前必要时 `std::fflush(nullptr)`，且 `execvp` 失败后子进程**必须调 `::_exit(127)`**（跳过用户态 `stdio` 冲刷）。
2. 标准信号不会排队，5 个子进程同时退出可能合并成 1 次 `SIGCHLD`，只调一次 `waitpid` 会导致另外 4 个变成**僵尸进程（`Z`）**；必须用 `while (::waitpid(-1, &st, WNOHANG) > 0) {}` 排干。而给 `SIGTERM` 加了 `SA_RESTART` 会让阻塞在 `accept()`/`read()` 的系统调用被唤醒后立刻被内核自动重启，无法返回 `EINTR` 去检查退出标志，导致进程卡住不退出！

</details>

### 练习 6（WSL2 动手实操）
在 WSL2 Ubuntu 里完成以下四项验证并记录输出：
1. 跑通 `fd_demo.cpp` 的 `ENOENT`（`strace -e trace=openat`）与 `fd = 3`；
2. 编译运行 `io_loop_demo.cpp` 与 `spawn_demo.cpp`；
3. 跑通 `crash_demo.cpp` 的 `gdb` `bt` 调用栈；
4. 在 `mktemp -d` 建的本地临时目录里，用 `chmod -x` 封住子目录测试 `EACCES`，再用 `chmod +x` 恢复读取。

<details>
<summary>实操命令速查</summary>

```bash
d=$(mktemp -d)
mkdir "$d/sub" && echo "ok" > "$d/sub/f.txt"
chmod -x "$d/sub"
cat "$d/sub/f.txt"    # Permission denied (EACCES)
chmod +x "$d/sub"
cat "$d/sub/f.txt"    # ok
rm -rf "$d"
```

</details>
