#include "logscan_core.hpp"

#include <iostream>
#include <sstream>

namespace {

bool check_scan(const char* name, const char* text, logscan::Counts expected) {
    // 用内存文本替代文件，直接查 scan 返回的四项计数。
    std::istringstream input{text};
    const auto actual = logscan::scan(input);
    if (actual == expected) {
        return true;
    }

    const auto print = [](logscan::Counts counts) {
        std::cerr << counts.info << '/' << counts.warn << '/'
                  << counts.error << '/' << counts.unknown;
    };
    std::cerr << name << " (INFO/WARN/ERROR/UNKNOWN): expected ";
    print(expected);
    std::cerr << ", got ";
    print(actual);
    std::cerr << '\n';
    return false;
}

}  // namespace

int main() {
    int failures = 0;
    failures += !check_scan("empty file", "", {});
    failures += !check_scan("blank lines", "\n \t\v\f\r\n", {});
    // 抓住整词误写成前缀比较的最短用例：省略的成员初始为零。
    failures += !check_scan("punctuation is part of the token", "ERROR:", {.unknown = 1});
    failures += !check_scan("exact first token and no final newline",
                            " INFO boot\n\tWARN\tretry\nDEBUG ERROR\ninfo\n[INFO]\nERROR",
                            {1, 1, 1, 3});
    failures += !check_scan("CRLF", "INFO\r\n\tWARN\r\n\r\nERROR\r\n", {1, 1, 1, 0});
    failures += !check_scan("ASCII vertical tab and form feed", "\vINFO\fmessage\n", {.info = 1});
    failures += !check_scan("BOM and non-ASCII whitespace",
                            "\xEF\xBB\xBF" "INFO\n\xC2\xA0" "WARN", {.unknown = 2});
    return failures == 0 ? 0 : 1;  // 由进程退出码把结果交给 CTest。
}
