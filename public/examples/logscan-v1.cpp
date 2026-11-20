#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>

struct Counts {
    // 四个级别计数默认从 0 开始，用于跨文件累加。
    std::uint64_t info{};
    std::uint64_t warn{};
    std::uint64_t error{};
    std::uint64_t unknown{};

    Counts& operator+=(const Counts& other) {
        info += other.info;
        warn += other.warn;
        error += other.error;
        unknown += other.unknown;
        return *this;
    }
};

void count_line(std::string_view line, Counts& counts) {
    // 与 v0 一致：只认 ASCII 空白集合，保留 \r 在这里剥除，兼容 CRLF 与 LF。
    constexpr std::string_view whitespace = " \t\n\r\v\f";
    const auto first = line.find_first_not_of(whitespace);
    if (first == std::string_view::npos) {
        return;  // 空行和纯空白行跳过。
    }

    line.remove_prefix(first);
    const auto token = line.substr(0, line.find_first_of(whitespace));
    if (token == "INFO") {
        ++counts.info;
    } else if (token == "WARN") {
        ++counts.warn;
    } else if (token == "ERROR") {
        ++counts.error;
    } else {
        ++counts.unknown;
    }
}

Counts scan(std::istream& input) {
    Counts counts{};
    std::string line;
    while (std::getline(input, line)) {
        count_line(line, counts);
    }
    return counts;
}

bool scan_stream_strict(std::istream& input, Counts& total) {
    const Counts partial = scan(input);
    // 正常读到 EOF 可能同时置 failbit；只有 badbit 或未到 EOF 才算读取失败。
    if (input.bad() || !input.eof()) {
        return false;
    }
    total += partial;
    return true;
}

void print_summary(std::ostream& output, const Counts& counts) {
    // 确定顺序输出：不论输入文件路径如何排列，输出永远是固定四行。
    output << "INFO " << counts.info << '\n'
           << "WARN " << counts.warn << '\n'
           << "ERROR " << counts.error << '\n'
           << "UNKNOWN " << counts.unknown << '\n';
}

int main(int argc, char* argv[]) {
    // v1 支持一个或多个文件路径；仅在 0 参数时打印用法并退出 2。
    if (argc < 2) {
        std::cerr << "Usage: logscan <file> [file ...]\n";
        return 2;
    }

    Counts total{};
    for (int i = 1; i < argc; ++i) {
        const std::string path = argv[i];
        std::ifstream input(path, std::ios::binary);
        if (!input) {
            // 整批失败：不输出已累计的部分结果，stdout 保持为空。
            std::cerr << "logscan: cannot open '" << path << "'\n";
            return 1;
        }

        if (!scan_stream_strict(input, total)) {
            std::cerr << "logscan: cannot read '" << path << "'\n";
            return 1;
        }
    }

    // 只有全部文件都干净读完后，才一次性写出汇总报告。
    print_summary(std::cout, total);
    return 0;
}
