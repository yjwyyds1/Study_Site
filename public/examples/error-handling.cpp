#include <cstdint>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>

enum class Level { info, warn, error, unknown };

struct Counts {
    std::uint64_t info{};
    std::uint64_t warn{};
    std::uint64_t error{};
    std::uint64_t unknown{};

    void add(const Counts& other) noexcept {
        info += other.info;
        warn += other.warn;
        error += other.error;
        unknown += other.unknown;
    }
};

enum class ErrorCode { none, open_failed, read_failed };

// C++20 带标签结果结构体：明确区分成功结果与结构化错误。
struct ScanResult {
    Counts counts{};
    ErrorCode error{ErrorCode::none};
    std::string message;

    bool ok() const noexcept { return error == ErrorCode::none; }
};

// 用 std::optional 表示“正常缺值”：纯空白行没有级别，不是错误。
std::optional<Level> parse_level(std::string_view line) {
    const auto first = line.find_first_not_of(" \t\r");
    if (first == std::string_view::npos) {
        return std::nullopt;
    }
    const auto rest = line.substr(first);
    const auto sep = rest.find_first_of(" \t\r");
    const auto word = (sep == std::string_view::npos) ? rest : rest.substr(0, sep);

    if (word == "INFO") return Level::info;
    if (word == "WARN") return Level::warn;
    if (word == "ERROR") return Level::error;
    return Level::unknown;
}

// 库层扫描函数：不打印 stderr，不 exit，通过 ScanResult 把结果和错误交回调用方。
ScanResult scan_stream(std::istream& input, std::string_view label) {
    ScanResult result{};
    if (input.bad()) {
        result.error = ErrorCode::read_failed;
        result.message = std::string{"stream already bad: "} + std::string{label};
        return result;
    }

    std::string line;
    while (std::getline(input, line)) {
        const auto level = parse_level(line);
        if (!level.has_value()) {
            continue; // 空白行跳过
        }
        switch (*level) {
            case Level::info:    ++result.counts.info;    break;
            case Level::warn:    ++result.counts.warn;    break;
            case Level::error:   ++result.counts.error;   break;
            case Level::unknown: ++result.counts.unknown; break;
        }
    }

    // 区分正常 EOF 与 I/O 读取故障
    if (input.bad() || (!input.eof() && input.fail())) {
        result.error = ErrorCode::read_failed;
        result.message = std::string{"read failed: "} + std::string{label};
        result.counts = Counts{}; // 失败时不暴露半成品计数
    }
    return result;
}

// 按文件提交（强异常/失败保证）：只有整份流成功读完，才把临时结果提交到 total。
ErrorCode merge_stream_strong(Counts& total, std::istream& input,
                              std::string_view label, std::string& diag) {
    ScanResult temp = scan_stream(input, label);
    if (!temp.ok()) {
        diag = temp.message;
        return temp.error; // total 完全未被触碰
    }
    total.add(temp.counts); // 仅在此处提交
    return ErrorCode::none;
}

// 入口边界翻译：把库层 ErrorCode 映射为进程退出码。
int to_exit_code(ErrorCode code) noexcept {
    switch (code) {
        case ErrorCode::none:        return 0;
        case ErrorCode::open_failed: return 1;
        case ErrorCode::read_failed: return 1;
    }
    return 1;
}

void print_counts(std::string_view tag, const Counts& c) {
    std::cout << tag << ": INFO=" << c.info << " WARN=" << c.warn
              << " ERROR=" << c.error << " UNKNOWN=" << c.unknown << '\n';
}

int main() {
    // 1. 空的正常流：正常 EOF，零计数，无错误
    std::istringstream empty_in{""};
    const auto r_empty = scan_stream(empty_in, "empty.log");
    std::cout << "empty ok=" << std::boolalpha << r_empty.ok()
              << " exit=" << to_exit_code(r_empty.error) << '\n';
    print_counts("empty", r_empty.counts);

    // 2. 预置 badbit 的流：应识别为 read_failed，而非正常 EOF
    std::istringstream bad_in{"INFO should-not-commit\n"};
    bad_in.setstate(std::ios::badbit);
    const auto r_bad = scan_stream(bad_in, "broken.log");
    std::cout << "bad ok=" << r_bad.ok()
              << " exit=" << to_exit_code(r_bad.error)
              << " msg=" << r_bad.message << '\n';

    // 3. 强保证聚合：file1 含空白行与未知首词成功提交；file2 注入 badbit 失败，不影响 total
    Counts total{};
    std::string diag;

    std::istringstream file1{" INFO ready\n\nERROR: disk\nWARN retry\n"};
    const auto e1 = merge_stream_strong(total, file1, "file1.log", diag);
    std::cout << "merge file1 exit=" << to_exit_code(e1) << '\n';
    print_counts("total after file1", total);

    std::istringstream file2{"INFO never-added\n"};
    file2.setstate(std::ios::badbit);
    const auto e2 = merge_stream_strong(total, file2, "file2.log", diag);
    std::cout << "merge file2 exit=" << to_exit_code(e2) << " diag=" << diag << '\n';
    print_counts("total after file2", total);

    // 4. 打开不存在的文件：区分 open_failed
    std::ifstream missing_file{"__definitely_missing_logscan_file__.log"};
    const ErrorCode open_err = missing_file ? ErrorCode::none : ErrorCode::open_failed;
    std::cout << "missing file open_failed=" << (open_err == ErrorCode::open_failed)
              << " exit=" << to_exit_code(open_err) << '\n';

    return 0;
}
