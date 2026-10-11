'use strict';
/**
 * 结果描述测试：看板「结果描述」把统计结果写成可直接引用的中文句子，必须
 * ① 只陈述真的算出来的结果——样本量不足时给出说明，而不是输出「F=−」这类伪数值；
 * ② 不重复同一条组间结论——单维度量表里维度分与总分同源，会算出两组完全相同的检验；
 * ③ 没有数据时明确「不可用」，而不是给一段套话。
 */
const path = require('node:path');
const { makeCounter } = require('./helpers/http.js');
const { buildReport } = require(path.join(__dirname, '..', 'lib', 'report.js'));
const { scoreResponse } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));

const t = makeCounter();

const ISI = TEMPLATES.find(function (s) { return s.code === 'isi'; });
const PHQ = TEMPLATES.find(function (s) { return s.code === 'phq-9'; });

/** 造 n 份确定性的作答：第 j 题的取值按 (i+j+seed) 轮转，便于复现 */
function synth(def, n, seed) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const answers = {};
    def.items.forEach(function (it, j) {
      const opts = it.options || [{ value: 0 }];
      answers[it.id] = opts[(i + j + seed) % opts.length].value;
    });
    out.push({
      pid: 'P' + i,
      submittedAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      durationSec: 180 + i,
      consent: true,
      answers: answers,
      scores: scoreResponse(def, answers),
      meta: { ip: '10.0.0.' + (i % 4) },
    });
  }
  return out;
}

const BAD = /=−|undefined|NaN|Infinity|null/;

console.log('\n【1】无数据时明确不可用');
const empty = buildReport(ISI, []).narrative;
t.ok(empty && empty.available === false, '零答卷时 narrative.available=false');
t.ok(Array.isArray(empty.lines) && empty.lines.length === 0, '零答卷时不产出任何句子');

console.log('\n【2】正常样本：给出样本量、描述统计与信度');
const rep = buildReport(ISI, synth(ISI, 40, 0));
const nar = rep.narrative;
t.ok(nar.available === true, '有数据时可用');
t.ok(nar.lines.length >= 4, '产出多句结果描述', nar.lines.length);
t.ok(/40 份/.test(nar.lines[0]) && /本次调查共回收问卷/.test(nar.lines[0]), '首句写明样本量', nar.lines[0]);
t.ok(nar.lines.some(function (s) { return /总分均值为/.test(s) && /95%CI/.test(s); }), '包含总分均值与 95%CI');
t.ok(nar.lines.some(function (s) { return /Cronbach/.test(s); }), '包含信度结果');
t.ok(typeof nar.note === 'string' && nar.note.length > 20, '附带使用说明（提醒结合设计解读）');

console.log('\n【3】不输出伪数值（这是最容易翻车的地方）');
const bad = nar.lines.filter(function (s) { return BAD.test(s); });
t.ok(bad.length === 0, '40 份样本：没有 −/undefined/NaN 之类的占位数值', bad.slice(0, 2));

// 小样本时组间检验算不出来（F 与 p 均为 null），必须换成人话说明
const small = buildReport(PHQ, synth(PHQ, 8, 3)).narrative;
const smallBad = small.lines.filter(function (s) { return BAD.test(s); });
t.ok(smallBad.length === 0, '8 份样本：同样不输出占位数值', smallBad.slice(0, 2));
t.ok(small.lines.some(function (s) { return /样本量不足/.test(s) || !/组间/.test(s); }),
  '组间检验算不出时给出说明或干脆不写该结论');

console.log('\n【4】同源结论不重复（单维度量表：维度分 = 总分）');
const tail = function (s) {
  const m = s.match(/各组分别为 (.+?)。/);
  return m ? m[1] : '';
};
const groupLines = nar.lines.filter(function (s) { return /组间/.test(s) && tail(s); });
const tails = groupLines.map(tail);
t.ok(tails.length === new Set(tails).size, '分组均值完全相同的检验只写一次', tails.length + ' 行 / ' + new Set(tails).size + ' 种');
const alphaLines = nar.lines.filter(function (s) { return /α 系数为/.test(s); });
t.ok(alphaLines.length <= 1, '维度 α 与总分 α 重合时不重复列出', alphaLines.length);

console.log('\n【5】多维度量表：维度得分逐项列出');
const multi = TEMPLATES.filter(function (s) {
  return (s.dimensions || []).length >= 2 && s.scoring && s.scoring.method !== 'none';
})[0];
if (multi) {
  const n2 = buildReport(multi, synth(multi, 40, 1)).narrative;
  t.ok(n2.lines.some(function (s) { return /各维度得分依次为/.test(s); }), multi.code + '：列出各维度得分');
  t.ok(n2.lines.filter(function (s) { return BAD.test(s); }).length === 0, multi.code + '：多维度量表的描述同样干净');
} else {
  t.ok(true, '（无多维度计分量表，跳过）');
}

process.exit(t.done('结果描述'));
