# Cloudflare Workers + D1 部署指南（医学量表与问卷平台）

> 目标：把平台部署到 Cloudflare 边缘，获得**永久不休眠、数据持久化、免费**的公开访问地址。  
> 适用对象：已在 cloudflare.com 注册好账号。  
> 预计耗时：10–15 分钟（含浏览器授权）。

---

## 〇、前置确认（工程已就绪，无需改动）

| 文件                | 作用                                            |
| ----------------- | --------------------------------------------- |
| `worker.js`       | Workers 入口（路由 / 会话 / 登录注册 / 限流 / 导出 / 二维码）    |
| `lib/db-d1.js`    | D1 异步数据层，导出与 Node 版一一对应                       |
| `lib/qr.js`       | 零依赖 PNG 生成（Workers 不支持 node:zlib）             |
| `wrangler.toml`   | Workers + D1 + 静态资源绑定（**仅 `database_id` 待填**） |
| `core/schema.sql` | D1 建表脚本                                       |

> 注意：以下命令**请在你自己 Mac 的终端（Terminal.app / iTerm）里执行**，不要通过 WorkBuddy 的对话框运行——  
> 因为 `wrangler login` 需要弹浏览器授权，且部署需要联网，这些在我这边的沙箱里跑不了。  
> 所有文件都已经在你机器上：`/Users/fuzhuzhijia/Desktop/医学量表与问卷平台`

---

## 一、进入项目目录

```bash
cd /Users/fuzhuzhijia/Desktop/医学量表与问卷平台
```

确认能看到 `worker.js` 和 `wrangler.toml`：

```bash
cd /Users/fuzhuzhijia/Desktop/医学量表与问卷平台
```



---

## 二、浏览器授权（只需一次）

```bash
npx wrangler@latest login
```

执行后会自动打开浏览器，登录你的 Cloudflare 账号并点授权。看到 `Successfully logged in.` 即可。  
（用 `npx` 免去全局安装；如提示找不到命令，先 `npm install -D wrangler` 再 `npx wrangler ...`）

---

## 三、创建 D1 数据库，并回填 database_id

```bash
npx wrangler@latest d1 create medscale
```

终端会输出一段信息，找到类似这一行并**复制整串 UUID**：

```
┌─────────────────────────────────────────────────────────────┐
│ id      = 3a7f1c2e-9b0d-4e5a-8c1f-2d3e4f5a6b7c   ← 复制这个
```

打开 `wrangler.toml`，把第 16 行的占位符替换成你刚复制的 id：

```toml
database_id = "3a7f1c2e-9b0d-4e5a-8c1f-2d3e4f5a6b7c"   # 改成你的真实 id
```

> 也可不手改文件，直接每次命令加 `--var` 不行（database_id 必须在 toml 里）。**必须回填 toml**。

---

## 四、灌入数据库表结构

```bash
npx wrangler@latest d1 execute medscale --remote --file=core/schema.sql
```

看到 `6 commands executed successfully` 一类提示即成功。这张表建好后会自动种入内置量表模板。

---

## 五、（强烈建议）设置管理员初始口令

不设置也行（系统会在首次启动时生成随机口令并打到日志里），但**自己设一个更省心**：

```bash
npx wrangler@latest secret put MEDSCALE_PASSWORD
```

按提示输入一串 **12 位以上的强口令**（例如 `MedScale@2026!cf`），回车确认。  
这个口令是「超级管理员口令」，可用于登录，也可在「系统设置」里改。

---

## 六、正式部署上线

```bash
npx wrangler@latest deploy
```

成功后终端会给出你的访问地址，形如：

```
https://medscale-platform.<你的子域>.workers.dev
```

把 `<你的子域>` 记下来（首次部署时 Cloudflare 会让你选/分配一个 `*.workers.dev` 子域名）。  
**不需要买域名**，这个地址就能公开访问。

---

## 七、部署后第一次登录（关键！）

部署完成后打开上面的地址，按下面顺序操作：

1. 点「注册」，创建**第一个账号**。
   - 此时数据库里还没有任何用户（`countUsers()===0`），注册走 bootstrap 流程，**该账号自动成为管理员**，且无需邀请码。
2. 注册成功后即自动登录，获得管理员权限。
3. （可选）若你设了 `MEDSCALE_PASSWORD`，也可在登录页**用户名留空、密码填那个口令**直接以超级管理员登录。

> ⚠️ 一旦第一个账号建好，系统默认改为「邀请码注册」模式（防止外人随意注册）。  
> 此后要给同事开账号，请在「系统设置 → 邀请码」里生成邀请码发给他们。  
> 普通受访者**不需要注册**，用你发放的问卷链接（带 token）直接填即可。

---

## 八、验证清单（建议逐项确认）

在浏览器/终端里试这些，确认都正常：

- [ ] 首页能打开，内置量表模板已出现在「量表库」
- [ ] 注册第一个账号 → 自动成为管理员 → 能进后台
- [ ] 新建一份问卷 → 生成发放链接/二维码 → 用手机扫码打开能填写
- [ ] 提交一份答卷 → 后台能看到、能导出 CSV
- [ ] 关掉浏览器、隔几分钟再打开 → 数据**还在**（对比之前 Render 免费档会重置，这就是迁移意义）

---

## 九、重要须知（部署前必读）

1. **数据不互通**：Workers 版用 PBKDF2 哈希、D1 独立数据库，与 Render 版（scrypt + 本地 SQLite）**完全独立**。  
   这是一次**全新部署**——需要在 Cloudflare 上重新注册管理员、重新建量表/问卷，**不能把 `data/app.db` 直接搬过去**。
2. **暂未实现的接口**（Workers 版返回 501，前端有明确提示）：
   - 随访研究 `/api/studies`
   - 备份 / 恢复（请用 Cloudflare 控制台的 D1 导出功能做备份）
   - 文件导入（xlsx/csv）  
     上述能力在 Render / 本地 Node 版仍可用。答题、自动计分、二维码、邀请码、用户/设置、CSV/JSON 导出均已可用。
3. **备份建议**：在 Cloudflare 控制台 → Workers & Pages → 你的项目 → D1 → 点「导出」即可下载数据库副本，定期存一份。

---

## 十、常见故障排查

| 现象                                   | 原因 / 解决                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| 页面一直「⏳ 加载中」不渲染 | 前端缺 `/logic.js`（app.js 依赖它）。Workers 只上传 `public/`，Node 版是 server.js 动态提供 `/logic.js`。**解决：`npm run sync:logic` 把 `lib/logic.js` 复制到 `public/logic.js` 再部署**；以后改过 `lib/logic.js` 也要重新同步 |
| 部署/修复后浏览器行为没变 | 浏览器缓存了旧 HTML/资源。**强制刷新（Mac：⌘⇧R）或开无痕窗口**验证 |
| `wrangler deploy` 报 `database_id` 无效 | 第 16 行没填真实 id，或 id 复制错了（应是 UUID 格式）                               |
| `wrangler@latest deploy` 卡在 `Running autoconfig detection` 不动 | 4.151.2 的回归；改用已验证可部署的版本：`npx wrangler@4.151.1 deploy`（其他子命令同理） |
| 部署后打开白屏                              | 多半 `wrangler.toml` 的 `[assets]` 路径不对；本工程已是 `./public`，一般没问题。看终端报错 |
| 登录提示「密码错误」                           | 若用超级管理员口令登录，用户名必须**留空**；若用注册账号，用注册时的用户名+密码                        |
| 注册提示「请填写邀请码」                         | 你不是第一个用户了（已有账号存在）。用已有管理员登录后在「系统设置」生成邀请码，或直接用超级管理员口令登录             |
| 忘记超级管理员口令                            | 在 Cloudflare 控制台删掉 `MEDSCALE_PASSWORD` secret 并重建；或登录后到「系统设置」改密   |
| 想换自定义域名                              | Cloudflare 控制台 → 该项目 → Settings → Domains，按提示加 CNAME 即可（免费）       |

---

## 附：一键复盘命令（部署完核对用）

```bash
cd /Users/fuzhuzhijia/Desktop/医学量表与问卷平台
npx wrangler@latest d1 execute medscale --remote --file=core/schema.sql   # 可重复执行：只补表/索引，不覆盖数据
npx wrangler@latest secret list              # 查看已设的 secret
npx wrangler@latest deploy                    # 改了代码后重新部署
```
