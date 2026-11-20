---
title: "标准库容器、迭代器与算法"
description: "对比 vector、map 与 unordered_map 的复杂度、局部性与失效规则，用半开区间和 std::find_if / std::sort 实现确定性来源聚合。"
order: 34
tags: ["C++20", "STL", "容器", "迭代器", "算法"]
related: ["handbook/cpp-containers", "handbook/lifetime", "handbook/stl-generics", "handbook/cpp20-ranges-ub"]
sources: ["stl-containers-algos.cpp"]
---

## 本课只解决这 1 个问题

写日志聚合器时，我们要统计每个来源出现了多少次（比如输入 `{"b", "a", "b", "c", "a"}`），并按“次数降序、次数相同按名称升序”输出固定报告 `a:2 b:2 c:1`。该用 `std::vector`、`std::map` 还是 `std::unordered_map`？为什么直接遍历哈希表会导致测试结果漂移？

前置要求：熟悉 `std::vector`（[第 4 课](../cpp-containers/)）、扩容失效（[生命周期与失效](../lifetime/)）以及函数模板基础（[模板与 Concepts](../stl-generics/)）。

## 心智模型：内存布局决定速度、顺序与失效边界

选容器不是背口诀，而是看清它们在内存里长什么样：

```text
std::vector:        [ "auth":2 | "db":5 | "cache":1 ]          连续内存，CPU 缓存命中率极高，支持随机访问
std::map:           (b:2)                                      红黑树节点分散在堆上，始终按 key 升序
                   /     \
                (a:2)   (c:1)
std::unordered_map: bucket[0] -> [b:2] -> [c:1]                哈希桶数组 + 链表，平均 O(1) 查找，遍历无固定顺序
                    bucket[1] -> [a:2]
```

三种核心容器的关键权衡一览：

| 维度 | `std::vector` | `std::map` | `std::unordered_map` |
| --- | --- | --- | --- |
| 按键查找复杂度 | 线性 `O(N)`（排序后二分 `O(log N)`） | 稳定 `O(log N)` | 平均 `O(1)`，极端哈希冲突 `O(N)` |
| 内存局部性 | **最好**（连续数组） | 较差（树节点分散分配） | 中等（桶连续，节点分散） |
| 遍历输出顺序 | 插入顺序（可 `std::sort` 自定义） | **始终按 key 升序** | **未指定顺序**（跨平台/重哈希都会变） |
| 插入导致的失效 | 扩容时**所有迭代器、引用、指针均失效** | 插入**不使**已有迭代器或引用失效 | 触发 **rehash（重哈希）** 时**所有迭代器失效**，但元素引用/指针仍有效 |

因此工程里最经典的**两阶段聚合模式**是：**阶段 1 用 `unordered_map` 做高速计数，阶段 2 导出到 `vector` 并用 `std::sort` 锁定输出顺序**。

### 半开区间 `[begin, end)` 与迭代器类别

STL 算法从不直接绑定容器，而是通过一对迭代器表示**左闭右开的半开区间 `[begin, end)`**：

```text
elements: [ a:2 ] [ b:2 ] [ c:1 ]   [ 哨兵位，不可解引用 ]
           ↑                         ↑
         begin()                   end()
空容器时: begin() == end()，区间长度为 0
```

算法对迭代器的能力要求分四个常见等级（由弱到强）：

| 迭代器类别 | 典型代表 | 支持操作 | 适用算法举例 |
| --- | --- | --- | --- |
| 输入（Input） | `std::istream_iterator` | 单遍只读、`++it` | `std::find_if`、`std::count_if` |
| 前向（Forward） | `std::forward_list`、`unordered_map` | 多遍读写、`++it` | `std::find_if`、`std::replace` |
| 双向（Bidirectional） | `std::map`、`std::list` | 增加 `--it` | `std::reverse` |
| 随机访问（Random Access） | `std::vector`、`std::array` | 增加 `it + n`、`it[n]`、`it1 < it2` | **`std::sort`**、二分查找 |

这就解释了为什么不能直接写 `std::sort(counts.begin(), counts.end())`：`unordered_map` 的迭代器只是前向迭代器，无法做 `O(1)` 跳跃，所以必须先导出到 `std::vector` 再排序。

## 【工程高频必会】字典计数、集合去重与 STL 算法 6 招

写实际项目和刷算法题时，下面这几套标准库组合每天都会用到：

### 1. `unordered_map` 与 `unordered_set` 最常用套路与防坑
- **统计词频 / 分组计数**：`counts[level] += 1;`（不存在时会自动初始化为 `0` 再加 1）。
- **只查询不插入（高频避坑！）**：**千万别用 `if (counts["ERROR"] > 0)` 来判断键是否存在**——`[]` 发现键不存在时会自动往表里插一条 `{"ERROR", 0}`！只读检查请用 C++20 **`counts.contains("ERROR")`**，或 `if (auto it = counts.find("ERROR"); it != counts.end())`。
- **结构化绑定遍历**：`for (const auto& [word, cnt] : counts)` 直接拆出键和值，简洁零拷贝。
- **快速去重**：`std::unordered_set<std::string> seen;` 配合 `seen.insert(line).second`（首次出现返回 `true`，重复返回 `false`）。

### 2. `<algorithm>` + `<numeric>` 高频 6 招

| 场景 | 高频写法（直接抄用） | 说明 |
| --- | --- | --- |
| 自定义结构体排序 | `std::sort(v.begin(), v.end(), [](const Item& a, const Item& b) { return a.score > b.score; });` | 降序排；严格弱序用 `<` / `>`，严禁写 `<=` |
| 按条件找第一个 | `auto it = std::find_if(v.begin(), v.end(), [](const Item& x) { return x.id == target; });` | 必须检查 `it != v.end()` 再解引用 |
| 按条件统计数量 | `auto n = std::count_if(v.begin(), v.end(), [](int x) { return x > 0; });` | 一行代替手写 `for` + `if` 累加器 |
| 极值与夹紧范围 | `std::min(a, b)`、`std::max(a, b)`、`std::clamp(val, 0, 100)` | 限制数值在 `[lo, hi]` 区间内 |
| 区间累加 | `long long sum = std::accumulate(v.begin(), v.end(), 0LL);` | 需 `#include <numeric>`；大数求和初始值写 `0LL` 防溢出 |
| **按条件删除（C++20）** | `std::erase_if(v, [](const Item& x) { return x.expired; });` | 一行直接原地删干净，告别老式 `remove_if + erase` |

## 最小可运行代码与分步追踪

保存并运行 `stl-containers-algos.cpp`：

{{example:stl-containers-algos.cpp}}

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic stl-containers-algos.cpp -o stl-containers-algos.exe
.\stl-containers-algos.exe
```

预期输出：

```text
order A: a:2 b:2 c:1
order B: a:2 b:2 c:1
first count==1: c:1
count==99 found: false
map by key (not count): a:1 c:3
unordered_map rehash observed: true (buckets 2 -> 5)
```

追踪 `aggregate_sources({"b", "a", "b", "c", "a"})` 的完整数据流：

| 步骤 | 容器 / 算法 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| 1. 哈希累加 | `unordered_map` | `{b:2, a:2, c:1}`（桶序不保证） | `++counts[src]` 不存在时自动默认初始化为 `0` 再加 `1` |
| 2. 导出切片 | `vector<SourceCount>` | 预留 `reserve(3)`，装入 3 条记录 | 连续内存，获得随机访问迭代器 |
| 3. 排序定序 | `std::sort` + lambda | `[a:2, b:2, c:1]` | 先比较 `count >`，并列 `2 == 2` 时按 `source <` 决胜 |
| 4. 条件查找 | `std::find_if` | 返回指向 `c:1` 的迭代器 | 与 `report_a.end()` 比较确认命中后再 `->` 访问 |
| 5. 重排复测 | 同函数处理 `order B` | 依然是 `[a:2, b:2, c:1]` | 彻底消除输入顺序与哈希桶顺序带来的不确定性 |

## 3 个一针见血的反例陷阱

### 坑 1：直接按 `unordered_map` 遍历结果写报告或断言

```cpp
// 错！unordered_map 的迭代顺序由哈希函数与桶数决定，换编译器或增删元素就变
for (const auto& [src, total] : counts) { std::cout << src << ':' << total << '\n'; }
```

**避坑写法**：需要对外输出、写文件或做自动化断言时，务必导出到 `vector` 并用明确规则 `std::sort`（或仅按 key 升序时直接使用 `std::map`）。

### 坑 2：不检查 `!= end()` 就解引用 `std::find_if` 的返回值

```cpp
// 错！如果没找到 count==99，it == report.end()，解引用哨兵位直接是未定义行为！
auto it = std::find_if(report.begin(), report.end(), [](const auto& e) { return e.count == 99; });
std::cout << it->source << '\n';
```

**避坑写法**：任何返回迭代器的查找算法，解引用前一律先写 `if (it != report.end())`。

### 坑 3：比较器写成 `>=` 违反严格弱序，或在遍历时插入触发 rehash

```cpp
// 错！lhs.count >= rhs.count 对相等元素返回 true，违反严格弱序（Strict Weak Ordering），可能导致越界崩溃
std::sort(report.begin(), report.end(), [](const auto& a, const auto& b) { return a.count >= b.count; });
```

**避坑写法**：比较器必须表达**严格小于/严格排在前面**（对相等的两个元素必须返回 `false`），即只用 `<` 或 `>`；另外，往 `unordered_map` 插入新键时不要保留旧迭代器跨过插入点（如需提前避免 rehash，可先调用 `counts.reserve(expected_keys)`）。

## 4 个梯度微练习

### 练习 1（选容器决策）

下面三个场景分别最适合选 `vector`、`map` 还是 `unordered_map`？用一句话说明理由：
1. 只需在程序末尾按插入顺序保存 10 万条解析记录并顺序遍历。
2. 需要频繁按日志来源名做键值计数，不需要在计数过程中保持有序。
3. 需要实时维护按时间戳升序排列的指标，并频繁查询“某个时间点之后的全部记录”。

<details>
<summary>核对答案</summary>

1. **`std::vector`**：连续内存缓存最友好，末尾追加均摊 `O(1)`，顺序遍历最快。
2. **`std::unordered_map`**：按键查找和累加平均 `O(1)`，最后再导出到 `vector` 排序即可。
3. **`std::map`**：按 key 自动保持有序，支持 `lower_bound(t)` 在 `O(log N)` 内定位范围起点。

</details>

### 练习 2（修复比较器 Bug）

下面排序想实现“先按 `count` 降序，再按 `source` 升序”，它藏着两个 Bug，请找出并修复：

```cpp
std::sort(report.begin(), report.end(), [](const SourceCount& a, const SourceCount& b) {
    if (a.count >= b.count) {
        return true;
    }
    return a.source < b.source;
});
```

<details>
<summary>提示与答案</summary>

- **Bug 1**：当 `a.count == b.count` 时，`a.count >= b.count` 返回 `true`，既违反了严格弱序，又让下面的 `a.source < b.source` 永远没有机会执行！
- **Bug 2**：当 `a.count < b.count` 时，代码没有返回 `false`，而是掉进 `a.source < b.source`，彻底破坏了主排序键。
- **正确写法**：
```cpp
if (a.count != b.count) {
    return a.count > b.count;
}
return a.source < b.source;
```

</details>

### 练习 3（半开区间与 `std::find_if`）

给定已排序的 `std::vector<SourceCount> report`，写一个函数 `std::size_t count_of(const std::vector<SourceCount>& report, const std::string& target)`：使用 `std::find_if` 查找 `target`，找到返回对应 `count`，没找到返回 `0`。

<details>
<summary>参考写法</summary>

```cpp
std::size_t count_of(const std::vector<SourceCount>& report, const std::string& target) {
    const auto it = std::find_if(
        report.begin(), report.end(),
        [&target](const SourceCount& entry) { return entry.source == target; });
    if (it == report.end()) {
        return 0;
    }
    return it->count;
}
```

</details>

### 练习 4（独立手写：空输入、并列与手写对照）

在 `stl-containers-algos.cpp` 的基础上新增三个回归检查函数并运行验证：
1. 空输入 `{}` 经过 `aggregate_sources` 后返回空 `vector`（`empty() == true`）。
2. 全并列输入 `{"z", "m", "a"}` 输出 `a:1 m:1 z:1`。
3. 写一个不用 `unordered_map` 的小样本手写计数参考解（只用 `vector` 线性查找累加），验证它和 `aggregate_sources` 在 `{"b", "a", "b", "c", "a"}` 上的输出完全一致。

<details>
<summary>参考写法</summary>

```cpp
std::vector<SourceCount> naive_aggregate(const std::vector<std::string>& events) {
    std::vector<SourceCount> report;
    for (const std::string& src : events) {
        auto it = std::find_if(report.begin(), report.end(),
                               [&src](const SourceCount& e) { return e.source == src; });
        if (it != report.end()) {
            ++it->count;
        } else {
            report.push_back(SourceCount{src, 1});
        }
    }
    std::sort(report.begin(), report.end(), [](const SourceCount& lhs, const SourceCount& rhs) {
        return (lhs.count != rhs.count) ? (lhs.count > rhs.count) : (lhs.source < rhs.source);
    });
    return report;
}
```

用简单易懂的 `naive_aggregate` 对照校验 `unordered_map` 版本，正是工程里常用的“参考解对拍”方法。

</details>
