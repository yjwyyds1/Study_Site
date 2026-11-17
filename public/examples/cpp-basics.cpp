#include <iostream>
#include <string>

int main() {
    // 1. 定义变量：给不同类型的数据起名字
    int log_count = 3;                 // 整数
    double avg_ms = 12.5;              // 小数
    bool has_error = false;            // 布尔值：只有 true 或 false
    std::string service = "LogScan";   // 字符串：一串文字

    // 2. 修改变量：用 = 把新值放进已有变量
    log_count = log_count + 1;
    has_error = true;

    // 3. 打印到屏幕
    std::cout << "service: " << service << '\n';
    std::cout << "count: " << log_count << '\n';
    std::cout << "avg_ms: " << avg_ms << '\n';
    std::cout << "has_error: " << has_error << '\n';

    return 0;
}
