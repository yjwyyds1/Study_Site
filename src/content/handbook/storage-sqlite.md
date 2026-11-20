---
title: "SQLite 工程实战与本地持久化：C++20 RAII、WAL、FTS5 与崩溃契约"
description: "掌握嵌入式 SQLite 架构、STRICT 表与 CLI 元命令、C++20 RAII 封装 sqlite3_open_v2/prepare_v2/bind/step、单事务百倍批量加速、WAL 与 PRAGMA 调优、JSON1/FTS5、在线备份与 user_version 迁移，以及底层 fsync/原子替换/CRC32 持久化契约（DB-20 ~ DB-29）。"
order: 101
category: "存储与数据库"
tags: ["数据库", "SQLite", "C++20", "RAII", "WAL", "FTS5", "事务", "持久化"]
related: ["handbook/db-sql-design", "handbook/db-indexes-internals", "handbook/linux-process-io", "labs/logscan-v2", "labs/logscan-service"]
sources: []
---

## 本课只解决这 1 类问题

`LogScan` 如果每次查询“今天有哪些 `ERROR`”都把几个 GB 的原始文本从头扫一遍，延迟会达到秒级甚至分钟级。把结构化记录放进 **SQLite**——这个直接编译进 C++ 进程内、零运维部署的嵌入式单文件数据库——就能实现毫秒级检索、强外键约束与崩溃原子恢复。

但在真实 C++ 工程里，“调通一句 `INSERT`”离“生产可用”还差十万八千里：
- 为什么循环里插 1 万条要花 60 秒，包一个事务却只要 20 毫秒？
- 为什么 `sqlite3_open` 失败了也可能泄露内存？`SQLITE_STATIC` 何时会引发悬空指针？
- 为什么开启 WAL 后 `-wal` 文件越滚越大？为什么在线备份绝对不能直接 `cp app.db`？
- 脱离数据库内核时，C++ 代码如何靠 `fsync`、同目录原子替换和 CRC32 追加日志守住断电不丢的底线？

本课完整覆盖 `DB-20` ~ `DB-29`，既提供可直接 `g++ -lsqlite3` 编译运行的完整 C++20 代码模板，也打通从底层系统调用到上层嵌入式数据库引擎的完整工程链路。

> **环境准备（WSL2 Ubuntu / Linux）**：安装命令行工具与 C/C++ 开发头文件包：
> ```bash
> sudo apt update && sudo apt install -y sqlite3 libsqlite3-dev
> ```

---

## 一、嵌入式 SQLite vs 客户端/服务端 RDBMS (DB-20)

传统数据库（PostgreSQL / MySQL）是一个独立常驻进程（Server），你的 C++ 程序作为 Client 必须走 TCP/Unix Socket 发包、等待服务端线程池调度再回包；而 **SQLite 是一个直接链接进你程序里的 C 语言函数库（`libsqlite3`）**，你的进程自己直接读写磁盘上的 `.db` 文件。

```text
C/S 架构 (PostgreSQL / MySQL):
  [你的 C++ 进程] ──TCP 网络序列化/往返──▶ [mysqld / postgres 服务端进程] ──▶ [磁盘文件]

嵌入式架构 (SQLite):
  [你的 C++ 进程 (内置 libsqlite3.so)] ────直接函数调用 (微秒级，零 IPC)────▶ [logs.db]
```

| 对比维度 | SQLite（嵌入式库） | PostgreSQL / MySQL（C/S 服务端） |
| --- | --- | --- |
| **部署与通信开销** | 零配置单文件，函数调用纳秒/微秒级，无网络往返 | 需独立安装运维守护进程，跨进程网络通信毫秒级 |
| **并发写入模型** | **同一时刻全库仅允许 1 个写事务**（多读者可并发） | 行级锁 / MVCC 支持数千客户端高并发同时写不同行 |
| **适用场景** | 桌面/移动端本地存储、CLI/单机服务归档（如 `LogScan`）、边缘网关、CI 内存测试 | 多节点微服务共享中心库、高并发电商交易、TB 级集群 |
| **可靠性实力** | 极高（广泛用于飞机航电、浏览器、iOS/Android 内核，百万级测试用例） | 极高（配合主从复制、高可用集群） |

> **统一记录契约前置提醒（对应 `LogScan` 工程实践）**：无论日志进不进 SQLite，解析层和存储层必须先对齐同一份 `LogRecord` 结构体（剥离 `\r\n`、限制 `kMaxLineBytes`、校验显式 `version`、拒绝未知版本），详见本课第十节底层契约代码。

---

## 二、`STRICT` 严格表、类型亲和性与 `sqlite3` CLI 元命令 (DB-21)

### 1. 小心 SQLite 的历史“动态类型”暗坑：请用 `STRICT`！

传统 SQLite 采用**动态类型（Type Affinity，类型亲和性）**：你建表时写了 `age INTEGER`，别人竟然可以往里成功插入 `'twenty'` 这段文本而不报错！
从 **SQLite 3.37.0（2021 年末）** 开始，官方终于提供了建表关键字 **`STRICT`**——强制像 PostgreSQL / MySQL 一样严格检查列类型！

```sql
-- 推荐现代建表写法：末尾加上 STRICT！
CREATE TABLE IF NOT EXISTS batches (
    id         INTEGER PRIMARY KEY,
    batch_key  TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id   INTEGER NOT NULL,
    level      TEXT    NOT NULL CHECK (level IN ('INFO','WARN','ERROR','UNKNOWN')),
    latency_ms INTEGER,
    message    TEXT    NOT NULL,
    FOREIGN KEY(batch_id) REFERENCES batches(id)
) STRICT;

-- 测试：在 STRICT 表里往 INTEGER 列塞文本会立刻被拒绝！
-- INSERT INTO logs(batch_id, level, latency_ms, message) VALUES (1, 'INFO', 'abc', 'ok');
-- 报错: Runtime error: cannot store TEXT value in INTEGER column logs.latency_ms (19)
```

> **`STRICT` 表允许的 6 种合法类型名**：`INT`、`INTEGER`、`REAL`、`TEXT`、`BLOB`、`ANY`（注意 `VARCHAR` 需写成 `TEXT`，`BOOLEAN` 需写成 `INTEGER`）。

### 2. `sqlite3` CLI 必会元命令（以点 `.` 开头，不加分号）

| 元命令 | 作用 | 日常高频用法 |
| --- | --- | --- |
| `.headers on` / `.mode box` | 开启表头并用漂亮表格线对齐输出 | 每次进命令行先敲一遍（可写进 `~/.sqliterc` 自动生效） |
| `.tables` | 列出当前库里所有表和视图 | 快速查看表名 |
| `.schema [表名]` | 打印建表 DDL、索引和触发器源码 | 核对线上库到底建了哪些索引和约束 |
| `.timer on` | 每次 SQL 执行完自动打印 `Run Time: real ...` | 对比加索引前后或批量事务的真实耗时 |
| `.import --csv a.csv t` | 把 CSV 文件直接导入表 `t` | 一键导入测试数据集 |
| `.dump` / `.read a.sql` | 导出整库 SQL 文本 / 执行外部 SQL 脚本 | 迁移小库或初始化种子数据 |
| `.backup snapshot.db` | 在线热备份出一致的独立数据库文件 | WAL 模式下唯一安全的命令行备份方式 |

---

## 三、C++ API 连接管理：`sqlite3_open_v2`、`sqlite3_close` 与 `sqlite3_exec` (DB-22)

在 C++ 中打开 SQLite 数据库，工程上应该优先使用 **`sqlite3_open_v2`** 而不是旧版 `sqlite3_open`，因为它可以显式控制打开模式（避免“路径写错时悄悄在当前目录新建了一个空库”）：

```cpp
#include <sqlite3.h>

// 常用打开标志组合：
// 1. 读写且不存在时创建（生产初始化）：SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
// 2. 仅允许打开已存在数据库（防止拼错路径建出空库）：SQLITE_OPEN_READWRITE
// 3. 只读分析查询工具：SQLITE_OPEN_READONLY
sqlite3* raw_db = nullptr;
int rc = sqlite3_open_v2("logs_demo.db", &raw_db,
                         SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr);
if (rc != SQLITE_OK) {
    // 致命细节：即使打开失败，SQLite 也可能已经分配了 raw_db 句柄用来存放错误信息！
    const char* err_msg = raw_db ? sqlite3_errmsg(raw_db) : "out of memory";
    // 记录 err_msg 后必须释放 raw_db，否则直接内存泄漏！
    if (raw_db) sqlite3_close_v2(raw_db);
}
```

- **`sqlite3_close` vs `sqlite3_close_v2`**：如果还有未 `finalize` 的语句句柄，`sqlite3_close` 会返回 `SQLITE_BUSY` 并拒绝释放内存；`sqlite3_close_v2` 会把连接标为“僵尸连接”，等最后一个语句销毁时自动清理（最根本的解法还是用 RAII 保证所有 `StmtPtr` 先于 `DbPtr` 析构！）。
- **`sqlite3_exec` 的适用边界**：适合执行**无参数、不需要返回复杂行数据**的 DDL / PRAGMA / 事务控制语句（如 `CREATE TABLE`、`PRAGMA foreign_keys = ON;`、`BEGIN IMMEDIATE;`、`COMMIT;`）。注意若它失败并返回 `char* err`，必须调用 **`sqlite3_free(err)`** 释放！

### 工程错误码分类（绝对不要把所有非 `SQLITE_OK` 混为一谈）

| 返回码 | 含义 | C++ 服务端正确响应策略 |
| --- | --- | --- |
| `SQLITE_OK` / `SQLITE_ROW` / `SQLITE_DONE` | 正常成功 / 取出一行结果 / 语句执行完毕 | 正常推进业务流程 |
| `SQLITE_BUSY` / `SQLITE_LOCKED` | 并发写锁争用 | 配置 `sqlite3_busy_timeout(db, 3000)` 有限退避等待，超时再报错重试 |
| `SQLITE_CONSTRAINT` | 违反 `UNIQUE` / `FOREIGN KEY` / `CHECK` / `NOT NULL` | 业务或幂等冲突（例如 `batch_key` 重复），**不可靠盲目重试掩盖**，回滚并按契约返回 |
| `SQLITE_IOERR` / `SQLITE_FULL` / `SQLITE_CORRUPT` | 磁盘满、I/O 错误或页校验损坏 | 立即 `ROLLBACK` 并向上报警失败，绝不返回“成功” |

---

## 四、预处理语句生命周期：`prepare_v2`、`bind_*`、`step`、`column_*` (DB-23)

任何带用户输入或循环批量执行的 SQL，都必须走 **Prepared Statement（预处理语句）** 五步状态机：

```text
  [1. sqlite3_prepare_v2] ── 编译 SQL 文本为字节码 (循环外只做 1 次!)
            │
            ▼
  ┌─▶ [2. sqlite3_bind_*] ── 给第 1, 2, 3... 个 '?' 占位符安全填值 (1-based!)
  │         │
  │         ▼
  │   [3. sqlite3_step]   ── 推进执行:
  │      ├─ 返回 SQLITE_ROW  ──▶ [4. sqlite3_column_*] 按 0-based 下标读列值，循环继续 step
  │      ├─ 返回 SQLITE_DONE ──▶ 本次执行圆满结束
  │      └─ 返回其他错误码    ──▶ 立即抛出异常 / 处理错误!
  │         │
  │         ▼
  └── [5. sqlite3_reset + sqlite3_clear_bindings] ── 重置状态机，准备下一组参数复用!
            │
            ▼
  [6. sqlite3_finalize] ── 销毁字节码释放内存 (由 RAII 析构自动兜底)
```

### 4 个新手必踩的 C API 细节暗坑

1. **绑定下标从 `1` 开始，读取列下标从 `0` 开始！**
   - `sqlite3_bind_int(stmt, 1, batch_id)`（第 1 个 `?` 是 `1`）
   - `sqlite3_column_int(stmt, 0)`（结果集第 1 列是 `0`）
2. **`SQLITE_STATIC` vs `SQLITE_TRANSIENT` 悬空指针陷阱**：
   - 传 `SQLITE_STATIC` 等于向 SQLite 发誓：“这块字符串内存直到我 `finalize`/`reset` 之前都绝对不会销毁也不会改！”——如果传的是局部变量或临时 `std::string::c_str()`，出作用域后内存失效，立刻变成**未定义行为（读到乱码甚至段错误）**！
   - 除非是字面量常量（如 `"WARN"`），**一律传 `SQLITE_TRANSIENT`**（让 SQLite 内部立刻拷贝一份安全副本）。
3. **文本列包含 `\0` 或 `NULL` 值判断**：
   - `sqlite3_column_text(stmt, col)` 遇到 SQL `NULL` 时会返回 **`nullptr`**！直接拿它构造 `std::string(ptr)` 会立刻崩溃！
   - 稳妥写法：先判断 `sqlite3_column_type(stmt, col) == SQLITE_NULL`，非空时配合 `sqlite3_column_bytes(stmt, col)` 构造 `std::string(reinterpret_cast<const char*>(ptr), bytes)`。
4. **循环复用必须“重置状态 + 重绑全部参数”**：`sqlite3_reset` 只把执行游标拨回起点，**不会清除上一次绑定的参数**！因此必须再调 `sqlite3_clear_bindings`（或把所有 `?` 重新绑定一遍），否则漏绑的槽位会沿用上一行的旧值！

---

## 五、用现代 C++20 RAII 封装 `sqlite3*` 与 `sqlite3_stmt*` (DB-24)

在 C++20 工程中，绝不要在业务逻辑里手动配对 `sqlite3_close` 和 `sqlite3_finalize`——只要中间抛一个异常或早退 `return`，句柄必然泄漏。用 `std::unique_ptr` 配上零开销自定义删除器（Deleter），就能做到**100% 异常安全且严格按逆序析构（先销毁语句，再关闭连接）**。

下面是一份完整的、可直接编译运行的 `sqlite_demo.cpp`（同时演示连接 RAII、语句 RAII、外键开启、单事务批量插入回滚、以及参数绑定查询读取结果）：

```cpp
#include <sqlite3.h>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

struct DbCloser {
    void operator()(sqlite3* db) const {
        if (db) sqlite3_close_v2(db);
    }
};
using DbPtr = std::unique_ptr<sqlite3, DbCloser>;

struct StmtFinalizer {
    void operator()(sqlite3_stmt* stmt) const {
        if (stmt) sqlite3_finalize(stmt);
    }
};
using StmtPtr = std::unique_ptr<sqlite3_stmt, StmtFinalizer>;

void exec_sql(sqlite3* db, const char* sql) {
    char* err = nullptr;
    if (sqlite3_exec(db, sql, nullptr, nullptr, &err) != SQLITE_OK) {
        std::string msg = err ? err : sqlite3_errmsg(db);
        sqlite3_free(err);
        throw std::runtime_error(msg);
    }
}

// 在一个显式事务里批量插入日志；遇到空消息或约束错误立刻整体回滚
void insert_batch(sqlite3* db, int batch_id,
                  const std::vector<std::pair<std::string, std::string>>& items) {
    exec_sql(db, "BEGIN IMMEDIATE;");
    try {
        sqlite3_stmt* raw_stmt = nullptr;
        const char* sql = "INSERT INTO logs(batch_id, level, message) VALUES(?, ?, ?);";
        if (sqlite3_prepare_v2(db, sql, -1, &raw_stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error(sqlite3_errmsg(db));
        }
        StmtPtr stmt(raw_stmt);

        for (const auto& [level, message] : items) {
            if (message.empty()) {
                throw std::runtime_error("拒绝空日志消息，触发整批回滚");
            }
            sqlite3_reset(stmt.get());
            sqlite3_clear_bindings(stmt.get());
            if (sqlite3_bind_int(stmt.get(), 1, batch_id) != SQLITE_OK ||
                sqlite3_bind_text(stmt.get(), 2, level.data(),
                                  static_cast<int>(level.size()), SQLITE_TRANSIENT) != SQLITE_OK ||
                sqlite3_bind_text(stmt.get(), 3, message.data(),
                                  static_cast<int>(message.size()), SQLITE_TRANSIENT) != SQLITE_OK) {
                throw std::runtime_error(sqlite3_errmsg(db));
            }
            if (sqlite3_step(stmt.get()) != SQLITE_DONE) {
                throw std::runtime_error(sqlite3_errmsg(db));
            }
        }
        exec_sql(db, "COMMIT;");
    } catch (...) {
        // 发生任何异常，撤销本批已经写入的部分行！
        sqlite3_exec(db, "ROLLBACK;", nullptr, nullptr, nullptr);
        throw;
    }
}

int main() {
    sqlite3* raw_db = nullptr;
    if (sqlite3_open_v2("logs_demo.db", &raw_db,
                        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) != SQLITE_OK) {
        std::cerr << "无法打开数据库: "
                  << (raw_db ? sqlite3_errmsg(raw_db) : "memory error") << '\n';
        if (raw_db) sqlite3_close_v2(raw_db); // 打开失败也可能分配了句柄！
        return 1;
    }
    DbPtr db(raw_db);
    sqlite3_busy_timeout(db.get(), 3000); // 并发锁冲突最多等待 3 秒

    exec_sql(db.get(),
        "PRAGMA foreign_keys = ON;"
        "CREATE TABLE IF NOT EXISTS logs ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  batch_id INTEGER NOT NULL,"
        "  level TEXT NOT NULL,"
        "  message TEXT NOT NULL"
        ") STRICT;"
        "CREATE INDEX IF NOT EXISTS idx_logs_level_batch ON logs(level, batch_id);");

    // 1. 正常批次（batch 1）：全部提交成功（含单引号文本测试防注入）
    insert_batch(db.get(), 1, {
        {"INFO", "service started"},
        {"ERROR", "It's failed: disk full"}
    });

    // 2. 坏批次（batch 2）：第 2 条为空，触发整批回滚！第 1 条也不会留在库里
    try {
        insert_batch(db.get(), 2, {
            {"WARN", "retry 1"},
            {"ERROR", ""}
        });
    } catch (const std::exception& e) {
        std::cout << "捕获预期异常: " << e.what() << '\n';
    }

    // 3. 参数绑定查询验证回滚结果与内容完整回读
    sqlite3_stmt* q_raw = nullptr;
    if (sqlite3_prepare_v2(db.get(),
            "SELECT batch_id, level, message FROM logs WHERE level = ?;", -1, &q_raw, nullptr) != SQLITE_OK) {
        throw std::runtime_error(sqlite3_errmsg(db.get()));
    }
    StmtPtr q(q_raw);

    auto query_by_level = [&](const char* lvl) {
        sqlite3_reset(q.get());
        sqlite3_clear_bindings(q.get());
        sqlite3_bind_text(q.get(), 1, lvl, -1, SQLITE_STATIC);
        int count = 0;
        int rc = SQLITE_OK;
        while ((rc = sqlite3_step(q.get())) == SQLITE_ROW) {
            int bid = sqlite3_column_int(q.get(), 0);
            const unsigned char* msg_ptr = sqlite3_column_text(q.get(), 2);
            int msg_len = sqlite3_column_bytes(q.get(), 2);
            std::string msg = msg_ptr
                ? std::string(reinterpret_cast<const char*>(msg_ptr), msg_len)
                : "";
            std::cout << "  [" << lvl << "] batch=" << bid << " msg=\"" << msg << "\"\n";
            ++count;
        }
        if (rc != SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db.get()));
        return count;
    };

    std::cout << "回滚后 WARN 数量（应为 0）: " << query_by_level("WARN") << '\n';
    std::cout << "当前 ERROR 数量: " << query_by_level("ERROR") << '\n';
    return 0;
}
```

编译运行（注意 `-lsqlite3` 必须放在源文件后面）：

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic sqlite_demo.cpp -lsqlite3 -o sqlite_demo
./sqlite_demo
```

---

## 六、单事务批量写入：100 倍吞吐提升与 `BEGIN IMMEDIATE` (DB-25)

很多刚写 SQLite 的同学跑出“每秒只能插 30 条记录”的惨淡性能，原因几乎 100% 是**没有包显式事务**：

```text
默认自动提交（Autocommit）插 10,000 行：
  INSERT #1 → 开启事务 → 写盘 + fsync 等待磁盘旋转/控制器刷盘 → COMMIT
  INSERT #2 → 开启事务 → 写盘 + fsync 等待磁盘刷盘 → COMMIT
  ... 重复 10,000 次！耗时约 30~100 秒！

包在 1 个显式事务里插 10,000 行（+ 复用预编译语句）：
  BEGIN IMMEDIATE → 内存中连续改页写 10,000 行 → COMMIT (只做 1~2 次顺序 fsync!)
  总耗时约 15~40 毫秒（吞吐暴涨数百倍）！
```

### 为什么写事务推荐使用 `BEGIN IMMEDIATE` 而不是 `BEGIN`？

- 普通 `BEGIN`（即 `BEGIN DEFERRED`）一开始**并不会拿写锁**，而是先以读事务开场，直到执行第一句 `INSERT`/`UPDATE` 才尝试升级成写锁。
- 如果此时另一个连接已经占着写锁，**升级锁会直接绕过 `busy_timeout` 立即返回 `SQLITE_BUSY` 死锁保护错**（因为你的事务持有旧快照，不可能原地等别人写完再升级）！
- 用 **`BEGIN IMMEDIATE;`** 一进事务就排队抢写锁，能正常配合 `sqlite3_busy_timeout` 平滑等待，彻底消除读写升级死锁。

---

## 七、关键 `PRAGMA` 调优：WAL 模式、同步级别与检查点诊断 (DB-26)

默认的 `DELETE`（回滚日志）模式下，写事务一拿锁就会**阻塞所有新读事务**。并发服务（如 `LogScan v3`）打开连接后应按顺序设置以下核心 `PRAGMA`：

```sql
PRAGMA journal_mode = WAL;     -- 持久化写入库头，开启读写并发快照隔离
PRAGMA synchronous = NORMAL;   -- WAL 模式下跳过每次 COMMIT 的 fsync（下文权衡）
PRAGMA busy_timeout = 3000;    -- 每个连接设置：遇写锁冲突最多等 3000ms
PRAGMA foreign_keys = ON;      -- 每个连接设置：启用外键约束检查
PRAGMA cache_size = -64000;    -- 每个连接设置：负数代表 KB，分配 64MB 页缓存
PRAGMA temp_store = MEMORY;    -- 临时排序表优先放内存
```

### 1. WAL 单写者 + 多并发读者的快照隔离

开启 WAL 后，磁盘会出现 `logs.db-wal`（所有新增修改先顺序追加到这里，不改主库）和 `logs.db-shm`（共享内存索引，定位页最新版本在主库还是 `-wal`）。

```text
时间线:
  T1: 读连接 R1 执行 BEGIN; SELECT COUNT(*) FROM logs; → 读到 2 行（锁定此刻 WAL 快照边界！）
  T2: 写连接 W1 插入第 3 行并 COMMIT;                  → 顺序追加到 logs.db-wal，绝不阻塞 R1！
  T3: 读连接 R1 再次 SELECT COUNT(*) FROM logs;         → 依然读到 2 行（可重复读快照隔离）
  T4: 新连接 R2 执行 SELECT COUNT(*) FROM logs;         → 读到最新已提交的 3 行！
```

### 2. 检查点（Checkpoint）与为什么 `-wal` 文件会无限膨胀？

当 `-wal` 攒满 1000 页（约 4MB）时 SQLite 会自动做 Checkpoint，把 `-wal` 里的页搬回主库 `logs.db`。**但如果有一个长读事务 `R1` 迟迟不 `COMMIT`/`ROLLBACK`**，它锁住的老快照页就不能被覆盖，导致 Checkpoint 卡在半路，`-wal` 越滚越大！

可用 `PRAGMA wal_checkpoint(PASSIVE);` 观察返回的 `(busy, pnLog, pnCkpt)`——若 `pnCkpt < pnLog`，说明正被某个长事务读者卡住：

| 检查点模式 | 行为与锁影响 |
| --- | --- |
| `PASSIVE` | 不阻塞任何读写者，能搬多少搬多少（最安全） |
| `FULL` | 阻塞新写者、等待现有写者结束，尽量搬空 WAL |
| `RESTART` | 在 `FULL` 基础上等老读者退出，把 WAL 写指针重置回文件头 |
| `TRUNCATE` | 重置指针并把 `-wal` 文件物理截断缩回 `0` 字节 |

### 3. `synchronous = NORMAL` vs `FULL`

- **`FULL`**：每次 `COMMIT` 都调用 `fsync`，**机器突然断电也零丢失**，但写吞吐受限。
- **`NORMAL`（WAL 模式下强烈推荐折中）**：跳过每次 `COMMIT` 的 `fsync`，只在 Checkpoint 时同步——**进程崩溃（`kill -9` / 异常退出）绝不丢已提交事务**；仅当整个操作系统突然掉电时，最后几个尚未 Checkpoint 的提交可能回滚到上一个完整状态（数据库结构依然 100% 完好不损坏）。

---

## 八、SQLite 内置超能力：JSON1 与 FTS5 全文检索 (DB-27)

现代 SQLite（3.38+）默认把 **JSON1** 和 **FTS5** 编译进内核，不用装任何插件就能同时胜任半结构化文档存储与全文搜索引擎：

### 1. JSON1：半结构化扩展字段 + 表达式/生成列索引

```sql
CREATE TABLE audit_events (
    id      INTEGER PRIMARY KEY,
    payload TEXT NOT NULL CHECK (json_valid(payload)), -- 确保写入的必定是合法 JSON！
    actor   TEXT GENERATED ALWAYS AS (payload ->> '$.actor') STORED
) STRICT;

CREATE INDEX idx_audit_actor ON audit_events(actor);

INSERT INTO audit_events(payload) VALUES ('{"actor":"alice","tags":["login","mfa"]}');

-- 用 -> 保留 JSON 类型，->> 直接解包为纯文本/数字
SELECT id, payload ->> '$.actor' AS actor, j.value AS tag
FROM audit_events, json_each(payload, '$.tags') AS j
WHERE actor = 'alice';
```

### 2. FTS5 全文检索：告别 `LIKE '%timeout%'` 全表扫

`WHERE message LIKE '%timeout%'` 开头带 `%` 通配符会导致 B-Tree 索引彻底失效（详见 `DB-35`）。用 **FTS5 虚拟表** 建立倒排索引，百万行日志关键字检索只需 1~3 毫秒：

```sql
-- 1. 建立基于外部主表 logs 的内容同步 FTS5 索引表（不重复存两份正文字节）
CREATE VIRTUAL TABLE logs_fts USING fts5(
    message,
    content='logs',
    content_rowid='id',
    tokenize='unicode61'
);

-- 2. 用触发器保持主表增删改时 FTS5 自动同步
CREATE TRIGGER logs_ai AFTER INSERT ON logs BEGIN
    INSERT INTO logs_fts(rowid, message) VALUES (new.id, new.message);
END;
CREATE TRIGGER logs_ad AFTER DELETE ON logs BEGIN
    INSERT INTO logs_fts(logs_fts, rowid, message) VALUES('delete', old.id, old.message);
END;

-- 3. 毫秒级全文检索（支持布尔组合、短语、BM25 相关性打分与高亮片段！）
SELECT l.id, l.level, snippet(logs_fts, 0, '[', ']', '...', 12) AS hit, bm25(logs_fts) AS score
FROM logs_fts
JOIN logs AS l ON l.id = logs_fts.rowid
WHERE logs_fts MATCH '"disk full" OR timeout'
ORDER BY score
LIMIT 20;
```

---

## 九、在线备份 API 与 `user_version` 模式迁移 (DB-28)

### 1. 千万别用 `cp` 拷贝运行中的 WAL 数据库！

WAL 模式下，最新提交的数据还躺在 `logs.db-wal` 里没有刷回主库。直接 `cp logs.db backup.db` 不仅会丢数据，如果拷贝过程中正好撞上写入或 Checkpoint，备库直接损坏打不开！

正确的热备份方式有三种：
1. CLI 命令：`sqlite3 logs.db ".backup logs_backup.db"`
2. SQL 语句：`VACUUM INTO 'logs_backup.db';`（SQLite 3.27+，顺带整理碎片并产出独立单文件快照）
3. C++ 在线备份 API（适合后台线程增量热备，不长时间阻塞业务写）：

```cpp
bool online_backup(sqlite3* src_db, const char* dst_path) {
    sqlite3* raw_dst = nullptr;
    if (sqlite3_open_v2(dst_path, &raw_dst,
                        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) != SQLITE_OK) {
        if (raw_dst) sqlite3_close_v2(raw_dst);
        return false;
    }
    DbPtr dst(raw_dst);
    sqlite3_backup* bk = sqlite3_backup_init(dst.get(), "main", src_db, "main");
    if (!bk) return false;

    int rc = SQLITE_OK;
    do {
        rc = sqlite3_backup_step(bk, 64); // 每次仅搬 64 页，给线上写事务留喘息机会
        if (rc == SQLITE_BUSY || rc == SQLITE_LOCKED) {
            sqlite3_sleep(50);
        }
    } while (rc == SQLITE_OK || rc == SQLITE_BUSY || rc == SQLITE_LOCKED);

    sqlite3_backup_finish(bk);
    return rc == SQLITE_DONE;
}
```

备份完成后，务必在新路径执行 `PRAGMA integrity_check;`，只有返回唯一一行 `ok` 才算通过恢复验证。

### 2. 用 `PRAGMA user_version` 管理平滑建表升级（Schema Migrations）

SQLite 在数据库文件头专门预留了一个 32 位整数字段 **`PRAGMA user_version`** 供应用程序记录当前表结构版本号（新建空库默认为 `0`）。配合事务即可写出极简且幂等的升级器：

```cpp
int get_user_version(sqlite3* db) {
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db, "PRAGMA user_version;", -1, &raw, nullptr) != SQLITE_OK) {
        throw std::runtime_error(sqlite3_errmsg(db));
    }
    StmtPtr stmt(raw);
    if (sqlite3_step(stmt.get()) != SQLITE_ROW) throw std::runtime_error("read user_version failed");
    return sqlite3_column_int(stmt.get(), 0);
}

void migrate_schema(sqlite3* db) {
    exec_sql(db, "BEGIN IMMEDIATE;");
    try {
        int ver = get_user_version(db);
        if (ver < 1) {
            exec_sql(db, "CREATE TABLE batches(id INTEGER PRIMARY KEY, batch_key TEXT UNIQUE NOT NULL) STRICT;");
            exec_sql(db, "PRAGMA user_version = 1;");
        }
        if (ver < 2) {
            exec_sql(db, "ALTER TABLE batches ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown';");
            exec_sql(db, "PRAGMA user_version = 2;");
        }
        exec_sql(db, "COMMIT;");
    } catch (...) {
        sqlite3_exec(db, "ROLLBACK;", nullptr, nullptr, nullptr);
        throw;
    }
}
```

---

## 十、本地持久化底层契约：Page Cache、`fsync`、原子替换与 CRC32 日志 (DB-29)

即使不依赖 SQLite，自己用 C++ 处理本地配置文件、断点续传或自研 WAL 日志时，也必须遵守系统编程底层的四条持久化铁律（同时也是 `LogScan v1/v2/v3` 共享的数据契约基石）：

### 1. 统一记录契约与未知版本拒绝

```cpp
// DB-29: v1 报告与 v2/v3 归档共享的日志记录契约与版本校验（C++20）
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

enum class LogLevel { Info, Warn, Error, Unknown };

struct LogRecord {
    std::uint16_t version = 1; // 记录契约/格式版本，跨模块共享
    std::string source;        // 来源文件或连接标识
    std::size_t line_no = 0;   // 1-based 原始行号
    LogLevel level = LogLevel::Unknown;
    std::string raw_text;      // 去除行尾 \r\n 后的原始正文
};

enum class ParseStatus { Ok, BlankLine, TooLong, UnknownVersion };

constexpr std::size_t kMaxLineBytes = 4096;
constexpr std::uint16_t kSupportedRecordVersion = 1;

inline bool is_ascii_space(char ch) {
    return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';
}

inline LogLevel classify_level(std::string_view line) {
    auto match_prefix = [&](std::string_view tag) {
        if (!line.starts_with(tag)) return false;
        return line.size() == tag.size() || line[tag.size()] == ' ' ||
               line[tag.size()] == '\t' || line[tag.size()] == ':';
    };
    if (match_prefix("ERROR")) return LogLevel::Error;
    if (match_prefix("WARN")) return LogLevel::Warn;
    if (match_prefix("INFO")) return LogLevel::Info;
    return LogLevel::Unknown;
}

inline ParseStatus parse_log_record(std::uint16_t format_version, std::string_view source,
                                    std::size_t line_no, std::string_view raw_line,
                                    std::optional<LogRecord>& out) {
    out.reset();
    if (format_version != kSupportedRecordVersion) {
        return ParseStatus::UnknownVersion; // 未知版本直接拒绝，绝不猜着解析
    }
    if (!raw_line.empty() && raw_line.back() == '\r') {
        raw_line.remove_suffix(1); // 兼容 CRLF 与 LF
    }
    if (raw_line.size() > kMaxLineBytes) {
        return ParseStatus::TooLong;
    }
    bool all_blank = true;
    for (char ch : raw_line) {
        if (!is_ascii_space(ch)) { all_blank = false; break; }
    }
    if (all_blank) {
        return ParseStatus::BlankLine;
    }
    out = LogRecord{format_version, std::string(source), line_no,
                    classify_level(raw_line), std::string(raw_line)};
    return ParseStatus::Ok;
}
```

### 2. 三级落盘路径与同目录原子快照替换

```text
[用户态 buffer] ──write(2)──→ [内核 Page Cache (内存!)] ──fsync(fd)──→ [磁盘控制器 / 持久化介质]
  进程崩溃不丢                   机器掉电会全部丢失！                      掉电后仍可恢复
```

- **处理短写与中断**：循环写完所有字节，处理 `errno == EINTR` 重试；遇到 `ENOSPC` 或 `fsync()` 返回 `-1` 必须立即报错。
- **原子快照替换 4 步仪式**（绝不直接 `O_TRUNC` 覆盖原文件）：
  1. 写**同目录**临时文件 `snapshot.tmp`（确保同一文件系统才能原子 `rename`）；
  2. `fsync(temp_fd) + close(temp_fd)`（确保文件内容先落盘）；
  3. `rename("snapshot.tmp", "snapshot.dat")`（POSIX 原子切换目录项指针）；
  4. `open(dir) -> fsync(dir_fd)`（确保新目录项变更也落盘，否则断电后新文件可能消失）。

### 3. 追加写日志（Append-Only Log）与 CRC32 崩溃扫描恢复

每条二进制日志带上 `[version(1B) | len(4B BE) | crc32(4B BE) | payload]` 头，重启扫描时精准区分**尾部写半截（`TailTruncated`，可安全 `ftruncate` 截尾续写）**和**中段数据损坏（`MidCorrupted`，必须报警停机）**：

```cpp
#include <cstdint>
#include <string>
#include <vector>

inline std::uint32_t crc32(const std::uint8_t* data, std::size_t len) {
    std::uint32_t crc = 0xFFFFFFFFu;
    for (std::size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int b = 0; b < 8; ++b)
            crc = (crc & 1u) ? ((crc >> 1) ^ 0xEDB88320u) : (crc >> 1);
    }
    return ~crc;
}

enum class ScanStatus { CleanEof, TailTruncated, MidCorrupted };
struct ScanResult {
    std::vector<std::string> valid_records;
    std::size_t valid_bytes = 0;
    ScanStatus status = ScanStatus::CleanEof;
};

// 记录布局: [version(1B)=1][len(4B BE)][crc32(4B BE)][payload(len B)]
inline ScanResult recover_append_log(const std::vector<std::uint8_t>& bytes) {
    ScanResult res;
    std::size_t off = 0;
    constexpr std::size_t kHdr = 9;
    constexpr std::uint32_t kMaxPayload = 64 * 1024;
    auto u32 = [&](std::size_t p) {
        return (std::uint32_t(bytes[p]) << 24) | (std::uint32_t(bytes[p + 1]) << 16) |
               (std::uint32_t(bytes[p + 2]) << 8) | std::uint32_t(bytes[p + 3]);
    };

    while (off < bytes.size()) {
        if (bytes.size() - off < kHdr) { res.status = ScanStatus::TailTruncated; break; }
        if (bytes[off] != 1) { res.status = ScanStatus::MidCorrupted; break; }
        std::uint32_t len = u32(off + 1);
        std::uint32_t want_crc = u32(off + 5);
        if (len > kMaxPayload) { res.status = ScanStatus::MidCorrupted; break; }
        if (bytes.size() - off - kHdr < len) { res.status = ScanStatus::TailTruncated; break; }
        const std::uint8_t* ptr = &bytes[off + kHdr];
        if (crc32(ptr, len) != want_crc) { res.status = ScanStatus::MidCorrupted; break; }
        res.valid_records.emplace_back(reinterpret_cast<const char*>(ptr), len);
        off += kHdr + len;
        res.valid_bytes = off;
    }
    return res;
}
```

### 4. 提交确认与幂等重试契约（`LogScan v3` 边界）

当服务端 `COMMIT` 成功但在回传 `ACK` 给客户端之前进程崩溃或网络断开时，客户端无法区分“到底写成功没”，只能重发同一批数据：
- 客户端每批携带稳定不变的 `batch_key`；
- 服务端仅在 `COMMIT` 返回 `SQLITE_OK` 后才发 `ACK`；
- 客户端重试时，服务端依赖 `batches(batch_key UNIQUE)` 触发 `SQLITE_CONSTRAINT_UNIQUE` 并核对已存在，直接返回幂等确认成功——**绝不写入双份数据**！

---

## 本课常见 1 行反例坑 & 报错急救室

- 打开连接忘记 `PRAGMA foreign_keys = ON;` → 外键形同虚设，插入不存在的 `batch_id` 静默成功。
- `sqlite3_open_v2` 失败时直接 `return 1;` 不关 `raw_db` → 错误路径也会泄露连接句柄内存。
- 循环里把 `sqlite3_prepare_v2` 放进 `for` 内，或者不用显式事务 → 吞吐掉百倍！
- 绑定临时 `std::string::c_str()` 时传 `SQLITE_STATIC` → 悬空指针读取垃圾字节或崩溃。
- 启用 WAL 后直接 `cp app.db app.db.bak` → 漏掉 `-wal` 最新提交，备库直接损坏。
- 原子文件替换漏掉 `fsync(dir_fd)` → 断电重启后新文件名可能直接消失。

| 报错现象 / 关键字 | 一句话根因 | 精准修复命令 / 写法 |
| --- | --- | --- |
| `fatal error: sqlite3.h: No such file or directory` | 仅装了 CLI 工具，缺少 C/C++ 开发头文件包。 | `sudo apt update && sudo apt install -y libsqlite3-dev` |
| `undefined reference to 'sqlite3_open_v2'` | 编译或 CMake 链接阶段漏掉了 `sqlite3` 库。 | `g++ -std=c++20 sqlite_demo.cpp -lsqlite3 -o sqlite_demo`（CMake 链接 `SQLite::SQLite3`） |
| `database is locked`（`SQLITE_BUSY`） | 并发争用且未设 `busy_timeout`，或用了 `BEGIN` 升级写锁死锁。 | 打开连接设 `sqlite3_busy_timeout(db, 3000)` + `PRAGMA journal_mode = WAL;` + 写事务用 `BEGIN IMMEDIATE;` |
| `cannot store TEXT value in INTEGER column` | 建表启用了 `STRICT`，传入了类型不匹配的值。 | 按表定义绑定正确 `sqlite3_bind_int64` / `sqlite3_bind_double` / `sqlite3_bind_text` |

---

## 5 个梯度微练习

### 练习 1（生命周期与悬空指针）

下面代码有什么隐藏灾难？该如何一行修复？
```cpp
{
    std::string tag = build_tag();
    sqlite3_bind_text(stmt, 1, tag.c_str(), -1, SQLITE_STATIC);
}
sqlite3_step(stmt);
```

<details>
<summary>核对答案</summary>

`tag` 在离开大括号 `}` 时就已经析构释放内存，而 `SQLITE_STATIC` 告诉 SQLite 不要拷贝字符串，导致后面 `sqlite3_step(stmt)` 解引用悬空指针（未定义行为/崩溃/乱码）！把最后一个参数改为 **`SQLITE_TRANSIENT`**（或把 `tag` 生命周期延长到 `step`/`reset` 之后）。

</details>

### 练习 2（并发锁升级死锁）

为什么在多线程/多进程共享同一个 SQLite 数据库时，写事务用 `BEGIN IMMEDIATE;` 比普通的 `BEGIN;` 更不容易触发无法等待的 `SQLITE_BUSY`？

<details>
<summary>核对答案</summary>

普通 `BEGIN`（`DEFERRED`）开始时只拿了读快照锁。如果两个连接各自以读锁启动，随后都想升级写锁，就会形成死锁环——SQLite 检测到这种升级冲突时会**无视 `busy_timeout`**，立刻返回 `SQLITE_BUSY`。而 `BEGIN IMMEDIATE` 一开始就申请写锁，能够正常通过 `busy_timeout` 排队等待上一个写者结束。

</details>

### 练习 3（WAL 膨胀诊断）

终端 A 对 WAL 库执行 `BEGIN; SELECT COUNT(*) FROM logs;` 后**暂不提交**；终端 B 连续插入 5000 行并提交，接着执行 `PRAGMA wal_checkpoint(TRUNCATE);`。`-wal` 文件会被缩回 0 字节吗？为什么？

<details>
<summary>核对答案</summary>

**不会**（`busy` 返回 `1` 或 `pnCkpt < pnLog`）。因为终端 A 仍持有旧读快照，SQLite 必须保留那些老页在 `-wal` 中不能覆盖或截断。直到终端 A 执行 `COMMIT` 或 `ROLLBACK` 释放快照，再次运行 `PRAGMA wal_checkpoint(TRUNCATE);` 才会把 `-wal` 截断回 0 字节。

</details>

### 练习 4（`STRICT` 与 `user_version` 设计）

请写出一段 SQL 建表迁移脚本：版本 1 创建严格类型表 `kv_store(k TEXT PRIMARY KEY, v BLOB NOT NULL) STRICT`，版本 2 为其增加整数时间戳列 `updated_at INTEGER NOT NULL DEFAULT 0`，并把 `PRAGMA user_version` 设为 `2`。

<details>
<summary>核对答案</summary>

```sql
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS kv_store (
    k TEXT PRIMARY KEY,
    v BLOB NOT NULL
) STRICT;
ALTER TABLE kv_store ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
PRAGMA user_version = 2;
COMMIT;
```

</details>

### 练习 5（动手验证：CRC32 截断日志恢复与 FTS5 检索）

1. 把第十节的 `recover_append_log` 复制到 `test_crc.cpp` 编译运行，手动构造 2 条记录并把第 2 条正文截断一半，验证 `valid_records.size() == 1` 且返回 `ScanStatus::TailTruncated`。
2. 在 `sqlite3` CLI 测试第八节的 `FTS5` 建表与 `MATCH` 查询，用 `EXPLAIN QUERY PLAN` 观察是否走上了 `SCAN logs_fts VIRTUAL TABLE INDEX`。

<details>
<summary>参考提示</summary>

测试 `recover_append_log` 时可以按大端序写入 `[1, len_be(4B), crc_be(4B), payload]` 构造两帧，再对 `bytes.pop_back()` 截掉末尾几个字节；若故意篡改第 1 条 payload 的某 1 个比特位，则返回 `ScanStatus::MidCorrupted` 且 `valid_records.size() == 0`。

</details>
