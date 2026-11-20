---
title: "存储引擎与索引内核：页布局、B+Tree、回表、查询计划、LSM-Tree 与列式存储"
description: "深入数据库存储引擎底层：Slotted Page 槽页布局、B-Tree vs B+Tree、聚簇索引与回表、覆盖/部分/表达式索引、最左前缀与索引失效陷阱、EXPLAIN ANALYZE 读图、三种连接算法、LSM-Tree 与列式存储（DB-30 ~ DB-39）。"
order: 102
category: "存储与数据库"
tags: ["数据库", "存储引擎", "B+Tree", "索引优化", "EXPLAIN", "LSM-Tree", "列式存储"]
related: ["handbook/db-sql-design", "handbook/storage-sqlite", "handbook/db-tx-distributed", "handbook/os-fs-io"]
sources: []
---

## 本篇只解决这 1 类问题

很多开发者对数据库性能的理解停留在“慢了就随便加个索引”。结果加了一堆索引后，写入变慢了、磁盘爆了、`EXPLAIN` 里照样显示全表扫描，甚至分不清为什么分析几十亿行日志时 ClickHouse/Parquet 比 MySQL 快几百倍。

本篇带你掀开存储引擎的引擎盖（覆盖课程 `DB-30` ~ `DB-39`）：从硬盘上 4KB/16KB 数据页内部的字节排布讲起，一直拆解到 B+Tree 与回表代价、复合索引优化、三种 Join 执行算子，再到现代写密集引擎 LSM-Tree 与 OLAP 列式存储的本质权衡。

---

## 一、Slotted Page 槽页布局与堆文件（Heap File） (DB-30)

操作系统和磁盘控制器不按“1 个字节”或“1 行记录”读写硬盘，而是以固定大小的**数据页（Page）**为最小调度单位（SQLite 默认 `4KB`，PostgreSQL 默认 `8KB`，MySQL InnoDB 默认 `16KB`）。

既然每一行长度不一（变长字符串 `TEXT`/`VARCHAR`），数据库怎么把几百条变长记录塞进一个固定 `8KB` 页里，删掉中间某一行时又不用挪动所有兄弟行？答案是精巧的 **Slotted Page（槽页）布局**：

```text
+-----------------------------------------------------------------------+
| Page Header (页头: PageID, LSN 校验位, 空闲起止偏移, 槽位总数)          |
+-----------------------------------------------------------------------+
| Slot 0 (offset=7950, len=120) | Slot 1 (offset=7800, len=150) | ... ──┼──▶ 槽位数组向下生长
|                                                                       |
|                     Free Space (中间连续空闲区)                         |
|                                                                       |
| ... ◀── 真实行数据从页尾向上生长 | [Tuple 1 (150B)] | [Tuple 0 (120B)]   |
+-----------------------------------------------------------------------+
```

1. **内部间接寻址（`RID = (PageID, SlotID)`）**：索引或其他指针只记录 `(页号, 槽位号)`，**绝不写死物理字节偏移**！这样当页内发生碎片整理（Compact）搬移 `Tuple` 位置时，只需改页内 `Slot` 数组里的偏移量，外部索引全部不用动！
2. **Buffer Pool（缓冲池）**：引擎不会每次查数据都调 `read()` 系统调用，而是在内存开辟一块 Buffer Pool 缓存热点页（常用 Clock 或 LRU-K 替换策略，防止全表扫描一次性把热点缓存全冲垮）。
3. **超长列溢出（Overflow / TOAST）**：如果一条记录有 1MB 的 `TEXT`，塞不进 8KB 页里，引擎只在本页留一个指针，把真正大文本拆链存到专门的溢出页（PG 叫 TOAST，SQLite 叫 Overflow Page）。

---

## 二、B-Tree vs B+Tree：为什么数据库全用 B+Tree？ (DB-31)

在内存里我们喜欢用红黑树（每个节点 2 个分叉）或二分查找数组。但在磁盘上，红黑树是灾难：1000 万行数据树高约 24 层，查一次要跳 24 个随机磁盘地址（机械盘几百毫秒，SSD 也要几十次页读取）。

**B-Tree / B+Tree 的核心魔法是“压扁树高”**：让每个节点刚好占满 1 个磁盘页（如 `16KB`），一个节点可以塞下 **500 ~ 1000 个路由键（高扇出 Fan-out）**！

```text
                      [  100  |  500  ]               ◀── 第 1 层 根节点 (常驻内存)
                     /        |        \
         [20 | 60]       [200 | 350]      [700 | 900] ◀── 第 2 层 分支节点 (仅存 Key+指针!)
        /   |    \        ...              ...
     +----+----+----+   +----+----+----+
     |1..19|20..|60..|⇄|100..|200..|350..| ⇄ ...      ◀── 第 3 层 叶子节点 (双向链表串联!)
     +----+----+----+   +----+----+----+
       ↑ 存完整行数据或主键指针，支持高速范围扫描 (Range Scan)!
```

算一笔账：假设每页扇出 `500`，叶子页每页存 `100` 行数据：
- **3 层 B+Tree** 就能装下 $500 \times 500 \times 100 = 2500\text{ 万}$ 行数据！
- 根节点常驻内存，查任意一行只需 **2 次磁盘随机 I/O**！

### 为什么工业界数据库选 B+Tree 而不是原始 B-Tree？

| 对比维度 | B-Tree（数据散落所有节点） | B+Tree（数据全在叶子，叶子双向链表） |
| --- | --- | --- |
| **分支节点容量（扇出）** | 内部节点也要塞完整的行数据，每页只能放几十个 Key，**树更高** | 内部节点**只存 Key + 子页号**，扇出高达上千，**树更矮** |
| **范围查询（`BETWEEN` / `>`）** | 必须做中序遍历反复上下回溯父节点，性能抖动 | 定位到起点叶子后，直接沿**叶子双向链表**顺序一路扫完 |
| **单次查询稳定性** | 运气好命中根节点 1 次结束，运气差到叶子 | 永远稳定在最后一层叶子结束，延迟高度可预测 |

---

## 三、聚簇索引、二级索引与“回表（Bookmark Lookup）”代价 (DB-32)

建好 B+Tree 后，叶子节点里到底存**整行数据**还是**指向整行数据的地址**？不同数据库流派给出了两种设计：

1. **聚簇索引（Clustered Index，如 MySQL InnoDB 主键、SQLite `rowid` / `WITHOUT ROWID`）**：
   - 表数据本身**就长在主键 B+Tree 的叶子节点里**（一张表只能按 1 种物理顺序存放，所以只能有 1 个聚簇索引）。
   - **普通二级索引（Secondary Index）的叶子节点**：存的是 `(索引列值, 主键值 PK)`。
2. **堆表 + 非聚簇索引（Heap Table，如 PostgreSQL、Oracle 默认表）**：
   - 表行数据无序放在 Heap 页里；**所有索引**（包括主键索引）的叶子都存 `(索引列值, 物理行地址 ctid=(PageID, SlotID))`。

### 什么是“回表（Bookmark Lookup）”？为什么有时有索引却反而全表扫？

```text
查询: SELECT id, batch_id, message FROM logs WHERE level = 'ERROR';
当前只有索引: idx_logs_level (level) ── 叶子仅存 (level, id)

执行路径（发生回表！）:
  [1] 在 idx_logs_level 二级索引树定位到所有 level='ERROR' 的叶子条目 → 拿到 id = 105, 892, 3401...
  [2] 拿着每个 id，重新回到主表（聚簇索引 B+Tree 或 Heap 页）里做 1 次随机 I/O，捞出 message 列！
```

如果表里有 100 万行，其中 30 万行都是 `'ERROR'`（选择性太低），回表意味着做 **30 万次随机磁盘跳转**！优化器算一笔账发现“直接从头到尾顺序扫 100 万行主表（顺序 I/O，预读极快）比跳 30 万次回表快得多”，于是会**故意放弃索引，选择全表扫描（`SCAN` / `Seq Scan`）**——这是优化器的聪明保护，不是 Bug！

> **为什么千万别用随机 UUIDv4 做聚簇索引主键？**
> 自增整数（或单调递增的 UUIDv7 / ULID）每次插入都稳稳追加在最右边的叶子页；而完全随机的 UUIDv4 每次插入都要往 B+Tree 中间某个冷页硬塞，引发频繁的**页分裂（Page Split）、50% 空间碎片和随机磁盘刷脏**，写入性能大跌！

---

## 四、覆盖索引、部分索引与表达式索引 (DB-33)

### 1. 覆盖索引（Covering Index / Index-Only Scan）：彻底消灭回表

既然回表是为了回去拿 `message` 列，只要把 `message` 也顺手塞进二级索引里（`CREATE INDEX idx ON logs(level, message)`，或 PostgreSQL 用 `CREATE INDEX idx ON logs(level) INCLUDE (message)`）：

- 索引叶子节点里同时拥有 `level`、`message` 和 `id`；
- 优化器一看所需的全部列都在索引里，**直接跳过主表，实现 `USING COVERING INDEX` / `Index Only Scan`**！（注：PostgreSQL 因为 MVCC 可见性信息在堆页上，只有当该页在 Visibility Map 中标记为“全可见”时才能真正跳过堆表。）

### 2. 部分索引（Partial Index）：瘦身 99% 的黑科技

假设 `logs` 表有 1 亿条日志，99.9% 都是 `INFO`，你只关心未处理的 `ERROR`（假设只占 1 万条）：

```sql
-- 传统索引：把 1 亿条 INFO 也全塞进索引，白白浪费几 GB 空间和写入维护时间
-- 部分索引（SQLite / PostgreSQL 原生支持）：只为真正需要查的 0.1% 建索引！
CREATE INDEX idx_logs_pending_err ON logs(created_at) WHERE level = 'ERROR';
```

### 3. 表达式索引（Expression / Functional Index）

如果业务代码经常按不区分大小写的邮箱查用户：`WHERE lower(email) = ?`，普通 `email` 索引完全用不上！直接建表达式索引（或配合生成列，见 `DB-14`）：

```sql
CREATE INDEX idx_users_lower_email ON users(lower(email));
```

---

## 五、复合索引的“最左前缀原则”与排序对齐 (DB-34)

假设建了一条三列复合索引：`CREATE INDEX idx_abc ON t(a, b, c);`。这棵 B+Tree 里的条目严格按字典序排列：**先按 `a` 排，`a` 相同时按 `b` 排，`b` 也相同时按 `c` 排**。

```text
索引有序排列示例 (a, b, c):
  (1, 10, 100)
  (1, 10, 200)
  (1, 20,  50)   ◀── 注意：在 a=1 的内部，b 是有序的 (10, 10, 20)，但跨过 b=10 到 b=20 后，c 从 200 跳回 50！
  (2,  5, 300)
```

把这张小图记在脑海里，所有最左前缀判断都能瞬间秒推，不用死记硬背：

| 查询条件 | 索引利用率判断 | 底层原因 |
| --- | --- | --- |
| `WHERE a = 1 AND b = 10 AND c = 200` | **`a, b, c` 全部用上** | 先定死 `a=1`，再定死 `b=10`，在其内部 `c` 严格有序 |
| `WHERE a = 1 AND b = 10` | **`a, b` 用上** | 匹配最左两列前缀 |
| `WHERE b = 10 AND c = 200` | **彻底失效（全表扫）** | 跨不同的 `a`（`1` 和 `2`），全局来看 `b` 是乱序的（`10, 10, 20, 5`）！ |
| `WHERE a = 1 AND c = 200` | **仅 `a` 走范围定位** | 在 `a=1` 的区间内，跳过了 `b`，`c` 整体是无序的（`100, 200, 50`） |
| `WHERE a = 1 AND b > 10 AND c = 50` | **`a, b` 走定位，`c` 断掉** | **`b` 用了范围条件 `>` 后，后面的 `c` 不再全局有序！** |
| `WHERE a = 1 ORDER BY b, c` | **免排序直出** | `a=1` 内部天然按 `(b, c)` 排好序，直接顺着叶子链表输出！ |
| `WHERE a = 1 ORDER BY b ASC, c DESC` | **需额外临时排序** | 方向一正一反，无法顺着同一方向扫链表（除非建索引时显式写 `(a, b ASC, c DESC)`） |

**设计黄金法则**：联合索引把**等值过滤列放最左边，排序列或范围过滤列放右边**；区分度更高、过滤掉最多数据的列尽量排在前面。

---

## 六、基数（Cardinality）与索引失效 6 大陷阱 (DB-35)

**基数（Cardinality）** 指一列里有多少个不重复的值；**选择性（Selectivity）** $= \frac{\text{不重复值个数}}{\text{总行数}}$。主键的选择性是 $1.0$，而只有 `0/1` 两个值的 `is_deleted` 列选择性极差（平均命中 50% 的行，建单列索引几乎永远不如全表扫）。

就算字段选择性极高、索引也建好了，下面 **6 种 SQL 写法也会瞬间让索引报废**：

| 索引失效反例（踩坑写法） | 为什么索引失效？ | 精准改写方案 |
| --- | --- | --- |
| `WHERE msg LIKE '%timeout%'` | 开头是通配符 `%`，B+Tree 无法从前缀二分 | 仅后缀模糊用 `'timeout%'`；全文搜索改用 **FTS5 / GIN 倒排索引** |
| `WHERE strftime('%Y', ts) = '2026'` 或 `WHERE id + 1 = 100` | **对索引列做函数运算或算术表达式**，B+Tree 存的是原值 | 改写为等价列区间：`WHERE ts >= '2026-01-01' AND ts < '2027-01-01'` 或 `WHERE id = 99` |
| `WHERE phone_text = 13800138000` | **隐式类型转换**！字符串列与整数比较会变成 `CAST(phone_text AS INT)` | 严格匹配列类型，传字符串参数 `'13800138000'` |
| `WHERE a = 1 OR unindexed_b = 2` | `OR` 另一侧没有索引，引擎只能扫全表 | 给 `b` 建索引，或拆成 `SELECT ... WHERE a=1 UNION ALL SELECT ... WHERE b=2 AND a!=1` |
| `WHERE status != 'OK'` / `IS NOT NULL` | 否定条件通常命中绝大部分表行，回表成本太高 | 改用正向枚举 `IN (...)`，或依赖优化器自动全表扫 |
| 排序规则（Collation）不匹配 | 建索引是 `BINARY`，查询强制 `COLLATE NOCASE` | 统一建索引与查询的 Collation，或建表达式索引 |

---

## 七、看懂 `EXPLAIN QUERY PLAN` 与 `EXPLAIN ANALYZE` (DB-36)

调优不靠猜，必须看执行计划的实测证据。

### 1. SQLite：`EXPLAIN QUERY PLAN` + `ANALYZE`

```sql
-- 1. 写入批量数据后，先运行 ANALYZE 收集直方图/统计信息存入 sqlite_stat1
ANALYZE;

-- 2. 查看执行计划
EXPLAIN QUERY PLAN
SELECT id, message FROM logs WHERE level = 'ERROR' AND batch_id = 1 ORDER BY id;
```

读懂核心关键词：
- `SCAN logs`：全表扫描（危险信号！大表慢查询元凶）。
- `SEARCH logs USING INDEX idx_name (level=? AND batch_id=?)`：走二级索引二分定位，再回表查 `message`。
- `SEARCH logs USING COVERING INDEX idx_name (...)`：覆盖索引，**免回表**最优状态！
- `USE TEMP B-TREE FOR ORDER BY`：索引顺序没对齐 `ORDER BY`，引擎在临时空间做了一次 $O(N \log N)$ 排序。

### 2. PostgreSQL：`EXPLAIN (ANALYZE, BUFFERS)` 读图指南

PostgreSQL 的 `EXPLAIN` 只是估算，加上 **`ANALYZE`** 才会**真实执行**（写语句测试请包在 `BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;` 里！）并打印实际耗时和缓冲区命中页数：

- **`Seq Scan` vs `Index Scan` vs `Index Only Scan`**：分别对应全表顺序扫、二级索引回表、覆盖索引免回表。
- **`Bitmap Index Scan` + `Bitmap Heap Scan`**：PostgreSQL 独门绝技！当一个条件命中较多行（比如 5% 行）时，直接 `Index Scan` 会对同一数据页反复随机跳读。PG 先用索引把命中行所在的**页号与槽位**绘成一张内存位图（Bitmap），再**按物理页号从小到大顺序读取 Heap 页**，把随机 I/O 变成半顺序 I/O！
- **核对估算行数 vs 真实行数（`rows=10` vs `actual rows=50000`）**：两者差几个数量级说明统计信息严重过期（`ANALYZE` 没跑）或列之间强相关，导致优化器选错 Join 算法！

---

## 八、三大 Join 执行算法：Nested Loop、Hash Join 与 Sort-Merge Join (DB-37)

写一句 `SELECT * FROM batches b JOIN logs l ON b.id = l.batch_id;`，引擎在底层到底怎么把两张表拼起来？核心就三种物理算子：

| 算法名称 | 核心原理与复杂度 | 最佳适用场景 |
| --- | --- | --- |
| **Nested Loop Join（嵌套循环连接）** | 外表（驱动表）每取 1 行，去内表查匹配行；若内表连接键有索引（**Index NLJ**），内层查只需 $O(\log M)$ | **小表驱动大表**，且大表连接列有高选择性索引（OLTP 毫秒级点查最爱） |
| **Hash Join（哈希连接）** | 把较小那张表全扫一遍放进内存建哈希表（Build 阶段），再扫大表逐行查哈希表（Probe 阶段），$O(N + M)$；内存不够时按哈希分片溢写磁盘（Grace Hash Join） | **两张大表做等值连接（`=`）且没有合适索引时**速度极快（仅支持等值，不支持 `<`/`>`） |
| **Sort-Merge Join（归并连接）** | 把两张表各自按连接键排好序（如果已经有 B+Tree 索引就免排序！），再用**双指针**同步往后扫一遍，$O(N + M)$ | **数据本身已按连接键有序**、内存放不下哈希表的大表连接、或非等值区间对齐 |

> **小表驱动大表原则**：无论 SQLite（主要用 Nested Loop / 自动临时索引）还是 MySQL，在 Nested Loop Join 中都应尽量让**过滤后行数最少的那张表做驱动表（外表）**，减少外层循环次数和内表索引探测次数。

---

## 九、LSM-Tree 存储引擎：MemTable、WAL、SSTable 与 Compaction (DB-38)

B+Tree 虽然查询快，但在**海量高并发随机写入**场景（如时序指标、RocksDB、LevelDB、Cassandra、TiKV）有一块硬伤：**改一个 100 字节的 Key，也必须把整个 16KB 磁盘页读进内存改完再随机刷回磁盘**（严重的随机写与写放大）。

**LSM-Tree（Log-Structured Merge-Tree）** 的核心哲学极其暴力优雅：**绝对不原地修改磁盘上的旧文件，把所有随机写全部变成内存写 + 磁盘顺序追加写！**

```text
写入请求 (PUT key=42, val="...")
   │
   ├──▶ [1. 磁盘 WAL 顺序追加写] (仅保证掉电不丢，顺序写比随机写快百倍!)
   └──▶ [2. 内存 MemTable (跳表 SkipList 有序结构)]
               │ (写满比如 64MB 后冻结为 Immutable MemTable，后台异步 Flush)
               ▼
        [3. 磁盘 L0 SSTable] (Sorted String Table，彻底不可变! 按 Key 有序，内部含 DataBlock + SparseIndex + BloomFilter)
               │ (L0 文件数太多后触发后台 Compaction 归并排序去重，压入下层)
               ▼
        [4. 磁盘 L1 → L2 → L3 SSTable] (每层容量 ×10，同层内部 Key 区间严格互不重叠!)
```

### LSM-Tree 怎么读数据？如何靠 Bloom Filter 挽救读性能？

因为新数据先写进内存，旧覆盖或删除（写入一个特殊**墓碑标记 Tombstone**）散落在不同层的 SSTable 里，读一个 Key 必须按**从新到旧**的顺序查：
1. 先查内存 `MemTable` / `Immutable MemTable`；
2. 查 `L0` 层的所有 SSTable（因为 L0 是刚刷下来的，Key 区间彼此重叠）；
3. 再逐层查 `L1`、`L2`...（每层内部有序且不重叠，每层最多只需二分隔出 1 个文件）。

为了防止“查一个根本不存在的 Key，却要把几十个 SSTable 全打开翻一遍”，每个 SSTable 头部都带有一个内存友好的 **Bloom Filter（布隆过滤器）**：
- 布隆过滤器说 **“一定不存在”** $\rightarrow$ **100% 不在这个文件里，直接跳过！省掉磁盘 I/O！**
- 布隆过滤器说 **“可能存在”** $\rightarrow$ 才真正去读 Sparse Index（稀疏索引）定位数据块。

### RUM 权衡：写放大、读放大与空间放大

- **Size-Tiered Compaction（STCS）**：几个大小相近的 SSTable 直接合并成更大的文件。**写放大最小**，但合并瞬间需要预留翻倍的临时磁盘空间（空间放大高达 50%），且读时要翻的文件多。
- **Leveled Compaction（LCS，RocksDB 默认）**：每层大小固定递增 10 倍，严格保证 L1+ 同层文件 Key 不重叠。**读更快、空间浪费极少（~10%）**，但每次从 L0 往下归并可能重写 L1 的大量数据，**写放大较大**。

---

## 十、行式存储 vs 列式存储（OLTP vs OLAP） (DB-39)

为什么同一份 10 亿行订单/日志数据，MySQL 跑一句 `SELECT level, AVG(latency_ms) FROM logs GROUP BY level;` 要跑 5 分钟，而 ClickHouse / DuckDB / Apache Parquet 只需要 **0.3 秒**？秘密全在**物理存储布局**上：

```text
逻辑表:  [ (id=1, level='INFO',  latency=12),
           (id=2, level='ERROR', latency=3050),
           (id=3, level='INFO',  latency=8) ]

1. 行式存储 (Row-Oriented: MySQL / PG / SQLite —— 面向 OLTP 高频单行增删改查):
   磁盘页字节流: | 1, 'INFO', 12 | 2, 'ERROR', 3050 | 3, 'INFO', 8 |
   特点: 一次 I/O 读出整条完整记录；但只想统计 latency 平均值时，被迫把占 90% 体积的 message 也全读进内存！

2. 列式存储 (Columnar: ClickHouse / Parquet / DuckDB —— 面向 OLAP 海量分析聚合):
   id 文件/块     : | 1 | 2 | 3 | ...
   level 文件/块  : | 'INFO' | 'ERROR' | 'INFO' | ...   (极易字典编码压缩: 0, 1, 0!)
   latency 文件/块: | 12 | 3050 | 8 | ...              (连续同类型整数数组，直接上 CPU SIMD 向量化加速!)
```

列式存储带来四大降维打击优势：
1. **列裁剪（Projection Pushdown）**：查询只用到 2 列，就只读磁盘上那 2 列的数据块，I/O 直接砍掉 90%！
2. **极致压缩率**：同一列数据类型完全一致且大量重复（如 `level` 只有 4 个枚举值，时间戳相邻差值极小），用 **RLE（游程编码）、字典编码、Delta 编码**，压缩率动辄 **5x ~ 20x**！
3. **CPU 缓存友好与 SIMD 向量化执行**：连续存放的 `int64_t` 数组几乎 100% 命中 L1/L2 Cache，且单条 AVX2/AVX-512 指令一次同时处理 8~16 个数值的过滤或累加。
4. **缺点**：不适合高频单行 `UPDATE` 或按主键随机点查整行（修改 1 行需要同时改写几十个独立列文件！），因此生产中常采用 **OLTP（MySQL/PG）接核心交易 + CDC 同步进 OLAP 列存（ClickHouse/Doris）做报表分析**的架构。

---

## 本课常见 1 行反例坑（对照排查）

- 用完全随机的 `UUIDv4` 字符串做 InnoDB 聚簇主键 → 插入不停触发 B+Tree 页分裂和随机刷脏，写入性能雪崩且二级索引膨胀。
- 对 `created_at` 建了索引，查询却写成 `WHERE strftime('%Y-%m', created_at) = '2026-11'` → 函数包裹列导致索引彻底失效，改为半开时间区间。
- 建了 `(a, b, c)` 索引后写 `WHERE b = 1 AND c = 2` 或 `WHERE a > 10 AND b = 1 ORDER BY c` → 违反最左前缀或范围截断规则，走不上完整索引定位。
- 给只有 `true/false` 两个值的 `is_active` 列单独建 B+Tree 索引 → 选择性太低，优化器宁愿全表扫也不回表。
- 只用 `EXPLAIN` 不加 `ANALYZE` 看估计值 → 统计信息过期导致 `rows=1` 误导判断，真实执行扫了几十万行。
- 企图把列式存储（ClickHouse）当 MySQL 用，每秒发几千次单行 `UPDATE`/`DELETE` → 触发列文件频繁重写合并直接拖垮集群。

---

## 5 个梯度微练习

### 练习 1（最左前缀与复合索引设计）

有一张亿级大表 `orders(id, user_id, status, created_at, amount)`，最高频核心查询为：
`SELECT id, amount FROM orders WHERE user_id = ? AND status = 'PAID' AND created_at >= ? ORDER BY created_at DESC LIMIT 20;`
如果只能建 **1 条** 复合索引，列顺序应该怎么排？能做到免回表和免临时排序吗？

<details>
<summary>核对答案</summary>

最佳复合索引为：**`(user_id, status, created_at, amount)`**（或 PostgreSQL 写 `ON orders(user_id, status, created_at DESC) INCLUDE (amount)`）。
- `user_id` 和 `status` 都是等值过滤，放在最左；
- `created_at` 既是范围过滤又用于 `ORDER BY` 排序，放在等值列之后，顺着索引叶链表就能倒序直接取出前 20 条，**免临时排序**；
- `amount`（加上聚簇键/自带的 `id`）也都在索引里，**覆盖索引免回表**！

</details>

### 练习 2（回表与全表扫抉择）

表 `logs` 有 100 万行，在 `level` 列上有普通二级索引 `idx_level`。为什么查 `WHERE level = 'FATAL'`（只有 50 行）时走了索引，而查 `WHERE level = 'INFO'`（有 90 万行）时优化器却选择了全表扫描（`SCAN`）？

<details>
<summary>核对答案</summary>

因为查 `idx_level` 拿到 90 万个主键值后，必须进行 **90 万次随机回表 I/O** 去主表读取其他列。随机跳读 90 万次（很多数据页甚至会被重复读多次）的磁盘代价远高于直接按物理顺序扫一遍主表（顺序 I/O + 操作系统预读）。优化器基于成本估算放弃二级索引是完全正确的。

</details>

### 练习 3（索引失效改写）

找出下面 SQL 索引失效的原因并改写为可命中索引的形式（假设 `created_at` 和 `phone` 列均有索引，其中 `phone` 为 `TEXT` 类型）：
```sql
SELECT id FROM users WHERE phone = 13800138000 OR substr(created_at, 1, 7) = '2026-11';
```

<details>
<summary>核对答案</summary>

这里踩了三个坑：`phone = 13800138000` 发生了文本与数字的隐式类型转换；`substr(created_at, ...)` 对索引列用了函数；`OR` 连接两个不同条件也容易使单索引失效。改写：
```sql
SELECT id FROM users WHERE phone = '13800138000'
UNION
SELECT id FROM users WHERE created_at >= '2026-11-01' AND created_at < '2026-12-01';
```
（如果确认两个条件不可能命中同一行或业务允许去重在外层，用 `UNION ALL` 更快。）

</details>

### 练习 4（LSM-Tree 读写放大与墓碑）

在 LSM-Tree 存储引擎中，当执行一条 `DELETE(key=100)` 时，为什么它不能立刻去磁盘的 SSTable 文件里把 `key=100` 抠掉？真正的删除是在什么时候发生的？

<details>
<summary>核对答案</summary>

因为所有落盘后的 SSTable 都是**不可变文件（Immutable）**，原地修改会破坏顺序追加写模型。所以 `DELETE` 实际上是向内存 MemTable 追加写入一条带 **`Tombstone`（墓碑标记）** 的新记录；读取时如果先在较新层遇到墓碑，就停止向下层找并返回“不存在”。直到后台 **Compaction（合并压缩）** 把包含旧值的最底层 SSTable 和包含墓碑的层合并到一起时，旧记录和墓碑才会被真正物理丢弃、释放磁盘空间。

</details>

### 练习 5（行存 vs 列存 I/O 估算）

某宽表有 `100` 个字段，每行平均 `1000` 字节，共 `1 亿` 行（总计 `100 GB`）。现在执行一句分析 SQL：`SELECT SUM(amount) FROM table;`（其中 `amount` 是 8 字节 `INT64`）。分别估算行式存储（无索引）与列式存储（按未压缩算）至少需要从磁盘读取多少数据量？

<details>
<summary>核对答案</summary>

- **行式存储**：必须把每一行的全部 100 列都读进页缓存再挑出 `amount`，至少读取 **`100 GB`**！
- **列式存储**：只需读取 `amount` 这 1 列的连续文件块，哪怕完全不压缩也只需读取 $8\text{ B} \times 10^8 \approx \mathbf{0.8\text{ GB}}$（加上压缩后通常不到 200 MB），I/O 直接减少 **125 倍以上**！

</details>
