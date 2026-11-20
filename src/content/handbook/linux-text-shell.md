---
title: "Linux 文本处理、I/O 重定向、管道与 Shell 脚本编程 (LNX-11 ~ LNX-22)"
description: "从 0/1/2 文件描述符重定向与管道组合出发，系统掌握 grep 正则、find 查找、cut/sort/uniq/tr/paste、sed 与 awk 文本三剑客、tar/xz 归档压缩，以及生产级防御式 Bash 脚本编写。"
order: 73
category: "Linux 实践"
minutes: 75
tags: ["Linux", "重定向", "管道", "grep", "find", "sed", "awk", "tar", "Bash脚本"]
related: ["handbook/linux-zero-start", "handbook/linux-process-io", "handbook/cli-testing", "handbook/command-line-git"]
sources: []
---

## 本课导航：把零散命令组装成自动化流水线

上一课 [Linux 零基础入门 (LNX-01 ~ LNX-10)](../linux-zero-start/) 带你熟悉了单个文件与命令的操作。但在真实开发和运维中，面对的往往是成千上万个日志行、多层源码树和重复构建任务。

本课覆盖 **LNX-11 到 LNX-22**，核心遵循 Unix 哲学——**"让每个程序只做好一件事，并用标准流与文本管道把它们拼起来"**。学完后你能独立完成复杂日志统计、批量文件治理、打包发布以及编写带错误处理与参数校验的 Bash 脚本。

---

## 1. 标准流与 I/O 重定向：0/1/2、操作符与从左到右的顺序陷阱 (LNX-11)

### 为什么需要三个标准流（fd 0, 1, 2）？

在 Linux 里，内核为每一个新启动的进程默认打开 **3 个文件描述符（File Descriptor, fd）**——你可以把它们想象成进程对外沟通的三条独立通道：

| 文件描述符 `fd` | 英文名与缩写 | 默认连接目标 | 职责分工（为什么必须分开？） |
| --- | --- | --- | --- |
| **`0`** | Standard Input (`stdin`) | 键盘 | 接收外部喂进来的数据 |
| **`1`** | Standard Output (`stdout`) | 终端屏幕 | 输出**正常的业务结果数据**（方便接给下游管道继续算） |
| **`2`** | Standard Error (`stderr`) | 终端屏幕 | 输出**错误诊断、警告、进度提示**（就算 `stdout` 被重定向到文件，报错也能及时跳到屏幕上让你看见） |

### 重定向操作符全景表

| 操作符 | 完整等价写法 | 作用说明 | 常见陷阱 / 提示 |
| --- | --- | --- | --- |
| `> file` | `1> file` | 把 `stdout` **覆盖写入** `file` | **Shell 在启动命令前就会先清空 `file`！** |
| `>> file` | `1>> file` | 把 `stdout` **追加写入** `file` 末尾 | 保留历史输出 |
| `< file` | `0< file` | 把 `file` 内容作为 `stdin` 喂给命令 | 如 `sort < raw.txt` |
| `2> err.log` | — | 仅把 `stderr` 覆盖写入 `err.log` | `2` 和 `>` 之间**绝对不能有空格** |
| `2>> err.log` | — | 仅把 `stderr` 追加到 `err.log` | — |
| `> all.log 2>&1` | — | **把 `stdout` 和 `stderr` 合并到同一个文件** | POSIX 标准写法，最推荐 |
| `&> all.log` | `> all.log 2>&1` | Bash 专属简写（追加用 `&>>`） | 不可用于老式 `/bin/sh` |
| `> /dev/null` | — | 把输出丢进**黑洞设备**（彻底静默） | `cmd &> /dev/null` 丢弃全部输出 |
| `<<< "str"` | Here-String | 把单行字符串直接当 `stdin` 喂给命令 | 如 `wc -c <<< "hello"` |
| `<< 'EOF'` | Here-Document | 把多行文本块当 `stdin`；`EOF` 加单引号可禁止变量展开 | 生成配置文件神器 |

### 🔥 核心难点：重定向从左到右的顺序陷阱！

初学者最常写错的一条命令就是把 `> out.log 2>&1` 和 `2>&1 > out.log` 当成一回事。**Shell 严格按照从左到右的顺序修改 fd 指向指针！**

```text
正确写法: cmd > out.log 2>&1
  初始状态: fd[1] -> 屏幕,  fd[2] -> 屏幕
  第1步 > out.log : fd[1] 改指向 out.log       (fd[1] -> out.log, fd[2] -> 屏幕)
  第2步 2>&1      : fd[2] 复制 fd[1] 当前指向   (fd[1] -> out.log, fd[2] -> out.log) ✅ 两者都进文件！

错误写法(若想全存文件): cmd 2>&1 > out.log
  初始状态: fd[1] -> 屏幕,  fd[2] -> 屏幕
  第1步 2>&1      : fd[2] 复制 fd[1] 当前指向   (fd[1] -> 屏幕,    fd[2] -> 屏幕)
  第2步 > out.log : fd[1] 改指向 out.log       (fd[1] -> out.log, fd[2] -> 屏幕) ❌ 错误依旧漏在屏幕上！
```

（注：如果你故意只想把 `stderr` 放进管道过滤、同时丢掉 `stdout`，`cmd 2>&1 >/dev/null | grep ...` 恰恰就是利用这个顺序！）

动手用 `ls` 同时列出一个存在文件和一个不存在文件来实测分离与合并：

```bash
$ touch exist.txt
$ ls exist.txt missing.txt > out.txt 2> err.txt
$ echo "exit=$?"
exit=2

$ cat out.txt
exist.txt
$ cat err.txt
ls: cannot access 'missing.txt': No such file or directory

$ ls exist.txt missing.txt > all.txt 2>&1
$ cat all.txt
ls: cannot access 'missing.txt': No such file or directory
exist.txt

$ cat << 'EOF' > demo.conf
host=127.0.0.1
user=$USER
EOF
$ cat demo.conf
host=127.0.0.1
user=$USER
```

> **新手常见坑（LNX-11）**：
> 1. **`cat file.txt > file.txt` 原地清空灾难**：很多人想把处理结果写回原文件，结果 Shell 在执行 `cat` 之前，先看到 `> file.txt` 就把文件截断成了 0 字节！最终原文件数据全部丢失。**铁律：输入和输出绝对不要指向同一个文件**，先写到 `file.tmp` 再 `mv file.tmp file.txt`。
> 2. **`2 > err.log` 中间多了空格**：Shell 会把它当成命令的第 1 个参数 `"2"` 和标准输出重定向 `> err.log`。
> 3. **以为 `2>&1` 写在最前面一样有效**：记住**从左到右绑定指针**，要合并保存永远写 `> file 2>&1`。

---

## 2. 管道、分流与参数构造：`|`、`tee` 与 `xargs` (LNX-12)

### 1. 匿名管道 `|`：内存直连的工厂传送带

`cmd1 | cmd2` 在内核里开辟一块内存缓冲区，把 **`cmd1` 的 `stdout`（fd 1）** 直接接到 **`cmd2` 的 `stdin`（fd 0）**。两个进程**同时并发运行**，无需生成任何中间临时文件。

- **重要提醒**：`|` 默认**只传 `stdout`（fd 1），不传 `stderr`（fd 2）**！如果报错信息混在屏幕上不想漏掉，要写 `cmd1 2>&1 | cmd2`（或 Bash 简写 `cmd1 |& cmd2`）。
- **管道退出码陷阱**：默认情况下，`false | true` 的整体 `$?` 只看最后一个命令（`0`），上游失败会被吞掉！开启 `set -o pipefail` 后，只要管道里**任意一环**非零退出，整体就返回失败（也可以读取数组 `${PIPESTATUS[@]}` 逐个看）。

### 2. `tee`：T 字型三通管（边看/边传，边存盘）

用了 `> out.log` 后屏幕就瞎了；既想把输出继续交给下游管道（或打印到终端），又想顺手存一份日志到文件，就用 `tee`：

| 用法 | 作用 | 经典场景 |
| --- | --- | --- |
| `cmd \| tee build.log` | 屏幕照常实时打印，同时存进 `build.log` | 编译长项目时留存完整日志 |
| `cmd \| tee -a build.log` | 追加写入而不覆盖（`-a` = append） | 多次实验连续记录 |
| `echo "127.0.0.1 app.local" \| sudo tee -a /etc/hosts` | **解决 `sudo echo ... >` 权限不足的经典方案** | 因为 `>` 是当前普通用户的 Shell 打开的，提权不到！必须让 `tee` 以 `sudo` 身份写文件 |

### 3. `xargs`：打通 `stdin` 到命令行参数 `argv` 的桥梁

很多命令（如 `rm`、`mkdir`、`cp`、`mv`、`ls -l`）**根本不读标准输入 `stdin`**，它们只认跟在命令后面的命令行参数！如果你写 `find . -name "*.tmp" | rm`，`rm` 会直接报错 `missing operand`。

`xargs` 的工作就是**从 `stdin` 读入文本，拆分成命令行参数，拼在目标命令后面去执行**。

| `xargs` 参数 | 含义与作用 | 实战示例 |
| --- | --- | --- |
| `-n K` | 每次最多只喂 `K` 个参数执行一次命令 | `echo a b c d \| xargs -n 2`（分两行每次两个） |
| **`-I {}`** | **占位符替换**，把输入项塞到命令中间指定位置（隐含 `-n 1`） | `ls *.conf \| xargs -I {} cp {} {}.bak` |
| **`-0`** | **以 `\0`（NULL 字节）作为分隔符**，免疫文件名里的空格、引号和换行 | **黄金搭档**：`find . -name "*.log" -print0 \| xargs -0 rm -f` |
| `-P N` | 最多开 `N` 个进程**并发执行**（榨干多核 CPU） | `cat urls.txt \| xargs -P 4 -n 1 curl -sO` |
| `-r`（`--no-run-if-empty`） | 若 `stdin` 为空，不要白跑一次命令（GNU 常见） | 防止无匹配时误触发无参命令 |
| `-p` | 执行前在终端提示 `?...y/n` 确认 | 批量危险操作前二次核对 |

来看一套完整串联演示：

```bash
$ printf "a 1.txt\nb.txt\n" > list.txt
$ touch "a 1.txt" b.txt

$ cat list.txt | tee copy.txt | wc -l
2

$ printf "a 1.txt\0b.txt\0" | xargs -0 ls -l
-rw-r--r-- 1 alice alice 0 Nov 19 13:00 'a 1.txt'
-rw-r--r-- 1 alice alice 0 Nov 19 13:00 b.txt

$ ls b.txt | xargs -I {} cp -v {} {}.bak
'b.txt' -> 'b.txt.bak'
```

> **新手常见坑（LNX-12）**：
> 1. **`sudo echo "vm.swappiness=10" >> /etc/sysctl.conf` 报 `Permission denied`**：`sudo` 只提权了 `echo`，`>>` 是外层的普通用户 Bash 先执行的，无权写 `/etc/`！必须改用 `echo "..." | sudo tee -a /etc/sysctl.conf > /dev/null`。
> 2. **直接 `find ... | xargs rm` 遇到文件名带空格 `my report.txt`**：`xargs` 默认按空格和换行切分，会把一个文件切成 `my` 和 `report.txt` 两个参数去删！处理任意不可信文件名务必用 **`-print0 | xargs -0`**。
> 3. **无用的 `cat`（UUOC）**：`cat file.txt | grep ERROR` 多启动了一个不必要的 `cat` 进程，直接 `grep ERROR file.txt` 即可。

---

## 3. 文本搜索之王：`grep` 与正则表达式入门 (LNX-13)

`grep`（Global Regular Expression Print）按行扫描文本，把匹配模式的行打印出来。更棒的是它自带**明确退出码**：找到至少 1 行返回 `0`，1 行都没找到返回 `1`，文件不存在或语法出错返回 `2`（后面写 `if grep -q ...` 全靠它）。

### `grep` 核心选项表

| 参数 | 英文 / 含义 | 说明与使用场景 |
| --- | --- | --- |
| **`-E`** | **Extended RegExp（扩展正则）** | 让 `+`、`?`、`{m,n}`、`(`、`|` 直接生效，无需加反斜杠 `\`（替代旧的 `egrep`） |
| `-F` | Fixed Strings（纯字面量搜索） | **关闭正则解析**，搜索含 `.`、`[`、`*` 的代码或网址更快更安全 |
| `-i` | ignore-case | 忽略大小写（如 `-i error` 同时命中 `ERROR`/`Error`） |
| **`-v`** | **invert-match（反向过滤）** | 只打印**不包含**该模式的行（如过滤掉 `#` 注释和 `DEBUG` 噪声） |
| `-n` | line-number | 在每行前面标出在原文件中的行号 |
| `-c` | count | 不打印行内容，只统计每个文件命中了多少行 |
| `-l` / `-L` | files-with-matches / without | 只列出"包含匹配项"或"完全不含匹配项"的文件名 |
| `-r` / `-R` | recursive | 递归搜索整个目录（`grep -rn "TODO" src/`）；`-R` 还会跟随软链接 |
| `-w` / `-x` | word / line regexp | `-w` 整词匹配（搜 `id` 不匹配 `void`）；`-x` 整行完全匹配 |
| `-o` | only-matching | **只输出匹配上的那一小段子串**，而不是整行（提取 IP/邮箱神器） |
| `-A N` / `-B N` / `-C N` | After / Before / Context | 打印命中行**之后 N 行 / 之前 N 行 / 上下各 N 行**（看崩溃堆栈上下文必用！） |
| `--exclude-dir=.git` | 排除指定目录 | 搜代码库时跳过 `.git`、`build`、`node_modules` |

### 正则表达式（ERE, `-E`）零基础速查表

**核心心智**：正则描述的是**"一串字符长什么样"**的规则模板，**务必用单引号 `'...'` 把正则包起来**，防止 Bash 把里面的 `*`、`$`、`\` 提前解释掉！

| 元字符 | 含义 | 示例与匹配说明 |
| --- | --- | --- |
| `.` | 任意**单个**字符（换行除外） | `a.c` 匹配 `abc`、`a1c`，不匹配 `ac` |
| `\.` | 转义：匹配**字面小数点 `.`** | 匹配 IP 或 `.cpp` 必须写 `\.cpp`，否则 `acpp` 也会误中！ |
| `^` / `$` | **行首**锚点 / **行尾**锚点 | `^ERROR` 只匹配以 `ERROR` 开头的行；`^$` 匹配**空行** |
| `[abc]` / `[0-9]` | 字符集：匹配其中**任意 1 个字符** | `[A-Za-z_]` 匹配单个字母或下划线 |
| `[^0-9]` | 否定字符集：非数字的 1 个字符 | 注意 `^` 放在 `[]` **最里面**代表取反，放在外面代表行首！ |
| `*` | 前面那个元素重复 **0 次或多次** | `ab*c` 匹配 `ac`、`abc`、`abbbc` |
| `+`（需 `-E`） | 前面那个元素重复 **1 次或多次** | `[0-9]+` 匹配至少 1 位整数 |
| `?`（需 `-E`） | 前面那个元素重复 **0 次或 1 次**（可选） | `https?` 匹配 `http` 或 `https` |
| `{m,n}`（需 `-E`） | 前面元素重复 `m` 到 `n` 次 | `[0-9]{1,3}` 匹配 1~3 位数字 |
| `(a\|b)`（需 `-E`） | 分组与**或**逻辑 | `(WARN\|ERROR)` 同时匹配警告和错误 |
| `\b` | 单词边界 | `\berror\b` 匹配独立单词 `error` |

把日志喂给 `grep` 演练一遍：

```bash
$ cat << 'EOF' > server.log
2026-11-19 10:00:01 INFO  [auth] user=alice ip=10.0.1.12 login ok
2026-11-19 10:00:02 DEBUG [pool] conn=4 idle
2026-11-19 10:00:05 WARN  [disk] usage=85% host=web-01
2026-11-19 10:00:09 ERROR [db] timeout connecting to 192.168.10.5:5432
2026-11-19 10:00:10 INFO  [db] retry succeeded
EOF

$ grep -nE '(WARN|ERROR)' server.log
3:2026-11-19 10:00:05 WARN  [disk] usage=85% host=web-01
4:2026-11-19 10:00:09 ERROR [db] timeout connecting to 192.168.10.5:5432

$ grep -C 1 'ERROR' server.log
2026-11-19 10:00:05 WARN  [disk] usage=85% host=web-01
2026-11-19 10:00:09 ERROR [db] timeout connecting to 192.168.10.5:5432
2026-11-19 10:00:10 INFO  [db] retry succeeded

$ grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' server.log
10.0.1.12
192.168.10.5

$ grep -v 'DEBUG' server.log | wc -l
4
```

> **新手常见坑（LNX-13）**：
> 1. **忘了加 `-E` 就写 `grep 'WARN|ERROR'`**：默认基础正则（BRE）把 `|`、`+`、`?` 当作普通字符！要么加 **`-E`**（推荐），要么老老实实转义 `\|`。
> 2. **在标准 `-E` 里写 `\d` 匹配数字**：`\d` 是 Perl/Python 正则（PCRE，需要 GNU `grep -P`），在 POSIX `-E` 下 `\d` 只匹配字母 `d`！跨平台兼容请老实写 **`[0-9]`** 或 `[[:digit:]]`。
> 3. **正则没加引号**：`grep ^$USER file` 用了双引号或没加引号，`$USER` 会被 Shell 展开；`grep *.cpp file` 会被 Shell 提前通配成文件名。正则模式**一律优先用单引号 `'...'`**。

---

## 4. 文件系统搜索利器：`find` 精准查找与批量动作 (LNX-14)

`grep` 是在**文件内容里**找文字，而 `find` 是在**目录树上**找文件本身（按名字、类型、大小、修改时间、权限等条件实时遍历），还能顺手对命中的文件执行动作。

基本语法骨架：`find [搜索起点目录...] [筛选条件] [执行动作]`。

### `find` 高频筛选条件与动作全表

| 类别 | 选项 / 表达式 | 含义与示例 |
| --- | --- | --- |
| **按名字** | `-name "pattern"` | 按文件名 Glob 通配（区分大小写），**模式必须加引号**：`find . -name "*.cpp"` |
| | `-iname "pattern"` | 不区分大小写：`-iname "readme*"` |
| | `-path "*/build/*"` | 按完整相对路径匹配（可用来排除目录：`! -path "*/.git/*"`） |
| **按类型** | `-type f` / `d` / `l` | `f` 普通文件、`d` 目录、`l` 软链接 |
| **按深度** | `-maxdepth N` / `-mindepth N` | 限制递归深度（`-maxdepth 1` 只看当前层，**须放在其他条件前面**） |
| **按大小** | `-size +10M` / `-100k` / `0` | `+` 严格大于，`-` 严格小于，无符号为精确等于；单位 `c`(字节) `k` `M` `G` |
| | `-empty` | 查找空文件（0 字节）或空目录 |
| **按时间** | `-mtime -7` / `+30` | 按内容修改时间（天）：`-7` 表示 **7 天以内**，`+30` 表示 **超过 30 天前** |
| | `-mmin -60` | 按修改时间（分钟）：最近 60 分钟内改过的文件 |
| **逻辑组合** | 默认并列 / `-o` / `!` | 空格并列是 `AND`；**`-o` 是 `OR`，多个 OR 条件必须用转义括号 `\( ... \)` 括起来！** |
| **执行动作** | `-print` / `-print0` | 打印路径（换行分隔 / `\0` 分隔配合 `xargs -0`） |
| | `-ls` | 直接以类似 `ls -l` 的格式打印详细信息 |
| | `-delete` | 直接删除匹配项（**极其危险：必须先不带 `-delete` 预览一遍，且放命令最末尾！**） |
| | **`-exec cmd {} \;`** | 对每个命中文件**单独启动一次** `cmd`（`{}` 代表当前文件路径，`\;` 结束命令） |
| | **`-exec cmd {} +`** | **批量打包参数**喂给 `cmd`（类似 `xargs`，性能高 10 倍，只需启动 1 次或几次进程） |

看看真实开发里的几个黄金组合：

```bash
$ mkdir -p ~/lab-find/{src,build,.git}
$ touch ~/lab-find/src/{main.cpp,util.hpp} ~/lab-find/build/app.o ~/lab-find/.git/HEAD
$ dd if=/dev/zero of=~/lab-find/build/big.bin bs=1024 count=20 2>/dev/null

# 1. 查找所有 C++ 源码和头文件（注意 -o 和转义括号）
$ find ~/lab-find -type f \( -name "*.cpp" -o -name "*.hpp" \)
/home/alice/lab-find/src/main.cpp
/home/alice/lab-find/src/util.hpp

# 2. 排除 .git 目录，找大于 10KB 的文件并看详情
$ find ~/lab-find -path "*/.git" -prune -o -type f -size +10k -ls
  1573205     20 -rw-r--r--   1 alice    alice       20480 Nov 19 13:15 /home/alice/lab-find/build/big.bin

# 3. 批量统计所有源码行数（-exec ... + 只调一次 wc）
$ find ~/lab-find/src -type f -exec wc -l {} +
 0 /home/alice/lab-find/src/main.cpp
 0 /home/alice/lab-find/src/util.hpp
 0 total
```

> **新手常见坑（LNX-14）**：
> 1. **`find . -name *.cpp` 漏了引号**：如果当前目录恰好有 `a.cpp`，Bash 会先展开成 `find . -name a.cpp`，导致子目录里的 `b.cpp` 全漏掉；如果有两个 `.cpp` 甚至直接报语法错 `paths must precede expression`！**通配符永远加引号**。
> 2. **`find . -delete -name "*.tmp"` 把 `-delete` 写在了前面**：`find` 从左到右求值！遇到每个文件先执行 `-delete` 把它删掉，再判断是不是 `*.tmp`——**全目录瞬间清零**！记住：**动作（`-delete`、`-exec`）永远写在所有筛选条件的最后面，且先用 `-print` 确认后再改 `-delete`**。
> 3. **忘了给 `-o` 加括号**：`find . -name "*.c" -o -name "*.h" -delete` 因为 `AND` 优先级高于 `OR`，等价于 `*.c OR (*.h AND -delete)`，只有 `.h` 会被删！正确写法必须用 `\( ... \)` 显式分组。

---

## 5. 行列拆解与统计流水线：`cut`、`sort`、`uniq`、`tr` 与 `paste` (LNX-15)

做日志统计和 CSV 清洗，80% 的时候不需要写 Python，把这五个轻量小工具串成一条管道就能秒出结果。

### 五剑客速查表

| 工具 | 核心职责 | 必记参数与用法 | 关键局限 / 注意点 |
| --- | --- | --- | --- |
| **`cut`** | 按分隔符或字符位置切列 | `-d ','`（单字符分隔符）、`-f 1,3` 或 `-f 2-4`（字段）、`-c 1-8`（字符位置） | **短板**：`-d ' '` 对连续多个空格会切出空列！对齐文本请换 `awk` |
| **`tr`** | 字符级替换、压缩与删除（**只读 `stdin`**） | `tr 'a-z' 'A-Z'`（转大写）、`tr -s ' '`（多空格压成 1 个）、`tr -d '\r'`（删掉 CR） | 不能直接跟文件名参数，要用 `< file` 或管道 |
| **`sort`** | 对文本行排序 | `-n`（按数值排）、`-h`（按 `10K`/`2M` 排）、`-r`（倒序）、`-t ','`（分隔符）、`-k 2,2n`（按第 2 列数值排）、`-u`（去重） | 不加 `-n` 时 `"10"` 会排在 `"2"` 前面（字典序） |
| **`uniq`** | 合并/统计**相邻**重复行 | `-c`（前缀计数）、`-d`（只看重复行）、`-u`（只看唯一行）、`-i`（忽略大小写） | **铁律：必须先 `sort` 再 `uniq`！否则隔行相同的不会合并** |
| **`paste`** | 横向并排拼合文件列 | `paste a.txt b.txt`（默认 Tab 隔开）、`-d ','`（逗号隔开）、`-s`（把多行串成一行） | 与 `cat`（纵向拼接）正好垂直互补 |

**经典 Top-N 排行榜万能公式**：`提取目标列 | sort | uniq -c | sort -nr | head -n K`。
另外，不同系统的本地化语言环境（Locale）会影响 `sort` 规则且拖慢速度，大文件排序或脚本中常加 **`LC_ALL=C sort`** 强制按纯 ASCII 字节排序。

来算一份真实 API 访问日志的"状态码 Top 榜"和"平均拆分"：

```bash
$ cat << 'EOF' > access.csv
10.0.0.1,GET,/api/users,200
10.0.0.2,POST,/api/login,401
10.0.0.1,GET,/api/orders,200
10.0.0.3,GET,/api/users,500
10.0.0.2,POST,/api/login,401
10.0.0.1,GET,/api/users,200
EOF

# 统计各接口状态码出现次数排行榜
$ cut -d ',' -f 3,4 access.csv | sort | uniq -c | sort -nr
      2 /api/users,200
      2 /api/login,401
      1 /api/users,500
      1 /api/orders,200

# 压缩多余空格并用 paste 横向拼两列
$ printf "  a    b   c\n" | tr -s ' '
 a b c

$ printf "id\n1\n2\n" > col1.txt
$ printf "name\nalice\nbob\n" > col2.txt
$ paste -d ',' col1.txt col2.txt
id,name
1,alice
2,bob
```

> **新手常见坑（LNX-15）**：
> 1. **直接对未排序文件跑 `uniq -c`**：看见输出里同一个 IP 出现了两次计数行，就是因为它们不相邻。永远记住 **`sort | uniq -c`** 连写。
> 2. **在 `sort -k 2` 里漏写结束列号变成 `-k 2,2`**：只写 `-k 2n` 在部分情况下会按第 2 列到行尾参与比较，严格指定单列排序写 **`-k 2,2n`**。
> 3. **给 `tr` 传文件名**：`tr -d '\r' win.txt` 会报错 `extra operand 'win.txt'`，必须用 `tr -d '\r' < win.txt > unix.txt`。

---

## 6. 流式编辑器：`sed` 替换、筛选与原地修改 (LNX-16)

`sed`（Stream Editor）是一个非交互式的流式行编辑器：逐行读入缓冲区（Pattern Space），按脚本指令修改或过滤，再输出到 `stdout`。默认**不会改动原文件**。

### `sed` 常用参数与指令表

| 选项 / 指令 | 含义 | 示例与解释 |
| --- | --- | --- |
| **`-n`** | 静默模式（关闭默认逐行打印） | 常与末尾 `p` 搭配，只打印想要的行：`sed -n '5,10p' file` |
| **`-E`** | 开启扩展正则（无需转义 `+ ? ( ) \|`） | 强烈建议写正则时统一加上 `-E` |
| **`-i`** / **`-i.bak`** | **原地修改原文件**（`-i.bak` 会先留一份 `.bak` 备份） | **铁律：先不加 `-i` 在屏幕预览满意，最后再加 `-i`！** |
| `-e 'cmd1' -e 'cmd2'` | 串联多条编辑指令 | 或在单引号内用分号 `;` 分隔 |
| **`s/old/new/g`** | 查找替换（`s` = substitute） | 不加 `g` 只替每行第 1 个！加 `g` 全局替换，加 `i` 忽略大小写 |
| **自定义分隔符** | `s#old#new#g` 或 `s\|old\|new\|g` | **替换文件路径时救命用**，免去 `\/\/\/` 转义噩梦 |
| `&` 与 `\1` | 引用整个匹配串 / 第 1 个 `(...)` 分组 | `sed -E 's/([0-9]+)/[\1]/g'` 把数字包上方括号 |
| `d` | 删除整行（delete） | `sed '/^$/d'` 删空行；`sed '1,3d'` 删前 3 行 |
| `p` | 打印整行（常配 `-n`） | `sed -n '/START/,/END/p'` 提取两个标记之间的段落 |
| `1i\text` / `$a\text` | 在第 1 行前插入 / 最后一行后追加 | 给无表头 CSV 加表头 |

注意跨平台差异：GNU `sed`（Linux）原地不留备份直接写 `sed -i 's/a/b/g' f`；而 macOS（BSD `sed`）要求 `-i` 后必须带备份后缀（如 `sed -i '' 's/a/b/g' f`）。通用最稳写法是 `-i.bak` 或输出重定向到临时文件。

实际跑一遍配置改写与片段提取：

```bash
$ cat << 'EOF' > app.conf
# app settings
host = /usr/local/data
port = 8080

debug = true
EOF

# 1. 删掉注释行和纯空白行（仅预览，不改原文件）
$ sed -E '/^\s*(#|$)/d' app.conf
host = /usr/local/data
port = 8080
debug = true

# 2. 用 | 做分隔符替换路径，并保留 .bak 备份原地改写
$ sed -i.bak 's|/usr/local/data|/var/lib/app|g' app.conf
$ cat app.conf
# app settings
host = /var/lib/app
port = 8080

debug = true

# 3. 提取第 2 到第 3 行
$ sed -n '2,3p' app.conf
host = /var/lib/app
port = 8080
```

> **新手常见坑（LNX-16）**：
> 1. **忘了替换末尾的 `/g`**：`sed 's/foo/bar/'` 只会替换每一行**第一次出现**的 `foo`，后面的保持不变。
> 2. **写了 `-n` 却忘了写 `p`**：`sed -n 's/a/b/g' file` 屏幕什么都不会打印！要么去掉 `-n`，要么写 `s/a/b/gp`。
> 3. **把变量塞进单引号 `'s/$OLD/$NEW/g'`**：单引号会冻结变量展开，结果真的把文本改成了 `$NEW` 字面量！需要传 Shell 变量时要谨慎拆引号或用双引号（并留意值里是否含 `/`）。

---

## 7. 结构化文本处理神器：`awk` 列提取、模式过滤与聚合统计 (LNX-17)

当文本列之间由**不定数量的空格或制表符**隔开时（比如 `ls -l`、`ps aux`、`df -h`），`cut` 会彻底抓瞎。此时就轮到 `awk`（以三位创始人 Aho、Weinberger、Kernighan 姓氏首字母命名）登场——它本质上是一门专门面向表格与日志行的迷你编程语言。

### `awk` 执行模型与内置变量

```text
1. BEGIN { ... }       ──► 读文件之前只运行 1 次（初始化表头、分隔符、计数器）
2. pattern { action }  ──► 每读入一行，自动按 FS 切分列并依次测试条件、执行动作
3. END   { ... }       ──► 全部行读完后只运行 1 次（输出求和、均值、分组统计结果）
```

| 内置变量 / 选项 | 含义 | 说明 |
| --- | --- | --- |
| **`-F ','`** 或 `FS` | 输入字段分隔符（Field Separator） | **不写时默认按"任意连续空白符（空格/Tab）"切分，且自动去掉行首空白！** |
| **`$0`** | 整行原始内容 | — |
| **`$1`, `$2` ... `$NF`** | 第 1 列、第 2 列 ... **最后一列** | 倒数第 2 列就是 `$(NF-1)` |
| **`NF`** | 当前行总共有多少列（Number of Fields） | 过滤空行：`NF > 0` |
| **`NR`** / `FNR` | 当前已读总行号 / 当前文件内行号 | 跳过表头：`NR > 1` |
| `OFS` | 输出分隔符（默认单个空格） | `BEGIN { OFS="," }` |
| `printf` | C 语言风格的格式化输出 | `printf "%-10s %6.2f\n", $1, avg` |

### 四大高能实战模板

1. **列提取与重排**：`awk '{print $1, $NF}'`
2. **条件筛选**：`awk '$3 >= 500 && $2 == "ERROR" {print NR, $0}'`
3. **数值累加与均值**：`awk '{sum += $4; n++} END {if (n>0) printf "avg=%.2f\n", sum/n}'`
4. **哈希表分组聚合（最强杀招！）**：`awk '{cnt[$2] += $4} END {for (k in cnt) print k, cnt[k]}'`

来分析一份带耗时的服务日志 `latency.log`：

```bash
$ cat << 'EOF' > latency.log
2026-11-19 /api/login   200 18
2026-11-19 /api/orders  200 124
2026-11-19 /api/login   500 310
2026-11-19 /api/orders  200 86
2026-11-19 /api/search  404 12
EOF

# 1. 找出非 200 状态码或耗时超过 100ms 的请求，标出行号
$ awk '$3 != 200 || $4 > 100 { printf "line=%d path=%-12s code=%d ms=%d\n", NR, $2, $3, $4 }' latency.log
line=2 path=/api/orders  code=200 ms=124
line=3 path=/api/login   code=500 ms=310
line=5 path=/api/search  code=404 ms=12

# 2. 按接口路径分组，计算每个接口请求次数与平均耗时
$ awk '{
    count[$2]++
    total_ms[$2] += $4
}
END {
    for (path in count) {
        printf "%-12s count=%d avg=%.1fms\n", path, count[path], total_ms[path]/count[path]
    }
}' latency.log
/api/login   count=2 avg=164.0ms
/api/orders  count=2 avg=105.0ms
/api/search  count=1 avg=12.0ms
```

> **新手常见坑（LNX-17）**：
> 1. **用双引号写 `awk` 程序：`awk "{print $1}"`**：灾难！Bash 会在启动 `awk` 前把 `$1` 展开成空字符串，于是 `awk` 实际收到的是 `{print }`，把整行全吐了出来！**铁律：`awk` 脚本必须始终用单引号 `'...'` 包裹**；想往里传外部 Shell 变量，用 `-v target="$MY_VAR"`。
> 2. **在 `awk` 的 `print` 里忘记逗号**：`print $1 $2` 会把两列**无缝粘连**在一起，必须写 **`print $1, $2`** 才会输出 `OFS`（默认空格）。
> 3. **以为 `-F ','` 能完美解析带引号转义逗号的复杂 CSV**：如 `"Smith, Bob",30` 会被硬生生切出 3 列；复杂 RFC-4180 CSV 建议上 Python `csv` 模块或 `mlr`/`jq`。

---

## 8. 归档与压缩：`tar`、`gzip`、`xz` 与 `zip/unzip` (LNX-18)

Windows 用户习惯用一个 `.zip` 或 `.7z` 解决所有事；但在 Linux 里，**打包归档（Archiving）**和**数据压缩（Compression）**是拆开的两步（因为先打包再整块压缩，往往比各自压缩再打包压缩率更高）：
- **归档工具 `tar`**（Tape Archive）：把成百上千个文件和目录（连同权限、软链接、时间戳）顺序拼接成一个单一的 `.tar` 文件，**自身并不缩小体积**。
- **压缩工具 `gzip` / `bzip2` / `xz`**：只负责把**单个**字节流压小，不能直接接收文件夹。
- **`tar` 一键联用参数**：现代 `tar` 直接内置了调用压缩器的开关，一步到位生成 `.tar.gz` 或 `.tar.xz`。

### `tar` 核心开关与压缩格式对照表

**死记 `tar` 命令结构**：`tar [操作模式 + 压缩开关 + 辅助开关] -f <归档文件名> [目标路径...]`。**注意 `-f` 后面必须紧贴着归档文件名！**

| 开关 | 助记词 / 含义 | 说明 |
| --- | --- | --- |
| **`-c`** | **Create** | 创建新的归档包 |
| **`-x`** | **eXtract** | 解包提取 |
| **`-t`** | **lisT** | **仅列出包内目录清单，不解压（拆包前防炸必看！）** |
| **`-v`** | Verbose | 打印详细处理的文件列表 |
| **`-f`** | File | **必须放在组合参数的最后一位**，紧跟包文件名 |
| **`-z`** | gzip（`.tar.gz` / `.tgz`） | **速度最快、跨平台最通用**，压缩率中等 |
| **`-J`**（大写） | xz（`.tar.xz`） | **压缩率最高**（Linux 内核源码包标配），稍慢 |
| `-j` | bzip2（`.tar.bz2`） | 老牌格式，如今多被 `z` 或 `J` 取代 |
| **`-C dir`** | Change directory | **解压到指定目录**，或打包时先切到该目录去掉冗余父路径 |
| `--exclude="pat"` | 排除文件/目录 | 打包源码时跳过 `build`、`.git`、`*.o`（**写在目标路径前面**） |

### 单文件压缩与跨平台 `zip`

| 工具 | 常用命令 | 关键提醒 |
| --- | --- | --- |
| `gzip` / `gunzip` | `gzip -k big.log`、`zcat big.log.gz` | **不加 `-k`（keep）会删掉原文件！**`zcat`/`zgrep` 可直接看压缩日志 |
| `xz` / `unxz` | `xz -k dump.sql`、`xzcat dump.sql.xz` | 同样默认删原文件，务必注意 `-k` |
| `zip` / `unzip` | `zip -r pkg.zip src/`、`unzip -l pkg.zip`、`unzip pkg.zip -d out/` | 跨 Windows 传文件最省心；打包目录必须加 `-r` |

演练一次安全的工程打包、预览与定向解压：

```bash
$ mkdir -p ~/lab-tar/myapp/{src,build}
$ echo "int main(){}" > ~/lab-tar/myapp/src/main.cpp
$ touch ~/lab-tar/myapp/build/app.o

# 1. 排除 build 目录打包压缩（注意 -C 去掉前面冗长的 /home/alice/lab-tar）
$ tar -czvf ~/lab-tar/myapp-src.tar.gz --exclude='build' -C ~/lab-tar myapp
myapp/
myapp/src/
myapp/src/main.cpp

# 2. 解压前先看一眼里面结构，防止散落一地（"tarbomb"）
$ tar -tzf ~/lab-tar/myapp-src.tar.gz
myapp/
myapp/src/
myapp/src/main.cpp

# 3. 定向解压到恢复目录
$ mkdir -p ~/lab-tar/restore
$ tar -xzf ~/lab-tar/myapp-src.tar.gz -C ~/lab-tar/restore
$ ls ~/lab-tar/restore/myapp/src
main.cpp
```

> **新手常见坑（LNX-18）**：
> 1. **把 `-f` 放在中间：`tar -cfz out.tar.gz dir`**：`tar` 会认为紧跟在 `-f` 后面的 `z` 就是归档文件名！结果生成了一个未压缩的叫 `z` 的文件，还报错找不到 `out.tar.gz`！**记住 `-f` 永远紧挨着文件名**（`-czf` 或 `-xzf`）。
> 2. **拿到别人给的 `.tar.gz` 直接在当前目录 `tar -xzf`**：如果对方打包时没套外层文件夹，1000 个零散文件会瞬间铺满你当前的工作目录（俗称 **Tarbomb**）。解压陌生压缩包前**一定先用 `tar -tf`** 看一眼顶层结构，或建个新目录加 `-C` 解压。
> 3. **直接跑 `gzip app.log` 以为原文件还在**：压缩完发现 `app.log` 消失了只剩 `app.log.gz`——这是 `gzip`/`xz` 的默认行为，想保留原件记得加 **`-k`**。

---

## 9. Bash 变量、引用规则与环境变量：单引号、双引号、`$()` 与 `export` (LNX-19)

如果说前面几节是在用工具，从本节开始我们进入 **Bash 编程核心**。Shell 脚本 80% 的 Bug 都源于同一个原因：**没搞清楚引号和变量替换规则**。

### 1. 变量赋值与安全读取

- **赋值铁律：`=` 两边绝对不能有空格！**
  - ✅ `name="alice"`
  - ❌ `name = "alice"`（Bash 会以为你要运行一个叫 `name` 的程序，参数是 `=` 和 `"alice"`！）
- **读取边界 `${VAR}`**：当变量后面紧挨着字母数字或下划线时（比如拼文件名），`$name_log.txt` 会被当成读取叫 `name_log` 的未定义变量，必须写成 **`${name}_log.txt`**。常用默认值语法：`${PORT:-8080}`（若 `PORT` 未设置或为空则回退到 `8080`）。

### 2. 三大引用（Quoting）铁律矩阵（极重要！）

| 写法 | 变量 `$VAR` 展开吗？ | 命令替换 `$(cmd)` 执行吗？ | 通配符 `*` / 空格拆词会触发吗？ | 适用场景 |
| --- | --- | --- | --- | --- |
| **裸写 `$var`** | ✅ 展开 | ✅ 执行 | ⚠️ **会拆空格、会展开 `*`！** | **几乎永远不要裸写变量！** |
| **双引号 `"$var"`** | ✅ 展开 | ✅ 执行 | 🛡️ **完全安全（保留空格和字面 `*`）** | **95% 的日常变量传递必选** |
| **单引号 `'$var'`** | ❌ **原样字面量** | ❌ **原样字面量** | 🛡️ **100% 冻结一切特殊字符** | **正则模式、`awk`/`sed` 代码、纯字面文本** |

- **命令替换 `$(command)`**：在双引号或赋值中把一条命令的标准输出捕获成字符串（强烈建议用 `$()`，不要用老旧的反引号 `` `command` ``，因为 `$()` 支持清晰嵌套且不易和单引号混淆）。

### 3. Shell 局部变量 vs 环境变量（`export` / `env` / `$PATH`）

- **`FOO=bar`（局部变量）**：只存在于**当前这一个 Bash 进程**里；你启动的子程序（比如 C++ 程序或子脚本）**看不见它**。
- **`export FOO=bar`（环境变量）**：贴上"可继承"标签，之后从当前 Shell 启动的所有子进程都能通过 `getenv("FOO")` 或 `env` 读到它。
- **临时单次注入**：`LOG_LEVEL=debug ./my_app` 只在运行 `./my_app` 那一次生效，不污染当前 Shell。
- **`$PATH` 环境变量**：冒号分隔的一串目录列表。当你敲 `ls` 时，Shell 按顺序去 `$PATH` 里找可执行文件；而当前目录 `.` 默认**不在 `$PATH` 里**（安全设计，防止恶意同名脚本劫持），所以运行当前目录编译出的程序必须显式写 `./hi`。

亲自做一次验证实验：

```bash
$ file="two words.log"
$ touch "$file"

# 裸写 vs 双引号
$ ls $file
ls: cannot access 'two': No such file or directory
ls: cannot access 'words.log': No such file or directory
$ ls "$file"
'two words.log'

# 单引号 vs 双引号 vs 命令替换
$ echo 'literal: $file $(date)'
literal: $file $(date)
$ today=$(date +%F)
$ echo "date is $today, file is ${file}"
date is 2026-11-19, file is two words.log

# 局部变量 vs export 环境变量
$ LOCAL_VAR="only_me"
$ export ENV_VAR="for_children"
$ bash -c 'echo "local=[$LOCAL_VAR] env=[$ENV_VAR]"'
local=[] env=[for_children]
```

> **新手常见坑（LNX-19）**：
> 1. **`PATH=/opt/mybin` 忘了拼回旧 `$PATH`**：写成了覆盖而不是追加 `export PATH="/opt/mybin:$PATH"`，结果敲 `ls`、`grep`、`rm` 全报 `command not found`！好在只是当前会话有效，重开终端或设回默认即可恢复。
> 2. **在单引号里面试图用 `\'` 转义单引号**：Bash 单引号内**没有任何转义机制**，`'` 一旦出现就立刻结束单引号块。
> 3. **给环境变量加 `$` 再 `export`**：写 `export $FOO=1` 会报错或产生怪异行为，`export` 后面写变量名本身：`export FOO=1`。

---

## 10. 条件判断与循环控制：`if/[[ ]]`、`test` 与 `for/while` (LNX-20)

### 1. 先颠覆 C++ 直觉：退出码 `0` 是真，非 `0` 是假！

在 C++ 里 `0` 是 `false`、`1` 是 `true`；**在 Shell 世界恰好相反**：
- 程序执行成功返回退出码 **`0`** → `if` 认为条件为 **真（True）**！
- 程序执行失败返回 **`1 ~ 255`** → `if` 认为条件为 **假（False）**！

因此 `if` 后面接的根本不是什么特殊布尔表达式，而就是**一条普通命令**（包括 `[ ... ]` 和 `[[ ... ]]` 本质也是测试命令）！看它的退出码是不是 `0`：

```bash
if grep -q "ERROR" server.log; then
    echo "发现错误日志！"
elif [[ ! -s server.log ]]; then
    echo "日志为空"
else
    echo "一切正常"
fi
```

### 2. `[[ ... ]]`（Bash 现代首选）vs `[ ... ]`（传统 POSIX `test`）

在写 `#!/usr/bin/env bash` 脚本时，**优先使用双中括号 `[[ ... ]]`**：
- 支持直接写 `&&`、`||`（`[ ... ]` 里不能直接写，必须拆成 `[ ... ] && [ ... ]`）。
- 左侧变量即使未加引号，遇到空格也不容易炸掉（但右侧做字面字符串比较时**仍建议加双引号**，因为不加引号的右侧会被当成通配模式！）。
- 支持正则匹配 `[[ $ver =~ ^[0-9]+\.[0-9]+$ ]]`。
- **注意空格铁律**：`[[` 后面和 `]]` 前面**必须有空格**！

| 测试类别 | 运算符 | 含义 | 示例 |
| --- | --- | --- | --- |
| **文件检测** | `-e` / `-f` / `-d` | 存在 / 是普通文件 / 是目录 | `[[ -f "$cfg" ]]` |
| | `-r` / `-w` / `-x` | 可读 / 可写 / 可执行 | `[[ -x "./app" ]]` |
| | `-s` | 文件存在且**大小 > 0**（非空） | `[[ -s "err.log" ]]` |
| **字符串** | `-z` / `-n` | 长度为 0（空） / 长度非 0 | `[[ -z "$name" ]]` |
| | `==` / `!=` | 相等 / 不等（右侧未加引号支持通配 `*.log`） | `[[ "$env" == "prod" ]]` |
| | `=~` | 扩展正则匹配（右侧**不要加引号**） | `[[ "$ip" =~ ^[0-9.]+$ ]]` |
| **整数比较** | **`-eq` `-ne` `-lt` `-le` `-gt` `-ge`** | 等于、不等、小于、小于等于、大于、大于等于 | **`[[ "$count" -gt 10 ]]`** |
| **算术双括号** | `(( a > b ))` | 专门算整数运算与自然大于小于比较 | `if (( count > 10 )); then` |

### 3. 四种常见循环写法

```bash
# 1. 遍历文件（直接用通配符，绝对不要用 for f in $(ls) ！）
for f in *.log; do
    [[ -e "$f" ]] || continue    # 防止无匹配时字面量 "*.log" 进循环
    echo "处理文件: $f"
done

# 2. 遍历固定列表或参数
for env in dev staging prod; do
    echo "检查环境: $env"
done

# 3. C 风格计数循环
for ((i = 1; i <= 3; i++)); do
    echo "第 $i 次重试"
done

# 4. 逐行读取文件的唯一工业级标准写法
while IFS= read -r line; do
    echo "读到一行: [$line]"
done < access.csv
```
解释一下第 4 条的 `IFS= read -r line`：默认 `read` 会吞掉行首尾空格（`IFS=` 禁止裁剪），还会把末尾 `\` 当续行符或转义（`-r` 禁止反斜杠转义）。缺了这两个修饰，读真实文本必丢字符。

> **新手常见坑（LNX-20）**：
> 1. **在 `[ ... ]` 或 `[[ ... ]]` 里用 `>` 和 `<` 比较数字**：写成 `[[ 10 > 2 ]]` 会按**字符串字典序**比较，结果 `"10"` 小于 `"2"` 返回假！更可怕的是在单括号 `[ 10 > 2 ]` 里，**`>` 会直接被解释成文件输出重定向，把结果写进一个叫 `2` 的空文件里！** 比大小请用 `-gt` / `-lt` 或 **`(( 10 > 2 ))`**。
> 2. **用 `for line in $(cat file.txt)` 逐行读文件**：一旦某行里面有空格，`for` 会按空格拆成好多段，遇到 `*` 还会触发通配符展开！逐行读文件**只能用 `while IFS= read -r line`**。
> 3. **漏掉 `[[` 内侧空格**：写成 `if [[$a -eq 1]]` 会报 `syntax error` 或 `command not found`。

---

## 11. Bash 函数、脚本参数与防御式编程：`set -euo pipefail` (LNX-21)

写一次性命令靠手敲，写可复用脚本必须有**工程防护**——否则一个拼写错误的变量名或悄悄失败的管道，就可能把生产数据清光还告诉你"执行成功"。

### 1. 脚本骨架与参数表

一个正规 Bash 脚本的第一行（Shebang）通常写 `#!/usr/bin/env bash`（比写死 `/bin/bash` 更跨发行版），并用 `chmod +x myscript.sh` 赋予执行权限后通过 `./myscript.sh arg1 arg2` 运行。

| 特殊参数 | 含义 | 黄金使用规范 |
| --- | --- | --- |
| `$0` | 当前脚本的路径/名称 | 打印 Usage 帮助时常用：`Usage: $0 <file>` |
| `$1`, `$2` ... `${10}` | 第 1、2 ... 第 10 个位置参数 | **第 10 个以上必须加花括号 `${10}`** |
| **`$#`** | 传入的参数总个数 | 参数个数校验：`if [[ $# -lt 1 ]]; then ...` |
| **`"$@"`** | **原汁原味传递所有参数**（保留每个参数内部空格） | **永远写 `"$@"`，别写 `$@` 或 `"$*"`！** |
| `$?` | 上一条命令的退出状态码（`0` 成功） | 必须在紧接着的下一行立即读取 |
| `$$` / `$!` | 当前脚本 PID / 最近一个后台进程 PID | 建临时文件或追踪后台作业 |

### 2. Bash 函数：作用域 `local` 与返回值真相

Bash 函数里有两个与 C++/Python 截然不同的规则：
1. **默认所有变量全是全局的！** 在函数内写 `tmp=123` 会污染外面的同名变量。函数内部临时变量**务必显式加 `local`**（`local name="$1"`）。
2. **`return` 只能返回一个 `0..255` 的整数状态码**，不能 `return "hello"`！函数想返回文本结果，应该在函数内 `echo "result"`，外面用 `res=$(my_func)` 捕获。

### 3. 防御式三件套：`set -euo pipefail`

把这行代码放在每个正式 Bash 脚本的第二行，它能在 Bug 刚冒头时立刻拉闸急停：

| 开关 | 全称 | 它能帮你拦住什么致命事故？ | 常见注意事项 |
| --- | --- | --- | --- |
| **`-e`** | `errexit` | 任意一条简单命令返回非 `0` 时，**脚本立刻中止退出**，不再带病往下跑 | 在 `if cmd`、`cmd \|\| true`、`$?` 判断中的失败不会触发退出 |
| **`-u`** | `nounset` | 读取**未定义变量**时直接报错中止（而不是静默展开成空字符串） | **直接消灭 `rm -rf "$UNSET_DIR/"*` 变 `rm -rf /*` 的毁灭性灾难！**（可选参数写成 `${1:-}` 提供默认空值以免被 `-u` 拦截） |
| **`-o pipefail`** | `pipefail` | 管道里**任意一个环节**失败，整条管道就返回失败码 | 防止上游 `grep`/`curl` 崩了，下游 `tee` 或 `sort` 返回 `0` 掩盖故障 |

加码技巧：配合 **`trap 'rm -f "$tmp_file"' EXIT`**，不管脚本是正常结束还是中途出错退出，都能自动清理临时文件！

对比有无 `set -euo pipefail` 的天壤之别：

```bash
$ cat << 'EOF' > unsafe_vs_safe.sh
#!/usr/bin/env bash
set -euo pipefail

greet_user() {
    local target="${1:?缺少用户名参数}"
    echo "Hello, ${target}"
}

greet_user "$1"

# 故意写一个会失败的上游管道（grep 找不到返回 1）
echo "ok" | grep "not_found" | wc -l
echo "这行永远不会被执行！"
EOF

$ chmod +x unsafe_vs_safe.sh
$ ./unsafe_vs_safe.sh
./unsafe_vs_safe.sh: line 10: $1: unbound variable
$ echo $?
1

$ ./unsafe_vs_safe.sh Alice
Hello, Alice
0
$ echo $?
1
```
看第二轮执行：尽管 `wc -l` 打印出了 `0` 并且自己返回 `0`，但由于中间的 `grep "not_found"` 返回了 `1`，`pipefail` + `-e` 立刻让脚本在管道结束处中止，**最后那句 `"这行永远不会被执行！"` 没有被错误执行**，且整条脚本退出码如实返回 `1`！

> **新手常见坑（LNX-21）**：
> 1. **在 `set -e` 下用 `grep` 做统计或判断，没匹配到导致整个脚本意外崩溃**：`grep` 找不到匹配行时返回退出码 `1`！如果这是预期可能发生的情况（比如"有错误就统计，没有就算 0"），在 `if grep -q ...` 里是安全的，或者在赋值时加上 **`|| true`**（如 `err_cnt=$(grep -c "ERROR" app.log || true)`）。
> 2. **在函数里漏写 `local`**，结果外层循环变量 `i` 被函数内的 `i` 覆盖，造成死循环或结果错乱。
> 3. **忘了 `$1` 在 `set -u` 下如果没传参会直接报 `unbound variable`**：接收位置参数养成习惯写 `local arg="${1:-}"`，或者用 `${1:?请提供输入文件}` 直接给出友好的必填报错提示。

---

## 12. 综合实战：编写一个生产可用的日志分析迷你脚本 (LNX-22)

现在我们把 **LNX-11 到 LNX-21** 的全部功力拧成一股绳，亲手写出一个干净、可复用、带参数校验和错误输出的命令行工具 `analyze_logs.sh`：
- **输入**：一个服务访问与异常混合日志文件（支持大文本与带空格路径）。
- **功能**：
  1. 校验参数是否齐全、文件是否存在且可读，错误诊断全部打到 **`stderr`（`>&2`）** 并返回非零退出码。
  2. 支持可选的 `-o <report_file>` 把报告同时输出到屏幕和文件（使用 `tee`）。
  3. 清洗掉 Windows `\r`，过滤出有效日志行，用 `awk` + `sort` + `uniq -c` 统计总请求数、各状态码分布、报错接口 Top 3 以及平均响应耗时。
  4. 开启 `set -euo pipefail` 与 `trap` 清理临时文件。

### 第一步：生成一份标准测试日志 `sample_service.log`

```bash
$ mkdir -p ~/linux-stage2 && cd ~/linux-stage2
$ cat << 'EOF' > sample_service.log
# service log started
2026-11-19T10:01:00Z INFO  GET /api/health 200 4ms
2026-11-19T10:01:02Z INFO  POST /api/login 200 32ms
2026-11-19T10:01:05Z WARN  POST /api/login 401 15ms
2026-11-19T10:01:08Z ERROR GET /api/orders 500 240ms
2026-11-19T10:01:10Z INFO  GET /api/orders 200 88ms
2026-11-19T10:01:12Z ERROR GET /api/orders 500 310ms
2026-11-19T10:01:15Z ERROR POST /api/pay   502 520ms
2026-11-19T10:01:18Z INFO  GET /api/users  200 25ms
EOF
```

### 第二步：编写 `analyze_logs.sh`

```bash
$ cat << 'EOF' > analyze_logs.sh
#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat >&2 << 'USAGE'
用法: analyze_logs.sh [-o 输出文件] <日志文件>
功能: 清洗服务日志并输出请求总数、状态码分布、接口错误排行与平均耗时。
USAGE
}

print_report() {
    local clean_file="$1"

    echo "========== 服务日志分析报告 =========="
    local total
    total=$(wc -l < "$clean_file")
    echo "有效日志总条数: $total"

    if [[ "$total" -eq 0 ]]; then
        echo "无有效请求记录。"
        return 0
    fi

    echo ""
    echo "[1] HTTP 状态码分布:"
    awk '{cnt[$5]++} END {for (c in cnt) printf "  状态码 %-4s : %d 次\n", c, cnt[c]}' "$clean_file" | sort

    echo ""
    echo "[2] 异常请求 (ERROR / 状态码 >= 500) 接口 Top 3:"
    awk '$2 == "ERROR" || $5 >= 500 {print $4}' "$clean_file" \
        | sort | uniq -c | sort -nr | head -n 3 \
        | awk '{printf "  %-15s : %d 次\n", $2, $1}'

    echo ""
    echo "[3] 响应耗时统计:"
    awk '{
        ms = $6
        sub(/ms$/, "", ms)
        sum += ms
        if (NR == 1 || ms > max) max = ms
        n++
    }
    END {
        printf "  平均耗时: %.2f ms | 最大耗时: %d ms\n", sum / n, max
    }' "$clean_file"
    echo "======================================"
}

main() {
    local out_file=""
    while getopts ":o:h" opt; do
        case "$opt" in
            o) out_file="$OPTARG" ;;
            h) usage; exit 0 ;;
            :) echo "错误: 选项 -$OPTARG 缺少参数" >&2; usage; exit 2 ;;
            \?) echo "错误: 未知选项 -$OPTARG" >&2; usage; exit 2 ;;
        esac
    done
    shift $((OPTIND - 1))

    if [[ $# -ne 1 ]]; then
        echo "错误: 请提供恰好 1 个日志文件路径" >&2
        usage
        exit 2
    fi

    local log_file="$1"
    if [[ ! -f "$log_file" || ! -r "$log_file" ]]; then
        echo "错误: 文件不存在或不可读 -> '$log_file'" >&2
        exit 1
    fi

    local tmp_clean
    tmp_clean=$(mktemp)
    trap 'rm -f "$tmp_clean"' EXIT

    # 去除可能的 \r 换行符、注释行与空行
    tr -d '\r' < "$log_file" | sed -E '/^\s*(#|$)/d' > "$tmp_clean"

    if [[ -n "$out_file" ]]; then
        print_report "$tmp_clean" | tee "$out_file"
    else
        print_report "$tmp_clean"
    fi
}

main "$@"
EOF
$ chmod +x analyze_logs.sh
```

### 第三步：运行验收（正常路径 + 异常退出码路径）

```bash
# 正常分析并同时存一份报告到 report.txt
$ ./analyze_logs.sh -o report.txt sample_service.log
========== 服务日志分析报告 ==========
有效日志总条数: 8

[1] HTTP 状态码分布:
  状态码 200  : 4 次
  状态码 401  : 1 次
  状态码 500  : 2 次
  状态码 502  : 1 次

[2] 异常请求 (ERROR / 状态码 >= 500) 接口 Top 3:
  /api/orders     : 2 次
  /api/pay        : 1 次

[3] 响应耗时统计:
  平均耗时: 154.25 ms | 最大耗时: 520 ms
======================================

$ echo "exit=$?"
exit=0

# 异常路径测试：文件不存在时 stdout 为空、stderr 报错、退出码为 1
$ ./analyze_logs.sh missing.log > /tmp/ok.out 2> /tmp/err.out
$ echo "exit=$?"
exit=1
$ wc -c /tmp/ok.out
0 /tmp/ok.out
$ cat /tmp/err.out
错误: 文件不存在或不可读 -> 'missing.log'
```

### 课后进阶微挑战（自测）

1. **挑战 A（管道 + `find` + 归档）**：只用一条命令，找出 `~/linux-stage2` 目录下最近 1 天内修改过的所有 `.log` 和 `.txt` 文件，打包成 `~/linux-stage2/logs_bundle.tar.gz`，要求即使文件名里有空格也能安全打包。
2. **挑战 B（扩展脚本）**：如果 `sample_service.log` 里全是 `INFO`、没有一行 `ERROR`，在 `set -euo pipefail` 下，`[2]` 段的 `awk ... | sort | uniq -c ...` 会不会导致脚本报错退出？为什么？

<details>
<summary>核对挑战答案</summary>

1. **挑战 A**：
   ```bash
   find ~/linux-stage2 -type f \( -name "*.log" -o -name "*.txt" \) -mtime -1 -print0 \
       | tar --null -T - -czvf ~/linux-stage2/logs_bundle.tar.gz
   ```
   （或用 `-exec`：`find ~/linux-stage2 -type f \( -name "*.log" -o -name "*.txt" \) -mtime -1 -exec tar -czvf ~/linux-stage2/logs_bundle.tar.gz {} +`，注意文件数量特别多时多个批次回覆盖，用 `tar --null -T -` 从标准输入读 `\0` 列表最稳妥！）

2. **挑战 B**：
   **不会报错退出**！因为和 `grep` 找不到行返回 `1` 不同，`awk`、`sort`、`uniq`、`head` 在输入为空或没有任何行匹配时，**正常退出码依然都是 `0`**，所以整条管道在 `pipefail` 下安全通过并输出空列表。

</details>

---

## 下一步怎么走

至此，你已经掌握了 Linux 的文件世界、文本处理流水线与 Shell 自动化脚本（LNX-01 ~ LNX-22）。接下来进入 [Linux 环境、进程、权限、信号与事件 I/O](../linux-process-io/)，从 Shell 终端深入到内核边界：亲手剖析权限与 `umask`、用 `strace` 与 `gdb` 抓取系统调用失败现场，并用 C++20 编写 `UniqueFd`、`pipe`/`dup2`、`sigaction` 与 `epoll` 服务程序！
