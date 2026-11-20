#include <iostream>
#include <mutex>
#include <thread>

int main() {
    // 第一步：最简多线程问候（10 行体验两个帮手同时干活）
    std::mutex print_mu;
    std::thread helper1([&] {
        std::lock_guard<std::mutex> lock(print_mu);
        std::cout << "[帮手 1] 正在并行扫描前半段日志\n";
    });
    std::thread helper2([&] {
        std::lock_guard<std::mutex> lock(print_mu);
        std::cout << "[帮手 2] 正在并行扫描后半段日志\n";
    });
    helper1.join(); // 主线程等帮手 1 收工
    helper2.join(); // 主线程等帮手 2 收工

    // 第二步：存钱罐安全记账（两人各存 100,000 次 1 元，用一把锁保护存钱罐）
    int piggy_bank = 0;
    std::mutex bank_mu;

    auto deposit = [&] {
        for (int i = 0; i < 100000; ++i) {
            std::lock_guard<std::mutex> lock(bank_mu); // 拿到钥匙才允许改钱数
            ++piggy_bank;
            // 如果不加锁直接 ++piggy_bank，两个线程会同时读到旧值并互相覆盖（数据竞争）！
        }
    };

    std::thread person_a(deposit);
    std::thread person_b(deposit);
    person_a.join();
    person_b.join();

    std::cout << "存钱罐最终余额 (预期 200000): " << piggy_bank << '\n';
    return 0;
}
