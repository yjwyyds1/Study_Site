---
title: "Linux 权限、进程管理、系统监控与服务运维"
description: "系统掌握 LNX-23 至 LNX-32：用户与 sudo 体系、rwx 权限与目录搜索位、chown/umask、SUID/SGID/Sticky Bit 与 ACL、ps/top/htop/lsof 进程监控、信号与 tmux 作业控制、磁盘 inode 与内存指标、systemd/journalctl 及 cron/apt 运维。"
order: 74
category: "Linux 实践"
tags: ["Linux", "权限", "chmod", "umask", "ACL", "进程", "lsof", "systemd", "crontab", "apt"]
related: ["handbook/linux-zero-start", "handbook/linux-net-ops", "handbook/linux-process-io", "handbook/linux-debug-elf"]
sources: []
---

## 本课只解决这 1 个问题

写好程序只是第一步，把程序真正放到 Linux 服务器或 WSL2 上跑起来，立刻会遇到一连串工程问题：**为什么改了文件权限还是 `Permission denied`？怎么把一个后台服务安全地交给非 `root` 账户长期托管？服务器突然变卡、磁盘明明没满却报 `No space left on device`、进程杀不掉或者占着端口不放，到底该用哪几条命令一分钟查出根因？**

本课系统打通 **LNX-23 至 LNX-32**，让你从“只会用 `sudo chmod 777` 硬蒙”进化到真正看懂 Linux 的安全边界、进程生命周期、资源账本与服务运维体系。

前置要求：熟悉基本目录切换与文本查看命令；可结合[Linux 系统调用、文件描述符与进程 I/O](../linux-process-io/)对照理解底层内核机制。

## 阅读路线与核心模块总览

| 编号 | 主题 | 学完能解决什么工程问题 | 关键命令 / 文件 |
| --- | --- | --- | --- |
| **LNX-23** | 用户、组与提权 | 分清 `root`/普通用户/服务账户，安全使用 `sudo` 与 `su -` | `/etc/passwd`, `/etc/group`, `id`, `sudo` |
| **LNX-24** | `rwx` 权限与 `chmod` | 彻底搞懂文件与目录 `x` 位的差异，排查 `EACCES` | `ls -l`, `chmod`（符号/八进制） |
| **LNX-25** | 所有权与 `umask` | 批量交接文件归属，算准新建文件/目录默认权限 | `chown`, `chgrp`, `umask` |
| **LNX-26** | 特殊权限与 ACL | 理解 `/tmp` 粘滞位、共享目录 `SGID` 与细粒度授权 | `SUID/SGID/Sticky`, `getfacl`, `setfacl` |
| **LNX-27** | 进程查看与状态码 | 精准查找进程，分清 `D` 态不可杀与 `Z` 态僵尸进程 | `ps aux`, `ps -ef`, `pstree`, `pgrep` |
| **LNX-28** | 实时监控与 `lsof` | 读懂 Load Average 与 CPU `wa`，秒查占端口/占文件进程 | `top`, `htop`, `lsof` |
| **LNX-29** | 信号与作业控制 | 优雅停服与强制兜底，SSH 断线后保活后台任务 | `kill`, `pkill`, `jobs/bg/fg`, `nohup`, `tmux` |
| **LNX-30** | 内存、磁盘与 inode | 分清 `available` 内存，排查 `df` 与 `du` 不一致及 inode 耗尽 | `free -h`, `df -hi`, `du -sh`, `lsblk`, `vmstat` |
| **LNX-31** | `systemd` 与日志 | 编写生产级 `.service` 托管程序，按时间与级别查日志 | `systemctl`, `.service`, `journalctl` |
| **LNX-32** | 定时任务与包管理 | 编写可靠 `cron`/`timer` 定时作业，用 `apt`/`dpkg` 定位文件与库 | `crontab`, `systemd-timer`, `apt`, `dpkg`, `ldconfig` |

---

## 一、用户、用户组与提权体系（LNX-23）

Linux 是严格的多用户操作系统：内核识别一切权限的依据不是“用户名字符串”，而是**数字化的用户 ID（UID）和组 ID（GID）**。

### 1. 三类账户与 UID 划分

| 账户类型 | 典型 UID 范围（Debian/Ubuntu） | 代表账户 | 核心用途 |
| --- | :---: | --- | --- |
| **超级管理员** | `0` | `root` | 绕过常规权限检查，拥有内核与硬件最高控制权 |
| **系统 / 服务账户** | `1` ~ `999` | `www-data`, `systemd-network`, `postgres` | 专门用来隔离运行某个后台服务，通常禁止登录 Shell（`/usr/sbin/nologin`） |
| **普通登录用户** | `1000` 及以上 | `ubuntu`, `alice`, 你的开发账号 | 日常开发与登录使用，默认只能写自己的 `$HOME` 和 `/tmp` |

### 2. `/etc/passwd` 与 `/etc/group` 文件格式

这两个文件所有用户都可读，因为 `ls -l` 需要把内核里的数字 UID/GID 翻译成用户名和组名：

```bash
head -n 3 /etc/passwd
# root:x:0:0:root:/root:/bin/bash
# daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
# alice:x:1000:1000:Alice,,,:/home/alice:/bin/bash
```

`/etc/passwd` 每行由冒号 `:` 分成 **7 个字段**：

```text
alice : x : 1000 : 1000 : Alice,,, : /home/alice : /bin/bash
  │     │    │      │        │           │            │
用户名 密码占位 UID  主GID   注释信息     家目录     登录 Shell
```

- 为什么密码字段只是一个 `x`？早期 Unix 把密码哈希直接放进 `/etc/passwd`，极易被离线暴力破解；现代 Linux 把加密后的密码哈希单独存放在仅 `root` 和 `shadow` 组可读的 **`/etc/shadow`**（权限通常是 `0640`）。
- 看到登录 Shell 是 `/usr/sbin/nologin` 或 `/bin/false`，表示该服务账号**不允许交互式登录**，提高安全性。

再看 `/etc/group`（4 个字段）：

```bash
grep -E '^(sudo|docker|alice):' /etc/group
# sudo:x:27:alice,bob
# alice:x:1000:
# docker:x:998:alice
```

```text
sudo : x : 27 : alice,bob
 │     │    │       │
组名 组密码 GID  附加成员列表（不包含以此为主组的用户）
```

### 3. 身份核验与提权命令：`whoami`、`id`、`su`、`sudo`

```bash
$ whoami
alice

$ id
uid=1000(alice) gid=1000(alice) groups=1000(alice),27(sudo),998(docker)
```

| 命令 | 常见用法 | 作用与核心差异 |
| --- | --- | --- |
| `whoami` | `whoami` | 只输出当前**有效用户名（Effective UID 对应名）** |
| `id` | `id` 或 `id bob` | 显示 `uid`、主 `gid` 及所有附加组 `groups` |
| `su` | `su - bob` / `su -` | 切换用户，输入**目标用户**的密码。**必须带 `-`（等价 `-l`）** 才会重置环境变量和工作目录 |
| `sudo` | `sudo apt update` | 以 `root`（或 `-u bob` 指定用户）执行单条命令，输入**当前用户自己**的密码，受 `/etc/sudoers` 审计约束 |
| `sudo -i` | `sudo -i` | 开启一个干净的 `root` 登录 Shell（比直接 `su` 更可控、有日志留痕） |
| `visudo` | `sudo visudo` | 编辑 `/etc/sudoers` 的唯一安全命令：保存前会自动做语法校验 |

```bash
# 查看自己被授予了哪些 sudo 权限
sudo -l
# User alice may run the following commands on dev-box:
#     (ALL : ALL) ALL
```

> [!WARNING]
> **新手高频踩坑（LNX-23）**：
> 1. **永远不要用 `nano /etc/sudoers` 直接改配置**：写错一个冒号就会导致所有用户再也无法执行 `sudo`！必须用 `sudo visudo`，或在 `/etc/sudoers.d/` 下新建独立子配置文件。
> 2. **用 `su -` 而不是裸 `su`**：裸 `su` 会保留原用户的 `$HOME`、`$PATH` 等环境变量，切到服务账号后可能把配置写进原用户目录，或找不到新用户的可执行路径。
> 3. **把用户加入新组后没生效**：例如执行 `sudo usermod -aG docker alice` 后，当前终端的 `id` 看不到 `docker` 组，因为组列表只在登录时读取！需重新登录，或在当前终端执行 `newgrp docker` 临时刷新。

---

## 二、Linux `rwx` 权限模型与 `chmod`（LNX-24）

执行 `ls -l` 时，最左边的 10 个字符就是 Linux 的自主访问控制（DAC）核心：

```text
- rwx r-x r--  1 alice dev 4096 Nov 19 10:00 run.sh
│ └─┬┘└─┬┘└─┬┘
│   │   │   └── o (others)：其他人权限 (r--)
│   │   └────── g (group) ：所属组权限 (r-x)
│   └────────── u (user)  ：所有者权限 (rwx)
└────────────── 文件类型：- 普通文件, d 目录, l 符号链接, c/b 设备, p 管道, s 套接字
```

### 1. 文件 vs 目录：极易混淆的 `rwx` 含义

绝大多数“明明文件是 `644` 为什么还是 `Permission denied`”的坑，根源都在没有区分 **`rwx` 对普通文件和对目录完全不同的含义**：

| 权限字符 | 八进制权重 | 对普通文件（Regular File） | 对目录（Directory）——极易踩坑！ |
| :---: | :---: | --- | --- |
| **`r`** (read) | `4` | 允许读取文件内容（如 `cat`、`open(..., O_RDONLY)`） | 允许列出目录里有哪些文件名（如 `ls`），**但不能直接读文件元信息或内容** |
| **`w`** (write) | `2` | 允许修改文件内容（**注意：不能删除或重命名该文件本身！**） | 允许在目录内**创建、删除、重命名**文件（哪怕文件本身对你是只读 `444`！） |
| **`x`** (execute) | `1` | 允许作为程序或脚本直接执行（`./app`） | **搜索/遍历位（Search bit）**：允许 `cd` 进去，以及**穿过该目录访问下级文件或目录** |

牢记三条颠覆直觉的结论：
1. **能否删除一个文件，取决于它所在父目录的 `w` 和 `x` 权限**，而不是文件本身的 `w` 权限！如果目录对你可写，里面放着一个属于 `root` 且权限为 `0444` 的只读文件，你一样可以用 `rm -f` 把它从目录里删掉（`rm` 会提示确认，加 `-f` 直接删）。
2. **目录缺少 `x` 位时，里面的文件再开放也打不开**：只要路径上任何一级父目录对你没有 `x` 权限，内核在路径解析阶段直接返回 `EACCES (Permission denied)`，`ls -l dir/file` 甚至连文件大小、时间都看不到（全显示 `?`）。
3. **目录只有 `x` 没有 `r`（如 `711` / `--x`）**：“盲盒穿越”——你无法 `ls dir` 列出里面有什么文件，但只要你**确切知道文件名**（如 `cat dir/public.txt`），依然能正常读取！

### 2. `chmod` 两种修改方式与常见组合

| 用法分类 | 示例命令 | 含义与适用场景 |
| --- | --- | --- |
| **符号法** | `chmod u+x build.sh` | 给所有者增加执行权限（不影响 `g`/`o`） |
| **符号法** | `chmod go-w secret.key` | 移除所属组和其他人的写权限 |
| **符号法** | `chmod a=r readonly.txt` | 所有人（`a` = `u+g+o`）设为只读 |
| **大写 `X`** | `chmod -R u+rwX,go+rX dist/` | **工程神器**：`X` 只给**目录**或**原本已有至少一个 `x` 位的文件**加执行权限，避免把普通文本错改成可执行！ |
| **八进制** | `chmod 755 app` | `rwxr-xr-x`（`4+2+1=7`, `4+1=5`, `4+1=5`）：可执行程序与公开目录标准权限 |
| **八进制** | `chmod 644 config.yaml` | `rw-r--r--`：普通配置文件与源码标准权限 |
| **八进制** | `chmod 600 ~/.ssh/id_ed25519` | `rw-------`：私钥与敏感凭证强制权限 |
| **八进制** | `chmod 700 ~/.ssh` | `rwx------`：仅自己可进出的私密目录 |

```bash
# 现场实验：验证目录缺少 x 位导致 EACCES
d=$(mktemp -d)
mkdir "$d/box" && echo "hello" > "$d/box/note.txt"
chmod 644 "$d/box/note.txt"
chmod 644 "$d/box"   # 注意：对目录给了 rw-r--r--（去掉了 x！）

ls "$d/box"          # 只显示文件名，但可能报 ls: cannot access '...': Permission denied
cat "$d/box/note.txt"
# cat: /tmp/tmp.xxx/box/note.txt: Permission denied

chmod 755 "$d/box"   # 补回目录的 x 遍历位
cat "$d/box/note.txt"
# hello
rm -rf "$d"
```

> [!CAUTION]
> **切勿盲目执行 `chmod -R 644 mydir/`！**
> 递归设置 `644` 会把 `mydir` 及其所有子目录的 `x` 位一并剥掉，导致普通用户直接无法 `cd` 或访问子目录。递归调整目录树权限时，要么用 `chmod -R u+rwX,go+rX mydir/`，要么用 `find` 分别处理目录和文件：
> ```bash
> find mydir -type d -exec chmod 755 {} +
> find mydir -type f -exec chmod 644 {} +
> ```

---

## 三、所有权 `chown`/`chgrp` 与默认权限掩码 `umask`（LNX-25）

### 1. 修改所有者与所属组：`chown` 与 `chgrp`

新建文件时，所有者默认是创建者的 UID，所属组通常是创建者的主 GID。部署服务或跨账号拷贝代码后，常需要交接归属权：

| 命令 | 含义 | 说明 |
| --- | --- | --- |
| `sudo chown www-data app.log` | 只改所有者为 `www-data` | 所属组保持不变 |
| `sudo chown www-data:www-data app.log` | 同时改所有者与所属组 | 最常见写法（`user:group`） |
| `sudo chown :dev shared/` | 只改所属组为 `dev` | 等价于 `chgrp dev shared/` |
| `sudo chown -R alice:dev /srv/app` | 递归修改整个目录树 | 对符号链接默认跟随，加 `-h` 可改链接本身归属 |

为什么普通用户不能把自己的文件 `chown` 送给别人？试想如果你写了个恶意程序再 `chown root`，配合某些条件就可能嫁祸他人或绕过磁盘配额（Quota）。因此 Linux 规定：**只有 `root`（或拥有 `CAP_CHOWN` 能力）才能改变文件所有者**；普通用户只能用 `chgrp` 把文件组改成**自己所属的另一个附加组**。

### 2. `umask` 默认权限掩码（千万别用十进制减法！）

当你执行 `touch a.txt` 或在 C++ 里调用 `open("a.txt", O_CREAT | O_WRONLY, 0666)` 时，实际落盘的权限并不是 `0666`，而是被当前进程的 **`umask`（权限掩码）** 剥掉一部分位：

- **普通文件的基准权限（Base Mode）**：`0666`（内核与工具默认不给新建文件自动加 `x` 执行位，防止下载或生成的文本意外可执行）
- **目录的基准权限（Base Mode）**：`0777`（目录必须有 `x` 才能进入）
- **真实计算公式（按位与取反）**：

$$\text{最终权限} = \text{基准权限} \ \& \ (\sim\text{umask})$$

```bash
$ umask
0022              # 掩掉 group 的 w(2) 和 others 的 w(2)
$ touch f.txt && mkdir d
$ ls -ld f.txt d
# -rw-r--r-- 1 alice alice    0 Nov 19 10:15 f.txt   (0666 & ~0022 = 0644)
# drwxr-xr-x 2 alice alice 4096 Nov 19 10:15 d       (0777 & ~0022 = 0755)
```

常见 `umask` 工程配置对照表：

| `umask` 值 | 新建文件默认权限 | 新建目录默认权限 | 适用场景 |
| :---: | :---: | :---: | --- |
| **`0022`** | `0644` (`rw-r--r--`) | `0755` (`rwxr-xr-x`) | 绝大多数 Linux 发行版个人/服务端默认配置 |
| **`0002`** | `0664` (`rw-rw-r--`) | `0775` (`rwxrwxr-x`) | 团队同组协作共享开发目录（让同组成员可写） |
| **`0027`** | `0640` (`rw-r-----`) | `0750` (`rwxr-x---`) | 生产应用日志/数据（同组可读，外人全拒绝） |
| **`0077`** | `0600` (`rw-------`) | `0700` (`rwx------`) | 高敏感账户、密钥管理脚本（仅自己可见） |

> [!IMPORTANT]
> **为什么不能死记“基准减 umask”？**
> 试试 `umask 0033`（掩掉 `w=2` 和 `x=1`）：
> - 错误减法：`666 - 033 = 633`（得出 `-rw--wx-wx`，莫名其妙多了执行位！）
> - 正确位运算：`0666` (`110 110 110`) `& ~0033` (`111 100 100`) = `0644` (`110 100 100`)！
>
> 要永久修改登录用户的 `umask`，可写入 `~/.bashrc` 或 `/etc/profile`；若服务由 `systemd` 托管，可在 `.service` 的 `[Service]` 段直接写 `UMask=0027`。

---

## 四、特殊权限（`SUID`/`SGID`/`Sticky Bit`）与 ACL（LNX-26）

在常规 9 位 `rwx` 前面，其实还有第 10~12 位（最高八进制位）——**3 个特殊权限位**：

| 特殊位 | 八进制 | 符号写法 | 显示位置 | 作用在普通文件上 | 作用在目录上 |
| --- | :---: | --- | --- | --- | --- |
| **SUID** | `4000` | `u+s` | 所有者 `x` 位（`s`/`S`） | 进程以**文件所有者**的身份（EUID）运行，而非执行者 | 无效（Linux 忽略目录 SUID） |
| **SGID** | `2000` | `g+s` | 所属组 `x` 位（`s`/`S`） | 进程以**文件所属组**的身份（EGID）运行 | **目录内新建的文件/子目录自动继承该目录的所属组** |
| **Sticky Bit** | `1000` | `+t` | 其他人 `x` 位（`t`/`T`） | 现代 Linux 忽略 | **防误删保护**：目录虽全员可写，但只有文件所有者、目录所有者或 `root` 能删除/重命名该文件 |

### 1. 现实中的三个典型实例

```bash
ls -ld /usr/bin/passwd /tmp
# -rwsr-xr-x 1 root root  68208 ... /usr/bin/passwd   <-- SUID (4755)
# drwxrwxrwt 18 root root 4096 ... /tmp               <-- Sticky Bit (1777)
```

1. **为什么普通用户改自己密码能写进 `/etc/shadow`？**
   `/etc/shadow` 只有 `root` 可写，但 `/usr/bin/passwd` 带有 **SUID（`rws`）** 且所有者是 `root`。你运行 `passwd` 时，内核把该进程的有效用户（EUID）临时升为 `root`，程序内部校验你只改自己的密码后写入 `/etc/shadow`。
   *(安全提示：Linux 内核出于安全考虑，**会直接忽略脚本文件如 `.sh`/`.py` 上的 SUID 位**，只对编译好的 ELF 二进制有效。)*
2. **团队共享目录为什么必须设 `SGID`（`chmod 2775`）？**
   假设 `alice`（主组 `alice`）和 `bob`（主组 `bob`）同属附加组 `backend`，他们共用 `/srv/shared`（组为 `backend`）。如果不设 SGID，`alice` 建的文件组是 `alice`，`bob` 就写不了！给目录加上 `chmod 2775 /srv/shared`（`drwxrwsr-x`）后，任何人在此新建文件，所属组都会**自动继承为 `backend`**。
3. **为什么 `/tmp` 权限是 `1777`（`drwxrwxrwt`）？**
   所有程序和用户都需要往 `/tmp` 写临时文件（所以 `others` 必须有 `rwx`）。如果没有 Sticky Bit，`bob` 就能把 `alice` 正在用的 `/tmp/alice.sock` 删掉！加上 `1000` 粘滞位后，末位变成 `t`，每个人只能删自己的文件。

> [!NOTE]
> **大小写 `s/t` vs `S/T` 的秘密**：
> 小写 `s` / `t` 表示“该特殊位已开启，**且**对应的底层 `x` 位也是开启的”；如果看到大写的 `S` 或 `T`（如 `-rwSr--r--`），说明开启了特殊位却忘了给 `x` 位，往往是配置失误。

### 2. 访问控制列表 ACL（`getfacl` / `setfacl`）

传统 `u/g/o` 三组模型有个天然局限：如果一个文件属于 `alice:dev`，我现在只想**额外**让 `bob` 一个人有读写权限，却不想让他加入 `dev` 组，怎么办？这时就用 **POSIX ACL**。

当文件设置了扩展 ACL 后，`ls -l` 权限串末尾会出现一个 **`+`** 号：

```bash
$ touch report.txt
$ setfacl -m u:bob:rw report.txt      # 单独给 bob 赋 rw 权限
$ ls -l report.txt
# -rw-rw-r--+ 1 alice alice 0 Nov 19 10:30 report.txt
```

常用 ACL 命令速查：

| 命令 | 作用 |
| --- | --- |
| `getfacl file` | 查看文件或目录的完整 ACL 规则（包括 `mask` 上限） |
| `setfacl -m u:bob:rw file` | 给指定用户 `bob` 添加/修改权限 |
| `setfacl -m g:qa:rx dir` | 给指定组 `qa` 添加/修改权限 |
| `setfacl -d -m g:qa:rx dir` | 设置目录的**默认 ACL（Default ACL）**，后续在此新建的文件自动继承 |
| `setfacl -x u:bob file` | 删除 `bob` 的单独 ACL 条目 |
| `setfacl -b file` | 清空该文件上的所有扩展 ACL（末尾 `+` 消失） |

注意看 `getfacl` 输出里的 `mask::` 行：`mask` 是除所有者与 `others` 之外所有命名用户/命名组权限的**有效权限上限**（即便给 `bob` 设了 `rw`，若 `mask` 为 `r--`，`bob` 的有效权限仍会被压成 `r--`）。

---

## 五、进程检查与进程状态码（LNX-27）

Linux 中每个运行的程序实例都是一个进程，拥有唯一的 **PID**（进程号）、**PPID**（父进程号）、**PGID**（进程组号）和 **SID**（会话号）。

### 1. 四大进程查看命令对比

| 命令 | 典型用法 | 输出特点与最佳场景 |
| --- | --- | --- |
| `ps aux` | `ps aux \| head` | **BSD 风格**：展示 `USER`, `PID`, `%CPU`, `%MEM`, `VSZ`, `RSS`, `STAT`, `COMMAND`，适合按资源占用排查 |
| `ps -ef` | `ps -ef \| grep nginx` | **UNIX 风格**：清晰列出 `PID` 和 `PPID`（父进程号），适合顺藤摸瓜找谁拉起了这个进程 |
| `ps -eo` | `ps -eo pid,ppid,stat,rss,comm --sort=-rss` | **自定义列 + 排序**：脚本提取与精确排查首选（如按物理内存 `RSS` 降序） |
| `pstree` | `pstree -p` | 树状直观展示父子进程血缘关系（`-p` 显示 PID） |
| `pgrep` | `pgrep -af logscan` | 按名字/完整命令行（`-f`）直接搜 PID 并打印参数（`-a`），不会像 `ps \| grep` 那样把 `grep` 自己搜出来！ |

> [!TIP]
> 为什么用 `ps aux | grep nginx` 时总多出一行 `grep --color=auto nginx`？因为管道两边同时启动，`grep` 自己的命令行里正好包含 `nginx`！工程里推荐改用 `pgrep -af nginx` 或正则技巧 `ps aux | grep '[n]ginx'`。

### 2. 彻底看懂进程状态码 `STAT`（`R / S / D / Z / T`）

在 `ps aux` 的 `STAT` 列（或 `top` 的 `S` 列），你会看到如下核心状态字母：

| 主状态码 | 英文全称 | 含义与内核真相 | 运维处理要点 |
| :---: | --- | --- | --- |
| **`R`** | Running / Runnable | 正在 CPU 上跑，或在就绪队列里排队等调度器分时间片 | 正常忙碌；若大量进程长期处于 `R` 说明 CPU 算力不足 |
| **`S`** | Interruptible Sleep | 可中断睡眠（等待 Socket 数据、定时器、`sleep` 等） | 最常见状态，绝大多数服务端空闲连接线程都在 `S`，可正常响应信号 |
| **`D`** | Uninterruptible Sleep | **不可中断睡眠**（通常正在内核态死等磁盘块 I/O、损坏的 NFS 挂载或驱动锁） | **极高危信号！处于 `D` 态的进程连 `kill -9` 都杀不死**，因为内核禁止在等待硬件响应时中途打断；只能等底层 I/O 超时/恢复，或修复存储后重启 |
| **`Z`** | Zombie (Defunct) | **僵尸进程**：进程已经 `exit` 死了，内存/FD 已释放，但父进程还没调用 `wait`/`waitpid` 收尸，PCB 残留 | **对僵尸进程执行 `kill -9` 完全无效**（它已经死了！）。必须检查 `PPID` 找父进程，向父进程发信号让它回收，或重启修复父进程 |
| **`T`** / **`t`** | Stopped / Traced | 被作业控制信号暂停（如 `Ctrl+Z` / `SIGSTOP`），或正被 `gdb`/`strace` 断点挂起（`t`） | 用 `fg`/`bg` 或 `kill -CONT <PID>` 恢复运行 |

`STAT` 后面常跟着的后缀修饰符含义：`<`（高优先级）、`N`（低优先级 Nice）、`s`（会话首进程 Session Leader，如 daemon 主进程）、`+`（位于前台进程组）、`l`（多线程进程，如 `Sl`）。

---

## 六、实时资源监控：`top`、`htop` 与 `lsof`（LNX-28）

### 1. 读懂 `top` 顶部两行黄金指标

运行 `top` 后，最关键的判断都在前 5 行：

```text
top - 14:22:10 up 12 days,  3:41,  2 users,  load average: 4.82, 3.15, 1.90
Tasks: 184 total,   2 running, 181 sleeping,   0 stopped,   1 zombie
%Cpu(s): 12.5 us,  4.0 sy,  0.0 ni, 21.0 id, 62.5 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :  15872.0 total,    412.4 free,   6820.1 used,   8639.5 buff/cache
MiB Swap:   2048.0 total,   2040.0 free,      8.0 used.   8710.2 avail Mem
```

1. **`load average: 4.82, 3.15, 1.90`（1 分钟、5 分钟、15 分钟平均负载）**：
   - 在 Linux 中，Load Average 统计的是**处于可运行态（`R`）加上不可中断睡眠态（`D`）的平均任务数**。
   - **一定要先用 `nproc` 看核心数！** 如果机器有 8 核，Load 为 `4.8` 属于轻松空闲；如果只有 2 核，Load `4.8` 就已经严重排队过载了。
   - 对比 `4.82 -> 3.15 -> 1.90`（1 分钟 > 5 分钟 > 15 分钟），说明负载**正在急剧攀升**。
2. **`%Cpu(s)` 拆解**：
   - `us`（user）：用户态代码消耗（业务逻辑、解析、计算）。
   - `sy`（system）：内核态系统调用消耗（频繁小包 `read/write`、锁竞争、上下文切换）。
   - **`wa`（iowait）**：CPU 空闲着等磁盘/块设备 I/O 的时间百分比！看上面例子：`us` 只有 `12.5%`，但 **`wa` 高达 `62.5%`**，且 Load 飙到 `4.82`——这说明**瓶颈根本不是 CPU 算力不够，而是磁盘写爆了或出现慢盘！**
   - `st`（steal）：云服务器里被宿主机 Hypervisor 抢走的 CPU 时间，高 `st` 说明被“吵闹的邻居”抢了算力。

`top` 交互常用快捷键（直接按键盘）：

| 按键 | 作用 | 按键 | 作用 |
| :---: | --- | :---: | --- |
| `P` | 按 **CPU%** 降序排列 | `M` | 按 **内存 %MEM** 降序排列 |
| `1` | 展开查看**每个逻辑核心**的负载（查单核打满神技） | `H` | 切换显示进程下的各个**线程（Threads）** |
| `c` | 显示完整命令行参数 | `k` | 输入 PID 直接发信号终止进程 |
| `q` | 退出 `top` | — | — |

如果系统装了 `htop`（`sudo apt install htop`），它支持彩色柱状条、鼠标点击、`F5` 进程树视图、`F3` 搜索和 `F4` 过滤，日常交互更直观。

### 2. `lsof`（List Open Files）：万物皆文件下的排错瑞士军刀

在 Linux 里，普通文件、目录、管道、动态库 `.so`、网络连接全都是“打开的文件”。`lsof` 能把**谁占着什么资源**查得一清二楚：

| 场景 | 命令 | 实际用途 |
| --- | --- | --- |
| 查某进程打开了哪些东西 | `lsof -p 12345` | 查文件描述符泄露、确认加载了哪个 `.so` 或日志路径 |
| 查谁占用了 8080 端口 | `sudo lsof -i :8080` | 启动服务报 `Address already in use` 时精准定位 PID |
| 查谁锁住/正在写某文件 | `sudo lsof /var/log/app.log` | 准备卸载磁盘报 `target is busy` 或查日志写入者 |
| **查“已删未释放”的幽灵文件** | `sudo lsof +L1` | 筛选硬链接数为 `0`（标注 `(deleted)`）但仍被进程拿着 FD 不放的超大文件！ |
| 查某用户所有打开的文件 | `lsof -u alice` | 排查用户会话资源占用 |

---

## 七、信号发送与作业控制（LNX-29）

### 1. 常用信号与 `kill` / `pkill`

`kill` 的本意不是“杀死”，而是**向进程发送信号（Signal）**。常用信号速查：

| 信号编号 / 名称 | 触发命令 | 进程能否捕获/自定义处理？ | 工程含义与使用准则 |
| :---: | --- | :---: | --- |
| **`1` (`SIGHUP`)** | `kill -1 <PID>` / 终端断线 | 可以 | 1) 终端断开时发给前台作业；2) 服务端常约定为**热重载配置文件**（如 `nginx -s reload`） |
| **`2` (`SIGINT`)** | `Ctrl+C` | 可以 | 前台交互中断请求 |
| **`9` (`SIGKILL`)** | `kill -9 <PID>` | **绝对不可捕获/阻塞** | 内核直接抹杀进程，**不给刷盘、删临时文件、关连接的机会**！仅作死锁兜底 |
| **`15` (`SIGTERM`)** | `kill <PID>`（默认） | 可以 | **优雅退出首选**：通知进程停止接新请求、排空队列、落盘并退出 |
| **`18` (`SIGCONT`)** | `kill -18 <PID>` / `fg` / `bg` | 特殊 | 唤醒被 `SIGSTOP`/`SIGTSTP` 暂停的进程 |
| **`20` (`SIGTSTP`)** | `Ctrl+Z` | 可以 | 暂停前台进程并放入后台停止态（`T`） |
| **`0`（空信号）** | `kill -0 <PID>` | — | 不真发信号，仅让内核检查该 PID 是否存活且你有权发信号（脚本探活常用） |

```bash
# 按名称发优雅退出信号，再核对是否退出
pkill -15 -f "logscan_srv --port 9090"
```

### 2. 前后台作业控制与 SSH 断线保活（`jobs`/`bg`/`fg`/`nohup`/`tmux`）

在当前终端里运行一个耗时编译或临时服务时：

```bash
./long_task            # 前台阻塞运行
# 按下 Ctrl+Z           -> 收到 SIGTSTP，暂停并打印 [1]+ Stopped ./long_task
jobs -l                # 查看当前 Shell 的作业列表与 PID
bg %1                  # 让 1 号作业在后台继续跑（等价于启动时末尾加 &）
fg %1                  # 把 1 号作业拉回前台
```

**但是！一旦你关闭 SSH 终端窗口，Shell 退出时会向名下所有后台作业群发 `SIGHUP`，导致它们全部惨死！** 有三种工程保活方案：

1. **轻量临时运行：`nohup` + 重定向 + `&`**
   ```bash
   nohup ./logscan_srv --port 9090 > srv.log 2>&1 &
   ```
   `nohup` 会让子进程忽略 `SIGHUP`，并脱离终端标准输出写进 `srv.log`。
2. **交互式持久化工作台：`tmux`（强烈推荐！）**
   `tmux` 在服务器端维持独立会话，即使你的电脑断网、合盖，里面的编译任务、日志监控依然原封不动继续运行：
   ```bash
   tmux new -s dev        # 创建名为 dev 的会话并进入
   # ... 跑长任务或开多个窗口 ...
   # 按 Ctrl+b 然后松手再按 d   -> Detach（安全挂起脱离，任务仍在后台跑）
   tmux ls                # 列出当前所有存活会话
   tmux attach -t dev     # 随时重连回 dev 会话（缩写 tmux a -t dev）
   ```
   `tmux` 常用快捷键（先按前缀 `Ctrl+b` 再按后续键）：`%` 左右分屏、`"` 上下分屏、`方向键` 切窗格、`[` 进入滚屏复制模式（`q` 退出）。
3. **长期生产服务**：不要靠 `nohup` 或 `tmux` 凑合，应该交给 **`systemd`**（见第八节 LNX-31）。

---

## 八、内存与磁盘空间排查（LNX-30）

### 1. 读懂 `free -h`：为什么 `free` 很小并不代表内存不够？

```bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:            15Gi       6.4Gi       412Mi       120Mi       8.7Gi       8.9Gi
Swap:          2.0Gi       8.0Mi       2.0Gi
```

新手看到 `free` 只剩 `412Mi` 就吓得以为内存快爆了——这是对 Linux 内存管理最大的误解！
- Linux 的哲学是**“空闲的内存就是浪费的内存”**：内核会把暂时没被进程占用的物理内存用来做磁盘文件的 **Page Cache（页缓存，`buff/cache`）**，极大加速文件读写。
- 一旦你的程序需要申请新内存，内核可以**毫秒级回收干净的 `buff/cache`** 分配给你。
- 因此判断系统还剩多少可用内存，**永远看最右边的 `available`（本例为 `8.9Gi`），而不是 `free`！** 如果 `available` 接近耗尽且 `Swap used` 持续上涨，才说明真要发生内存抖动或 OOM（Out Of Memory Killer 杀进程）了。

### 2. 磁盘空间：`df -h` vs `du -sh` vs `df -i`（inode 耗尽）

| 命令 | 统计维度 | 核心作用 |
| --- | --- | --- |
| `df -h` | **文件系统（挂载点）级别** | 看每个磁盘分区总容量、已用、可用百分比及挂载点 |
| `df -i` | **inode 节点数** | **排查“磁盘明明只用了 40%，新建文件却报 `No space left on device`”** |
| `du -sh *` | **目录 / 文件级别** | 自底向上递归统计当前目录下各文件/子目录真实占多少空间 |
| `du -h --max-depth=1 /var` | 仅统计 `/var` 下一级子目录 | 快速揪出是 `/var/log` 还是 `/var/lib/docker` 吃满了硬盘 |
| `lsblk` | **块设备拓扑** | 清晰列出物理盘（`sda`/`nvme0n1`）、分区和挂载点关系 |

**两大经典生产磁盘故障**：
1. **inode 耗尽（`df -h` 正常，但无法创建文件）**：
   每个文件无论大小（哪怕 0 字节），都必须占用 1 个 **inode**（存储权限、所有者、时间戳、数据块指针的元数据）。如果某个失控脚本在 `/tmp/cache/` 下生成了 500 万个 100 字节小文件，总容量才几百 MB，却把整个分区的 inode 耗光了（`IUse% = 100%`）！用 `df -i` 一眼即可确诊。
2. **`df -h` 显示 100%，但 `du -sh /*` 加起来只有 50%（幽灵已删文件）**：
   因为某个人直接 `rm /var/log/huge.log`，但写日志的服务进程还一直开着这个文件的 FD 没关闭！Linux 只有在**目录项硬链接归零且所有打开它的 FD 全关闭**后才真正释放磁盘块。
   - 排查命令：`sudo lsof +L1`（看哪个进程还抓着 `(deleted)` 大文件）。
   - 恢复手段：优雅重启对应服务，或把被删前清空思路改成日常用 `truncate -s 0 huge.log`（`> huge.log`）原地截断文件，不要直接 `rm` 正在写的日志。

### 3. 实时系统瓶颈速览：`vmstat` 与 `iostat`

```bash
# 每 1 秒输出一次系统全局 CPU/内存/Swap/上下文切换概要
vmstat 1
# procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
#  r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
#  2  0      0 421888 210432 8635120   0    0     0    12  450 1120 12  4 84  0  0
```
重点看 4 组数：`r`（等待 CPU 的队列长度，长期大于核数说明 CPU 排队）、`b`（不可中断等 I/O 的进程数）、`si`/`so`（Swap 换入换出速率，长期非零代表物理内存严重告急）、`cs`（每秒上下文切换次数）。

查具体哪块硬盘慢，用 `iostat -xz 1`（来自 `sysstat` 包），重点看单次 I/O 平均等待延迟 `await`（毫秒）和设备饱和度 `%util`。

---

## 九、`systemd` 服务托管与 `journalctl` 日志（LNX-31）

在现代主流 Linux（Ubuntu、Debian、RHEL 等）中，PID 为 1 的初始化大管家就是 **`systemd`**。

### 1. 常用 `systemctl` 服务生命周期命令

| 命令 | 作用 |
| --- | --- |
| `sudo systemctl status logscan` | 看运行状态、主进程 PID、最近几行日志、是否开机自启 |
| `sudo systemctl start logscan` | 立即启动服务 |
| `sudo systemctl stop logscan` | 发送 `SIGTERM` 优雅停止服务 |
| `sudo systemctl restart logscan` | 重启（先 stop 再 start） |
| `sudo systemctl reload logscan` | 仅重载配置（需 unit 内定义了 `ExecReload`，不断开连接） |
| `sudo systemctl enable --now logscan` | 设为开机自启 **并** 立即启动 |
| `sudo systemctl disable logscan` | 取消开机自启 |
| `sudo systemctl daemon-reload` | **修改或新建 `.service` 文件后必跑！** 让 systemd 重新加载配置 |

### 2. 编写一个标准生产 `.service` 单元文件

系统级服务文件通常放在 `/etc/systemd/system/logscan.service`（若是普通用户无 root 托管，放在 `~/.config/systemd/user/logscan.service` 并加 `--user` 参数）：

```ini
# /etc/systemd/system/logscan.service
[Unit]
Description=LogScan Log Aggregation Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=logscan
Group=logscan
WorkingDirectory=/opt/logscan
Environment="LOG_LEVEL=info"
ExecStart=/opt/logscan/bin/logscan_srv --port 9090
Restart=on-failure
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=10
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

关键字段解析：
- `After=network-online.target`：确保网卡和 IP 就绪后再拉起服务。
- `User=logscan`：**最小权限原则**——永远不要用 `root` 跑自己的业务服务！
- `ExecStart=`：必须写**绝对路径**（systemd 不保证加载你的个人 `$PATH`）。
- `Restart=on-failure` + `RestartSec=3`：异常非零退出时自动在 3 秒后拉起；手动 `systemctl stop` 时不会触发重启。
- `LimitNOFILE=65535`：顺手把该服务最大打开文件描述符上限拉高，避免高并发下触发 `Too many open files (EMFILE)`。

### 3. `journalctl` 结构化日志查询

使用 `systemd` 托管的服务，所有输出到 `stdout`/`stderr` 的内容都会自动收集进二进制系统日志（journal），不用自己操心写轮转脚本：

| 命令 | 用途 |
| --- | --- |
| `journalctl -u logscan` | 查看 `logscan` 服务的全部历史日志 |
| `journalctl -u logscan -f` | 像 `tail -f` 一样实时追踪日志流 |
| `journalctl -u logscan -n 100 --no-pager` | 查看最近 100 行且不进分页器 |
| `journalctl -u logscan --since "15 minutes ago"` | 按相对或绝对时间窗口（如 `"2026-11-19 10:00:00"`）筛选 |
| `journalctl -u logscan -p err` | 只看 `err`（错误）及以上级别日志 |
| `journalctl -xe` | 服务启动失败时，跳到日志末尾看带解释说明的报错现场 |
| `sudo journalctl --disk-usage` / `--vacuum-size=500M` | 查看日志占用磁盘大小 / 清理旧日志限制在 500MB 内 |

---

## 十、定时任务（`crontab`/`systemd timer`）与包管理（`apt`/`dpkg`/`ldconfig`）（LNX-32）

### 1. `crontab` 定时任务语法与五大暗坑

管理当前用户的定时任务：`crontab -l`（列出）、`crontab -e`（编辑）。

5 个时间字段从左到右口诀：**分、时、日、月、周**（`m h dom mon dow command`）：

```text
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 每月第几天 (1 - 31)
│ │ │ ┌───────────── 月份 (1 - 12)
│ │ │ │ ┌───────────── 星期几 (0 - 7，0 和 7 都代表周日)
│ │ │ │ │
* * * * *  /path/to/command
```

常用写法示例：
- `*/5 * * * * /usr/local/bin/check.sh >> /var/log/check.log 2>&1`：每 5 分钟跑一次
- `30 2 * * 1-5 /opt/backup.sh >> /var/log/backup.log 2>&1`：周一到周五每天凌晨 2:30 跑一次
- `0 0 1 * * /opt/monthly_clean.sh`：每月 1 号零点跑一次

**`crontab` 新手最常踩的 4 个坑**：
1. **极简环境变量**：cron 运行时的 `$PATH` 通常只有 `/usr/bin:/bin`，不会读你的 `~/.bashrc`！脚本和命令**一律写绝对路径**（如 `/usr/local/bin/python3`），或在 crontab 顶部显式声明 `PATH=/usr/local/bin:/usr/bin:/bin`。
2. **`%` 符号陷阱**：crontab 把命令里的 `%` 当作换行符（后面内容喂给标准输入）！如果命令里要写 `date +%F`，必须转义成 **`date +\%F`**。
3. **无输出丢弃或邮件轰炸**：养成习惯在命令末尾加上 `>> /path/to/job.log 2>&1`。
4. **误敲 `crontab -r`**：`-e` 和 `-r` 在键盘上挨着，而 **`crontab -r` 会不经确认直接清空你所有定时任务！** 平时先执行 `crontab -l > crontab.bak` 做备份。

**现代替代方案：`systemd` Timer**
如果机器关机错过了凌晨 2 点的备份怎么办？`cron` 不会补跑，但配对的 `backup.service` + `backup.timer` 只需设置 `OnCalendar=*-*-* 02:00:00` 和 **`Persistent=true`**，开机后就会自动补跑错过的任务！用 `systemctl list-timers --all` 查看所有激活中的定时器。

### 2. Debian/Ubuntu 包管理与共享库刷新：`apt`、`dpkg`、`ldconfig`

| 命令 | 作用与工程用法 |
| --- | --- |
| `sudo apt update` | **刷新软件源索引**（只更新“目录清单”，不升级任何软件！装包前必跑） |
| `sudo apt install -y pkg` | 安装软件包并自动解决依赖 |
| `sudo apt upgrade` | 根据最新索引升级已安装的软件 |
| `apt search keyword` / `apt show pkg` | 搜索软件包 / 查看版本、依赖与简介 |
| `dpkg -l` / `dpkg -l \| grep ssl` | 列出本机**已安装**的包名与精确版本号 |
| **`dpkg -L libsqlite3-dev`** | **查某软件包到底往系统哪些路径装了哪些文件**（找头文件/库路径神器） |
| **`dpkg -S /usr/include/zlib.h`** | **反向定位**：看某个文件究竟是由哪个包安装进来的 |
| **`sudo ldconfig`** | **刷新动态库缓存 `/etc/ld.so.cache`**：手动源码编译安装了新的 `.so` 到 `/usr/local/lib` 后，若程序运行报找不到库，先确认 `/etc/ld.so.conf.d/` 包含该目录再跑一次 `sudo ldconfig` |

---

## 本课常见排错与反例速查

| 故障现象 | 最可能根因 | 一条命令定位与修复 |
| --- | --- | --- |
| 文件本身 `644`，普通用户仍报 `Permission denied` | 沿途父目录缺少 `x` 搜索位 | `namei -l /path/to/file` 逐级查看每层目录的 `x` 权限 |
| `chmod -R 644 dir/` 后子目录进不去了 | `-R 644` 把目录的 `x` 位也抹掉了 | `find dir -type d -exec chmod 755 {} +` |
| `kill -9 <PID>` 对某个进程毫无反应 | 进程处于 `D` 态（内核等 I/O）或 `Z` 态（已死僵尸） | `ps -eo pid,ppid,stat,wchan,comm \| grep <PID>`；`Z` 态查 `PPID` 修父进程 |
| `df -h` 剩 50%，却报 `No space left on device` | **1)** `inode` 耗尽；或 **2)** 大文件被 `rm` 但 FD 未关 | `df -i` 查 `IUse%`；`sudo lsof +L1` 找 `(deleted)` 文件 |
| 改了 `.service` 文件重启服务没生效 | 忘了通知 systemd 重载单元定义 | `sudo systemctl daemon-reload && sudo systemctl restart <svc>` |
| 手动在终端跑脚本正常，放进 `crontab` 就失败 | `$PATH` 缺失、相对路径或未转义 `%` | 全程使用绝对路径、`date +\%F`、`>> /tmp/job.log 2>&1` |

---

## 6 个梯度微练习

### 练习 1（读懂 `/etc/passwd` 与提权区别）
在 `/etc/passwd` 中看到两行记录：
```text
nginx:x:998:998:nginx user:/var/cache/nginx:/sbin/nologin
deploy:x:1001:1001::/home/deploy:/bin/bash
```
1. 为什么 `nginx` 的登录 Shell 是 `/sbin/nologin`？
2. 当你以 `alice` 身份登录时，执行 `su deploy` 和 `su - deploy` 在环境变量与密码输入上有什么本质区别？与 `sudo -u deploy bash` 相比呢？

<details>
<summary>核对答案</summary>

1. `nginx` 是服务专用账号，只用于隔离运行 Nginx worker 进程；将 Shell 设为 `/sbin/nologin` 可禁止任何人用该账号交互式登录系统，减小攻击面。
2. `su deploy` / `su - deploy` 都需要输入**目标用户 `deploy` 的密码**；其中不带 `-` 的 `su deploy` 会沿用原用户 `alice` 的环境变量（如 `$HOME`、`$PATH`）和当前目录，而 `su - deploy` 会彻底切换到 `deploy` 的登录环境与家目录。`sudo -u deploy bash` 则输入**当前用户 `alice` 自己的密码**（需在 `sudoers` 授权），且有完整的 `sudo` 操作审计日志。

</details>

### 练习 2（目录 `x` 位与 `umask` 位运算）
1. 在某目录 `secret/` 上设置权限 `chmod 711 secret/`，其内部文件 `secret/token.txt` 权限为 `644`。普通用户 `bob` 执行 `ls secret/` 和 `cat secret/token.txt` 分别会有什么结果？
2. 如果当前 Shell 设置了 `umask 0027`，用 `touch a.txt` 和 `mkdir b_dir` 新建的文件和目录权限分别是什么？如果误设成了 `umask 0037` 呢？

<details>
<summary>核对答案</summary>

1. `secret/` 对 `others` 的权限是 `--x`（只有执行/搜索位，没有 `r` 读位）。因此 `bob` 执行 `ls secret/` 会被拒绝（`Permission denied`，无法读取目录列表）；但如果他提前知道文件名，执行 `cat secret/token.txt` **可以成功读取内容**，因为父目录有 `x` 允许穿越解析路径，且目标文件对 `others` 有 `r`。
2. `umask 0027`：`a.txt` 为 `0666 & ~0027 = 0640`（`rw-r-----`）；`b_dir` 为 `0777 & ~0027 = 0750`（`rwxr-x---`）。若误设为 `umask 0037`：`a.txt` 为 `0666 & ~0037 = 0640`（按位运算依然是 `0640`，而非错误减法 `666-037`）；`b_dir` 为 `0777 & ~0037 = 0740`（注意组少了 `x` 位，同组成员将无法进入 `b_dir`！）。

</details>

### 练习 3（共享协作目录权限设计）
开发团队 `alice` 和 `bob` 都属于附加组 `backend`，需要在 `/srv/repo` 下共同读写各自创建的代码文件，且不希望同组以外的人查看，也不希望互相能删掉根目录本身。如何用 `chown`、`chmod` 和 `umask`（或 ACL）配置？

<details>
<summary>核对答案</summary>

```bash
sudo chown root:backend /srv/repo
sudo chmod 2770 /srv/repo   # 2(SGID)让新建文件自动继承 backend 组；770 只允许组内读写遍历
```
同时让 `alice` 和 `bob` 在该工程或环境中使用 `umask 0007`（或通过 `setfacl -d -m g:backend:rwX /srv/repo` 设置默认 ACL），确保新建文件默认带有同组写权限（`rw-rw----`），这样两人彼此都能修改对方创建的文件而外界无法访问。

</details>

### 练习 4（识别 `D` 态、`Z` 态与磁盘幽灵空间）
监控告警提示一台服务器 Load Average 突然飙升到 `16.5`（4 核 CPU），`top` 里显示 `%us = 3.0, %sy = 2.0, %wa = 88.0`，同时看到有 3 个任务处于 `D` 态、1 个处于 `Z` 态，另一台日志服务器 `df -h` 显示 `/` 使用率 `99%` 但 `du -sh /*` 统计总和只有 `45%`。请分别给出根因判断与精准排查命令。

<details>
<summary>核对答案</summary>

1. 第一台：`%wa = 88.0%` 且出现多个 `D` 态进程，说明瓶颈不是 CPU 计算，而是**磁盘/存储或 NFS I/O 严重卡死**，导致任务在内核态不可中断等待（此时 `kill -9` 杀不掉 `D` 态进程）。排查命令：`iostat -xz 1` 看哪块盘延迟/饱和度飙高、`ps -eo pid,ppid,stat,wchan,comm | grep ' D'` 看卡在哪个内核等待点。对于 `Z` 态僵尸进程，找它的 `PPID` 修复或重启父进程。
2. 第二台：典型**“文件已被 `rm` 删除，但仍有运行中的进程拿着它的 FD 未关闭”**。排查命令：`sudo lsof +L1` 找出标注 `(deleted)` 且体积巨大的条目，拿到对应 PID 优雅重启该服务即可立刻释放磁盘块。

</details>

### 练习 5（`systemd` 单元与日志排错）
写好 `logscan.service` 后你修改了里面的 `ExecStart` 参数，然后直接运行 `sudo systemctl restart logscan`，却发现进程启动的还是旧参数；接着你在新版本中把二进制路径写错了，导致服务起不来。写出修复步骤以及用 `journalctl` 定位错误的两条命令。

<details>
<summary>核对答案</summary>

1. 修改任何 `.service` 文件后，必须先执行 `sudo systemctl daemon-reload` 让 systemd 重新加载单元定义，再执行 `sudo systemctl restart logscan`。
2. 定位启动失败日志：
   ```bash
   sudo systemctl status logscan --no-pager
   sudo journalctl -u logscan -n 50 --no-pager
   # 或查看最近 10 分钟内错误详情：
   sudo journalctl -u logscan --since "10 minutes ago" -xe
   ```

</details>

### 练习 6（动手实操清单）
在你的 WSL2 Ubuntu 或 Linux 实验目录里依次完成以下验证（清理临时目录避免污染）：
1. 用 `tmux new -s lab` 开一个会话，跑一个 `sleep 300`，按 `Ctrl+b d` 脱离，用 `tmux ls` 确认存活后再 `tmux attach -t lab` 回来并结束它；
2. 用 `dpkg -L bash | head -n 10` 查看包安装清单，用 `dpkg -S $(which ls)` 反查 `ls` 属于哪个软件包；
3. 用 `ps -eo pid,ppid,stat,rss,comm --sort=-rss | head -n 6` 找出当前占物理内存最多的前 5 个进程。

<details>
<summary>实操参考输出说明</summary>

- `dpkg -S $(which ls)`（或 `dpkg -S /usr/bin/ls`）在 Ubuntu 上通常会返回 `coreutils: /usr/bin/ls`，表明 `ls` 由 `coreutils` 软件包提供。
- `ps -eo ... --sort=-rss` 输出的 `RSS` 单位为 KiB，代表进程当前真实驻留在物理内存中的大小，比 `VSZ`（虚拟地址空间总量）更能反映实际内存开销。

</details>
