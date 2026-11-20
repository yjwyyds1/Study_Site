#include <cassert>
#include <iostream>
#include <string_view>

// 匿名命名空间：内部链接（Internal Linkage），仅当前翻译单元 (.cpp) 可见
// 等价于现代 C++ 中更推荐的“文件内私有函数/常量”，替代旧式 C 风格 static
namespace {

constexpr int kDefaultLimit = 100;

int clamp_non_negative(int value) {
    return value < 0 ? 0 : value;
}

}  // namespace

// 命名空间 logscan：组织工程公共 API，避免污染全局符号表
namespace logscan {

// 1. 前置声明 (Forward Declaration)：
//    编译器此时只需知道 Counts 是个结构体，就能声明接收 const Counts& 的函数
struct Counts;

// 2. 普通函数声明 (通常放 .hpp 中，真正实现放在唯一一个 .cpp 中)
void print_summary(const Counts& c, int limit);

// 3. inline 函数 (允许随头文件被多个 .cpp 包含而不违反 ODR)
//    链接器会把多个翻译单元里相同的 inline 定义合并为一份
inline int effective_limit(int requested) {
    return requested > 0 ? requested : kDefaultLimit;
}

// 4. 完整结构体定义 (需要访问成员变量或按值创建对象时必须可见)
struct Counts {
    int info = 0;
    int warn = 0;
    int error = 0;

    int total() const {
        return info + warn + error;
    }
};

// 普通函数的唯一定义 (若误写进 .hpp 并被两个 .cpp 包含，链接报 multiple definition)
void print_summary(const Counts& c, int limit) {
    const int safe_limit = effective_limit(clamp_non_negative(limit));
    std::cout << "[logscan] info=" << c.info
              << " warn=" << c.warn
              << " error=" << c.error
              << " total=" << c.total()
              << " limit=" << safe_limit << '\n';
}

// constexpr 变量隐含内联/内部链接属性，放在头文件里也可安全跨翻译单元共享
inline constexpr std::string_view kApiVersion = "v1.0";

}  // namespace logscan

int main() {
    logscan::Counts counts{12, 3, 1};
    assert(counts.total() == 16);
    assert(logscan::effective_limit(0) == 100);
    assert(logscan::effective_limit(25) == 25);

    std::cout << "api=" << logscan::kApiVersion << '\n';
    logscan::print_summary(counts, 25);
    logscan::print_summary(counts, -5);
    return 0;
}
