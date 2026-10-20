'use strict';
/**
 * 计分有效性：缺失条目、非数值选项、分级边界。
 * 目标：不完整答卷不得按「已答项求和」输出被低估的总分与分级。
 */
const path = require('node:path');
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));
const { scoreResponse, itemScore, pickCutoff } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function T(code) { return TEMPLATES.find(function (t) { return t.code === code; }); }
function answerFirst(t, n, value) {
  const a = {};
  t.items.slice(0, n).forEach(function (it) { a[it.id] = value; });
  return a;
}

console.log('\n【1】缺失条目不再按已答项求和');
const phq = T('phq-9');
let r = scoreResponse(phq, answerFirst(phq, 4, 3));
ok(r.total === null, 'PHQ-9 仅答 4/9 条时总分应为 null', r.total);
ok(r.invalid === true, 'PHQ-9 不完整答卷标记 invalid', r);
ok(r.cut === null, 'PHQ-9 不完整答卷不输出分级', r.cut);
ok(r.answered === 4 && r.completeness === 44, 'PHQ-9 完成度仍如实统计（4/9=44%）', r.completeness);

r = scoreResponse(phq, answerFirst(phq, 8, 3));
ok(r.total === null && r.invalid === true, 'PHQ-9 缺 1 条时总分也为 null（默认要求全部计分项）');

const hbi = T('hbi');
const hbiPartial = {};
hbi.items.forEach(function (it) {
  if (it.id !== 'hbi5') hbiPartial[it.id] = it.options[0].value;
});
r = scoreResponse(hbi, hbiPartial);
ok(r.total === null && r.invalid === true, 'HBI 漏答可选的 hbi5 时不输出被低估的总分', r.total);

console.log('\n【2】minValidItems 与 prorate');
const prorated = Object.assign({}, phq, {
  scoring: Object.assign({}, phq.scoring, { prorate: true, minValidItems: 4 }),
});
r = scoreResponse(prorated, answerFirst(phq, 4, 3));
ok(r.total === 27, 'prorate：4/9 条均答 3 → 按均分补足为 27', r.total);
ok(r.prorated === true, '补足计分标记 prorated', r);
ok(r.invalid !== true && r.cut && r.cut.label === '重度抑郁', '补足后照常给出分级', r.cut);

const strict = Object.assign({}, phq, {
  scoring: Object.assign({}, phq.scoring, { minValidItems: 5 }),
});
r = scoreResponse(strict, answerFirst(phq, 4, 3));
ok(r.total === null && r.invalid === true, 'minValidItems=5 时 4 条为无效', r.total);

console.log('\n【3】非数值选项不得产生 NaN 分级');
ok(itemScore({ type: 'radio', options: [{ label: '是', value: 'yes' }] }, 'yes', {}) === null,
  '非数值选项的 itemScore 返回 null');
ok(pickCutoff(NaN, [{ max: 10, label: '重度' }]) === null, 'pickCutoff 拒绝 NaN');
ok(pickCutoff('abc', [{ max: 10, label: '重度' }]) === null, 'pickCutoff 拒绝非数值');
const bad = {
  items: [
    { id: 'a', no: 1, text: 'A', type: 'radio', options: [{ label: '是', value: 'yes' }] },
    { id: 'b', no: 2, text: 'B', type: 'radio', options: [{ label: '2', value: 2 }] },
  ],
  scoring: { method: 'sum', cutoffs: [{ max: 1, label: '低' }, { max: 10, label: '高' }] },
  dimensions: [],
};
r = scoreResponse(bad, { a: 'yes', b: 2 });
ok(r.total === null, '非数值选项视为缺失，不再静默求和产生 NaN', r.total);
ok(r.cut === null && r.invalid === true, '无效答卷不落入最后一级「重度」', r.cut);

console.log('\n———————————————————————————————');
console.log('  计分有效性：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('———————————————————————————————\n');
process.exit(fail);
