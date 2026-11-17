#include <cstddef>  // std::size_t：用于保存非负下标。
#include <iostream> // std::cout 与 std::boolalpha。
#include <vector>   // std::vector：管理连续的元素序列。

int main() {
    std::vector<int> hits{10, 20};
    hits.reserve(hits.size() + 1); // [A] 先给下一条命中留空间，再借元素。
    const auto old_capacity = hits.capacity();
    const std::size_t index = 1;
    const int& old = hits.at(index); // 借用当时的第二个元素。
    const int saved = old;          // 把当时的值复制到独立的 int。

    std::cout << std::boolalpha
              << "reserved: size=" << hits.size()
              << ", room=" << (hits.size() < old_capacity) << '\n';

    hits.push_back(30); // [B] 新 size 不超过原 capacity，old 仍有效。
    std::cout << "appended: size=" << hits.size()
              << ", same capacity=" << (hits.capacity() == old_capacity)
              << ", old=" << old << '\n';

    hits.reserve(hits.capacity() + 1); // [C] 请求超过当前容量，必然重分配（成功时）。
    // old 已失效。从当前 hits 按下标重新取，得到一份新的借用。
    const int& fresh = hits.at(index);
    std::cout << "after reserve: size=" << hits.size()
              << ", grew=" << (hits.capacity() > old_capacity)
              << ", at index=" << fresh << ", saved=" << saved << '\n';

    hits.erase(hits.begin()); // [D] 删除首项；fresh 也失效，不再用。
    std::cout << "after erase: size=" << hits.size()
              << ", at index=" << hits.at(index) << ", saved=" << saved << '\n';
}
