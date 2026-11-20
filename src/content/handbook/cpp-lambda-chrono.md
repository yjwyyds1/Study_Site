---
title: "Lambda 表达式、闭包寿命与 chrono 时间格式化"
description: "拆解 Lambda 闭包的编译器匿名结构体模型、值/引用/移动初始化捕获的寿命边界，以及 steady_clock 计时、system_clock 时间戳与 std::format。"
order: 35
tags: ["C++20", "Lambda", "chrono", "格式化", "生命周期"]
related: ["handbook/stl-containers-algos", "handbook/lifetime", "handbook/value-move", "handbook/concurrency-queue"]
sources: ["lambda-chrono.cpp"]
---

## 本课只解决这 1 个问题

在 `std::sort` 里用 `[&]` 捕获外部变量非常顺手，为什么把同样的 `[&]` 放进返回值或 `std::thread` 里就会变成定时炸弹？测函数耗时、给日志打 `YYYY-MM-DD HH:MM:SS` 时间戳，为什么必须分清 `steady_clock` 与 `system_clock`？

前置要求：熟悉 `std::sort` 定制比较（[容器与算法](../stl-containers-algos/)）、引用寿命边界（[生命周期与失效](../lifetime/)）以及移动语义（[值语义与移动](../value-move/)）。

## 心智模型：闭包是匿名结构体，时间靠“双时钟”分工

### 1. Lambda 语法解剖与编译器匿名仿函数模型

Lambda 根本不是“魔法”，编译器在幕后把它翻译成一个**带 `operator()` 的匿名结构体（闭包类型）**：

```text
源码写法：
  int factor = 2;
  auto by_val = [factor](int x) -> int { return x * factor; };

编译器等价展开（心智模型）：
  struct __Lambda_1 {
      int factor;                              // 捕获列表变成结构体成员变量！
      int operator()(int x) const {            // 默认带 const，不能改值捕获成员
          return x * factor;
      }
  };
  __Lambda_1 by_val{factor};                   // 在定义点就完成了成员拷贝/引用绑定
```

注意：**加了 `mutable`（例如 `[count = 0]() mutable { return ++count; }`）仅仅是去掉了 `operator()` 上的 `const`**，让你能修改闭包自己的成员变量，**绝不会修改外部原变量**（因为 `[=]` 拷贝进结构体的只是一份副本）。

### 2. 五种捕获模式与“同步借用 vs 异步逃逸”寿命边界

| 捕获写法 | 结构体成员类型 | 寿命与所有权含义 | 适用场景 |
| --- | --- | --- | --- |
| `[]` | 无成员 | 纯函数，不捕获任何外部状态 | 简单比较器、可退化为函数指针 |
| `[=]` / `[x]` | `T x`（按值拷贝） | 在定义 Lambda 那一刻拷贝一份独立副本 | 返回闭包、异步线程安全传递小对象 |
| `[&]` / `[&x]` | `T& x`（引用借用） | **不拥有对象**，仅保存指向外部栈变量的引用 | 仅限**同步算法**（如 `std::sort` / `std::find_if`） |
| `[this]` / `[*this]` | `Obj*` vs `Obj` 拷贝 | `[this]` 借用原对象指针；C++17 `[*this]` 拷贝整个对象 | 成员函数回调（异步回调必须用 `[*this]` 或 `shared_ptr`） |
| `[d = std::move(d)]` | `T d`（移动初始化捕获） | C++14 起，把独占资源（如 `vector`、`unique_ptr`）直接**移入**闭包 | 把大缓冲或独占句柄安全移交给 `std::thread` |

**一条铁律划清 `[&]` 安全线**：

```text
同步调用（如 std::sort）：
  函数栈帧存活期: [========= sort 内部跑完所有比较 =========]  ──► 栈帧销毁
  [&] 借用有效期:      [====== 安全 ======]

异步 / 返回闭包（如 return [&] 或 std::thread）：
  函数栈帧存活期: [=== 返回 / 离开作用域 ===] ──► 局部变量已销毁！
  异步闭包执行期:                          [=== 解引用悬垂地址 → UB！ ===]
```

### 3. `<chrono>` 双时钟模型与强类型时长

`<chrono>` 把“时间点（`time_point`）”和“时长（`duration`）”做成强类型，防止把毫秒当秒传错：
- **`std::chrono::steady_clock`（单调时钟）**：像秒表一样只增不减，绝不因系统校时（NTP）或夏令时而跳变。**所有耗时统计、超时判断一律用它。**
- **`std::chrono::system_clock`（墙上时钟）**：对应真实日历时间，可以转 `std::time_t` 打印日志时间戳，但可能被操作系统向后回拨。
- **字面量与换算**：`using namespace std::chrono_literals;` 后可直接写 `5ms`、`100ms`、`1s`（编译器自动推导成 `std::chrono::milliseconds` 等强类型）；高精转低精需要显式 `duration_cast` 表明允许向零截断，而低精转高精（如 `1s + 500ms == 1500ms`）可隐式无损转换。

### 4. C++20 `std::format` 与编译器兼容现实

C++20 引入了类型安全的 `<format>`（如 `std::format("{:04d}-{:02d}-{:02d}", y, m, d)`），比传统工具更简洁安全：

| 格式化方案 | 类型安全 | 性能与可读性 | 编译器兼容说明 |
| --- | --- | --- | --- |
| `printf` / `snprintf` | 弱（`%s` 配 `int` 编译期未必拦截） | 快，但格式串易写错 | 所有编译器可用 |
| `std::ostringstream` + `<iomanip>` | **强** | 会修改流状态（如 `std::hex` / `setw`），拼接较啰嗦 | C++98 起全平台可用 |
| C++20 `std::format` | **强**（编译期校验格式串） | 极快、无流状态污染，接近 Python f-string | GCC 13+ / Clang 17+ / MSVC 完整支持；**Ubuntu 22.04 默认 GCC 11/12 尚无 `<format>`** |

因此跨环境代码常用 `#if defined(__cpp_lib_format)` 做编译期探测（或通过 `FetchContent` 引入 `fmt` 库），旧环境优雅回退到 `std::ostringstream` + `std::put_time`。

**注意 `std::localtime` 的线程安全**：标准库 `std::localtime(&raw)` 返回指向内部静态区的指针，单线程打印安全；多线程并发格式化日志时，Linux 应改用 `localtime_r(&raw, &tm_buf)`，Windows 用 `localtime_s(&tm_buf, &raw)`，或用 `std::mutex` 保护。

## 可运行 C++20 代码

下面的完整程序演示了 `[=]`、`mutable`、同步 `std::sort` 中的 `[&]`、异步线程移动捕获 `[data = std::move(batch)]`，以及 `steady_clock` 耗时测量和 `system_clock` 时间格式化：

{{example:lambda-chrono.cpp}}

在终端编译并运行（零警告要求；Linux 下若使用较旧 GCC 可加 `-pthread`）：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic public/examples/lambda-chrono.cpp -o lambda-chrono.exe
.\lambda-chrono.exe
```

预期实测输出（`elapsed_ms` 与 `wall_time` 会随当前时间与系统调度精度变化）：

```text
[lambda] by_val(3)=6, add_five(7)=12, async_sum=100
[chrono] elapsed_ms>=9ms, wall_time=2026-11-19 22:36:10
```

## 关键步骤追踪表

### 追踪 1：四段闭包的内存成员与所有权去向

| 闭包表达式 | 闭包体内存储了什么 | 外部原变量变动后闭包如何表现 | 离开当前函数是否安全 |
| --- | --- | --- | --- |
| `by_val` (`[factor]`) | `int factor = 2;`（独立拷贝） | 外部 `factor = 10` 后，`by_val(3)` 仍用 `2` 得 `6` | 安全 |
| `by_mut` (`[count = 0] mutable`) | `int count = 0;`（可改成员变量） | 每次调用递增自身 `count`（`1` → `2`） | 安全 |
| `std::sort(..., [&](int a, int b){...})` | `int& target_pivot;`（栈引用） | 立即同步用完，未逃逸出栈帧 | 安全（仅限同步） |
| `worker([data = std::move(batch), &async_sum])` | 接管原堆缓冲的 `vector` + `async_sum` 引用 | 原 `batch.empty()` 变 `true`；靠 `worker.join()` 守住 `async_sum` 寿命 | 线程在 `join()` 内安全 |

### 追踪 2：`<chrono>` 计时与格式化类型链

1. `t0 = steady_clock::now()` → 类型 `steady_clock::time_point`（单调纳秒/微秒滴答）。
2. `steady_clock::now() - t0` → 两时间点相减得到 `duration`（精度随平台，Windows/Linux 常为纳秒）。
3. `duration_cast<milliseconds>(...)` → 显式向零截断为 `std::chrono::milliseconds`，再用 `.count()` 取出整数毫秒。
4. `system_clock::to_time_t(tp)` → 转为日历秒 `std::time_t`，经 `std::localtime` 拆出 `tm_year + 1900` 等字段格式化输出。

## 1 行反例坑点速查表

| 常见误区 | 1 行反例 / 症状 | 正确做法 |
| --- | --- | --- |
| 返回 `[&]` 捕获局部变量的闭包 | `return [&base](int x){ return base + x; };` 返回后读垃圾内存（UB） | 逃逸或跨线程的闭包一律用按值 `[base]` 或移动捕获 `[x = std::move(x)]` |
| 用 `std::thread` 按 `[&]` 抓循环或局部对象却 `detach()` | 主线程离开大括号销毁局部变量，后台线程解引用崩溃 | 转移所有权进闭包并用 `join()`（或 C++20 `std::jthread`）收尾 |
| 用 `system_clock` 计算函数耗时 | NTP 校时把系统时间回拨 2 秒，算出 `-1995ms` 触发断言失败 | 耗时/超时一律用 `std::chrono::steady_clock` |
| 在成员函数里用 `[=]` 期待值拷贝当前对象 | C++20 已弃用 `[=]` 隐式捕获 `this` 指针——实际抓的是裸指针而非拷贝 | 明确写 `[this]`（同步）或 `[*this]` / `[self = shared_from_this()]`（异步） |
| 期望 `mutable` 值捕获改变外部变量 | `[x]() mutable { x = 99; }();` 外部 `x` 根本没变 | 需要修改外部变量时在**同步**作用域里用 `[&x]` |

## 4 个微练习

### 练习 1（值捕获拷贝时机）

如果不看运行结果，先手推：`int k = 10; auto f = [k](int x) { return x + k; }; k = 99;`，调用 `f(5)` 返回 `15` 还是 `104`？如果要让它返回 `104` 该改哪一个字符？

<details>
<summary>提示与参考答案</summary>

返回 `15`。按值捕获 `[k]` 在**定义 Lambda 的那一行**就已经把 `10` 拷贝进闭包的成员变量里了，后面 `k = 99` 不会影响这份拷贝。若希望随外部变化（且保证 `f` 不逃逸出当前作用域），把 `[k]` 改成 `[&k]` 即可返回 `104`。

</details>

### 练习 2（移动初始化捕获与 `std::unique_ptr`）

为什么把一个 `std::unique_ptr<int> p = std::make_unique<int>(42);` 用 `[=]` 或 `[p]` 按值捕获进 Lambda 会直接编译报错？应该怎么写才能把 `p` 的所有权放进闭包？

<details>
<summary>提示与参考答案</summary>

`std::unique_ptr` 禁止拷贝（删除了拷贝构造函数），所以 `[p]` 按值拷贝会报错。必须使用 C++14 移动初始化捕获：`auto fn = [p = std::move(p)]() { return *p; };`，此时所有权转移到闭包成员中，原外部 `p` 变为 `nullptr`。

</details>

### 练习 3（构造与修复悬垂 `std::thread`）

在 `lambda-chrono.cpp` 中，如果我们故意把 `worker.join()` 改成 `worker.detach()`，或者把 `[data = std::move(batch)]` 改成 `[&batch]` 并在 `main` 离开内部 `{ ... }` 前加一句提前 `return`，会发生什么风险？

<details>
<summary>提示与参考答案</summary>

一旦主线程离开内部块或函数返回，栈上的 `batch` 与 `async_sum` 立刻析构销毁，后台线程仍在读写已释放的栈内存，触发典型的 Use-After-Return 未定义行为（用 `-fsanitize=address,thread` 编译会直接报警）。修复方式：按值/移动转移数据进闭包，并用 `join()`（或 `std::jthread`）确保线程结束后再销毁接收结果的变量。

</details>

### 练习 4（`steady_clock` 精度单位切换）

修改 `lambda-chrono.cpp`，增加一行输出，把 `std::chrono::steady_clock::now() - t0` 同时换算成微秒（`std::chrono::microseconds`）打印出来；思考为什么做基准测试（Benchmark）时微秒比毫秒更有参考价值？

<details>
<summary>提示与参考答案</summary>

```cpp
const auto elapsed_us = std::chrono::duration_cast<std::chrono::microseconds>(
    std::chrono::steady_clock::now() - t0);
std::cout << "elapsed_us=" << elapsed_us.count() << "us\n";
```
因为 `duration_cast<milliseconds>` 会向零截断，小于 `1ms`（例如 `850us`）的快速操作会被截断成 `0ms`，丢失所有对比区分度；换成 `microseconds` 或 `nanoseconds` 能避免截断失真。

</details>
