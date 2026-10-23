'use strict';
/**
 * 数值分档与具名公式：边界、越界、缺失、公式黄金值。
 */
const path = require('node:path');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const S = require(path.join(__dirname, '..', 'lib', 'scoring.js'));

const bili = { id: 'bili', no: 1, type: 'number', min: 0, max: 1000, unit: 'μmol/L',
  bands: [{ lt: 34, score: 1 }, { lte: 50, score: 2 }, { score: 3 }] };
const alb = { id: 'alb', no: 2, type: 'number', min: 5, max: 70, unit: 'g/L',
  bands: [{ lt: 28, score: 3 }, { lte: 35, score: 2 }, { score: 1 }] };

console.log('\n【1】分档边界');
t.ok(S.itemScore(bili, 33.9) === 1, '33.9 < 34 → 1');
t.ok(S.itemScore(bili, 34) === 2, '恰好 34 → 2（lt 不含边界）');
t.ok(S.itemScore(bili, 50) === 2, '恰好 50 → 2（lte 含边界）');
t.ok(S.itemScore(bili, 50.1) === 3, '50.1 → 兜底 3');
t.ok(S.itemScore(alb, 27.9) === 3 && S.itemScore(alb, 28) === 2 && S.itemScore(alb, 35) === 2 && S.itemScore(alb, 36) === 1,
  '递减方向（白蛋白）边界正确');
t.ok(S.itemScore(bili, '40') === 2, '字符串数字也能分档');

console.log('\n【2】越界与缺失');
t.ok(S.itemScore(bili, -1) === null, '低于 min → 无效');
t.ok(S.itemScore(bili, 1001) === null, '高于 max → 无效');
t.ok(S.itemScore(bili, '') === null && S.itemScore(bili, undefined) === null, '未填 → null');
const scale = { items: [bili, alb], dimensions: [{ id: 'total', name: '总分', items: ['bili', 'alb'] }],
  scoring: { method: 'sum', cutoffs: [{ max: 3, label: '低' }, { max: 6, label: '高' }] } };
const r1 = S.scoreResponse(scale, { bili: 40, alb: 30 });
t.ok(r1.total === 4 && r1.cut.label === '高', '分档后求和 2+2=4', r1);
const r2 = S.scoreResponse(scale, { bili: 2000, alb: 30 });
t.ok(r2.total === null && r2.invalid === true && r2.invalidReason === 'invalid_value', '越界值使总分无效，不静默计分', r2);

console.log('\n【3】越界提示文案');
const errs = S.validateAnswers(scale, { bili: 2000, alb: 30 });
t.ok(errs.length === 1 && /超出合理范围/.test(errs[0].message) && /核对/.test(errs[0].message) && /μmol\/L/.test(errs[0].message),
  '提示「超出合理范围…请核对」并带单位', errs);

console.log('\n【4】MELD 黄金值（UNOS 公式，μmol/L 输入）');
function meldScale(formula) {
  const items = [
    { id: 'bili', no: 1, type: 'number', min: 1, max: 1500 },
    { id: 'inr', no: 2, type: 'number', min: 0.5, max: 15 },
    { id: 'cr', no: 3, type: 'number', min: 10, max: 2000 },
    { id: 'dialysis', no: 4, type: 'radio', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] },
  ];
  if (formula === 'meld-na') items.push({ id: 'na', no: 5, type: 'number', min: 100, max: 180 });
  return { items: items, dimensions: [], scoring: { method: 'formula', formula: formula, cutoffs: [{ max: 9, label: '低' }, { max: 40, label: '高' }] } };
}
const M = meldScale('meld');
t.ok(S.scoreResponse(M, { bili: 17.1, inr: 1, cr: 88.4, dialysis: 0 }).total === 6, '全部正常值 → 6（下限）');
t.ok(S.scoreResponse(M, { bili: 8, inr: 0.9, cr: 50, dialysis: 0 }).total === 6, '低于 1.0 的取 1.0 → 6');
t.ok(S.scoreResponse(M, { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0 }).total === 25, '胆红素 3、INR 2、肌酐 2 mg/dL → 25');
t.ok(S.scoreResponse(M, { bili: 51.3, inr: 2, cr: 132.6, dialysis: 1 }).total === 32, '透析者肌酐按 4.0 → 32');
t.ok(S.scoreResponse(M, { bili: 513, inr: 5, cr: 442, dialysis: 0 }).total === 40, '超过 40 封顶');
const rm = S.scoreResponse(M, { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0 });
t.ok(rm.cut && rm.cut.label === '高', 'formula 结果同样走分级', rm.cut);

console.log('\n【5】MELD-Na 与缺失');
const MN = meldScale('meld-na');
t.ok(S.scoreResponse(MN, { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0, na: 130 }).total === 28, 'MELD 25 + Na 130 → 28');
t.ok(S.scoreResponse(MN, { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0, na: 120 }).total === 31, 'Na 低于 125 按 125 → 31');
t.ok(S.scoreResponse(MN, { bili: 17.1, inr: 1, cr: 88.4, dialysis: 0, na: 125 }).total === 6, 'MELD(i)≤11 不做钠校正 → 6');
const miss = S.scoreResponse(MN, { bili: 51.3, inr: 2, dialysis: 0, na: 130 });
t.ok(miss.total === null && miss.invalid === true && miss.invalidReason === 'incomplete_inputs', '缺肌酐 → 无效', miss);
const oor = S.scoreResponse(M, { bili: 51.3, inr: 2, cr: 5000, dialysis: 0 });
t.ok(oor.total === null && oor.invalid === true, '越界输入 → 无效', oor);
t.ok(typeof S.FORMULAS.meld === 'function' && typeof S.FORMULAS['meld-na'] === 'function', '导出公式表');

console.log('\n【6】Glasgow-Blatchford 黄金值（mmol/L、g/L）');
const GBS = {
  items: [
    { id: 'sex', type: 'radio', options: [{ label: '女', value: 0 }, { label: '男', value: 1 }] },
    { id: 'urea', type: 'number', min: 0, max: 60 }, { id: 'hb', type: 'number', min: 20, max: 250 },
    { id: 'sbp', type: 'number', min: 30, max: 300 }, { id: 'pulse', type: 'number', min: 20, max: 250 },
    ...['melena', 'syncope', 'liver', 'cardiac'].map(function (id) {
      return { id: id, type: 'radio', options: [{ label: '否', value: 0 }, { label: '是', value: 1 }] };
    }),
  ], dimensions: [], scoring: { method: 'formula', formula: 'glasgow-blatchford',
    cutoffs: [{ max: 1, label: '极低风险' }, { max: 23, label: '需要院内评估' }] },
};
const lowGbs = { sex: 1, urea: 6, hb: 140, sbp: 120, pulse: 80, melena: 0, syncope: 0, liver: 0, cardiac: 0 };
t.ok(S.scoreResponse(GBS, lowGbs).total === 0, '男性尿素<6.5、Hb≥130、生命体征正常、无症状 = GBS 0');
t.ok(S.scoreResponse(GBS, lowGbs).cut.label === '极低风险', 'GBS 0 为极低风险');
const maxGbs = { sex: 1, urea: 30, hb: 80, sbp: 80, pulse: 120, melena: 1, syncope: 1, liver: 1, cardiac: 1 };
t.ok(S.scoreResponse(GBS, maxGbs).total === 23, '男性各项最重 = GBS 23');
t.ok(S.scoreResponse(GBS, { sex: 0, urea: 7, hb: 110, sbp: 105, pulse: 100, melena: 1, syncope: 0, liver: 0, cardiac: 0 }).total === 6,
  '女性独立手算：尿素2 + Hb1 + SBP1 + 心率1 + 黑便1 = 6', S.scoreResponse(GBS, { sex: 0, urea: 7, hb: 110, sbp: 105, pulse: 100, melena: 1, syncope: 0, liver: 0, cardiac: 0 }));
t.ok(typeof S.FORMULAS['glasgow-blatchford'] === 'function', 'GBS公式注册');

console.log('\n【7】均分计分支持 multiplier（ODI 百分分）');
const meanScale = {
  items: [{ id: 'm1', type: 'radio', options: [{ label: '0', value: 0 }, { label: '5', value: 5 }] },
    { id: 'm2', type: 'radio', options: [{ label: '0', value: 0 }, { label: '5', value: 5 }] }],
  dimensions: [], scoring: { method: 'mean', multiplier: 20 },
};
t.ok(S.scoreResponse(meanScale, { m1: 5, m2: 5 }).total === 100, '均分 5 × 20 = 100', S.scoreResponse(meanScale, { m1: 5, m2: 5 }));
t.ok(S.scoreResponse(meanScale, { m1: 0, m2: 5 }).total === 50, '均分 2.5 × 20 = 50');

console.log('\n【8】选项「不适用」：不计分，也不进分母');
function odiItem(id) {
  return { id: id, type: 'radio', options: [
    { label: id + ' 0', value: 0 }, { label: id + ' 1', value: 1 }, { label: id + ' 2', value: 2 },
    { label: id + ' 3', value: 3 }, { label: id + ' 4', value: 4 }, { label: id + ' 5', value: 5 },
    { label: '不适用', value: 'na', na: true }] };
}
const odiIds = [];
for (let i = 1; i <= 10; i += 1) odiIds.push('o' + i);
const ODI = {
  items: odiIds.map(odiItem),
  dimensions: [{ id: 'total', name: '总分', items: odiIds }],
  scoring: { method: 'mean', multiplier: 20, cutoffs: [{ max: 40, label: '中度以下' }, { max: 100, label: '重度' }] },
};
const odiAllMax = {};
odiIds.forEach(function (id) { odiAllMax[id] = 5; });
t.ok(S.scoreResponse(ODI, odiAllMax).total === 100, 'ODI 十项全选最高分 = 100%');
const odiOneNa = Object.assign({}, odiAllMax, { o7: 'na' });
const rOneNa = S.scoreResponse(ODI, odiOneNa);
t.ok(rOneNa.total === 100 && rOneNa.invalid !== true, '一项标为不适用后仍按剩余 9 项折算 = 100%', rOneNa);
t.ok(rOneNa.dimensions.total.score === 100, '维度分同样排除不适用项', rOneNa.dimensions.total);
const odiHalfNa = {};
odiIds.forEach(function (id, i) { odiHalfNa[id] = i < 4 ? 4 : 'na'; });
t.ok(S.scoreResponse(ODI, odiHalfNa).total === 80, '4 项各 4 分、6 项不适用 → 均分 4 × 20 = 80', S.scoreResponse(ODI, odiHalfNa));
t.ok(S.validateAnswers(ODI, odiOneNa).length === 0, '「不适用」是合法选项，提交校验放行', S.validateAnswers(ODI, odiOneNa));
const odiAllNa = {};
odiIds.forEach(function (id) { odiAllNa[id] = 'na'; });
t.ok(S.scoreResponse(ODI, odiAllNa).total === null, '全部不适用时不产出总分');

console.log('\n【9】IPAQ-SF MET-min/周 公式');
const ipaqItems = [
  { id: 'v_days', type: 'number', min: 0, max: 7 }, { id: 'v_min', type: 'number', min: 0, max: 1440 },
  { id: 'm_days', type: 'number', min: 0, max: 7 }, { id: 'm_min', type: 'number', min: 0, max: 1440 },
  { id: 'w_days', type: 'number', min: 0, max: 7 }, { id: 'w_min', type: 'number', min: 0, max: 1440 },
  { id: 's_days', type: 'number', min: 0, max: 7 }, { id: 's_min', type: 'number', min: 0, max: 1440 },
];
const IPAQ = { items: ipaqItems, dimensions: [],
  scoring: { method: 'formula', formula: 'ipaq-met',
    cutoffs: [{ max: 599, label: '活动量低' }, { max: 3000, label: '活动量中等' }, { max: 99999, label: '活动量高' }] } };
const ipaqMixed = { v_days: 3, v_min: 30, m_days: 5, m_min: 30, w_days: 7, w_min: 30, s_days: 7, s_min: 300 };
t.ok(S.scoreResponse(IPAQ, ipaqMixed).total === 2013,
  '剧烈 3×30×8 + 中等 5×30×4 + 步行 7×30×3.3 = 720+600+693 = 2013', S.scoreResponse(IPAQ, ipaqMixed));
t.ok(S.scoreResponse(IPAQ, ipaqMixed).cut.label === '活动量中等', '2013 MET-min/周落在中等档');
t.ok(S.scoreResponse(IPAQ, { v_days: 0, v_min: 0, m_days: 0, m_min: 0, w_days: 0, w_min: 0, s_days: 5, s_min: 600 }).total === 0,
  '只久坐不活动 → 活动量 0（久坐单独计，不计入活动 MET）');
t.ok(S.scoreResponse(IPAQ, { v_days: 7, v_min: 60, m_days: 7, m_min: 60, w_days: 7, w_min: 60, s_days: 0, s_min: 0 }).total === 6426,
  '逐项核对：8×420 + 4×420 + 3.3×420 = 3360+1680+1386 = 6426', S.scoreResponse(IPAQ, { v_days: 7, v_min: 60, m_days: 7, m_min: 60, w_days: 7, w_min: 60, s_days: 0, s_min: 0 }));
t.ok(S.scoreResponse(IPAQ, { v_days: 3, v_min: 30, m_days: 5, m_min: 30, w_days: 7, s_days: 7, s_min: 300 }).total === null,
  '缺步行时长 → 不静默按 0 计算');

console.log('\n【10】QuickDASH 0-100 公式');
const qdIds = [];
for (let i = 1; i <= 11; i += 1) qdIds.push('d' + i);
const QD = { items: qdIds.map(function (id) {
    return { id: id, type: 'radio', options: [1, 2, 3, 4, 5].map(function (v) { return { label: String(v), value: v }; }) };
  }),
  dimensions: [], scoring: { method: 'formula', formula: 'quickdash' } };
const qdAll1 = {}; const qdAll5 = {}; const qdAll2 = {};
qdIds.forEach(function (id) { qdAll1[id] = 1; qdAll5[id] = 5; qdAll2[id] = 2; });
t.ok(S.scoreResponse(QD, qdAll1).total === 0, '11 项全部「没有困难」= 0 分');
t.ok(S.scoreResponse(QD, qdAll5).total === 100, '11 项全部「极严重」= 100 分');
t.ok(S.scoreResponse(QD, qdAll2).total === 25, '均分 2 →（2-1)/4×100 = 25', S.scoreResponse(QD, qdAll2));
const qdMissing = Object.assign({}, qdAll2); delete qdMissing.d11;
t.ok(S.scoreResponse(QD, qdMissing).total === null && S.scoreResponse(QD, qdMissing).invalid === true,
  'QuickDASH 要求 11 项全部作答，缺项不折算');

process.exit(t.done('分档与公式计分'));
