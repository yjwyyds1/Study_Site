# 存储与数据库

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

系统覆盖 **50 讲（`DB-01` 至 `DB-50`）**，从零基础关系模型、表约束与 SQL 查询出发，进阶到多表连接、窗口函数、范式与安全防线；再深入嵌入式 SQLite C++20 RAII 工程实战与 `LogScan v2/v3` 本地持久化契约；最终穿透存储引擎底层（槽页、B+Tree、LSM-Tree、列式存储）与事务分布式内核（ACID、锁与 MVCC、ARIES 恢复、分片与 Saga）。

[项目链与验收](../course-method.md)从 [v0 单文件统计](../../src/content/labs/logscan.md)、[v0.1 多文件工程](../../src/content/labs/logscan-build.md)进入 [v1 多文件聚合](../../src/content/labs/logscan-v1.md)、[v2 本地归档](../../src/content/labs/logscan-v2.md)与 [v3 有界 TCP 服务](../../src/content/labs/logscan-service.md)。服务相关单项源码提供[分帧](../../public/examples/network-framing.cpp)与[队列](../../public/examples/concurrency-queue.cpp)，SQLite 示例内嵌于正文与实验页。

[既有验证记录](../example-verification.md)记录了 Windows 上 v0 的 8 项验收、v0.1 的 5 项 CTest 及两者 CLI 行为比对。下列结果是课程断言或待采集的观测，Linux/WSL、SQLite 示例、设备读取故障和崩溃行为需按实验单独记录。

---

## 第一篇 关系模型、约束与核心 SQL 查询

### 零基础数据抽象与单表增删改查

- 入口：能操作终端或运行基础 C++ 程序，无须前置数据库基础。
- 能力：理解为什么纯文本文件扛不住业务，掌握关系模型、主外键与级联动作、`NULL` 三值逻辑、DDL 建表约束、安全 DML 改写、精确 `WHERE` 过滤及游标分页。
- 检验：能在 `sqlite3` CLI 完成带约束建表、安全事务修改演练、避开 `NOT IN (NULL)` 陷阱并写出 Keyset 分页查询。

<a id="db-01"></a>

#### DB-01 为什么纯文件扛不住真实业务

- 先修：[CPP-02](cpp.md#cpp-02)
- 层级：入门（零基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#一为什么纯文件txt--json扛不住真实业务-db-01)。
- 问题：500 万条日志存成 `.txt`/`.json` 时，查询、并发写、断电安全与数据校验会遇到什么瓶颈？
- 小节
  1. 全文件线性扫描 $O(N)$ vs 索引 $O(\log N)$
  2. 并发交错写与断电半截损坏（Torn Write）
  3. 缺乏字段契约与引用校验的代价
- 能力：能对比纯文本文件与关系型数据库在查询、并发、崩溃原子性和约束上的本质差异。
- 练习与预期结果：搭好 `sqlite3 demo.db` 命令行沙盒并开启 `.headers on` 与 `.mode column`。

<a id="db-02"></a>

#### DB-02 关系模型：表、行、列、域与无序集合

- 先修：[DB-01](#db-01)
- 层级：入门（零基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#二关系模型表行列与集合思维-db-02)。
- 问题：为什么没有写 `ORDER BY` 时数据库没有任何义务按插入顺序返回行？
- 小节
  1. Excel 类比与关系表四要素（表、行、列、域）
  2. 单元格原子性与同质列规则
  3. 集合无序性与行唯一可标识原则
- 能力：能把业务实体抽象成二维关系表，并避免依赖隐式物理顺序。
- 练习与预期结果：画出 `batches` 与 `logs` 关联示意图并指出主键与外键方向。

<a id="db-03"></a>

#### DB-03 主键、外键与级联动作（`ON DELETE`）

- 先修：[DB-02](#db-02)
- 层级：入门（零基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#三主键外键与级联动作on-delete-db-03)。
- 问题：怎样选主键，又怎样防止子表出现指向不存在父记录的“幽灵孤儿行”？
- 小节
  1. 自然键 vs 代理键（自增整数 / 有序 ID）与复合主键
  2. 外键参照完整性与 SQLite `PRAGMA foreign_keys = ON`
  3. `RESTRICT`、`CASCADE`、`SET NULL`、`SET DEFAULT` 选型
- 能力：能按业务风险正确配置 `ON DELETE` 级联策略，并在 SQLite 连接上显式开启外键。
- 练习与预期结果：验证关闭与开启 `PRAGMA foreign_keys = ON` 时插入非法 `batch_id` 的报错差异；分析金融订单误用 `CASCADE` 的风险。

<a id="db-04"></a>

#### DB-04 数据类型与 `NULL` 三值逻辑陷阱

- 先修：[DB-02](#db-02)
- 层级：入门（零基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#四数据类型与-null-的三值逻辑陷阱-db-04)。
- 问题：为什么 `WHERE note != 'ok'` 会悄无声息地漏掉 `note` 为 `NULL` 的行？
- 小节
  1. 核心 SQL 类型选型（为何严禁用 `FLOAT` 存金额）
  2. `NULL`（未知）与三值真值表（`TRUE` / `FALSE` / `UNKNOWN`）
  3. `IS NULL`、`IS NOT DISTINCT FROM`、`COALESCE` 与 `NULLIF`
- 能力：能正确选用精确数值/时间/文本类型，并在所有条件判断中精准处理 `NULL`。
- 练习与预期结果：预测含 `NULL` 列执行 `<= 50 OR > 50` 的命中行数，并用 `IS NULL` / `IS NOT` 修正。

<a id="db-05"></a>

#### DB-05 DDL 数据定义语言与五大约束

- 先修：[DB-03](#db-03)、[DB-04](#db-04)
- 层级：入门（核心基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#五ddl-数据定义语言create--alter--drop-与约束-db-05)。
- 问题：如何用数据库约束把非法数据挡在门外？大表改列有什么风险？
- 小节
  1. DDL / DML / DQL / DCL 分工
  2. `PRIMARY KEY`、`FOREIGN KEY`、`NOT NULL`、`UNIQUE`、`CHECK`、`DEFAULT`
  3. `ALTER TABLE` / `DROP` 规范与大表在线改表警示
- 能力：能独立编写带完整约束与联合唯一键的 `CREATE TABLE` 脚本。
- 练习与预期结果：运行 `batches` 与 `logs` 建表脚本，验证 `CHECK (line_no > 0)` 拦截负数行号、`UNIQUE` 允许多行 `NULL`。

<a id="db-06"></a>

#### DB-06 DML 增删改实战与 `WHERE` 安全铁律

- 先修：[DB-05](#db-05)
- 层级：入门（核心基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#六dml-增删改实战与-where-安全铁律-db-06)。
- 问题：如何批量插数据、幂等更新，并彻底杜绝“忘写 `WHERE` 删光全表”的事故？
- 小节
  1. 多行 `INSERT` 与 `ON CONFLICT ... DO UPDATE`（Upsert）
  2. `UPDATE` / `DELETE` 先 `SELECT` 核对 + 事务保护三步法
  3. 软删除（`deleted_at`）vs 硬删除工程权衡
- 能力：能规范执行 DML 变更，并用显式事务兜底回滚误操作。
- 练习与预期结果：演练“先 `SELECT` → `BEGIN` → `UPDATE` → `ROLLBACK`”撤销修改。

<a id="db-07"></a>

#### DB-07 基础 `SELECT`、`WHERE` 逻辑优先级与 `IN` / `LIKE`

- 先修：[DB-04](#db-04)、[DB-06](#db-06)
- 层级：入门（核心基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#七基础查询selectwhere-逻辑组合in-与-like-db-07)。
- 问题：为什么 `NOT IN` 列表里混入一个 `NULL` 会让整条查询返回 0 行？
- 小节
  1. `NOT` > `AND` > `OR` 优先级与括号习惯
  2. `NOT IN` 遇 `NULL` 归零陷阱与 `NOT EXISTS` 替代
  3. `BETWEEN` 闭区间日期坑与 `LIKE`（`%`/`_`/`ESCAPE`）
- 能力：能写出逻辑严谨的组合过滤条件并规避日期边界与空值陷阱。
- 练习与预期结果：对比 `NOT IN (SELECT ...)` 与 `NOT EXISTS` 在含 `NULL` 列上的输出差异；用半开区间查询整月日志。

<a id="db-08"></a>

#### DB-08 排序、去重与分页：`LIMIT/OFFSET` vs 游标分页

- 先修：[DB-07](#db-07)
- 层级：入门（核心基础）
- 状态：已有[第 0 课：关系模型、表约束与核心 SQL 查询](../../src/content/handbook/db-zero-start.md#八排序去重与分页order-bylimitoffset-与游标分页-db-08)。
- 问题：为什么翻到第 5 万页时 `OFFSET` 越来越慢还会出现重复数据？
- 小节
  1. `ORDER BY` 确定性平局打破（加 `, id ASC`）与 `NULLS LAST`
  2. `LIMIT/OFFSET` 的 $O(\text{Offset})$ 扫描浪费与数据漂移
  3. Keyset（游标）分页行值比较与 $O(\log N)$ 恒定耗时
- 能力：能为高并发列表接口设计无漂移、常数耗时的游标分页查询。
- 练习与预期结果：将 `ORDER BY created_at DESC, id DESC OFFSET 10000` 改写为行值比较 Keyset 分页 SQL。

---

## 第二篇 SQL 进阶与关系模式设计

### 复杂分析查询、规范化建模与安全边界

- 入口：完成 `DB-01` ~ `DB-08`，能熟练编写单表建表与 `SELECT / WHERE / ORDER BY` 查询。
- 能力：掌握聚合与逻辑执行顺序、6 类 `JOIN`、递归 CTE、窗口函数、1NF–BCNF 范式权衡、ER 映射、时序日志建模、SQL 注入防线及字符集/UTC 时间规范。
- 检验：能写出分组 Top-N 窗口查询，修正隐藏退化的 `LEFT JOIN`，完成多对多建表并用白名单防御动态排序注入。

<a id="db-09"></a>

#### DB-09 聚合函数与 `NULL` 计数法则

- 先修：[DB-04](#db-04)、[DB-07](#db-07)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#一聚合函数与-null-计数法则-db-09)。
- 问题：`COUNT(*)`、`COUNT(col)` 和 `AVG(col)` 遇到 `NULL` 时分母分别是多少？
- 小节
  1. 五大聚合函数对 `NULL` 的处理与全空返回 `NULL` 陷阱
  2. `COALESCE` 兜底与 `COUNT(DISTINCT col)`
  3. `FILTER (WHERE ...)` 与 `SUM(CASE WHEN ...)` 条件聚合
- 能力：能用单遍扫描的条件聚合替代多次重复查表。
- 练习与预期结果：计算含 `NULL` 样本列的 `COUNT(*)`、`COUNT(col)`、`AVG(col)` 与 `AVG(COALESCE(col, 0))` 并核对数值。

<a id="db-10"></a>

#### DB-10 `GROUP BY` / `HAVING` 与 SQL 逻辑执行顺序

- 先修：[DB-09](#db-09)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#二group-by--having-与-sql-逻辑执行顺序-db-10)。
- 问题：为什么不能在 `WHERE` 里用 `SELECT` 定义的别名？过滤条件该放 `WHERE` 还是 `HAVING`？
- 小节
  1. SQL 逻辑执行 8 步流水线（`FROM` → `WHERE` → `GROUP BY` → `HAVING` → 窗口 → `SELECT` → `ORDER BY` → `LIMIT`）
  2. `WHERE` 分组前过滤（走索引）vs `HAVING` 分组后过滤
  3. 非聚合列必须出现在 `GROUP BY` 中的语义原因
- 能力：能按逻辑执行顺序推演任意 SQL 的报错原因并把非聚合过滤前置到 `WHERE`。
- 练习与预期结果：把误放在 `HAVING` 里的 `batch_id > 10` 前移到 `WHERE`，并解释为何结果一致而效率更高。

<a id="db-11"></a>

#### DB-11 六大 `JOIN` 全解与左连接“暗变内连接”陷阱

- 先修：[DB-03](#db-03)、[DB-10](#db-10)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#三六大-join-全解与左连接暗变内连接陷阱-db-11)。
- 问题：为什么在 `LEFT JOIN` 后加一句 `WHERE right.col = ...` 会把没有右表记录的左表行全吞掉？
- 小节
  1. `INNER`、`LEFT`、`RIGHT`、`FULL`、`CROSS` 与自连接（Self-Join）
  2. 右表过滤条件放 `ON` vs `WHERE` 的本质区别与 Anti-Join
  3. 多一对多子表同时连接导致的连接爆炸（Join Explosion）
- 能力：能准确写出保留零匹配主记录的关联统计查询，并防止多表汇总翻倍算重。
- 练习与预期结果：修正“统计所有批次的 `ERROR` 数（含 0 条）”错误 SQL，改用 `ON` 过滤与 `COUNT(l.id)`。

<a id="db-12"></a>

#### DB-12 子查询（`IN` / `EXISTS`）与 CTE / 递归 CTE

- 先修：[DB-11](#db-11)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#四子查询in--exists与-cte--递归-cte-db-12)。
- 问题：什么时候选 `EXISTS` 而不是 `IN`？如何用一条 SQL 遍历任意深度的树状数据？
- 小节
  1. 非相关子查询与相关子查询短路探测（`EXISTS` / `NOT EXISTS`）
  2. `WITH` CTE 流水线拆分复杂多层嵌套查询
  3. `WITH RECURSIVE` 锚点 + 递归成员 + 防环深度保护
- 能力：能用递归 CTE 生成连续时间序列或安全遍历层级树形结构。
- 练习与预期结果：编写递归 CTE 生成 `1..7` 序列，并为组织树递归加上 `depth < 20` 防死循环条件。

<a id="db-13"></a>

#### DB-13 窗口函数：保留明细的同时做排名、偏移与累计

- 先修：[DB-10](#db-10)、[DB-12](#db-12)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#五窗口函数window-functions保留明细的同时做横向统计-db-13)。
- 问题：如何在不把行折叠掉的前提下，算出每组 Top-N、上一行差值与累计和？
- 小节
  1. `OVER (PARTITION BY ... ORDER BY ...)` 窗口心智模型
  2. `ROW_NUMBER` vs `RANK` vs `DENSE_RANK` 分组排名
  3. `LAG` / `LEAD` 前后对比与 `ROWS` vs `RANGE` 窗口帧陷阱
- 能力：能熟练运用窗口函数解决分组 Top-N、环比差值与严格按行累计求和。
- 练习与预期结果：查询每个科目最高前 2 名（含并列），说明三类排名函数的输出差异；核对 `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`。

<a id="db-14"></a>

#### DB-14 视图、触发器与生成列

- 先修：[DB-05](#db-05)
- 层级：核心应用（扩展）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#六视图触发器与生成列-db-14)。
- 问题：逻辑视图、物化视图、触发器和可建索引的生成列各自适合什么场景？
- 小节
  1. 逻辑视图 `VIEW` 权限隔离与物化视图定期刷新
  2. `TRIGGER` 审计用途与隐式业务逻辑反模式警示
  3. `GENERATED ALWAYS AS (...) STORED` 为 JSON 提取列建索引
- 能力：能区分三类数据库对象的存储/计算开销，并用生成列解决衍生字段索引问题。
- 练习与预期结果：创建 `events` 表，从 JSON `payload` 提取 `event_type` 作为 `STORED` 生成列并建立索引。

<a id="db-15"></a>

#### DB-15 关系模式规范化（1NF / 2NF / 3NF / BCNF）与反范式

- 先修：[DB-05](#db-05)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#七关系模式规范化1nf--2nf--3nf--bcnf与反范式权衡-db-15)。
- 问题：不规范的表为什么会引发插入/更新/删除异常？什么时候又必须故意反范式？
- 小节
  1. 三大数据异常案例拆解
  2. 1NF（原子列）、2NF（消部分依赖）、3NF（消传递依赖）、BCNF
  3. 合理反范式：历史价格快照、高频计数缓存与宽表分析
- 能力：能对任意业务表做 3NF 拆解，并辩证识别该保留的交易快照冗余。
- 练习与预期结果：论证为何 `order_items` 必须冗余保存下单时 `unit_price` 且这并不违背 3NF。

<a id="db-16"></a>

#### DB-16 ER 实体关系建模：`1:1`、`1:N`、`M:N` 落地映射

- 先修：[DB-03](#db-03)、[DB-15](#db-15)
- 层级：核心应用（核心）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#八er-实体关系建模111nmn-落地映射-db-16)。
- 问题：如何把业务需求里的 `1:1`、`1:N` 和 `M:N` 关系准确翻译成物理外键表？
- 小节
  1. `1:1` 垂直冷热拆分与 `UNIQUE` 外键
  2. `1:N` 外键永远放在多端
  3. `M:N` 中间关联表（Junction Table）与联合主键
- 能力：能为多实体系统绘制 ER 关系并落成无冗余物理 DDL。
- 练习与预期结果：设计 `users`、`roles` 与 `user_roles` 多对多授权表（含 `granted_at` 属性）。

<a id="db-17"></a>

#### DB-17 时序数据与日志表 Schema 设计实战

- 先修：[DB-08](#db-08)、[DB-16](#db-16)
- 层级：进阶专题（工程实践）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#九时序数据与日志表-schema-设计实战-db-17)。
- 问题：面对只追加、按最近时间查、定期批量过期的高吞吐日志表，怎样设计才不会被 `DELETE` 碎片拖死？
- 小节
  1. 幂等批次键与时间有序主键（避免随机 UUIDv4 碎裂页）
  2. 按时间分表/分区实现毫秒级 `DROP` / `DETACH` 过期清理
  3. 预聚合滚动汇总表（Rollup Table）加速长周期大盘
- 能力：能为日志归档与监控系统设计支持幂等写入、无锁过期的表结构。
- 练习与预期结果：对比 `DELETE FROM logs WHERE created_at < ...` 与按月分区 `DROP TABLE` 的锁与碎片代价。

<a id="db-18"></a>

#### DB-18 SQL 注入攻防原理与参数化查询铁律

- 先修：[DB-07](#db-07)
- 层级：核心应用（安全底线）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#十sql-注入攻防原理与参数化查询铁律-db-18)。
- 问题：为什么字符串拼接必然导致 SQL 注入？哪些 SQL 位置不能用 `?` 参数绑定，该怎么防？
- 小节
  1. `' OR '1'='1`、`; DROP TABLE` 与 `UNION SELECT` 攻击链
  2. Prepared Statement 编译期语法树与运行期数据物理隔离
  3. 动态表名/列名/`ORDER BY` 方向的严格白名单防线
- 能力：能在 C++ 与所有后端代码里做到零 SQL 拼接漏洞。
- 练习与预期结果：审查 `ORDER BY ? ?` 为什么失败，写出基于 `std::string_view` 白名单映射的安全排序辅助函数。

<a id="db-19"></a>

#### DB-19 字符集、排序规则（Collation）与 UTC 时间戳规范

- 先修：[DB-04](#db-04)
- 层级：核心应用（工程规范）
- 状态：已有[SQL 进阶与关系模式设计](../../src/content/handbook/db-sql-design.md#十一字符集排序规则collation与-utc-时间规范-db-19)。
- 问题：为什么 MySQL `utf8` 存不了 emoji？为什么数据库里绝不能只存不带时区的本地时间？
- 小节
  1. `utf8mb4` 4 字节 Unicode 与 Collation 大小写/索引匹配规则
  2. 夏令时（DST）时间重复/消失坑与全库统一 UTC 铁律
  3. ISO-8601 UTC 字符串 vs Unix 毫秒整数，墙上时钟 vs 单调时钟
- 能力：能制定跨时区、多语言、无乱码的字段编码与时间戳规范。
- 练习与预期结果：对比 `std::chrono::system_clock` 与 `steady_clock` 在记录事件时刻和统计 SQL 耗时上的不同分工。

---

## 第三篇 SQLite 工程实战与本地持久化

### 嵌入式引擎、C++20 RAII、WAL 与持久化契约

- 入口：完成 `DB-01` ~ `DB-19` 与 C++ RAII/Linux 文件 I/O 基础（[CPP-10](cpp.md#cpp-10)、[OS-01](os.md#os-01)、[ENG-04](engineering.md#eng-04)）。
- 能力：使用现代 C++20 RAII 封装 SQLite API，实现百倍加速的单事务批量提交与显式回滚，配置 WAL 与 `PRAGMA` 调优，使用 JSON1/FTS5、在线备份与 `user_version` 迁移，守住 `fsync`/原子替换/CRC32 底层持久化契约并交付 `LogScan v2`。
- 检验：跑通 `sqlite_demo.cpp` 与 `LogScan v2` 本地归档验收（10000 行批量导入、带引号数据、失败整体回滚、WAL 检查点诊断与备份校验）。

<a id="db-20"></a>

#### DB-20 嵌入式 SQLite vs 客户端/服务端 RDBMS

- 先修：[DB-01](#db-01)、[DB-18](#db-18)
- 层级：核心应用（核心）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#一嵌入式-sqlite-vs-客户端服务端-rdbms-db-20)。
- 问题：什么时候应该把 SQLite 直接编译进 C++ 进程，什么时候必须上 PostgreSQL / MySQL？
- 小节
  1. 进程内库调用（零 IPC）vs TCP 守护进程架构差异
  2. 单写者全局锁边界与多并发读特性
  3. `LogScan` 本地归档与边缘/桌面服务选型准则
- 能力：能根据写并发度、部署形态和运维预算做出合理引擎选型。
- 练习与预期结果：梳理 SQLite 与 PostgreSQL 在单机日志服务与多机电商下单场景的架构适配理由。

<a id="db-21"></a>

#### DB-21 `STRICT` 严格表、类型亲和性与 `sqlite3` CLI 元命令

- 先修：[DB-05](#db-05)、[DB-20](#db-20)
- 层级：核心应用（核心）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#二strict-严格表类型亲和性与-sqlite3-cli-元命令-db-21)。
- 问题：为什么传统 SQLite 往 `INTEGER` 列塞字符串居然能插进去？如何强制类型校验？
- 小节
  1. Type Affinity 动态亲和性历史陷阱
  2. SQLite 3.37+ `STRICT` 关键字与 6 种合法类型名
  3. `.schema` / `.mode box` / `.timer on` / `.import` / `.backup` CLI 元命令
- 能力：能用 `STRICT` 建出类型安全的表，并用 CLI 元命令高效调试。
- 练习与预期结果：在 `STRICT` 表测试向 `INTEGER` 列插入文本 `'abc'`，确认触发类型约束错误。

<a id="db-22"></a>

#### DB-22 C++ API 连接管理：`sqlite3_open_v2`、`sqlite3_close` 与错误分类

- 先修：[DB-20](#db-20)、[CPP-10](cpp.md#cpp-10)
- 层级：核心应用（核心）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#三c-api-连接管理sqlite3_open_v2sqlite3_close-与-sqlite3_exec-db-22)。
- 问题：为什么 `sqlite3_open_v2` 打开失败时依然必须调用 `sqlite3_close_v2`？
- 小节
  1. `sqlite3_open_v2` 显式读写/只读打开标志
  2. 失败路径句柄释放与 `sqlite3_close` vs `sqlite3_close_v2`
  3. 区分 `SQLITE_BUSY`、`SQLITE_CONSTRAINT` 与 `SQLITE_IOERR`
- 能力：能区分连接打开失败、库链接失败及运行时各类错误码并正确释放错误字符串。
- 练习与预期结果：用 `SQLITE_OPEN_READWRITE`（不加 `CREATE`）打开不存在的文件，读取 `sqlite3_errmsg` 后安全释放句柄。

<a id="db-23"></a>

#### DB-23 预处理语句生命周期：`prepare_v2`、`bind_*`、`step`、`column_*`

- 先修：[DB-18](#db-18)、[DB-22](#db-22)
- 层级：核心应用（核心）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#四预处理语句生命周期prepare_v2bind_stepcolumn_-db-23)。
- 问题：`bind` 与 `column` 下标为什么差 1？`SQLITE_STATIC` 何时会变悬空指针？
- 小节
  1. 六步状态机（`prepare_v2` → `bind_*` → `step` → `column_*` → `reset`+`clear_bindings` → `finalize`）
  2. 1-based 绑定下标 vs 0-based 列下标
  3. `SQLITE_TRANSIENT` 拷贝安全与 `sqlite3_column_text` 判空（`NULL` 返回 `nullptr`）
- 能力：能原样存取包含单引号、中文和 `NULL` 的记录而不泄漏内存或踩悬空指针。
- 练习与预期结果：修复局部 `std::string` 配合 `SQLITE_STATIC` 的悬空指针 Bug，改用 `SQLITE_TRANSIENT`。

<a id="db-24"></a>

#### DB-24 用现代 C++20 RAII 封装 `sqlite3*` 与 `sqlite3_stmt*`

- 先修：[DB-23](#db-23)、[CPP-09](cpp.md#cpp-09)
- 层级：核心应用（核心）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#五用现代-c20-raii-封装-sqlite3-与-sqlite3_stmt-db-24)（含完整可编译运行 `sqlite_demo.cpp`）。
- 问题：如何在抛出异常或早退路径上保证语句先于连接析构、句柄零泄漏？
- 小节
  1. `std::unique_ptr` 自定义删除器 `DbPtr` 与 `StmtPtr`
  2. `exec_sql` 异常包装与 `sqlite3_free` 清理
  3. 完整 `sqlite_demo.cpp` 编译链接 `-lsqlite3` 运行
- 能力：能写出异常安全、零手动 `close`/`finalize` 的 C++20 SQLite 访问层。
- 练习与预期结果：编译运行正文 `sqlite_demo.cpp`，写入含单引号文本并按参数绑定回读 `ERROR` 行，核对 `WARN` 数为 `0`。

<a id="db-25"></a>

#### DB-25 单事务批量写入：100 倍吞吐提升与 `BEGIN IMMEDIATE`

- 先修：[DB-24](#db-24)
- 层级：核心应用（核心）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#六单事务批量写入100-倍吞吐提升与-begin-immediate-db-25)与 [LogScan v2 实验](../../src/content/labs/logscan-v2.md)。
- 问题：为什么循环插 1 万条包进一个 `BEGIN IMMEDIATE ... COMMIT` 能提速上百倍？
- 小节
  1. 自动提交逐行 `fsync` 瓶颈 vs 单事务顺序刷盘
  2. 为什么写事务用 `BEGIN IMMEDIATE` 避免升级死锁绕过 `busy_timeout`
  3. 事务异常捕获、`ROLLBACK` 留存首错与 `COMMIT` 成功确认点
- 能力：能实现批量事务提交，并在部分失败时保证基线零增量。
- 练习与预期结果：复现 `sqlite_demo.cpp` 中 batch 2 空消息触发整体回滚；对照 10000 行无事务 vs 单事务耗时。

<a id="db-26"></a>

#### DB-26 关键 `PRAGMA` 调优：WAL 模式、同步级别与检查点诊断

- 先修：[DB-25](#db-25)
- 层级：进阶专题（进阶）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#七关键-pragma-调优wal-模式同步级别与检查点诊断-db-26)与 [LogScan v3 实验](../../src/content/labs/logscan-service.md)。
- 问题：为什么开启 WAL 后 `-wal` 文件会一直膨胀？`synchronous = NORMAL` 到底安不安全？
- 小节
  1. `WAL`、`-wal`/`-shm`、单写者多读者快照隔离时间线
  2. `PASSIVE` / `FULL` / `RESTART` / `TRUNCATE` 四类检查点与长读者阻塞诊断
  3. `synchronous = NORMAL` vs `FULL`、`busy_timeout`、`cache_size` 与 `temp_store`
- 能力：能用双连接观测 WAL 快照可见性，并诊断长事务读者导致的 `-wal` 膨胀。
- 练习与预期结果：窗口 A 开读事务不提交，窗口 B 写入 5000 行后运行 `PRAGMA wal_checkpoint(TRUNCATE);`，观察 `pnCkpt < pnLog` 并在 A 提交后成功清零。

<a id="db-27"></a>

#### DB-27 SQLite 内置超能力：JSON1 与 FTS5 全文检索

- 先修：[DB-14](#db-14)、[DB-21](#db-21)
- 层级：进阶专题（扩展）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#八sqlite-内置超能力json1-与-fts5-全文检索-db-27)。
- 问题：怎样高效检索半结构化 JSON 字段，并替代慢如蜗牛的 `LIKE '%keyword%'`？
- 小节
  1. JSON1 `json_valid`、`->` / `->>`、`json_each` 与生成列索引
  2. FTS5 外部内容表（`content='logs'`）倒排索引与触发器同步
  3. `MATCH` 布尔查询、`bm25()` 排序与 `snippet()` 高亮摘要
- 能力：能用 SQLite 原生扩展支撑扩展元数据检索与毫秒级日志全文搜索。
- 练习与预期结果：建立 `logs_fts` 虚拟表并对 `'disk full' OR timeout` 执行 `MATCH` 查询与 `EXPLAIN QUERY PLAN` 验证。

<a id="db-28"></a>

#### DB-28 在线备份 API 与 `user_version` 模式迁移

- 先修：[DB-26](#db-26)
- 层级：进阶专题（进阶）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#九在线备份-api-与-user_version-模式迁移-db-28)。
- 问题：为什么 WAL 模式下绝对不能直接 `cp` 拷贝 `.db` 文件？如何优雅升级线上旧库表结构？
- 小节
  1. `.backup`、`VACUUM INTO` 与 C API `sqlite3_backup_init`/`step`/`finish`
  2. `PRAGMA integrity_check;` 独立恢复库核对
  3. 基于 `PRAGMA user_version` 的幂等增量建表升级器
- 能力：能实现不阻塞线上读写的增量热备，并管理客户端/服务端本地数据库版本升级。
- 练习与预期结果：备份后向原库写入新批次，独立打开备份库核对 `integrity_check` 返回 `ok` 且新批次不在快照中。

<a id="db-29"></a>

#### DB-29 本地持久化底层契约：Page Cache、`fsync`、原子替换与 CRC32 日志

- 先修：[DB-01](#db-01)、[DB-25](#db-25)、[OS-01](os.md#os-01)
- 层级：进阶专题（项目主线）
- 状态：已有[SQLite 工程实战与本地持久化](../../src/content/handbook/storage-sqlite.md#十本地持久化底层契约page-cachefsync原子替换与-crc32-日志-db-29)、[Linux 正文](../../src/content/handbook/linux-process-io.md)与 [LogScan v2](../../src/content/labs/logscan-v2.md)/[v3 实验](../../src/content/labs/logscan-service.md)。
- 问题：脱离数据库时，C++ 文件写入如何抗断电？网络在 `COMMIT` 后、`ACK` 前断开怎么幂等恢复？
- 小节
  1. `LogRecord` 跨模块共享契约（换行/长度上限/拒绝未知版本）
  2. 用户缓冲 → 内核 Page Cache → `fsync` 与同目录 4 步原子快照替换（含 `fsync(dir_fd)`）
  3. CRC32 追加日志扫描器（区分 `TailTruncated` 与 `MidCorrupted`）与 `batch_key` 幂等重试矩阵
- 能力：能实现故障安全的二进制日志扫描器，并交付满足崩溃恢复与幂等语义的 `LogScan v2`/`v3` 存储模块。
- 练习与预期结果：对 `recover_append_log` 注入第 2 条记录截断与中段篡改，分别验证 `TailTruncated`（恢复 1 条）与 `MidCorrupted`。

---

## 第四篇 存储引擎、索引内核与查询优化

### 槽页、B+Tree、回表、查询计划、LSM-Tree 与列存

- 入口：完成 `DB-10` ~ `DB-26`，能看懂基本表结构和 `SELECT` 语句。
- 能力：理解磁盘页槽位布局与 B+Tree 高扇出原理，能精准设计覆盖/部分/复合索引并排查索引失效，看懂 `EXPLAIN ANALYZE` 与三种 Join 算法，掌握 LSM-Tree 读写放大权衡及 OLTP 行存 vs OLAP 列存架构差异。
- 检验：能为复杂多条件排序查询设计单条最优覆盖索引，解读 `SCAN`/`SEARCH`/`Bitmap Heap Scan`，并估算行存与列存 I/O 差距。

<a id="db-30"></a>

#### DB-30 Slotted Page 槽页布局与堆文件（Heap File）

- 先修：[DB-29](#db-29)、[MACH-04](machine.md#mach-04)
- 层级：进阶专题（内核）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#一slotted-page-槽页布局与堆文件heap-file-db-30)。
- 问题：变长字符串怎么塞进固定 8KB/16KB 磁盘页？页内整理搬移数据时为何不用改所有索引？
- 小节
  1. Page Header、向下生长的 Slot 数组与向上生长的 Tuple 数据区
  2. `RID = (PageID, SlotID)` 间接寻址消除外部指针重写
  3. Buffer Pool 页缓存（LRU-K/Clock）与 Overflow/TOAST 大对象溢出页
- 能力：能解释数据库页内字节排布及行迁移不破坏二级索引的原因。
- 练习与预期结果：画出删除页中第 1 条记录后，Slot 槽位号不变而物理偏移整理收缩的页内示意图。

<a id="db-31"></a>

#### DB-31 B-Tree vs B+Tree：为什么数据库全用 B+Tree？

- 先修：[DB-30](#db-30)、[ALG-28](algorithms.md#alg-28)
- 层级：进阶专题（内核）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#二b-tree-vs-btree为什么数据库全用-btree-db-31)。
- 问题：为什么 3 层 B+Tree 就能装下几千万行？工业界为什么不用原始 B-Tree 或红黑树？
- 小节
  1. 页对齐高扇出（Fan-out）把树高压缩到 3~4 层
  2. B-Tree（数据在所有节点）vs B+Tree（分支仅存路由键，数据全在叶子）
  3. 叶子双向链表对 `BETWEEN`/`ORDER BY` 范围扫描的加速
- 能力：能定量估算给定页大小下的 B+Tree 树高与磁盘 I/O 次数。
- 练习与预期结果：计算单页扇出 500、叶子每页存 100 行时，3 层与 4 层 B+Tree 分别可承载的行数上限。

<a id="db-32"></a>

#### DB-32 聚簇索引、二级索引与“回表（Bookmark Lookup）”代价

- 先修：[DB-31](#db-31)
- 层级：核心应用（核心）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#三聚簇索引二级索引与回表bookmark-lookup代价-db-32)。
- 问题：什么是回表？为什么有时明明建了索引，优化器却故意走全表扫描？为何不能用随机 UUIDv4 做聚簇主键？
- 小节
  1. 聚簇索引（InnoDB PK / SQLite `rowid`）vs 堆表非聚簇索引（PG `ctid`）
  2. 二级索引查主键后二次随机跳回主表的“回表”开销
  3. 低选择性回表放弃索引与随机 UUIDv4 引发页分裂碎片
- 能力：能预判回表随机 I/O 成本并为主键选择单调递增类型。
- 练习与预期结果：解释 100 万行表查询占 90% 行数的 `'INFO'` 时为何优化器选择 `SCAN` 而非 `idx_level`。

<a id="db-33"></a>

#### DB-33 覆盖索引、部分索引与表达式索引

- 先修：[DB-32](#db-32)
- 层级：核心应用（核心）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#四覆盖索引部分索引与表达式索引-db-33)。
- 问题：怎样彻底消灭回表？如何为占全表 0.1% 的热点状态或 JSON/小写条件瘦身建索引？
- 小节
  1. 覆盖索引（`USING COVERING INDEX` / `INCLUDE` 列）免回表与 PG Visibility Map
  2. 部分索引（Partial Index，`WHERE ...`）大幅缩小索引体积
  3. 表达式索引（`lower(email)`）匹配函数查询
- 能力：能利用覆盖、部分和表达式索引将核心慢查询优化到零回表与极低空间开销。
- 练习与预期结果：为高频只查未处理 `ERROR` 的场景写出节省 99% 空间的 `CREATE INDEX ... WHERE ...` 语句。

<a id="db-34"></a>

#### DB-34 复合索引的“最左前缀原则”与排序对齐

- 先修：[DB-32](#db-32)
- 层级：核心应用（核心）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#五复合索引的最左前缀原则与排序对齐-db-34)。
- 问题：复合索引 `(a, b, c)` 在哪些 `WHERE`/`ORDER BY` 组合下生效，为什么遇到范围条件会截断后续列？
- 小节
  1. 复合索引字典序排布直觉
  2. 跳过最左列失效与范围查询（`>` / `BETWEEN`）截断后续列
  3. 等值在前、范围/排序在后，避免 `USE TEMP B-TREE FOR ORDER BY`
- 能力：能根据查询形状精准排列复合索引列顺序，兼顾过滤与免排序。
- 练习与预期结果：为 `WHERE user_id = ? AND status = 'PAID' AND created_at >= ? ORDER BY created_at DESC` 设计单条最优覆盖索引。

<a id="db-35"></a>

#### DB-35 基数（Cardinality）与索引失效 6 大陷阱

- 先修：[DB-34](#db-34)
- 层级：核心应用（核心）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#六基数cardinality与索引失效-6-大陷阱-db-35)。
- 问题：字段明明建了索引，哪 6 种常见 SQL 写法会瞬间让索引报废？
- 小节
  1. 选择性与基数评估（为何单建性别/删除标记索引无效）
  2. 前缀 `%`、`CAST` 隐式转换、索引列套函数/算术运算
  3. 未索引分支 `OR`、大比例否定条件与 Collation 不一致
- 能力：能一眼识破索引失效写法并改写为索引友好的等价 SQL。
- 练习与预期结果：改写含 `phone = 13800138000 OR substr(created_at, 1, 7) = '2026-11'` 的失效 SQL。

<a id="db-36"></a>

#### DB-36 看懂 `EXPLAIN QUERY PLAN` 与 `EXPLAIN ANALYZE`

- 先修：[DB-33](#db-33)、[DB-35](#db-35)
- 层级：核心应用（核心）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#七看懂-explain-query-plan-与-explain-analyze-db-36)。
- 问题：如何用实测执行计划而非猜测来验证索引是否命中、统计信息是否过期？
- 小节
  1. SQLite `SCAN`、`SEARCH ... USING INDEX`、`USING COVERING INDEX`、`USE TEMP B-TREE`
  2. `ANALYZE` 收集分布统计消除数据倾斜误判
  3. PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 与 `Bitmap Index/Heap Scan`
- 能力：能独立采集并解读执行计划的扫描类型、回表行为、临时排序与估算偏差。
- 练习与预期结果：在 `sqlite3` 对同一条 SQL 对比加复合索引前后的 `EXPLAIN QUERY PLAN` 文本变化。

<a id="db-37"></a>

#### DB-37 三大 Join 执行算法：Nested Loop、Hash Join 与 Sort-Merge Join

- 先修：[DB-11](#db-11)、[DB-36](#db-36)
- 层级：进阶专题（内核）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#八三大-join-执行算法nested-loophash-join-与-sort-merge-join-db-37)。
- 问题：数据库底层执行 `JOIN` 时，什么时候用循环嵌套查索引，什么时候用内存建哈希表或归并双指针？
- 小节
  1. Index Nested Loop Join 与“小表驱动大表”
  2. Hash Join（Build/Probe 与溢写磁盘 Grace Hash Join）
  3. Sort-Merge Join 对有序大表与非等值范围合并的优势
- 能力：能依据表规模、连接条件和索引情况判断最优 Join 算子。
- 练习与预期结果：分析两张均无索引的 100 万行大表做等值 `JOIN` 时为何 Hash Join 碾压普通嵌套循环。

<a id="db-38"></a>

#### DB-38 LSM-Tree 存储引擎：MemTable、WAL、SSTable 与 Compaction

- 先修：[DB-31](#db-31)
- 层级：进阶专题（内核）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#九lsm-tree-存储引擎memtablewalsstable-与-compaction-db-38)。
- 问题：RocksDB/LevelDB 如何把随机写全部变成顺序写？为什么读取时要靠 Bloom Filter 救场？
- 小节
  1. 写路径：WAL + 内存跳表 MemTable → 不可变 L0 SSTable
  2. 读路径与 Tombstone 墓碑删除语义、Bloom Filter 过滤不存在 Key
  3. Size-Tiered vs Leveled Compaction 与读写/空间放大（RUM 权衡）
- 能力：能对比 B+Tree 与 LSM-Tree 的适用工作负载并解释三类放大代价。
- 练习与预期结果：解释 LSM-Tree 执行 `DELETE` 为什么不能原地删除 SSTable 记录以及空间何时真正释放。

<a id="db-39"></a>

#### DB-39 行式存储 vs 列式存储（OLTP vs OLAP）

- 先修：[DB-30](#db-30)、[DB-38](#db-38)
- 层级：进阶专题（架构）
- 状态：已有[存储引擎与索引内核](../../src/content/handbook/db-indexes-internals.md#十行式存储-vs-列式存储oltp-vs-olap-db-39)。
- 问题：为什么 ClickHouse / Parquet 统计十亿行聚合比 MySQL 快上百倍，却不能拿来做高并发单行更新？
- 小节
  1. 行存（NSM）连续整行布局 vs 列存（DSM）按列连续分块
  2. 列裁剪、字典/RLE/Delta 极致压缩与 SIMD 向量化执行
  3. OLTP 与 OLAP 混合架构（CDC 同步链路）
- 能力：能根据读写点查 vs 宽表聚合分析负载正确选择行存或列存引擎。
- 练习与预期结果：估算 100 列共 100GB 表仅求其中 1 个 8 字节整型列之和时，行存与列存的磁盘读取量差距。

---

## 第五篇 事务内核、并发控制与分布式存储

### ACID、锁与 MVCC、ARIES 恢复、复制、分片与 Saga

- 入口：完成 `DB-25` ~ `DB-32` 及并发同步基础（[CON-03](concurrency.md#con-03)、[OS-19](os.md#os-19)）。
- 能力：深入理解 ACID 实现原理、6 类并发异常与隔离级别、2PL 与 InnoDB 间隙/临键锁、MVCC ReadView 版本链、乐观/悲观锁与死锁防治、ARIES 三阶段恢复、主从延迟与脑裂防线、一致性哈希分片及 2PC/Outbox/Saga 分布式事务。
- 检验：能手动推演 ReadView 可见性，消除账户互转死锁，写出基于乐观锁与语义锁防超卖/写偏斜的正确方案。

<a id="db-40"></a>

#### DB-40 ACID 四大特性的工程本质

- 先修：[DB-25](#db-25)
- 层级：核心应用（核心）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#一acid-四大特性的工程本质-db-40)。
- 问题：ACID 各自靠什么底层机制实现？为什么说 Consistency（一致性）不只是数据库自己的事？
- 小节
  1. Atomicity（Undo Log）与 Durability（WAL + `fsync`）
  2. Isolation（锁与 MVCC）
  3. Consistency 作为应用逻辑与数据库约束共同守护的不变量
- 能力：能清晰映射 ACID 四要素与底层数据库子系统的对应关系。
- 练习与预期结果：举出一个满足 A、I、D 却因应用层条件漏判而破坏业务一致性的例子。

<a id="db-41"></a>

#### DB-41 并发下的 6 大数据异常（Anomalies）

- 先修：[DB-40](#db-40)
- 层级：核心应用（核心）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#二并发下的-6-大数据异常anomalies-db-41)。
- 问题：脏读、不可重复读、幻读、丢失更新与写偏斜（Write Skew）各自在什么时间线下发生？
- 小节
  1. 脏写、脏读、不可重复读与幻读时间线
  2. 读-改-写竞态导致的丢失更新（Lost Update）
  3. 多行互不冲突更新打破全局约束的写偏斜（Write Skew）
- 能力：能通过画双事务时间线精准识别并复现任意并发异常。
- 练习与预期结果：写出两个医生同时请假导致无人值班的 Write Skew 双事务交叉步骤。

<a id="db-42"></a>

#### DB-42 SQL 四大隔离级别与主流引擎真实行为

- 先修：[DB-41](#db-41)
- 层级：核心应用（核心）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#三sql-四大隔离级别与主流引擎真实行为-db-42)。
- 问题：为什么 MySQL InnoDB 和 PostgreSQL 的 `REPEATABLE READ` 实际表现比 SQL-92 标准更强？
- 小节
  1. `READ UNCOMMITTED` 到 `SERIALIZABLE` 四级对照矩阵
  2. PG/Oracle 默认 `RC` vs MySQL 默认 `RR` vs SQLite 串行化
  3. 快照隔离（SI）与序列化快照隔离（SSI）差异
- 能力：能按业务一致性与并发吞吐需求选择合适隔离级别并预判残留异常。
- 练习与预期结果：说明为何在 InnoDB `RR` 下普通 `SELECT` 不出现幻读，但仍可能发生 Write Skew。

<a id="db-43"></a>

#### DB-43 共享锁、排他锁、意向锁与两阶段锁协议（2PL）

- 先修：[DB-42](#db-42)、[OS-19](os.md#os-19)
- 层级：进阶专题（内核）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#四共享锁排他锁意向锁与两阶段锁协议2pl-db-43)。
- 问题：为什么给大表加表锁前不需要扫描 1000 万行检查行锁？为何写锁必须攥到提交才放？
- 小节
  1. `S` / `X` 锁兼容性矩阵
  2. 意向锁 `IS` / `IX` 作为表门口 $O(1)$ 告示牌
  3. 2PL 与 Strict 2PL 防止级联回滚
- 能力：能解释多粒度锁共存原理与 Strict 2PL 的必要性。
- 练习与预期结果：判断 `IX` 与 `IX` 锁是否互相阻塞，以及 `IX` 与表级 `S` 锁是否阻塞。

<a id="db-44"></a>

#### DB-44 InnoDB 行锁、间隙锁（Gap Lock）与临键锁（Next-Key Lock）

- 先修：[DB-43](#db-43)
- 层级：进阶专题（内核）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#五innodb-行锁间隙锁gap-lock与临键锁next-key-lock-db-44)。
- 问题：InnoDB 靠什么锁住“还不存在的行”来防幻读？为什么 `WHERE` 没走索引会变成全表锁死？
- 小节
  1. Record Lock（记录锁）与唯一等值退化
  2. Gap Lock（开区间间隙锁）与 Insert Intention Lock（插入意向锁）
  3. Next-Key Lock `(a, b]` 与无索引 `UPDATE` 锁全表事故
- 能力：能推演范围当前读加锁区间，并杜绝无索引更新引发的全表阻塞。
- 练习与预期结果：分析索引已有 `10, 20, 30` 时，执行 `SELECT * FROM t WHERE id = 15 FOR UPDATE;` 会锁住哪个开区间。

<a id="db-45"></a>

#### DB-45 MVCC 多版本并发控制：Undo Log 与 ReadView 原理

- 先修：[DB-42](#db-42)
- 层级：进阶专题（内核）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#六mvcc-多版本并发控制undo-log-与-readview-原理-db-45)。
- 问题：MVCC 如何做到读不阻塞写、写不阻塞读？`RC` 和 `RR` 在内核里只差哪一步？
- 小节
  1. 隐藏列 `trx_id`/`roll_ptr` 与 Undo Log 历史版本链
  2. `ReadView`（`m_ids`, `min_trx_id`, `max_trx_id`, `creator_trx_id`）四步可见性判定
  3. 每语句重生成 ReadView（`RC`）vs 事务首读固定 ReadView（`RR`）
- 能力：能手工推演任意事务 ID 版本在给定 ReadView 下的可见性结果。
- 练习与预期结果：给定活跃事务列表 `[102, 105, 108]`、`max_trx_id = 110`，手工判定版本 `105` 对 `T108` 是否可见及回溯路径。

<a id="db-46"></a>

#### DB-46 乐观锁 vs 悲观锁，以及死锁检测与破局

- 先修：[DB-43](#db-43)、[DB-45](#db-45)
- 层级：核心应用（核心）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#七乐观锁-vs-悲观锁以及死锁检测与破局-db-46)。
- 问题：什么时候用 `FOR UPDATE`，什么时候用 `version` 乐观锁？怎样从根源消灭转账死锁？
- 小节
  1. 悲观锁（`FOR UPDATE` / `SKIP LOCKED` 抢单队列）vs 乐观锁 CAS（`version`）
  2. 等待图（Wait-for Graph）自动死锁检测与牺牲品回滚
  3. 固定加锁顺序（`min(id)` → `max(id)`）彻底破坏死锁环
- 能力：能按冲突率选择并发控制策略，并消除业务代码里的交叉加锁死锁。
- 练习与预期结果：写出带 `version` 防超卖的原子 `UPDATE` 语句并说明返回值判定逻辑；用加锁排序法修复 `A->B` / `B->A` 互转死锁。

<a id="db-47"></a>

#### DB-47 WAL、Redo/Undo、Checkpoints 与 ARIES 崩溃恢复直觉

- 先修：[DB-29](#db-29)、[DB-40](#db-40)
- 层级：进阶专题（内核）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#八walredoundocheckpoints-与-aries-崩溃恢复直觉-db-47)。
- 问题：Buffer Pool 采用 Steal/No-Force 刷脏时，重启后 ARIES 如何靠三遍扫描还原 100% 一致状态？
- 小节
  1. Steal/No-Force 缓冲池策略为何同时需要 Redo 与 Undo
  2. LSN 序列号、Write-Ahead 刷盘铁律与 Fuzzy Checkpoint
  3. ARIES 三阶段：Analysis → Redo（重演历史）→ Undo（含 CLR 防恢复中途再崩溃）
- 能力：能解释数据库重启恢复的完整流程与 Redo/Undo/CLR 各自作用。
- 练习与预期结果：说明为何 ARIES Redo 阶段必须把未提交 Loser 事务的改动也先重放一遍。

<a id="db-48"></a>

#### DB-48 主从复制、复制延迟与脑裂（Split-Brain）

- 先修：[DB-47](#db-47)、[NET-05](network.md#net-05)
- 层级：进阶专题（分布式）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#九主从复制复制延迟与脑裂split-brain-db-48)。
- 问题：异步、半同步和 Raft 复制如何权衡？怎样解决“自己刚写完刷新却看不见”与双主脑裂？
- 小节
  1. Async vs Semi-Sync vs 共识同步（RPO/延迟权衡）
  2. 复制延迟导致的 Read-Your-Writes 违背与粘性主读/LSN 追平解法
  3. 多数派 Quorum 选主与 Fencing Token/STONITH 防脑裂
- 能力：能设计具备高可用切换且防脑裂、缓解读写分离延迟的复制方案。
- 练习与预期结果：分析两台机器互相 ping 不通时盲目自动升主为何会破坏数据一致性。

<a id="db-49"></a>

#### DB-49 水平分片（Sharding）与一致性哈希

- 先修：[DB-48](#db-48)
- 层级：进阶专题（分布式）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#十水平分片sharding与一致性哈希-db-49)。
- 问题：单库撑爆后怎么水平拆分？为什么简单 `hash % N` 扩容时会引发 75% 数据大搬家？
- 小节
  1. 范围分片热点问题 vs 简单取模扩容雪崩
  2. 一致性哈希环与虚拟节点（Virtual Nodes）负载均衡
  3. Shard Key 分片键选择与同实体本地共置原则
- 能力：能为超大规模业务挑选合适的 Shard Key 并计算扩容迁移比例。
- 练习与预期结果：对比 3 节点扩 4 节点时 `% N` 与一致性哈希的数据迁移量差异，说明为何电商表常选 `user_id` 分片。

<a id="db-50"></a>

#### DB-50 分布式事务：2PC（两阶段提交）、Outbox 与 Saga

- 先修：[DB-49](#db-49)
- 层级：进阶专题（分布式）
- 状态：已有[事务内核、并发控制与分布式存储](../../src/content/handbook/db-tx-distributed.md#十一分布式事务2pc两阶段提交outbox-与-saga-db-50)。
- 问题：跨两个物理独立库怎么保证一致性？为什么高并发微服务放弃 2PC 改用 Outbox + Saga？
- 小节
  1. 2PC/XA Prepare-Commit 协议与协调者崩溃阻塞缺陷
  2. Transactional Outbox（本地事务表 + CDC/Relay 可靠发消息）
  3. Saga 编排/协同、正向幂等/反向补偿与语义锁对抗缺隔离性
- 能力：能根据业务一致性和吞吐要求选择 2PC、Outbox 或 Saga 方案并设计幂等与补偿接口。
- 练习与预期结果：为“下单→扣余额→扣库存”的 Saga 设计冻结语义锁与基于 `idempotency_key` 的防重补偿防线。
