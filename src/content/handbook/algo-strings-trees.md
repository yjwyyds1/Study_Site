---
title: "字符串匹配、树结构、堆、并查集与区间结构"
description: "零基础彻底吃透 KMP 前缀函数、Rabin-Karp 滚动哈希、Trie 树、二叉树递归与迭代遍历、BST、AVL/红黑树平衡思想、手写堆、并查集与树状数组/线段树（ALG-23 ~ ALG-35）。"
order: 111
category: "数据结构与算法"
tags: ["C++20", "KMP", "Trie", "二叉树", "二叉堆", "并查集", "线段树"]
related: ["handbook/algo-complexity-structures", "handbook/algo-graphs", "handbook/algo-search-dp"]
---

## 本篇只解决这 1 类问题

线性结构只能表达“前后顺序”，而真实系统里到处是**字符串模式匹配、层级菜单与索引树（B 树/红黑树）、实时 Top-K 优先队列、动态连通集合合并与区间统计**。本篇一步步打通 `ALG-23` ~ `ALG-35`，所有核心结构给出可直接运行的 C++20 代码、状态推演图和常见边界坑。

---

## 一、字符串匹配：朴素法 vs KMP 前缀函数（ALG-23）

### 1. 为什么朴素匹配会慢成 $\mathcal{O}(nm)$？

文本串 `T` 长度 $n$，模式串 `P` 长度 $m$。如果在 `"aaaaaaab"` 里找 `"aaab"`，每次在末尾 `b` 失配时，朴素法都傻傻地把文本串指针 `i` 退回起点再重扫一遍。
**KMP 的核心洞察**：`i` 在文本串里**绝对不后退**！当 `P[j]` 失配时，已经匹配过的前缀 `P[0..j-1]` 里可能藏着一段“既是真前缀又是真后缀”的公共片段，可以直接把 `j` 拉回到 `pi[j - 1]` 继续对齐！

### 2. 前缀函数 `pi[i]`（即常说的 `next` 数组）

定义 **`pi[i]` = 子串 `P[0..i]` 的最长相等真前缀与真后缀的长度**（真前缀/真后缀指不能是字符串自身）。

```text
模式串 P = "a b a b a c"
下标 i:      0 1 2 3 4 5
pi[i]:       0 0 1 2 3 0
               │ └─ "aba" 最长公共前后缀 "a" (长度1)
               └─── "abab" 最长公共前后缀 "ab" (长度2)
```

```cpp
#include <iostream>
#include <string>
#include <vector>

std::vector<int> build_pi(const std::string& p) {
    int m = static_cast<int>(p.size());
    std::vector<int> pi(m, 0);
    for (int i = 1; i < m; ++i) {
        int j = pi[i - 1];
        while (j > 0 && p[i] != p[j]) j = pi[j - 1]; // 不断缩短回退
        if (p[i] == p[j]) ++j;
        pi[i] = j;
    }
    return pi;
}

std::vector<int> kmp_search(const std::string& text, const std::string& pat) {
    std::vector<int> pos;
    if (pat.empty()) return pos;
    auto pi = build_pi(pat);
    int j = 0;
    for (int i = 0; i < static_cast<int>(text.size()); ++i) {
        while (j > 0 && text[i] != pat[j]) j = pi[j - 1];
        if (text[i] == pat[j]) ++j;
        if (j == static_cast<int>(pat.size())) {
            pos.push_back(i - j + 1);
            j = pi[j - 1]; // 继续找下一个可能重叠的出现位置
        }
    }
    return pos; // 总时间严格 O(n + m)
}
```

---

## 二、滚动哈希（Rabin-Karp）：$\mathcal{O}(1)$ 滑动比对子串（ALG-24）

想判断文章里有没有重复出现的长度为 $L$ 的子串，或者同时比对成千上万个同长度指纹？把字符串看成一个 **$B$ 进制大整数**（常见基数 `base = 131` 或 `13131`，取模 `mod = 1'000'000'007`）：
$$H(s) = \sum_{k=0}^{L-1} s[k] \cdot B^{L-1-k} \pmod{M}$$
当窗口向右滑动 1 格（吐掉左字符 `s[i]`、吞进右字符 `s[i+L]`）时，只需 1 次乘法和加减即可从旧哈希推出新哈希，**窗口移动仅 $\mathcal{O}(1)$**：
$$H_{\text{new}} = \big((H_{\text{old}} - s[i] \cdot B^{L-1}) \cdot B + s[i+L]\big) \bmod M$$

> **工程坑点**：单哈希在 $10^5$ 规模数据下根据生日悖论仍有碰撞概率。工程或竞赛若要做到几乎绝对零误判，可使用**双哈希（两组不同的 `(base, mod)` 组成 `pair<uint64_t, uint64_t>`）**，或哈希相等后再做一次真实字符串比较确认。

---

## 三、字典树（Trie / 前缀树）：自动补全与敏感词过滤（ALG-25）

当需要支持“快速判断一个单词是否在词典中”、“统计有多少个词以 `"log_"` 开头”时，与其遍历整个字符串表，不如把所有词共享的开头前缀合并成一棵树——每条边代表一个字符！

```cpp
#include <array>
#include <memory>
#include <string_view>
#include <vector>

struct Trie {
    struct Node {
        std::array<int, 26> next{};
        int pass_count = 0; // 有多少单词经过此节点（即以此为前缀）
        int end_count = 0;  // 有多少单词恰好在此结束
    };
    std::vector<Node> nodes{1}; // 0 号为根节点

    void insert(std::string_view word) {
        int cur = 0;
        nodes[cur].pass_count++;
        for (char ch : word) {
            int c = ch - 'a';
            if (nodes[cur].next[c] == 0) {
                nodes[cur].next[c] = static_cast<int>(nodes.size());
                nodes.emplace_back();
            }
            cur = nodes[cur].next[c];
            nodes[cur].pass_count++;
        }
        nodes[cur].end_count++;
    }

    int count_prefix(std::string_view prefix) const {
        int cur = 0;
        for (char ch : prefix) {
            int c = ch - 'a';
            if (nodes[cur].next[c] == 0) return 0;
            cur = nodes[cur].next[c];
        }
        return nodes[cur].pass_count;
    }
};
```

> 使用数组池 `std::vector<Node>` 配合下标跳转（比每个节点 `new Node` 少海量指针与内存碎片），查询复杂度仅与**单词长度 $L$** 相关（$\mathcal{O}(L)$），和词库里有一百个还是一千万个词毫无关系！

---

## 四、二叉树递归遍历与递归三要素（ALG-26）

```text
      (1)
     /   \
   (2)   (3)
   / \
 (4) (5)
前序(根-左-右): 1 2 4 5 3
中序(左-根-右): 4 2 5 1 3
后序(左-右-根): 4 5 2 3 1
```

写任何树递归函数，先定死三件事：
1. **函数签名与返回值含义**：给它一个子节点指针，它精确返回什么值？（例如返回子树高度 / 节点之和）
2. **终止条件（Base Case）**：空节点 `node == nullptr` 时返回什么默认值？
3. **单层递归逻辑**：拿左子树返回值 + 右子树返回值，怎样算出当前节点的结果？（先算自己还是先收集孩子决定了前/中/后序）

```cpp
struct TreeNode {
    int val;
    TreeNode* left = nullptr;
    TreeNode* right = nullptr;
};

int max_depth(const TreeNode* root) {
    if (!root) return 0; // Base Case：空树高度 0
    return 1 + std::max(max_depth(root->left), max_depth(root->right)); // 后序汇总
}
```

---

## 五、二叉树迭代遍历：显式栈如何模拟函数调用？（ALG-27）

当树退化成一条 10 万层的长链时，递归会把线程栈直接打爆。用 `std::stack` 自己管理“待办清单”就能把空间完全转到堆区。

### 前序与中序迭代经典模板

```cpp
// 中序遍历（左 -> 根 -> 右）：一路向左压栈，触底再弹出访问并转向右子树
std::vector<int> inorder_iter(const TreeNode* root) {
    std::vector<int> res;
    std::vector<const TreeNode*> st;
    const TreeNode* cur = root;
    while (cur || !st.empty()) {
        while (cur) {
            st.push_back(cur);
            cur = cur->left;
        }
        cur = st.back();
        st.pop_back();
        res.push_back(cur->val);
        cur = cur->right;
    }
    return res;
}
```

> **提示**：后序迭代如果只想快速写出不易错的版本，可以按 `根 -> 右 -> 左` 做一遍类前序遍历，最后把结果数组 `std::reverse` 反转，立刻得到 `左 -> 右 -> 根`！

---

## 六、二叉树层序遍历与 BFS 视图应用（ALG-28）

想一层一层打印树、求二叉树右视图或最小深度？按“**每轮开始先锁死 `int level_size = q.size()`**”这个铁模板写，绝不会把下一层的节点混进当前层：

```cpp
std::vector<std::vector<int>> level_order(const TreeNode* root) {
    std::vector<std::vector<int>> levels;
    if (!root) return levels;
    std::queue<const TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        int sz = static_cast<int>(q.size()); // 锁住当前层人数！
        std::vector<int> row;
        row.reserve(sz);
        for (int i = 0; i < sz; ++i) {
            auto* node = q.front();
            q.pop();
            row.push_back(node->val);
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
        levels.push_back(std::move(row));
    }
    return levels;
}
```

---

## 七、二叉搜索树（BST）：查找、插入与三种删除情况（ALG-29）

BST 的全局不变量：**对每个节点，左子树所有节点值 `< node->val <` 右子树所有节点值**（不能只看直系左右孩子！校验是否为合法 BST 必须传上下界 `(low, high)` 或做中序遍历看是否严格递增）。

### 删除节点最难的三种情形

1. **待删节点是叶子（无孩子）**：直接删掉并返回 `nullptr`。
2. **只有左孩子或只有右孩子**：让它唯一的孩子顶替自己的位置即可。
3. **既有左孩子又有右孩子**：去右子树里一路向左找到**最小节点（中序后继 `succ`）**，把 `succ->val` 覆盖到当前节点，再递归去右子树把原来的 `succ`（它最多只有右孩子！）删掉！

---

## 八、平衡树直觉：AVL 旋转与红黑树 5 条铁律（ALG-30）

普通 BST 如果依次插入 `1, 2, 3, 4, 5`，会彻底歪成一条单向链表，查询复杂度从 $\mathcal{O}(\log n)$ 崩盘到 $\mathcal{O}(n)$！平衡树靠“旋转”维护树高始终不超过 $\mathcal{O}(\log n)$：

| 平衡树品种 | 平衡策略 | 优缺点与使用场景 |
| --- | --- | --- |
| **AVL 树** | 任意节点左右子树高度差 $\le 1$（LL/RR 单旋、LR/RL 双旋） | 树最矮、查找略快；但每次插删经常要向上多次旋转，修改略慢 |
| **红黑树** | 近似平衡（黑高相等 + 不允许连续两个红节点，最长路径 $\le 2 \times$ 最短路径） | 最多只需 **2~3 次旋转**就能修好平衡；C++ `std::map` / `std::set`、Linux 进程调度 CFS、epoll 全部采用它 |

---

## 九、二叉堆手写实现与流式 Top-K（ALG-31）

二叉堆逻辑上是一棵**完全二叉树**，物理上直接紧凑塞进一个 `std::vector<int>` 里，靠下标公式父子互找（0-based 下标）：
- 下标 `i` 的左孩子 = `2 * i + 1`，右孩子 = `2 * i + 2`，父节点 = `(i - 1) / 2`。
- **`push`（上浮 `sift_up`）**：放到 `vector` 末尾，如果比父亲更优（例如小顶堆里比父亲更小）就跟父亲交换，一路爬升，$\mathcal{O}(\log n)$。
- **`pop`（下沉 `sift_down`）**：把末尾元素填到 `0` 号堆顶，不断挑两个孩子中更优的那个往下换，$\mathcal{O}(\log n)$。
- **Floyd 线性建堆**：对任意乱序数组，从最后一个非叶子节点 `(n / 2 - 1)` 倒着往 `0` 逐个做 `sift_down`，总耗时严格只需 **$\mathcal{O}(n)$** 而不是 $\mathcal{O}(n \log n)$！

```cpp
void sift_down_min(std::vector<int>& h, int n, int i) {
    while (true) {
        int smallest = i;
        int l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && h[l] < h[smallest]) smallest = l;
        if (r < n && h[r] < h[smallest]) smallest = r;
        if (smallest == i) break;
        std::swap(h[i], h[smallest]);
        i = smallest;
    }
}
```

---

## 十、堆的工程变体：双堆动态中位数与多路归并（ALG-32）

1. **数据流实时中位数**：同时开一个**大顶堆 `lo`**（存较小的一半）和一个**小顶堆 `hi`**（存较大的一半），规定两堆元素个数差不超过 1，且 `lo.top() <= hi.top()`。新数先丢 `lo` 再把 `lo.top()` 吐给 `hi`，若 `hi` 比 `lo` 多就把 `hi.top()` 塞回 `lo`。查中位数永远 $\mathcal{O}(1)$！
2. **K 路有序日志归并**：磁盘上有 10 个已经各自按时间戳排好序的 `.log` 分片，内存装不下全部日志怎么办？开一个大小为 `K = 10` 的**小顶堆**，堆里每次只放各文件的当前头部 1 条记录，每次弹出最早的一条写进输出并从对应文件读下一条补位——只花极少内存就能合并 GB 级日志！

---

## 十一、并查集（DSU）：动态连通性与防退化优化（ALG-33）

解决“朋友的朋友也是朋友”、“两个服务器在不在同一个局域网”、“加边会不会成环”问题的王者结构：

```cpp
struct DSU {
    std::vector<int> parent, sz;
    int components;

    explicit DSU(int n) : parent(n), sz(n, 1), components(n) {
        for (int i = 0; i < n; ++i) parent[i] = i; // 起初每人自立山头
    }

    int find(int x) {
        if (parent[x] != x) parent[x] = find(parent[x]); // 路径压缩：直接挂到老祖宗下！
        return parent[x];
    }

    bool unite(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false; // 原本就在一伙，再连就成环！
        if (sz[ra] < sz[rb]) std::swap(ra, rb); // 按大小合并：小山头并入大山头
        parent[rb] = ra;
        sz[ra] += sz[rb];
        components--;
        return true;
    }
};
```

同时打开**路径压缩 + 按大小/秩合并**，单次操作均摊复杂度 $\mathcal{O}(\alpha(n))$（阿克曼反函数，人类可观测宇宙尺度下不超过 5，实际视作 **$\mathcal{O}(1)$**）。

---

## 十二、动态区间统计：树状数组（Fenwick）与线段树核心思想（ALG-34）

前缀和数组虽然查询区间和是 $\mathcal{O}(1)$，但只要修改原数组 1 个元素，就得花 $\mathcal{O}(n)$ 重算后续全部前缀和。**既有修改又要频繁查区间聚合（和/最大/最小）**怎么办？把区间按二进制或二分拆成多层管理块！

### 树状数组（Binary Indexed Tree）：15 行代码实现 $\mathcal{O}(\log n)$ 单点加 + 区间和

节点 `tree[i]` 只负责存储以 `i` 结尾、长度为 `lowbit(i) = i & (-i)` 的一小段之和（1-based 下标）：

```cpp
struct Fenwick {
    int n;
    std::vector<long long> tree;
    explicit Fenwick(int n) : n(n), tree(n + 1, 0) {}

    void add(int idx, long long delta) { // 1-based idx
        for (; idx <= n; idx += idx & -idx) tree[idx] += delta;
    }
    long long prefix_sum(int idx) const {
        long long s = 0;
        for (; idx > 0; idx -= idx & -idx) s += tree[idx];
        return s;
    }
    long long range_sum(int l, int r) const { return prefix_sum(r) - prefix_sum(l - 1); }
};
```

如果你需要求**区间最大值**或者**区间批量加 + 区间和**（无法用减法逆运算还原），则升级为**线段树（Segment Tree）**：把 `[0, n-1]` 递归对半拆分成二叉树，叶子代表单点，父节点合并左右孩子信息，配合懒惰标记（Lazy Propagation）把所有区间修改与区间查询稳定压到 **$\mathcal{O}(\log n)$**。

---

## 十三、C++ 标准库 `<algorithm>` 与 `<numeric>` 工程速查（ALG-35）

真实工程里能复用 STL 标准库就不要手写脆弱循环：

| 标准算法 | 作用 | 复杂度 & 注意事项 |
| --- | --- | --- |
| `std::sort` / `std::stable_sort` | 排序 / 保留相等元素原顺序 | $\mathcal{O}(n \log n)$；比较器必须满足**严格弱序**（相等返回 `false`） |
| `std::nth_element` | 把第 $K$ 大放到索引 $K$ 处（左边更小右边更大） | 平均 $\mathcal{O}(n)$，比全排序取 Top-K 快得多 |
| `std::lower_bound` / `std::upper_bound` | 首个 $\ge x$ / 首个 $> x$ | 严格 $\mathcal{O}(\log n)$，仅能用于**有序**随机访问容器 |
| `std::partition` | 按谓词将满足条件的挪到前半段 | $\mathcal{O}(n)$ 原地，快排核心划分步 |
| `std::accumulate` / `std::reduce` | 累加/规约 | 第 3 个参数传 **`0LL`**，传 `0` 会导致 `int` 溢出！ |

---

## 十四、微练习与自检

1. 手工推导模式串 `"ababc"` 的前缀函数 `pi[0..4]`。
2. 对一棵有序数组 `[1, 3, 5, 7, 9]` 依次插入普通 BST，树高是多少？如果改用 `std::set` 树高上限大约是多少？
3. 在 `std::sort` 里写自定义比较器 `return a <= b;` 为什么会崩溃（Segmentation Fault）？

<details>
<summary>核对答案</summary>

1. `"ababc"` 对应 `pi = [0, 0, 1, 2, 0]`（`abab` 最长相等真前后缀为 `"ab"` 长度 2；到 `c` 失配回退到 `j=pi[3]=2`，`'c' != 'a'`，继续回退到 `pi[1]=0`，最终 `0`）。
2. 普通 BST 退化成右斜链表，树高 `5`（$\mathcal{O}(n)$）；`std::set` 底层是红黑树，树高控制在 $\approx 2 \log_2 n$ 以内。
3. 违反了**严格弱序（Strict Weak Ordering）**的反自反性（元素与自身比较必须为 `false`），标准库快排越界哨兵循环会读穿内存导致段错误。

</details>
