---
title: "Linux 零基础入门：目录树、文件操作、链接、通配符与编辑器 (LNX-01 ~ LNX-10)"
description: "从 Windows 盘符思维切换到 Linux FHS 单根大树，系统掌握路径导航、安全增删改查、文件查看与元信息、硬软链接、通配符与花括号展开、联机帮助体系以及 Nano/Vim 生存技能。"
order: 72
category: "Linux 实践"
minutes: 60
tags: ["零基础", "Linux", "FHS", "WSL2", "命令基础", "软硬链接", "通配符", "Vim", "Nano"]
related: ["handbook/linux-text-shell", "handbook/linux-process-io", "handbook/os-zero-start", "handbook/eng-zero-start"]
sources: []
---

> **🔑 跨学科前置钥匙卡**（[查看完整跨学科路线图](../../roadmap/)）
> - **零门槛直入范围**：本课及前三篇（FHS 目录导航、`ls/cd/cp/mv`、权限、`grep/sed/awk`、`ps/top/ss`）**完全零前置**，直接开敲命令！
> - **进阶去隔壁拿的钥匙**：学到第 5~6 课（`open/read/write/fork` 系统编程与 `strace/ELF`）时，可先看 [操作系统：用户态与系统调用（OS-03）](../os-zero-start/) 和 [现代 C++：RAII](../raii/)。
>
> <details><summary>📚 本科已为你融合的全球 TOP 5 经典精华（无需再买书/翻英文站）</summary>
>
> 1. **《The Linux Command Line (TLCL)》**：FHS 目录树、重定向/管道、`grep/sed/awk` 三剑客与 Bash 防坑
> 2. **《APUE》&《TLPI》**：`fd` 三层内核表、短读写重试循环、`EINTR` 与信号安全
> 3. **Brendan Gregg 60 秒排障法**：`uptime/dmesg/vmstat/mpstat/pidstat/iostat/top` 定位瓶颈
> 4. **Julia Evans Zines (jvns.ca)**：把 `strace`、`/proc/<pid>/fd`、`lsof`、`ss` 讲透的直观排错图解
> 5. **Linux Man Pages (man7.org)**：`open/read/write/close/dup2/epoll` 返回值与 `errno` 速查卡片
>
> </details>

## 本课导航：从零建立 Linux 终端直觉

习惯了 Windows `C:\`、`D:\` 图形界面的人第一次打开 Linux（或 WSL2 Ubuntu）黑框终端，最常遇到三堵墙：
1. **找不到北**：没有盘符，`/`、`/home`、`/etc`、`/mnt/d` 都是什么？我在哪？
2. **不敢敲命令**：`rm` 删错会怎样？相对路径、隐藏文件、通配符到底谁在展开？
3. **卡在工具里**：看大日志把终端刷卡死了怎么办？进了 `vim` 按什么都不管用、退不出来怎么办？

这一章不预设任何 Linux 基础，手把手覆盖 **LNX-01 到 LNX-10** 十个核心地基。学完后，你能在终端里自如穿梭、安全管理文件、看懂系统元数据与链接结构、自己查 `man` 手册，并用 Nano/Vim 救急改配置。

> **学习地图**：本课打通"文件系统与基本操作"（LNX-01 ~ LNX-10）；下一课 [Linux 文本处理、I/O 重定向与 Shell 脚本](../linux-text-shell/) 进阶到管道、正则、三剑客与自动化脚本（LNX-11 ~ LNX-22）；随后的 [Linux 环境、进程、权限、信号与事件 I/O](../linux-process-io/) 深入系统调用、`chmod`/`umask`、`strace`/`gdb`、`sigaction` 与 `epoll`。

---

## 1. Linux FHS 目录树与 WSL2 跨界路径 (LNX-01)

### 为什么 Linux 没有 `C:\` 和 `D:\`？

Windows 把每块硬盘分区分别挂成一棵独立的小树（`C:\`、`D:\`、`E:\`）。**Linux 采用完全不同的"单根倒挂大树"哲学**：整台电脑不管插了几块 SSD、U 盘还是网络硬盘，**全都统一挂到唯一的老祖宗 `/`（根目录，root directory）下面**。插上一块新硬盘，不是多出一个 `E:\`，而是把它**挂载（mount）**到大树的某个枝桠（比如 `/mnt/data`）上。

```text
/                              ← 唯一的根目录（整台机器的起点）
├── bin -> usr/bin             ← 普通用户基础命令（ls, cp, cat 等）
├── sbin -> usr/sbin           ← 系统管理员命令（fdisk, iptables 等）
├── etc/                       ← 全局配置文件（类似 Windows 注册表+ini，全是纯文本）
├── home/                      ← 普通用户"家目录"大本营
│   └── alice/                 ← 你的个人地盘，简写为 ~（工作代码放 ~/projects/）
├── root/                      ← 超级管理员 root 的家目录（注意：不是 / ！）
├── tmp/                       ← 公共临时草稿纸（重启或定期可能清空，权限 1777）
├── var/                       ← 经常变化的动态数据
│   └── log/                   ← 系统与服务日志文件（排查线上故障必看）
├── usr/                       ← 绝大多数软件、头文件、库与共享资源
│   ├── bin/                   ← 用户命令二进制
│   ├── include/               ← C/C++ 系统头文件（如 stdio.h）
│   └── local/                 ← 手动编译安装软件的默认落脚点
├── opt/                       ← 第三方大型独立软件包（如特定版本的工具链）
├── dev/                       ← 设备文件（/dev/null 黑洞、/dev/sda 磁盘）
├── proc/                      ← 内核内存虚拟视图（进程状态 /proc/<PID>/fd）
├── sys/                       ← 硬件与内核子系统控制接口
└── mnt/                       ← 临时挂载点（WSL2 在这里挂载 Windows C/D 盘）
```

这套目录布局在 Linux 界有一个通行标准，叫 **FHS（Filesystem Hierarchy Standard，文件系统层次标准）**。记住每个目录的职责表，遇到陌生路径就能猜出八九不离十：

| 目录 | 全称 / 含义 | 里面放什么 | 新手高频接触场景 |
| --- | --- | --- | --- |
| `/` | Root Directory | 所有目录和文件的唯一总根 | 写绝对路径的起点 |
| `/home/<user>` | Home Directory（简写 `~`） | 当前用户的个人文件、代码与配置（`.bashrc`） | **90% 的日常开发主战场** |
| `/root` | Superuser Home | `root` 管理员的个人目录 | 不要和 `/` 搞混 |
| `/etc` | Etcetera（配置文件） | `passwd`、`hosts`、`ssh/`、`nginx/` 等文本配置 | 修改系统级软件配置 |
| `/bin` 与 `/usr/bin` | Binaries | `ls`、`cat`、`g++`、`python3` 等可执行程序 | 现代 Ubuntu 中 `/bin` 是指向 `/usr/bin` 的软链接 |
| `/sbin` 与 `/usr/sbin` | System Binaries | 系统维护、磁盘网络管理命令 | 通常需要 `sudo` 权限运行 |
| `/var/log` | Variable Data | 不断增长的日志（`syslog`、`auth.log`）、缓存、数据库文件 | 查服务崩溃与登录日志 |
| `/tmp` | Temporary | 临时文件（所有人可写，但只能删自己的） | 放测试样本、临时下载包 |
| `/dev` | Devices | 硬件抽象：`/dev/null`（黑洞）、`/dev/zero`、`/dev/urandom` | 丢弃无用输出：`> /dev/null` |
| `/proc` | Process Info | **不在硬盘上**，内核实时暴露的进程与内存信息 | 查看 `/proc/cpuinfo`、`/proc/<PID>/fd` |
| `/mnt` | Mount | 临时挂载外部设备；**WSL2 用来映射 Windows 盘符** | `/mnt/c`、`/mnt/d` |

### WSL2 跨界路径与性能天坑

如果你在 Windows 上安装了 WSL2（Ubuntu），你同时拥有两套文件系统，它们通过 `9P` 协议互通：
- Windows 里的 `D:\workspace\logscan`，在 WSL2 Ubuntu 里对应的路径是 **`/mnt/d/workspace/logscan`**（盘符一律小写，反斜杠 `\` 变正斜杠 `/`）。
- 反过来，WSL2 里的 `~/projects`，在 Windows 资源管理器地址栏输入 **`\\wsl$\Ubuntu\home\<你的用户名>\projects`** 就能直接访问。

在终端里还可以用系统自带的 `wslpath` 工具互转路径，并在当前目录确认系统版本：

```bash
$ cat /etc/os-release | head -n 2
PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"

$ ls -ld /bin /usr/bin
lrwxrwxrwx 1 root root    7 Apr 22  2024 /bin -> usr/bin
drwxr-xr-x 1 root root 4096 Nov 10 09:12 /usr/bin

$ wslpath -u 'D:\workspace\cpp-lab'
/mnt/d/workspace/cpp-lab

$ wslpath -w ~/projects
\\wsl.localhost\Ubuntu\home\alice\projects
```

> **新手常见坑（LNX-01）**：
> 1. **把 C++ / Rust / Node 工程放在 `/mnt/c/` 或 `/mnt/d/` 下编译**：跨系统 `9P` 协议做大量小文件读写比原生 Linux `ext4` 慢 **5～20 倍**，且 Windows 挂载盘无法正常模拟 Linux 文件权限位（会导致 `chmod` 失效或 Git 满屏 `filemode` 变更）。**铁律：源码和编译目录一律放在 Linux 自己的 `~/` 目录下**，只把 `/mnt/d/` 当成"偶尔拷文档的跨界传送门"。
> 2. **把 `/` 和 `/root` 混为一谈**：`/` 是整个系统的根目录，`/root` 只是超级管理员的个人家目录。
> 3. **忘记 Linux 严格区分大小写**：在 Windows 里 `Main.cpp` 和 `main.cpp` 是同一个文件；在 Linux 原生目录下它们是**两个完全独立的文件**。

---

## 2. 工作目录导航：`pwd`、`ls` 与 `cd` 相对/绝对路径 (LNX-02)

### 核心心智模型：你现在站在哪个房间？

在图形界面里，你的眼睛直接看着窗口标题栏；在黑框终端里，Shell 进程时刻帮你记着一个**当前工作目录（Current Working Directory，简称 `cwd`）**。你敲的每一个不带 `/` 开头的路径，系统都会自动把 `cwd` 拼在前面。

路径只有两种写法：
- **绝对路径（Absolute Path）**：永远以 `/` 开头，从树根一步步往下指（如 `/etc/ssh/sshd_config`、`~/projects` 在展开后也是 `/home/alice/projects`）。**不管你现在站在哪，绝对路径指向的目标永远唯一不变。**
- **相对路径（Relative Path）**：不以 `/` 开头，相对于你当前的 `cwd` 出发：
  - `.` 表示"当前目录本身"（运行当前目录下的可执行文件必须写 `./a.out`）
  - `..` 表示"上一级父目录"（退两级就是 `../..`）
  - `data/sample.log` 等价于 `./data/sample.log`

### `pwd` 与 `cd`：移动与定位

| 命令 | 含义与作用 | 常见用法 |
| --- | --- | --- |
| `pwd` | Print Working Directory，打印当前绝对路径 | `pwd`（添加 `-P` 可穿透软链接显示物理真实路径） |
| `cd` | Change Directory，切换当前目录 | `cd /var/log`（绝对）、`cd ../build`（相对） |
| `cd` 或 `cd ~` | 一秒回到个人家目录 | 不带任何参数敲 `cd` 最快 |
| `cd -` | **在最近两次待过的目录之间来回横跳** | 读取环境变量 `$OLDPWD` 并打印切换后的路径 |

### `ls`：把房间里的东西照亮

直接敲 `ls` 只会看到简略的文件名列表，且默认**屏蔽了所有以 `.` 开头的隐藏文件**（如 `.bashrc`、`.gitignore`）。真正干活需要配合参数表：

| 参数 | 英文全称 / 含义 | 说明与使用场景 |
| --- | --- | --- |
| `-l` | long format | 详细列表：类型与权限、硬链接数、主人、属组、字节大小、修改时间、名称 |
| `-a` | all | 显示全部条目，**包含** `.`（当前目录）、`..`（父目录）及 `.` 开头隐藏文件 |
| `-A` | almost all | 显示隐藏文件，但**不显示** `.` 和 `..`（脚本里更干净） |
| `-h` | human-readable | 配合 `-l` 使用，把字节 `1048576` 转成易读的 `1.0M`、`4.0K` |
| `-t` | time | 按修改时间倒序排列（最新改动的排最前面） |
| `-S` | size | 按文件大小从大到小排列（快速揪出大文件） |
| `-r` | reverse | 反转排序顺序（如 `ls -ltr` 让最新的文件出现在屏幕最底部） |
| `-d` | directory | **只看目录本身的属性**，不展开目录里面的内容（必会：`ls -ld /tmp`） |
| `-R` | recursive | 递归列出所有子目录内容 |

**30 秒先看懂 `ls -la` 最左边的 10 个字符**（深入的 `chmod` 与 `umask` 会在权限专题详讲）：

```text
drwxr-xr-x  2 alice alice 4096 Nov 19 10:05 projects
-rw-r--r--  1 alice alice  220 Nov 19 09:30 .bash_logout
│└┬┘└┬┘└┬┘
│ │  │  └── 其他人(o)权限：r=读(4), w=写(2), x=执行/进入目录(1), -=无
│ │  └───── 同组人(g)权限
│ └──────── 主人(u)权限
└────────── 第1位类型：- 普通文件, d 目录, l 软链接
```

来看一段真实的导航与查看操作：

```bash
$ pwd
/home/alice

$ ls -la
total 32
drwxr-x--- 4 alice alice 4096 Nov 19 10:05 .
drwxr-xr-x 3 root  root  4096 Nov 10 08:00 ..
-rw-r--r-- 1 alice alice  220 Nov 10 08:00 .bash_logout
-rw-r--r-- 1 alice alice 3771 Nov 10 08:00 .bashrc
drwxr-xr-x 2 alice alice 4096 Nov 19 10:05 projects

$ cd /var/log
$ pwd
/var/log

$ cd -
/home/alice

$ ls -lhS projects/
total 1.2M
-rwxr-xr-x 1 alice alice 1.2M Nov 19 10:04 app_server
-rw-r--r-- 1 alice alice  842 Nov 19 10:02 main.cpp
```

> **新手常见坑（LNX-02）**：
> 1. **`cd ..` 漏掉空格**：写成 `cd..`（Windows CMD 习惯）在 Linux 下会直接报错 `cd..: command not found`。命令名与参数之间**必须有空格**。
> 2. **路径里带空格未加引号**：比如 `cd My Documents`，`cd` 会收到两个参数并报 `too many arguments`；正确写法是 `cd "My Documents"` 或用 `Tab` 键自动补全转义成 `cd My\ Documents`。
> 3. **对目录用 `ls -l dir` 想看目录权限却看到了一堆子文件**：查看目录**自身**的权限和属性必须加 `-d`，即 `ls -ld dir`。
> 4. **硬背别人的路径**：教程写 `cd /home/ubuntu`，你自己的用户名是 `alice`，照敲会报 `No such file or directory`；随时用 `cd ~` 代替硬编码用户名。

---

## 3. 安全增删改查：`touch`、`mkdir`、`cp`、`mv` 与 `rm` 防误删心法 (LNX-03)

文件操作是终端里最高频的动作，重点在于分清**选项行为**与**不可逆风险**。

### 1. 创建文件与目录：`touch` 与 `mkdir`

- **`touch`**：原本设计用于**刷新文件的时间戳**（修改时间 `mtime` 和访问时间 `atime`）；如果目标文件不存在，就顺手创建一个 0 字节空文件。
  - `-c`（`--no-create`）：仅刷新已存在文件的时间，不创建新文件。
  - `-t YYYYMMDDhhmm.ss`：伪造/指定修改时间（做测试或构建实验常用）。
- **`mkdir`**：创建目录。
  - `-p`（`--parents`）：**极高频参数**——一次性建多层嵌套目录（如 `mkdir -p a/b/c`），而且**如果目录已存在也不报错**（写自动化脚本必备）。
  - `-v`（`--verbose`）：每建一个目录都打印一条回执信息。
  - `-m 755`：创建时直接指定权限模式。

### 2. 复制与移动/重命名：`cp` 与 `mv`

| 命令与参数 | 核心作用 | 关键细节与差异 |
| --- | --- | --- |
| `cp src dst` | 复制普通文件 | 若 `dst` 是已存在文件则**静默覆盖**；若 `dst` 是目录则复制到 `dst/src` |
| `cp -r` / `-R` | **递归复制目录** | 复制文件夹**必须加 `-r`**，否则报 `omitting directory` |
| `cp -a` | 归档级复制（`-dR --preserve=all`） | **备份首选**：保留软链接本身、权限、时间戳与属主 |
| `cp -i` | 交互确认（interactive） | 覆盖前提示 `overwrite 'dst'?` |
| `cp -n` | 不覆盖（no-clobber） | 目标已存在时静默跳过 |
| `cp -u` | 更新复制（update） | 仅当源文件比目标更新（或目标不存在）时才复制 |
| `mv src dst` | **移动或重命名** | 同目录叫改名，跨目录叫移动；**移动目录不需要 `-r`** |
| `mv -i` / `-n` | 覆盖前确认 / 不覆盖 | 防止手滑把已有文件冲掉 |

**⚠️ `cp -r` 的经典路径陷阱**：假设目录 `dirA` 已存在：
- 若 `dirB` **不存在**，`cp -r dirA dirB` 会创建一个叫 `dirB` 的目录，内容和 `dirA` 一模一样。
- 若 `dirB` **已经存在**，`cp -r dirA dirB` 会把 `dirA` 放进 `dirB` 里面，变成 `dirB/dirA`！

### 3. `rmdir` 与 `rm`：为什么 Linux 终端删除不进回收站？

Windows 资源管理器点 Delete 时，只是把文件移到了 `$Recycle.Bin` 目录。而终端里的 `rm` 直接调用内核 `unlink()` 系统调用，**立刻把文件名从目录表里摘除**；一旦没有任何硬链接和打开的文件描述符指向它，数据块就会被标记为可复用——**没有"撤销"按钮**。

| 命令与参数 | 作用与危险等级 | 说明 |
| --- | --- | --- |
| `rmdir dir` | 安全删**空**目录 | 目录里有东西就拒绝删除，最安全 |
| `rm file` | 删除文件 | 对只读文件会提示确认 |
| `rm -i` | 逐个确认删除 | 删除前问 `remove regular file 'x'?` |
| `rm -I` | 批量安全确认 | 超过 3 个文件或加 `-r` 时只问一次，兼顾效率与安全 |
| `rm -r` | 递归删除目录及内容 | 可删非空目录 |
| `rm -f` | 强制删除（force） | 忽略不存在的文件、不提示、无视只读位——**慎用** |
| `rm -- -bad` | `--` 结束选项解析 | 删除名字以 `-` 开头的怪异文件（否则 `-bad` 会被当成参数选项） |

**防误删四大铁律（Trash Mindset）**：
1. **先 `ls` 预览再 `rm`**：用通配符删文件前，先把 `rm` 换成 `ls` 看一眼命中了谁（如先执行 `ls *.log.bak`，确认无误再按方向键上，把 `ls` 改成 `rm`）。
2. **绝不裸用未加引号的变量配合 `rm -rf`**：如果脚本里 `$DIR` 意外为空，`rm -rf $DIR/*` 会直接变成 **`rm -rf /*`** 毁灭整台系统！
3. **养成"废纸篓中转"习惯**：重要文件不确定还要不要时，先 `mkdir -p /tmp/trash && mv target /tmp/trash/`，或者安装 `trash-cli` 用 `trash-put` 替代 `rm`。
4. **永远把路径检查三遍再敲 `-rf`**，尤其是带空格或路径末尾带 `~`、`*` 的时候。

```bash
$ mkdir -pv ~/lab-ops/{src,backup}
mkdir: created directory '/home/alice/lab-ops'
mkdir: created directory '/home/alice/lab-ops/src'
mkdir: created directory '/home/alice/lab-ops/backup'

$ touch ~/lab-ops/src/main.cpp ~/lab-ops/src/util.hpp
$ cp -av ~/lab-ops/src ~/lab-ops/backup/
'/home/alice/lab-ops/src' -> '/home/alice/lab-ops/backup/src'
'/home/alice/lab-ops/src/main.cpp' -> '/home/alice/lab-ops/backup/src/main.cpp'
'/home/alice/lab-ops/src/util.hpp' -> '/home/alice/lab-ops/backup/src/util.hpp'

$ mv -i ~/lab-ops/src/util.hpp ~/lab-ops/src/helper.hpp
$ ls ~/lab-ops/src
helper.hpp  main.cpp

$ rm -I ~/lab-ops/backup/src/*.cpp
$ ls ~/lab-ops/backup/src
util.hpp
```

> **新手常见坑（LNX-03）**：
> 1. **移动目录想把 `file.txt` 放进不存在的 `bak/`**：敲 `mv file.txt bak`（没带斜杠且 `bak` 目录不存在），结果 `file.txt` 被改名成了叫 `bak` 的文件！**好习惯**：目标如果是目录，结尾显式带上 `/`（`mv file.txt bak/`），如果 `bak` 不存在，系统会明确报错 `Not a directory` 提醒你。
> 2. **`cp dir1 dir2` 忘记 `-r`**：直接报 `cp: -r not specified; omitting directory 'dir1'`。

---

## 4. 查看与分页浏览文件：`cat`、`tac`、`nl`、`head`、`tail` 与 `less` (LNX-04)

查看文件前先问自己一个问题：**"这个文件有多大？"** 对几十行的小配置用 `cat`，对几百 MB 的日志用 `cat` 会瞬间刷屏几分钟、甚至卡死 SSH 终端。

### 1. 全量与行号查看：`cat`、`tac`、`nl`

| 命令与参数 | 功能说明 | 典型场景与亮点 |
| --- | --- | --- |
| `cat file` | Concatenate，正序输出全部内容 | 查看小文件，或合并文件 `cat a.txt b.txt > all.txt` |
| `cat -n` / `cat -b` | 打印行号 | `-n` 所有行都编号；`-b` 跳过空行只编非空行 |
| `cat -A` | 等价于 `-vET`，**显形隐形字符** | 换行显示 `$`，Tab 显示 `^I`，Windows 回车 `\r` 显示 `^M`（排查 CRLF 神器） |
| `tac file` | `cat` 反过来拼——**从最后一行倒序打印到第一行** | 看日志时不用往下滚屏，最新的报错直接在顶部 |
| `nl file` | 专职行号工具 | 默认仅给非空行编号，支持 `-b a`（含空行）和 `-w 3`（号宽） |

### 2. 头尾截取与实时盯梢：`head` 与 `tail`

| 命令与参数 | 含义 | 说明 |
| --- | --- | --- |
| `head -n 5 file` | 看前 5 行 | 不写 `-n` 默认看前 10 行 |
| `head -c 64 file` | 看前 64 字节 | 粗略探测大文件头部 |
| `tail -n 20 file` | 看最后 20 行 | 默认最后 10 行 |
| **`tail -n +2 file`** | **从第 2 行开始直到末尾** | **超实用**：处理 CSV 时跳过第 1 行表头！ |
| **`tail -f app.log`** | **Follow 实时追踪文件追加内容** | 边跑服务边开另一个终端盯日志，按 `Ctrl+C` 退出 |
| **`tail -F app.log`** | 按文件名追踪（含重试） | 日志半夜被切割重建（logrotate）后依然能跟上新文件 |

### 3. 大文件分页器：`less` 生存快捷键

**"less is more"**：`less` 是从早期 `more` 进化而来的分页浏览器，它**按需读取屏幕可见的一页**，哪怕打开 10GB 的日志文件也能秒开。

| 在 `less` 里的按键 | 作用 | 记忆技巧 |
| --- | --- | --- |
| `空格` / `f` | 向下翻一整页 | **F**orward |
| `b` | 向上翻一整页 | **B**ackward |
| `j` / `k`（或上下方向键） | 向下 / 向上移动一行 | 和 Vim 一致 |
| `g` / `G` | 瞬间跳到文件第一行 / 最后一行 | 查最新日志：`less` 打开后直接按 `G` |
| `/关键词` + `Enter` | 向下搜索关键词 | 按 `n` 跳下一个，按 `N` 跳上一个 |
| `?关键词` + `Enter` | 向上搜索关键词 | |
| `-N`（在运行中输入） | 开关行号显示 | 或启动时 `less -N file` |
| `-S`（在运行中输入） | 长行不折行（水平截断，左右键看） | 看宽表格/长 JSON 不乱行 |
| `F` | 变成类似 `tail -f` 的实时追踪模式 | 按 `Ctrl+C` 恢复普通翻页 |
| **`q`** | **退出 `less`** | **Q**uit |

来看一个实操示例，制造带 Windows `\r\n` 的文件和普通 CSV，用这组命令挨个检验：

```bash
$ printf "id,level,msg\n1,INFO,boot ok\n2,WARN,disk 80%%\n3,ERROR,timeout\n" > app.csv
$ printf "hello\r\n" > win.txt

$ cat -A win.txt
hello^M$

$ nl -b a app.csv
     1	id,level,msg
     2	1,INFO,boot ok
     3	2,WARN,disk 80%
     4	3,ERROR,timeout

$ tac app.csv | head -n 2
3,ERROR,timeout
2,WARN,disk 80%

$ tail -n +2 app.csv
1,INFO,boot ok
2,WARN,disk 80%
3,ERROR,timeout
```

> **新手常见坑（LNX-04）**：
> 1. **用 `cat` 看二进制文件（如编译出的程序或图片）**：二进制里的控制字符会把终端编码搞乱，整个终端变成乱码框框。如果不小心中招，盲打 **`reset`** 回车即可恢复终端。看文件前养成先用 `file` 判断的习惯。
> 2. **把 `cat -A` 看到的 `^M$` 误以为真的有字符 `^` 和 `M`**：`^M` 是控制字符 `\r`（CR）的可视化表示，`$` 代表行尾 `\n`（LF）的位置，这正是 Windows 换行符在 Linux 里导致脚本报 `/bin/bash^M: bad interpreter` 的元凶。

---

## 5. 文件类型、元信息与体积统计：`file`、`stat`、`wc` 与 `du` (LNX-05)

在 Windows 里，把 `a.exe` 改名为 `a.txt`，双击就会当文本打开。**在 Linux 里，扩展名只是给人类看的便签**——内核和工具靠读取文件头部的**魔数（Magic Bytes）**以及**inode 元数据**来识别真相。

### 1. `file`：一眼识破文件真身

| 命令 / 参数 | 作用 | 示例输出关键词 |
| --- | --- | --- |
| `file target` | 检测文件真实类型与编码 | `ELF 64-bit LSB pie executable`、`ASCII text`、`UTF-8 Unicode text, with CRLF line terminators` |
| `file -i target` | 输出 MIME 类型与字符集 | `text/plain; charset=utf-8` |
| `file -L link` | 穿透软链接检测目标文件本身 | 不加 `-L` 只会报告 `symbolic link to ...` |

### 2. `stat`：打开 inode 身份证

Linux 中每个文件都有一张"身份证"叫 **inode**（索引节点），`stat` 把它完整摊开给你看，尤其要搞懂**三个时间戳**：
- **Access (`atime`)**：最后一次**读取**文件内容的时间（为了性能，现代挂载通常带 `relatime` 优化，不会每次读都更新）。
- **Modify (`mtime`)**：最后一次**修改文件内容**的时间（`ls -l` 默认显示的就是它）。
- **Change (`ctime`)**：最后一次**修改 inode 元数据**（权限 `chmod`、属主、链接数或内容修改）的时间。

### 3. `wc`：行数、词数、字节数统计

`wc`（Word Count）是写测试脚本做数据核对的常客。**注意 `-c` 与 `-m` 的区别**：一个中文汉字在 UTF-8 下占 3 个字节但算 1 个字符！

| 参数 | 统计项 | 说明 |
| --- | --- | --- |
| `-l` | 行数（Lines） | 实际统计换行符 `\n` 的个数（最后一行若无 `\n` 不会被算作一行！） |
| `-w` | 单词数（Words） | 以空白符分隔的词数 |
| `-c` | 字节数（Bytes） | 文件精确字节大小 |
| `-m` | 字符数（Chars） | 按当前 Locale（如 UTF-8）算出的字符个数 |

### 4. `du` vs `df`：磁盘空间到底去哪了？

- **`df -h`（Disk Free）**：看**整个挂载分区**总共多大、还剩多少空间。
- **`du`（Disk Usage）**：统计**目录和文件实际占用磁盘块**的大小。为什么一个 10 字节的文件，`ls -l` 显示 `10`，`du -h` 却显示 `4.0K`？因为磁盘分配最小单位通常是 4KB 的块（Block）；反过来，空洞文件（Sparse file）`ls -l` 看着有 1GB，`du` 可能只占 0 字节！

| `du` 常用参数 | 含义 | 推荐组合 |
| --- | --- | --- |
| `-h` | 人类可读单位（K/M/G） | 几乎必加 |
| `-s` | Summary，只看总计，不列出子目录明细 | `du -sh ~/projects` |
| `-d N` / `--max-depth=N` | 最多向下展开 N 层子目录 | `du -h -d 1 /var`（定位哪个目录爆满） |
| `-a` | 连普通文件也一并列出（默认只列目录） | `du -ah -d 1` |
| `--apparent-size` | 显示表观文件大小之和而非磁盘块占用 | 核对实际内容字节总和 |

实际跑一遍观察细节：

```bash
$ printf "你好\nhello\n" > sample.txt

$ file sample.txt
sample.txt: Unicode text, UTF-8 text

$ wc sample.txt
 2  2 13 sample.txt
$ wc -m sample.txt
9 sample.txt

$ stat sample.txt
  File: sample.txt
  Size: 13        	Blocks: 8          IO Block: 4096   regular file
Device: 8,32	Inode: 1029384     Links: 1
Access: (0644/-rw-r--r--)  Uid: ( 1000/   alice)   Gid: ( 1000/   alice)
Access: 2026-11-19 11:00:00.123456789 +0800
Modify: 2026-11-19 11:00:00.123456789 +0800
Change: 2026-11-19 11:00:00.123456789 +0800
 Birth: 2026-11-19 11:00:00.123456789 +0800

$ du -h sample.txt
4.0K	sample.txt
```

> **新手常见坑（LNX-05）**：
> 1. **看到 `ls -ld mydir` 显示 `4096` 以为目录里只有 4KB**：`ls -ld` 显示的 4096 只是**目录索引表本身**占的 1 个块，不代表里面所有文件的总和！查目录总大小必须用 **`du -sh mydir`**。
> 2. **用 `wc -l` 统计没有结尾换行符的文件**：`printf "one_line"`（结尾没有 `\n`）用 `wc -l` 会输出 **`0`**！这是 C/POSIX 工具对"行（Line）"的严格定义（以 `\n` 结尾）。
> 3. **用 `wc -c` 数中文字符数**：`"你好\n"` 是 `3 + 3 + 1 = 7` 字节（`-c`），但只有 `3` 个字符（`-m`）。

---

## 6. 硬链接与软链接：inode 本质、`ln -s` 与 `readlink` (LNX-06)

理解链接之前，必须先建立 Linux 文件系统最底层的真相：**文件名并不等于文件本身**。

```text
目录项表 (Directory Entry)          Inode (元数据身份证)          Data Blocks (磁盘真实数据)
┌─────────────────────────┐       ┌─────────────────────┐       ┌────────────────────────┐
│ origin.txt  ──► #52010  │──────►│ Inode #52010        │──────►│ "Hello Linux Content"  │
│ hard.txt    ──► #52010  │──────►│ Links: 2            │       └────────────────────────┘
└─────────────────────────┘       │ Size: 20, Mode: 644 │
                                  └─────────────────────┘
┌─────────────────────────┐
│ soft.txt    ──► #52011  │──────► Inode #52011 (l) ──► 存储纯文本路径字符串: "origin.txt"
└─────────────────────────┘
```

### 硬链接（Hard Link）vs 软链接（Symbolic Link）

- **硬链接 (`ln target link_name`)**：给同一份 `inode` **多起一个别名**。两个名字地位完全平等，不存在"谁是谁的快捷方式"，`inode` 上的链接计数 `Links` 变成 `2`。删除其中任意一个，只是让计数减 1；只有当 `Links` 降到 `0`（且没有进程还打开着它）时，磁盘数据才真正释放。
- **软链接 / 符号链接 (`ln -s target link_name`)**：一个独立的特殊小文件（`ls -l` 第一位是 `l`），里面只存了一串**目标路径文字**（相当于高级版 Windows 快捷方式）。访问它时，内核会自动把路径替换成里面存的字符串再去查找。

| 对比维度 | 硬链接 `ln A B` | 软链接 `ln -s A B` |
| --- | --- | --- |
| **Inode 编号** | 与源文件**完全相同** | 拥有自己**独立的新 inode** |
| **跨硬盘/跨分区** | ❌ 不支持（不同分区 inode 编号不互通） | ✅ 支持（只存路径字符串） |
| **链接到目录** | ❌ 不允许（防止目录树成环死循环） | ✅ 完全支持（系统常见如 `/bin -> usr/bin`） |
| **删除源文件 A 后** | **B 照常能读**，数据安然无恙 | **B 变成悬空死链（Dangling Link）**，打开报 `No such file` |
| **`ls -l` 表现** | 普通文件 `-`，链接数 `+1` | 首字母 `l`，右侧显示 `B -> A` |
| **工程常见用途** | 增量快照备份（`rsync --link-dest`）、防止误删 | 版本切换（`python -> python3.12`）、配置文件集中管理 |

### 必须牢记的两个救命细节

1. **软链接相对路径的参照物陷阱**：执行 `ln -s target subdir/link` 时，**`target` 是相对于软链接所在目录 `subdir/` 解析的，而不是相对于你当前站立的 `cwd`！** 如果你在家目录敲 `ln -s foo.txt sub/link`，那 `sub/link` 会去找 `sub/foo.txt`（不存在！直接变死链）。**防坑做法**：要么目标写绝对路径 `ln -s "$(pwd)/foo.txt" sub/link`，要么先 `cd sub` 再 `ln -s ../foo.txt link`（或使用 GNU `ln -sr` 自动计算相对路径）。
2. **`readlink` 与 `readlink -f`**：
   - `readlink link`：直接打印软链接内部保存的那串目标字符串（原样返回，哪怕指向不存在的路径）。
   - **`readlink -f path`**（等价于 `realpath path`）：递归追踪所有嵌套软链接，**还原出最底层的规范绝对路径**。

动手用 `ls -li`（`-i` 显示 inode 号）亲眼验证一遍：

```bash
$ mkdir -p ~/lab-link && cd ~/lab-link
$ echo "vital data" > origin.txt
$ ln origin.txt hard.txt
$ ln -s origin.txt soft.txt

$ ls -li
total 8
1572901 -rw-r--r-- 2 alice alice 11 Nov 19 11:20 hard.txt
1572901 -rw-r--r-- 2 alice alice 11 Nov 19 11:20 origin.txt
1572902 lrwxrwxrwx 1 alice alice 10 Nov 19 11:20 soft.txt -> origin.txt

$ readlink soft.txt
origin.txt
$ readlink -f soft.txt
/home/alice/lab-link/origin.txt

$ rm origin.txt
$ cat hard.txt
vital data
$ cat soft.txt
cat: soft.txt: No such file or directory
```

> **新手常见坑（LNX-06）**：
> 1. **删除指向目录的软链接时，按 `Tab` 自动补全多了一个尾斜杠 `/`**：`rm my_dir_link/` 会被理解成操作目标目录内部（直接报 `cannot remove 'my_dir_link/': Is a directory`；如果是 `rm -rf my_dir_link/` 甚至可能把原目录里的文件全清空！）。**铁律：删目录软链接永远不要带末尾斜杠，写 `rm my_dir_link` 或 `unlink my_dir_link`。**
> 2. **做相对软链接变红/变死链**：记住 `ln -s <这里写站在链接位置看到的路径> <链接位置>`。

---

## 7. 通配符与花括号展开：Shell 在命令执行前做了什么 (LNX-07)

初学者最容易搞混的一点：**`ls *.txt` 里的 `*` 不是 `ls` 自己展开的，而是 Bash Shell 在启动 `ls` 之前先帮它展开成了多个参数！** 你可以通过 `echo` 来透视 Shell 真正递给命令的东西。

### 1. 花括号展开（Brace Expansion）：纯字符串生成器

花括号 `{...}` **完全不看硬盘上有没有这些文件**，它只是一台单纯的文本排列组合生成器，且运行在所有展开的最早阶段。

| 写法 | 展开结果 | 高频实战场景 |
| --- | --- | --- |
| `{a,b,c}` | `a b c` | `cp config.yml{,.bak}` → 展开为 `cp config.yml config.yml.bak`（神级省事备份！） |
| `src/{core,net,ui}` | `src/core src/net src/ui` | `mkdir -p app/{src,include,tests,build}` 一条命令建整套工程骨架 |
| `{1..5}` | `1 2 3 4 5` | 批量造测试数据：`touch day_{1..5}.log` |
| `{01..10}` | `01 02 03 ... 10` | **自动补零对齐**，保证文件名排序不错乱 |
| `{1..10..2}` | `1 3 5 7 9` | 带步长序列；也支持字母 `{a..e}` |

### 2. 通配符（Globbing / Pathname Expansion）：匹配现存文件

只有当硬盘上**真的存在**匹配的文件时，通配符才会替换成文件名列表：

| 通配符 | 匹配规则 | 示例与注意 |
| --- | --- | --- |
| `*` | 匹配**0 个或多个任意字符** | `*.cpp` 匹配 `a.cpp`、`main.cpp`，但**默认不匹配 `.hidden.cpp`**（`.` 开头需显式 `.*`） |
| `?` | 匹配**恰好 1 个任意字符** | `log_?.txt` 匹配 `log_1.txt`，**不匹配** `log_10.txt` 和 `log_.txt` |
| `[abc]` | 匹配括号内的**任意 1 个字符** | `app_[12].log` 匹配 `app_1.log`、`app_2.log` |
| `[0-9]` / `[a-z]` | 匹配字符范围内的**任意 1 个字符** | `data_[0-9][0-9].csv` |
| `[!0-9]` / `[^0-9]` | **取反**：匹配不在这个范围的 1 个字符 | `[!.]*` 匹配非点号开头的任意文件 |
| `**`（需 `shopt -s globstar`） | 跨越多级子目录递归匹配 | `ls **/*.cpp`（默认 Bash 关闭，开启后生效） |

**如果通配符一个文件都没匹配到会怎样？** Bash 默认把原模原样的字符串（比如 `*.xyz`）传给命令，于是 `ls *.xyz` 报错 `cannot access '*.xyz'`。（如果在脚本中希望没匹配到就变成空列表，可开启 `shopt -s nullglob`）。

```bash
$ mkdir -p ~/lab-glob && cd ~/lab-glob
$ mkdir -p project/{src,tests,docs}
$ ls
project

$ touch log_{01..05}.txt note_{a,b}.md .secret.txt
$ echo log_*.txt
log_01.txt log_02.txt log_03.txt log_04.txt log_05.txt

$ echo log_0[2-4].txt
log_02.txt log_03.txt log_04.txt

$ echo log_0[!3].txt
log_01.txt log_02.txt log_04.txt log_05.txt

$ echo *.xyz
*.xyz
```

> **新手常见坑（LNX-07）**：
> 1. **把 Glob 通配符和正则表达式（Regex）混为一谈**：在通配符里 `*` 表示"任意字符序列"（等价于正则的 `.*`）；在正则里 `*` 表示"前一个字符重复 0 次或多次"。`ls`/`cp`/`find -name` 用的是 **Glob**，`grep`/`sed` 用的是 **Regex**，切勿混用！
> 2. **花括号里手滑加了空格**：写成 `{a, b}`（逗号后有空格）会直接失效，原样输出 `{a,` 和 `b}`。花括号内部逗号两边**绝对不能有空格**（除非用引号保护单项）。
> 3. **以为 `{1..$n}` 能用变量**：花括号展开先于变量替换执行，`$n` 当时还没被替换，只能输出字面量 `{1..5}`；动态序列循环请用 `seq 1 "$n"` 或 C 风格 `for ((i=1; i<=n; i++))`。

---

## 8. 联机帮助与命令定位：`man`、`info`、`which`、`type` 与 `whatis` (LNX-08)

Linux 拥有数百个命令和数千个参数，**专业工程师绝不靠死记硬背参数**，而是靠内置的三层离线检索体系：先查命令本质，再看一句话摘要，最后翻完整手册。

### 1. 这个命令到底是什么：`type` 与 `which`

在终端敲 `cd` 或 `ls` 时，它们其实分属不同"物种"（Shell 内建命令、别名、外部磁盘程序）。用错工具会查不到它们：

| 命令 | 能力范围 | 输出示例 | 何时用 |
| --- | --- | --- | --- |
| **`type cmd`** | **全能探测器**（识别别名、函数、Shell 内建、关键字、外部路径） | `cd is a shell builtin`、`ll is aliased to 'ls -la'` | **首选**！想搞清某个命令从哪来 |
| `type -a cmd` | 列出所有同名候选（如内建 vs 外部程序） | `echo is a shell builtin` + `/usr/bin/echo` | 排查优先级冲突 |
| `which cmd` | 只在 `$PATH` 环境变量路径里找外部可执行程序 | `/usr/bin/ls`（查 `cd` 会失败或找不到） | 确认调用的二进制具体路径 |
| `command -v cmd` | POSIX 标准的 `which` + `type` 轻量替代 | `/usr/bin/ls` | 写可移植 Shell 脚本检测工具是否存在 |

### 2. 查手册：`whatis`、`apropos`、`--help` 与 `man` 九大分区

- **`whatis <name>`**（等价 `man -f`）：一句话看懂命令是干嘛的。
- **`apropos <keyword>`**（等价 `man -k`）：忘了命令叫啥名字时，按关键词反查（比如 `apropos "compress"`）。
- **`help <builtin>`**：查 Bash **内建命令**（如 `help cd`、`help [[`、`help export`），比去 `man bash` 大海捞针快 100 倍。
- **`cmd --help` / `-h`**：快速扫一眼命令常用选项摘要。
- **`man [section] <name>`**：Linux 最权威的离线手册。**重点：手册分为 9 个编号分区**，很多名字在命令和 C 函数里重复（比如 `printf`、`open`、`stat`、`passwd`），不指定分区号默认只显示排在最前面的！

| `man` 分区号 | 内容类别 | 典型代表 |
| --- | --- | --- |
| **1** | 普通用户命令与 Shell 工具 | `man 1 ls`、`man 1 printf` |
| **2** | **Linux 内核系统调用（System Calls）** | **`man 2 open`**、`man 2 read`、`man 2 fork` |
| **3** | **C 标准库函数（Library Calls）** | **`man 3 printf`**、`man 3 fopen`、`man 3 malloc` |
| **5** | 配置文件格式与约定 | `man 5 passwd`、`man 5 crontab` |
| **7** | 宏观概念、协议、正则与编码综述 | `man 7 regex`、`man 7 signal`、`man 7 epoll` |
| **8** | 系统管理员命令（通常需 root） | `man 8 mount`、`man 8 useradd` |

**`man` 界面怎么看与怎么翻**（底层直接调用 `less`，按键完全通用）：
- 翻页/搜索/退出：`/关键字` + `n` 下一个，`q` 退出。
- 读懂 `SYNOPSIS`（语法摘要）：`[ ]` 表示**可选**，`...` 表示**可重复多个**，`a | b` 表示**二选一**，粗体字原样照敲，下划线/斜体替换成你的参数。

### 3. `info`：GNU 超链接详尽文档

对于 `coreutils`、`gcc`、`bash`、`sed`、`awk` 等 GNU 核心工具，`man` 有时只给精简大纲，最详尽的教程放在 **`info`** 里（如 `info coreutils`、`info bash`）。常用按键：`Enter` 跳入带 `*` 的超链接，`u` 返回上一层，`n`/`p` 下一节/上一节，`q` 退出。

```bash
$ type -a echo cd ls
echo is a shell builtin
echo is /usr/bin/echo
cd is a shell builtin
ls is aliased to `ls --color=auto'
ls is /usr/bin/ls

$ whatis printf
printf (1)           - format and print data
printf (3)           - formatted output conversion

$ help cd | head -n 3
cd: cd [-L|[-P [-e]] [-@]] [dir]
    Change the shell working directory.
```

> **新手常见坑（LNX-08）**：
> 1. **查 C++ / C 的 `open`、`read`、`printf` 时直接敲 `man open` 或 `man printf`**：`man printf` 默认打开分区 1（Shell 的 `printf` 命令），看到的不是 `<stdio.h>` 的 `printf`！写系统代码务必养成加分区号的习惯：**`man 2 open`**、**`man 3 printf`**。
> 2. **在 `man` 里找 `cd` 的用法**：`man cd` 要么报错 `No manual entry`，要么跳进几千行的 `bash-builtins`。Bash 内建命令直接用 **`help cd`**。
> 3. **最小化容器或精简 WSL 镜像里 `whatis` 提示 `nothing appropriate`**：说明 `mandb` 索引还没生成，运行一次 `sudo mandb` 即可；精简容器可能裁剪了文档，可用 `unminimize` 或看 `--help`。

---

## 9. 终端文本编辑器生存指南：Nano 与 Vim (LNX-09)

哪怕平时主要用 VS Code Remote-WSL 写大项目，你也**必须**会用至少一种终端编辑器——因为一旦你要改 `/etc/hosts`、`sudo visudo`、远程 SSH 修配置或在 Docker 容器里救急，图形界面根本连不上来。

### Part A：Nano —— 3 分钟零门槛上手

Nano 的所有快捷键都直接写在屏幕最底部的两行提示栏里，你只需认识两个符号：
- **`^X`**：表示 **`Ctrl + X`**
- **`M-U`**：表示 **`Alt + U`**（Meta 键，Mac 上有时是 `Esc` 后松手再按 `U`）

| Nano 快捷键 | 含义（底部英文对照） | 实战用法 |
| --- | --- | --- |
| 打开编辑 | `nano file.txt` | 直接进入编辑状态，方向键移动、打字即输入 |
| **`Ctrl + O`** | Write Out（**保存**） | 按完后底部会确认文件名，**必须再按一次 `Enter`** 才算存盘 |
| **`Ctrl + X`** | Exit（**退出**） | 如有未保存修改，问 `Save modified buffer?`，按 `Y`（保存）或 `N`（放弃） |
| `Ctrl + W` / `Alt + W` | Where Is（搜索 / 下一个） | 输入词回车定位 |
| `Ctrl + K` / `Ctrl + U` | Cut（剪切整行） / Uncut（粘贴） | 连续按 `Ctrl+K` 可剪切多行 |
| `Alt + U` / `Alt + E` | Undo（撤销） / Redo（重做） | 改错了随时撤回 |
| `Ctrl + _`（`Ctrl+Shift+-`） | Go to line（跳转行号） | 输入 `42` 回车直达第 42 行 |

### Part B：Vim —— 模式思维与绝地求生

新手第一次打开 `vi` / `vim` 之所以绝望，是因为不知道 Vim 有**模式（Mode）**的概念：**刚打开时处于 Normal（普通/命令）模式，键盘上的每个字母都是指令而不是输入字符**！

```text
          按 i / a / o 等
  ┌──────────────────────────► [ Insert 插入模式 ] (像记事本一样打字)
  │                                    │
  │               按 Esc 键            │
  ▼                                    ▼
[ Normal 普通模式 ] ◄──────────────────┘
  │         ▲
  │ 按 : 或 / │ 按 Enter 执行或 Esc 取消
  ▼         │
[ Command-line 底线命令模式 ] (输入 :w, :q, :q!, :%s/a/b/g, /search)
```

先把这张**Vim 生存与高频操作表**练熟，足以应对 95% 的服务器改配置场景：

| 类别 | 按键（均在 **Normal 模式**，不确定就先按两下 `Esc`） | 作用 |
| --- | --- | --- |
| **进输入模式** | `i` / `a` | 在光标**前**插入 / 在光标**后**追加 |
| | `o` / `O` | 在当前行**下方** / **上方**新开一行并输入 |
| **光标移动** | `h` `j` `k` `l`（或方向键） | 左、下、上、右 |
| | `0` / `$` | 跳到本行行首 / 行尾 |
| | `w` / `b` | 向前 / 向后跳一个单词 |
| | `gg` / `G` | 跳到整个文件第一行 / 最后一行 |
| | `:25` + `Enter` | 跳到第 25 行（先 `:set number` 可显行号） |
| **删除复制撤销** | `x` | 删除光标下 1 个字符 |
| | `dd` / `3dd` | 剪切（删除）当前行 / 往下 3 行 |
| | `yy` / `p` | 复制当前行 / 粘贴到下一行 |
| | `u` / `Ctrl + r` | 撤销（Undo）/ 重做（Redo） |
| **查找与替换** | `/word` + `Enter` | 向下搜索 `word`，按 `n` 下一个、`N` 上一个 |
| | `:%s/old/new/g` + `Enter` | 把全文所有 `old` 替换成 `new` |
| **保存与退出** | **`:w`** + `Enter` | 保存（Write） |
| | **`:wq`** 或 **`:x`** + `Enter` | 保存并退出 |
| | **`:q`** + `Enter` | 未修改时直接退出 |
| | **`:q!`** + `Enter` | **不保存强制退出**（改乱文件时的救命稻草！） |

体验一次标准的 Vim 救急改配置流程：

```bash
$ cp /etc/hosts ~/hosts.test
$ vim ~/hosts.test
# 1. 按 G 跳到最后一行
# 2. 按 o 在下方新开一行，输入: 127.0.0.1   local-dev.test
# 3. 按 Esc 回到 Normal 模式
# 4. 输入 :wq 回车保存退出

$ tail -n 1 ~/hosts.test
127.0.0.1   local-dev.test
```

> **新手常见坑（LNX-09）**：
> 1. **在 Insert 模式里狂敲 `:wq`**：结果文本里多了一串 `:wq`，就是退不出去！**口诀：不知所措先按 `Esc`，看屏幕左下角 `-- INSERT --` 消失后再敲 `:wq` 或 `:q!`。**
> 2. **习惯性按 `Ctrl + S` 保存导致整个终端假死**：在传统终端里 `Ctrl + S` 是流控暂停键（XOFF），屏幕彻底不动。别慌，按 **`Ctrl + Q`**（XON）立刻解冻！
> 3. **打开文件提示 `Found a swap file by the name ".foo.swp"`**：说明上次终端意外断线没正常退出。如果确定没有另一个 Vim 窗口在编辑它，按 `R` 恢复或按 `E` 忽略后删掉 `.foo.swp` 即可。

---

## 10. 综合微练习与标准输出核对 (LNX-10)

请打开 Ubuntu（或 WSL2）终端，**亲手敲一遍**下面 5 组练习。先自己预测或写出命令，再点开折叠答案逐行核对输出。

### 练习 1：FHS、绝对/相对路径与工程骨架搭建（LNX-01 ~ LNX-03, LNX-07）

在你的家目录下一次性建立实验目录 `~/linux-stage1`，内部同时包含 `src`、`logs`、`backup` 三个子目录，并在 `logs` 里用花括号展开生成 `day_01.log` 到 `day_03.log`。然后进入 `~/linux-stage1/logs`，仅用**相对路径**把 `day_01.log` 复制到 `backup/` 下并改名为 `day_01.log.bak`，最后用 `cd -` 跳回切换前的目录并打印 `pwd`。

<details>
<summary>核对答案与预期输出</summary>

```bash
$ mkdir -p ~/linux-stage1/{src,logs,backup}
$ touch ~/linux-stage1/logs/day_{01..03}.log
$ cd ~/linux-stage1/logs
$ cp day_01.log ../backup/day_01.log.bak
$ ls ../backup
day_01.log.bak

$ cd -
/home/alice
$ pwd
/home/alice
```

</details>

### 练习 2：隐形换行符侦查与头尾截取（LNX-04, LNX-05）

运行下面这行命令构造一个混合文件：
```bash
printf "name,score\r\nalice,95\r\nbob,88\r\n" > ~/linux-stage1/scores.csv
```
请问：
1. 用什么命令能直接肉眼看见每行末尾隐藏的 `\r`？
2. `wc -l` 和 `wc -c` 对 `scores.csv` 分别输出多少？
3. 如何只打印去掉表头后的后两行数据？

<details>
<summary>核对答案与预期输出</summary>

```bash
$ cat -A ~/linux-stage1/scores.csv
name,score^M$
alice,95^M$
bob,88^M$

$ wc -l -c ~/linux-stage1/scores.csv
 3 30 /home/alice/linux-stage1/scores.csv

$ tail -n +2 ~/linux-stage1/scores.csv
alice,95
bob,88
```
解释：每行结尾多了一个 `\r`（1 字节，显示为 `^M`），所以 3 行共 `12 + 10 + 8 = 30` 字节。`tail -n +2` 从第 2 行开始输出，跳过 CSV 表头。

</details>

### 练习 3：硬链接、软链接与 inode 生存对比（LNX-06）

在 `~/linux-stage1/src` 中创建 `config.ini`（写入一行 `port=8080`），在同目录建一个硬链接 `config.hard`，在 `~/linux-stage1/backup` 目录里建一个指向 `config.ini` 的**软链接** `config.sym`（保证跨目录不变成死链！）。然后删除 `config.ini`，验证 `config.hard`、`config.sym` 和 `readlink -f` 的表现。

<details>
<summary>核对答案与预期输出</summary>

```bash
$ cd ~/linux-stage1/src
$ echo "port=8080" > config.ini
$ ln config.ini config.hard
$ ln -s ../src/config.ini ../backup/config.sym

$ ls -li config.ini config.hard ../backup/config.sym
1573101 -rw-r--r-- 2 alice alice 10 Nov 19 12:00 config.hard
1573101 -rw-r--r-- 2 alice alice 10 Nov 19 12:00 config.ini
1573108 lrwxrwxrwx 1 alice alice 17 Nov 19 12:00 ../backup/config.sym -> ../src/config.ini

$ readlink -f ../backup/config.sym
/home/alice/linux-stage1/src/config.ini

$ rm config.ini
$ cat config.hard
port=8080
$ cat ../backup/config.sym
cat: ../backup/config.sym: No such file or directory
```
注意：`ln -s` 时写的目标 `../src/config.ini` 是站在 `../backup/` 目录下看到的相对路径（或者直接写绝对路径 `~/linux-stage1/src/config.ini` 展开后的路径）。

</details>

### 练习 4：通配符精确筛选（LNX-07）

假设当前目录有以下文件：`log_1.txt`、`log_2.txt`、`log_10.txt`、`log_a.txt`、`.log_secret.txt`。请问 `ls log_[0-9].txt` 和 `ls log_?.txt` 各自会输出哪些文件？为什么没有匹配到 `log_10.txt` 和 `.log_secret.txt`？

<details>
<summary>核对答案与预期输出</summary>

- `ls log_[0-9].txt` 输出：`log_1.txt  log_2.txt`（`[0-9]` 只匹配单个数字字符，因此不匹配两位数的 `10` 和字母 `a`）。
- `ls log_?.txt` 输出：`log_1.txt  log_2.txt  log_a.txt`（`?` 匹配恰好 1 个任意字符，仍不匹配 `10`）。
- `.log_secret.txt` 以 `.` 开头（隐藏文件），且前缀多了 `.`，所以两个模式都不会匹配它。

</details>

### 练习 5：命令溯源、手册分区与 Vim 实操（LNX-08, LNX-09）

1. 分别运行 `type cd`、`type ls`、`which ls`，观察区别。
2. 你想在 C++ 程序里查 POSIX `stat` 系统调用的返回值和头文件，直接敲 `man stat` 为什么不对？应该敲什么？
3. 用 `vim ~/linux-stage1/notes.txt` 写入两行内容保存退出；再打开它，故意乱删一行后不保存强退，确认文件内容仍保持刚才保存的样子。

<details>
<summary>核对答案与预期输出</summary>

1. `type cd` 输出 `cd is a shell builtin`（Shell 内建命令）；`type ls` 输出 `ls is aliased to 'ls --color=auto'`（或真实路径）；`which ls` 输出外部二进制路径 `/usr/bin/ls`。
2. `man stat` 默认打开分区 1（命令行工具 `stat` 的用法）。系统调用位于分区 2，必须敲 **`man 2 stat`**。
3. Vim 流程：
   - `vim ~/linux-stage1/notes.txt` → 按 `i` 输入两行 → `Esc` → `:wq` 回车。
   - 再次 `vim ~/linux-stage1/notes.txt` → 按 `dd` 删掉一行 → `Esc` → **`:q!`** 回车强制放弃修改并退出。
   - 运行 `cat ~/linux-stage1/notes.txt` 验证两行内容完好无损。

</details>

---

## 下一步怎么走

打通了文件系统、路径、链接、通配符和编辑器之后，下一课 [Linux 文本处理、I/O 重定向、管道与 Shell 脚本编程 (LNX-11 ~ LNX-22)](../linux-text-shell/) 将把这些孤立的命令用**重定向与管道**串成数据流水线，带你实战 `grep`、`find`、`sed`、`awk` 和防御式 Bash 脚本！
