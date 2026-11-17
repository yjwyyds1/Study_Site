#include <iostream>
#include <string>
#include <vector>

int main() {
    // 1. std::vector<std::string> 用来按顺序保存多条字符串
    std::vector<std::string> logs;

    // 2. 往末尾追加元素
    logs.push_back("INFO start");
    logs.push_back("WARN disk");
    logs.push_back("ERROR timeout");

    std::cout << "共有 " << logs.size() << " 条日志：\n";

    // 3. 范围 for 循环：依次取出每一条（用 const & 避免复制）
    int error_count = 0;
    for (const std::string& line : logs) {
        std::cout << "- " << line << '\n';
        if (line.starts_with("ERROR")) {
            ++error_count;
        }
    }

    std::cout << "其中 ERROR 有 " << error_count << " 条\n";
    return 0;
}
