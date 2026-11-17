#include <iostream>
#include <string>

int main() {
    int info_count = 0;
    int error_count = 0;

    std::string level;
    std::cout << "请输入日志级别（INFO / ERROR，输入 quit 结束）：\n";

    // 只要成功读到一个词，并且不是 "quit"，就继续循环
    while (std::cin >> level) {
        if (level == "quit") {
            break; // 立刻跳出循环
        }

        if (level == "INFO") {
            ++info_count;
        } else if (level == "ERROR") {
            ++error_count;
        } else {
            std::cout << "未知级别：" << level << '\n';
        }
    }

    std::cout << "统计结果 -> INFO: " << info_count
              << ", ERROR: " << error_count << '\n';
    return 0;
}
