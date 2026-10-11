'use strict';
/**
 * 并发与多进程测试：会话与限流计数落库（换进程、开多 worker 都认同一份状态）、
 * 写锁等待与重试、临时文件不互相覆盖。公网发布后这些是"能不能同时服务多人"的地基。
 */
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'cluster_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const parse = require(path.join(ROOT, 'lib/parse.js'));
const t = http.makeCounter();

const sha = function (s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); };
const tokenOf = function (cookie) { return (/msid=([^;]+)/.exec(cookie || '') || [])[1] || ''; };

(async function run() {
  console.log('\n【1】会话落在数据库里，进程重启也不掉线');
  const anon = http.makeClient(srv);
  const reg = await anon.request('POST', '/api/register', { username: 'lead', password: 'pass1234', password2: 'pass1234' });
  t.ok(reg.status === 200, '首个管理员注册成功', reg.json);
  const raw = tokenOf(anon.cookieStore.value);
  t.ok(!!raw, '注册后拿到会话 token', anon.cookieStore.value);
  const rows = dbm.db.prepare('SELECT * FROM sessions').all();
  t.ok(rows.length === 1, '会话写进了 sessions 表', rows.length);
  const stored = rows[0] || {};
  t.ok(/^[0-9a-f]{64}$/.test(stored.token_hash || ''), '库里只存 token 的哈希，不存明文', stored.token_hash);
  t.ok(stored.token_hash !== raw && stored.token_hash === sha(raw), '哈希可核对但不可反推');
  t.ok(!!stored.expires_at, '会话带过期时间', stored.expires_at);

  const got = srv.sessionStore.get(raw);
  t.ok(got && got.userId, 'sessionStore 按 token 取回会话', got);
  t.ok(srv.sessionStore.get('not-a-real-token') === null, '乱码 token 取不到会话');

  const s2 = await anon.request('GET', '/api/session');
  t.ok(s2.json.authenticated === true, '带 cookie 的请求被认出来', s2.json.authenticated);
  dbm.db.prepare('UPDATE sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z');
  const s3 = await anon.request('GET', '/api/session');
  t.ok(s3.json.authenticated !== true, '过期会话立即失效', s3.json.authenticated);
  t.ok(dbm.db.prepare('SELECT COUNT(*) c FROM sessions').get().c === 0, '取到过期会话时顺手清掉');

  console.log('\n【2】退出登录与停用账号都会吊销会话');
  await anon.request('POST', '/api/login', { username: 'lead', password: 'pass1234' });
  const invite = await anon.request('POST', '/api/invites', { note: '测试建号', maxUses: 2 });
  t.ok(invite.status === 200, '管理员生成一张邀请码', invite.json);
  const code = ((invite.json.invite || {}).code || '');

  const staff = http.makeClient(srv);
  const st = await staff.request('POST', '/api/register', { username: 'nurse', password: 'pass1234', password2: 'pass1234', invite: code });
  t.ok(st.status === 200, '凭邀请码开出普通账号', st.json);
  const nurseToken = tokenOf(staff.cookieStore.value);
  const who = await staff.request('GET', '/api/session');
  t.ok(who.json.user && who.json.user.username === 'nurse', '会话指向本人', who.json.user);

  const nurseId = (st.json.user || {}).id;
  await anon.request('PATCH', '/api/users/' + nurseId, { role: 'admin' });
  const promoted = await staff.request('GET', '/api/invites');
  t.ok(promoted.status === 200, '升为管理员后当前会话立刻有权限', promoted.status);
  await anon.request('PATCH', '/api/users/' + nurseId, { role: 'user' });
  const demoted = await staff.request('GET', '/api/invites');
  t.ok(demoted.status === 403, '降回普通用户后，旧会话不会靠登录时的快照继续当管理员', demoted.status);

  await staff.request('POST', '/api/logout', {});
  const afterOut = await staff.request('GET', '/api/session');
  t.ok(afterOut.json.authenticated !== true, '退出后会话作废', afterOut.json.authenticated);
  t.ok(!dbm.db.prepare('SELECT token_hash FROM sessions WHERE token_hash = ?').get(sha(nurseToken)),
    '退出时库里的行被删掉');
  t.ok(srv.sessionStore.get(nurseToken) === null, '退出的 token 再也换不回会话');

  const again = http.makeClient(srv);
  await again.request('POST', '/api/login', { username: 'nurse', password: 'pass1234' });
  const off = await anon.request('PATCH', '/api/users/' + nurseId, { status: 'disabled' });
  t.ok(off.status === 200, '管理员停用账号', off.json);
  const kicked = await again.request('GET', '/api/session');
  t.ok(kicked.json.authenticated !== true, '被停用的账号立刻掉线', kicked.json.authenticated);
  const blocked = await again.request('POST', '/api/login', { username: 'nurse', password: 'pass1234' });
  t.ok(blocked.status === 403, '停用后无法再登录', blocked.status);

  console.log('\n【3】限流计数落库，多进程共用同一份');
  const key = 'login|127.0.0.1|u:ghost';
  t.ok(srv.dbLimit(key, 3, 60000).allowed === true, '首次放行');
  srv.dbLimit(key, 3, 60000);
  const third = srv.dbLimit(key, 3, 60000);
  t.ok(third.allowed === true, '窗口内第 3 次仍放行', third);
  const fourth = srv.dbLimit(key, 3, 60000);
  t.ok(fourth.allowed === false && fourth.retryAfterSec > 0, '第 4 次被挡住并给出等待时间', fourth);
  t.ok(!!dbm.db.prepare('SELECT key FROM rate_limits WHERE key = ?').get(key), '计数写进了 rate_limits 表');
  // 另一个进程已经把它打满：本进程必须读到同一份计数
  dbm.db.prepare('UPDATE rate_limits SET n = 9 WHERE key = ?').run(key);
  t.ok(srv.dbLimit(key, 3, 60000).allowed === false, '跨进程读到同一份失败计数');
  srv.dbLimit.reset(key);
  t.ok(!dbm.db.prepare('SELECT key FROM rate_limits WHERE key = ?').get(key), '清零会删掉行');
  t.ok(srv.dbLimit(key, 3, 60000).allowed === true, '清零后重新放行');
  t.ok(srv.dbLimit('other-key', 1, 60000).allowed === true && srv.dbLimit('other-key', 1, 60000).allowed === false,
    '不同 key 互不影响');
  t.ok(srv.dbLimit('expired-window', 1, -1).allowed === true, '窗口过期后重新计数');

  console.log('\n【4】写锁等待与重试');
  const wait = dbm.db.prepare('PRAGMA busy_timeout').get().timeout;
  t.ok(Number(wait) >= 3000, '开启 WAL 后设置 busy_timeout，多进程写不会立刻报错', wait);
  let calls = 0;
  const value = dbm.withWriteRetry(function () {
    calls += 1;
    if (calls < 3) { const e = new Error('database is locked'); e.errstr = 'database is locked'; throw e; }
    return 'done';
  });
  t.ok(value === 'done' && calls === 3, '遇到写锁时重试到成功', calls);
  let other = 0;
  try {
    dbm.withWriteRetry(function () { other += 1; throw new Error('约束不满足'); });
  } catch (e) {
    t.ok(/约束不满足/.test(e.message), '非写锁错误不重试，直接抛出');
  }
  t.ok(other === 1, '普通错误只执行一次', other);

  console.log('\n【5】多进程开关与运行地址文件');
  t.ok(srv.resolveWorkers({}) === 1, '默认单进程（不设环境变量时行为不变）', srv.resolveWorkers({}));
  t.ok(srv.resolveWorkers({ MEDSCALE_WORKERS: '0' }) === 1, 'MEDSCALE_WORKERS=0 仍是单进程');
  t.ok(srv.resolveWorkers({ MEDSCALE_WORKERS: '4' }) === 4, '可指定 4 个 worker');
  t.ok(srv.resolveWorkers({ MEDSCALE_WORKERS: 'max' }) === require('node:os').cpus().length, 'max 按 CPU 核数');
  t.ok(srv.resolveWorkers({ MEDSCALE_WORKERS: 'many' }) === 1, '非法值退回单进程');
  t.ok(srv.resolveWorkers({ MEDSCALE_WORKERS: '999' }) <= 16, '数量有上限，防止误配把机器打满');
  t.ok(srv.writesPortFile(true) === true && srv.writesPortFile(false) === false, '只有主进程写运行地址文件');

  console.log('\n【6】临时文件名带随机后缀，并发请求不互相覆盖');
  // 先清掉以前中断运行留下的 .tmp（临时文件是正式备份的硬链接，历史残留不影响数据），
  // 让下面的断言精确表达"本次备份过程不留临时文件"。
  require('node:fs').readdirSync(dbm.backupDir).forEach(function (f) {
    if (/\.tmp$/.test(f)) { try { require('node:fs').unlinkSync(require('node:path').join(dbm.backupDir, f)); } catch (e) { /* ignore */ } }
  });
  const p1 = parse.ocrTempPath('png');
  const p2 = parse.ocrTempPath('png');
  t.ok(p1 !== p2, '同一毫秒内的两次上传用不同临时文件', p1 + ' / ' + p2);
  t.ok(/medscale_ocr_/.test(p1) && /\.png$/.test(p1), '临时文件仍按扩展名区分类型', p1);
  const b1 = await anon.request('POST', '/api/backup', {});
  const b2 = await anon.request('POST', '/api/backup', {});
  t.ok(b1.status === 200 && b2.status === 200 && b1.json.name !== b2.json.name, '同一秒内可生成两份备份', [b1.json, b2.json]);
  t.ok(!require('node:fs').readdirSync(dbm.backupDir).some(function (f) { return /\.tmp$/.test(f); }),
    '备份过程不留临时文件');

  process.exit(t.done('并发与多进程'));
}()).catch(function (e) {
  console.error('测试异常：', e && e.stack || e);
  process.exit(1);
});
