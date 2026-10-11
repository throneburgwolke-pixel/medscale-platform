#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 医学量表与问卷平台 · 上线自检
#
# 把 README「上线检查清单」变成可以直接跑的检查项。部署完、改完配置、
# 或者以后心里没底的时候都跑一遍。
#
# 用法：
#   bash deploy/smoke.sh --domain scales.example.com
#   bash deploy/smoke.sh --domain scales.example.com --port 5173
#
# 退出码：0 全部通过；1 有失败项（具体哪项会标出来）。
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

DOMAIN=""
PORT="5173"
APP_DIR="/opt/medscale"
DATA_DIR="/var/lib/medscale"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --port)   PORT="${2:-}"; shift 2 ;;
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "无法识别的参数：$1"; exit 2 ;;
  esac
done

[ -n "$DOMAIN" ] || { echo "必须指定 --domain（例：--domain scales.example.com）"; exit 2; }

c_reset=$'\033[0m'; c_grn=$'\033[32m'; c_red=$'\033[31m'; c_yel=$'\033[33m'; c_cyn=$'\033[36m'
FAIL=0; WARN=0
pass() { printf '  %s✔%s %s\n' "$c_grn" "$c_reset" "$*"; }
bad()  { printf '  %s✖%s %s\n' "$c_red" "$c_reset" "$*"; FAIL=$((FAIL+1)); }
soft() { printf '  %s!%s %s\n' "$c_yel" "$c_reset" "$*"; WARN=$((WARN+1)); }
head_() { printf '\n%s【%s】%s\n' "$c_cyn" "$1" "$c_reset"; }

BASE="https://$DOMAIN"
HDR="$(mktemp)"; BODY="$(mktemp)"
trap 'rm -f "$HDR" "$BODY"' EXIT

# ── 1. 服务状态 ──────────────────────────────────────────────────────────────
head_ "1. 系统服务"
for u in medscale medscale-backup.timer; do
  if systemctl is-active --quiet "$u"; then
    if systemctl is-enabled --quiet "$u" 2>/dev/null; then pass "$u 运行中，且已设为开机自启"
    else soft "$u 运行中，但没设开机自启（systemctl enable ${u}）"; fi
  else
    bad "$u 没有运行 → journalctl -u $u -n 50 --no-pager"
  fi
done
PROXY_UNIT=""
for u in caddy nginx; do systemctl is-active --quiet "$u" 2>/dev/null && PROXY_UNIT="$u"; done
if [ -n "$PROXY_UNIT" ]; then
  systemctl is-enabled --quiet "$PROXY_UNIT" 2>/dev/null \
    && pass "反向代理 $PROXY_UNIT 运行中且已开机自启" \
    || soft "反向代理 $PROXY_UNIT 运行中，但没设开机自启"
else
  bad "既没有 caddy 也没有 nginx 在运行，443 不会有响应"
fi

# ── 2. 应用只监听本机 ────────────────────────────────────────────────────────
head_ "2. 监听地址（$PORT 绝不能对外）"
if command -v ss >/dev/null 2>&1; then
  LISTEN="$(ss -lntp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p {print $4}' || true)"
  if [ -z "$LISTEN" ]; then
    bad "没有任何进程监听 ${PORT}（应用没起来？）"
  elif printf '%s\n' "$LISTEN" | grep -qv '^127\.0\.0\.1:'; then
    bad "监听了非本机地址：$LISTEN —— 应当只有 127.0.0.1:$PORT"
    soft "检查 /etc/medscale.env 里有没有误设 MEDSCALE_LAN=1"
  else
    pass "只监听 127.0.0.1:${PORT}（对外只有 443）"
  fi
else
  soft "没有 ss 命令，跳过监听检查"
fi

# ── 3. HTTPS 与证书 ──────────────────────────────────────────────────────────
head_ "3. HTTPS 与证书"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/" 2>/dev/null || echo 000)"
if [ "$CODE" = "200" ]; then pass "GET $BASE/ → 200"
elif [ "$CODE" = "000" ]; then bad "连不上 ${BASE}（证书没签发？DNS 没解析？）→ journalctl -u caddy -n 80 --no-pager"
else soft "GET $BASE/ → ${CODE}（不是 200，确认下是不是被前置页面挡住了）"; fi

EXP="$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
if [ -n "$EXP" ]; then
  EXP_EPOCH="$(date -d "$EXP" +%s 2>/dev/null || date -j -f '%b %d %T %Y %Z' "$EXP" +%s 2>/dev/null || echo 0)"
  NOW_EPOCH="$(date +%s)"
  if [ "$EXP_EPOCH" -gt 0 ]; then
    DAYS=$(( (EXP_EPOCH - NOW_EPOCH) / 86400 ))
    if [ "$DAYS" -gt 20 ]; then pass "证书有效，还有 $DAYS 天到期（到期前会自动续）"
    elif [ "$DAYS" -gt 0 ]; then soft "证书只剩 $DAYS 天，留意自动续期是否正常"
    else bad "证书已过期"; fi
  else
    soft "证书到期时间读不出：$EXP"
  fi
else
  bad "拿不到 TLS 证书信息"
fi

REDIR="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "http://$DOMAIN/" 2>/dev/null || echo '000 ')"
case "$REDIR" in
  30*) pass "HTTP 会跳转到 HTTPS（${REDIR}）" ;;
  *)   soft "HTTP 没有跳转：${REDIR}（建议开强制跳转，避免口令走明文）" ;;
esac

# ── 4. 安全响应头 ────────────────────────────────────────────────────────────
head_ "4. 安全响应头"
curl -sS -D "$HDR" -o /dev/null --max-time 15 "$BASE/" >/dev/null 2>&1 || true
need() {
  local name="$1" pat="$2" why="${3:-}"
  if grep -qi "^$name:" "$HDR"; then
    if [ -n "$pat" ] && ! grep -i "^$name:" "$HDR" | grep -qi "$pat"; then
      bad "$name 存在但内容不对（期望含 ${pat}）$why"
    else
      pass "$name"
    fi
  else
    bad "$name 缺失 $why"
  fi
}
need "Content-Security-Policy" ''
need "X-Content-Type-Options" 'nosniff'
need "X-Frame-Options" 'DENY'
need "X-Robots-Tag" 'noindex' "（除非你确实要让搜索引擎收录）"
need "Strict-Transport-Security" 'max-age' "→ 多半是 MEDSCALE_TRUST_PROXY 没设 1"

# ── 5. 健康检查 ──────────────────────────────────────────────────────────────
head_ "5. 健康检查"
HZ_BODY="$(curl -sS --max-time 10 "$BASE/healthz" 2>/dev/null || echo '')"
HZ_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/healthz" 2>/dev/null || echo 000)"
if [ "$HZ_CODE" = "200" ] && printf '%s' "$HZ_BODY" | grep -q '"ok":true'; then
  pass "/healthz → 200 {\"ok\":true}"
else
  bad "/healthz 异常：$HZ_CODE $HZ_BODY"
fi

# ── 6. 管理员口令不是默认值 ──────────────────────────────────────────────────
head_ "6. 管理员口令"
if [ -f "$APP_DIR/lib/db.js" ]; then
  ISDEF="$(cd "$APP_DIR" && MEDSCALE_DB="$DATA_DIR/app.db" node -e '
    const d = require("./lib/db.js");
    process.stdout.write(String(d.isAdminPasswordDefault()));
    try { d.db.close(); } catch (e) {}
  ' 2>/dev/null || echo 'error')"
  case "$ISDEF" in
    true)  bad "管理员口令仍是首次初始化的值、从未修改过！立刻去「系统设置 → 修改管理员密码」改掉" ;;
    false) pass "管理员口令已由管理员修改过" ;;
    *)     soft "查不出来（可能数据库路径不同），请自行确认已改过口令" ;;
  esac
else
  soft "没找到 $APP_DIR/lib/db.js，跳过口令检查"
fi

# ── 7. 数据目录与备份 ────────────────────────────────────────────────────────
head_ "7. 数据与备份"
if [ -f "$DATA_DIR/app.db" ]; then
  pass "数据库存在：$DATA_DIR/app.db（$(du -h "$DATA_DIR/app.db" | cut -f1)）"
  PERM="$(stat -c '%a' "$DATA_DIR" 2>/dev/null || stat -f '%Lp' "$DATA_DIR" 2>/dev/null || echo '?')"
  case "$PERM" in 750|700) pass "数据目录权限 ${PERM}（正常）" ;; *) soft "数据目录权限为 ${PERM}，建议 750" ;; esac
else
  bad "找不到 $DATA_DIR/app.db"
fi
BAK_DIR="$DATA_DIR/backups"
if [ -d "$BAK_DIR" ]; then
  N="$(find "$BAK_DIR" -maxdepth 1 -name 'medscale-*.sqlite' 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$N" -gt 0 ]; then
    LAST="$(find "$BAK_DIR" -maxdepth 1 -name 'medscale-*.sqlite' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
    pass "已有 $N 份快照，最近一份：$(basename "${LAST:-未知}")"
  else
    soft "还没有任何自动备份（定时器设置的是每天 03:15，可手工先跑一次）"
  fi
  if systemctl list-timers --all 2>/dev/null | grep -q 'medscale-backup.timer'; then
    NEXT="$(systemctl list-timers medscale-backup.timer --no-pager 2>/dev/null | sed -n '2p' | awk '{print $1,$2,$3}')"
    pass "自动备份定时器已注册，下次：${NEXT:-未知}"
  else
    bad "medscale-backup.timer 没注册（systemctl enable --now medscale-backup.timer）"
  fi
else
  soft "$BAK_DIR 还不存在，第一次备份跑完才会有"
fi

# ── 汇总 ─────────────────────────────────────────────────────────────────────
printf '\n────────────────────────────────────────────────────────────────────\n'
if [ "$FAIL" = 0 ] && [ "$WARN" = 0 ]; then
  printf ' %s自检全部通过%s\n' "$c_grn" "$c_reset"
elif [ "$FAIL" = 0 ]; then
  printf ' %s通过，但有 %s 项需要留意%s\n' "$c_yel" "$WARN" "$c_reset"
else
  printf ' %s有 %s 项失败、%s 项需留意%s\n' "$c_red" "$FAIL" "$WARN" "$c_reset"
fi
printf '────────────────────────────────────────────────────────────────────\n\n'
[ "$FAIL" = 0 ] || exit 1
exit 0
