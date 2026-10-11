'use strict';
/**
 * 隐私隔离回归测试：每个注册账号产生的信息与数据互不可见。
 *
 * 与 ownership_test.js 的分工：那边覆盖「有归属」数据的基本隔离，
 * 这里专攻两类更容易被忽略的泄露面——
 *   1. 没有归属的数据（owner 迁移前的历史遗留、管理员口令会话所建）；
 *   2. 一条数据的**所有**出口（详情 / 答卷 / 报告 / 四种导出 / 二维码链接）是否都堵上了。
 *
 * 语义（server.js 的 canView）：
 *   管理员 > 全部；量表库模板（不含答卷数据）> 所有人；其余一律归属到账号，
 *   没有归属的只对管理员可见。
 */
const path = require('node:path');

process.env.MEDSCALE_DB = path.join(__dirname, 'privacy_test.db');
process.env.MEDSCALE_PASSWORD = 'Privacy!Test#2026';

const { freshDb, makeClient, makeCounter } = require('./helpers/http.js');
const t = makeCounter();
freshDb(process.env.MEDSCALE_DB);
const srv = require('../server.js');

const root = makeClient(srv);      // 第一个注册的用户 → 管理员
const yi = makeClient(srv);        // 普通用户 乙
const bing = makeClient(srv);      // 普通用户 丙
const pw = makeClient(srv);        // 管理员口令登录（会话里没有 userId）
const anon = makeClient(srv);      // 从未登录

const ADMIN_PW = process.env.MEDSCALE_PASSWORD;

async function main() {
  console.log('\n【0】准备账号：首个注册者为管理员，另开两个普通账号');
  let r = await root.request('POST', '/api/register', { username: 'root_admin', password: 'root123456' });
  t.ok(r.status === 200, '首个账号注册成功并成为管理员', r.status + ' ' + r.text.slice(0, 80));

  r = await root.request('POST', '/api/invites', { note: '给乙', role: 'user', maxUses: 1 });
  t.ok(r.status === 200 && r.json.invite.code, '管理员能生成邀请码');
  r = await yi.request('POST', '/api/register', { username: 'user_yi', password: 'yi123456', invite: r.json.invite.code });
  t.ok(r.status === 200, '乙凭邀请码注册成功', r.status);

  r = await root.request('POST', '/api/invites', { note: '给丙', role: 'user', maxUses: 1 });
  r = await bing.request('POST', '/api/register', { username: 'user_bing', password: 'bing123456', invite: r.json.invite.code });
  t.ok(r.status === 200, '丙凭邀请码注册成功', r.status);

  r = await pw.request('POST', '/api/login', { password: ADMIN_PW });
  t.ok(r.status === 200, '管理员口令能登录（这种会话里没有 userId）', r.status);

  // 拿一个内置模板当题库
  r = await yi.request('GET', '/api/scales');
  const scales = (r.json && r.json.items) || [];
  const tpl = scales.find(function (s) { return s.isTemplate || s.isBuiltin; });
  t.ok(!!tpl, '普通用户仍能看到量表库模板（题库本就共享，不含答卷）', scales.length + ' 个里挑模板');

  async function makeSurvey(client, name) {
    const c = await client.request('POST', '/api/surveys', { scaleId: tpl.id, name: name, showResult: true });
    return c.json;
  }
  async function fill(survey, pid) {
    const def = survey.scale.definition;
    const ans = {};
    def.items.forEach(function (it, i) {
      if (it.options && it.options.length) ans[it.id] = it.options[Math.min(it.options.length - 1, i % 2)].value;
      else ans[it.id] = 1;
    });
    return anon.request('POST', '/api/join/' + survey.token, { answers: ans, consent: true, durationSec: 60, pid: pid });
  }

  console.log('\n【1】管理员口令会话建的数据：注册账号看不到');
  const sPw = await makeSurvey(pw, '__口令会话建的调查__');
  t.ok(!!sPw && !!sPw.id, '口令会话能建调查');
  t.ok(sPw.ownerId === null || sPw.ownerId === undefined,
    '口令会话没有 userId，所以这份调查没有归属（这正是要堵的口子）', String(sPw.ownerId));

  r = await yi.request('GET', '/api/surveys');
  t.ok(!((r.json.items || []).some(function (s) { return s.id === sPw.id; })),
    '乙的调查列表里没有口令会话建的调查');
  r = await yi.request('GET', '/api/surveys/' + sPw.id);
  t.ok(r.status === 403, '乙直接读该调查 → 403', r.status);
  r = await bing.request('GET', '/api/surveys/' + sPw.id);
  t.ok(r.status === 403, '丙直接读该调查 → 403', r.status);
  r = await anon.request('GET', '/api/surveys/' + sPw.id);
  t.ok(r.status === 401 || r.status === 403, '未登录读该调查被拒', r.status);

  console.log('\n【2】口令会话那份数据的每个出口都堵上（先灌一份答卷）');
  const asAdmin = await root.request('GET', '/api/surveys/' + sPw.id);
  t.ok(asAdmin.status === 200, '管理员账号能读无归属数据（保留处置权）', asAdmin.status);
  const full = asAdmin.json;
  const fr = await fill(full, 'PW001');
  t.ok(fr.status === 200, '匿名者仍能通过填写链接提交（公开填写入口不受归属限制）', fr.status);

  const exits = [
    ['报告', '/api/surveys/' + sPw.id + '/report'],
    ['CSV 导出', '/api/surveys/' + sPw.id + '/export.csv'],
    ['JSON 导出', '/api/surveys/' + sPw.id + '/export.json'],
    ['SPSS 导出', '/api/surveys/' + sPw.id + '/export-spss.csv'],
    ['变量说明', '/api/surveys/' + sPw.id + '/codebook.csv'],
    ['单份答卷', '/api/surveys/' + sPw.id + '/response/PW001'],
  ];
  for (const [label, url] of exits) {
    const a = await yi.request('GET', url);
    t.ok(a.status === 403, '乙读「' + label + '」→ 403', a.status);
    const b = await anon.request('GET', url);
    t.ok(b.status === 401 || b.status === 403, '未登录读「' + label + '」被拒', b.status);
  }
  const ok = await pw.request('GET', exits[0][1]);
  t.ok(ok.status === 200, '建它的那个管理员口令会话自己仍能读', ok.status);

  console.log('\n【3】普通用户之间的隔离（答卷与全部导出口）');
  const sYiRaw = await makeSurvey(yi, '__乙的调查__');
  const sYi = (await yi.request('GET', '/api/surveys/' + sYiRaw.id)).json;
  await fill(sYi, 'YI001');
  r = await bing.request('GET', '/api/surveys');
  t.ok(!((r.json.items || []).some(function (s) { return s.id === sYi.id; })), '丙的列表里没有乙的调查');
  for (const [label, url] of exits.map(function (e) { return [e[0], e[1].replace(String(sPw.id), String(sYi.id)).replace('PW001', 'YI001')]; })) {
    const a = await bing.request('GET', url);
    t.ok(a.status === 403, '丙读乙的「' + label + '」→ 403', a.status);
  }
  const own = await yi.request('GET', '/api/surveys/' + sYi.id + '/report');
  t.ok(own.status === 200, '乙自己能读自己的报告', own.status);

  console.log('\n【4】自建量表不出现在公开目录');
  r = await yi.request('GET', '/api/public/scales');
  const pubBefore = (r.json.items || []).length;
  const c = await yi.request('POST', '/api/scales', { scale: { title: '乙的内部量表', code: '', items: [], definition: { items: [], dimensions: [], scoring: { method: 'none' } } } });
  t.ok(c.status === 200, '乙能建自建量表', c.status);
  r = await anon.request('GET', '/api/public/scales');
  const pubAfter = (r.json.items || []).map(function (s) { return s.title; });
  t.ok((r.json.items || []).length === pubBefore, '未登录访客看到的公开量表数量不变（自建的不进公开目录）',
    pubBefore + ' → ' + (r.json.items || []).length);
  t.ok(!pubAfter.some(function (x) { return /乙的内部量表/.test(x); }), '公开目录里没有乙的自建量表');
  r = await bing.request('GET', '/api/scales');
  t.ok(!((r.json.items || []).some(function (s) { return s.title === '乙的内部量表'; })), '丙的量表列表里也没有乙的自建量表');

  console.log('\n【5】随访研究同样只归属创建者');
  const st = await pw.request('POST', '/api/studies', { scaleId: tpl.id, name: '__口令会话的随访__', waves: [{ label: '基线' }] });
  t.ok(st.status === 200, '口令会话能建随访研究', st.status);
  const stId = st.json.study.id;
  r = await yi.request('GET', '/api/studies');
  t.ok(!((r.json.items || []).some(function (s) { return s.id === stId; })), '乙的随访列表里没有它');
  r = await yi.request('GET', '/api/studies/' + stId);
  t.ok(r.status === 403, '乙读该随访 → 403', r.status);
  r = await yi.request('GET', '/api/studies/' + stId + '/report');
  t.ok(r.status === 403, '乙读该随访报告 → 403', r.status);
  r = await yi.request('GET', '/api/studies/' + stId + '/export-wide.csv');
  t.ok(r.status === 403, '乙读该随访宽表导出 → 403', r.status);
  r = await yi.request('DELETE', '/api/studies/' + stId);
  t.ok(r.status === 403, '乙删除该随访被拒', r.status);
  r = await bing.request('GET', '/api/studies/' + stId + '/export-wide.csv');
  t.ok(r.status === 403, '丙读该随访宽表导出 → 403', r.status);

  console.log('\n【6】历史遗留的无归属数据：默认收紧为仅管理员可见');
  // 直接往库里塞一条无归属调查，模拟 owner 迁移之前留下的数据
  const dbm = require('../lib/db.js');
  const legacy = dbm.createSurvey(tpl.id, { name: '__迁移前遗留调查__', ownerId: null });
  r = await yi.request('GET', '/api/surveys');
  t.ok(!((r.json.items || []).some(function (s) { return s.id === legacy.id; })), '乙看不到迁移前的遗留调查');
  r = await bing.request('GET', '/api/surveys/' + legacy.id + '/report');
  t.ok(r.status === 403, '丙读遗留调查报告 → 403', r.status);
  r = await root.request('GET', '/api/surveys');
  t.ok((r.json.items || []).some(function (s) { return s.id === legacy.id; }), '管理员仍能看到遗留数据（负责清理/认领）');

  console.log('\n【7】不存在「改归属」的后门');
  const hack = await bing.request('PATCH', '/api/surveys/' + sYi.id, { ownerId: bing === yi ? null : 1, note: 'x' });
  t.ok(hack.status === 403, '丙改乙的调查被拒', hack.status);
  const selfHack = await yi.request('PATCH', '/api/surveys/' + sYi.id, { ownerId: 999 });
  const after = await yi.request('GET', '/api/surveys/' + sYi.id);
  t.ok(after.status === 200 && (after.json.ownerId === yi.cookieStore.value ? true : true) &&
    String(after.json.ownerId) !== '999', '创建者自己也改不了归属字段', String(after.json.ownerId));

  return t.done('隐私隔离');
}

main().then(function (fail) {
  process.exitCode = fail ? 1 : 0;
  try { require('../lib/db.js').db.close(); } catch (e) { /* ignore */ }
}).catch(function (e) {
  console.error('测试异常：', e && e.stack || e);
  process.exit(1);
});
