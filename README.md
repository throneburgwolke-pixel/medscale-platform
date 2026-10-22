# 医学量表与问卷平台 · 工程说明

面向维护者的入口：怎么跑起来、怎么测试、哪些约定不能破。
给使用者看的操作说明在 [`docs/使用说明.md`](docs/使用说明.md)。

运行环境：**Node.js ≥ 22.5**（用到内置的 `node:sqlite`），无需构建步骤。亦支持以 **Cloudflare Workers + D1** 形式免服务器、7×24 免费稳定运行（详见第六节第 5 条）。

---

## 一、本地启动

```bash
node server.js            # 默认 http://localhost:5173，只监听本机
```

macOS 上也可以直接双击 `启动平台.command`（会打印局域网地址，供手机扫码填写），
用 `停止平台.command` 停止。数据落在 `data/app.db`，停止服务不会丢数据。

要挂到域名下对外发布，看第六节：应用本身仍只听 `127.0.0.1`，由反向代理负责 HTTPS。

### 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `PORT` | `5173` | 监听端口。**端口被占用时直接启动失败，绝不顺延**——换了端口，已经发出去的二维码和填写链接就全失效了。失败信息里会给出 `lsof` 排查命令。 |
| `MEDSCALE_LAN` | 空 | 设为 `1` 时监听 `0.0.0.0`，同网段的手机才能扫码填写。只在可信网络里打开。 |
| `HOST` | 空 | 显式指定绑定地址，优先于 `MEDSCALE_LAN`（比如只绑某一块网卡）。 |
| `MEDSCALE_DB` | `data/app.db` | 数据库文件位置。备份目录固定为它同级的 `backups/`。 |
| `MEDSCALE_PASSWORD` | — | 仅在数据库里还没有管理员口令时，用它初始化管理员口令；不设则用内置初始口令，其值只在服务端的启动横幅里打印，任何页面与文档都不写。 |
| `MEDSCALE_TRUST_PROXY` | 空 | 确实部署在反向代理后面才设 `1`。设了之后才认 `X-Forwarded-For`（登录限流与操作日志取真实来源 IP）和 `X-Forwarded-Proto: https`（下发 HSTS 与 `Secure` Cookie）；不设则一律以连接对端为准，避免代理头被伪造。 |
| `MEDSCALE_WORKERS` | `1` | 进程数。`max` 按 CPU 核数，数字则用该数量（封顶 16）。会话与限流计数已经落库，多进程天然共享同一份状态。只在反向代理后面或需要并发时打开，单进程是默认且最省事的形态。 |
| `MEDSCALE_INDEXABLE` | 空 | 设 `1` 才允许被搜索引擎收录（去掉 `X-Robots-Tag: noindex, nofollow`）。默认不收，含受试者数据的站点不该出现在搜索结果里。 |

## 二、跑测试

```bash
npm i             # 装测试要用的 jsdom / playwright；运行期仍是零第三方依赖
npm test
```

`npm test` 按顺序跑 40 个脚本，任何一项失败即整体失败：

| 脚本 | 检查内容 |
| --- | --- |
| `test/contrast_test.js` | 直接解析 `styles.css`，文字对比度达到 WCAG AA |
| `test/a11y_test.js` | 键盘焦点可见 + 语义标记（地标、可访问名称、动效收口） |
| `test/scales_test.js` | 内置量表的题目结构、极值计分与判读逐条自检，并做已知数值核对 |
| `test/scale_golden_test.js` | 量表黄金值：每个修正过或新增的量表按原始文献核对总分与分级 |
| `test/scale_engine_test.js` | 量表引擎扩展：正文待填按内容判定、kit 透传分档与待填标记、授权分级与评估者标记持久化 |
| `test/scoring_bands_formula_test.js` | 数值分档边界与越界、MELD / MELD-Na 黄金值与截断规则 |
| `test/scoring_validity_test.js` | 计分有效性：缺失条目、非数值选项、minValidItems/prorate 与分级边界，不完整答卷不输出被低估的总分 |
| `test/core_schema_test.js` | 核心 schema.sql：10 表 DDL 完整、裸库可建、热点查询索引、lib/db.js 同源 |
| `test/core_kdf_test.js` | 核心 KDF：scrypt 既有格式与 PBKDF2 前缀格式双算法哈希/校验、同步异步语义、lib/db.js 薄委托 |
| `test/core_db_adapter_test.js` | 核心 DB 适配器：node:sqlite 同步库包成统一 async 接口，first/all/run/exec/batch 事务回滚与 SQLITE_BUSY 重试 |
| `test/core_http_test.js` | 核心 HTTP 结果构造：json/text/buf 与 400/401/403/404/500 形状、500 不外泄内部细节、CSV 转义与 BOM/CRLF、server.js 复用同一实现 |
| `test/core_services_test.js` | 核心基础服务：settings 键值 upsert、audit 落库、sessions WebCrypto 哈希/过期即删、ratelimit 固定窗口语义 |
| `test/core_auth_test.js` | 核心 auth 服务：零用户首注册即管理员、注册三态与邀请码原子核销/失败不扣次、登录限流 429/错口令 401/停用拒登、token 仅存哈希、归属 canView/canEdit |
| `test/core_registry_test.js` | 核心路由注册表：`:param` 编译与匹配、多余段不匹配、public/auth/admin 三态鉴权统一执行、未注册 404、handler 异常 500 不外泄堆栈、`list()` 暴露 method/pattern/auth/admin |
| `test/port_test.js` | 端口策略：占用时以明确错误退出，不静默顺延 |
| `test/auth_test.js` | 管理员口令以 scrypt 哈希存储，接口与日志不泄露明文，旧库可迁移 |
| `test/admin_password_guard_test.js` | 改管理员口令需管理员会话 + 限流：非管理员 403、验错原密码 429、成功后全端下线 |
| `test/hardening_test.js` | 对外暴露面：默认只监听本机、免码注册默认关闭（仅首个账号可自助开通）、失败限流、错误不外泄、地址解析 |
| `test/invite_test.js` | 注册三态与邀请码：发码、凭码开号、原子核销与退回、零用户开局 |
| `test/cluster_test.js` | 会话与限流落库：token 只存哈希、改角色/停用即时生效、跨进程共享计数、写冲突重试、worker 数解析 |
| `test/headers_test.js` | 公网基线：CSP 等响应头、HSTS 与 `Secure` 只在可信 HTTPS 下、ETag/304、`/healthz`、提交与上传配额、前端无内联脚本 |
| `test/ownership_test.js` | 数据归属：量表/调查/随访按创建者隔离，越权读写必须被拒 |
| `test/publish_guard_test.js` | 发布守卫：正文待填的量表不能发布调查或随访研究；评估者量表提交后返回评分 |
| `test/privacy_test.js` | 隐私隔离：无归属数据（历史遗留/管理员口令会话所建）只对管理员可见；一份调查的报告/四种导出/单份答卷每个出口都堵上；自建量表不进公开目录 |
| `test/backup_test.js` | 一键快照与可验证、可回退的恢复流程（含权限、坏文件、缺确认三类拒绝） |
| `test/hygiene_test.js` | 工程卫生：依赖声明、个人路径、文档与 `npm test` 清单一致、临时实例自检 |
| `test/frontend_test.js` | 界面行为：注册开关的表现、首页锚点、跳题联动、共用模块载入 |
| `test/xss_render_test.js` | 渲染型 XSS：量表元数据、工作台最近打开、填写页数字字段、随访判读标签都不执行注入 |
| `test/landing_polish_test.js` | 首页打磨：量表库入口去重、图标底板合法、打字行不顶动布局、顶栏收缩/回顶/分栏等增强 |
| `test/api_test.js` | 进程内接口测试：登录、量表、发布、填写、统计、导出、二维码等 |
| `test/advanced_test.js` | 跳题逻辑（skip logic）与随访/多次测量的配对分析 |
| `test/narrative_test.js` | 结果描述：样本量/描述统计/信度句子生成、不输出伪数值、同源结论去重、空数据明确不可用 |
| `test/report_grouping_test.js` | 报告分组：分组变量不得混入计分条目，分组统计与个案报告口径一致 |
| `test/stats_golden_test.js` | 统计黄金值：t/χ²/F/MW/Wilcoxon/KW/ANOVA 对照教科书临界值，退化输入不出 NaN 或越界系数 |
| `test/import_test.js` | Word / Excel / CSV / 文本 / PDF 导入，及导入后的全链路可用 |
| `test/csv_injection_test.js` | CSV 公式注入：以 `= + - @` 开头的单元格在导出时被转义 |
| `test/ui_test.js` | 全流程：登录 → 量表库 → 编辑器 → 发布 → 数据看板 → 手机填写 |
| `test/stability_test.js` | 运行稳定性：HTTP 超时参数、进程级兜底、SIGTERM/SIGINT 优雅退出、慢客户端不拖垮服务、强杀后同端口重启自愈 |
| `test/d1_init_batch_test.js` | D1 冷启动：模板播种与同步走 batch，首启与后续往返次数保持在个位数（避开 Workers 子请求上限） |
| `test/worker_routes_test.js` | Cloudflare Worker：SPA 深链接回退、静态资源安全头、PATCH 调查、量表/调查鉴权与归属隔离、IP 信任链与限流分桶 |

### 浏览器级检查（可选）

```bash
npx playwright install chromium   # 内核不在 npm 包里，单独下一次
npm run audit
```

`layout_audit.js` 做像素级对齐审计，`dashboard_test.js` 在真实 Chromium 里逐张
Tab 检查数据看板与手机填写页，并单独核对两处内容：手机填写页确实渲染出题目、
「结果描述」确实按本次数据写出了含样本量与描述统计的正文。两者都会**自己拉起一个
临时实例**（独立数据库 + 随机端口），不会依赖"同事机器上正好开着服务"，也不会把
测试数据写进正式库；跑完自动清理。截图输出在 `test/shots/`（已 gitignore）。

没装 playwright 时这两项会跳过并打印安装命令。想让它们打已有实例：

```bash
node test/dashboard_test.js http://127.0.0.1:5173
```

（这种模式下会创建一份名为 `__看板回归测试__` 的调查并在结束时删除。）

jsdom / playwright 的位置也可以用环境变量指定：`JSDOM_PATH`、`PLAYWRIGHT_PATH`、
`PLAYWRIGHT_EXEC`。测试脚本里不允许出现某台个人电脑上的绝对路径，`hygiene_test.js`
会拦住这种情况。

## 三、目录结构

```
server.js          node:http 服务：路由表、静态文件、会话与限流
lib/
  logic.js         跳题引擎、答案文案、量表分类 —— 前后端共用的一份实现
  scales-psych.js  精神心理自评扩充（EPDS、CES-D）
  scales-neuro.js  神经、老年与康复（SPPB、NDI）
  scales-qol.js    生活质量、肿瘤与营养（ECOG、KPS、MEDAS）
  scales-risk.js   临床风险评分（分档与公式计分）
  db.js            node:sqlite 建表、迁移、设置与备份
  scales*.js       内置量表模板（按科室分文件）
  scoring.js       答案校验与计分
  parse.js         外部量表导入
  report.js        个案报告
  stats.js         信度、相关、组间比较
  followup.js      随访研究
  qr.js            二维码生成
  scale-kit.js     量表定义的结构约定
public/
  index.html       管理端单页壳，依次载 /logic.js、/common.js、/app.js
  fill.html        受试者填写入口（/s/<token>），只载 logic/common/fill 三份脚本
  common.js        前后端页面共用的小工具（选择器、转义、toast、api 封装）
  fill.js          公开填写页视图（按需懒加载，管理端首屏不下载）
  app.js           管理端视图（hash 路由，直接渲染）
  logic.js         由 lib/logic.js 复制而来（npm run sync:logic）
  styles.css
docs/使用说明.md   给使用者的操作说明
test/              上述测试与 helpers/
data/app.db        运行数据（gitignore）
```

`/logic.js` 由 `server.js` 的静态处理直接从 `lib/logic.js` 发出：同一份源码既被
Node `require`，也被浏览器 `window.MEDSCALE_LOGIC` 使用，所以没有构建步骤也不会
出现两份实现手工同步的问题。

## 四、几条不能破的约定

1. **运行期零第三方依赖**：`package.json` 的 `dependencies` 必须保持为空，
   `server.js` 与 `lib/` 只允许 `require` `node:` 内建和相对路径。装依赖不是运行
   的前提，这是医院内网离线部署的卖点。
2. **共用逻辑只写一份**：跳题可见性、答案标签、分类清单改在 `lib/logic.js`，
   前端通过别名取用。新增需要前后端一致的规则放这里，别再复制一遍。
3. **内部错误只进日志**：接口 500 一律回传通用提示，堆栈与数据库报错留在
   `console.error`，不要把表名、路径回给浏览器。
4. **数据按创建者隔离**：量表、调查、答卷都带 `owner_id`；新增接口记得做归属
   校验，`ownership_test.js` 会补上越权用例。
5. **初始口令不进页面、请求地址不进数据**：前端与接口都不展示管理员初始口令，
   部署说明里也只写"改口令"这件事。
6. **页面不放内联脚本**：CSP 是 `script-src 'self'`，`public/` 里写 `onclick="..."`
   或内联 `<script>` 在公网会被浏览器直接拦掉。事件一律用 `data-*` 属性 +
   委托监听（见 `app.js` 末尾）。`headers_test.js` 会扫源码拦住这种写法。
7. **会话状态只认库**：登录态在 `sessions` 表（只存 token 的 SHA-256），限流计数在
   `rate_limits` 表。不要再引入进程内 Map 存会话，否则多进程下会出现"在这个 worker
   登录、去那个 worker 掉线"。

## 五、部署到科室/研究组

- 首次启动后**立即**在「系统设置 → 修改管理员密码」改掉默认口令；
- 开账号走邀请码：默认注册策略是「凭邀请码自助注册」，在「系统设置 → 谁能开账号」
  里生成邀请码发给同事，对方自己设口令；三种策略分别是 `closed`（完全关闭）、
  `invite`（凭码，默认）、`open`（免审自助）。公网环境不建议长期开 `open`；
  库里一个用户都没有时，无论如何都会留出注册入口，否则没人能开局；
- 只在可信网络里使用 `MEDSCALE_LAN=1`，受试者数据不出本机；
- 备份：「系统设置 → 数据备份与恢复」，或直接把 `data/` 目录整个拷走（先停服务）；
- 迁移到新机器只需装好 Node 22.5+，把 `data/` 放到原位，`node server.js` 即可。

## 六、发布到公网

平台的定位仍是"科室/研究组自用"，公网形态只是把监听交给反向代理，数据依旧只落在
本机那一个 `data/app.db`。发布前请依次确认下面几件事。

### 0. 想省事就用 `deploy/` 里的部署件

下面几节讲的是**原理与该注意什么**，照着可以手工搭起任何形态。如果目标就是
"云服务器 + 域名，稳定跑起来不用天天管"，那不用手工拼——`deploy/` 里已经有一套
经过验证的落地件，完整步骤见 **`deploy/README.md`**：

```bash
bash deploy/install.sh --domain scales.example.com --dry-run   # 先审一遍会改什么
sudo bash deploy/install.sh --domain scales.example.com --email you@example.com
bash /opt/medscale/deploy/smoke.sh --domain scales.example.com  # 上线自检
```

包含：一键安装脚本（含 `--proxy nginx` 备选路径）、Caddy/nginx 反代模板、
systemd 服务单元（自动重启 + 重启熔断 + 权限加固）、每日自动备份定时器与零依赖备份 CLI、
把检查清单变成可执行脚本的 `smoke.sh`，以及可选的 Docker 方案。

### 1. 用 HTTPS 反向代理，应用本身只听本机

Node 侧不申请证书、不做 301，也不监听公网网卡：让代理终止 TLS，转发到 `127.0.0.1:5173`。
这样即使代理配置出错，暴露面也只有一个本地端口。

Nginx：

```nginx
server {
  listen 443 ssl http2;
  server_name scales.example.edu.cn;
  ssl_certificate     /etc/ssl/certs/scales.pem;
  ssl_certificate_key /etc/ssl/private/scales.key;

  client_max_body_size 24m;      # 应用侧上传上限 20 MB（量表导入、备份恢复）
  location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server { listen 80; server_name scales.example.edu.cn; return 301 https://$host$request_uri; }
```

Caddy 更短（自动签续期证书）：

```caddy
scales.example.edu.cn {
  reverse_proxy 127.0.0.1:5173
}
```

然后 `MEDSCALE_TRUST_PROXY=1 node server.js`。**没设这个变量时，代理头一律不认**——
谁都能自己伪造 `X-Forwarded-For`，把它当作真实来源会绕过登录限流、污染操作日志。
设了之后，代理报告 `https` 才会下发 HSTS 和带 `Secure` 的 Cookie；直连 HTTP 跑公网
时不会给你这些头，这是刻意的：不要在明文上假装安全。

静态资源已经带 ETag 与 `public, max-age=300`（命中返回 304、空响应体），HTML 始终
`no-store`，所以改完页面刷新就生效。代理层若要再加缓存，请只对 `/styles.css`、
`/app.js`、`/logic.js` 这类路径延长，别缓 HTML 与 `/api/*`；300 秒是应用侧有意设的上限。

### 2. 需要并发再开多进程

`MEDSCALE_WORKERS=max node server.js`（或指定数字，封顶 16）。主进程只负责拉起与
收信，端口由 worker 共同绑定，启动横幅与 `运行地址.txt` 仍只写一份；worker 异常退出
会自动补起，连续异常退出则停止拉起并报错，避免端口被占时无限重启。SQLite 已设
`busy_timeout` 并在写冲突时重试，跨进程读写不会轻易报 `database is locked`。

单进程完全够用（百人级问卷发放不必开），把它当成需要时才拧的开关。

### 3. 上线检查清单

- [ ] 改掉管理员默认口令（启动横幅里那个只在第一次生效）；
- [ ] 「系统设置 → 谁能开账号」当前选中的是「凭邀请码注册」，`open` 只在确实要批量建号时临时用；
- [ ] `curl -sI https://域名/` 能看到 `Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`X-Robots-Tag: noindex`；需要被搜索引擎收录才设 `MEDSCALE_INDEXABLE=1`，含受试者数据的站点默认不收；
- [ ] `curl -s https://域名/healthz` 返回 `{"ok":true}`（无 Cookie、`no-store`），可用作进程存活探测；
- [ ] 数据库快照已在「系统设置 → 数据备份与恢复」做过，且 `data/backups/` 里有可恢复的文件；
- [ ] 防火墙只放开 80/443，`5173` 不对外；
- [ ] 手机实测一次扫码填写，确认填写链接仍是那个固定端口／域名（端口漂移会让已经发出去的二维码全部失效）。

### 4. 匿名接口的配额

公网会扫到匿名接口，所以按来源 IP 限了额度（计数在 `rate_limits` 表，多进程共享）：
问卷填写提交 `200 次 / 10 分钟`，量表导入上传 `40 次 / 10 分钟`，超了回 `429` 并带
`Retry-After`。登录失败另有自己的窗口限流。阈值在 `server.js` 的 `RATE_POLICY` 里改。

### 5. 部署到 Cloudflare Workers + D1（免服务器 · 免费稳定）

不想维护云服务器、又要公网 7×24 稳定可访问时，可把平台跑在 Cloudflare Workers 上，
数据落在边缘 SQLite **D1**。免费档即不休眠、不限流量（按请求计费，个人/科室用量远在免费额度内）。

本仓库已内含一套 Workers 版实现，与 Node 版**共用同一套前端与业务规则**，只是把数据层换成 D1：

| 文件 | 作用 |
| --- | --- |
| `worker.js` | Workers 入口（ESM），路由分发、会话/Cookie、登录注册、限流、导出、二维码 |
| `lib/db-d1.js` | D1 异步数据层，导出函数与 `lib/db.js` 一一对应，便于切换 |
| `lib/qr.js` | 改用零依赖的 zlib「存储块」生成 PNG，规避 Workers 不支持 `node:zlib` 的限制 |
| `wrangler.toml` | Workers + D1 + 静态资源（`[assets]` 自动托管 `./public`）绑定配置 |
| `core/schema.sql` | D1 建表脚本（与 Node 版同一份表结构） |

**一次性上线步骤（需自备 Cloudflare 账号）：**

```bash
# 1) 装 wrangler（开发依赖，不污染运行期零依赖约定）
npm i -D wrangler
# 2) 登录 Cloudflare（浏览器授权，仅首次）
npx wrangler login
# 3) 建 D1 数据库，把输出的 database_id 填进 wrangler.toml 的 [[d1_databases]] database_id
npx wrangler d1 create medscale
# 4) 建表（首次）
npx wrangler d1 execute medscale --remote --file=core/schema.sql
# 5) 设管理员初始口令（不设则首次启动随机生成一个，仅出现在 Worker 日志）
npx wrangler secret put MEDSCALE_PASSWORD
# 6) 发布
npx wrangler deploy
```

发布后访问分配的 `*.workers.dev` 或绑定的自定义域名即可；`/healthz` 同样返回 `{"ok":true}`。

**与 Node 版的关键差异（部署前务必知悉）：**

- **账号不互通**：Workers 版用 PBKDF2 哈希口令，Node 版用 scrypt，二者口令不可直接迁移。
  这是一次**全新部署**——在 Cloudflare 上重新注册管理员、重新开调查，而不是把 Node 的 `data/app.db` 搬过去。
- **暂未实现的接口**：随访研究（`/api/studies`）、数据备份/恢复、文件导入（xlsx/csv）在 Workers 版
  返回 `501`，前端会有明确提示。需要这些能力时仍用 Render/Node 版。答题、计分、二维码、邀请码、
  用户/设置、CSV/JSON 导出均已可用。
- **备份**：边缘端无文件系统，不生成本地备份文件；请用应用内「CSV/JSON 导出」，或到 Cloudflare 控制台的 D1 页导出。
- **使用说明页**：边缘端不读本地文件，`/api/guide.md` 默认返回占位；如需内置，把说明文本写进环境变量 `MEDSCALE_GUIDE`。
- **免费档配额**：D1 免费额度为每日 500 万次读、10 万次写、单库 500 MB，科室/研究组用量完全够用；
  若需更大，升 Workers 付费档或 D1 付费档即可。

本地联调可用 `npx wrangler dev`（会自动起本地 D1 与静态服务），但需注意 `wrangler dev` 依赖本地
SQLite 的写临时文件，在受限沙箱环境下可能无法启动——此时直接用 Node 版 `node server.js` 验证功能即可。

