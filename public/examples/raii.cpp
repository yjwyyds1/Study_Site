#include <exception>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>

void print_preview(std::istream& input) {
    auto draft = std::make_unique<std::string>();
    if (!std::getline(input, *draft)) {
        if (input.bad() || !input.eof()) {
            throw std::runtime_error("read failed");
        }
        std::cout << "empty input\n";
        return;
    }

    auto preview = std::move(draft);
    std::cout << std::boolalpha << "draft empty: " << !draft << '\n'
              << "first line: " << *preview << '\n';
}

int main(int argc, char* argv[]) {
    try {
        if (argc == 1) {
            std::istringstream sample{"INFO ready\nWARN retry\n"};
            print_preview(sample);
        } else if (argc == 2) {
            std::ifstream file{argv[1]};
            if (!file) {
                std::cerr << "cannot open: " << argv[1] << '\n';
                return 1;
            }
            print_preview(file);
        } else {
            std::cerr << "usage: raii [file]\n";
            return 2;
        }
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
