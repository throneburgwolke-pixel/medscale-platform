#!/bin/bash
# 双击本文件即可启动「医学量表与问卷平台」
# 说明：从访达（Finder）双击启动时，环境变量 PATH 很短，
#       常常找不到安装在 ~/.local/bin、nvm、Homebrew 等位置的 node，
#       所以这里逐个常见位置去查找。
cd "$(dirname "$0")" || exit 1
# 端口必须与 cloudflared 隧道 --url 指向的端口一致（当前为 5184）。
# 隧道公网域名不带端口，改这个值不会让二维码失效；但改错会导致「启动平台.command」
# 杀掉的正是隧道在用的那个实例，之后公网地址立刻打不开。
PORT="${PORT:-5184}"

NODE_BIN="$(command -v node 2>/dev/null)"
if [ -z "$NODE_BIN" ]; then
  for c in "$HOME/.local/bin/node" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node" "$HOME/.volta/bin/node" "$HOME/.hermes/tools"/*/bin/node; do
    if [ -x "$c" ]; then NODE_BIN="$c"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  for c in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$c" ]; then NODE_BIN="$c"; break; fi
  done
fi

echo ""
if [ -z "$NODE_BIN" ]; then
  echo "  ✖ 未找到 Node.js。"
  echo "    请从 https://nodejs.org 下载安装 LTS 版本（.pkg 双击安装）后，重新双击本文件。"
  echo ""
  read -r -p "  按回车键退出…"
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"
echo "  使用 Node：$NODE_BIN  ($("$NODE_BIN" -v))"

# 先停掉已在运行的旧实例（含项目搬迁前从其它目录启动的残留进程）
DIR="$(pwd)"
STOPPED=0
for pid in $(pgrep -f "server\.js" 2>/dev/null); do
  CWD="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  CMDLINE="$(ps -o command= -p "$pid" 2>/dev/null)"
  if [ "$CWD" = "$DIR" ] || echo "$CWD $CMDLINE" | grep -qiE "medscale|医学量表"; then
    kill "$pid" 2>/dev/null && STOPPED=$((STOPPED + 1))
  fi
done
if [ "$STOPPED" -gt 0 ]; then
  echo "  已停止 $STOPPED 个旧实例（释放端口）"
  sleep 1
fi

# 兜底：清理仍占用本端口的残留进程（例如工作目录已被移动/删除的旧实例）
for pid in $(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  if kill "$pid" 2>/dev/null; then
    echo "  已停止占用端口 ${PORT} 的残留进程 ${pid}"
    STOPPED=$((STOPPED + 1))
  fi
done
[ "$STOPPED" -gt 0 ] && sleep 1

echo "  正在启动医学量表与问卷平台…"
echo "  端口固定为 ${PORT}：被占用时直接报错退出，需要人工处理后重试。"
echo "  （服务不更换端口，以免已发放的二维码与填写链接失效。）"
echo "  关闭本窗口（或按 Control+C）即可停止服务。"
echo ""

URLFILE="$PWD/data/运行地址.txt"
[ -f "$URLFILE" ] && rm -f "$URLFILE"

# 双击启动默认开放局域网，手机扫码填写才可用；
# 若只想在本机使用，启动前设置 MEDSCALE_LAN=0（服务将只监听 127.0.0.1）。
export MEDSCALE_LAN="${MEDSCALE_LAN:-1}"

PORT="$PORT" "$NODE_BIN" server.js &
SERVER_PID=$!

if [ -z "$MEDSCALE_NO_OPEN" ]; then
  (
    for i in $(seq 1 30); do
      if [ -f "$URLFILE" ]; then
        URL="$(cat "$URLFILE")"
        if [ -n "$URL" ]; then open "$URL" >/dev/null 2>&1 && break; fi
      fi
      sleep 0.5
    done
  ) &
fi

wait $SERVER_PID

[ -f "$URLFILE" ] && rm -f "$URLFILE"

echo ""
echo "  服务已停止。"
read -r -p "  按回车键退出…"
