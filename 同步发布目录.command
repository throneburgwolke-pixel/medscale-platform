#!/bin/bash
# 同步发布目录：把主目录的最新源码同步到「线上发布/」，供托管沙箱发布使用。
# 做三件事：① rsync 源码（排除数据/测试/本地文件）② 应用沙箱绑定补丁 ③ 冒烟自检。
# 同步完成后，到 WorkBuddy 对话里说「更新线上」即可重新发布（链接不变）。
set -e
cd "$(dirname "$0")"

SRC="$PWD"
DST="$SRC/线上发布"

echo "── ① 同步源码到 线上发布/ ──"
# 确定性逐项同步：只带运行时必需文件，绝不含 data/test/node_modules/工作日志
rm -rf "$DST"
mkdir -p "$DST/docs"
rsync -a "$SRC/server.js" "$SRC/package.json" "$SRC/package-lock.json" "$DST/"
rsync -a "$SRC/lib" "$SRC/core" "$SRC/public" "$DST/"
cp "$SRC/docs/使用说明.md" "$DST/docs/"
# 双保险：清掉任何不该线上的目录
rm -rf "$DST/data" "$DST/backups" "$DST/node_modules" "$DST/test"

echo "── ② 应用沙箱绑定补丁（0.0.0.0）──"
python3 - <<'PYEOF'
import io
p = '线上发布/server.js'
s = io.open(p, encoding='utf-8').read()
old = """function resolveHost(env) {
  const e = env || {};
  if (e.HOST) return String(e.HOST);
  return String(e.MEDSCALE_LAN || '') === '1' ? '0.0.0.0' : '127.0.0.1';
}"""
new = """function resolveHost(env) {
  const e = env || {};
  if (e.HOST) return String(e.HOST);
  return '0.0.0.0';
}"""
if new in s:
    print('  补丁已存在，跳过')
elif old in s:
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('  已应用：托管版默认绑定 0.0.0.0')
else:
    raise SystemExit('  失败：server.js 里找不到 resolveHost 原文，请人工检查')
PYEOF

echo "── ③ 冒烟自检 ──"
SMOKE_PORT=$(( (RANDOM % 2000) + 18000 ))
cd "$DST"
PORT=$SMOKE_PORT node server.js > /tmp/medscale_publish_smoke.log 2>&1 &
SVPID=$!
sleep 2
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$SMOKE_PORT/api/session" || echo 000)
kill $SVPID 2>/dev/null || true
sleep 1
rm -rf "$DST/data" "$DST/backups" "$DST/运行地址.txt"
if [ "$CODE" = "200" ]; then
  echo "  自检通过（/api/session 返回 200），发布目录就绪"
else
  echo "  自检失败（HTTP $CODE），日志在 /tmp/medscale_publish_smoke.log"; exit 1
fi

FILECOUNT=$(find "$DST" -type f | wc -l | tr -d ' ')
echo ""
echo "✅ 同步完成：$DST（$FILE 个文件）"
echo "   下一步：到 WorkBuddy 对话里说「更新线上」，我会重新发布（分享链接不变）。"
echo "   代码入库：git add -A && git commit -m \"说明\" && git push"
