#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>

struct Counts {
    // 花括号让四个计数从 0 开始；跳过空行时它们都不变。
    std::uint64_t info{};
    std::uint64_t warn{};
    std::uint64_t error{};
    std::uint64_t unknown{};
};

void count_line(std::string_view line, Counts& counts) {
    // 分类使用固定的 ASCII 空白集合，冒号和方括号都不是分隔符。
    constexpr std::string_view whitespace = " \t\n\r\v\f";
    const auto first = line.find_first_not_of(whitespace);
    if (first == std::string_view::npos) {
        return;  // 空行和纯空白行不计入任何一类。
    }

    // 只移动视图，不改写 scan 持有的字符串。找不到下一个空白就取到行尾。
    line.remove_prefix(first);
    const auto token = line.substr(0, line.find_first_of(whitespace));
    // 比较整个首词："  ERROR" 能计为 ERROR，"ERROR:" 只能计为 UNKNOWN。
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
    // getline 取走 LF；空行也会进入循环，让 count_line 决定是否计数。
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
    // argc 包含程序名。确认只有一个路径参数后，再读 argv[1]。
    if (argc != 2) {
        std::cerr << "Usage: logscan <file>\n";
        return 2;
    }

    const std::string path = argv[1];
    // input 持有打开的文件，离开 main 自动关闭；保留 CR 交给空白规则。
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        std::cerr << "logscan: cannot open '" << path << "'\n";
        return 1;
    }

    const Counts counts = scan(input);
    // 正常 EOF 也可能设置 failbit。读失败时不交出已累计的摘要。
    if (input.bad() || !input.eof()) {
        std::cerr << "logscan: cannot read '" << path << "'\n";
        return 1;
    }

    print_summary(std::cout, counts);  // 确认读完后，才在 stdout 写固定四行。
    return 0;
}
