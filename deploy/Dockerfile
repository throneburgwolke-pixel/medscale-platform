# ─────────────────────────────────────────────────────────────────────────────
# 医学量表与问卷平台 · 容器镜像（备选方案）
#
# 主推的部署方式仍是 deploy/install.sh 直装（组件最少、故障点最少）。
# 这个镜像给「不想在宿主机装 Node / 想用 docker compose 统一管」的场景。
#
# 构建（注意上下文是仓库根目录，不是 deploy/）：
#   docker build -f deploy/Dockerfile -t medscale:1.0 .
# 运行：用 deploy/docker-compose.yml 更省事（数据卷与健康检查都配好了）
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine

# 应用依赖 node:sqlite，它从 Node 22.5 才有。构建时就卡住，
# 而不是等到运行时才抛一句难懂的 "Cannot find module 'node:sqlite'"。
RUN node -e "\
  const [m, n] = process.versions.node.split('.').map(Number); \
  if (!(m > 22 || (m === 22 && n >= 5))) { \
    console.error('需要 Node >= 22.5，当前 ' + process.versions.node); process.exit(1); \
  } \
  require('node:sqlite'); \
"

WORKDIR /app

# 分层拷贝：改前端不会让整层缓存失效。
# 应用是零第三方依赖的，所以下面没有、也不需要任何 npm install。
COPY package.json ./
COPY server.js ./
COPY core/ ./core/
COPY lib/ ./lib/
COPY public/ ./public/
COPY docs/ ./docs/
COPY deploy/backup-cli.js ./deploy/backup-cli.js

# 两个目录的分工：
#   /app/data —— lib/db.js 开头会检查它是否存在，不存在就 mkdir。
#                容器里 /app 是只读的，所以必须预建，否则启动即 EROFS 崩溃。
#   /data     —— 真正的数据库与备份，通过数据卷挂载，容器重建也不丢。
RUN mkdir -p /app/data /data \
 && addgroup -S -g 10001 medscale \
 && adduser  -S -u 10001 -G medscale -h /data medscale \
 && chown -R root:medscale /app \
 && chmod -R g-w,o-w /app \
 && chown -R medscale:medscale /data

USER medscale

ENV PORT=5173 \
    MEDSCALE_DB=/data/app.db \
    MEDSCALE_TRUST_PROXY=1 \
    MEDSCALE_WORKERS=1

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5173) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
