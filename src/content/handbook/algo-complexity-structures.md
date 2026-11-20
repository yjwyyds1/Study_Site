---
title: "线性结构、双指针、二分查找、链表栈队、哈希与排序"
description: "彻底掌握连续数组、同向滑动窗口、对向双指针、半开区间与二分答案、unique_ptr 链表与判环反转、LRU 缓存、单调栈/队列、哈希冲突与归并/快排/快选（ALG-09 ~ ALG-22）。"
order: 110
category: "数据结构与算法"
tags: ["C++20", "双指针", "滑动窗口", "二分查找", "单调栈", "哈希表", "排序"]
related: ["handbook/algo-zero-start", "handbook/algo-strings-trees", "handbook/stl-containers-algos", "handbook/lifetime"]
sources: ["algo-structures.cpp"]
---

## 本课只解决这 1 类问题

写日志统计、区间检索或高并发限流时，怎么把 $\mathcal{O}(n^2)$ 暴力压到 $\mathcal{O}(n)$ 或 $\mathcal{O}(n \log n)$？二分查找为什么老写死循环或差一位？链表删节点、单调栈找下一个更大值、LRU 缓存 $\mathcal{O}(1)$ 淘汰到底怎么零 Bug 写出？本篇系统打通 **`ALG-09` ~ `ALG-22`** 共 14 个核心小节，并保留底部的全套 C++20 可运行自测代码与手工追踪表。

前置要求：掌握大 O、均摊与前缀和（[第 0 课](../algo-zero-start/)）。

---

## 详细教程：ALG-09 ~ ALG-22

### 一、连续数组、`reserve` 与原地双指针删除（ALG-09）

`std::vector` 在物理内存里紧挨着排成一条直线，CPU 顺序扫描时硬件预取器一次把整条 64 字节 Cache Line 搬进高速缓存，因此**随机访问 $\mathcal{O}(1)$、顺序遍历极快，但在中间插入/删除需要把后面所有元素整体向后/前挪动 $\mathcal{O}(n)$**。

- **工程避坑 1（扩容失效）**：已知大概长度（比如文件有 10 万行），先调用 `v.reserve(100000)` 一次性到位，既省掉十几次倍增拷贝，也避免中途引用/迭代器突然悬垂。
- **工程避坑 2（原地删除不挪多次）**：把数组里所有等于 `target` 的元素删掉，不要傻傻调用多次 `v.erase`（变 $\mathcal{O}(n^2)$）！用**快慢指针**把留下的元素往前覆盖，或者直接调用标准库 Erase-Remove 惯用法：`std::erase(v, target);`（C++20 一行搞定！）。

### 二、同向双指针与滑动窗口模板（ALG-10）

当题目求“满足某个条件的最长/最短**连续子数组或子串**”且具备**单调性**（窗口向右扩大只会让条件更容易或更难满足，比如所有数字非负时窗口和单调递增），就能用**同向双指针 `left`/`right`** 在 $\mathcal{O}(n)$ 内解决：

```cpp
// 万能滑动窗口骨架：求满足条件的最短连续子数组长度
int min_window(const std::vector<int>& a, int target) {
    int left = 0, sum = 0, best = INT_MAX;
    for (int right = 0; right < static_cast<int>(a.size()); ++right) {
        sum += a[right]; // 1. 右端吃进新元素
        while (sum >= target) { // 2. 只要达标，就记录答案并尝试收缩左端
            best = std::min(best, right - left + 1);
            sum -= a[left++];
        }
    }
    return best == INT_MAX ? 0 : best;
}
```

### 三、对向双指针：有序两数之和、盛水容器与三数之和去重（ALG-11）

对**已排好序**的序列，左指针 `l = 0` 放最左边，右指针 `r = n - 1` 放最右边，每步看 `sum = a[l] + a[r]`：
- 若 `sum < target`：为了让和变大，唯一希望是 `l++`；
- 若 `sum > target`：为了让和变小，唯一希望是 `r--`。
- **三数之和（3Sum）去重坑**：先 `sort`，固定 `i`（跳过与 `a[i-1]` 相同的重复基准），内层用 `l = i + 1, r = n - 1` 对向逼近；**找到一组解后，一定要 `while (l < r && a[l] == a[l+1]) l++;` 跳过重复解**，而不是先不管不顾丢进 `set` 里硬去重。

### 四、半开区间 `[left, right)` 二分查找与上下界（ALG-12）

```text
数组下标:    0     1     2     3     (size = 4)
元素值:    [ 1  |  2  |  2  |  4 ]
            ▲                 ▲
          left=0            right=4  (右边界开区间，永远指向“可能插入点”上界)

不变量：a[0..left) 严格 < x（对于 lower_bound）；a[right..n) 全部 >= x
循环条件：while (left < right)   安全中点：mid = left + (right - left) / 2
```

当 `left == right` 循环结束时，区间收束为单点，`left` 就是首个满足 `a[i] >= x` 的下标（若全小于 `x` 则恰好返回 `n`）。用 `lower_bound(2)=1` 和 `upper_bound(2)=3` 即可天然拼出所有等于 `2` 的半开区间 `[1, 3)`；查不存在的 `3` 则得到空区间 `[3, 3)`。

### 五、二分答案与旋转有序数组二分（ALG-13）

**二分查找绝不只用于“找数”**！只要答案在某个范围 `[lo, hi)` 上满足**“一旦 `x` 可行，比 `x` 更大（或更小）的值也全都可行”的单调性质**，就可以直接对“答案本身”做二分（例如：把 $N$ 份日志切分给 $K$ 个工人，最小化单人最大耗时）：
1. 写一个 `bool can_finish(long long limit)` 贪心验证函数（复杂度常为 $\mathcal{O}(n)$）；
2. 外层在 `[1, max_total + 1)` 上二分，总复杂度仅 $\mathcal{O}(n \log \text{Sum})$！
3. **旋转有序数组**（如 `[4,5,6,7,0,1,2]`）：每次看 `mid` 和 `nums[left]` 的大小，先断定**左半段还是右半段严格有序**，再用有序那半段的端点范围决定往哪边缩。

### 六、单向/双向链表、`unique_ptr` 所有权与哨兵头节点（ALG-14）

```text
单链表 (unique_ptr<Node> 独占链)   虚拟头节点（Dummy Node）统一删头删尾
  head_ ──► [1|next]──► [2|next]──► [3|null]
  dummy ──► [头节点] ──► [后继] ...  再也不用写 if (cur == head) 特判！
```

- **单链表与 `std::unique_ptr<Node>` 所有权**：用 `std::unique_ptr<Node>* link = &head_;` 统一指向“当前节点的所有者槽位”，删除头节点、中间节点 `2`、尾节点 `3` 或空表时走**完全同一套代码**——先把待删节点移入 `doomed`，再把 `doomed->next` 移回 `*link`，离开作用域自动 `delete`，彻底杜绝 `new/delete` 漏释放；同时在 `~SinglyList()` 用 `while (head_)` 迭代摘链，避免超长链表默认递归析构爆栈。
- **`std::list` vs `std::vector`**：工程中**默认首选 `std::vector`**，仅在明确需要“O(1) 已知迭代器剪接且已有节点指针/迭代器绝不失效”（如 LRU 缓存）时才用双向链表。

### 七、链表反转、Floyd 快慢指针判环与入环点（ALG-15）

1. **三指针原地反转链表**：`prev = nullptr, cur = head`，循环里暂存 `nxt = cur->next`，改 `cur->next = prev`，再双双前移 `prev = cur; cur = nxt;`。
2. **Floyd 判环与找入口点**：
   - `slow` 每次走 1 步，`fast` 每次走 2 步；若链表有环，两者必定在环内相遇（如果无环 `fast` 先撞空）。
   - 相遇瞬间，把其中一个指针放回 `head`，然后**两指针同时每次走 1 步，再次相遇点恰好就是环入口**！（设起点到入口距 $a$，入口到相遇点距 $b$，环余长 $c$，相遇时快指针走了 $a + b + k(b+c) = 2(a+b) \implies a = (k-1)(b+c) + c$）。

### 八、LRU 缓存工程实现：`std::list` + `std::unordered_map`（ALG-16）

**需求**：实现容量 `cap` 的最近最少使用缓存，`get(key)` 和 `put(key, val)` 都要求严格 **$\mathcal{O}(1)$**：
- 双向链表 `std::list<pair<int,int>> cache`：表头放“刚用过的热数据”，表尾放“最久没用的冷数据”，淘汰只需 `pop_back()` $\mathcal{O}(1)$。
- 哈希表 `unordered_map<int, list::iterator> map`：通过 key 在 $\mathcal{O}(1)$ 定位到链表节点迭代器，再用 `cache.splice(cache.begin(), cache, it)` **不分配、不拷贝地把该节点直接瞬移到表头**！

### 九、栈、括号匹配与表达式求值（ALG-17）

- **括号匹配**：遇到左括号 `( [ {` 压栈（或者直接压入**期望匹配的右括号** `)` `]` `}`），遇到右括号看栈是否非空且等于栈顶并弹出，最终栈必须为空。
- **双栈计算器 / 逆波兰表达式（RPN）**：逆波兰（后缀）表达式遇到数字压栈、遇到运算符弹出两个数计算后压回；中缀表达式（带 `+ - * /` 和括号）只需一个数字栈 + 一个符号栈，保持符号栈优先级单调递增，遇到同级或更低优先级符号就先弹出算完再入栈。

### 十、单调栈：一趟扫描解决“下一个更大元素”（ALG-18）

**特征问题**：对于数组里每个元素，找它右边（或左边）**第一个比它大/比它小**的元素、接雨水、柱状图最大矩形。
**套路**：栈里存**下标**（保持栈底到栈顶对应的数值严格单调递减）。新元素 `a[i]` 到来时，只要它比栈顶元素大，就说明栈顶元素终于等到了“右边第一个比自己大的数就是 `a[i]`”，弹出计算答案并循环，最后把 `i` 压栈。每个元素**至多入栈 1 次、出栈 1 次**，总时间严格 **$\mathcal{O}(n)$**！

```cpp
// 找每个位置右侧第一个严格更大元素的下标（没有则为 -1）
std::vector<int> next_greater(const std::vector<int>& a) {
    int n = static_cast<int>(a.size());
    std::vector<int> ans(n, -1), st;
    for (int i = 0; i < n; ++i) {
        while (!st.empty() && a[st.back()] < a[i]) {
            ans[st.back()] = i;
            st.pop_back();
        }
        st.push_back(i);
    }
    return ans;
}
```

### 十一、队列、环形缓冲区与单调队列（ALG-19）

```text
环形队列 (FIFO，cap=3 回绕示意图)
  [ A | B | C ]  → pop() 出 A，head = (head + 1) % 3
  [ D | B | C ]  → push('D')，tail = (tail + 1) % 3   实际出队顺序：B → C → D
```

- **定长环形缓冲区（Ring Buffer）**：用固定大小数组 + `head` + `tail` + `count` 实现无锁/零堆分配队列，嵌入式、日志缓存与网卡驱动全靠它。
- **单调双端队列（Monotonic Deque）**：解决“长度为 `k` 的固定滑动窗口里的最大值”——用 `std::deque<int>` 存下标：**新元素进队尾前，把队尾比它小且早过期的值全踢掉**（既没你大、又比你老，永无出头之日）；然后检查**队头下标是否已滑出 `[i - k + 1, i]` 窗口左界**，滑出就 `pop_front()`，最终**队头永远是当前窗口最大值**，严格 $\mathcal{O}(n)$！

### 十二、哈希表底层：拉链法、开放寻址与负载因子（ALG-20）

| 冲突解决策略 | 底层机制 | 优缺点与工程应用 |
| --- | --- | --- |
| **拉链法（Separate Chaining）** | 每个桶挂一条链表（C++ `unordered_map` 规定要求迭代器稳定性，几乎全用链地址法） | 插入删除简单、容忍高负载因子；但指针跳转缓存不友好 |
| **开放寻址法（Open Addressing）** | 所有键值直接平铺在连续大数组里，冲突时按线性探测 / 二次探测 / Swiss Table SIMD 找下一个空槽 | 极度缓存友好（Google `absl::flat_hash_map` 快 2~4 倍！），删除需做墓碑（Tombstone）标记 |

- **负载因子 $\alpha = \text{size} / \text{bucket\_count}$**：超过阈值（通常 `0.75~1.0`）触发 `rehash`——桶数组翻倍并对每个元素重新映射，`unordered_map` 的全部**迭代器立即失效**（但拉链法下已有元素指针/引用通常仍有效）。
- **定制 C++ 自定义类型哈希与防哈希洪水攻击**：为结构体提供特化或 functor 哈希时用位混洗合并成员哈希；公开网络服务若用普通固定哈希可能被恶意构造全碰撞键退化成 $\mathcal{O}(n^2)$，此时应加随机盐（splitmix64）或改用有序 `map`。

### 十三、基础排序、归并排序与逆序对统计（ALG-21）

| 排序算法 | 平均 / 最坏复杂度 | 额外空间 | 稳定性 | 一句话定位 |
| --- | --- | --- | --- | --- |
| 插入排序 | $\mathcal{O}(n^2)$（近乎有序时 $\mathcal{O}(n)$） | $\mathcal{O}(1)$ | **稳定** | 小规模数据（$n \le 32$）比快排还快，`std::sort` 底层收尾用它 |
| 归并排序 | **稳定 $\mathcal{O}(n \log n)$** | $\mathcal{O}(n)$ | **稳定** | 链表排序、外部归并大文件、顺带 $\mathcal{O}(n\log n)$ 算**逆序对数量**（右半段 `a[j] < a[i]` 时一次性贡献 `mid - i` 个逆序对） |
| 堆排序 | 稳定 $\mathcal{O}(n \log n)$ | $\mathcal{O}(1)$ | 不稳定 | 缓存局部性较差，常用作 `std::sort` 最坏退化兜底（Introsort） |

### 十四、快速排序、$\mathcal{O}(n)$ 快速选择与线性排序（ALG-22）

1. **快速排序（Quicksort）与随机化基准**：选一个 pivot，把小于它的划到左边、大于它的划到右边再分治。若总选最左元素当 pivot，遇到有序数组会退化为 $\mathcal{O}(n^2)$；工程做法是**三数取中 / 随机选 pivot**，结合深层改堆排（`std::sort` 即 Introsort）。
2. **快速选择（Quickselect）$\mathcal{O}(n)$ 找第 $K$ 大**：快排每次 `partition` 后，pivot 会落到它在最终排序里的唯一真实位置 `p`——如果 `p == target_idx` 直接返回，如果目标在左边就**只递归左边、彻底扔掉右边**！级数 $n + n/2 + n/4 + \dots = 2n$，均摊只需 **$\mathcal{O}(n)$**（对应 C++ `std::nth_element`）。
3. **打破 $\Omega(n\log n)$ 下界的线性排序**：当键是小范围整数或定长字符时，不靠两两比较，直接用**计数排序 / 基数排序（Radix Sort，按位从低到高稳定桶排）**，速度达到 **$\mathcal{O}(n + K)$**！

---

## 心智模型汇总与 Top-K 对比决策

```text
容器选型决策树：
需要按“键”快速查找？
  ├─ 否 → 需要两端增删且不挪动中间？ → 是：deque / 环形队列；否：vector（默认首选）
  └─ 是 → 需要按键有序遍历或区间查询？
            ├─ 是 → std::map / 排序后的 vector + lower_bound
            └─ 是非有序频次统计 → std::unordered_map（若需确定性输出，再导回 vector 排序）
```

**为什么流式 Top-K 用“小顶堆”而不是大顶堆？** 我们想保留最大的 $K$ 个，因此堆顶必须站着“目前这 $K$ 个里最弱的那一个”。每来新元素若比堆顶更优就淘汰堆顶（入堆再 `pop()`），总代价 $\mathcal{O}(M \log K)$。而且为了同频次并列时结果可复跑，必须定义**次级键**（频次降序、键升序），并用**全排序 `std::sort`** 作单元测试基准判据！

## 可运行 C++20 代码

下面的完整程序覆盖上述核心线性结构，并在 `main` 中对单链表头中尾删除、环形队列、滑动窗口、Top-K（对照全排序）与二分边界做了自动校验：

{{example:algo-structures.cpp}}

在终端编译并运行（零警告要求）：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic public/examples/algo-structures.cpp -o algo-structures.exe
.\algo-structures.exe
```

预期实测输出：

```text
[ALG-01/02] count_pairs(4)=6, count_pairs(8)=28, push_back(17) reallocs=6, final_cap=32
[ALG-03] SinglyList 1->2->3: del(2)=[1,3], del(3)=[1], del(1)=[], del_empty=false
[ALG-04] RingQueue pop: B C D
[ALG-12] min_len_at_least([2,1,3,2], 5)=2
[ALG-05/06/16] Top-2: a:2 b:2
[ALG-08] range(2)=[1,3), range(3)=[3,3)
```

## 关键步骤追踪表

### 追踪 1：`lower_bound_idx({1, 2, 2, 4}, 2)`

| 轮次 | `left` | `right` | `mid` | `a[mid]` | 分支与不变量保持 |
| --- | ---: | ---: | ---: | ---: | --- |
| 初始 | `0` | `4` | — | — | `a[0..0)` 为空（`<2`），`a[4..4)` 为空（`>=2`） |
| 第 1 轮 | `0` | `4` | `2` | `2` | `2 >= 2`，说明 `mid` 及右侧都 `>=2`，令 `right = 2` |
| 第 2 轮 | `0` | `2` | `1` | `2` | `2 >= 2`，令 `right = 1` |
| 第 3 轮 | `0` | `1` | `0` | `1` | `1 < 2`，说明 `mid` 及左侧都 `<2`，令 `left = 1` |
| 终止 | `1` | `1` | — | — | `left == right`，返回 `1`（首个 `2` 的下标） |

### 追踪 2：`min_len_at_least({2, 1, 3, 2}, 5)` 滑动窗口演化

| `right` | 窗口元素 `[left..right]` | `sum` | 是否满足 `>= 5` 及收缩后状态 | `best` |
| ---: | --- | ---: | --- | ---: |
| `0` | `[2]` | `2` | 否 | `5` (哨兵) |
| `1` | `[2, 1]` | `3` | 否 | `5` |
| `2` | `[2, 1, 3]` | `6` | 是！记下长度 `3`，收缩左端删 `2` → 窗口 `[1, 3]`，`sum=4 < 5` | `3` |
| `3` | `[1, 3, 2]` | `6` | 是！记下长度 `3`，删 `1` 得 `[3, 2]` (`sum=5 >= 5`) 记长度 **`2`**，再删 `3` 得 `[2]` (`sum=2`) | **`2`** |

### 追踪 3：`top_k_heap({"b", "a", "c", "b", "a"}, 2)`

频次表为 `a:2, b:2, c:1`，报告顺序 `a:2 > b:2 > c:1`，小顶堆把“报告序最差者”放堆顶：
1. 插入 `c:1`，堆内 `[c:1]`（大小 `1 <= 2`）。
2. 插入 `b:2`，堆内 `[c:1, b:2]`（`c:1` 最差在堆顶，大小 `2 <= 2`）。
3. 插入 `a:2`，堆大小变成 `3 > 2`，弹出堆顶最差者 `c:1`，余下 `[b:2, a:2]`。
4. 全部弹出并按 `report_better` 排序，输出固定为 `a:2 b:2`（无论哈希表遍历顺序怎么变，结果完全确定）。

## 1 行反例坑点速查表

| 常见误区 | 1 行反例 / 症状 | 正确做法 |
| --- | --- | --- |
| `unique_ptr` 单链表直接递归析构或漏判空表 | 插入 10 万个节点后离开作用域默认递归 `~Node()` 栈溢出；删空表解引用 `head_->val` 崩溃 | 写迭代析构 `while (head_)` 逐个摘链；删除循环用 `while (*link)` 统一护空 |
| 滑动窗口直接用于含负数序列 | `[3, -2, 4]` 求和 `>= 4`：左缩后遇到 `-2` 窗口和反而先降再升，漏掉正解 | 有负数时窗口和失去单调性，改用前缀和 + 单调队列或哈希 |
| 用 `counts[key]` 判断键是否存在 | `if (counts["d"] == 0)` 会**悄悄插入** `"d":0`，键数从 3 变成 4 | 只读查询必须用 `counts.find("d") != counts.end()` 或 `.contains("d")` |
| 比较器写 `<=` | `return a.freq <= b.freq;` 违反严格弱序，触发 `std::sort` 越界崩溃 | 比较器对相等元素必须返回 `false`（严格用 `<` 或 `>`） |
| 二分写 `(left + right) / 2` 或闭区间漏 `-1` | 大数组下标相加有符号溢出；`right = mid` 配 `left <= right` 死循环 | 固定半开 `[left, right)`、`while (left < right)` 与 `left + (right - left) / 2` |
| 保留 `vector` 元素引用后继续 `push_back` | 第 17 次扩容搬移整块堆内存，旧引用/指针瞬间悬垂（UB） | 提前 `reserve()`，或在变更容器后重新通过下标/迭代器取引用 |

## 4 个微练习

### 练习 1（`ALG-01` 复杂度与循环计数）

如果把 `count_pairs` 里的内层循环改成从 `0` 到 `n`（即每轮固定跑 `n` 次），$n=4$ 和 $n=8$ 分别输出多少？若外层再套一层从 `0` 到 `n` 的循环，样本翻倍工作量会变成几倍？

<details>
<summary>提示与参考答案</summary>

内层固定跑 $n$ 次时，总次数为 $n^2$：$n=4$ 得 $16$，$n=8$ 得 $64$（翻倍变 $4$ 倍）。若再加一层到 $n$ 的循环，总次数为 $\Theta(n^3)$，样本翻倍工作量变为 $2^3 = 8$ 倍。

</details>

### 练习 2（`ALG-04` 环形队列边界）

在 `algo-structures.cpp` 的 `RingQueue<char>(3)` 上依次执行：`push('X')`、`push('Y')`、`pop()`、`push('Z')`、`push('W')`、`pop()`。请手推此时 `head_`、`tail_`、`size_` 分别等于多少，下一次 `pop()` 返回什么？

<details>
<summary>提示与参考答案</summary>

1. `push('X')`, `push('Y')`: `buf=[X, Y, _]`, `head=0, tail=2, size=2`
2. `pop()` → 返回 `'X'`: `head=1, tail=2, size=1`
3. `push('Z')`: `buf=[X, Y, Z]`, `head=1, tail=0, size=2`
4. `push('W')`: `buf=[W, Y, Z]`, `head=1, tail=1, size=3`
5. `pop()` → 返回 `'Y'`: `head=2, tail=1, size=2`
因此最终 `head_=2`、`tail_=1`、`size_=2`，下一次 `pop()` 返回 `'Z'`。

</details>

### 练习 3（`ALG-08` 半开区间边界）

在数组 `a = {1, 2, 2, 4}` 上，不运行代码先手推 `lower_bound_idx(a, 0)`、`upper_bound_idx(a, 0)`、`lower_bound_idx(a, 9)` 和 `upper_bound_idx(a, 9)` 分别返回什么下标？为什么不会越界？

<details>
<summary>提示与参考答案</summary>

查 `0` 时，所有元素都 `>= 0`，`right` 一路缩到 `0`，故 `lower_bound=0, upper_bound=0`（空区间 `[0, 0)`）。查 `9` 时，所有元素都 `< 9`，`left` 一路升到 `4`，故 `lower_bound=4, upper_bound=4`（空区间 `[4, 4)`）。因为循环条件是 `left < right`，`mid` 严格落在 `[0, a.size() - 1]` 之间，永远不会用 `a[a.size()]` 解引用。

</details>

### 练习 4（`ALG-16` Top-K 扩展边界）

修改 `algo-structures.cpp` 中 `main` 的测试：构造一组 6 个键且两两同频次的输入 `{"z", "m", "a", "z", "m", "a"}`，测试 `K=2` 时输出顺序，并验证当 `std::nth_element` 代替堆时，如果不对前 $K$ 个再调用一次 `std::sort`，输出结果有什么问题？

<details>
<summary>提示与参考答案</summary>

频次全为 `2` 时，按次级键字典序升序，`K=2` 必须严格输出 `a:2 m:2`。`std::nth_element` 只保证第 $K$ 位左边的元素都“优于或等于”第 $K$ 位，**并不保证前 $K$ 个元素自身有序**；因此使用 `nth_element` 后必须对 `[begin, begin + k)` 再做一次 `std::sort` 才能得到确定性报告。

</details>
