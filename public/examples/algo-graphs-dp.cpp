#include <algorithm>
#include <cassert>
#include <cstddef>
#include <iostream>
#include <limits>
#include <memory>
#include <numeric>
#include <queue>
#include <tuple>
#include <utility>
#include <vector>

// 1. 二叉搜索树与递归遍历（ALG-09）
struct TreeNode {
    int val;
    std::unique_ptr<TreeNode> left;
    std::unique_ptr<TreeNode> right;
    explicit TreeNode(int v) : val(v) {}
};

void bst_insert(std::unique_ptr<TreeNode>& root, int v) {
    if (!root) {
        root = std::make_unique<TreeNode>(v);
        return;
    }
    if (v < root->val) bst_insert(root->left, v);
    else if (v > root->val) bst_insert(root->right, v);
}

void inorder(const TreeNode* root, std::vector<int>& out) {
    if (!root) return;
    inorder(root->left.get(), out);
    out.push_back(root->val);
    inorder(root->right.get(), out);
}

// 2. 无权图 BFS 最短跳数（入队即标记，-1 表示不可达，ALG-10）
std::vector<int> bfs_distances(const std::vector<std::vector<int>>& adj, int src) {
    std::vector<int> dist(adj.size(), -1);
    std::queue<int> q;
    dist[src] = 0;
    q.push(src);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return dist;
}

// 3. DFS 三色判环 + Kahn 拓扑排序（模拟 CMake 目标依赖 DAG，ALG-10/11）
bool dfs_has_cycle_impl(int u, const std::vector<std::vector<int>>& adj, std::vector<int>& color) {
    color[u] = 1;  // 1: visiting（当前递归栈中）
    for (int v : adj[u]) {
        if (color[v] == 1) return true;
        if (color[v] == 0 && dfs_has_cycle_impl(v, adj, color)) return true;
    }
    color[u] = 2;  // 2: visited（已完成探索）
    return false;
}

bool has_directed_cycle(const std::vector<std::vector<int>>& adj) {
    std::vector<int> color(adj.size(), 0);
    for (std::size_t i = 0; i < adj.size(); ++i) {
        if (color[i] == 0 && dfs_has_cycle_impl(static_cast<int>(i), adj, color)) {
            return true;
        }
    }
    return false;
}

std::vector<int> topo_sort_kahn(const std::vector<std::vector<int>>& adj) {
    std::vector<int> indeg(adj.size(), 0);
    for (const auto& nbrs : adj) {
        for (int v : nbrs) ++indeg[v];
    }
    std::queue<int> q;
    for (std::size_t i = 0; i < adj.size(); ++i) {
        if (indeg[i] == 0) q.push(static_cast<int>(i));
    }
    std::vector<int> order;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        for (int v : adj[u]) {
            if (--indeg[v] == 0) q.push(v);
        }
    }
    // 若 order.size() < adj.size()，说明图中存在环，无法完成全部构建
    return order.size() == adj.size() ? order : std::vector<int>{};
}

// 4. 非负权图 Dijkstra 最短路（ALG-11）
std::vector<int> dijkstra(const std::vector<std::vector<std::pair<int, int>>>& adj, int src) {
    constexpr int INF = std::numeric_limits<int>::max();
    std::vector<int> dist(adj.size(), INF);
    using State = std::pair<int, int>;  // (dist, node)
    std::priority_queue<State, std::vector<State>, std::greater<State>> pq;
    dist[src] = 0;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;  // 懒惰删除：跳过过时状态
        for (auto [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}

// 5. 并查集（路径压缩 + 按大小合并）与 Kruskal 最小生成树（ALG-11）
class DSU {
public:
    explicit DSU(std::size_t n) : parent_(n), sz_(n, 1) {
        std::iota(parent_.begin(), parent_.end(), 0);
    }

    int find(int x) {
        if (parent_[x] != x) parent_[x] = find(parent_[x]);
        return parent_[x];
    }

    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        if (sz_[a] < sz_[b]) std::swap(a, b);
        parent_[b] = a;
        sz_[a] += sz_[b];
        return true;
    }

private:
    std::vector<int> parent_;
    std::vector<int> sz_;
};

int kruskal_mst(std::size_t n, std::vector<std::tuple<int, int, int>> edges) {
    std::sort(edges.begin(), edges.end(), [](const auto& a, const auto& b) {
        return std::get<2>(a) < std::get<2>(b);
    });
    DSU dsu(n);
    int total = 0;
    for (auto [u, v, w] : edges) {
        if (dsu.unite(u, v)) total += w;
    }
    return total;
}

// 6. 贪心与反例对照（ALG-14）
struct Interval {
    int start;
    int end;
    int weight;
};

int max_unweighted_intervals_greedy(std::vector<Interval> items) {
    std::sort(items.begin(), items.end(), [](const Interval& a, const Interval& b) {
        return a.end < b.end;
    });
    int count = 0;
    int last_end = std::numeric_limits<int>::min();
    for (const auto& iv : items) {
        if (iv.start >= last_end) {
            ++count;
            last_end = iv.end;
        }
    }
    return count;
}

int max_weighted_intervals_bruteforce(const std::vector<Interval>& items) {
    int best = 0;
    const std::size_t n = items.size();
    for (std::size_t mask = 0; mask < (std::size_t{1} << n); ++mask) {
        std::vector<Interval> chosen;
        int sum = 0;
        for (std::size_t i = 0; i < n; ++i) {
            if (mask & (std::size_t{1} << i)) {
                chosen.push_back(items[i]);
                sum += items[i].weight;
            }
        }
        std::sort(chosen.begin(), chosen.end(), [](const Interval& a, const Interval& b) {
            return a.end < b.end;
        });
        bool ok = true;
        for (std::size_t i = 1; i < chosen.size(); ++i) {
            if (chosen[i].start < chosen[i - 1].end) {
                ok = false;
                break;
            }
        }
        if (ok) best = std::max(best, sum);
    }
    return best;
}

// 7. 0/1 背包动态规划：2D、1D 倒序压缩 与 暴力枚举对照（ALG-15）
int knapsack_2d(const std::vector<int>& w, const std::vector<int>& v, int cap) {
    const std::size_t n = w.size();
    std::vector<std::vector<int>> dp(n + 1, std::vector<int>(cap + 1, 0));
    for (std::size_t i = 1; i <= n; ++i) {
        for (int c = 0; c <= cap; ++c) {
            dp[i][c] = dp[i - 1][c];
            if (c >= w[i - 1]) {
                dp[i][c] = std::max(dp[i][c], dp[i - 1][c - w[i - 1]] + v[i - 1]);
            }
        }
    }
    return dp[n][cap];
}

int knapsack_1d(const std::vector<int>& w, const std::vector<int>& v, int cap) {
    std::vector<int> dp(cap + 1, 0);
    for (std::size_t i = 0; i < w.size(); ++i) {
        // 必须从大到小倒序枚举容量，确保每件物品只被放入一次
        for (int c = cap; c >= w[i]; --c) {
            dp[c] = std::max(dp[c], dp[c - w[i]] + v[i]);
        }
    }
    return dp[cap];
}

int knapsack_bruteforce(const std::vector<int>& w, const std::vector<int>& v, int cap) {
    int best = 0;
    const std::size_t n = w.size();
    for (std::size_t mask = 0; mask < (std::size_t{1} << n); ++mask) {
        int sum_w = 0, sum_v = 0;
        for (std::size_t i = 0; i < n; ++i) {
            if (mask & (std::size_t{1} << i)) {
                sum_w += w[i];
                sum_v += v[i];
            }
        }
        if (sum_w <= cap) best = std::max(best, sum_v);
    }
    return best;
}

int main() {
    // 树遍历
    std::unique_ptr<TreeNode> root;
    for (int x : {4, 2, 6, 1, 3}) bst_insert(root, x);
    std::vector<int> sorted_tree;
    inorder(root.get(), sorted_tree);
    assert((sorted_tree == std::vector<int>{1, 2, 3, 4, 6}));
    std::cout << "[ALG-09] BST inorder:";
    for (int x : sorted_tree) std::cout << ' ' << x;
    std::cout << '\n';

    // BFS 无权图（A=0, B=1, C=2, D=3）
    std::vector<std::vector<int>> ugraph{{1}, {0, 2}, {1}, {}};
    auto bdist = bfs_distances(ugraph, 0);
    assert((bdist == std::vector<int>{0, 1, 2, -1}));
    std::cout << "[ALG-10] BFS dist from A: 0 1 2 " << bdist[3] << '\n';

    // 拓扑排序（0:core -> 1:cli -> 2:tests, 0->2）与判环
    std::vector<std::vector<int>> dag{{1, 2}, {2}, {}};
    assert(!has_directed_cycle(dag));
    auto order = topo_sort_kahn(dag);
    assert((order == std::vector<int>{0, 1, 2}));
    std::vector<std::vector<int>> cyclic_dag{{1, 2}, {2}, {0}};
    assert(has_directed_cycle(cyclic_dag) && topo_sort_kahn(cyclic_dag).empty());
    std::cout << "[ALG-11] Topo order: 0->1->2, cycle detected=true\n";

    // Dijkstra（A=0, B=1, C=2）与 Kruskal
    std::vector<std::vector<std::pair<int, int>>> wgraph{{{1, 3}, {2, 1}}, {}, {{1, 1}}};
    auto ddist = dijkstra(wgraph, 0);
    assert(ddist[1] == 2);
    int mst = kruskal_mst(3, {{0, 1, 3}, {0, 2, 1}, {1, 2, 1}});
    assert(mst == 2);
    std::cout << "[ALG-11] Dijkstra A->B=" << ddist[1] << ", Kruskal MST=" << mst << '\n';

    // 贪心 vs 暴力反例
    std::vector<Interval> ivs{{0, 2, 1}, {2, 4, 1}, {0, 4, 9}};
    assert(max_unweighted_intervals_greedy(ivs) == 2);
    assert(max_weighted_intervals_bruteforce(ivs) == 9);
    std::cout << "[ALG-14] Unweighted greedy count=2, Weighted optimal=9\n";

    // 0/1 背包三者对照
    assert(knapsack_1d({2}, {3}, 4) == 3);
    const std::vector<int> weights{2, 3, 4, 5};
    const std::vector<int> values{3, 4, 5, 8};
    for (int cap = 0; cap <= 10; ++cap) {
        int r2d = knapsack_2d(weights, values, cap);
        int r1d = knapsack_1d(weights, values, cap);
        int rbf = knapsack_bruteforce(weights, values, cap);
        assert(r2d == rbf && r1d == rbf);
    }
    std::cout << "[ALG-15] Knapsack(cap=7) 2D=" << knapsack_2d(weights, values, 7)
              << ", 1D=" << knapsack_1d(weights, values, 7)
              << ", brute=" << knapsack_bruteforce(weights, values, 7) << '\n';
    return 0;
}
