'use strict';
/**
 * 发布守卫：正文待填的量表不能发布成调查或随访研究；
 * 评估者量表即使不开启「显示结果」，提交后也要返回评分。
 */
const path = require('node:path');
const http = require('./helpers/http.js');
const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'publish_guard_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;
const srv = require(path.join(ROOT, 'server.js'));
const K = require(path.join(ROOT, 'lib', 'scale-kit.js'));
const t = http.makeCounter();

(async function run() {
  const c = http.makeClient(srv);
  await c.request('POST', '/api/register', { username: 'guard_admin', password: 'pass123456', password2: 'pass123456' });

  const pending = K.numbered([K.pendingQ('g1', 1, [0, 1, 2]), K.pendingQ('g2', 2, [0, 1, 2])]);
  const mk = await c.request('POST', '/api/scales', { scale: {
    title: '待填测试', category: '情绪与心理', licenseTier: 'commercial',
    definition: { items: pending, dimensions: [{ id: 'total', name: '总分', items: ['g1', 'g2'] }], scoring: { method: 'sum' } },
  } });
  t.ok(mk.status === 200, '创建带占位条目的量表', mk.json);
  const sid = mk.json.id;

  console.log('\n【1】两个发布入口都拦截');
  const s1 = await c.request('POST', '/api/surveys', { scaleId: sid, name: 'x' });
  t.ok(s1.status === 400 && /还有 2 道题待填入授权文本/.test(s1.json.error), '/api/surveys 拒绝并说明数量', s1.json);
  const st1 = await c.request('POST', '/api/studies', { scaleId: sid, name: 'y', waves: [{ label: '基线' }] });
  t.ok(st1.status === 400 && /待填入授权文本/.test(st1.json.error), '/api/studies 同样拒绝', st1.json);

  console.log('\n【2】只填题干不够，全部填完才放行');
  const def = mk.json.definition;
  const halfItems = def.items.map((it) => Object.assign({}, it, { text: '已填题干 ' + it.id }));
  await c.request('PUT', '/api/scales/' + sid, Object.assign({}, mk.json, { definition: Object.assign({}, def, { items: halfItems }) }));
  const s2 = await c.request('POST', '/api/surveys', { scaleId: sid, name: 'x' });
  t.ok(s2.status === 400 && /还有 2 道题/.test(s2.json.error), '选项仍是占位 → 仍拒绝', s2.json);
  const fullItems = halfItems.map((it) => Object.assign({}, it, { options: it.options.map((o) => ({ label: '已填 ' + o.value, value: o.value })) }));
  await c.request('PUT', '/api/scales/' + sid, Object.assign({}, mk.json, { definition: Object.assign({}, def, { items: fullItems }) }));
  const s3 = await c.request('POST', '/api/surveys', { scaleId: sid, name: 'x' });
  t.ok(s3.status === 200 && !!s3.json.token, '全部填完 → 可以发布', s3.json);

  console.log('\n【3】评估者量表：未开启「显示结果」也返回评分');
  const rater = await c.request('POST', '/api/scales', { scale: {
    title: '评估者测试', category: '临床风险评分', rater: 'clinician',
    definition: { items: K.numbered([K.q('r1', '项目一', 'radio', [{ label: '有', value: 1 }, { label: '无', value: 0 }])]),
      dimensions: [{ id: 'total', name: '总分', items: ['r1'] }], scoring: { method: 'sum' } },
  } });
  t.ok(rater.status === 200, '创建评估者量表', rater.json);
  const sv = await c.request('POST', '/api/surveys', { scaleId: rater.json.id, name: '评估', showResult: false });
  t.ok(sv.status === 200, '评估者量表可以发布', sv.json);
  const anon = http.makeClient(srv);
  const sub = await anon.request('POST', '/api/join/' + sv.json.token, { answers: { r1: 1 } });
  t.ok(sub.status === 200 && sub.json.result && sub.json.result.total === 1, '评估者量表返回 result.total', sub.json);

  process.exit(t.done('发布守卫'));
}()).catch(function (e) { console.error('测试异常：', e && e.stack || e); process.exit(1); });
