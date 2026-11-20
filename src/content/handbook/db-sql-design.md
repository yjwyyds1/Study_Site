---
title: "SQL 进阶与关系模式设计：聚合、连接、窗口函数、范式与安全防线"
description: "系统掌握聚合与 NULL 规则、SQL 逻辑执行顺序、6 类 JOIN 与过滤陷阱、子查询与递归 CTE、窗口函数、视图触发器生成列、1NF–BCNF 范式权衡、ER 建模、时序日志表设计、SQL 注入防线及字符集/UTC 时间规范（DB-09 ~ DB-19）。"
order: 100
category: "存储与数据库"
tags: ["数据库", "SQL", "JOIN", "窗口函数", "CTE", "范式", "ER建模", "SQL注入", "时序数据"]
related: ["handbook/db-zero-start", "handbook/storage-sqlite", "handbook/db-indexes-internals"]
sources: []
---

## 本课只解决这 1 类问题

学会了单表 `SELECT / INSERT / UPDATE` 只是刚刚会“翻一页表格”。真实后端开发每天要面对的，是**多表关联报表、按组统计 Top-N、防数据冗余与异常、把高并发日志按天归档、以及守住 SQL 注入与时区乱码底线**。

本篇承接零基础入门（覆盖课程 `DB-09` ~ `DB-19`），前半部分打通 SQL 声明式查询的完整表达力，后半部分给出经得起线上流量考验的库表设计原则与安全规范。

> **继续使用统一沙盒表**：本文所有 SQL 均可直接在上一课建好的 `batches` 与 `logs` 表中运行（可顺手多插几条不同 `batch_id`、`level`、`latency_ms` 的数据）。

---

## 一、聚合函数与 `NULL` 计数法则 (DB-09)

聚合函数把“多行”压缩成“一个标量结果”，日常高频使用的有 5 个：`COUNT`、`SUM`、`AVG`、`MIN`、`MAX`。但在面对 `NULL` 时，它们的行为极易让人算错账：

| 聚合写法 | 对 `NULL` 行的处理规则 | 全表或全分组都是 `NULL` 时的返回值 |
| --- | --- | --- |
| `COUNT(*)` | **不忽略 `NULL`**，统计所有满足 `WHERE` 的行数 | `0` |
| `COUNT(col)` | **自动跳过 `col IS NULL` 的行**，只数非空行 | `0` |
| `COUNT(DISTINCT col)` | 跳过 `NULL`，再按非空值去重计数 | `0` |
| `SUM(col)` / `AVG(col)` | **跳过 `NULL`**！`AVG` 的分母是**非空行数**，不是总行数！ | **`NULL`**（注意不是 `0`！） |
| `MIN(col)` / `MAX(col)` | 跳过 `NULL` 取极值 | **`NULL`** |

```sql
-- 假设 logs 有 4 行，latency_ms 分别为: 10, 20, NULL, NULL
SELECT
    COUNT(*)                         AS total_rows,        -- 结果: 4
    COUNT(latency_ms)                AS non_null_rows,     -- 结果: 2
    AVG(latency_ms)                  AS avg_valid_only,    -- 结果: (10+20)/2 = 15.0!
    AVG(COALESCE(latency_ms, 0))     AS avg_treat_null_0,  -- 结果: (10+20+0+0)/4 = 7.5!
    COALESCE(SUM(latency_ms), 0)     AS safe_sum           -- 若全为 NULL 则返回 0 而非 NULL
FROM logs;
```

**条件聚合（一行 SQL 统计多个维度）**：不需要扫 3 遍表分别查 `INFO`、`WARN`、`ERROR` 的总数，用 `FILTER (WHERE ...)`（SQLite 3.30+ / PostgreSQL）或通用 `SUM(CASE WHEN ...)` 一次扫描搞定：

```sql
SELECT
    batch_id,
    COUNT(*)                                       AS total,
    COUNT(*) FILTER (WHERE level = 'ERROR')        AS error_cnt,  -- SQLite / PG 现代写法
    SUM(CASE WHEN level = 'WARN' THEN 1 ELSE 0 END) AS warn_cnt   -- 所有 SQL 引擎通用写法
FROM logs
GROUP BY batch_id;
```

---

## 二、`GROUP BY` / `HAVING` 与 SQL 逻辑执行顺序 (DB-10)

为什么 SQL 写成 `SELECT ... FROM ... WHERE ... GROUP BY ...`，却**不能**在 `WHERE` 里引用 `SELECT` 起好的别名？因为**书写顺序 ≠ 引擎逻辑执行顺序**！

```text
SQL 逻辑执行顺序（脑中必须背下的 8 步流水线）：

  1. FROM / JOIN    ──▶ 先把涉及的表做笛卡尔积并按 ON 条件拼成一张大宽表
  2. WHERE          ──▶ 在分组前逐行过滤（此时还没有聚合结果，也不能用 SELECT 别名！）
  3. GROUP BY       ──▶ 把剩下的行按分组键折叠成若干个“桶”
  4. 聚合计算       ──▶ 对每个桶计算 COUNT / SUM / AVG
  5. HAVING         ──▶ 对“桶”进行过滤（把不满足条件的分组整个扔掉）
  6. 窗口函数       ──▶ 在保留所有分组/明细结果上计算 OVER(...) 窗口值
  7. SELECT / DISTINCT ─▶ 挑选最终要输出的列、给列起别名、去重
  8. ORDER BY / LIMIT ──▶ 排序并截取最终返回的 N 行（此时才可用 SELECT 别名！）
```

### `WHERE` vs `HAVING` 的本质区别与性能原则

- **`WHERE` 在分组之前工作**：过滤原始明细行，能直接走索引，越早把无用数据过滤掉，后面分组排序的内存开销越小。
- **`HAVING` 在分组之后工作**：专门用来过滤聚合值（例如“只找出 `ERROR` 超过 5 条的批次”）。
- **铁律**：能放进 `WHERE` 的过滤条件（比如 `batch_id > 10`），**绝对不要拖到 `HAVING` 里写**！

```sql
-- 反例（低效）：把所有批次全分组聚合完，才在 HAVING 里丢掉 batch_id <= 10 的组
SELECT batch_id, COUNT(*) AS err_cnt
FROM logs
WHERE level = 'ERROR'
GROUP BY batch_id
HAVING batch_id > 10 AND COUNT(*) >= 5;

-- 正例（高效）：先用 WHERE 借助索引砍掉无关行，再用 HAVING 筛选聚合结果
SELECT batch_id, COUNT(*) AS err_cnt
FROM logs
WHERE level = 'ERROR' AND batch_id > 10
GROUP BY batch_id
HAVING COUNT(*) >= 5
ORDER BY err_cnt DESC;
```

> **为什么标准 SQL / PostgreSQL 要求 `SELECT` 里的非聚合列必须全部出现在 `GROUP BY` 中？**
> 假设按 `batch_id` 分组，一个批次里有 100 条不同的 `message`。如果不写 `GROUP BY batch_id, message`，数据库根本不知道该吐出这 100 条 `message` 里的哪一条！SQLite 和旧版 MySQL（未开 `ONLY_FULL_GROUP_BY`）会随机挑一行糊弄过去，这在生产环境是隐蔽的 Bug 来源，务必严格遵守“**`SELECT` 列表中要么是 `GROUP BY` 的列，要么被聚合函数包裹**”。

---

## 三、六大 `JOIN` 全解与左连接“暗变内连接”陷阱 (DB-11)

关系数据库把数据拆成多张表后，就需要用 `JOIN` 把相关行重新拼起来。

```text
假设 A = batches (id: 1, 2, 3), B = logs (batch_id: 1, 1, 2, NULL)

  INNER JOIN: 只保留两边能配对成功的行           ──▶ 匹配 id = 1, 2（id=3 和 NULL 丢弃）
  LEFT JOIN : 保留左表(A)全部行，右表配不上填 NULL ──▶ id=3 的日志列全为 NULL
  RIGHT JOIN: 保留右表(B)全部行，左表配不上填 NULL ──▶ batch_id=NULL 的批次列全为 NULL
  FULL JOIN : 左右两边全保留，各自配不上都填 NULL   ──▶ id=3 和 batch_id=NULL 都保留
  CROSS JOIN: 无条件两两组合（3 × 4 = 12 行笛卡尔积）
```

### 1. 基础多表连接与自连接（Self-Join）

```sql
-- 1. LEFT JOIN：统计每个批次有多少条 ERROR（即使 0 条 ERROR 的批次也必须显示出来！）
SELECT b.id, b.batch_key, COUNT(l.id) AS error_count
FROM batches AS b
LEFT JOIN logs AS l
       ON l.batch_id = b.id AND l.level = 'ERROR' -- 注意：右表过滤必须写在 ON 里！
GROUP BY b.id, b.batch_key;

-- 2. 自连接（Self-Join）：查员工及其直属上司（同一张 employees 表自己连自己）
CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, manager_id INTEGER);
SELECT e.name AS employee, m.name AS manager
FROM employees AS e
LEFT JOIN employees AS m ON e.manager_id = m.id;
```

### 2. 全网最高频的 `LEFT JOIN` 陷阱

把上面统计批次 `ERROR` 数的 `AND l.level = 'ERROR'` 挪到 `WHERE` 里会怎样？

```sql
-- 致命错误写法！
SELECT b.id, b.batch_key, COUNT(l.id) AS error_count
FROM batches AS b
LEFT JOIN logs AS l ON l.batch_id = b.id
WHERE l.level = 'ERROR'
GROUP BY b.id, b.batch_key;
```

对于没有任何日志（或者没有 `ERROR` 日志）的批次 3，在 `LEFT JOIN` 阶段虽然保留了 `b.id = 3`，但右表字段 `l.level` 被填成了 `NULL`。接着进入 **`WHERE l.level = 'ERROR'` 阶段**，`NULL = 'ERROR'` 结果为 `UNKNOWN`，**直接把批次 3 整行删掉了！** 这条 `LEFT JOIN` 实际上被退化成了一条 `INNER JOIN`！

**记住口诀**：`LEFT JOIN` 时，**过滤右表的条件放进 `ON`，过滤左表的条件放进 `WHERE`**；如果想专门找出“没有任何日志的空批次”（反连接 Anti-Join），才写 `WHERE l.id IS NULL`。

> **警惕连接爆炸（Join Explosion）**：如果一对多关系上同时 `LEFT JOIN` 两张子表（比如一个批次同时 `JOIN logs` 和 `JOIN tags`），10 条日志 × 5 个标签会产生 50 行中间结果，直接导致 `SUM` 或 `COUNT(*)` 翻倍算重！应先分别聚合子表，再 `JOIN` 汇总结果。

---

## 四、子查询（`IN` / `EXISTS`）与 CTE / 递归 CTE (DB-12)

### 1. 非相关子查询 vs 相关子查询（`IN` vs `EXISTS`）

```sql
-- 标量子查询 / IN（非相关：内层子查询独立跑一次生成集合）
SELECT * FROM batches
WHERE id IN (SELECT DISTINCT batch_id FROM logs WHERE level = 'ERROR');

-- EXISTS（相关子查询：对外表每一行去内表探测，一旦找到 1 条匹配立刻短路返回 TRUE！）
SELECT b.*
FROM batches AS b
WHERE EXISTS (
    SELECT 1 FROM logs AS l
    WHERE l.batch_id = b.id AND l.level = 'ERROR'
);
```

- **什么时候选 `EXISTS` / `NOT EXISTS`？**
  1. 需要否定判断（“没有 ERROR 的批次”）时，**`NOT EXISTS` 100% 免疫 `NULL` 陷阱**（而 `NOT IN` 一旦遇到 `NULL` 就全盘返回空）。
  2. 当外表较小而内表很大且在关联键 `(batch_id, level)` 上有索引时，`EXISTS` 找到第一条就停，极其高效。

### 2. CTE（`WITH` 公用表表达式）与递归 CTE

嵌套 4 层的子查询像俄罗斯套娃一样难以阅读。用 **`WITH` CTE** 可以把复杂查询拆成自上而下的“命名流水线”：

```sql
WITH error_batches AS (
    SELECT batch_id, COUNT(*) AS err_cnt
    FROM logs
    WHERE level = 'ERROR'
    GROUP BY batch_id
),
ranked AS (
    SELECT b.batch_key, e.err_cnt
    FROM batches AS b
    JOIN error_batches AS e ON e.batch_id = b.id
)
SELECT * FROM ranked WHERE err_cnt >= 1 ORDER BY err_cnt DESC;
```

遇到**树形层级结构**（如评论嵌套、微服务调用链 `parent_span_id -> span_id`、组织架构图）或**生成连续数字/日期序列**，普通 `JOIN` 无法处理未知深度的嵌套，此时必须请出**递归 CTE（`WITH RECURSIVE`）**：

```sql
-- 实战 1：生成 1..7 连续数字序列（常用来 LEFT JOIN 补齐没有数据的空日期！）
WITH RECURSIVE seq(n) AS (
    SELECT 1                 -- 1. 锚点成员（初始行）
    UNION ALL
    SELECT n + 1 FROM seq    -- 2. 递归成员（引用自身）
    WHERE n < 7              -- 3. 终止条件（极其重要！防止死循环）
)
SELECT n FROM seq;

-- 实战 2：从根节点向下遍历员工汇报树（附带防环深度保护 depth < 20）
WITH RECURSIVE org_tree AS (
    SELECT id, name, manager_id, 0 AS depth, name AS path
    FROM employees
    WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || ' -> ' || e.name
    FROM employees AS e
    JOIN org_tree AS t ON e.manager_id = t.id
    WHERE t.depth < 20       -- 工程防线：避免脏数据成环导致死循环打爆内存
)
SELECT * FROM org_tree;
```

---

## 五、窗口函数（Window Functions）：保留明细的同时做横向统计 (DB-13)

`GROUP BY` 最大的痛点是“把多行压扁成一行”，原本每条日志的 `id` 和 `message` 都丢了。**窗口函数（`OVER (...)`）** 则是 SQL 最强大的特性之一：**在不折叠原始行数的情况下，把“同组数据”或“前后几行”放进一个窗口里算指标，贴回每一行末尾！**

```text
普通 GROUP BY:  10 行明细 ──▶ 折叠成 3 行统计结果（丢失单行细节）
窗口函数 OVER:  10 行明细 ──▶ 仍然输出 10 行明细，每行多出 1 列“同组排名 / 累计值 / 上一行差值”！
```

### 1. 必会四大核心窗口函数家族

| 类别 | 函数 | 典型用途 |
| --- | --- | --- |
| **排名三兄弟** | `ROW_NUMBER()` / `RANK()` / `DENSE_RANK()` | 相同分数分别给出 `1,2,3`（严格递增）、`1,1,3`（并列跳号）、`1,1,2`（并列不跳号） |
| **前后偏移** | `LAG(col, 1)` / `LEAD(col, 1)` | 取同组内“上一行”或“下一行”的值（算相邻日志间隔、环比增长） |
| **聚合开窗** | `SUM(x) OVER(...)` / `AVG(x) OVER(...)` | 算组内占比、移动平均（Moving Average）、累计求和（Running Total） |
| **首尾取数** | `FIRST_VALUE(col)` / `LAST_VALUE(col)` | 取窗口第一名或最后一名对比 |

```sql
-- 场景 A：每个批次内，找出耗时最高的前 2 条日志（经典的“分组 Top-N”面试必考题！）
WITH ranked_logs AS (
    SELECT
        id,
        batch_id,
        latency_ms,
        ROW_NUMBER() OVER (
            PARTITION BY batch_id
            ORDER BY latency_ms DESC NULLS LAST, id ASC
        ) AS rn
    FROM logs
)
SELECT id, batch_id, latency_ms, rn
FROM ranked_logs
WHERE rn <= 2;

-- 场景 B：计算同一批次内，当前日志与上一条日志的耗时变化 + 累计总耗时
SELECT
    id,
    batch_id,
    latency_ms,
    latency_ms - LAG(latency_ms, 1) OVER (PARTITION BY batch_id ORDER BY id) AS diff_from_prev,
    SUM(COALESCE(latency_ms, 0)) OVER (
        PARTITION BY batch_id
        ORDER BY id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_latency
FROM logs;
```

> **窗口帧（Window Frame）的 `ROWS` vs `RANGE` 暗坑**：如果你写 `SUM(x) OVER (ORDER BY score)` 而没写后面的 `ROWS BETWEEN ...`，SQL 默认使用的是 **`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`**。一旦两行的 `score` 相等，`RANGE` 会把所有同分数的行打包一起累加，造成“还没到那一行就提前加上去了”的诡异结果！算按行累计时，**务必显式写出 `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`**。

---

## 六、视图、触发器与生成列 (DB-14)

1. **视图（View）**：一段起好名字、存进数据库元数据的只读 `SELECT` 查询语句（不占额外存储空间，每次查视图时展开底层 SQL）。用于隐藏敏感字段（如对外只暴露不含密码哈希的 `v_public_users`）或封装复杂多表关联。
   - **物化视图（Materialized View，PostgreSQL 支持）**：把查询结果真真实实算出来落盘保存，读起来毫秒级，代价是需要定期 `REFRESH MATERIALIZED VIEW` 刷新过期数据。
2. **触发器（Trigger）**：在 `INSERT / UPDATE / DELETE` 前后自动执行的钩子逻辑。
   - **适用场景**：强审计日志表（记录谁改了关键配置）。
   - **工程警示**：不要把核心业务逻辑塞进多层嵌套的触发器里！隐藏在数据库里的隐式副作用会让排查线上 Bug 和做压测扩容变得无比痛苦，**业务联动尽量写在显式应用代码事务里**。
3. **生成列（Generated Columns）**：由同表其他列自动计算得出的列（SQLite 3.31+ / MySQL 5.7+ / PG 12+ 均支持）。
   - `VIRTUAL`：查询时现算，不占磁盘。
   - `STORED`：写入时算好存盘，**可以给它建索引**（非常适合为 JSON 里的某个字段建索引加速查询！）。

```sql
-- 视图：封装每日报错统计
CREATE VIEW IF NOT EXISTS v_batch_errors AS
SELECT batch_id, COUNT(*) AS err_count
FROM logs WHERE level = 'ERROR' GROUP BY batch_id;

-- 生成列：从文本时间或 JSON 中自动提取字段，并支持建索引
CREATE TABLE events (
    id         INTEGER PRIMARY KEY,
    payload    TEXT NOT NULL,
    event_type TEXT GENERATED ALWAYS AS (json_extract(payload, '$.type')) STORED
);
CREATE INDEX idx_events_type ON events(event_type);
```

---

## 七、关系模式规范化（1NF / 2NF / 3NF / BCNF）与反范式权衡 (DB-15)

如果把“用户姓名、用户邮箱、商品名称、商品单价、购买数量”全塞进一张表里，会发生三大**数据异常**：
- **插入异常**：还没卖出去的新商品，因为没有订单号，居然存不进数据库！
- **更新异常**：某商品涨价了，你得把历史上 10 万条买过它的订单全改一遍，改漏一行数据就矛盾！
- **删除异常**：某顾客取消了唯一的一笔订单，结果连该顾客的基本信息也被删没了！

数据库范式（Normal Forms）就是一套逐级消除冗余的手术刀：

| 范式级别 | 一句话通俗判定标准 | 典型改造动作 |
| --- | --- | --- |
| **1NF（第一范式）** | **单元格不可再分**（拒绝列内塞逗号分隔列表或数组） | 把 `tags = "net,db"` 拆成独立关联表或子行 |
| **2NF（第二范式）** | 满足 1NF，且**非主属性完全依赖整个主键**（消除“部分依赖”，针对联合主键） | 订单明细表主键是 `(order_id, product_id)`，不能把只依赖 `order_id` 的 `customer_name` 放进来 |
| **3NF（第三范式）** | 满足 2NF，且**非主属性之间没有传递依赖**（不能“A 决定 B，B 又决定 C”） | 员工表里存了 `dept_id`，就不能再冗余存 `dept_phone`（部门电话应放在 `departments` 表） |
| **BCNF（巴斯-科德范式）** | 强化版 3NF：**每一个决定因子都必须是候选键**（消除主属性之间的部分/传递依赖） | 修复多个重叠复合候选键引发的极少数冗余异常 |

### 工程实战：什么时候应该故意“反范式（Denormalization）”？

范式不是越高越好！3NF 拆得太碎，查一个页面要 `JOIN` 7 张表，性能直接崩溃。**三大合理反范式场景**：
1. **历史快照必须冻结**：订单明细表 `order_items` 必须冗余保存下单瞬间的 `unit_price_snapshot`，绝不能靠 `JOIN products` 实时读取商品当前价格——否则商家一改价，历史账单全乱了！
2. **高频统计缓存列**：文章表冗余一个 `comment_count` 字段，列表页展示十万篇文章时不用每次对千万条评论表做 `COUNT(*)`。
3. **读多写少的宽表 / 报表归档**：直接把维度信息打平存进分析表（配合异步更新或增量同步）。

---

## 八、ER 实体关系建模：`1:1`、`1:N`、`M:N` 落地映射 (DB-16)

把业务需求翻译成表结构时，所有的实体连线最终都会落到三种基本关系上：

```text
1. 一对一 (1:1) ── 垂直拆表（冷热/权限分离）
   [users (id PK, email)] 1 ────── 1 [user_profiles (user_id PK/FK, bio, avatar_blob)]
   落地规则：在从表放主表主键，同时设为 PRIMARY KEY 或 UNIQUE + FOREIGN KEY

2. 一对多 (1:N) ── 最常见关系
   [batches (id PK, batch_key)] 1 ────── N [logs (id PK, batch_id FK, level, message)]
   落地规则：永远在“多 (N)”的那一端放外键指向“一 (1)”端的主键

3. 多对多 (M:N) ── 必须引入中间关联表（Junction Table）
   [users (id PK)] M ────── N [roles (id PK)]
   拆解为两个 1:N：
   [users] 1 ──< [user_roles (user_id FK, role_id FK, granted_at, PRIMARY KEY(user_id, role_id))] >── 1 [roles]
```

**`1:1` 拆表什么时候值得做？**
当一张表某些列很大或极少访问（如 `avatar_blob`、`raw_request_body`、`身份证实名敏感信息`），而列表页每秒钟只扫描高频短字段（`id`, `username`, `status`）时，把冷/大字段拆成 `1:1` 副表，能让主表每页（4KB/16KB）多塞好几倍的行数，缓存命中率飙升！

---

## 九、时序数据与日志表 Schema 设计实战 (DB-17)

在 `LogScan` 或监控系统里，日志和指标（Time-Series）有鲜明的写入和清理特征：**只追加、很少修改、总是按最近时间范围查、到期批量删除**。如果像普通业务表一样建一张大表一直往里塞，半年后就会陷入泥潭：
- 每天用 `DELETE FROM logs WHERE created_at < '2026-10-01';` 清理过期日志，会锁表卡死线上写入，且删除后留下的空洞（碎片）不会自动把磁盘空间还给操作系统。

**工程最佳实践清单**：
1. **幂等批次键与有序主键**：保留 `batches(batch_key UNIQUE)`，确保网络超时重试不会写重数据；主键使用单调递增整数或时间前缀有序 ID（如 UUIDv7 / ULID），避免随机 UUIDv4 造成 B+Tree 页分裂和随机磁盘写（详见 `DB-32`）。
2. **按时间分表 / 分区（Time Partitioning）**：按天或按月建表/分区（如 `logs_2026_11`、`logs_2026_12`）。清理 30 天前的旧日志时，只需一句 `DROP TABLE logs_2026_10;` 或 `ALTER TABLE logs DETACH PARTITION ...`，**1 毫秒瞬时释放全部磁盘空间，零碎片、零逐行锁**！
3. **预聚合滚动表（Rollup Table）**：把原始毫秒级日志按小时/分钟异步汇总进 `hourly_error_stats(bucket_utc, service, level, cnt)`，大盘展示最近 90 天趋势时直接查只有几千行的汇总表，避免扫描几十亿行原始日志。

---

## 十、SQL 注入攻防原理与参数化查询铁律 (DB-18)

如果图省事在代码里直接用 `+` 拼接用户输入拼出 SQL 字符串，就等于把数据库大门的钥匙交给了黑客：

```cpp
// 致命反例：字符串拼接 SQL！
std::string sql = "SELECT id, role FROM users WHERE username = '" + user_input + "';";
```

假设攻击者在登录框输入：`admin' OR '1'='1' -- `，拼出来的 SQL 瞬间变成：

```sql
SELECT id, role FROM users WHERE username = 'admin' OR '1'='1' -- ';
```

`'1'='1'` 永远为真，`--` 把后面原本校验密码的代码全注释掉了，直接绕过鉴权！在支持多语句的执行接口里，甚至能拼出 `'; DROP TABLE logs; --` 毁灭数据，或用 `UNION SELECT` 拖走全库密码。

### 为什么 Prepared Statement（参数化查询）能 100% 免疫 SQL 注入？

```text
字符串拼接：数据与指令混为一谈 ──▶ SQL 词法/语法分析器把用户输入里的单引号当成控制语法！
参数化查询：先编译后传参（指令与数据彻底物理隔离）：
  1. Prepare 阶段：把 "SELECT id FROM users WHERE username = ?" 发给引擎编译成固定语法树；
  2. Bind 阶段   ：把 "admin' OR '1'='1" 当成纯粹的字节值塞进第 1 个槽位，绝不再经过 SQL 语法解析！
```

### 重要边界：哪些地方**不能**用 `?` 占位符，该怎么防？

SQL 引擎编译语法树时必须知道表名、列名和排序关键词，因此 **`?` 只能绑定列值（字面量），不能绑定表名、列名或 `ASC/DESC`**！
如果业务允许前端传入排序字段（如 `?sort=latency_ms&dir=desc`），**绝不能直接拼进去**，必须走**严格白名单映射**：

```cpp
// C++ 白名单防线：把不可信输入映射为编译期确定的受控字面量
std::string_view safe_sort_column(std::string_view user_col) {
    if (user_col == "created_at") return "created_at";
    if (user_col == "latency_ms") return "latency_ms";
    return "id"; // 任何未知输入一律回退到安全默认值
}
std::string_view safe_sort_dir(std::string_view dir) {
    return (dir == "asc" || dir == "ASC") ? "ASC" : "DESC";
}
```

---

## 十一、字符集、排序规则（Collation）与 UTC 时间戳规范 (DB-19)

### 1. 字符集与排序规则（Charset & Collation）

- **UTF-8 与 MySQL 的历史大坑**：MySQL 里叫 `utf8` 的字符集其实是个阉割版（最多只占 3 字节），遇到 emoji（`😀`）、生僻汉字直接报错或截断！MySQL 建库建表**必须强制指定 `utf8mb4`**；PostgreSQL 的 `UTF8` 和 SQLite 默认的 UTF-8 均原生支持完整 4 字节 Unicode。
- **Collation（排序规则）决定三件事**：字母大小写是否视为相等（`ci` = case-insensitive / `BINARY`）、重音是否敏感（`ai` / `as`）、以及 `ORDER BY` 排序顺序。
  - **踩坑警告**：在 SQLite 里，`BINARY` 索引对 `WHERE level LIKE 'err%'` 可能用不上（因为默认 `LIKE` 不区分大小写，除非加 `COLLATE NOCASE` 或 `PRAGMA case_sensitive_like = ON`）；在 MySQL 里两张表用不同的 collation 做 `JOIN` 会直接报错或导致索引失效！

### 2. 时间存储铁律：库里只存 UTC，展示才转本地时区

```text
[用户北京浏览器 UTC+8] ──(转成 UTC)──▶ [数据库存 UTC: "2026-11-20T00:00:00Z" 或 epoch_ms]
                                                │
[纽约运维人员 UTC-5]  ◀──(按需渲染)─────────────┘
```

1. **为什么绝不能存本地时间（比如直接存北京时间 `2026-11-20 08:00:00` 不带时区）？**
   - 跨机房/跨国团队协作时，你分不清这行是 UTC+8 还是 UTC+0；
   - **夏令时（DST）恐怖事件**：北美/欧洲切换夏令时那天，凌晨 `02:30` 会**连续出现两次**或者**凭空消失一小时**，按本地时间排序和算耗时差会直接算出负数！
2. **两种稳妥的工程存法**：
   - **ISO-8601 UTC 字符串**（SQLite 常用）：`'2026-11-20T08:00:00.123Z'`——按字典序排列**严格等于**时间先后顺序，人类可读且可直接走索引区间查。
   - **Unix 纪元毫秒/微秒整数 `INT64`**（高性能时序常用）：如 `1795161600123`——体积固定 8 字节，整数比较极快；注意区分秒（10 位）与毫秒（13 位），字段名最好自带单位后缀 `created_at_ms` 或 `ts_utc`。
3. **墙上时钟 vs 单调时钟**：记录“事件发生在几点几分”用系统 UTC 墙上时间（`system_clock`）；测量“这条 SQL 执行了多少毫秒”必须用单调时钟（C++ `std::chrono::steady_clock`），防止 NTP 校时把系统时间往回拨导致耗时变成负数。

---

## 本课常见 1 行反例坑（对照排查）

- 以为 `AVG(latency_ms)` 会把 `NULL` 当成 `0` 算分母 → 实际上 `AVG` 自动忽略 `NULL`，分母偏小导致均值虚高。
- 在 `LEFT JOIN` 后面用 `WHERE right_table.col = 'x'` 过滤右表 → 把右表匹配为 `NULL` 的左表行全删光，暗中退化成 `INNER JOIN`。
- 在 `WHERE` 子句里引用 `SELECT a + b AS total` 的别名 `total` → `WHERE` 执行时 `SELECT` 还没跑，直接报 `no such column`。
- 用 `SUM(x) OVER (ORDER BY k)` 算累计值却不写 `ROWS BETWEEN ...` → 默认 `RANGE` 把重复 `k` 的多行打包同时累加，出现阶跃跳变。
- 递归 CTE 不加深度上限（`WHERE depth < 20`）→ 遇到脏数据父子成环时查询跑死打爆内存。
- 用字符串拼接实现动态 `ORDER BY sort_col` 且未做白名单校验 → 即使值都用了 `?` 参数绑定，排序字段依然能成为 SQL 注入入口。
- MySQL 建表使用 `CHARSET=utf8` 或数据库存本地不带时区的时间字符串 → emoji 写入失败、跨区夏令时算错账。

---

## 5 个梯度微练习

### 练习 1（聚合与三值逻辑）

`orders` 表有 4 行，`discount` 列的值分别为 `10, 20, NULL, NULL`。以下查询输出什么？
```sql
SELECT COUNT(*), COUNT(discount), SUM(discount), AVG(discount) FROM orders;
```

<details>
<summary>核对答案</summary>

输出 **`4 | 2 | 30 | 15.0`**。`COUNT(*)` 统计全部 4 行；`COUNT(discount)`、`SUM` 和 `AVG` 均跳过 `NULL`，只计算 `10` 和 `20` 这两行（`30 / 2 = 15.0`）。

</details>

### 练习 2（`LEFT JOIN` 纠错）

需求：“查出所有导入批次 `batches` 的 `batch_key`，以及它们各自有多少条 `ERROR` 日志；没有 `ERROR` 的批次必须显示 `0`。” 下面写法哪里错了，如何修正？
```sql
SELECT b.batch_key, COUNT(*) AS err_cnt
FROM batches b
LEFT JOIN logs l ON b.id = l.batch_id
WHERE l.level = 'ERROR'
GROUP BY b.id, b.batch_key;
```

<details>
<summary>核对答案</summary>

有两个 Bug：
1. `WHERE l.level = 'ERROR'` 把无 `ERROR` 的批次整行滤掉了，应把 `l.level = 'ERROR'` 移入 `ON` 条件；
2. `COUNT(*)` 在左连接无匹配时会把右表全 `NULL` 的那一行也数成 `1`，必须改成 **`COUNT(l.id)`**（对右表非空主键计数，全 `NULL` 时才返回 `0`）！
修正：
```sql
SELECT b.batch_key, COUNT(l.id) AS err_cnt
FROM batches b
LEFT JOIN logs l ON b.id = l.batch_id AND l.level = 'ERROR'
GROUP BY b.id, b.batch_key;
```

</details>

### 练习 3（窗口函数实战）

某成绩表 `scores(student, subject, score)`，请用一条 SQL 查出**每个科目（`subject`）分数最高的前 2 名学生**（要求保留并列第 1 名，比如并列两个第 1 名时两人都取，第三名不取，或者取到第二高分）。请说明 `ROW_NUMBER()`、`RANK()`、`DENSE_RANK()` 在这里的区别。

<details>
<summary>核对答案</summary>

```sql
WITH ranked AS (
    SELECT student, subject, score,
           DENSE_RANK() OVER (PARTITION BY subject ORDER BY score DESC) AS rk
    FROM scores
)
SELECT student, subject, score, rk FROM ranked WHERE rk <= 2;
```
- `ROW_NUMBER()`：强行只取 2 个人，同分也会随机淘汰一个；
- `RANK()`：若有两人并列第 1（`1, 1, 3`），第二高分是第 3 名会被 `rk <= 2` 漏掉，只返回并列第 1 的两人；
- `DENSE_RANK()`：序列为 `1, 1, 2`，能稳定取出“前 2 个最高分数段”的所有人。

</details>

### 练习 4（范式与反范式权衡）

设计一个电商订单系统：`products(id, name, current_price)`、`orders(id, user_id, created_at)`、`order_items(order_id, product_id, quantity, ...)`。请问 `order_items` 表里**应不应该**冗余存一个 `unit_price` 字段？这是否违背了 3NF？为什么？

<details>
<summary>核对答案</summary>

**必须存 `unit_price`（下单瞬间价格快照）**！且这**并不违背 3NF**——因为 `order_items.unit_price` 在语义上代表的是“当时这笔订单成交的单价”，它函数依赖于 `(order_id, product_id)`，而 `products.current_price` 代表“商品现在的目录售价”，两者随时间推移是两个不同的事实！如果不冗余存快照，商家改价后历史订单总额会全部跟着篡改。

</details>

### 练习 5（动态排序防注入代码审查）

如果一段 C++ 服务代码把 HTTP 请求参数 `sort_by` 和 `order` 用 `sqlite3_bind_text` 绑定到：
`"SELECT id, level FROM logs ORDER BY ? ?;"`
会发生什么？正确的工程写法是什么？

<details>
<summary>核对答案</summary>

1. `ORDER BY ?` 不会报错，但 SQLite 会把 `?` 当成一个**常量字符串字面量**（比如 `'latency_ms'`），导致按同一常量排序（完全无效）；而 `ORDER BY ? ?` 第二个 `?` 会直接报 SQL **语法错误**（`ASC`/`DESC` 关键字不能参数化）。
2. 正确做法是对 `sort_by` 和 `order` 使用**严格的枚举/字符串白名单映射**，只允许映射到硬编码的合法列名和 `"ASC"`/`"DESC"` 再拼接到 SQL 模板里。

</details>
