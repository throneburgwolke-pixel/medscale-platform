'use strict';
/**
 * 高级功能测试：跳题逻辑（skip logic）与随访/多次测量（配对分析）
 */
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const ROOT = path.join(__dirname, '..');
process.env.MEDSCALE_DB = path.join(__dirname, 'advanced.db');
['', '-wal', '-shm'].forEach(function (s) {
  const p = process.env.MEDSCALE_DB + s;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

const logic = require(path.join(ROOT, 'lib', 'logic.js'));
const srv = require(path.join(ROOT, 'server.js'));
const INIT_PW = require(path.join(ROOT, 'lib/db.js')).initialAdminPassword();

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 260) : '')); }
}

let COOKIE = '';
function request(method, url, body) {
  return new Promise(function (resolve) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:5173' };
    req.socket = { remoteAddress: '127.0.0.1' };
    if (COOKIE) req.headers.cookie = COOKIE;
    const chunks = [];
    const res = {
      statusCode: 0,
      headers: {},
      writeHead: function (c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); },
      end: function (d) {
        if (d && d.length) chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d)));
        const buf = Buffer.concat(chunks);
        const sc = this.headers['Set-Cookie'];
        if (sc) COOKIE = sc.split(';')[0];
        let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; }
        resolve({ status: this.statusCode, text: buf.toString('utf8'), json: json, headers: this.headers });
      },
      on: function () { },
    };
    setTimeout(function () {
      if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    }, 0);
    srv.handleRequest(req, res);
  });
}

(async function run() {
  console.log('\n【1】跳题逻辑引擎（单元）');
  const def = {
    items: [
      { id: 'q1', no: 1, text: '是否有头痛？', type: 'radio', options: [{ label: '有', value: 1 }, { label: '无', value: 0 }],
        skip: [{ values: ['0'], action: 'end' }] },
      { id: 'q2', no: 2, text: '头痛频率', type: 'radio', options: [{ label: '每周', value: 1 }, { label: '每月', value: 2 }] },
      { id: 'q3', no: 3, text: '是否服药', type: 'radio', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }],
        skip: [{ values: ['0'], action: 'goto', target: 'q5' }] },
      { id: 'q4', no: 4, text: '每周服药天数', type: 'number' },
      { id: 'q5', no: 5, text: '是否就医', type: 'radio', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] },
    ],
  };
  let v = logic.computeVisibility(def, { q1: 1 });
  ok(v.visible.join(',') === 'q1,q2,q3,q4,q5' && v.skipped.length === 0, '未命中规则时全部题目可见');
  v = logic.computeVisibility(def, { q1: 0 });
  ok(v.visible.join(',') === 'q1' && v.skipped.length === 4 && v.ended,
    '"是否有头痛=无" 时提前结束，跳过 4 题', v);
  v = logic.computeVisibility(def, { q1: 1, q2: 1, q3: 0 });
  ok(v.visible.join(',') === 'q1,q2,q3,q5' && v.skipped.join(',') === 'q4',
    '"是否服药=否" 时跳过第 4 题，跳到第 5 题', v);
  v = logic.computeVisibility(def, { q1: 1, q2: 1, q3: 1 });
  ok(v.visible.length === 5, '服药=是 时第 4 题正常显示');
  ok(logic.countRules(def) === 2, '规则计数正确');

  console.log('\n【1b】答案文案（前后端共用一份）');
  const q1 = def.items[0];
  const ansLabel = function (item, value, sep) {
    return typeof logic.answerLabel === 'function' ? logic.answerLabel(item, value, sep) : null;
  };
  ok(typeof logic.answerLabel === 'function', 'lib/logic.js 导出 answerLabel');
  ok(ansLabel(q1, 1) === '有', '单选取到选项文案', ansLabel(q1, 1));
  ok(ansLabel(q1, 0) === '无', '按值匹配而不是按顺序', ansLabel(q1, 0));
  ok(ansLabel(q1, '') === '', '未作答是空串而不是 undefined');
  ok(ansLabel({ id: 'x', options: [] }, 7) === '7', '无匹配选项时回退为原始值文本', ansLabel({ id: 'x', options: [] }, 7));
  const multi = { id: 'm', options: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] };
  ok(ansLabel(multi, [1, 2], '/') === 'A/B', '多选用传入的分隔符连接', ansLabel(multi, [1, 2], '/'));
  ok(ansLabel(multi, [1, 2], '|') === 'A|B', '同一函数可服务不同导出场景', ansLabel(multi, [1, 2], '|'));
  ok(Array.isArray(logic.CATEGORIES) && logic.CATEGORIES.length >= 10, 'lib/logic.js 是分类清单的唯一来源');

  console.log('\n【2】跳题逻辑端到端（含计分与必答校验）');
  await request('POST', '/api/login', { password: INIT_PW });
  const scale = {
    title: '头痛筛查问卷（含跳题示例）',
    category: '症状评估',
    description: '演示跳题逻辑',
    instructions: '请根据近 3 个月情况作答',
    definition: Object.assign({}, def, {
      dimensions: [{ id: 'total', name: '症状总分', items: ['q1', 'q2', 'q4', 'q5'] }],
      scoring: { method: 'sum', totalRange: [0, 20], cutoffs: [{ max: 3, label: '症状轻', level: 'normal', advice: '' }, { max: 20, label: '症状重', level: 'moderate', advice: '' }] },
    }),
  };
  let r = await request('POST', '/api/scales', { scale: scale });
  const sc = r.json;
  ok(!!sc.id, '创建含跳题逻辑的自制问卷');
  r = await request('POST', '/api/surveys', { scaleId: sc.id, name: '头痛筛查', showResult: true });
  const survey = r.json;
  // 触发 end：只答第 1 题
  r = await request('POST', '/api/join/' + survey.token, { answers: { q1: 0 }, consent: true });
  ok(r.status === 200, '"无头痛"时只答 1 题即可提交（被跳过的必答题不拦截）', r.json);
  ok(r.json.result.skipped.length === 4 && r.json.result.expected === 1 && r.json.result.completeness === 100,
    '计分结果标记了被跳过的 4 题，完成度按可见题目计算', r.json.result);
  ok(r.json.result.total === 0, '被跳过的题目不计入总分');
  // 触发 goto：答第 3 题为"否"，跳过第 4 题
  r = await request('POST', '/api/join/' + survey.token, { answers: { q1: 1, q2: 2, q3: 0, q5: 1 }, consent: true });
  ok(r.status === 200, '"不服药"时跳过第 4 题可正常提交');
  ok(r.json.result.skipped.join(',') === 'q4' && r.json.result.total === 4,
    '跳过的第 4 题不计分（总分 = q1+q2+q3+q5 = 4，q4 未参与）', r.json.result);
  // 可见题未答应被拒绝
  r = await request('POST', '/api/join/' + survey.token, { answers: { q1: 1, q2: 2 }, consent: true });
  ok(r.status === 400 && r.json.details.some(function (d) { return d.itemId === 'q3'; }),
    '可见的必答题未答仍会被拦截（提示第 3 题）', r.json);
  r = await request('GET', '/api/surveys/' + survey.id + '/report');
  ok(r.json.n === 2 && r.json.items.find(function (i) { return i.itemId === 'q4'; }).missing === 2,
    '统计报告中第 4 题按"未作答/跳过"统计');

  console.log('\n【3】随访研究：多时点发放与配对分析');
  const phq = (await request('GET', '/api/scales')).json.items.find(function (s) { return s.code === 'phq-9'; });
  r = await request('POST', '/api/studies', {
    scaleId: phq.id,
    name: '抑郁症状随访（干预前后）',
    waves: [{ label: '基线' }, { label: '干预后1个月' }],
    subjectMode: 'auto',
    showResult: true,
  });
  const studyRes = r.json;
  ok(!!studyRes.study.id && studyRes.surveys.length === 2, '创建随访研究并生成 2 个时点');
  const w1 = studyRes.surveys[0];
  const w2 = studyRes.surveys[1];
  ok(w1.waveLabel === '基线' && w2.waveLabel === '干预后1个月', '时点标签正确');
  r = await request('GET', '/api/join/' + w1.token);
  ok(r.json.survey.studyId === studyRes.study.id && r.json.suggestSubjectCode === 'S-0001',
    '填写页返回随访信息与建议编号（' + r.json.suggestSubjectCode + '）');

  // 10 位受试者：基线 15 分左右，1 个月后下降 5 分
  const ids = phq.definition.items.map(function (i) { return i.id; });
  const baseLevel = [2, 2, 2, 1, 2, 1, 2, 1, 2, 2];
  const followLevel = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  for (let k = 0; k < 10; k += 1) {
    const a1 = {};
    ids.forEach(function (id) { a1[id] = baseLevel[k]; });
    await request('POST', '/api/join/' + w1.token, { answers: a1, consent: true, subjectId: 'S-' + (100 + k), durationSec: 120 });
    const a2 = {};
    ids.forEach(function (id) { a2[id] = followLevel[k]; });
    await request('POST', '/api/join/' + w2.token, { answers: a2, consent: true, subjectId: 'S-' + (100 + k), durationSec: 110 });
  }
  r = await request('GET', '/api/studies/' + studyRes.study.id + '/report');
  const rep = r.json;
  ok(rep.waves.length === 2 && rep.waves[0].summary.n === 10 && rep.waves[1].summary.n === 10, '两个时点各回收 10 份');
  ok(Math.abs(rep.waves[0].summary.total.mean - 15.3) < 0.01 && rep.waves[1].summary.total.mean === 9,
    '基线均值 15.3 → 随访后 9', [rep.waves[0].summary.total.mean, rep.waves[1].summary.total.mean]);
  const pair = rep.pairs[0];
  ok(pair.n === 10, '配对分析纳入 10 对');
  ok(Math.abs(pair.meanChange - 6.3) < 0.01 && pair.t.p < 0.01, '配对 t 检验：Δ=6.3，p=' + pair.t.p + '（t=' + pair.t.t + '）');
  ok(pair.wilcoxon && pair.wilcoxon.p < 0.05, 'Wilcoxon 符号秩检验 p=' + (pair.wilcoxon && pair.wilcoxon.p));
  ok(rep.retention.completedAll === 10 && rep.retention.completionRate === 100, '随访完成率 100%');
  ok(pair.bonferroni === null || pair.bonferroni !== undefined, '两两比较校正字段存在');

  console.log('\n【4】随访数据质量与导出');
  const dup = await request('POST', '/api/join/' + w1.token, { answers: (function () {
    const a = {}; ids.forEach(function (id) { a[id] = 1; }); return a;
  }()), consent: true, subjectId: 'S-100' });
  ok(dup.status === 400 && dup.json.error.indexOf('已提交过') >= 0, '同一编号在同一时点重复提交被拒绝');
  // 制造 2 例失访
  const dropIds = ['S-108', 'S-109'];
  r = await request('GET', '/api/studies/' + studyRes.study.id + '/report');
  const before = r.json.retention.completedAll;
  ok(before === 10, '失访前完成全部时点 10 人');

  r = await request('GET', '/api/studies/' + studyRes.study.id + '/export-wide.csv');
  const lines = r.text.trim().split('\r\n');
  ok(r.status === 200 && lines[0].indexOf('SUBJECT') >= 0 && lines[0].indexOf('W1_TOTAL') >= 0 && lines[0].indexOf('W2_TOTAL') >= 0,
    '宽表导出表头含各时点总分：' + lines[0]);
  ok(lines.length === 11, '宽表 10 行受试者数据（' + (lines.length - 1) + ' 行）');
  const firstRow = lines[1].split(',');
  ok(lines[0].indexOf('DELTA_W1W2') >= 0 && firstRow.length === 8 && firstRow[firstRow.length - 1] === '9',
    '宽表包含每位受试者的变化值 Δ（S-100：18 → 9，Δ=9）');
  ok(lines[1].indexOf('S-100') >= 0, '宽表按受试者编号组织，可直接做重复测量方差分析');

  console.log('\n【5】随访研究列表与清理');
  r = await request('GET', '/api/studies');
  ok(r.json.items.length === 1 && r.json.items[0].waveCount === 2 && r.json.items[0].responseCount === 20,
    '随访研究列表统计正确（2 时点 / 20 份答卷）');
  r = await request('GET', '/api/surveys');
  ok(r.json.items.length === 3, '随访时点也出现在普通调查列表中（便于单独查看）');
  r = await request('DELETE', '/api/studies/' + studyRes.study.id);
  ok(r.status === 200, '删除随访研究成功');
  r = await request('GET', '/api/studies');
  ok(r.json.items.length === 0, '删除后随访列表为空');
  r = await request('GET', '/api/surveys');
  ok(r.json.items.length === 1, '随访时点的调查也一并删除');

  console.log('\n———————————————————————————————');
  console.log('  高级功能测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('———————————————————————————————\n');
  ['', '-wal', '-shm'].forEach(function (s) {
    const p = process.env.MEDSCALE_DB + s;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  process.exit(fail ? 1 : 0);
}()).catch(function (e) {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
