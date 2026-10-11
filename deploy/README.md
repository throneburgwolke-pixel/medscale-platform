# 公开发布部署手册

把平台稳定地发布到公网：**云服务器 + 域名 + Caddy 自动 HTTPS**。
服务器重启、进程崩溃、证书到期，都由系统自动处理，不需要人守着。

> 应用本身是**零第三方依赖**的，所以整套方案里没有一个 `npm install`，
> 也没有 Node 之外的运行时。组件越少，能坏的地方越少。

---

## 一、整体结构

```
   互联网
     │  https://scales.你的域名.cn
     ▼
 ┌─────────────────────────────────────────┐
 │ 云服务器（Ubuntu 22.04 / 24.04）          │
 │                                          │
 │  Caddy ── 80/443，自动申请并续期证书      │
 │    │                                     │
 │    │ 反向代理到本机                       │
 │    ▼                                     │
 │  medscale ── 只监听 127.0.0.1:5173        │
 │    │        （systemd 守护，崩了自动拉起）  │
 │    ▼                                     │
 │  /var/lib/medscale/app.db  ← 唯一数据源   │
 │           └ backups/  ← 每天 03:15 自动快照│
 └─────────────────────────────────────────┘
```

要点：**应用永远不直接对外**。外面只有 Caddy 的 443，5173 连安全组都不放行。

---

## 二、先准备三样东西

### 1. 域名（必需）

在阿里云 / 腾讯云 / 华为云买一个域名，一年通常几十元。

- 建议用 `.cn` 或 `.com`，别用免费二级域名（备案与后续管理都麻烦）。
- 买完要做**实名认证**，一般 1 个工作日内通过。

### 2. 云服务器（必需）

**选购要点：**

| 项 | 建议 | 原因 |
| --- | --- | --- |
| 地域 | 与主要使用者同城（如华东-上海） | 扫码填写的人打开更快 |
| 规格 | 2 核 2G 起（轻量应用服务器即可） | 应用是单进程 Node + SQLite，百人级问卷毫无压力 |
| 系统 | **Ubuntu 22.04 LTS 或 24.04 LTS** | 本手册与 `install.sh` 就是按它写的 |
| 磁盘 | 40 GB 起 | 数据库很小，但要给备份和日志留空间 |
| 带宽 | 3–5 Mbps 起 | 页面全是文本，流量极小 |
| 快照 | 开启自动快照（每天一次） | 比什么备份都可靠，是最后一道保险 |

**安全组（这是最容易漏的一步）：**

- 放行 `22`（SSH，建议只对你的固定 IP 开放）
- 放行 `80`、`443`（公网访问）
- **绝对不要放行 5173**（应用端口，只在本机内部用）

> 这一步在云厂商控制台做，`install.sh` 改不了它。忘了放行 80/443，
> 现象是「服务都正常但外网打不开」。

### 3. ICP 备案（境内服务器必需）

**只要服务器在中国大陆，用域名对外提供网站服务就必须 ICP 备案，这是法定义务。**
未备案的域名解析到大陆服务器上，80/443 会被拦截。

- 在云厂商的备案系统里提交，需要：域名、服务器实例、主体证件、网站负责人信息。
- 周期通常 **1–3 周**（含云厂商初审 + 管局审核）。
- 医院/事业单位主体备案，建议先和本单位的**信息科 / 宣传科**确认由谁做主体、用哪个主体，
  避免个人备案后无法转成单位备案。

**不想等备案的替代方案：**把服务器买在**中国香港 / 新加坡**节点，无需备案，但：
- 访问延迟更高（尤其高峰时段）；
- 医疗数据出境另有一层合规要求，务必先和单位信息科确认。

> 无论哪种，**涉及受试者数据的系统上线前，请先获得本单位信息科与伦理委员会的书面同意**，
> 并明确数据存储位置与留存期限。这一条比技术配置重要。

---

## 三、部署（一条命令）

### 1. 把代码传到服务器

在你自己的电脑上（项目目录的**上一级**执行）：

```bash
# 把整个项目目录传到服务器
scp -r "医学量表与问卷平台" root@你的服务器IP:/root/
```

> 也可以先用 `git` 推到私有仓库，再在服务器上 `git clone`。
> 注意 `data/` 不会被传上去（里面是本地跑出来的数据），这是有意的。

### 2. 登录服务器并执行安装

```bash
ssh root@你的服务器IP
cd /root/医学量表与问卷平台
```

**先审一遍它会做什么**（不需要 root，不会改动系统）：

```bash
bash deploy/install.sh --domain scales.你的域名.cn --dry-run
```

确认无误后正式执行：

```bash
sudo bash deploy/install.sh --domain scales.你的域名.cn --email 你的邮箱@example.com
```

脚本会自动完成九件事：

1. 装基础依赖（curl / rsync / openssl 等）
2. 装 Node.js 22（**优先走 npmmirror 国内镜像**，不走容易被墙的第三方源）
3. 装 Caddy（装不上会提示你改用 `--proxy nginx`，那样走系统自带源）
4. 建 `medscale` 系统用户（不可登录）与 `/var/lib/medscale` 数据目录
5. 把代码同步到 `/opt/medscale` 并设为只读
6. 生成 `/etc/medscale.env`（**自动生成 20 位随机管理员口令并打印一次**）
7. 装 systemd 服务与每日备份定时器
8. 写好 Caddy 配置（域名替换好，语法校验通过才继续）
9. 配 ufw 防火墙（只放行 22/80/443）并启动全部服务

**记下脚本最后打印的管理员口令**，它只显示这一次。

### 3. 验收

```bash
bash /opt/medscale/deploy/smoke.sh --domain scales.你的域名.cn
```

它会逐项检查：服务是否自启、**5173 是否只监听本机**、证书是否有效、HTTP 是否强制跳转、
六个安全响应头是否齐全、`/healthz` 是否正常、**管理员口令是否已不是默认值**、
备份目录与定时器是否就绪。任何一项失败都会明确指出。

全绿之后，打开 `https://scales.你的域名.cn` 用管理员口令登录。

---

## 四、上线后必须做的三件事

1. **确认注册策略**
   进「系统设置 → 谁能开账号」，确认是**「凭邀请码注册」**。
   公网环境不要长期开「免审自助」。

2. **邀请同事开账号**
   在同一个地方生成邀请码，发给同事，让对方自己设口令。
   不要多人共用管理员账号——操作日志要靠账号区分责任人。

3. **手工补一份备份，并确认能恢复**

   ```bash
   sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --keep 30
   sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --list
   ```
   看到快照列表就说明自动备份这条路是通的。

---

## 五、日常运维

```bash
# 看实时日志
journalctl -u medscale -f

# 看最近 100 行
journalctl -u medscale -n 100 --no-pager

# 重启 / 停止 / 看状态
systemctl restart medscale
systemctl status medscale

# 证书与代理日志
journalctl -u caddy -n 80 --no-pager
tail -f /var/log/caddy/medscale.log

# 下次自动备份时间
systemctl list-timers medscale-backup.timer

# 手工打一份快照 / 列出 / 校验
sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --keep 30 --label manual
sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --list
sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --verify <快照文件名>
```

**备份去哪了：** `/var/lib/medscale/backups/`，每天 03:15 一份，保留最近 30 份
（约一个月）。机器当时关机了会在开机后补跑（定时器设了 `Persistent=true`）。

**改配置：**

```bash
sudo nano /etc/medscale.env     # 改端口、管理员口令、进程数等
sudo systemctl restart medscale
```

> ⚠️ 改 `PORT` 要同时改 `/etc/caddy/Caddyfile` 里的 `reverse_proxy 127.0.0.1:xxxx`
> 并 `sudo systemctl reload caddy`，否则代理会指向一个没人监听的端口。

---

## 六、把本机已有的数据迁到服务器

如果本地已经录入了真实数据，不要让它留在本地：

```bash
# 1) 先在本机停掉服务，确保没有写入（macOS 双击「停止平台.command」）

# 2) 用应用自己的快照功能导出一份自包含单文件（已合并 WAL，不会丢数据）
cd "医学量表与问卷平台"
node deploy/backup-cli.js --label migrate
node deploy/backup-cli.js --list        # 记下文件名

# 3) 传到服务器
scp data/backups/medscale-migrate-*.sqlite root@服务器IP:/tmp/

# 4) 在服务器上停服务，用快照替换数据库
ssh root@服务器IP
systemctl stop medscale
cp /tmp/medscale-migrate-*.sqlite /var/lib/medscale/app.db
rm -f /var/lib/medscale/app.db-wal /var/lib/medscale/app.db-shm
chown medscale:medscale /var/lib/medscale/app.db
chmod 600 /var/lib/medscale/app.db
systemctl start medscale

# 5) 验收
bash /opt/medscale/deploy/smoke.sh --domain scales.你的域名.cn
```

> ⚠️ 千万别在服务运行时直接 `cp data/app.db`——开启了 WAL 模式，
> 主库文件里可能缺少尚未合并的近期写入。快照（`VACUUM INTO`）才是正确姿势，
> 上面用的 `backup-cli.js` 走的就是这条路径。

---

## 七、升级到新版本

```bash
# 在本机把新版本传上去（或服务器上 git pull）
scp -r "医学量表与问卷平台" root@服务器IP:/root/

# 升级前先打一份快照（保命）
sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --keep 30 --label pre-upgrade

# 重新同步代码（rsync 会保留 /var/lib/medscale 里的数据不动）
cd /root/医学量表与问卷平台
sudo rsync -a --delete \
  --include '/docs/' \
  --include '/docs/使用说明.md' \
  --exclude '/docs/**' \
  --exclude 'data/' --exclude 'node_modules/' --exclude '.git/' \
  --exclude 'test/' --exclude '.superpowers/' --exclude '.workbuddy/' \
  --exclude '.DS_Store' --exclude '*.command' --exclude '*.log' \
  ./ /opt/medscale/
sudo mkdir -p /opt/medscale/data          # 见下方「为什么要这个空目录」
sudo chown -R root:medscale /opt/medscale
sudo chmod -R g-w,o-w /opt/medscale

sudo systemctl restart medscale
bash /opt/medscale/deploy/smoke.sh --domain scales.你的域名.cn
```

**为什么要 `mkdir -p /opt/medscale/data`：**
`lib/db.js` 开头会检查 `<代码目录>/data` 是否存在，不存在就尝试创建。
而 systemd 那边开了 `ProtectSystem=strict`（代码目录只读），这个 `mkdir` 会失败并让应用直接起不来。
预建这个空目录就能让检查通过；真正的数据在 `/var/lib/medscale`。

---

## 八、故障排查

| 现象 | 先看这里 |
| --- | --- |
| 外网打不开，服务器上 `curl` 本机正常 | 云厂商**安全组**有没有放行 80/443（最常见） |
| `https://域名` 证书报错 | `journalctl -u caddy -n 80`；确认域名 A 记录已指向本机公网 IP，且 80 端口能从公网访问 |
| 502 Bad Gateway | 应用没起来：`systemctl status medscale` + `journalctl -u medscale -n 50` |
| 应用反复重启后被 systemd 停掉 | 端口被占用（`ss -lntp \| grep 5173`）。系统里已设 300 秒内最多重启 5 次，超了就停下等人处理 |
| 登录一直提示密码错 | 口令在 `/etc/medscale.env` 的 `MEDSCALE_PASSWORD`，但它**只在首次初始化时生效**；已改过就去网页「系统设置」重置 |
| 登录提示"操作过于频繁" | 登录失败限流，等提示的秒数即可。注意限流按**来源 IP** 分桶，开了代理信任才认真实 IP |
| 上传量表或恢复备份报 413 | 代理层请求体上限。Caddy 用 `request_body`，nginx 用 `client_max_body_size`，本仓库模板都已设为 24MB |
| 手机扫码打不开 | 填写链接里带的是域名，确认域名解析正常；二维码里不能出现端口号 |
| 磁盘被日志吃满 | `journalctl --disk-usage`；在 `/etc/systemd/journald.conf` 里设 `SystemMaxUse=500M` 后 `systemctl restart systemd-journald` |

**回到上一个版本：**

```bash
systemctl stop medscale
cd /var/lib/medscale/backups
sudo -u medscale /usr/bin/node /opt/medscale/deploy/backup-cli.js --verify <快照文件名>
sudo cp <快照文件名> /var/lib/medscale/app.db
sudo rm -f /var/lib/medscale/app.db-wal /var/lib/medscale/app.db-shm
sudo chown medscale:medscale /var/lib/medscale/app.db
systemctl start medscale
```

---

## 九、安全要点（已内建，别关掉）

| 机制 | 位置 | 说明 |
| --- | --- | --- |
| 只监听本机 | `resolveHost()` | 不设 `MEDSCALE_LAN` 时只绑 `127.0.0.1`，公网碰不到 |
| 代理头防伪造 | `MEDSCALE_TRUST_PROXY` | **没设这个变量时，`X-Forwarded-For` / `X-Forwarded-Proto` 一律不认**，谁都能自己加的头不会被采信 |
| HSTS 只在真加密下发 | `securityHeaders()` | 明文链路不下发 HSTS，避免把浏览器永久重定向到打不开的 https |
| 安全响应头 | 同上 | CSP / nosniff / `X-Frame-Options: DENY` / Referrer-Policy / Permissions-Policy |
| 不被搜索引擎收录 | `X-Robots-Tag: noindex` | 默认开。含受试者数据，不该出现在搜索结果里 |
| 失败限流落库 | `rate_limits` 表 | 登录失败、问卷提交、量表上传各有窗口；多进程共享 |
| 会话只存哈希 | `sessions` 表 | 库里只存 token 的 SHA-256，明文只在 Cookie 里 |
| 错误不外泄 | `core/http.js` | 500 只返回通用文案，堆栈只进服务端日志 |
| 代码目录只读 | `medscale.service` | `ProtectSystem=strict`，除数据目录外全只读 |
| 每日自动快照 | `medscale-backup.timer` | `VACUUM INTO` 输出自包含单文件，天然合并 WAL |

本次新增的部署件已**在本机用真实反向代理端到端验证**过这些行为
（伪造头被无视、真实 IP 被正确采纳、HSTS/Secure 只在可信 HTTPS 下出现、
六个安全头齐全、`/healthz` 正常）。验证项共 17 条，全部通过。

---

## 十、备选：用 Docker 部署

主推上面的一键直装（组件最少）。如果你的环境更方便用容器：

```bash
cd 医学量表与问卷平台
cp deploy/docker.env.example deploy/docker.env
# 编辑 deploy/docker.env，改掉 MEDSCALE_PASSWORD

MEDSCALE_DOMAIN=scales.你的域名.cn \
MEDSCALE_EMAIL=你的邮箱@example.com \
docker compose -f deploy/docker-compose.yml --env-file deploy/docker.env up -d
```

compose 会起三个容器：`medscale`（应用，只绑 `127.0.0.1:5173`）、
`caddy`（80/443 与自动 HTTPS）、`backup`（每天 03:15 打快照）。
数据在 `medscale-data` 卷里，删容器不丢数据。

常用命令：

```bash
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f medscale
docker compose -f deploy/docker-compose.yml down      # 停止（卷保留）
```

> 容器版没有 `smoke.sh` 里的 systemd 检查项，其余 HTTPS / 响应头 / 健康检查仍然适用，
> 可以把 `smoke.sh` 的域名检查部分拿来单独用。

---

## 十一、文件清单

| 文件 | 作用 |
| --- | --- |
| `deploy/install.sh` | 一键安装（支持 `--dry-run` 预演、`--proxy nginx` 切换反代） |
| `deploy/smoke.sh` | 上线自检，把检查清单变成可执行脚本 |
| `deploy/backup-cli.js` | 备份 CLI，复用应用的 `VACUUM INTO` 实现，零额外依赖 |
| `deploy/medscale.service` | 应用 systemd 单元（自动重启 + 重启熔断 + 权限加固） |
| `deploy/medscale-backup.service` / `.timer` | 每日 03:15 自动备份，错过会补跑 |
| `deploy/medscale.env.example` | 服务端环境变量模板 |
| `deploy/Caddyfile` | Caddy 反代 + 自动 HTTPS 模板 |
| `deploy/nginx.conf` | nginx 反代模板（Caddy 装不上时的备选） |
| `deploy/Dockerfile`、`docker-compose.yml`、`Caddyfile.docker`、`docker.env.example` | 容器版方案 |
| `.dockerignore` | 容器构建上下文瘦身（注意保留 `docs/使用说明.md`） |
