---
title: "虚拟内存深潜：地址空间、分页、TLB、页面置换与写时复制"
description: "基于 OSTEP 内存虚拟化模型，贯通进程地址空间分段、基址界限与分段碎片、4KB 分页与 PTE 权限位、TLB 与 ASID/PCID、四级页表、按需分页与主次缺页、OPT/FIFO(Belady异常)/LRU/Clock 页面置换、抖动工作集、brk vs mmap、shm_open 共享内存及 fork 写时复制深度追踪。"
order: 69
category: "操作系统"
tags: ["操作系统", "虚拟内存", "页表", "TLB", "缺页中断", "页面置换", "mmap", "写时复制"]
related: ["handbook/os-process-sched", "handbook/os-sync-deadlock", "handbook/os-fs-io", "handbook/linux-process-io"]
sources: ["os-process-vmem.cpp"]
---

## 本篇解决的核心问题 (OS-28 ~ OS-38)

写 C++ 程序时，你调用 `new int[100000000]` 申请几百 MB 内存，操作瞬间成功，可打开任务管理器一看物理内存占用 `RSS` 几乎没动；你把同一个可执行文件同时打开两次，两个进程打印出的全局变量地址竟然**一模一样**却互不覆盖。**操作系统和 CPU MMU 是怎么变出这套“假门牌号”魔术的？**

本篇覆盖 **`OS-28` 至 `OS-38`**，保留并扩展经典 `os-process-vmem.cpp` 与 `mmap` 写时复制实验，带你从早期基址界限一路走到现代 x86-64 四级页表、TLB、页面置换与 CoW 深度追踪。

---

## 一、进程地址空间抽象：Text、Data、BSS、Heap、mmap 与 Stack (OS-28)

如果让所有程序直接读写真实的物理内存条地址，只要程序 A 写错一个指针就会直接改写程序 B 甚至内核的数据；而且程序必须在编译期就知道自己会被装进物理条的哪个角落。

为此，操作系统给每个进程发了一张**独享的 64 位虚拟楼层平面图（Virtual Address Space）**：

```text
  0xFFFF_FFFF_FFFF_FFFF ┌──────────────────────────────────────┐
                        │     内核虚拟空间 (Ring 0 专属)        │  ◀── U/S=0，Ring 3 不可触碰
  0xFFFF_8000_0000_0000 ├══════════════════════════════════════┤
                        │     (非规范地址空洞 Canonical Hole)   │
  0x0000_7FFF_FFFF_FFFF ├══════════════════════════════════════┤
                        │  Stack (调用栈：向低地址 ↓ 增长)       │  局部变量、函数返回地址
                        │                 │                    │
                        │                 ▼                    │
                        │         (自由虚拟地址空洞)            │
                        │                 ▲                    │
                        │                 │                    │
                        │  mmap 映射区 (共享库 .so / 大块匿名)  │  dlopen / malloc(>128KB)
                        │                 ▲                    │
                        │  Heap (堆：由 brk 向高地址 ↑ 增长)    │  new / malloc 小块分配
                        ├──────────────────────────────────────┤
                        │  BSS 段 (未初始化/零初始化全局静态)   │  static int buf[1024];
                        │  Data 段 (已初始化全局静态变量)       │  int g_ver = 2026;
                        │  Text 段 (机器指令，r-x 只读可执行)   │  main() 函数机器码
  0x0000_0000_0040_0000 ├──────────────────────────────────────┤
  0x0000_0000_0000_0000 │  不可访问保护页 (Null Guard Page)     │  解引用 nullptr 触发 SIGSEGV
                        └──────────────────────────────────────┘
```

### 动手实验：打印 C++ 程序各大内存段的真实虚拟地址

```cpp
// 编译: g++ -std=c++20 addr_layout.cpp -o addr_layout
#include <cstdlib>
#include <iostream>

int g_data = 42;        // Data 段 (已初始化)
int g_bss;              // BSS 段  (默认零初始化)

int main() {
    int stack_var = 1;
    int* heap_var = static_cast<int*>(std::malloc(sizeof(int)));
    std::cout << "Text (main):  " << reinterpret_cast<const void*>(&main) << '\n';
    std::cout << "Data (init):  " << static_cast<const void*>(&g_data) << '\n';
    std::cout << "BSS  (zero):  " << static_cast<const void*>(&g_bss) << '\n';
    std::cout << "Heap (malloc):" << static_cast<const void*>(heap_var) << '\n';
    std::cout << "Stack(local): " << static_cast<const void*>(&stack_var) << '\n';
    std::free(heap_var);
    return 0;
}
```

你会看到一条清晰的地址递增序列：`Text < Data < BSS < Heap << Stack`（注意开启 ASLR 地址空间随机化后，每次运行基址会随机微调以防御溢出攻击）。

---

## 二、早期地址转换：基址加界限与分段机制局限 (OS-29)

早期的操作系统是如何把“假地址”翻译成“物理地址”的？

1. **动态重定位（Base & Bounds）**：CPU 硬件里放两个特权寄存器 `Base` 和 `Bounds`。进程 A 访问虚拟地址 `VA` 时，硬件检查 `VA < Bounds`（越界直接报段错误），然后直接算出 `PA = Base + VA`。
   - **缺点**：整个进程（包含中间巨大的空闲堆栈空洞）必须**一整块连续**塞进物理内存，极其浪费！
2. **分段机制（Segmentation）**：把 `Code`、`Heap`、`Stack` 拆成几个独立段，每段各有自己的 `(Base, Bounds, GrowDir)`，中间空洞不再占用物理内存。
   - **致命短板——外部碎片（External Fragmentation）**：各个进程的代码段、堆段大小五花八门，运行一段时间不断创建退出后，物理内存条就像被啃过的**瑞士奶酪**——总空闲容量明明还剩 4GB，却被拆成上千个不连续的几 MB 小洞，导致一个需要 20MB 连续空间的新段无法分配！

```text
  分段引起的外部碎片 (总空闲 40MB，却塞不进一个 25MB 的新段！):
  [ 进程A Heap 10MB | 空洞 12MB | 进程B Code 8MB | 空洞 15MB | 进程C Stack 5MB | 空洞 13MB ]
```

---

## 三、分页机制与页表项（PTE）：VPN、Offset 与权限位 (OS-30)

**终极破局思路**：既然“按可变长度切蛋糕”总有边角料碎片，那就**全切成统一尺寸的小方格**——这就是**分页（Paging）**！

物理内存被切成一个个固定大小的**物理页框（Page Frame，通常为 `4 KB = 4096 B`）**，虚拟地址空间也切成同样 `4 KB` 的**虚拟页（Virtual Page）**。任意虚拟页都能映射到物理内存中**任意一个空闲页框**，**彻底消灭外部碎片**！

### 虚拟地址如何拆解？

以经典 4KB 页面（$4096 = 2^{12}$）为例，虚拟地址低 **12 位**直接原封不动作为**页内偏移（Offset）**，剩下的高位叫**虚拟页号（VPN）**，拿去查页表得到**物理页框号（PFN）**：

```text
  虚拟地址 VA = [ 虚拟页号 VPN (高位) | 页内偏移 Offset (低 12 位, 0..4095) ]
                        │                              │
                        ▼  查页表得到 PFN               │ (原封不动直通拼接!)
                        ▼                              ▼
  物理地址 PA = [ 物理页框号 PFN      | 页内偏移 Offset (低 12 位) ]
```

### 一条 64 位页表项（PTE）里到底藏了什么信息？

页表里的每一格（PTE，占 8 字节）绝不只是存放 `PFN`，它还记录着一整套硬件安检标志位：

| PTE 标志位 | 英文全称 | 核心作用 |
| --- | --- | --- |
| **`P`（Present）** | Valid / Present | `1` 表示该页确实在物理内存条里；`0` 表示不在（未分配或被换出到磁盘），访问触发 **Page Fault** |
| **`R/W`（Read/Write）** | Writable | `0` 表示只读（代码段或 **写时复制 CoW 临时只读**）；写只读页触发写保护异常 |
| **`U/S`（User/Supervisor）** | User Accessible | `1` 允许 Ring 3 访问；`0` 仅限内核 Ring 0（用户态强闯直接 `SIGSEGV`） |
| **`A`（Accessed）** | Reference bit | 硬件每次读写该页时自动置 `1`，供页面置换算法（Clock）判断最近是否活跃 |
| **`D`（Dirty）** | Modified bit | 硬件每次写入该页时自动置 `1`，淘汰此页时若 `D==1` 必须先写回磁盘 |
| **`NX`（No-Execute）** | Execute Disable | 禁止把堆/栈数据当机器指令执行，硬件防缓冲区溢出 Shellcode 注入！ |

### 可运行 C++20 代码：手动拆解虚拟地址 VPN / Offset 与解码 PTE 标志位

```cpp
// 编译: g++ -std=c++20 pte_decode.cpp -o pte_decode
#include <cstdint>
#include <iomanip>
#include <iostream>

constexpr uint64_t PTE_P  = 1ULL << 0;  // Present
constexpr uint64_t PTE_RW = 1ULL << 1;  // Writable
constexpr uint64_t PTE_US = 1ULL << 2;  // User-accessible
constexpr uint64_t PTE_A  = 1ULL << 5;  // Accessed
constexpr uint64_t PTE_D  = 1ULL << 6;  // Dirty
constexpr uint64_t PTE_NX = 1ULL << 63; // No-Execute

int main() {
    uint64_t va = 0x0000'7fff'1234'5abcULL;
    uint64_t vpn    = va >> 12;
    uint64_t offset = va & 0xFFFULL;

    // 构造一个模拟 PTE: 映射到物理页框 PFN=0x1A2B3, 用户可读写且不可执行
    uint64_t pfn = 0x1A2B3ULL;
    uint64_t pte = (pfn << 12) | PTE_P | PTE_RW | PTE_US | PTE_A | PTE_NX;

    uint64_t decoded_pfn = (pte >> 12) & 0xFF'FFFF'FFFFULL;
    uint64_t pa = (decoded_pfn << 12) | offset;

    std::cout << std::hex << std::showbase;
    std::cout << "VA  = " << va << " -> VPN=" << vpn << ", Offset=" << offset << '\n';
    std::cout << "PA  = " << pa << " (PFN=" << decoded_pfn << ")\n";
    std::cout << "权限: P=" << bool(pte & PTE_P) << " RW=" << bool(pte & PTE_RW)
              << " US=" << bool(pte & PTE_US) << " NX=" << bool(pte & PTE_NX) << '\n';
    return 0;
}
```

---

## 四、TLB（快表）与上下文切换刷新：ASID / PCID 的作用 (OS-31)

页表本身也躺在物理内存里！如果 CPU 每执行一条 `mov eax, [rax]` 都要先去内存查几级页表、再读目标数据，访存速度会直接暴跌 **5 倍以上**。

硬件设计师在 MMU 内部加了一块容量极小（几十到几千条）、速度极快（`~1 ns`）的片上缓存——**TLB（Translation Lookaside Buffer，地址转换后备缓冲器）**，专门缓存最近用过的 `VPN → PFN` 翻译结果！

```text
  虚拟地址 VA ──▶ 先查 TLB 快表 (仅需 1 个时钟周期!)
                   ├── 命中 (TLB Hit, ~99%): 直接拼接 PFN + Offset 访问物理内存！
                   └── 未命中 (TLB Miss):    硬件 MMU 走多级页表 (耗时几十 ns) 并回填 TLB
```

- **为什么顺序遍历 `std::vector<int>` 比跳指针遍历链表快得多？**  
  一页 `4096 B` 能装下 `1024` 个 `int`。顺序遍历数组时，只有跨入新页的**第 1 个**元素可能 TLB Miss，后面紧邻的 `1023` 个元素全部 **TLB Hit**；而跨页随机跳链表节点，几乎每次解引用都要重走页表！
- **跨进程切换时的 TLB 灾难与 ASID / PCID**：  
  不同进程有相同的虚拟地址（如 `0x400000`）却对应不同物理页框。早期 CPU 一旦切换 `CR3` 页表基址寄存器，**必须把整个 TLB 全部清空（Flush）**，导致新进程刚切上来前几千条指令疯狂 TLB Miss！现代 CPU 引入了 **ASID（ARM） / PCID（x86-64 Process-Context ID）**——给每条 TLB 缓存打上 12 位进程标签，切换进程时不再暴风清表，而是靠标签隔离共存！此外，当内核修改了共享页表（如 `munmap`），还必须发核间中断（IPI）通知其他核做 **TLB Shootdown**。

---

## 五、多级页表：x86-64 四级/五级页表如何省下巨量内存 (OS-32)

**算一笔吓人的账**：假设虚拟地址只用 48 位，页大小 4KB（偏移 12 位），那么单进程虚拟页共有 $2^{36} \approx 687$ 亿个！如果用一张扁平大数组存所有 PTE（每项 8 字节），**光一个还没运行几行代码的 `Hello World` 进程就要吃掉 $512\text{ GB}$ 页表内存**——根本不可能装得下！

**解法：把扁平页表折成“按需生长的稀疏多级树”**。x86-64 采用 **4 级页表**（48 位 VA：`9 + 9 + 9 + 9 + 12`；最新服务器支持 5 级 `LA57` 57 位 VA）：

```text
  48-bit 虚拟地址: [ PGD 9b | PUD 9b | PMD 9b | PTE 9b | Offset 12b ]
                      │        │        │        │          │
                      ▼        ▼        ▼        ▼          ▼
  CR3 ──▶ [PGD/PML4] ─▶ [PUD/PDPT] ─▶ [PMD/PD] ─▶ [PT] ──▶ 物理页框 + Offset
```

为什么能省下 99.999% 的内存？因为每个进程的大片虚拟地址空间（如堆和栈之间几十 TB 的空洞）根本没用到，**只要顶层 `PGD` 里的对应槽位标记为无效（`0`），底下的整棵 `PUD → PMD → PT` 子树一字节也不用分配**！另外，对数据库/JVM 等大内存负载，还可以使用 **Huge Pages（2MB / 1GB 大页）**，直接在 `PMD` 或 `PUD` 层结束翻译，大幅减少 TLB 条目消耗。

---

## 六、按需分页（Demand Paging）与缺页中断：次缺页 vs 主缺页 (OS-33)

当你调用 `mmap(1GB, MAP_ANONYMOUS | MAP_PRIVATE)` 或 `malloc(1GB)` 时，Linux **只做一件事**：在进程的 `mm_struct` 里记一笔“这 1GB 合法（登记一个 VMA 区域）”，**一个物理页框也不分配**！

直到你的代码第一次真正读写其中某字节时，CPU 发现 PTE 不存在 → 触发 **14 号缺页故障（Page Fault）**：

```text
  内核缺页处理流程 do_page_fault(fault_addr):
    1. 查进程 VMA 链表: fault_addr 在合法已申请区域内吗？
       └── 否 (如解引用 nullptr 或栈越界): 直接向进程发 SIGSEGV (段错误)！
    2. 查权限: 合法区域是只读的，但指令在试图写入？
       └── 若是写时复制 CoW 页: 复制新物理页、改 PTE 为可写 (次缺页)；否则发 SIGSEGV！
    3. 分配物理页框:
       ├── 匿名页 / 已经在内核页缓存中: 拿一页零页或直接建立映射 ──▶ 【次缺页 Minor Fault (~μs)】
       └── 需从磁盘文件或 Swap 读入: 阻塞发起磁盘 I/O 读取后建映射 ──▶ 【主缺页 Major Fault (~ms)】
    4. 回到用户态，**重新执行刚才触发故障的那条指令**！
```

### 保留实验（Linux / WSL2）：用 `os-process-vmem.cpp` 与 `VmRSS` 验证并发/阻塞与按需触页

新建 `os-process-vmem.cpp` 并写入本系列核心实验程序，编译运行（涵盖线程 TLS 隔离、无死锁 `scoped_lock` 与条件变量阻塞休眠）：

{{example:os-process-vmem.cpp}}

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic -pthread os-process-vmem.cpp -o os-process-vmem
./os-process-vmem
```

典型输出（线程 1 与 2 调度顺序可能互换）：

```text
[线程 1] tls_visits=1 (私有), g_shared_visits=1
[线程 2] tls_visits=1 (私有), g_shared_visits=2
join 后总计: shared=2, account_a=100, account_b=100
条件变量唤醒耗时 (墙钟): 41 ms
```

接着，在 Linux/WSL2 下运行下面的 `demand_paging.cpp`，亲眼观察 **`mmap(256 MB)` 触页前后 `VmRSS` 与 `ru_minflt`（次缺页次数）的剧变**：

```cpp
// Linux / WSL2 编译: g++ -std=c++20 demand_paging.cpp -o demand_paging
#include <fstream>
#include <iostream>
#include <string>
#include <sys/mman.h>
#include <sys/resource.h>
#include <unistd.h>

void show_stats(const char* stage) {
    struct rusage ru{};
    ::getrusage(RUSAGE_SELF, &ru);
    std::ifstream f("/proc/self/status");
    std::string line, rss = "N/A";
    while (std::getline(f, line)) {
        if (line.rfind("VmRSS:", 0) == 0) { rss = line; break; }
    }
    std::cout << "[" << stage << "] " << rss
              << " | minflt=" << ru.ru_minflt << ", majflt=" << ru.ru_majflt << '\n';
}

int main() {
    constexpr std::size_t bytes = 256ULL * 1024 * 1024; // 256 MB
    show_stats("初始状态");

    char* p = static_cast<char*>(::mmap(nullptr, bytes, PROT_READ | PROT_WRITE,
                                        MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));
    show_stats("mmap 256MB 后 (未触页)");

    // 每隔 4096 字节写入 1 字节，触发 ~65536 次按需分配次缺页
    for (std::size_t off = 0; off < bytes; off += 4096) {
        p[off] = 1;
    }
    show_stats("按页写入 256MB 后");
    ::munmap(p, bytes);
    return 0;
}
```

---

## 七、页面置换算法：OPT、FIFO 与 Belady 异常、LRU 与 Clock (OS-34)

当物理内存条彻底塞满，又发生缺页需要腾出一个物理页框时，内核必须挑一个“倒霉蛋”淘汰出去（如果它的 `Dirty` 位是 1，先写回磁盘/Swap；如果是干净页直接丢弃即可）。**挑谁最划算？**

1. **OPT（最优置换算法，理论上限）**：淘汰**未来最久才会被再次访问**的那一页。遗憾的是操作系统没有水晶球预知未来，OPT 只用来在论文里做对比基准。
2. **FIFO（先进先出）与 Belady 异常**：淘汰驻留时间最长的老页面。实现最简单，但不仅无视局部性，还会出现反直觉的 **Belady 异常（Belady's Anomaly）**：给进程**分配更多物理页框（比如从 3 格增加到 4 格），缺页次数反而上升了！**（经典反例序列：`1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5`，3 帧共 9 次缺页，4 帧反而 10 次！）。
3. **LRU（最近最少使用）**：利用时间局部性，淘汰最久没被用过的页面（属栈式算法，绝无 Belady 异常）。**痛点**：每次内存访问都要更新链表或时间戳，纯软件做太慢、硬件成本太高。
4. **Clock / Second-Chance（时钟 / 二次机会算法，真实 OS 近似 LRU）**：把所有物理页框排成一块**圆形钟表**，指针扫过一格时检查硬件自动置位的 `Accessed (A)` 位：
   - 若 `A == 1`：说明最近刚被用过！给它**二次机会**——把 `A` 清成 `0`，指针继续拨向下一格。
   - 若 `A == 0`：一圈都没人理它，就地淘汰！
   - （增强版时钟算法还会同时看 `(A, D)` 两位，优先淘汰既没被读又没被写脏的 `(0, 0)` 页，省去磁盘回写）。

### 可运行 C++20 模拟器：亲手复现 FIFO 的 Belady 异常并对比 LRU / Clock

```cpp
// 编译: g++ -std=c++20 page_replace_sim.cpp -o page_replace_sim
#include <algorithm>
#include <iostream>
#include <list>
#include <unordered_map>
#include <vector>

int sim_fifo(const std::vector<int>& refs, int frames) {
    std::list<int> q;
    int faults = 0;
    for (int p : refs) {
        if (std::find(q.begin(), q.end(), p) == q.end()) {
            ++faults;
            if (static_cast<int>(q.size()) == frames) q.pop_front();
            q.push_back(p);
        }
    }
    return faults;
}

int sim_lru(const std::vector<int>& refs, int frames) {
    std::list<int> order; // front = 最新使用, back = 最久未用
    std::unordered_map<int, std::list<int>::iterator> pos;
    int faults = 0;
    for (int p : refs) {
        auto it = pos.find(p);
        if (it != pos.end()) {
            order.splice(order.begin(), order, it->second);
        } else {
            ++faults;
            if (static_cast<int>(order.size()) == frames) {
                pos.erase(order.back());
                order.pop_back();
            }
            order.push_front(p);
            pos[p] = order.begin();
        }
    }
    return faults;
}

int sim_clock(const std::vector<int>& refs, int frames) {
    struct Slot { int page = -1; bool ref = false; };
    std::vector<Slot> ring(frames);
    int hand = 0, faults = 0;
    for (int p : refs) {
        bool hit = false;
        for (auto& s : ring) {
            if (s.page == p) { s.ref = true; hit = true; break; }
        }
        if (hit) continue;
        ++faults;
        while (ring[hand].page != -1 && ring[hand].ref) {
            ring[hand].ref = false; // 给一次二次机会
            hand = (hand + 1) % frames;
        }
        ring[hand] = {p, true};
        hand = (hand + 1) % frames;
    }
    return faults;
}

int main() {
    // 著名的 Belady 异常测试序列
    std::vector<int> refs{1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5};
    for (int f : {3, 4}) {
        std::cout << "页框数=" << f
                  << " | FIFO缺页=" << sim_fifo(refs, f)
                  << " | LRU缺页="  << sim_lru(refs, f)
                  << " | Clock缺页=" << sim_clock(refs, f) << '\n';
    }
    return 0;
}
```

运行输出一目了然：`页框数=3` 时 FIFO 缺页 `9` 次，`页框数=4` 时 FIFO 缺页反而涨到 `10` 次；而 LRU 与 Clock 均随页框增多单调下降！

---

## 八、抖动（Thrashing）与工作集模型（Working Set） (OS-35)

如果系统同时跑了太多大内存程序，**所有活跃进程加起来需要的核心页面总数（工作集之和）超过了物理内存条总量**，就会爆发恐怖的**内存抖动（Thrashing）**：

```text
  CPU 利用率
    ▲          ╭──────╮
    │        ╱          ╲   ◀── 临界点后发生抖动 (Thrashing)！
    │      ╱              ╲     进程刚换入 A 页，马上又把刚要用的 B 页换出，
    │    ╱                  ╲   CPU 99% 时间全花在等慢速磁盘 Swap 上，吞吐断崖暴跌！
    └──────────────────────────▶ 并发运行进程数
```

- **Denning 工作集模型 $W(t, \Delta)$**：一个进程在过去 $\Delta$ 次访存窗口内真正活跃触摸过的页面集合叫它的**工作集**。只有当物理内存能完整装下工作集时，缺页率才可控。
- **工程对策**：
  1. **准入控制 / 挂起部分进程**（或用 **PFF 缺页频率监控**动态调整配额）；
  2. **Linux OOM Killer**：当无路可退且耗尽 Swap 时，内核按 `oom_score` 挑一个吃内存大户果断杀掉保全局（`dmesg` 中常见 `Out of memory: Killed process`）。

---

## 九、堆与映射系统调用：`brk` / `sbrk` 与 `mmap` (OS-36)

C++ 里的 `new` / `malloc` 并不是系统调用，它们是用户态分配器，底层向内核批发大块内存主要靠两种系统调用：

| 系统调用 | 工作方式 | `glibc malloc` 何时用它？ | 释放归还给 OS 的特点 |
| --- | --- | --- | --- |
| **`brk` / `sbrk`** | 向上移动堆顶指针 `program break` | 申请 **< `128 KB`** 的中小对象（通过空闲链表复用） | 只有堆顶整块连续空出时才收缩；中间有块小内存没 `free` 就会阻挡退还（堆空洞） |
| **`mmap(MAP_ANONYMOUS)`** | 在堆与栈之间的 `mmap` 映射区独立划出一块匿名 VMA | 申请 **>= `128 KB`**（可动态调整阈值）的大内存 | 调用 `free()` 时立刻调 **`munmap()` 瞬间还给内核**，零碎片滞留！ |

除了匿名内存，`mmap` 还支持**文件映射（File-backed Mapping）**——把磁盘文件直接映射成虚拟地址指针，像读数组一样读文件；以及 **`mprotect()`** 动态修改页权限（常用于 JIT 编译器先写机器码 `RW` 再改 `RX`，或在栈/堆边界插一块 `PROT_NONE` 警戒页捕捉越界）。

---

## 十、进程间共享内存：`shm_open`、`MAP_SHARED` 与持久可见性 (OS-37)

默认 `MAP_PRIVATE` 是进程私有的；如果想让两个毫无亲缘关系的进程以**极速零拷贝**方式共享同一片内存，只需要两件事：**① `MAP_SHARED` 标志**，**② 让两边映射同一个共享内存对象（`shm_open` 或同一文件）**，内核就会把两张页表的 PTE 指向**完全相同的物理页框**！

### 保留实验（Linux / WSL2）：`fork` 下 `MAP_PRIVATE` vs `MAP_SHARED` 对照

```cpp
// Linux / WSL2 编译: g++ -std=c++20 fork_mmap_compare.cpp -o fork_mmap_compare
#include <iostream>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>

int main() {
    int* priv = static_cast<int*>(::mmap(nullptr, 4096, PROT_READ | PROT_WRITE,
                                         MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));
    int* shar = static_cast<int*>(::mmap(nullptr, 4096, PROT_READ | PROT_WRITE,
                                         MAP_SHARED  | MAP_ANONYMOUS, -1, 0));
    *priv = 1;
    *shar = 1;

    if (::fork() == 0) {
        *priv = 2; // 触发写时复制 CoW：只改子进程私有新页
        *shar = 2; // 直接改写共享物理页，对父进程立即可见
        ::_exit(0);
    }
    ::wait(nullptr);
    std::cout << "父进程 wait 后读取: *priv=" << *priv << " (预期 1), *shar=" << *shar << " (预期 2)\n";
    ::munmap(priv, 4096);
    ::munmap(shar, 4096);
    return 0;
}
```

对于**非父子关系的两个独立进程**，使用 POSIX **`shm_open("/my_shm", O_CREAT | O_RDWR, 0600)` + `ftruncate(fd, size)` + `mmap(MAP_SHARED)`** 即可挂载到同一块 `/dev/shm/my_shm` 共享内存区（记得配 `pthread_mutex_t` + `PTHREAD_PROCESS_SHARED` 或原子变量做跨进程同步！）。

---

## 十一、写时复制（Copy-on-Write, CoW）深度追踪与工程影响 (OS-38)

很多初学者觉得“如果 Redis 占了 32GB 内存，每次 `BGSAVE` 调 `fork()` 岂不是要拷贝 32GB？”——靠的正是 **写时复制（Copy-on-Write）**！下面逐帧追踪 `fork()` 与第一次写入时页表的精密动作：

```text
  [时刻 1: fork() 刚返回] (几乎零拷贝！只复制页表并加锁)
   父进程 PTE ──(P=1, R/W=0 只读!, refcount=2)──▶ [ 物理页框 PFN=0x500 ]
   子进程 PTE ──(P=1, R/W=0 只读!, refcount=2)──↗   (双方读都不复制！)

  [时刻 2: 子进程执行 *ptr = 99 写入该页]
   1. CPU 发现 PTE.R/W == 0 ──▶ 触发写保护 Page Fault 陷入内核！
   2. 内核检查 VMA 发现“该区域逻辑上本来是可写的 (VM_WRITE)”，确认这是 CoW！
   3. 内核检查该物理页框引用计数 refcount == 2 (>1):
      • 分配一个新物理页框 PFN=0x888，把 0x500 里的 4KB 内容完整拷贝到 0x888
      • 把 0x500 的 refcount 减为 1
      • 修改【子进程 PTE】指向 PFN=0x888，并恢复 R/W=1 (可写)！刷新本核 TLB
   4. 回到用户态重跑 *ptr = 99 ──▶ 写入子进程独享的 0x888，父进程 0x500 完好无损！
```

> [!WARNING]
> **工程大坑：为什么 Redis 生产环境强烈建议关闭 Transparent Huge Pages (`THP`)？**  
> 因为在默认 4KB 页下，子进程只改 1 个 Key 只触发拷贝 4KB；但如果开启了 **2MB 透明大页（THP）**，只要子进程或父进程修改区区几十字节，CoW 写保护异常就会被迫整整复制 **`2 MB`**（放大 **512 倍**！），直接引发严重的延迟毛刺与内存翻倍飙升！

---

## 本课微练习 (OS-28 ~ OS-38)

### 练习 1（多级页表地址切分）
在经典的 32 位 4KB 分页系统中，如果采用两级页表（10 位一级目录 + 10 位二级页表 + 12 位页内偏移），请手工切分虚拟地址 `0x0040_3028` 的一级索引、二级索引和页内偏移量（用十六进制或十进制表示）。

<details>
<summary>核对答案</summary>

`0x00403028` 的二进制共 32 位：
- 低 12 位（页内偏移）：`0x028`（十进制 `40`）
- 中间 10 位（二级索引）：`(0x00403028 >> 12) & 0x3FF = 0x403 & 0x3FF = 0x003`（`3`）
- 最高 10 位（一级索引）：`0x00403028 >> 22 = 1`

</details>

### 练习 2（TLB 与局部性）
解释为什么在一个大矩阵 `int mat[4096][4096]` 上按行遍历（`mat[i][j]`）比按列遍历（`mat[j][i]`）在虚拟内存层面快出成百上千倍？

<details>
<summary>核对答案</summary>

每行 `4096 * 4B = 16 KB`（跨 4 个 4KB 页）。按行顺序访问时，不仅 CPU Cache 行全命中，而且连续 1024 个 `int` 都落在同一个虚拟页内，**TLB 命中率接近 99.9%**；而按列跳跃遍历每次步长 `16 KB`（一次跳过 4 个页），由于 TLB 容量通常只有几十到几百项，几乎**每一次元素访问都触发 TLB Miss**（甚至在内存紧张时狂触发缺页抖动）！

</details>

### 练习 3（Belady 异常与 Clock）
1. 为什么 **LRU** 算法永远不会发生 Belady 异常，而 **FIFO** 会？
2. 简化版 Clock 算法每次扫到一个 `Accessed=1` 的页框时，除了把指针拨向下一格，还必须把它的 `Accessed` 位改成 `0`。如果不改成 `0` 会怎样？

<details>
<summary>核对答案</summary>

1. LRU 满足**栈包含性质（Stack Property）**：对于任意时刻，页框数为 $k$ 时内存里的页面集合一定是页框数为 $k+1$ 时的子集；而 FIFO 缺乏这一包含性，因此增加页框后可能恰好踢掉马上又要用的老页面，导致缺页反增。
2. 如果不把 `Accessed` 清零，所有曾被用过哪怕一次的页的 `A` 位永远都是 `1`，Clock 指针就会无限绕圈永远找不到淘汰目标（死循环）！

</details>

### 练习 4（`VmRSS` 与 `fork` CoW 实战）
结合本课代码说明：父进程 `mmap` 分配并写满 100MB 匿名私有内存后 `fork()` 出子进程。如果子进程只读这 100MB 并立刻 `_exit(0)`，物理内存条会多占 100MB 吗？如果子进程每隔 4KB 写 1 字节呢？

<details>
<summary>核对答案</summary>

- 只读不写：**不会多占 100MB**，父子共享同一批物理页（只多消耗少许页表内存）。
- 每隔 4KB 写 1 字节：所有 25600 个 4KB 页面全部触发 CoW 写保护缺页，内核为子进程各自拷贝出一份新物理页，物理内存总消耗几乎翻倍（多出 ~100MB）。

</details>
