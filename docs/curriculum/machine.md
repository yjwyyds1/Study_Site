# 计算机组成 (MACH)

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

从电灯开关、进制补码、逻辑门电路与内存器件起步，贯穿 x86-64/ARM64 指令集、调用栈帧 ABI、内存对齐布局、五级流水线、分支预测、64B 多级缓存与 MESI、虚拟地址 MMU 到总线 DMA，共 **50 节（MACH-01 ~ MACH-50）**。

## 第一篇 二进制表示与机器层数值基石（MACH-01 ~ MACH-10）

### 数据编码、浮点误差与整机直觉

<a id="mach-01"></a>

#### MACH-01 模拟信号 vs 数字信号：比特、字节与字长

- 先修：[CPP-02](cpp.md#cpp-02)
- 状态：已有[计算机组成（一）：零基础入门与底层数据编码](../../src/content/handbook/mach-zero-start.md)（含[破冰示例](../../public/examples/mach-zero.cpp)）。
- 小节
  1. 噪声容限解释为何计算机只用 0/1 两态开关
  2. bit、Nibble、Byte 与 64 位字长关系
  3. 硬盘 `KB(10^3)` vs 内存 `KiB(2^10)` 与网卡 `Mbps` 容量差异

<a id="mach-02"></a>

#### MACH-02 无符号二进制、八进制与十六进制手算转换

- 先修：[MACH-01](#mach-01)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 二进制权重累加与十进制贪心拆分法
  2. 每 4 位二进制切 1 位十六进制 `0x` 快速心算
  3. 每 3 位对应八进制 `0755` 与前导 `0` 踩坑

<a id="mach-03"></a>

#### MACH-03 有符号整数：原码、反码与补码“倒拨钟表”模型

- 先修：[MACH-02](#mach-02)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 原码双零问题与补码加减法统一电路优势
  2. 倒拨钟表理解 `11111111 == -1` 与 `-1 + 1 = 0`
  3. 不对称范围：`INT32_MIN` 绝对值比 `INT32_MAX` 多 1

<a id="mach-04"></a>

#### MACH-04 整数溢出：有符号 UB 与无符号模回绕

- 先修：[MACH-03](#mach-03)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 无符号按 $2^w$ 模回绕 vs 有符号 UB 优化删代码风险
  2. 加法前用减法 `max - delta` 守住防线
  3. 有符号/无符号混比较坑与 C++20 `std::cmp_less`

<a id="mach-05"></a>

#### MACH-05 位运算、移位与位掩码实战

- 先修：[MACH-02](#mach-02)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 按位与/或/非/异或提取与修改状态字段
  2. 只对无符号类型做移位且严禁移位宽度 $\ge 32$
  3. 非法输入值显式拒绝而非静默截断

<a id="mach-06"></a>

#### MACH-06 定宽整数与整数提升陷阱

- 先修：[MACH-04](#mach-04)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. `<cstdint>` 定宽类型 `int32_t` / `uint64_t` / `size_t`
  2. 窄类型参与运算前自动提升为 `int` 的隐式规则
  3. 用 `std::in_range<T>` 做跨类型范围守护

<a id="mach-07"></a>

#### MACH-07 字节序：小端序、大端序与网络字节转换

- 先修：[MACH-02](#mach-02)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 内存字节高低地址排列：小端 x86-64 vs 大端网络协议
  2. 逐字节移位编写与宿主端序无关的帧头解码器
  3. `std::endian::native` 与 C++23 `std::byteswap`

<a id="mach-08"></a>

#### MACH-08 字符编码：ASCII、Unicode 码点与 UTF-8 变长编码

- 先修：[MACH-01](#mach-01)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 7 位 ASCII 字符集控制符与可打印区
  2. 全球码点表 Unicode 与 UTF-8 1~4 字节变长编码规则
  3. 为何 `std::string::size()` 算的是字节数而不是汉字个数

<a id="mach-09"></a>

#### MACH-09 IEEE-754 浮点数：符号、阶码、尾数与精度陷阱

- 先修：[MACH-03](#mach-03)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 64 位 `double` 1+11+52 结构与隐含前导 `1.f`
  2. 为什么 `0.1 + 0.2 != 0.3` 与大数吃小数 `(1e16+1)-1e16==0`
  3. 精确计数与金额永不采用浮点、`NaN != NaN` 与 `isfinite`

<a id="mach-10"></a>

#### MACH-10 硬件全景：CPU、寄存器、缓存、内存与硬盘炒菜模型

- 先修：[MACH-01](#mach-01)
- 状态：已有[计算机组成（一）正文](../../src/content/handbook/mach-zero-start.md)。
- 小节
  1. 锅铲（寄存器）→ 调料架（Cache）→ 冰箱（RAM）→ 楼下仓库（SSD）
  2. 断电易失性与数量级延迟鸿沟直觉
  3. 连续布局为什么让硬件“整盘端菜”变快

## 第二篇 数字逻辑电路与硬件存储器件（MACH-11 ~ MACH-19）

### 从门电路、ALU 到 SRAM/DRAM 与取指执行

<a id="mach-11"></a>

#### MACH-11 布尔代数与基本逻辑门（AND/OR/NOT/XOR/NAND）

- 先修：[MACH-01](#mach-01)
- 状态：已有[计算机组成（二）：数字逻辑、电路、存储器件与取指周期](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 真值表与基本逻辑门符号
  2. 与非门 NAND 的功能完备性
  3. 德摩根定律化简布尔表达式

<a id="mach-12"></a>

#### MACH-12 组合逻辑电路：半加器、全加器、ALU 与 MUX

- 先修：[MACH-11](#mach-11)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. XOR + AND 搭出 1 位半加器与带进位全加器
  2. 串行波纹进位 vs 超前进位加法器
  3. 多路选择器 MUX 与算术逻辑单元 ALU 构造

<a id="mach-13"></a>

#### MACH-13 时序逻辑电路：SR 锁存器、D 触发器与时钟边沿

- 先修：[MACH-12](#mach-12)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 组合无记忆 vs 时序有状态反馈电路
  2. 锁存器存 1 比特信息与时钟信号 CLK 节拍对齐
  3. 边沿触发 D 触发器解决竞态冒险

<a id="mach-14"></a>

#### MACH-14 寄存器堆（Register File）与程序计数器 PC

- 先修：[MACH-13](#mach-13)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. D 触发器阵列组合成 64 位高速寄存器堆
  2. 多端口同时读写与地址译码器
  3. 程序计数器 PC 驱动指令步进与跳转

<a id="mach-15"></a>

#### MACH-15 SRAM vs DRAM：为什么 Cache 用 SRAM 而内存用 DRAM

- 先修：[MACH-13](#mach-13)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 6 晶体管双稳态 SRAM（贵、大、零刷新、极快）
  2. 1 晶体管 + 1 电容 DRAM（便宜、密、需每隔几毫秒刷电）
  3. 性能成本分级决定芯片内 Cache 与主板内存分工

<a id="mach-16"></a>

#### MACH-16 非易失存储：ROM、NAND Flash 与 SSD 磨损均衡

- 先修：[MACH-15](#mach-15)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 浮栅晶体管锁住电子实现断电不丢
  2. 页写块擦限制、写放大与 FTL 垃圾回收
  3. 磨损均衡（Wear Leveling）延长 SSD 寿命

<a id="mach-17"></a>

#### MACH-17 内存性能真相：带宽 vs 延迟、DDR 通道与 CAS

- 先修：[MACH-15](#mach-15)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 双倍数据速率 DDR 上下沿同时采样
  2. 多通道内存与行缓冲区命中 vs Row Miss
  3. 为什么内存频率翻倍实际单次随机访问延迟变化不大

<a id="mach-18"></a>

#### MACH-18 冯·诺依曼 vs 哈佛架构及取指-译码-执行周期

- 先修：[MACH-14](#mach-14)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 指令与数据共住主存的存储程序思想
  2. 经典指令执行周期：Fetch → Decode → Execute → Writeback
  3. 现代芯片“外部冯·诺依曼 + L1 I-Cache/D-Cache 哈佛隔离”

<a id="mach-19"></a>

#### MACH-19 C++ 内存层级验证与 `std::bit_cast` / `std::as_bytes`

- 先修：[MACH-07](#mach-07)、[MACH-18](#mach-18)
- 状态：已有[计算机组成（二）正文](../../src/content/handbook/mach-logic-memory.md)。
- 小节
  1. 从硬件字节数组安全透视任意对象底层二进制
  2. C++20 `std::bit_cast` 取代指针强转查看 IEEE-754 浮点位模式
  3. 实测不同对齐与步长下的内存带宽直觉

## 第三篇 指令集架构、汇编与二进制接口（MACH-20 ~ MACH-30）

### 读懂汇编、栈帧与 ABI 契约

<a id="mach-20"></a>

#### MACH-20 机器码与汇编助记符一一对应关系

- 先修：[MACH-18](#mach-18)
- 状态：已有[计算机组成（三）：指令集、汇编阅读、调用栈帧与 ABI 契约](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. 二进制操作码 Opcode vs 人类可读汇编助记符
  2. 汇编器正向翻译 `.s → .o` 与反汇编器 `objdump -d` 逆向还原
  3. 识别函数入口与指令边界

<a id="mach-21"></a>

#### MACH-21 x86-64 vs ARM64 / RISC-V：CISC 与 RISC 架构对比

- 先修：[MACH-20](#mach-20)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. 变长 CISC 指令 vs 32 位定长 RISC Load/Store 约束
  2. 寄存器数量（16 vs 31/32）对函数溢栈频次影响
  3. 现代 x86 前端将 CISC 拆成内部微指令执行机制

<a id="mach-22"></a>

#### MACH-22 x86-64 通用寄存器分工与 RFLAGS 标志位

- 先修：[MACH-21](#mach-21)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. `rax`/`rdi`/`rsi`/`rsp`/`rbp`/`rip` 核心角色及写入 `eax` 自动清高 32 位
  2. `RFLAGS` 四大条件标志 `ZF`/`SF`/`CF`/`OF`
  3. `xor eax, eax` 惯用清零技巧原理

<a id="mach-23"></a>

#### MACH-23 内存寻址模式：`[base + index * scale + disp]`

- 先修：[MACH-22](#mach-22)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. 基址-变址-比例因子（1/2/4/8）-偏移量统一公式
  2. `a[i + 1]` 如何一步编译进单条 `mov` 指令
  3. 比例因子为什么只支持 1/2/4/8

<a id="mach-24"></a>

#### MACH-24 数据搬运与 LEA（加载有效地址）算术妙用

- 先修：[MACH-23](#mach-23)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. `mov` 访问内存限制（不可双内存直接传）
  2. `lea` 借用地址计算单元不访存完成 `3x` / `5x + c` 快速计算
  3. `rip` 相对寻址定位全局常量与代码位置无关 PIC

<a id="mach-25"></a>

#### MACH-25 条件跳转、循环与 switch 跳转表实现

- 先修：[MACH-22](#mach-22)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. `cmp`/`test` 与有符号 `jg/jl` vs 无符号 `ja/jb` 区别
  2. `while`/`for` 循环在汇编中的底部判断结构优化
  3. 密集 `switch` 生成 `.rodata` O(1) 跳转表条件

<a id="mach-26"></a>

#### MACH-26 函数调用栈帧：call / ret 与 Stack Overflow

- 先修：[MACH-22](#mach-22)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. `call` 压入返回地址与 `ret` 弹回 `rip` 全流程
  2. 栈顶 `rsp` 向下（低地址）生长模型与 16 字节对齐
  3. 无限深递归打爆栈边界触发段错误过程

<a id="mach-27"></a>

#### MACH-27 跨文件调用约定：System V AMD64 vs Windows x64 ABI

- 先修：[MACH-26](#mach-26)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. Linux 前 6 参寄存器 vs Windows 前 4 参+Shadow Space 差异
  2. Caller-saved（易失）vs Callee-saved（`rbx/rbp/r12-r15` 非易失）
  3. 为什么两个各自独立编译的 `.o` 能严丝合缝传 7 个参数

<a id="mach-28"></a>

#### MACH-28 C++ 名字修饰、extern "C" 与 syscall 系统调用指令

- 先修：[MACH-27](#mach-27)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. 支持函数重载背后的 Name Mangling 与 `c++filt` 还原
  2. `extern "C"` 导出跨语言/动态插件稳定符号
  3. `syscall` 指令陷入 Ring 0 内核态与参数寄存器表

<a id="mach-29"></a>

#### MACH-29 编译器 -O0 vs -O2 优化对比实战

- 先修：[MACH-26](#mach-26)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. `-O0` 局部变量全落栈槽 vs `-O2` 寄存器驻留与函数内联
  2. 常量折叠、死代码消除与尾递归循环改写
  3. 为何不可依靠调试构建 `-O0` 的速度结论推算线上性能

<a id="mach-30"></a>

#### MACH-30 用 g++ -S、objdump 与 Compiler Explorer 透视汇编

- 先修：[MACH-29](#mach-29)
- 状态：已有[计算机组成（三）正文](../../src/content/handbook/mach-isa-cpu.md)。
- 小节
  1. 生成干净 Intel 风格汇编文件命令
  2. `objdump -d -C -M intel` 对照源码排查线上指令
  3. 利用 `godbolt.org` 并排比较 GCC/Clang/MSVC 产物差异

## 第四篇 C++ 对象内存布局与多态代价（MACH-31 ~ MACH-39）

### 对齐填充、严格别名与容器/虚表物理形态

<a id="mach-31"></a>

#### MACH-31 基本类型尺寸、自然对齐与 alignof 规则

- 先修：[MACH-06](#mach-06)
- 状态：已有[计算机组成（四）：内存布局、结构体对齐、AoS/SoA、STL 与虚表开销](../../src/content/handbook/machine-data-layout.md)（含[布局代码](../../public/examples/machine-layout.cpp)）。
- 小节
  1. CPU 按字长对齐读取与自然对齐要求
  2. 64 位下 `sizeof`/`alignof` 常见类型表
  3. 非对齐访存硬件后果（`SIGBUS` 与跨行裂开）

<a id="mach-32"></a>

#### MACH-32 结构体填充、尾部补齐与字段重排优化

- 先修：[MACH-31](#mach-31)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. 成员偏移整数倍法则与尾部最大对齐整数倍法则
  2. 按大到小重排字段把 12 字节结构体缩到 8 字节
  3. `offsetof` 与 `static_assert(std::is_standard_layout_v<T>)`

<a id="mach-33"></a>

#### MACH-33 AoS（结构体数组）vs SoA（数组结构体）缓存利用率

- 先修：[MACH-32](#mach-32)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. 为什么遍历 AoS 单字段会浪费 95%+ 缓存行带宽
  2. SoA 紧凑排列与 Hot/Cold 冷热字段拆分
  3. 对数据导向设计（DOD）的性能贡献

<a id="mach-34"></a>

#### MACH-34 位域（Bitfield）与 #pragma pack 陷阱

- 先修：[MACH-32](#mach-32)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. 位域位序与跨字节边界依赖编译器实现不可移植
  2. `#pragma pack(1)` 引起硬件未对齐访问性能惩罚
  3. 用定宽整数 + 移位掩码显式序列化线格式协议

<a id="mach-35"></a>

#### MACH-35 指针算术、std::uintptr_t 与跨步地址计算

- 先修：[MACH-23](#mach-23)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. `p + 1` 移动 `sizeof(*p)` 字节的指针步长法则
  2. 用 `std::uintptr_t` 安全承接地址整型的原因
  3. 仅允许在同一连续数组对象及其尾后 1 位内做指针减法

<a id="mach-36"></a>

#### MACH-36 严格别名规则、std::memcpy 与 std::bit_cast

- 先修：[MACH-34](#mach-34)、[CPP-18](cpp.md#cpp-18)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. 指针强转字节流踩穿的三重未定义行为
  2. 借助 `std::memcpy` 安全跨对齐解码（`-O2` 零开销）
  3. C++20 `std::as_bytes` 与 `std::bit_cast` 安全契约

<a id="mach-37"></a>

#### MACH-37 std::string 的 SSO 短字符串内联优化与布局

- 先修：[MACH-32](#mach-32)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. 为何 `sizeof(std::string)` 常为 24 或 32 字节
  2. 短串直接原地住进栈槽零堆分配的 SSO 机制
  3. SSO 字符串被 `std::move` 后视图/指针的失效边界

<a id="mach-38"></a>

#### MACH-38 vector、optional 与 variant 的物理内存占用

- 先修：[MACH-37](#mach-37)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. `std::vector` 24 字节三指针句柄布局
  2. `std::optional<T>` 附加状态位与对齐膨胀
  3. `std::variant` 联合体原地就位存储与无堆分配多态替代

<a id="mach-39"></a>

#### MACH-39 C++ 虚函数（vptr/vtable）内存代价与去虚化

- 先修：[MACH-38](#mach-38)、[CPP-34](cpp.md#cpp-34)
- 状态：已有[计算机组成（四）正文](../../src/content/handbook/machine-data-layout.md)。
- 小节
  1. 每个带虚函数对象隐藏插入 8 字节 `vptr` 引起的尺寸膨胀
  2. 二级指针间接跳转阻断内联与扰乱分支预测的运行时成本
  3. `final` 助力去虚化与热路径改用模板/variant

## 第五篇 现代 CPU 微架构、Cache 一致性与硬件 I/O（MACH-40 ~ MACH-50）

### 流水线、多核缓存与 DMA 底层原理

<a id="mach-40"></a>

#### MACH-40 经典五级指令流水线（IF / ID / EX / MEM / WB）

- 先修：[MACH-18](#mach-18)
- 状态：已有[计算机组成（五）：CPU 流水线、分支预测、多级缓存、MESI、MMU 与 DMA](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 指令拆分为取指、译码、执行、访存、写回五道工序
  2. 流水线如何把单条指令多周期耗时均摊到每周期接近 1 条
  3. 更深流水线提升主频与冲刷惩罚的权衡

<a id="mach-41"></a>

#### MACH-41 流水线三大冒险与硬件前递转发（Forwarding）

- 先修：[MACH-40](#mach-40)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 结构冒险、数据冒险（RAW）、控制冒险各自成因
  2. ALU 旁路前递电路直接透传未写回结果消除停顿
  3. 不可避免的 Load-Use 1 周期气泡与编译器指令调度重排

<a id="mach-42"></a>

#### MACH-42 分支预测器与无分支 cmov 编程

- 先修：[MACH-41](#mach-41)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 2-bit 饱和计数器与现代历史感知分支预测器 BHT
  2. 50% 随机交错输入导致 15+ 级流水线作废冲刷
  3. `count += (cond)` 与条件移动 `cmov` 消除预测失败

<a id="mach-43"></a>

#### MACH-43 超标量、乱序执行（OoO）、ROB 与 Store Buffer

- 先修：[MACH-41](#mach-41)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 多发射超标量架构每周期同时执行 4~6 条无依赖指令
  2. 保留站与重排序缓冲区 ROB 维持“内部乱序执行、外部有序提交”
  3. 写缓冲区 Store Buffer 引发多核可见性重排根源

<a id="mach-44"></a>

#### MACH-44 L1/L2/L3 Cache 几何：64B 缓存行与组相联映射

- 先修：[MACH-15](#mach-15)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 三级缓存容量与时钟周期（4 / 12 / 40 vs DRAM 200 cycles）
  2. Tag / Set Index / 64B Block Offset 物理地址拆分
  3. 直接映射冲突踩踏 vs N-路组相联平衡方案

<a id="mach-45"></a>

#### MACH-45 时间/空间局部性与矩阵分块优化（Loop Tiling）

- 先修：[MACH-44](#mach-44)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 行主序遍历满载 64B Cache Line vs 列遍历只用 4B 浪费 60B
  2. 2 的幂跨度冲突未命中现象
  3. Loop Tiling 把大矩阵切成契合 L1 容量的子块运算

<a id="mach-46"></a>

#### MACH-46 写策略（Write-Back/Through）与 MESI 多核一致性

- 先修：[MACH-44](#mach-44)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 写回法（配合 Dirty Bit）减少主存总线写入压力
  2. MESI 四种状态机与核间共享变量写操作 Invalidate 广播
  3. 一致性不等于线程安全原子加（仍需总线/缓存锁 LOCK）

<a id="mach-47"></a>

#### MACH-47 多核伪共享（False Sharing）与 alignas(64)

- 先修：[MACH-46](#mach-46)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 两线程各写不同变量却共住同一条 64B 缓存行惨案
  2. MESI 缓存行乒乒乓乓来回作废使多线程慢过单线程
  3. `alignas(64)` / `hardware_destructive_interference_size` 彻底隔离

<a id="mach-48"></a>

#### MACH-48 硬件预取与 SIMD 向量化（SSE2/AVX2）汇编实证

- 先修：[MACH-33](#mach-33)、[MACH-30](#mach-30)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 步幅硬件预取器识别规律扫描提前取数
  2. AVX2 `ymm` 一次并行比较 32 字节及标量尾循环
  3. `-fopt-info-vec` + `objdump -d` 验证真向量化及 `{0,31,32,33}` 边界测试

<a id="mach-49"></a>

#### MACH-49 虚拟地址 MMU、多级页表与 TLB 地址快表

- 先修：[MACH-44](#mach-44)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 四级页表爬行 4 次主存为何必须依靠 TLB 快表加速
  2. 大跨度随机跳页打穿 TLB 导致 TLB Thrashing
  3. 4 KiB 标准页 vs 2 MiB 大页适用边界

<a id="mach-50"></a>

#### MACH-50 PCIe 总线、中断 vs 异常与 DMA 零 CPU 拷贝

- 先修：[MACH-16](#mach-16)、[MACH-49](#mach-49)
- 状态：已有[计算机组成（五）正文](../../src/content/handbook/machine-asm-cache.md)。
- 小节
  1. 异步外设硬件中断 vs 同步指令异常/系统调用陷阱
  2. PCIe 通道带宽与高速 NVMe/网卡连接
  3. DMA 控制器直接搬运大块数据入主存解放 CPU 计算力
