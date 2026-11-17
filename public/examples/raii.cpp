#include <exception>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>

// input 借用调用者的流；函数返回或抛异常时，不负责销毁调用者的流。
void print_preview(std::istream& input) {
    auto draft = std::make_unique<std::string>();
    if (!std::getline(input, *draft)) { // *draft 是字符串本身，getline 把首行写进去。
        if (input.bad() || !input.eof()) {
            throw std::runtime_error("read failed");
        }
        std::cout << "empty input\n"; // 没有读到任何行；读到空白首行不会进这里。
        return;                      // draft 仍是所有者，由它清理字符串。
    }

    auto preview = std::move(draft); // preview 接管原字符串；draft 仍活着，但已经空了。
    std::cout << std::boolalpha << "draft empty: " << !draft << '\n'
              << "first line: " << *preview << '\n';
}

int main(int argc, char* argv[]) {
    try {
        if (argc == 1) {
            std::istringstream sample{"INFO ready\nWARN retry\n"};
            print_preview(sample);
        } else if (argc == 2) {
            std::ifstream file{argv[1]}; // 打开后由 file 管理；它的析构会触发关闭。
            if (!file) {
                std::cerr << "cannot open: " << argv[1] << '\n';
                return 1;
            }
            print_preview(file);
        } else {
            std::cerr << "usage: raii [file]\n";
            return 2;
        }
    } catch (const std::exception& error) { // 异常到达这里前，已退出的作用域先清理。
        std::cerr << error.what() << '\n';
        return 1;
    }
}
