---
title: "Linux 环境、进程与文件 I/O 基础"
description: "在 Windows 上用 WSL2 进入真实 Linux 开发环境，动手观察文件描述符、缓冲 I/O 与系统调用，并用 ps/strace/gdb 定位崩溃与权限问题。"
order: 70
tags: ["Linux", "WSL2", "进程", "文件I/O", "gdb", "strace"]
related: ["handbook/cli-testing", "handbook/concurrency-queue", "labs/logscan-service"]
sources: []
---

## 本课只解决这 1 个问题

写完单机命令行工具后，绝大多数 C++ 后端与系统工程项目最终都部署在 Linux 上。本课让你在 Windows 电脑上搭好轻量 Linux 环境（WSL2），**亲手用代码观察文件描述符、用 `strace` 看穿系统调用、用 `gdb` 抓出段错误崩溃现场**。

前置要求：已经完成 `LogScan v0.1` 多文件构建，会用基本终端命令。

## 第一步：在 Windows 上搭好 WSL2 Ubuntu

不需要装笨重的虚拟机。以管理员身份打开 PowerShell，执行一行命令安装 WSL2（默认安装 Ubuntu）：

```powershell
wsl --install
```

安装并重启电脑后，从开始菜单打开 **Ubuntu**，按提示设置用户名和密码，然后一次性装好 C++ 编译与诊断全家桶：

```bash
sudo apt update
sudo apt install -y g++ cmake ninja-build gdb strace
```

**路径与性能铁律**：
- 在 WSL 里访问 Windows 盘符是 `/mnt/d/...`，但**千万不要把大项目放在 `/mnt/d/` 下编译**（跨文件系统协议转换会让 CMake 编译慢 5~10 倍）。
- 在 Ubuntu 里建一个原生工作目录：`mkdir -p ~/cpp-work && cd ~/cpp-work`。

## 第二步：心智模型——进程与文件描述符（fd）

Linux 启动一个程序时，内核会为这个**进程**维护一张“打开的文件清单”，表里的整数编号叫**文件描述符（fd, file descriptor）**：

```text
进程的文件描述符表：
  fd 0 ──→ 标准输入 (stdin)
  fd 1 ──→ 标准输出 (stdout，std::cout 往这里写)
  fd 2 ──→ 标准错误 (stderr，std::cerr 往这里写)
  fd 3 ──→ sample.log       (新打开的第一个文件通常分到 3)
  fd 4 ──→ output.db        (下一个打开的文件分到 4)
```

### 动手实验：用 C++ 直接调用 Linux 系统调用打开文件

在 `~/cpp-work` 新建 `fd_demo.cpp`（注意这是 Linux POSIX 接口，在 WSL Ubuntu 里编译）：

```cpp
#include <fcntl.h>    // open
#include <unistd.h>   // read, write, close
#include <iostream>
#include <cstring>

int main() {
    // 1. 直接向 Linux 内核申请打开文件（如果不存在就报错）
    int fd = ::open("test.txt", O_RDONLY);
    if (fd < 0) {
        std::cerr << "open 失败，错误码 errno=" << errno
                  << " (" << std::strerror(errno) << ")\n";
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
openat(AT_FDCWD, "test.txt", O_RDONLY) = -1 ENOENT (No such file or directory)
```

接着创建文件再跑一次：

```bash
echo "hello linux" > test.txt
./fd_demo
```

此时输出 `成功打开文件，内核分配的 fd = 3`（因为 `0/1/2` 已经被标准输入/输出/错误占用了）。

<details>
<summary>深入一步：为什么平时用 std::ifstream 而不是直接调 read()？</summary>

1. **缓冲优化**：每次调用 `::read()` 都是一次用户态到内核态的切换（系统调用开销）。`std::ifstream` 会在用户态先申请一块 4KB~8KB 的缓冲区，一次系统调用读一大块，再逐行 `getline` 切给你，速度比 1 字节 1 字节调 `::read()` 快几个数量级。
2. **RAII 安全**：直接用 `int fd` 如果中途 `return` 或抛异常，很容易忘了 `::close(fd)`，导致进程打开文件数达到上限后报错 `Too many open files`；而 `std::ifstream` 离开作用域自动关闭。

</details>

## 第三步：用 `gdb` 抓出段错误（Segmentation Fault）崩溃现场

程序在 Linux 上最吓人的报错就是一句冰冷的 `Segmentation fault (core dumped)`，连哪一行炸的都不告诉你。学会用 `gdb` 两分钟就能定位到具体行号。

新建 `crash_demo.cpp`，故意写一个解引用空指针的崩溃：

```cpp
#include <iostream>
#include <vector>

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

进入 `gdb` 交互界面后，依次敲 3 个命令：
1. `run`：启动程序，它会在崩溃那一行立刻停住。
2. `bt`（backtrace）：打印完整函数调用栈，你会清楚看到 `main` 调用了 `print_first`，并精确停在 `*ptr` 那一行。
3. `print ptr`：查看当时指针的值，显示 `0x0`（空指针）。
4. `quit`：退出调试器。

## 4 个工程排错必会命令速查

| 场景 | 命令 | 看什么 |
| --- | --- | --- |
| 看服务进程还在不在、占多少内存 | `ps aux \| grep logscan` | PID、CPU%、RSS 物理内存 |
| 看进程现在打开了哪些文件 | `ls -l /proc/<PID>/fd` | 查文件描述符有没有泄露 |
| 查打不开文件/连接被拒的真实原因 | `strace -f ./app` | 看哪一个系统调用返回 `-1` 和 `errno` |
| 崩溃停在哪一行 | `gdb ./app` → `run` → `bt` | 函数调用栈与崩溃行号 |

## 4 个微练习

### 练习 1（读 `strace` 输出判原因）

线上同事说 `./logscan /var/log/app.log` 报错退出，你用 `strace` 看到：

```text
openat(AT_FDCWD, "/var/log/app.log", O_RDONLY) = -1 EACCES (Permission denied)
```

文件到底存不存在？是什么原因打不开？

<details>
<summary>核对答案</summary>

文件存在（如果不存在错误码是 `ENOENT`），但当前运行程序的用户**没有读取权限**（`EACCES`）。

</details>

### 练习 2（分析 `fd` 编号）

如果程序先打开 `a.log`（得到 `fd = 3`），再打开 `b.log`（得到 `fd = 4`），然后调用 `::close(3)` 把 `a.log` 关掉，紧接着又打开 `c.log`，Linux 通常会给 `c.log` 分配几号 `fd`？

<details>
<summary>核对答案</summary>

通常是 **`3`**。POSIX 规定 `open` 总是分配当前**最小未被使用的非负整数**作为文件描述符。

</details>

### 练习 3（为什么 `gdb` 看不见行号？）

如果编译时只敲了 `g++ crash_demo.cpp -o crash_demo`（忘了加 `-g`），进 `gdb` 敲 `bt` 会发生什么？

<details>
<summary>核对答案</summary>

只能看到函数名和十六进制内存地址（如 `0x0000555555555169 in print_first(int const*) ()`），看不到具体 `.cpp` 文件名和行号，也无法用 `print` 打印局部变量名。调试构建务必带 `-g`。

</details>

### 练习 4（动手实操）

在 WSL2 Ubuntu 里完成上面的 `fd_demo.cpp` 和 `crash_demo.cpp` 实验，亲眼跑出 `ENOENT`、`fd = 3` 以及 `gdb` 里的 `bt` 调用栈。
