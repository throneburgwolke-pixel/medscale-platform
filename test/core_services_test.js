'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const ROOT = path.join(__dirname, '..');
const { createSqliteAdapter } = require(path.join(ROOT, 'core/db/sqlite-adapter.js'));
const settings = require(path.join(ROOT, 'core/services/settings.js'));
const audit = require(path.join(ROOT, 'core/services/audit.js'));
const sessions = require(path.join(ROOT, 'core/services/sessions.js'));
const rl = require(path.join(ROOT, 'core/services/ratelimit.js'));

function freshDb() {
  const mem = new DatabaseSync(':memory:');
  mem.exec(fs.readFileSync(path.join(ROOT, 'core/schema.sql'), 'utf8'));
  return createSqliteAdapter(mem);
}

(async function () {
  console.log('\n【1】settings / audit');
  let db = freshDb();
  t.ok((await settings.getSetting(db, 'nope', '默认')) === '默认', 'getSetting 回落');
  await settings.setSetting(db, 'site_title', '测试站');
  await settings.setSetting(db, 'site_title', '改名');
  t.ok((await settings.getSetting(db, 'site_title')) === '改名', 'setSetting upsert');
  await audit.logAudit(db, 'login', 'admin');
  const logs = await audit.listAudit(db);
  t.ok(logs.length === 1 && logs[0].action === 'login' && logs[0].detail === 'admin', 'audit 落库');

  console.log('\n【2】sessions');
  db = freshDb();
  const token = 'tok123';
  const hash = await sessions.sha256Hex(token);
  t.ok(/^[0-9a-f]{64}$/.test(hash), 'sha256Hex 输出 64 位 hex');
  t.ok((await sessions.getSession(db, hash)) === null, '未知 token → null');
  await sessions.createSession(db, hash, { userId: 7, admin: true, ip: '1.2.3.4' });
  const s = await sessions.getSession(db, hash);
  t.ok(s && s.userId === 7 && s.admin === 1, 'getSession 读回', s);
  await sessions.touchSession(db, hash, new Date().toISOString());
  t.ok((await sessions.getSession(db, hash)).lastSeen !== '', 'touchSession 更新 lastSeen');
  await sessions.createSession(db, await sessions.sha256Hex('t2'), { userId: 7 });
  await sessions.deleteSessionsOfUser(db, 7);
  t.ok((await sessions.getSession(db, hash)) === null, 'deleteSessionsOfUser 清光该用户会话');
  // 过期即删
  const h3 = await sessions.sha256Hex('t3');
  await sessions.createSession(db, h3, { userId: 8, ttlMs: -1000 });
  t.ok((await sessions.getSession(db, h3)) === null, '过期会话读到即删');
  await sessions.clearSessions(db);
  t.ok((await sessions.getSession(db, await sessions.sha256Hex('t2'))) === null, 'clearSessions');

  console.log('\n【3】ratelimit（固定窗口语义）');
  db = freshDb();
  const now = 1000000;
  for (let i = 0; i < 3; i += 1) {
    const r = await rl.checkLimit(db, 'ip|join', 3, 60000, now + i);
    t.ok(r.allowed === true, '窗口内第 ' + (i + 1) + ' 次放行');
  }
  const blocked = await rl.checkLimit(db, 'ip|join', 3, 60000, now + 10);
  t.ok(blocked.allowed === false && blocked.retryAfterSec > 0, '超限拒绝并给 retryAfterSec', blocked);
  await rl.resetLimit(db, 'ip|join');
  t.ok((await rl.checkLimit(db, 'ip|join', 3, 60000, now + 11)).allowed === true, 'reset 后放行');
  const nextWindow = await rl.checkLimit(db, 'ip|other', 1, 60000, now + 61000);
  t.ok(nextWindow.allowed === true, '窗口过期后重新计数');

  process.exit(t.done('核心基础服务'));
})();
