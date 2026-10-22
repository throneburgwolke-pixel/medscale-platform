'use strict';
/**
 * 计分有效性：缺失条目、非数值选项、分级边界。
 * 目标：不完整答卷不得按「已答项求和」输出被低估的总分与分级。
 */
const path = require('node:path');
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));
const { scoreResponse, validateAnswers, rawValue, itemScore, bandScore, pickCutoff } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));

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
  if (it.id === 'hbi5') return;
  hbiPartial[it.id] = it.type === 'number' || it.type === 'slider'
    ? (it.min === undefined ? 0 : it.min)
    : it.options[0].value;
});
ok(validateAnswers(hbi, hbiPartial).every(function (e) { return e.itemId === 'hbi5'; }), 'HBI 其余输入有效，缺失只涉及 hbi5');
r = scoreResponse(hbi, hbiPartial);
ok(r.total === null && r.invalid === true && r.invalidReason === 'insufficient_items', 'HBI 漏答 hbi5 时不输出被低估的总分', r);

const hbiCount = hbi.items.find(function (it) { return it.id === 'hbi3'; });
const hbiComplete = { hbi1: 0, hbi2: 0, hbi3: 7, hbi4: 0, hbi5: ['none'] };
[7.5, '7.5'].forEach(function (count) {
  const answers = Object.assign({}, hbiComplete, { hbi3: count });
  const errors = validateAnswers(hbi, answers);
  ok(errors.length === 1 && errors[0].itemId === 'hbi3', 'HBI拒绝非整数实际次数：' + JSON.stringify(count), errors);
  ok(rawValue(hbiCount, count) === null, 'HBI非整数不能绕过校验进入preview计分：' + JSON.stringify(count));
  const result = scoreResponse(hbi, answers);
  ok(result.total === null && result.invalid === true && result.cut === null,
    'HBI非整数不产出总分或分级：' + JSON.stringify(count), result);
});
[7, '7', 100000].forEach(function (count) {
  const answers = Object.assign({}, hbiComplete, { hbi3: count });
  ok(validateAnswers(hbi, answers).length === 0, 'HBI接受实际整数次数且无医学上限：' + JSON.stringify(count));
  const result = scoreResponse(hbi, answers);
  ok(result.total === Number(count) && result.invalid !== true,
    'HBI整数次数逐次计分：' + JSON.stringify(count), result);
});
ok(validateAnswers(hbi, Object.assign({}, hbiComplete, { hbi3: -1 })).some(function (e) { return e.itemId === 'hbi3'; }),
  'HBI实际次数仍必须非负');
const allHbiComplications = ['arthralgia', 'uveitis', 'erythema', 'aphthous', 'pyoderma', 'fissure', 'fistula', 'abscess'];
const hbiAllAnswers = Object.assign({}, hbiComplete, { hbi5: allHbiComplications });
ok(validateAnswers(hbi, hbiAllAnswers).length === 0 && scoreResponse(hbi, hbiAllAnswers).total === 15,
  'HBI保留原有八种唯一并发症：7次加8种共15分');

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

console.log('\n【4】多选不能重复累计，选项标识与分值独立');
const multi = { id: 'multi', no: 1, type: 'checkbox', options: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] };
[[1, 1], [1, '1']].forEach(function (answer) {
  ok(rawValue(multi, answer) === null, '重复多选原始分值为 null：' + JSON.stringify(answer));
  const errors = validateAnswers({ items: [multi] }, { multi: answer });
  ok(errors.length === 1 && errors[0].itemId === 'multi', '校验拒绝重复多选：' + JSON.stringify(answer), errors);
  const result = scoreResponse({ items: [multi], scoring: { method: 'sum' } }, { multi: answer });
  ok(result.total === null && result.invalid === true, '重复多选不得产生总分', result);
});
ok(rawValue(multi, [1, 999]) === null, '混入未知选项时整道多选无效');
ok(rawValue(multi, [1, 2]) === 3, '不同多选仍正常求和');
const exclusiveMulti = { id: 'exclusive', no: 1, type: 'checkbox', options: [
  { label: '无', value: 'none', score: 0, exclusive: true },
  { label: '症状A', value: 'symptom-a', score: 1 },
] };
const exclusiveAnswer = { exclusive: ['none', 'symptom-a'] };
ok(rawValue(exclusiveMulti, exclusiveAnswer.exclusive) === null, '多选包含exclusive选项及其他选项时原始分值为null');
ok(validateAnswers({ items: [exclusiveMulti] }, exclusiveAnswer).length === 1,
  '多选包含exclusive选项及其他选项时校验拒绝');
r = scoreResponse({ items: [exclusiveMulti], scoring: { method: 'sum' } }, exclusiveAnswer);
ok(r.total === null && r.invalid === true, 'exclusive冲突不能绕过校验进入preview计分', r);
const ordinaryZeroMulti = { id: 'ordinary-zero', type: 'checkbox', options: [
  { label: '零分项', value: 'zero', score: 0 },
  { label: '症状A', value: 'symptom-a', score: 1 },
] };
ok(rawValue(ordinaryZeroMulti, ['zero', 'symptom-a']) === 1 &&
  validateAnswers({ items: [ordinaryZeroMulti] }, { 'ordinary-zero': ['zero', 'symptom-a'] }).length === 0,
'未标exclusive的零分选项仍可与其他选项同选');
let malformedValue;
let malformedErrors;
let malformedRawError;
let malformedValidationError;
const malformedMulti = [{ toString: null }];
try { malformedValue = rawValue(multi, malformedMulti); } catch (e) { malformedRawError = e.message; }
try { malformedErrors = validateAnswers({ items: [multi] }, { multi: malformedMulti }); } catch (e) { malformedValidationError = e.message; }
ok(!malformedRawError && malformedValue === null, '非法多选对象不能在去重转换时抛错', malformedRawError || malformedValue);
ok(!malformedValidationError && malformedErrors.length === 1, '非法多选对象安全返回校验错误', malformedValidationError || malformedErrors);
const complications = { id: 'complications', type: 'checkbox', options: Array.from({ length: 8 }, function (_, i) {
  return { label: '并发症' + (i + 1), value: 'complication-' + (i + 1), score: 1 };
}) };
const complicationAnswers = { complications: complications.options.map(function (o) { return o.value; }) };
ok(rawValue(complications, complicationAnswers.complications) === 8, 'HBI 类八个不同字符串选项各计 1 分');
ok(validateAnswers({ items: [complications] }, complicationAnswers).length === 0, '独立 score 的多选可通过校验');
ok(scoreResponse({ items: [complications], scoring: { method: 'sum' } }, complicationAnswers).total === 8,
  '独立 score 多选计入总分');
['radio', 'select', 'checkbox'].forEach(function (type) {
  const item = { type: type, options: [{ label: '是', value: 'yes', score: '2' }] };
  ok(rawValue(item, type === 'checkbox' ? ['yes'] : 'yes') === 2, type + ' 使用显式数值 score');
  const zero = { type: type, options: [{ label: '零分', value: 9, score: 0 }] };
  ok(rawValue(zero, type === 'checkbox' ? [9] : 9) === 0, type + ' 显式 score=0 不回退到 value');
});
['radio', 'select'].forEach(function (type) {
  const item = Object.assign({}, multi, { type: type });
  ok(rawValue(item, [1]) === null && validateAnswers({ items: [item] }, { multi: [1] }).length === 1,
    type + ' 不接受数组伪装为单选值');
});
ok(itemScore({ type: 'radio', reverse: true, options: [{ value: 'low', score: 2 }, { value: 'high', score: 5 }] }, 'low') === 5,
  '反向计分的上下限也使用独立 score');
const textChoice = { id: 'textChoice', type: 'radio', exclude: true, options: [{ value: 'yes', label: '是' }] };
ok(validateAnswers({ items: [textChoice] }, { textChoice: 'yes' }).length === 0, '不计分的字符串选项仍可正常作答');

console.log('\n【5】数值输入不接受隐式强制转换');
['number', 'slider'].forEach(function (type) {
  const item = { id: 'n', no: 1, type: type, min: 0, max: 10 };
  [false, true, {}, [], [1], ' ', '\t', 'Infinity', Infinity, NaN].forEach(function (answer) {
    ok(rawValue(item, answer) === null, type + ' 拒绝非有限或非数值输入：' + JSON.stringify(answer));
    const errors = validateAnswers({ items: [item] }, { n: answer });
    ok(errors.length === 1 && errors[0].itemId === 'n', type + ' 校验拒绝非法输入：' + JSON.stringify(answer), errors);
  });
  [[], [1]].forEach(function (answer) {
    const optional = Object.assign({}, item, { required: false });
    ok(validateAnswers({ items: [optional] }, { n: answer }).length === 1,
      type + ' 即使非必答也拒绝数组：' + JSON.stringify(answer));
  });
  [0, '0', ' 2.5 ', '1e1'].forEach(function (answer) {
    ok(rawValue(item, answer) === Number(answer) && validateAnswers({ items: [item] }, { n: answer }).length === 0,
      type + ' 接受有限数字及非空数字字符串：' + JSON.stringify(answer));
  });
});

console.log('\n【6】非法选项与分档不得生成 NaN 或兜底分');
const invalidOptions = [null, undefined, {}, { value: null }, { value: '' }, { value: ' ' }, { value: 'bad' },
  { value: Infinity }, { value: false }, { value: 1, score: 'bad' }, { value: 1, score: null },
  { value: 1, score: '' }, { value: 1, score: ' ' }, { value: 1, score: Infinity }, { value: 1, score: {} }, { value: 1, score: [] }];
['radio', 'select', 'checkbox'].forEach(function (type) {
  invalidOptions.forEach(function (option) {
    let value;
    let error;
    const answer = option && option.value !== undefined ? option.value : 'missing';
    try { value = rawValue({ type: type, options: [option] }, type === 'checkbox' ? [answer] : answer); }
    catch (e) { error = e.message; }
    ok(!error && value === null, type + ' 安全拒绝空/非法选项：' + JSON.stringify(option), error || value);
  });
});
const bandedChoice = { type: 'radio', options: [{ value: 'yes' }], bands: [{ lt: 1, score: 0 }, { score: 3 }] };
ok(itemScore(bandedChoice, 'yes') === null, '非数值选项不能命中兜底分档 3');
[NaN, Infinity, -Infinity].forEach(function (value) {
  ok(bandScore(bandedChoice, value) === null, 'bandScore 拒绝非有限输入：' + String(value));
});
['bad', Infinity, null, '', {}, []].forEach(function (score) {
  ok(itemScore({ type: 'number', bands: [{ score: score }] }, 2) === null, '分档 score 必须是有限数值：' + JSON.stringify(score));
});
ok(itemScore({ type: 'number', bands: [{ score: '3' }] }, 2) === 3, '有限数字字符串分档 score 仍可使用');

console.log('\n【7】只能调用已注册的自有公式');
['__defineGetter__', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'missing'].forEach(function (formula) {
  let result;
  let error;
  try { result = scoreResponse({ items: [], scoring: { method: 'formula', formula: formula } }, {}); }
  catch (e) { error = e.message; }
  ok(!error && result && result.total === null && result.cut === null && result.invalid === true && result.invalidReason === 'unknown_formula',
    '未注册/继承公式安全返回 unknown_formula：' + formula, error || result);
});

console.log('\n【8】公式输入及关键预警遵从跳题可见性');
const formulaItems = [
  { id: 'gate', type: 'radio', exclude: true, options: [{ value: 0 }, { value: 1 }], skip: [{ values: [0], action: 'goto', target: 'inr' }] },
  { id: 'bili', type: 'number', min: 1, max: 1500 },
  { id: 'inr', type: 'number', min: 0.5, max: 15 },
  { id: 'cr', type: 'number', min: 10, max: 2000 },
  { id: 'dialysis', type: 'radio', options: [{ value: 0 }, { value: 1 }] },
];
const formulaScale = { items: formulaItems, scoring: { method: 'formula', formula: 'meld', criticalItems: ['bili'], criticalThreshold: 1 } };
const formulaAnswers = { gate: 0, bili: 17.1, inr: 1, cr: 88.4, dialysis: 0 };
r = scoreResponse(formulaScale, formulaAnswers);
ok(r.total === null && r.invalidReason === 'incomplete_inputs', '隐藏的胆红素旧答案不提供公式输入', r);
ok(r.flags.length === 0, '隐藏关键条目的旧答案不触发预警', r.flags);
ok(validateAnswers(formulaScale, { gate: 0, inr: 1, cr: 88.4, dialysis: 0 }).length === 0, '隐藏必答题仍无需提交');
r = scoreResponse(formulaScale, Object.assign({}, formulaAnswers, { gate: 1 }));
ok(r.total === 6 && r.flags.length === 1 && r.flags[0].itemId === 'bili', '可见公式输入照常计分并预警', r);
const endedScale = Object.assign({}, formulaScale, { items: [Object.assign({}, formulaItems[0], { skip: [{ values: [0], action: 'end' }] })].concat(formulaItems.slice(1)) });
r = scoreResponse(endedScale, formulaAnswers);
ok(r.ended === true && r.total === null && r.flags.length === 0, '提前结束后隐藏输入既不计分也不预警', r);

console.log('\n———————————————————————————————');
console.log('  计分有效性：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('———————————————————————————————\n');
process.exit(fail);
