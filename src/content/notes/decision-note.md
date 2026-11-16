---
title: "接口取舍小记：借用一行，还是保存一份"
description: "用 LogScan 的短期解析和长期存档对比 string_view 与 string。"
category: "设计取舍"
series: "工程笔记"
order: 2
tags: ["生命周期", "string_view", "LogScan"]
related: ["handbook/lifetime", "labs/logscan", "notes/lab-notebook"]
---

## 同一段字符，两种用途

如果解析函数只在本次调用中读取一行，把 `std::string_view` 传进去能清楚表达它只借用字符。调用者要保证字符在读取期间仍然有效。若函数要把行内容交给之后的工作线程，仍然只保存这个视图，就需要证明底层字符串在任务执行期间不会销毁、重新分配或被覆盖。

## 记录决定和成立条件

基本版 LogScan 读一行就分类，分类结果是级别值。保持借用同步结束；如果以后要保留坏行供报告，让结果持有自己的字符串。对热点路径的性能判断留给实测：固定数据和编译选项，保留输入、重复次数和原始结果，再说明局限。
