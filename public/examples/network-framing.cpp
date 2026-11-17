#include <cstdint>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

// 把一条消息打包成：[4字节大端长度] + [消息体]
std::vector<std::uint8_t> encode_frame(std::string_view msg) {
    std::uint32_t len = static_cast<std::uint32_t>(msg.size());
    std::vector<std::uint8_t> out;
    out.reserve(4 + msg.size());
    out.push_back(static_cast<std::uint8_t>((len >> 24) & 0xFF));
    out.push_back(static_cast<std::uint8_t>((len >> 16) & 0xFF));
    out.push_back(static_cast<std::uint8_t>((len >> 8) & 0xFF));
    out.push_back(static_cast<std::uint8_t>(len & 0xFF));
    out.insert(out.end(), msg.begin(), msg.end());
    return out;
}

// 从接收缓冲区尝试拆出一条完整消息；数据不够半包时返回 std::nullopt
std::optional<std::string> try_decode_frame(std::vector<std::uint8_t>& buffer) {
    if (buffer.size() < 4) {
        return std::nullopt; // 连长度头都还没收齐
    }
    std::uint32_t len = (static_cast<std::uint32_t>(buffer[0]) << 24) |
                        (static_cast<std::uint32_t>(buffer[1]) << 16) |
                        (static_cast<std::uint32_t>(buffer[2]) << 8) |
                        static_cast<std::uint32_t>(buffer[3]);
    if (buffer.size() < 4 + len) {
        return std::nullopt; // 消息体还没收齐（半包）
    }
    std::string msg(buffer.begin() + 4, buffer.begin() + 4 + len);
    buffer.erase(buffer.begin(), buffer.begin() + 4 + len);
    return msg;
}

int main() {
    // 模拟两条消息被连在一起发过来（粘包）
    auto f1 = encode_frame("INFO ready");
    auto f2 = encode_frame("ERROR timeout");

    std::vector<std::uint8_t> wire = f1;
    wire.insert(wire.end(), f2.begin(), f2.end());

    // 模拟第一次只收到前 7 个字节（半包），第二次收到剩下的所有字节
    std::vector<std::uint8_t> recv_buf(wire.begin(), wire.begin() + 7);
    std::cout << "第 1 次 recv 后能拆出吗？ " << (try_decode_frame(recv_buf).has_value() ? "能" : "不能（半包等待）") << '\n';

    recv_buf.insert(recv_buf.end(), wire.begin() + 7, wire.end());
    while (auto msg = try_decode_frame(recv_buf)) {
        std::cout << "拆出完整消息: " << *msg << '\n';
    }
    return 0;
}
