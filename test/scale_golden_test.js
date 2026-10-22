'use strict';
/**
 * 量表黄金值：每个修正过或新增的量表至少一条，取自原始文献示例或按原文规则手算。
 * 每条用例的 note 写明出处，方便复核。
 */
const path = require('node:path');
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));
const { scoreResponse } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();

function T(code) { return TEMPLATES.find(function (x) { return x.code === code; }); }
function allAs(tpl, v) { const a = {}; tpl.items.forEach(function (it) { a[it.id] = v; }); return a; }

const CASES = [
  { code: 'phq-9', answers: function (s) { return allAs(s, 2); }, total: 18, cut: '中重度抑郁',
    note: 'Kroenke 2001：15-19 为中重度抑郁' },
  { code: 'gad-7', answers: function (s) { return allAs(s, 1); }, total: 7, cut: '轻度焦虑',
    note: 'Spitzer 2006：5-9 为轻度焦虑' },
  { code: 'child-pugh', answers: function () { return { bili: 20, alb: 40, inr: 1.2, ascites: 1, he: 1 }; },
    total: 5, cut: 'A 级', note: 'Pugh 1973：五项最轻档合计 5 分为 A 级' },
  { code: 'child-pugh', answers: function () { return { bili: 34, alb: 35, inr: 1.7, ascites: 1, he: 1 }; },
    total: 8, cut: 'B 级', note: 'Pugh 1973：胆红素 34、白蛋白 35、INR 1.7 恰在 2 分档下界，合计 8 分为 B 级' },
  { code: 'child-pugh', answers: function () { return { bili: 51, alb: 27, inr: 2.4, ascites: 3, he: 3 }; },
    total: 15, cut: 'C 级', note: 'Pugh 1973：五项最重档合计 15 分为 C 级' },
  { code: 'meld', answers: function () { return { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0 }; },
    total: 25, cut: '20-29 分', note: 'OPTN/UNOS 2016：胆红素 3 mg/dL、INR 2、肌酐 2 mg/dL' },
  { code: 'meld-na', answers: function () { return { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0, na: 130 }; },
    total: 28, cut: '20-29 分', note: 'OPTN/UNOS 2016 血钠校正：MELD 25 + Na 130' },
  { code: 'dasi', answers: function (s) {
      const a = {};
      s.items.forEach(function (it) { a[it.id] = it.options[0].value; });
      return a;
    }, total: 58.2, cut: '运动耐量良好', note: 'Hlatky 1989：12 项全部能完成 = 58.2（性生活项权重 5.25）' },
  { code: 'hbi', answers: function () {
      return { hbi1: 4, hbi2: 3, hbi3: 4, hbi4: 3, hbi5: [1, 1, 1, 1, 1, 1, 1] };
    }, total: 21, cut: '重度活动', note: 'Harvey-Bradshaw 1980：五项最重档合计 21 分' },
  { code: 'wexner', answers: function (s) {
      const a = {};
      s.items.forEach(function (it) { a[it.id] = 4; });
      return a;
    }, total: 32, cut: '重度便秘', note: 'Agachan 1996：8 项各 4 分 = 32（原文样本中最高 30）' },
  { code: 'who-5', answers: function (s) { return allAs(s, 0); }, total: 0, cut: '幸福感很低',
    note: 'WHO-5：原始分 0 ×4 = 0，≤28 提示抑郁筛查阳性' },
  { code: 'nrs-2002', answers: function () { return { nrs1: 1, nrs2: 1, nrs3: 1 }; }, total: 3, cut: '存在营养风险',
    note: 'Kondrup 2003：总分 3 分起存在营养风险' },
  { code: 'nrs-2002', answers: function () { return { nrs1: 3, nrs2: 3, nrs3: 1 }; }, total: 7, cut: '高营养风险',
    note: 'Kondrup 2003：总分 ≥5 为高营养风险' },
  { code: 'cha2ds2-vasc', answers: function () {
      return { chf: 1, htn: 1, age: 2, dm: 1, stroke: 2, vascular: 1, female: 1 };
    }, total: 9, cut: '高危', note: 'Lip 2010：各项均阳性合计 9 分' },
  { code: 'has-bled', answers: function (s) {
      const a = {};
      s.items.forEach(function (it) { a[it.id] = 1; });
      return a;
    }, total: 9, cut: '高出血风险', note: 'Pisters 2010：9 项各 1 分' },
  { code: 'curb-65', answers: function () { return { confusion: 1, urea: 10, rr: 32, bp: 1, age: 70 }; },
    total: 5, cut: '高危', note: 'Lim 2003：5 项均阳性 = 5 分' },
  { code: 'curb-65', answers: function () { return { confusion: 0, urea: 5, rr: 18, bp: 0, age: 40 }; },
    total: 0, cut: '低危', note: 'Lim 2003：全部阴性 = 0 分（可门诊）' },
  { code: 'qsofa', answers: function () { return { rr: 25, sbp: 80, gcs: 10 }; },
    total: 3, cut: '高风险', note: 'Sepsis-3：三项均阳性 = 3 分' },
  { code: 'wells-dvt', answers: function () {
      return { cancer: 1, bedridden: 1, calf: 1, collateral: 1, legswollen: 1, tenderness: 1, edema: 1, paralysis: 1, prior: 1, alt: 0 };
    }, total: 9, cut: '很可能', note: 'Wells 1997：9 项阳性 = 9 分' },
  { code: 'wells-dvt', answers: function () {
      return { cancer: 0, bedridden: 0, calf: 0, collateral: 0, legswollen: 0, tenderness: 0, edema: 0, paralysis: 0, prior: 0, alt: -2 };
    }, total: -2, cut: '不太可能', note: 'Wells 1997：其他诊断更可能计 -2 分' },
  { code: 'wells-pe', answers: function () {
      return { dvtsigns: 3, pefirst: 3, hr: 1.5, immobile: 1.5, prior: 1.5, hemoptysis: 1, malignancy: 1 };
    }, total: 12.5, cut: '高度可能', note: 'Wells 2000：7 项均阳性 = 12.5 分' },
  { code: 'news2', answers: function () {
      return { rr: 16, spo2: 98, oxygen: 0, temp: 37, sbp: 120, pulse: 70, acvpu: 0 };
    }, total: 0, cut: '低风险', note: 'RCP 2017：全部参数正常 = 0 分' },
  { code: 'news2', answers: function () {
      return { rr: 30, spo2: 88, oxygen: 2, temp: 34, sbp: 85, pulse: 200, acvpu: 3 };
    }, total: 20, cut: '高风险', note: 'RCP 2017：各参数均在最重档 = 20 分' },
  { code: 'padua', answers: function (s) {
      const a = {};
      s.items.forEach(function (it) { a[it.id] = it.options[1].value; });
      return a;
    }, total: 20, cut: '高危', note: 'Barbar 2010：11 项均阳性 = 20 分（≥4 为高危）' },
  { code: 'padua', answers: function (s) {
      const a = {};
      s.items.forEach(function (it) { a[it.id] = 0; });
      return a;
    }, total: 0, cut: '低危', note: 'Barbar 2010：全部阴性 = 0 分' },
  { code: 'epds', answers: function (s) { return allAs(s, 1); }, total: 10, cut: '可能存在抑郁',
    note: 'Cox 1987：10 项各 1 分 = 10（≥10 提示可能存在抑郁）' },
  { code: 'epds', answers: function (s) { return allAs(s, 3); }, total: 30, cut: '很可能抑郁',
    note: 'Cox 1987：10 项各 3 分 = 30（≥13 很可能抑郁）' },
  { code: 'ces-d', answers: function (s) { return allAs(s, 0); }, total: 0, cut: '未达筛查界值',
    note: 'Radloff 1977：全部 0 分 = 0' },
  { code: 'ces-d', answers: function (s) { return allAs(s, 3); }, total: 60, cut: '可能存在抑郁症状',
    note: 'Radloff 1977：20 项各 3 分 = 60（≥16 提示抑郁症状）' },
  { code: 'sppb', answers: function () { return { balance: 4, gait: 4.5, chair: 10 }; }, total: 12, cut: '身体功能良好',
    note: 'Guralnik 1994：单腿站立 10 秒、步速 <4.82 秒、起坐 <11.2 秒 = 12 分' },
  { code: 'sppb', answers: function () { return { balance: 0, gait: 0, chair: 0 }; }, total: 0, cut: '身体功能差',
    note: 'Guralnik 1994：三项均无法完成 = 0 分' },
  { code: 'ndi', answers: function (s) { return allAs(s, 0); }, total: 0, cut: '轻度障碍',
    note: 'Vernon 1991：全部 0 分 = 0%' },
  { code: 'ndi', answers: function (s) { return allAs(s, 5); }, total: 100, cut: '完全受限',
    note: 'Vernon 1991：10 项各 5 分 = 50 × 2 = 100%' },
  { code: 'ecog', answers: function (s) { return allAs(s, 1); }, total: 1, cut: '1 级：轻体力活动受限',
    note: 'Oken 1982：ECOG 1 级' },
  { code: 'kps', answers: function (s) { return allAs(s, 100); }, total: 100, cut: '正常',
    note: 'Karnofsky 1949：KPS 100' },
  { code: 'medas', answers: function (s) { return allAs(s, 1); }, total: 14, cut: '依从性高',
    note: 'Estruch 2013：14 项均达标 = 14 分（≥9 为高依从）' },
  { code: 'medas', answers: function (s) { return allAs(s, 0); }, total: 0, cut: '依从性低',
    note: 'Estruch 2013：14 项均不达标 = 0 分' },
];

console.log('\n【黄金值】' + CASES.length + ' 条');
CASES.forEach(function (c) {
  const tpl = T(c.code);
  if (!tpl) { t.ok(false, c.code + ' 模板存在'); return; }
  const r = scoreResponse(tpl, c.answers(tpl));
  t.ok(r.total === c.total, c.code + ' 总分 ' + c.total + '（' + c.note + '）', r.total);
  if (c.cut !== undefined) t.ok((r.cut ? r.cut.label : null) === c.cut, c.code + ' 分级「' + c.cut + '」', r.cut);
});

process.exit(t.done('量表黄金值'));
