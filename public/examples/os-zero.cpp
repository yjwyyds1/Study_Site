#include <filesystem>
#include <iostream>

int main() {
    // 1. 变量在你的程序里拿到的不是“真实内存条插槽号”，而是操作系统给的“虚拟地址”
    int kitchen_pot = 42;
    int plate_count = 3;
    std::cout << "变量 kitchen_pot 的虚拟地址: " << &kitchen_pot << '\n';
    std::cout << "变量 plate_count 的虚拟地址: " << &plate_count << '\n';

    // 2. 程序不能直接伸手摸硬盘，必须请操作系统大管家帮忙查询目录与文件
    auto cwd = std::filesystem::current_path();
    std::cout << "当前工作目录: " << cwd.string() << '\n';
    std::cout << "当前目录下有 missing.log 吗？ "
              << (std::filesystem::exists("missing.log") ? "有" : "没有") << '\n';
    return 0;
}
