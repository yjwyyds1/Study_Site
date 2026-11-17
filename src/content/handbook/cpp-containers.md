---
title: "第 4 课：std::string 与 std::vector 实战及越界陷阱"
description: "掌握动态数组和字符串的高频操作，分清 [] 与 .at()，并避开范围 for 修改漏写 & 和无符号 size() 下溢两大坑。"
order: 4
tags: ["C++20", "零基础", "string", "vector"]
related: ["handbook/cpp-functions", "handbook/cpp-struct-file", "handbook/lifetime"]
sources: ["cpp-containers.cpp"]
---

## 本课只解决这 1 个问题

写日志工具时，我们经常需要把一批日志存进列表里遍历、过滤、统计，或者切出每行文字的前几个字符来判断级别。本课把 `std::string` 和 `std::vector` 最实用的接口与最容易踩的坑一次讲透。

前置要求：完成[第 3 课](../cpp-functions/)，会用函数和 `const &`。

## 心智模型：一排紧挨着的可伸缩格子

`std::vector<T>` 是一排**连续排列**的同类型盒子，`T` 可以是 `int`、`std::string` 或你自己的结构体：

```text
logs:  [ "INFO start" ] [ "WARN disk" ] [ "ERROR timeout" ]
下标:         0                1                 2
       ↑ logs.front()                            ↑ logs.back()
```

常用操作速查（`std::vector` 和 `std::string` 几乎通用）：

| 操作 | 作用 | 说明 |
| --- | --- | --- |
| `v.push_back(x)` | 往末尾追加一个元素 | 容器自动按需扩容 |
| `v.size()` | 返回当前元素个数 | **注意：返回的是无符号整数 `std::size_t`** |
| `v.empty()` | 判断是否为空 | 空返回 `true`（比 `v.size() == 0` 更清晰） |
| `v[i]` | 取出第 `i` 个元素 | **不检查越界**，越界直接未定义行为 |
| `v.at(i)` | 取出第 `i` 个元素 | **会检查越界**，越界时安全报错抛出异常 |
| `v.clear()` | 清空所有元素 | `size()` 归零 |

## 最小可运行代码

下载 `cpp-containers.cpp` 到 `D:\cpp-study`：

{{example:cpp-containers.cpp}}

编译运行：

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-containers.cpp -o cpp-containers.exe
.\cpp-containers.exe
```

输出：

```text
共有 3 条日志：
- INFO start
- WARN disk
- ERROR timeout
其中 ERROR 有 1 条
```

第 15 行的范围 `for` 循环 `for (const std::string& line : logs)` 是 C++11 以来最推荐的遍历写法：不用自己管下标 `i`，也不会发生写错边界的越界问题。

## 新手必踩的 3 个容器坑（对比实验）

### 坑 1：范围 `for` 想修改元素，却忘了写 `&`

```cpp
std::vector<int> nums{1, 2, 3};
for (int x : nums) {      // 错！x 只是每个元素的复印件
    x = x * 10;
}
// 此时 nums 里依然是 {1, 2, 3}！

for (int& x : nums) {     // 正确！x 是原元素的引用
    x = x * 10;
}
// 此时 nums 真正变成了 {10, 20, 30}
```

### 坑 2：用 `v[i]` 越界访问，或者对空容器取 `v[0]` / `v.back()`

把 `cpp-containers.cpp` 里加上 `std::cout << logs.at(10) << '\n';` 再编译运行，程序会明确报错 `std::out_of_range` 并停止；而如果写 `logs[10]`，C++ 不会报错，而是直接去读隔壁未知内存（可能打印乱码甚至崩溃）。**在访问 `v[0]` 或 `v.back()` 前，务必先检查 `if (!v.empty())`。**

### 坑 3：`v.size() - 1` 的无符号整数下溢炸弹！

这是老手都会偶尔中招的坑：

```cpp
std::vector<int> empty_vec;
// 糟糕！empty_vec.size() 是无符号的 0，0 - 1 不会变成 -1，而会变成一个巨大的正整数（如 18446744073709551615）！
for (std::size_t i = 0; i < empty_vec.size() - 1; ++i) {
    // 会疯狂越界执行死循环/崩溃！
}
```

**避坑写法**：要么用范围 `for`，要么写成 `i + 1 < empty_vec.size()`（把 `- 1` 挪到左边变成 `+ 1`，永不下溢）。

## 4 个梯度微练习

### 练习 1（读代码写输出）

不要运行，写出输出：

```cpp
std::vector<std::string> tags{"INFO", "WARN"};
tags.push_back("ERROR");
std::cout << tags.size() << " " << tags.back() << " " << tags.empty() << '\n';
```

<details>
<summary>核对答案</summary>

输出：`3 ERROR 0`。追加后共 3 个元素，最后一个元素是 `"ERROR"`，非空所以 `empty()` 为 `0`（`false`）。

</details>

### 练习 2（找 Bug 并修复）

下面代码想把所有日志里的 `"WARN"` 替换成 `"WARNING"`，为什么跑完没有任何变化？

```cpp
std::vector<std::string> logs{"INFO ok", "WARN disk"};
for (std::string line : logs) {
    if (line == "WARN disk") {
        line = "WARNING disk";
    }
}
```

<details>
<summary>提示与答案</summary>

循环变量写成了值拷贝 `std::string line`，改的只是局部副本。必须改成引用：`for (std::string& line : logs)`。

</details>

### 练习 3（安全下标访问）

写一个函数 `void print_first(const std::vector<std::string>& items)`：如果 `items` 不为空就打印第一条，如果为空就打印 `"empty"`，要求绝对不能越界崩溃。

<details>
<summary>参考写法</summary>

```cpp
void print_first(const std::vector<std::string>& items) {
    if (items.empty()) {
        std::cout << "empty\n";
        return;
    }
    std::cout << items[0] << '\n';
}
```

</details>

### 练习 4（独立手写）

写一个程序：定义 `std::vector<std::string> lines`，用 `while (std::getline(std::cin, s))` 把输入的所有非空行都 `push_back` 存进 `lines`（遇到 `"END"` 停止），最后倒序打印出所有存下来的行。

<details>
<summary>参考写法</summary>

```cpp
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> lines;
    std::string s;
    while (std::getline(std::cin, s)) {
        if (s == "END") {
            break;
        }
        if (!s.empty()) {
            lines.push_back(s);
        }
    }
    for (std::size_t i = lines.size(); i > 0; --i) {
        std::cout << lines[i - 1] << '\n';
    }
    return 0;
}
```

注意倒序循环用 `i = lines.size(); i > 0; --i` 访问 `lines[i - 1]`，这样即使 `lines` 是空的也不会发生无符号下溢。

</details>
