---
title: "第 0 课（零基础）：关系模型、表约束与核心 SQL 查询"
description: "从文件存储痛点切入，用 Excel 类比彻底掌握关系模型、主外键与级联动作、数据类型与 NULL 三值逻辑、DDL 建表约束、DML 安全防呆、SELECT/WHERE 过滤及排序与游标分页（DB-01 ~ DB-08）。"
order: 99
category: "存储与数据库"
tags: ["零基础", "数据库", "SQL", "SQLite", "主键外键", "NULL", "分页"]
related: ["handbook/db-sql-design", "handbook/storage-sqlite", "labs/logscan-v2"]
sources: []
---

> **🔑 跨学科前置钥匙卡**（[查看完整跨学科路线图](../../roadmap/)）
> - **零门槛直入范围**：本课与第 1 课（Excel 关系表、主外键与核心 SQL 增删改查/JOIN）**完全零代码门槛**！
> - **用 C++ 写 SQLite 事务归档前去隔壁拿的 3 把钥匙**：① [现代 C++：RAII 封装连接句柄](../raii/)；② [CMake 链接 sqlite3 目标](../cmake-targets/)；③ [操作系统：页缓存与 `fsync` 落盘（OS-42）](../os-fs-io/)。
>
> <details><summary>📚 本科已为你融合的全球 TOP 5 经典精华（无需再买书/翻英文站）</summary>
>
> 1. **SQLBolt +《SQL 必知必会》**：关系表直觉、`JOIN`/`GROUP BY`、窗口函数与参数化防 SQL 注入
> 2. **Use The Index, Luke!**：B+ 树双向链表叶子节点、回表 vs 覆盖索引与联合索引最左前缀
> 3. **SQLite 官方架构文档**：`prepare/bind/step` 生命周期、WAL 快照隔离与 `EXPLAIN QUERY PLAN`
> 4. **CMU 15-445 (Andy Pavlo)**：Slotted Page、Buffer Pool、B+Tree vs LSM-Tree 与 ARIES WAL 恢复
> 5. **《数据密集型应用系统设计 (DDIA)》**：ACID 真实语义、四大隔离级别、MVCC 快照读与主从/分片
>
> </details>

## 本课只解决这 1 个问题

写程序初期，我们习惯把数据直接塞进 `.txt`、`.csv` 或 `.json` 文件里。可一旦数据涨到几十万行、有多个并发读写者、或者程序写到一半突然断电，纯文本文件就会瞬间暴露出**查询慢、格式乱、并发写毁坏、断电留半截脏数据**四大绝症。

本课作为存储与数据库体系的零基础起点（覆盖课程 `DB-01` ~ `DB-08`），不讲空洞理论，直接用 **Excel 工作簿的心智模型 + 可现场敲的 SQLite 命令行实战**，带你一次性吃透关系型数据库的核心地基。

### 零基础黑话翻译表

| 数据库黑话 | Excel 表格 / 日常生活类比 | 一句话说清本质 |
| --- | --- | --- |
| **数据库（Database）** | **一整个 Excel 工作簿文件（`.xlsx`）** | 管理多张关联表格、索引和事务日志的容器（在 SQLite 中就是一个本地 `.db` 文件） |
| **表（Table）** | **工作簿里的一张 Sheet 表格** | 同一类实体的集合，如 `batches`（导入批次表）、`logs`（日志明细表） |
| **列（Column / Field）** | **表格最上面的表头字段** | 定义数据“长什么样”，例如 `id`、`level`、`message`，同一列数据类型一致 |
| **行（Row / Tuple）** | **表格里的每一横行具体记录** | 代表一条独立的数据实例，比如“某次请求产生的一条 ERROR 日志” |
| **主键（Primary Key）** | **每行独一无二的身份证号** | 绝对不能重复，也不能为 `NULL`，用来精准定位某一行 |
| **外键（Foreign Key）** | **填写在子表里的“上级编号”** | 比如订单表里的 `user_id` 必须真实存在于用户表里，防止出现“幽灵订单” |
| **`NULL`** | **空白没填（未知），绝不是 `0` 或 `""`** | 表示“值未知或缺失”，参与任何比较都不会得到 `TRUE`，只能得到 `UNKNOWN` |
| **SQL 语言** | **对数据库下达的标准化普通话指令** | 声明“我要什么结果”（声明式），至于怎么翻索引还是全表扫，由数据库优化器决定 |
| **事务（Transaction）** | **银行转账的“打包绑定执行”** | 事务里的多条操作要么全部生效（`COMMIT`），要么一步失败全部撤销（`ROLLBACK`） |

> **动手环境准备（30 秒搞定）**：在 WSL2 / Linux / macOS 终端安装 SQLite CLI 后，随时输入 `sqlite3 demo.db` 即可进入交互沙盒；进入后建议先敲两行格式化显示命令：
> ```sql
> .headers on
> .mode column
> ```
> Windows 原生 PowerShell 也可从官网下载 `sqlite-tools` 或直接使用 WSL2 Ubuntu（`sudo apt install -y sqlite3`）。

---

## 一、为什么纯文件（`.txt` / `.json`）扛不住真实业务？ (DB-01)

假设你的 `LogScan` 服务运行了半年，硬盘里攒了 **500 万条日志**（约 1 GB 文本）。用普通文件存数据，很快会撞上 4 堵南墙：

1. **按条件查找只能 $O(N)$ 从头傻扫**：想找出“昨天 `batch_id = 42` 且 `level = 'ERROR'` 的最后 20 条日志”，纯文本没有任何目录结构，每次都得从第 1 个字节读到第 10 亿个字节；而数据库借助 B+Tree 索引，能在 **1 毫秒内（3~4 次磁盘页读取）** 直接命中。
2. **并发写入直接写花文件**：两个进程或两个线程同时向同一个 `app.log` 追加或修改同一段内容，如果不在文件锁和页级边界上做精细同步，两条日志的字节会交错混杂在一起（Torn Write）。
3. **写一半断电直接破坏结构**：如果你想修改 JSON 文件中间某个用户的余额，必须重写或覆盖文件；写到一半机器断电，JSON 括号少一半，整个文件直接解析失败。数据库通过 **WAL（预写日志）+ 原子事务**，保证断电重启后要么是完整的旧状态，要么是完整的新状态。
4. **缺少字段契约与引用校验**：文本文件不会阻止你在某一行把数字写成 `"abc"`，也不会阻止你把一条日志绑定到一个根本不存在的批次上。

| 能力维度 | 纯文本 / JSON / CSV 文件 | 关系型数据库（SQLite / PostgreSQL / MySQL） |
| --- | --- | --- |
| **条件查询速度** | $O(N)$ 全文件扫描，GB 级耗时数秒至数十秒 | $O(\log N)$ 索引定位，百万行毫秒级返回 |
| **数据结构约束** | 无强制力，全靠应用代码自觉 | `NOT NULL`、`CHECK`、`UNIQUE`、`FOREIGN KEY` 硬性守门 |
| **并发控制** | 粗粒度文件锁或自行手写锁协议 | 内置事务隔离级别、MVCC 快照 / 行锁 / WAL 读写并发 |
| **崩溃原子性** | 改写中途断电易损坏，需手写临时文件替换与 CRC 校验 | 原生 ACID 事务与崩溃前滚/回滚恢复 |
| **多维关联分析** | 需手写大量内存 Hash/Join 循环代码 | 一句 `JOIN` + `GROUP BY` 由查询优化器自动选最优算法 |

---

## 二、关系模型：表、行、列与集合思维 (DB-02)

1970 年，Edgar F. Codd 提出了**关系模型（Relational Model）**——把所有复杂数据都统一抽象成二维**关系（Relation，即 Table）**。想写出地道的 SQL，脑子里必须刻下四条铁律：

```text
表名：batches（导入批次表）                 表名：logs（日志明细表）
+----+---------------+---------------------+     +----+----------+-------+-----------------+
| id | batch_key     | created_at          |     | id | batch_id | level | message         |
+----+---------------+---------------------+     +----+----------+-------+-----------------+
| 1  | "2026-11-20A" | "2026-11-20T08:00Z" |<----| 10 | 1        | INFO  | service started |
| 2  | "2026-11-20B" | "2026-11-20T09:00Z" |<----| 11 | 1        | ERROR | disk full       |
+----+---------------+---------------------+     | 12 | 2        | WARN  | high latency    |
  ↑ 主键 (PK)                                    +----+----------+-------+-----------------+
                                                        ↑ 外键 (FK) 指向 batches.id
```

1. **列是同质的（Domain 域约束）**：同一列的所有值必须来自同一语义域（例如 `level` 列只存日志级别，不能第 1 行存 `'ERROR'`，第 2 行塞进一个 JSON 数组）。
2. **单元格是原子的（不可再分）**：不要在一个 `tags` 列里用逗号拼接 `"net,disk,timeout"`，否则后期按某个 tag 筛选只能全表扫字符串。
3. **行在逻辑上是无序集合（极其重要！）**：数学上的集合没有“第 1 行、第 2 行”之分。**只要 SQL 语句没有写 `ORDER BY`，数据库没有任何义务按插入顺序返回数据！** 即使今天碰巧按插入顺序输出，明天加了索引或触发了表整理（`VACUUM`），顺序就可能完全打乱。
4. **表里不应有完全一模一样的两行**：每张业务表都应该定义主键，保证任何一行都能被唯一指代。

---

## 三、主键、外键与级联动作（`ON DELETE`） (DB-03)

### 1. 主键（Primary Key）：自然键 vs 代理键

主键用来唯一标识表中的每一行，隐含 `UNIQUE` + `NOT NULL` 两条性质：

- **自然键（Natural Key）**：业务本身自带的唯一标识，比如身份证号、邮箱、ISBN 书号。缺点是**业务规则可能变**（用户换了邮箱怎么办？所有引用它的子表外键全要改！），且字符串键较长，索引体积大。
- **代理键（Surrogate Key）**：与业务无关的自增整数（`id INTEGER PRIMARY KEY`）或 UUID/雪花 ID。**工程上 95% 的表推荐使用自增整数代理键**，业务唯一字段（如 `batch_key`、`email`）另加 `UNIQUE` 约束即可。
- **复合主键（Composite Primary Key）**：多对多中间表常用两列联合做主键，例如 `PRIMARY KEY (user_id, role_id)`，天然防止同一用户被重复授予同一角色。

### 2. 外键（Foreign Key）与参照完整性

如果 `logs` 表的 `batch_id` 引用 `batches` 表的 `id`，外键就像一道门禁：
- 试图往 `logs` 插入 `batch_id = 999`（但 `batches` 里没有 `999`）→ **直接报错拒绝**，杜绝“无主孤儿日志”。
- 试图从 `batches` 删除 `id = 1`（而 `logs` 里还有两行指着它）→ 数据库根据你设定的 **`ON DELETE` 策略**决定怎么处理！

| 级联动作 | 删除/更新父表记录时的行为 | 典型工程场景 |
| --- | --- | --- |
| **`RESTRICT` / `NO ACTION`**（默认） | 只要子表还有引用，**直接拒绝删除父表记录** | 金融账单、订单表（绝对不能删了用户把历史订单顺手抹掉！） |
| **`CASCADE`** | 删父表记录时，**连带自动删除所有关联子表行** | 导入批次删掉时清空旗下临时日志；文章删除时同步删评论 |
| **`SET NULL`** | 删父表记录时，把子表对应的外键列置为 `NULL`（前提是该列允许 `NULL`） | 部门撤销时，员工表 `dept_id` 设为 `NULL`（变成待分配员工） |
| **`SET DEFAULT`** | 删父表记录时，把子表外键设为默认值（SQLite 支持，MySQL InnoDB 不支持） | 分类删除后文章归入默认分类 `category_id = 1` |

> **SQLite 新手必踩大坑**：SQLite 为了兼容 2009 年以前的老文件，**默认关闭外键校验**！每次建立新连接后必须第一时间执行：
> ```sql
> PRAGMA foreign_keys = ON;
> ```
> 再执行 `PRAGMA foreign_keys;` 确认返回 `1`，否则你写的 `FOREIGN KEY ... ON DELETE CASCADE` 全部只是摆设！

---

## 四、数据类型与 `NULL` 的三值逻辑陷阱 (DB-04)

### 1. 常用数据类型怎么选才不踩坑？

| 数据含义 | SQLite 推荐写法 | MySQL / PostgreSQL 推荐写法 | 致命误区警告 |
| --- | --- | --- | --- |
| **主键 / 整数计数** | `INTEGER`（最大 8 字节有符号） | `BIGINT` / `INT` | 业务流水号、Snowflake ID 必须用 64 位 `BIGINT`，`INT` 最大只到 21 亿！ |
| **金额 / 精确小数** | 存分 `INTEGER`（推荐）或 `TEXT` | `DECIMAL(18, 2)` / `NUMERIC` | **严禁使用 `FLOAT` / `REAL` / `DOUBLE` 存钱！** 二进制浮点 `0.1 + 0.2 != 0.3` 会让财务账目对不上 |
| **文本 / 字符串** | `TEXT` | `VARCHAR(n)` / `TEXT` | 需要不定长字符串时 PG 直接用 `TEXT`，MySQL 建索引列用合适长度的 `VARCHAR` |
| **二进制字节流** | `BLOB` | `BYTEA` / `BLOB` | 存哈希摘要、Proto 序列化帧等原始字节 |
| **布尔值** | `INTEGER CHECK(flag IN (0, 1))` | `BOOLEAN` / `TINYINT(1)` | SQLite 没有原生布尔类型，用 `0` 和 `1` 表示 |
| **时间点** | `TEXT`（ISO-8601 UTC）或 `INTEGER`（毫秒时间戳） | `TIMESTAMPTZ` / `DATETIME(6)` | **永远存 UTC**，不要把本地时区混进数据库（详见 `DB-19`） |

### 2. `NULL` 的三值逻辑（Three-Valued Logic）：全网最高频 SQL Bug 源头

在 C++ 里，布尔表达式只有 `true` 和 `false`。但在 SQL 里，一旦引入代表**“未知 / 缺失”**的 `NULL`，逻辑世界就变成了三值：`TRUE`、`FALSE`、`UNKNOWN`！

记住三条反直觉铁律：
1. **任何值和 `NULL` 做普通比较（`=`, `!=`, `<`, `>`），结果永远是 `UNKNOWN`，不是 `TRUE` 也不是 `FALSE`！**
   - `NULL = NULL` 的结果是 `UNKNOWN`（不是 `TRUE`！）。
   - `NULL != 'ERROR'` 的结果也是 `UNKNOWN`！
2. **`WHERE` 子句只保留结果为 `TRUE` 的行**——`FALSE` 和 `UNKNOWN` 都会被丢掉！
3. **三值真值表与算数传播**：
   - `TRUE AND UNKNOWN` $\rightarrow$ `UNKNOWN`；`FALSE AND UNKNOWN` $\rightarrow$ `FALSE`
   - `TRUE OR UNKNOWN` $\rightarrow$ `TRUE`；`FALSE OR UNKNOWN` $\rightarrow$ `UNKNOWN`
   - `NOT UNKNOWN` $\rightarrow$ `UNKNOWN`
   - `10 + NULL` $\rightarrow$ `NULL`；`'abc' || NULL` $\rightarrow$ `NULL`

```sql
-- 实战演示：假设 logs 表里有 3 行，其中第 3 行的 note 列是 NULL
CREATE TABLE demo_null (id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO demo_null VALUES (1, 'ok'), (2, 'timeout'), (3, NULL);

-- 新手以为能查出第 2 行和第 3 行，实际上第 3 行被静默吞掉了！
SELECT * FROM demo_null WHERE note != 'ok';
-- 仅返回: (2, 'timeout')！因为 NULL != 'ok' 是 UNKNOWN！

-- 正确写法 1：显式用 IS NULL / IS NOT NULL
SELECT * FROM demo_null WHERE note != 'ok' OR note IS NULL;

-- 正确写法 2：用标准 IS NOT DISTINCT FROM（SQLite 写法为 IS / IS NOT）
SELECT * FROM demo_null WHERE note IS NOT 'ok';
```

日常处理 `NULL` 的两把瑞士军刀：
- `COALESCE(a, b, 'fallback')`：返回参数列表里第一个非 `NULL` 的值（给空值兜底）。
- `NULLIF(a, b)`：如果 `a = b` 返回 `NULL`，否则返回 `a`（常用于防止除零：`total / NULLIF(cnt, 0)`）。

---

## 五、DDL 数据定义语言：`CREATE` / `ALTER` / `DROP` 与约束 (DB-05)

SQL 语句按职责分为四大家族：
- **DDL（数据定义语言）**：定义表结构骨架——`CREATE`、`ALTER`、`DROP`、`TRUNCATE`。
- **DML（数据操作语言）**：增删改表里的行——`INSERT`、`UPDATE`、`DELETE`。
- **DQL（数据查询语言）**：只读检索——`SELECT`（有时也被归入 DML）。
- **DCL / TCL（控制与事务语言）**：权限与事务——`GRANT`/`REVOKE`、`BEGIN`/`COMMIT`/`ROLLBACK`。

下面是一份可直接丢进 `sqlite3 demo.db` 运行的完整建表脚本，覆盖五大约束（`PRIMARY KEY`、`FOREIGN KEY`、`NOT NULL`、`UNIQUE`、`CHECK`、`DEFAULT`）：

```sql
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS batches;

CREATE TABLE batches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_key  TEXT    NOT NULL UNIQUE,            -- 唯一约束：防止同一批次重复导入
    source     TEXT    NOT NULL DEFAULT 'unknown', -- 默认值约束
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id   INTEGER NOT NULL,
    line_no    INTEGER NOT NULL CHECK (line_no > 0),                   -- 检查约束：行号必须为正
    level      TEXT    NOT NULL CHECK (level IN ('INFO','WARN','ERROR','UNKNOWN')),
    message    TEXT    NOT NULL,
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),  -- 允许 NULL，非空则非负
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    UNIQUE (batch_id, line_no)                                         -- 联合唯一：同一批次内行号不重复
);
```

> **`UNIQUE` 列能存多个 `NULL` 吗？**
> 能！在 SQL 标准、SQLite、PostgreSQL 和 MySQL 中，`NULL` 代表“未知”，两个“未知”并不相等，因此 `UNIQUE` 约束允许出现多行 `NULL`。（若确实需要把所有 `NULL` 视为同一个值限制唯一性，PostgreSQL 15+ 支持 `UNIQUE NULLS NOT DISTINCT`，或用部分唯一索引实现。）

### `ALTER TABLE` 与 `DROP` 的工程警示

```sql
-- 安全加列（通常建议加 DEFAULT 或允许 NULL）
ALTER TABLE logs ADD COLUMN trace_id TEXT;

-- 重命名列（SQLite 3.25+ 支持）
ALTER TABLE logs RENAME COLUMN message TO raw_message;

-- 删除列（SQLite 3.35+ 支持；如果该列有索引或约束引用需先删依赖）
ALTER TABLE logs DROP COLUMN trace_id;
```

- **大表 `ALTER TABLE` 告警**：在拥有几千万行的线上 MySQL/PG 生产库里，随意修改列类型或加 `NOT NULL` 约束可能触发**全表重建与长时间锁表**（导致业务请求雪崩）。生产改表通常配合在线 DDL 工具（如 `pt-online-schema-change` / `gh-ost`）或在低峰期分阶段迁移。
- **`DROP TABLE` vs `DELETE`**：`DELETE FROM logs;` 会逐行记录日志并触发触发器，慢但可回滚；`DROP TABLE` 直接销毁整张表的结构与数据，毫秒级完成但不可轻易挽回。

---

## 六、DML 增删改实战与 `WHERE` 安全铁律 (DB-06)

### 1. 插入（`INSERT`）与幂等更新（`UPSERT`）

```sql
-- 1. 单行与多行批量插入（1 条语句插多行比拆成多条语句快得多）
INSERT INTO batches (batch_key, source)
VALUES
    ('b-20261120-01', 'auth-svc'),
    ('b-20261120-02', 'pay-svc');

INSERT INTO logs (batch_id, line_no, level, message, latency_ms)
VALUES
    (1, 1, 'INFO',  'boot ok',         12),
    (1, 2, 'ERROR', 'db timeout',      3050),
    (1, 3, 'WARN',  'retry 1',         NULL),
    (2, 1, 'ERROR', 'invalid token',   8),
    (2, 2, 'INFO',  'healthcheck ok',  2);

-- 2. UPSERT（遇到唯一键冲突时，自动改为更新或忽略，避免报错中断）
-- SQLite / PostgreSQL 写法：
INSERT INTO batches (batch_key, source)
VALUES ('b-20261120-01', 'auth-svc-v2')
ON CONFLICT(batch_key) DO UPDATE SET source = excluded.source;
```

### 2. 修改（`UPDATE`）与删除（`DELETE`）的防呆三步法

数据库界流传一句血泪梗：**“删库跑路，往往只是写 `UPDATE` 或 `DELETE` 时忘了写 `WHERE`。”**
一旦执行 `DELETE FROM logs;` 或 `UPDATE logs SET level = 'INFO';`，整张表所有历史数据都会被瞬间抹平或覆盖！

**强制养成“防呆三步走”习惯**：

```sql
-- 第 1 步：先用一模一样的 WHERE 条件 SELECT 一遍，肉眼核对命中的行数和内容！
SELECT id, batch_id, level, message FROM logs WHERE batch_id = 1 AND level = 'WARN';

-- 第 2 步：包在显式事务里执行修改，并核对受影响行数
BEGIN;
UPDATE logs SET latency_ms = 100 WHERE batch_id = 1 AND level = 'WARN';
-- 检查结果是否符合预期：
SELECT id, latency_ms FROM logs WHERE batch_id = 1 AND level = 'WARN';

-- 第 3 步：确认无误再 COMMIT；一旦发现改多了，立刻 ROLLBACK！
COMMIT;
```

> **软删除（Soft Delete）vs 硬删除（Hard Delete）**：真实业务里，用户账号、订单或审计日志极少直接 `DELETE FROM` 物理抹除，而是增加 `deleted_at TEXT NULL` 列（`UPDATE ... SET deleted_at = ...`）。好处是防误删可找回、不破坏历史外键审计链；代价是所有查询都得记得加 `WHERE deleted_at IS NULL`，且唯一约束需改用部分索引 `CREATE UNIQUE INDEX ... ON users(email) WHERE deleted_at IS NULL;`。

---

## 七、基础查询：`SELECT`、`WHERE` 逻辑组合、`IN` 与 `LIKE` (DB-07)

### 1. 逻辑运算符优先级陷阱

SQL 逻辑运算符的优先级从高到低是：**`NOT` > `AND` > `OR`**。
如果你想查“批次 1 或批次 2 里的 `ERROR` 日志”：

```sql
-- 错误写法！等价于 batch_id = 1 OR (batch_id = 2 AND level = 'ERROR')
-- 会把批次 1 的 INFO/WARN 也全查出来！
SELECT id, batch_id, level FROM logs
WHERE batch_id = 1 OR batch_id = 2 AND level = 'ERROR';

-- 正确写法：永远给 OR 条件加圆括号，或者直接用 IN
SELECT id, batch_id, level FROM logs
WHERE (batch_id = 1 OR batch_id = 2) AND level = 'ERROR';

SELECT id, batch_id, level FROM logs
WHERE batch_id IN (1, 2) AND level = 'ERROR';
```

### 2. `NOT IN` 遇上 `NULL` 导致整条查询归零的经典坑

```sql
-- 假设某次子查询或列表里不小心混入了一个 NULL：
SELECT * FROM logs WHERE latency_ms NOT IN (12, NULL);
```

这条语句等价于 `latency_ms != 12 AND latency_ms != NULL` $\rightarrow$ `... AND UNKNOWN` $\rightarrow$ **对于每一行结果都是 `FALSE` 或 `UNKNOWN`，最终返回 0 行！**
**工程准则**：凡是集合否定排除，优先用 `NOT EXISTS`（详见 `DB-12`），或者确保 `NOT IN` 的列表/子查询显式过滤了 `IS NOT NULL`。

### 3. `BETWEEN` 与 `LIKE` 模糊匹配

- `BETWEEN 10 AND 100` 是**闭区间** $[10, 100]$（包含两端 `10` 和 `100`）。**注意千万别用 `BETWEEN` 查日期字符串闭区间**，比如 `'2026-11-01' AND '2026-11-30'` 会漏掉 `'2026-11-30T12:00:00Z'`！时间范围永远写**半开区间**：`created_at >= '2026-11-01' AND created_at < '2026-12-01'`。
- `LIKE` 通配符：
  - `%`：匹配任意 0 个或多个字符（`LIKE '%timeout%'`）。
  - `_`：精确匹配 1 个字符（`LIKE 'retry _'`）。
  - 如果你要搜的内容本身就包含 `%` 或 `_`（例如查 `100%`），必须指定转义符：`WHERE message LIKE '%100\%%' ESCAPE '\'`。
  - **注意**：SQLite 默认 `LIKE` 对 ASCII 字母不区分大小写（`'error'` 能匹配 `'ERROR'`），而 PostgreSQL 的 `LIKE` 区分大小写（不区分要用 `ILIKE`）。

---

## 八、排序、去重与分页：`ORDER BY`、`LIMIT/OFFSET` 与游标分页 (DB-08)

### 1. `ORDER BY` 与去重 `DISTINCT`

```sql
-- 按耗时降序排（空值放最后），耗时相同按 id 升序打破平局！
SELECT id, level, latency_ms
FROM logs
ORDER BY latency_ms DESC NULLS LAST, id ASC;

-- 查看库里一共出现了哪几种日志级别
SELECT DISTINCT level FROM logs;
```

> **分页时排序列有重复值，为什么必须加 `, id ASC`？**
> 假设有 50 条日志 `level` 都是 `'ERROR'`，你只写 `ORDER BY level LIMIT 10 OFFSET 0` 和 `OFFSET 10`。由于 `level` 全部相等，数据库没有规定这 50 行的内部顺序，第 1 页和第 2 页完全可能出现**重复行或漏行**！加上唯一主键 `, id ASC` 才能让排序结果 100% 确定。

### 2. 为什么深分页（`LIMIT 20 OFFSET 1000000`）是性能杀手？

```text
传统 OFFSET 分页（查第 50001 页，每页 20 条）：
  数据库必须老老实实数完前面 1,000,020 条记录 -> 扔掉前 1,000,000 条 -> 只返回最后 20 条！
  耗时随页码线性暴涨 O(Offset + Limit)，且翻页期间如果新插入了数据，下一页会出现重复条目（数据漂移）！

游标 / Keyset 分页（记住上一页最后一条的 (created_at, id) 或 id）：
  直接利用 B+Tree 索引一跳定位到 id > last_seen_id，只读取接下来的 20 条！
  耗时恒定 O(log N + Limit)，第 1 页和第 50001 页一样只需 1 毫秒，且永不重复！
```

```sql
-- 传统慢分页（第 10 万行以后越来越卡）：
SELECT id, level, message FROM logs ORDER BY id DESC LIMIT 20 OFFSET 100000;

-- Keyset（游标）分页：假设上一页最后一条返回了 id = 98521
SELECT id, level, message
FROM logs
WHERE id < 98521
ORDER BY id DESC
LIMIT 20;

-- 多列排序的 Keyset 分页（按 latency_ms 降序 + id 降序，支持行值比较语法）：
SELECT id, latency_ms, message
FROM logs
WHERE (latency_ms, id) < (350, 98521)
ORDER BY latency_ms DESC, id DESC
LIMIT 20;
```

---

## 本课常见 1 行反例坑（对照排查）

- 写 `SELECT` 不写 `ORDER BY`，却指望数据库永远按插入顺序返回结果 → 建索引或 `VACUUM` 后顺序立刻变化。
- SQLite 新建连接忘记执行 `PRAGMA foreign_keys = ON;` → 外键形同虚设，垃圾子行照样插进去。
- 用 `FLOAT` / `REAL` 存金额或用 `WHERE note != 'ok'` 期待把 `NULL` 行一起查出来 → 浮点精度丢失、`NULL` 行静默消失。
- `WHERE a = 1 OR b = 2 AND c = 3` 不加括号 → `AND` 优先绑定导致逻辑完全跑偏。
- 在 `NOT IN (SELECT ...)` 中子查询返回了一行 `NULL` → 整条查询永远返回 0 行空结果集。
- `BETWEEN '2026-11-01' AND '2026-11-30'` 查询带时分秒的时间列 → 漏掉 11 月 30 日当天 `00:00:00` 之后的所有数据。
- 做深分页坚持用 `LIMIT 20 OFFSET 500000` → 数据库每次抛弃 50 万行拖垮 CPU，且新数据写入导致翻页重复。

---

## 5 个梯度微练习

### 练习 1（三值逻辑判断）

表 `t` 有 3 行数据：`latency_ms` 分别为 `10`、`50`、`NULL`。执行 `SELECT COUNT(*) FROM t WHERE latency_ms <= 50 OR latency_ms > 50;` 会输出几？

<details>
<summary>核对答案</summary>

输出 **`2`**（不是 `3`！）。对于 `NULL` 那一行，`NULL <= 50` 是 `UNKNOWN`，`NULL > 50` 也是 `UNKNOWN`，`UNKNOWN OR UNKNOWN` 依然是 `UNKNOWN`，被 `WHERE` 过滤掉了。只有加了 `OR latency_ms IS NULL` 才会覆盖全部 3 行。

</details>

### 练习 2（外键与级联动作）

如果某张 `orders` 表用 `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`，当管理员误删了一个 `users` 账号时，会发生什么灾难？金融核心业务应该改成什么策略？

<details>
<summary>核对答案</summary>

`ON DELETE CASCADE` 会连带把该用户的全部历史订单从 `orders` 表里**物理级联删光**，造成财务对账灾难！核心业务表应使用默认的 `ON DELETE RESTRICT`（禁止直接删除有订单的用户），并在业务层采用“软删除/注销标记（`status = 'DELETED'`）”代替物理删除。

</details>

### 练习 3（`NOT IN` 遇 `NULL` 排错）

下面两条 SQL 哪条更安全，为什么？
A: `SELECT id FROM batches WHERE id NOT IN (SELECT batch_id FROM logs);`
B: `SELECT id FROM batches b WHERE NOT EXISTS (SELECT 1 FROM logs l WHERE l.batch_id = b.id);`

<details>
<summary>核对答案</summary>

**B 更安全**。如果 `logs.batch_id` 允许为 `NULL` 且存在哪怕一条 `batch_id IS NULL` 的行，写法 A 的 `NOT IN` 会返回 **0 行**（全军覆没）；而 `NOT EXISTS` 只关心子查询是否能匹配到行，完全免疫 `NULL` 陷阱，且在优化器中通常更容易走反连接（Anti-Join）索引。

</details>

### 练习 4（游标分页改写）

某日志浏览接口当前按 `ORDER BY created_at DESC, id DESC` 展示，每次取 20 条。上一页最后一条记录为 `created_at = '2026-11-20T08:15:00Z'`, `id = 8840`。请写出不依赖 `OFFSET` 的下一页 SQL。

<details>
<summary>核对答案</summary>

```sql
SELECT id, created_at, level, message
FROM logs
WHERE (created_at, id) < ('2026-11-20T08:15:00Z', 8840)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
（等价显式展开写法为：`WHERE created_at < '2026-11-20T08:15:00Z' OR (created_at = '2026-11-20T08:15:00Z' AND id < 8840)`，配合 `(created_at, id)` 联合索引效果最佳。）

</details>

### 练习 5（动手建表与安全修改）

打开 `sqlite3 practice01.db`，运行第五节的 `batches` 与 `logs` 建表语句，随后测试：
1. 关闭与开启 `PRAGMA foreign_keys = ON;` 时，分别尝试插入 `batch_id = 999` 的日志，观察行为差异。
2. 插入几行数据后，按“先 `SELECT` 核对 → `BEGIN` → `UPDATE` → 核对 → `ROLLBACK`”流程演练一次后悔药撤销。

<details>
<summary>核对答案</summary>

1. 未开启 `PRAGMA foreign_keys = ON;` 时，插入 `batch_id = 999` 会静默成功（留下孤儿行）；开启后，立刻报错 `Runtime error: FOREIGN KEY constraint failed (19)`。
2. 事务 `ROLLBACK` 后重新 `SELECT`，目标行恢复为修改前的原始值，证明 DML 安全网生效。

</details>
