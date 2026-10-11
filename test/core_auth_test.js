// test/core_auth_test.js
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const ROOT = path.join(__dirname, '..');
const { createSqliteAdapter } = require(path.join(ROOT, 'core/db/sqlite-adapter.js'));
const auth = require(path.join(ROOT, 'core/services/auth.js'));
const users = require(path.join(ROOT, 'core/services/users.js'));
const invites = require(path.join(ROOT, 'core/services/invites.js'));
const own = require(path.join(ROOT, 'core/services/ownership.js'));
const sessions = require(path.join(ROOT, 'core/services/sessions.js'));

function freshDb() {
  const mem = new DatabaseSync(':memory:');
  mem.exec(fs.readFileSync(path.join(ROOT, 'core/schema.sql'), 'utf8'));
  return createSqliteAdapter(mem);
}

(async function () {
  console.log('\n【1】零用户开局：首注册即管理员');
  let db = freshDb();
  t.ok((await auth.registerAvailable(db)) === true, '零用户时注册入口恒开');
  const first = await auth.register(db, { username: 'boss', password: 'Str0ng!pass', ip: '9.9.9.9' });
  t.ok(first.ok && first.user.role === 'admin', '首个用户自动 admin', first);
  t.ok((await users.countUsers(db)) === 1, '首注册后库里有 1 个用户');
  console.log('\n【2】注册三态');
  t.ok((await auth.registerMode(db)) === 'invite', '有用户后默认 invite 模式');
  const denied = await auth.register(db, { username: 'nocode', password: 'Str0ng!pass2' });
  t.ok(denied.ok === false && /邀请码/.test(denied.error), 'invite 模式无码被拒', denied);
  const inv = await invites.createInvite(db, { note: '科室', role: 'user', maxUses: 1, createdBy: first.user.id });
  const bad = await auth.register(db, { username: 'usr2', password: 'Str0ng!pass3', code: 'WRONGCODE' });
  t.ok(bad.ok === false, '错码被拒');
  t.ok((await invites.getInvite(db, inv.id)).used === 0, '注册失败邀请码不被消耗');
  const okReg = await auth.register(db, { username: 'usr2', password: 'Str0ng!pass4', code: inv.code });
  t.ok(okReg.ok && okReg.user.role === 'user', '凭码开号成功');
  t.ok((await invites.getInvite(db, inv.id)).used === 1, '核销计数 +1');
  const again = await auth.register(db, { username: 'usr3', password: 'Str0ng!pass5', code: inv.code });
  t.ok(again.ok === false && /用完/.test(again.error), '超次码被拒', again);
  const { setSetting } = require(path.join(ROOT, 'core/services/settings.js'));
  await setSetting(db, 'register_mode', 'closed');
  t.ok((await auth.registerAvailable(db)) === false, 'closed 且有用户 → 无入口');
  await setSetting(db, 'register_mode', 'open');
  const openReg = await auth.register(db, { username: 'usr4', password: 'Str0ng!pass6' });
  t.ok(openReg.ok, 'open 模式免码注册');

  console.log('\n【3】登录：限流、停用、token');
  const good = await auth.login(db, { username: 'boss', password: 'Str0ng!pass', ip: '1.1.1.1' });
  t.ok(good.ok && /^[0-9a-f]{48}$/.test(good.token), '登录成功发 48hex token', good);
  const s = await sessions.getSession(db, await sessions.sha256Hex(good.token));
  t.ok(s && s.userId === first.user.id, 'session 落库（仅哈希）');
  const wrong = await auth.login(db, { username: 'boss', password: 'bad', ip: '1.1.1.2' });
  t.ok(wrong.ok === false && wrong.status === 401, '错口令 401');
  for (let i = 0; i < 12; i += 1) await auth.login(db, { username: 'boss', password: 'bad', ip: '1.1.1.3' });
  const locked = await auth.login(db, { username: 'boss', password: 'Str0ng!pass', ip: '1.1.1.3' });
  t.ok(locked.ok === false && locked.status === 429, '连错后触发限流 429（正确口令也拒）', locked);
  await users.updateUser(db, first.user.id, { status: 'disabled' });
  const dis = await auth.login(db, { username: 'boss', password: 'Str0ng!pass', ip: '1.1.1.4' });
  t.ok(dis.ok === false, '停用用户拒绝登录');

  console.log('\n【4】归属');
  const viewer = own.viewerOf({ userId: 2, admin: 0 });
  t.ok(own.canView({ ownerId: 2 }, viewer) === true && own.canView({ ownerId: 3 }, viewer) === false, 'canView 按 owner');
  t.ok(own.canView({ ownerId: 3 }, own.viewerOf({ admin: 1 })) === true, 'admin 全见');
  t.ok(own.canEdit({ ownerId: 2, isBuiltin: true }, viewer) === false, '内置量表不可改');

  process.exit(t.done('核心 auth 服务'));
})();
