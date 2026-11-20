---
title: "C++20 Ranges 惰性视图与未定义行为防线"
description: "组合 std::ranges 与 views::filter/transform 理解惰性求值与视图寿命，区分未定义行为边界并用 ASan/UBSan 守住安全底线。"
order: 36
tags: ["C++20", "Ranges", "未定义行为", "Sanitizer"]
related: ["handbook/stl-containers-algos", "handbook/lifetime", "handbook/linux-process-io"]
sources: ["cpp20-ranges-ub.cpp"]
---

## 本课只解决这 2 个关联问题

1. **Ranges 惰性视图（CPP-17）**：用 `std::views::filter | std::views::transform` 可以把过滤和映射延迟到真正遍历时才算，那么在遍历发生之前，**谁必须一直活着**？
2. **未定义行为边界（CPP-18）**：一段含越界读、悬垂视图或有符号整数溢出的程序，今天在我电脑上竟然打印出了“正确”结果——**能据此证明代码安全吗**？

前置要求：完成[模板与 Concepts](../stl-generics/)、[容器与算法](../stl-containers-algos/)，并回读[生命周期与失效](../lifetime/)里的“原件 vs 借条”模型。

## 心智模型：拉取式流水线 + 三级行为边界

### 1. Ranges 视图是不拥有数据的“惰性借条”

把 `std::views::filter` 和 `std::views::transform` 用管道 `|` 拼起来时，**它既不复制源数组，也不立刻计算任何结果**，只是组装好一条“按需拉取”的管线：

```text
拥有者 source: [ 3, 1, 4, 2 ]   ◄── 必须活到 for 遍历结束！
                    │  (仅借用，不复制)
                    ▼
        views::filter(偶数)      ──► 丢弃 3, 1；放行 4, 2
                    │
                    ▼
        views::transform(平方)   ──► 4*4=16, 2*2=4
                    │
                    ▼
        for 遍历并 push_back     ──► 物化进拥有型 owned_squares: [ 16, 4 ]
```

一旦把结果**物化（materialize）**到独立的 `std::vector<int> owned_squares` 中，之后就算 `source` 离开花括号被销毁，`owned_squares` 也完全安全。相反，如果你把 `pipeline` 视图本身带出 `source` 的作用域再遍历，就是典型的**悬垂视图（未定义行为）**。

同时，C++20 的 `std::ranges` 算法把“传一对迭代器 + 手写样板 lambda”升级成“直接传范围 + 投影参数（projection）”：

```cpp
// 旧写法（迭代器对 + 手写比较 lambda）
std::sort(entries.begin(), entries.end(),
          [](const LogEntry& a, const LogEntry& b) { return a.count > b.count; });

// C++20 Ranges 写法（直接传范围 + 比较器 + 成员指针投影）
std::ranges::sort(entries, std::ranges::greater{}, &LogEntry::count);
```

投影参数 `&LogEntry::count` 会自动从每个 `LogEntry` 中提取 `count` 字段再交给 `std::ranges::greater{}` 比较，语义更聚焦、不易把 `a`/`b` 写反。

### 2. 三类行为：别把“碰巧没崩”当成“安全”

| 行为类别 | 语言标准承诺 | 典型例子 | 工程应对 |
| --- | --- | --- | --- |
| **明确定义（Well-defined）** | 跨平台结果完全固定 | **无符号整数回绕**（`uint8_t(255) + 1 == 0`，模 $2^N$） | 规则确定，但仍要防 `size() - 1` 逻辑下溢 |
| **实现定义（Implementation-defined）** | 编译器必须选择并文档化某种行为 | `sizeof(long)`（Windows 64 位为 4，Linux 64 位为 8）、`char` 是否有符号 | 需要固定位宽时用 `std::int32_t` / `std::uint64_t` |
| **未定义行为（UB）** | **标准不做任何保证**：可能“凑巧正常”、崩溃或被优化器删掉整段检查 | **有符号整数溢出**、数组/vector 越界读、解引用悬垂视图或空 `optional` | **零容忍**：前置检查 + 边界测试 + ASan/UBSan |

为什么“今天跑出正确结果”毫无说服力？因为编译器优化器会**假定合法程序永远不会触发 UB**。一旦代码触发有符号溢出或越界，开启 `-O2` 后整条 `if` 保护分支都可能被优化器合法地删掉。

## 最小可运行代码与分步追踪

以下示例 100% 不包含实际 UB，安全演示了 Ranges 惰性求值、物化与寿命隔离、无符号回绕对照、安全边界读取和防溢出累加：

{{example:cpp20-ranges-ub.cpp}}

在 Windows（MinGW）下编译运行：

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp20-ranges-ub.cpp -o cpp20-ranges-ub.exe
.\cpp20-ranges-ub.exe
```

在 Linux / WSL2 下**强烈建议开启 ASan + UBSan 诊断**（MinGW 通常不带完整 ASan 运行库，Sanitizer 实验请在 WSL2 Ubuntu 中执行）：

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic -g -O1 -fsanitize=address,undefined cpp20-ranges-ub.cpp -o cpp20-ranges-ub
./cpp20-ranges-ub
```

预期输出（Windows 64 位下 `sizeof(long)` 为 4，Linux 64 位下为 8）：

```text
ranges::sort by count desc: db:5 auth:2 cache:1
before iteration: filter_calls=0, transform_calls=0
after iteration: filter_calls=4, transform_calls=2
materialized squares: 16, 4
unsigned uint8 wrap (255 + 1): 0
implementation-defined sizeof(long): 4, char is_signed=true
first_element(empty): none
first_element({42}): 42
checked_add(INT_MAX, 1): ok=false, counter=2147483647
checked_add(100, 25): ok=true, counter=125
```

关键节点执行追踪：

| 执行节点 | 观察指标 | 背后机制 |
| --- | --- | --- |
| 构造 `pipeline` 后 | `filter_calls=0, transform_calls=0` | 视图完全**惰性**，创建时不碰任何元素 |
| `for` 循环物化结束后 | `filter_calls=4, transform_calls=2` | 4 个元素都经过 `filter`，只有 2 个偶数（`4, 2`）进入 `transform` |
| 离开内层 `{}` 后打印 | `16, 4` | `source` 已销毁，但 `owned_squares` 拥有独立内存，遍历安全 |
| `first_element(empty_vec)` | `none` | `std::span` 封装指针与长度，入口先检 `empty()` 杜绝越界读 |
| `checked_add(INT_MAX, 1)` | `ok=false, counter=2147483647` | 先做 `total > max() - delta` 减法防线，**避免溢出本身发生**并保留原值 |

> **Sanitizer 的覆盖边界**：ASan 能抓堆/栈越界和释放后使用（use-after-free），UBSan 能抓有符号溢出、空指针解引用和移位越界；但它们**只能检测实际执行到的代码路径**。如果测试里没传入“空数组”或 `INT_MAX`，再强的 Sanitizer 也抓不到没跑到的 Bug——因此 **边界测试用例 + Sanitizer** 必须配合使用。

在 Linux / WSL2 上复现越界或溢出诊断时，重点盯住 Sanitizer 输出里的 3 行核心信息：

```text
1. 错误类别:  runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
              或 ERROR: AddressSanitizer: heap-buffer-overflow on address ...
2. 精确位置:  ub_demo.cpp:14:21（源文件名 : 行号 : 列号，靠 -g 保留调试符号）
3. 调用栈帧:  #0 in main ub_demo.cpp:14（从 #0 往上找到你自己写的第一行代码）
```

养成“**先用边界输入复现诊断 → 定位前置条件 → 修复后用同一组 Sanitizer 参数回归到零诊断**”的闭环习惯，就能把绝大多数隐蔽 UB 挡在上线之前。

## 3 个一针见血的反例陷阱

### 坑 1：返回借用局部容器的视图，或让视图里的 lambda 按引用捕获短命变量

```cpp
// 错！source 离开函数即销毁，返回的视图成为悬垂借条；解引用直接 UB
auto bad_view() {
    std::vector<int> source{3, 1, 4, 2};
    return source | std::views::filter([](int x) { return x % 2 == 0; });
}
```

**避坑写法**：视图只作为短生命周期的消费管线使用；要跨作用域返回时，像示例一样在源容器存活期间显式遍历物化进 `std::vector` 再返回拥有型容器。

### 坑 2：先算 `total + delta` 再判断是否溢出

```cpp
// 错！如果 total 已经是 INT_MAX，total + delta 在判断之前就已经触发有符号溢出 UB！
if (total + delta < total) { /* 优化器有权假定此事永不发生并直接删掉分支 */ }
```

**避坑写法**：在加法发生前改用减法比较 `delta > 0 && total > std::numeric_limits<int>::max() - delta`，整个判断过程保证绝不溢出。

### 坑 3：对右值临时容器调用 `std::ranges::find` 后直接解引用

```cpp
// 错！临时 vector 在分号结束即销毁，C++20 会返回特殊类型 std::ranges::dangling 阻止你误用
auto it = std::ranges::find(std::vector<int>{1, 2, 3}, 2);
// *it 会直接编译失败，这是 C++20 专门保护你免踩悬垂迭代器的安全网！
```

**避坑写法**：先把容器存成具名变量 `const std::vector<int> nums{1, 2, 3};`，再对其调用 `std::ranges::find` 并检查 `it != nums.end()`。

## 4 个梯度微练习

### 练习 1（追踪惰性求值次数）

把示例中的输入改成 `{1, 3, 5, 7}`（全部是奇数），在执行完 `for (int value : pipeline)` 后，`filter_calls` 和 `transform_calls` 分别是多少？`owned_squares` 里有几个元素？

<details>
<summary>核对答案</summary>

`filter_calls = 4`（每个元素都要检查奇偶），`transform_calls = 0`（没有元素通过过滤，平方一次也不会算），`owned_squares` 为空（0 个元素）。

</details>

### 练习 2（找出悬垂视图并修复）

下面代码想找出所有大于阈值 `min_val` 的数，哪里隐藏着双重寿命危机？请写出安全版本。

```cpp
auto make_filtered(const std::vector<int>& src) {
    int min_val = 10;
    return src | std::views::filter([&min_val](int x) { return x > min_val; });
}
```

<details>
<summary>提示与答案</summary>

1. **危机 1（必然悬垂）**：lambda 用 `[&min_val]` 按引用捕获了局部变量 `min_val`，函数一返回 `min_val` 就销毁了！应改为按值捕获 `[min_val]`。
2. **危机 2（调用方隐患）**：返回的视图仍借用 `src`，如果调用方传入临时 `vector` 或提前销毁 `src`，视图仍会悬垂。最稳妥的跨函数边界做法是直接物化并返回 `std::vector<int>`。

</details>

### 练习 3（WSL2 Sanitizer 独立诊断实验）

在 WSL2 新建一个**临时副本** `ub_demo.cpp`，故意写一句对空 `std::vector<int> v;` 访问 `v[0]`（只用于实验，切勿放进正式工程），用 `-g -O1 -fsanitize=address,undefined` 编译运行并记录首条诊断信息；随后改用本课的 `first_element(v)` 修复，再次用相同参数编译运行，确认零诊断输出。

<details>
<summary>预期诊断要点</summary>

- 故障版在 ASan 下会报类似 `ERROR: AddressSanitizer: SEGV on unknown address` 或 `heap-buffer-overflow`，并精确标出文件名、行号与调用栈。
- 修复版对 `{}` 输出 `none`，对 `{42}` 输出 `42`，且 ASan/UBSan 全程静默、退出码为 `0`。

</details>

### 练习 4（独立手写：负数下溢防护 + Ranges 过滤非零计数）

1. 针对本课的 `checked_add`，写两条针对负边界的验证用例：用 `std::numeric_limits<int>::min()` 加上 `-1`（应返回 `false` 且原值不变），再用 `std::numeric_limits<int>::min()` 加上 `1`（应返回 `true` 且值变为 `min + 1`）。
2. 用 `std::views::filter` 从 `std::vector<LogEntry>{{"auth", 2}, {"idle", 0}, {"db", 5}}` 中筛选 `count > 0` 的条目并物化到新的 `std::vector<std::string>`（只保留 `source` 名称），验证输出为 `auth, db`。

<details>
<summary>参考写法</summary>

```cpp
// 1. 负边界验证
int low = std::numeric_limits<int>::min();
bool underflow_ok = checked_add(low, -1); // false, low 仍为 INT_MIN
bool recover_ok   = checked_add(low, 1);  // true,  low 变为 INT_MIN + 1

// 2. Ranges 筛选非零计数并物化名称
const std::vector<LogEntry> all{{"auth", 2}, {"idle", 0}, {"db", 5}};
std::vector<std::string> active_sources;
auto view = all
    | std::views::filter([](const LogEntry& e) { return e.count > 0; })
    | std::views::transform([](const LogEntry& e) { return e.source; });
for (const std::string& name : view) {
    active_sources.push_back(name);
}
// active_sources == {"auth", "db"}
```

</details>
