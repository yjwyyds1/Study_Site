#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <limits>
#include <optional>
#include <ranges>
#include <span>
#include <string>
#include <vector>

struct LogEntry {
    std::string source;
    int count;
};

// 安全下标边界检查：空序列返回 nullopt，绝不越界读。
std::optional<int> first_element(std::span<const int> items) {
    if (items.empty()) {
        return std::nullopt;
    }
    return items.front();
}

// 安全有符号整数累加：先检查再计算，溢出时拒绝修改并保留 total 原值。
bool checked_add(int& total, int delta) {
    if (delta > 0 && total > std::numeric_limits<int>::max() - delta) {
        return false;
    }
    if (delta < 0 && total < std::numeric_limits<int>::min() - delta) {
        return false;
    }
    total += delta;
    return true;
}

int main() {
    // --- 第一部分：C++20 Ranges 算法与惰性视图 ---

    // 1. std::ranges::sort 直接接收范围与投影成员指针，无需手写 begin/end 与比较器。
    std::vector<LogEntry> entries{{"auth", 2}, {"db", 5}, {"cache", 1}};
    std::ranges::sort(entries, std::ranges::greater{}, &LogEntry::count);
    std::cout << "ranges::sort by count desc:";
    for (const LogEntry& e : entries) {
        std::cout << ' ' << e.source << ':' << e.count;
    }
    std::cout << '\n';

    // 2. 惰性视图 views::filter + views::transform，并在源容器销毁前物化为拥有型 vector。
    std::vector<int> owned_squares;
    std::size_t filter_calls = 0;
    std::size_t transform_calls = 0;
    {
        const std::vector<int> source{3, 1, 4, 2};
        auto pipeline = source
            | std::views::filter([&filter_calls](int x) {
                  ++filter_calls;
                  return x % 2 == 0;
              })
            | std::views::transform([&transform_calls](int x) {
                  ++transform_calls;
                  return x * x;
              });

        // 构造视图本身不会遍历数据：此时调用次数全为 0。
        std::cout << "before iteration: filter_calls=" << filter_calls
                  << ", transform_calls=" << transform_calls << '\n';

        // 显式遍历并物化到外层 owned_squares，避免把视图带出 source 的作用域。
        for (int value : pipeline) {
            owned_squares.push_back(value);
        }
    } // source 在此处销毁，但 owned_squares 拥有自己的独立副本。

    std::cout << "after iteration: filter_calls=" << filter_calls
              << ", transform_calls=" << transform_calls << '\n';
    std::cout << "materialized squares:";
    for (std::size_t i = 0; i < owned_squares.size(); ++i) {
        std::cout << (i == 0 ? " " : ", ") << owned_squares[i];
    }
    std::cout << '\n';

    // --- 第二部分：行为边界、越界防护与有符号溢出检查 ---

    // 3. 明确定义的无符号回绕（模 2^8）与实现定义属性。
    const std::uint8_t wrapped = static_cast<std::uint8_t>(std::uint8_t{255} + 1U);
    std::cout << "unsigned uint8 wrap (255 + 1): " << static_cast<unsigned>(wrapped) << '\n';
    std::cout << "implementation-defined sizeof(long): " << sizeof(long)
              << ", char is_signed=" << std::boolalpha
              << std::numeric_limits<char>::is_signed << '\n';

    // 4. 边界输入验证：空序列与单元素序列均安全返回明确结果。
    const std::vector<int> empty_vec{};
    const std::vector<int> single_vec{42};
    const auto r_empty = first_element(empty_vec);
    const auto r_single = first_element(single_vec);
    std::cout << "first_element(empty): " << (r_empty ? std::to_string(*r_empty) : "none") << '\n';
    std::cout << "first_element({42}): " << (r_single ? std::to_string(*r_single) : "none") << '\n';

    // 5. 最大有符号整数安全累加：触发显式溢出错误且原计数保持不变。
    int counter = std::numeric_limits<int>::max();
    const bool ok_overflow = checked_add(counter, 1);
    std::cout << "checked_add(INT_MAX, 1): ok=" << ok_overflow
              << ", counter=" << counter << '\n';

    int normal_counter = 100;
    const bool ok_normal = checked_add(normal_counter, 25);
    std::cout << "checked_add(100, 25): ok=" << ok_normal
              << ", counter=" << normal_counter << '\n';
    return 0;
}
