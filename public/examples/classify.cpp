#include <cstddef>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>

// 借用当前行，只做分类；返回的视图指向固定标签，不引用 line 的内容。
std::string_view classify_line(const std::string& line) {
    if (line.empty()) {
        return "EMPTY";
    }
    if (line.starts_with("INFO ")) {
        return "INFO";
    }
    if (line.starts_with("WARN ")) {
        return "WARN";
    }
    if (line.starts_with("ERROR ")) { // 前缀包含普通空格，单独的 ERROR 归入 OTHER。
        return "ERROR";
    }
    return "OTHER";
}

// 借用调用者的输入流；从键盘、管道还是文件读取，由 main 决定。
int classify_stream(std::istream& input) {
    std::string line;
    std::size_t lines = 0;
    while (std::getline(input, line)) { // 读到空行也进循环；读不出下一行才停。
        const std::string_view label = classify_line(line);
        std::cout << label << '\n';
        ++lines;
    }
    if (input.bad() || !input.eof()) { // 正常读完才给总数，已输出的标签不会撤回。
        std::cerr << "cannot read input\n";
        return 1;
    }
    std::cout << "lines: " << lines << '\n';
    return 0;
}

int main(int argc, char* argv[]) {
    // argc 包含程序名；只有一个额外参数时才把 argv[1] 当路径。
    if (argc == 1) {
        return classify_stream(std::cin);
    }
    if (argc != 2) {
        std::cerr << "usage: classify [file]\n";
        return 2;
    }
    std::ifstream input{argv[1]}; // main 持有打开的文件，退出作用域时由流负责关闭。
    if (!input) {
        std::cerr << "cannot open: " << argv[1] << '\n';
        return 1;
    }
    return classify_stream(input);
}
