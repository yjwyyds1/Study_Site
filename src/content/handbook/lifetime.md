---
title: "第二课：对象何时失效？从 vector 扩容说起"
description: "用日志行号观察 vector 的容量变化，判断引用、迭代器和索引各能用到什么时候。"
order: 2
minutes: 25
tags: ["C++20", "生命周期", "vector", "迭代器"]
related: ["handbook/toolchain", "handbook/raii", "labs/logscan"]
sources: ["lifetime.cpp"]
---

## 容器还在，刚才借来的元素呢？

想象你在扫描日志，把匹配到的行号依次存进 `std::vector<int>`。为了稍后打印第一条命中，你取了 `const int& first = hits.front();`，然后继续追加。程序能编译，但光看 `hits` 仍在作用域内，能判断 `first` 还可以读吗？判断时要分别问：容器活着吗？当初绑定引用的那个元素还活着吗？

变量的作用域决定名字在哪里可见，生命周期描述对象在运行时何时存在。当前例子里，元素在合适的存储中完成初始化后开始其生命周期，销毁时结束。引用、指针和迭代器让你访问已有对象；保存一个引用并不会让容器保留该元素的位置或延长它的生命。对象已经销毁，手里却还保留访问它的途径，这就可能有悬空引用。读一个悬空引用是未定义行为；一次运行碰巧打印出预期数字，不能给这段代码提供保证。

临时对象也是同样的问题。例如，本地声明 `const std::string& text = std::string{"INFO"};` 直接绑定临时字符串，在这种写法下可以延长临时对象的生命；换成 `std::string_view text = std::string{"INFO"};`，视图只是借字符，分号后临时字符串就已销毁。需要把内容留到以后，就保存拥有字符的 `std::string`。

## 在改动前预测哪些东西能留下

`size()` 是已经存在的元素数，`capacity()` 是无需重新分配就能容纳的元素数。容器只允许按下标访问 `[0, size())` 内的元素。即使还空着好几格，`reserve` 也只准备存储，不会创建元素；要创建元素，用 `push_back` 或按需要调用 `resize`。

对成功执行的操作，可以按这几条规则判断：

- 尾部追加后，新大小没有超过原容量：已有元素的引用、指针和迭代器仍有效，旧 `end()` 失效。不要在依赖旧终点的遍历中直接向同一个容器追加。
- 新大小超过原容量，或调用 `reserve` 时请求的容量大于当前容量：发生重分配，指向原元素的引用、指针、迭代器全失效，旧 `end()` 也失效。容器本身仍可用。
- 在中间插入，即使不重分配，插入点及之后的引用、指针和迭代器也会失效。擦除时，删除位置及之后的引用和迭代器同样不能沿用。容量没变，位置照样可能变。

## 观察与练习

先看代码里的三次输出，猜一猜第二次为什么还能用 `first`，第三次为什么要重新取 `hits.front()`。在下载目录编译运行：

{{example:lifetime.cpp}}

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic lifetime.cpp -o lifetime.exe
if ($LASTEXITCODE -eq 0) { .\lifetime.exe }
```

预留后应看到 `size=2` 和 `room=true`；追加后是 `size=3`、`same capacity=true` 和 `first=10`；最后是 `grew=true` 和 `reread=10`。输出比较的是容量数值，重分配后不会去读取或比较旧引用。程序也没有猜测容量会按几倍增长。读完后可在文末的交互图里对照有空位与需要扩容的两次追加。

### 练习：保留坐标，还是保留值？

在程序完成两次容量实验后，`hits` 的内容是 `{10, 20, 30}`。现在要稍后显示原来的第二条命中。比较保存下标 `1`、保存 `const int&`、保存一个 `int` 副本三种办法：若下一步追加触发了重分配，哪些还能找到原值？如果接下来再擦除首元素，哪些仍然可靠？先预测，再补代码验证安全的读法，别使用失效的引用。

<details>
<summary>提示 1：分开追踪三样东西</summary>

分别记下你保存的是位置、对某个元素的借用，还是一个独立的数字。容量发生变化时，原有元素的排列顺序有没有变？

</details>

<details>
<summary>提示 2：写出擦除后的列表</summary>

假设追加的是 `40`。擦除 `10` 后，`20` 还在，但再数一次它的位置。

</details>

<details>
<summary>参考答案与验收</summary>

追加触发重分配后，原引用失效；用仍在范围内的下标 `1` 重新读取能得到 `20`，独立副本也仍是 `20`。擦除首元素后，列表变为 `{20, 30, 40}`，下标 `1` 变成 `30`，副本仍是 `20`。可以用下列顺序一次验证两个结果。最后想想：如果业务需要追踪同一条记录，而它可能被排序或移动，是否应保存记录自己的标识？

```cpp
// 追加不改变已有元素的顺序，这里无需依赖它是否重分配。
const int saved = hits.at(1);
hits.push_back(40);
std::cout << hits.at(1) << ' ' << saved << '\n'; // 20 20
hits.erase(hits.begin());
std::cout << hits.at(1) << ' ' << saved << '\n'; // 30 20
```

</details>

## 下一课

这一课每次借用都要问「元素还能活多久」。下一课反过来追问「谁负责释放资源」，先用文件流和独占指针把这个责任写在类型里。

## 参考资料

- C++20 工作草案 N4861：[对象与引用的生命周期](https://timsong-cpp.github.io/cppwp/n4861/basic.life) · [临时对象与生命周期延长](https://timsong-cpp.github.io/cppwp/n4861/class.temporary) · [字符串视图](https://timsong-cpp.github.io/cppwp/n4861/string.view)
- C++20 工作草案 N4861：[`vector` 容量](https://timsong-cpp.github.io/cppwp/n4861/vector.capacity) · [插入与擦除](https://timsong-cpp.github.io/cppwp/n4861/vector.modifiers)
