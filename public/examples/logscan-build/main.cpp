#include "logscan_core.hpp"

#include <fstream>
#include <iostream>

int main(int argc, char* argv[]) {
    // 先确认只有一个路径参数，再读 argv[1]。
    if (argc != 2) {
        std::cerr << "Usage: logscan <file>\n";
        return 2;
    }

    const char* path = argv[1];
    // 文件由 input 管理；以二进制读入，让核心按统一规则处理 CR。
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        std::cerr << "logscan: cannot open '" << path << "'\n";
        return 1;
    }

    const auto counts = logscan::scan(input);
    // EOF 本身不是读错：只在确认正常读完后打印，失败时保留空 stdout。
    if (input.bad() || !input.eof()) {
        std::cerr << "logscan: cannot read '" << path << "'\n";
        return 1;
    }

    std::cout << "INFO " << counts.info << '\n'
              << "WARN " << counts.warn << '\n'
              << "ERROR " << counts.error << '\n'
              << "UNKNOWN " << counts.unknown << '\n';
    return 0;
}
