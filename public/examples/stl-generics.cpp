#include <array>
#include <concepts>
#include <cstddef>
#include <iostream>
#include <ranges>
#include <string>
#include <vector>

// 1. 受约束的函数模板：要求 T 支持全序比较（<、== 等）。
template <typename T>
    requires std::totally_ordered<T>
T pick_max(const T& a, const T& b) {
    return (a < b) ? b : a;
}

// 2. 自定义 Concept：R 必须是可读范围，且 Pred 能对 R 的元素返回布尔值。
template <typename R, typename Pred>
concept CountableRange =
    std::ranges::input_range<R> &&
    std::predicate<Pred, std::ranges::range_reference_t<R>>;

// 3. 同一份泛型统计逻辑，可以无缝接收 vector、array 等任意满足约束的序列。
template <typename R, typename Pred>
    requires CountableRange<R, Pred>
std::size_t count_matching(const R& range, Pred pred) {
    std::size_t total = 0;
    for (const auto& item : range) {
        if (pred(item)) {
            ++total;
        }
    }
    return total;
}

struct IsPositive {
    bool operator()(int value) const { return value > 0; }
};

// 编译期验收：合法序列通过，标量与元素类型不匹配的序列被约束拒绝。
static_assert(CountableRange<std::vector<int>, IsPositive>);
static_assert(CountableRange<std::array<int, 4>, IsPositive>);
static_assert(!CountableRange<int, IsPositive>);
static_assert(!CountableRange<std::vector<std::string>, IsPositive>);

int main() {
    // 同类型实参：编译器自动推导 T = int。
    std::cout << "pick_max(3, 7) = " << pick_max(3, 7) << '\n';

    // 混合类型实参：直接写 pick_max(3, 4.5) 会推导冲突，显式指定 T = double 即可解决。
    std::cout << "pick_max<double>(3, 4.5) = " << pick_max<double>(3, 4.5) << '\n';

    // 用同一个 count_matching 统计 vector 和 array 中大于 0 的元素。
    const std::vector<int> vec{-1, 0, 2, 5};
    const std::array<int, 4> arr{-1, 0, 2, 5};
    const IsPositive is_positive{};

    std::cout << "vector positive count = " << count_matching(vec, is_positive) << '\n';
    std::cout << "array positive count  = " << count_matching(arr, is_positive) << '\n';

    // 换用不同元素类型和 lambda 谓词，同样在编译期生成对应实例。
    const std::vector<std::string> logs{"INFO ok", "", "ERROR timeout"};
    const auto non_empty = [](const std::string& line) { return !line.empty(); };
    std::cout << "non-empty log count   = " << count_matching(logs, non_empty) << '\n';

    // 取消下一行注释即可观察编译期 Concepts 诊断（int 不满足 input_range）：
    // count_matching(42, is_positive);
    return 0;
}
