---
title: "对象何时失效？从引用悬空到 vector 扩容"
description: "先用局部 int 和 string 看懂谁拥有数据、借用能活多久，再观察 vector 扩容时旧引用为什么失效。"
order: 20
tags: ["C++20", "生命周期", "string_view", "vector"]
related: ["handbook/cpp-functions", "handbook/raii", "labs/logscan"]
sources: ["lifetime-int.cpp", "lifetime.cpp"]
---

## 本课只解决这 1 个问题

在前面我们学会了用 `const std::string&` 和 `std::vector`，但 C++ 里有一个最隐蔽的坑：**“借用”别人数据时，原数据已经销毁或搬家了，你还拿着旧借用去读，程序就会读到垃圾甚至崩溃。** 本课让你看懂“谁拥有数据”和“借用什么时候失效”。

前置要求：会写函数、引用传递（`int&` / `const std::string&`）和 `std::vector`。

## 心智模型：原件 vs 借条

把 C++ 里的对象分成两类，很多问题立刻变清楚：

- **拥有者**（如 `int line`、`std::string owner`、`std::vector<int> hits`）：自己管着一块内存，离开所在的花括号 `{ ... }` 时自动销毁。
- **借用者**（如 `int& alias`、`std::string_view view`）：自己不存数据，只是指向某个拥有者手里的数据。**借条本身能活多久没用，关键是原件还活没活着。**

用 `lifetime-int.cpp` 先看最简单的局部 `int`：

{{example:lifetime-int.cpp}}

```text
[B] line   ──→ int(10)
    copied ──→ int(10)   另一份独立盒子

[C] line   ──→ int(11) ←── alias (借条)
    copied ──→ int(20)

[D] line   ──→ int(11)
    copied ──→ int(20)   alias 离开内层 {} 销毁，但 line 还在
```

这里内层的 `alias` 比外层的 `line` 死得早，所以完全安全。真正危险的是反过来：**原件死了，借条还活着。**

<details>
<summary>深入一步：C++ 怎么精确区分作用域、存储期与生命周期</summary>

- **作用域**：名字在源码哪段范围里能写出来。
- **存储期**：那块内存按什么规则存在（局部变量是自动存储期，离开块释放；`static` 持续到程序结束）。
- **生命周期**：对象从构造完成开始，到析构或内存被释放/复用结束。
可对照 C++20 标准草案 [N4861 · basic.life](https://timsong-cpp.github.io/cppwp/n4861/basic.life#1)。

</details>

## 字符串里的借条：`std::string_view`

`std::string` 是**拥有者**（自己管理字符内存）；而 `std::string_view`（C++17 引入）是一张**只读借条**，里面只记了“字符起点 + 长度”，几乎零复制成本，非常适合函数参数传只读文本。

但正因为它是借条，如果它看的 `std::string` 销毁了，它就成了**悬垂视图**：

```cpp
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string_view view;
    {
        const std::string owner{"INFO ready"}; // [S1] owner 拥有字符
        view = owner;                          // [S2] view 借到 owner 的字符
        std::cout << view << '\n';             // [S3] 此时安全
    }                                          // [S4] owner 离开花括号，销毁！

    // 危险：此时再读 view 是未定义行为（原字符已经没了）
    // std::cout << view << '\n';
}
```

## 只改一处的对比实验：临时字符串

下面两行看起来很像，第一行安全，第二行却直接悬垂（**只看分析，不要运行未定义行为**）：

```cpp
// 安全：const std::string& 直接绑定临时对象，会把临时对象的寿命延长到当前块结束
const std::string& held = std::string{"WARN"};

// 危险（悬垂！）：std::string{"WARN"} 在分号处立刻销毁，bad 变成空头借条
std::string_view bad = std::string{"WARN"};
```

结论很简单：**函数参数接收 `std::string_view` 通常很安全（因为调用期间实参还活着）；但要把一段文本长期存下来（比如放进 `vector` 或从函数返回），请存拥有者 `std::string`，不要存 `string_view`。**

<details>
<summary>深入一步：标准条款参考</summary>

临时对象寿命规则见 [N4861 · class.temporary](https://timsong-cpp.github.io/cppwp/n4861/class.temporary#6)，`string` 转 `string_view` 见 [N4861 · string.accessors](https://timsong-cpp.github.io/cppwp/n4861/string.accessors#7)。

</details>

## 容器扩容时，元素的旧引用也会失效

`std::vector` 把元素连续摆在一块内存里：
- `size()`：当前装了几个元素。
- `capacity()`：当前这块内存**最多能装几个**而不用搬家。
- 当 `push_back` 发现空间不够时，`vector` 会找一块**更大的新内存**，把所有元素搬过去，然后**把旧内存整块释放掉**。

这时，如果你之前保存了某个元素的引用（例如 `int& old = hits[1];`），它还指着被释放的旧内存，**就失效了**！

运行 `lifetime.cpp` 观察这个过程：

{{example:lifetime.cpp}}

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic lifetime.cpp -o lifetime.exe
.\lifetime.exe
```

对照执行图看输出：

```text
[A] 预留 3 格:  [10] [20] [空]          ← old 指向 20
[B] 追加 30:    [10] [20] [30]          ← 空间够用，没搬家，old 仍有效
[C] 再扩容量:   新区域 [10] [20] [30] ... ← 旧区域已释放！old 失效，需重新取
[D] 擦除首位10: [20] [30] [空]          ← 元素往前挪，20 的下标从 1 变成 0
```

因此，如果要长期记住某个位置的值，要么**存一份值副本**（`int saved = hits[1];`），要么**在确定不增删元素后再取引用**。

## 3 个微练习

### 练习 1（读代码找悬垂）

下面函数为什么不能这样写？

```cpp
std::string_view make_greeting() {
    std::string s = "hello";
    return s;
}
```

<details>
<summary>核对答案</summary>

`s` 是函数内的局部 `std::string`，函数一返回，`s` 就销毁了。返回的 `std::string_view` 指向已经销毁的局部内存，调用方拿到就是悬垂视图。应该直接返回 `std::string`。

</details>

### 练习 2（找 Bug 并修复）

下面代码往 `v` 里追加元素后继续用旧引用 `first`，为什么危险？怎么改最安全？

```cpp
std::vector<int> v{10};
int& first = v[0];
for (int i = 0; i < 100; ++i) {
    v.push_back(i);
}
std::cout << first << '\n';
```

<details>
<summary>提示与答案</summary>

循环 `push_back` 一定会触发 `v` 重新分配内存并搬家，旧引用 `first` 会悬垂。修复方法：在循环结束后再取 `v[0]`，或者如果只需要当时那个数，直接用值副本 `int first = v[0];`。

</details>

### 练习 3（独立实验）

用下方的交互演示模拟器，连续点击追加元素，记录每次 `capacity` 翻倍（搬家）前后的 `size` 和 `capacity` 数值，并用自己的话解释为什么“提前 `reserve(100)` 能避免反复搬家”。
