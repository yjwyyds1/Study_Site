# 从零开始的默认路线

[回课程总览](../course-outline.md) · [实验与验收](logscan.md) · [覆盖矩阵](coverage.md)

章节编号指向学科目录里的写作设计，已有正文会在章节下给出链接。项目门槛只收录实际用到的知识。计划段可以按验收契约自行实现，跟读教材的读者在缺正文时可停在已发布的节点。

## 第一天

1. **选择一个终端。** Windows 打开 PowerShell，按 [Windows 环境课](../../src/content/handbook/cpp-setup.md)安装或配置 MinGW（也可使用 CLion 附带的工具）。Linux 直接打开终端，Windows 想使用 Linux 则按 [仓库运行说明](../../README.md#第一天)配置 Ubuntu/WSL，在 Ubuntu 终端输入 Linux 命令。Ubuntu 可用 `sudo apt install build-essential cmake ninja-build git gdb`（先 `sudo apt update`）。运行 `g++ --version` 确认当前终端能找到编译器。
2. **找到工作目录。** 工作目录是当前终端用来解析相对路径的位置。将 [最小程序](../../public/examples/hello-minimal.cpp) 保存为 `hello-minimal.cpp`，在练习目录打开终端，PowerShell 用 `Get-Location` 和 `Get-ChildItem`，Linux 用 `pwd` 和 `ls`，确认看到该文件。第一次可直接读 Markdown。要启动站点，按 [README 的运行步骤](../../README.md#运行)另开终端。
3. **构建并运行。** 构建把源码变成可调用的程序。PowerShell 用 `g++ -std=c++20 hello-minimal.cpp -o hello.exe` 后运行 `./hello.exe`，Linux 则以 `-o hello` 构建，运行 `./hello`。两者应输出 `LogScan ready`，退出状态 0（PowerShell 立即看 `$LASTEXITCODE`，Linux 看 `$?`）。把字符串改一个词，重新构建并核对输出。
4. **排查。** 找不到 `g++` 回 CPP-01 看安装和 PATH（终端搜索程序的目录列表）。找不到源文件回 ENG-01 查当前位置和扩展名。删除分号再构建，编译应失败，恢复后重新构建。失败时记下第一条诊断，构建成功后再运行产物，避免看到上一次编译的程序。

## S0 从最小程序到 v0

**进入条件** 能打开终端并把文件保存到练习目录。**必学**按编号链接顺序读，做每章最小练习，再按 E0 的输入覆盖正常、空文件、坏行与缺失文件。

- [CPP-01](cpp.md#cpp-01) → [ENG-01](engineering.md#eng-01) → [CPP-02](cpp.md#cpp-02) → [ENG-02](engineering.md#eng-02)。
- [CPP-03](cpp.md#cpp-03) → [CPP-04](cpp.md#cpp-04) → [CPP-05](cpp.md#cpp-05) → [CPP-06](cpp.md#cpp-06) → [CPP-07](cpp.md#cpp-07)。
- [CPP-08](cpp.md#cpp-08) → [CPP-09](cpp.md#cpp-09) → [CPP-10](cpp.md#cpp-10) → [CPP-11](cpp.md#cpp-11) → [CPP-12](cpp.md#cpp-12) → [E0](logscan.md#e0-单文件日志统计--已有实验)。

CPP-08 等待独立正文。本阶段先在 [CPP-06 已有正文](../../src/content/handbook/cpp-functions.md)执行值传递和引用传递对照，再打开 [CPP-09 已有正文](../../src/content/handbook/lifetime.md)看引用、指针和对象的关系。引用是已有对象的别名，指针可存地址也可为空，`const T&` 限制通过这个引用修改对象。用 `const int& alias = count;` 替换示例中的可写引用并尝试通过它赋值，编译应失败。恢复后让原变量自增，观察别名读到新值。

CPP-11 到 CPP-12 会改变分类契约。用三行夹具 `INFO`、空行和 `ERROR:` 分别预测结果。分类器依次显示 `OTHER`、`EMPTY`、`OTHER`；v0 统计 INFO 1、UNKNOWN 1，空行跳过。两份程序分别核对，测试名称注明使用哪套规则。

先用 `std::string` 实现，再解释参考代码的 `std::string_view` 借用范围。**产物**单文件程序、四组输入与输出记录。**通过**能从源码重建，四项计数与错误输出、退出状态符合 E0；能指出读到下一行后为何不能继续依赖旧视图。提前已有基础者从空文件写出分类器，交同样证据可快进。复杂度与算法完整课程延后。

## S1 多文件 v0.1 与聚合 v1

**进入条件** E0 四类输入通过。必学 [ENG-03](engineering.md#eng-03) → [ENG-04](engineering.md#eng-04) → [ENG-05](engineering.md#eng-05) → [ENG-06](engineering.md#eng-06)，进入 [v0.1 正文](../../src/content/labs/logscan-build.md)。运行 `cmake --version`、`ninja --version`，找不到就看实验正文的 CLion 附带工具路径。CTest 是 CMake 配套的测试运行器。先跑参考工程自带的 5 项，再用 E0 的四组文件做额外对照，并用一次人为故障练测试和定位。

**产物与通过**独立构建目录、测试结果和一次失败修复记录。先通过 E01 再做 E1。E01 保持原契约，E1 增加多输入与确定顺序，并交一次 Linux 干净构建和自动回归。具备经验者可直接交“拆、测、改坏、修回”的完整记录。Top-K 及进阶泛型按需查。

**E1 必学** [CPP-13](cpp.md#cpp-13) → [CPP-14](cpp.md#cpp-14) → [CPP-16](cpp.md#cpp-16) → [ENG-09](engineering.md#eng-09) → [ENG-11](engineering.md#eng-11)。从 [ALG-01](algorithms.md#alg-01) → [ALG-02](algorithms.md#alg-02) → [ALG-05](algorithms.md#alg-05) → [ALG-06](algorithms.md#alg-06) → [ALG-07](algorithms.md#alg-07) 可补到 [ALG-16 Top-K](algorithms.md#alg-16)。四种固定日志级别直接维护四项计数，遇到动态键或排名时再比较哈希与堆。

## S2 Linux I/O 与 v2 归档

**进入条件** E1 通过，Linux 终端可用。**产物与通过**按 E2 交进程／文件证据、SQLite 导入与查询、索引前后计划和一次可重跑的事务回滚。用参数绑定处理含引号数据。能用既有工程重现同组结果者可跳过对应讲解。WAL 和崩溃恢复作为加深练习。

1. [OS-01](os.md#os-01) → [OS-09](os.md#os-09) → [OS-10](os.md#os-10) 先建立调用与描述符模型。
2. [LNX-01](linux.md#lnx-01) → [LNX-02](linux.md#lnx-02) → [LNX-03](linux.md#lnx-03) → [LNX-04](linux.md#lnx-04) → [LNX-05](linux.md#lnx-05) → [LNX-06](linux.md#lnx-06) → [LNX-07](linux.md#lnx-07) 实际查看文件、进程和 I/O。
3. [ENG-10](engineering.md#eng-10) 配置 SQLite 依赖，再读 [DB-01](storage.md#db-01) → [DB-02](storage.md#db-02) → [DB-04](storage.md#db-04) → [DB-05](storage.md#db-05) → [DB-06](storage.md#db-06) → [DB-07](storage.md#db-07) → [DB-08](storage.md#db-08) → [DB-09](storage.md#db-09)。先跑 DB-05 的已有 SQLite 示例，再把解析接到归档。

## S3 v3 本机 TCP 服务

**进入条件** E2 通过，能解释一次回滚。**产物与通过** E3a 到 E3e 依次通过，交本机运行、失败路径、关闭和测量记录。先独立验证分帧，再引入队列与真实连接。部署、TLS 与更复杂的就绪接口进入方向路线时深化。

1. [MACH-01](machine.md#mach-01) → [MACH-03](machine.md#mach-03) → [MACH-04](machine.md#mach-04) 手算四字节帧头。先按 E3a 做内存中的切块实验。[NET-01](network.md#net-01) → [NET-02](network.md#net-02) → [NET-04](network.md#net-04) → [NET-05](network.md#net-05) → [NET-06](network.md#net-06) → [NET-07](network.md#net-07) → [NET-08](network.md#net-08) 再把分帧接入本机连接。NET-03 DNS 按需查。
2. [CON-01](concurrency.md#con-01) → [CON-02](concurrency.md#con-02) → [CON-03](concurrency.md#con-03) → [CON-04](concurrency.md#con-04) → [CON-05](concurrency.md#con-05) → [CON-06](concurrency.md#con-06) → [CON-07](concurrency.md#con-07) 先单独验证队列，完成 E3b。
3. [NET-11](network.md#net-11) 合流，完成 E3c、E3d。[CON-10](concurrency.md#con-10) → [CON-11](concurrency.md#con-11) 完成 E3e。复用现成作品快进时也需提交这些固定输入的失败与关闭证据。CON-08/09、CON-12 和系统级观测留作加深。

## S4 方向作品

从[方向选修](tracks.md)选一条。Linux 服务端和基础设施／性能从 E3 延伸，Qt 可从 E1 分支，嵌入式可从 E1 分支并补机器层。按每条方向的实际先修和验收交付构建说明、正常与失败路径及复现记录，用 [最终验收](logscan.md#方向作品与最终验收)收尾。

| 方向 | 入场补修与章节顺序 | 可交付证据 |
| --- | --- | --- |
| Linux 服务端 | E3；补 [LNX-08](linux.md#lnx-08) → [LNX-09](linux.md#lnx-09)、[LNX-11](linux.md#lnx-11) → [LNX-12](linux.md#lnx-12)；[TRK-01](tracks.md#trk-01) → [TRK-02](tracks.md#trk-02) → [TRK-03](tracks.md#trk-03) | systemd 用户服务、超时与过载记录、停止排空与旧版本回退 |
| 基础设施与性能 | E3；补 [CON-12](concurrency.md#con-12)；[TRK-04](tracks.md#trk-04) → [TRK-05](tracks.md#trk-05) → [TRK-06](tracks.md#trk-06) | 固定负载原始样本、剖析前后业务结果、回归脚本与失效阈值 |
| Qt 桌面 | E1；[TRK-07](tracks.md#trk-07) → [TRK-08](tracks.md#trk-08) → [TRK-09](tracks.md#trk-09) | 可启动查看器、有效与缺失输入截图或测试、取消后状态和打包说明 |
| 嵌入式 | E1；补 [MACH-01](machine.md#mach-01) → [MACH-03](machine.md#mach-03) → [MACH-04](machine.md#mach-04) → [MACH-05](machine.md#mach-05)；[TRK-10](tracks.md#trk-10) → [TRK-11](tracks.md#trk-11) → [TRK-12](tracks.md#trk-12) | 固件或模拟回放、链接映射、环形缓冲溢出计数与时序记录 |
