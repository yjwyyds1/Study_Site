#include <iostream>
#include <string_view>

int main() {
    const std::string_view line = "INFO ready";
    const bool is_info = line.starts_with("INFO ");
    std::cout << std::boolalpha << "starts with INFO: " << is_info << '\n';
}
