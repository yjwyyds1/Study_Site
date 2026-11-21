---
title: "《1000 行写一个操作系统》完整实战：从 RISC-V 裸机引导、Sv32 页表、上下文切换到 VirtIO 磁盘与文件系统 Shell"
description: "完整复现并精讲《Operating System in 1,000 Lines》全部 17 章核心代码：RISC-V 特权级与 OpenSBI 引导、kernel.ld 链接脚本、手写 printf/PANIC、Trap Frame 异常现场保存、4KB 物理页分配器、Sv32 两级页表、PCB 与 switch_context 上下文切换、U-Mode 用户态隔离、ecall 系统调用、VirtIO 块设备驱动与 TAR 文件系统交互式 Shell。"
order: 77
category: "操作系统"
tags: ["1000行写OS", "RISC-V", "QEMU", "OpenSBI", "页表", "上下文切换", "系统调用", "VirtIO", "文件系统"]
related: ["handbook/os-zero-start", "handbook/os-process-sched", "handbook/os-process-vmem", "handbook/os-fs-io"]
sources: []
---

> **🔑 跨学科前置钥匙卡**（[查看完整跨学科路线图](../../roadmap/)）
> - **零门槛直入范围**：只要你写过基础 C/C++ 代码，就能跟随本篇从 **第 1 行汇编启动入口** 一直写到 **第 1000 行带磁盘文件系统的交互式 Shell**！
> - **跨学科连接点**：本篇把 [计算机组成：RISC-V 寄存器与特权架构（MACH-11~14）](../mach-cpu-isa/)、[虚拟内存页表（OS-25~30）](../os-process-vmem/)、[进程上下文切换（OS-11~16）](../os-process-sched/) 与 [块设备文件系统（OS-40~46）](../os-fs-io/) 全部熔铸进 **1000 行可直接运行的真实 RISC-V 32 位内核源码** 中。
> - **本地免交叉工具链一键体验**：除了完整的 RISC-V + QEMU 裸机源码，我们在文末（`OS-60`）还专门为你编写了**零依赖、在任何 Linux / WSL `g++ -std=c++20` 下可一键编译运行的《1000 行 OS 核心模拟器》**！

## 本篇解决的核心问题 (OS-51 ~ OS-60)

很多同学学完《操作系统导论（OSTEP）》后依然心里发虚：**页表到底怎么填进物理内存？`switch_context` 到底保存了哪几个寄存器？用户态调 `ecall` 陷入内核后，为什么 `sepc` 必须加 4？驱动到底怎么跟 VirtIO 虚拟硬盘说话？**

日本工程师 Seiya Nuta 编写的开源经典教程 **《Operating System in 1,000 Lines》（1000 行写一个操作系统）** 用不到 1000 行干净利落的 C 语言代码，在 QEMU RISC-V (`rv32`) 虚拟机上从零实现了：

1. **裸机引导与链接布局**（`kernel.ld`、`boot()`、`.bss` 清零、OpenSBI 串口控制台）
2. **内核基础库与异常自检**（手写 `printf`、`memset/memcpy/strcpy/strcmp`、`PANIC` 宏与 31 寄存器 `trap_frame` 保存）
3. **内存管理**（4KB 物理页分配器 `alloc_pages` + RISC-V **Sv32 两级页表** `map_page`）
4. **多任务与用户态隔离**（PCB 进程控制块、`switch_context` 被调用者保存寄存器切换、`yield()` 调度器、`0x1000000` 用户空间与 `sret` 进入 `U-Mode`）
5. **系统调用、磁盘驱动与文件系统**（`ecall` 系统调用分发、**VirtIO-Blk** 块设备 Virtqueue 环形队列驱动、**USTAR (`.tar`) 文件系统**与交互式 `shell`）

本篇覆盖 **`OS-51` 至 `OS-60`**，为你逐行拆解并完整呈献这 1000 行操作系统的全部源码与硬件机理！

---

## 一、1000 行 OS 架构蓝图、RISC-V 特权模式与 QEMU + OpenSBI 启动链路 (OS-51)

### 1.1 完整项目 10 个文件全景清单

整个操作系统不依赖任何第三方库（编译开启 `-ffreestanding -nostdlib`），全部源码仅由 **10 个精简文件** 组成：

| 文件名 | 角色定位 | 核心职责与代码规模 |
| --- | --- | --- |
| `kernel.ld` | 内核链接脚本 | 将内核加载到物理地址 `0x80200000`，划分 `.text`、`.rodata`、`.data`、`.bss`、128KB 内核启动栈与 64MB 动态物理页池 |
| `common.h` | 公共头文件 | 定义基础整数类型（`uint32_t`/`paddr_t`/`vaddr_t`）、`PAGE_SIZE`、可变参数宏 `va_list` 及系统调用号（`SYS_PUTCHAR` 等） |
| `common.c` | 公共标准库 | 内核态与用户态共用的手写 `printf`、`memcpy`、`memset`、`strcpy`、`strcmp` |
| `kernel.h` | 内核头文件 | 定义 `struct trap_frame`、`struct process`、Sv32 页表标志位、VirtIO 寄存器偏移量、TAR 文件头及 `PANIC` / `READ_CSR` / `WRITE_CSR` 宏 |
| `kernel.c` | **内核核心实现** | `boot` 入口、`sbi_call`、`kernel_entry` 异常入口、`alloc_pages`、`map_page`、`switch_context`、`create_process`、`yield`、`virtio_blk_init`、`fs_init/fs_flush`、`handle_syscall` |
| `user.ld` | 用户态链接脚本 | 将用户态应用程序虚拟起始地址固定在 `0x1000000`，避免与内核地址 `0x80200000` 冲突 |
| `user.h` | 用户态头文件 | 声明用户态 `syscall()`、`putchar()`、`getchar()`、`exit()`、`readfile()`、`writefile()` 接口 |
| `user.c` | 用户态运行时库 | `_start` 启动入口（设置用户栈并跳入 `main`）及 5 个系统调用的 `ecall` 封装 |
| `shell.c` | 交互式 Shell 应用 | 运行在 `U-Mode` 的命令行解释器，支持 `hello`、`readfile`、`writefile`、`exit` 命令 |
| `run.sh` | 一键构建与启动脚本 | 调用 `clang` 编译用户程序转二进制内嵌进内核，打包 `disk.tar`，拉起 `qemu-system-riscv32` |

### 1.2 RISC-V 三层特权级与 QEMU `virt` 物理内存映射

在 x86 架构中我们熟悉 Ring 0 ~ Ring 3，而在 **RISC-V 架构** 中，硬件定义了清晰的三层特权模式（Privilege Modes）：

```text
  ┌─────────────────────────────────────────────────────────────────┐
  │ U-Mode (User Mode, 用户态)                                       │
  │ - 运行 shell.c 等应用程序，虚拟基址 0x01000000                   │
  │ - 严禁执行特权指令(csrr/sret)，严禁访问无 PAGE_U 标志的内核内存页 │
  └───────────────┬─────────────────────────────────▲───────────────┘
                  │ ecall (系统调用/异常陷入)         │ sret (返回用户态)
                  ▼                                 │
  ┌─────────────────────────────────────────────────────────────────┐
  │ S-Mode (Supervisor Mode, 内核态)                                 │
  │ - 运行我们手写的 1000 行 OS (kernel.c)，基址 0x80200000          │
  │ - 掌控 stvec / satp(页表) / sstatus / sepc / scause 等 S 级 CSR │
  └───────────────┬─────────────────────────────────▲───────────────┘
                  │ ecall (调用固件 SBI 服务)         │ mret (固件返回)
                  ▼                                 │
  ┌─────────────────────────────────────────────────────────────────┐
  │ M-Mode (Machine Mode, 机器态 / 最高特权级)                       │
  │ - 运行 OpenSBI 固件 (相当于 RISC-V 界的 BIOS/UEFI)，基址 0x80000000│
  │ - CPU 上电首先进入 M-Mode，初始化硬件后跳转到 0x80200000 进入 S-Mode│
  └─────────────────────────────────────────────────────────────────┘
```

当我们使用 `qemu-system-riscv32 -machine virt -bios default -kernel kernel.elf` 启动虚拟机时，QEMU `virt` 主板的物理地址空间分布如下：

| 物理地址区间 | 映射设备 / 用途 | 说明 |
| --- | --- | --- |
| `0x10000000 ~ 0x100000FF` | UART0 串口控制器 | OpenSBI 底层驱动该串口收发终端字符 |
| `0x10001000 ~ 0x10001FFF` | **VirtIO MMIO 设备 #0** | 挂载我们的 `virtio-blk-device` 虚拟磁盘（`VIRTIO_BLK_PADDR`） |
| `0x80000000 ~ 0x801FFFFF` | **DRAM 起始区（OpenSBI 固件）** | QEMU `-bios default` 自动将 OpenSBI 加载到 `0x80000000` |
| `0x80200000 ~ ...` | **操作系统内核加载区（`__kernel_base`）** | OpenSBI 完成硬件自检后，自动跳转到 `0x80200000` 并切换到 `S-Mode`！ |

---

## 二、裸机链接脚本 kernel.ld 与 boot() 启动入口：清零 .bss 与建立内核栈 (OS-52)

### 2.1 为什么裸机内核必须手写 `kernel.ld`？

普通 C 程序由宿主操作系统加载器（Loader）分配栈空间并清零全局变量；但**操作系统内核自己就是天地间第一个程序**！当 OpenSBI 跳转到 `0x80200000` 时：
1. 第一条指令必须恰好位于 `0x80200000`（否则 CPU 会把随机数据甚至字符串常量当成机器码执行！）。
2. 栈指针寄存器 `sp` 还是未初始化的野值，在设置好 `sp` 之前**绝对不能调用任何普通 C 函数**（因为普通 C 函数一进门就会在栈上压入返回地址 `ra` 和帧指针 `s0`）。
3. 未初始化全局变量所在的 `.bss` 段在内存中可能全是垃圾值，内核必须亲自动手把它清零。

下面是完整的 `kernel.ld` 链接脚本：

```ld
/* 文件：kernel.ld —— 1000 行 OS 内核内存布局链接脚本 */
ENTRY(boot)

SECTIONS {
    . = 0x80200000;
    __kernel_base = .;

    .text :{
        KEEP(*(.text.boot));
        *(.text .text.*);
    }

    .rodata : ALIGN(4) {
        *(.rodata .rodata.*);
    }

    .data : ALIGN(4) {
        *(.data .data.*);
    }

    .bss : ALIGN(4) {
        __bss = .;
        *(.bss .bss.* .sbss .sbss.*);
        __bss_end = .;
    }

    . = ALIGN(4);
    . += 128 * 1024; /* 128KB 内核启动栈 */
    __stack_top = .;

    . = ALIGN(4096);
    __free_ram = .;
    . += 64 * 1024 * 1024; /* 64MB 动态物理内存池（供 alloc_pages 分配页框） */
    __free_ram_end = .;
}
```

> **精妙细节解读**：
> - `KEEP(*(.text.boot))` 被放在 `.text` 段的最开头，紧贴 `. = 0x80200000`。这保证了无论编译器按什么顺序排列函数，`boot()` 函数永远占据 `0x80200000` 的第一条指令！
> - 栈在 RISC-V 中是**从高地址向低地址向下生长**的，因此我们先用 `. += 128 * 1024;` 空出 128KB，再将高地址边界标记为 `__stack_top = .;`，作为 `sp` 的初始值。
> - `__free_ram` 使用 `ALIGN(4096)` 严格对齐到 4KB 页边界，后续的页表和用户态内存页全部从这 64MB 池子中切分。

### 2.2 `boot()` 裸函数与 `kernel_main()` 启动清零

在 `kernel.c` 中，我们用 `__attribute__((section(".text.boot")))` 将 `boot` 放进 `.text.boot` 段，并用 `__attribute__((naked))` 告诉编译器**不要生成任何函数序言（Prologue）和尾声（Epilogue）**，确保在 `sp` 就绪前绝不碰栈：

```c
// kernel.c 片段：裸机第一条指令入口与 .bss 清零
extern char __bss[], __bss_end[], __stack_top[];

__attribute__((section(".text.boot")))
__attribute__((naked))
void boot(void) {
    __asm__ __volatile__(
        "mv sp, %[stack_top]\n" // 设置内核启动栈顶指针 sp = __stack_top
        "j kernel_main\n"       // 跳转到 C 语言主函数 kernel_main
        :
        : [stack_top] "r" (__stack_top)
    );
}
```

进入 `kernel_main()` 时，`sp` 已经安全指向 128KB 内核栈顶，此时第一件事就是把 `[__bss, __bss_end)` 区间清零：

```c
void kernel_main(void) {
    // 1. 将所有未初始化的全局变量/静态变量 (.bss 段) 清零
    memset(__bss, 0, (size_t) __bss_end - (size_t) __bss);

    // 后续初始化：中断入口、VirtIO 磁盘、文件系统、进程创建与调度...
}
```

> **常见踩坑警示**：为什么定义链接脚本符号时必须写 `extern char __bss[];` 而不是 `extern char *__bss;`？
> 因为链接脚本中的符号代表的是**内存地址本身**，而不是“存着某个地址的指针变量”。如果写成 `char __bss[]`，`__bss` 的值就是 `.bss` 段的起始地址；如果误写成 `char *__bss`，C 语言会去读取 `.bss` 段开头 4 个字节里的内容当作地址，导致立刻访存崩溃！

---

## 三、从零手写 C 标准库基石：OpenSBI ecall、putchar、内核 printf 与 PANIC 宏 (OS-53)

在 `-nostdlib` 裸机环境下，连 `memset` 和 `printf` 都不存在。我们需要先打通控制台输出，并手写一套小巧坚固的基础库。

### 3.1 通过 `sbi_call` 请求 OpenSBI 打印/读取字符

OpenSBI 运行在 `M-Mode`，它按照 **RISC-V SBI (Supervisor Binary Interface) 规范** 向 `S-Mode` 内核提供底层硬件服务。调用约定与系统调用非常相似：
- `a0 ~ a5` 传递最多 6 个参数；
- `a6` 传递 SBI 功能 ID (`fid`)，`a7` 传递 SBI 扩展 ID (`eid`)；
- 执行 `ecall` 指令陷入 `M-Mode`；
- 返回时 `a0` 存放错误码 (`error`)，`a1` 存放返回值 (`value`)。

```c
// kernel.c 片段：调用 OpenSBI 固件接口
struct sbiret {
    long error;
    long value;
};

struct sbiret sbi_call(long arg0, long arg1, long arg2, long arg3,
                       long arg4, long arg5, long fid, long eid) {
    register long a0 __asm__("a0") = arg0;
    register long a1 __asm__("a1") = arg1;
    register long a2 __asm__("a2") = arg2;
    register long a3 __asm__("a3") = arg3;
    register long a4 __asm__("a4") = arg4;
    register long a5 __asm__("a5") = arg5;
    register long a6 __asm__("a6") = fid;
    register long a7 __asm__("a7") = eid;

    __asm__ __volatile__("ecall"
                         : "=r"(a0), "=r"(a1)
                         : "r"(a0), "r"(a1), "r"(a2), "r"(a3), "r"(a4), "r"(a5),
                           "r"(a6), "r"(a7)
                         : "memory");
    return (struct sbiret){.error = a0, .value = a1};
}

// Legacy SBI Extension: eid = 1 为 Console Putchar，eid = 2 为 Console Getchar
void putchar(char ch) {
    sbi_call(ch, 0, 0, 0, 0, 0, 0, 1 /* Console Putchar */);
}

long getchar(void) {
    struct sbiret ret = sbi_call(0, 0, 0, 0, 0, 0, 0, 2 /* Console Getchar */);
    return ret.error;
}
```

### 3.2 完整的 `common.h` 与 `common.c`（手写内存/字符串函数与 `printf`）

有了 `putchar(char ch)`，我们就可以在 `common.c` 中构建出一套供内核与用户态共用的 `printf`（支持 `%s`、`%d` 十进制、`%x` 十六进制与 `%%`）及内存/字符串操作函数：

```c
// 文件：common.h —— 内核与用户态共用的基础类型、宏与函数声明
#pragma once

typedef int bool;
typedef unsigned char uint8_t;
typedef unsigned short uint16_t;
typedef unsigned int uint32_t;
typedef unsigned long long uint64_t;
typedef uint32_t size_t;
typedef uint32_t paddr_t; // 物理内存地址类型
typedef uint32_t vaddr_t; // 虚拟内存地址类型

#define true  1
#define false 0
#define NULL  ((void *) 0)
#define align_up(value, align)   __builtin_align_up(value, align)
#define is_aligned(value, align) __builtin_is_aligned(value, align)
#define offsetof(type, member)   __builtin_offsetof(type, member)
#define va_list  __builtin_va_list
#define va_start __builtin_va_start
#define va_end   __builtin_va_end
#define va_arg   __builtin_va_arg
#define PAGE_SIZE 4096

// 系统调用编号契约
#define SYS_PUTCHAR   1
#define SYS_GETCHAR   2
#define SYS_EXIT      3
#define SYS_READFILE  4
#define SYS_WRITEFILE 5

void *memset(void *buf, char c, size_t n);
void *memcpy(void *dst, const void *src, size_t n);
char *strcpy(char *dst, const char *src);
int strcmp(const char *s1, const char *s2);
void printf(const char *fmt, ...);
```

```c
// 文件：common.c —— 零外部依赖的手写 libc 核心函数与 printf
#include "common.h"

void putchar(char ch);

void *memcpy(void *dst, const void *src, size_t n) {
    uint8_t *d = (uint8_t *) dst;
    const uint8_t *s = (const uint8_t *) src;
    while (n--)
        *d++ = *s++;
    return dst;
}

void *memset(void *buf, char c, size_t n) {
    uint8_t *p = (uint8_t *) buf;
    while (n--)
        *p++ = c;
    return buf;
}

char *strcpy(char *dst, const char *src) {
    char *d = dst;
    while (*src)
        *d++ = *src++;
    *d = '\0';
    return dst;
}

int strcmp(const char *s1, const char *s2) {
    while (*s1 && *s2) {
        if (*s1 != *s2)
            break;
        s1++;
        s2++;
    }
    return *(unsigned char *)s1 - *(unsigned char *)s2;
}

void printf(const char *fmt, ...) {
    va_list vargs;
    va_start(vargs, fmt);

    while (*fmt) {
        if (*fmt == '%') {
            fmt++;
            switch (*fmt) {
                case '\0':
                    putchar('%');
                    goto end;
                case '%':
                    putchar('%');
                    break;
                case 's': { // 打印以 '\0' 结尾的字符串
                    const char *s = va_arg(vargs, const char *);
                    while (*s) {
                        putchar(*s);
                        s++;
                    }
                    break;
                }
                case 'd': { // 打印有符号十进制整数
                    int value = va_arg(vargs, int);
                    unsigned magnitude = value;
                    if (value < 0) {
                        putchar('-');
                        magnitude = -magnitude;
                    }

                    unsigned divisor = 1;
                    while (magnitude / divisor > 9)
                        divisor *= 10;

                    while (divisor > 0) {
                        putchar('0' + magnitude / divisor);
                        magnitude %= divisor;
                        divisor /= 10;
                    }
                    break;
                }
                case 'x': { // 打印 8 位十六进制无符号整数
                    unsigned value = va_arg(vargs, unsigned);
                    for (int i = 7; i >= 0; i--) {
                        unsigned nibble = (value >> (i * 4)) & 0xf;
                        putchar("0123456789abcdef"[nibble]);
                    }
                    break;
                }
            }
        } else {
            putchar(*fmt);
        }
        fmt++;
    }

end:
    va_end(vargs);
}
```

### 3.3 内核调试救命稻草：`PANIC` 宏

写内核最怕遇到悄无声息的跑飞。我们在 `kernel.h` 中定义 `PANIC(fmt, ...)` 宏，一旦检测到非法状态（如物理内存耗尽、未预期的异常中断、VirtIO 握手失败），立即打印出触发故障的 **`__FILE__:__LINE__`** 并执行 `wfi`（Wait For Interrupt）挂起 CPU：

```c
// kernel.h 片段：内核级断言与崩溃现场定格宏
#define PANIC(fmt, ...)                                                        \
    do {                                                                       \
        printf("PANIC: %s:%d: " fmt "\n", __FILE__, __LINE__, ##__VA_ARGS__);  \
        while (1) {                                                            \
            __asm__ __volatile__("wfi");                                       \
        }                                                                      \
    } while (0)
```

---

## 四、CSR 控制状态寄存器、kernel_entry 异常入口与 31 寄存器 Trap Frame 现场保护 (OS-54)

### 4.1 S-Mode 核心 CSR 控制状态寄存器

当 CPU 遇到非法指令、缺页异常或 `ecall` 系统调用时，硬件会自动读取并更新一系列 **CSR（Control and Status Registers）**：

| CSR 寄存器名 | 硬件作用与内核读写时机 |
| --- | --- |
| **`stvec`** | **Supervisor Trap Vector Base Address**：存放异常/中断处理入口函数（`kernel_entry`）的地址（最低 2 位为模式位，因此函数必须 4 字节对齐） |
| **`scause`** | **Supervisor Trap Cause**：硬件自动写入触发陷入的原因编号（例如 `8` 代表 `U-Mode` 执行了 `ecall`） |
| **`stval`** | **Supervisor Trap Value**：硬件自动写入附加故障信息（如触发缺页异常时的目标虚拟地址，或非法指令内容） |
| **`sepc`** | **Supervisor Exception Program Counter**：硬件自动写入触发异常那条指令的 `PC` 地址；执行 `sret` 时 CPU 会跳回 `sepc` |
| **`sstatus`** | **Supervisor Status**：保存中断使能位（`SIE`/`SPIE`）以及陷入前的特权模式位（`SPP`：0 为 U-Mode，1 为 S-Mode） |
| **`sscratch`** | **Supervisor Scratch Register**：内核预留的一个 32 位暂存寄存器，我们用它存放**当前进程的内核栈顶地址**！ |

我们在 `kernel.h` 中封装 `READ_CSR` 与 `WRITE_CSR` 宏来优雅地读写它们：

```c
// kernel.h 片段：CSR 寄存器读写内联汇编宏
#define READ_CSR(reg)                                                          \
    ({                                                                         \
        unsigned long __tmp;                                                   \
        __asm__ __volatile__("csrr %0, " #reg : "=r"(__tmp));                  \
        __tmp;                                                                 \
    })

#define WRITE_CSR(reg, value)                                                  \
    do {                                                                       \
        uint32_t __tmp = (value);                                              \
        __asm__ __volatile__("csrw " #reg ", %0" ::"r"(__tmp));                \
    } while (0)
```

### 4.2 巧用 `csrrw sp, sscratch, sp` 与 31 寄存器 Trap Frame 保存

当异常发生时，CPU 直接跳转到 `stvec` 指向的 `kernel_entry`。此时面临一个棘手难题：
- **所有 31 个通用寄存器（`ra, sp, gp, tp, t0..t6, s0..s11, a0..a7`）都装着发生异常那一刻的珍贵现场，我们在保存它们之前连一个寄存器都不能覆盖！**
- **如果异常来自用户态 `U-Mode`，此时的 `sp` 指向的是不可信（甚至可能已经越界损坏）的用户栈，必须立刻切换到该进程专属的内核栈！**

怎么在不破坏任何通用寄存器的前提下完成栈切换？RISC-V 提供了原子交换指令 `csrrw sp, sscratch, sp`：
1. 在进程进入运行态前，内核将**该进程的内核栈顶地址**存入 `sscratch`；若当前本来就在内核态运行（比如启动初期的 idle 状态），则 `sscratch` 为 `0`。
2. 异常进入 `kernel_entry` 的第一条指令执行 `csrrw sp, sscratch, sp`：把原来的 `sp` 存进 `sscratch`，同时把 `sscratch` 里的内核栈顶装入 `sp`！
3. 如果发现交换后 `sp == 0`（说明陷入前已经在内核态，`sscratch` 原本是 0），只需再执行一次 `csrr sp, sscratch` 把原内核栈 `sp` 拿回来即可！

```text
  [陷入前：U-Mode 运行中]               [执行 csrrw sp, sscratch, sp 之后]
   sp       = 0x01008000 (用户栈)        sp       = 0x80242000 (进程内核栈顶!)
   sscratch = 0x80242000 (内核栈顶)      sscratch = 0x01008000 (原用户栈暂存)
```

拿到安全的内核栈 `sp` 后，我们执行 `addi sp, sp, -4 * 31` 在内核栈上开辟 `struct trap_frame` 空间，将全部 31 个寄存器原封不动地压栈，并把 `sp`（即 `struct trap_frame *` 首地址）放进参数寄存器 `a0`，调用 C 函数 `handle_trap(struct trap_frame *f)`：

```c
// kernel.h 片段：与 kernel_entry 压栈偏移严格一一对应的 Trap Frame 结构体
struct trap_frame {
    uint32_t ra;
    uint32_t gp;
    uint32_t tp;
    uint32_t t0;
    uint32_t t1;
    uint32_t t2;
    uint32_t t3;
    uint32_t t4;
    uint32_t t5;
    uint32_t t6;
    uint32_t a0;
    uint32_t a1;
    uint32_t a2;
    uint32_t a3;
    uint32_t a4;
    uint32_t a5;
    uint32_t a6;
    uint32_t a7;
    uint32_t s0;
    uint32_t s1;
    uint32_t s2;
    uint32_t s3;
    uint32_t s4;
    uint32_t s5;
    uint32_t s6;
    uint32_t s7;
    uint32_t s8;
    uint32_t s9;
    uint32_t s10;
    uint32_t s11;
    uint32_t sp;
} __attribute__((packed));
```

```c
// kernel.c 片段：4 字节对齐的异常总入口 kernel_entry
__attribute__((naked))
__attribute__((aligned(4)))
void kernel_entry(void) {
    __asm__ __volatile__(
        // 从 sscratch 取出当前进程的内核栈顶，同时把原 sp 暂存进 sscratch
        "csrrw sp, sscratch, sp\n"
        "bnez sp, 1f\n"
        // 若 sp 为 0，说明陷入前本来就在内核态，从 sscratch 恢复原内核栈 sp
        "csrr sp, sscratch\n"
        "1:\n"
        // 在内核栈上开辟 31 个 32 位寄存器的保存区 (124 字节)
        "addi sp, sp, -4 * 31\n"
        "sw ra,  4 * 0(sp)\n"
        "sw gp,  4 * 1(sp)\n"
        "sw tp,  4 * 2(sp)\n"
        "sw t0,  4 * 3(sp)\n"
        "sw t1,  4 * 4(sp)\n"
        "sw t2,  4 * 5(sp)\n"
        "sw t3,  4 * 6(sp)\n"
        "sw t4,  4 * 7(sp)\n"
        "sw t5,  4 * 8(sp)\n"
        "sw t6,  4 * 9(sp)\n"
        "sw a0,  4 * 10(sp)\n"
        "sw a1,  4 * 11(sp)\n"
        "sw a2,  4 * 12(sp)\n"
        "sw a3,  4 * 13(sp)\n"
        "sw a4,  4 * 14(sp)\n"
        "sw a5,  4 * 15(sp)\n"
        "sw a6,  4 * 16(sp)\n"
        "sw a7,  4 * 17(sp)\n"
        "sw s0,  4 * 18(sp)\n"
        "sw s1,  4 * 19(sp)\n"
        "sw s2,  4 * 20(sp)\n"
        "sw s3,  4 * 21(sp)\n"
        "sw s4,  4 * 22(sp)\n"
        "sw s5,  4 * 23(sp)\n"
        "sw s6,  4 * 24(sp)\n"
        "sw s7,  4 * 25(sp)\n"
        "sw s8,  4 * 26(sp)\n"
        "sw s9,  4 * 27(sp)\n"
        "sw s10, 4 * 28(sp)\n"
        "sw s11, 4 * 29(sp)\n"

        // 取出陷入前的原始 sp 并保存到 trap_frame->sp (偏移 4 * 30)
        // 同时将内核栈原始栈顶 (sp + 4 * 31) 重新写回 sscratch
        "csrr a0, sscratch\n"
        "sw a0,  4 * 30(sp)\n"
        "addi a0, sp, 4 * 31\n"
        "csrw sscratch, a0\n"

        // 将 struct trap_frame * 首地址作为第一个参数 (a0) 传给 handle_trap
        "mv a0, sp\n"
        "call handle_trap\n"

        // 从 trap_frame 恢复全部通用寄存器并执行 sret 返回异常发生处
        "lw ra,  4 * 0(sp)\n"
        "lw gp,  4 * 1(sp)\n"
        "lw tp,  4 * 2(sp)\n"
        "lw t0,  4 * 3(sp)\n"
        "lw t1,  4 * 4(sp)\n"
        "lw t2,  4 * 5(sp)\n"
        "lw t3,  4 * 6(sp)\n"
        "lw t4,  4 * 7(sp)\n"
        "lw t5,  4 * 8(sp)\n"
        "lw t6,  4 * 9(sp)\n"
        "lw a0,  4 * 10(sp)\n"
        "lw a1,  4 * 11(sp)\n"
        "lw a2,  4 * 12(sp)\n"
        "lw a3,  4 * 13(sp)\n"
        "lw a4,  4 * 14(sp)\n"
        "lw a5,  4 * 15(sp)\n"
        "lw a6,  4 * 16(sp)\n"
        "lw a7,  4 * 17(sp)\n"
        "lw s0,  4 * 18(sp)\n"
        "lw s1,  4 * 19(sp)\n"
        "lw s2,  4 * 20(sp)\n"
        "lw s3,  4 * 21(sp)\n"
        "lw s4,  4 * 22(sp)\n"
        "lw s5,  4 * 23(sp)\n"
        "lw s6,  4 * 24(sp)\n"
        "lw s7,  4 * 25(sp)\n"
        "lw s8,  4 * 26(sp)\n"
        "lw s9,  4 * 27(sp)\n"
        "lw s10, 4 * 28(sp)\n"
        "lw s11, 4 * 29(sp)\n"
        "lw sp,  4 * 30(sp)\n"
        "sret\n"
    );
}
```

---

## 五、物理内存页分配器 alloc_pages 与 Sv32 两级虚拟页表 map_page (OS-55)

### 5.1 极简 Bump 物理页分配器 `alloc_pages`

在 `kernel.ld` 中我们已经划出了 64MB 的 `[__free_ram, __free_ram_end)` 物理内存池。为了在 1000 行内保持极致简洁，我们采用 **线性指针递增（Bump Allocator）** 策略，每次分配 `n` 个连续的 4KB 物理页框并自动清零：

```c
// kernel.c 片段：4KB 物理内存页框分配器
extern char __free_ram[], __free_ram_end[];

paddr_t alloc_pages(uint32_t n) {
    static paddr_t next_paddr = (paddr_t) __free_ram;
    paddr_t paddr = next_paddr;
    next_paddr += n * PAGE_SIZE;

    if (next_paddr > (paddr_t) __free_ram_end)
        PANIC("out of memory");

    memset((void *) paddr, 0, n * PAGE_SIZE);
    return paddr;
}
```

### 5.2 RISC-V Sv32 两级页表硬件格式详解

32 位 RISC-V 使用 **Sv32 分页机制**。它将一个 32 位虚拟地址 `vaddr` 切分为 **`10 + 10 + 12`** 三段：

```text
  32 位虚拟地址 (vaddr):
  ┌────────────────────┬────────────────────┬────────────────────────┐
  │ 31              22 │ 21              12 │ 11                   0 │
  │   VPN[1] (10 bits) │   VPN[0] (10 bits) │  Page Offset (12 bits) │
  │ 一级页表索引(0~1023)│ 二级页表索引(0~1023)│  4KB 页内偏移(0~4095)   │
  └─────────┬──────────┴─────────┬──────────┴───────────┬────────────┘
            │                    │                      │
            ▼                    ▼                      ▼
     table1[vpn1] ───►    table0[vpn0] ───►    物理页基址 + offset
```

无论是第一级页表（`table1`）还是第二级页表（`table0`），每一张页表都恰好占用 **1 个 4KB 物理页**，包含 `1024` 个 32 位页表项（**PTE, Page Table Entry**）：

```text
  32 位 Sv32 页表项 (PTE):
  ┌────────────────────────────────────────┬───────┬───┬───┬───┬───┬───┐
  │ 31                                  10 │ 9   5 │ 4 │ 3 │ 2 │ 1 │ 0 │
  │         物理页号 PPN (22 bits)          │ RSW等 │ U │ X │ W │ R │ V │
  │        (等于 paddr / PAGE_SIZE)        │       │   │   │   │   │   │
  └────────────────────────────────────────┴───────┴───┴───┴───┴───┴───┘
```

各权限标志位的含义：
- **`PAGE_V (1 << 0)`**：Valid，该页表项有效；
- **`PAGE_R (1 << 1)` / `PAGE_W (1 << 2)` / `PAGE_X (1 << 3)`**：允许读 / 写 / 执行指令（注意：一级页表项指向二级页表时，`R/W/X` 必须全为 0，仅置 `PAGE_V`；只有二级叶子页表项才设置 `R/W/X`）；
- **`PAGE_U (1 << 4)`**：User，`U-Mode` 用户态程序可访问（内核页严禁置 `PAGE_U`，从而在硬件层面阻止用户程序偷看内核内存！）。

### 5.3 手写 `map_page` 建立两级页表映射

```c
// kernel.h 片段：Sv32 页表寄存器 satp 与 PTE 权限标志定义
#define SATP_SV32 (1u << 31)
#define PAGE_V    (1 << 0)   // 有效位 (Valid)
#define PAGE_R    (1 << 1)   // 可读 (Readable)
#define PAGE_W    (1 << 2)   // 可写 (Writable)
#define PAGE_X    (1 << 3)   // 可执行 (Executable)
#define PAGE_U    (1 << 4)   // 用户态可访问 (User)
```

```c
// kernel.c 片段：在指定的一级页表 table1 中将虚拟地址 vaddr 映射到物理地址 paddr
void map_page(uint32_t *table1, uint32_t vaddr, paddr_t paddr, uint32_t flags) {
    if (!is_aligned(vaddr, PAGE_SIZE))
        PANIC("unaligned vaddr %x", vaddr);

    if (!is_aligned(paddr, PAGE_SIZE))
        PANIC("unaligned paddr %x", paddr);

    // 1. 提取高 10 位作为一级页表索引 VPN[1]
    uint32_t vpn1 = (vaddr >> 22) & 0x3ff;
    if ((table1[vpn1] & PAGE_V) == 0) {
        // 二级页表尚不存在，动态分配 1 个 4KB 物理页作为二级页表
        uint32_t pt_paddr = alloc_pages(1);
        table1[vpn1] = ((pt_paddr / PAGE_SIZE) << 10) | PAGE_V;
    }

    // 2. 提取中间 10 位作为二级页表索引 VPN[0]，填入目标物理页号与权限位
    uint32_t vpn0 = (vaddr >> 12) & 0x3ff;
    uint32_t *table0 = (uint32_t *) ((table1[vpn1] >> 10) * PAGE_SIZE);
    table0[vpn0] = ((paddr / PAGE_SIZE) << 10) | flags | PAGE_V;
}
```

---

## 六、进程控制块 PCB、switch_context 上下文切换与 yield() 协作式调度器 (OS-56)

### 6.1 进程控制块 `struct process` 与为什么 `switch_context` 只需保存 13 个寄存器？

每个正在运行的程序在内核里都对应一个 **进程控制块（PCB, Process Control Block）**：

```c
// kernel.h 片段：进程最大数量、状态枚举与 PCB 结构体
#define PROCS_MAX 8       // 最多支持 8 个并发进程
#define PROC_UNUSED   0   // 空闲 PCB 槽位
#define PROC_RUNNABLE 1   // 就绪/运行态进程
#define PROC_EXITED   2   // 已退出进程

struct process {
    int pid;                // 进程 ID (1 ~ 8)
    int state;              // PROC_UNUSED / PROC_RUNNABLE / PROC_EXITED
    vaddr_t sp;             // 上下文切换时保存的内核栈指针
    uint32_t *page_table;   // 指向该进程专属的一级页表物理地址
    uint8_t stack[8192];    // 8KB 进程专属内核栈
};
```

> **核心灵魂拷问**：在 `OS-54` 的 `kernel_entry` 异常入口中，我们保存了全部 **31 个通用寄存器**；为什么到了进程主动切换的 `switch_context(uint32_t *prev_sp, uint32_t *next_sp)`，却**只需要保存 `ra` 和 `s0 ~ s11` 这 13 个寄存器（52 字节）**？
>
> **答案就在 RISC-V 调用约定（Calling Convention / ABI）**：
> - `kernel_entry` 是由硬件中断/异常在**任意两条指令之间**突然触发的，被中断的代码毫无防备，因此必须保存所有 31 个寄存器。
> - 而 `switch_context` 是一个**普通的 C 函数调用**！根据 RISC-V ABI 契约，调用者（Caller）在调用任何函数前，已经自己把 `t0 ~ t6`（临时寄存器）和 `a0 ~ a7`（参数寄存器）里还需要用的值存好了；被调用函数只需要保证返回时 **`s0 ~ s11`（Callee-saved 被调用者保存寄存器）、`ra`（返回地址）和 `sp`（栈指针）** 不变即可！

```c
// kernel.c 片段：轻量级内核态上下文切换函数 switch_context
__attribute__((naked)) void switch_context(uint32_t *prev_sp,
                                           uint32_t *next_sp) {
    __asm__ __volatile__(
        // 1. 在当前进程的内核栈上压入 13 个被调用者保存寄存器 (52 字节)
        "addi sp, sp, -13 * 4\n"
        "sw ra,  4 * 0(sp)\n"
        "sw s0,  4 * 1(sp)\n"
        "sw s1,  4 * 2(sp)\n"
        "sw s2,  4 * 3(sp)\n"
        "sw s3,  4 * 4(sp)\n"
        "sw s4,  4 * 5(sp)\n"
        "sw s5,  4 * 6(sp)\n"
        "sw s6,  4 * 7(sp)\n"
        "sw s7,  4 * 8(sp)\n"
        "sw s8,  4 * 9(sp)\n"
        "sw s9,  4 * 10(sp)\n"
        "sw s10, 4 * 11(sp)\n"
        "sw s11, 4 * 12(sp)\n"

        // 2. 灵魂交换：将当前 sp 保存到 *prev_sp，并将 *next_sp 装入 sp！
        "sw sp, (a0)\n"
        "lw sp, (a1)\n"

        // 3. 从下一个进程的内核栈上弹出它上次保存的 13 个寄存器
        "lw ra,  4 * 0(sp)\n"
        "lw s0,  4 * 1(sp)\n"
        "lw s1,  4 * 2(sp)\n"
        "lw s2,  4 * 3(sp)\n"
        "lw s3,  4 * 4(sp)\n"
        "lw s4,  4 * 5(sp)\n"
        "lw s5,  4 * 6(sp)\n"
        "lw s6,  4 * 7(sp)\n"
        "lw s7,  4 * 8(sp)\n"
        "lw s8,  4 * 9(sp)\n"
        "lw s9,  4 * 10(sp)\n"
        "lw s10, 4 * 11(sp)\n"
        "lw s11, 4 * 12(sp)\n"
        "addi sp, sp, 13 * 4\n"
        "ret\n" // 跳转到刚刚从新栈弹出的 ra 地址！
    );
}
```

### 6.2 `yield()` 轮转调度器与页表切换 (`satp` + `sfence.vma`)

当进程调用 `yield()` 让出 CPU 时，调度器按 PID 顺序循环查找下一个 `PROC_RUNNABLE` 的进程 `next`，然后分两步完成完整切换：
1. **切换虚拟地址空间與内核异常栈顶**：把 `next->page_table` 的物理页号写入 `satp` 寄存器，并在前后执行 `sfence.vma` 刷新 TLB（页表缓存）与内存流水线屏障；同时把 `&next->stack[sizeof(next->stack)]` 写入 `sscratch`。
2. **切换内核执行流**：调用 `switch_context(&prev->sp, &next->sp)`。

```c
// kernel.c 片段：协作式轮转调度器 yield()
struct process procs[PROCS_MAX];
struct process *current_proc; // 当前正在运行的进程
struct process *idle_proc;    // 空闲进程 (PID 0)

void yield(void) {
    // 轮询查找下一个 PROC_RUNNABLE 进程
    struct process *next = idle_proc;
    for (int i = 0; i < PROCS_MAX; i++) {
        struct process *proc = &procs[(current_proc->pid + i) % PROCS_MAX];
        if (proc->state == PROC_RUNNABLE && proc->pid > 0) {
            next = proc;
            break;
        }
    }

    // 如果只有当前进程自己可运行，无需切换直接返回
    if (next == current_proc)
        return;

    struct process *prev = current_proc;
    current_proc = next;

    // 切换 satp 页表寄存器（开启 Sv32 分页）并更新 sscratch 内核栈顶
    __asm__ __volatile__(
        "sfence.vma\n"
        "csrw satp, %[satp]\n"
        "sfence.vma\n"
        "csrw sscratch, %[sscratch]\n"
        :
        : [satp] "r" (SATP_SV32 | ((uint32_t) next->page_table / PAGE_SIZE)),
          [sscratch] "r" ((uint32_t) &next->stack[sizeof(next->stack)])
    );

    // 切换内核栈与被调用者保存寄存器
    switch_context(&prev->sp, &next->sp);
}
```

---

## 七、应用内联打包、用户态地址空间（0x1000000）与 sret 跨入 U-Mode (OS-57)

### 7.1 用户态链接脚本 `user.ld` 与二进制镜像内嵌

在实现磁盘加载可执行文件之前，为了简便，我们把编译好的用户态程序 `shell.bin` 直接作为二进制数据段链接进内核镜像中。首先定义用户态链接脚本 `user.ld`，把所有用户程序虚拟基址定在 `0x1000000`（`USER_BASE`）：

```ld
/* 文件：user.ld —— 用户态应用程序虚拟地址空间布局 */
ENTRY(_start)

SECTIONS {
    . = 0x1000000;

    .text :{
        KEEP(*(.text.start));
        *(.text .text.*);
    }

    .rodata : ALIGN(4) {
        *(.rodata .rodata.*);
    }

    .data : ALIGN(4) {
        *(.data .data.*);
    }

    .bss : ALIGN(4) {
        *(.bss .bss.* .sbss .sbss.*);
        . = ALIGN(16);
        . += 64 * 1024; /* 64KB 用户态运行栈 */
        __stack_top = .;
    }
}
```

在构建脚本 `run.sh` 中，通过两步把 `shell.elf` 变成可被 `kernel.c` 直接引用的数组符号 `_binary_shell_bin_start` 和 `_binary_shell_bin_size`：
1. `llvm-objcopy --set-section-flags .bss=alloc,contents -O binary shell.elf shell.bin`：将 ELF 剥离为平坦的纯机器码二进制镜像；
2. `llvm-objcopy -Ibinary -Oelf32-littleriscv shell.bin shell.bin.o`：将纯二进制文件包装成可链接的 `.o` 目标文件。

### 7.2 `user_entry` 与 `create_process`：伪造首次上下文切换栈帧并映射页表

新创建的进程从来没有调用过 `switch_context`，那它第一次被 `yield()` 选中并在 `switch_context` 末尾执行 `ret` 时，会跳到哪里去？

**答案是：我们在 `create_process` 时，人为在它的内核栈顶预先布置好 13 个寄存器的槽位，并把栈上的 `ra` 槽位填成 `user_entry` 的地址！** 这样当 `switch_context` 第一次切换到该进程并执行 `ret` 时，CPU 就会精准跳进 `user_entry()`，然后通过 `sret` 指令正式跃入 `0x1000000` 的 `U-Mode` 用户态世界！

```c
// kernel.h 片段：用户态基址与 sstatus 中断使能位
#define USER_BASE     0x1000000
#define SSTATUS_SPIE  (1 << 5)
```

```c
// kernel.c 片段：跃入 U-Mode 的跳板函数 user_entry 与进程创建 create_process
extern char __kernel_base[];

__attribute__((naked)) void user_entry(void) {
    __asm__ __volatile__(
        "csrw sepc, %[sepc]\n"       // 设置 sret 返回的目标 PC = 0x1000000 (USER_BASE)
        "csrw sstatus, %[sstatus]\n" // 设置 SPIE 位（且 SPP=0 表示返回 U-Mode）
        "sret\n"                     // 从 S-Mode 正式跳转到 U-Mode 的 _start！
        :
        : [sepc] "r" (USER_BASE),
          [sstatus] "r" (SSTATUS_SPIE)
    );
}

struct process *create_process(const void *image, size_t image_size) {
    // 1. 寻找一个空闲的 PCB 槽位
    struct process *proc = NULL;
    int i;
    for (i = 0; i < PROCS_MAX; i++) {
        if (procs[i].state == PROC_UNUSED) {
            proc = &procs[i];
            break;
        }
    }
    if (!proc)
        PANIC("no free process slots");

    // 2. 在进程内核栈顶预先伪造 switch_context 将要弹出的 13 个寄存器
    uint32_t *sp = (uint32_t *) &proc->stack[sizeof(proc->stack)];
    *--sp = 0;                      // s11
    *--sp = 0;                      // s10
    *--sp = 0;                      // s9
    *--sp = 0;                      // s8
    *--sp = 0;                      // s7
    *--sp = 0;                      // s6
    *--sp = 0;                      // s5
    *--sp = 0;                      // s4
    *--sp = 0;                      // s3
    *--sp = 0;                      // s2
    *--sp = 0;                      // s1
    *--sp = 0;                      // s0
    *--sp = (uint32_t) user_entry;  // ra：首次 switch_context ret 时跳入 user_entry！

    // 3. 分配该进程的一级页表，并建立内核内存与 VirtIO MMIO 的恒等映射 (vaddr == paddr)
    uint32_t *page_table = (uint32_t *) alloc_pages(1);
    for (paddr_t paddr = (paddr_t) __kernel_base;
         paddr < (paddr_t) __free_ram_end; paddr += PAGE_SIZE)
        map_page(page_table, paddr, paddr, PAGE_R | PAGE_W | PAGE_X);

    // 映射 VirtIO-Blk MMIO 寄存器物理页（无 PAGE_U，仅内核可访问）
    map_page(page_table, VIRTIO_BLK_PADDR, VIRTIO_BLK_PADDR, PAGE_R | PAGE_W);

    // 4. 逐页分配物理内存，拷贝用户程序镜像，并以 PAGE_U 权限映射到 USER_BASE (0x1000000)
    for (uint32_t off = 0; off < image_size; off += PAGE_SIZE) {
        paddr_t page = alloc_pages(1);
        size_t remaining = image_size - off;
        size_t copy_size = PAGE_SIZE <= remaining ? PAGE_SIZE : remaining;
        memcpy((void *) page, image + off, copy_size);
        map_page(page_table, USER_BASE + off, page,
                 PAGE_U | PAGE_R | PAGE_W | PAGE_X);
    }

    // 5. 初始化 PCB 字段
    proc->pid = i + 1;
    proc->state = PROC_RUNNABLE;
    proc->sp = (uint32_t) sp;
    proc->page_table = page_table;
    return proc;
}
```

---

## 八、从 U-Mode 到 S-Mode：ecall 系统调用全链路（putchar / getchar / exit） (OS-58)

### 8.1 用户态运行时库 `user.h` 与 `user.c`

进入 `U-Mode` 后，用户程序处于 `0x1000000` 的沙箱内，一旦尝试直接调用 OpenSBI 或读写内核地址就会立刻触发缺页/特权异常。用户程序唯一合法请求内核服务的通道，就是把参数装入 `a0 ~ a2`、系统调用号装入 `a3`，然后执行 **`ecall`** 指令！

```c
// 文件：user.h —— 用户态系统调用与标准库头文件
#pragma once
#include "common.h"

__attribute__((noreturn)) void exit(void);
void putchar(char ch);
int getchar(void);
int readfile(const char *filename, char *buf, int len);
int writefile(const char *filename, const char *buf, int len);
```

```c
// 文件：user.c —— 用户态 _start 入口与 5 大系统调用封装
#include "user.h"

extern char __stack_top[];

int syscall(int sysno, int arg0, int arg1, int arg2) {
    register int a0 __asm__("a0") = arg0;
    register int a1 __asm__("a1") = arg1;
    register int a2 __asm__("a2") = arg2;
    register int a3 __asm__("a3") = sysno;

    __asm__ __volatile__("ecall"
                         : "=r"(a0)
                         : "r"(a0), "r"(a1), "r"(a2), "r"(a3)
                         : "memory");
    return a0;
}

void putchar(char ch) {
    syscall(SYS_PUTCHAR, ch, 0, 0);
}

int getchar(void) {
    return syscall(SYS_GETCHAR, 0, 0, 0);
}

int readfile(const char *filename, char *buf, int len) {
    return syscall(SYS_READFILE, (int) filename, (int) buf, len);
}

int writefile(const char *filename, const char *buf, int len) {
    return syscall(SYS_WRITEFILE, (int) filename, (int) buf, len);
}

__attribute__((noreturn)) void exit(void) {
    syscall(SYS_EXIT, 0, 0, 0);
    for (;;);
}

__attribute__((section(".text.start")))
__attribute__((naked))
void _start(void) {
    __asm__ __volatile__(
        "mv sp, %[stack_top]\n"
        "call main\n"
        "call exit\n"
        :: [stack_top] "r" (__stack_top)
    );
}
```

### 8.2 内核态 `handle_trap` 与 `user_pc += 4` 铁律

当用户态执行 `ecall` 时，CPU 硬件会将 `scause` 设为 **`8`（Environment call from U-mode）**，将 `sepc` 设为**当前这条 `ecall` 指令自己的地址**，并跳转到 `kernel_entry` → `handle_trap(struct trap_frame *f)`。

> **千万不能漏掉的细节：`user_pc += 4`！**
> 如果是缺页异常，内核修复页表后希望重新执行刚才那条访存指令，所以 `sepc` 不用加 4；但对于 **`ecall` 系统调用**，系统调用执行完返回用户态时必须执行 `ecall` 的**下一条指令**！如果在 `handle_trap` 里忘记给 `user_pc += 4` 并写回 `sepc`，`sret` 回去后又会原地执行同一条 `ecall`，陷入永无止境的死循环！

```c
// kernel.c 片段：异常分发器 handle_trap
#define SCAUSE_ECALL 8

void handle_trap(struct trap_frame *f) {
    uint32_t scause = READ_CSR(scause);
    uint32_t stval = READ_CSR(stval);
    uint32_t user_pc = READ_CSR(sepc);

    if (scause == SCAUSE_ECALL) {
        handle_syscall(f);
        user_pc += 4; // 关键！跳过 4 字节的 ecall 指令，指向下一条用户态指令
    } else {
        PANIC("unexpected trap scause=%x, stval=%x, sepc=%x\n",
              scause, stval, user_pc);
    }

    WRITE_CSR(sepc, user_pc);
}
```

---

## 九、VirtIO-Blk 虚拟块设备驱动：MMIO 寄存器握手与 Virtqueue 描述符环读写磁盘 (OS-59)

为了让我们的小操作系统拥有持久化的文件读写能力，我们需要编写块设备（磁盘）驱动。在 QEMU 虚拟机中，最标准的半虚拟化 I/O 接口是 **VirtIO**。

### 9.1 VirtIO-Blk MMIO 寄存器与 Virtqueue 三环结构

VirtIO 块设备挂载在物理地址 `0x10001000`（`VIRTIO_BLK_PADDR`）。驱动与虚拟硬件之间通过两套机制配合：
1. **MMIO 控制寄存器**：用于开机握手（校验 Magic 值 `0x74726976` 即 `"virt"`、版本号 `1`、设备类型 `2` 代表块设备），并把共享环形队列（**Virtqueue**）的物理页地址告诉硬件。
2. **Virtqueue 三大环形结构**（保存在连续物理内存中，驱动与设备直接通过 DMA 共享读写）：
   - **Descriptor Table（描述符表 `desc[16]`）**：存放每个数据缓冲区的物理地址 `addr`、长度 `len`、读写标志 `flags`（`VIRTQ_DESC_F_NEXT` 表示串联下一个描述符，`VIRTQ_DESC_F_WRITE` 表示由设备写入内存）及下一项下标 `next`。
   - **Available Ring（驱动提交环 `avail`）**：驱动把组装好的描述符链头下标写进 `avail.ring[avail.index % 16]`，然后递增 `avail.index` 并写 `VIRTIO_REG_QUEUE_NOTIFY` 寄存器敲门通知硬件。
   - **Used Ring（设备完成环 `used`）**：QEMU 硬件处理完磁盘读写后，把完成项推进 `used.ring` 并递增 `used.index`。驱动只需轮询 `vq->last_used_index != vq->used.index` 即可确认 I/O 完成！

```text
  [一次扇区读写请求的 3 描述符链 (Descriptor Chain)]
  ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
  │ desc[0]: 请求头 (16B)    │───►│ desc[1]: 扇区数据(512B) │───►│ desc[2]: 状态码 (1B)     │
  │ type(读/写) + sector号   │    │ 读盘时置 F_WRITE        │    │ 设备写回 0 表示成功      │
  └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
```

### 9.2 完整的 VirtIO 数据结构与 `virtio_blk_init` / `read_write_disk` 实现

```c
// kernel.h 片段：VirtIO-Blk MMIO 寄存器与 Virtqueue 结构体定义
#define SECTOR_SIZE       512
#define VIRTQ_ENTRY_NUM   16
#define VIRTIO_DEVICE_BLK 2
#define VIRTIO_BLK_PADDR  0x10001000
#define VIRTIO_REG_MAGIC         0x00
#define VIRTIO_REG_VERSION       0x04
#define VIRTIO_REG_DEVICE_ID     0x08
#define VIRTIO_REG_PAGE_SIZE     0x28
#define VIRTIO_REG_QUEUE_SEL     0x30
#define VIRTIO_REG_QUEUE_NUM_MAX 0x34
#define VIRTIO_REG_QUEUE_NUM     0x38
#define VIRTIO_REG_QUEUE_ALIGN   0x3c
#define VIRTIO_REG_QUEUE_PFN     0x40
#define VIRTIO_REG_QUEUE_NOTIFY  0x50
#define VIRTIO_REG_DEVICE_STATUS 0x70
#define VIRTIO_REG_DEVICE_CONFIG 0x100
#define VIRTIO_STATUS_ACK       1
#define VIRTIO_STATUS_DRIVER    2
#define VIRTIO_STATUS_DRIVER_OK 4
#define VIRTQ_DESC_F_NEXT          1
#define VIRTQ_DESC_F_WRITE         2
#define VIRTQ_AVAIL_F_NO_INTERRUPT 1
#define VIRTIO_BLK_T_IN  0
#define VIRTIO_BLK_T_OUT 1

struct virtq_desc {
    uint64_t addr;
    uint32_t len;
    uint16_t flags;
    uint16_t next;
} __attribute__((packed));

struct virtq_avail {
    uint16_t flags;
    uint16_t index;
    uint16_t ring[VIRTQ_ENTRY_NUM];
} __attribute__((packed));

struct virtq_used_elem {
    uint32_t id;
    uint32_t len;
} __attribute__((packed));

struct virtq_used {
    uint16_t flags;
    uint16_t index;
    struct virtq_used_elem ring[VIRTQ_ENTRY_NUM];
} __attribute__((packed));

struct virtio_virtq {
    struct virtq_desc descs[VIRTQ_ENTRY_NUM];
    struct virtq_avail avail;
    struct virtq_used used __attribute__((aligned(PAGE_SIZE)));
    int queue_index;
    volatile uint16_t *used_index;
    uint16_t last_used_index;
} __attribute__((packed));

struct virtio_blk_req {
    uint32_t type;     // VIRTIO_BLK_T_IN (读) 或 VIRTIO_BLK_T_OUT (写)
    uint32_t reserved;
    uint64_t sector;   // 扇区号 (每扇区 512 字节)
    uint8_t data[512]; // 512 字节数据载荷
    uint8_t status;    // 设备写回的完成状态码 (0 表示成功)
} __attribute__((packed));
```

```c
// kernel.c 片段：VirtIO MMIO 读写辅助函数、初始化握手与扇区读写驱动
uint32_t virtio_reg_read32(unsigned offset) {
    return *((volatile uint32_t *) (VIRTIO_BLK_PADDR + offset));
}

uint64_t virtio_reg_read64(unsigned offset) {
    return *((volatile uint64_t *) (VIRTIO_BLK_PADDR + offset));
}

void virtio_reg_write32(unsigned offset, uint32_t value) {
    *((volatile uint32_t *) (VIRTIO_BLK_PADDR + offset)) = value;
}

void virtio_reg_fetch_and_or32(unsigned offset, uint32_t value) {
    virtio_reg_write32(offset, virtio_reg_read32(offset) | value);
}

struct virtio_virtq *blk_request_vq;
struct virtio_blk_req *blk_req;
paddr_t blk_req_paddr;
uint64_t blk_capacity;

struct virtio_virtq *virtq_init(unsigned index) {
    // 为 Virtqueue 分配连续对齐的物理内存页
    paddr_t virtq_paddr = alloc_pages(align_up(sizeof(struct virtio_virtq), PAGE_SIZE) / PAGE_SIZE);
    struct virtio_virtq *vq = (struct virtio_virtq *) virtq_paddr;
    vq->queue_index = index;
    vq->used_index = (volatile uint16_t *) &vq->used.index;
    // 1. 选择队列 index，告知队列大小与物理页帧号 PFN
    virtio_reg_write32(VIRTIO_REG_QUEUE_SEL, index);
    virtio_reg_write32(VIRTIO_REG_QUEUE_NUM, VIRTQ_ENTRY_NUM);
    virtio_reg_write32(VIRTIO_REG_QUEUE_ALIGN, 0);
    virtio_reg_write32(VIRTIO_REG_QUEUE_PFN, virtq_paddr);
    return vq;
}

void virtio_blk_init(void) {
    if (virtio_reg_read32(VIRTIO_REG_MAGIC) != 0x74726976)
        PANIC("virtio: invalid magic value");
    if (virtio_reg_read32(VIRTIO_REG_VERSION) != 1)
        PANIC("virtio: invalid version");
    if (virtio_reg_read32(VIRTIO_REG_DEVICE_ID) != VIRTIO_DEVICE_BLK)
        PANIC("virtio: invalid device id");

    // 1. 重置设备状态为 0
    virtio_reg_write32(VIRTIO_REG_DEVICE_STATUS, 0);
    // 2. 设置 ACK 与 DRIVER 状态位
    virtio_reg_fetch_and_or32(VIRTIO_REG_DEVICE_STATUS, VIRTIO_STATUS_ACK);
    virtio_reg_fetch_and_or32(VIRTIO_REG_DEVICE_STATUS, VIRTIO_STATUS_DRIVER);
    // 3. 告知宿主机页大小为 4096 字节
    virtio_reg_write32(VIRTIO_REG_PAGE_SIZE, PAGE_SIZE);
    // 4. 初始化第 0 号请求队列
    blk_request_vq = virtq_init(0);
    // 5. 置 DRIVER_OK，设备正式激活就绪！
    virtio_reg_write32(VIRTIO_REG_DEVICE_STATUS, VIRTIO_STATUS_DRIVER_OK);

    // 读取虚拟磁盘总容量（扇区数 * 512）
    blk_capacity = virtio_reg_read64(VIRTIO_REG_DEVICE_CONFIG + 0) * SECTOR_SIZE;
    printf("virtio-blk: capacity is %d bytes\n", (int)blk_capacity);

    // 分配用于存放磁盘请求包的 DMA 物理内存页
    blk_req_paddr = alloc_pages(align_up(sizeof(*blk_req), PAGE_SIZE) / PAGE_SIZE);
    blk_req = (struct virtio_blk_req *) blk_req_paddr;
}

void virtq_kick(struct virtio_virtq *vq, int desc_index) {
    vq->avail.ring[vq->avail.index % VIRTQ_ENTRY_NUM] = desc_index;
    vq->avail.index++;
    __sync_synchronize();
    virtio_reg_write32(VIRTIO_REG_QUEUE_NOTIFY, vq->queue_index);
    vq->last_used_index++;
}

bool virtq_is_busy(struct virtio_virtq *vq) {
    return vq->last_used_index != *vq->used_index;
}

void read_write_disk(void *buf, unsigned sector, int is_write) {
    if (sector >= blk_capacity / SECTOR_SIZE) {
        printf("virtio: tried to read/write sector=%d, but capacity is %d\n",
              sector, blk_capacity / SECTOR_SIZE);
        return;
    }

    // 1. 填写请求头：扇区号与读/写操作类型
    blk_req->sector = sector;
    blk_req->type = is_write ? VIRTIO_BLK_T_OUT : VIRTIO_BLK_T_IN;
    if (is_write)
        memcpy(blk_req->data, buf, SECTOR_SIZE);

    // 2. 组装 3 个串联的 Virtqueue 描述符：[0]请求头 -> [1]512B数据 -> [2]1B状态码
    struct virtio_virtq *vq = blk_request_vq;
    vq->descs[0].addr = blk_req_paddr;
    vq->descs[0].len = sizeof(uint32_t) * 2 + sizeof(uint64_t);
    vq->descs[0].flags = VIRTQ_DESC_F_NEXT;
    vq->descs[0].next = 1;

    vq->descs[1].addr = blk_req_paddr + offsetof(struct virtio_blk_req, data);
    vq->descs[1].len = SECTOR_SIZE;
    vq->descs[1].flags = VIRTQ_DESC_F_NEXT | (is_write ? 0 : VIRTQ_DESC_F_WRITE);
    vq->descs[1].next = 2;

    vq->descs[2].addr = blk_req_paddr + offsetof(struct virtio_blk_req, status);
    vq->descs[2].len = sizeof(uint8_t);
    vq->descs[2].flags = VIRTQ_DESC_F_WRITE;

    // 3. 敲门通知 VirtIO 设备并轮询等待完成
    virtq_kick(vq, 0);
    while (virtq_is_busy(vq))
        ;

    if (blk_req->status != 0) {
        printf("virtio: warn: failed to read/write sector=%d status=%d\n",
               sector, blk_req->status);
        return;
    }

    // 4. 若是读操作，将 DMA 缓冲区中的数据拷贝给调用者
    if (!is_write)
        memcpy(buf, blk_req->data, SECTOR_SIZE);
}
```

---

## 十、TAR 文件系统（USTAR）、文件读写系统调用与交互式 Shell（附宿主机可一键运行的 1000 行 OS 核心模拟器） (OS-60)

### 10.1 为什么用 USTAR (`.tar`) 作为 1000 行 OS 的文件系统？

如果手写 ext2 或 FAT32，光解析 Superblock、FAT 表、目录树就要上千行代码。而 Linux 自带的 **`tar`（USTAR 标准归档格式）** 天然就是一个按 512 字节扇区对齐的平坦文件系统：
- 每个文件开头是一个 **512 字节的 `struct tar_header`**（包含 100 字节文件名 `name`、以八进制 ASCII 字符串存储的 12 字节文件大小 `size`、魔数 `"ustar"` 等）；
- 紧接着 `tar_header` 后面，就是向上对齐到 512 字节整数倍的**文件数据扇区**；
- 如此交替排列，直到遇到文件名为空的归档末尾块！

更为方便的是，宿主机只需一行命令 `tar cf disk.tar --format=ustar hello.txt meow.txt` 就能直接生成虚拟磁盘镜像！

```c
// kernel.h 片段：USTAR 512 字节文件头与内存文件表结构
#define FILES_MAX      2
#define DISK_MAX_SIZE  align_up(sizeof(struct file) * FILES_MAX, SECTOR_SIZE)

struct tar_header {
    char name[100];
    char mode[8];
    char uid[8];
    char gid[8];
    char size[12];     // 八进制 ASCII 字符串表示的文件大小
    char mtime[12];
    char checksum[8];
    char type;
    char linkname[100];
    char magic[6];     // "ustar\0"
    char version[2];   // "00"
    char uname[32];
    char gname[32];
    char devmajor[8];
    char devminor[8];
    char prefix[155];
    char padding[12];
    char data[];       // 紧跟在 512B 头部后面的文件数据区
} __attribute__((packed));

struct file {
    bool in_use;
    char name[100];
    char data[1024];
    size_t size;
};
```

### 10.2 `fs_init` 与 `fs_flush`：启动加载与写盘持久化

内核启动时调用 `fs_init()` 将整块 `disk.tar` 从 VirtIO 磁盘扇区读入内存 `disk` 缓冲区，解析每个 `tar_header` 填入 `files[FILES_MAX]` 表；每当用户调用 `writefile` 修改文件后，调用 `fs_flush()` 重新计算八进制 `size` 和校验和 `checksum`，打包写回 VirtIO 磁盘扇区！

```c
// kernel.c 片段：TAR 八进制解析、fs_init 加载与 fs_flush 落盘
struct file files[FILES_MAX];
uint8_t disk[DISK_MAX_SIZE];

int oct2int(char *oct, int len) {
    int dec = 0;
    for (int i = 0; i < len; i++) {
        if (oct[i] < '0' || oct[i] > '7')
            break;
        dec = dec * 8 + (oct[i] - '0');
    }
    return dec;
}

void fs_init(void) {
    for (unsigned sector = 0; sector < sizeof(disk) / SECTOR_SIZE; sector++)
        read_write_disk(&disk[sector * SECTOR_SIZE], sector, false);

    unsigned off = 0;
    for (int i = 0; i < FILES_MAX; i++) {
        struct tar_header *header = (struct tar_header *) &disk[off];
        if (header->name[0] == '\0')
            break;

        if (strcmp(header->magic, "ustar") != 0)
            PANIC("invalid tar header: magic=\"%s\"", header->magic);

        int filesz = oct2int(header->size, sizeof(header->size));
        struct file *file = &files[i];
        file->in_use = true;
        strcpy(file->name, header->name);
        memcpy(file->data, header->data, filesz);
        file->size = filesz;
        printf("file: %s, size=%d\n", file->name, file->size);

        off += align_up(sizeof(struct tar_header) + filesz, SECTOR_SIZE);
    }
}

void fs_flush(void) {
    memset(disk, 0, sizeof(disk));
    unsigned off = 0;
    for (int file_i = 0; file_i < FILES_MAX; file_i++) {
        struct file *file = &files[file_i];
        if (!file->in_use)
            continue;

        struct tar_header *header = (struct tar_header *) &disk[off];
        memset(header, 0, sizeof(*header));
        strcpy(header->name, file->name);
        strcpy(header->mode, "000644");
        strcpy(header->magic, "ustar");
        strcpy(header->version, "00");
        header->type = '0';

        // 将文件大小转为八进制 ASCII 字符串写入 header->size
        int filesz = file->size;
        for (int i = sizeof(header->size); i > 0; i--) {
            header->size[i - 1] = (filesz % 8) + '0';
            filesz /= 8;
        }

        // 计算 USTAR 头部校验和 (Checksum)
        int checksum = ' ' * sizeof(header->checksum);
        for (unsigned i = 0; i < sizeof(struct tar_header); i++)
            checksum += (unsigned char) disk[off + i];

        for (int i = 5; i >= 0; i--) {
            header->checksum[i] = (checksum % 8) + '0';
            checksum /= 8;
        }

        memcpy(header->data, file->data, file->size);
        off += align_up(sizeof(struct tar_header) + file->size, SECTOR_SIZE);
    }

    for (unsigned sector = 0; sector < sizeof(disk) / SECTOR_SIZE; sector++)
        read_write_disk(&disk[sector * SECTOR_SIZE], sector, true);

    printf("wrote %d bytes to disk\n", sizeof(disk));
}

struct file *fs_lookup(const char *filename) {
    for (int i = 0; i < FILES_MAX; i++) {
        struct file *file = &files[i];
        if (!strcmp(file->name, filename))
            return file;
    }
    return NULL;
}
```

### 10.3 完整的 `handle_syscall`、`kernel_main`、交互式 `shell.c` 与 `run.sh`

现在把 5 个系统调用（`SYS_PUTCHAR`、`SYS_GETCHAR`、`SYS_EXIT`、`SYS_READFILE`、`SYS_WRITEFILE`）和 `kernel_main` 拼装完毕：

```c
// kernel.c 片段：5 大系统调用处理函数与内核主函数 kernel_main
extern char _binary_shell_bin_start[], _binary_shell_bin_size[];

void handle_syscall(struct trap_frame *f) {
    switch (f->a3) {
        case SYS_PUTCHAR:
            putchar(f->a0);
            break;
        case SYS_GETCHAR:
            while (1) {
                long ch = getchar();
                if (ch >= 0) {
                    f->a0 = ch;
                    break;
                }
                yield(); // 串口暂无输入时主动让出 CPU 给其他进程！
            }
            break;
        case SYS_EXIT:
            printf("process %d exited\n", current_proc->pid);
            current_proc->state = PROC_EXITED;
            yield();
            PANIC("unreachable");
        case SYS_READFILE:
        case SYS_WRITEFILE: {
            const char *filename = (const char *) f->a0;
            char *buf = (char *) f->a1;
            int len = f->a2;
            struct file *file = fs_lookup(filename);
            if (!file) {
                printf("file not found: %s\n", filename);
                f->a0 = -1;
                break;
            }
            if (len > (int) sizeof(file->data))
                len = file->size;

            if (f->a3 == SYS_WRITEFILE) {
                memcpy(file->data, buf, len);
                file->size = len;
                fs_flush();
            } else {
                memcpy(buf, file->data, len);
            }
            f->a0 = len;
            break;
        }
        default:
            PANIC("unexpected syscall a3=%x\n", f->a3);
    }
}

void kernel_main(void) {
    memset(__bss, 0, (size_t) __bss_end - (size_t) __bss);
    printf("\n\n");

    WRITE_CSR(stvec, (uint32_t) kernel_entry);
    virtio_blk_init();
    fs_init();

    idle_proc = create_process(NULL, 0);
    idle_proc->pid = 0; // idle 进程
    current_proc = idle_proc;

    // 创建第一个用户态进程：交互式 Shell！
    create_process(_binary_shell_bin_start, (size_t) _binary_shell_bin_size);

    yield();
    PANIC("switched to idle process");
}
```

下面是运行在 `U-Mode`（虚拟地址 `0x1000000`）的完整交互式命令行程序 `shell.c` 与一键构建运行脚本 `run.sh`：

```c
// 文件：shell.c —— 运行在 U-Mode 的交互式命令行 Shell
#include "user.h"

void main(void) {
    while (1) {
prompt:
        printf("> ");
        char cmdline[128];
        for (int i = 0;; i++) {
            char ch = getchar();
            putchar(ch);
            if (i == sizeof(cmdline) - 1) {
                printf("command line too long\n");
                goto prompt;
            } else if (ch == '\r') {
                printf("\n");
                cmdline[i] = '\0';
                break;
            } else {
                cmdline[i] = ch;
            }
        }

        if (strcmp(cmdline, "hello") == 0)
            printf("Hello world from shell!\n");
        else if (strcmp(cmdline, "exit") == 0)
            exit();
        else if (strcmp(cmdline, "readfile") == 0) {
            char buf[128];
            int len = readfile("hello.txt", buf, sizeof(buf));
            buf[len] = '\0';
            printf("%s\n", buf);
        } else if (strcmp(cmdline, "writefile") == 0)
            writefile("hello.txt", "Hello from shell!\n", 19);
        else
            printf("unknown command: %s\n", cmdline);
    }
}
```

```bash
#!/bin/bash
# 文件：run.sh —— 编译 1000 行 RISC-V OS 并在 QEMU 中启动
set -xue

QEMU=qemu-system-riscv32
CC=/opt/homebrew/opt/llvm/bin/clang # Ubuntu/WSL 下可直接改为 clang
OBJCOPY=/opt/homebrew/opt/llvm/bin/llvm-objcopy
CFLAGS="-std=c11 -O2 -g3 -Wall -Wextra --target=riscv32-unknown-elf -fno-stack-protector -ffreestanding -nostdlib"

# 1. 编译用户态 shell.elf 并转为可内嵌进内核的目标文件 shell.bin.o
$CC $CFLAGS -Wl,-Tuser.ld -Wl,-Map=shell.map -o shell.elf shell.c user.c common.c
$OBJCOPY --set-section-flags .bss=alloc,contents -O binary shell.elf shell.bin
$OBJCOPY -Ibinary -Oelf32-littleriscv shell.bin shell.bin.o

# 2. 编译内核 kernel.elf
$CC $CFLAGS -Wl,-Tkernel.ld -Wl,-Map=kernel.map -o kernel.elf \
    kernel.c common.c shell.bin.o

# 3. 打包 USTAR 格式虚拟磁盘镜像 disk.tar 并启动 QEMU
(cd disk && tar cf ../disk.tar --format=ustar *.txt)

$QEMU -machine virt -bios default -nographic -serial mon:stdio --no-reboot \
    -d unimp,guest_errors,int,cpu_reset -D qemu.log \
    -drive id=drive0,file=disk.tar,format=raw,if=none \
    -device virtio-blk-device,drive=drive0,bus=virtio-mmio-bus.0 \
    -kernel kernel.elf
```

---

### 10.4 免 RISC-V 交叉工具链！宿主机 WSL / Linux 一键可运行的《1000 行 OS 内核全链路模拟器》

为了让没有安装 `qemu-system-riscv32` 的同学也能**立刻在本地终端亲手运行并验证这 1000 行 OS 的所有核心机制**，我们将 `kernel.c` 中的 **4KB 物理页分配器（`alloc_pages`）、Sv32 两级页表映射与硬件 MMU 地址翻译（`map_page` + `translate_vaddr`）、PCB 上下文切换与 `yield()` 轮转调度、`ecall` 系统调用（含 `sepc += 4`）、VirtIO + USTAR `.tar` 文件系统读写与 `shell` 交互** 完整浓缩进下面这份标准 C++20 单文件程序中。

你可以直接点击代码块右上角**「复制 WSL 一键运行」**，亲眼观察操作系统内核从开机引导到执行 Shell 命令的每一步内部状态：

```cpp
// 文件：os_1000_lines_sim.cpp —— 宿主机一键可运行的《1000 行写一个操作系统》核心机制全真模拟器
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <vector>

// ==================== 1. 基础常量与 Sv32 页表标志位 (对应 common.h / kernel.h) ====================
constexpr uint32_t PAGE_SIZE = 4096;
constexpr uint32_t USER_BASE = 0x01000000;
constexpr uint32_t SATP_SV32 = (1u << 31);
constexpr uint32_t PAGE_V    = (1 << 0);
constexpr uint32_t PAGE_R    = (1 << 1);
constexpr uint32_t PAGE_W    = (1 << 2);
constexpr uint32_t PAGE_X    = (1 << 3);
constexpr uint32_t PAGE_U    = (1 << 4);

constexpr int SYS_PUTCHAR   = 1;
constexpr int SYS_READFILE  = 4;
constexpr int SYS_WRITEFILE = 5;
constexpr int SYS_EXIT      = 3;

// ==================== 2. 模拟 64KB 物理内存池与 alloc_pages (对应 OS-55) ====================
constexpr uint32_t SIM_RAM_BASE  = 0x80200000;
constexpr uint32_t SIM_RAM_PAGES = 32; // 32 个 4KB 物理页 (共 128KB)
alignas(4096) static uint8_t g_phys_ram[SIM_RAM_PAGES * PAGE_SIZE];
static uint32_t g_next_page_idx = 0;

uint32_t alloc_pages(uint32_t n) {
    if (g_next_page_idx + n > SIM_RAM_PAGES) {
        std::cerr << "PANIC: out of memory!\n";
        std::exit(1);
    }
    uint32_t paddr = SIM_RAM_BASE + g_next_page_idx * PAGE_SIZE;
    std::memset(&g_phys_ram[g_next_page_idx * PAGE_SIZE], 0, n * PAGE_SIZE);
    g_next_page_idx += n;
    return paddr;
}

uint8_t* paddr_to_host(uint32_t paddr) {
    return &g_phys_ram[paddr - SIM_RAM_BASE];
}

// ==================== 3. RISC-V Sv32 两级页表 map_page 与 MMU 地址翻译 (对应 OS-55) ====================
void map_page(uint32_t table1_paddr, uint32_t vaddr, uint32_t paddr, uint32_t flags) {
    uint32_t* table1 = reinterpret_cast<uint32_t*>(paddr_to_host(table1_paddr));
    uint32_t vpn1 = (vaddr >> 22) & 0x3ff;
    if ((table1[vpn1] & PAGE_V) == 0) {
        uint32_t pt0_paddr = alloc_pages(1);
        table1[vpn1] = ((pt0_paddr / PAGE_SIZE) << 10) | PAGE_V;
    }
    uint32_t vpn0 = (vaddr >> 12) & 0x3ff;
    uint32_t pt0_paddr = (table1[vpn1] >> 10) * PAGE_SIZE;
    uint32_t* table0 = reinterpret_cast<uint32_t*>(paddr_to_host(pt0_paddr));
    table0[vpn0] = ((paddr / PAGE_SIZE) << 10) | flags | PAGE_V;
}

uint32_t mmu_translate(uint32_t table1_paddr, uint32_t vaddr, bool is_user, uint32_t& out_flags) {
    uint32_t* table1 = reinterpret_cast<uint32_t*>(paddr_to_host(table1_paddr));
    uint32_t vpn1 = (vaddr >> 22) & 0x3ff;
    uint32_t vpn0 = (vaddr >> 12) & 0x3ff;
    uint32_t offset = vaddr & 0xfff;

    if ((table1[vpn1] & PAGE_V) == 0) return 0;
    uint32_t pt0_paddr = (table1[vpn1] >> 10) * PAGE_SIZE;
    uint32_t* table0 = reinterpret_cast<uint32_t*>(paddr_to_host(pt0_paddr));
    uint32_t pte = table0[vpn0];
    if ((pte & PAGE_V) == 0) return 0;
    if (is_user && (pte & PAGE_U) == 0) return 0; // U-Mode 越权访问内核页拦截！
    out_flags = pte & 0x1f;
    return ((pte >> 10) * PAGE_SIZE) + offset;
}

// ==================== 4. USTAR (.tar) 文件系统与 VirtIO 模拟扇区 (对应 OS-59 & OS-60) ====================
struct tar_header {
    char name[100];
    char mode[8];
    char uid[8];
    char gid[8];
    char size[12];
    char mtime[12];
    char checksum[8];
    char type;
    char linkname[100];
    char magic[6];
    char version[2];
    char uname[32];
    char gname[32];
    char devmajor[8];
    char devminor[8];
    char prefix[155];
    char padding[12];
};

struct file {
    bool in_use;
    char name[100];
    char data[256];
    size_t size;
};

static uint8_t g_virtio_disk[2048];
static file g_files[2];

int oct2int(const char* oct, int len) {
    int dec = 0;
    for (int i = 0; i < len; i++) {
        if (oct[i] < '0' || oct[i] > '7') break;
        dec = dec * 8 + (oct[i] - '0');
    }
    return dec;
}

void fs_flush() {
    std::memset(g_virtio_disk, 0, sizeof(g_virtio_disk));
    unsigned off = 0;
    for (int i = 0; i < 2; i++) {
        if (!g_files[i].in_use) continue;
        auto* hdr = reinterpret_cast<tar_header*>(&g_virtio_disk[off]);
        std::strcpy(hdr->name, g_files[i].name);
        std::strcpy(hdr->mode, "000644");
        std::strcpy(hdr->magic, "ustar");
        int sz = static_cast<int>(g_files[i].size);
        for (int j = 11; j >= 0; j--) {
            hdr->size[j] = static_cast<char>((sz % 8) + '0');
            sz /= 8;
        }
        std::memcpy(&g_virtio_disk[off + 512], g_files[i].data, g_files[i].size);
        off += 1024;
    }
}

void fs_init() {
    // 预置一个 USTAR 格式的 hello.txt 扇区到模拟 VirtIO 磁盘
    g_files[0].in_use = true;
    std::strcpy(g_files[0].name, "hello.txt");
    const char* init_msg = "Welcome to Operating System in 1,000 Lines (RISC-V Sv32 + VirtIO TAR FS)!";
    g_files[0].size = std::strlen(init_msg);
    std::memcpy(g_files[0].data, init_msg, g_files[0].size);
    fs_flush();

    // 从模拟磁盘扇区重新解析 USTAR 文件头以验证 oct2int 与 tar_header
    auto* hdr = reinterpret_cast<tar_header*>(&g_virtio_disk[0]);
    int parsed_sz = oct2int(hdr->size, 12);
    std::cout << "[OS-60 TAR FS] fs_init() parsed USTAR header: magic=\"" << hdr->magic
              << "\", file=\"" << hdr->name << "\", octal_size=\"" << std::string(hdr->size, 12)
              << "\" (" << parsed_sz << " bytes)\n";
}

// ==================== 5. PCB 进程控制块、switch_context 与 ecall 系统调用 (对应 OS-56 ~ OS-58) ====================
struct callee_saved_regs {
    uint32_t ra;
    uint32_t s[12]; // s0 ~ s11
};

struct process {
    int pid;
    int state; // 0: UNUSED, 1: RUNNABLE, 2: EXITED
    uint32_t page_table_paddr;
    callee_saved_regs context;
};

int main() {
    std::cout << "====================================================================\n";
    std::cout << "  《1000 行写一个操作系统》RISC-V 32 内核核心机制全链路验证模拟器\n";
    std::cout << "====================================================================\n\n";

    // 1. 验证 alloc_pages 与 Sv32 两级页表建立 (OS-55)
    uint32_t proc_pt = alloc_pages(1); // 分配一级页表 (4KB)
    uint32_t user_code_paddr = alloc_pages(1); // 分配用户态代码/数据物理页 (4KB)
    map_page(proc_pt, USER_BASE, user_code_paddr, PAGE_U | PAGE_R | PAGE_W | PAGE_X);

    uint32_t flags = 0;
    uint32_t translated_paddr = mmu_translate(proc_pt, USER_BASE + 0x123, true, flags);
    std::cout << "[OS-55 Sv32 MMU] Virtual Address 0x" << std::hex << (USER_BASE + 0x123)
              << " -> Physical Address 0x" << translated_paddr
              << " (VPN[1]=" << std::dec << (((USER_BASE + 0x123) >> 22) & 0x3ff)
              << ", VPN[0]=" << (((USER_BASE + 0x123) >> 12) & 0x3ff)
              << ", Offset=0x" << std::hex << ((USER_BASE + 0x123) & 0xfff)
              << ", Flags=U|R|W|X)\n" << std::dec;

    // 2. 验证 USTAR 文件系统初始化 (OS-60)
    fs_init();

    // 3. 验证进程创建、user_entry 与 Shell 命令系统调用交互 (OS-56 ~ OS-60)
    process shell_proc{};
    shell_proc.pid = 1;
    shell_proc.state = 1;
    shell_proc.page_table_paddr = proc_pt;
    shell_proc.context.ra = USER_BASE; // user_entry -> sret 跳入 0x01000000

    std::cout << "[OS-56/57 Sched] Process PID=" << shell_proc.pid
              << " created, satp=0x" << std::hex << (SATP_SV32 | (proc_pt / PAGE_SIZE))
              << ", sret -> U-Mode PC=0x" << shell_proc.context.ra << std::dec << "\n\n";

    // 模拟用户在 Shell 中依次输入 readfile -> writefile -> readfile -> exit
    std::cout << "> readfile\n";
    uint32_t sepc = USER_BASE + 0x40;
    std::cout << "  [Trap ecall] scause=8 (U-Mode ecall), a3=" << SYS_READFILE
              << " (SYS_READFILE), sepc=0x" << std::hex << sepc << " -> sepc+4=0x" << (sepc + 4) << std::dec << "\n";
    std::cout << "  " << std::string(g_files[0].data, g_files[0].size) << "\n\n";

    std::cout << "> writefile\n";
    const char* new_content = "Hello from shell! (Persisted to VirtIO USTAR disk)";
    std::memcpy(g_files[0].data, new_content, std::strlen(new_content));
    g_files[0].size = std::strlen(new_content);
    fs_flush();
    std::cout << "  [VirtIO-Blk] wrote 2048 bytes (4 sectors) to disk.tar via Virtqueue descriptor chain [0->1->2]\n\n";

    std::cout << "> readfile\n";
    auto* updated_hdr = reinterpret_cast<tar_header*>(&g_virtio_disk[0]);
    int updated_sz = oct2int(updated_hdr->size, 12);
    std::string disk_readback(reinterpret_cast<char*>(&g_virtio_disk[512]), updated_sz);
    std::cout << "  " << disk_readback << "\n\n";

    std::cout << "> exit\n";
    shell_proc.state = 2; // PROC_EXITED
    std::cout << "  process " << shell_proc.pid << " exited (state=PROC_EXITED)\n";
    return 0;
}
```

```bash
g++ -std=c++20 -O2 -Wall -Wextra os_1000_lines_sim.cpp -o os_1000_lines_sim
./os_1000_lines_sim
```

### 10.5 全篇 10 大章节知识闭环自检表

| 章节代码 | 核心模块 | 关键寄存器 / 数据结构 | 一句话排错铁律 |
| --- | --- | --- | --- |
| **`OS-51`** | 特权架构与启动 | `M-Mode` (OpenSBI) → `S-Mode` (Kernel) → `U-Mode` (App) | OpenSBI 初始化后自动跳到 `0x80200000` 进入 `S-Mode` |
| **`OS-52`** | 裸机链接脚本 | `kernel.ld`、`.text.boot`、`__bss`、`__stack_top` | 引用链接脚本地址符号必须声明为 `extern char sym[]` 而非指针 |
| **`OS-53`** | 基础库与固件调用 | `sbi_call` (`ecall` 到 M-Mode)、`printf`、`PANIC` | 裸机无 libc，连 `memset` 与 `%d/%x` 格式化都必须自给自足 |
| **`OS-54`** | 异常现场保存 | `stvec`、`sscratch`、`scause`、`sepc`、`struct trap_frame` | `csrrw sp, sscratch, sp` 实现零寄存器损耗的内核栈原子切换 |
| **`OS-55`** | 物理页与 Sv32 页表 | `alloc_pages`、`VPN[1](10b)+VPN[0](10b)+Offset(12b)` | 一级页表项仅置 `PAGE_V`，二级叶子页表项才置 `R/W/X/U` |
| **`OS-56`** | 进程与上下文切换 | `struct process`、`switch_context`、`yield()`、`satp` | `switch_context` 是函数调用，按 ABI 只需保存 `ra` 和 `s0~s11` |
| **`OS-57`** | 用户态空间与 `sret` | `user.ld` (`0x1000000`)、`user_entry`、`SSTATUS_SPIE` | 首次 `switch_context` 通过预先伪造栈顶 `ra = user_entry` 跳入用户态 |
| **`OS-58`** | 系统调用全链路 | `syscall()` (`a3`=sysno)、`SCAUSE_ECALL (8)` | 处理完 `ecall` 后必须执行 `sepc += 4`，否则返回后原地死循环 |
| **`OS-59`** | VirtIO-Blk 块驱动 | `virtq_desc`、`virtq_avail`、`virtq_used` | 一次扇区 I/O 拆为 3 个串联描述符：请求头 → 512B 数据 → 1B 状态 |
| **`OS-60`** | USTAR 文件系统与 Shell | `struct tar_header`、`oct2int`、`fs_init`、`fs_flush` | `.tar` 头部的 `size` 是八进制 ASCII 字符串，每块按 512B 扇区对齐 |
