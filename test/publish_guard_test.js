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

  console.log('\n【4】分档评分的完整链路：发布 → 填写 → 报告 → 导出');
  const { TEMPLATES } = require(path.join(ROOT, 'lib', 'scales.js'));
  const cp = TEMPLATES.find((x) => x.code === 'child-pugh');
  const cpScale = await c.request('POST', '/api/scales', { scale: Object.assign({}, cp, { code: 'child-pugh-test' }) });
  t.ok(cpScale.status === 200, '分档量表入库', cpScale.json);
  const cpSurvey = await c.request('POST', '/api/surveys', { scaleId: cpScale.json.id, name: 'Child-Pugh 测试', showResult: true });
  t.ok(cpSurvey.status === 200, '分档量表可发布', cpSurvey.json);
  const answers = [
    { bili: 20, alb: 40, inr: 1.2, ascites: 1, he: 1 },
    { bili: 51, alb: 27, inr: 2.4, ascites: 3, he: 3 },
  ];
  let last = null;
  for (const a of answers) last = await anon.request('POST', '/api/join/' + cpSurvey.json.token, { answers: a });
  t.ok(last.status === 200 && last.json.result.total === 15 && last.json.result.cut.label === 'C 级',
    '分档值经过 JSON 存取后仍然正确（15 分 C 级）', last.json && last.json.result);
  const rep = await c.request('GET', '/api/surveys/' + cpSurvey.json.id + '/report');
  t.ok(rep.status === 200 && rep.json.n === 2 && rep.json.scores && rep.json.scores.total.n === 2,
    '报告能统计分档量表（2 份）', rep.json && { n: rep.json.n, total: rep.json.scores && rep.json.scores.total });
  t.ok(rep.json.scores.total.min === 5 && rep.json.scores.total.max === 15 && rep.json.scores.total.mean === 10,
    '报告里的总分来自分档规则（5 / 15，均值 10）', rep.json.scores.total);
  t.ok(rep.json.scores.totalRange && rep.json.scores.totalRange[0] === 5 && rep.json.scores.totalRange[1] === 15,
    '报告带出量表的可取值范围', rep.json.scores.totalRange);
  const csv = await c.request('GET', '/api/surveys/' + cpSurvey.json.id + '/export.csv');
  t.ok(csv.status === 200 && /15/.test(csv.text), 'CSV 导出含分档总分', csv.text.slice(0, 80));

  console.log('\n【5】公式计分（无维度）也能出报告');
  const meld = TEMPLATES.find((x) => x.code === 'meld');
  const meldScale = await c.request('POST', '/api/scales', { scale: Object.assign({}, meld, { code: 'meld-test' }) });
  const meldSurvey = await c.request('POST', '/api/surveys', { scaleId: meldScale.json.id, name: 'MELD 测试', showResult: true });
  const meldSub = await anon.request('POST', '/api/join/' + meldSurvey.json.token,
    { answers: { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0 } });
  t.ok(meldSub.status === 200 && meldSub.json.result.total === 25, 'MELD 提交后得到 25 分', meldSub.json && meldSub.json.result);
  const meldRep = await c.request('GET', '/api/surveys/' + meldSurvey.json.id + '/report');
  t.ok(meldRep.status === 200 && meldRep.json.scores.total.mean === 25, '无维度量表的报告不报错且总分正确', meldRep.json);
  t.ok(Array.isArray(meldRep.json.scores.dimensions) && meldRep.json.scores.dimensions.length === 0,
    '无维度量表的维度统计为空数组', meldRep.json.scores && meldRep.json.scores.dimensions);

  process.exit(t.done('发布守卫'));
}()).catch(function (e) { console.error('测试异常：', e && e.stack || e); process.exit(1); });
