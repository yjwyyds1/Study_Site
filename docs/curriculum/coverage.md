# 知识与证据覆盖矩阵

[学科目录](../course-outline.md) · [默认路线](route.md) · [里程碑](logscan.md)

表内给出主讲入口与最小证据。章节的状态栏区分已有、部分覆盖和待编写。这里的结果是学习验收要求，当前实测见[审校报告](audit.md)。

| 知识 | 主讲 | 最小练习与可见证据 |
| --- | --- | --- |
| C++20 环境、最小程序 | [CPP-01](cpp.md#cpp-01)、[CPP-02](cpp.md#cpp-02) | 从练习目录重编译，改字符串后看到新输出 |
| 类型与初始化、控制流、函数 | [CPP-03](cpp.md#cpp-03)、[CPP-04](cpp.md#cpp-04)、[CPP-06](cpp.md#cpp-06) | 对照整数除法、空输入和值／引用传参，记录预测与输出 |
| 结构、文件、逐行处理 | [CPP-07](cpp.md#cpp-07)、[CPP-11](cpp.md#cpp-11) | 空行与 EOF 行为不同，缺文件有独立退出码 |
| 指针、引用、const、作用域与生命周期 | [CPP-08](cpp.md#cpp-08)、[CPP-09](cpp.md#cpp-09) | 标出所有者与借用失效点，复制后内容仍可读取 |
| RAII、类接口、值语义、复制移动 | [CPP-10](cpp.md#cpp-10)、[CPP-13](cpp.md#cpp-13) | 提前返回时析构；副本修改独立；移动资源仍只释放一次 |
| 错误处理与 UB | [CPP-14](cpp.md#cpp-14)、[CPP-18](cpp.md#cpp-18) | 通过失败用例区分错误边界，解释诊断器覆盖范围 |
| 泛型、容器、迭代器与 Ranges | [CPP-15](cpp.md#cpp-15)、[CPP-16](cpp.md#cpp-16)、[CPP-17](cpp.md#cpp-17) | 不合约束的参数编译失败，合法版本与直接循环同结果 |
| 终端、路径、编译、链接与 Git | [ENG-01](engineering.md#eng-01) 到 [ENG-03](engineering.md#eng-03) | 记录 cwd、目标文件与链接诊断，比较工作区和暂存区 |
| CMake、回归和调试 | [ENG-04](engineering.md#eng-04) 到 [ENG-06](engineering.md#eng-06) | E01 干净构建，故意移动错误输出，看到测试失败并修回 |
| 静态分析与 Sanitizer | [ENG-07](engineering.md#eng-07)、[ENG-08](engineering.md#eng-08) | 在隔离样例收集诊断，修复后复测并标注未覆盖路径 |
| 配置、依赖、CI 与发布 | [ENG-09](engineering.md#eng-09) 到 [ENG-12](engineering.md#eng-12) | 从干净环境构建测试，从临时安装前缀启动同一 CLI |
| 复杂度、顺序／链式结构、栈与队列 | [ALG-01](algorithms.md#alg-01) 到 [ALG-04](algorithms.md#alg-04) | 记操作次数，比较小型自实现与标准库，解释取舍 |
| 哈希、堆、排序和二分 | [ALG-05](algorithms.md#alg-05) 到 [ALG-08](algorithms.md#alg-08) | 保留同频测试和端点测试，Top-K 与全排序对照 |
| 树图、递归、分治、回溯、贪心与 DP | [ALG-09](algorithms.md#alg-09) 到 [ALG-15](algorithms.md#alg-15) | 树图遍历访问轨迹，穷举小输入校验优化方法 |
| 数据表示、字节序、对齐与对象布局 | [MACH-01](machine.md#mach-01) 到 [MACH-06](machine.md#mach-06) | 字节转储核对帧长，实测本平台布局并声明适用范围 |
| 指令、寄存器、调用、ABI 与 SIMD | [MACH-07](machine.md#mach-07) 到 [MACH-12](machine.md#mach-12) | 标出参数与返回寄存器，向量化报告、尾元素及标量对照 |
| 调用、进程、线程、调度与死锁 | [OS-01](os.md#os-01) 到 [OS-06](os.md#os-06) | 画进程／线程资源表、阻塞状态和等待环 |
| 虚拟内存、文件、fd、页缓存、IPC 与 I/O | [OS-07](os.md#os-07) 到 [OS-13](os.md#os-13) | 对照共享偏移、最后写端关闭及就绪／完成的时间线 |
| Linux shell、权限、进程与追踪 | [LNX-01](linux.md#lnx-01) 到 [LNX-06](linux.md#lnx-06) | 带空格路径、权限失败、/proc 或 trace 显示打开路径 |
| Linux 系统调用、管道、信号、映射、epoll 与服务 | [LNX-07](linux.md#lnx-07) 到 [LNX-13](linux.md#lnx-13) | 复现管道 EOF、停止排空，以及无忙轮询的事件循环 |
| 网络分层、IP、DNS、TCP、UDP 与抓包 | [NET-01](network.md#net-01) 到 [NET-04](network.md#net-04) | 标记回环端点、TCP 状态或 UDP 数据报边界 |
| Socket、分帧、超时与连接管理 | [NET-05](network.md#net-05) 到 [NET-08](network.md#net-08)、[NET-11](network.md#net-11) | E3a/E3c 半帧、无效帧和健康连接对照 |
| HTTP 与 TLS | [NET-09](network.md#net-09)、[NET-10](network.md#net-10) | 对照复用连接和证书名错误，标注密文与明文观测位置 |
| 线程协作、数据竞争、互斥与条件变量 | [CON-01](concurrency.md#con-01) 到 [CON-04](concurrency.md#con-04) | 线程局部计数与归并一致，谓词为假时没有任务出队 |
| 有界队列、停止、背压、原子与内存序 | [CON-05](concurrency.md#con-05) 到 [CON-09](concurrency.md#con-09) | 固定容量反压、关闭唤醒；画出同步关系与观察保证 |
| 基准、吞吐、尾延迟和剖析 | [CON-10](concurrency.md#con-10) 到 [CON-12](concurrency.md#con-12) | 固定输入的独立三轮统计与一次优化的前后对照 |
| 文本／二进制格式与持久化 | [DB-01](storage.md#db-01) 到 [DB-03](storage.md#db-03)、[MACH-04](machine.md#mach-04) | 截断记录定位，区分程序完成与持久化完成 |
| SQLite、SQL、绑定、事务、索引与查询计划 | [DB-04](storage.md#db-04) 到 [DB-09](storage.md#db-09) | E2 绑定含引号值，索引前后结果等价，坏批次整体回滚 |
| WAL、恢复和备份 | [DB-10](storage.md#db-10) 到 [DB-12](storage.md#db-12) | 区分活动读快照、检查点和事务边界，重开库验证 |
| 方向作品交付 | [TRK-01](tracks.md#trk-01)、[TRK-04](tracks.md#trk-04)、[TRK-07](tracks.md#trk-07)、[TRK-10](tracks.md#trk-10) | 四方向各有独立入口和失败测试，任选一条交可复现作品 |
