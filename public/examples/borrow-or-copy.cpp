#include <iostream>     // std::cout：把观察结果写到终端。
#include <string>       // std::string 对象拥有自己的字符。
#include <string_view>  // std::string_view 只描述一段现有字符。

int main() {
    std::string line = "ERROR:";
    const std::string_view token = line; // 在本轮读取 line 中的字符。
    const std::string saved{token};      // 按视图所指的范围复制字符，交给新对象保存。
    std::cout << "current token: " << token << '\n';

    line = "INFO ready"; // 模拟下一次读取覆盖 line。这里以后不再通过 token 读取。
    std::cout << "next line: " << line << '\n';
    std::cout << "saved token: " << saved << '\n'; // saved 拥有独立的内容。
}
