# 现代 C++（CPP）

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

本学科以 C++20 和 Linux 终端为教学基线，可在 WSL2 Ubuntu 开课。先完成单文件日志统计，再以接口、错误契约和标准库支撑多文件聚合。CPP 编号用于课程设计，正文链接沿用学习站现有文件。

每项练习先根据输入与契约写预期，再记录运行平台、编译器版本、选项、实际输出及退出码。编译失败时记录诊断和失败阶段。以下练习结果均为预期，本次课程设计未运行示例。现有 Windows 正文的 PowerShell 命令与运行记录须按其原平台理解，Linux 结果单独记录。

## 第一篇 从环境到可验证的小程序

### 模块一 建立构建反馈

- 入口：零起点。能打开 Linux 终端即可，路径和工作目录概念可与 ENG-01 同步补齐。
- 能力：在独立练习目录构建 C++20 程序，能指出源码、目标文件、可执行文件和错误所在阶段。
- 检验：从干净目录完成一次成功运行，再提交一次编译失败和一次链接失败的命令与证据。

<a id="cpp-01"></a>

#### CPP-01 配置 C++20 练习环境

- 先修：零起点
- 层级：核心应用（核心）
- 状态：已有[环境正文](../../src/content/handbook/cpp-setup.md)（覆盖 Windows PowerShell 与 Linux/WSL2 双平台配置、UTF-8 编码与排错），可跨读 [Linux 环境正文](../../src/content/handbook/linux-process-io.md)。
- 问题：命令找不到编译器、找不到源码和已经运行但字符显示不对，分别要检查哪里？
- 小节：
  1. 识别当前终端、工作目录与源码路径，建立独立练习目录。
  2. 检查编译器版本，用 C++20 模式构建并确认产物位置。
  3. 用 ASCII 输出建立基线，再对照 UTF-8 源文件与终端显示。
- 能力：解释编译器搜索与源码路径解析的区别，独立改动文字并重建。
- 练习与预期：复用 [cpp-setup.cpp](../../public/examples/cpp-setup.cpp)，把输出替换成唯一的 ASCII 标记，新产物应输出该标记并返回 0。换成保证不存在的源码路径，构建应返回非零。
- 独立实验：把练习目录名改为带空格的名字，用加引号的路径复现成功构建并保存命令。

<a id="cpp-02"></a>

#### CPP-02 从最小程序到编译与链接

- 先修：[CPP-01](#cpp-01)
- 层级：核心应用（核心）
- 状态：已有[工具链正文](../../src/content/handbook/toolchain.md)（覆盖 -E/-S/-c 四阶段、ODR 冲突、nm 符号表与断点调试）。
- 问题：为什么已经有目标文件，程序仍可能无法启动？
- 小节：
  1. 标注头文件、main、输出语句和退出码的角色。
  2. 用 -c 观察目标文件，随后单独链接并运行。
  3. 对照语法诊断、缺失符号和运行结果偏差，定位第一处失败。
- 能力：拆分构建步骤，能在 main 设断点并解释当前语句何时执行。
- 练习与预期：复用 [hello-minimal.cpp](../../public/examples/hello-minimal.cpp)，成功时输出 `LogScan ready`、退出码为 0。练习副本调用仅声明的普通函数时，目标文件应能生成，链接应以非零状态失败。
- 独立实验：补定义后重建，用断点观察输出语句前后，记录恢复后的输出。

### 模块二 表达数据与处理过程

- 入口：完成 CPP-02，能从终端重建并运行一个单文件程序。
- 能力：使用类型、分支、循环、容器和函数表达逐行处理，能从文件读取记录。
- 检验：独立读取有空行与无末尾换行的样本，用固定预期核对读入条数和分类条数。

<a id="cpp-03"></a>

#### CPP-03 类型、初始化与表达式

- 先修：[CPP-02](#cpp-02)
- 层级：核心应用（核心）
- 状态：已有[变量和类型正文](../../src/content/handbook/cpp-basics.md)。
- 问题：平均值为什么在赋给 double 之前就丢掉了小数？
- 小节：
  1. 用花括号初始化计数、布尔标记和字符串。
  2. 在纸上标出运算数与运算结果的类型，再检查赋值目标。
  3. 对照整数除法、显式转换与窄化诊断，建立空样本的分母约束。
- 能力：解释提升与转换发生的位置，写出初始化完整的统计表达式。
- 练习与预期：改造 [cpp-basics.cpp](../../public/examples/cpp-basics.cpp) 对照 `5 / 2` 与 `static_cast<double>(5) / 2`，数值应分别为 2 与 2.5。
- 独立实验：编写接收固定计数的平均值探针，零条记录走单独分支，核对无除零操作。

<a id="cpp-04"></a>

#### CPP-04 分支、循环与输入状态

- 先修：[CPP-03](#cpp-03)
- 层级：核心应用（核心）
- 状态：已有[分支与循环正文](../../src/content/handbook/cpp-control.md)。
- 问题：为什么空行能进入循环，读到输入末尾却要停？
- 小节：
  1. 用 if / else if 固定分类优先级，对照独立 if 的重复命中。
  2. 追踪循环进入、更新与停止，区分赋值和比较。
  3. 对照格式化提取与 getline，观察换行残留及输入失败。
- 能力：解释每轮消费了哪些字符，实现按读取成功推进的循环。
- 练习与预期：借用 [cpp-control.cpp](../../public/examples/cpp-control.cpp) 的读取方式，改为逐行计数。对输入 `A\n\nB` 应计 3 行，其中空行 1 条。
- 独立实验：做整数加备注的读取探针，输入 `7\nhello\n`，分别记录处理残留换行前后的首个 getline 结果，预期为空串与 `hello`。

<a id="cpp-05"></a>

#### CPP-05 string 与 vector 入门

- 先修：[CPP-04](#cpp-04)
- 层级：核心应用（核心）
- 状态：已有[容器入门正文](../../src/content/handbook/cpp-containers.md)。
- 问题：为何循环里改了元素，容器里的原值却没变化？
- 小节：
  1. 用 string 保存一行文本，用 vector 保存顺序记录。
  2. 追踪插入、查询大小与空容器检查，对照 at 与下标的前置条件。
  3. 用范围 for 顺序访问元素，观察空容器时循环体不运行。
- 能力：实现安全遍历，解释复制、原地修改和有效下标的边界。
- 练习与预期：改造 [cpp-containers.cpp](../../public/examples/cpp-containers.cpp)，从 `{1, 2}` 追加 3，按序打印 `1 2 3` 并核对大小 3；清空后输出无元素。CPP-06 再比较传参。
- 独立实验：写一个保序缓存，跳过空输入行并在读完后输出，空输入应输出零条记录。

<a id="cpp-06"></a>

#### CPP-06 函数、参数与返回值

- 先修：[CPP-03](#cpp-03)、[CPP-05](#cpp-05)
- 层级：核心应用（核心）
- 状态：已有[函数正文](../../src/content/handbook/cpp-functions.md)与[头文件、翻译单元与命名空间正文](../../src/content/handbook/cpp-headers-modules.md)（含[示例代码](../../public/examples/headers-ns.cpp)）。
- 问题：怎样让分类规则可以单独调用和核对？
- 小节：
  1. 对照函数声明、定义与调用，标出参数类型和返回契约。
  2. 按输入、输出及修改责任选择传值、只读引用与可写引用。
  3. 枚举分类分支，检查每条返回路径及边界用例。
- 能力：从循环提取纯分类函数，解释调用方何时能观察到参数修改。
- 练习与预期：复用 [cpp-functions.cpp](../../public/examples/cpp-functions.cpp) 的传参对照，将初值设为 3、操作设为加一。按值调用后原值仍为 3，按引用调用后为 4。
- 独立实验：实现计数更新函数，分别测试 INFO、WARN 和未知标签，确保每次只增加一项。

<a id="cpp-07"></a>

#### CPP-07 用 struct 表达记录并逐行读文件

- 先修：[CPP-04](#cpp-04)、[CPP-06](#cpp-06)
- 层级：核心应用（核心）
- 状态：已有[结构体与文件正文](../../src/content/handbook/cpp-struct-file.md)，读错误契约在 CPP-11 和 CPP-14 深入。
- 问题：怎样把级别、文本与行号交给下游，又能解释文件为何没读到内容？
- 小节：
  1. 设计记录字段，区分原始文本、解析值与累计结果。
  2. 用 ifstream 打开路径，通过 getline 推进读入，区分空文件与打开失败。
  3. 把相对路径与当前工作目录关联，跨读[命令行正文](../../src/content/handbook/command-line-git.md)的路径部分。
- 能力：实现文件记录读取，解释读成功与解析成功各自的判定点。
- 练习与预期：复用 [cpp-struct-file.cpp](../../public/examples/cpp-struct-file.cpp) 的读法和 [sample.log](../../public/examples/sample.log)，逐行编号应得到 1 至 5。另用空文件和不存在路径分别检查零行与打开失败。
- 独立实验：为每条记录保留原始行号，跳过一条插入的空行，检查之后的记录编号仍对应文件位置。

## 第二篇 从对象和资源到单文件交付

### 模块三 借用、生命周期与资源归属

- 入口：完成 CPP-06 和 CPP-07，能追踪参数、局部变量和输入流。
- 能力：判断地址或视图何时有效，用自动对象和独占所有权表达清理责任。
- 检验：提交一张拥有者与借用者关系图，指出失效点并给出安全版本，验证正常返回与失败路径。

<a id="cpp-08"></a>

#### CPP-08 指针、引用与 const

- 先修：[CPP-05](#cpp-05)、[CPP-06](#cpp-06)
- 层级：核心应用（核心）
- 状态：已有[指针、引用与 const 正文](../../src/content/handbook/pointers-const.md)和[示例代码](../../public/examples/pointers-const.cpp)。
- 问题：一个参数怎样表达可选借用、可修改借用或只读借用？
- 小节：
  1. 对照取地址、解引用、nullptr 检查与引用绑定。
  2. 对照 `const T*` 与 `T* const`，分别检查修改对象和改变指向。
  3. 为参数选值、引用或指针，并写清空值与调用期间的有效性。
- 能力：解释指针和引用的约束，设计一个允许缺省目标的只读接口。
- 练习与预期：以整数 7 和 nullptr 调用只读探针，分别得到 7 与 `missing`。通过 `const int*` 写入应触发编译诊断。
- 独立实验：为两个存活对象分别构造指针与引用的对照，演示指针重新指向，以及给引用赋值时原对象被修改。

<a id="cpp-09"></a>

#### CPP-09 对象生命周期与借用失效

- 先修：[CPP-07](#cpp-07)、[CPP-08](#cpp-08)
- 层级：核心应用（核心）
- 状态：已有[生命周期正文](../../src/content/handbook/lifetime.md)。
- 问题：借用的数据在作用域结束、下一次读行或容器扩容后还能使用吗？
- 小节：
  1. 标注对象生命周期，识别返回局部引用和视图的悬空风险。
  2. 对照 string 拥有字符和 string_view 借用字符，区分内容覆盖与地址失效。
  3. 用容量变化判断 vector 重分配，学习重新获取借用或保存独立值。
- 能力：追踪拥有者与使用点，能将跨轮保存改成深拷贝或安全的索引方案，并说明索引方案的容器修改约束。
- 练习与预期：复用 [borrow-or-copy.cpp](../../public/examples/borrow-or-copy.cpp)，原行更新为 `INFO ready` 后，已保存的副本仍为 `ERROR:`。
- 独立实验：复用 [lifetime.cpp](../../public/examples/lifetime.cpp) 的扩容主题，记录容量变化并检查重新取得的首元素值，全程只使用有效借用。

<a id="cpp-10"></a>

#### CPP-10 RAII 与独占所有权

- 先修：[CPP-09](#cpp-09)
- 层级：核心应用（核心）
- 状态：已有[RAII 正文](../../src/content/handbook/raii.md)。
- 问题：函数提前返回或抛异常时，谁负责关闭文件与销毁动态对象？
- 小节：
  1. 标注流对象、借用参数与资源的释放责任。
  2. 对照正常退出、提前返回和异常展开中的析构顺序。
  3. 用 unique_ptr 表达独占归属，观察移动前后的源和目标。
- 能力：用标准库对象实现作用域清理，解释所有权转移后哪些操作仍有效。
- 练习与预期：运行 [raii.cpp](../../public/examples/raii.cpp)，无参数应显示 `draft empty: true` 与 `first line: INFO ready`；传不存在的路径应向 stderr 报告并返回 1。
- 独立实验：用两个带析构记录的局部对象检查逆构造顺序，覆盖正常返回与受控异常两条路径。

### 模块四 从空白文件交付 LogScan v0

- 入口：完成 CPP-07、CPP-09 和 CPP-10，能读文件并解释当前行借用的期限。
- 能力：先写下输入与输出规则，再分离分类、扫描和入口，实现可复验的文件工具。
- 检验：交付单文件程序与可重跑样本，逐项核对正常结果、坏行、打开失败和用法错误。

<a id="cpp-11"></a>

#### CPP-11 从空白文件写逐行分类器

- 先修：[CPP-07](#cpp-07)、[CPP-09](#cpp-09)、[CPP-10](#cpp-10)
- 层级：核心应用（核心）
- 状态：已有[逐行分类器正文](../../src/content/handbook/blank-program.md)。
- 问题：拿到一句“逐行分类并显示总行数”，第一步应实现什么？
- 小节：
  1. 从空串、带空格前缀和其他文本写出分类表，先以常量输入验证。
  2. 接通逐行循环，区分空行、结束和读取失败。
  3. 再接文件与标准输入，检查参数分支、诊断和计数输出。
- 能力：能从空文件开始逐步实现并验证，解释返回的标签视图为何可以使用。
- 练习与预期：用 [classify.cpp](../../public/examples/classify.cpp) 对照四行 `INFO start`、空行、`WARN retry`、`INFO`。预期依次为 INFO、EMPTY、WARN、OTHER，最后是 `lines: 4`，退出码 0。
- 独立实验：为分类器增加一个新前缀，提供一对仅差尾随空格的输入，核对两条路径和总数。

<a id="cpp-12"></a>

#### CPP-12 单文件 LogScan 与验收契约

- 先修：[CPP-11](#cpp-11)
- 层级：核心应用（核心）
- 状态：已有 [LogScan v0 实验](../../src/content/labs/logscan.md)和[单文件源码](../../public/examples/logscan.cpp)。
- 问题：分类器里的前缀规则怎样升级为日志首词规则，并区分坏行和程序失败？
- 小节：
  1. 从完整首词推导级别，区分全空白行与未知首词，核对分类器与 v0 的规则差异。
  2. 划分 CLI 入口与扫描职责，约定 stdout、stderr 和退出码。
  3. 固定 LF、CRLF 和无末尾换行样本，验证计数及失败路径。
- 能力：独立写出单文件 v0，解释 `INFO` 属于 INFO 而 `ERROR:` 计入未知。
- 练习与预期：用 ` INFO ready\n\nERROR: disk\nINFO` 作为字节内容，按 INFO、WARN、ERROR、UNKNOWN 顺序预期为 2、0、0、1，stderr 为空，退出码 0。无参数返回 2，缺文件返回 1，两者都应只写诊断。
- 项目：保存单文件、样本、构建命令和三通道结果。补一份 CRLF 样本，核对与 LF 样本计数相同。

## 第三篇 用接口与标准库支撑多文件聚合

### 模块五 对象契约与错误边界

- 入口：完成 CPP-10 和 CPP-12。已有 v0.1 工程可用作对照，构建操作跨读 ENG-04。
- 能力：设计具有不变量的值类型，选择复制或移动语义，为解析与 I/O 定义清晰的错误契约。
- 检验：用构造、修改、复制和失败用例验证公开接口，先回归已有 v0.1 行为，再引入新类型。

<a id="cpp-13"></a>

#### CPP-13 类接口、值语义与复制移动

- 先修：[CPP-10](#cpp-10)、[CPP-12](#cpp-12)
- 层级：进阶专题（核心进阶）
- 状态：已有[值语义、复制移动与多态正文](../../src/content/handbook/value-move.md)和[示例代码](../../public/examples/value-move.cpp)。
- 问题：调用者复制一份报告再修改时，哪些数据应独立，何时只允许转移所有权？
- 小节：
  1. 以构造函数和公开方法维护报告不变量，用 const 成员函数表达查询。
  2. 先用拥有型成员实现零法则，对照逐成员复制与独占成员导致的不可复制。
  3. 区分初始化与赋值、std::move 与实际转移，明确移后对象可用操作和复制消除。
  4. 对照具体值类型与运行时接口：用纯虚函数和虚析构函数定义报告输出端，解释对象切片和基类删除的条件。
- 能力：能实现拥有记录的值类型，并说明资源持有者为何可能采用只移动接口。
- 练习与预期：构造含一条记录的报告，复制后追加一条记录。原报告大小仍为 1，副本为 2。将副本移动构造到新报告后，新报告应包含 2 条记录，按类型契约验证移后源对象。
- 项目：对照 [v0.1 计数接口](../../public/examples/logscan-build/logscan_core.hpp)，在练习副本设计报告类型并列出三条不变量及验证用例。
- 独立实验：以 `std::unique_ptr<ReportSink>` 持有测试输出端，用基类接口写入一条计数；核对派生端收到一条且作用域结束时派生析构记录出现一次。v1 固定文本输出时继续用具体值类型。

<a id="cpp-14"></a>

#### CPP-14 用返回值和异常表达失败

- 先修：[CPP-12](#cpp-12)、[CPP-13](#cpp-13)
- 层级：进阶专题（核心进阶）
- 状态：已有[错误处理与异常保证正文](../../src/content/handbook/error-handling.md)和[示例代码](../../public/examples/error-handling.cpp)。
- 问题：坏行、没有记录、文件不可读和内部操作抛异常，分别如何传到入口？
- 小节：
  1. 用 optional 表示可能缺值，用带标签结果区分成功与具体错误，明确 C++20 接口。
  2. 区分结束、打开失败与读错误，把库层结果翻译为进程退出码与诊断。
  3. 用 RAII 和临时结果定义失败后的状态，比较基本保证与强保证。
- 能力：实现解析结果与 I/O 故障的分离，解释临时聚合何时提交。
- 练习与预期：给扫描辅助函数传入预置 badbit 的输入流，应返回读失败；空的正常流应正常结束并给出零计数。未知首词应产生未知计数。
- 项目：在独立对照练习中设计按文件提交的聚合策略（E1 主线使用整批失败），注入第二个文件读取失败，验收首个文件贡献仍在，失败文件的部分计数未提交且有路径诊断。

### 模块六 泛型聚合、遍历与诊断

- 入口：完成 CPP-13 和 CPP-14，能说清接口接受什么输入、借用谁的数据以及失败后留下什么状态。
- 能力：用模板约束复用逻辑，用容器、迭代器及 Ranges 表达聚合，能通过契约与工具定位未定义行为。
- 检验：对同一输入比较手写与标准库实现，检查结果顺序和对象失效边界，保留一份独立错误诊断实验。

<a id="cpp-15"></a>

#### CPP-15 模板、类型推导与 Concepts

- 先修：[CPP-06](#cpp-06)、[CPP-13](#cpp-13)
- 层级：进阶专题（核心进阶）
- 状态：已有[模板与 Concepts 正文](../../src/content/handbook/stl-generics.md)和[示例代码](../../public/examples/stl-generics.cpp)。
- 问题：怎样让同一统计接口接收不同序列，并在调用处指出输入违反了哪个约束？
- 小节：
  1. 用两个调用追踪函数模板推导、实例化与混合类型推导冲突。
  2. 对照模板声明、定义可见性和实例化时机。
  3. 用 requires 和标准 Concepts 表达输入可迭代及投影可调用，区分静态约束与业务验证。
- 能力：实现受约束的计数函数，解读首条约束诊断并指出失败的类型。
- 练习与预期：用同一函数统计 vector 和 array 中的大于零元素，输入 `{-1, 0, 2, 5}` 均得 2；传入标量应被约束拒绝。
- 独立实验：用 static_assert 检查两个满足约束的类型和一个不满足的类型，并验证运行时结果。

<a id="cpp-16"></a>

#### CPP-16 标准库容器、迭代器与算法

- 先修：[CPP-05](#cpp-05)、[CPP-09](#cpp-09)、[CPP-13](#cpp-13)
- 层级：进阶专题（核心进阶）
- 状态：已有[标准库容器与算法正文](../../src/content/handbook/stl-containers-algos.md)与[Lambda 闭包、生命期与 chrono 正文](../../src/content/handbook/cpp-lambda-chrono.md)（含[Lambda 与 chrono 示例](../../public/examples/lambda-chrono.cpp)）。
- 问题：如何按日志来源计数，同时保证每次报告的排序一致？
- 小节：
  1. 按顺序、去重和键查询需求比较 vector、map 和 unordered_map，明确输出顺序。
  2. 用半开区间表达遍历，比较输入、前向和随机访问迭代器要求。
  3. 用 find_if、sort 等算法替代遍历片段，检查 end、比较规则及容器修改后的有效性。
- 能力：选择索引与报告表示，解释 unordered_map 重哈希对迭代器的影响，并实现明确的排序规则。
- 练习与预期：输入来源 `b, a, b, c, a`，按计数降序和来源升序输出，应依次为 `a:2`、`b:2`、`c:1`，交换处理顺序仍得相同报告。
- 项目：为 v1 实现按来源聚合的练习原型，用手写计数作为小样本参考解，检查空输入、并列和重复键。

<a id="cpp-17"></a>

#### CPP-17 C++20 Ranges 与惰性视图

- 先修：[CPP-15](#cpp-15)、[CPP-16](#cpp-16)
- 层级：进阶专题（进阶）
- 状态：已有[Ranges 惰性视图与 UB 边界正文](../../src/content/handbook/cpp20-ranges-ub.md)和[示例代码](../../public/examples/cpp20-ranges-ub.cpp)。[生命周期正文](../../src/content/handbook/lifetime.md)可先回读 string_view 借用。
- 问题：过滤和投影可以延迟到遍历时，谁必须活到那个时刻？
- 小节：
  1. 从迭代器对迁移到 ranges 算法，查看范围和投影参数。
  2. 组合 views::filter 与 views::transform，追踪何时访问底层数据。
  3. 标注源容器和闭包捕获的寿命，按需在 C++20 中显式遍历并物化为拥有型结果。
- 能力：实现一条可核对的过滤投影管线，解释源对象变化或销毁对视图的影响。
- 练习与预期：对 `{3, 1, 4, 2}` 过滤偶数再平方，预期输出 `16, 4`；物化后销毁源容器，拥有型结果仍可遍历且顺序相同。
- 项目：在 v1 报告原型中筛选非零计数，同样本比较循环与 Ranges 两版输出。

<a id="cpp-18"></a>

#### CPP-18 未定义行为与验证边界

- 先修：[CPP-09](#cpp-09)、[CPP-14](#cpp-14)、[CPP-16](#cpp-16)
- 层级：进阶专题（核心进阶）
- 状态：已有[Ranges 惰性视图与 UB 边界正文](../../src/content/handbook/cpp20-ranges-ub.md)和[示例代码](../../public/examples/cpp20-ranges-ub.cpp)，覆盖 UB 分类、安全边界检查与 Linux ASan/UBSan 诊断。
- 问题：程序曾经输出正确，能据此证明下标和借用安全吗？
- 小节：
  1. 对照有明确定义的无符号回绕、实现定义行为和未定义行为。
  2. 从下标、对象寿命和有符号溢出定位被违反的前置条件。
  3. 为独立练习副本启用警告及 ASan/UBSan，以具体诊断定位，再用边界样本复查修复版。
- 能力：用语言规则解释失效原因，记录工具覆盖范围，并为修复后的输入定义确定结果。
- 练习与预期：从独立的越界读教学样例出发，记录诊断、编译选项与位置，原版无固定输出预期。修复版对空序列应报告无元素，对单元素序列应返回该值，两条用例均应无 sanitizer 诊断。
- 独立实验：以最大可表示有符号整数测试安全累加，验收收到显式溢出错误，已有计数保持原值。

## 第四篇 语言核心深水区：类型、视图与编译期计算

### 模块七 表达式、强类型枚举与控制流细节

- 入口：完成 CPP-04 和 CPP-09，能读懂常见表达式并区分基本类型与引用。
- 能力：避开隐式提升、优先级、八进制和悬空字面量陷阱，用强类型枚举与结构化绑定表达清晰控制流。
- 检验：写出涵盖窄化拦截、安全符号比较与 `[[fallthrough]]` 的验证片段，在 `-Wall -Wextra -Wpedantic` 下零警告通过。

<a id="cpp-19"></a>

#### CPP-19 字面量、进制前缀与类型后缀

- 先修：[CPP-03](#cpp-03)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：为什么 `012` 不是十进制 `12`，`auto s = "hi"` 推导出的又不是 `std::string`？
- 小节：
  1. 区分十进制、八进制、十六进制与二进制字面量，使用 `'` 数字分隔符。
  2. 为整数字面量与浮点字面量选择 `u`/`ll`/`ull`/`f` 后缀，识别 `u8` 与 `R"(...)"`。
  3. 合理使用 `"..."s`、`"..."sv` 与 `chrono` 标准用户自定义字面量。
- 能力：准确预判无后缀与带后缀字面量的推导类型，避免八进制和移位溢出误用。
- 练习与预期：用 `static_assert` 核对 `1u << 31`、`3.14f` 与 `"abc"sv` 的类型，分别应为 `unsigned int`、`float` 与 `std::string_view`。

<a id="cpp-20"></a>

#### CPP-20 隐式转换、整数提升与窄化防护

- 先修：[CPP-19](#cpp-19)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：为什么 `-1 < 1u` 会算出 `false`，用 `{}` 初始化又能提前拦截哪些静默截断？
- 小节：
  1. 追踪窄整数的整数提升与有符号/无符号混合常规算术转换。
  2. 用 C++20 `std::cmp_less` 与 `std::in_range` 保护跨符号比较和范围转换。
  3. 对照 `=` 赋值截断与 `{}` 列表初始化禁用窄化转换规则。
- 能力：排查跨符号比较漏洞，并用花括号初始化和 `<utility>` 守住数值边界。
- 练习与预期：验证 `std::cmp_less(-1, 1u)` 为 `true`、`std::in_range<std::uint8_t>(300)` 为 `false`；确认 `int x{3.9};` 被编译拒绝。

<a id="cpp-21"></a>

#### CPP-21 运算符优先级、短路求值与逗号陷阱

- 先修：[CPP-03](#cpp-03)、[CPP-04](#cpp-04)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：为什么 `flags & MASK == 0` 总是判断失误，逗号运算符又会在下标里藏什么坑？
- 小节：
  1. 掌握位运算、移位、比较与三元运算符的高频反直觉优先级。
  2. 区分 `&&`/`||` 短路求值保障与函数实参之间的未指定求值顺序。
  3. 识别逗号表达式 `,` 与参数分隔符的区别，避免同一表达式多处副作用修改。
- 能力：写出无歧义括号表达式，消除依赖求值顺序的未定义/未指定行为。
- 练习与预期：对照 `flags & 0x04 == 0` 与 `(flags & 0x04) == 0`，当 `flags = 0x04` 时前者竟为 `false`（`0`），后者正确为 `false` 且对 `flags = 0` 为 `true`。

<a id="cpp-22"></a>

#### CPP-22 enum 与强类型 enum class

- 先修：[CPP-03](#cpp-03)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：传统 `enum` 为什么容易名字冲突还允许苹果和颜色直接比较？
- 小节：
  1. 对照非限定 `enum` 作用域泄漏/隐式转整数与 `enum class` 的强类型隔离。
  2. 为 `enum class` 显式指定 `: std::uint8_t` 等定宽底层类型。
  3. 用 C++20 `using enum` 简化 `switch` 分支，并实现安全的底层值转换。
- 能力：在接口与状态码设计中统一采用 `enum class`，安全地与整数线格式互转。
- 练习与预期：定义 `enum class Level : std::uint8_t`，用 `using enum Level;` 实现名称映射并核对 `sizeof(Level) == 1`。

<a id="cpp-23"></a>

#### CPP-23 switch 贯穿控制与结构化绑定

- 先修：[CPP-04](#cpp-04)、[CPP-22](#cpp-22)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：如何安全处理 `switch` 合并分支，并用结构化绑定零拷贝拆解键值对？
- 小节：
  1. 用 `[[fallthrough]]` 标记有意贯穿，用 `{}` 块隔离 `case` 局部变量。
  2. 使用 C++17 `if` 与 `switch` 初始化语句收紧临时变量作用域。
  3. 用 `auto [k, v]` 与 `const auto& [k, v]` 拆解 `pair`、`tuple` 和结构体，并标注引用寿命。
- 能力：写出零 `-Wimplicit-fallthrough` 警告的状态分发与简洁范围遍历。
- 练习与预期：用 `if (auto [it, ok] = m.try_emplace("err", 1); ok)` 更新计数并核对二次插入返回 `false`。

### 模块八 固定阵列、非拥有视图与编译期格式化

- 入口：完成模块七与 CPP-09，理解拥有者与借用的边界。
- 能力：在定长缓冲、只读文本切片、连续内存片段和编译期求值中选用零开销抽象，并写出类型安全格式化。
- 检验：验证 `string_view`/`span` 切片逻辑与 `constexpr`/`consteval` 编译期断言。

<a id="cpp-24"></a>

#### CPP-24 原生多维数组与 std::array

- 先修：[CPP-05](#cpp-05)、[CPP-08](#cpp-08)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：为什么原生数组一传进函数就丢失长度，而 `std::array` 却保留完整值语义？
- 小节：
  1. 分析原生多维数组行优先布局与传参退化（Array-to-Pointer Decay）陷阱。
  2. 用 `std::array<T, N>` 替代定长 C 数组，保留 `.size()`、`.at()` 与比较操作。
  3. 权衡栈上定长二维阵列与堆上一维平铺 `std::vector` 的缓存与尺寸边界。
- 能力：根据尺寸是否编译期固定选择 `std::array` 或平铺 `std::vector`。
- 练习与预期：把 4 元 `std::array<int, 4>` 传入按值/按视图函数验证长度不丢失，核对大小和字节布局。

<a id="cpp-25"></a>

#### CPP-25 std::string_view 非拥有视图与寿命法则

- 先修：[CPP-09](#cpp-09)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：为什么按值传 `std::string_view` 比 `const std::string&` 更灵活，却绝不能绑到 `a + b` 上？
- 小节：
  1. 拆解 `string_view` 两字段结构（指针与长度）与零拷贝传参优势。
  2. 排查绑定临时 `std::string`、容器扩容失效与函数返回局部切片三大悬空风险。
  3. 识别 `string_view` 不保证 `\0` 结尾，向 C API 传递前须构造拥有型 `std::string`。
- 能力：设计安全的只读文本接口，准确划定所有借用视图的存活区间。
- 练习与预期：对字面量与 `std::string` 调用同一 `string_view` 解析函数，检查零额外堆拷贝及切片子串结果。

<a id="cpp-26"></a>

#### CPP-26 std::span 非拥有连续内存切片

- 先修：[CPP-24](#cpp-24)、[CPP-25](#cpp-25)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：怎样用一个函数接口同时接收 `vector`、`std::array` 和 C 数组及其任意子区间？
- 小节：
  1. 用 `std::span<const T>` 与 `std::span<T>` 区分只读观察与原地修改切片。
  2. 比较动态范围 `span<T>` 与静态范围 `span<T, N>` 的体积与编译期检查。
  3. 使用 `.first()`、`.last()` 与 `.subspan()` 安全切片，守住底层 `vector` 不扩容前提。
- 能力：用 `std::span` 替代传统的 `(const T* ptr, size_t len)` 成对参数接口。
- 练习与预期：对 `{10, 20, 30, 40}` 取 `.subspan(1, 2)` 求和，预期结果为 `50`。

<a id="cpp-27"></a>

#### CPP-27 constexpr、consteval 与 constinit

- 先修：[CPP-19](#cpp-19)
- 层级：进阶专题（核心进阶）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：同样带 `const`，为什么有的只能在编译期算、有的退化到运行期、有的运行期还能修改？
- 小节：
  1. 区分 `const`（运行期只读）与 `constexpr`（编译期可求值且兼顾运行期）。
  2. 使用 C++20 `consteval` 强制立即函数仅在编译期执行，并用 `std::is_constant_evaluated()` 分流。
  3. 使用 C++20 `constinit` 消除跨单元静态初始化顺序隐患同时保留可写性。
- 能力：合理把常量计算前移到编译期，并消除静态初始化顺序问题。
- 练习与预期：编写 `consteval` 尺寸计算函数并用 `static_assert` 与 `constinit` 全局计数器验证编译期初值。

<a id="cpp-28"></a>

#### CPP-28 C++20 std::format、print 与 iomanip

- 先修：[CPP-01](#cpp-01)、[CPP-25](#cpp-25)
- 层级：核心应用（核心）
- 状态：已有[核心语法深水区正文](../../src/content/handbook/cpp-core-deep.md)。
- 问题：为什么 `<iomanip>` 的 `std::hex` 会污染后续输出，C++20 `std::format` 又如何兼顾安全与可移植？
- 小节：
  1. 区分 `<iomanip>` 粘滞状态操纵符与单次生效的 `std::setw`。
  2. 掌握 `std::format` 对齐、进制前缀、精度与编译期格式串校验语法及 `<print>` 预览。
  3. 使用 `__cpp_lib_format` 特征探测兼容 GCC 11/12 等无 `<format>` 环境。
- 能力：写出无流状态污染、格式清晰且跨编译器可编译的日志与报告输出。
- 练习与预期：格式化输出 `[ INFO] slice  val=0x0032 (50)`，并确认后续十进制输出不受十六进制影响。

## 第五篇 面向对象、多态机制与类型安全

### 模块九 类不变量、构造与资源法则

- 入口：完成 CPP-10 与 CPP-13，能设计基本类接口并理解移动语义。
- 能力：通过初始化列表、不变量守卫、`explicit` 与三五零法则写出既高效又无资源泄漏的值类与封装类。
- 检验：验证初始化顺序、Copy-and-Swap 异常安全与 C++20 `<=>` 比较生成。

<a id="cpp-29"></a>

#### CPP-29 类不变量、访问控制与构造函数契约

- 先修：[CPP-07](#cpp-07)、[CPP-13](#cpp-13)
- 层级：核心应用（核心）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：为什么构造完对象后还要靠外部调 `is_valid()` 检查，往往意味着类设计失败？
- 小节：
  1. 对比 `struct` 与 `class` 的默认权限及“数据记录 vs 封装不变量”语义分工。
  2. 用私有字段与构造函数建立类不变量，参数非法时及时抛异常阻断僵尸对象。
  3. 显式使用 `= default` 与 `= delete` 精准控制默认构造和禁用重载。
- 能力：为业务类型明确列出不变量，并在构造与修改入口彻底守住它。
- 练习与预期：设计 `PortRange(lo, hi)`，传入 `(9000, 8000)` 应立即抛出 `std::invalid_argument`。

<a id="cpp-30"></a>

#### CPP-30 成员初始化列表与委托构造函数

- 先修：[CPP-29](#cpp-29)
- 层级：核心应用（核心）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：为什么在构造函数体 `{}` 里赋值慢一步，初始化列表顺序写反了又为何读到垃圾值？
- 小节：
  1. 区分成员初始化列表原地构造与函数体内赋值的开销及 `const`/引用成员强制要求。
  2. 牢记“成员类内声明顺序决定初始化顺序”，消除 `-Wreorder` 隐患。
  3. 用 NSDMI 类内默认值与委托构造函数消除多重载间的重复校验逻辑。
- 能力：写出无冗余默认构造、顺序一致且无重复校验的构造函数组。
- 练习与预期：让单参 `PortRange(int single)` 委托给双参 `PortRange(single, single)`，复用同一套范围校验。

<a id="cpp-31"></a>

#### CPP-31 explicit 与运算符重载及三路比较

- 先修：[CPP-29](#cpp-29)、[CPP-30](#cpp-30)
- 层级：核心应用（核心）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：怎样阻止单参数构造函数悄悄把整数隐式变成大对象，并两行生成全套比较运算符？
- 小节：
  1. 用 `explicit` 阻断意外单参/花括号隐式转换，了解 `explicit(bool)`。
  2. 区分成员运算符（`+=`/`[]`）与非成员/友元对称运算符（`+`/`<<`）设计准则。
  3. 使用 C++20 `operator<=>` 默认三路比较自动合成六种关系运算。
- 能力：设计直觉自然、无隐式转换坑且比较语义完备的值类型。
- 练习与预期：为 `PortRange` 加上 `auto operator<=>(const PortRange&) const = default;`，验证 `p1 < p2` 与 `p1 == p2` 均可用。

<a id="cpp-32"></a>

#### CPP-32 三五零法则与 Copy-and-Swap 惯用法

- 先修：[CPP-10](#cpp-10)、[CPP-13](#cpp-13)
- 层级：进阶专题（核心进阶）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：手写拷贝赋值时怎样一举解决自赋值崩溃与 `new` 抛异常后的半残状态？
- 小节：
  1. 掌握编译器自动生成或抑制拷贝/移动特殊成员函数的精确规则表。
  2. 默认遵循零法则，手工管理资源时写齐五法则并给移动操作加 `noexcept`。
  3. 用 Copy-and-Swap（按值传参 `rhs` + `noexcept swap`）实现强异常安全赋值。
- 能力：在自建资源封装类中实现无泄漏、自赋值安全且强异常安全的赋值操作。
- 练习与预期：对 `OwnedBuffer` 执行自赋值 `b = b` 与跨尺寸赋值 `b2 = b1`，验证内容一致且无内存泄漏。

### 模块十 继承、虚表分发与转换体系

- 入口：完成模块九，能独立实现值类型与资源所有权。
- 能力：正确使用运行时动态多态与 CRTP 静态多态，彻底避开对象切片、非虚析构 UB 与危险 C 强转。
- 检验：运行抽象接口、`dynamic_cast` 与 CRTP 静态多态对照验证。

<a id="cpp-33"></a>

#### CPP-33 继承契约与对象切片风险

- 先修：[CPP-29](#cpp-29)、[CPP-32](#cpp-32)
- 层级：进阶专题（核心进阶）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：为什么把派生类按值传给接收基类的函数后，派生字段和虚函数行为全丢了？
- 小节：
  1. 区分 `public` 继承（`is-a` 行为契约）与组合替代 `private` 继承的工程选择。
  2. 追踪按值传递或 `vector<Base>` 存储引发的对象切片（Object Slicing）内存裁切。
  3. 解释基类构造与析构期间调用虚函数为何不会分发到派生类。
- 能力：用指针/引用/智能指针传递多态对象，并能从基类接口封堵意外切片。
- 练习与预期：对比按值切片与 `unique_ptr<ISink>` 持有派生端，验证后者完整保留派生计数状态。

<a id="cpp-34"></a>

#### CPP-34 virtual、override、final 与虚表机制

- 先修：[CPP-33](#cpp-33)
- 层级：进阶专题（核心进阶）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：虚函数在运行期到底靠什么找到正确的派生实现，代价又是什么？
- 小节：
  1. 拆解对象头部的 `vptr` 与类静态 `vtable` 内存布局及一次间接寻址代价。
  2. 用 `override` 让编译器拦截签名拼写/const 不一致导致的意外隐藏。
  3. 用 `final` 封禁后续重写或继承，辅助编译器去虚化与内联优化。
- 能力：准确评估 `virtual` 的空间与调用开销，杜绝无 `override` 的隐蔽重写 bug。
- 练习与预期：故意在派生类重写函数漏写 `const` 并加上 `override`，观察编译期立即给出明确报错。

<a id="cpp-35"></a>

#### CPP-35 多态基类的虚析构函数必要性

- 先修：[CPP-34](#cpp-34)
- 层级：核心应用（核心）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：通过 `Base*` 删除派生类对象时，基类析构不加 `virtual` 为什么属于未定义行为？
- 小节：
  1. 对照非虚析构仅触发基类清理与虚析构沿着虚表逐层逆序析构的差异。
  2. 落实基类析构二选一铁律：`public virtual ~Base()` 或 `protected ~Base()`。
  3. 识别用户显式声明虚析构对默认移动操作生成的抑制效应。
- 能力：一眼查出继承层次中缺失虚析构的资源泄漏与 UB 隐患。
- 练习与预期：用 `std::unique_ptr<ISink>` 持有带资源成员的 `ConsoleSink`，离开作用域时核对派生与基类析构均按逆序执行。

<a id="cpp-36"></a>

#### CPP-36 纯虚接口与 CRTP 静态多态

- 先修：[CPP-34](#cpp-34)、[CPP-35](#cpp-35)
- 层级：进阶专题（进阶）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：既要定义统一行为模板，又不想承担虚表指针与无法内联的开销，该怎么办？
- 小节：
  1. 用纯虚函数 `= 0` 与禁用拷贝构建纯抽象接口类（Interface）。
  2. 用 CRTP（`class Derived : public Base<Derived>`）实现编译期静态多态绑定。
  3. 按异构容器需求与热路径内联需求对比动态多态与静态多态选型。
- 能力：为常规扩展点写纯虚接口，在性能敏感且类型封闭的热路径应用 CRTP。
- 练习与预期：实现 `MetricBase<CpuMetric>` CRTP 基类并验证零 `vptr`（`sizeof(CpuMetric) == 1` 空基类优化）。

<a id="cpp-37"></a>

#### CPP-37 四大 C++ 类型转换与 RTTI

- 先修：[CPP-20](#cpp-20)、[CPP-34](#cpp-34)
- 层级：核心应用（核心）
- 状态：已有[面向对象与多态深解正文](../../src/content/handbook/cpp-oop-polymorphism.md)。
- 问题：为什么必须告别 `(T)x` C 式强转，`static_cast` 与 `dynamic_cast` 的安全边界又在哪？
- 小节：
  1. 划定 `static_cast`、`const_cast`、`reinterpret_cast` 各自唯一合法职责与 UB 红线。
  2. 使用 `dynamic_cast` 依赖 RTTI 安全向下转型，分别处理指针 `nullptr` 与引用 `std::bad_cast`。
  3. 了解 `typeid`、`-fno-rtti` 限制，以及用 C++20 `std::bit_cast` 替代位级 `reinterpret_cast`。
- 能力：精准选用具名转换，识别并消除违反 Strict Aliasing 的 `reinterpret_cast`。
- 练习与预期：用 `dynamic_cast<ConsoleSink*>(base_ptr)` 提取派生计数，对不匹配派生指针验证返回 `nullptr`。

## 第六篇 存储模型、智能指针与自定义内存

### 模块十一 存储期、独占封装与共享控制块

- 入口：完成 CPP-10 与 CPP-35，能区分栈对象与堆对象寿命。
- 能力：理清四大存储期与初始化顺序，熟练使用 `make_*`、无状态 C 句柄删除器并守住 `shared_ptr` 线程安全边界。
- 检验：通过 `static_assert` 核对无状态删除器零体积开销与并发读写界限。

<a id="cpp-38"></a>

#### CPP-38 栈、堆、静态存储期与初始化顺序灾难

- 先修：[CPP-09](#cpp-09)、[CPP-27](#cpp-27)
- 层级：进阶专题（核心进阶）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：为什么跨 `.cpp` 文件依赖全局对象时，程序甚至可能在进入 `main` 之前就崩溃？
- 小节：
  1. 对比自动/动态/静态/`thread_local` 四大存储期的分配代价与寿命边界。
  2. 剖析跨翻译单元静态初始化顺序灾难（SIOF）的成因。
  3. 用函数局部 `static`（Meyers 单例）与 `constinit` 彻底根除 SIOF。
- 能力：合理规划对象存储位置，写出线程安全且无启动顺序依赖的单例/全局状态。
- 练习与预期：将全局依赖改造成函数内 `static` 懒加载实例，确保首次访问即已完成构造。

<a id="cpp-39"></a>

#### CPP-39 make_unique 与 make_shared 的异常安全与单块优化

- 先修：[CPP-10](#cpp-10)、[CPP-14](#cpp-14)
- 层级：核心应用（核心）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：除了少敲几个字，`std::make_shared` 在异常安全和内存分配次数上到底赢在哪里？
- 小节：
  1. 复盘 `f(shared_ptr<A>(new A), may_throw())` 求值交错泄露与 `make_*` 的防御机制。
  2. 对比 `make_shared` 对象+控制块单次连续分配与两次独立 `new` 的布局差异。
  3. 识别 `make_shared` 无法配自定义删除器及 `weak_ptr` 延迟大块物理释放的局限。
- 能力：默认使用 `make_unique`/`make_shared`，并能指出大对象配合 `weak_ptr` 的例外情形。
- 练习与预期：用 `make_shared` 构造对象后分别查看强弱计数，核对对象销毁与整块回收时机。

<a id="cpp-40"></a>

#### CPP-40 unique_ptr 自定义删除器封装 C 资源句柄

- 先修：[CPP-10](#cpp-10)、[CPP-39](#cpp-39)
- 层级：核心应用（核心）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：如何零额外内存开销地把 `FILE*`、`malloc` 块或数据库句柄纳入 `unique_ptr` 自动管理？
- 小节：
  1. 为 `unique_ptr<T, Deleter>` 编写无状态函数对象删除器包装 `std::fclose` 等 C API。
  2. 对比函数指针删除器体积翻倍与无状态仿函数借助 EBO 保持 8 字节零开销。
  3. 明确 `unique_ptr` 对空指针保护及非指针整数句柄的封装思路。
- 能力：为任意 C 语言第三方库句柄写出零成本 RAII 别名或轻量包装。
- 练习与预期：定义 `UniqueFile`，用 `static_assert(sizeof(UniqueFile) == sizeof(std::FILE*))` 验收零体积开销。

<a id="cpp-41"></a>

#### CPP-41 shared_ptr 控制块与线程安全边界

- 先修：[CPP-39](#cpp-39)
- 层级：进阶专题（核心进阶）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：为什么同一裸指针不能交给两个 `shared_ptr`，而 `shared_ptr` 的线程安全又到底保到哪一层？
- 小节：
  1. 剖析 `shared_ptr` 双指针结构与控制块内的原子 `use_count`/`weak_count`。
  2. 识别双控制块 Double-Free 崩溃与禁止重复包裹裸指针的铁律。
  3. 划清三层并发边界：计数原子安全 vs 同变量读写竞争（需锁或 `atomic<shared_ptr>`）vs 宿主数据互斥。
- 能力：准确判别并发代码中 `shared_ptr` 操作是否安全，防止误以为“全自动线程安全”。
- 练习与预期：列出多线程并发拷贝不同 `shared_ptr` 副本与并发改写同一全局 `shared_ptr` 的安全结论与修法。

### 模块十二 环引用破局、自共享与自定义分配器

- 入口：完成模块十一，理解控制块计数机制。
- 能力：用 `weak_ptr` 破解双向环引用、安全实现自共享回调，并用 `placement new` 与 `pmr` 管理预分配内存。
- 检验：验证双向树节点作用域退出时正常析构，以及 `placement new` 对象按预期析构。

<a id="cpp-42"></a>

#### CPP-42 weak_ptr 打破循环引用与原子 .lock()

- 先修：[CPP-41](#cpp-41)
- 层级：核心应用（核心）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：父子节点互持 `shared_ptr` 为何永远释放不掉，提升 `weak_ptr` 又为何禁用先判 `expired()`？
- 小节：
  1. 图解双向 `shared_ptr` 互相锁死导致 `use_count` 永不归零的内存泄漏。
  2. 在回指/观察端使用 `weak_ptr`，区分强计数归零析构对象与弱计数控制块延寿。
  3. 用原子 `.lock()` 提升为局部 `shared_ptr` 并判空，彻底消除 TOCTOU 竞态。
- 能力：在图结构、树父指针与观察者缓存中正确选用 `weak_ptr` 与 `.lock()`。
- 练习与预期：构建父持子 `shared_ptr`、子持父 `weak_ptr` 的双节点结构，离开作用域后两个析构日志均正常输出。

<a id="cpp-43"></a>

#### CPP-43 enable_shared_from_this 与观察者陷阱

- 先修：[CPP-41](#cpp-41)、[CPP-42](#cpp-42)
- 层级：进阶专题（核心进阶）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：成员函数需要把“自己的 `shared_ptr`”交给异步回调时，为什么直接写 `shared_ptr(this)` 会炸？
- 小节：
  1. 理解继承 `std::enable_shared_from_this<T>` 内部挂载隐藏 `weak_this_` 的机制。
  2. 避开两大禁区：构造函数内禁止调用、栈对象/非 `shared_ptr` 托管对象调用抛 `bad_weak_ptr`。
  3. 用私有构造函数 + `static create()` 工厂从设计源头封死错误用法。
- 能力：为异步会话/观察者类安全提供 `shared_from_this()` 与 `weak_from_this()`。
- 练习与预期：实现 `Node::create` 与 `attach_child`，验证通过 `weak_from_this()` 关联父节点且 `use_count` 准确。

<a id="cpp-44"></a>

#### CPP-44 Arena 分配器、对象池与 placement new

- 先修：[CPP-38](#cpp-38)
- 层级：进阶专题（进阶）
- 状态：已有[内存与智能指针进阶正文](../../src/content/handbook/cpp-smart-memory.md)。
- 问题：高频小对象如何跳过系统 `malloc/free`，在预留缓冲上原地构造与批量回收？
- 小节：
  1. 用 `alignas(T)` 原始缓冲区配合 `placement new` 分离内存分配与对象构造。
  2. 牢记 `placement new` 对象必须手动调用 `ptr->~T()`，严禁 `delete`。
  3. 对比线性 Arena 思路与 C++17 `std::pmr::monotonic_buffer_resource` 零侵入替换容器分配器。
- 能力：在高性能解析或批处理路径应用 `pmr` 或 `placement new` 消除碎片与频繁堆分配。
- 练习与预期：在 `alignas(Item)` 栈缓冲用 `placement new` 构造并显式析构，再用 `pmr::vector` 配合 `null_memory_resource` 验证零堆分配。

## 第七篇 现代模板、代数类型与 C++20 工程设施

### 模块十三 折叠表达式、约束演进与类型萃取

- 入口：完成 CPP-15，掌握基本函数模板与 Concepts 语法。
- 能力：编写任意参数个数的折叠模板、用 `if constexpr` 与 `requires` 简化多态逻辑，并正确应用类型萃取与完美转发返回。
- 检验：验证折叠边界、编译期分支裁剪与 `decltype(auto)` 返回引用保留。

<a id="cpp-45"></a>

#### CPP-45 可变参数模板与 C++17 折叠表达式

- 先修：[CPP-15](#cpp-15)
- 层级：进阶专题（核心进阶）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：怎样告别冗长的模板递归终止函数，一行写出支持任意个参数的求和与日志打印？
- 小节：
  1. 掌握参数包 `typename... Args`、`sizeof...(Args)` 与完美转发展开 `std::forward<Args>(args)...`。
  2. 区分一元/二元左折与右折表达形式及空参数包默认值规则。
  3. 用逗号折叠表达式 `((expr), ...)` 顺序执行多参数副作用。
- 能力：实现类型安全的任意参数日志器、工厂包装与编译期聚合函数。
- 练习与预期：实现 `sum_fold(1, 2, 3, 4)` 得 `10`、`sum_fold()` 得 `0`，并实现 `all_true()` 返回 `true`。

<a id="cpp-46"></a>

#### CPP-46 SFINAE、if constexpr 与 requires 约束演进

- 先修：[CPP-15](#cpp-15)、[CPP-45](#cpp-45)
- 层级：进阶专题（核心进阶）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：让模板根据类型走不同实现，现代 C++ 为什么用 `if constexpr` 和 `requires` 淘汰了 `enable_if`？
- 小节：
  1. 理解 C++11 SFINAE + `std::enable_if_t` 淘汰重载候选的原理与诊断痛点。
  2. 用 C++17 `if constexpr` 在函数体内部做编译期分支裁剪（丢弃分支不触发类型错误）。
  3. 用 C++20 `requires` 声明式约束重载，实现清晰诊断与最严格约束自动消歧。
- 能力：读懂旧代码里的 `enable_if`，在新代码中熟练运用 `if constexpr` 与 `requires`。
- 练习与预期：编写单个 `to_label` 模板函数同时兼容 `int` 与 `std::string_view`，核对输出 `num:42` 与 `str:ok`。

<a id="cpp-47"></a>

#### CPP-47 类型萃取、std::decay_t 与 decltype(auto)

- 先修：[CPP-15](#cpp-15)、[CPP-46](#cpp-46)
- 层级：进阶专题（进阶）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：泛型包装器返回内部函数结果时，怎样精确保留值或引用语义而不把引用悄悄拷贝掉？
- 小节：
  1. 运用 `<type_traits>` 的 `_v`/`_t` 别名查询与变换类型（`is_same_v`、`decay_t`、`remove_cvref_t`）。
  2. 区分 `auto`、`decltype(x)` 与带括号 `decltype((x))` 变左值引用的关键差异。
  3. 用 `decltype(auto)` 为通用转发包装器保留原汁原味的返回值类别。
- 能力：在模板底层工具中正确剥离修饰符与完美回传引用语义。
- 练习与预期：通过 `decltype(auto) first_elem(Container& c)` 返回元素引用并执行 `first_elem(nums) = 99`，核对原容器首元素被修改。

### 模块十四 和类型、标准工具库与模块化演进

- 入口：完成 CPP-14 与模块十三，能设计多分支错误边界。
- 能力：用 `optional`/`variant`/`expected` 表达代数状态，并熟练运用 `<filesystem>`、`<random>`、Modules 与 `source_location`。
- 检验：跑通 `std::visit` 穷举匹配、路径拆解、固定种子随机复现与无宏调用点日志。

<a id="cpp-48"></a>

#### CPP-48 optional、variant 与 std::visit 模式匹配

- 先修：[CPP-14](#cpp-14)、[CPP-45](#cpp-45)
- 层级：核心应用（核心）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：怎样彻底告别裸 `union` 读错活跃字段的 UB，用编译器保证不漏掉任何一种状态分支？
- 小节：
  1. 掌握 `std::optional<T>` 缺值契约与不支持直接存引用的边界。
  2. 用 `std::variant<Ts...>`、`std::monostate` 与 `std::get_if` 构建类型安全互斥状态。
  3. 用 `std::visit` 配合 `overloaded{...}` 惯用法实现编译期穷举模式匹配。
- 能力：用和类型清晰建模状态机、AST 节点与异构配置项。
- 练习与预期：用 `std::variant<int, std::string>` 配合 `overloaded` 访问器分发处理并打印对应分支结果。

<a id="cpp-49"></a>

#### CPP-49 std::any 与 expected 风格错误模型

- 先修：[CPP-14](#cpp-14)、[CPP-48](#cpp-48)
- 层级：进阶专题（核心进阶）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：开放型任意值容器 `std::any` 与封闭型 `std::variant` 如何取舍，又怎样用 `expected` 风格返回错误细节？
- 小节：
  1. 对比 `std::any`（开放类型擦除 + SBO/堆开销）与 `std::variant`（封闭零堆开销）选型。
  2. 基于 `std::variant<T, E>` 表达 C++23 `std::expected<T, E>` 风格“成功值或结构化错误”。
  3. 制定“异常 vs 显式错误返回值”在库接口边界与热路径的工程取舍准则。
- 能力：为解析器与系统边界设计零异常且携带丰富诊断上下文的返回值类型。
- 练习与预期：调用 `parse_port("9999")` 返回包含原因文本的错误分支并输出诊断信息。

<a id="cpp-50"></a>

#### CPP-50 std::filesystem 跨平台路径与文件探测

- 先修：[CPP-07](#cpp-07)、[CPP-14](#cpp-14)
- 层级：核心应用（核心）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：如何告别手写 `/` 与 `\` 路径拼接，并在文件缺失时避免不必要的异常开销？
- 小节：
  1. 用 `fs::path` 与 `operator/` 跨平台拼接路径，用 `.stem()`、`.extension()` 等拆解名称。
  2. 使用 `directory_iterator` 与 `recursive_directory_iterator` 遍历目录树。
  3. 优先选用带 `std::error_code` 的非抛异常重载，掌握临时文件 + `fs::rename` 原子替换思路。
- 能力：写出在 Windows 与 Linux 下行为完全一致的目录扫描与路径处理代码。
- 练习与预期：拼接 `var / log / scan.txt`，分别提取并验证 `stem` 为 `scan`、`extension` 为 `.txt`。

<a id="cpp-51"></a>

#### CPP-51 std::random 引擎与分布解耦架构

- 先修：[CPP-03](#cpp-03)、[CPP-20](#cpp-20)
- 层级：核心应用（核心）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)。
- 问题：为什么现代 C++ 严禁写 `std::rand() % N`，`<random>` 又为何把引擎与分布拆开？
- 小节：
  1. 分析 `rand() % N` 的取模偏差、低位质量差与全局状态并发隐患。
  2. 掌握 `std::random_device` 播种、`std::mt19937` 长寿命引擎与固定种子单元测试复现。
  3. 区分 `uniform_int_distribution`（闭区间）与 `uniform_real_distribution`（半开区间）及 `std::shuffle`。
- 能力：实现均匀无偏、线程独立且支持固定种子回放的随机采样与洗牌。
- 练习与预期：用固定种子 `42u` 初始化 `std::mt19937` 进行掷骰子与 `std::shuffle`，多次运行输出完全一致。

<a id="cpp-52"></a>

#### CPP-52 C++20 Modules 工程化与 std::source_location

- 先修：[CPP-02](#cpp-02)、[CPP-06](#cpp-06)
- 层级：进阶专题（进阶）
- 状态：已有[现代模板与工程设施正文](../../src/content/handbook/cpp-modern-templates.md)与[头文件、翻译单元与命名空间正文](../../src/content/handbook/cpp-headers-modules.md)。
- 问题：C++20 Modules 如何彻底解决 `#include` 重复解析与宏污染，又该如何无宏获取调用点文件名和行号？
- 小节：
  1. 理解 `export module`、`module;` 全局片段与 `import` 消除宏泄漏和加速编译的机制。
  2. 客观评估 CMake 3.28+ `FILE_SET CXX_MODULES` 与传统 `.hpp/.cpp` 在当前跨平台生态中的选用时机。
  3. 用默认参数 `std::source_location::current()` 彻底替代 `__FILE__`/`__LINE__` 宏污染。
- 能力：在日志/断言体系中落地零宏 `source_location`，并能读懂与评估 C++20 模块接口单元。
- 练习与预期：实现带默认 `std::source_location` 参数的 `diag()` 函数，打印调用点真实文件名与行号。

## 项目里程碑

| 里程碑 | 状态与学科衔接 | 验收证据 |
| --- | --- | --- |
| v0 单文件统计 | 已发布，完成 CPP-12 后做 [单文件实验](../../src/content/labs/logscan.md)。 | 样本计数、标准输出、标准错误及退出码。 |
| v0.1 多文件工程 | 已发布，跨读 ENG-04 和 [CLI 测试正文](../../src/content/handbook/cli-testing.md)，复用 [v0.1 参考工程](../../src/content/labs/logscan-build.md)。可在 v0 后立即动手。 | 从干净目录构建，复用 v0 样本，保存 CTest 结果。 |
| v1 多文件聚合 | 已发布，复用解析库与 CPP-13 至 CPP-18 的接口、错误策略、聚合及诊断，见 [v1 多文件实验](../../src/content/labs/logscan-v1.md)和[参考源码](../../public/examples/logscan-v1.cpp)。 | 固定报告顺序，对照输入重排、空文件、坏行和缺失文件。 |
| v2 本地归档 | 已发布，复用 v1 记录契约，见 [v2 归档实验](../../src/content/labs/logscan-v2.md)与 [SQLite 正文](../../src/content/handbook/storage-sqlite.md)。 | 本地批量导入、索引计划对照、可重复查询及失败回滚证据。 |
| v3 TCP 服务 | 已发布，见 [v3 服务实验](../../src/content/labs/logscan-service.md)，含[分帧](../../public/examples/network-framing.cpp)和[队列](../../public/examples/concurrency-queue.cpp)单项源码。 | 核对半帧、队列满、关闭排空与归档故障，保存可重跑记录。 |

