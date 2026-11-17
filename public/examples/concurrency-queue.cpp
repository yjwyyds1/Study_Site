#include <condition_variable>
#include <iostream>
#include <mutex>
#include <optional>
#include <queue>
#include <string>
#include <thread>

class BoundedQueue {
public:
    explicit BoundedQueue(std::size_t capacity) : capacity_(capacity) {}

    // 放入一条日志；如果队列满了就等待，如果已关闭就返回 false
    bool push(std::string item) {
        std::unique_lock<std::mutex> lock(mu_);
        not_full_.wait(lock, [&] { return closed_ || queue_.size() < capacity_; });
        if (closed_) {
            return false;
        }
        queue_.push(std::move(item));
        not_empty_.notify_one();
        return true;
    }

    // 取出一条日志；如果队列空且未关闭就等待，关闭且排空后返回 std::nullopt
    std::optional<std::string> pop() {
        std::unique_lock<std::mutex> lock(mu_);
        not_empty_.wait(lock, [&] { return closed_ || !queue_.empty(); });
        if (queue_.empty()) {
            return std::nullopt;
        }
        std::string item = std::move(queue_.front());
        queue_.pop();
        not_full_.notify_one();
        return item;
    }

    void close() {
        std::lock_guard<std::mutex> lock(mu_);
        closed_ = true;
        not_empty_.notify_all();
        not_full_.notify_all();
    }

private:
    std::size_t capacity_;
    std::mutex mu_;
    std::condition_variable not_empty_;
    std::condition_variable not_full_;
    std::queue<std::string> queue_;
    bool closed_ = false;
};

int main() {
    BoundedQueue q(2);

    std::thread worker([&] {
        while (auto line = q.pop()) {
            std::cout << "worker 处理: " << *line << '\n';
        }
        std::cout << "worker 收到关闭信号并排空，退出\n";
    });

    q.push("INFO start");
    q.push("WARN high memory");
    q.push("ERROR disk full");
    q.close();

    worker.join();
    return 0;
}
