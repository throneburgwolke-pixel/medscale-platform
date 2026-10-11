'use strict';
/**
 * 管理员口令安全测试：口令必须以 scrypt 哈希存储，任何接口与日志都不得泄露明文，
 * defaultPassword 只能对已登录管理员可见，旧版明文库升级后仍可登录（迁移不锁死用户）。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'auth_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();
const cli = http.makeClient(srv);
const INITIAL_PW = dbm.initialAdminPassword();
const PW_FILE = path.join(path.dirname(DB), '管理员初始口令.txt');

function settingRow(key) {
  return dbm.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
}

(async function run() {
  console.log('\n【1】存储形态：只存哈希，不存明文');
  const legacy = settingRow('admin_password');
  t.ok(!legacy, 'settings 表中不存在明文 admin_password', legacy && legacy.value);
  const hashRow = settingRow('admin_password_hash');
  t.ok(!!hashRow, 'settings 表存在 admin_password_hash');
  const parts = String(hashRow ? hashRow.value : '').split(':');
  t.ok(parts.length === 2 && /^[0-9a-f]{32}$/.test(parts[0]) && /^[0-9a-f]{64}$/.test(parts[1]),
    '哈希为 scrypt 的 salt:hash 格式', hashRow && hashRow.value.slice(0, 40));

  console.log('\n【2】随机生成的初始口令可登录，错误口令被拒');
  t.ok(typeof INITIAL_PW === 'string' && /^[A-HJ-NP-Za-km-np-z2-9]{16}$/.test(INITIAL_PW),
    '首次启动生成了 16 位无易混淆字符的随机口令', INITIAL_PW);
  const bad = await cli.request('POST', '/api/login', { password: 'wrong-password' });
  t.ok(bad.status === 401, '错误管理员密码返回 401', bad.status);
  const okLogin = await cli.request('POST', '/api/login', { password: INITIAL_PW });
  t.ok(okLogin.status === 200, '随机初始口令可登录', okLogin.status);

  console.log('\n【2b】初始口令另存于数据库同目录（0600），改密前可查回');
  t.ok(fs.existsSync(PW_FILE), '口令文件已生成', PW_FILE);
  t.ok(fs.readFileSync(PW_FILE, 'utf8').indexOf(INITIAL_PW) >= 0, '口令文件里是本次生成的口令');
  t.ok((fs.statSync(PW_FILE).mode & 0o777) === 0o600, '口令文件权限是 0600');
  t.ok(settingRow('admin_password_initial') && settingRow('admin_password_initial').value === '1',
    'settings 里有"仍是初始口令"标记');

  console.log('\n【3】/api/session 不向未登录者泄露口令状态');
  const anon = http.makeClient(srv);
  const s0 = await anon.request('GET', '/api/session');
  t.ok(s0.status === 200, '未登录可读取会话信息');
  t.ok(!('defaultPassword' in s0.json), '未登录响应不含 defaultPassword', Object.keys(s0.json));
  t.ok(s0.json.authenticated === false, '未登录标记 authenticated=false');

  console.log('\n【4】管理员可见 defaultPassword 提示');
  const s1 = await cli.request('GET', '/api/session');
  t.ok(s1.json.isAdmin === true, '当前会话是管理员', s1.json.isAdmin);
  t.ok(s1.json.defaultPassword === true, '管理员可见 defaultPassword=true', s1.json.defaultPassword);

  console.log('\n【5】修改口令：旧密码失效、新密码可用、明文不落库');
  const chg = await cli.request('POST', '/api/password', { oldPassword: INITIAL_PW, newPassword: 'S3cret!scale' });
  t.ok(chg.status === 200, '修改密码成功', chg.json);
  t.ok(!settingRow('admin_password'), '修改后仍无明文记录');
  const hashAfter = (settingRow('admin_password_hash') || {}).value || '';
  t.ok(hashAfter !== (hashRow ? hashRow.value : ''), '哈希已更新');
  t.ok(hashAfter.indexOf('5363726574') < 0, '哈希中不含新密码的可见字节');
  const re1 = await http.makeClient(srv).request('POST', '/api/login', { password: INITIAL_PW });
  t.ok(re1.status === 401, '旧初始密码不再可用', re1.status);
  t.ok(!fs.existsSync(PW_FILE), '改密后初始口令文件被自动删除');
  const re2cli = http.makeClient(srv);
  const re2 = await re2cli.request('POST', '/api/login', { password: 'S3cret!scale' });
  t.ok(re2.status === 200, '新密码可登录', re2.status);
  const s2 = await re2cli.request('GET', '/api/session');
  t.ok(s2.json.defaultPassword === false, '改密后管理员可见 defaultPassword=false', s2.json.defaultPassword);

  console.log('\n【6】改密后旧会话全部失效');
  const stale = await cli.request('GET', '/api/session');
  t.ok(stale.json.authenticated === false, '改密前的会话不再有效', stale.json.authenticated);

  console.log('\n【7】旧版明文库升级迁移');
  dbm.setSetting('admin_password', 'legacy-pass-2024');
  dbm.db.prepare('DELETE FROM settings WHERE key = ?').run('admin_password_hash');
  if (typeof dbm.ensureAdminPasswordHash === 'function') dbm.ensureAdminPasswordHash();
  t.ok(typeof dbm.ensureAdminPasswordHash === 'function', 'db 导出 ensureAdminPasswordHash');
  t.ok(typeof dbm.checkAdminPassword === 'function', 'db 导出 checkAdminPassword');
  t.ok(dbm.checkAdminPassword && dbm.checkAdminPassword('legacy-pass-2024') === true, '迁移后旧明文口令仍可用');
  t.ok(dbm.checkAdminPassword && dbm.checkAdminPassword(INITIAL_PW) === false, '迁移后旧初始口令不可用');
  t.ok(!settingRow('admin_password'), '迁移后明文被清除');
  const migrated = (settingRow('admin_password_hash') || {}).value || '';
  t.ok(/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(migrated), '迁移写入合法哈希', migrated.slice(0, 20));

  console.log('\n【7b】哈希损坏时不得抛异常');
  dbm.setSetting('admin_password_hash', 'not-a-valid-hash');
  let threw = null;
  let res7b = null;
  try { res7b = dbm.checkAdminPassword('anything'); } catch (e) { threw = e; }
  t.ok(!threw, '损坏哈希不抛异常', threw && threw.message);
  t.ok(res7b === false, '损坏哈希判定为不可用');
  dbm.setSetting('admin_password_hash', migrated);

  console.log('\n【8】启动日志不打印口令');
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t.ok(!/管理员密码：\s*' \+ dbm\.getSetting/.test(src), 'announce 不再拼接口令值');
  t.ok(!src.includes("getSetting('admin_password',"), 'server.js 不再读取明文 admin_password 设置');

  process.exit(t.done('管理员口令安全'));
})();
