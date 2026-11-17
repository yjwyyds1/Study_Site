#include <iostream> // std::cout：向终端输出。

int main() {
    int line = 10;                 // [A] 初始化第一份 int。
    int copied = line;             // [B] 读取 10，初始化另一份 int。
    {
        int& alias = line;         // [C] 绑定到 line 对应的对象。
        alias = 11;                // 给 line 对应的对象赋值，引用不改绑。
        copied = 20;               // 只修改独立的副本。
        std::cout << "inside: " << line << ' ' << alias
                  << ' ' << copied << '\n';
    }                              // [D] alias 离开作用域，line 仍活着。
    std::cout << "outside: " << line << ' ' << copied << '\n';
}                                  // [E] copied 和 line 随外层块退出而销毁。
