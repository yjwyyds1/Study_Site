---
title: "计算机组成（二）：数字逻辑电路、存储器件与冯·诺依曼周期"
description: "从开关与布尔代数出发，搭出加法器、ALU 与 D 触发器，对比 SRAM/DRAM/NAND Flash 物理特性与 DDR 带宽延迟，打通冯·诺依曼取指-译码-执行周期与 C++20 安全内存透视。"
order: 68
category: "计算机组成"
tags: ["计算机组成", "数字逻辑", "触发器", "SRAM与DRAM", "Flash", "DDR内存", "冯诺依曼"]
related: ["handbook/mach-zero-start", "handbook/mach-isa-cpu", "handbook/machine-data-layout"]
sources: []
---

## 本篇导读：0 和 1 是怎么“自己做加法并记住结果”的？

在[上一篇](../mach-zero-start/)里，我们知道芯片里只有 `0` 和 `1` 两种电信号。可一堆开关凭什么能算出 `3 + 5 = 8`，又凭什么在寄存器和内存里记住昨天算过的数字，还能自己一条接一条执行程序？

本篇对应 `MACH-11` 到 `MACH-19`，带你掀开 CPU 与内存条的盖子，看清**数字电路 → 存储器物理器件 → 计算机运行周期**的完整硬件链条，并把硬件知识直接映射回 C++ 内存透视。

---

## 第一部分：数字逻辑与核心运算部件（MACH-11 ~ MACH-14）

### 1. 布尔代数与基本逻辑门：用开关搭出整个数字世界 (MACH-11)

把电灯开关串联或并联，就能得到一切数字逻辑的积木——**逻辑门（Logic Gates）**：

- **与门（AND）**：两个开关**串联**——只有 A 和 B **同时**合上（`1`），灯才亮（`1`）。
- **或门（OR）**：两个开关**并联**——A 或 B **任意一个**合上（`1`），灯就亮（`1`）。
- **非门（NOT / 反相器）**：常闭反相开关——输入 `1` 输出 `0`，输入 `0` 输出 `1`。
- **异或门（XOR）**：楼梯间的双控开关——**两个输入不同时输出 `1`，相同时输出 `0`**（在二进制加法和校验里神通广大！）。
- **与非门（NAND）**：AND 后面紧跟一个 NOT。

| `A` | `B` | `AND (A·B)` | `OR (A+B)` | `XOR (A⊕B)` | `NAND (¬(A·B))` |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `0` | `0` | `0` | `0` | `0` | **`1`** |
| `0` | `1` | `0` | `1` | **`1`** | **`1`** |
| `1` | `0` | `0` | `1` | **`1`** | **`1`** |
| `1` | `1` | **`1`** | `1` | `0` | `0` |

**为什么芯片厂最喜欢用与非门（NAND）？**
1. **完备性（Universal Gate）**：仅仅用 `NAND` 门一种积木，就能拼出 `NOT`、`AND`、`OR`、`XOR` 乃至整颗 CPU！（例如把 `NAND` 的两个输入绑一起就是 `NOT`）。
2. **德·摩根定律（De Morgan's Laws）与 CMOS 工艺**：$\overline{A \cdot B} = \overline{A} + \overline{B}$、$\overline{A + B} = \overline{A} \cdot \overline{B}$。在硅芯片（CMOS 晶体管）物理结构里，造一个 `NAND` 门只需要 **4 个晶体管**，比直接造 `AND` 门（需要 6 个晶体管）更小、更快、更省电。

---

### 2. 组合逻辑电路：半加器、全加器、ALU 与多路选择器 (MACH-12)

只用上述逻辑门连起来、**内部没有记忆元件、输出完全由当前输入唯一决定**的电路，叫**组合逻辑电路（Combinational Logic）**。

#### (1) 用逻辑门造出加法器（Adder）

先看两个 1 比特相加：`0+0=00`、`0+1=01`、`1+0=01`、`1+1=10`（进位 `1`，本位 `0`）。仔细对比刚才的真值表，你会惊喜地发现：
- 本位和 `Sum` 的真值表 **一模一样就是 `A ⊕ B`（XOR）**！
- 进位 `Carry` 的真值表 **一模一样就是 `A · B`（AND）**！

这就是**半加器（Half Adder）**。要把多位数串起来算，还必须接纳来自低位的进位 `Cin`，于是用两个半加器 + 一个 OR 门拼成**全加器（Full Adder）**：

```text
           A ────┬──────►┌─────┐
                 │       │ XOR ├───┬──────►┌─────┐
           B ────┼──┬───►└─────┘   │       │ XOR ├────► Sum (本位和)
                 │  │              │  ┌───►└─────┘
         Cin ────┼──┼──────────────┼──┤
                 │  │              ▼  │
                 │  │            ┌─────┐
                 │  │            │ AND ├───┐
                 │  │            └─────┘   │    ┌────┐
                 └──┼───►┌─────┐           ├───►│ OR ├────► Cout (向高位的进位)
                    └───►│ AND ├───────────┘    └────┘
                         └─────┘
```

把 64 个全加器像多米诺骨牌一样首尾相连（第 $i$ 位的 `Cout` 接第 $i+1$ 位的 `Cin`），就造出了 **64 位加法器**！（现代 CPU 为避免进位像慢蜗牛一样一级级传播，会改用并行的**超前进位加法器 CLA**）。

#### (2) 多路选择器（MUX）与算术逻辑单元（ALU）

- **多路选择器（Multiplexer, MUX）**：像铁路道岔，根据控制信号 `Sel`（比如 2 位选择码）从 4 路输入里挑出 1 路放行到输出。
- **ALU（算术逻辑单元）**：CPU 真正干活的“炒锅”。内部把**加法器、移位器、按位与/或/异或门**全部并行接在输入 `A` 和 `B` 上，最后放一个 `MUX`，根据译码器送来的 `ALUOp`（比如 `00=ADD, 01=SUB, 10=AND, 11=XOR`）挑出对应结果输出；算减法 `A - B` 时只需把 `B` 接过反相器并让最低位 `Cin = 1`（即 `A + (~B) + 1`），复用同一套加法器！同时 ALU 顺手吐出四个条件标志：**`ZF`（结果为零）、`CF`（无符号进借位）、`SF`（负号）、`OF`（有符号溢出）**。

---

### 3. 时序逻辑电路：SR 锁存器、D 触发器与时钟边沿触发 (MACH-13)

组合逻辑再厉害也有个致命缺点：**一断电或输入一撤，结果瞬间消失**——它记不住状态！怎么让电路“记住”一个比特？办法是把输出首尾交叉反馈接回输入，构成**双稳态记忆环路**。

1. **SR 锁存器（SR Latch）**：用两个交叉耦合的门电路相互“锁定”状态，`S=1` 置位为 `1`，`R=1` 复位为 `0`，都为 `0` 时死死锁住上次的值。缺点是只要输入在乱抖，输出也会随时乱变，多级电路串联时会像脱缰野马一样失控。
2. **D 触发器（D Flip-Flop）与时钟节拍（Clock）**：为了整台机器步调一致，芯片引入了全局节拍器——**时钟信号（CLK）**，像乐队指挥棒一样不断在 `0` 和 `1` 之间方波振荡。**D 触发器只在时钟从 `0` 跳变到 `1` 的那一瞬间（上升沿 `↑`）才对输入 `D` 拍照锁存，其余时间无论 `D` 怎么波动，`Q` 纹丝不动！**

```text
时钟 CLK:  ____┌────┐____┌────┐____┌────┐____
               ▲         ▲         ▲     (只在上升沿 ↑ 采样 D 并更新 Q!)
输入 D:    ── 0 ─── 1 ───── 1 ── 0 ───────
输出 Q:    ── ? ─── 0 ───── 1 ────── 0 ───  (两个上升沿之间 Q 保持绝对稳定)
```

- **为什么 CPU 主频卡在 5~6 GHz 上不去？**
  一个时钟周期（比如 `5 GHz` 时只有 **`0.2 ns`**）之内，电信号必须从上一级 D 触发器出发，穿过长长的组合逻辑（如 ALU 加法器），并在下一级 D 触发器上升沿到来之前的**建立时间（Setup Time）**内稳定下来。频率提得越高，周期越短，电流充放电来不及完成就会算错，且功耗（$P \propto C V^2 f$）与发热会瞬间失控！

---

### 4. 寄存器堆（Register File）与程序计数器（PC） (MACH-14)

把 64 个 D 触发器并排绑定共享同一个时钟信号，就成了 1 个 **64 位寄存器**。CPU 内部有一排紧挨着 ALU 的超快寄存区，叫做**寄存器堆（Register File）**：

- **多端口设计**：典型 RISC CPU 执行 `add r3, r1, r2` 时，寄存器堆必须在**同一个时钟周期**内同时提供 **2 个读端口**（把 `r1` 和 `r2` 喂给 ALU），并在周期末尾通过 **1 个写端口**把算好的和写回 `r3`！
- **程序计数器（Program Counter, `PC`，x86-64 上叫 `RIP`）**：它是一个专职保存“**下一条要执行的指令在内存哪个地址**”的特殊寄存器。正常情况下每取完一条长度为 $L$ 字节的指令，硬件就把 `PC ← PC + L`；遇到 `if/for/call` 跳转指令时，直接把目标地址覆写进 `PC`，程序流就拐弯了！

---

## 第二部分：存储器件与内存性能真相（MACH-15 ~ MACH-17）

### 5. SRAM 与 DRAM：为什么 Cache 用 SRAM 而主存用 DRAM (MACH-15)

同样是断电就丢数据的“易失性内存”，为什么几 MB 的 L3 Cache 要造得跟几 GB 的内存条一样金贵？答案全在单个比特的物理电路里：

```text
SRAM 单元 (6T = 6 个晶体管)             DRAM 单元 (1T1C = 1 个晶体管 + 1 个微型电容)
    VDD                                      字线 Wordline ──┐
     ├───┐   ┌───┤                                           ▼
     │  [交叉锁存] │  ◄── 只要不断电       位线 Bitline ────┤ 晶体管开关 ├─── ╤ 电容 (存电荷=1, 空=0)
     └───┘   └───┘        状态永久稳定                                       ═  (电荷会不断漏掉!)
  ▲ 面积大、功耗高、极快 (~0.5ns)         ▲ 极小极密、便宜、较慢 (~15~60ns)，需每 64ms 刷新充电
```

| 对比维度 | **SRAM（静态随机存储器）** | **DRAM（动态随机存储器）** |
| --- | --- | --- |
| 单元结构 | **6 个晶体管（6T）**构成触发器环路 | **1 个晶体管 + 1 个电容（1T1C）** |
| 是否需要刷新 | 不需要，通电即稳稳保持 | **必须每 ~64 ms 周期性刷新充电**，且“读”操作会放空电容（破坏性读），读完需回写 |
| 读写速度 | 极快（与 CPU 逻辑同工艺，~1 ns） | 较慢（电容充放电与行选通，~50–100 ns） |
| 容量与成本 | 面积大、造价高（MB 级） | 密度极高、造价极低（GB 级） |
| 典型角色 | **CPU L1 / L2 / L3 缓存、寄存器附近** | **主板上的系统主内存（DDR4 / DDR5 内存条）** |

---

### 6. 非易失存储：ROM、EEPROM、NAND Flash 与 SSD 磨损均衡 (MACH-16)

拔掉电源插头后数据还在，靠的是**非易失性存储器（Non-Volatile Memory）**：

1. **ROM / PROM / EEPROM**：最早的只读存储器（出厂写死 BIOS）演进到电可擦除的 EEPROM（可按字节改写，但极慢、容量小，用于保存主板配置或固件参数）。
2. **NOR Flash vs NAND Flash**：
   - **NOR Flash**：支持随机字节读（CPU 可直接在上面原地执行代码 XIP），常用于单片机/主板 BIOS 芯片。
   - **NAND Flash（现代固态硬盘 SSD、U 盘、手机闪存核心）**：把电子关进一个绝缘的**浮栅（Floating Gate）或电荷陷阱（Charge Trap）**里，断电也能牢牢困住十几年！按每个单元塞进几个比特分为 `SLC (1 bit)`、`MLC (2 bits)`、`TLC (3 bits)`、`QLC (4 bits)`——塞得越多容量越便宜，但电压区分越精细、寿命越短、写入越慢。

**SSD 程序员必知的三大怪脾气**：
- **先擦后写、读写擦粒度不对称**：NAND Flash 可以按 **页（Page，如 4–16 KiB）** 读和写，但**必须按整个大块（Block，如几 MB）擦除**才能覆盖写！不能像内存一样直接原地改写某 1 个字节。
- **寿命限制与磨损均衡（Wear Leveling）**：每次高压擦除都会损伤绝缘氧化层（TLC 通常只有几百到上千次擦写寿命 P/E Cycles）。SSD 内部有一颗专职微控制器运行 **FTL（闪存转换层）**：当你重复覆盖写同一个文件偏移时，FTL 会偷偷把新数据写到另一块全新的空闲物理页上并更新映射表，确保所有闪存块磨损均匀。
- **写放大（Write Amplification）与 TRIM**：做垃圾回收搬迁有效页时，实际写入闪存的字节数往往大于主机请求写入的字节数。所以数据库尽量做顺序追加（Append-only / WAL），且不要把 SSD 塞满到 95% 以上。

---

### 7. 内存性能真相：带宽 vs 延迟、DDR 通道与 CAS 延迟 (MACH-17)

买内存条经常看到 `DDR5-6000 CL30 双通道` 这样的参数，究竟哪个决定“快”？先分清两个最容易混淆的概念：

- **带宽（Bandwidth，单位 GB/s）**：高速公路**有几条车道、车流有多密**——决定一次流式拷贝 10 GB 视频或矩阵乘要多久。
- **延迟（Latency，单位 ns）**：**孤零零一辆车从起点开到终点要多久**——决定链表跳跃指针（Pointer Chasing）卡不卡。

```text
DDR (Double Data Rate, 双倍数据速率):
时钟信号:  ___|‾‾‾|___|‾‾‾|___|‾‾‾|___
采样时刻:     ▲   ▼   ▲   ▼   ▲   ▼    ──► 上升沿和下降沿“各传一次数据”！
```

1. **双通道 / 多通道（Dual/Quad Channel）**：CPU 内存控制器同时连 2 根独立通路（各 64 bit 宽），把高速公路从 1 条拓宽到 2 条——**带宽直接翻倍，但单次访问延迟并不会减半**。
2. **DRAM 内部是二维矩阵（Bank → Row → Column）**：
   读取一个地址分三步：先发 `ACT`（行选通）把整行（如 8 KiB）拉进**行缓冲器（Row Buffer）**；再发 `CAS`（列选通）挑出你要的那几个字节。
   - 广告里的 **`DDR4-3200 CL16`** 是什么意思？
     “3200”指每秒传输 $3200\text{ MT/s}$（实际总线时钟是 $1600\text{ MHz}$，因为双沿传输翻倍，每半个周期仅 `0.625 ns`）。`CL16`（CAS Latency = 16）是指选定列地址后要等 **16 个内存时钟周期**数据才吐出来：
     $$\text{真实列延迟} = \frac{16}{1600 \times 10^6\text{ Hz}} = 10\text{ ns}$$
     再加上前面的地址转换、行切换与总线往返，CPU 真切感受到的整条随机内存访问延迟大约在 **60 ~ 100 ns** 左右。

---

## 第三部分：整机运行周期与 C++ 内存透视（MACH-18 ~ MACH-19）

### 8. 冯·诺依曼架构、哈佛架构与取指-译码-执行周期 (MACH-18)

为什么计算机不用每次换个任务就重新拔插电线焊电路？**冯·诺依曼（Von Neumann）架构**提出了一个天才思想——**存储程序（Stored-Program）**：**指令本身也是二进制数字，和普通数据一起存放在同一个内存里！**

- **冯·诺依曼架构**：代码与数据共用同一条内存总线。优点是灵活简单；缺点是同一时刻要么取指令要么取数据，形成著名的**冯·诺依曼瓶颈**（同时因为数据和代码混在一起，如果程序存在缓冲区溢出漏洞，黑客可以把数据当指令诱导 CPU 去执行）。
- **哈佛架构（Harvard Architecture）**：把**指令存储器**和**数据存储器**彻底分开、各自有独立总线（常见于单片机 DSP）。
- **现代 CPU 的绝妙折中——改进型哈佛架构（Modified Harvard）**：内存条（RAM）和 L2/L3 仍是冯·诺依曼统一存放，但 **L1 缓存一分为二成 `L1i`（指令缓存）和 `L1d`（数据缓存）**，让 CPU 核心同一周期既能取指令又能读写数据！

```text
冯·诺依曼指令周期 (Fetch → Decode → Execute → Memory → Writeback):

 ┌───────────────┐   1. 取指 (IF)   ┌──────────────┐
 │   PC (RIP)    ├─────────────────►│  内存 / L1i  │
 └───────▲───────┘                  └──────┬───────┘
         │ PC += len                       │ 二进制指令字
         │                                 ▼
 ┌───────┴───────┐   5. 写回 (WB)   ┌──────────────┐   2. 译码 (ID)   ┌──────────────┐
 │ 通用寄存器堆  │◄─────────────────┤ 执行/访存 EX │◄─────────────────┤  控制单元 CU │
 └───────────────┘                  └──────────────┘                  └──────────────┘
```

1. **取指（Fetch）**：把 `PC` 指向的指令字节从内存（实际多半命中 L1i）读入指令寄存器，同时 `PC` 自动加上本条指令长度。
2. **译码（Decode）**：控制单元解析操作码（这是加法？访存？还是跳转？）和源/目的寄存器编号。
3. **执行（Execute）**：把寄存器里的数据送进 ALU 算出结果（或算出有效内存地址）。
4. **访存（Memory）**：仅当指令是 `load`/`store` 时，才去 L1d/主存读写数据。
5. **写回（Writeback）**：把计算或读出的结果写回目标寄存器，随后进入下一条指令周期！

---

### 9. 硬件存储映射到 C++：内存层级直觉与 `std::bit_cast` / `std::as_bytes` (MACH-19)

理解了硬件之后，你在 C++ 里写的每一行变量声明都有了清晰的物理归宿：

| C++ 对象 / 存储区 | 硬件归宿与生命周期 |
| --- | --- |
| 局部标量变量（优化后） | 优先驻留 **CPU 寄存器堆**（零内存访问），寄存器不够时溢出到 **栈（Stack，高命中 L1d）** |
| 全局常量 / 字符串字面量 | 位于只读数据段 `.rodata`（在物理内存 DRAM 中且被页表标为只读，热点常驻 L1d/L2） |
| `std::vector` / `new` 分配对象 | 控制头在栈/寄存器，底层缓冲区在 **堆（Heap，DRAM 中按页按需映射）** |
| 程序代码与虚函数表 | 机器码在 `.text` 段，CPU 通过 **L1i** 取指；虚表在 `.rodata` |

想安全地用 C++20 代码观察底层存储里的**真实字节**（而不踩 `reinterpret_cast` 的未定义行为红线），标准库给了两把外科手术刀：
- **`std::as_bytes(std::span{&obj, 1})`**（`<memory>` / `<span>`）：把任何可平凡复制（`TriviallyCopyable`）对象的内存拍成只读 `std::span<const std::byte>` 切片，逐字节打印出来。
- **`std::bit_cast<To>(from)`**（`<bit>`）：编译期强校验源与目标类型等宽且都可平凡复制，零成本按位把 `float`/`double`/`struct` 透视成整数位模式（编译器直接映射成寄存器间透传，零内存拷贝开销）。

下面这段独立 C++20 程序用位运算模拟了 **1 位全加器与 8 位补码加法器（含 `ZF/SF/CF/OF` 标志位）**，并用 `std::bit_cast` 和 `std::as_bytes` 透视内存字节：

```cpp
#include <array>
#include <bit>
#include <bitset>
#include <cstddef>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <span>

// MACH-12: 用逻辑门构建 1 位全加器 (Sum = a^b^cin, Cout = (a&b)|(cin&(a^b)))
struct FullAdderOut {
    bool sum;
    bool cout;
};

constexpr FullAdderOut full_adder(bool a, bool b, bool cin) {
    const bool axb = a ^ b;
    return FullAdderOut{
        .sum = static_cast<bool>(axb ^ cin),
        .cout = static_cast<bool>((a & b) | (cin & axb))
    };
}

// MACH-12 / MACH-18: 8 位 Ripple-Carry ALU 加法器，同时生成 ZF/SF/CF/OF 标志
struct Alu8Result {
    std::uint8_t value;
    bool zf; // Zero Flag: 结果为 0
    bool sf; // Sign Flag: 最高位 (bit 7) 为 1
    bool cf; // Carry Flag: 无符号最高位进位
    bool of; // Overflow Flag: 有符号溢出 (最高位进位 != 次高位进位)
};

constexpr Alu8Result alu8_add(std::uint8_t a, std::uint8_t b) {
    std::uint8_t res = 0;
    bool carry = false;
    bool carry_into_msb = false;
    for (unsigned i = 0; i < 8; ++i) {
        if (i == 7) {
            carry_into_msb = carry;
        }
        auto bit_out = full_adder(((a >> i) & 1u) != 0, ((b >> i) & 1u) != 0, carry);
        if (bit_out.sum) {
            res = static_cast<std::uint8_t>(res | (1u << i));
        }
        carry = bit_out.cout;
    }
    return Alu8Result{
        .value = res,
        .zf = (res == 0),
        .sf = ((res >> 7) & 1u) != 0,
        .cf = carry,
        .of = (carry != carry_into_msb)
    };
}

void dump_bytes(std::span<const std::byte> bytes) {
    for (std::byte b : bytes) {
        std::cout << std::hex << std::uppercase << std::setw(2) << std::setfill('0')
                  << std::to_integer<unsigned>(b) << ' ';
    }
    std::cout << std::dec << std::setfill(' ');
}

int main() {
    // 验证 120 + 20 = 140：无符号不溢出 (CF=0)，但 8 位有符号溢出 (+120+20=-116, OF=1, SF=1)
    constexpr auto r1 = alu8_add(120, 20);
    std::cout << "[MACH-12] 120 + 20 => unsigned=" << static_cast<unsigned>(r1.value)
              << " signed=" << static_cast<int>(std::bit_cast<std::int8_t>(r1.value))
              << " ZF=" << r1.zf << " SF=" << r1.sf << " CF=" << r1.cf << " OF=" << r1.of << '\n';

    // 验证 250 + 10 = 4 (模 256 回绕)：无符号溢出 (CF=1)，有符号 -6 + 10 = +4 不溢出 (OF=0)
    constexpr auto r2 = alu8_add(250, 10);
    std::cout << "[MACH-12] 250 + 10 => unsigned=" << static_cast<unsigned>(r2.value)
              << " signed=" << static_cast<int>(std::bit_cast<std::int8_t>(r2.value))
              << " ZF=" << r2.zf << " SF=" << r2.sf << " CF=" << r2.cf << " OF=" << r2.of << '\n';

    // MACH-19: 用 std::bit_cast 与 std::as_bytes 安全透视内存字节
    const float f = -3.25f;
    const auto f_bits = std::bit_cast<std::uint32_t>(f);
    std::cout << "[MACH-19] -3.25f bits = 0x" << std::hex << std::uppercase << f_bits
              << " (" << std::bitset<32>(f_bits) << ")\n";
    std::cout << "[MACH-19] -3.25f raw bytes in RAM: ";
    dump_bytes(std::as_bytes(std::span{&f, 1}));
    std::cout << std::dec << '\n';
    return 0;
}
```

编译运行：
```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic logic_alu_demo.cpp -o logic_alu_demo.exe
.\logic_alu_demo.exe
```

---

## 四、4 个常见硬件误区与踩坑

1. **以为内存带宽翻倍就能让链表变快**：加装双通道内存提升了带宽，但链表节点东一个西一个，瓶颈是单次指针追逐的 **CAS/行选通延迟（~70 ns）**，几乎吃不到多通道带宽红利。
2. **以为 SSD 跟内存一样可以随便原地改写 1 字节**：每次写触发的是一整个 Flash Page，旧数据所在的 Block 必须等积累足够无效页后由 FTL 整块擦除，随机小文件碎写会引发严重的写放大并缩短 SSD 寿命。
3. **混用 `CF` 和 `OF` 标志**：`120 + 20` 在 8 位里对无符号来说完全合法（`CF=0`），对有符号来说却溢出了（`OF=1`）；而 `250 + 10` 对无符号产生了进位（`CF=1`），对有符号 `-6 + 10 = 4` 却完全正确（`OF=0`）！硬件 ALU 不知道你把字节当有符号还是无符号，所以它同时给出 `CF` 和 `OF`，由编译器生成不同的条件跳转指令来二选一。
4. **把 `std::span<const std::byte>` 错用成 `reinterpret_cast<uint32_t*>`**：只读查看字节只能通过 `std::as_bytes` 或 `std::memcpy`，反向拼装对象请用 `std::bit_cast` 或 `std::memcpy`。

---

## 五、4 个梯度微练习

### 练习 1（全加器与门电路推导）

在全加器中，已知输入 `A = 1`, `B = 1`, `Cin = 1`，请按公式手算输出 `Sum` 和 `Cout`，并验证它为什么等于二进制 `11`（十进制 `3`）。

<details>
<summary>核对答案</summary>

- `A ^ B = 1 ^ 1 = 0`，所以 `Sum = (A ^ B) ^ Cin = 0 ^ 1 = 1`；
- `A & B = 1 & 1 = 1`，`Cin & (A ^ B) = 1 & 0 = 0`，所以 `Cout = 1 | 0 = 1`；
- 进位 `1`、本位 `1`，组合起来就是二进制 `11₂ = 3`！

</details>

### 练习 2（SRAM vs DRAM 物理直觉）

如果把笔记本电脑合上盖子进入“睡眠（Suspend-to-RAM）”模式，内存条还在耗微弱的电量，但拔掉电池后内存数据立刻全丢；而把程序放进休眠文件（Hibernate to SSD）则彻底断电也不丢。结合 **1T1C DRAM** 和 **NAND Flash** 物理结构解释为什么。

<details>
<summary>核对答案</summary>

- **睡眠（Suspend-to-RAM）**：数据留在 **1T1C DRAM 内存条**里。因为微型电容会不断漏电，内存控制器必须持续通电执行每隔几十毫秒一次的刷新充电（Refresh）；一旦彻底断电，电容电荷瞬间漏光，数据归零。
- **休眠（Hibernate）**：内存镜像被写进 **NAND Flash（SSD）**。电子被囚禁在四周都是绝缘氧化层的电荷陷阱/浮栅中，断电后数年仍不逃逸，因此可以完全切断电源。

</details>

### 练习 3（手算 DDR 内存延迟）

某品牌内存标称 **`DDR5-4800 CL40`**（注意：DDR 双沿传输，实际总线时钟频率是标称 MT/s 的一半，即 $2400\text{ MHz}$）。请问它完成一次列选通（CAS Latency）本身需要多少纳秒？如果内存频率不变但把时序压低到 `CL30`，列选通延迟减少了多少？

<details>
<summary>核对答案</summary>

- 总线时钟频率 $f = 2400\text{ MHz} = 2.4 \times 10^9\text{ Hz}$，单时钟周期 $T = \frac{1}{2.4\text{ GHz}} \approx 0.4167\text{ ns}$。
- `CL40` 延迟 $= 40 \times 0.4167\text{ ns} \approx \mathbf{16.67\text{ ns}}$。
- `CL30` 延迟 $= 30 \times 0.4167\text{ ns} = \mathbf{12.50\text{ ns}}$，减少了 **`4.17 ns`**（约 25% 的列选通等待时间）。

</details>

### 练习 4（动手扩展 ALU 减法器）

利用上面示例里的 `alu8_add` 与补码规则（$A - B = A + (\sim B + 1)$），写出一个函数 `alu8_sub(uint8_t a, uint8_t b)`。注意思考：如何仅用 `full_adder` 一次循环（初始化最低位 `carry = true`，把 `b` 的每一位取反后送入加法器）就完美复用同一套加法硬件完成 `a - b`？

<details>
<summary>参考代码</summary>

```cpp
constexpr Alu8Result alu8_sub(std::uint8_t a, std::uint8_t b) {
    std::uint8_t res = 0;
    bool carry = true; // 补码取反加一的 "+1" 直接从最低位 Cin=1 送入！
    bool carry_into_msb = false;
    for (unsigned i = 0; i < 8; ++i) {
        if (i == 7) {
            carry_into_msb = carry;
        }
        const bool a_bit = ((a >> i) & 1u) != 0;
        const bool b_inv = ((b >> i) & 1u) == 0; // 对 b 按位取反
        auto bit_out = full_adder(a_bit, b_inv, carry);
        if (bit_out.sum) {
            res = static_cast<std::uint8_t>(res | (1u << i));
        }
        carry = bit_out.cout;
    }
    return Alu8Result{
        .value = res,
        .zf = (res == 0),
        .sf = ((res >> 7) & 1u) != 0,
        .cf = !carry, // 在 x86 减法借位语义中，CF=1 表示发生借位（即无进位输出）
        .of = (carry != carry_into_msb)
    };
}
```

</details>
