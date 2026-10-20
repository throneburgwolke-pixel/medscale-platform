'use strict';
/**
 * 管理员口令接口守卫。
 * 原缺陷：POST /api/password 只要求「已登录」，任何普通研究者都能在线无限次爆破
 * 全局管理员口令，成功后即可读取全部受试者数据。此路由也不是前端会调用的接口。
 */
const path = require('node:path');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'admin_password_guard_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();
const INITIAL = dbm.initialAdminPassword();

(async function run() {
  console.log('\n【1】注册首个管理员，再开放注册一个普通研究者');
  const admin = http.makeClient(srv);
  const signup = await admin.request('POST', '/api/register', { username: 'admin_t', password: 'adminpass123' });
  t.ok(signup.status === 200, '首个注册用户成功', signup.status);
  t.ok(signup.json && signup.json.user && signup.json.user.role === 'admin', '首个用户成为管理员', signup.json && signup.json.user && signup.json.user.role);

  dbm.setSetting('register_mode', 'open');
  const user = http.makeClient(srv);
  const reg = await user.request('POST', '/api/register', { username: 'researcher_a', password: 'userpass123' });
  t.ok(reg.status === 200, '普通研究者注册成功', reg.status);
  t.ok(reg.json && reg.json.user && reg.json.user.role === 'user', '该账号角色是 user', reg.json && reg.json.user && reg.json.user.role);

  console.log('\n【2】非管理员改全局管理员口令必须被拒');
  const evil = await user.request('POST', '/api/password', { oldPassword: INITIAL, newPassword: 'hackedpass' });
  t.ok(evil.status === 403, '非管理员调用 → 403（原返回 200 并真的改了口令）', evil.status);
  t.ok(dbm.checkAdminPassword(INITIAL) === true, '管理员原口令仍然有效');
  t.ok(dbm.checkAdminPassword('hackedpass') === false, '攻击者设置的口令没有生效');

  console.log('\n【3】管理员自己改密仍可用');
  const good = await admin.request('POST', '/api/password', { oldPassword: INITIAL, newPassword: 'newadminpass' });
  t.ok(good.status === 200, '管理员改密返回 200', good.status);
  t.ok(dbm.checkAdminPassword('newadminpass') === true, '新口令生效');
  t.ok(dbm.checkAdminPassword(INITIAL) === false, '旧口令失效');

  console.log('\n【4】错误原口令有限流，不能无限试');
  const relogin = await admin.request('POST', '/api/login', { password: 'newadminpass' });
  t.ok(relogin.status === 200, '管理员用新口令重新登录', relogin.status);
  let saw429 = false;
  let lastStatus = 0;
  for (let i = 0; i < 15; i += 1) {
    const r = await admin.request('POST', '/api/password', { oldPassword: 'wrong-' + i, newPassword: 'whatever123' });
    lastStatus = r.status;
    if (r.status === 429) { saw429 = true; break; }
    if (r.status === 403) break;
  }
  t.ok(saw429, '连续错误原口令后返回 429（原无任何限流）', lastStatus);
  t.ok(dbm.checkAdminPassword('newadminpass') === true, '限流期间口令未被改动');

  process.exit(t.done('管理员口令接口守卫'));
})();
