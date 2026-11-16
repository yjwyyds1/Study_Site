#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>

struct Counts {
    std::uint64_t info{};
    std::uint64_t warn{};
    std::uint64_t error{};
    std::uint64_t unknown{};
};

void count_line(std::string_view line, Counts& counts) {
    constexpr std::string_view whitespace = " \t\n\r\v\f";
    const auto first = line.find_first_not_of(whitespace);
    if (first == std::string_view::npos) {
        return;  // 空行和纯空白行不计入任何一类。
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
        // 借用只持续到本次调用结束，下一次 getline 可以安全地改写 line。
        count_line(line, counts);
    }
    return counts;
}

void print_summary(std::ostream& output, const Counts& counts) {
    output << "INFO " << counts.info << '\n'
           << "WARN " << counts.warn << '\n'
           << "ERROR " << counts.error << '\n'
           << "UNKNOWN " << counts.unknown << '\n';
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "Usage: logscan <file>\n";
        return 2;
    }

    const std::string path = argv[1];
    // 保留文件中的 CR 字节，由上面的 ASCII 空白规则统一处理。
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        std::cerr << "logscan: cannot open '" << path << "'\n";
        return 1;
    }

    const Counts counts = scan(input);
    if (input.bad() || !input.eof()) {
        std::cerr << "logscan: cannot read '" << path << "'\n";
        return 1;
    }

    print_summary(std::cout, counts);
    return 0;
}
