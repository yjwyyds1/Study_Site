#include <iostream>
#include <string>

// 值传递：x 是实参的一份复印件，改 x 不会影响外面的变量
void add_one_copy(int x) {
    x = x + 1;
}

// 引用传递：x 是外面变量的别名（快捷方式），改 x 就是改原件
void add_one_ref(int& x) {
    x = x + 1;
}

// 只读引用：不复制大字符串，同时保证函数里不能修改它
void print_tag(const std::string& tag) {
    std::cout << "[" << tag << "]\n";
}

int main() {
    int count = 10;

    add_one_copy(count);
    std::cout << "值传递后 count = " << count << '\n';

    add_one_ref(count);
    std::cout << "引用传递后 count = " << count << '\n';

    std::string level = "ERROR";
    print_tag(level);

    return 0;
}
