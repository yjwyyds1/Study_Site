#include <algorithm>
#include <cassert>
#include <cstddef>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <queue>
#include <stack>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

// 1. 复杂度计数与 vector 倍增扩容观测
std::size_t count_pairs(std::size_t n) {
    std::size_t ops = 0;
    for (std::size_t i = 0; i < n; ++i) {
        for (std::size_t j = 0; j < i; ++j) {
            ++ops;
        }
    }
    return ops;  // n*(n-1)/2 -> Theta(n^2)
}

void demo_amortized_vector() {
    std::vector<int> v;
    std::size_t reallocs = 0;
    std::size_t prev_cap = v.capacity();
    for (int i = 0; i < 17; ++i) {
        v.push_back(i);
        if (v.capacity() != prev_cap) {
            ++reallocs;
            prev_cap = v.capacity();
        }
    }
    std::cout << "[ALG-01/02] count_pairs(4)=" << count_pairs(4)
              << ", count_pairs(8)=" << count_pairs(8)
              << ", push_back(17) reallocs=" << reallocs
              << ", final_cap=" << v.capacity() << '\n';
}

// 2. 单链表 (std::unique_ptr<Node>)：头/中/尾删除与空表安全（ALG-03）
class SinglyList {
public:
    struct Node {
        int val;
        std::unique_ptr<Node> next;
    };

    ~SinglyList() {
        // 迭代摘链释放，防止超长链表在默认递归析构时栈溢出
        while (head_) {
            auto doomed = std::move(head_);
            head_ = std::move(doomed->next);
        }
    }

    void push_back(int val) {
        auto node = std::make_unique<Node>(Node{val, nullptr});
        if (!head_) {
            head_ = std::move(node);
            return;
        }
        Node* cur = head_.get();
        while (cur->next) {
            cur = cur->next.get();
        }
        cur->next = std::move(node);
    }

    // 统一处理空表、头节点、中间节点与尾节点删除
    bool erase_first(int target) {
        std::unique_ptr<Node>* link = &head_;
        while (*link) {
            if ((*link)->val == target) {
                auto doomed = std::move(*link);
                *link = std::move(doomed->next);
                return true;
            }
            link = &((*link)->next);
        }
        return false;
    }

    std::vector<int> to_vector() const {
        std::vector<int> out;
        for (const Node* cur = head_.get(); cur != nullptr; cur = cur->next.get()) {
            out.push_back(cur->val);
        }
        return out;
    }

private:
    std::unique_ptr<Node> head_;
};

// 3. 栈（括号匹配）与定长环形队列（回绕索引）
bool is_balanced(std::string_view s) {
    std::stack<char> st;
    for (char ch : s) {
        if (ch == '(' || ch == '[' || ch == '{') {
            st.push(ch);
        } else if (ch == ')' || ch == ']' || ch == '}') {
            if (st.empty()) return false;
            char top = st.top();
            st.pop();
            if ((ch == ')' && top != '(') ||
                (ch == ']' && top != '[') ||
                (ch == '}' && top != '{')) {
                return false;
            }
        }
    }
    return st.empty();
}

template <typename T>
class RingQueue {
public:
    explicit RingQueue(std::size_t cap) : buf_(cap), cap_(cap) {}

    bool push(T val) {
        if (size_ == cap_) return false;
        buf_[tail_] = std::move(val);
        tail_ = (tail_ + 1) % cap_;
        ++size_;
        return true;
    }

    std::optional<T> pop() {
        if (size_ == 0) return std::nullopt;
        T out = std::move(buf_[head_]);
        head_ = (head_ + 1) % cap_;
        --size_;
        return out;
    }

private:
    std::vector<T> buf_;
    std::size_t cap_;
    std::size_t head_ = 0;
    std::size_t tail_ = 0;
    std::size_t size_ = 0;
};

// 3. 滑动窗口（仅在元素非负时满足“窗口越大和越大”的单调性）
std::size_t min_len_at_least(const std::vector<int>& nums, int target) {
    std::size_t best = nums.size() + 1;
    long long sum = 0;
    std::size_t left = 0;
    for (std::size_t right = 0; right < nums.size(); ++right) {
        sum += nums[right];
        while (sum >= target) {
            best = std::min(best, right - left + 1);
            sum -= nums[left++];
        }
    }
    return best <= nums.size() ? best : 0;
}

// 4. 哈希统计 + 小顶堆确定性 Top-K，并以全排序作对照
struct Item {
    std::string key;
    int freq;
};

// 报告排序规则：频次降序，同频次按键字典序升序
bool report_better(const Item& a, const Item& b) {
    if (a.freq != b.freq) return a.freq > b.freq;
    return a.key < b.key;
}

std::vector<Item> top_k_heap(const std::vector<std::string>& keys, std::size_t k) {
    if (k == 0) return {};
    std::unordered_map<std::string, int> counts;
    for (const auto& key : keys) {
        ++counts[key];
    }

    // 小顶堆顶放“当前前 K 名里最弱的那一个”，便于淘汰
    auto worse_on_top = [](const Item& a, const Item& b) {
        return report_better(a, b);
    };
    std::priority_queue<Item, std::vector<Item>, decltype(worse_on_top)> pq(worse_on_top);

    for (const auto& [key, freq] : counts) {
        pq.push(Item{key, freq});
        if (pq.size() > k) {
            pq.pop();
        }
    }

    std::vector<Item> res;
    while (!pq.empty()) {
        res.push_back(pq.top());
        pq.pop();
    }
    std::sort(res.begin(), res.end(), report_better);
    return res;
}

std::vector<Item> top_k_full_sort_ref(const std::vector<std::string>& keys, std::size_t k) {
    std::map<std::string, int> ordered_counts;
    for (const auto& key : keys) {
        ++ordered_counts[key];
    }
    std::vector<Item> all;
    all.reserve(ordered_counts.size());
    for (const auto& [key, freq] : ordered_counts) {
        all.push_back(Item{key, freq});
    }
    std::sort(all.begin(), all.end(), report_better);
    if (k < all.size()) {
        all.resize(k);
    }
    return all;
}

// 5. 半开区间 [left, right) 二分查找
std::size_t lower_bound_idx(const std::vector<int>& a, int x) {
    std::size_t left = 0;
    std::size_t right = a.size();  // 不变量：答案位于 [left, right] 中，a[0..left) < x 且 a[right..n) >= x
    while (left < right) {
        std::size_t mid = left + (right - left) / 2;
        if (a[mid] < x) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }
    return left;
}

std::size_t upper_bound_idx(const std::vector<int>& a, int x) {
    std::size_t left = 0;
    std::size_t right = a.size();
    while (left < right) {
        std::size_t mid = left + (right - left) / 2;
        if (a[mid] <= x) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }
    return left;
}

int main() {
    demo_amortized_vector();
    assert(count_pairs(4) == 6 && count_pairs(8) == 28);

    // 单链表 1->2->3：删除中间、尾、头节点及空表安全删除
    SinglyList list;
    assert(!list.erase_first(99));  // 空表删除安全返回 false
    for (int v : {1, 2, 3}) list.push_back(v);
    assert((list.to_vector() == std::vector<int>{1, 2, 3}));
    assert(list.erase_first(2) && (list.to_vector() == std::vector<int>{1, 3}));  // 删中
    assert(list.erase_first(3) && (list.to_vector() == std::vector<int>{1}));     // 删尾
    assert(list.erase_first(1) && list.to_vector().empty());                      // 删头
    assert(!list.erase_first(1));                                                 // 空表再删
    std::cout << "[ALG-03] SinglyList 1->2->3: del(2)=[1,3], del(3)=[1], del(1)=[], del_empty=false\n";

    // 栈与环形队列
    assert(is_balanced("([{}])") && !is_balanced("([)]"));
    RingQueue<char> rq(3);
    assert(rq.push('A') && rq.push('B') && rq.push('C') && !rq.push('D'));
    assert(rq.pop() == 'A' && rq.push('D'));
    std::cout << "[ALG-04] RingQueue pop:";
    while (auto v = rq.pop()) {
        std::cout << ' ' << *v;
    }
    std::cout << '\n';

    // 滑动窗口
    const std::vector<int> win_data{2, 1, 3, 2};
    assert(min_len_at_least(win_data, 5) == 2);
    std::cout << "[ALG-12] min_len_at_least([2,1,3,2], 5)=" << min_len_at_least(win_data, 5) << '\n';

    // Top-K 堆 vs 全排序对照
    const std::vector<std::string> logs{"b", "a", "c", "b", "a"};
    for (std::size_t k : {std::size_t{0}, std::size_t{1}, std::size_t{2}, std::size_t{9}}) {
        auto got = top_k_heap(logs, k);
        auto ref = top_k_full_sort_ref(logs, k);
        assert(got.size() == ref.size());
        for (std::size_t i = 0; i < got.size(); ++i) {
            assert(got[i].key == ref[i].key && got[i].freq == ref[i].freq);
        }
    }
    assert(top_k_heap({}, 3).empty());
    std::cout << "[ALG-05/06/16] Top-2:";
    for (const auto& item : top_k_heap(logs, 2)) {
        std::cout << ' ' << item.key << ':' << item.freq;
    }
    std::cout << '\n';

    // 二分查找边界 [left, right)
    const std::vector<int> sorted{1, 2, 2, 4};
    auto lb2 = lower_bound_idx(sorted, 2);
    auto ub2 = upper_bound_idx(sorted, 2);
    auto lb3 = lower_bound_idx(sorted, 3);
    auto ub3 = upper_bound_idx(sorted, 3);
    assert(lb2 == 1 && ub2 == 3 && lb3 == 3 && ub3 == 3);
    std::cout << "[ALG-08] range(2)=[" << lb2 << ',' << ub2
              << "), range(3)=[" << lb3 << ',' << ub3 << ")\n";
    return 0;
}
