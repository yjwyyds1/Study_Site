#include "logscan_core.hpp"

#include <istream>
#include <string>
#include <string_view>

namespace logscan {
namespace {

// 单行分类只供本文件使用，调用方只需看到 scan。
void count_line(std::string_view line, Counts& counts) {
    constexpr std::string_view whitespace = " \t\n\r\v\f";
    const auto first = line.find_first_not_of(whitespace);
    if (first == std::string_view::npos) {
        return;  // 空行或纯空白：四个计数都不动。
    }

    // 移动只读视图，不改字符串。如果找不到下一处空白，词延伸到行尾。
    line.remove_prefix(first);
    const auto token = line.substr(0, line.find_first_of(whitespace));
    // 只认完整首词，ERROR: 的冒号不会被分词去掉。
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

}  // namespace

Counts scan(std::istream& input) {
    Counts counts{};
    std::string line;
    while (std::getline(input, line)) {
        count_line(line, counts);  // 本轮使用视图，下一轮可覆盖 line。
    }
    return counts;
}

}  // namespace logscan
