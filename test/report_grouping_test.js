'use strict';
/**
 * 组间比较的分组变量必须是人口学/分组条目（exclude:true），
 * 不能拿量表自己的计分条目来分组，否则就是循环论证。
 */
const path = require('node:path');
const { makeCounter } = require('./helpers/http.js');
const { buildReport, buildMatrix } = require(path.join(__dirname, '..', 'lib', 'report.js'));
const { scoreResponse } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));

const t = makeCounter();

const DEF = {
  code: 'demo-scale',
  title: '演示量表',
  category: '演示',
  source: '',
  license: '',
  items: [
    { id: 'q1', no: 1, text: '条目一', type: 'radio', options: [{ label: '0', value: 0 }, { label: '1', value: 1 }] },
    { id: 'q2', no: 2, text: '条目二', type: 'radio', options: [{ label: '0', value: 0 }, { label: '1', value: 1 }] },
    { id: 'q3', no: 3, text: '条目三', type: 'radio', options: [{ label: '0', value: 0 }, { label: '1', value: 1 }] },
    { id: 'sex', no: 4, text: '性别', type: 'radio', exclude: true, options: [{ label: '男', value: 'M' }, { label: '女', value: 'F' }] },
  ],
  dimensions: [],
  scoring: { method: 'sum', cutoffs: [{ max: 1, label: '低' }, { max: 3, label: '高' }] },
};

function synth(def, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const answers = { sex: i % 2 ? 'F' : 'M' };
    def.items.forEach(function (it, j) {
      if (it.exclude) return;
      answers[it.id] = (i + j) % 2;
    });
    out.push({ pid: 'P' + i, submittedAt: new Date(Date.now() - i * 3600000).toISOString(), answers: answers, scores: scoreResponse(def, answers) });
  }
  return out;
}

console.log('\n【1】分组变量只允许 exclude:true 的人口学条目');
const responses = synth(DEF, 24);
const rep = buildReport(DEF, responses);
t.ok(rep.groupComparison.available === true, '有性别条目时组间比较可用');
t.ok(rep.groupComparison.groupItem.id === 'sex', '默认分组变量是性别，而不是第 1 个计分条目', rep.groupComparison.groupItem.id);
t.ok(rep.groupComparison.groupCandidates.length === 1 && rep.groupComparison.groupCandidates[0].id === 'sex',
  '候选分组变量只有人口学条目', rep.groupComparison.groupCandidates);
const preferred = buildReport(DEF, responses, { groupVariableId: 'q1' });
t.ok(preferred.groupComparison.groupItem.id === 'sex', '指定计分条目作分组变量时被拒绝并回退到合法变量',
  preferred.groupComparison.groupItem.id);

console.log('\n【2】没有人口学条目时不提供组间比较');
const PHQ = TEMPLATES.find(function (s) { return s.code === 'phq-9'; });
const phqResponses = (function () {
  const out = [];
  for (let i = 0; i < 24; i += 1) {
    const answers = {};
    PHQ.items.forEach(function (it, j) {
      answers[it.id] = (i + j) % 4 === 2 ? 1 : (i + j) % 4 === 3 ? 0 : (i + j) % 4;
    });
    out.push({ pid: 'P' + i, submittedAt: new Date().toISOString(), answers: answers, scores: scoreResponse(PHQ, answers) });
  }
  return out;
})();
const phqRep = buildReport(PHQ, phqResponses);
t.ok(phqRep.groupComparison.available === false, 'PHQ-9 没有人口学条目 → 不做组间比较（避免循环论证）',
  phqRep.groupComparison);

console.log('\n【3】信度矩阵与总分使用同一组条目');
const m = buildMatrix(DEF, responses);
t.ok(m.ids.indexOf('sex') < 0, 'Cronbach α / 分半矩阵排除 exclude 条目', m.ids);
t.ok(m.ids.length === 3, '矩阵只含 3 个计分条目', m.ids.length);

console.log('\n【4】invalid 答卷不参与统计');
const partial = phqResponses.slice(0, 20).concat([{
  pid: 'BAD', submittedAt: new Date().toISOString(),
  answers: { phq1: 3 }, scores: scoreResponse(PHQ, { phq1: 3 }),
}]);
const partRep = buildReport(PHQ, partial);
t.ok(partRep.scores.total.n === 20, '总分描述统计排除 invalid 答卷', partRep.scores.total.n);

process.exit(t.done('报告分组与矩阵'));
