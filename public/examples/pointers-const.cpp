#include <iostream>

// 只读可选借用：target 可以是 nullptr；非空时只允许读取，不允许通过它写入。
void print_optional_probe(const int* target) {
    if (target == nullptr) {
        std::cout << "missing\n";
        return;
    }
    std::cout << *target << '\n';
}

// 可写可选借用：非空才修改原对象；传入 nullptr 时安全跳过。
void bump_if_present(int* target, int delta) {
    if (target != nullptr) {
        *target += delta;
    }
}

int main() {
    // 1. 只读探针：传入存活对象地址 &probe 与空指针 nullptr
    int probe = 7;
    print_optional_probe(&probe);
    print_optional_probe(nullptr);

    // 2. 指针可重新指向，引用绑定后无法换绑（赋值只会改原对象）
    int a = 10;
    int b = 20;

    int* p = &a;     // p 指向 a
    p = &b;          // p 改指 b，a 不受影响
    *p = 25;         // 通过 p 修改 b

    int& ref = a;    // ref 终身绑定到 a
    ref = b;         // 注意：不是换绑到 b，而是把 b 的值(25)写进 a
    b = 30;          // 改 b 不会影响 ref（它仍绑定在 a 上）

    std::cout << "after rebind vs ref-assign: a=" << a
              << ", b=" << b << ", ref=" << ref << '\n';

    // 3. 三层 const 对照（从右往左读）
    const int* ro_ptr = &a;          // 指向常量的指针：不能改 *ro_ptr，可以换指向
    ro_ptr = &b;                     // 合法：改指向 b
    // *ro_ptr = 99;                 // 反例：编译错误（assignment of read-only location）

    int* const fixed_ptr = &a;       // 常量指针：不能换指向，可以改 *fixed_ptr
    *fixed_ptr = 42;                 // 合法：通过 fixed_ptr 把 a 改成 42
    // fixed_ptr = &b;               // 反例：编译错误（assignment of read-only variable）

    const int* const locked_ptr = &b; // 指向常量的常量指针：既不能改值，也不能换指向

    std::cout << "const demo: *ro_ptr=" << *ro_ptr
              << ", *fixed_ptr=" << *fixed_ptr
              << ", *locked_ptr=" << *locked_ptr << '\n';

    // 4. 可写可选借用演示
    bump_if_present(&a, 8);
    bump_if_present(nullptr, 8);
    std::cout << "after bump: a=" << a << '\n';

    return 0;
}
