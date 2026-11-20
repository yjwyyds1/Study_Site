#include <algorithm>
#include <cstddef>
#include <iostream>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

struct SourceCount {
    std::string source;
    std::size_t count;
};

// 聚合阶段用 unordered_map 哈希计数，输出阶段导出到 vector 并按确定规则排序。
std::vector<SourceCount> aggregate_sources(const std::vector<std::string>& events) {
    std::unordered_map<std::string, std::size_t> counts;
    for (const std::string& src : events) {
        ++counts[src];
    }

    std::vector<SourceCount> report;
    report.reserve(counts.size());
    for (const auto& [src, total] : counts) {
        report.push_back(SourceCount{src, total});
    }

    // 严格弱序比较器：先按计数降序，计数相同时按来源名字典序升序。
    std::sort(report.begin(), report.end(),
              [](const SourceCount& lhs, const SourceCount& rhs) {
                  if (lhs.count != rhs.count) {
                      return lhs.count > rhs.count;
                  }
                  return lhs.source < rhs.source;
              });
    return report;
}

void print_report(const std::string& label, const std::vector<SourceCount>& report) {
    std::cout << label << ":";
    for (const SourceCount& entry : report) {
        std::cout << ' ' << entry.source << ':' << entry.count;
    }
    std::cout << '\n';
}

int main() {
    // 1. 验证相同数据不同输入顺序，产出完全一致的确定性报告。
    const std::vector<std::string> input_a{"b", "a", "b", "c", "a"};
    const std::vector<std::string> input_b{"c", "a", "b", "a", "b"};

    const auto report_a = aggregate_sources(input_a);
    const auto report_b = aggregate_sources(input_b);
    print_report("order A", report_a);
    print_report("order B", report_b);

    // 2. 用半开区间 [begin, end) 和 std::find_if 查找，解引用前必须检查 != end()。
    const auto single_it = std::find_if(
        report_a.begin(), report_a.end(),
        [](const SourceCount& entry) { return entry.count == 1; });
    if (single_it != report_a.end()) {
        std::cout << "first count==1: " << single_it->source << ':' << single_it->count << '\n';
    }

    const auto missing_it = std::find_if(
        report_a.begin(), report_a.end(),
        [](const SourceCount& entry) { return entry.count == 99; });
    std::cout << "count==99 found: " << std::boolalpha << (missing_it != report_a.end()) << '\n';

    // 3. 对比 std::map：按 key 升序维护（a:1 排在 c:3 前），不会按 count 降序。
    std::map<std::string, std::size_t> ordered_by_key;
    for (const std::string& src : std::vector<std::string>{"c", "c", "c", "a"}) {
        ++ordered_by_key[src];
    }
    std::cout << "map by key (not count):";
    for (const auto& [src, total] : ordered_by_key) {
        std::cout << ' ' << src << ':' << total;
    }
    std::cout << '\n';

    // 4. 观察 unordered_map 触发重哈希（rehash）时桶数量变化：旧迭代器在此后全部失效。
    std::unordered_map<int, int> table;
    table.reserve(2);
    const std::size_t initial_buckets = table.bucket_count();
    bool rehashed = false;
    for (int i = 0; i < 32; ++i) {
        table.emplace(i, i * 10);
        if (table.bucket_count() != initial_buckets) {
            rehashed = true;
            break;
        }
    }
    std::cout << "unordered_map rehash observed: " << rehashed
              << " (buckets " << initial_buckets << " -> " << table.bucket_count() << ")\n";
    return 0;
}
