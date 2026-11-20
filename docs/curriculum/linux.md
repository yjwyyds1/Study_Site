# Linux 实践与系统开发（LNX）

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

从零基础小白第一次打开终端起步，全面覆盖目录导航、文件增删改查、文本处理三剑客、Shell 脚本、用户与权限、进程与服务、网络诊断、POSIX 系统调用以及 ELF/strace/GDB 底层调试，共计 **52 节（LNX-01 ~ LNX-52）**。

| LogScan 里程碑 | 本课接入点 |
| --- | --- |
| [v0 单文件统计](../../src/content/labs/logscan.md) | 捕获 stdout/stderr 与退出码 |
| [v0.1 多文件工程](../../src/content/labs/logscan-build.md) | 在 Linux 分离构建目录验证 CTest |
| [v2 本地可查询归档](../../src/content/labs/logscan-v2.md) | 配合 `sqlite3` 与 `/proc` 观察持久化性能 |
| [v3 有界 TCP 服务](../../src/content/labs/logscan-service.md) | 配合 `ss`/`tcpdump`/`strace` 排查真实服务问题 |

## 第一篇 Linux 零基础与日常命令全攻略（LNX-01 ~ LNX-10）

### 目录树、基础操作与编辑帮助

- 入口：无 Linux 经验，刚打开 Ubuntu 或 WSL2 黑窗口。
- 能力：熟练完成目录切换、安全增删改查、分页看大日志、软硬链接与终端编辑。

<a id="lnx-01"></a>

#### LNX-01 Linux FHS 目录树与 WSL2 跨界路径

- 先修：[ENG-01](engineering.md#eng-01)
- 状态：已有[Linux 零基础全命令第 0 课：目录导航、文件操作与编辑器生存指南](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. 一切皆文件的倒挂树 `/` 与 `/home`/`/etc`/`/var`/`/tmp`/`/proc`
  2. 原生 Linux 路径 vs WSL2 挂载 `/mnt/c/...` 性能差异
  3. 区分大小写与独立工作目录习惯

<a id="lnx-02"></a>

#### LNX-02 工作目录导航：pwd、ls 与 cd 相对/绝对路径

- 先修：[LNX-01](#lnx-01)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. 绝对路径 `/...` 与相对路径 `.` / `..` / `~` / `-`
  2. `ls -la`、`-lh`、`-lt`、`ls -lrt` 实战组合
  3. Tab 自动补全习惯防拼写出错

<a id="lnx-03"></a>

#### LNX-03 安全增删改查：touch、mkdir、cp、mv 与 rm 防误删

- 先修：[LNX-02](#lnx-02)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. `touch` 新建/改时间戳与 `mkdir -p` 递归建目录
  2. `cp -r` / `-a` 复制与 `mv` 移动/重命名
  3. 为何 `rm` 不进回收站，以及 `rm -i` 与先行 `ls` 防误删心法

<a id="lnx-04"></a>

#### LNX-04 查看与分页浏览：cat、tac、nl、head、tail 与 less

- 先修：[LNX-03](#lnx-03)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. `cat`/`tac`/`nl` 看小文件与行号
  2. `head -n` 看开头与 `tail -f` 实时滚动盯线上日志
  3. 用 `less` 分页阅读 GB 级大文件（`/搜索`、`G`/`g`、`q` 退出）

<a id="lnx-05"></a>

#### LNX-05 文件类型、元信息与统计：file、stat、wc 与 du

- 先修：[LNX-04](#lnx-04)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. 不靠后缀靠魔数：用 `file` 辨别真文本/ELF/CRLF
  2. `stat` 读懂 `atime`/`mtime`/`ctime` 与 inode 编号
  3. `wc -l/-w/-c` 行数词数统计与 `du -sh` 查目录体积

<a id="lnx-06"></a>

#### LNX-06 硬链接与软链接：inode 本质、ln -s 与 readlink

- 先修：[LNX-05](#lnx-05)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. 文件名与 inode 门牌号分离模型
  2. 硬链接（共享引用计数）vs 软链接 `ln -s`（跨盘快捷方式）
  3. `readlink -f` 解析真实路径与悬空断链排查

<a id="lnx-07"></a>

#### LNX-07 通配符与花括号展开：Shell 预处理机制

- 先修：[LNX-02](#lnx-02)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. Glob 通配符 `*`、`?`、`[a-z]` 与隐藏文件默认不匹配规则
  2. 花括号展开 `{a,b}` 与 `{1..10}` 批量建文件/备份
  3. 先用 `echo` 预演展开结果再执行危险命令

<a id="lnx-08"></a>

#### LNX-08 联机帮助与定位：man、info、which、type 与 whatis

- 先修：[LNX-01](#lnx-01)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. `man` 手册章节号约定（1 命令 vs 2 系统调用 vs 3 库函数）
  2. `which`、`whereis`、`type -a` 分辨内置命令/别名/PATH 可执行文件
  3. `--help`、`whatis` 与 `apropos` 关键词搜命令

<a id="lnx-09"></a>

#### LNX-09 终端编辑器生存指南：Nano 与 Vim

- 先修：[LNX-03](#lnx-03)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. 新手友好的 Nano 编辑与保存退出快捷键
  2. Vim 三大核心模式（Normal / Insert / Command）彻底告别卡死
  3. 高频操作：`i/a`、`Esc`、`:wq`/`:q!`、`/搜索`、`dd/yy/p/u`

<a id="lnx-10"></a>

#### LNX-10 第一篇综合微练习与核对

- 先修：[LNX-01](#lnx-01) ~ [LNX-09](#lnx-09)
- 状态：已有[Linux 零基础全命令第 0 课](../../src/content/handbook/linux-zero-start.md)。
- 小节
  1. 目录创建、软硬链接对照与清理演练
  2. 结合通配符、`wc`、`head/tail` 筛选日志
  3. 常见报错对照检查清单

## 第二篇 文本处理三剑客、管道与 Shell 编程（LNX-11 ~ LNX-22）

### 重定向、文本过滤与自动化脚本

<a id="lnx-11"></a>

#### LNX-11 标准流与 I/O 重定向：0/1/2 与顺序陷阱

- 先修：[LNX-04](#lnx-04)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. `0 (stdin)`、`1 (stdout)`、`2 (stderr)` 三条通道分离
  2. `>` 覆盖、`>>` 追加、`2>` 分流与 `/dev/null` 黑洞
  3. `> out.log 2>&1` 与 `2>&1 > out.log` 从左到右顺序天壤之别

<a id="lnx-12"></a>

#### LNX-12 管道、分流与参数构造：|、tee 与 xargs

- 先修：[LNX-11](#lnx-11)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 管道 `|` 连接前输出与后输入，以及 `PIPESTATUS` 坑
  2. `tee -a` 既看屏幕又存日志的双路分流
  3. `xargs -0` 配合空字符消灭含空格文件名裂开漏洞

<a id="lnx-13"></a>

#### LNX-13 文本搜索之王：grep 与正则表达式入门

- 先修：[LNX-12](#lnx-12)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 高频选项 `-i`、`-n`、`-v`、`-r`、`-E`、`-C`（上下文行）
  2. 锚点 `^ $`、字符类 `[0-9]`、量词 `* + ?` 正则基础
  3. 递归检索代码与排查多日志报错实操

<a id="lnx-14"></a>

#### LNX-14 文件系统检索：find 精准查找与批量动作

- 先修：[LNX-05](#lnx-05)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 按名字 `-name/-iname`、类型 `-type f/d`、体积 `-size` 与修改时间 `-mtime` 查找
  2. `-print0 | xargs -0` 安全处理带空格深路径
  3. `-exec ... {} +` 原地批量统计、清理临时构建产物

<a id="lnx-15"></a>

#### LNX-15 行列拆解与统计：cut、sort、uniq、tr 与 paste

- 先修：[LNX-13](#lnx-13)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. `cut -d -f` 切列与 `tr` 字符替换/删 `\r`（CRLF→LF）
  2. `sort -n/-r/-k` 数字与多列排序
  3. 为何 `uniq -c` 前必须先 `sort`：经典日志 Top-N 一行流

<a id="lnx-16"></a>

#### LNX-16 流式编辑器 sed：替换、筛选与原地修改

- 先修：[LNX-13](#lnx-13)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. `s/old/new/g` 替换与改用 `#` 分隔符防路径斜杠转义地狱
  2. 行号范围与正则选行打印（`-n '/pat/p'`）、删行（`/pat/d`）
  3. `sed -i.bak` 带备份安全原地改配置

<a id="lnx-17"></a>

#### LNX-17 结构化处理神器 awk：列提取与聚合报表

- 先修：[LNX-15](#lnx-15)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. `pattern { action }` 模式与 `$0`/`$1`/`NF`/`NR`/`FS` 内建变量
  2. `BEGIN` / `END` 统计均值、求和与过滤高耗时请求
  3. 关联数组按错误码分组计数

<a id="lnx-18"></a>

#### LNX-18 归档与压缩：tar、gzip、xz 与 zip/unzip

- 先修：[LNX-03](#lnx-03)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 打包（`tar`）与压缩（`.gz`/`.xz`/`.zst`）概念拆分
  2. `-czf` 打包压缩、`-tf` 不解压预览、`-xzf -C` 解压到指定目录
  3. 与 Windows 互传用 `zip` / `unzip`

<a id="lnx-19"></a>

#### LNX-19 Bash 变量、引号边界与环境变量 export

- 先修：[LNX-11](#lnx-11)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 赋值等号旁**绝对不能加空格**陷阱
  2. 单引号全字面 vs 双引号允许 `$var` 展开 vs `$()` 命令替换
  3. `export` 传递给子进程与 `~/.bashrc` 持久化

<a id="lnx-20"></a>

#### LNX-20 Shell 条件判断（if / [[ ]]）与循环（for / while）

- 先修：[LNX-19](#lnx-19)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 文件判断 `-f/-d/-e/-x` 与整数/字符串比较运算符区分
  2. `[[ ... ]]` 现代条件比 `[ ... ]` 安全之处
  3. `for f in *.log` 与 `while IFS= read -r line` 逐行读取安全写法

<a id="lnx-21"></a>

#### LNX-21 Bash 函数、位置参数与 set -euo pipefail 防御编程

- 先修：[LNX-20](#lnx-20)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 脚本参数 `$0`/`$1`/`$#`/`$@` 与退出码 `$?`
  2. `local` 局部变量隔离与函数返回值约定
  3. 脚本开头三件套 `set -euo pipefail` 阻止静默灾难

<a id="lnx-22"></a>

#### LNX-22 综合实战：编写可投产的日志汇总分析脚本

- 先修：[LNX-17](#lnx-17)、[LNX-21](#lnx-21)
- 状态：已有[Linux 文本处理、三剑客与 Shell 脚本全攻略](../../src/content/handbook/linux-text-shell.md)。
- 小节
  1. 参数校验、`trap` 清理临时文件与用法帮助
  2. 串联 `find` + `grep` + `awk` + `sort/uniq` 输出统计报表
  3. 确定性退出码与边界测试

## 第三篇 用户权限、进程监控与服务运维（LNX-23 ~ LNX-32）

### 系统管理核心技能

<a id="lnx-23"></a>

#### LNX-23 用户、用户组与提权：id、sudo 与 /etc/passwd

- 先修：[LNX-01](#lnx-01)
- 状态：已有[Linux 系统管理：用户权限、进程监控、systemd 与包管理](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. UID/GID 与读懂 `/etc/passwd`、`/etc/group` 字段
  2. `id`、`whoami`、`who` 查当前身份与登录会话
  3. `sudo` 最小特权单条执行 vs `su` 切换环境

<a id="lnx-24"></a>

#### LNX-24 rwx 权限模型与 chmod 数字/符号法

- 先修：[LNX-23](#lnx-23)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. 属主 `u`、属组 `g`、其他人 `o` 三组三位权限位
  2. 目录上的 `r`/`w`/`x`（无 `x` 无法 `cd` 穿越进入！）深度误区
  3. `chmod +x`、`chmod 755`/`644` 八进制速算

<a id="lnx-25"></a>

#### LNX-25 所有权 chown/chgrp 与默认掩码 umask

- 先修：[LNX-24](#lnx-24)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. 用 `chown user:group -R` 修复部署目录属主问题
  2. `umask 0022` 如何从 `666/777` 扣掉多余写权限
  3. 为什么新建文本默认是 `644` 而不是 `755`

<a id="lnx-26"></a>

#### LNX-26 特殊权限（SUID/SGID/Sticky）与 ACL 细粒度授权

- 先修：[LNX-25](#lnx-25)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. `passwd` 如何靠 SUID 短暂借用 root 改密码文件
  2. 团队共享目录靠 SGID 自动继承同组身份
  3. `/tmp` 的 Sticky Bit (`t`) 防止互删他人文件与 `setfacl`

<a id="lnx-27"></a>

#### LNX-27 进程检查与状态码：ps、pstree、pgrep 与僵尸进程

- 先修：[LNX-23](#lnx-23)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. `ps aux` / `ps -ef` 关键列（PID/PPID/VSZ/RSS/STAT）
  2. 五大状态：`R` 运行、`S` 睡眠、`D` 不可中断磁盘等、`T` 暂停、`Z` 僵尸
  3. 为何 `kill -9` 也杀不死 `Z` 僵尸进程（得找父进程）

<a id="lnx-28"></a>

#### LNX-28 实时资源监控：top、htop、Load Average 与 lsof

- 先修：[LNX-27](#lnx-27)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. 看懂 `top` 里的 Load Average 与 `us/sy/wa` CPU 占用分布
  2. `htop` 按 CPU/内存排序与线程视图（`H`）
  3. `lsof` 抓出“谁占用了端口”与“文件已删但空间未释放（deleted fd）”

<a id="lnx-29"></a>

#### LNX-29 信号控制与会话保活：kill、jobs、nohup 与 tmux

- 先修：[LNX-27](#lnx-27)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. `SIGTERM (15)` 优雅退出 vs `SIGKILL (9)` 强制秒杀
  2. `Ctrl+C`、`Ctrl+Z`、`jobs`/`fg`/`bg` 前后台切换
  3. SSH 断线防进程被 `SIGHUP` 连带杀死：`nohup` 与 `tmux` 多窗口保活

<a id="lnx-30"></a>

#### LNX-30 磁盘与内存排查：free、df、du、lsblk 与 inode 耗尽

- 先修：[LNX-05](#lnx-05)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. `free -h` 区分 `free` 与真正可用的 **`available`（含 page cache）**
  2. `df -h` vs `du -sh` 对比与**小文件塞满 `df -i` inode 耗尽**报错 `No space left`
  3. `lsblk` 看块设备与 `vmstat`/`iostat` 初判 I/O 瓶颈

<a id="lnx-31"></a>

#### LNX-31 systemd 服务托管与 journalctl 日志查询

- 先修：[LNX-29](#lnx-29)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. `systemctl start/stop/restart/status/enable` 日常运维
  2. 编写一个崩溃自动拉起（`Restart=on-failure`）的 `.service` Unit 文件
  3. `journalctl -u myservice -f --since "10 min ago"` 检索服务日志

<a id="lnx-32"></a>

#### LNX-32 定时任务（crontab / timer）与包管理（apt/dpkg/ldconfig）

- 先修：[LNX-31](#lnx-31)
- 状态：已有[Linux 系统管理正文](../../src/content/handbook/linux-perm-admin.md)。
- 小节
  1. `crontab -e` 五字段表达式 `* * * * *` 与环境变量精简坑
  2. `apt update/install`、`dpkg -L` 查包安装路径与头文件落点
  3. 手工装库后执行 `ldconfig` 刷新共享库缓存

## 第四篇 网络运维排错、抓包与远程传输（LNX-33 ~ LNX-40）

### 线上连接与传输排障

<a id="lnx-33"></a>

#### LNX-33 网络接口、IP、路由与回环：ip addr / ip route

- 先修：[NET-04](network.md#net-04)
- 状态：已有[Linux 网络运维：接口路由、ss、curl、tcpdump、SSH 与 rsync](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. 用现代 `ip addr` / `ip link` 替代老旧 `ifconfig`
  2. `ip route show` 与 `ip route get <ip>` 验证出口路由
  3. `lo` 本地回环与 `eth0`/`ens*` 物理/虚拟网卡状态核对

<a id="lnx-34"></a>

#### LNX-34 端口占用与连接状态诊断：ss -tulpn 与 lsof -i

- 先修：[LNX-33](#lnx-33)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `ss -tulpn`（替代 `netstat`）一眼查清监听 IP、端口与 PID
  2. `ss -tan state time-wait/close-wait` 统计异常堆积连接
  3. `lsof -i :9090` 解决重启端口占用排查

<a id="lnx-35"></a>

#### LNX-35 连通性与路径诊断：ping、traceroute 与 mtr

- 先修：[LNX-33](#lnx-33)、[NET-15](network.md#net-15)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `ping -c 4` 观察丢包率与 RTT 波动
  2. `traceroute` / `mtr` 定位卡在哪一跳网关
  3. 识别“能通外网 IP 但域名不通”与防火墙禁 ICMP 假象

<a id="lnx-36"></a>

#### LNX-36 DNS 解析调试：/etc/hosts、dig、nslookup 与 getent

- 先修：[LNX-35](#lnx-35)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `/etc/nsswitch.conf`、`/etc/hosts` 与 `/etc/resolv.conf` 解析顺序
  2. `dig example.com +short` 与 `@8.8.8.8` 指定 DNS 对比
  3. `getent hosts` 复现 C/C++ `getaddrinfo` 真实系统解析结果

<a id="lnx-37"></a>

#### LNX-37 HTTP 命令行调试神器：curl 与 wget

- 先修：[LNX-36](#lnx-36)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `curl -v` 观察 TCP、TLS 握手与完整请求响应头
  2. `-I` 只看头、`-X POST -H -d` 测 JSON API、`--max-time` 防挂死
  3. `curl -f` 非 2xx 返回非零退出码接入 CI 脚本

<a id="lnx-38"></a>

#### LNX-38 抓包实战：tcpdump 过滤接口、端口与 FLAGS

- 先修：[LNX-34](#lnx-34)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `tcpdump -i lo -nn -S port 9090` 捕获回环明文报文
  2. 识别 `[S]`、`[S.]`、`[P.]`、`[F.]`、`[R]` 五种 TCP 标志
  3. `-w cap.pcap` 存盘导给 Wireshark 图形分析

<a id="lnx-39"></a>

#### LNX-39 SSH 密钥免密、~/.ssh/config 与端口转发隧道

- 先修：[LNX-33](#lnx-33)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `ssh-keygen -t ed25519` 生成密钥对与 `ssh-copy-id` 部署
  2. 配置 `~/.ssh/config` 用短别名秒连服务器与跳板机 `ProxyJump`
  3. `ssh -L` 本地端口转发安全访问内网数据库/调试页

<a id="lnx-40"></a>

#### LNX-40 远程同步（scp/rsync）与防火墙概念（ufw/iptables）

- 先修：[LNX-39](#lnx-39)
- 状态：已有[Linux 网络运维正文](../../src/content/handbook/linux-net-ops.md)。
- 小节
  1. `scp` 简单传输 vs `rsync -avz --progress --partial` 断点增量同步
  2. `--delete` 危险开关核对（先加 `--dry-run` 预演！）
  3. `ufw status/allow` 防火墙放行端口与“本地能 curl 外部连不上”排障

## 第五篇 POSIX 系统编程：描述符、管道、进程与信号（LNX-41 ~ LNX-46）

### 深入内核接口编写 C++ 系统程序

<a id="lnx-41"></a>

#### LNX-41 系统调用边界与 errno 错误处理的铁律

- 先修：[OS-04](os.md#os-04)、[CPP-14](cpp.md#cpp-14)
- 状态：已有[Linux 系统编程：系统调用、文件描述符、管道与信号](../../src/content/handbook/linux-process-io.md)。
- 小节
  1. glibc 包装层切换特权级触发 `syscall`
  2. `errno` 线程局部性质：只在返回 `-1` 后立刻保存或 `perror/strerror`
  3. 高频 `ENOENT`/`EACCES`/`EINTR`/`EAGAIN`/`EPIPE` 含义

<a id="lnx-42"></a>

#### LNX-42 进程 FD 表、三层内核模型与最小未用分配

- 先修：[LNX-41](#lnx-41)
- 状态：已有[Linux 系统编程正文](../../src/content/handbook/linux-process-io.md)。
- 小节
  1. 进程 FD 表 → 内核打开文件描述（含偏移量） → inode 三层模型
  2. `0/1/2` 占槽与总是分配最小未用正整数 FD 规则
  3. `O_CLOEXEC` 防止句柄泄入子进程及 `UniqueFd` RAII 包装

<a id="lnx-43"></a>

#### LNX-43 open/read/write/close 与短读短写循环

- 先修：[LNX-42](#lnx-42)
- 状态：已有[Linux 系统编程正文](../../src/content/handbook/linux-process-io.md)。
- 小节
  1. C++ 直接调用 POSIX `open/read/write/close` 读写文件
  2. 为何不能假设一次 `read/write` 处理完所有字节
  3. 编写处理 `EINTR` 重试的工业级 `write_all` / `read_exact`

<a id="lnx-44"></a>

#### LNX-44 dup2 重定向与匿名 pipe 关闭顺序

- 先修：[LNX-43](#lnx-43)、[LNX-12](#lnx-12)
- 状态：已有[Linux 系统编程正文](../../src/content/handbook/linux-process-io.md)。
- 小节
  1. `dup2(oldfd, STDOUT_FILENO)` 替换标准输出原理
  2. 匿名管道 `pipe(fds)` 单向字节流创建
  3. 父子进程各自关闭不需要的一端（否则读端永远等不到 EOF！）

<a id="lnx-45"></a>

#### LNX-45 fork / execve / waitpid 与父子生命周期

- 先修：[LNX-44](#lnx-44)
- 状态：已有[Linux 系统编程正文](../../src/content/handbook/linux-process-io.md)。
- 小节
  1. `fork` 一次调用两次返回与 `execvp` 替换映像
  2. `fork` 前忘记 `fflush` 引发标准库用户态缓冲重复打印两遍坑
  3. 用 `waitpid` 与 `WIFEXITED`/`WEXITSTATUS` 回收子进程灭绝僵尸

<a id="lnx-46"></a>

#### LNX-46 信号处理与异步信号安全（SIGINT / SIGPIPE / SIGCHLD）

- 先修：[LNX-45](#lnx-45)
- 状态：已有[Linux 系统编程正文](../../src/content/handbook/linux-process-io.md)。
- 小节
  1. `sigaction` 取代过时 `signal()` 与 `volatile sig_atomic_t` 标志位
  2. 信号处理函数内绝不调用 `malloc`、`printf` 或加锁（死锁灾难）
  3. `SA_RESTART` 权衡与 `SIGCHLD` 内 `while (waitpid(-1, ..., WNOHANG) > 0)` 防合并丢信号

## 第六篇 底层排错武器库：/proc、ELF、动态库、strace 与 GDB（LNX-47 ~ LNX-52）

### 透视黑盒程序运行与崩溃现场

<a id="lnx-47"></a>

#### LNX-47 /proc 虚拟文件系统与 ulimit 资源上限

- 先修：[LNX-42](#lnx-42)
- 状态：已有[Linux 底层诊断：/proc、ELF、动态库、strace 与 GDB](../../src/content/handbook/linux-debug-elf.md)。
- 小节
  1. 查看 `/proc/<PID>/fd`、`/proc/<PID>/maps`、`/proc/<PID>/status` 与 `cmdline`
  2. 全机指标 `/proc/meminfo`、`/proc/cpuinfo`
  3. `ulimit -a/-n/-c` 突破默认 1024 打开文件数与开启 Core Dump

<a id="lnx-48"></a>

#### LNX-48 静态库 .a 与动态库 .so（ldd / LD_LIBRARY_PATH / rpath）

- 先修：[LNX-32](#lnx-32)、[ENG-31](engineering.md#eng-31)
- 状态：已有[Linux 底层诊断正文](../../src/content/handbook/linux-debug-elf.md)。
- 小节
  1. `ar` 归档静态库 `.a` vs `-fPIC -shared` 编译位置无关共享库 `.so`
  2. `ldd` 排查 `cannot open shared object file` 缺失依赖
  3. `LD_LIBRARY_PATH` 临时救火 vs 链接期 `-Wl,-rpath,$ORIGIN` 可移植发布

<a id="lnx-49"></a>

#### LNX-49 ELF 二进制剖析：file、strings、nm、readelf 与 objdump

- 先修：[LNX-48](#lnx-48)
- 状态：已有[Linux 底层诊断正文](../../src/content/handbook/linux-debug-elf.md)。
- 小节
  1. `file` 与 `strings` 无需源码快速探查可执行文件架构与内嵌字面量
  2. `nm -C` 排查 C++ 名字修饰与 `Undefined reference` 未定义符号
  3. `readelf -d/-h` 与 `objdump -d` 透视动态依赖段与反汇编机器码

<a id="lnx-50"></a>

#### LNX-50 用 strace 跟踪系统调用定位疑难杂症

- 先修：[LNX-41](#lnx-41)
- 状态：已有[Linux 底层诊断正文](../../src/content/handbook/linux-debug-elf.md)。
- 小节
  1. 不改动源码、不重新编译，直接透视闭源程序卡死在哪一步
  2. `strace -f -e trace=file,network -T` 精确捕捉失败文件/超时调用
  3. 一眼认出 `ENOENT`、`EACCES`、`ECONNREFUSED` 与 `futex` 死锁等待

<a id="lnx-51"></a>

#### LNX-51 库函数追踪 ltrace 与动态劫持 LD_PRELOAD

- 先修：[LNX-48](#lnx-48)、[LNX-50](#lnx-50)
- 状态：已有[Linux 底层诊断正文](../../src/content/handbook/linux-debug-elf.md)。
- 小节
  1. `ltrace` 拦截用户态动态库调用（如 `malloc`/`strcmp`）对比 `strace` 视野
  2. `LD_PRELOAD` 拦截原理：无需重编即可无侵入替换 `malloc`（jemalloc/tcmalloc 接入原理）
  3. 静态链接二进制与 SUID 程序为何屏蔽 `LD_PRELOAD`

<a id="lnx-52"></a>

#### LNX-52 Core Dump 验尸、GDB 回溯与 perf 热点定位

- 先修：[LNX-47](#lnx-47)、[ENG-43](engineering.md#eng-43)
- 状态：已有[Linux 底层诊断正文](../../src/content/handbook/linux-debug-elf.md)。
- 小节
  1. 配置 `ulimit -c unlimited` 捕获段错误瞬间内存镜像 `core`
  2. `gdb ./app core` 后 `bt`、`frame N`、`info locals`、`thread apply all bt` 锁定死锁与空指针
  3. `time` 与 `perf record -g` / `perf report` 寻找真实 CPU 瓶颈函数
