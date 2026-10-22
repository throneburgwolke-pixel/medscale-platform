'use strict';
/**
 * 量表库 · 临床风险评分
 * 由医护或评估者填写：分级条目按「越重分越高」或「越重分越低」分别取档。
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* ---------------- Child-Pugh 肝功能分级 ---------------- */
const CHILD_PUGH = {
  code: 'child-pugh',
  title: 'Child-Pugh 肝功能分级',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '用胆红素、白蛋白、INR、腹水、肝性脑病五项评估慢性肝病肝功能储备：5-6 分为 A 级、7-9 分为 B 级、10-15 分为 C 级。',
  instructions: '请评估者按最近一次检查结果填写，数值取自化验单，腹水与肝性脑病按实际程度选择。',
  source: 'Pugh RN, Murray-Lyon IM, Dawson JL, et al. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg. 1973;60(8):646-649.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['肝硬化', '肝功能', '5项', '评估者填写'],
  items: numbered([
    q('bili', '总胆红素', 'number', null, { unit: 'μmol/L', min: 1, max: 1500,
      hint: '<34 计 1 分；34-50 计 2 分；>50 计 3 分',
      bands: [{ lt: 34, score: 1 }, { lte: 50, score: 2 }, { score: 3 }] }),
    q('alb', '血清白蛋白', 'number', null, { unit: 'g/L', min: 5, max: 70,
      hint: '<28 计 3 分；28-35 计 2 分；>35 计 1 分',
      bands: [{ lt: 28, score: 3 }, { lte: 35, score: 2 }, { score: 1 }] }),
    q('inr', '国际标准化比值（INR）', 'number', null, { min: 0.5, max: 15,
      hint: '<1.7 计 1 分；1.7-2.3 计 2 分；>2.3 计 3 分',
      bands: [{ lt: 1.7, score: 1 }, { lte: 2.3, score: 2 }, { score: 3 }] }),
    q('ascites', '腹水', 'radio', [
      { label: '无', value: 1 },
      { label: '轻度（经利尿剂控制）', value: 2 },
      { label: '中重度（利尿剂难治）', value: 3 },
    ]),
    q('he', '肝性脑病', 'radio', [
      { label: '无', value: 1 },
      { label: '1-2 级（经药物控制）', value: 2 },
      { label: '3-4 级（难治）', value: 3 },
    ]),
  ]),
  dimensions: [dim('total', 'Child-Pugh 总分', ['bili', 'alb', 'inr', 'ascites', 'he'])],
  scoring: {
    method: 'sum',
    totalRange: [5, 15],
    cutoffs: [
      { max: 6, label: 'A 级', level: 'normal', advice: '肝功能代偿良好，手术耐受性较好。' },
      { max: 9, label: 'B 级', level: 'moderate', advice: '肝功能中度受损，用药与手术需评估风险。' },
      { max: 15, label: 'C 级', level: 'severe', advice: '肝功能失代偿，预后差，建议专科评估。' },
    ],
  },
};

/* ---------------- MELD / MELD-Na ---------------- */
function meldItems(withNa) {
  const items = [
    q('bili', '总胆红素', 'number', null, { unit: 'μmol/L', min: 1, max: 1500,
      hint: '换算 mg/dL = μmol/L ÷ 17.1，低于 1.0 mg/dL 时按 1.0 计算' }),
    q('inr', '国际标准化比值（INR）', 'number', null, { min: 0.5, max: 15,
      hint: '低于 1.0 时按 1.0 计算' }),
    q('cr', '血肌酐', 'number', null, { unit: 'μmol/L', min: 10, max: 2000,
      hint: '换算 mg/dL = μmol/L ÷ 88.4；低于 1.0 按 1.0、高于 4.0 按 4.0；透析者按 4.0' }),
    q('dialysis', '过去一周内透析 ≥2 次（或 24 小时内连续血液透析）', 'radio', [
      { label: '是', value: 1 },
      { label: '否', value: 0 },
    ]),
  ];
  if (withNa) items.push(q('na', '血钠', 'number', null, { unit: 'mmol/L', min: 100, max: 180,
    hint: '低于 125 按 125、高于 137 按 137；仅当 MELD(i) > 11 时参与校正' }));
  return numbered(items);
}

const MELD_CUTS = [
  { max: 9, label: '<10 分', level: 'normal', advice: '3 个月死亡风险较低。' },
  { max: 19, label: '10-19 分', level: 'mild', advice: '3 个月死亡风险升高。' },
  { max: 29, label: '20-29 分', level: 'moderate', advice: '3 个月死亡风险明显升高，建议评估肝移植。' },
  { max: 40, label: '≥30 分', level: 'severe', advice: '3 个月死亡风险很高。' },
];

const MELD = {
  code: 'meld',
  title: 'MELD 终末期肝病模型评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '由总胆红素、INR、血肌酐计算的终末期肝病严重程度评分（6-40 分），用于肝移植优先级与短期预后评估。',
  instructions: '请评估者按同一天的化验结果填写；胆红素与肌酐单位为 μmol/L。',
  source: 'Kamath PS, Wiesner RH, Pombra S, et al. A model to predict survival in patients with end-stage liver disease. Hepatology. 2001;33(2):464-470；MELD 计算与截断规则见 OPTN/UNOS 肝移植政策。',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['肝硬化', '肝移植', '公式计分', '评估者填写'],
  items: meldItems(false),
  dimensions: [],
  scoring: { method: 'formula', formula: 'meld', totalRange: [6, 40], cutoffs: MELD_CUTS },
};

const MELD_NA = {
  code: 'meld-na',
  title: 'MELD-Na 评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '在 MELD 基础上加入血钠校正（UNOS 2016），低钠血症患者的短期死亡风险预测更准确。',
  instructions: '请评估者按同一天的化验结果填写；胆红素与肌酐单位为 μmol/L，血钠单位为 mmol/L。',
  source: 'Kim WR, Bigler RN, Kremers WK, et al. Hyponatremia and mortality among patients waiting for liver transplantation. N Engl J Med. 2008;359(10):1018-1026；UNOS MELD-Na 计算规则。',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['肝硬化', '肝移植', '公式计分', '低钠血症', '评估者填写'],
  items: meldItems(true),
  dimensions: [],
  scoring: { method: 'formula', formula: 'meld-na', totalRange: [6, 40], cutoffs: MELD_CUTS },
};

module.exports = [CHILD_PUGH, MELD, MELD_NA];
