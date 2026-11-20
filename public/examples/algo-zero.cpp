#include <iostream>
#include <queue>
#include <stack>
#include <string>
#include <vector>

int main() {
    // 1. 准备 1000 个按顺序排好的编号：0, 1, 2, ..., 999
    std::vector<int> nums;
    for (int i = 0; i < 1000; ++i) {
        nums.push_back(i);
    }
    const int target = 999;

    // 2. 顺序查找 O(n)：从第 1 页一页一页往后翻
    int linear_steps = 0;
    for (int x : nums) {
        ++linear_steps;
        if (x == target) break;
    }

    // 3. 二分查找 O(log n)：每次直接翻到中间撕掉一半
    int binary_steps = 0;
    int left = 0;
    int right = static_cast<int>(nums.size()) - 1;
    while (left <= right) {
        ++binary_steps;
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) break;
        if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    // 4. 嵌套循环 O(n^2)：两两配对，规模 100 时步数约 100*99/2
    long long pair_steps = 0;
    for (int i = 0; i < 100; ++i) {
        for (int j = i + 1; j < 100; ++j) {
            ++pair_steps;
        }
    }

    std::cout << "[查找对比 n=1000] 顺序查找步数=" << linear_steps
              << ", 二分查找步数=" << binary_steps << '\n';
    std::cout << "[嵌套配对 n=100] 总步数=" << pair_steps << '\n';

    // 5. 栈（叠盘子：后放进去的先拿出来 LIFO）
    std::stack<std::string> plates;
    plates.push("盘子A");
    plates.push("盘子B");
    std::cout << "[栈顶先出] " << plates.top() << '\n';
    plates.pop();
    std::cout << "[再出下一个] " << plates.top() << '\n';

    // 6. 队列（买奶茶排队：先来的先买到 FIFO）
    std::queue<std::string> line;
    line.push("顾客1");
    line.push("顾客2");
    std::cout << "[队头先出] " << line.front() << '\n';
    line.pop();
    std::cout << "[下一位] " << line.front() << '\n';
    return 0;
}
