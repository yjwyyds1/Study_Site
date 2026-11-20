#include <algorithm>
#include <cassert>
#include <chrono>
#include <ctime>
#include <functional>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <sstream>
#include <string>
#include <thread>
#include <utility>
#include <vector>
#include <version>

#if defined(__cpp_lib_format) && __cpp_lib_format >= 201907L
#include <format>
#endif

// 1. 安全的按值返回闭包 vs 悬垂引用反例
std::function<int(int)> make_adder_safe(int base) {
    // 按值捕获 [=]：闭包结构体里拷贝保存了一份 base，原形参销毁后仍安全
    return [base](int x) { return base + x; };
}

// 【反例警告 - 切勿这么写】：
// std::function<int(int)> make_adder_dangling(int base) {
//     return [&base](int x) { return base + x; }; // UB！返回后 base 栈帧已销毁，引用悬垂
// }

// 2. 格式化系统时间（墙上时钟 system_clock -> YYYY-MM-DD HH:MM:SS）
std::string format_wall_time(std::chrono::system_clock::time_point tp) {
    const std::time_t raw = std::chrono::system_clock::to_time_t(tp);
    const std::tm* tm_ptr = std::localtime(&raw);
    if (!tm_ptr) return "0000-00-00 00:00:00";

#if defined(__cpp_lib_format) && __cpp_lib_format >= 201907L
    return std::format("{:04d}-{:02d}-{:02d} {:02d}:{:02d}:{:02d}",
                       tm_ptr->tm_year + 1900, tm_ptr->tm_mon + 1, tm_ptr->tm_mday,
                       tm_ptr->tm_hour, tm_ptr->tm_min, tm_ptr->tm_sec);
#else
    std::ostringstream oss;
    oss << std::put_time(tm_ptr, "%Y-%m-%d %H:%M:%S");
    return oss.str();
#endif
}

int main() {
    using namespace std::chrono_literals;

    // (A) [=] 值捕获（默认 const）vs mutable vs [&] 同步排序
    int factor = 2;
    auto by_val = [factor](int x) { return x * factor; };
    auto by_mut = [count = 0]() mutable { return ++count; };
    factor = 10;  // 不影响 by_val 内部已拷贝的 factor(=2)
    assert(by_val(3) == 6);
    assert(by_mut() == 1 && by_mut() == 2);

    // 同步算法 std::sort 在当前语句结束前就会执行完比较器，因此 [&] 借用安全
    std::vector<int> scores{30, 10, 50, 20};
    int target_pivot = 25;
    std::sort(scores.begin(), scores.end(), [&](int a, int b) {
        const bool a_hi = a >= target_pivot;
        const bool b_hi = b >= target_pivot;
        if (a_hi != b_hi) return a_hi;  // >=25 的排前面
        return a < b;
    });
    assert((scores == std::vector<int>{30, 50, 10, 20}));

    // (B) 返回闭包寿命安全边界
    auto add_five = make_adder_safe(5);
    assert(add_five(7) == 12);

    // (C) 异步线程与初始化捕获 [data = std::move(data)]：转移独占所有权进闭包
    // 若在 std::thread 里用 [&] 捕获局部变量，主线程一旦提前退出作用域就会悬垂崩溃！
    std::vector<int> batch{10, 20, 30, 40};
    long long async_sum = 0;
    {
        std::thread worker([data = std::move(batch), &async_sum]() {
            async_sum = std::accumulate(data.begin(), data.end(), 0LL);
        });
        worker.join();  // join 保证 async_sum 写完才离开作用域
    }
    assert(batch.empty());  // 原 vector 已被移动进闭包
    assert(async_sum == 100);

    // (D) steady_clock 单调计时（适合耗时/超时，不受系统校时影响）
    const auto t0 = std::chrono::steady_clock::now();
    std::this_thread::sleep_for(5ms);
    const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - t0);
    assert(elapsed_ms >= 0ms);

    const std::string ts = format_wall_time(std::chrono::system_clock::now());
    std::cout << "[lambda] by_val(3)=" << by_val(3)
              << ", add_five(7)=" << add_five(7)
              << ", async_sum=" << async_sum << '\n';
    std::cout << "[chrono] elapsed_ms>=" << elapsed_ms.count()
              << "ms, wall_time=" << ts << '\n';
    return 0;
}
