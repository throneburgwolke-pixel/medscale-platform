#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 医学量表与问卷平台 · 服务器一键安装脚本
#
# 适用：Ubuntu 22.04 / 24.04、Debian 12（x86_64 或 arm64）
#      阿里云 / 腾讯云 / 华为云的官方镜像都直接可用。
#
# 用法（在服务器上，把整个项目目录传上去之后）：
#   sudo bash deploy/install.sh --domain scales.example.com --email you@example.com
#
# 常用选项：
#   --domain <域名>        必填。要对外提供服务的域名，必须已经解析到本机公网 IP。
#   --email <邮箱>         可选。证书到期提醒用，强烈建议填。
#   --proxy caddy|nginx    可选，默认 caddy。Caddy 装不上时改用 nginx + certbot。
#   --admin-password <口令> 可选。不填则自动生成一个 20 位强口令并打印出来。
#   --port <端口>          可选，默认 5173。应用只听 127.0.0.1，不对外。
#   --dry-run              只打印将要执行的动作，不真正改动系统。建议先跑一次看看。
#   --skip-firewall        不自动配置 ufw（云厂商安全组仍需你自己在控制台放行 80/443）。
#   --no-start             装完不启动服务，方便你先检查配置。
#
# 安全提醒：本脚本不会替你决定管理员口令强度。若不传 --admin-password，
#          它会生成一个随机强口令并打印——请立刻保存到密码管理器。
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── 常量 ─────────────────────────────────────────────────────────────────────
APP_DIR="/opt/medscale"
DATA_DIR="/var/lib/medscale"
ENV_FILE="/etc/medscale.env"
RUN_USER="medscale"
NODE_MAJOR=22
NODE_MIN_MINOR=5           # 应用要求 node >= 22.5.0（node:sqlite 需要）
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DOMAIN=""
ACME_EMAIL=""
PROXY="caddy"
ADMIN_PASSWORD=""
PORT="5173"
DRY_RUN=0
DO_FIREWALL=1
DO_START=1

# ── 输出helper ───────────────────────────────────────────────────────────────
c_reset=$'\033[0m'; c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_cyn=$'\033[36m'
step()  { printf '\n%s▶ %s%s\n' "$c_cyn" "$*" "$c_reset"; }
ok()    { printf '  %s✔%s %s\n' "$c_grn" "$c_reset" "$*"; }
warn()  { printf '  %s!%s %s\n' "$c_yel" "$c_reset" "$*"; }
die()   { printf '\n%s✖ %s%s\n\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }
run()   {
  if [ "$DRY_RUN" = 1 ]; then printf '  %s[dry-run]%s %s\n' "$c_yel" "$c_reset" "$*"; return 0; fi
  "$@"
}

usage() {
  cat <<'EOT'
用法：sudo bash deploy/install.sh --domain <域名> [选项]

必填：
  --domain <域名>          要对外提供服务的域名，必须已把 A 记录解析到本机公网 IP。

可选：
  --email <邮箱>           证书到期提醒用。强烈建议填。
  --proxy caddy|nginx      默认 caddy。Caddy 装不上时改用 nginx + certbot（都在系统源里）。
  --admin-password <口令>  不填则自动生成一个 20 位强口令并打印出来。
  --port <端口>            默认 5173。应用只听 127.0.0.1，不对外。
  --dry-run                只打印将要执行的动作，不改动系统（可不用 root 先看一遍）。
  --skip-firewall          不自动配置 ufw（云厂商安全组仍需你在控制台放行 80/443）。
  --no-start               装完不启动服务，方便先检查配置。
  -h, --help               显示本帮助。

示例：
  sudo bash deploy/install.sh --domain scales.example.com --email me@example.com
  sudo bash deploy/install.sh --domain scales.example.com --proxy nginx
  bash deploy/install.sh --domain scales.example.com --dry-run      # 先审一遍
EOT
  exit 0
}

# ── 参数解析 ─────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --domain)         DOMAIN="${2:-}"; shift 2 ;;
    --email)          ACME_EMAIL="${2:-}"; shift 2 ;;
    --proxy)          PROXY="${2:-}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --port)           PORT="${2:-}"; shift 2 ;;
    --dry-run)        DRY_RUN=1; shift ;;
    --skip-firewall)  DO_FIREWALL=0; shift ;;
    --no-start)       DO_START=0; shift ;;
    -h|--help)        usage ;;
    *)                die "无法识别的参数：$1（用 --help 查看用法）" ;;
  esac
done

[ -n "$DOMAIN" ] || die "缺少 --domain。示例：--domain scales.example.com"
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$ ]] \
  || die "域名格式不对：${DOMAIN}（必须是形如 scales.example.com 的域名，不能填 IP）"
case "$PROXY" in caddy|nginx) ;; *) die "--proxy 只能是 caddy 或 nginx" ;; esac
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] \
  || die "--port 必须是 1024-65535 之间的整数"
[ -f "$SRC_DIR/server.js" ] || die "没找到 server.js，请在项目根目录下运行本脚本"

# 非 root 时仍允许 dry-run：买服务器之前先看一遍脚本要动什么，是合理的诉求。
if [ "$(id -u)" != "0" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    warn "非 root 的 dry-run：只做检查与打印，不会改动系统"
  else
    die "请用 root 运行：sudo bash deploy/install.sh --domain $DOMAIN ..."
  fi
fi

if [ "$DRY_RUN" = 1 ]; then
  warn "dry-run 模式：只打印动作，不改动系统"
fi

# ── 0. 系统检查 ──────────────────────────────────────────────────────────────
step "0/9 检查系统"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ok "系统：${PRETTY_NAME:-unknown}"
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) warn "本脚本只在 Ubuntu / Debian 上验证过，当前是 ${ID:-未知}，继续但可能出错" ;;
  esac
else
  warn "读不到 /etc/os-release，继续但可能出错"
fi
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|aarch64|arm64) ok "架构：$ARCH" ;;
  *) die "不支持的架构：$ARCH" ;;
esac
ok "源码目录：$SRC_DIR"

# ── 1. 安装基础依赖 ──────────────────────────────────────────────────────────
step "1/9 安装基础依赖（curl / rsync / ca-certificates）"
run env DEBIAN_FRONTEND=noninteractive apt-get update -qq
run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl ca-certificates rsync xz-utils gnupg openssl
ok "基础依赖就绪"

# ── 2. 安装 Node.js ──────────────────────────────────────────────────────────
# 刻意不走 NodeSource 第三方源：国内机器访问它经常超时。
# 改用 Node 官方发布的二进制包，优先走 npmmirror（国内快），失败再回退 nodejs.org。
step "2/9 安装 Node.js ${NODE_MAJOR}.x"
need_node=1
if command -v node >/dev/null 2>&1; then
  cur="$(node -v | sed 's/^v//')"
  cur_major="${cur%%.*}"
  rest="${cur#*.}"; cur_minor="${rest%%.*}"
  if [ "$cur_major" -gt "$NODE_MAJOR" ] || { [ "$cur_major" -eq "$NODE_MAJOR" ] && [ "$cur_minor" -ge "$NODE_MIN_MINOR" ]; }; then
    ok "已有 Node v${cur}，满足 ≥ ${NODE_MAJOR}.${NODE_MIN_MINOR}，跳过"
    need_node=0
  else
    warn "已有 Node v$cur 过旧（要求 ≥ ${NODE_MAJOR}.${NODE_MIN_MINOR}），将安装新版到 /usr/local"
  fi
fi

if [ "$need_node" = 1 ]; then
  case "$ARCH" in
    x86_64)  NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
  esac
  # 先查出最新的 22.x 版本号（npmmirror 的 index.json 在两个源上都可用）
  if [ "$DRY_RUN" = 1 ]; then
    NODE_VER="22.x"
    printf '  %s[dry-run]%s 下载 node-v22.x-linux-%s.tar.xz 并解压到 /usr/local\n' "$c_yel" "$c_reset" "$NODE_ARCH"
  else
    NODE_VER="$(curl -fsSL --max-time 20 'https://npmmirror.com/mirrors/node/index.json' 2>/dev/null \
      | tr ',' '\n' | sed -n 's/.*"version":"\(v22\.[0-9]*\.[0-9]*\)".*/\1/p' | head -1 \
      || true)"
    [ -n "$NODE_VER" ] || NODE_VER="$(curl -fsSL --max-time 20 'https://nodejs.org/dist/index.json' \
      | tr ',' '\n' | sed -n 's/.*"version":"\(v22\.[0-9]*\.[0-9]*\)".*/\1/p' | head -1 || true)"
    [ -n "$NODE_VER" ] || die "查不到 Node 22 的最新版本号，请检查服务器外网连通性"
    ok "目标版本：$NODE_VER"

    PKG="node-${NODE_VER}-linux-${NODE_ARCH}.tar.xz"
    TMP="$(mktemp -d)"
    for BASE in "https://npmmirror.com/mirrors/node/${NODE_VER}" "https://nodejs.org/dist/${NODE_VER}"; do
      if curl -fsSL --connect-timeout 10 --max-time 300 -o "$TMP/$PKG" "$BASE/$PKG"; then
        ok "已从 $BASE 下载"
        break
      fi
      warn "从 $BASE 下载失败，换下一个源"
    done
    [ -s "$TMP/$PKG" ] || die "Node 安装包下载失败，请检查外网或改用离线安装（见 deploy/README.md）"

    tar -xJf "$TMP/$PKG" -C /usr/local --strip-components=1
    rm -rf "$TMP"
    if [ -x /usr/local/bin/node ]; then
      ok "Node 已安装到 /usr/local：$(/usr/local/bin/node -v)"
    else
      die "解压后没找到 /usr/local/bin/node，安装异常"
    fi
  fi
fi

if [ "$DRY_RUN" = 0 ]; then
  NODE_BIN="$(command -v node)"
  [ -n "$NODE_BIN" ] || die "PATH 里找不到 node"
  v="$(node -v | sed 's/^v//')"; vmaj="${v%%.*}"; vrest="${v#*.}"; vmin="${vrest%%.*}"
  { [ "$vmaj" -gt "$NODE_MAJOR" ] || { [ "$vmaj" -eq "$NODE_MAJOR" ] && [ "$vmin" -ge "$NODE_MIN_MINOR" ]; }; } \
    || die "当前 node ($NODE_BIN) 仍不满足 ≥ ${NODE_MAJOR}.${NODE_MIN_MINOR}"
  ok "将使用：${NODE_BIN}（$(node -v)）"
else
  NODE_BIN="/usr/local/bin/node"
fi

# ── 3. 安装反向代理 ──────────────────────────────────────────────────────────
step "3/9 安装反向代理（${PROXY}）"
if [ "$PROXY" = "caddy" ]; then
  if command -v caddy >/dev/null 2>&1; then
    ok "已有 Caddy：$(caddy version 2>/dev/null | head -1)"
  else
    if run bash -c 'set -e; apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1 || true
      curl -fsSL --connect-timeout 10 --max-time 60 https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -fsSL --connect-timeout 10 --max-time 60 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
        > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq && apt-get install -y -qq caddy'; then
      ok "Caddy 安装完成"
    else
      warn "Caddy 装不上（多为访问 dl.cloudsmith.io 超时）。"
      warn "改用 nginx + certbot 重跑即可（两者都在系统自带源里）："
      warn "    sudo bash deploy/install.sh --domain $DOMAIN --proxy nginx"
      die "请改用 --proxy nginx 重新执行"
    fi
  fi
else
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx
  ok "nginx 与 certbot 安装完成"
fi

# ── 4. 建用户与目录 ──────────────────────────────────────────────────────────
step "4/9 建运行用户与数据目录"
if id "$RUN_USER" >/dev/null 2>&1; then
  ok "用户 $RUN_USER 已存在"
else
  run useradd --system --shell /usr/sbin/nologin --home-dir "$DATA_DIR" --create-home "$RUN_USER"
  ok "已创建系统用户 ${RUN_USER}（不可登录）"
fi
run mkdir -p "$DATA_DIR" "$APP_DIR"
run chown -R "$RUN_USER:$RUN_USER" "$DATA_DIR"
run chmod 750 "$DATA_DIR"
ok "数据目录：${DATA_DIR}（仅 $RUN_USER 可读写）"

# ── 5. 部署代码 ──────────────────────────────────────────────────────────────
step "5/9 部署代码到 $APP_DIR"
# docs/ 里只带「使用说明.md」这一个运行期真正会读到的文件（server.js 通过
# /api/guide.md 把它发给访客）。开发期文档、方案稿、界面截图一律不上服务器——
# 它们可能包含内部信息，也没有任何运行期用途。
run rsync -a --delete \
  --include '/docs/' \
  --include '/docs/使用说明.md' \
  --exclude '/docs/**' \
  --exclude 'data/' --exclude 'node_modules/' --exclude '.git/' \
  --exclude 'test/' --exclude '.superpowers/' --exclude '.workbuddy/' \
  --exclude '.DS_Store' --exclude '*.command' --exclude '*.log' \
  "$SRC_DIR/" "$APP_DIR/"

# 这个空目录是必须的：lib/db.js 开头无条件执行
#   const DATA_DIR = path.join(__dirname, '..', 'data');
#   if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
# systemd 那边开了 ProtectSystem=strict（/opt/medscale 只读），
# 如果 data/ 不存在，这一句 mkdir 会以 EROFS/EACCES 抛错，应用直接起不来。
# 预建出来让 existsSync 返回 true，mkdir 就不会执行；实际数据写在 /var/lib/medscale。
run mkdir -p "$APP_DIR/data"
run chown -R root:"$RUN_USER" "$APP_DIR"
run chmod -R g-w,o-w "$APP_DIR"
ok "代码已就位（${APP_DIR}，只读；data/ 已预建）"

# ── 6. 写环境变量文件 ────────────────────────────────────────────────────────
step "6/9 配置 /etc/medscale.env"
if [ -f "$ENV_FILE" ]; then
  ok "$ENV_FILE 已存在，保留原有配置（不会覆盖你改过的口令）"
else
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n/+=' | cut -c1-20)"
    GEN_PW=1
  else
    GEN_PW=0
  fi
  if [ "$DRY_RUN" = 1 ]; then
    printf '  %s[dry-run]%s 生成 %s\n' "$c_yel" "$c_reset" "$ENV_FILE"
  else
    umask 077
    sed -e "s|^MEDSCALE_DB=.*|MEDSCALE_DB=$DATA_DIR/app.db|" \
        -e "s|^PORT=.*|PORT=$PORT|" \
        -e "s|^MEDSCALE_PASSWORD=.*|MEDSCALE_PASSWORD=$ADMIN_PASSWORD|" \
        "$SRC_DIR/deploy/medscale.env.example" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    chown root:root "$ENV_FILE"
    ok "已生成 ${ENV_FILE}（权限 600，仅 root 可读）"
    if [ "${GEN_PW:-0}" = 1 ]; then
      printf '\n  %s┌── 管理员初始口令（只显示这一次）────────────────────┐%s\n' "$c_yel" "$c_reset"
      printf '  %s│%s  %s\n' "$c_yel" "$c_reset" "$ADMIN_PASSWORD"
      printf '  %s└────────────────────────────────────────────────────┘%s\n' "$c_yel" "$c_reset"
      warn "请立刻存进密码管理器。之后改密码走网页「系统设置 → 修改管理员密码」。"
    fi
  fi
fi

# ── 7. 装 systemd 单元 ───────────────────────────────────────────────────────
step "7/9 安装 systemd 服务与定时备份"
if [ "$DRY_RUN" = 1 ]; then
  printf '  %s[dry-run]%s 安装 medscale / medscale-backup 单元，ExecStart 用 %s\n' "$c_yel" "$c_reset" "$NODE_BIN"
else
  for u in medscale.service medscale-backup.service medscale-backup.timer; do
    sed "s|/usr/bin/node|$NODE_BIN|g" "$SRC_DIR/deploy/$u" > "/etc/systemd/system/$u"
  done
  systemctl daemon-reload
  ok "已安装 medscale.service、medscale-backup.service、medscale-backup.timer"
fi

# ── 8. 配置反向代理 ──────────────────────────────────────────────────────────
step "8/9 配置反向代理（域名 $DOMAIN → 127.0.0.1:${PORT}）"
if [ "$PROXY" = "caddy" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    printf '  %s[dry-run]%s 生成 /etc/caddy/Caddyfile（域名 %s）\n' "$c_yel" "$c_reset" "$DOMAIN"
  else
    mkdir -p /var/log/caddy
    chown -R caddy:caddy /var/log/caddy 2>/dev/null || true
    sed -e "s/scales\.example\.com/$DOMAIN/g" \
        -e "s|admin@example\.com|${ACME_EMAIL:-admin@$DOMAIN}|g" \
        -e "s/127\.0\.0\.1:5173/127.0.0.1:$PORT/g" \
        "$SRC_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
    caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
      && ok "Caddyfile 语法校验通过" \
      || die "Caddyfile 校验失败，请检查：caddy validate --config /etc/caddy/Caddyfile"
  fi
else
  if [ "$DRY_RUN" = 1 ]; then
    printf '  %s[dry-run]%s 生成 /etc/nginx/sites-available/medscale\n' "$c_yel" "$c_reset"
  else
    sed -e "s/scales\.example\.com/$DOMAIN/g" \
        -e "s/127\.0\.0\.1:5173/127.0.0.1:$PORT/g" \
        "$SRC_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/medscale
    ln -sf /etc/nginx/sites-available/medscale /etc/nginx/sites-enabled/medscale
    rm -f /etc/nginx/sites-enabled/default
    nginx -t >/dev/null 2>&1 && ok "nginx 配置校验通过" || die "nginx 配置校验失败：nginx -t"
  fi
fi

# ── 9. 防火墙与启动 ──────────────────────────────────────────────────────────
step "9/9 防火墙与启动"
if [ "$DO_FIREWALL" = 1 ]; then
  if command -v ufw >/dev/null 2>&1; then
    run ufw allow 22/tcp
    run ufw allow 80/tcp
    run ufw allow 443/tcp
    run ufw --force enable
    ok "ufw 已放行 22 / 80 / 443（$PORT 未放行，这是对的）"
  else
    warn "没装 ufw，跳过。请自行确认云厂商安全组只放行 80/443，不要放行 $PORT"
  fi
else
  warn "已按 --skip-firewall 跳过防火墙配置"
fi

if [ "$DO_START" = 1 ]; then
  run systemctl enable --now medscale
  run systemctl enable --now medscale-backup.timer
  if [ "$PROXY" = "caddy" ]; then
    run systemctl enable --now caddy
    run systemctl restart caddy
  else
    run systemctl enable --now nginx
    run systemctl restart nginx
    # certbot 必须等 nginx 起来、且 80 端口能对外访问之后才能做 HTTP 挑战，
    # 所以放在这一步而不是第 8 步。失败不致命：多半是 DNS 还没解析到本机。
    if [ "$DRY_RUN" = 1 ]; then
      printf '  %s[dry-run]%s certbot --nginx -d %s\n' "$c_yel" "$c_reset" "$DOMAIN"
    else
      if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
           -m "${ACME_EMAIL:-admin@$DOMAIN}" --redirect >/tmp/certbot.log 2>&1; then
        ok "证书已签发，已配置 80→443 自动跳转"
      else
        warn "证书没签发成功（最后几行）："
        tail -n 8 /tmp/certbot.log | sed 's/^/      /'
        warn "确认 $DOMAIN 的 A 记录已指向本机公网 IP，然后重试："
        warn "    certbot --nginx -d $DOMAIN --redirect"
      fi
    fi
  fi
  ok "服务已启动"
else
  warn "已按 --no-start 跳过启动，请手动：systemctl enable --now medscale caddy"
fi

# ── 完成 ─────────────────────────────────────────────────────────────────────
cat <<EOF

────────────────────────────────────────────────────────────────────────────────
 安装完成
────────────────────────────────────────────────────────────────────────────────
 访问地址      https://$DOMAIN
 应用监听      127.0.0.1:${PORT}（不对外暴露）
 数据目录      $DATA_DIR
 代码目录      $APP_DIR
 环境变量      $ENV_FILE
 日志          journalctl -u medscale -f

 下一步：
   1) 等 10-30 秒让证书签发，然后跑自检：
        bash $APP_DIR/deploy/smoke.sh --domain $DOMAIN
   2) 打开 https://$DOMAIN 用管理员口令登录，立刻确认
      「系统设置 → 谁能开账号」是「凭邀请码注册」。
   3) 云厂商控制台的安全组也要放行 80/443（脚本改不了它）。

 若证书没签发成功，先看：journalctl -u ${PROXY} -n 80 --no-pager
────────────────────────────────────────────────────────────────────────────────
EOF
