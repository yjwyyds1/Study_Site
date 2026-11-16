#include <iostream>
#include <vector>

int main() {
    std::vector<int> hits{10, 20};
    hits.reserve(hits.size() + 1);
    const auto old_capacity = hits.capacity();
    const int& first = hits.front();

    std::cout << std::boolalpha
              << "reserved: size=" << hits.size()
              << ", room=" << (hits.size() < old_capacity) << '\n';

    hits.push_back(30);
    std::cout << "appended: size=" << hits.size()
              << ", same capacity=" << (hits.capacity() == old_capacity)
              << ", first=" << first << '\n';

    hits.reserve(old_capacity + 1);
    // Reallocation invalidates first. Read the element from hits again.
    std::cout << "after reserve: grew=" << (hits.capacity() > old_capacity)
              << ", reread=" << hits.front() << '\n';
}
