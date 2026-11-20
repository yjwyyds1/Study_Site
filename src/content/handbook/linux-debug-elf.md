---
title: "Linux 排错深潜：/proc、动静态库、ELF 剖析、strace/ltrace 与 GDB/perf"
description: "系统掌握 LNX-47 至 LNX-52：/proc 虚拟文件系统与 ulimit 资源上限、静态库 .a 与动态库 .so 构建及 RPATH、file/strings/nm/readelf/objdump ELF 剖析、strace 与 ltrace 追踪、LD_PRELOAD 符号拦截原理，以及 Core Dump、GDB 现场回溯与 perf 热点性能分析。"
order: 77
category: "Linux 实践"
tags: ["Linux", "proc", "ELF", "静态库", "动态库", "strace", "ltrace", "LD_PRELOAD", "gdb", "perf"]
related: ["handbook/linux-process-io", "handbook/linux-perm-admin", "handbook/linux-net-ops", "handbook/track-server-perf"]
sources: []
---

## 本课只解决这 1 个问题

线上一个**没有源码、或者已经崩溃退出**的 C++ 二进制程序出了故障：要么启动时直接报 `error while loading shared libraries: libfoo.so: cannot open shared object file`；要么运行中莫名卡死不打印任何日志；要么半夜突然 `Segmentation fault (core dumped)` 挂掉；要么上线后 CPU 飙到 100% 却不知道热点究竟在哪一行函数里。

本课覆盖 **LNX-47 至 LNX-52**，带你从操作系统底层视角打通 Linux 二进制诊断工具链：用 **`/proc` 与 `ulimit`** 透视进程状态、掌握 **`.a` 静态库与 `.so` 动态库** 的构建与查找顺序、用 **`readelf`/`nm`/`objdump`** 解剖 ELF 文件、用 **`strace`/`ltrace` + `LD_PRELOAD`** 透视系统与库调用，最后用 **Core Dump + `gdb` + `perf`** 精准拿捏崩溃现场与 CPU 热点。

前置要求：熟悉 C++ 编译链接流程（`.cpp -> .o -> 可执行文件`）与基础系统调用概念（可对照[Linux 系统调用、文件描述符与进程 I/O](../linux-process-io/)）。

## 阅读路线与诊断工具地图

| 编号 | 主题 | 解决哪一类工程黑盒问题 | 核心命令 / 接口 |
| :---: | --- | --- | --- |
| **LNX-47** | `/proc` 与 `ulimit` | 查运行中进程打开的 FD、内存映射、真实命令行与文件上限 | `/proc/PID/*`, `/proc/meminfo`, `ulimit -a/-n/-c` |
| **LNX-48** | 静态库 `.a` 与动态库 `.so` | 解决链接顺序报错与运行期找不到 `.so` 库问题 | `ar`, `-fPIC -shared`, `ldd`, `LD_LIBRARY_PATH`, `-Wl,-rpath` |
| **LNX-49** | ELF 二进制剖析 | 不看源码查二进制依赖、导出符号、调试段与反汇编指令 | `file`, `strings`, `nm -C`, `readelf`, `objdump` |
| **LNX-50** | `strace` 系统调用追踪 | 定位找不到文件（`ENOENT`）、没权限（`EACCES`）、连不上（`ECONNREFUSED`）与死锁卡死 | `strace -f -e trace=file,network -o` |
| **LNX-51** | `ltrace` 与 `LD_PRELOAD` | 追踪动态库函数调用（`malloc`/`strcmp`），用符号拦截做 Hook/Mock | `ltrace`, `LD_PRELOAD`, `dlsym(RTLD_NEXT, ...)` |
| **LNX-52** | Core Dump、`gdb` 与 `perf` | 事后还原崩溃现场调用栈，量化计时与定位 CPU 热点函数 | `ulimit -c`, `coredumpctl`, `gdb`, `time`, `perf` |

---

## 一、`/proc` 虚拟文件系统与 `ulimit` 资源限制（LNX-47）

`/proc`（procfs）并不是硬盘上的真实文件夹，而是 **Linux 内核在内存中实时生成的虚拟文件系统**：你用 `cat` 或 `ls` 读里面的文件时，内核会即时把当前进程控制块、内存页表或硬件统计表翻译成文本吐给你（所以在 `ls -l /proc/meminfo` 中文件大小常常显示为 `0`）。

### 1. 透视任意运行中进程：`/proc/<PID>/`（当前进程可用 `/proc/self/`）

| 路径 | 内容本质 | 经典排错用途 |
| --- | --- | --- |
| **`/proc/<PID>/fd/`** | 指向进程当前打开的所有文件描述符的符号链接 | 查 FD 泄露；看到 `pipe:[12345]`、`socket:[67890]` 或 `(deleted)` |
| **`/proc/<PID>/fdinfo/<n>`** | `n` 号 FD 的底层打开状态（`pos:` 偏移、`flags:` 标志） | 查看大文件解析进度跑到第几字节、FD 是否带 `O_NONBLOCK` |
| **`/proc/<PID>/maps`** | 进程完整的虚拟地址空间映射布局 | 查内存泄露、确认加载了哪个路径的 `.so`、看 `[heap]` / `[stack]` 范围 |
| **`/proc/<PID>/status`** | 人类可读的进程状态总览 | 查 `State`、`Threads`（线程数）、`VmRSS`（真实物理内存）、`VmSwap`、`SigBlk` |
| **`/proc/<PID>/cmdline`** | 启动时的完整 `argv[]` 参数（**以 `\0` 空字节分隔！**） | 确认服务实际生效的命令行参数 |
| **`/proc/<PID>/cwd`** / **`exe`** | 指向当前工作目录与可执行程序本体的符号链接 | 排查相对路径基准目录不对，或程序升级后是否还在跑旧二进制 `(deleted)` |

```bash
# 读取 cmdline 时，直接 cat 会把所有参数粘在一起，必须把 \0 替换成空格！
tr '\0' ' ' < /proc/self/cmdline; echo

# 查看进程内存映射（段地址  权限  偏移  设备  inode  映射路径）
head -n 10 /proc/self/maps
# 55a1b2c00000-55a1b2c04000 r--p 00000000 08:01 131090   /usr/bin/head
# 55a1b2c04000-55a1b2c0c000 r-xp 00004000 08:01 131090   /usr/bin/head  <-- 代码段 r-xp
# 55a1b2c0e000-55a1b2c10000 rw-p 0000d000 08:01 131090   /usr/bin/head  <-- 全局数据 rw-p
```

系统级健康信息也全在 `/proc` 根目录：
- `/proc/meminfo`：比 `free` 更精细的内核账本（`MemTotal`、`MemAvailable`、`Buffers`、`Cached`、`Dirty` 待刷盘脏页、`Slab` 内核对象缓存）。
- `/proc/cpuinfo` & `/proc/loadavg`：CPU 型号核心与瞬时负载/运行队列（如 `2/185` 表示 2 个任务可运行 / 共 185 个调度实体）。

### 2. `ulimit` 进程资源上限：为什么服务并发一高就报 `EMFILE`？

Linux 为防止单个失控进程吃光系统资源，对每个 Shell 及其派生子进程设定了软限制（Soft Limit，`-S`）和硬限制（Hard Limit，`-H`）：

```bash
ulimit -a               # 查看当前全部资源上限
ulimit -n               # 查看最大可打开文件描述符数量 (nofile)，Ubuntu 默认常为 1024！
ulimit -n 65535         # 在当前会话把软上限提高到 65535（不可超过硬上限）
ulimit -c               # 查看 Core Dump 核心转储文件大小上限（默认常为 0 = 禁用！）
ulimit -c unlimited     # 开启无限大小 Core Dump（调崩溃现场必跑！）
```

> [!WARNING]
> **高并发服务必踩的 `1024` 坑**：
> 在 Shell 里直接起一个 TCP 服务端，默认 `ulimit -n` 往往只有 `1024`（扣掉 `0/1/2`、日志文件、epollfd 后，最多同时接大约 `1015` 个连接就会在 `accept()` 时报错 `Too many open files` (`EMFILE`)！）。
> - `ulimit -n` 只对**当前 Shell 及其之后启动的子进程**生效。
> - 长期生效需在 `/etc/security/limits.conf` 配置，或者在 `systemd` 的 `.service` 中直接写 `LimitNOFILE=65535`。

---

## 二、静态库 `.a` 与动态库 `.so`（LNX-48）

写多文件 C++ 工程时，复用代码通常会打包成库文件。Linux 下只有两大家族：

| 对比维度 | 静态库（Static Library, `.a`） | 动态共享库（Shared Object, `.so`） |
| --- | --- | --- |
| **本质** | 一堆 `.o` 目标文件的归档压缩包（类似 `.tar`） | 完整的 ELF 共享二进制，支持多进程共享同一份物理代码页 |
| **链接时机** | **编译链接期**直接把被用到的 `.o` 拷贝进最终可执行文件 | 编译期只记录“依赖声明”，**运行期**由动态链接器 `ld-linux-x86-64.so.2` 装载 |
| **产物体积与部署** | 可执行文件较大，但**零外部库依赖**，拷到同架构机器就能跑 | 可执行文件很小，但运行时必须找得到对应的 `.so` |
| **修复库 Bug** | 必须重新链接发布所有依赖它的程序 | 只要 ABI 兼容，替换系统里的 `.so` 重启服务即可生效 |

### 1. 动手实战：亲手编出 `.a` 与 `.so`

先准备一个极简库 `calc.hpp` / `calc.cpp` 和主程序 `app.cpp`：

**`calc.hpp`：**

```cpp
// calc.hpp
#pragma once
int add_fast(int a, int b);
```

**`calc.cpp`：**

```cpp
// calc.cpp
#include "calc.hpp"
int add_fast(int a, int b) { return a + b; }
```

**`app.cpp`：**

```cpp
// app.cpp
#include "calc.hpp"
#include <iostream>
int main() {
    std::cout << "result = " << add_fast(20, 22) << '\n';
    return 0;
}
```

#### 构建与链接静态库 `libcalc.a`

```bash
# 1. 编译成目标文件 .o
g++ -std=c++20 -c calc.cpp -o calc.o
# 2. 用 ar 打包成静态库（命名必须以 lib 开头、.a 结尾，r=替换, c=创建, s=建符号索引）
ar rcs libcalc.a calc.o
# 3. 链接生成可执行文件（注意 -L. 指定库搜索目录，-lcalc 会自动找 libcalc.a）
g++ -std=c++20 app.cpp -L. -lcalc -o app_static
./app_static
```

> [!IMPORTANT]
> **经典链接顺序坑**：链接静态库时，GNU `ld` 从左到右扫描文件！如果你把 `-lcalc` 写在 `app.cpp` **前面**（`g++ -lcalc app.cpp`），链接器扫到 `libcalc.a` 时还不知道谁需要 `add_fast`，会直接跳过里面的 `.o`，紧接着扫 `app.cpp` 就会报 **`undefined reference to 'add_fast(int, int)'`**！**调用者永远写在被依赖库的前面**。

#### 构建与链接动态库 `libcalc.so`

```bash
# 1. 编译动态库必须加 -fPIC（Position-Independent Code，位置无关代码）！
g++ -std=c++20 -fPIC -c calc.cpp -o calc_pic.o
# 2. 用 -shared 生成 .so
g++ -shared -o libcalc.so calc_pic.o
# 3. 链接生成动态版本可执行文件
g++ -std=c++20 app.cpp -L. -lcalc -o app_shared
```

现在直接运行 `./app_shared`，你会立刻撞上全 Linux 最经典的报错：

```text
./app_shared: error while loading shared libraries: libcalc.so: cannot open shared object file: No such file or directory
```

用 **`ldd ./app_shared`** 一查便知原因：

```bash
$ ldd ./app_shared
        linux-vdso.so.1 (0x00007fff...)
        libcalc.so => not found
        libstdc++.so.6 => /lib/x86_64-linux-gnu/libstdc++.so.6 (...)
```
为什么编译时明明给了 `-L.` 找得到，运行时却 `not found`？因为 **`-L.` 只管编译链接期，不管运行期！**

### 2. 运行时动态库查找顺序与三种解法

Linux 动态链接器 `ld-linux.so` 在运行时按如下优先级寻找 `.so`：
1. 编译时写入二进制里的 **`DT_RPATH`**（若无 `RUNPATH`）；
2. 环境变量 **`LD_LIBRARY_PATH`**（开发调试最常用）；
3. 编译时写入二进制里的 **`DT_RUNPATH`**（现代 GCC `-Wl,-rpath` 默认写这个）；
4. 系统动态库缓存 **`/etc/ld.so.cache`**（由 `/etc/ld.so.conf.d/*.conf` 配合 **`sudo ldconfig`** 生成）；
5. 默认系统目录 `/lib`、`/usr/lib`。

对应三种工程解法：
- **临时测试（最快）**：`LD_LIBRARY_PATH=. ./app_shared`
- **发布独立绿色软件（强烈推荐！用 `'$ORIGIN'` 相对路径写死在程序里）**：
  ```bash
  # '$ORIGIN' 是动态链接器识别的特殊变量，代表可执行文件自己所在的目录！
  g++ -std=c++20 app.cpp -L. -lcalc -Wl,-rpath,'$ORIGIN' -o app_portable
  ldd ./app_portable
  # libcalc.so => /home/alice/cpp-work/./libcalc.so (0x00007f...)
  ```
- **系统级部署**：把 `.so` 拷进 `/usr/local/lib/` 并执行 `sudo ldconfig` 刷新缓存。

---

## 三、ELF 二进制剖析：`file`、`strings`、`nm`、`readelf`、`objdump`（LNX-49）

Linux 下的可执行文件、`.o` 目标文件、`.so` 动态库以及 Core Dump 转储，遵循同一种格式标准——**ELF（Executable and Linkable Format）**。下面 5 把手术刀让你在不看源码的情况下看穿任何二进制文件：

### 1. 五大 ELF 工具实战速查

| 工具 | 常用命令 | 核心用途与看点 |
| --- | --- | --- |
| **`file`** | `file ./app_shared` | 1 秒看清：64位还是32位（x86-64/ARM64）、动态链接还是静态链接（`dynamically linked`）、是否含调试信息（`with debug_info`）、是否被 `strip` 剥离了符号（`not stripped` / `stripped`） |
| **`strings`** | `strings ./app_shared \| grep result` | 暴力提取二进制里所有可打印 ASCII/UTF-8 字符串（快速查硬编码配置路径、编译版本号、报错提示语） |
| **`nm`** | `nm -C ./app_static` / `nm -CD ./libcalc.so` | 列出符号表（加 **`-C`** 自动把 C++ 修饰名 `_Z8add_fastii` 还原为 `add_fast(int, int)`；查 `.so` 导出表用 `-D`） |
| **`readelf`** | `readelf -h/-S/-d ./app_shared` | 最权威的 ELF 结构解析器（不依赖 BFD）：看文件头、节区表、动态库依赖和 `RUNPATH` |
| **`objdump`** | `objdump -d -C ./app_shared` | 反汇编机器码（`-d` 反汇编代码段，`-C` 还原 C++ 名，若带 `-g` 可加 `-S` 把源码和汇编交错对照） |

### 2. 看懂 `nm -C` 的符号字母与 `readelf` 关键段

```bash
$ nm -C ./app_static | grep -E 'add_fast|main|cout'
0000000000001189 T main
00000000000011c4 T add_fast(int, int)
                 U std::cout
```

- **`T` / `t`**：位于 `.text` 代码段的**已定义函数**（大写全局可见，小写 `static` 内部可见）。
- **`U`**：**Undefined（未定义符号）**——本文件调用了它，必须在其他 `.o`、`.a` 或 `.so` 里找到实现！链接报 `undefined reference` 时，用 `nm -C` 查两边就能一秒抓包。
- **`D` / `B` / `R`**：已初始化全局变量（`.data`）、未初始化全局变量（`.bss`）、只读常量（`.rodata`）。
- **`W`**：弱符号（Weak symbol，如 C++ 模板实例化/内联函数，多份存在时链接器合并去重而不报重定义）。

再用 **`readelf`** 透视 ELF 骨架：

```bash
readelf -h ./app_shared   # ELF Header：看 Class (ELF64)、Type (DYN 代表 PIE 位置无关可执行文件或 .so)、Entry point
readelf -S ./app_shared   # Section Headers：看 .text(指令)、.rodata(常量)、.data、.bss、.plt/.got(动态跳板)、.debug_info(调试信息)
readelf -d ./app_portable # Dynamic Section：精准看 NEEDED 依赖哪些库，以及 RUNPATH 是什么！
```

```text
Dynamic section at offset 0x2db8 contains 28 entries:
  Tag        Type                         Name/Value
 0x0000000000000001 (NEEDED)             Shared library: [libcalc.so]
 0x0000000000000001 (NEEDED)             Shared library: [libstdc++.so.6]
 0x000000000000001d (RUNPATH)            Library runpath: [$ORIGIN]
```

> [!TIP]
> 遇到 C++ 链接报错里出现一串乱码 `_ZNKSt7__cxx1112basic_string...` 时，不用手动猜，直接喂给 **`c++filt _ZNKSt7...`** 即可瞬间还原为可读的 C++ 函数签名！

---

## 四、用 `strace` 跟踪系统调用（LNX-50）

**`strace` 是 Linux 黑盒排错的核武器**：不需要源码、不需要 `-g` 调试符号、甚至不需要重新编译，它通过内核 `ptrace` 机制拦截目标进程进出内核的**每一次系统调用**、传入参数、返回值、错误码 `errno` 以及耗时。

### 1. `strace` 常用参数表

| 参数 | 作用与工程意义 |
| --- | --- |
| **`-f`** | **必带**：同时跟踪 `fork`/`clone` 出来的子进程与多线程（否则父进程拉起子进程就看不见了！） |
| **`-p <PID>`** | 挂载到**已经在运行**的线上进程上实时观察（按 `Ctrl+C` 安全脱离，不会杀掉目标进程） |
| **`-e trace=...`** | 过滤只看哪类调用：`file`（所有带路径调用）、`network`（`socket/connect/bind/sendto`）、`process`（`fork/exec/wait/exit`），或具体名字 `openat,read,write` |
| **`-o trace.log`** | 把海量跟踪输出写到文件，避免和程序自己的终端输出混在一起 |
| **`-s 256`** | 默认只打印字符串前 32 字符！调大到 `256` 才能看全长文件路径或 HTTP 请求文本 |
| **`-T` / `-tt`** | `-T` 在每行末尾打印该次调用耗时（秒）；`-tt` 打印微秒级时间戳 |
| **`-c`** | 不逐行打印，退出时输出一份**系统调用耗时与出错次数统计汇总表** |

### 2. 三大经典故障的 `strace` 实景破案

```bash
strace -f -e trace=file,network -s 256 -o /tmp/debug.strace ./my_app
```

1. **配置不知道去哪找了（`ENOENT`）**：
   ```text
   openat(AT_FDCWD, "/etc/my_app/config.yaml", O_RDONLY) = -1 ENOENT (No such file or directory)
   openat(AT_FDCWD, "/home/alice/.config/my_app.yaml", O_RDONLY) = -1 ENOENT (No such file or directory)
   ```
   不用翻源码，直接看出了程序按什么先后顺序搜了哪些路径！
2. **权限不够（`EACCES`）**：
   ```text
   bind(3, {sa_family=AF_INET, sin_port=htons(80), ...}, 16) = -1 EACCES (Permission denied)
   ```
   一眼看出普通用户试图绑定 `< 1024` 特权端口被内核拒绝。
3. **连接被拒 vs 超时（`ECONNREFUSED` vs `ETIMEDOUT`）**：
   ```text
   connect(4, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("127.0.0.1")}, 16) = -1 ECONNREFUSED (Connection refused)
   ```
   `ECONNREFUSED` 说明本机连到该端口后直接收到内核回的 TCP RST（目标服务没起或端口写错）；若卡在 `connect(...)` 几十秒不动最后返回 `ETIMEDOUT`，则是远端防火墙 `DROP` 或网络不通。
4. **进程“假死不动”现场急救**：执行 `sudo strace -f -p <卡死PID>`，如果屏幕停在一行 `futex(0x55..., FUTEX_WAIT_PRIVATE, ...)` 动也不动，说明多半发生了**互斥锁死锁**；如果停在 `read(3, ...)`，则是在死等管道或网络对端数据。

---

## 五、库调用追踪（`ltrace`）与动态预加载（`LD_PRELOAD`）（LNX-51）

### 1. `ltrace` vs `strace`：追踪完全不同的边界

新手常分不清这两个长相相似的工具：
- **`strace`**：站在**用户态与内核态之间**，拦截**系统调用**（`openat`, `read`, `write`, `brk`, `mmap`）。
- **`ltrace`**：站在**主程序与动态库（`.so`）之间**，利用 PLT/GOT 动态链接跳板拦截**用户态库函数调用**（`malloc`, `free`, `strlen`, `strcmp`, `fopen`, `printf`）。

```bash
# 看看 ./app_shared 调用了哪些动态库函数（-C 还原 C++ 符号，-f 跟踪子进程）
ltrace -C -f ./app_shared
```

为什么有时候 `printf("a"); printf("b");` 会看到 `ltrace` 抓到**两次** `printf`，而 `strace` 只抓到**零次或一次** `write`？因为 `printf` 是用户态 `libc` 的带缓冲库函数，攒满缓冲区才会触发一次真正的 `write` 系统调用！
*(注意：`ltrace` 只能拦截经过动态链接跳板的调用；对于完全静态编译的二进制，或者编译器内联优化掉的简单函数，`ltrace` 是抓不到的。)*

### 2. `LD_PRELOAD` 动态预加载：不改一行代码劫持库函数

既然动态链接器在启动程序时负责把各个 `.so` 里的函数地址填进程序里，如果我们告诉链接器：“**不管怎样，先加载我自己的 `hook.so`！**”——这就是 **`LD_PRELOAD`**。

只要你的 `hook.so` 里定义了一个与 `libc` 同名的函数（比如 `time` 或 `malloc`），程序就会优先绑定你的版本！而且你还可以通过 `dlopen`/`dlsym(RTLD_NEXT, ...)` 找到后面的真实系统实现。

#### 动手实验：用 15 行代码在不重新编译目标程序的情况下记录/Mock 时间

写一个极简拦截库 `hook_time.c`（保存为 `.cpp` 也可用 `extern "C"`）：

```cpp
// hook_time.cpp：拦截标准库 time(NULL) 总是返回固定时间，实现零侵入测试时间旅行
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <dlfcn.h>
#include <ctime>
#include <cstdio>

extern "C" time_t time(time_t* tloc) {
    // 若想转发给真正的 libc 实现，可这样获取原函数指针：
    using RealTimeFn = time_t (*)(time_t*);
    auto real_time = reinterpret_cast<RealTimeFn>(::dlsym(RTLD_NEXT, "time"));
    time_t real_val = real_time ? real_time(nullptr) : 0;

    std::fprintf(stderr, "[LD_PRELOAD] 拦截到 time() 调用 (真实=%ld, 伪造=1700000000)\n",
                 static_cast<long>(real_val));
    time_t fake = 1700000000;
    if (tloc) *tloc = fake;
    return fake;
}
```

```bash
# 1. 编译拦截库（需链接 -ldl）
g++ -std=c++20 -fPIC -shared hook_time.cpp -o libhook_time.so -ldl

# 2. 不修改系统里的 python3 或任何程序，直接用 LD_PRELOAD 注入运行！
LD_PRELOAD=./libhook_time.so python3 -c "import time; print('app got:', int(time.time()))"
```

**工程里的真实用途与安全红线**：
- **工程用途**：无侵入替换高性能内存分配器（`LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so ./server`）、内存泄漏追踪、故障注入测试（故意让某次 `malloc` 返回 `nullptr`）。
- **安全红线**：如果一个可执行文件带有 **`SUID`/`SGID`** 特殊权限（如 `/usr/bin/sudo`、`/usr/bin/passwd`），Linux 动态链接器会**自动无视 `LD_PRELOAD` 和 `LD_LIBRARY_PATH`**，防止普通用户通过预加载恶意 `.so` 劫持 `root` 进程提权！

---

## 六、Core Dump、GDB 崩溃现场回溯与 `perf` 热点剖析（LNX-52）

### 1. 让程序崩溃时吐出“黑匣子”：Core Dump 配置与收集

程序在半夜崩溃时，现场已经没了，不可能对着屏幕现挂 `gdb`。我们需要内核在进程收到致命信号（如 `SIGSEGV`、`SIGABRT`、`SIGBUS`）的瞬间，把进程当时的**全部内存镜像、寄存器状态和调用栈**保存成一个 **Core Dump** 文件。

两步开启：
1. **解除大小限制**：`ulimit -c unlimited`（或 systemd 服务里配置 `LimitCORE=infinity`）。
2. **确认 Core 文件落在哪里**：查看 `/proc/sys/kernel/core_pattern`：
   - 如果是传统路径（如 `core` 或 `/tmp/core.%e.%p`），崩溃后直接在当前目录或 `/tmp/` 找 `core.*` 文件，用 `gdb ./app core.12345` 打开。
   - 如果是现代 Ubuntu/Debian 桌面与服务器常用的 **`systemd-coredump`**（`core_pattern` 为 `|/usr/lib/systemd/systemd-coredump ...`），用 **`coredumpctl`** 管理：
     ```bash
     coredumpctl list                    # 列出历史所有崩溃记录与 PID
     coredumpctl debug                   # 直接用 gdb 打开最近一次崩溃现场！
     coredumpctl dump -o ./crash.core    # 导出成普通 core 文件供离线分析
     ```

*(编译提示：线上发布版建议用 **`-O2 -g`** 编译——既享受优化性能，又保留行号与变量信息；若担心体积太大，可用 `objcopy --only-keep-debug app app.debug` 剥离调试符号单独存档。)*

### 2. GDB 事后验尸黄金 6 条命令

打开现场：`gdb ./app ./crash.core`（或现场挂载活进程：`sudo gdb -p <PID>`）：

| GDB 命令 | 作用 | 排查价值 |
| --- | --- | --- |
| **`bt`** / **`bt full`** | 打印崩溃线程的函数调用栈（`full` 连带打印每层局部变量） | 第一眼锁定炸在哪个函数、哪个 `.cpp` 第几行 |
| **`frame N`**（简写 `f N`） | 切换到第 `N` 层调用栈帧（比如从 `libc` 内部切回你自己的业务函数帧） | **`SIGABRT`/`abort()` 崩溃时第 0 帧往往在 `libc`，必须切到业务帧才能看传参！** |
| **`info locals`** / **`info args`** | 列出当前栈帧的所有局部变量与函数入参 | 快速核对下标、长度、状态标志 |
| **`p expr`**（如 `p *ptr`） | 打印任意变量、结构体字段或表达式值 | 查是不是空指针 `0x0`、野指针或越界索引 |
| **`list`** | 显示当前栈帧行号附近的 C++ 源代码 | 对照上下文逻辑 |
| **`info threads`** & **`thread apply all bt`** | 查看所有线程，并**一次性打印全部线程的调用栈** | **排查多线程死锁或哪个后台线程崩了的终极命令！** |

### 3. 量化耗时与 `perf` CPU 热点剖析

程序没崩但跑得慢，先量化“慢在用户态计算、内核态 I/O，还是纯粹在等锁睡觉”：

```bash
# 注意：使用功能完整的独立版 /usr/bin/time -v（不要用 bash 内置的简版 time）
/usr/bin/time -v ./my_app
```
看懂核心三组时间：
- **`real`（Wall-clock 墙钟时间）**：从启动到结束实际流逝的秒数。
- **`user`**：CPU 在用户态执行你代码的时间。
- **`sys`**：CPU 在内核态替你做系统调用（`read`/`write`/缺页中断）的时间。
- **两秒诊断法则**：
  - 如果 **`user + sys > real`**（例如 4 核跑满时 `user = 12s, real = 3.2s`）：说明多线程充分利用了多核并行计算。
  - 如果 **`real >> user + sys`**（比如 `real = 10s, user = 0.1s, sys = 0.1s`）：CPU 根本没干活！98% 的时间都在**阻塞等待**（磁盘 I/O、网络响应、`sleep` 或锁等待）。
  - 同时顺便看一眼 `Maximum resident set size (kbytes)`（进程峰值物理内存）和 `Major (requiring I/O) page faults`（主缺页次数）。

如果确认是 **`user` 或 `sys` CPU 算力吃满**，就请出 Linux 内核级采样剖析器 **`perf`**（安装：`sudo apt install linux-tools-common linux-tools-$(uname -r)`）：

```bash
# 1. 全局硬件计数器体检（看 IPC 每周期指令数、缓存未命中率、分支预测失败率、上下文切换）
perf stat ./my_app

# 2. 按 99Hz 采样记录带调用栈的 CPU 热点（DWARF 展开 C++ 调用链最准确）
perf record -F 99 -g --call-graph dwarf ./my_app
# 如果是线上正在跑的进程，采样 10 秒：
# sudo perf record -F 99 -g --call-graph dwarf -p <PID> -- sleep 10

# 3. 终端查看热点函数排行榜（--stdio 纯文本输出，不进交互界面）
perf report --stdio -n --sort comm,dso,symbol | head -n 40
```

读懂 `perf report` 里的两个百分比：
- **`Children`（Inclusive）**：该函数**及其调用的所有下层子函数**合计占用的 CPU 时间（`main()` 通常是 `100%`）。
- **`Self`（Exclusive）**：**真正死磕在这个函数自身指令里**的时间百分比！找性能瓶颈永远按 **`Self` 从大到小**揪出真正的 CPU 吞金兽。

*(提示：在部分 WSL2 或容器环境下运行 `perf` 若遇到权限受限，可检查 `/proc/sys/kernel/perf_event_paranoid`；若 WSL2 默认内核未带对应版本的 `perf` 二进制，可在 WSL2 确认内核版本或搭配使用 Google `gperftools` / `valgrind --tool=callgrind` 作为替代采样方案。)*

---

## 本课排错工具选型决策矩阵

| 你遇到的问题 | 别瞎猜，直接上这个工具 | 关键观察点 |
| --- | --- | --- |
| 运行报错缺动态库、或者怀疑加载错了旧版 `.so` | `ldd ./app` + `readelf -d ./app` | 看 `not found`、`NEEDED` 与 `RUNPATH` |
| 编译链接报 `undefined reference` | `nm -C` + 检查链接参数顺序 | 确认符号是 `T`（已定义）还是 `U`（缺实现），且依赖库写在调用者后面 |
| 启动立刻退出、打不开配置、连不上端口、或突然卡住 | `strace -f -e trace=file,network -s 256 ./app` | 盯住最后一个返回 `-1` 的系统调用与 `errno`（或卡死处如 `futex`/`read`） |
| 程序在内存里跑着，想看它到底打开了多少 FD/占多少内存 | `ls -l /proc/<PID>/fd` + `cat /proc/<PID>/status` | FD 数量逼近 `ulimit -n`？`VmRSS` 持续暴涨？ |
| 崩溃产生段错误或 `SIGABRT` | `ulimit -c unlimited` + `gdb ./app core` | `bt` -> `frame N` -> `p var` -> `thread apply all bt` |
| CPU 100% 跑得慢 | `/usr/bin/time -v` + `perf record -g` / `perf report` | 分清 CPU 算力瓶颈还是阻塞等待，按 `Self %` 找热点函数 |

---

## 6 个梯度微练习

### 练习 1（解读 `/proc` 与 `ulimit`）
某 C++ HTTP 服务压测到 1020 个并发连接时突然拒绝所有新客户端，日志里疯狂刷 `accept: Too many open files (errno=24)`。
1. 在不重启服务的前提下，用哪条 `/proc` 命令可以立刻核对它当前到底占了多少个 FD、分别指向什么？
2. 在重启修复前，用什么命令核对这个进程生效的文件描述符上限？如果在测试 Shell 里起服务，临时把上限调大到 `65535` 怎么写？

<details>
<summary>核对答案</summary>

1. 执行 `ls -l /proc/<PID>/fd | wc -l` 统计总打开 FD 数，再用 `ls -l /proc/<PID>/fd | head -n 30` 查看具体是大量 `socket:[...]` 还是未关闭的普通文件泄露。
2. 查看该进程实时生效的限制可直接 **`cat /proc/<PID>/limits`**（重点看 `Max open files` 一行的 Soft Limit 与 Hard Limit）。在启动测试服务的当前 Shell 中执行 **`ulimit -n 65535`** 即可临时调高；若是 `systemd` 服务则在 `.service` 中添加 `LimitNOFILE=65535`。

</details>

### 练习 2（静态库链接顺序与 `.so` 部署）
1. 同事写了命令 `g++ -L. -lmath main.cpp -o app` 试图链接静态库 `libmath.a`，结果报 `undefined reference to 'fast_hash'`，但用 `nm -C libmath.a` 明明能看到 `0000000000000000 T fast_hash`。哪里错了？
2. 当换成动态库 `libmath.so` 后，编译通过了，但把 `app` 和 `libmath.so` 一起拷到另一台机器的 `/opt/demo/` 目录下运行却报 `libmath.so: cannot open shared object file`。不依赖用户手动设置 `LD_LIBRARY_PATH`，编译时加什么链接参数就能让 `app` 自动从自己所在目录加载 `libmath.so`？

<details>
<summary>核对答案</summary>

1. **静态库在命令行里的位置放错了**：`main.cpp` 引用了 `libmath.a` 里的 `fast_hash`，必须把被依赖的库写在调用者后面：`g++ main.cpp -L. -lmath -o app`。
2. 编译时加上 **`-Wl,-rpath,'$ORIGIN'`**（若 `libmath.so` 放在同级 `lib/` 子目录下则写 `-Wl,-rpath,'$ORIGIN/lib'`），将相对加载路径写进 ELF 的 `RUNPATH` 中；可用 `readelf -d ./app` 验证。

</details>

### 练习 3（`nm`、`file` 与 `strace` 综合断案）
你拿到一个黑盒二进制 `./worker`：
- 运行 `file ./worker` 显示：`ELF 64-bit LSB pie executable, x86-64, dynamically linked, stripped`；
- 直接运行 `./worker` 立刻退出码 `1`，屏幕什么都没打印；
- 用 `strace -e trace=file ./worker` 看到最后几行是：
```text
openat(AT_FDCWD, "/etc/worker/license.key", O_RDONLY) = -1 ENOENT (No such file or directory)
exit_group(1) = ?
```
1. `file` 输出里的 `stripped` 说明什么？这会影响 `strace` 正常工作吗？
2. 为什么 `./worker` 静默退出？怎么快速验证让它继续往下走？

<details>
<summary>核对答案</summary>

1. `stripped` 表示该二进制的常规符号表（`.symtab`）和调试信息已被 `strip` 命令剥离（`nm ./worker` 会提示 `no symbols`，`gdb` 里也看不到函数名和行号，但动态符号表 `nm -D` 仍在）。**这完全不影响 `strace`**，因为 `strace` 拦截的是内核边界的系统调用，不依赖用户态符号表。
2. `./worker` 静默退出是因为它尝试打开 `/etc/worker/license.key` 失败（`ENOENT`）后未打印错误日志就直接 `exit(1)` 了。按路径创建或配置好 `/etc/worker/license.key` 即可定位并打通下一步。

</details>

### 练习 4（`ltrace` vs `strace` 与 `LD_PRELOAD` 安全边界）
1. 一段 C++ 程序循环调用了 1000 次 `std::strlen(s)` 和 1 次 `std::printf("done\n")`。为什么 `ltrace` 能看到 `strlen`（若未内联）和 `printf`，而 `strace` 里根本找不到 `strlen` 和 `printf` 这两个名字？
2. 某普通用户试图运行 `LD_PRELOAD=./evil.so /usr/bin/passwd` 来劫持 `passwd` 内部的函数，为什么 Linux 不会加载 `./evil.so`？

<details>
<summary>核对答案</summary>

1. `strlen` 和 `printf` 都是**用户态 C 标准库（`libc.so`）函数**，不是内核系统调用；`strlen` 全程在用户态内存循环完成，不进入内核；`printf` 在用户态格式化并写入缓冲后，底层触发的是名为 **`write`** 的系统调用，所以 `strace` 只看得到 `write`，看不到 `printf` 和 `strlen`。
2. `/usr/bin/passwd` 带有 **`SUID`** 权限位（所有者为 `root`）。Linux 动态链接器 `ld.so` 在启动 SUID/SGID 特权程序时进入安全模式（`AT_SECURE`），**会强制忽略 `LD_PRELOAD` 和 `LD_LIBRARY_PATH`**，防止低权限用户通过劫持动态库实现本地提权。

</details>

### 练习 5（Core Dump、`gdb` 帧切换与 `time` 解读）
1. 某多线程程序因为空指针解引用触发 `SIGSEGV` 崩溃，你拿到了 `core` 文件，进入 `gdb ./app core` 后发现：当前所在线程只是刚好停住，而另外某个后台线程才是真正崩溃的源头；或者停在了 `abort()` 内部第 0 帧。分别用哪两条 GDB 命令看清全局线程与切回你自己的业务代码栈帧？
2. `/usr/bin/time -v ./job` 输出：`real 0:12.50, user 0.25, sys 0.10`。如果你现在花大精力去把某段 C++ 算法从 $O(N^2)$ 优化成 $O(N)$，总耗时能降下来吗？为什么？

<details>
<summary>核对答案</summary>

1. 用 **`thread apply all bt`** 一次性打印所有线程的调用栈找出异常线程（或 `info threads` + `thread <id>` 切换）；在 `abort()` 栈里用 **`bt`** 看到你自己的业务函数所在帧号（比如 `#3`）后，执行 **`frame 3`** 切过去，再用 `info locals` / `p 变量名` 检查现场。
2. **几乎降不下来**！因为 `user + sys` 只有 `0.35` 秒，而墙钟时间 `real` 高达 `12.50` 秒——说明 97% 的时间程序都在**阻塞等待外部事件**（磁盘 I/O、网络请求、DNS 超时或 `sleep`/锁等待），而不是 CPU 计算瓶颈。此时应该上 `strace -T` 看究竟卡在哪个阻塞调用上，而不是瞎优化 CPU 算法。

</details>

### 练习 6（动手实操：完整走通 `.so` + `readelf` + `strace` + `gdb core`）
在 WSL2 Ubuntu 的 `~/cpp-work/elf_lab` 目录下动手完成四步闭环：
1. 按第二节代码编译 `libcalc.so` 与带 `-Wl,-rpath,'$ORIGIN'` 的 `app_portable`，并用 `ldd` 与 `readelf -d` 验证 `RUNPATH`；
2. 用 `nm -C libcalc.so` 与 `strings app_portable | grep result` 验证符号与字符串；
3. 跑通第五节的 `LD_PRELOAD=./libhook_time.so` 拦截实验；
4. 用 `ulimit -c unlimited` 跑一个故意解引用 `nullptr` 的 `-g` 程序，确认生成 core（或通过 `coredumpctl`），并用 `gdb` 的 `bt`、`frame 0`、`p ptr` 现场还原。

<details>
<summary>实操参考核对命令</summary>

```bash
mkdir -p ~/cpp-work/elf_lab && cd ~/cpp-work/elf_lab
# 完成 libcalc.so 与 app_portable 后检查：
readelf -d ./app_portable | grep -E 'NEEDED|RUNPATH'
nm -CD ./libcalc.so | grep add_fast

# 验证 Core Dump 生成（WSL2 若默认 core_pattern 为 'core' 会生成在当前目录）：
cat /proc/sys/kernel/core_pattern
ulimit -c unlimited
# 运行崩溃测试程序 ./crash_demo 后：
gdb -batch -ex "bt" -ex "frame 1" -ex "p ptr" ./crash_demo core*
```

</details>
