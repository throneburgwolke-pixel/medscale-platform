'use strict';
/** 固定窗口失败限流：语义逐行对齐 server.js createRateLimiter（计数落库，跨进程/跨 isolate 共享） */
async function checkLimit(db, key, max, windowMs, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const rec = await db.first('SELECT first, n FROM rate_limits WHERE key = ?', [key]);
  if (!rec || now - rec.first > windowMs) {
    await db.run('INSERT INTO rate_limits(key,first,n) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET first = excluded.first, n = excluded.n', [key, now, 1]);
    if (windowMs > 0 && Math.random() < 0.02) await purgeRateLimits(db, now - windowMs);
    return { allowed: true };
  }
  const n = rec.n + 1;
  await db.run('UPDATE rate_limits SET n = ? WHERE key = ?', [n, key]);
  if (n > max) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((rec.first + windowMs - now) / 1000)) };
  return { allowed: true };
}
async function resetLimit(db, key) { await db.run('DELETE FROM rate_limits WHERE key = ?', [key]); }
async function purgeRateLimits(db, cutoffMs) { await db.run('DELETE FROM rate_limits WHERE first < ?', [cutoffMs]); }
module.exports = { checkLimit, resetLimit, purgeRateLimits };
