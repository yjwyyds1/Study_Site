---
title: "图论算法全解：存储、BFS/DFS、拓扑排序、最短路与最小生成树"
description: "系统掌握图的 3 种存储结构、单源与多源 BFS、三色 DFS 判环、Kahn 拓扑排序（构建依赖）、Dijkstra/Bellman-Ford/Floyd 最短路与 Kruskal/Prim 最小生成树（ALG-36 ~ ALG-42）。"
order: 112
category: "数据结构与算法"
tags: ["C++20", "图论", "BFS", "DFS", "拓扑排序", "Dijkstra", "最小生成树"]
related: ["handbook/algo-strings-trees", "handbook/algo-search-dp", "handbook/cmake-targets"]
---

## 本篇只解决这 1 类问题

只要事物之间不再是“一对一排成队”或“严格上下级一棵树”，而是存在**交叉网状依赖、路网导航、网络路由与死锁检测**，就必须用“图（Graph）$G = (V, E)$”建模。本篇系统打通图论核心 7 课（`ALG-36` ~ `ALG-42`），让你彻底看懂图的表示法与四大必考家族算法。

---

## 一、图的抽象与三种主流存储结构（ALG-36）

| 存储方式 | C++ 典型写法 | 空间复杂度 | 查某两点是否有边 | 遍历某点所有邻居 | 适用场景 |
| --- | --- | --- | --- | --- | --- |
| **邻接矩阵** | `vector<vector<int>> g(n, vector<int>(n))` | $\mathcal{O}(V^2)$ | $\mathcal{O}(1)$ | $\mathcal{O}(V)$ | 稠密图（$V \le 1000$）、Floyd 算法 |
| **邻接表** | `vector<vector<pair<int,int>>> g(n)` | $\mathcal{O}(V + E)$ | $\mathcal{O}(\text{deg}(u))$ | $\mathcal{O}(\text{deg}(u))$ | **90% 稀疏图首选** |
| **边列表** | `vector<Edge> edges` | $\mathcal{O}(E)$ | 慢 | 慢 | 只需排序边的 **Kruskal / Bellman-Ford** |

```text
有向边: 0 -> 1 (权5), 0 -> 2 (权2), 1 -> 2 (权1)
邻接表表示:
  g[0] = [ (1, 5), (2, 2) ]
  g[1] = [ (2, 1) ]
  g[2] = [ ]
```

> 工程上如果有几百万条边、`vector<vector<...>>` 产生太多小堆块分配，可以用**链式前向星 / CSR（Compressed Sparse Row）**：用连续两个一维数组 `head/next/to` 或 `offsets + flat_edges`，缓存命中率提升数倍。

---

## 二、BFS 广度优先搜索与多源 BFS（ALG-37）

BFS 就像往水面同时丢进几颗石子产生的**一圈圈同心波纹**——波纹第 1 步摸到的点全标记为距离 1，第 2 步摸到的全标记为距离 2。因此，在**所有边权重相等（无权图）**时，BFS **第一次**碰到终点时的路径必定是最短路径！

### 必须牢记的两条铁律
1. **入队那一刻立刻标记 `dist[v] != -1`（或 `visited[v] = true`）**，千万不能等到出队再标！否则同一层的多个邻居会把同一个下层节点重复塞进队列几十次，直接爆内存/超时。
2. **多源 BFS（比如求每个格子到最近医院的距离）**：不用对每个医院单独跑一遍 BFS！只需**在循环开始前，把所有起点（所有医院）统统塞进初始队列且设 `dist = 0`**，然后照常跑一遍普通 BFS 即可，总复杂度仍是 $\mathcal{O}(V + E)$！

```cpp
#include <queue>
#include <vector>

std::vector<int> bfs_shortest(int n, const std::vector<std::vector<int>>& g, int start) {
    std::vector<int> dist(n, -1);
    std::queue<int> q;
    dist[start] = 0; // 入队即标记！
    q.push(start);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : g[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return dist;
}
```

---

## 三、DFS 深度优先搜索、连通分量与判环（ALG-38）

DFS 就像“一条胡同走到黑、撞墙再回头退回上一个路口”，极适合找**连通块个数（如网格岛屿数量）、路径存在性与环路检测**。

### 新手必踩坑：有向图判环 vs 无向图判环完全不一样！

- **无向图判环**：只靠布尔 `visited` 数组。遍历 `u -> v` 时如果发现 `v` 已经访问过且 **`v != parent`**（不是刚刚从 `v` 走过来的回头路），说明兜了个圈子碰上了老熟人，一定有环！
- **有向图判环（必须用“三色标记”）**：只靠一个 `visited` 会误判！例如菱形图 `0 -> 1 -> 3` 和 `0 -> 2 -> 3`，走完左支路再走右支路碰到已完成的 `3` 并不是环！必须区分：
  - `0`（白）：从未访问；
  - `1`（灰）：**正在当前递归路径（调用栈）上**；
  - `2`（黑）：已经安全彻底走完、退出递归。
  只有当你遇到一条边指向 **状态 `1`（灰色，仍在栈里）** 的节点时，才证明出现了真回边（有环）！

```cpp
// 有向图三色 DFS 判环（返回 true 表示存在环）
bool has_cycle_dfs(int u, const std::vector<std::vector<int>>& g, std::vector<int>& color) {
    color[u] = 1; // 染灰：进栈
    for (int v : g[u]) {
        if (color[v] == 1) return true; // 撞到栈中祖先 -> 有环！
        if (color[v] == 0 && has_cycle_dfs(v, g, color)) return true;
    }
    color[u] = 2; // 染黑：出栈
    return false;
}
```

---

## 四、DAG 与 Kahn 拓扑排序（ALG-39）

如果把 CMake 里的目标依赖、大学课程先修关系画成图：必须“没有环”，才能排出一份合法的执行先后顺序——这种图叫 **有向无环图（DAG, Directed Acyclic Graph）**。

### Kahn 算法（入度剥洋葱法，比 DFS 更直观且自带判环）

1. 统计每个点有多少个前置依赖未完成，记为**入度 `indeg[v]`**。
2. 把所有 `indeg == 0`（没有任何前置门槛）的点放进队列。
3. 每次从队列弹出一个点 `u` 放进结果列表，宣布它已构建完成；随后遍历它的后继 `v`，把 `indeg[v]` 减 1——**一旦 `indeg[v]` 降到 `0`**，立刻让 `v` 入队。
4. 循环结束后，**检查输出节点数是否等于总点数 `V`**；如果 `< V`，说明剩下一批节点互相咬死成环，直接报告循环依赖错误！

```cpp
std::vector<int> kahn_topo(int n, const std::vector<std::vector<int>>& g) {
    std::vector<int> indeg(n, 0), order;
    for (int u = 0; u < n; ++u)
        for (int v : g[u]) indeg[v]++;

    std::queue<int> q;
    for (int i = 0; i < n; ++i)
        if (indeg[i] == 0) q.push(i);

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        for (int v : g[u]) {
            if (--indeg[v] == 0) q.push(v);
        }
    }
    if (static_cast<int>(order.size()) != n) return {}; // 存在环！
    return order;
}
```

---

## 五、单源非负权最短路：Dijkstra 算法（ALG-40）

现实路网每条路耗时不同（带正边权），BFS 失效，需要 **Dijkstra**：
- 维护一个估算最短距离数组 `dist[v]`（起点 `0`，其余无穷大 `INF`），并用**小顶堆 `priority_queue` 每次挑出当前已知离起点最近的未确定点 `u`**。
- 关键防坑：**懒惰删除（Lazy Deletion）**——堆里不支持高效原地修改已有元素优先级，当 `u` 找到更短路径时直接再往堆里塞一份新的 `(new_d, u)`；等将来老的 `(old_d, u)` 浮出堆顶时，只要检查 **`if (d > dist[u]) continue;`** 即可安全丢弃！
- 复杂度：**$\mathcal{O}((V + E) \log V)$**。若想还原完整路线，再开一个 `parent[v] = u` 数组在松弛成功时顺便记下前驱即可。

```cpp
#include <limits>
#include <queue>
#include <vector>

std::vector<long long> dijkstra(int n, const std::vector<std::vector<std::pair<int, int>>>& g, int s) {
    constexpr long long INF = std::numeric_limits<long long>::max() / 4;
    std::vector<long long> dist(n, INF);
    using P = std::pair<long long, int>; // (距离, 节点)
    std::priority_queue<P, std::vector<P>, std::greater<P>> pq;
    dist[s] = 0;
    pq.emplace(0, s);

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue; // 过期记录，跳过！
        for (auto [v, w] : g[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.emplace(dist[v], v);
            }
        }
    }
    return dist;
}
```

> **为什么 Dijkstra 绝不能碰负权边？** 因为 Dijkstra 每次从堆顶弹出 `u` 时就“贪心认定 `dist[u]` 已彻底定死、以后绝不会变小”。如果图里有负权边，后面完全可能绕道某条负数捷径把 `dist[u]` 再拉低，破坏这个核心不变量！

---

## 六、负权最短路与全源最短路：Bellman-Ford & Floyd（ALG-41）

| 算法 | 能否处理负权边 | 能否检出负权环 | 时间复杂度 | 适用情形 |
| --- | --- | --- | --- | --- |
| **Bellman-Ford** | 能 | **能**（第 $V$ 轮还能松弛必有负环） | $\mathcal{O}(V \cdot E)$ | 存在负边权 / 限制最多走 $K$ 条边 |
| **SPFA**（队列优化 Bellman-Ford） | 能 | 能（入队达 $V$ 次） | 均摊快，最坏仍 $\mathcal{O}(VE)$ | 随机稀疏带负权图（易被卡） |
| **Floyd-Warshall** | 能 | 能（查 `d[i][i] < 0`） | $\mathcal{O}(V^3)$ | 任意两点之间全源最短路（$V \le 500$） |

Floyd 核心代码甚至只有 5 行——**注意最外层循环 `k`（中转点）绝不能放到内层！**

```cpp
for (int k = 0; k < n; ++k)         // 中转点 k 必须在最外层！
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < n; ++j)
            d[i][j] = std::min(d[i][j], d[i][k] + d[k][j]);
```

---

## 七、最小生成树（MST）：Kruskal 与 Prim（ALG-42）

给你 $n$ 个村庄和若干条备选光缆造价，选出 $n-1$ 条边把所有村庄连通且总造价最省：
1. **Kruskal（适合稀疏图）**：
   - 把所有边按费用**从小到大排序**（$\mathcal{O}(E \log E)$）。
   - 依次拿起最便宜的边 `(u, v, w)`，用**并查集 DSU** 询问 `u` 和 `v` 是否已经连通：已连通就扔掉（避免成环），不连通就买下它并合并两个集合！凑够 `n - 1` 条边即大功告成。
2. **Prim（适合稠密图）**：
   - 选一个起点作为初始树，用小顶堆维护“当前树外各节点连回这棵树的最便宜那一条边”，每次挑最近的拉进树里并更新邻边。思路与 Dijkstra 几乎一模一样（唯一差别：堆里存的是“节点到**整棵当前树**的最短距离”，不是“到起点的总距离”）。

---

## 八、本篇微练习

1. 如果一张有向无环图刚好有 1 个环 `A -> B -> A`，用 Kahn 算法跑完后会发生什么？
2. 为什么多源 BFS 能同时求出网格中所有陆地到最近海洋的距离？
3. 在 Dijkstra 中如果忘了写 `if (d > dist[u]) continue;` 会怎样？结果会错还是只变慢？

<details>
<summary>核对答案</summary>

1. `A` 和 `B` 的入度都至少为 `1`，永远不会降到 `0` 入队，最终输出序列长度严格小于总节点数 `n`，据此可直接判定有环。
2. 多源 BFS 等价于在图外建一个“超级源点”，用权重为 0 的边连向所有海洋格，然后从超级源点跑单源 BFS，第一波碰到陆地即最近海洋。
3. 最坏情况下每个点会多次作为过期元素触发无意义的邻边扫描，极端构造下可能退化为超时（TLE），且如果在弹出时才记录首次访问顺序则必须加该守卫。

</details>
