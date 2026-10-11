'use strict';
/**
 * 注册策略与邀请码测试：公网发布后"谁能开账号"的准入规则。
 * 三态：closed（关闭）/ invite（凭邀请码自助注册，默认）/ open（免审自助注册）；
 * 零用户时始终允许免码创建第一个管理员，否则没人能开局。
 */
const path = require('node:path');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'invite_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;
delete process.env.MEDSCALE_LAN;
delete process.env.HOST;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();

(async function run() {
  console.log('\n【1】默认是邀请码模式，但第一个管理员不受限');
  const anon = http.makeClient(srv);
  const s0 = await anon.request('GET', '/api/session');
  t.ok(s0.json.registerMode === 'invite', '新库默认 registerMode=invite', s0.json.registerMode);
  t.ok(s0.json.allowRegister === true, '零用户时 allowRegister 仍为真（能开局）', s0.json.allowRegister);

  const first = await anon.request('POST', '/api/register', { username: 'rootdoc', password: 'pass1234', password2: 'pass1234' });
  t.ok(first.status === 200 && first.json.user.role === 'admin', '零用户免码注册并成为管理员', first.json && first.json.error);

  const s1 = await http.makeClient(srv).request('GET', '/api/session');
  t.ok(s1.json.registerMode === 'invite', '建号之后仍是邀请码模式', s1.json.registerMode);
  t.ok(s1.json.allowRegister === false, '邀请码模式下 allowRegister 为假（免码注册不可用）', s1.json.allowRegister);
  t.ok(s1.json.registerAvailable === true, '邀请码模式下注册入口仍然可见', s1.json.registerAvailable);

  const noCode = await anon.request('POST', '/api/register', { username: 'nocode', password: 'pass1234', password2: 'pass1234' });
  t.ok(noCode.status === 403 && /邀请码/.test(noCode.json.error), '无邀请码被拒且提示要邀请码', noCode.json);
  t.ok(!dbm.findUserByUsername('nocode'), '被拒的注册不会留下账号');

  console.log('\n【2】管理员生成邀请码并可自助开号');
  const admin = http.makeClient(srv);
  await admin.request('POST', '/api/login', { username: 'rootdoc', password: 'pass1234' });
  const mk = await admin.request('POST', '/api/invites', { note: '神内一组', maxUses: 2, validDays: 7 });
  t.ok(mk.status === 200 && mk.json.invite && mk.json.invite.code, '能创建邀请码', mk.json);
  const code = (mk.json.invite || {}).code || '';
  t.ok(/^[A-HJ-NP-Z2-9]{8}$/.test(code), '邀请码是 8 位去歧义大写字母数字', code);
  const inv0 = mk.json.invite || {};
  t.ok(inv0.maxUses === 2 && inv0.used === 0, '初始已用 0 次', inv0);
  t.ok(!!inv0.expiresAt, '带过期时间', inv0.expiresAt);

  const staff = await admin.request('GET', '/api/invites');
  t.ok(staff.status === 200 && (staff.json.items || []).length === 1, '管理员能列出邀请码', staff.json.items && staff.json.items.length);

  // 小写、带空格也要能用：邀请码常被人手抄
  const r2 = await http.makeClient(srv).request('POST', '/api/register',
    { username: 'nurse01', password: 'pass1234', password2: 'pass1234', name: '吴护士', invite: '  ' + code.toLowerCase() + ' ' });
  t.ok(r2.status === 200 && r2.json.user.role === 'user', '大小写与空格不影响使用，注册者默认为研究者', r2.json);

  const nurseCli = http.makeClient(srv);
  const nLogin = await nurseCli.request('POST', '/api/login', { username: 'nurse01', password: 'pass1234' });
  t.ok(nLogin.status === 200, '受邀注册的账号能登录', nLogin.json);
  const notAdmin = await nurseCli.request('GET', '/api/invites');
  t.ok(notAdmin.status === 403, '普通账号不能看邀请码列表', notAdmin.status);
  const forge = await nurseCli.request('POST', '/api/invites', { note: '自己发码', maxUses: 99 });
  t.ok(forge.status === 403, '普通账号不能自己发码', forge.status);
  const after1 = await admin.request('GET', '/api/invites');
  const row1 = (after1.json.items || [])[0] || {};
  t.ok(row1.used === 1 && row1.remaining === 1, '成功注册才计一次', row1);

  const bad = await http.makeClient(srv).request('POST', '/api/register',
    { username: 'hacker01', password: 'pass1234', password2: 'pass1234', invite: 'ZZZZZZZZ' });
  t.ok(bad.status === 403 && /邀请码/.test(bad.json.error), '错码被拒', bad.json);
  const after2 = await admin.request('GET', '/api/invites');
  const row2 = (after2.json.items || [])[0] || {};
  t.ok(row2.used === 1, '失败的注册不消耗次数', row2);

  console.log('\n【3】次数用尽、过期、吊销都要挡住');
  const second = await http.makeClient(srv).request('POST', '/api/register',
    { username: 'nurse02', password: 'pass1234', password2: 'pass1234', invite: code });
  t.ok(second.status === 200, '第二次使用成功', second.json && second.json.error);
  const third = await http.makeClient(srv).request('POST', '/api/register',
    { username: 'nurse03', password: 'pass1234', password2: 'pass1234', invite: code });
  t.ok(third.status === 403 && /用完|已达上限/.test(third.json.error), '超出可用次数被拒', third.json);

  const mk2 = await admin.request('POST', '/api/invites', { note: '过期码', maxUses: 1, validDays: 1 });
  const id2 = (mk2.json.invite || {}).id;
  try {
    dbm.db.prepare('UPDATE invite_codes SET expires_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', id2);
  } catch (e) {
    t.ok(false, '能把邀请码改到已过期（invite_codes 表存在）', e.message);
  }
  const expired = await http.makeClient(srv).request('POST', '/api/register',
    { username: 'late01', password: 'pass1234', password2: 'pass1234', invite: (mk2.json.invite || {}).code });
  t.ok(expired.status === 403 && /过期/.test(expired.json.error), '过期码被拒', expired.json);

  const revoked = await admin.request('PATCH', '/api/invites/' + id2, { revoked: true });
  t.ok(revoked.status === 200 && revoked.json.invite.revoked === true, '管理员可吊销邀请码', revoked.json);
  const mk3 = await admin.request('POST', '/api/invites', { note: '吊销码', maxUses: 1 });
  await admin.request('PATCH', '/api/invites/' + (mk3.json.invite || {}).id, { revoked: true });
  const gone = await http.makeClient(srv).request('POST', '/api/register',
    { username: 'rev01', password: 'pass1234', password2: 'pass1234', invite: (mk3.json.invite || {}).code });
  t.ok(gone.status === 403 && /邀请码/.test(gone.json.error), '吊销后不再可用', gone.json);
  t.ok(!/2020-01-01|已被谁|used/.test(JSON.stringify(gone.json)), '错误信息不回显码的使用情况', JSON.stringify(gone.json));

  console.log('\n【4】三态切换与旧字段兼容');
  const setOpen = await admin.request('POST', '/api/settings', { registerMode: 'open' });
  t.ok(setOpen.status === 200 && setOpen.json.registerMode === 'open', '可切到免审开放', setOpen.json);
  const openReg = await http.makeClient(srv).request('POST', '/api/register', { username: 'openuser1', password: 'pass1234', password2: 'pass1234' });
  t.ok(openReg.status === 200, '开放模式免码可注册', openReg.json && openReg.json.error);
  // 医院共用出口 IP：一次开一批账号不能被同 IP 的额度锁死，所以限流只统计失败
  let okCount = 0;
  for (let i = 2; i <= 8; i += 1) {
    const rr = await http.makeClient(srv).request('POST', '/api/register', { username: 'openuser' + i, password: 'pass1234', password2: 'pass1234' });
    if (rr.status === 200) okCount += 1;
  }
  t.ok(okCount === 7, '同机连续 8 次正常注册全部成功（限流只记失败）', okCount);

  const setClosed = await admin.request('POST', '/api/settings', { registerMode: 'closed' });
  t.ok(setClosed.json.registerMode === 'closed', '可切到完全关闭', setClosed.json);
  const sc = await http.makeClient(srv).request('GET', '/api/session');
  t.ok(sc.json.registerAvailable === false, '关闭模式下前端不再有注册入口', sc.json.registerAvailable);
  const mk4 = await admin.request('POST', '/api/invites', { note: '关闭期', maxUses: 1 });
  const closedReg = await http.makeClient(srv).request('POST', '/api/register',
    { username: "closed01", password: "pass1234", password2: "pass1234", invite: (mk4.json.invite || {}).code });
  t.ok(closedReg.status === 403 && /关闭/.test(closedReg.json.error), '关闭模式下有码也不能注册', closedReg.json);

  const legacy = await admin.request('POST', '/api/settings', { allowRegister: true });
  t.ok(legacy.status === 200 && legacy.json.registerMode === 'open', '旧的 allowRegister:true 映射为 open', legacy.json);
  const legacyOff = await admin.request('POST', '/api/settings', { allowRegister: false });
  t.ok(legacyOff.json.registerMode === 'closed', '旧的 allowRegister:false 映射为 closed', legacyOff.json);
  const bogus = await admin.request('POST', '/api/settings', { registerMode: 'yes-please' });
  t.ok(bogus.status === 400, '非法模式返回 400', bogus.json);
  t.ok(dbm.getSetting('register_mode') === 'closed', '非法值不会改动已生效的设置', dbm.getSetting('register_mode'));

  console.log('\n【5】老库升级：allow_register 决定初始模式');
  dbm.setSetting('register_mode', null);
  dbm.setSetting('allow_register', '1');
  const up1 = await http.makeClient(srv).request('GET', '/api/session');
  t.ok(up1.json.registerMode === 'open', '老库开着注册 → 升级为 open', up1.json.registerMode);
  dbm.setSetting('allow_register', '0');
  const up2 = await http.makeClient(srv).request('GET', '/api/session');
  t.ok(up2.json.registerMode === 'invite', '老库关着注册 → 升级为 invite（仍能凭码开号）', up2.json.registerMode);

  process.exit(t.done('注册与邀请码'));
}()).catch(function (e) {
  console.error('测试异常：', e && e.message);
  process.exit(1);
});
