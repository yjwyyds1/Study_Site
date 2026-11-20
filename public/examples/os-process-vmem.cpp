#include <atomic>
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

// OS-03: 全局共享状态 vs 每线程私有状态 (thread_local)
std::atomic<int> g_shared_visits{0};
thread_local int tls_visits = 0;

// OS-06: 两把共享互斥锁，用 std::scoped_lock 消除循环等待死锁
std::mutex g_lock_a;
std::mutex g_lock_b;
int g_account_a = 100;
int g_account_b = 100;

void transfer_with_scoped_lock(int id, int delta) {
    // 即使线程 1 传 (a, b)、线程 2 传 (b, a)，std::scoped_lock 也会用无死锁算法加锁
    if (id == 1) {
        std::scoped_lock guard(g_lock_a, g_lock_b);
        g_account_a -= delta;
        g_account_b += delta;
    } else {
        std::scoped_lock guard(g_lock_b, g_lock_a);
        g_account_b -= delta;
        g_account_a += delta;
    }
}

void worker_tls_demo(int id) {
    // 两个线程共享 g_shared_visits，但各自的 tls_visits 从 0 独立计数
    g_shared_visits.fetch_add(1, std::memory_order_relaxed);
    ++tls_visits;
    transfer_with_scoped_lock(id, 10);

    static std::mutex io_mu;
    std::lock_guard<std::mutex> lock(io_mu);
    std::cout << "[线程 " << id << "] tls_visits=" << tls_visits
              << " (私有), g_shared_visits=" << g_shared_visits.load() << '\n';
}

int main() {
    // 1. OS-03 & OS-06: 验证线程共享/TLS 与无死锁多锁获取
    {
        std::thread t1(worker_tls_demo, 1);
        std::thread t2(worker_tls_demo, 2);
        t1.join();
        t2.join();
    }
    std::cout << "join 后总计: shared=" << g_shared_visits.load()
              << ", account_a=" << g_account_a
              << ", account_b=" << g_account_b << '\n';

    // 2. OS-04 & OS-05: 阻塞等待（让出 CPU）vs 条件唤醒
    std::mutex wait_mu;
    std::condition_variable cv;
    bool ready = false;

    auto start = std::chrono::steady_clock::now();
    std::thread notifier([&] {
        std::this_thread::sleep_for(std::chrono::milliseconds(40));
        {
            std::lock_guard<std::mutex> lk(wait_mu);
            ready = true;
        }
        cv.notify_one();
    });

    {
        std::unique_lock<std::mutex> lk(wait_mu);
        // 进入 Blocked 状态并自动释放 wait_mu，不空转消耗 CPU
        cv.wait(lk, [&] { return ready; });
    }
    notifier.join();

    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now() - start)
                          .count();
    std::cout << "条件变量唤醒耗时 (墙钟): " << elapsed_ms << " ms\n";
    return 0;
}
