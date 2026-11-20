#include <cstddef>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// 1. 遵循零法则的值类型：所有成员都是拥有型标准库类型，自动获得深拷贝与高效移动。
//    类不变量：
//      (1) source_ 非空；
//      (2) entries_ 中不存放空字符串；
//      (3) 对外暴露的 size() 始终与 entries_.size() 一致。
class ScanReport {
public:
    explicit ScanReport(std::string source) : source_(std::move(source)) {
        if (source_.empty()) {
            throw std::invalid_argument("source must not be empty");
        }
    }

    void add_entry(std::string entry) {
        if (entry.empty()) {
            throw std::invalid_argument("entry must not be empty");
        }
        entries_.push_back(std::move(entry));
    }

    // const 成员函数：承诺只读查询，不修改任何成员。
    const std::string& source() const noexcept { return source_; }
    std::size_t size() const noexcept { return entries_.size(); }
    bool empty() const noexcept { return entries_.empty(); }

    void clear_entries() noexcept { entries_.clear(); }

private:
    std::string source_;
    std::vector<std::string> entries_;
};

// 2. 运行时多态接口：纯虚函数定义契约，虚析构确保通过基类指针删除派生对象。
class ReportSink {
public:
    virtual ~ReportSink() = default;
    virtual void write(const ScanReport& report) = 0;
};

class MemorySink final : public ReportSink {
public:
    ~MemorySink() override {
        std::cout << "MemorySink destroyed (received=" << received_ << ")\n";
    }

    void write(const ScanReport& report) override {
        ++received_;
        std::cout << "sink received: source=" << report.source()
                  << ", entries=" << report.size() << '\n';
    }

    std::size_t received() const noexcept { return received_; }

private:
    std::size_t received_{0};
};

// 3. 只移动的资源持有者：含 std::unique_ptr 成员，编译器自动禁用复制、保留移动。
class Pipeline {
public:
    explicit Pipeline(std::unique_ptr<ReportSink> sink) : sink_(std::move(sink)) {}

    bool has_sink() const noexcept { return sink_ != nullptr; }

    void emit(const ScanReport& report) {
        if (sink_) {
            sink_->write(report);
        }
    }

private:
    std::unique_ptr<ReportSink> sink_;
};

int main() {
    // A. 值语义与深拷贝独立性
    ScanReport original{"app.log"};
    original.add_entry("INFO boot");

    ScanReport copied = original; // 复制构造：独立副本
    copied.add_entry("WARN retry");

    std::cout << "after copy-and-append: original.size=" << original.size()
              << ", copied.size=" << copied.size() << '\n';

    // B. 移动构造与移后源状态
    ScanReport moved = std::move(copied); // std::move 仅做右值转换，真正搬运发生在移动构造中
    std::cout << "after move: moved.size=" << moved.size()
              << ", moved-from copied.empty=" << std::boolalpha << copied.empty() << '\n';

    // 移后对象仍处于有效状态，可以安全清空或重新赋值
    copied.clear_entries();
    copied.add_entry("INFO reused");
    std::cout << "after reuse of moved-from: copied.size=" << copied.size() << '\n';

    // C. 只移动类型与运行时多态（通过基类 unique_ptr 持有并自动虚析构）
    {
        auto sink = std::make_unique<MemorySink>();
        Pipeline p1{std::move(sink)};
        // Pipeline p2 = p1; // 反例：编译错误（unique_ptr 成员导致复制构造被删除）
        Pipeline p2 = std::move(p1);
        std::cout << "pipeline moved: p1.has_sink=" << p1.has_sink()
                  << ", p2.has_sink=" << p2.has_sink() << '\n';
        p2.emit(moved);
    } // p2 离开作用域，经由 ReportSink 虚析构正确销毁 MemorySink

    return 0;
}
