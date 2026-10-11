#!/bin/bash
# 双击本文件：停止所有正在运行的「医学量表与问卷平台」服务
cd "$(dirname "$0")" || exit 1
TARGET="$(pwd)/server.js"

echo ""
echo "  正在查找并停止本平台的服务进程…"

COUNT=0
DIR="$(pwd)"
# 匹配规则：① 工作目录就是本目录；② 或运行路径中包含 medscale / 医学量表
# （兼容从旧位置启动的实例，例如项目搬迁前的残留进程）
for pid in $(pgrep -f "server\.js" 2>/dev/null); do
  CWD="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  CMDLINE="$(ps -o command= -p "$pid" 2>/dev/null)"
  if [ "$CWD" = "$DIR" ] || echo "$CWD $CMDLINE" | grep -qiE "medscale|医学量表"; then
    if kill "$pid" 2>/dev/null; then
      echo "  已停止进程 ${pid}（原目录：${CWD:-未知}）"
      COUNT=$((COUNT + 1))
    fi
  fi
done

if [ -f "data/运行地址.txt" ]; then
  rm -f "data/运行地址.txt"
fi

# 兜底：结束仍占用本平台端口（默认 5184）的进程
# 适用于"进程工作目录已被删除/移动"等上面匹配不到的情况
PORT="${PORT:-5184}"
for pid in $(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  if kill "$pid" 2>/dev/null; then
    echo "  已停止占用端口 ${PORT} 的进程 ${pid}"
    COUNT=$((COUNT + 1))
  fi
done

echo ""
if [ "$COUNT" -eq 0 ]; then
  echo "  没有发现正在运行的服务（可能已经停止）。"
else
  echo "  共停止 $COUNT 个服务进程，端口已释放。"
fi
echo ""
read -r -p "  按回车键退出…"
