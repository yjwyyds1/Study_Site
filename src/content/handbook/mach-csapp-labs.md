---
title: "《深入理解计算机系统 (CS:APP 3e)》全书脉络与 7 大经典 Lab 完整实战"
description: "深度融合 CMU 15-213 / CS:APP 第 3 版（Hansimov 中文整理版）全书核心体系与全球闻名的 7 大实验：Data Lab 位级整数与浮点闯关、Bomb Lab 反汇编拆弹 6 关+隐藏关、Attack Lab 栈溢出与 ROP 链构造及现代防护、Cache Lab LRU 模拟器与矩阵转置分块、Shell Lab 信号与作业控制、Malloc Lab 显式/分离空闲链表分配器、Proxy Lab 并发 HTTP 缓存代理。"
order: 70
category: "计算机组成"
tags: ["CS:APP", "CMU 15-213", "Data Lab", "Bomb Lab", "Attack Lab", "Cache Lab", "Shell Lab", "Malloc Lab", "Proxy Lab"]
related: ["handbook/mach-zero-start", "handbook/mach-isa-cpu", "handbook/machine-asm-cache", "handbook/linux-debug-elf"]
sources: []
---

## 一、CS:APP 全书 12 章核心脉络与“信息 = 位 + 上下文”公理 (MACH-51)

卡内基梅隆大学（CMU）的镇系神课 **15-213: Introduction to Computer Systems (ICS)** 及其配套教材 **《深入理解计算机系统》（CS:APP, Computer Systems: A Programmer's Perspective, 3rd Edition）**，改变了全球无数程序员看待软件的视角。它不再把操作系统、编译器、微架构割裂成孤立的黑盒，而是站在**“程序员视角（Programmer's Perspective）”**回答一个终极问题：**当你写下一行 C/C++ 代码并在机器上按下回车时，底层硬件与系统软件究竟发生了什么？**

### 1. 第一公理：`信息 = 位 + 上下文 (Information = Bits + Context)`

在计算机底层，磁盘上的 `hello.c`、内存里的整型变量 `int x`、寄存器里的指令机器码、网卡发出的 TCP 报文，本质上全都是**一串毫无区别的 `0` 和 `1` 比特序列**。
同一串 32 位二进制比特 `0x40490fdb`：
- 在 IEEE-754 单精度浮点寄存器 `%xmm0` 的上下文中，它是圆周率近似值 `3.1415927f`；
- 在 32 位补码整数寄存器 `%eax` 的上下文中，它是十进制整数 `1,078,530,011`；
- 在 x86-64 取指译码器（Instruction Decoder）的上下文中，它是一段机器指令字节流；
- 在虚拟内存寻址的上下文中，它可能是一个指向用户代码段 `.text` 的指针偏移。

**脱离了上下文（Context），比特（Bits）毫无意义；而掌握了上下文的切换规律，你就拥有了操纵计算机底层一切机制的钥匙。**

### 2. 编译系统四阶段与全书 12 章知识闭环

从源文件 `hello.c` 到可执行目标文件 `./hello` 在屏幕上打印出字符，经历了编译系统的四大阶段，这也串联起了 CS:APP 全书 12 章的宏伟蓝图：

```text
  hello.c (ASCII 源文本)
     │
     ▼  [1. 预处理器 cpp] 展开 #include / #define 宏，删注释 (gcc -E)
  hello.i (预处理后 C 文本)
     │
     ▼  [2. 编译器 cc1]   词法/语法分析、SSA 优化，降维到汇编指令 (gcc -S)  ──► 第 2/3/4/5/6 章
  hello.s (x86-64 汇编文本)
     │
     ▼  [3. 汇编器 as]    翻译为机器码指令，封装成可重定位 ELF (gcc -c)
  hello.o (可重定位目标文件) + printf.o (标准库目标文件)
     │
     ▼  [4. 链接器 ld]    符号解析 + 节合并 + 重定位地址修补               ──► 第 7 章
   hello  (可执行 ELF 文件)
     │
     ▼  [5. OS 内核加载运行] fork/execve + 虚拟内存页表映射 + 异常/信号/IO/网络 ──► 第 8/9/10/11/12 章
```

### 3. 全书 12 章 + 7 大经典 Lab + 本站手册全景映射总表

很多读者参考过开源社区广受欢迎的 **Hansimov/csapp** 中文导读笔记与 CMU 官方 Lab 讲义。下表将 CS:APP 全书 12 章、CMU 7 大实验与本站课程模块做了严密对齐：

| 部分 | 章节 | 核心命题与底层机制 | 配套 CMU 经典实验 | 对应本站深度章节 |
| :--- | :--- | :--- | :--- | :--- |
| **引言** | **Ch 1. 计算机系统漫游** | 信息 = 位 + 上下文、编译四阶段、总线/缓存/虚拟内存总览、Amdahl 定律 | — | `MACH-01`、`MACH-51` |
| **Part I: 程序结构与执行** | **Ch 2. 信息的表示和处理** | 无符号数、补码（$TMin/TMax$）、整数溢出、移位掩码、IEEE-754 浮点规格化/非规格化/NaN | **Lab 1: Data Lab** | `MACH-02 ~ 10`、`MACH-52` |
| **Part I** | **Ch 3. 程序的机器级表示** | x86-64 寄存器、寻址模式、条件码 `ZF/SF/CF/OF`、跳转表、调用栈帧、缓冲区溢出与 ROP | **Lab 2: Bomb Lab**<br>**Lab 3: Attack Lab** | `MACH-20 ~ 30`、`MACH-53`、`MACH-54` |
| **Part I** | **Ch 4. 处理器体系结构** | Y86-64 指令集、组合逻辑 HCL、五级流水线（IF/ID/EX/MEM/WB）、数据转发与分支预测冒险 | *(Arch Lab)* | `MACH-11 ~ 19`、`MACH-40 ~ 43` |
| **Part I** | **Ch 5. 优化程序性能** | 消除循环低效、减少过程调用、消除不必要内存引用、循环展开、超标量关键路径与 SIMD | *(Perf Lab)* | `MACH-29`、`MACH-48` |
| **Part I** | **Ch 6. 存储器层次结构** | SRAM/DRAM/SSD 物理特性、局部性原理、组相联 Cache $(S,E,B)$、替换策略与分块（Blocking） | **Lab 4: Cache Lab** | `MACH-44 ~ 47`、`MACH-55` |
| **Part II: 在系统上运行程序** | **Ch 7. 链接 (Linking)** | ELF 目标文件格式、强弱符号解析、静态库 `.a`、`R_X86_64_PC32` 重定位、GOT/PLT 动态链接 | — | `LNX-37 ~ 44` |
| **Part II** | **Ch 8. 异常控制流 (ECF)** | 硬件中断/陷阱/故障/终止、`fork/execve/waitpid`、进程组、POSIX 信号阻塞与非本地跳转 | **Lab 5: Shell Lab** | `OS-01 ~ 15`、`MACH-56` |
| **Part II** | **Ch 9. 虚拟内存 (VM)** | 四级页表与 TLB、缺页异常、`mmap` 内存映射、动态内存分配器（隐式/显式/分离空闲链表） | **Lab 6: Malloc Lab** | `MACH-49`、`OS-16 ~ 28`、`MACH-57` |
| **Part III: 程序间的交互和通信** | **Ch 10. 系统级 I/O** | Unix 文件描述符 `fd`、`open/read/write`、Short Counts 不足值与 `rio_t` 健壮缓冲读写、内核三表 | **Lab 7: Proxy Lab** | `LNX-05 ~ 15`、`MACH-58` |
| **Part III** | **Ch 11. 网络编程** | Socket 套接字接口、`getaddrinfo`、HTTP/1.0 报文协议解析、CGI 与代理转发 | **Lab 7: Proxy Lab** | `NET-01 ~ 35`、`MACH-58` |
| **Part III** | **Ch 12. 并发编程** | 多进程并发、I/O 多路复用（`select/epoll`）、POSIX 多线程、信号量 `P/V`、读写者锁与线程安全 | **Lab 7: Proxy Lab** | `CON-01 ~ 45`、`MACH-58` |

---

## 二、Lab 1：Data Lab —— 位级整数补码与 IEEE-754 浮点手算闯关 (MACH-52)

**Data Lab** 是 CMU 15-213 的开山第一战。实验要求你在 `bits.c` 中补充十几个函数，在**严禁使用 `if/else/for/while/switch` 分支循环、严禁使用乘除法或比较运算符 `==` / `<` / `>`**，甚至每个函数只能使用受限的几个位运算符（`! ~ & ^ | + << >>`）且总操作符数量不超过上限（Max Ops）的苛刻条件下，仅靠位运算实现整数补码与 IEEE-754 浮点逻辑。

### 1. 八大核心整数与浮点关卡推导全解

#### (1) `bitXor(int x, int y)`：仅用 `~` 和 `&` 实现异或 `x ^ y`（限 14 ops）
- **数学原理**：异或定义为 $x \oplus y = (x \land \neg y) \lor (\neg x \land y)$。但题目禁用了或运算 `|`！利用**德摩根定律（De Morgan's Law）** $A \lor B = \neg(\neg A \land \neg B)$，或者换一种等价变形：先筛出“不全为 0”（$x \lor y = \neg(\neg x \land \neg y)$），再筛出“不全为 1”（$\neg(x \land y)$），两者相与即为异或：
  $$x \oplus y = \neg(\neg x \land \neg y) \land \neg(x \land y)$$
- **表达式**：`~(~x & ~y) & ~(x & y)`（仅用 7 个操作符！）。

#### (2) `tmin()`、`isTmax(int x)`、`allOddBits(int x)`、`negate(int x)`
- **`tmin()`**：32 位补码最小负数 $TMin = -2^{31} = \text{0x80000000}$，直接 `1 << 31`。
- **`negate(int x)`**：补码相反数定理 $-x = \sim x + 1$，直接 `~x + 1`。
- **`isTmax(int x)`**：判断 $x$ 是否等于 $TMax = \text{0x7FFFFFFF}$。观察发现 $TMax$ 有个奇妙性质：$TMax + 1 = TMin = \text{0x80000000} = \sim TMax$！即 `(x + 1) ^ (~x)` 为 `0`。但是当心！**$x = -1$（`0xFFFFFFFF`）也满足 $(-1 + 1) = 0 = \sim(-1)$**！所以必须额外排除 $x = -1$（即 `!!(x + 1)` 必须为真）：
  `!((~(x + 1)) ^ x) & !!(x + 1)`。
- **`allOddBits(int x)`**：判断奇数位（bit 1, 3, 5, ..., 31）是否全为 1，即检查 `(x & 0xAAAAAAAA) == 0xAAAAAAAA`。因为 Data Lab 限制常数只能是 `0x00 ~ 0xFF`（8 位以内），可通过倍增移位构造掩码 `m = 0xAA | (0xAA << 8)`，再 `m = m | (m << 16)`，最后返回 `!((x & m) ^ m)`。

#### (3) `isAsciiDigit(int x)`：判断 `0x30 <= x <= 0x39`（无比较符）
- **核心思路**：在补码中，**非负数的符号位（bit 31）为 0，负数的符号位为 1**。要检验 $0x30 \le x \le 0x39$，等价于同时检验：
  1. $x - \text{0x30} \ge 0$：即 `diff1 = x + (~0x30 + 1)` 的符号位为 0；
  2. $\text{0x39} - x \ge 0$：即 `diff2 = 0x39 + (~x + 1)` 的符号位为 0。
- **表达式**：`!((diff1 >> 31) | (diff2 >> 31))`（算术右移 31 位提取符号，若任一为负则变成 `-1`，逻辑非后为 0）。

#### (4) `conditional(int x, int y, int z)`：无分支实现 `x ? y : z`
- **掩码构造技巧**：把布尔条件 `!!x`（真为 `1`，假为 `0`）取相反数 `mask = ~(!x) + 1`：
  - 当 $x \neq 0$ 时，`!x` 为 `0`，`mask = ~0 + 1 = 0x00000000`（全 0），则 `~mask = 0xFFFFFFFF`（全 1）；
  - 当 $x = 0$ 时，`!x` 为 `1`，`mask = ~1 + 1 = -1 = 0xFFFFFFFF`（全 1），则 `~mask = 0x00000000`（全 0）。
- **无分支选择器**：`(~mask & y) | (mask & z)`。

#### (5) `isLessOrEqual(int x, int y)`：判断 `x <= y`（防减法溢出！）
- **陷阱**：如果直接算 $y - x \ge 0$，当 $y = TMax, x = TMin$ 时，$y - x$ 会发生正溢出变成负数！
- **分情况拆解**：提取两数符号位 `sx = (x >> 31) & 1`，`sy = (y >> 31) & 1`：
  1. **两数异号**（`sx ^ sy == 1`）：只有当 $x < 0$ 且 $y \ge 0$（即 `sx & !sy`）时 $x \le y$ 成立；
  2. **两数同号**（`!(sx ^ sy)`）：此时 $y - x$ **绝对不可能溢出**！直接计算 `diff = y + (~x + 1)`，只要 `diff` 符号位为 0（`!((diff >> 31) & 1)`）即成立。
- **合并**：`(sx & !sy) | (!(sx ^ sy) & !((diff >> 31) & 1))`。

#### (6) `logicalNeg(int x)`：禁止用 `!`，实现 `!x`
- **0 的独特性质**：在 32 位补码的所有 $2^{32}$ 个数中：
  - 只有 `0` 满足：`0` 的符号位是 `0`，且它的相反数 `-0 = ~0 + 1 = 0` 的符号位**也是 `0`**！
  - 对于任何正数 $x > 0$，$-x < 0$（符号位为 1）；对于任何负数 $x < 0$，$x$ 自身符号位就是 1（包括特例 $TMin$，虽然 $-TMin = TMin$，但两者符号位全为 1！）。
- **公式**：把 $x$ 和 $-x$ 按位或，算术右移 31 位后加 1：`((x | (~x + 1)) >> 31) + 1`。非零数算术右移 31 位得 `-1`，加 1 得 `0`；唯独 `0` 右移 31 位得 `0`，加 1 得 `1`！

#### (7) `howManyBits(int x)`：求表示补码 $x$ 所需的最少比特位数
- 比如 `howManyBits(12) = 5`（二进制 `01100`），`howManyBits(0) = 1`（`0`），`howManyBits(-1) = 1`（`1`），`howManyBits(-5) = 4`（`1011`）。
- **核心算法（符号归一化 + 二分折半查找最高有效 1 位）**：
  1. 若 $x < 0$，按位取反 `x = ~x`（把找负数最高位第一个 `0` 统一转化为找正数最高位第一个 `1`）：`x = x ^ (x >> 31)`；
  2. **二分折半扫描（Binary Search Bit Scan）**：
     - 先看高 16 位有没有 1：`b16 = !!(x >> 16) << 4`（有则 `b16 = 16`，否则 `0`），然后 `x >>= b16`；
     - 再看剩余高 8 位有没有 1：`b8 = !!(x >> 8) << 3`，然后 `x >>= b8`；
     - 依次折半看高 4 位（`b4`）、高 2 位（`b2`）、高 1 位（`b1`）、最后剩余最低位 `b0 = x`；
  3. 总位数 = `b16 + b8 + b4 + b2 + b1 + b0 + 1`（最后 `+1` 是补码符号位）。

#### (8) IEEE-754 浮点关卡：`floatScale2(unsigned uf)` 与 `floatFloat2Int(unsigned uf)`
- **`floatScale2(uf)`（计算 $2.0 \times f$ 的位级表示）**：
  1. 拆解单精度字段：`sign = uf & 0x80000000u`，`exp = (uf >> 23) & 0xFFu`，`frac = uf & 0x7FFFFFu`；
  2. **特殊值**（`exp == 0xFF`，即 NaN 或 $\pm\infty$）：直接原样返回 `uf`；
  3. **非规格化数**（`exp == 0`）：此时没有隐藏的整数 `1.`，直接把尾数左移 1 位 `frac <<= 1` 再拼回 `sign | frac`！**精妙之处**：如果原来 `frac` 的最高位（bit 22）是 `1`，左移 1 位后这一位会自然进位到 bit 23（即 `exp = 1` 的最低位），**严丝合缝地平滑过渡为规格化数**！
  4. **规格化数**（`1 <= exp <= 254`）：阶码加 1（`exp++`）；若加 1 后达到了 `0xFF`（上溢为无穷大），需把 `frac` 清零返回 `sign | 0x7F800000u`。

### 2. Data Lab 全套可运行验证代码（支持 WSL 一键运行）

```cpp
// 文件名：datalab_verify.cpp
// 编译运行：g++ -std=c++20 -O2 datalab_verify.cpp -o datalab_verify && ./datalab_verify
#include <iostream>
#include <cstdint>
#include <cstring>
#include <cassert>
#include <cmath>

// 1. 仅用 ~ 和 & 实现 x ^ y
int bitXor(int x, int y) {
    return ~(~x & ~y) & ~(x & y);
}

// 2. 最小补码负数 TMin (0x80000000)
int tmin() {
    return 1 << 31;
}

// 3. 判断是否为最大补码正数 TMax (0x7FFFFFFF)
int isTmax(int x) {
    int plus1 = x + 1;
    // TMax 满足 ~(x + 1) == x，且需排除 x == -1 (此时 plus1 == 0)
    return !((~plus1) ^ x) & !!(plus1);
}

// 4. 判断所有奇数位 (bit 1, 3, ..., 31) 是否全为 1
int allOddBits(int x) {
    int m8  = 0xAA;
    int m16 = m8 | (m8 << 8);
    int m32 = m16 | (m16 << 16); // 0xAAAAAAAA
    return !((x & m32) ^ m32);
}

// 5. 求相反数 -x
int negate(int x) {
    return ~x + 1;
}

// 6. 判断是否为 ASCII 数字 '0'(0x30) ~ '9'(0x39)
int isAsciiDigit(int x) {
    int lower = x + (~0x30 + 1); // x - 0x30 >= 0
    int upper = 0x39 + (~x + 1); // 0x39 - x >= 0
    return !((lower >> 31) | (upper >> 31));
}

// 7. 无分支三目运算 x ? y : z
int conditional(int x, int y, int z) {
    int mask = ~(!x) + 1; // x!=0 时 mask=0x00000000; x==0 时 mask=0xFFFFFFFF
    return (~mask & y) | (mask & z);
}

// 8. 判断 x <= y（防溢出）
int isLessOrEqual(int x, int y) {
    int sx = (x >> 31) & 1;
    int sy = (y >> 31) & 1;
    int diffSign = ((y + (~x + 1)) >> 31) & 1;
    return (sx & !sy) | (!(sx ^ sy) & !diffSign);
}

// 9. 禁用 ! 实现逻辑非 !x
int logicalNeg(int x) {
    return ((x | (~x + 1)) >> 31) + 1;
}

// 10. 二分位扫描：求表示补码 x 所需最少比特数
int howManyBits(int x) {
    int sign = x >> 31;
    x = x ^ sign; // 若 x < 0 则按位取反 ~x，统一找最高位的 1

    int b16 = !!(x >> 16) << 4; x >>= b16;
    int b8  = !!(x >> 8)  << 3; x >>= b8;
    int b4  = !!(x >> 4)  << 2; x >>= b4;
    int b2  = !!(x >> 2)  << 1; x >>= b2;
    int b1  = !!(x >> 1);       x >>= b1;
    int b0  = x;
    return b16 + b8 + b4 + b2 + b1 + b0 + 1;
}

// 11. IEEE-754 单精度浮点数乘 2 (2.0f * f)
unsigned floatScale2(unsigned uf) {
    unsigned sign = uf & 0x80000000u;
    unsigned exp  = (uf >> 23) & 0xFFu;
    unsigned frac = uf & 0x7FFFFFu;

    if (exp == 0xFFu) return uf;           // NaN 或 Inf
    if (exp == 0) return sign | (uf << 1); // 非规格化数平滑左移
    exp++;
    if (exp == 0xFFu) return sign | 0x7F800000u; // 溢出为无穷大
    return sign | (exp << 23) | frac;
}

// 12. IEEE-754 单精度浮点数转有符号 int（向零截断，越界或 NaN 返回 0x80000000u）
int floatFloat2Int(unsigned uf) {
    unsigned sign = uf >> 31;
    int exp       = ((uf >> 23) & 0xFF) - 127;
    unsigned frac = (uf & 0x7FFFFFu) | 0x800000u; // 补上隐含的 1.

    if (exp < 0) return 0;                 // |f| < 1.0，向零截断为 0
    if (exp >= 31) return 0x80000000u;     // 超过 int 表示范围返回 TMin

    int val = (exp >= 23) ? (frac << (exp - 23)) : (frac >> (23 - exp));
    return sign ? -val : val;
}

int main() {
    assert(bitXor(4, 5) == (4 ^ 5) && bitXor(-123, 456) == (-123 ^ 456));
    assert(tmin() == INT32_MIN);
    assert(isTmax(INT32_MAX) == 1 && isTmax(-1) == 0 && isTmax(0) == 0);
    assert(allOddBits(0xAAAAAAAA) == 1 && allOddBits(0xFFFFFFFD) == 0);
    assert(negate(42) == -42 && negate(-42) == 42);
    assert(isAsciiDigit('0') == 1 && isAsciiDigit('9') == 1 && isAsciiDigit('a') == 0 && isAsciiDigit('/') == 0);
    assert(conditional(5, 100, 200) == 100 && conditional(0, 100, 200) == 200);
    assert(isLessOrEqual(INT32_MIN, INT32_MAX) == 1 && isLessOrEqual(INT32_MAX, INT32_MIN) == 0 && isLessOrEqual(7, 7) == 1);
    assert(logicalNeg(0) == 1 && logicalNeg(1) == 0 && logicalNeg(INT32_MIN) == 0);
    assert(howManyBits(12) == 5 && howManyBits(298) == 10 && howManyBits(-5) == 4 && howManyBits(0) == 1 && howManyBits(-1) == 1);

    float f = 1.75f;
    unsigned uf = 0;
    std::memcpy(&uf, &f, sizeof(uf));
    unsigned uf2 = floatScale2(uf);
    float f2 = 0.0f;
    std::memcpy(&f2, &uf2, sizeof(f2));
    assert(f2 == 3.5f);
    assert(floatFloat2Int(uf2) == 3);

    std::cout << "[Data Lab] 全部 12 项位运算与 IEEE-754 浮点关卡测试 100% 通过！\n";
    return 0;
}
```

---

## 三、Lab 2：Bomb Lab —— x86-64 反汇编与 GDB 拆弹 6 关 + 隐藏关全解 (MACH-53)

在 **Bomb Lab** 中，邪恶的 Dr. Evil 给你发了一个没有源码的 Linux x86-64 可执行二进制程序 `bomb`。运行后它要求你依次输入 6 行密码字符串（对应 `phase_1` ~ `phase_6`，外加一个隐藏关 `secret_phase`）。只要任何一关输入不对，程序就会调用 `explode_bomb()` 引爆炸弹并扣分！

### 1. GDB 拆弹铁律与必备瑞士军刀指令

拆弹的第一条铁律：**在引爆函数上设断点！** 只要 `b explode_bomb` 挂上，炸弹就永远炸不响。

```bash
# 1. 反汇编全文件并导出符号表，方便离线对照阅读
objdump -d bomb > bomb.asm
strings -t x bomb > bomb_strings.txt

# 2. 启动 GDB 拆弹会话（把已解开的答案放在 psol.txt 中自动喂给前几关）
gdb -q ./bomb
(gdb) b explode_bomb          # 【救命断点】防止误触引爆！
(gdb) b phase_1               # 在各关卡入口设断点
(gdb) run psol.txt            # 用答案文件自动跳过已解出的关卡
(gdb) layout asm              # 开启汇编分屏视图 (或 layout regs 同时看寄存器)
(gdb) ni / si                 # 单步跳过 (Next Instruction) / 单步进入 (Step Instruction)
(gdb) x/s 0x402400            # 按 C 字符串格式打印内存地址 0x402400 的内容
(gdb) x/6dw $rsp              # 按有符号十进制 4B 整数 (d+w) 打印栈顶 6 个 int
(gdb) info registers          # 查看当前 %rdi, %rsi, %rdx, %rax, %rsp 等寄存器值
```

### 2. 逐关汇编指纹与拆解全流程

#### Phase 1：字符串常量比对（考察寄存器传参与 `.rodata` 寻址）
```text
0000000000400ee0 <phase_1>:
  400ee0:  48 83 ec 08          sub    $0x8,%rsp
  400ee4:  be 00 24 40 00       mov    $0x402400,%esi      # 第 2 参数 %rsi = 常量串地址 0x402400
  400ee9:  e8 4a 04 00 00       callq  401338 <strings_not_equal>
  400eee:  85 c0                test   %eax,%eax           # 若返回 0 表示相等
  400ef0:  74 05                je     400ef7 <phase_1+0x17>
  400ef2:  e8 43 05 00 00       callq  40143a <explode_bomb>
```
- **拆解**：System V ABI 中，`%rdi` 是我们输入的字符串首地址，`%esi`（`0x402400`）是目标答案字符串地址。直接在 GDB 执行 `x/s 0x402400`，瞬间打印出答案：`"Border relations with Canada have never been better."`。

#### Phase 2：栈上 6 整数数组与循环倍增（考察 `for` 循环与栈指针步进）
```text
0000000000400efc <phase_2>:
  400efc:  55                   push   %rbp
  400efd:  53                   push   %rbx
  400efe:  48 83 ec 28          sub    $0x28,%rsp          # 在栈上开辟 40 字节空间
  400f02:  48 89 e6             mov    %rsp,%rsi           # %rsi = 栈顶数组 int a[6] 首地址
  400f05:  e8 52 05 00 00       callq  40145c <read_six_numbers>
  400f0a:  83 3c 24 01          cmpl   $0x1,(%rsp)         # 检查 a[0] == 1
  400f0e:  74 20                je     400f30 <phase_2+0x34>
  ...
  400f17:  8b 43 fc             mov    -0x4(%rbx),%eax     # %eax = a[i-1]
  400f1a:  01 c0                add    %eax,%eax           # %eax = 2 * a[i-1]
  400f1c:  39 03                cmp    %eax,(%rbx)         # 检查 a[i] == 2 * a[i-1]
```
- **拆解**：`read_six_numbers` 调用 `sscanf(input, "%d %d %d %d %d %d", ...)` 读入 6 个整数存放在 `(%rsp)` 到 `0x14(%rsp)`。首项 `a[0]` 必须为 `1`，随后指针 `%rbx` 从 `a[1]` 遍历到 `a[5]`，要求每项都是前一项的 2 倍（`add %eax, %eax`）。
- **通关密码**：`1 2 4 8 16 32`。

#### Phase 3：`switch` 跳转表逆向（考察 `.rodata` 间接寻址 `jmp *addr(,%rax,8)`）
- **汇编特征**：先调用 `sscanf` 读入两个整数 `x` 和 `y`（返回值必须 `> 1`），紧接着：
  ```text
  400f6a:  83 7c 24 08 07       cmpl   $0x7,0x8(%rsp)      # 无符号比较 x <= 7
  400f6f:  77 3c                ja     400fad <explode>    # x > 7 直接引爆
  400f71:  8b 44 24 08          mov    0x8(%rsp),%eax
  400f75:  ff 24 c5 70 24 40 00 jmpq   *0x402470(,%rax,8)  # 查跳转表跳往 case x!
  ```
- **拆解**：在 GDB 中用 `x/8gx 0x402470` 打印出 8 个 64 位跳转目标地址。例如 `case 0` 跳转到 `0x400f7c`，执行 `mov $0xcf, %eax`（十进制 `207`），最后比较 `y == %eax`。
- **通关密码**：`0 207`（或 `1 311`、`2 707` 等 8 组等价解之一）。

#### Phase 4：二分递归函数 `func4` 逆推（考察递归调用树）
- **汇编还原为 C 代码**：
  ```c
  // 调用处要求：sscanf 读入 (x, y)，满足 0 <= x <= 14，且 func4(x, 0, 14) == 0 且 y == 0
  int func4(int x, int low, int high) {
      int mid = low + (high - low) / 2;
      if (mid > x)      return 2 * func4(x, low, mid - 1);
      else if (mid < x) return 2 * func4(x, mid + 1, high) + 1;
      else              return 0;
  }
  ```
- **拆解**：要让 `func4(x, 0, 14)` 返回 `0`，最直接的路径就是第一次算出的 `mid = (0 + 14) / 2 = 7` 恰好等于 `x`（或者一路只走左分支 `mid > x`：如 `x = 3`、`x = 1`、`x = 0`）！
- **通关密码**：`7 0`（或 `0 0`、`1 0`、`3 0`）。

#### Phase 5：字符低 4 位掩码查表映射（考察 `and $0xf, %eax` 与 `array.3449`）
- **汇编特征**：先用 `string_length` 检查输入字符串长度必须为 `6`。然后循环 6 次，每次取输入字符 `ch = input[i]`，执行 `and $0xf, %edx`（取 ASCII 码低 4 位作为下标 `idx = ch & 0xf`），去全局常量表 `0x4024b0`（内容为 `"maduiersnfotvbyl"`）中取出字符 `table[idx]` 拼成新串，最后要求新串等于 `"flyers"`！
- **拆解**：查 `"maduiersnfotvbyl"` 中 `'f' 'l' 'y' 'e' 'r' 's'` 各自的下标分别为：`9, 15, 14, 5, 6, 7`。只需找低 4 位分别等于 `9, 15, 14, 5, 6, 7` 的 6 个字母（如 `'a'(0x61)` ~ `'z'(0x7a)` 中，`0x69='i'`, `0x6f='o'`, `0x6e='n'`, `0x65='e'`, `0x66='f'`, `0x67='g'`）。
- **通关密码**：`ionefg`。

#### Phase 6：链表指针按节点权重重排（全剧最难关，考察结构体与二重循环）
- **汇编逻辑**：
  1. 读入 6 个互不相同的数字 $a[0..5]$，每个数字都在 $1 \sim 6$ 之间；
  2. 将每个数变为 $a[i] = 7 - a[i]$；
  3. 内存中预置了一个包含 6 个节点的单向链表 `node1(0x6032d0) -> node2 -> ... -> node6`，每个节点结构为 `struct Node { int val; int index; Node* next; };`；
  4. 根据变换后的 6 个序号，把对应的 `Node*` 指针按你指定的顺序重新串成新链表，最后校验新链表是否满足**按 `node->val` 严格降序排列**！
- **拆解**：在 GDB 中执行 `x/18gx 0x6032d0` 查看 6 个节点的 `val`：
  - `node1 = 332 (0x14c)`, `node2 = 168 (0xa8)`, `node3 = 924 (0x39c)`, `node4 = 691 (0x2b3)`, `node5 = 477 (0x1dd)`, `node6 = 443 (0x1bb)`。
  - 按 `val` 从大到小排序的节点编号顺序为：`3 -> 4 -> 5 -> 6 -> 1 -> 2`。
  - 因为代码里做了 $7 - a[i]$ 翻转，所以输入应为 $7 - \{3, 4, 5, 6, 1, 2\}$。
- **通关密码**：`4 3 2 1 6 5`。

#### Secret Phase：隐藏关解锁与二叉搜索树 `fun7` 路径编码
- **如何开启隐藏关**：反汇编 `phase_defused` 会发现，它去检查第 4 关（`phase_4`）输入缓冲区！如果你在第 4 关的答案 `7 0` 后面多附上暗号字符串 **`DrEvil`**（即第 4 关输入 `7 0 DrEvil`），6 关全过时就会触发 `secret_phase`！
- **拆解 `fun7(TreeNode* root, int target)`**：
  ```c
  int fun7(TreeNode* node, int x) {
      if (!node) return -1;
      if (x < node->val)  return 2 * fun7(node->left, x);       // 走左子树：结果 * 2 + 0
      if (x == node->val) return 0;                             // 命中节点：返回 0
      return 2 * fun7(node->right, x) + 1;                      // 走右子树：结果 * 2 + 1
  }
  ```
  `secret_phase` 要求 `fun7(n1, x) == 2`（二进制 `10`，由内向外逆推：命中 `0` -> 右子树 `2*0+1 = 1` -> 左子树 `2*1+0 = 2`）。因此从根节点 `n1(36)` 先往**左**走到 `n21(8)`，再往**右**走到 `n32(22)` 命中！
- **隐藏关密码**：`22`。

---

## 四、Lab 3：Attack Lab —— 栈缓冲区溢出、ROP 攻击链与现代三大硬件/编译器防线 (MACH-54)

**Attack Lab**（原 Buffer Lab 的 64 位升级版）让你亲手扮演安全研究员，针对两个存在 `Gets()` 栈缓冲区溢出漏洞的目标程序 `ctarget`（可执行栈，考察 **Code Injection 代码注入**）和 `rtarget`（开启了 NX 不可执行栈与 ASLR 栈地址随机化，考察 **ROP 面向返回编程**），发动 5 阶段攻击。

### 1. 栈帧越界如何劫持 CPU 的 `%rip` 指令指针？

观察目标程序中存在致命漏洞的 `getbuf()` 函数：

```c
unsigned getbuf() {
    char buf[BUFFER_SIZE]; // 假设 BUFFER_SIZE = 40 (0x28 字节)
    Gets(buf);             // 致命漏洞！像标准库 gets() 一样不检查长度，一直读到 '\n'
    return 1;
}
```

对应的汇编与栈内存布局如下：

```text
00000000004017a8 <getbuf>:
  4017a8:  48 83 ec 28          sub    $0x28,%rsp      # 开辟 40 字节栈帧 (buf[0..39])
  4017ac:  48 89 e7             mov    %rsp,%rdi       # %rdi = buf 首地址
  4017af:  e8 8c 02 00 00       callq  401a40 <Gets>   # 无边界读入字符串
  4017b4:  b8 01 00 00 00       mov    $0x1,%eax
  4017b9:  48 83 c4 28          add    $0x28,%rsp      # 回收 40 字节栈帧
  4017bd:  c3                   retq                   # 【劫持点】弹出栈顶 8B 到 %rip!

高地址  ┌──────────────────────────────────────────────┐
        │ 调用者 test() 的栈帧                         │
        ├──────────────────────────────────────────────┤
+0x28   │ Saved RIP (原本指向 test 中 call getbuf 下一行) │ ◄── 第 41~48 字节直接覆盖这里！
        ├──────────────────────────────────────────────┤
+0x00   │ char buf[40] (0x28 字节缓冲区)               │ ◄── %rsp (Gets 从这里往高地址写)
低地址  └──────────────────────────────────────────────┘
```

当 `getbuf()` 最后执行 `retq` 指令时，硬件只做一件事：**`popq %rip`**（把当时 `%rsp` 指向的 8 字节内存值装入指令指针寄存器 `%rip` 并跳转过去执行）。只要我们输入的字节超过 40 字节，第 41~48 字节就会**精确篡改 Saved RIP**！

### 2. Phase 1 ~ 3：代码注入攻击（Code Injection）

- **Phase 1（直接劫持控制流到 `touch1`）**：
  - `touch1()` 不需要任何参数，地址为 `0x4017c0`。
  - 只需构造 40 个任意填充字节（如 `00`），紧跟小端序的 8 字节地址 `c0 17 40 00 00 00 00 00`。当 `getbuf` 执行 `retq` 时，直接跳进 `touch1()`！
- **Phase 2（注入机器码设置 `%rdi = cookie` 后跳往 `touch2`）**：
  - `touch2(unsigned val)` 要求第一参数 `%rdi` 等于你的个人 Cookie（假设为 `0x59b997fa`），`touch2` 地址为 `0x4017ec`，而 GDB 测得 `getbuf` 中 `buf` 的栈首地址为 `0x5561dc78`。
  - 我们先写出 3 行汇编 `exploit.s`：
    ```asm
    movq $0x59b997fa, %rdi    # 把 cookie 装入第一参数寄存器 %rdi
    pushq $0x4017ec           # 把 touch2 的入口地址压栈
    retq                      # 弹出 touch2 地址到 %rip，完成跳转！
    ```
  - 用 `gcc -c exploit.s && objdump -d exploit.o` 获得对应的 14 字节机器码：`48 c7 c7 fa 97 b9 59 68 ec 17 40 00 c3`。
  - 将这 14 字节机器码放在 `buf` 开头，后面补 26 个 `90`（`nop`）凑满 40 字节，第 41~48 字节填 `buf` 自己的栈地址 `78 dc 61 55 00 00 00 00`！`getbuf` 返回时跳到栈上 `buf` 开头执行我们注入的机器码，随后 `retq` 进入 `touch2`！

### 3. Phase 4 ~ 5：面向返回编程（ROP, Return-Oriented Programming）

到了 `rtarget`，系统开启了两大现代防线：
1. **NX（No-Execute，栈不可执行）**：栈所在的内存页 PTE 被标记为禁止执行，一旦 `%rip` 跳到栈上执行指令，硬件立刻抛出 `SIGSEGV` 段错误！
2. **ASLR（地址空间随机化）**：每次运行栈地址都会随机漂移，你再也无法硬编码栈地址！

**黑客如何破局？—— ROP（面向返回编程）！**
既然不能在栈上执行我们自己写的指令，那就**借刀杀人**：可执行文件的 `.text` 代码段本身是合法可执行且未开启 PIE 时地址固定的！我们在现有代码段的海量字节中，搜寻以字节 **`c3`（即 `retq` 指令）** 结尾的短指令片段（称为 **Gadget**），甚至可以从某条多字节指令的**中间字节错位截取出全新的合法指令**！

```text
例如在 .text 某函数中存在如下机器码：
  4019a0:  8d 87 51 73 58 90    lea -0x6fa78caf(%rdi), %eax
  4019a6:  c3                   retq
如果我们故意把跳转地址指向中间的 0x4019a2（跳过前 2 字节 8d 87）：
  58 90 c3  被 CPU 译码为 ──►  popq %rax ; nop ; retq  (一个完美的 Gadget!)
```

#### Phase 4 的 ROP 链搭积木图解（把 `cookie` 送入 `%rdi` 并调用 `touch2`）：

假设我们在 `rtarget` 的 `farm.c` 代码段中找到了两个现成的 Gadget：
- **Gadget 1 (`0x4019ab`)**：`58 90 c3` $\rightarrow$ `popq %rax; nop; retq`（把栈顶数据弹入 `%rax`）
- **Gadget 2 (`0x4019a2`)**：`48 89 c7 c3` $\rightarrow$ `movq %rax, %rdi; retq`（把 `%rax` 拷入 `%rdi`）

我们在栈上像搭多米诺骨牌一样依次排布地址与数据，每当一个 Gadget 结尾执行 `retq` 时，栈指针 `%rsp` 自动上移 8 字节，精准触发下一个 Gadget：

```text
高地址  ┌──────────────────────────────────────────────┐
+0x40   │ 0x00000000004017ec  (touch2 入口地址)         │ ◄── 4. Gadget 2 的 retq 跳入 touch2(%rdi)!
        ├──────────────────────────────────────────────┤
+0x38   │ 0x00000000004019a2  (Gadget 2: mov %rax,%rdi)│ ◄── 3. Gadget 1 的 retq 跳入 Gadget 2
        ├──────────────────────────────────────────────┤
+0x30   │ 0x0000000059b997fa  (数据: 你的 Cookie 常量)  │ ◄── 2. 被 Gadget 1 的 popq %rax 吞入 %rax!
        ├──────────────────────────────────────────────┤
+0x28   │ 0x00000000004019ab  (Gadget 1: popq %rax;ret)│ ◄── 1. 覆盖 getbuf 的 Saved RIP，启动链条
        ├──────────────────────────────────────────────┤
+0x00   │ 40 字节填充 ('A' * 40)                        │
低地址  └──────────────────────────────────────────────┘
```

### 4. 现代三大系统级防线工程对比表

为了扼杀栈溢出与 ROP 攻击，现代编译器（GCC/Clang）与操作系统（Linux）及 CPU 硬件联手构筑了三道钢铁防线：

| 防御机制 | 所在层级 | 核心底层实现原理 | 针对的攻击手段 | 编译开关 / 绕过条件 |
| :--- | :--- | :--- | :--- | :--- |
| **Stack Canary**<br>（栈金丝雀保护） | 编译器 | 函数入口从线程局部存储 `mov %fs:0x28, %rax` 读取随机 Canary 哨兵值压在 `buf` 与 `Saved RIP` 之间；`retq` 前校验该值是否被改写，若被篡改立即调 `__stack_chk_fail` 终止进程 | 顺序覆盖 Saved RIP 的所有栈缓冲区溢出（含 Code Injection 与 ROP） | `-fstack-protector-strong`（默认开启；Lab 中用 `-fno-stack-protector` 关闭）<br>*若存在格式化字符串等任意读漏洞泄露 Canary 则可被绕过* |
| **NX / DEP**<br>（数据执行保护） | CPU 硬件 MMU + OS 页表 | x86-64 页表项（PTE）最高位第 63 位为 **XD/NX 位**；OS 将栈和堆页的 NX 位置 1，硬件取指碰到 NX=1 直接触发页故障 `#PF` (`SIGSEGV`) | 栈/堆上的直接代码注入（Code Injection / Shellcode） | 链接选项 `-z noexecstack`（默认开启；`ctarget` 用 `-z execstack` 关闭）<br>*无法防御借用 `.text` 段现有指令的 ROP 攻击* |
| **ASLR + PIE**<br>（地址空间随机化） | OS 内核加载器 + 编译器 | 内核每次加载进程时随机化栈、堆、共享库（`libc.so`）基址；配合 `-fPIE -pie` 编译的位置无关可执行文件，连主程序 `.text` 代码段基址也彻底随机化 | 硬编码栈地址或硬编码 `.text` Gadget 绝对地址的 ROP 攻击 | `/proc/sys/kernel/randomize_va_space = 2` + 编译 `-fPIE -pie`<br>*需配合 Info Leak（信息泄露漏洞）先算出运行时基址偏移才能构造 ROP* |
| **Intel CET / ARM PAC**<br>（控制流完整性） | 新一代 CPU 硬件 | **Shadow Stack（影子栈）**在硬件隔离区备份真实返回地址，`ret` 时对比主栈与影子栈；`endbr64` 限制间接跳转目标 | 全面封杀篡改返回地址的 ROP 与 JOP | `-fcf-protection=full`（GCC 11+ 与 Intel Tiger Lake / Zen 3+ 硬件支持） |

---

## 五、Lab 4：Cache Lab —— 手写 LRU 缓存模拟器与矩阵转置分块（Blocking）优化 (MACH-55)

**Cache Lab** 分为上下两篇：**Part A (`csim.c`)** 要求你根据传入的 $(s, E, b)$ 参数，从零手写一个具备 **LRU（最近最少使用）替换策略**的组相联高速缓存模拟器；**Part B (`trans.c`)** 则要求你在极度受限的直接映射缓存 $(s=5, E=1, b=5)$ 下，通过**循环分块（Loop Blocking / Tiling）**技术消除矩阵转置 $B[j][i] = A[i][j]$ 的对角线缓存冲突抖动。

### 1. Part A：64 位地址拆分与组相联 LRU 缓存模拟器完整实现

在 $(S=2^s, E, B=2^b)$ 组相联 Cache 中，任意 64 位内存地址 `addr` 被硬件划分为三段：

```text
 63                           s+b   s+b-1          b   b-1            0
┌─────────────────────────────────┬──────────────────┬─────────────────┐
│           Tag (标记位)           │  Set Index (s位)  │ Block Offset(b位)│
│      t = 64 - (s + b) bits      │ 决定去哪一组 (0~S-1)│  块内字节偏移    │
└─────────────────────────────────┴──────────────────┴─────────────────┘
  • Set Index = (addr >> b) & ((1ULL << s) - 1)
  • Tag       = addr >> (s + b)
```

对于 Valgrind 产生的内存跟踪指令：
- `I`（指令加载）：忽略；
- `L`（数据加载 Load）或 `S`（数据存储 Store）：访问 Cache **1 次**；
- `M`（数据修改 Modify，如 `x++`）：等价于**先 Load 再 Store**，访问同一个地址 **2 次**（第 1 次可能 Miss/Hit，第 2 次必定 Hit！）。

下面用现代 C++20 完整实现可直接在 WSL 编译运行的 Cache Lab Part A 模拟器，并内联一组标准 Valgrind 轨迹自测：

```cpp
// 文件名：cachelab_csim.cpp
// 编译运行：g++ -std=c++20 -O2 cachelab_csim.cpp -o cachelab_csim && ./cachelab_csim
#include <iostream>
#include <vector>
#include <cstdint>
#include <string>
#include <sstream>
#include <cassert>

struct CacheLine {
    bool valid = false;
    uint64_t tag = 0;
    uint64_t lru_clock = 0; // 时间戳越大表示越近被访问
};

class CacheSimulator {
public:
    int s, E, b;
    uint64_t hits = 0, misses = 0, evictions = 0, clock_tick = 0;
    std::vector<std::vector<CacheLine>> sets;

    CacheSimulator(int s_, int E_, int b_)
        : s(s_), E(E_), b(b_), sets(1ULL << s_, std::vector<CacheLine>(E_)) {}

    void access(uint64_t addr) {
        ++clock_tick;
        uint64_t set_idx = (addr >> b) & ((1ULL << s) - 1);
        uint64_t tag     = addr >> (s + b);
        auto& set        = sets[set_idx];

        // 1. 检查是否命中 (Cache Hit)
        for (auto& line : set) {
            if (line.valid && line.tag == tag) {
                ++hits;
                line.lru_clock = clock_tick;
                return;
            }
        }

        // 2. 未命中 (Cache Miss)
        ++misses;

        // 3. 优先寻找组内空闲行 (Cold Miss，无需驱逐)
        for (auto& line : set) {
            if (!line.valid) {
                line.valid     = true;
                line.tag       = tag;
                line.lru_clock = clock_tick;
                return;
            }
        }

        // 4. 组已满，执行 LRU 替换策略（驱逐 lru_clock 最小的行）
        ++evictions;
        auto* victim = &set[0];
        for (auto& line : set) {
            if (line.lru_clock < victim->lru_clock) {
                victim = &line;
            }
        }
        victim->tag       = tag;
        victim->lru_clock = clock_tick;
    }

    void process_trace_line(char op, uint64_t addr) {
        if (op == 'I') return;
        access(addr);
        if (op == 'M') access(addr); // Modify = Load + Store (第二次必 Hit)
    }
};

int main() {
    // 验证 CMU Cache Lab 经典用例 (s=4, E=1, b=4) 在 yi.trace 上的精确计数
    CacheSimulator sim(4, 1, 4);
    const char* yi_trace =
        "L 10,1\n"
        "M 20,1\n"
        "L 22,1\n"
        "S 18,1\n"
        "L 110,1\n"
        "L 210,1\n"
        "M 12,1\n";

    std::istringstream iss(yi_trace);
    char op, comma;
    uint64_t addr;
    int size;
    while (iss >> op >> std::hex >> addr >> comma >> std::dec >> size) {
        sim.process_trace_line(op, addr);
    }

    std::cout << "[Cache Lab Part A] hits:" << sim.hits
              << " misses:" << sim.misses
              << " evictions:" << sim.evictions << "\n";
    // CMU 官方标准参考输出：hits:4 misses:5 evictions:3
    assert(sim.hits == 4 && sim.misses == 5 && sim.evictions == 3);
    std::cout << "[Cache Lab] LRU 模拟器与官方 csim-ref 结果 100% 一致！\n";
    return 0;
}
```

### 2. Part B：矩阵转置 $B[j][i] = A[i][j]$ 的冲突抖动剖析与分块绝技

Part B 的硬件环境是一个仅有 **1 KiB 的直接映射缓存**：$s=5$（共 $S=32$ 组）、$E=1$（每组仅 1 行，碰到同组不同 Tag 立刻驱逐！）、$b=5$（每行 $B=32$ 字节，刚好装 **8 个 `int`**）。整个 Cache 总共只能装下 $32 \times 8 = 256$ 个 `int`。

#### 为什么 $32 \times 32$ 矩阵直接转置会高达 1183 次 Miss？
1. **列跨步扫描 $B[j][i]$ 丧失空间局部性**：$A$ 按行读每 8 个 `int` 才 Miss 1 次；但 $B$ 按列写，每写一个元素跨过整行 32 个 `int`（128 字节 = 4 个缓存行），加上整个 $32 \times 32$ 矩阵占 4 KiB（是 Cache 容量 1 KiB 的 4 倍），写完一列回来早就被冲刷光了！
2. **致命的对角线同组冲突（Diagonal Conflict Miss）**：矩阵 $A$ 和矩阵 $B$ 的起始地址相差整数倍的 1 KiB（均为 `0x400` 的倍数）！这意味着 **$A[i][j]$ 和 $B[i][j]$ 永远映射到完全相同的 Cache 组号（Set Index）**！
   - 当处理对角线块（$i == j$）时，刚把 $A$ 的第 $i$ 行读进 Cache Set $k$，紧接着往 $B[i][i]$ 写时，立刻把刚读进来的 $A[i][i..i+7]$ 所在的缓存行从 Set $k$ 里踢了出去；下一拍读 $A[i][i+1]$ 又把 $B$ 踢出去——**乒乒乓乓来回驱逐（Cache Thrashing）**！

#### 满分破局方案：
- **$32 \times 32$ 矩阵（满分线 `< 300` Misses）**：采用 **$8 \times 8$ 分块 + 8 个局部变量寄存器暂存**！
  - 每个子块大小设为 $8 \times 8$（因为一行缓存行恰好装 8 个 `int`，8 行总共占 8 个不同的 Cache Set，连 $A$ 带 $B$ 共 16 个 Set，不到 32 个 Set 的一半，绝不自相冲突！）。
  - 在 $8 \times 8$ 子块内部，用 **8 个局部变量 `v0 ~ v7`（驻留在 CPU 寄存器中，完全不访存！）** 一口气读出 $A$ 子块的一整行 8 个 `int`，再写入 $B$ 子块的对应列。这样即使在对角线块上，读完 $A$ 的一行之前绝不碰 $B$，彻底消灭了同一行内 $A[i][i]$ 与 $B[i][i]$ 的乒乓冲突，Miss 数直接从 **1183 次暴跌至 ~287 次**！
- **$64 \times 64$ 矩阵（满分线 `< 1300` Misses）**：
  - 此时每行有 64 个 `int`（256 字节 = 8 个 Cache Line），每隔 **4 行**（$4 \times 256 = 1024$ 字节 = 32 个 Set）就会在 Cache 中发生同一组回绕冲突！一个 $8 \times 8$ 块的下半部分（第 4~7 行）会直接把上半部分（第 0~3 行）踢出 Cache！
  - **解法（$8 \times 8$ 外层分块 + 内部拆成 4 个 $4 \times 4$ 小象限借位倒腾）**：
    1. 先处理 $A$ 的上半 $4 \times 8$：用 8 个寄存器变量读出 $A$ 左上 $4 \times 4$ 和右上 $4 \times 4$，把左上 $4 \times 4$ 正确转置写入 $B$ 的左上 $4 \times 4$，同时把本该去 $B$ 左下的数据**暂时转置寄存在 $B$ 的右上 $4 \times 4$**（因为 $B$ 的右上和左上在同一缓存行，写它是白赚的 100% Hit！）；
    2. 按列用 4 个寄存器先备份 $B$ 右上暂存的一行，再用另外 4 个寄存器从 $A$ 的左下 $4 \times 4$ 读出一列直接覆盖写入 $B$ 的右上 $4 \times 4$，随后把刚才备份在寄存器里的 4 个数一行写入 $B$ 的左下 $4 \times 4$；
    3. 最后原地转置右下 $4 \times 4$。Miss 数可压低至 **~1179 次**，稳拿满分！

---

## 六、Lab 5：Shell Lab (`tsh`) —— 进程组、作业控制与信号无竞态同步 (MACH-56)

在 **Shell Lab** 中，你将亲手实现一个支持前台/后台作业控制（`jobs`、`bg`、`fg`）以及 `Ctrl+C` (`SIGINT`) / `Ctrl+Z` (`SIGTSTP`) 信号转发的 Unix Shell —— **`tsh` (Tiny Shell)**。这是对 CS:APP 第 8 章**异常控制流（ECF）**最硬核的检验。

### 1. 攻克两大最易丢分的底层机制陷阱

#### 陷阱一：为什么子进程 `fork()` 后必须立刻调用 `setpgid(0, 0)`？
当你在终端按下 `Ctrl+C` 时，内核的终端驱动程序会把 `SIGINT` 发送给**当前前台进程组（Foreground Process Group）里的每一个进程**。
- 如果 `tsh` 派生出的子进程不脱离父进程的进程组，所有前台/后台子进程和 `tsh` 自己都处于同一个进程组；
- 为了让 `tsh` 独立管理每个作业，子进程在 `fork() == 0` 分支、`execve()` 之前，必须立刻调用 **`setpgid(0, 0)`**，将自己的进程组 ID（PGID）设为自己的 PID，自立门户成立一个新进程组！
- 当 `tsh` 的 `sigint_handler` / `sigtstp_handler` 捕获到 `Ctrl+C` / `Ctrl+Z` 时，用 `pid_t pid = fgpid(jobs);` 查出当前前台作业的 PID，然后调用 **`kill(-pid, SIGINT)`**（注意 **`-pid` 前面的负号**！`kill(-pgid, sig)` 表示把信号发给进程组 ID 为 `pgid` 的**整组所有子孙进程**，比如通过管道或子 `fork` 派生出的所有进程）。

#### 陷阱二：为什么 `fork()` 前必须阻塞 `SIGCHLD`，并用 `sigsuspend` 等待前台作业？
看看下面这段**存在致命并发竞态条件（Race Condition）**的错误 `eval` 写法：

```c
// 【错误示范：致命的时间窗竞态 Bug】
if ((pid = fork()) == 0) {
    execve(argv[0], argv, environ);
}
// 灾难场景：如果子进程极短（如 /bin/true），在父进程还没来得及执行下一行 addjob 之前，
// 子进程就已经跑完退出了！内核立刻打断父进程跳入 sigchld_handler 执行 deletejob(jobs, pid)
// —— 此时作业表里根本还没有这个 pid，deletejob 什么也没删；
// 等信号处理函数返回后，父进程才傻乎乎地执行 addjob(jobs, pid, ...)，
// 结果一个早已死掉的进程被永久添加进了 jobs 表，变成永远无法清除的“幽灵作业”！
addjob(jobs, pid, state, cmdline);
```

**无竞态标准范式（`sigprocmask` + `sigsuspend`）**：
1. 在调用 `fork()` **之前**，父进程必须先用 `sigprocmask(SIG_BLOCK, &mask_chld, &prev_mask)` **阻塞 `SIGCHLD` 信号**；
2. 子进程继承了父进程的阻塞掩码，因此在 `execve` **之前**必须用 `sigprocmask(SIG_SETMASK, &prev_mask, NULL)` 恢复掩码；
3. 父进程在 `SIGCHLD` 仍被阻塞的安全保护期内，从容执行 `addjob(jobs, pid, ...)`（为防 `addjob` 内部全局结构被其他信号打断，操作全局 `jobs` 前建议阻塞全部信号 `mask_all`）；
4. 如果该作业是前台作业（`!bg`），父进程切勿用 `sleep(1)` 轮询浪费 CPU，而是用原子操作 **`while (pid == fgpid(jobs)) sigsuspend(&prev_mask);`** —— 它在一条原子指令内完成**“临时解除对 `SIGCHLD` 的阻塞 + 挂起休眠等待信号唤醒”**，收到信号返回后自动恢复阻塞掩码，最后父进程再彻底恢复 `prev_mask`！

### 2. Shell Lab 核心骨架完整实现参考

```c
// Shell Lab (tsh.c) 核心函数满分无竞态实现模板
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <errno.h>

// 1. eval 主控流程：fork 前阻塞 SIGCHLD + 子进程 setpgid(0, 0) + 父进程 addjob 后解锁
void eval_core_pattern(char **argv, int bg, char *cmdline) {
    sigset_t mask_all, mask_one, prev_one;
    sigfillset(&mask_all);
    sigemptyset(&mask_one);
    sigaddset(&mask_one, SIGCHLD);

    // 【关键第1步】fork 之前阻塞 SIGCHLD，彻底封死“先 deletejob 后 addjob”竞态！
    sigprocmask(SIG_BLOCK, &mask_one, &prev_one);

    pid_t pid = fork();
    if (pid == 0) {
        // 子进程：恢复信号掩码 + 独立建进程组 setpgid(0, 0) + 执行目标程序
        sigprocmask(SIG_SETMASK, &prev_one, NULL);
        setpgid(0, 0);
        if (execve(argv[0], argv, NULL) < 0) {
            printf("%s: Command not found\n", argv[0]);
            exit(0);
        }
    }

    // 父进程：阻塞所有信号以保护全局 jobs 链表写入
    sigprocmask(SIG_BLOCK, &mask_all, NULL);
    // addjob(jobs, pid, bg ? BG : FG, cmdline);

    if (!bg) {
        // 【关键第2步】前台作业：用 sigsuspend 原子地解除阻塞并休眠等待 SIGCHLD
        // while (pid == fgpid(jobs)) {
        //     sigsuspend(&prev_one);
        // }
        sigprocmask(SIG_SETMASK, &prev_one, NULL);
    } else {
        sigprocmask(SIG_SETMASK, &prev_one, NULL);
        // printf("[%d] (%d) %s", pid2jid(pid), pid, cmdline);
    }
}

// 2. sigchld_handler：异步安全的僵尸进程回收与作业状态更新
void sigchld_handler(int sig) {
    int olderrno = errno; // 【铁律】保存并恢复 errno！
    sigset_t mask_all, prev_all;
    sigfillset(&mask_all);

    pid_t pid;
    int status;
    // 【关键第3步】必须用 while 循环 + WNOHANG | WUNTRACED，因为同类信号不排队！
    while ((pid = waitpid(-1, &status, WNOHANG | WUNTRACED)) > 0) {
        sigprocmask(SIG_BLOCK, &mask_all, &prev_all);
        if (WIFEXITED(status)) {
            // 正常退出：直接从作业表删除
            // deletejob(jobs, pid);
        } else if (WIFSIGNALED(status)) {
            // 被未捕获信号杀死（如 SIGINT）：打印提示并删除作业
            // deletejob(jobs, pid);
        } else if (WIFSTOPPED(status)) {
            // 被 Ctrl+Z (SIGTSTP) 暂停：将作业状态改为 ST (Stopped)
            // getjobpid(jobs, pid)->state = ST;
        }
        sigprocmask(SIG_SETMASK, &prev_all, NULL);
    }
    errno = olderrno;
}
```

---

## 七、Lab 6：Malloc Lab —— 从零手写动态内存分配器（边界标记合并与分离空闲链表） (MACH-57)

**Malloc Lab** 被公认为 CMU 15-213 工程量最大、最具成就感的巅峰实验。你需要在禁用系统 `malloc` 的前提下，仅凭 `mem_sbrk(size)` 扩展堆区，亲手写出 `mm_init`、`mm_malloc`、`mm_free` 和 `mm_realloc`。评分器从两个维度给你打分：
- **空间利用率（Space Utilization，占 60% 权重）**：减少内部碎片（对齐与头部开销）和外部碎片（积极合并相邻空闲块）；
- **吞吐率（Throughput，占 40% 权重）**：减少查找空闲块的遍历耗时（从隐式链表的 $O(N)$ 进化到分离空闲链表的近似 $O(1)$）。

### 1. Knuth 边界标记（Boundary Tags）与 $O(1)$ 立即合并

为什么一个块除了开头的 **Header（头部 4B）** 记录 `[块总大小 (高 29 位) | 00 | 已分配位 a (最低位)]` 之外，在块的末尾还要放一个内容一模一样的 **Footer（脚部 4B）**？
- 因为当 `mm_free(bp)` 释放当前块时，要向后合并**高地址邻居（Next Block）**很容易，顺着当前块的 `size` 跨过去就能读到后一块的 Header；
- 但如果想向前合并**低地址邻居（Previous Block）**，如果没有 Footer，你根本不知道前一块有多大，只能从堆头遍历整个链表！
- 有了 **Knuth 边界标记（Footer）**，当前块 `HDRP(bp)` 往低地址退 4 字节（`bp - 8`）**正好就是前一个块的 Footer**！在 $O(1)$ 常数时间内就能直接读出前一块的分配状态和大小！

```text
  前一个块末尾               当前空闲块 (16 字节对齐)                     后一个块开头
 ──────────────┐   ┌──────────┬──────────┬──────────┬───────────┬──────────┐   ┌──────────────
  ... | Footer │   │ Header   │ pred_ofs │ succ_ofs │ ...空闲... │ Footer   │   │ Header | ...
      │ (4B)   │   │sz|a (4B) │ (4B前驱) │ (4B后继) │           │sz|a (4B) │   │ (4B)
 ──────────────┘   └──────────┴──────────┴──────────┴───────────┴──────────┘   └──────────────
      ▲                       ▲
  PREV_FTRP(bp)            bp (Payload 载荷首地址，保证 8B/16B 对齐)
```

释放或扩展堆块时，根据前后相邻块的 `alloc` 位，存在经典的**四种立即合并（Immediate Coalescing）情形**：
1. **Case 1（前占、后占）**：无法合并，直接将当前块插入空闲链表；
2. **Case 2（前占、后空）**：先把后一块从空闲链表摘除，`size += next_size`，更新当前块 Header 与后一块 Footer；
3. **Case 3（前空、后占）**：先把前一块从空闲链表摘除，`size += prev_size`，更新前一块 Header 与当前块 Footer，`bp = PREV_BLKP(bp)`；
4. **Case 4（前空、后空）**：把前后两块都从空闲链表摘除，三块合一：`size += prev_size + next_size`，更新前块 Header 与后块 Footer，`bp = PREV_BLKP(bp)`。

### 2. 三代空闲链表架构演进与评分对比

| 架构演进代际 | 组织方式与查找时间复杂度 | 空间利用率 (Util) | 吞吐率 (Kops/s) | Lab 综合得分预期 |
| :--- | :--- | :--- | :--- | :--- |
| **第一代：隐式空闲链表**<br>(Implicit Free List) | 堆中所有块（含已分配块和空闲块）靠 Header 中的 `size` 串成一条单向链；`malloc` 必须跨过所有已分配块，$O(N_{\text{total}})$ | ~72% | 极低 (~1,500) | 50 ~ 65 / 100 |
| **第二代：显式双向空闲链表**<br>(Explicit Free List) | 利用**空闲块原本闲置的 Payload 前 8/16 字节**存放 `pred` 和 `succ` 双向指针，只把空闲块串成双向链表；LIFO 头插法释放 $O(1)$，查找降为 $O(N_{\text{free}})$ | ~75% | 高 (~12,000) | 82 ~ 88 / 100 |
| **第三代：分离空闲链表**<br>(Segregated Free Lists) | 按块大小 $2^k$ 幂次划分 12~16 个大小类分桶（如 `{16..31}, {32..63}, {64..127}, ...`），每个桶维护一条显式空闲链表；近似 **Best-Fit（最佳适配）** + $O(1)$ 查找！ | **90% ~ 96%** | **极高 (~16,000+)** | **95 ~ 100 / 100** |

### 3. Malloc Lab 分离空闲链表分配器完整 C++20 自测实现（支持 WSL 一键运行）

下面是一份完整的、采用**边界标记立即合并 + 10 级幂次分桶分离空闲链表（Segregated Free Lists）**的动态内存分配器实现，可以直接在 WSL 下编译运行并输出堆块合并与复用验证报告：

```cpp
// 文件名：malloclab_seglist.cpp
// 编译运行：g++ -std=c++20 -O2 malloclab_seglist.cpp -o malloclab_seglist && ./malloclab_seglist
#include <iostream>
#include <vector>
#include <cstdint>
#include <cstring>
#include <cassert>
#include <algorithm>

class SegregatedAllocator {
private:
    static constexpr size_t WSIZE     = 4;             // 头/脚部字长 4B
    static constexpr size_t DSIZE     = 8;             // 双字对齐 8B
    static constexpr size_t MIN_BLK   = 16;            // 最小块 16B (4B Header + 4B pred + 4B succ + 4B Footer)
    static constexpr size_t CHUNKSIZE = (1 << 12);     // 每次扩展堆 4096B
    static constexpr int    NUM_BINS  = 10;            // 10 个大小类分离桶

    std::vector<uint8_t> arena;                        // 模拟虚拟内存堆空间
    size_t brk_offset = 0;
    uint8_t* heap_listp = nullptr;
    uint32_t bins[NUM_BINS]{};                         // 存各桶头节点的堆内偏移 (0 表示空指针)

    static uint32_t PACK(size_t size, int alloc) { return static_cast<uint32_t>(size | alloc); }
    static uint32_t GET(const void* p)           { uint32_t v; std::memcpy(&v, p, 4); return v; }
    static void     PUT(void* p, uint32_t val)   { std::memcpy(p, &val, 4); }
    static size_t   GET_SIZE(const void* p)      { return GET(p) & ~0x7u; }
    static int      GET_ALLOC(const void* p)     { return GET(p) & 0x1u; }

    static uint8_t* HDRP(void* bp)               { return static_cast<uint8_t*>(bp) - WSIZE; }
    static uint8_t* FTRP(void* bp)               { return static_cast<uint8_t*>(bp) + GET_SIZE(HDRP(bp)) - DSIZE; }
    static uint8_t* NEXT_BLKP(void* bp)          { return static_cast<uint8_t*>(bp) + GET_SIZE(HDRP(bp)); }
    static uint8_t* PREV_BLKP(void* bp)          { return static_cast<uint8_t*>(bp) - GET_SIZE(static_cast<uint8_t*>(bp) - DSIZE); }

    uint32_t ptr_to_ofs(const void* bp) const    { return bp ? static_cast<uint32_t>(static_cast<const uint8_t*>(bp) - arena.data()) : 0; }
    uint8_t* ofs_to_ptr(uint32_t ofs)            { return ofs ? (arena.data() + ofs) : nullptr; }

    // 空闲块 Payload 前 8B 存 32 位堆内偏移 pred_ofs 与 succ_ofs（节省一半指针空间！）
    uint32_t get_pred(const void* bp) const      { return GET(bp); }
    uint32_t get_succ(const void* bp) const      { return GET(static_cast<const uint8_t*>(bp) + 4); }
    void     set_pred(void* bp, uint32_t ofs)    { PUT(bp, ofs); }
    void     set_succ(void* bp, uint32_t ofs)    { PUT(static_cast<uint8_t*>(bp) + 4, ofs); }

    int get_bin_index(size_t size) const {
        int idx = 0;
        size >>= 4; // 16B 起步为桶 0
        while (size > 1 && idx < NUM_BINS - 1) {
            size >>= 1;
            ++idx;
        }
        return idx;
    }

    void insert_free_block(void* bp) {
        size_t size = GET_SIZE(HDRP(bp));
        int bin = get_bin_index(size);
        uint32_t bp_ofs = ptr_to_ofs(bp);
        uint32_t head_ofs = bins[bin];

        set_pred(bp, 0);
        set_succ(bp, head_ofs);
        if (head_ofs != 0) {
            set_pred(ofs_to_ptr(head_ofs), bp_ofs);
        }
        bins[bin] = bp_ofs;
    }

    void remove_free_block(void* bp) {
        size_t size = GET_SIZE(HDRP(bp));
        int bin = get_bin_index(size);
        uint32_t pred_ofs = get_pred(bp);
        uint32_t succ_ofs = get_succ(bp);

        if (pred_ofs != 0) set_succ(ofs_to_ptr(pred_ofs), succ_ofs);
        else               bins[bin] = succ_ofs;

        if (succ_ofs != 0) set_pred(ofs_to_ptr(succ_ofs), pred_ofs);
    }

    void* coalesce(void* bp) {
        size_t prev_alloc = GET_ALLOC(FTRP(PREV_BLKP(bp)));
        size_t next_alloc = GET_ALLOC(HDRP(NEXT_BLKP(bp)));
        size_t size       = GET_SIZE(HDRP(bp));

        if (prev_alloc && !next_alloc) {                  // Case 2: 后块空闲
            remove_free_block(NEXT_BLKP(bp));
            size += GET_SIZE(HDRP(NEXT_BLKP(bp)));
            PUT(HDRP(bp), PACK(size, 0));
            PUT(FTRP(bp), PACK(size, 0));
        } else if (!prev_alloc && next_alloc) {           // Case 3: 前块空闲
            remove_free_block(PREV_BLKP(bp));
            size += GET_SIZE(HDRP(PREV_BLKP(bp)));
            PUT(FTRP(bp), PACK(size, 0));
            PUT(HDRP(PREV_BLKP(bp)), PACK(size, 0));
            bp = PREV_BLKP(bp);
        } else if (!prev_alloc && !next_alloc) {          // Case 4: 前后均空闲
            remove_free_block(PREV_BLKP(bp));
            remove_free_block(NEXT_BLKP(bp));
            size += GET_SIZE(HDRP(PREV_BLKP(bp))) + GET_SIZE(FTRP(NEXT_BLKP(bp)));
            PUT(HDRP(PREV_BLKP(bp)), PACK(size, 0));
            PUT(FTRP(NEXT_BLKP(bp)), PACK(size, 0));
            bp = PREV_BLKP(bp);
        }
        insert_free_block(bp);
        return bp;
    }

    void* extend_heap(size_t words) {
        size_t size = (words % 2) ? (words + 1) * WSIZE : words * WSIZE;
        if (size < MIN_BLK) size = MIN_BLK;
        uint8_t* bp = arena.data() + brk_offset;
        brk_offset += size;

        PUT(HDRP(bp), PACK(size, 0));         // 新空闲块 Header
        PUT(FTRP(bp), PACK(size, 0));         // 新空闲块 Footer
        PUT(HDRP(NEXT_BLKP(bp)), PACK(0, 1)); // 新结尾块 Epilogue Header
        return coalesce(bp);
    }

    void* find_fit(size_t asize) {
        for (int bin = get_bin_index(asize); bin < NUM_BINS; ++bin) {
            for (uint32_t cur = bins[bin]; cur != 0; cur = get_succ(ofs_to_ptr(cur))) {
                uint8_t* bp = ofs_to_ptr(cur);
                if (GET_SIZE(HDRP(bp)) >= asize) {
                    return bp;
                }
            }
        }
        return nullptr;
    }

    void place(void* bp, size_t asize) {
        size_t csize = GET_SIZE(HDRP(bp));
        remove_free_block(bp);

        if ((csize - asize) >= MIN_BLK) {
            // 剩余空间足够切分出一个新的最小空闲块
            PUT(HDRP(bp), PACK(asize, 1));
            PUT(FTRP(bp), PACK(asize, 1));
            void* next_bp = NEXT_BLKP(bp);
            PUT(HDRP(next_bp), PACK(csize - asize, 0));
            PUT(FTRP(next_bp), PACK(csize - asize, 0));
            insert_free_block(next_bp);
        } else {
            PUT(HDRP(bp), PACK(csize, 1));
            PUT(FTRP(bp), PACK(csize, 1));
        }
    }

public:
    SegregatedAllocator() : arena(1024 * 1024, 0) { // 预留 1 MiB 模拟堆
        mm_init();
    }

    int mm_init() {
        std::fill(std::begin(bins), std::end(bins), 0);
        brk_offset = 4 * WSIZE;
        uint8_t* base = arena.data();
        PUT(base, 0);                                 // 对齐填充字
        PUT(base + (1 * WSIZE), PACK(DSIZE, 1));      // 序言块 Prologue Header (8B, 已分配)
        PUT(base + (2 * WSIZE), PACK(DSIZE, 1));      // 序言块 Prologue Footer (8B, 已分配)
        PUT(base + (3 * WSIZE), PACK(0, 1));          // 结尾块 Epilogue Header (0B, 已分配)
        heap_listp = base + (2 * WSIZE);
        return extend_heap(CHUNKSIZE / WSIZE) != nullptr ? 0 : -1;
    }

    void* mm_malloc(size_t size) {
        if (size == 0) return nullptr;
        size_t asize = (size <= DSIZE) ? MIN_BLK : DSIZE * ((size + DSIZE + (DSIZE - 1)) / DSIZE);

        if (void* bp = find_fit(asize)) {
            place(bp, asize);
            return bp;
        }
        size_t extendsize = std::max(asize, CHUNKSIZE);
        void* bp = extend_heap(extendsize / WSIZE);
        place(bp, asize);
        return bp;
    }

    void mm_free(void* bp) {
        if (!bp) return;
        size_t size = GET_SIZE(HDRP(bp));
        PUT(HDRP(bp), PACK(size, 0));
        PUT(FTRP(bp), PACK(size, 0));
        coalesce(bp);
    }
};

int main() {
    SegregatedAllocator alloc;

    void* p1 = alloc.mm_malloc(64);
    void* p2 = alloc.mm_malloc(128);
    void* p3 = alloc.mm_malloc(64);
    assert(p1 && p2 && p3);

    // 释放前后相邻的 p1、p3，再释放中间的 p2 触发 Case 4 三块合一立即合并！
    alloc.mm_free(p1);
    alloc.mm_free(p3);
    alloc.mm_free(p2);

    // 申请一个 256 字节的大块，应直接命中刚才 p1+p2+p3 合并出的连续空闲块首地址 p1！
    void* p_merged = alloc.mm_malloc(256);
    assert(p_merged == p1);

    std::cout << "[Malloc Lab] 分离空闲链表 (Segregated Free Lists) 分配、切分与边界标记四态合并自测 100% 通过！\n";
    return 0;
}
```

---

## 八、Lab 7：Proxy Lab —— 并发 HTTP 代理服务器与线程安全 LRU Web 缓存 (MACH-58)

**Proxy Lab** 是 CS:APP 全书的大结局实验，将第 10 章（系统级 I/O 与 `rio_t`）、第 11 章（Socket 网络编程与 HTTP 协议）和第 12 章（POSIX 多线程并发与读写者锁同步）融为一体。你需要构建一个可以挂在真实浏览器（Firefox / Chrome / `curl --proxy`）后面的**多线程并发缓存 HTTP 代理服务器**。

```text
┌──────────┐  1. GET http://host:port/path HTTP/1.1   ┌──────────────────────┐  2. 缓存未命中时转发 HTTP/1.0  ┌────────────┐
│  浏览器   │ ───────────────────────────────────────► │  你的 Proxy 服务器   │ ─────────────────────────────► │ 远端源站   │
│ / curl   │ ◄─────────────────────────────────────── │ (预线程池 + LRU 缓存) │ ◄───────────────────────────── │ Web Server │
└──────────┘  4. 回传响应 (若命中 Cache 则 0 网络往返) └──────────────────────┘  3. 接收响应，若 <=100KiB 入库 └────────────┘
```

### 1. 第一关：HTTP 请求解析与四大规范化请求头改写

当客户端向代理发送 `GET http://www.cmu.edu:8080/hub/index.html HTTP/1.1\r\n` 时，你的代理必须：
1. **拆解 URL**：提取出目标主机名 `host = "www.cmu.edu"`、目标端口 `port = "8080"`（若省略则默认为 `"80"`）以及请求路径 `path = "/hub/index.html"`；
2. **降级改写请求行**：将 `HTTP/1.1` 改写为 **`GET /hub/index.html HTTP/1.0\r\n`**（避免处理 HTTP/1.1 复杂的 `Transfer-Encoding: chunked` 分块传输与长连接状态机）；
3. **强制规范化四大 HTTP 请求头**：
   - `Host: www.cmu.edu:8080\r\n`（若客户端自带了 `Host` 头则保留客户端的，否则由代理解析 URL 补上）；
   - `User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:10.0.3) Gecko/20120305 Firefox/10.0.3\r\n`；
   - `Connection: close\r\n`（强制每次请求后关闭短连接，消除长连接挂起死锁）；
   - `Proxy-Connection: close\r\n`；
   - 其余客户端发来的自定义请求头原样透传，最后以空行 `\r\n` 结束。

### 2. 第二关：抗 `SIGPIPE` 崩溃与预线程化生产者-消费者并发池

在真实网络环境中，客户端（如浏览器用户突然刷新或关闭标签页）随时可能单方面提前断开 TCP 连接。
- **第一条铁律：`Signal(SIGPIPE, SIG_IGN)`**！默认情况下，向一个对端已关闭（收到 `RST`）的 Socket 调用 `write()`，Linux 内核会向你的代理进程发送 **`SIGPIPE` 信号**，而 `SIGPIPE` 的默认行为是**直接终止整个服务器进程**！因此在 `main()` 开头必须忽略 `SIGPIPE`，并让 `rio_writen` 遇到 `EPIPE` 错误时优雅返回关闭连接。
- **并发模型**：可采用 `pthread_create` + `pthread_detach(pthread_self())`（必须 `detach` 回收线程栈内存，防内存泄漏！且传给线程的 `connfd` 不能传栈变量地址 `&connfd` 否则会有主循环覆盖竞态，必须 `malloc` 或按值转型传递），或者更高效的 **`sbuf_t` 有界缓冲区 + 预线程化（Prethreading）工作线程池**。

### 3. 第三关：读者优先读写锁与 `1 MiB / 100 KiB` LRU Web 内存缓存

实验要求在内存中实现一个符合以下严苛约束的 Web 对象缓存：
- **总缓存容量上限**：`MAX_CACHE_SIZE = 1049000`（约 1 MiB，仅计入实际缓存对象的字节大小总和）；
- **单对象最大缓存尺寸**：`MAX_OBJECT_SIZE = 102400`（100 KiB）。在从远端服务器流式读取响应并转发给客户端的同时，用一个 `100 KiB` 的临时局部缓冲区累加响应字节；一旦总字节数超过 `100 KiB`，停止累加（只转发不入库）；若读取完毕未超过 `100 KiB`，则将其连同完整 URI 作为 Key 存入 LRU 缓存！
- **高并发读写锁（Readers-Writers Lock）同步**：
  - 使用 `pthread_rwlock_t`（或基于两个信号量 `mutex` + `w` 与计数器 `readcnt` 的读者优先锁）：
  - 多线程同时命中缓存读取静态页面时，持**读锁（Read Lock）**高度并发；需要更新 LRU 时间戳或驱逐旧对象插入新缓存块时，持**写锁（Write Lock）**互斥修改。

```c
// Proxy Lab 线程安全 LRU Web 缓存与 HTTP 转发核心架构示例
#include <pthread.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

#define MAX_CACHE_SIZE  1049000
#define MAX_OBJECT_SIZE 102400
#define CACHE_BLOCKS    10       // 10 个最大 100KiB 槽位

typedef struct {
    int      valid;
    char     uri[512];
    char     data[MAX_OBJECT_SIZE];
    size_t   size;
    uint64_t lru_clock;
} cache_block_t;

typedef struct {
    cache_block_t    blocks[CACHE_BLOCKS];
    uint64_t         clock;
    pthread_rwlock_t rwlock;
} web_cache_t;

void cache_init(web_cache_t *cache) {
    cache->clock = 0;
    pthread_rwlock_init(&cache->rwlock, NULL);
    for (int i = 0; i < CACHE_BLOCKS; ++i) {
        cache->blocks[i].valid = 0;
    }
}

// 查找缓存：命中则拷贝出数据并返回 1，未命中返回 0
int cache_find(web_cache_t *cache, const char *uri, char *out_buf, size_t *out_size) {
    pthread_rwlock_wrlock(&cache->rwlock); // 因需原子更新 lru_clock，此处加写锁（或用原子变量+读锁）
    for (int i = 0; i < CACHE_BLOCKS; ++i) {
        if (cache->blocks[i].valid && strcmp(cache->blocks[i].uri, uri) == 0) {
            memcpy(out_buf, cache->blocks[i].data, cache->blocks[i].size);
            *out_size = cache->blocks[i].size;
            cache->blocks[i].lru_clock = ++cache->clock;
            pthread_rwlock_unlock(&cache->rwlock);
            return 1;
        }
    }
    pthread_rwlock_unlock(&cache->rwlock);
    return 0;
}

// 插入缓存：若满则按 LRU 驱逐 lru_clock 最小的槽位
void cache_insert(web_cache_t *cache, const char *uri, const char *buf, size_t size) {
    if (size > MAX_OBJECT_SIZE) return;
    pthread_rwlock_wrlock(&cache->rwlock);

    int victim = 0;
    for (int i = 0; i < CACHE_BLOCKS; ++i) {
        if (!cache->blocks[i].valid) {
            victim = i;
            break;
        }
        if (cache->blocks[i].lru_clock < cache->blocks[victim].lru_clock) {
            victim = i;
        }
    }

    cache->blocks[victim].valid = 1;
    strncpy(cache->blocks[victim].uri, uri, sizeof(cache->blocks[victim].uri) - 1);
    cache->blocks[victim].uri[sizeof(cache->blocks[victim].uri) - 1] = '\0';
    memcpy(cache->blocks[victim].data, buf, size);
    cache->blocks[victim].size = size;
    cache->blocks[victim].lru_clock = ++cache->clock;

    pthread_rwlock_unlock(&cache->rwlock);
}
```
