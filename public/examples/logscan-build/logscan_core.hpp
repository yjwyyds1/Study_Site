#pragma once

#include <cstdint>
#include <iosfwd>

namespace logscan {

struct Counts {
    std::uint64_t info{};
    std::uint64_t warn{};
    std::uint64_t error{};
    std::uint64_t unknown{};

    // C++20 可生成成员逐一比较；单元测试用它核对四个计数。
    bool operator==(const Counts&) const = default;
};

// 借用输入流推进读取位置，按值交回数字；是否正常读完由调用方检查。
Counts scan(std::istream& input);

}  // namespace logscan
