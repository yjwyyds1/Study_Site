#include <fstream>
#include <iostream>
#include <string>

// 用 struct 把相关的几个计数打包成一个整体
struct Summary {
    int total = 0;
    int error = 0;
};

int main() {
    // 1. 打开当前目录下的 sample.log
    std::ifstream file("sample.log");
    if (!file) {
        std::cerr << "打不开 sample.log，请确认文件在当前目录。\n";
        return 1;
    }

    Summary s;
    std::string line;

    // 2. 每次从文件读一整行，直到文件末尾
    while (std::getline(file, line)) {
        ++s.total;
        if (line.starts_with("ERROR")) {
            ++s.error;
        }
    }

    std::cout << "总行数：" << s.total << '\n';
    std::cout << "ERROR 行数：" << s.error << '\n';
    return 0;
}
