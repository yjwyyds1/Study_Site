---
title: "USTC Linux 101 与《只学够用的 Linux》全量实战：从软件源、高频文件操作、后台保活到服务器最小生存指南"
description: "深度融合中科大《Linux 101》讲义与颢天《只学够用的 Linux：零基础最小入门教程》全部核心内容：SSH 密钥免密登录、高频文件操作（cp/mv/rm/ln/find 防呆参数）、Ubuntu/Debian apt 软件源与 dpkg/签名机制、压缩归档全套、nohup/tmux/systemd 后台常驻保活、ufw 防火墙与环境变量高效配置。"
order: 78
category: "Linux 实践"
tags: ["Linux 101", "USTC", "只学够用的Linux", "apt", "cp/mv/rm", "tmux", "systemd", "SSH", "归档压缩"]
related: ["handbook/linux-zero-start", "handbook/linux-text-shell", "handbook/linux-perm-admin", "handbook/linux-net-ops"]
sources: []
---

# USTC Linux 101 与《只学够用的 Linux》全量实战：从软件源、高频文件操作、后台保活到服务器最小生存指南

> **为什么需要这篇“二合一”最小生存与进阶全解？**
> 很多初学者面对上千页的 Linux 大部头教材容易陷入两个极端：要么死记硬背几百个一生都用不上一次的冷门选项，一上真实云服务器连配个 SSH 免密、跑个断网不掉线的后台服务都手足无措；要么只学会了无脑复制网上的命令，结果在 `cp -r` 目录嵌套、`ln -s` 相对路径基准、或者 `rm -rf` 通配符展开上踩出删库灾难。
>
> 本篇将国内口碑极佳的两套实战教材——**颢天《只学够用的 Linux：零基础最小入门教程》**的“二八定律最小生存心智”与**中国科学技术大学 LUG《USTC Linux 101》官方讲义**的“严谨底层机制与防呆参数细节”彻底融会贯通，凝练为 **LNX-53 ~ LNX-58** 六大实战模块。每一个知识点都配有可直接在 Ubuntu / Debian / WSL2 终端复制运行的完整脚本。

---

## 一、《只学够用的 Linux》最小生存心智：终端连接、SSH 免密与提示符解剖 (LNX-53)

《只学够用的 Linux》开篇提出了一个极其重要的方法论：**日常 95% 的服务器运维与开发工作，只依赖不到 20% 的高频核心命令与快捷键**。先把这套“最小生存闭环”练成肌肉记忆，比背诵生僻参数重要百倍。

### 1. 解剖终端提示符：`user@host:cwd$` 的每一寸信息

当你通过 WSL2 打开本地 Ubuntu，或者用 SSH 登录一台远程云服务器时，迎面看到的第一行字通常是：

```text
alice@ustc-node01:~/projects/logscan$
```

这短短一串字符浓缩了当前会话的**四大核心坐标**，动手敲任何命令前都应先扫一眼它：

| 组成部分 | 示例 | 准确含义与实战警示 |
| --- | --- | --- |
| **当前用户名** | `alice` | 你当前正以哪个账号的身份发号施令。如果是 `root`，意味着你拥有毁天灭地的最高权限，没有安全护栏！ |
| **分隔符与主机名** | `@ustc-node01` | `@` 后面是当前所在的机器名（Hostname）。当你同时打开五六个终端窗口连着本地 WSL、测试服、生产服时，**看清主机名是防止在生产环境误敲测试命令的第一道防线**。 |
| **当前工作目录 (CWD)** | `~/projects/logscan` | `:` 后面代表你此时此刻站在目录树的哪个位置。其中波浪号 **`~`** 是你个人家目录（`/home/alice`）的简写；如果显示 `/`，那才是整台机器的**根目录（Root Directory）**。 |
| **权限尾缀符号** | `$` 或 `#` | 普通用户末尾是 **`$`**；超级管理员 `root`（或执行了 `sudo -i` 切入特权 Shell 后）末尾会变成刺眼的 **`#`**。看到 `#` 时，敲下每一次回车前请三思！ |

### 2. `~` 家目录 vs `/` 根目录与 `sudo` 最小权限原则

新手最容易混淆的三个概念：
1. **`/`（根目录，Root Directory）**：整台 Linux 文件系统倒挂大树的唯一树根，所有分区、设备、目录都挂在它下面。
2. **`/root`（root 用户的家目录）**：超级管理员 `root` 账号私人的家目录。
3. **`~`（当前用户的家目录）**：如果你是普通用户 `alice`，`~` 就等于 `/home/alice`；如果你切换成了 `root`，`~` 就会变成 `/root`。可以通过以下命令直观验证：

```bash
# 展开 ~ 并对比根目录 / 与个人家目录
echo "当前用户: $(whoami), 家目录 ~ 展开为: $HOME"
pwd
ls -ld / /root "$HOME"
```

**为什么要坚持 `sudo` 最小权限原则，而不是直接用 `root` 登录干活？**
- 在日常编译代码、写脚本、看日志时，使用普通用户（`$`）哪怕手滑敲出 `rm -rf /*`，内核也会因为权限不足（`Permission denied`）当场拦截，保住系统核心文件 `/etc`、`/usr` 不被毁灭。
- 只有当你需要**安装系统软件包（`apt`）、修改全局配置（`/etc/...`）、管理系统服务（`systemctl`）或绑定 1024 以下的特权端口**时，才在单条命令前临时加上 `sudo`（Superuser Do）借用一次管理员令牌，并且系统会在 `/var/log/auth.log` 中完整审计谁在什么时间执行了哪条特权命令。

### 3. 本地 WSL2 终端 vs 远程云服务器 SSH 免密直连全流程

在本地 Windows 上我们通常使用 **Windows Terminal + WSL2** 直接获得原生 Linux 环境；而在连接远端机房或云服务器（假设公网 IP 为 `203.0.113.50`，SSH 端口为 `22`）时，全部依赖 **OpenSSH** 协议。

从“每次输密码且容易被暴力破解”升级到“**Ed25519 公钥免密 + 短别名一秒直连**”，只需标准三步：

```bash
# 第 1 步：在【你自己的本地电脑 (WSL2 / macOS / Windows)】生成高强度 Ed25519 密钥对
# -t ed25519 指定椭圆曲线算法（比传统 RSA-2048 更短、更快、更安全），-C 添加注释备注
ssh-keygen -t ed25519 -C "alice@workstation" -f ~/.ssh/id_ed25519

# 第 2 步：将本地公钥（id_ed25519.pub）一键追加到远程服务器的 ~/.ssh/authorized_keys 中
# 这一步会提示你输入最后一次远程服务器密码，而且会自动修正远端 ~/.ssh (700) 与 authorized_keys (600) 权限！
ssh-copy-id -i ~/.ssh/id_ed25519.pub -p 22 alice@203.0.113.50

# 第 3 步：配置本地 ~/.ssh/config，告别每次死记硬背 IP、端口和用户名
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat >> ~/.ssh/config << 'EOF'
Host prod-logscan
    HostName 203.0.113.50
    User alice
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 30
    ServerAliveCountMax 3
EOF
chmod 600 ~/.ssh/config
```

配置完成后，无论是登录终端还是后文用 `scp`、`rsync` 传文件，你都只需要敲下简短的别名：

```bash
# 直接用短别名免密秒连！而且每 30 秒自动发心跳包防路由器断开空闲连接
ssh prod-logscan
```

> **SSH 免密失败 99% 的元凶：文件权限过宽！**
> OpenSSH 极其注重安全：如果远端服务器上的 `~/.ssh` 目录权限不是 `700`（`drwx------`），或者 `~/.ssh/authorized_keys` 权限不是 `600`（`-rw-------`，即允许了组用户或其他人写入），`sshd` 会认为公钥可能被他人篡改而**静默拒绝免密登录**！万一手动复制公钥导致免密失效，在远端执行 `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys` 即可瞬间药到病除。

### 4. 终端救命快捷键全表：告别按住左方向键不放

在终端里输入了一长串命令发现开头少写了个 `sudo`，千万不要傻乎乎地按住左方向键等光标慢慢爬过去！Bash 默认内置了 GNU Readline 快捷键体系，掌握下面 9 个按键，终端操作速度立竿见影翻倍：

| 快捷键 | 核心作用 | 实战高频场景与底层本质 |
| --- | --- | --- |
| **`Tab`** | **自动补全（第一生产力！）** | 输入命令、路径、包名的前几个字母按 `Tab` 自动补全；连按两下 `Tab` 列出所有候选。**不仅快，而且能确保路径 100% 不拼错！** |
| **`Ctrl + C`** | **强制终止当前前台程序** | 向当前前台进程组发送 **`SIGINT`** 中断信号。程序卡死，或者命令敲了一半不想执行想重开一行时直接按它。 |
| **`Ctrl + D`** | **发送 EOF（文件结束符）/ 退出 Shell** | 在空命令行按下等同于输入 `exit` 退出当前终端；在 `cat`、`python3`、`sqlite3` 等读取标准输入的程序中表示输入结束。 |
| **`Ctrl + L`** | **清空当前屏幕** | 等价于敲 `clear` 命令，但**即使你当前命令行已经敲了一半字符也能随时清屏且不丢失已敲文字**！ |
| **`Ctrl + R`** | **历史命令反向增量搜索** | 按下后输入关键字（如 `cmake` 或 `docker`），立即从历史记录里匹配最近敲过的长命令；继续按 `Ctrl+R` 往前翻，按回车直接执行，按右方向键上屏修改。 |
| **`Ctrl + A` / `Ctrl + E`** | **光标瞬间跳到行首 / 行尾** | 忘了加 `sudo`？按 `Ctrl+A` 一秒跳到最前面补上 `sudo `，再按 `Ctrl+E` 回到行尾追加参数！ |
| **`Ctrl + W`** | **向前剪切一个单词（以空格为界）** | 刚敲错了一个长路径或参数？一下 `Ctrl+W` 瞬间删掉光标前整段词，比连按 20 下退格键优雅百倍。 |
| **`Ctrl + U` / `Ctrl + K`** | **剪切光标到行首 / 光标到行尾整段内容** | 命令敲得一团糟想整行重来，或者临时有事先把敲了一半的长命令“收起来”？按 `Ctrl+U` 整行剪切进剪贴环，办完事按 **`Ctrl + Y`（Yank）** 还能原封不动粘贴回来！ |
| **`Ctrl + Z`** | **将当前前台程序挂起到后台暂停** | 发送 `SIGTSTP` 信号把正在跑的 `vim` 或长任务暂停并退回 Shell，随后可用 `fg` 恢复到前台或用 `bg` 让它在后台继续跑。 |

---

## 二、USTC Linux 101 Ch03 文件与目录操作精解：cp/mv/rm/ln/mkdir 参数细节与防删库铁律 (LNX-54)

中科大《USTC Linux 101》第三章专门指出：几乎所有人都会敲 `cp`、`mv`、`rm`、`ln`，但**真正区分业余玩家与专业工程师的，是对高频防呆参数、目录已存在时的嵌套行为、以及软链接相对路径基准的精准掌控**。

### 1. `cp` 深度参数对比与“目录已存在 vs 不存在”嵌套大坑

先把 `cp`（Copy）最核心的 6 个参数建立清晰对照：

| 命令写法 | 关键参数作用 | 适用场景与核心细节 |
| --- | --- | --- |
| `cp src.txt dst.txt` | 默认拷贝普通文件 | **危险默认行为**：如果 `dst.txt` 已经存在，`cp` 会**毫无提示直接静默覆盖**原文件内容！另外默认用当前时间和当前执行者重置新文件的 `mtime` 与属主。 |
| `cp -i src.txt dst.txt` | `-i` (`--interactive`) 覆盖前询问 | 如果目标文件已存在，终端会停下来问 `cp: overwrite 'dst.txt'?`，输入 `y` 才覆盖。 |
| `cp -r dir1 dir2` | `-r` / `-R` (`--recursive`) 递归复制目录 | 不加 `-r` 直接拷目录会报错 `cp: -r not specified; omitting directory`。注意纯 `-r` 可能会丢失软链接属性或改变时间戳。 |
| **`cp -a dir1 dir2`** | **`-a` (`--archive`) 归档克隆模式** | **备份配置与工程目录的黄金首选！** 等价于 `-dR --preserve=all`：不仅递归拷贝，而且**原封不动保留软链接本身（不把它解引用拷成死文件）、文件权限位、属主/属组、以及精确的修改时间戳 `mtime`**。 |
| `cp -u src.txt dst.txt` | `-u` (`--update`) 仅当源更新时才复制 | 只有当源文件 `src.txt` 的修改时间比 `dst.txt` **更新**（或目标不存在）时才执行复制，适合手工增量同步大文件。 |
| `cp -v src.txt dst.txt` | `-v` (`--verbose`) 打印复制明细 | 每拷贝一个文件就打印一行 `'src.txt' -> 'dst.txt'`，批量复制时心里有底。 |

#### ⚠️ Linux 101 头号必考坑：`cp -r dir1 dir2` 当 `dir2` 已存在 vs 不存在时的行为突变！

很多同学写自动化部署脚本时都踩过这个大坑——**同样一句 `cp -a app_v1 app_deploy`，第一次跑得好好的，第二次重跑目录结构居然多套了一层 `app_deploy/app_v1`！**

原因在于 POSIX 标准对 `cp -r src_dir dst_dir` 的两套分支判定：
1. **当目标目录 `dst_dir` 尚不存在时**：`cp -r dir1 dir2` 会新建一个叫 `dir2` 的目录，并把 `dir1` 里面的内容放进 `dir2`（即克隆改名：`dir2/fileA`）。
2. **当目标目录 `dst_dir` 已经存在时**：`cp -r dir1 dir2` 会认为你想把**整个 `dir1` 目录本身作为子目录**塞进 `dir2` 肚子里面（结果变成了 **`dir2/dir1/fileA`**）！

**如何破局？用 `dir1/.` 明确告诉 `cp`：“无论目标目录存不存在，我只要把 `dir1` 里面的内容考进 `dir2`！”**

我们写一段可一键验证的沙盒脚本亲眼见证这个差异：

```bash
# 创建实验沙盒
rm -rf /tmp/lnx54_cp_demo && mkdir -p /tmp/lnx54_cp_demo/dir1
touch /tmp/lnx54_cp_demo/dir1/config.yaml /tmp/lnx54_cp_demo/dir1/main.cpp
cd /tmp/lnx54_cp_demo

# 【情形 1】目标 dir2 不存在时：dir2 直接成为 dir1 的克隆
cp -a dir1 dir2
echo "=== 第一次执行 cp -a dir1 dir2（此时 dir2 原本不存在） ==="
find dir2 -maxdepth 2

# 【情形 2】目标 dir2 已经存在时再跑同一句：惨剧发生，dir1 被嵌套进了 dir2/dir1！
cp -a dir1 dir2
echo "=== 第二次执行 cp -a dir1 dir2（此时 dir2 已经存在，产生多余嵌套！） ==="
find dir2 -maxdepth 2

# 【标准破局写法】使用 dir1/. 结尾，无论 target_dir 是否已存在，永远精准复制目录内部内容（连隐藏文件 .env 也能一并拷过去，比 dir1/* 更稳健！）
mkdir -p target_dir
cp -a dir1/. target_dir/
cp -a dir1/. target_dir/
echo "=== 使用 cp -a dir1/. target_dir/ 无论重复执行多少次，结构永远平整一致 ==="
find target_dir -maxdepth 2
```

> **为什么推荐 `cp -a dir1/. target_dir/` 而不是 `cp -a dir1/* target_dir/`？**
> 因为 Shell 通配符 `*` 默认**不会匹配以点号 `.` 开头的隐藏文件**（例如 `.gitignore`、`.env`、`.clang-format`）！而 `dir1/.` 指向目录自身节点，不仅能彻底杜绝多套一层目录，还能把所有普通文件与隐藏文件一字不漏地完整拷过去。

### 2. `mv` 移动与重命名的底层真相：瞬间改指针 vs 跨分区搬家

在 Linux 里并没有独立的“重命名”命令，**重命名和移动位置全都是 `mv`（Move）**。理解 `mv` 的速度和安全性，关键看源路径和目标路径是否在**同一个文件系统分区（Filesystem）**上：

- **同分区内 `mv big_100GB.iso /home/alice/archive/`**：哪怕这个文件有 100GB，`mv` 也会在 **0.001 秒内瞬间完成**！因为底层磁盘上的 100GB 数据块根本一动没动，内核只是在旧目录里删掉了指向该 `inode` 的目录项名字，并在新目录里添了一条指向同一个 `inode` 编号的新名字。
- **跨分区 `mv /home/alice/big.iso /mnt/usb_disk/`**：不同分区拥有各自独立的 `inode` 表，此时 `mv` 在底层被迫退化为 **`cp`（跨盘完整复制全部字节） + `rm`（复制成功后删除源文件）**，不仅耗时漫长，而且一旦中途拔掉 U 盘或断电，就会留下半截残缺文件。跨盘搬运超大批次重要数据时，更推荐后文介绍的 `rsync -avP --remove-source-files`。

### 3. `rm` 安全防线：比 `-i` 实用百倍的 **`rm -I`** 与防删库铁律

Linux 的 `rm`（Remove）直接调用 `unlink()` 系统调用解除文件名与 `inode` 的绑定，**没有任何内置图形回收站**。一旦执行，文件块立刻被标记为空闲，随时会被后续写入的新日志覆写。

让我们对比 `rm` 的全部安全开关：

| 参数 / 工具 | 行为特征 | 为什么很多人用错了？ |
| --- | --- | --- |
| `rm -f` | `--force` 强制删除，文件不存在也不报错，彻底屏蔽所有确认提示 | 在脚本里清理临时构建目录很有用，但在交互终端手敲 `rm -rf` 配合通配符 `*` 就是一切删库悲剧的源头（如把 `rm -rf /tmp/dir/*` 敲成多一个空格的 `rm -rf /tmp/dir/ *`！）。 |
| `rm -i` | `--interactive=always` **每删一个文件都要问一次 `y/n`** | 很多人喜欢在 `~/.bashrc` 里设 `alias rm='rm -i'`。**这其实是个著名的反模式**！当你需要删一个包含 500 个 `.o` 文件的目录时，连敲 500 次 `y` 会让你极其烦躁，最终养成不管删什么都条件反射直敲 **`rm -rf`** 的致命坏习惯！ |
| **`rm -I`（大写 i）** | **删除超过 3 个文件，或者带 `-r` 递归删除目录时，总共只询问 1 次！** | **《USTC Linux 101》强烈推荐的黄金折中方案！** 平时删一两个文件干脆利落不烦人；一旦你不小心敲了 `rm *.cpp` 或 `rm -r src/`，它会立刻弹窗拦截一次：`rm: remove 12 arguments?`，既能救命又不会逼你养成滥用 `-f` 的恶习。 |
| `--preserve-root` | GNU `rm` 默认开启的防自杀开关 | 直接敲 `sudo rm -rf /` 会被 `rm` 拒绝；但注意它**挡不住 `sudo rm -rf /*`**（因为 Shell 会先把 `/*` 展开成 `/bin /boot /etc /home ...` 再传给 `rm`）！ |

**工程师防删库三条铁律：**
1. **通配符先用 `ls` 预演**：想删 `rm -rf build_*.tmp` 之前，**先敲 `ls -d build_*.tmp`** 看一眼展开列表，确认无误后，按方向键 `↑` 调出刚才那行，按 `Ctrl+A` 把开头的 `ls -d` 改成 `rm -r`。
2. **给日常终端配置 `alias rm='rm -I'`**（大写 `I`），或者安装命令行回收站工具 **`trash-cli`**（用 `trash-put` 代替 `rm`，误删后随时 `trash-restore` 找回）。
3. **在自动化脚本里永远先校验变量非空**：绝不裸写 `rm -rf "$BUILD_DIR/*"`（万一 `$BUILD_DIR` 未定义为空，就会变成 `rm -rf /*`！），必须写成 `rm -rf "${BUILD_DIR:?Error: BUILD_DIR is empty}/"*`。

### 4. `mkdir -p`、`touch` 与 `ln -s` 软链接的相对路径基准大坑

- **`mkdir -p a/b/c`**：`-p`（`--parents`）有两个绝妙作用——第一，如果父目录 `a` 和 `a/b` 不存在，自动一路递归创建；第二，**如果目录 `a/b/c` 已经存在，加了 `-p` 不会报错退出（幂等安全）**，这在 Makefile 和自动化脚本中是必加参数。
- **`touch file.txt`**：如果文件不存在，创建一个 0 字节空文件；如果文件已经存在，**绝不会清空它的内容**，而是把它的访问时间（`atime`）和修改时间（`mtime`）刷新为当前时刻（常用来触发 Make 重新编译某个源文件）。
- **硬链接（`ln target link_name`） vs 软链接/符号链接（`ln -s target link_name`）**：
  - **硬链接**是给同一个底层 `inode` 多起一个平等的别名，删掉原文件名完全不影响通过硬链接继续读取数据（只有当指向该 `inode` 的硬链接计数降为 0 且没有进程打开它时，磁盘空间才真正释放）；硬链接**不能跨分区，也不能链接目录**。
  - **软链接（`ln -s`）**则是一个独立的小文件（拥有自己的新 `inode`），它肚子里的内容仅仅是**目标路径的字符串文本**（就像 Windows 的快捷方式），既能跨分区，也能指向目录。

#### ⚠️ USTC Linux 101 必考高频坑：`ln -s` 使用相对路径时，基准目录到底是谁？

假设你当前站在 `/tmp/work` 目录下，里面有一个 `/tmp/work/src/app.conf`，你想在 `/tmp/work/deploy/` 目录下创建一个指向它的软链接 `current.conf`。
如果你随手敲下：

```bash
# ❌ 错误示范：以为相对路径是以“当前工作目录 /tmp/work”为基准！
ln -s src/app.conf deploy/current.conf
```

敲完你会发现 `deploy/current.conf` 变成了**闪烁红色的死链接（Broken symlink）**，`cat deploy/current.conf` 直接报错 `No such file or directory`！为什么？

**铁律：软链接内部保存的只是一个纯文本字符串。当内核去解引用 `deploy/current.conf` 时，所有的相对路径都是以“软链接文件自身所在的父目录（即 `deploy/`）”为起点去寻找的！**
在上面的错误示范里，内核站在 `deploy/` 目录下去找 `src/app.conf`，实际找的是 `/tmp/work/deploy/src/app.conf`，当然找不到！

解决这个坑有两种最稳妥的办法（特别是 GNU Coreutils 自带的 **`ln -sr`** 神器）：

```bash
# 动手实验：亲手复现并解决 ln -s 相对路径断链坑
rm -rf /tmp/lnx54_ln_demo && mkdir -p /tmp/lnx54_ln_demo/src /tmp/lnx54_ln_demo/deploy
echo "port = 8080" > /tmp/lnx54_ln_demo/src/app.conf
cd /tmp/lnx54_ln_demo

# ❌ 错误做法：直接按当前目录写相对路径，导致断链
ln -s src/app.conf deploy/broken.conf
ls -l deploy/broken.conf
cat deploy/broken.conf || echo "--> 读取失败！因为内核去 deploy/src/app.conf 找了！"

# ✅ 正确做法 1：加上 -r (--relative) 参数，让 ln 自动计算以 deploy/ 为基准的相对路径 (../src/app.conf)！
ln -sr src/app.conf deploy/good_rel.conf

# ✅ 正确做法 2：直接传入以 / 开头的绝对路径
ln -s /tmp/lnx54_ln_demo/src/app.conf deploy/good_abs.conf

ls -l deploy/
cat deploy/good_rel.conf
```

---

## 三、USTC Linux 101 软件安装全景：APT 镜像源、包生命周期、dpkg 与外部 GPG 签名源 (LNX-55)

刚从 Windows 转过来的同学最习惯的装软件方式是：“打开浏览器搜官网 → 下载 `.exe` 安装包 → 一路下一步”。但在 Linux 世界里，**99% 的基础软件、编译器、数据库和系统库都不需要也不应该去网页上到处乱找安装包**，而是通过发行版官方维护的**中心化软件仓库（Repository）与包管理器（APT）**一条命令装好。

### 1. 为什么 Linux 采用中心化软件仓库？

1. **自动解决依赖地狱（Dependency Resolution）**：假设你要装软件 A，A 依赖动态库 B（要求版本 $\ge 2.4$），B 又依赖库 C。APT 会自动在本地索引库里算出整棵依赖树，一次性把 A、B、C 全部下载并按拓扑顺序配置妥当；卸载时还能用 `apt autoremove` 自动清掉不再被需要的孤立依赖。
2. **全链路数字签名防篡改**：软件源里的每一个包都有发行版官方 GPG 私钥签名，APT 下载后会用 `/etc/apt/trusted.gpg.d/` 或 `/etc/apt/keyrings/` 里的公钥严格校验 SHA256 哈希，杜绝下载站捆绑木马。
3. **一键全机安全更新**：只要运行 `sudo apt update && sudo apt upgrade`，全机所有软件（从内核、OpenSSL、GCC 到 Nginx、Python）的漏洞补丁一次性全部升级完毕。

### 2. `/etc/apt/sources.list` 与 Ubuntu 24.04+ DEB822 格式及中科大镜像源替换

APT 去哪里下载软件，全由软件源配置文件决定。在 Ubuntu / Debian 演进中有两代格式：

- **传统单行格式（Ubuntu 22.04 及更早版本，`/etc/apt/sources.list`）**：
  ```text
  deb https://mirrors.ustc.edu.cn/ubuntu/ jammy main restricted universe multiverse
  ```
  其中：
  - `deb` 表示二进制预编译包（而 `deb-src` 表示源码包）；
  - `jammy` 是发行版代号（22.04 为 `jammy`，24.04 为 `noble`，可通过 `lsb_release -cs` 查看）；
  - 后面的四个词是 Ubuntu 官方仓库的四大组件分类：**`main`**（官方维护的自由开源软件）、**`restricted`**（官方维护的非完全自由驱动，如显卡闭源驱动）、**`universe`**（社区维护的海量开源软件，90% 的开发工具在这里）、**`multiverse`**（有版权或专利限制的软件）。
- **现代 DEB822 键值对格式（Ubuntu 24.04 LTS 起默认采用，`/etc/apt/sources.list.d/ubuntu.sources`）**：
  结构清晰且原生绑定了 `Signed-By` 密钥路径：
  ```text
  Types: deb
  URIs: https://mirrors.ustc.edu.cn/ubuntu
  Suites: noble noble-updates noble-backports
  Components: main restricted universe multiverse
  Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
  ```

无论你用的是传统格式还是 Ubuntu 24.04 的 DEB822 新格式，只需下面一条 `sed` 命令（执行前自动备份原文件）就能一键替换为高速稳定的**中国科学技术大学开源软件镜像站（`mirrors.ustc.edu.cn`）**：

```bash
# 自动识别 Ubuntu 传统 sources.list 或 24.04+ ubuntu.sources，备份后一键替换为中科大 USTC 镜像源
if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then
    sudo sed -i.bak 's@http://\(archive\|security\).ubuntu.com/ubuntu@https://mirrors.ustc.edu.cn/ubuntu@g' /etc/apt/sources.list.d/ubuntu.sources
elif [ -f /etc/apt/sources.list ]; then
    sudo sed -i.bak 's@http://\(archive\|security\).ubuntu.com/ubuntu@https://mirrors.ustc.edu.cn/ubuntu@g' /etc/apt/sources.list
fi

# 换源后必须执行 apt update 刷新本地软件包索引缓存！
sudo apt update
```

### 3. `apt` 全套操作生命周期速查表（含救命神器 `apt-file`）

很多人分不清 `apt update` 和 `apt upgrade`，或者卸载软件后发现残留配置还在。下面这张表涵盖了 `apt` 生命周期的每一个环节：

| 命令 | 核心动作与底层机制 | 实战必知要点 |
| --- | --- | --- |
| **`sudo apt update`** | **只刷新本地“菜单目录”（软件包索引列表），不升级任何已安装的软件！** | 每次新开机器、换源、或准备 `apt install` 新软件前**必须先跑一遍 `apt update`**，否则本地旧索引指向的旧版本号在远端镜像站可能早已下架，导致报 `404 Not Found`！ |
| **`sudo apt upgrade`** | 对比本地已装软件与最新索引，下载并升级所有可更新的包 | 默认安全策略：只升级现有包，绝不擅自删除任何已安装的包；若涉及内核或依赖拓扑大变动需增删包，需用 `sudo apt full-upgrade`。 |
| `sudo apt install <pkg>` | 下载并安装指定包及其全部依赖 | 可加 `-y` 自动确认；若只想重新安装损坏的包，用 `sudo apt install --reinstall <pkg>`。 |
| `sudo apt remove <pkg>` | 卸载该软件的二进制程序，但**保留 `/etc/` 下的系统配置文件** | 万一以后还要重装，原有的配置不会丢。 |
| **`sudo apt purge <pkg>`** | **彻底卸载！不仅删程序，连 `/etc/` 下的全局配置文件也一并抹除** | 当你把 Nginx 或 MySQL 的 `/etc/` 配置文件改坏了想彻底恢复出厂重来时，必须用 `apt purge`（注意：它不会删你个人家目录 `~` 下的点文件）。 |
| **`sudo apt autoremove`** | 自动清理当初作为“被动依赖”装进来、如今没有任何软件再需要它的孤立包 | 配合 `--purge`（`sudo apt autoremove --purge`）可连同废弃依赖的残留配置一起清干净。 |
| `apt search <keyword>` / `apt show <pkg>` | 在本地索引中搜索包名与描述 / 查看某个包的版本、体积、依赖详情 | 不需要 `sudo`，普通用户直接查询。 |
| **`apt-file search <filename>`** | **反向检索：已知缺失的某个头文件（如 `zlib.h`）或命令，查出它到底属于哪个尚未安装的软件包！** | 编译 C/C++ 项目报 `fatal error: xxx.h: No such file or directory` 时的**头号救星**！（需先 `sudo apt install apt-file && sudo apt-file update`）。 |

### 4. 底层 `dpkg` 救急四板斧：当你需要手动安装 `.deb` 或反查文件归属

`apt` 是高层的“外卖平台”（负责联网拉取索引和计算依赖树），而真正动手把 `.deb` 压缩包解压安装到系统目录并维护本地已安装数据库（`/var/lib/dpkg/`）的底层工匠是 **`dpkg`**。

掌握 `dpkg` 的四条核心命令，能解决所有离线包与文件溯源难题：

```bash
# 1. 手动安装一个本地下载好的 .deb 软件包（例如 vscode.deb 或 chrome.deb）
# 注意：dpkg 本身不会联网下载依赖！如果报 dependency problems 缺失依赖，紧接着跑下一行 apt -f install 即可自动补齐！
# sudo dpkg -i ./package.deb
# sudo apt -f install   # -f (--fix-broken)：让 APT 自动联网下载补齐刚才 dpkg 缺失的依赖并完成配置

# Note: 现代 Ubuntu 更推荐直接用 apt 安装本地 deb（必须带 ./ 或绝对路径），它会自动调 dpkg 并一并装好联网依赖：
# sudo apt install ./package.deb

# 2. dpkg -l：列出当前机器上所有已安装的 deb 软件包（可配合 grep 过滤）
dpkg -l | grep -E "gcc|g\+\+|cmake" | head -n 5

# 3. dpkg -L <pkg>：查清楚某个已安装的包到底在我的系统里放了哪些文件、头文件和二进制？（神级排错命令！）
dpkg -L zlib1g-dev | head -n 10

# 4. dpkg -S <path>：反向溯源！给定硬盘上的任意一个系统文件，查出它是被哪个 deb 包安装进来的
dpkg -S /usr/include/stdio.h
```

### 5. 现代第三方软件源标准姿势：`/etc/apt/keyrings/*.gpg` + `[signed-by=...]`

当你需要安装 Docker、Node.js、LLVM 或 CMake 官方最新版的第三方 APT 源时，经常在网上老教程里看到 `sudo apt-key add ...`。
**请注意：`apt-key` 命令因为将第三方公钥混入全局信任环（导致某个第三方源被黑就能伪造全系统任意系统包更新的致命安全漏洞），已经在 Ubuntu 22.04+ / Debian 12+ 中被彻底废弃删除！**

《USTC Linux 101》规范的**现代第三方源最小权限隔离法（Keyrings + `signed-by` 一对一绑定）**标准模板如下：

```bash
# 现代添加第三方 APT 软件源的标准安全三步曲（以添加某官方源为例，仅展示标准命令范式）：
# 第 1 步：确保 /etc/apt/keyrings 目录存在（权限 0755）
sudo install -m 0755 -d /etc/apt/keyrings

# 第 2 步：下载第三方官方 GPG 公钥，用 gpg --dearmor 转为二进制格式存入专属 keyring 文件（若原文件已是二进制 .gpg 则直接下载）
# curl -fsSL https://example.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/example.gpg
# sudo chmod a+r /etc/apt/keyrings/example.gpg

# 第 3 步：在 /etc/apt/sources.list.d/ 下新建专属 .list 文件，显式用 [signed-by=...] 锁定该公钥只允许签发这一个仓库！
# echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/example.gpg] https://example.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/example.list > /dev/null
```

---

## 四、打包、压缩与跨机传输一表通：tar / zip / 7z / rsync / scp (LNX-56)

很多新手看到 `.tar.gz`、`.tar.xz`、`.tar.zst`、`.tgz` 一头雾水：为什么 Windows 里一个 `.zip` 就搞定的事，Linux 要搞出 `.tar.xxx` 两层后缀？

### 1. 分清“打包（Archiving）”与“压缩（Compression）”

UNIX 哲学崇尚“**一个工具只把一件事做到极致**”：
- **打包（Archiving，`tar` = Tape Archive）**：把成百上千个零散的文件和子目录（连同它们的权限位、软链接、属主、修改时间戳）按顺序拼接成一个单一的大文件（`.tar`）。**单纯的 `.tar` 包并不进行数据压缩**，体积几乎等于原文件之和。
- **流式压缩（Compression，`gzip` / `bzip2` / `xz` / `zstd`）**：这些压缩算法当初被设计为只对**单个字节流**进行高效率字典压缩。
- **两者合璧**：先用 `tar` 把整个目录树打成一个字节流，再直接通过管道交给 `gzip` 或 `zstd` 压成 `.tar.gz` 或 `.tar.zst`！在 Linux 里，这种组合被称为 **Tarball**，它最大的优势是**完美保留 Linux 文件权限、`+x` 可执行位与软链接结构**（而传统的 `.zip` 经常会弄丢权限或把软链接变成死副本）。

常见四种压缩后端横向评测：

| 后缀名 | 压缩工具 | `tar` 传统参数 | 压缩速度 | 压缩率（体积越小越好） | 现代选型建议 |
| --- | --- | --- | --- | --- | --- |
| `.tar.gz` / `.tgz` | `gzip` | `-z` | 快 | 中规中矩 | **兼容性之王**，任何古老系统都能解开 |
| `.tar.bz2` | `bzip2` | `-j` | 慢 | 较好 | 已逐渐被 `xz` 和 `zstd` 取代 |
| `.tar.xz` | `xz` | `-J` | 极慢（吃 CPU） | **极高（体积极小）** | 适合发布源码包（如 Linux 内核源码）、长期冷备 |
| **`.tar.zst`** | **`zstd`** | **`--zstd` 或 `-a`** | **极快（多线程秒压）** | **高（优于 gzip）** | **Facebook 开源的现代全能冠军！日常备份与日志归档首选** |

### 2. 现代 `tar` 的终极偷懒秘籍：不用再死记 `-z` / `-j` / `-J`！

过去老师总让大家背：`.gz` 用 `tar -zxvf`，`.bz2` 用 `tar -jxvf`，`.xz` 用 `tar -Jxvf`……其实**现代 GNU `tar` 早就支持自动识别压缩算法了**！

你只需要记住四个核心字母：
- **`-c`（Create）**：创建新归档包；配合 **`-a`（Auto-compress）**，**`tar` 会根据你写的输出文件名后缀（`.tar.gz` / `.tar.xz` / `.tar.zst`）自动挑选对应的压缩算法**！
- **`-x`（Extract）**：解压归档包（解压时**根本不需要写 `-z/-j/-J/-a`**，`tar` 会直接读取文件头魔数自动识别所有压缩格式！）；配合 **`-C /target/dir`** 指定解压到哪个目标目录。
- **`-t`（List）**：**不解压**，先列出包里面的目录结构！
- **`-v`（Verbose）** 与 **`-f`（File）**：`-v` 显示文件列表；**`-f` 后面必须紧挨着归档文件名**（所以永远把 `f` 放在组合参数的最后一个字母，如 `-caf`、`-xvf`、`-tvf`）。

> **⚠️ 拆包防“炸弹包（Tarbomb）”护栏**：
> 有些不规范的压缩包在打包时没有包含顶层目录，而是直接把几百个零散文件打在了根层级。如果你在当前工作目录下盲目敲 `tar -xvf bad.tar.gz`，几百个文件会瞬间散落一地，和你原有的文件混在一起极难清理！
> **好习惯**：解压陌生包前，先敲 **`tar -tvf archive.tar.gz | head -n 20`** 看一眼是否有统一的顶层目录；或者养成每次都新建一个空目录再用 **`tar -xvf archive.tar.gz -C ./unpack_dir`** 隔离解压的习惯。

### 3. `zip / unzip`（解决 Windows 中文乱码）与 `7z` 全套实操

当你必须和 Windows 同事互传文件时，`.zip` 和 `.7z` 依然是刚需：

```bash
# 动手实验：tar 全自动打包预览解压 + zip 打包
rm -rf /tmp/lnx56_archive && mkdir -p /tmp/lnx56_archive/project/src
echo "int main() { return 0; }" > /tmp/lnx56_archive/project/src/main.cpp
cd /tmp/lnx56_archive

# 1. 使用 tar -caf 根据后缀自动调用 gzip 打包压缩（注意传入相对路径 project/ 而不是绝对路径）
tar -caf project_backup.tar.gz project/

# 2. 不解压，先用 tar -tvf 预览包内目录层级与权限（确认有顶层目录 project/）
tar -tvf project_backup.tar.gz

# 3. 安全解压到指定的 ./restore 目录下（自动识别格式，无需记 -z/-j/-J）
mkdir -p restore
tar -xvf project_backup.tar.gz -C ./restore

# 4. zip 递归打包目录（注意：zip 递归目录必须加 -r！）与 unzip 解压到指定目录 (-d)
zip -r project.zip project/
unzip -l project.zip                 # -l: 不解压仅预览 zip 包内清单
unzip -q project.zip -d ./restore_zip # -q 安静模式，-d 指定解压目标目录
```

- **Windows 发来的 `.zip` 解压后中文文件名全是乱码怎么办？**
  Windows 中文版默认使用 `GBK`（`CP936`）编码记录 zip 包内的文件名，而 Linux 默认是 `UTF-8`。解压时显式加上 **`-O GBK`**（或 `-O CP936`）即可完美还原中文文件名：
  ```bash
  # 解决 Windows 压缩的中文 zip 包在 Linux 下文件名乱码
  # unzip -O GBK windows_files.zip -d ./output_dir
  ```
- **`7z` 高压缩比归档**（需 `sudo apt install p7zip-full`）：
  - 打包：`7z a archive.7z project/`
  - 完整保留目录结构解压：**`7z x archive.7z -o./out_dir`**（注意：**一定要用 `7z x` 而不是 `7z e`**！因为 `7z e` 会把所有子目录里的文件全部拍平混在同一层目录里，且 `-o` 和目录路径之间**不能有空格**！）。

### 4. 跨机文件传输对决：`scp` vs 工业级神器 `rsync -avzP`

在本地与远程服务器之间传文件，新手最熟的是 `scp`，但老手几乎清一色使用 **`rsync`**：

| 维度 | `scp`（OpenSSH 简单拷贝） | **`rsync`（远程增量同步之王）** |
| --- | --- | --- |
| **指定 SSH 端口** | **`-P 2222`（注意是大写 P！）** | `-e 'ssh -p 2222'`（或直接读取 `~/.ssh/config` 别名） |
| **断网续传与增量** | **不支持**。传一个 10GB 数据集到 99% 断网，重跑必须从 0% 重新传；改了一个小文件也得全量重传。 | **原生支持块级增量比对与断点续传（`-P`）**！只传输发生变化的字节块，断网重跑瞬间从 99% 继续。 |
| **保留属性与软链接** | `scp -r` 会把软链接直接解引用拷成多份实体文件，可能撑爆磁盘！ | **`-a`（归档模式）** 完美保留软链接、权限、时间戳与目录结构。 |

**记住这一条万能命令 `rsync -avzP`**：
- **`-a`**：Archive 归档模式（递归 + 保留软链接、权限、时间戳、属主）；
- **`-v`**：Verbose 打印详细传输清单；
- **`-z`**：在网络传输过程中实时开启压缩，省带宽提速；
- **`-P`**：等价于 `--partial --progress`，既**实时显示每个文件的传输进度条与速率**，又在断网时**保留已传了一半的临时文件支持断点续传**！

```bash
# 用 rsync 在本地演示增量同步与 --dry-run 预演（跨机传输只需把目标路径换成 prod-logscan:/home/alice/backup/）
mkdir -p /tmp/lnx56_archive/rsync_dst
rsync -avzP /tmp/lnx56_archive/project/ /tmp/lnx56_archive/rsync_dst/

# ⚠️ 注意 rsync 源路径末尾斜杠 / 的微妙区别（和 cp -r dir/. 类似）：
# - 源路径带末尾斜杠 `project/`：表示把 project 里面的内容同步进目标目录；
# - 源路径不带末尾斜杠 `project`：表示在目标目录下新建一个叫 project 的子目录！
```

---

## 五、任务后台常驻与断网保活三剑客：nohup、tmux 分屏会话与 systemd 服务守护 (LNX-57)

无论是在服务器上跑一个需要训练 10 小时的深度学习模型、编译大型 C++ 工程，还是部署我们自己写的 `LogScan` C++ TCP 微服务，新手都会撞上同一个痛点：**本地电脑一合盖、Wi-Fi 抖动或者关掉 SSH 窗口，服务器上正在跑的程序当场被杀得干干净净！**

### 1. 为什么关掉 SSH 窗口，正在跑的程序会死？（`SIGHUP` 信号机制）

这绝不是 Linux 的 Bug，而是精密的进程会话管理机制：
1. 当你通过 SSH 登录服务器时，`sshd` 会为你分配一个虚拟终端（伪终端 `pts/0`），并启动一个 `bash` 进程作为该会话的**会话首进程（Session Leader）**。
2. 你在这个 `bash` 里直接敲 `./my_server` 启动的程序，默认都是 `bash` 的子进程，且与这个控制终端绑定在同一个会话里。
3. 当你关掉 SSH 客户端窗口或网络断开时，内核检测到伪终端断开，会立刻向会话首进程 `bash` 发送 **`SIGHUP`（Signal Hangup，挂断信号，编号 1）**；而 **`bash` 在收到 `SIGHUP` 退出前，会顺手向它麾下所有正在运行的前台和后台子作业（Jobs）逐一广播转发这个 `SIGHUP` 信号**！
4. 绝大多数程序对 `SIGHUP` 的默认处理动作就是**立即终止退出（Terminate）**。

因此，要让任务在 SSH 断开后依然坚挺运行，核心只有两条路：**要么让进程忽略 `SIGHUP` 信号并脱离终端（`nohup`）；要么让进程运行在一个不随 SSH 断开而销毁的独立守护会话或系统管家之下（`tmux` / `systemd`）**。下面按三大场景逐一实战。

### 2. 方案一（临时跑单次长耗时脚本）：`nohup` + `&` + `jobs / fg / bg / disown`

如果你只是临时跑一个数据处理脚本，不需要交互输入，最轻量的原生组合是 **`nohup ... > task.log 2>&1 &`**：
- 开头的 **`nohup`**（No Hangup）：替你的程序拦截并忽略 `SIGHUP` 挂断信号；
- 中间的 **`> task.log 2>&1`**：把标准输出（`1`）和标准错误（`2`）全部重定向写入 `task.log` 文件（脱离终端后不能再往屏幕打了）；
- 末尾的 **`&`**：让命令直接进入后台运行，立刻把命令行提示符还给你。

```bash
# 动手实验：用 nohup 启动后台任务并实时观察日志
cat > /tmp/long_job.sh << 'EOF'
#!/usr/bin/env bash
for i in {1..3}; do
    echo "[$(date +%T)] 正在处理第 $i 批日志..."
    sleep 1
done
echo "[$(date +%T)] 任务圆满完成！"
EOF
chmod +x /tmp/long_job.sh

# 1. 标准 nohup 后台启动姿势，并用 $! 捕获后台进程 PID
nohup /tmp/long_job.sh > /tmp/job.log 2>&1 &
JOB_PID=$!
echo "后台任务已启动，PID = $JOB_PID"

# 2. 用 jobs -l 查看当前 Shell 挂载的后台作业列表
jobs -l

# 3. 等待任务跑完并查看输出日志（线上长任务常用 tail -f /tmp/job.log 实时滚动盯盘）
wait "$JOB_PID"
cat /tmp/job.log
```

> **救急锦囊：万一程序已经直接敲回车跑起来了，跑了半小时才想起忘了加 `nohup` 和 `&`，但现在急着下班关电脑怎么办？**
> 千万别按 `Ctrl+C` 杀掉重跑！按下面三步在 5 秒内无损挽救：
> 1. 按 **`Ctrl + Z`**：把正在前台跑的程序临时**暂停并挂起到后台**（你会看到提示 `[1]+ Stopped`）；
> 2. 敲 **`bg %1`**：让刚才暂停的 1 号作业在**后台继续恢复运行**；
> 3. 敲 **`disown -h %1`**：告诉当前 `bash` **“即便待会儿 SSH 断线收到 `SIGHUP`，也不要向 1 号作业转发 `SIGHUP` 信号！”** 现在你可以安心合上笔记本电脑下班了！

### 3. 方案二（交互式远程开发与多窗口神器）：**`tmux` 终端复用器**

《只学够用的 Linux》与《USTC Linux 101》一致将 **`tmux`（Terminal Multiplexer）** 奉为远程服务器开发的第一神器。
为什么 `tmux` 比 `nohup` 爽快十倍？
- 当你运行 `tmux new -s work` 时，服务器上会启动一个常驻后台的 **`tmux server` 守护进程**。你在 `tmux` 里面打开的所有 Shell 窗口、正在编辑的 `vim`、正在编译的 `cmake`、正在刷屏的测试程序，全都挂在 `tmux server` 名下，**与你的 SSH 连接彻底解耦**！
- **断网重连现场一丝不乱**：哪怕你在咖啡馆写代码突然断网，回到宿舍重新 `ssh` 连上服务器，只需敲一句 **`tmux attach -t work`**，刚才编到一半的代码、满屏彩色日志、左右分屏的布局**一模一样瞬间回到眼前**！

#### `tmux` 的三层结构模型与最简 6 条命令 + 快捷键速查

- **三层架构**：一个 `tmux` 服务可以创建多个**会话（Session，如 `work`、`train`）** → 每个会话里可以像浏览器标签页一样开多个**窗口（Window）** → 每个窗口又可以横竖切分成多个同屏并排的**面板（Pane）**。
- **快捷键核心法则**：在 `tmux` 内部，所有控制指令都先按一下**前缀键 `Ctrl + B`**（松开两个键），然后再按紧接着的功能键！

| 使用位置 | 命令 / 快捷键（先按 `Ctrl+B` 松开再按后键） | 核心作用 |
| --- | --- | --- |
| 在普通终端 | **`tmux new -s work`** | 新建并进入一个名叫 `work` 的持久化会话 |
| 在 `tmux` 内 | **`Ctrl+B` 然后按 `d`** | **Detach（脱离）**：把当前会话安全留在服务器后台继续狂奔，退回普通 SSH 终端 |
| 在普通终端 | **`tmux ls`** | 列出当前服务器上所有正在后台运行的 `tmux` 会话清单 |
| 在普通终端 | **`tmux attach -t work`**（简写 `tmux a -t work`） | **重新接回**名叫 `work` 的后台会话，完美恢复断网前的全部工作现场！ |
| 在 `tmux` 内 | **`Ctrl+B` 然后按 `%`** / **`Ctrl+B` 然后按 `"`** | 将当前屏幕**左右一分为二** / **上下一分为二**（一边改代码，一边看日志或 `htop`！） |
| 在 `tmux` 内 | **`Ctrl+B` 然后按 `方向键`** / **`Ctrl+B` 然后按 `[`** | 在不同分屏面板间切换光标焦点 / 进入**滚屏复制模式**（即可用方向键或 PageUp 向上翻看历史输出，按 `q` 退出滚屏） |

### 4. 方案三（生产级微服务开机自启与崩溃自愈）：**`systemd` 服务守护**

`nohup` 适合跑一次性脚本，`tmux` 适合交互式写代码跑实验；但如果你写好了一个正式的 C++ 后端服务（比如我们的 `logscan-server`），要求**机器断电重启后能开机自动拉起、程序万一遇到极端输入触发 `SIGSEGV` 段错误崩溃后能在 3 秒内自动重启恢复服务、且所有标准输出日志自动归档并支持按时间检索**——这时候就必须请出 Linux 现代服务总管 **`systemd`**（PID = 1）。

下面给出《USTC Linux 101》标准的生产级 `.service` 单元文件模板（保存于 `/etc/systemd/system/logscan.service`）：

```ini
[Unit]
Description=LogScan High-Performance C++20 Log Analytics Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# 生产铁律：使用专用的低权限普通用户运行服务，严禁无脑用 root 裸跑网络服务！
User=alice
Group=alice
WorkingDirectory=/home/alice/projects/logscan
ExecStart=/home/alice/projects/logscan/build/logscan_server --port 9090 --threads 4
# 崩溃自愈护栏：只要进程因非零退出码或异常信号（如段错误）崩溃，等待 3 秒后自动重新拉起！
Restart=on-failure
RestartSec=3
# 安全加固与资源限制：放宽最大打开文件描述符上限到 65535，满足高并发 Socket 连接需求
LimitNOFILE=65535
Environment="LOGSCAN_ENV=production"

[Install]
WantedBy=multi-user.target
```

写好 `/etc/systemd/system/logscan.service` 后，用下面这套标准运维四连招完成上线与日志盯盘：

```bash
# 1. 每次新建或修改了 .service 文件后，必须先通知 systemd 重新加载配置文件！
# sudo systemctl daemon-reload

# 2. 设置开机自启 (enable) 并立即启动服务 (--now)
# sudo systemctl enable --now logscan.service

# 3. 查看服务当前运行状态、PID、内存占用与最近几行日志摘要
# systemctl status logscan.service

# 4. 使用 journalctl 实时滚动追踪该服务的输出日志 (-f)，或按时间范围过滤 (--since)
# sudo journalctl -u logscan.service -f
# sudo journalctl -u logscan.service --since "1 hour ago" --no-pager
```

---

## 六、服务器运维急救箱：磁盘暴满、端口占用、UFW 防火墙与 Shell 环境持久化 (LNX-58)

在真实服务器运维中，最常半夜把人叫醒的三大故障是：**“磁盘 100% 写不进数据了”、“服务启动报 `Address already in use` 端口被占了，或者本地能访问外网却死活连不上”、“装好了命令行工具却提示 `command not found`”**。把下面这套 30 秒急救SOP收进囊中，遇到问题按图索骥。

### 1. 磁盘暴满 30 秒排障链路：`df -h` → `du -xh` → `lsof +L1` 揪出幽灵已删文件

当程序报错 `No space left on device` 时，按以下三步层层锁定真凶：

```bash
# 第 1 步：看全局——到底是哪个挂载分区的字节空间满了 (df -h)，还是千万个零碎小文件把 inode 门牌号耗尽了 (df -i)？
df -h /
df -i /

# 第 2 步：定位大目录——使用 du -xh（-x 极其关键：限制只统计当前根分区，不跨界去扫挂载在下面的 /mnt/c 或虚拟文件系统 /proc！）
# 按人类可读体积逆序排列 (sort -hr)，3 秒内揪出哪个一级目录最肥
sudo du -xh --max-depth=1 /var 2>/dev/null | sort -hr | head -n 5

# 揪出超过 100MB 的单个巨型日志文件或 core dump 文件
# sudo find /var/log -type f -size +100M -exec ls -lh {} +
```

#### ⚠️ 线上经典悬案：为什么 `df -h` 显示磁盘 100% 满了，但用 `du -sh /*` 把所有目录加起来才占了不到一半空间？

这是中科大 Linux 101 与生产面试最爱考的真实故障：
某个服务进程（比如 Nginx 或你的 C++ 服务）一直在往一个巨大的 `access.log`（50GB）里写日志。新手为了腾空间，直接敲了 **`rm -f access.log`**！
敲完 `rm` 后，`ls` 确实看不见 `access.log` 了（所以 `du` 统计目录体积时算不到它）；**但是，因为那个服务进程此时还在运行，它手里的文件描述符 `fd` 依然死死打开着这个文件的 `inode`！**
根据 Linux VFS 内核规则：**只要还有一个进程的 `fd` 引用计数未归零，该文件占用的 50GB 磁盘块就绝不会被真正释放（处于 `deleted` 幽灵状态）！**

**如何一招揪出并瞬间释放这笔幽灵空间？**
1. 运行 **`sudo lsof +L1`**（列出所有硬链接计数已经小于 1、即已被 `rm` 删除但仍被进程打开着的文件），你会清晰看到是哪个 `PID` 攥着 `(deleted)` 的大文件。
2. 重启对应的服务（让它关闭 `fd`），或者从一开始就**不要直接 `rm` 正在写入的活跃日志文件，而是用 `truncate -s 0 access.log`（或 `: > access.log`）原地将文件截断清空为 0 字节**，这样既无需重启服务，磁盘空间也能在 0.1 秒内立即释放！

### 2. 端口占用定位（`ss -tulpn`）与 UFW 防火墙放行

- **场景 A：启动服务报错 `bind: Address already in use`（端口已被占用）**
  用现代 **`ss -tulpn`**（替代古老的 `netstat`）直接揪出霸占端口的进程名与 `PID`：
  - `-t` (TCP)、`-u` (UDP)、`-l` (Listening 仅看监听态)、`-p` (Process 显示进程 PID，需加 `sudo` 才能看全其他用户的进程)、`-n` (Numeric 直接显示数字端口号 `8080` 而不反查服务名)。
  ```bash
  # 查看当前机器所有正在监听的 TCP/UDP 端口及所属进程
  sudo ss -tulpn | head -n 10
  ```
- **场景 B：服务明明已经监听在 `0.0.0.0:8080`，在服务器本机 `curl 127.0.0.1:8080` 秒通，为什么外部浏览器死活连不上？**
  请按“两道门”顺序排查：
  1. **系统内置防火墙 UFW（Uncomplicated Firewall）**是否拦截了入站流量？
     ```bash
     # 查看 Ubuntu UFW 防火墙状态与已放行规则列表
     # sudo ufw status numbered
     # 放行 8080 端口的 TCP 流量（或限制仅允许特定网段访问 SSH）
     # sudo ufw allow 8080/tcp
     ```
  2. 如果是阿里云 / 腾讯云 / AWS 等云服务器，还要去云控制台检查**云安全组（Security Group）**入站规则是否放行了 `8080` 端口。

### 3. Shell 环境变量持久化：`~/.bashrc` vs `~/.profile`、`alias` 与 `PATH`

为什么你在终端里敲了 `export PATH="$HOME/.local/bin:$PATH"` 或 `alias ll='ls -alF'`，当前窗口好使，关掉重开一个新窗口就全失效了？
因为直接敲在命令行里的变量和别名只活在**当前 `bash` 进程的虚拟内存**里！要想永久生效，必须写进 Shell 的启动配置文件中。

很多同学分不清 `/etc/profile`、`~/.profile`（或 `~/.bash_profile`）和 **`~/.bashrc`** 的区别，一张表彻底厘清：

| 配置文件类型 | 代表文件 | 什么时候被自动执行？ | 里面应该放什么？ |
| --- | --- | --- | --- |
| **Login Shell（登录式 Shell）** | `/etc/profile` → **`~/.profile`** | 当你通过 **SSH 刚登录进服务器**，或在字符控制台输入账号密码登录的**最顶层会话**启动时执行一次。 | 适合放会被子进程继承的环境变量（如 `export PATH=...`）。现代 Ubuntu 的 `~/.profile` 内部默认写了一段代码会**自动顺带加载 `~/.bashrc`**。 |
| **Interactive Non-login Shell（交互式非登录 Shell）** | **`~/.bashrc`** | 每次你在桌面环境点开一个新的终端标签页、在 **VS Code Remote / WSL2 里新建一个终端窗口、或者在 `tmux` 里新开一个面板**时，都会执行！ | **日常 99% 的个性化配置首选落脚点！** 包括命令别名（`alias`）、提示符美化（`PS1`）、工具自动补全初始化以及开发期 `export PATH`。 |

#### 实战：为你的 Linux 终端配置一套《Linux 101》防呆高效 `~/.bashrc` 片段

```bash
# 查看当前 PATH 环境变量（按冒号拆行打印，优先级从上到下递减）
echo "$PATH" | tr ':' '\n'

# 标准姿势：将个人二进制目录 ~/.local/bin 加入 PATH，并配置防误删别名
# （实际写入 ~/.bashrc 时把下面 cat 的输出追加到 ~/.bashrc 末尾，然后执行 source ~/.bashrc 立即在当前窗口生效）
cat << 'EOF'
# --- Linux 101 Recommended Shell Tweaks ---
# 1. 安全防呆别名：删除超过 3 个文件或递归删目录时确认一次 (-I)，cp/mv 覆盖前询问 (-i)
alias rm='rm -I'
alias cp='cp -i'
alias mv='mv -i'
alias ll='ls -alFh --color=auto'

# 2. 将 ~/.local/bin 前置加入 PATH（幂等防重复追加写法）
case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH" ;;
esac
EOF
```

---

## 本篇核心考点与命令速查总表 (LNX-53 ~ LNX-58)

| 课程编号 | 主题模块 | 必背黄金命令与防坑铁律 |
| --- | --- | --- |
| **LNX-53** | 终端心智与 SSH 免密 | `user@host:cwd$`、`~` vs `/`、`ssh-keygen -t ed25519` + `ssh-copy-id` + `~/.ssh/config`、`Ctrl+R` 搜历史、`Ctrl+A/E/W/U` |
| **LNX-54** | 文件操作与软链接基准 | **`cp -a dir1/. dir2/`** 防多余嵌套、**`rm -I`** 防误删、**`ln -sr target link`** 自动换算相对于软链接所在目录的相对路径 |
| **LNX-55** | APT 软件源与 dpkg | `sudo apt update` 刷索引、`apt purge` 清配置、`apt-file search` 查缺失头文件、`dpkg -L/-S`、`/etc/apt/keyrings/*.gpg` |
| **LNX-56** | 打包压缩与跨机同步 | **`tar -caf`** 自动按后缀压缩、**`tar -tvf`** 拆包前防炸弹预览、`unzip -O GBK` 解中文乱码、**`rsync -avzP`** 断点增量同步 |
| **LNX-57** | 后台常驻与断网保活 | `SIGHUP` 挂断机制、`nohup cmd > out.log 2>&1 &`、**`tmux new -s work` / `Ctrl+B d` / `tmux a -t work`**、`systemd` `Restart=on-failure` |
| **LNX-58** | 运维急救与环境持久化 | `df -h`/`df -i` → `du -xh --max-depth=1` → **`lsof +L1`** 查已删未释放幽灵文件、**`sudo ss -tulpn`**、`ufw allow`、`~/.bashrc` + `source` |
