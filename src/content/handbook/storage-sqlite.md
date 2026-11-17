---
title: "数据持久化：SQLite C++ API、索引与事务回滚"
description: "写出真正可编译运行的 C++ SQLite 程序：掌握预处理参数绑定防注入、复合索引查询计划与事务原子回滚。"
order: 100
tags: ["数据库", "SQLite", "C++20", "索引", "事务"]
related: ["handbook/linux-process-io", "handbook/network-tcp", "labs/logscan-service"]
sources: []
---

## 本课只解决这 1 个问题

`LogScan` 之前每次都要把整个日志文件从头扫一遍，如果日志积累到几个 GB，每次查询“今天有哪些 ERROR”都会非常慢。把解析结果存进 **SQLite**（C++ 最常用的嵌入式单文件数据库，无需独立部署数据库服务），就能实现毫秒级条件查询和崩溃恢复。

本课直接带你写出**能编译运行的 C++ 操作 SQLite 程序**，覆盖建表、防注入参数绑定、事务提交/回滚和索引验证。

前置要求：已在 WSL2 Ubuntu 搭好环境，理解 RAII。

## 第一步：安装 SQLite 开发库

在 WSL2 Ubuntu 终端安装 `sqlite3` 命令行工具和 C/C++ 开发头文件（`libsqlite3-dev`）：

```bash
sudo apt update
sudo apt install -y sqlite3 libsqlite3-dev
```

## 第二步：心智模型——为什么需要参数绑定、索引与事务？

1. **参数绑定（`sqlite3_prepare_v2` + `sqlite3_bind_*`）**：绝对不要用 `+` 拼接用户输入进 SQL 字符串（会有 SQL 注入漏洞，且单引号会直接导致语法报错）。用 `?` 占位符，让 SQLite 引擎把数据安全填进去。
2. **事务（`BEGIN` → 批量 `INSERT` → `COMMIT` / `ROLLBACK`）**：
   - 性能差距：在 SQLite 里，不开启事务时每条 `INSERT` 都会触发一次磁盘 `fsync`，1 秒只能插几十条；把 1 万条包进同一个事务，只需几十毫秒！
   - 一致性保障：如果一批写入到一半发生错误，执行 `ROLLBACK`，数据库干净回到导入前的状态，绝不留半截脏数据。
3. **复合索引（`INDEX(level, batch_id)`）**：没有索引时查询需要翻遍全表（`SCAN`）；建了索引后直接按目录定位（`SEARCH USING INDEX`）。

## 第三步：完整可编译运行的 C++ SQLite 程序

在 WSL2 Ubuntu 新建 `sqlite_demo.cpp`（用一个小 RAII 守卫管理 `sqlite3*` 和 `sqlite3_stmt*`，保证任何路径退出都不会泄露句柄）：

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

void exec_sql(sqlite3* db, const char* sql) {
    char* err = nullptr;
    if (sqlite3_exec(db, sql, nullptr, nullptr, &err) != SQLITE_OK) {
        std::string msg = err ? err : "unknown sqlite error";
        sqlite3_free(err);
        throw std::runtime_error(msg);
    }
}

// 演示：在一个事务里批量插入日志；如果中间遇到空消息就抛出异常并整体回滚
void insert_batch(sqlite3* db, int batch_id,
                  const std::vector<std::pair<std::string, std::string>>& items) {
    exec_sql(db, "BEGIN;");
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
            sqlite3_bind_int(stmt.get(), 1, batch_id);
            sqlite3_bind_text(stmt.get(), 2, level.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt.get(), 3, message.c_str(), -1, SQLITE_TRANSIENT);

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
    if (sqlite3_open("logs_demo.db", &raw_db) != SQLITE_OK) {
        std::cerr << "无法打开数据库\n";
        return 1;
    }
    DbPtr db(raw_db);

    exec_sql(db.get(),
        "CREATE TABLE IF NOT EXISTS logs ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  batch_id INTEGER NOT NULL,"
        "  level TEXT NOT NULL,"
        "  message TEXT NOT NULL"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_logs_level_batch ON logs(level, batch_id);");

    // 1. 正常批次（batch 1）：全部提交成功
    insert_batch(db.get(), 1, {
        {"INFO", "service started"},
        {"ERROR", "disk full"}
    });

    // 2. 坏批次（batch 2）：第 2 条为空，触发回滚！第 1 条也不会留在库里
    try {
        insert_batch(db.get(), 2, {
            {"WARN", "retry 1"},
            {"ERROR", ""}
        });
    } catch (const std::exception& e) {
        std::cout << "捕获预期异常: " << e.what() << '\n';
    }

    // 3. 用参数绑定查询当前数据库里到底有几条记录
    sqlite3_stmt* q_raw = nullptr;
    sqlite3_prepare_v2(db.get(), "SELECT batch_id, level, message FROM logs WHERE level = ?;", -1, &q_raw, nullptr);
    StmtPtr q(q_raw);
    sqlite3_bind_text(q.get(), 1, "WARN", -1, SQLITE_STATIC);

    int warn_count = 0;
    while (sqlite3_step(q.get()) == SQLITE_ROW) {
        ++warn_count;
    }
    std::cout << "回滚后库中 WARN 数量（应为 0）: " << warn_count << '\n';
    return 0;
}
```

编译并运行（注意末尾必须链接 `-lsqlite3`）：

```bash
g++ -std=c++20 -Wall -Wextra sqlite_demo.cpp -lsqlite3 -o sqlite_demo
./sqlite_demo
```

预期输出：

```text
捕获预期异常: 拒绝空日志消息，触发整批回滚
回滚后库中 WARN 数量（应为 0）: 0
```

## 第四步：用 `EXPLAIN QUERY PLAN` 验证索引是否真的生效

建了索引不代表查询一定能用上！在终端用 `sqlite3` 打开刚才生成的 `logs_demo.db`，对比两条查询的执行计划：

```bash
sqlite3 logs_demo.db "EXPLAIN QUERY PLAN SELECT id FROM logs WHERE level = 'ERROR' AND batch_id = 1;"
sqlite3 logs_demo.db "EXPLAIN QUERY PLAN SELECT id FROM logs WHERE batch_id = 1;"
```

你会看到截然不同的结果：
- 第一条：`SEARCH logs USING COVERING INDEX idx_logs_level_batch (level=? AND batch_id=?)`（走索引快速定位）。
- 第二条：`SCAN logs`（**全表扫描**！因为复合索引 `(level, batch_id)` 必须先给出最左边的 `level` 才能用上目录，这叫**最左前缀原则**）。

## 4 个微练习

### 练习 1（读代码找性能关键点）

在 `insert_batch` 的循环里，为什么要把 `sqlite3_prepare_v2` 放在 `for` 循环外面，而在循环内部只调用 `sqlite3_reset` 和 `sqlite3_bind_*`？

<details>
<summary>核对答案</summary>

`sqlite3_prepare_v2` 会把 SQL 文本编译成字节码（最耗时），而业务批量插入 1 万条数据时 SQL 结构完全一样，只是参数值不同。编译一次、循环里 `reset` + 重新绑定参数，能极大降低 CPU 开销。

</details>

### 练习 2（安全问题分析）

如果不用 `sqlite3_bind_text`，而是把用户日志内容直接拼进 SQL：`"INSERT INTO logs VALUES('" + msg + "')"`，当某条日志正好包含单引号 `It's failed` 时会发生什么？

<details>
<summary>核对答案</summary>

轻则单引号提前闭合字符串导致 SQL 语法错误（插入失败）；重则被恶意构造成 `'); DROP TABLE logs; --` 引发 **SQL 注入**。参数绑定能 100% 免疫这类问题。

</details>

### 练习 3（索引设计）

如果业务上**经常**单独按 `WHERE batch_id = ?` 查询某一批导入的所有日志，不带 `level` 条件，只靠 `idx_logs_level_batch(level, batch_id)` 够用吗？应该怎么补索引？

<details>
<summary>核对答案</summary>

不够用（会退化为全表扫描）。应单独加一条以 `batch_id` 开头的索引：`CREATE INDEX IF NOT EXISTS idx_logs_batch ON logs(batch_id);`。

</details>

### 练习 4（动手验证）

在上面的 `sqlite_demo.cpp` 末尾，再加一段参数绑定查询 `WHERE level = 'ERROR'`，把查出来的 `batch_id` 和 `message` 打印到屏幕上（提示：整数列用 `sqlite3_column_int(stmt, 0)`，文本列用 `reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))`）。
