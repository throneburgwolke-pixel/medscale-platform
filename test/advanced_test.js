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

  console.log('\n【4b】历史重复冲突透明且不扩大配对n');
  const dbm = require(path.join(ROOT, 'lib', 'db.js'));
  const { buildFollowup, pairWaves } = require(path.join(ROOT, 'lib', 'followup.js'));
  const response = function (sid, total, pid) { return { subjectId: sid, pid: pid, scores: { total: total } }; };
  const historyA = [response('dupA', 10, 'a1'), response('dupA', 20, 'a2'), response('ok', 12, 'a3'), response('__proto__', 8, 'a4'), response('dupB', 7, 'a5')];
  const historyB = [response('dupA', 5, 'b1'), response('ok', 6, 'b2'), response('__proto__', 4, 'b3'), response('dupB', 3, 'b4'), response('dupB', 2, 'b5')];
  const paired = pairWaves(historyA, historyB);
  ok(JSON.stringify(paired.ids) === JSON.stringify(['ok', '__proto__']), 'pairWaves 两侧冲突全部排除，安全处理特殊编号', paired);
  const history = buildFollowup({ items: [] }, [{ id: 1, label: '基线', responses: historyA }, { id: 2, label: '随访', responses: historyB }]);
  ok(history.conflicts && history.conflicts.length === 2 && history.warnings && history.warnings.length === 2, '历史冲突按survey+编号报告警告', history.conflicts);
  ok(history.pairs[0].n === 2 && history.waves[0].summary.n === 3 && history.waves[1].summary.n === 3, '重复行不扩大配对或时点统计样本量');
  const conflictedA = history.subjects.find(function (s) { return s.subjectId === 'dupA'; });
  const conflictedB = history.subjects.find(function (s) { return s.subjectId === 'dupB'; });
  ok(conflictedA && !conflictedA.waves[1] && conflictedA.waves[2].total === 5 && conflictedB && !conflictedB.waves[2], '宽表只排除冲突时点，不默选最新，保留无冲突时点');
  ok(history.retention.completedAll === 2, '冲突时点不计入完成全部随访');
  const existing = dbm.listResponses(w1.id)[0];
  // 只在隔离测试库注入历史重复；验证新保存不删除/覆盖历史记录。
  dbm.db.prepare('INSERT INTO responses(survey_id,pid,answers,scores,subject_id) VALUES(?,?,?,?,?)')
    .run(w1.id, 'historical-duplicate', JSON.stringify(existing.answers), JSON.stringify({ total: 99 }), existing.subjectId);
  const conflictReport = await request('GET', '/api/studies/' + studyRes.study.id + '/report');
  ok(conflictReport.json.conflicts && conflictReport.json.conflicts[0].surveyId === w1.id && conflictReport.json.conflicts[0].subjectId === 'S-100' && conflictReport.json.warnings.length > 0 && conflictReport.json.pairs[0].n === 9,
    'Node JSON 报告明确显示历史冲突，配对n=9', conflictReport.json.conflicts);
  const conflictWide = await request('GET', '/api/studies/' + studyRes.study.id + '/export-wide.csv');
  const conflictCells = conflictWide.text.split('\r\n').find(function (line) { return line.startsWith('S-100,'); }).split(',');
  ok(conflictCells[1] === '' && conflictCells[4] === '9' && conflictCells[7] === '', 'Node CSV宽表冲突时点及差值为空，其他时点保留', conflictCells);
  let storageError;
  try { dbm.saveResponse(w1, phq, { subjectId: 'S-100', answers: existing.answers }); } catch (e) { storageError = e; }
  ok(storageError && storageError.code === 'DUPLICATE_SUBJECT' && dbm.listResponses(w1.id).filter(function (r) { return r.subjectId === 'S-100'; }).length === 2,
    'Node 保存层拒绝重复且保留两条历史行');

  console.log('\n【5】随访研究列表与清理');
  r = await request('GET', '/api/studies');
  ok(r.json.items.length === 1 && r.json.items[0].waveCount === 2 && r.json.items[0].responseCount === 21,
    '随访研究列表保留并统计全部历史答卷（2 时点 / 21 份）');
  r = await request('GET', '/api/surveys');
  ok(r.json.items.length === 3, '随访时点也出现在普通调查列表中（便于单独查看）');
  const { Worker } = require('node:worker_threads');
  const racers = [];
  // 顺序初始化连接，避免无关的模板首启同步竞争；只让目标saveResponse并发。
  for (let i = 0; i < 2; i += 1) {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      process.env.MEDSCALE_DB = workerData.dbPath;
      const dbm = require(workerData.modulePath);
      parentPort.once('message', function () {
        try {
          const saved = dbm.saveResponse(dbm.getSurvey(workerData.surveyId), dbm.getScale(workerData.scaleId), { subjectId: 'NODE-RACE', answers: workerData.answers });
          parentPort.postMessage({ saved: saved.id });
        } catch (e) { parentPort.postMessage({ code: e.code, error: e.message }); }
        dbm.db.close();
      });
      parentPort.postMessage('ready');
    `, { eval: true, workerData: { dbPath: process.env.MEDSCALE_DB, modulePath: path.join(ROOT, 'lib', 'db.js'), surveyId: w2.id, scaleId: phq.id, answers: existing.answers } });
    await new Promise(function (resolve, reject) { worker.once('message', resolve); worker.once('error', reject); });
    racers.push(worker);
  }
  const racingResults = await Promise.all(racers.map(function (worker) {
    return new Promise(function (resolve, reject) { worker.once('message', resolve); worker.once('error', reject); worker.postMessage('go'); });
  }));
  await Promise.all(racers.map(function (worker) { return worker.terminate(); }));
  ok(racingResults.filter(function (r) { return !!r.saved; }).length === 1 && racingResults.some(function (r) { return r.code === 'DUPLICATE_SUBJECT'; }) && dbm.listResponses(w2.id).filter(function (r) { return r.subjectId === 'NODE-RACE'; }).length === 1,
    'Node两个独立连接并发保存只接受一份', racingResults);
  const noneFirst = await request('POST', '/api/join/' + survey.token, { subjectId: 'none-id', answers: { q1: 0 } });
  const noneDuplicate = await request('POST', '/api/join/' + survey.token, { subjectId: 'none-id', answers: { q1: 0 } });
  ok(noneFirst.status === 200 && noneDuplicate.status === 400, 'Node非随访模式有编号也检查重复');
  const originalFind = dbm.findResponseBySubject;
  dbm.findResponseBySubject = function () { return null; };
  const racedRoute = await request('POST', '/api/join/' + survey.token, { subjectId: 'none-id', answers: { q1: 0 } });
  dbm.findResponseBySubject = originalFind;
  ok(racedRoute.status === 400 && /已提交|重复/.test(racedRoute.json.error), 'Node检查到保存之间的竞态返回可读400，不返回500', racedRoute.json);

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
