# 用 GitHub 发布医学量表与问卷平台（路线 B：PaaS 直连 GitHub 自动部署）

> 核心认知：GitHub 仓库只存代码，**不负责运行网站**。本平台是 Node.js 动态服务（非纯静态），
> 所以「用 GitHub 发布」= 把 GitHub 当代码源，再用一个会跑 Node 的运行环境拉取代码并启动，
> 每次 `git push` 自动重新部署。
> GitHub Pages 只支持纯静态页，**不能**用来发布本平台。

本路线（PaaS）免买服务器、免备案，平台直接连你的 GitHub 仓库，push 即自动部署，最适合先上线使用。
下面以 **Render** 为例（Railway / Fly.io / Koyeb 步骤几乎一致，文末附差异）。

---

## 一、前置条件

- 仓库已公开：`https://github.com/throneburgwolke-pixel/medscale-platform`
- 本地能正常 `git push`（见「四、提交并推送到 GitHub」）
- 已注册 Render 账号（https://render.com，GitHub 账号登录最方便）

## 二、在 Render 上创建服务（两种方式）

### 方式 1：用 `render.yaml` 蓝图（推荐，一步到位）

仓库根目录已放好 `render.yaml`，它会一次性声明「Web 服务 + 环境变量」（当前为免费档，未挂持久盘，数据库落在容器内临时文件系统，重启会清空；需持久化见文末说明）：

1. Render 控制台 → **New** → **Blueprint**
2. 关联 GitHub 账号，选中仓库 `medscale-platform`
3. Render 读取 `render.yaml`，预览服务与磁盘配置 → 点 **Apply**
4. 在弹出的环境变量里，**给 `MEDSCALE_PASSWORD` 填一个 12 位以上的强口令**（不入库、仅你可见）
5. 创建完成，Render 自动开始首次构建与部署

### 方式 2：手动新建（不用 render.yaml）

1. Render 控制台 → **New** → **Web Service** → 选 GitHub 仓库
2. 配置：
   - **Runtime**：Node
   - **Build Command**：`npm ci --omit=dev`
   - **Start Command**：`node server.js`
   - **Health Check Path**：`/healthz`
   - **Instance Type**：Free（轻量免费档，**重启 / 重新部署会清空数据**，仅试用）
   - **Node Version**：22（Settings → Environment 里设，必须 ≥ 22.5）
3. **Environment** 里加变量：
   - `HOST` = `0.0.0.0`
   - `MEDSCALE_PASSWORD` = 你的强口令（12 位以上）
   - `MEDSCALE_DB` 留空即可（默认值 `data/app.db`，落在容器内临时文件系统；免费档无持久盘，故无需、也不能设成 `/var/data/...`）
4. **Disks**：免费档**不支持**挂载持久盘，本步跳过。如需数据持久化，把 Instance Type 升到 **Starter**（约 $7/月），再在 Disks 新建卷 `mountPath=/var/data`、大小 `1 GB`，并把 `MEDSCALE_DB` 设为 `/var/data/medscale/app.db`。
5. 创建并等待部署

## 三、上线后怎么用

- 部署完成后，Render 给你一个网址，形如 `https://medscale-platform.onrender.com`
- **首次打开 → 点「免费注册」→ 注册第一个账号即自动成为管理员**（无需初始口令）
- 之后在「系统设置 → 谁能开账号」里决定别人怎么注册：生成邀请码发给同事（默认、推荐），或开放注册 / 关闭
- **Auto-Deploy 默认开启**：你以后在本地 `git push`，Render 自动拉最新代码并重启，网址不变

> 注意：Render 免费档实例空闲约 15 分钟后会休眠，下次访问需十几秒冷启动；数据在持久卷里不丢。
> 若长期对外、追求不休眠，把 plan 升到 standard 即可。

## 四、提交并推送到 GitHub

代码改动后：

```bash
git add -A
git commit -m "改了什么"
git push          # 首次会要求浏览器授权 GitHub，之后 macOS 钥匙串记住
```

推送成功后 Render 自动重新部署。

## 五、与其它路线的关系

- **路线 A（云服务器 + 域名）**：自己买服务器，用仓库里 `deploy/install.sh` 一键安装
- **路线 C（GitHub Actions）**：服务器上 `git pull` 自动部署，需自有服务器
- 当前已上线的 **WorkBuddy 托管链接**是另一条独立路线，发布源是本地 `线上发布/` 目录，
  与 GitHub 自动部署互不冲突，可并存。

## 附：Railway / Fly.io 差异速记

- **Railway**：New Project → Deploy from GitHub repo；在 Settings 设 `Start Command = node server.js`、
  `NODE_VERSION = 22`；加一个 Volume 挂载到 `/var/data`，并设 `MEDSCALE_DB=/var/data/app.db`、`HOST=0.0.0.0`
- **Fly.io**：`fly launch` 生成 `fly.toml`；`internal_port = 80` 改为读 `PORT`，挂载卷到 `/var/data`，
  设相同环境变量；`fly deploy` 即发布
- 三者共同要点：① 绑定 `0.0.0.0`；② 数据库路径落到持久卷；③ Node ≥ 22
