#include <iostream>
#include <string_view>

int main() {
    // line 是读取字符的窗口，不复制字符。这里的字面量在整个运行期间存在。
    const std::string_view line = "INFO ready";
    // 从第 0 个字符开始比较 I、N、F、O 和一个空格。只存比较结果，不修改 line。
    const bool is_info = line.starts_with("INFO ");
    // boolalpha 让布尔值用 true/false 显示。后面的 << 依次传入标题、结果、换行。
    std::cout << std::boolalpha << "starts with INFO: " << is_info << '\n';
}
