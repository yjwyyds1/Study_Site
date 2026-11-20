#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <string_view>

// 零堆分配、固定容量的环形缓冲区（适配嵌入式与定长字节流采集）
template <typename T, std::size_t Capacity>
class RingBuffer {
    static_assert(Capacity > 0, "RingBuffer capacity must be > 0");

public:
    constexpr bool push(const T& value) noexcept {
        if (count_ == Capacity) {
            ++dropped_;
            return false; // 明确拒绝新字节并计入溢出丢弃数
        }
        buf_[tail_] = value;
        tail_ = (tail_ + 1) % Capacity;
        ++count_;
        if (count_ > high_watermark_) {
            high_watermark_ = count_;
        }
        return true;
    }

    constexpr bool pop(T& out) noexcept {
        if (count_ == 0) {
            return false;
        }
        out = buf_[head_];
        head_ = (head_ + 1) % Capacity;
        --count_;
        return true;
    }

    // 只读偷看偏移 offset 处的字节（0 表示当前队头），不移动读指针
    constexpr bool peek(std::size_t offset, T& out) const noexcept {
        if (offset >= count_) {
            return false;
        }
        out = buf_[(head_ + offset) % Capacity];
        return true;
    }

    constexpr void discard(std::size_t n) noexcept {
        const std::size_t drop_n = (n < count_) ? n : count_;
        head_ = (head_ + drop_n) % Capacity;
        count_ -= drop_n;
    }

    constexpr std::size_t size() const noexcept { return count_; }
    constexpr std::size_t capacity() const noexcept { return Capacity; }
    constexpr bool empty() const noexcept { return count_ == 0; }
    constexpr bool full() const noexcept { return count_ == Capacity; }
    constexpr std::size_t dropped() const noexcept { return dropped_; }
    constexpr std::size_t high_watermark() const noexcept { return high_watermark_; }

private:
    std::array<T, Capacity> buf_{};
    std::size_t head_ = 0;
    std::size_t tail_ = 0;
    std::size_t count_ = 0;
    std::size_t dropped_ = 0;
    std::size_t high_watermark_ = 0;
};

// 帧格式：[2B Magic: 0xAA 0x55] [2B Big-Endian Len] [Payload (<= kMaxPayload)]
class FrameReplayDecoder {
public:
    static constexpr std::uint8_t kMagic0 = 0xAA;
    static constexpr std::uint8_t kMagic1 = 0x55;
    static constexpr std::size_t kHeaderBytes = 4;
    static constexpr std::size_t kMaxPayload = 32;

    enum class Status { NeedMore, Decoded, Resynced, RejectedTooLong };

    struct FrameView {
        std::array<std::uint8_t, kMaxPayload> data{};
        std::size_t length = 0;

        std::string_view as_text() const noexcept {
            return std::string_view(reinterpret_cast<const char*>(data.data()), length);
        }
    };

    template <std::size_t N>
    Status step(RingBuffer<std::uint8_t, N>& rb, FrameView& out) noexcept {
        if (rb.size() < 2) {
            return Status::NeedMore;
        }
        std::uint8_t b0 = 0;
        std::uint8_t b1 = 0;
        rb.peek(0, b0);
        rb.peek(1, b1);

        // 1. 魔数不匹配：丢弃 1 字节重新同步（不整包清空，避免吞掉紧随其后的有效帧）
        if (b0 != kMagic0 || b1 != kMagic1) {
            rb.discard(1);
            ++resync_bytes_;
            return Status::Resynced;
        }

        if (rb.size() < kHeaderBytes) {
            return Status::NeedMore; // 头部 4 字节未收齐
        }

        // 2. 大端无符号 16 位长度解析
        std::uint8_t len_hi = 0;
        std::uint8_t len_lo = 0;
        rb.peek(2, len_hi);
        rb.peek(3, len_lo);
        const std::size_t payload_len =
            (static_cast<std::size_t>(len_hi) << 8) | static_cast<std::size_t>(len_lo);

        // 3. 长度越界保护：拒绝超长帧，弹出首字节后继续寻找下一个有效魔数
        if (payload_len == 0 || payload_len > kMaxPayload) {
            rb.discard(1);
            ++rejected_frames_;
            return Status::RejectedTooLong;
        }

        if (rb.size() < kHeaderBytes + payload_len) {
            return Status::NeedMore; // 半帧等待后续字节到达
        }

        // 4. 完整帧已就绪：出队头部与载荷
        rb.discard(kHeaderBytes);
        for (std::size_t i = 0; i < payload_len; ++i) {
            std::uint8_t byte = 0;
            rb.pop(byte);
            out.data[i] = byte;
        }
        out.length = payload_len;
        ++decoded_frames_;
        return Status::Decoded;
    }

    std::size_t decoded_frames() const noexcept { return decoded_frames_; }
    std::size_t resync_bytes() const noexcept { return resync_bytes_; }
    std::size_t rejected_frames() const noexcept { return rejected_frames_; }

private:
    std::size_t decoded_frames_ = 0;
    std::size_t resync_bytes_ = 0;
    std::size_t rejected_frames_ = 0;
};

constexpr std::array<std::uint8_t, 14> make_sample_frame_info() {
    // Magic(AA 55) + Len(00 0A = 10) + "INFO ready"
    return {0xAA, 0x55, 0x00, 0x0A, 'I', 'N', 'F', 'O', ' ', 'r', 'e', 'a', 'd', 'y'};
}

constexpr std::array<std::uint8_t, 12> make_sample_frame_err() {
    // Magic(AA 55) + Len(00 08 = 8) + "ERR disk"
    return {0xAA, 0x55, 0x00, 0x08, 'E', 'R', 'R', ' ', 'd', 'i', 's', 'k'};
}

int main() {
    // 测试 1：4 字节容量写 6 字节，核对保留前 4 字节与溢出计数 2
    RingBuffer<std::uint8_t, 4> tiny;
    for (std::uint8_t v = 1; v <= 6; ++v) {
        tiny.push(v);
    }
    assert(tiny.full() && tiny.size() == 4);
    assert(tiny.dropped() == 2);
    for (std::uint8_t expected = 1; expected <= 4; ++expected) {
        std::uint8_t got = 0;
        assert(tiny.pop(got) && got == expected);
    }
    std::cout << "[Test 1] 4B overflow drop=2 verified\n";

    // 测试 2：64 字节环形缓冲的分段回放（含噪声同步、超长帧拒绝、回绕半包）
    RingBuffer<std::uint8_t, 64> rx;
    FrameReplayDecoder decoder;

    const auto f1 = make_sample_frame_info();
    const auto f2 = make_sample_frame_err();
    // 合成流：2B 噪声(0xFF, 0x10) + 1 个超长坏帧头(len=0x0040=64 > 32) + f1 + f2
    const std::array<std::uint8_t, 32> wire = {
        0xFF, 0x10,                         // 噪声字节 -> 触发 2 次 Resynced
        0xAA, 0x55, 0x00, 0x40,             // 超长帧头(64B > 32B) -> RejectedTooLong + 3 次 Resynced
        f1[0], f1[1], f1[2], f1[3], f1[4], f1[5], f1[6], f1[7], f1[8], f1[9], f1[10], f1[11], f1[12], f1[13],
        f2[0], f2[1], f2[2], f2[3], f2[4], f2[5], f2[6], f2[7], f2[8], f2[9], f2[10], f2[11]
    };

    // 按每批 5 字节分段喂入，模拟串口/ISR 多次突发与半帧到达
    std::size_t idx = 0;
    while (idx < wire.size()) {
        for (int k = 0; k < 5 && idx < wire.size(); ++k) {
            const bool ok = rx.push(wire[idx++]);
            assert(ok);
        }
        FrameReplayDecoder::FrameView view{};
        while (true) {
            const auto st = decoder.step(rx, view);
            if (st == FrameReplayDecoder::Status::Decoded) {
                std::cout << "  Decoded (" << view.length << "B): " << view.as_text() << '\n';
            } else if (st == FrameReplayDecoder::Status::NeedMore) {
                break;
            }
        }
    }

    assert(rx.empty());
    assert(rx.dropped() == 0);
    assert(decoder.decoded_frames() == 2);
    assert(decoder.rejected_frames() == 1);
    assert(decoder.resync_bytes() == 5); // 2B 噪声 + 超长坏帧头剩余 3B (0x55, 0x00, 0x40)
    std::cout << "[Test 2] Replay ok: decoded=" << decoder.decoded_frames()
              << " rejected=" << decoder.rejected_frames()
              << " resync=" << decoder.resync_bytes()
              << " high_watermark=" << rx.high_watermark() << "/64\n";
    return 0;
}
