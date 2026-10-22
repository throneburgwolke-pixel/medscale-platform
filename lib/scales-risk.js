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

/* ---------------- CHA₂DS₂-VASc ---------------- */
const CHA2DS2 = {
  code: 'cha2ds2-vasc',
  title: 'CHA₂DS₂-VASc 房颤卒中风险评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '房颤患者卒中风险分层（0-9 分）：0 分低危、1 分中危、≥2 分高危，高危者通常建议口服抗凝。',
  instructions: '请评估者按患者当前诊断与病史逐项选择。',
  source: 'Lip GY, Nieuwlaat R, Pisters R, et al. Refining clinical risk stratification for predicting stroke and thromboembolism in atrial fibrillation using a novel risk factor-based approach: the euro heart survey on atrial fibrillation. Chest. 2010;137(2):263-272.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['房颤', '卒中', '抗凝', '评估者填写'],
  items: numbered([
    q('chf', '充血性心力衰竭 / 左室功能不全', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('htn', '高血压（或正在服用降压药）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('age', '年龄', 'radio', [{ label: '<65 岁', value: 0 }, { label: '65-74 岁', value: 1 }, { label: '≥75 岁', value: 2 }]),
    q('dm', '糖尿病', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('stroke', '卒中 / TIA / 血栓栓塞史', 'radio', [{ label: '无', value: 0 }, { label: '有（计 2 分）', value: 2 }]),
    q('vascular', '血管疾病（心梗、外周动脉病、主动脉斑块）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('female', '女性', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
  ]),
  dimensions: [dim('total', 'CHA₂DS₂-VASc 总分', ['chf', 'htn', 'age', 'dm', 'stroke', 'vascular', 'female'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 9],
    cutoffs: [
      { max: 0, label: '低危', level: 'normal', advice: '卒中风险低，通常无需抗凝（女性单项 1 分也属低危）。' },
      { max: 1, label: '中危', level: 'mild', advice: '建议结合出血风险与患者意愿，考虑口服抗凝。' },
      { max: 9, label: '高危', level: 'severe', advice: '卒中风险高，通常建议口服抗凝，并定期评估出血风险。' },
    ],
  },
};

/* ---------------- HAS-BLED ---------------- */
const HASBLED = {
  code: 'has-bled',
  title: 'HAS-BLED 出血风险评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '房颤抗凝患者的出血风险评分（0-9 分）：0-2 分低危、≥3 分高危。高危不是抗凝禁忌，而是提示纠正可控危险因素并加强随访。',
  instructions: '请评估者按患者当前情况逐项选择；每项 1 分。',
  source: 'Pisters R, Lane DA, Nieuwlaat R, et al. A novel user-friendly score (HAS-BLED) to assess 1-year risk of major bleeding in patients with atrial fibrillation. Chest. 2010;138(5):1093-1100.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['房颤', '出血风险', '抗凝', '评估者填写'],
  items: numbered([
    q('htn', '未控制的高血压（收缩压 >160 mmHg）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('renal', '肾功能异常（透析、肾移植或肌酐 >200 μmol/L）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('liver', '肝功能异常（肝硬化或胆红素 >2 倍上限 + 转氨酶 >3 倍上限）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('stroke', '卒中史', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('bleeding', '出血史或出血倾向', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('labile', 'INR 不稳定（TTR <60%）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('elderly', '年龄 >65 岁', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('drugs', '合并使用抗血小板药或 NSAIDs', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('alcohol', '酒精过量（≥8 单位/周）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
  ]),
  dimensions: [dim('total', 'HAS-BLED 总分', ['htn', 'renal', 'liver', 'stroke', 'bleeding', 'labile', 'elderly', 'drugs', 'alcohol'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 9],
    cutoffs: [
      { max: 2, label: '低出血风险', level: 'normal', advice: '出血风险较低，按卒中风险正常抗凝并定期复查。' },
      { max: 9, label: '高出血风险', level: 'severe', advice: '出血风险高：纠正可控因素（血压、合并用药、饮酒、INR 稳定性）并缩短随访间隔；不应仅因评分高而停用抗凝。' },
    ],
  },
};

/* ---------------- CURB-65 ---------------- */
const CURB65 = {
  code: 'curb-65',
  title: 'CURB-65 社区获得性肺炎严重度评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '社区获得性肺炎 30 天死亡风险分层（0-5 分）：0-1 分低危（可门诊）、2 分中危（考虑住院）、≥3 分高危（建议住院/重症评估）。',
  instructions: '请评估者按就诊时的情况填写；尿素以 mmol/L 计。',
  source: 'Lim WS, van der Eerden MM, Laing R, et al. Defining community acquired pneumonia severity on presentation to hospital: an international derivation and validation study. Thorax. 2003;58(5):377-382.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['肺炎', 'CAP', '严重度', '评估者填写'],
  items: numbered([
    q('confusion', '意识障碍（新发定向力障碍）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('urea', '血尿素', 'number', null, { unit: 'mmol/L', min: 0.5, max: 60,
      hint: '>7 mmol/L 计 1 分（BUN >19 mg/dL）',
      bands: [{ lte: 7, score: 0 }, { score: 1 }] }),
    q('rr', '呼吸频率', 'number', null, { unit: '次/分', min: 5, max: 80,
      hint: '≥30 次/分 计 1 分',
      bands: [{ lte: 29, score: 0 }, { score: 1 }] }),
    q('bp', '低血压（收缩压 <90 mmHg 或舒张压 ≤60 mmHg）', 'radio', [{ label: '无', value: 0 }, { label: '有', value: 1 }]),
    q('age', '年龄', 'number', null, { unit: '岁', min: 0, max: 120,
      hint: '≥65 岁计 1 分',
      bands: [{ lte: 64, score: 0 }, { score: 1 }] }),
  ]),
  dimensions: [dim('total', 'CURB-65 总分', ['confusion', 'urea', 'rr', 'bp', 'age'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 1, label: '低危', level: 'normal', advice: '30 天死亡风险低，可考虑门诊治疗并密切随访。' },
      { max: 2, label: '中危', level: 'moderate', advice: '建议住院观察治疗。' },
      { max: 5, label: '高危', level: 'severe', advice: '建议住院，并按重症肺炎评估（必要时 ICU）。' },
    ],
  },
};

/* ---------------- qSOFA ---------------- */
const QSOFA = {
  code: 'qsofa',
  title: 'qSOFA 快速序贯器官衰竭评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '床旁快速识别脓毒症高危患者（0-3 分）：≥2 分提示院内死亡风险明显升高，需进一步评估器官功能并调整监护级别。',
  instructions: '请评估者按当前生命体征与意识状态填写。',
  source: 'Singer M, Deutschman CS, Seymour CW, et al. The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). JAMA. 2016;315(8):801-810.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['脓毒症', 'Sepsis-3', '床旁', '评估者填写'],
  items: numbered([
    q('rr', '呼吸频率', 'number', null, { unit: '次/分', min: 5, max: 80,
      hint: '≥22 次/分 计 1 分',
      bands: [{ lte: 21, score: 0 }, { score: 1 }] }),
    q('sbp', '收缩压', 'number', null, { unit: 'mmHg', min: 30, max: 300,
      hint: '≤100 mmHg 计 1 分',
      bands: [{ lte: 100, score: 1 }, { score: 0 }] }),
    q('gcs', '格拉斯哥昏迷评分（GCS）', 'number', null, { unit: '分', min: 3, max: 15,
      hint: '<15 分计 1 分',
      bands: [{ lte: 14, score: 1 }, { score: 0 }] }),
  ]),
  dimensions: [dim('total', 'qSOFA 总分', ['rr', 'sbp', 'gcs'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 3],
    cutoffs: [
      { max: 1, label: '未达预警', level: 'normal', advice: '未达 qSOFA 预警阈值，但仍需按临床情况评估感染与器官功能。' },
      { max: 3, label: '高风险', level: 'severe', advice: 'qSOFA ≥2：院内死亡风险升高，建议完善器官功能评估、加强监护并排查脓毒症。' },
    ],
  },
};

/* ---------------- Wells DVT ---------------- */
const WELLS_DVT = {
  code: 'wells-dvt',
  title: 'Wells 深静脉血栓预测评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '深静脉血栓的临床可能性评估（-2 至 9 分）：≤0 不太可能、1-2 中等可能、≥3 很可能，用于决定 D-二聚体或超声的检查路径。',
  instructions: '请评估者逐项选择；「其他诊断可能性更大」计 -2 分。',
  source: 'Wells PS, Anderson DR, Bormanis J, et al. Value of assessment of pretest probability of deep-vein thrombosis in clinical management. Lancet. 1997;350(9094):1795-1798.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['DVT', '静脉血栓', 'Wells', '评估者填写'],
  items: numbered([
    q('cancer', '活动性肿瘤（治疗中或近 6 个月内）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('bedridden', '卧床 >3 天或 12 周内接受大手术', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('calf', '小腿肿胀（患侧比健侧粗 >3 cm）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('collateral', '浅表侧支静脉', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('legswollen', '整条腿肿胀', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('tenderness', '沿深静脉走行的局部压痛', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('edema', '患侧小腿凹陷性水肿', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('paralysis', '瘫痪、麻痹或近期石膏固定', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('prior', '既往确诊 DVT', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('alt', '其他诊断的可能性至少与 DVT 相当', 'radio', [{ label: '否', value: 0 }, { label: '是（计 -2 分）', value: -2 }]),
  ]),
  dimensions: [dim('total', 'Wells DVT 总分', ['cancer', 'bedridden', 'calf', 'collateral', 'legswollen', 'tenderness', 'edema', 'paralysis', 'prior', 'alt'])],
  scoring: {
    method: 'sum',
    totalRange: [-2, 9],
    cutoffs: [
      { max: 0, label: '不太可能', level: 'normal', advice: 'DVT 可能性低：可先查 D-二聚体，阴性可基本排除。' },
      { max: 2, label: '中等可能', level: 'moderate', advice: '建议 D-二聚体 + 下肢静脉超声评估。' },
      { max: 9, label: '很可能', level: 'severe', advice: 'DVT 可能性高：建议尽快行下肢静脉超声，必要时启动抗凝评估。' },
    ],
  },
};

/* ---------------- Wells PE ---------------- */
const WELLS_PE = {
  code: 'wells-pe',
  title: 'Wells 肺栓塞预测评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '肺栓塞的临床可能性评估（0-12.5 分）：<2 低度、2-6 中度、>6 高度，用于选择 D-二聚体或 CT 肺动脉造影。',
  instructions: '请评估者逐项选择。',
  source: 'Wells PS, Anderson DR, Rodger M, et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism. Thromb Haemost. 2000;83(3):416-420.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['肺栓塞', 'PE', 'Wells', '评估者填写'],
  items: numbered([
    q('dvtsigns', '有 DVT 的临床征象（下肢肿胀、压痛）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 3 }]),
    q('pefirst', 'PE 是首要诊断或与其他诊断可能性相当', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 3 }]),
    q('hr', '心率 >100 次/分', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1.5 }]),
    q('immobile', '近 4 周内制动 ≥3 天或接受手术', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1.5 }]),
    q('prior', '既往 DVT 或 PE', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1.5 }]),
    q('hemoptysis', '咯血', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('malignancy', '恶性肿瘤（治疗中或近 6 个月内）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
  ]),
  dimensions: [dim('total', 'Wells PE 总分', ['dvtsigns', 'pefirst', 'hr', 'immobile', 'prior', 'hemoptysis', 'malignancy'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 12.5],
    cutoffs: [
      { max: 1.5, label: '低度可能', level: 'normal', advice: 'PE 可能性低：可先查 D-二聚体，阴性可按流程排除。' },
      { max: 6, label: '中度可能', level: 'moderate', advice: '建议 D-二聚体并按流程行 CTPA 评估。' },
      { max: 12.5, label: '高度可能', level: 'severe', advice: 'PE 可能性高：建议尽快行 CTPA，必要时先行抗凝。' },
    ],
  },
};

/* ---------------- NEWS2 ---------------- */
const NEWS2 = {
  code: 'news2',
  title: 'NEWS2 国家早期预警评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '住院患者病情恶化的早期预警评分（0-20 分）：0-4 低风险、5-6 或任一单项 3 分为中风险、≥7 高风险。',
  instructions: '请评估者按当前生命体征填写；吸氧状态与意识水平按 ACVPU 选择。',
  source: 'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. 2017.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['早期预警', '病情恶化', '住院', '评估者填写'],
  items: numbered([
    q('rr', '呼吸频率', 'number', null, { unit: '次/分', min: 5, max: 80,
      hint: '≤8→3；9-11→1；12-20→0；21-24→2；≥25→3',
      bands: [{ lte: 8, score: 3 }, { lte: 11, score: 1 }, { lte: 20, score: 0 }, { lte: 24, score: 2 }, { score: 3 }] }),
    q('spo2', '血氧饱和度（SpO₂）', 'number', null, { unit: '%', min: 50, max: 100,
      hint: '≤91→3；92-93→2；94-95→1；≥96→0',
      bands: [{ lte: 91, score: 3 }, { lte: 93, score: 2 }, { lte: 95, score: 1 }, { score: 0 }] }),
    q('oxygen', '吸氧状态', 'radio', [{ label: '未吸氧（空气）', value: 0 }, { label: '吸氧中', value: 2 }]),
    q('temp', '体温', 'number', null, { unit: '°C', min: 30, max: 43,
      hint: '≤35.0→3；35.1-36.0→1；36.1-38.0→0；38.1-39.0→1；≥39.1→2',
      bands: [{ lte: 35, score: 3 }, { lte: 36, score: 1 }, { lte: 38, score: 0 }, { lte: 39, score: 1 }, { score: 2 }] }),
    q('sbp', '收缩压', 'number', null, { unit: 'mmHg', min: 30, max: 300,
      hint: '≤90→3；91-100→2；101-110→1；111-219→0；≥220→3',
      bands: [{ lte: 90, score: 3 }, { lte: 100, score: 2 }, { lte: 110, score: 1 }, { lte: 219, score: 0 }, { score: 3 }] }),
    q('pulse', '脉率', 'number', null, { unit: '次/分', min: 20, max: 250,
      hint: '≤40→3；41-50→1；51-90→0；91-110→1；111-130→2；≥131→3',
      bands: [{ lte: 40, score: 3 }, { lte: 50, score: 1 }, { lte: 90, score: 0 }, { lte: 110, score: 1 }, { lte: 130, score: 2 }, { score: 3 }] }),
    q('acvpu', '意识水平（ACVPU）', 'radio', [
      { label: 'Alert（清醒）', value: 0 },
      { label: 'Confusion（新发意识模糊）', value: 3 },
      { label: 'Voice（对声音有反应）', value: 3 },
      { label: 'Pain（对疼痛有反应）', value: 3 },
      { label: 'Unresponsive（无反应）', value: 3 },
    ]),
  ]),
  dimensions: [dim('total', 'NEWS2 总分', ['rr', 'spo2', 'oxygen', 'temp', 'sbp', 'pulse', 'acvpu'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 20],
    cutoffs: [
      { max: 4, label: '低风险', level: 'normal', advice: '按常规频率监测；若任一单项 3 分，按中风险处理。' },
      { max: 6, label: '中风险', level: 'moderate', advice: '增加监测频率，通知医生评估；任一单项 3 分同样按中风险处理。' },
      { max: 20, label: '高风险', level: 'severe', advice: '紧急评估，建议转入高依赖/ICU 监护。' },
    ],
  },
};

/* ---------------- Padua 内科住院患者 VTE 风险 ---------------- */
const PADUA = {
  code: 'padua',
  title: 'Padua 内科住院患者静脉血栓风险评分',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '内科住院患者静脉血栓栓塞（VTE）风险评分（0-20 分）：≥4 分为高危，通常建议药物预防；<4 分按个体情况决定。',
  instructions: '请评估者按入院时情况逐项选择。',
  source: 'Barbar S, Noventa F, Rossetto V, et al. A risk assessment model for the identification of hospitalized medical patients at risk for venous thromboembolism: the Padua Prediction Score. J Thromb Haemost. 2010;8(11):2450-2457.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['VTE', '静脉血栓', '内科住院', '评估者填写'],
  items: numbered([
    q('cancer', '活动性肿瘤（转移/化疗/放疗中或近 6 个月内）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 3 }]),
    q('prior', '既往 VTE（不含浅表静脉血栓）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 3 }]),
    q('mobility', '制动 ≥3 天（卧床或活动受限）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 3 }]),
    q('thrombophilia', '已知易栓症（抗磷脂综合征、因子 V Leiden 等）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 3 }]),
    q('trauma', '近 1 个月内创伤或手术', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 2 }]),
    q('age70', '年龄 ≥70 岁', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('heartfail', '心力衰竭和/或呼吸衰竭', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('mi', '急性心肌梗死或缺血性卒中', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('infection', '急性感染和/或风湿性疾病', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('obesity', 'BMI ≥30 kg/m²', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
    q('hormone', '正在使用激素治疗（口服避孕药、激素替代等）', 'radio', [{ label: '否', value: 0 }, { label: '是', value: 1 }]),
  ]),
  dimensions: [dim('total', 'Padua 总分', ['cancer', 'prior', 'mobility', 'thrombophilia', 'trauma', 'age70', 'heartfail', 'mi', 'infection', 'obesity', 'hormone'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 20],
    cutoffs: [
      { max: 3, label: '低危', level: 'normal', advice: 'VTE 风险较低，是否药物预防按个体情况决定。' },
      { max: 20, label: '高危', level: 'severe', advice: 'VTE 风险高（≥4 分），如无禁忌通常建议药物预防，并评估出血风险。' },
    ],
  },
};

module.exports = [CHILD_PUGH, MELD, MELD_NA, CHA2DS2, HASBLED, CURB65, QSOFA, WELLS_DVT, WELLS_PE, NEWS2, PADUA];
