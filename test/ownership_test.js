'use strict';
/**
 * 数据归属与权限测试：量表 / 调查 / 随访研究必须按创建者隔离，
 * 内置模板与旧共享数据仍对所有人可读，管理员可读写全部。
 */
const path = require('node:path');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'ownership_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();

async function register(username) {
  const c = http.makeClient(srv);
  const r = await c.request('POST', '/api/register', { username: username, password: 'pass123456', password2: 'pass123456' });
  return { client: c, user: r.json && r.json.user, status: r.status };
}

const MINIMAL_SCALE = {
  title: '测试自建量表', code: 'own-test-1', category: '未分类',
  definition: { items: [{ id: 'q1', type: 'single', label: '题目一', options: [{ label: '是', score: 1 }, { label: '否', score: 0 }] }] },
};

function makeScale(name) {
  return Object.assign({}, MINIMAL_SCALE, { title: name, code: 'own-' + name });
}

function idOf(res) {
  const j = res.json || {};
  return j.id || (j.study || {}).id || (j.survey || {}).id;
}

(async function run() {
  console.log('\n【0】准备两个研究者账号');
  const root = http.makeClient(srv);
  await root.request('POST', '/api/register', { username: 'root', password: 'pass123456', password2: 'pass123456' });
  await root.request('POST', '/api/settings', { allowRegister: true });
  const a = await register('dr_a');
  const b = await register('dr_b');
  t.ok(a.status === 200 && b.status === 200 && a.user.role === 'user' && b.user.role === 'user', '两个普通用户注册成功', [a.user, b.user]);

  console.log('\n【1】量表归属');
  const created = await a.client.request('POST', '/api/scales', { scale: MINIMAL_SCALE });
  t.ok(created.status === 200, 'A 创建量表成功', created.status);
  const scaleId = idOf(created);
  t.ok(created.json && created.json.ownerId === a.user.id, '新量表记录了 ownerId', created.json && created.json.ownerId);

  const listA = await a.client.request('GET', '/api/scales');
  const listB = await b.client.request('GET', '/api/scales');
  const itemsA = (listA.json || {}).items || [];
  const itemsB = (listB.json || {}).items || [];
  t.ok(itemsA.some(function (s) { return s.id === scaleId; }), 'A 的列表含自己的量表');
  t.ok(!itemsB.some(function (s) { return s.id === scaleId; }), 'B 的列表不含 A 的自建量表');
  t.ok(itemsB.length > 0, 'B 仍能看到内置模板', itemsB.length);
  const builtin = itemsB.filter(function (s) { return !s.isBuiltin && !s.isTemplate; });
  t.ok(builtin.length === 0, 'B 看到的非模板量表数为 0', builtin.map(function (s) { return s.title; }));

  console.log('\n【2】跨用户读写被拒');
  const put = await b.client.request('PUT', '/api/scales/' + scaleId, { title: 'B 篡改' });
  t.ok(put.status === 403, 'B 修改 A 的量表被拒', put.status);
  const getB = await b.client.request('GET', '/api/scales/' + scaleId);
  t.ok(getB.status === 403 || getB.status === 404, 'B 读取 A 的量表被拒', getB.status);
  const copyB = await b.client.request('POST', '/api/scales', { fromTemplateId: scaleId });
  t.ok(copyB.status === 403 || copyB.status === 404, 'B 无法从 A 的量表创建副本', copyB.status);
  const putA = await a.client.request('PUT', '/api/scales/' + scaleId, { title: 'A 自己改' });
  t.ok(putA.status === 200, 'A 可修改自己的量表', putA.status);

  const throwaway = await a.client.request('POST', '/api/scales', { scale: makeScale('待删量表') });
  const bDel = await b.client.request('DELETE', '/api/scales/' + idOf(throwaway));
  t.ok(bDel.status === 403, 'B 删除 A 的量表被拒', bDel.status);
  const stillThere = await a.client.request('GET', '/api/scales/' + idOf(throwaway));
  t.ok(stillThere.status === 200, '越权删除后量表仍在', stillThere.status);
  const aDel = await a.client.request('DELETE', '/api/scales/' + idOf(throwaway));
  t.ok(aDel.status === 200, 'A 可删除自己的量表', aDel.status);

  console.log('\n【3】管理员可见并可改全部');
  const listRoot = await root.request('GET', '/api/scales');
  const itemsRoot = (listRoot.json || {}).items || [];
  t.ok(itemsRoot.some(function (s) { return s.id === scaleId; }), '管理员列表含他人量表');
  const putRoot = await root.request('PUT', '/api/scales/' + scaleId, { title: '管理员修订' });
  t.ok(putRoot.status === 200, '管理员可修改他人量表', putRoot.status);

  console.log('\n【4】调查隔离');
  const surveyA = await a.client.request('POST', '/api/surveys', { scaleId: scaleId, name: 'A 的调查' });
  t.ok(surveyA.status === 200, 'A 创建调查', surveyA.status);
  const surveyId = idOf(surveyA);
  t.ok(surveyA.json && surveyA.json.ownerId === a.user.id, '调查记录 ownerId', surveyA.json && surveyA.json.ownerId);
  const sListB = await b.client.request('GET', '/api/surveys');
  t.ok(!((sListB.json || {}).items || []).some(function (s) { return s.id === surveyId; }), 'B 的调查列表不含 A 的调查');
  const sPatch = await b.client.request('PATCH', '/api/surveys/' + surveyId, { name: 'B 改名' });
  t.ok(sPatch.status === 403, 'B 修改 A 的调查被拒', sPatch.status);
  const sReport = await b.client.request('GET', '/api/surveys/' + surveyId + '/report');
  t.ok(sReport.status === 403, 'B 读取 A 的调查统计被拒', sReport.status);
  const sExport = await b.client.request('GET', '/api/surveys/' + surveyId + '/export.csv');
  t.ok(sExport.status === 403, 'B 导出 A 的数据被拒', sExport.status);

  console.log('\n【5】公开填写入口不受归属限制');
  const token = (surveyA.json || {}).token;
  const pub = await http.makeClient(srv).request('GET', '/api/join/' + token);
  t.ok(pub.status === 200, '匿名者可访问填写页数据', pub.status);
  const anonReport = await http.makeClient(srv).request('GET', '/api/surveys/' + surveyId + '/report');
  t.ok(anonReport.status === 401, '未登录者读不到统计报告', anonReport.status);

  console.log('\n【6】随访研究隔离');
  const studyA = await a.client.request('POST', '/api/studies', { scaleId: scaleId, name: 'A 的随访', waves: [{ label: '基线' }] });
  t.ok(studyA.status === 200, 'A 创建随访研究', studyA.status);
  const studyId = idOf(studyA);
  const stListB = await b.client.request('GET', '/api/studies');
  t.ok(!((stListB.json || {}).items || []).some(function (s) { return s.id === studyId; }), 'B 看不到 A 的随访研究');
  const stDel = await b.client.request('DELETE', '/api/studies/' + studyId);
  t.ok(stDel.status === 403, 'B 删除 A 的随访研究被拒', stDel.status);

  console.log('\n【7】无归属的旧数据：默认收紧，只对管理员可见');
  // 语义变更说明：以前「无归属 = 人人可读」是为了兼容 owner 迁移之前的数据。
  // 但答卷里可能有 IP、受试者编号等可识别信息，归属不明的数据默认收紧才是安全的
  // 默认值——现在只有管理员能看，其他人一律 403。隐私侧的完整出口覆盖见 privacy_test.js。
  let owned = null;
  try {
    dbm.db.prepare('UPDATE scales SET owner_id = NULL WHERE id = ?').run(scaleId);
    owned = true;
  } catch (e) {
    t.ok(false, 'scales 表缺少 owner_id 列: ' + e.message);
  }
  if (owned) {
    const legacyView = await b.client.request('GET', '/api/scales/' + scaleId);
    t.ok(legacyView.status === 403, '无归属的旧数据不再对其他账号可见', legacyView.status);
    const legacyWrite = await b.client.request('PUT', '/api/scales/' + scaleId, { title: 'B 改旧数据' });
    t.ok(legacyWrite.status === 403, '无归属的旧数据只有管理员可改', legacyWrite.status);
    const legacyRoot = await root.request('PUT', '/api/scales/' + scaleId, { title: '管理员接管' });
    t.ok(legacyRoot.status === 200, '管理员可见并可改无归属数据', legacyRoot.status);
  }

  process.exit(t.done('数据归属与权限'));
})();
