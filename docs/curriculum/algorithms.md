# C++20 数据结构与算法 (ALG)

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

从零建立复杂度与结构直觉，随后按“线性与双指针 → 字符串与树堆 → 图论与最短路 → 回溯贪心与动态规划”逐层推进到完整 50 节。[LogScan v1 多文件聚合](../../src/content/labs/logscan-v1.md)已发布，可直接实践聚合与确定序排序。

## 第一篇 算法直觉与数学基石（ALG-01 ~ ALG-08）

### 复杂度、不变量与前缀差分位运算

- 入口：会写基本循环、函数与 `std::vector`。
- 能力：用步数分析时间/空间代价，并用前缀和、差分与位运算化简批量统计。

<a id="alg-01"></a>

#### ALG-01 五种基本数据结构与直观选型

- 先修：[CPP-02](cpp.md#cpp-02)
- 层级：入门（零基础起步）
- 状态：已有[第 0 课：算法直觉、复杂度分析、前缀和差分与位运算](../../src/content/handbook/algo-zero-start.md)（含[破冰示例](../../public/examples/algo-zero.cpp)）。
- 问题：为什么同样存 1000 条日志，不同“摆法”会让耗时差出 100 倍？
- 小节
  1. 数组、链表、栈、队列与哈希表的生活模型
  2. 跑通步数对照实验：顺序扫描 vs 二分查找
  3. 前提条件（不变量）被破坏时快算法为何失效

<a id="alg-02"></a>

#### ALG-02 步数计算、大 O / Ω / Θ 与每秒 10⁸ 运算量估算

- 先修：[ALG-01](#alg-01)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：看到数据范围 $n=10^5$ 时，怎么在写代码前预判哪套算法会超时？
- 小节
  1. Big-O 上界、Ω 下界与 Θ 紧确界辨析
  2. 常见复杂度量级与 1 秒天花板速查表
  3. 双层循环却只有 O(n) 或 O(n log n) 的常见反例

<a id="alg-03"></a>

#### ALG-03 空间复杂度、递归调用栈开销与时空权衡

- 先修：[ALG-02](#alg-02)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：为什么没有开大数组却在深递归时突然 Stack Overflow？
- 小节
  1. 额外空间复杂度与栈帧深度统计
  2. 64 位下整数内存估算与常见栈大小限制
  3. 空间换时间 vs 流式数据时间换空间

<a id="alg-04"></a>

#### ALG-04 均摊复杂度与 std::vector 倍增扩容证明

- 先修：[ALG-02](#alg-02)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：单次扩容要搬动全数组，为何尾插依然是均摊 O(1)？
- 小节
  1. 记账法（存钱罐模型）证明倍增均摊常数
  2. 对比等差递增（+10）为何退化为 O(n²)
  3. 何时提前 `reserve` 与何时保留扩容契约

<a id="alg-05"></a>

#### ALG-05 循环不变量：三步证明边界永不出错

- 先修：[ALG-01](#alg-01)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：为什么循环条件经常多写或少写一个等号？
- 小节
  1. 初始化、保持与终止三段证明法
  2. 原地去重快慢指针不变量实战
  3. 把直觉条件写成明确可断言的代码范围

<a id="alg-06"></a>

#### ALG-06 一维与二维前缀和及前缀哈希

- 先修：[ALG-02](#alg-02)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：十万次区间求和询问如何全部压成 O(1) 一次减法？
- 小节
  1. 1-based 一维前缀和消灭左边界特判
  2. 二维矩阵前缀和与容斥公式
  3. 前缀和 + unordered_map 解决含负数目标和子数组

<a id="alg-07"></a>

#### ALG-07 差分数组：O(1) 区间批量加减修改

- 先修：[ALG-06](#alg-06)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：十万次对 `[L, R]` 区间统统加减同一数值，怎么避免反复扫数组？
- 小节
  1. 差分作为前缀和逆运算的直观原理
  2. 左端抬高与右端+1撤回的标准写法
  3. 批量修改完毕后一次前缀和还原终态

<a id="alg-08"></a>

#### ALG-08 位运算黑魔法与状压基本功

- 先修：[ALG-01](#alg-01)
- 状态：已有[第 0 课：算法直觉与复杂度分析](../../src/content/handbook/algo-zero-start.md)。
- 问题：如何在 1 条 CPU 指令内完成奇偶判断、权限掩码、去最低位 1 与异或找单身数？
- 小节
  1. 位读取/置1/清零/翻转标准掩码惯用法
  2. `x & (x - 1)` 与 `lowbit` (`x & -x`) 原理
  3. 有符号左移溢出 UB 坑与 C++20 `<bit>` 头文件

## 第二篇 线性结构、双指针、二分与排序（ALG-09 ~ ALG-22）

### 数组、指针技巧与二分查找

- 入口：已理解时间/空间复杂度与循环不变量。
- 能力：把暴力枚举改写为双指针、滑窗与单调二分搜索。

<a id="alg-09"></a>

#### ALG-09 连续数组、reserve 预分配与原地修改

- 先修：[ALG-04](#alg-04)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 连续内存对 CPU 缓存预取的天然优势
  2. `reserve()` 防扩容失效与减少拷贝
  3. 快慢指针与 C++20 `std::erase` 原地清理元素

<a id="alg-10"></a>

#### ALG-10 同向双指针与滑动窗口模板

- 先修：[ALG-09](#alg-09)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 滑动窗口成立的单调性硬前提
  2. 右扩吃进、条件满足收缩左端的铁模板
  3. 为什么含负数的区间和会让滑动窗口失效

<a id="alg-11"></a>

#### ALG-11 对向双指针：两数之和、盛水容器与三数去重

- 先修：[ALG-10](#alg-10)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 有序数组首尾指针逼近证明
  2. 盛水容器贪心舍弃短板的依据
  3. 三数之和（3Sum）基准元素与内层双指针去重防重复解

<a id="alg-12"></a>

#### ALG-12 半开区间 [left, right) 二分查找与上下界

- 先修：[ALG-05](#alg-05)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 半开区间 `[left, right)` 不变量与安全中点防溢出
  2. `lower_bound`（首个 >= x）与 `upper_bound`（首个 > x）统一写法
  3. 手工追踪相等区间与空区间返回边界

<a id="alg-13"></a>

#### ALG-13 二分答案与旋转有序数组二分

- 先修：[ALG-12](#alg-12)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 把最优化问题转化为单调布尔判定 `can_finish(mid)`
  2. 最大化最小值与最小化最大值的二分区间定法
  3. 旋转排序数组如何先判别严格有序半区

### 链表、栈队、哈希表与经典排序

<a id="alg-14"></a>

#### ALG-14 单双链表、unique_ptr 所有权与虚拟头节点

- 先修：[ALG-09](#alg-09)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. `std::unique_ptr<Node>* link` 统一头删与中间删
  2. Dummy 哨兵节点彻底消灭空头特判
  3. 迭代摘链析构防超长链表递归爆栈

<a id="alg-15"></a>

#### ALG-15 链表原地反转与 Floyd 快慢指针判环

- 先修：[ALG-14](#alg-14)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 三指针 `prev/cur/nxt` 原地翻转链表
  2. 快慢指针相遇证明有环
  3. 相遇后重放慢指针回起点一步步找入环口

<a id="alg-16"></a>

#### ALG-16 LRU 缓存工程实现（list + unordered_map）

- 先修：[ALG-14](#alg-14)、[ALG-20](#alg-20)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 为何单用数组或单用哈希满足不了 O(1) get/put 淘汰
  2. 双向链表存冷热顺序 + 哈希表存节点迭代器
  3. `std::list::splice` 零分配移动热数据到表头

<a id="alg-17"></a>

#### ALG-17 栈、括号匹配与双栈表达式计算器

- 先修：[ALG-01](#alg-01)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. LIFO 模型与括号配对合法性
  2. 逆波兰后缀表达式单栈求值
  3. 中缀表达式双栈运算符优先级出栈规则

<a id="alg-18"></a>

#### ALG-18 单调栈：O(n) 解决下一个更大元素与柱状图面积

- 先修：[ALG-17](#alg-17)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 维护单调递减栈找到每个元素右边首个更大值
  2. 每个元素至多进出栈各 1 次的 O(n) 均摊保证
  3. 接雨水与柱状图最大矩形变式应用

<a id="alg-19"></a>

#### ALG-19 队列、环形缓冲区与单调双端队列

- 先修：[ALG-09](#alg-09)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 定长环形队列 `head/tail/size` 回绕契约
  2. 滑动窗口最大值与单调双端队列淘汰“又老又小”元素
  3. 实时踢出滑出左界过期下标的写法

<a id="alg-20"></a>

#### ALG-20 哈希表底层：拉链法、开放寻址与负载因子

- 先修：[ALG-09](#alg-09)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 拉链法 vs 开放寻址法缓存局域性对比
  2. 负载因子触发 `rehash` 与迭代器失效规则
  3. 只读查找用 `.find()`/.`contains()` 避开 `operator[]` 静默插入

<a id="alg-21"></a>

#### ALG-21 基础排序、归并排序与逆序对统计

- 先修：[ALG-09](#alg-09)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 插入排序在小规模与近乎有序输入下的高速表现
  2. 分治归并排序稳定 O(n log n) 过程
  3. 归并合并阶段顺便统计区间逆序对数量

<a id="alg-22"></a>

#### ALG-22 快速排序、O(n) 快速选择与基数/计数排序

- 先修：[ALG-21](#alg-21)
- 状态：已有[线性结构、双指针、二分查找、链表栈队、哈希与排序](../../src/content/handbook/algo-complexity-structures.md)。
- 小节
  1. 快排基准选择（防有序输入退化）与 Introsort 思路
  2. 快速选择 `partition` 丢掉另一半达到均摊 O(n) 求第 K 大
  3. 计数排序与基数排序打破 Ω(n log n) 比较下界

## 第三篇 字符串、树结构、堆与区间高级结构（ALG-23 ~ ALG-35）

### 字符串匹配与前缀检索

<a id="alg-23"></a>

#### ALG-23 朴素匹配 vs KMP 前缀函数与 next 数组推导

- 先修：[ALG-05](#alg-05)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 文本指针不回退思想与公共真前后缀长度 `pi[i]`
  2. `pi` 数组自匹配迭代回退推演
  3. KMP O(n + m) 全匹配位置收集模板

<a id="alg-24"></a>

#### ALG-24 字符串滚动哈希（Rabin-Karp）与防碰撞策略

- 先修：[ALG-20](#alg-20)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 把子串视为 B 进制多项式大数取模
  2. O(1) 滑窗去首添尾递推公式
  3. 双哈希防碰撞与真实字符串复核

<a id="alg-25"></a>

#### ALG-25 字典树 Trie：前缀统计与词典自动补全

- 先修：[ALG-23](#alg-23)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 用共享前缀边把千万级词库压成树
  2. 数组池 `vector<Node>` 替代零散堆分配
  3. 维护 `pass_count` 与 `end_count` 实现 O(L) 前缀查询

### 二叉树、堆、并查集与区间树

<a id="alg-26"></a>

#### ALG-26 二叉树递归遍历与递归设计三要素

- 先修：[ALG-03](#alg-03)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 前序、中序、后序遍历的访问时机差异
  2. 函数语义、Base Case、单层逻辑三步定式
  3. 自底向上求树高、节点数与对称性验证

<a id="alg-27"></a>

#### ALG-27 二叉树迭代遍历：显式栈模拟调用过程

- 先修：[ALG-26](#alg-26)、[ALG-17](#alg-17)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 超深退化链表树引发递归爆栈问题
  2. 中序遍历一路向左压栈模板
  3. 反转前序镜像快速写出后序迭代遍历

<a id="alg-28"></a>

#### ALG-28 二叉树 BFS 层序遍历与分层视图应用

- 先修：[ALG-26](#alg-26)、[ALG-19](#alg-19)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 每轮锁死当前队列长度 `level_size` 区分层界
  2. 收集二维分层视图、右视图与层平均值
  3. 区分最小深度（首个叶子）与最大深度

<a id="alg-29"></a>

#### ALG-29 二叉搜索树（BST）查找、插入与三种删除情形

- 先修：[ALG-26](#alg-26)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 全局 BST 上下界约束（非仅比较直系左右子）
  2. 插入定位叶子槽位
  3. 删除节点：无子、单子、双子找右子树最小后继替代

<a id="alg-30"></a>

#### ALG-30 平衡树直觉：AVL 旋转与红黑树五条铁律

- 先修：[ALG-29](#alg-29)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 有序插入导致普通 BST 退化成 O(n) 链表
  2. AVL 严格平衡（LL/RR/LR/RL 四种旋转）
  3. 红黑树近似平衡（最多 2~3 次旋转）与 C++ `std::map`/`set`

<a id="alg-31"></a>

#### ALG-31 二叉堆手写实现、线性建堆与流式 Top-K

- 先修：[ALG-09](#alg-09)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 完全二叉树数组下标公式 `2i+1` / `(i-1)/2`
  2. `sift_up`、`sift_down` 与 O(n) Floyd 线性建堆
  3. 为何 Top-K 用反向堆顶淘汰守门

<a id="alg-32"></a>

#### ALG-32 堆的高级应用：双堆动态中位数与 K 路归并

- 先修：[ALG-31](#alg-31)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 大顶堆（左半）+ 小顶堆（右半）平衡规则求流式 O(1) 中位数
  2. 用 K 元小顶堆实现十亿级多文件外排序归并
  3. 堆删除任意节点的懒惰删除技巧

<a id="alg-33"></a>

#### ALG-33 并查集 DSU：路径压缩与按大小合并

- 先修：[ALG-09](#alg-09)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 连通集合代表元 `parent[]` 模型
  2. `find` 路径压缩 + `unite` 按树规模合并达到近 O(1)
  3. 动态判断网络连通性与加边判环

<a id="alg-34"></a>

#### ALG-34 动态区间统计：树状数组（Fenwick）与线段树

- 先修：[ALG-06](#alg-06)、[ALG-08](#alg-08)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. 解决“既有单点更新又要区间求和”痛点
  2. 树状数组利用 `lowbit` 实现 15 行 O(log n) 改查
  3. 线段树与 Lazy 标记支持区间批量加与区间最值

<a id="alg-35"></a>

#### ALG-35 C++ 标准库 `<algorithm>` 与 `<numeric>` 工程速查

- 先修：[ALG-12](#alg-12)、[ALG-22](#alg-22)
- 状态：已有[字符串匹配、树结构、堆、并查集与区间结构](../../src/content/handbook/algo-strings-trees.md)。
- 小节
  1. `sort`/`stable_sort` 严格弱序比较器避坑
  2. `nth_element`/`partition`/`lower_bound` 高效组合
  3. `std::accumulate` 初始值类型决定防溢出陷阱

## 第四篇 图论与网络优化算法（ALG-36 ~ ALG-42）

### 图存储、遍历、最短路与生成树

<a id="alg-36"></a>

#### ALG-36 图的抽象与邻接矩阵 / 邻接表 / CSR 存储对比

- 先修：[ALG-09](#alg-09)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. 有向/无向/加权图与入度出度概念
  2. 邻接矩阵 vs 邻接表 vs 边列表空间与查边对比
  3. 密集百万边图采用扁平化 CSR 存储提升缓存命中

<a id="alg-37"></a>

#### ALG-37 图的 BFS 无权最短路与多源 BFS 模型

- 先修：[ALG-36](#alg-36)、[ALG-19](#alg-19)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. 为什么 BFS 必须“入队即标已访问”防止队列爆炸
  2. 网格四方向 Flood Fill 岛屿问题建模
  3. 超级源点与多源 BFS 同时扩散求最近距离

<a id="alg-38"></a>

#### ALG-38 图的 DFS：连通分量、二分图染色与三色判环

- 先修：[ALG-36](#alg-36)、[ALG-26](#alg-26)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. 无向图判环只需过滤回头边 `v != parent`
  2. 有向图为何菱形交叉不能只用布尔 visited，必须三色（未访/栈中/已完成）
  3. 二分图红蓝染色法验证互斥分组冲突

<a id="alg-39"></a>

#### ALG-39 有向无环图（DAG）与 Kahn 拓扑排序

- 先修：[ALG-38](#alg-38)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. CMake 目标依赖与课程先修的 DAG 模型
  2. Kahn 入度剥洋葱算法逐层入队出队
  3. 用 `order.size() < V` 直接捕捉循环依赖环

<a id="alg-40"></a>

#### ALG-40 单源非负权最短路：Dijkstra 与懒惰删除

- 先修：[ALG-31](#alg-31)、[ALG-37](#alg-37)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. 小顶堆 + 边松弛迭代机制
  2. 为何要 `if (d > dist[u]) continue;` 懒惰跳过旧堆记录
  3. 为何哪怕只有一条负权边也会摧毁 Dijkstra 正确性

<a id="alg-41"></a>

#### ALG-41 含负权边（Bellman-Ford / SPFA）与全源 Floyd

- 先修：[ALG-40](#alg-40)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. Bellman-Ford $V-1$ 轮松弛及第 $V$ 轮检出负环
  2. 队列优化 SPFA 的均摊加速与最坏退化场景
  3. 5 行 Floyd-Warshall（中转点 `k` 放最外层铁律）

<a id="alg-42"></a>

#### ALG-42 最小生成树（MST）：Kruskal 与 Prim 算法

- 先修：[ALG-33](#alg-33)、[ALG-40](#alg-40)
- 状态：已有[图论算法全解：存储、BFS/DFS、拓扑、最短路与最小生成树](../../src/content/handbook/algo-graphs.md)。
- 小节
  1. Kruskal 边排序 + 并查集避环连通全图
  2. Prim 从点出发拉拢最小割边生成树
  3. 稀疏图选 Kruskal、稠密图选 Prim 的决策标准

## 第五篇 搜索、贪心与动态规划全攻略（ALG-43 ~ ALG-50）

### 回溯、贪心与核心动态规划模型

<a id="alg-43"></a>

#### ALG-43 回溯搜索三大铁板：排列、组合与子集去重

- 先修：[ALG-26](#alg-26)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)（含[可运行示例](../../public/examples/algo-graphs-dp.cpp)）。
- 小节
  1. 决策树“做选择→递归→撤销选择”核心框架
  2. 组合/子集传 `start` 与排列传 `used[]` 的本质区别
  3. 排序后“同层前一个相同且未使用”高效去重剪枝

<a id="alg-44"></a>

#### ALG-44 高阶搜索加速：N 皇后剪枝、双向 BFS 与 A*

- 先修：[ALG-43](#alg-43)、[ALG-37](#alg-37)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 棋盘冲突位掩码即时剪枝（列与两条对角线）
  2. 双向 BFS 轮流推较小队列把指数搜剪半
  3. A* 启发函数 $f=g+h$ 可采纳性保证最优

<a id="alg-45"></a>

#### ALG-45 贪心算法、交换论证与经典反例辨伪

- 先修：[ALG-21](#alg-21)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 区间最多调度按最早结束排序的交换论证
  2. 带权区间调度如何用反例拆穿局部贪心失效
  3. 跳跃游戏与哈夫曼树合并贪心直觉

<a id="alg-46"></a>

#### ALG-46 动态规划心智模型：记忆化搜索到四步填表法

- 先修：[ALG-43](#alg-43)、[ALG-45](#alg-45)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 从重叠子问题暴搜进化为记忆化缓存与自底向上 DP
  2. 严守四步法：状态定义、转移方程、Base Case、填表序
  3. 小规模位掩码暴力枚举作为 DP 正确性黄金校验

<a id="alg-47"></a>

#### ALG-47 一维线性 DP：打家劫舍、Kadane 与 O(n log n) LIS

- 先修：[ALG-46](#alg-46)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 打家劫舍邻位互斥转移与双变量滚动空间 O(1)
  2. Kadane 最大连续子数组和负值截断
  3. 最长递增子序列 LIS 从 O(n²) 进化为 `tails + lower_bound` O(n log n)

<a id="alg-48"></a>

#### ALG-48 背包问题全家族：0-1 背包、完全背包与正逆序奥秘

- 先修：[ALG-47](#alg-47)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 0-1 背包 2D 表与方案路径回溯还原
  2. 为何 0-1 背包 1D 压缩内层必须从大到小倒序遍历
  3. 完全背包正序遍历，以及求组合数 vs 排列数的内外循环互换

<a id="alg-49"></a>

#### ALG-49 二维网格与双串序列 DP：LCS 与编辑距离

- 先修：[ALG-46](#alg-46)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 多开第 0 行第 0 列统一空串边界初始化
  2. 最长公共子序列（LCS）尾字符匹配与错位跳过
  3. 编辑距离中删/插/替换三种操作的状态对应关系

<a id="alg-50"></a>

#### ALG-50 高阶 DP 模式：状态机（股票）、区间 DP 与树形 DP

- 先修：[ALG-48](#alg-48)、[ALG-49](#alg-49)
- 状态：已有[回溯搜索、贪心论证与动态规划全家桶](../../src/content/handbook/algo-search-dp.md)。
- 小节
  1. 用状态机显式建模持股/空仓/冷静期攻克股票买卖系列
  2. 区间 DP 按区间长度从小到大推进合并分割点
  3. 树形 DP 在后序遍历中自底向上汇总子树双态解
