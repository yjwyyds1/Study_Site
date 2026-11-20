#include <array>
#include <bit>
#include <bitset>
#include <cstdint>
#include <iomanip>
#include <iostream>

int main() {
    // 1. 一个普通的 32 位整数（占 4 个字节 = 32 个二进制开关）
    std::uint32_t x = 0x12345678u;

    std::cout << "十进制: " << x << '\n';
    std::cout << "十六进制: 0x" << std::hex << std::uppercase << x << std::dec << '\n';
    std::cout << "32位二进制: " << std::bitset<32>(x) << '\n';

    // 2. 把 x 在内存里占据的 4 个真实字节逐一打印出来（观察小端序：低位在前）
    auto bytes = std::bit_cast<std::array<unsigned char, 4>>(x);
    std::cout << "内存里的 4 个字节 (低地址->高地址): ";
    for (unsigned char b : bytes) {
        std::cout << std::hex << std::uppercase << std::setw(2) << std::setfill('0')
                  << static_cast<int>(b) << ' ';
    }
    std::cout << std::dec << '\n';

    // 3. 无符号 8 位整数的里程表归零（255 + 1 = 0）
    std::uint8_t odometer = 255;
    std::cout << "里程表 255 加 1 后变成: "
              << static_cast<int>(static_cast<std::uint8_t>(odometer + 1)) << '\n';

    // 4. 有符号负数 -1 在内存里的补码样子（全 1 = 0xFF）
    std::int8_t neg = -1;
    std::uint8_t neg_bits = std::bit_cast<std::uint8_t>(neg);
    std::cout << "-1 的 8 位补码二进制: " << std::bitset<8>(neg_bits)
              << " (十六进制 0x" << std::hex << std::uppercase << static_cast<int>(neg_bits)
              << std::dec << ")\n";
    return 0;
}
