#include <bit>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <limits>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <type_traits>
#include <vector>

// MACH-01: 检查有符号加法是否溢出，避免触发未定义行为（UB）。
bool checked_add_i32(std::int32_t& acc, std::int32_t delta) {
    if (delta > 0 && acc > std::numeric_limits<std::int32_t>::max() - delta) {
        return false;
    }
    if (delta < 0 && acc < std::numeric_limits<std::int32_t>::min() - delta) {
        return false;
    }
    acc += delta;
    return true;
}

// MACH-03: 低 2 位为级别字段（合法范围 0..3），更新时保留高 6 位。
constexpr std::uint8_t kLevelMask = 0x03u;

bool update_level(std::uint8_t& status, unsigned level) {
    if (level >= 4u) {
        return false; // 拒绝非法级别，避免静默截断或污染保留位
    }
    status = static_cast<std::uint8_t>((status & ~kLevelMask) | (level & kLevelMask));
    return true;
}

// MACH-04: 显式 4 字节大端长度前缀编码与解帧（不依赖宿主字节序）。
std::vector<std::uint8_t> encode_prefixed_frame(std::string_view payload) {
    const std::uint32_t len = static_cast<std::uint32_t>(payload.size());
    std::vector<std::uint8_t> out;
    out.reserve(4 + payload.size());
    out.push_back(static_cast<std::uint8_t>((len >> 24) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((len >> 16) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((len >> 8) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>(len & 0xFFu));
    out.insert(out.end(), payload.begin(), payload.end());
    return out;
}

std::optional<std::string> try_decode_prefixed_frame(std::span<const std::uint8_t> bytes) {
    if (bytes.size() < 4) {
        return std::nullopt; // 长度头未收齐（例如只有 3 字节），等待更多数据
    }
    const std::uint32_t len =
        (static_cast<std::uint32_t>(bytes[0]) << 24) |
        (static_cast<std::uint32_t>(bytes[1]) << 16) |
        (static_cast<std::uint32_t>(bytes[2]) << 8) |
        static_cast<std::uint32_t>(bytes[3]);
    if (bytes.size() - 4 < len) {
        return std::nullopt; // 用减法防 len + 4 溢出，载荷未收齐则继续等待
    }
    return std::string(reinterpret_cast<const char*>(bytes.data() + 4), len);
}

// MACH-05: 对比成员排列顺序对结构体大小与对齐填充的影响。
struct Unpacked {
    std::uint8_t a;
    std::uint32_t b;
    std::uint8_t c;
};

struct PackedOrder {
    std::uint32_t b;
    std::uint8_t a;
    std::uint8_t c;
};

static_assert(std::is_standard_layout_v<Unpacked>);
static_assert(std::is_standard_layout_v<PackedOrder>);

// MACH-06: 无填充 6 字节逻辑记录，用 memcpy 安全从任意字节偏移解码（绝不强转指针）。
struct WireRecord {
    std::uint32_t seq;
    std::uint8_t level;
    std::uint8_t flags;
};

constexpr std::size_t kWireRecordBytes = 6;

std::optional<WireRecord> decode_record_unaligned(std::span<const std::uint8_t> buf,
                                                  std::size_t offset) {
    if (offset > buf.size() || buf.size() - offset < kWireRecordBytes) {
        return std::nullopt; // 少一字节也必须拒绝，防止越界读
    }
    WireRecord rec{};
    // 从非对齐偏移（例如 offset == 1）逐字节拷贝到对齐对象，规避未对齐访问与严格别名 UB。
    std::memcpy(&rec.seq, buf.data() + offset, sizeof(rec.seq));
    rec.level = buf[offset + 4];
    rec.flags = buf[offset + 5];
    return rec;
}

void print_hex_bytes(std::span<const std::byte> bytes) {
    for (std::size_t i = 0; i < bytes.size(); ++i) {
        if (i > 0) {
            std::cout << ' ';
        }
        std::cout << std::hex << std::uppercase << std::setw(2) << std::setfill('0')
                  << std::to_integer<unsigned>(bytes[i]);
    }
    std::cout << std::dec << std::setfill(' ');
}

int main() {
    // 1. 整数表示与溢出边界（MACH-01）
    std::uint32_t u32 = std::numeric_limits<std::uint32_t>::max();
    std::uint32_t u32_next = u32 + 1u; // 标准保证按 2^32 取模回绕
    std::int32_t i32 = std::numeric_limits<std::int32_t>::max();
    const bool ok_i32 = checked_add_i32(i32, 1);
    std::cout << "[MACH-01] uint32 max + 1 = " << u32_next
              << ", checked int32 max + 1 ok=" << std::boolalpha << ok_i32
              << ", i32=" << i32 << '\n';

    // 2. IEEE-754 binary64 精度吸收与消去（MACH-02）
    const double big = 1e16;
    const double order_a = (big + 1.0) - big;
    const double order_b = (big - big) + 1.0;
    std::cout << "[MACH-02] (1e16 + 1.0) - 1e16 = " << order_a
              << ", (1e16 - 1e16) + 1.0 = " << order_b << '\n';

    // 3. 位域掩码更新与非法值拦截（MACH-03）
    std::uint8_t status = 0xA8u; // 0b1010_1000
    const bool ok_lv3 = update_level(status, 3u);
    const std::uint8_t after_lv3 = status;
    const bool ok_lv4 = update_level(status, 4u);
    std::cout << "[MACH-03] 0xA8 -> level 3 ok=" << ok_lv3
              << " value=0x" << std::hex << std::uppercase
              << static_cast<unsigned>(after_lv3) << std::dec
              << ", level 4 ok=" << ok_lv4
              << " preserved=0x" << std::hex << std::uppercase
              << static_cast<unsigned>(status) << std::dec << '\n';

    // 4. 宿主字节序与显式大端长度前缀（MACH-04）
    const std::vector<std::uint8_t> frame = encode_prefixed_frame("INFO ready");
    std::cout << "[MACH-04] host="
              << (std::endian::native == std::endian::little ? "little-endian" : "big-endian")
              << ", header=";
    print_hex_bytes(std::as_bytes(std::span{frame}.first(4)));
    const auto partial = try_decode_prefixed_frame(std::span{frame}.first(3));
    const auto complete = try_decode_prefixed_frame(frame);
    std::cout << ", 3-byte ready=" << partial.has_value()
              << ", full payload=\"" << complete.value_or("") << "\"\n";

    // 5. 结构体对齐、成员偏移与数组步长（MACH-05）
    std::cout << "[MACH-05] Unpacked: sizeof=" << sizeof(Unpacked)
              << " alignof=" << alignof(Unpacked)
              << " offsets=(" << offsetof(Unpacked, a) << ','
              << offsetof(Unpacked, b) << ',' << offsetof(Unpacked, c) << ")\n";
    std::cout << "[MACH-05] PackedOrder: sizeof=" << sizeof(PackedOrder)
              << " alignof=" << alignof(PackedOrder)
              << " offsets=(" << offsetof(PackedOrder, b) << ','
              << offsetof(PackedOrder, a) << ',' << offsetof(PackedOrder, c) << ")\n";

    // 6. std::as_bytes 对象检视与非对齐偏移 memcpy 安全解码（MACH-06）
    const PackedOrder sample{0x11223344u, 0xAAu, 0xBBu};
    std::cout << "[MACH-06] PackedOrder raw bytes: ";
    print_hex_bytes(std::as_bytes(std::span{&sample, 1}));
    std::cout << '\n';

    const std::uint32_t expected_seq = 0x01020304u;
    std::vector<std::uint8_t> buf0(kWireRecordBytes);
    std::memcpy(buf0.data(), &expected_seq, sizeof(expected_seq));
    buf0[4] = 2u;
    buf0[5] = 0x5Au;

    // 构造偏移 1 起始的缓冲区（地址对 4 字节不对齐），验证解码结果与偏移 0 完全一致
    std::vector<std::uint8_t> buf1(1 + kWireRecordBytes);
    buf1[0] = 0xFFu;
    std::memcpy(buf1.data() + 1, buf0.data(), kWireRecordBytes);

    const auto r0 = decode_record_unaligned(buf0, 0);
    const auto r1 = decode_record_unaligned(buf1, 1);
    const auto r_short = decode_record_unaligned(std::span{buf1}.first(1 + kWireRecordBytes - 1), 1);
    std::cout << "[MACH-06] offset0 seq=0x" << std::hex << std::uppercase << r0->seq
              << " offset1 seq=0x" << r1->seq << std::dec
              << " match=" << (r0 && r1 && r0->seq == r1->seq && r0->level == r1->level && r0->flags == r1->flags)
              << " short_ok=" << r_short.has_value() << '\n';

    return 0;
}
