'use strict';
/**
 * 量表黄金值：每个修正过或新增的量表至少一条，取自原始文献示例或按原文规则手算。
 * 每条用例的 note 写明出处，方便复核。
 */
const path = require('node:path');
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));
const { scoreResponse, validateAnswers } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));
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
      return { hbi1: 4, hbi2: 3, hbi3: 25, hbi4: 3,
        hbi5: ['arthralgia', 'uveitis', 'erythema', 'aphthous', 'pyoderma', 'fissure', 'fistula', 'abscess'] };
    }, total: 43, cut: '重度活动', note: 'Harvey-Bradshaw：稀便逐次计分，25 次 + 10 分 + 8 种并发症，无固定总分上限' },
  { code: 'hbi', answers: function () {
      return { hbi1: 0, hbi2: 0, hbi3: 7, hbi4: 0, hbi5: ['none'] };
    }, total: 7, cut: '轻度活动', note: '昨日 7 次稀便直接计 7 分，不得分档压成 3 分' },
  { code: 'wexner', answers: function () {
      return { wex1: 4, wex2: 4, wex3: 4, wex4: 4, wex5: 4, wex6: 2, wex7: 4, wex8: 4 };
    }, total: 30, cut: '重度便秘', note: 'Agachan 1996：七项 0-4，辅助排便项 0-2，总分 0-30；病程以年计' },
  { code: 'wexner', answers: function () {
      return { wex1: 0, wex2: 0, wex3: 0, wex4: 0, wex5: 0, wex6: 3, wex7: 0, wex8: 0 };
    }, total: null, cut: null, note: '辅助排便没有 3 分档，非法分值不得产生结果' },
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
  { code: 'news2', answers: function () {
      return { rr: 30, spo2: 98, oxygen: 0, temp: 37, sbp: 120, pulse: 70, acvpu: 0 };
    }, total: 3, cut: '单项预警', note: 'RCP NEWS2 2017第32页：任一参数3分需临床急评，不能显示低风险' },
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
  { code: 'ces-d', answers: function (s) { return allAs(s, 0); }, total: 0, cut: '未达筛查界值',
    note: 'Radloff 1977：全部 0 分 = 0' },
  { code: 'ces-d', answers: function (s) { return allAs(s, 3); }, total: 60, cut: '可能存在抑郁症状',
    note: 'Radloff 1977：20 项各 3 分 = 60（≥16 提示抑郁症状）' },
  { code: 'sppb', answers: function () { return { balance: 4, gait: 4.5, chair: 10 }; }, total: 12, cut: '身体功能良好',
    note: 'Guralnik 1994：串联站立满 10 秒、步行 <4.82 秒、起坐 ≤11.19 秒 = 12 分' },
  { code: 'sppb', answers: function () { return { balance: 0, gait: 0, chair: 0 }; }, total: 0, cut: '身体功能差',
    note: 'Guralnik 1994：三项均无法完成 = 0 分' },
  { code: 'sppb', answers: function () { return { balance: 2, gait: 8.71, chair: 60.01 }; }, total: 3, cut: '身体功能差',
    note: 'SPPB原始评分表：串联不足3秒=2；步行>8.70=1；起坐>60秒=0' },
  { code: 'sppb', answers: function () { return { balance: 3, gait: 8.70, chair: 16.70 }; }, total: 6, cut: '身体功能差',
    note: 'SPPB原始评分表：串联3–9.99秒=3；8.70秒步行=2；16.70秒起坐=1' },
  { code: 'ndi', answers: function (s) { return allAs(s, 0); }, total: 0, cut: '无功能障碍',
    note: 'Vernon 1991：原始分0–4（百分分0–8）无功能障碍，不能判为轻度障碍' },
  { code: 'ndi', answers: function (s) { return allAs(s, 1); }, total: 20, cut: '轻度障碍',
    note: 'NDI原始分10，百分分20：原始5–14为轻度，而非每20%一档' },
  { code: 'ndi', answers: function (s) { return allAs(s, 5); }, total: 100, cut: '完全受限',
    note: 'Vernon 1991：10 项各 5 分 = 50 × 2 = 100%' },
  { code: 'nihss', answers: function () {
      return { n1a: 0, n1b: 0, n1c: 0, n2: 0, n3: 0, n4: 0, n5a: 0, n5b: 0, n6a: 0, n6b: 0, n7: 0, n8: 0, n9: 0, n10: 0, n11: 0 };
    }, total: 0, cut: '未检出神经功能缺损', note: 'NINDS NIHSS：15 个计分项目，均正常为0，不排除卒中' },
  { code: 'nihss', answers: function () {
      return { n1a: 3, n1b: 2, n1c: 2, n2: 2, n3: 3, n4: 3, n5a: 4, n5b: 4, n6a: 4, n6b: 4, n7: 2, n8: 2, n9: 3, n10: 2, n11: 2 };
    }, total: 42, cut: '重度神经功能缺损', note: 'NINDS NIHSS：逐项数值最大值合计42，此为结构极值并非临床示例' },
  { code: 'nihss', answers: function () {
      return { n1a: 0, n1b: 0, n1c: 0, n2: 0, n3: 0, n4: 1, n5a: 2, n5b: 0, n6a: 1, n6b: 0, n7: 0, n8: 1, n9: 0, n10: 1, n11: 0 };
    }, total: 6, cut: '中度神经功能缺损', note: 'NIHSS独立手算：面瘫1+左臂2+左腿1+感觉1+构音1=6' },
  { code: 'sofa', answers: function () {
      return { resp: 0, coag: 0, liver: 0, cardio: 0, cns: 0, renal: 0 };
    }, total: 0, cut: null, note: 'Vincent 1996：六系统正常均0分；绝对分不作临床分级' },
  { code: 'sofa', answers: function () {
      return { resp: 4, coag: 4, liver: 4, cardio: 4, cns: 4, renal: 4 };
    }, total: 24, cut: null, note: 'Vincent 1996：六系统均4分，总分24；绝对分不作临床分级' },
  { code: 'sofa', answers: function () {
      return { resp: 0, coag: 0, liver: 0, cardio: 0, cns: 2, renal: 0 };
    }, total: 2, cut: null, note: 'Sepsis-3：需与基线比较增加≥2；平台缺少基线，不能按绝对分判器官功能障碍' },
  { code: 'geneva-revised', answers: function () {
      return { age65: 1, prior: 3, surgery: 2, cancer: 2, legpain: 3, hemoptysis: 2, hr: 5, edema: 4 };
    }, total: 22, cut: '高度可能', note: 'Le Gal 2006：8项均阳性且心率≥95，合计22' },
  { code: 'geneva-revised', answers: function () {
      return { age65: 0, prior: 0, surgery: 0, cancer: 0, legpain: 0, hemoptysis: 0, hr: 3, edema: 0 };
    }, total: 3, cut: '低度可能', note: '改良Geneva：只有心率75–94计3分，仍为低度可能' },
  { code: 'glasgow-blatchford', answers: function () {
      return { sex: 1, urea: 30, hb: 80, sbp: 80, pulse: 120, melena: 1, syncope: 1, liver: 1, cardiac: 1 };
    }, total: 23, cut: '需要院内评估', note: 'Blatchford 2000：男性各项最重合计23' },
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

const wexnerZeroFrequency = T('wexner').items.find(function (it) { return it.id === 'wex1'; }).options
  .find(function (option) { return option.value === 0; });
t.ok(wexnerZeroFrequency && wexnerZeroFrequency.label === '每1–2天1–2次',
  'Wexner排便频率0分描述为每1–2天1–2次', wexnerZeroFrequency);

const hbiExclusiveAnswers = { hbi1: 0, hbi2: 0, hbi3: 0, hbi4: 0, hbi5: ['none', 'arthralgia'] };
t.ok(validateAnswers(T('hbi'), hbiExclusiveAnswers).some(function (e) { return e.itemId === 'hbi5'; }),
  'HBI“无”不能与关节痛同时选择');
const hbiExclusiveResult = scoreResponse(T('hbi'), hbiExclusiveAnswers);
t.ok(hbiExclusiveResult.total === null && hbiExclusiveResult.invalid === true,
  'HBI互斥冲突不产出总分', hbiExclusiveResult);

['ss6', 'ss7'].forEach(function (id) {
  const item = T('ssrs').items.find(function (it) { return it.id === id; });
  const answers = {};
  answers[id] = [0, 1];
  t.ok(validateAnswers({ items: [item] }, answers).length === 1 && scoreResponse({ items: [item], scoring: { method: 'sum' } }, answers).total === null,
    'SSRS ' + id + '“无任何来源”不能与实际来源同时选择');
});

const wexnerDuration = T('wexner').items.find(function (it) { return it.id === 'wex8'; })
  .options.map(function (o) { return o.label; });
t.ok(JSON.stringify(wexnerDuration) === JSON.stringify(['<1年', '1–<5年', '5–<10年', '10–<20年', '≥20年']),
  'Wexner病程选项互不重叠且覆盖1年以内到20年以上', wexnerDuration);

t.ok(!(T('sofa').scoring.cutoffs || []).length, 'SOFA不按绝对总分作临床分级');

['n5a', 'n5b', 'n6a', 'n6b', 'n7', 'n10'].forEach(function (id) {
  const tpl = T('nihss');
  const answers = allAs(tpl, 0);
  answers[id] = 'un';
  t.ok(validateAnswers(tpl, answers).length === 0, 'NIHSS允许记录' + id + '无法评估，避免强迫猜分');
  const result = scoreResponse(tpl, answers);
  t.ok(result.total === null && result.invalid === true, 'NIHSS的UN不能被当成0分或产出完整总分');
});

process.exit(t.done('量表黄金值'));
