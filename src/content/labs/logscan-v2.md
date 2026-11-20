---
title: "LogScan v2：Linux 本地归档与 SQLite 事务回滚"
description: "在 Linux/WSL2 下用 CMake 链接 SQLite3，完成万行日志归档、建索引前后 EXPLAIN QUERY PLAN 对比、带引号参数查询与主键冲突原子回滚。"
order: 3
tags: ["LogScan", "C++20", "Linux", "CMake", "SQLite", "事务"]
related:
  - labs/logscan-v1
  - handbook/linux-process-io
  - handbook/storage-sqlite
  - handbook/cmake-targets
  - labs/logscan-service
sources: []
---

## 本实验解决什么问题

[LogScan v1](../logscan-v1/) 能在内存里把多个日志文件聚合成 4 行计数，但程序一退出，原始记录和按级别检索的能力也就消失了。**LogScan v2（E2）** 把解析出的日志落盘到 Linux/WSL2 临时目录里的 **SQLite** 数据库，同时回答三个真实的工程问题：

1. **怎么证明进程确实只打开了预期文件？** —— 用 `strace` 或 `/proc/<PID>/fd` 观察输入路径、进程号与文件描述符。
2. **建索引到底改变执行计划了吗？** —— 导入 10,000 行固定夹具，对同一条参数化查询对比建索引前后的 `EXPLAIN QUERY PLAN`。
3. **写到一半主键冲突会不会留下半截脏数据？** —— 在事务中先写入有效新 ID，再注入重复主键，验证 `ROLLBACK` 并重开数据库核对状态。

先修：完成 [LogScan v1](../logscan-v1/)，学完 [Linux 与进程 I/O](../../handbook/linux-process-io/) 和 [SQLite 持久化](../../handbook/storage-sqlite/)。

## 心智模型：事务边界、参数绑定与索引目录

```text
LogScan v1 解析记录 ─→ [ C++20 archive (RAII: DbPtr / StmtPtr) ]
                              │
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                         ▼
 1. 事务原子边界        2. 参数绑定 (?)           3. 二级索引目录
 BEGIN -> 批量写入      数据与 SQL 语法彻底分离    无索引: SCAN logs (全表扫)
 正常 -> COMMIT         引号只作普通字符串        有索引: SEARCH USING COVERING
 冲突 -> ROLLBACK       杜绝报错与 SQL 注入       INDEX idx_logs_level (level=?)
```

> **重要区分**：事务 `ROLLBACK` 证明的是**应用或 SQL 约束失败时的原子撤销**；若要验证进程被 `SIGKILL` 强杀后的崩溃恢复，必须用独立夹具与双进程另测，并记录当时的 `PRAGMA journal_mode` 与 `PRAGMA synchronous` 配置。

## 验收契约（E2）

- **运行环境**：WSL2 或原生 Linux，C++20、CMake 3.20+、`libsqlite3-dev`、`sqlite3` CLI；数据库建在临时目录（如 `/tmp/logscan-v2-...`）。
- **固定夹具**：导入 `id` 为 `0..9999` 共 `10000` 行；`id % 100 == 0` 时 `level = "ERROR"`（共 `100` 行：`0, 100, ..., 9900`），其余为 `"INFO"`（`9900` 行）。
- **索引对照**：对同一条参数化查询 `SELECT id FROM logs WHERE level = ? ORDER BY id`（绑定 `"ERROR"`），在执行 `CREATE INDEX idx_logs_level ON logs(level)` 前后分别打印 `EXPLAIN QUERY PLAN` 并核对返回序列完全一致（`0, 100, ..., 9900`）。
- **带引号参数**：绑定含单引号的查询参数（如 `"ERROR' OR '1'='1"`），不报错且返回 `0` 行，证明引号被当作普通数据。
- **主键冲突回滚**：同一事务内先插新 ID `10000`，再插已存在的主键 `0` 触发约束错误；执行 `ROLLBACK` 后**关闭并重新打开数据库**，核对总行数仍为 `10000` 且 `id = 10000` 不存在。

## 五步破题脚手架（从零写 SQLite 归档程序）

1. **先写 Schema 与索引语句**：在注释里定死表名、主键、二级索引列，以及「哪些查询必须走索引」。
2. **先封 RAII 句柄**：用 `std::unique_ptr` 自定义删除器包住 `sqlite3*`（`DbPtr`）和 `sqlite3_stmt*`（`StmtPtr`），杜绝异常路径泄漏句柄。
3. **写参数化批导入 + 事务模板**：`BEGIN;` → 循环 `reset`/`clear_bindings`/`bind_*`/`step` → `COMMIT;`，`catch(...)` 里显式执行 `ROLLBACK;` 后重抛。
4. **写索引对照与安全查询**：把同一条 `SELECT` 的 `EXPLAIN QUERY PLAN` 与返回序列包成独立函数，并在建索引前后各调用一次；用 `?` 绑定含单引号的字符串验证不注入。
5. **关库重开做落盘终检**：用 `db.reset()` 关掉再 `open_db` 重开，分别查总行数和冲突测试的“幽灵 ID”，并用 `sqlite3` CLI 与 `strace` 交叉复核。

## 第一步：准备 Linux/WSL2 工程与 `CMakeLists.txt`

先确认 SQLite 开发库已安装：

```bash
sudo apt update && sudo apt install -y build-essential cmake ninja-build sqlite3 libsqlite3-dev
```

创建独立练习目录 `~/cpp-work/logscan-v2/`，写入 `CMakeLists.txt`（使用 CMake 标准导入目标 `SQLite::SQLite3`）：

```cmake
cmake_minimum_required(VERSION 3.20)
project(logscan_v2 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(SQLite3 REQUIRED)

add_executable(logscan_archive src/archive.cpp)
target_link_libraries(logscan_archive PRIVATE SQLite::SQLite3)
target_compile_options(logscan_archive PRIVATE -Wall -Wextra -Wpedantic)
```

## 第二步：完整可运行 C++20 实现（`src/archive.cpp`）

```cpp
#include <sqlite3.h>
#include <cassert>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

struct DbCloser {
    void operator()(sqlite3* db) const {
        if (db) sqlite3_close(db);
    }
};
using DbPtr = std::unique_ptr<sqlite3, DbCloser>;

struct StmtFinalizer {
    void operator()(sqlite3_stmt* stmt) const {
        if (stmt) sqlite3_finalize(stmt);
    }
};
using StmtPtr = std::unique_ptr<sqlite3_stmt, StmtFinalizer>;

DbPtr open_db(const std::string& path) {
    sqlite3* raw = nullptr;
    const int rc = sqlite3_open(path.c_str(), &raw);
    DbPtr db(raw);  // 即使失败也可能已分配句柄，交给 RAII 统一关闭。
    if (rc != SQLITE_OK) {
        const std::string msg = db ? sqlite3_errmsg(db.get()) : "out of memory";
        throw std::runtime_error("sqlite3_open failed: " + msg);
    }
    return db;
}

void exec_sql(sqlite3* db, const char* sql) {
    char* err = nullptr;
    if (sqlite3_exec(db, sql, nullptr, nullptr, &err) != SQLITE_OK) {
        const std::string msg = err ? err : sqlite3_errmsg(db);
        sqlite3_free(err);
        throw std::runtime_error(msg);
    }
}

StmtPtr prepare(sqlite3* db, const char* sql) {
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db, sql, -1, &raw, nullptr) != SQLITE_OK) {
        throw std::runtime_error(sqlite3_errmsg(db));
    }
    return StmtPtr(raw);
}

std::string query_single_text(sqlite3* db, const char* sql) {
    auto stmt = prepare(db, sql);
    if (sqlite3_step(stmt.get()) != SQLITE_ROW) return "";
    const auto* txt = reinterpret_cast<const char*>(sqlite3_column_text(stmt.get(), 0));
    return txt ? txt : "";
}

sqlite3_int64 query_count(sqlite3* db, const char* sql) {
    auto stmt = prepare(db, sql);
    if (sqlite3_step(stmt.get()) != SQLITE_ROW) {
        throw std::runtime_error("expected count row");
    }
    return sqlite3_column_int64(stmt.get(), 0);
}

void import_10k_rows(sqlite3* db) {
    exec_sql(db, "BEGIN;");
    try {
        auto stmt = prepare(db, "INSERT INTO logs(id, level, message) VALUES(?, ?, ?);");
        for (int id = 0; id < 10000; ++id) {
            const char* level = (id % 100 == 0) ? "ERROR" : "INFO";
            const std::string msg = "event-" + std::to_string(id);

            sqlite3_reset(stmt.get());
            sqlite3_clear_bindings(stmt.get());
            sqlite3_bind_int(stmt.get(), 1, id);
            sqlite3_bind_text(stmt.get(), 2, level, -1, SQLITE_STATIC);
            sqlite3_bind_text(stmt.get(), 3, msg.c_str(), -1, SQLITE_TRANSIENT);

            if (sqlite3_step(stmt.get()) != SQLITE_DONE) {
                throw std::runtime_error(sqlite3_errmsg(db));
            }
        }
        exec_sql(db, "COMMIT;");
    } catch (...) {
        sqlite3_exec(db, "ROLLBACK;", nullptr, nullptr, nullptr);
        throw;
    }
}

std::vector<int> query_ids_by_level(sqlite3* db, const std::string& level) {
    auto stmt = prepare(db, "SELECT id FROM logs WHERE level = ? ORDER BY id;");
    sqlite3_bind_text(stmt.get(), 1, level.c_str(), -1, SQLITE_TRANSIENT);
    std::vector<int> ids;
    while (true) {
        const int rc = sqlite3_step(stmt.get());
        if (rc == SQLITE_ROW) {
            ids.push_back(sqlite3_column_int(stmt.get(), 0));
        } else if (rc == SQLITE_DONE) {
            break;
        } else {
            throw std::runtime_error(sqlite3_errmsg(db));
        }
    }
    return ids;
}

void print_query_plan(sqlite3* db, const char* label, const std::string& level) {
    auto stmt = prepare(db, "EXPLAIN QUERY PLAN SELECT id FROM logs WHERE level = ? ORDER BY id;");
    sqlite3_bind_text(stmt.get(), 1, level.c_str(), -1, SQLITE_TRANSIENT);
    std::cout << "[" << label << "]\n";
    while (sqlite3_step(stmt.get()) == SQLITE_ROW) {
        // EXPLAIN QUERY PLAN 的第 4 列（下标 3）是计划说明文本。
        const auto* detail = reinterpret_cast<const char*>(sqlite3_column_text(stmt.get(), 3));
        std::cout << "  " << (detail ? detail : "") << '\n';
    }
}

void run_duplicate_pk_rollback(sqlite3* db) {
    exec_sql(db, "BEGIN;");
    try {
        auto stmt = prepare(db, "INSERT INTO logs(id, level, message) VALUES(?, ?, ?);");

        // 1. 先插入一条完全合法的新记录（id = 10000）。
        sqlite3_bind_int(stmt.get(), 1, 10000);
        sqlite3_bind_text(stmt.get(), 2, "WARN", -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt.get(), 3, "pending new row", -1, SQLITE_STATIC);
        if (sqlite3_step(stmt.get()) != SQLITE_DONE) {
            throw std::runtime_error(sqlite3_errmsg(db));
        }

        // 2. 同一批再插入已有主键（id = 0），触发主键约束冲突。
        sqlite3_reset(stmt.get());
        sqlite3_clear_bindings(stmt.get());
        sqlite3_bind_int(stmt.get(), 1, 0);
        sqlite3_bind_text(stmt.get(), 2, "ERROR", -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt.get(), 3, "duplicate pk", -1, SQLITE_STATIC);
        if (sqlite3_step(stmt.get()) != SQLITE_DONE) {
            throw std::runtime_error(sqlite3_errmsg(db));
        }

        exec_sql(db, "COMMIT;");
    } catch (...) {
        sqlite3_exec(db, "ROLLBACK;", nullptr, nullptr, nullptr);
        throw;
    }
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "Usage: logscan_archive <db_path>\n";
        return 2;
    }
    const std::string db_path = argv[1];

    try {
        auto db = open_db(db_path);
        std::cout << "SQLite version: " << sqlite3_libversion() << '\n';
        std::cout << "journal_mode=" << query_single_text(db.get(), "PRAGMA journal_mode;")
                  << " synchronous=" << query_single_text(db.get(), "PRAGMA synchronous;") << '\n';

        exec_sql(db.get(),
            "DROP TABLE IF EXISTS logs;"
            "CREATE TABLE logs ("
            "  id INTEGER PRIMARY KEY,"
            "  level TEXT NOT NULL,"
            "  message TEXT NOT NULL"
            ");");

        import_10k_rows(db.get());

        // 1. 建索引前：记录计划与结果序列
        print_query_plan(db.get(), "Before index", "ERROR");
        const auto before_ids = query_ids_by_level(db.get(), "ERROR");
        assert(before_ids.size() == 100 && before_ids.front() == 0 && before_ids.back() == 9900);

        // 2. 建索引后：对比同一条参数化查询的计划与结果
        exec_sql(db.get(), "CREATE INDEX idx_logs_level ON logs(level);");
        print_query_plan(db.get(), "After index", "ERROR");
        const auto after_ids = query_ids_by_level(db.get(), "ERROR");
        assert(before_ids == after_ids);
        std::cout << "ERROR rows matched: " << after_ids.size()
                  << " (first=" << after_ids.front() << ", last=" << after_ids.back() << ")\n";

        // 3. 带单引号参数查询：只作普通数据，不触发 SQL 注入或语法错
        const auto quoted_ids = query_ids_by_level(db.get(), "ERROR' OR '1'='1");
        assert(quoted_ids.empty());
        std::cout << "Quoted parameter rows: " << quoted_ids.size() << '\n';

        // 4. 事务内主键冲突回滚测试
        try {
            run_duplicate_pk_rollback(db.get());
            std::cerr << "ERROR: expected duplicate primary key failure!\n";
            return 1;
        } catch (const std::exception& e) {
            std::cout << "Caught expected PK error & rolled back: " << e.what() << '\n';
        }

        // 5. 关闭并重新打开数据库，核对持久化后的真实状态
        db.reset();
        db = open_db(db_path);
        const auto total_rows = query_count(db.get(), "SELECT COUNT(*) FROM logs;");
        const auto phantom_rows = query_count(db.get(), "SELECT COUNT(*) FROM logs WHERE id = 10000;");
        std::cout << "After reopen -> total_rows=" << total_rows
                  << ", id_10000_exists=" << phantom_rows << '\n';
        assert(total_rows == 10000 && phantom_rows == 0);
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "logscan_archive error: " << e.what() << '\n';
        return 1;
    }
}
```

## 第三步：构建、运行与系统级验收步骤

在 WSL2 / Linux 终端执行，所有数据库产物放到临时目录，避免污染源码树：

```bash
cd ~/cpp-work/logscan-v2
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build

TMPDB=$(mktemp -d)/logs.db
./build/logscan_archive "$TMPDB"

# 用 sqlite3 CLI 独立复核数据库落盘状态
sqlite3 "$TMPDB" "SELECT COUNT(*) FROM logs; SELECT COUNT(*) FROM logs WHERE id = 10000;"

# 观察进程系统调用与打开的文件描述符（二选一保存证据）
strace -e trace=openat,close -o /tmp/v2-trace.txt ./build/logscan_archive "$TMPDB"
grep -E "logs\.db|openat" /tmp/v2-trace.txt | head -n 10
```

也可以在 `main` 末尾临时加入读取 `std::cin.get()` 的暂停点，另开终端查看 `/proc/$(pidof logscan_archive)/fd`，记录 `0/1/2` 标准流以及打开数据库文件的 `fd=3`。

### 预期输出与验收对照表

```text
SQLite version: 3.45.1
journal_mode=delete synchronous=2
[Before index]
  SCAN logs
[After index]
  SEARCH logs USING COVERING INDEX idx_logs_level (level=?)
ERROR rows matched: 100 (first=0, last=9900)
Quoted parameter rows: 0
Caught expected PK error & rolled back: UNIQUE constraint failed: logs.id
After reopen -> total_rows=10000, id_10000_exists=0
```

| 验收项 | 检查动作 | 预期证据 |
| --- | --- | --- |
| 万行导入 | 事务写入 `0..9999`，`id % 100 == 0` 为 `ERROR` | 百毫秒级完成，`ERROR` 恰为 `0, 100, ..., 9900` 共 100 行 |
| 索引前计划 | 建索引前 `EXPLAIN QUERY PLAN` | 出现 `SCAN logs`（全表扫描），固定记录当前 SQLite 版本 |
| 索引后计划 | 建 `idx_logs_level` 后再执行同一计划 | 出现 `SEARCH logs USING COVERING INDEX idx_logs_level (level=?)` |
| 引号参数 | 绑定 `"ERROR' OR '1'='1"` | 无语法报错、返回 `0` 行 |
| 原子回滚 | 先插 `10000` 再插重复 `0` → `ROLLBACK` → 重开库 | `total_rows=10000`，`id_10000_exists=0` |
| 进程与 FD | `strace` 或 `/proc/<PID>/fd` 快照 | 看到临时目录 `logs.db` 被打开并在进程退出前关闭 |

## 3 个一行就会踩中的反例坑

1. **漏掉 `BEGIN;` / `COMMIT;`** —— 反例：循环插 10,000 行自动开启 10,000 次隐式事务和磁盘 `fsync`，几毫秒的导入会被拖慢到几十秒甚至数分钟。
2. **用字符串拼接拼 SQL**：`"SELECT id FROM logs WHERE level = '" + level + "'"` —— 反例：传入 `"ERROR' OR '1'='1"` 会把全表 `10000` 行全部吐出，直接沦为 SQL 注入。
3. **建了索引但 `EXPLAIN QUERY PLAN` 仍是 `SCAN`** —— 反例：查 `level = 'INFO'`（占 99% 行）或把 `level` 列定义错类型/在列上包了函数 `LOWER(level) = ?`，优化器会认为扫全表比回表更便宜而放弃索引；排查时优先检查**数据选择率、列类型和查询条件**。

## 4 个循序渐进的微练习

### 练习 1（读懂执行计划）
在上面的输出里，建索引后的计划显示 `USING COVERING INDEX idx_logs_level (level=?)`，为什么 `SELECT id FROM logs WHERE level = ? ORDER BY id` 不需要再回主表查 `id`，也不需要额外的 `USE TEMP B-TREE FOR ORDER BY`？

<details><summary>提示与参考答案</summary>

SQLite 的二级索引叶子节点天然附带主键 `rowid`（这里 `id INTEGER PRIMARY KEY` 就是 `rowid` 别名），且相同 `level` 下的条目已按 `rowid` 有序排列。因此单靠 `idx_logs_level` 就同时覆盖了 `WHERE level = ?`、`SELECT id` 和 `ORDER BY id` 三件事（覆盖索引）。

</details>

### 练习 2（边界验证：把查询条件换成 `INFO`）
保持表和索引不变，把查询参数从 `"ERROR"`（100 行，1%）换成 `"INFO"`（9900 行，99%），重新运行 `EXPLAIN QUERY PLAN`，观察计划和返回行数有什么变化。

<details><summary>提示与参考答案</summary>

返回 `9900` 行。如果改查 `SELECT id, message FROM logs WHERE level = 'INFO'`（需要回表取 `message`），再执行 `ANALYZE;` 让优化器看到 99% 的高占比，优化器通常会退回 `SCAN logs` 以避免 9900 次随机回表——这就是“计划受统计信息与选择率影响”的直接证据。

</details>

### 练习 3（破坏性对照：去掉 `ROLLBACK;` 会怎样？）
在 `run_duplicate_pk_rollback` 的 `catch` 块里故意注释掉 `sqlite3_exec(db, "ROLLBACK;", ...)`，观察在关闭连接后重开数据库时，`id = 10000` 还在不在？如果在关闭前继续在同一个连接上做下一次 `BEGIN;` 会发生什么？

<details><summary>提示与参考答案</summary>

关闭连接时 SQLite 会自动中止未提交的挂起事务，所以重开后 `10000` 仍不在；但在**同一个长连接**里不显式 `ROLLBACK`，事务会一直处于打开状态，下一次调用 `BEGIN;` 会直接报错 `cannot start a transaction within a transaction`，并锁住写通道。长生命周期服务（下一站 LogScan v3）必须显式 `ROLLBACK`。

</details>

### 练习 4（崩溃恢复边界：设计双进程 `SIGKILL` 实测）
如何单独设计一个实验，验证“已 `COMMIT` 的数据在进程被 `kill -9` 后不丢，未 `COMMIT` 的事务在重启后自动消失”？需要记录哪两项 SQLite 配置？

<details><summary>提示与参考答案</summary>

用两个进程配合独立临时数据库：进程 A 开启事务写入新行后故意阻塞（不 `COMMIT`），外部用 `kill -9 <PID_A>` 强杀进程 A；随后启动进程 B 打开同一数据库并查询。必须记录 `PRAGMA journal_mode;`（如 `DELETE` 或 `WAL`）和 `PRAGMA synchronous;`（如 `FULL`/`NORMAL`），因为二者共同决定崩溃恢复的持久化边界。

</details>

## 脱拐杖横向迁移挑战：MetricsArchive v2

> **规则（15–30 分钟独立迁移）**：在 Linux/WSL2 下新建空目录 `~/cpp-work/metrics-v2/`，不复制 `src/archive.cpp`，仅凭「五步破题脚手架」与本节规格完成一个全新的 SQLite 监控指标归档程序 `metrics_archive <db_path>`。

### 规格说明

1. **表结构**：
   ```sql
   CREATE TABLE metrics (
     id INTEGER PRIMARY KEY,
     host TEXT NOT NULL,
     latency_ms INTEGER NOT NULL
   );
   ```
2. **批量事务导入**：在单个显式事务（`BEGIN` ... `COMMIT`）内导入 `id = 0..4999` 共 **5,000** 行数据：
   - `host`：`id % 50 == 0` 时为 `"db-hot"`（共 `100` 行：`0, 50, ..., 4950`），其余为 `"web-edge"`（`4900` 行）。
   - `latency_ms`：`10 + (id % 200)`。
3. **复合覆盖索引对比**：对查询 `SELECT id, latency_ms FROM metrics WHERE host = ? ORDER BY id`（绑定 `"db-hot"`），在创建复合索引 `CREATE INDEX idx_metrics_host_lat ON metrics(host, latency_ms);` **前后**分别打印 `EXPLAIN QUERY PLAN`，并断言两次返回的 `(id, latency_ms)` 序列完全一致。
4. **单引号参数安全查询**：绑定 `"db-hot' OR '1'='1"` 执行同一查询，要求无 SQL 报错且返回 `0` 行。
5. **重复主键原子回滚**：在独立事务里先插入新行 `(5000, "cache-01", 15)`，再插入已存在主键 `(0, "db-hot", 99)` 触发 `UNIQUE constraint failed`；在 `catch` 中执行 `ROLLBACK;`，随后**关闭并重新打开数据库**，核对总行数为 `5000` 且 `id = 5000` 为 `0` 行。

### 预期输出与命令行复核

运行 `./build/metrics_archive "$TMPDB"` 应观察到类似输出（具体 SQLite 版本号以本机为准）：

```text
[Before index]
  SCAN metrics
[After index]
  SEARCH metrics USING COVERING INDEX idx_metrics_host_lat (host=?)
db-hot rows=100 first_id=0 last_id=4950
Quoted parameter rows=0
Caught expected PK error & rolled back: UNIQUE constraint failed: metrics.id
After reopen -> total_rows=5000, id_5000_exists=0
```

再用 `sqlite3` CLI 独立核对落盘结果：

```bash
sqlite3 "$TMPDB" "SELECT COUNT(*), SUM(CASE WHEN host='db-hot' THEN 1 ELSE 0 END) FROM metrics; SELECT COUNT(*) FROM metrics WHERE id=5000;"
# 预期输出：
# 5000|100
# 0
```

> 思考题：为什么这次建的是 `ON metrics(host, latency_ms)` 而不是只建 `ON metrics(host)`，才让 `SELECT id, latency_ms` 也能显示 `USING COVERING INDEX`？
