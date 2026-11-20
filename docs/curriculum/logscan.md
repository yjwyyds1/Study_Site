# LogScan 实验与验收

[回课程总览](../course-outline.md) · [默认路线](route.md) · [走查报告](audit.md)

每次在独立练习目录保留源码版本、工具版本、命令、夹具、标准输出、标准错误与退出码。一次通过后再换输入或注入故障，修复后重跑原用例。表中 E 编号标识可复用的最小实验。计划项的结果是验收契约。

## E0 单文件日志统计 · 已有实验

[v0 实验正文](../../src/content/labs/logscan.md) · [参考源码](../../public/examples/logscan.cpp) · [Windows 回归脚本](../../tests/logscan.ps1)

在 C++20 编译器所在终端执行。Linux/WSL 下把参考文件复制到练习目录后运行：

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic logscan.cpp -o logscan
printf 'INFO ready\n  ERROR\nERROR:\n\n' > sample-four.log
: > empty.log
printf 'ERROR:' > malformed.log
./logscan sample-four.log
./logscan empty.log
./logscan malformed.log
./logscan absent.log > out.txt 2> err.txt
echo "$?"
```

确认 absent.log 不存在。正常夹具依次输出 `INFO 1`、`WARN 0`、`ERROR 1`、`UNKNOWN 1`；空文件四项都是 0；坏行夹具只有 UNKNOWN 为 1，三者退出 0。缺文件退出 1，标准输出为空，标准错误含路径。无参数和多参数退出 2。只改首词规则，先用 `ERROR:` 测试抓到回归，再恢复。

## E01 同一契约的多文件工程 · 已有实验

[v0.1 实验正文](../../src/content/labs/logscan-build.md) · [参考包](../../public/examples/logscan-build/reference.zip)

在练习目录解压参考包，CMake 3.20+、Ninja 和 C++20 编译器可用时运行：

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure
```

预期 5/5（一项核心单测，四项 CLI：成功、缺文件、无参数、多参数）。让缺文件诊断临时写到标准输出，CLI 回归应失败，用断点或最小输出定位，再恢复通过。换空构建目录重做，另用 E0 的四个文件夹具比对两版标准输出、标准错误与退出码。产物包含解析核心、命令行入口和 CTest 记录。

## E1 多文件聚合 · 已有实验

[v1 实验正文](../../src/content/labs/logscan-v1.md) · [参考源码](../../public/examples/logscan-v1.cpp)

基于 E01，Linux/Windows C++20/CMake/CTest。调用形式为 `logscan <file> [file ...]`，原 v0.1 多参数退出 2 的用例转为多文件成功用例，无参数仍退出 2。读入 E0 正常夹具和只含 `WARN slow` 的文件，汇总四项为 1/1/1/1，交换路径顺序仍输出同样四行。加入空文件，计数保持一致。加入缺失路径，整批失败，退出 1、标准输出为空、错误包含路径。用测试流在第二个文件读出首条后置 `badbit`，验证读取失败走相同的整批错误契约。CI 用干净目录验证。可选 Top-K 按词频降序和同频字典序排序，用全量排序当小规模对照。

## E2 Linux 归档与回滚 · 已有实验

[v2 实验正文](../../src/content/labs/logscan-v2.md) · [SQLite 正文](../../src/content/handbook/storage-sqlite.md)

WSL 或原生 Linux，C++20/CMake、SQLite 开发库。复用 E1 的输入解析，数据库放临时目录。观察一次 CLI 的输入路径、进程与文件描述符，并保存 trace 或可控阻塞时的 `/proc/<PID>/fd` 快照。

导入 ID 为 0 到 9999 的 10000 行，ID 可被 100 整除时用 ERROR，其余用 INFO。对同一参数化查询 `SELECT id FROM logs WHERE level = ? ORDER BY id` 比较建 `logs(level)` 索引前后的 `EXPLAIN QUERY PLAN`。两边均应返回 0、100、…、9900，计划记录扫描或索引查找的实际结果。固定 SQLite 版本和夹具，计划本身受统计信息和选择率影响。当优化器仍选扫描时，先检查数据分布、列类型和查询条件。

同一批先写一个有效的新 ID，再用已有主键触发错误。回滚后重开数据库，核对行数仍为 10000 且新 ID 不存在。查询包含引号的参数，检查它被当作数据处理。进程中止恢复用独立夹具和两个进程另测，记录 journal 模式与同步配置，回滚演示只证明事务失败处理。

## E3 有界 TCP 日志服务 · 已有实验

[v3 服务实验正文](../../src/content/labs/logscan-service.md) · [分帧示例](../../public/examples/network-framing.cpp) · [队列示例](../../public/examples/concurrency-queue.cpp)

Linux/WSL，绑定 `127.0.0.1`，C++20、线程和 SQLite，临时数据库。先用切块输入跑分帧，再上 Socket。书面明确帧头字节序、最大长度（练习取 4096 字节）、队列容量（取 2）、读超时（取 1 秒）、过载处理和关闭顺序。集成测试用同步点控制消费者暂停，固定输入顺序。

为每条测试消息分配唯一 ID。成功入队即「已接受」，用队列事件记录 ID；数据库提交后才发送成功确认，客户端收到确认才计入成功。背压是在消费跟不上时限制继续接收，排空是停止接收后处理所有已接受的任务。停止测试在消费者暂停时等到两个指定 ID 已入队，再停止和放开消费者，按 ID 核对。负载从客户端首次发送帧到收到确认计时，每轮独立计算百分位，成功、拒绝、超时、断连或其他失败的次数合计应等于发送尝试数。

| 实验 | 输入与操作 | 预期证据 |
| --- | --- | --- |
| E3a 分帧 | 同一帧拆成半头、半体和剩余字节，下一批连送两帧 | 未完整时零交付，完整后按顺序恰好交付三条 |
| E3b 防止积压 | 消费者暂停，提交三条，再解除暂停 | 队列深度最多 2，入口暂停或按约定拒绝，解堵后继续 |
| E3c 错误连接 | 连一半就断开、长度 4097、半帧超过超时 | 三条均无入库，有可区别的诊断，健康连接仍可用 |
| E3d 退出恢复 | 测试保留两条已接收任务时发出停止请求 | 停止接收，排空已接受任务，提交事务，线程汇合，重启查到恰好两条 |
| E3e 固定负载 | 相同夹具、连接数、预热、持续时间分别跑三轮 | 保存每轮请求与失败数、成功吞吐、p95/p99、峰值队列深度与 RSS。标明采样口径 |

## 方向作品与最终验收

任选[方向作品](tracks.md)。提交一页 README，声明工具版本、构建与测试命令、输入数据与输出契约、约束和失败策略。把可变参数记录到同一份实验表。请另一人在新的练习目录按 README 重建，跑一个正常和一个失败用例，变更一条输入并预测输出。如果无法复现，记录具体失败步骤，回到对应章节补修后重跑。讲解时须能用一次调试记录解释根因，并用对照证明一次设计选择。
