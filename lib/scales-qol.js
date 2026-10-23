'use strict';
/**
 * 量表库 · 生活质量、肿瘤与专科
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* ---------------- ECOG 体能状态 ---------------- */
const ECOG = {
  code: 'ecog',
  title: 'ECOG 体能状态评分',
  category: '生活质量',
  rater: 'clinician',
  licenseTier: 'free',
  description: '肿瘤患者体能状态分级（0-5 级）：0 完全正常、1 轻体力活动受限、2 生活自理但不能工作、3 生活部分自理、4 完全卧床、5 死亡。',
  instructions: '请评估者选择最符合患者当前状态的等级。',
  source: 'Oken MM, Creech RH, Tormey DC, et al. Toxicity and response criteria of the Eastern Cooperative Oncology Group. Am J Clin Oncol. 1982;5(6):649-655.',
  license: '公开发表的临床分级，可免费使用，请引用来源文献。',
  tags: ['肿瘤', '体能状态', 'ECOG', '评估者填写'],
  items: numbered([
    q('ecog', '当前体能状态', 'radio', [
      { label: '0 活动能力完全正常，与发病前无差别', value: 0 },
      { label: '1 能从事轻体力活动，包括一般家务或办公室工作', value: 1 },
      { label: '2 生活自理，但不能从事任何工作；日间卧床时间 <50%', value: 2 },
      { label: '3 生活仅能部分自理；日间卧床时间 ≥50%', value: 3 },
      { label: '4 完全卧床，生活不能自理', value: 4 },
      { label: '5 死亡', value: 5 },
    ]),
  ]),
  dimensions: [dim('total', 'ECOG 分级', ['ecog'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 0, label: '0 级：活动完全正常', level: 'normal', advice: '体能状态良好，可按标准方案治疗。' },
      { max: 1, label: '1 级：轻体力活动受限', level: 'normal', advice: '可耐受大多数治疗，注意活动耐量变化。' },
      { max: 2, label: '2 级：生活自理，不能工作', level: 'mild', advice: '治疗强度需个体化，注意支持治疗。' },
      { max: 3, label: '3 级：生活部分自理', level: 'moderate', advice: '体能状态较差，治疗需权衡获益与风险。' },
      { max: 4, label: '4 级：完全卧床', level: 'severe', advice: '以姑息与支持治疗为主，谨慎选择抗肿瘤治疗。' },
      { max: 5, label: '5 级：死亡', level: 'severe', advice: '' },
    ],
  },
};

/* ---------------- KPS 卡氏功能状态 ---------------- */
const kpsOpts = [];
[100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].forEach(function (v) {
  const label = {
    100: '100 正常，无主诉，无疾病证据',
    90: '90 能正常活动，有轻微症状或体征',
    80: '80 勉强可正常活动，有一些症状或体征',
    70: '70 生活可自理，但不能维持正常活动或工作',
    60: '60 生活大部分自理，偶尔需要帮助',
    50: '50 常需人照料和医疗帮助',
    40: '40 生活不能自理，需特别照料',
    30: '30 生活严重不能自理，需住院治疗',
    20: '20 病重，需住院积极支持治疗',
    10: '10 病危，临近死亡',
    0: '0 死亡',
  }[v];
  kpsOpts.push({ label: label, value: v });
});
const KPS = {
  code: 'kps',
  title: 'KPS 卡氏功能状态量表',
  category: '生活质量',
  rater: 'clinician',
  licenseTier: 'free',
  description: '肿瘤患者功能状态评分（0-100，每 10 分为一档），分数越高功能越好；常用于治疗耐受性与预后评估。',
  instructions: '请评估者选择最符合患者当前状态的档位。',
  source: 'Karnofsky DA, Burchenal JH. The clinical evaluation of chemotherapeutic agents in cancer. In: Evaluation of Chemotherapeutic Agents. Columbia University Press; 1949:191-205.',
  license: '公开发表的临床分级，可免费使用，请引用来源文献。',
  tags: ['肿瘤', '功能状态', 'KPS', '评估者填写'],
  items: numbered([q('kps', '当前功能状态', 'radio', kpsOpts)]),
  dimensions: [dim('total', 'KPS 评分', ['kps'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 100],
    cutoffs: [
      { max: 10, label: '濒危', level: 'severe', advice: '以舒适照护为主。' },
      { max: 30, label: '严重功能受损', level: 'severe', advice: '需住院支持治疗，抗肿瘤治疗需谨慎权衡。' },
      { max: 50, label: '需较多帮助', level: 'moderate', advice: '生活需帮助，治疗强度需个体化。' },
      { max: 70, label: '生活自理，不能工作', level: 'mild', advice: '可考虑减量或支持治疗联合。' },
      { max: 90, label: '可正常活动，有轻微症状', level: 'normal', advice: '可耐受大多数治疗。' },
      { max: 100, label: '正常', level: 'normal', advice: '功能状态良好。' },
    ],
  },
};

/* ---------------- MEDAS 地中海饮食依从性 ---------------- */
const medasYesNo = [{ label: '否', value: 0 }, { label: '是', value: 1 }];
const MEDAS = {
  code: 'medas',
  title: 'MEDAS 地中海饮食依从性评分',
  category: '营养评估',
  licenseTier: 'free',
  description: '14 个条目的地中海饮食依从性评分（0-14）：≥9 分提示依从性高，<9 分提示依从性低。',
  instructions: '请根据您过去一年的饮食习惯作答。',
  source: 'Estruch R, Ros E, Salas-Salvadó J, et al. Primary prevention of cardiovascular disease with a Mediterranean diet. N Engl J Med. 2013;368(14):1279-1290（附录 MEDAS 问卷）。',
  license: '公开发表量表，研究与非商业临床使用可免费使用，请引用来源文献。',
  tags: ['地中海饮食', '营养', '心血管', '14题'],
  items: numbered([
    q('medas1', '以橄榄油作为主要烹饪用油', 'radio', medasYesNo),
    q('medas2', '每天摄入橄榄油 ≥4 汤匙', 'radio', medasYesNo),
    q('medas3', '每天蔬菜 ≥2 份', 'radio', medasYesNo),
    q('medas4', '每天水果 ≥3 份', 'radio', medasYesNo),
    q('medas5', '红肉/加工肉 <1 份/天', 'radio', medasYesNo),
    q('medas6', '黄油/人造奶油/奶油 <1 份/天', 'radio', medasYesNo),
    q('medas7', '含糖饮料 <1 份/天', 'radio', medasYesNo),
    q('medas8', '每周葡萄酒 ≥7 杯（如饮酒）', 'radio', medasYesNo),
    q('medas9', '每周豆类 ≥3 份', 'radio', medasYesNo),
    q('medas10', '每周鱼/海鲜 ≥3 份', 'radio', medasYesNo),
    q('medas11', '每周甜点/糕点 <2 份', 'radio', medasYesNo),
    q('medas12', '每周坚果 ≥3 份', 'radio', medasYesNo),
    q('medas13', '优先选择鸡肉/火鸡而非红肉', 'radio', medasYesNo),
    q('medas14', '每周以番茄/大蒜/洋葱/橄榄油烹制的酱料 ≥2 次', 'radio', medasYesNo),
  ]),
  dimensions: [dim('total', 'MEDAS 总分', K.ids('medas', 14))],
  scoring: {
    method: 'sum',
    totalRange: [0, 14],
    cutoffs: [
      { max: 8, label: '依从性低', level: 'moderate', advice: '建议增加蔬菜、水果、豆类、鱼类与橄榄油摄入，减少红肉与含糖饮料。' },
      { max: 14, label: '依从性高', level: 'normal', advice: '地中海饮食依从性较好，建议保持。' },
    ],
  },
};

/* ---------------- IPAQ 短卷 ---------------- */
function dayItem(id, text, hint) {
  return q(id, text, 'number', null, { unit: '天', min: 0, max: 7, integer: true, hint: hint });
}
function minItem(id, text, hint) {
  return q(id, text, 'number', null, { unit: '分钟', min: 0, max: 1440, integer: true, hint: hint });
}
const IPAQ = {
  code: 'ipaq-sf',
  title: 'IPAQ 短卷（国际体力活动问卷）',
  category: '通用问卷',
  licenseTier: 'free',
  description: '回忆过去 7 天的剧烈活动、中等活动、步行与久坐时间。活动量按 MET-min/周 = 代谢当量 × 天数 × 每天分钟数（剧烈 8.0、中等 4.0、步行 3.3）累加，久坐不计入活动量、单独报告。本表按总量给出 <600 / 600-3000 / >3000 MET-min/周 的参考分档；官方 IPAQ 三档分类还要求同时满足活动天数条件，科研分析请按官方计分规程处理。',
  instructions: '每类活动只统计每次持续至少 10 分钟的时段；请填写实际天数与平均每天分钟数。单项每天超过 180 分钟时请先核对（IPAQ 数据清洗规则会将异常高值剔除或修剪）。',
  source: 'Craig CL, et al. International Physical Activity Questionnaire (IPAQ): 12-country reliability and validity. Med Sci Sports Exerc. 2003;35(8):1381-1395. 计分规程：Lee PH, Macfarlane DJ, Lam TH, Stewart AL. Med Sci Sports Exerc. 2011;43(8):1575-1581.',
  license: 'IPAQ 项目免费提供问卷与计分规程，使用时须引用并按官网要求核对所用语言版本的授权说明。',
  tags: ['体力活动', '运动', 'MET', '久坐', '流行病学'],
  usage: {
    population: '15-69 岁一般人群体力活动水平调查',
    mode: '自评',
    notes: '本表输出的是活动量估算值，用于人群分层与关联分析；不能判断心肺适能或替代运动处方评估。极端报告值需按 IPAQ 清洗规则处理后再纳入分析。',
  },
  items: numbered([
    dayItem('v_days', '过去 7 天内，您有多少天进行了剧烈体力活动？',
      '如快跑、登山、快速骑车、负重搬运、竞技运动等，会让呼吸急促或大量出汗的活动'),
    minItem('v_min', '做剧烈活动时，平均每天持续多少分钟？', '只累计每次至少 10 分钟的时段'),
    dayItem('m_days', '过去 7 天内，您有多少天进行了中等强度体力活动？',
      '如慢速骑车、游泳、太极、提轻物、一般家务等，会让呼吸略急促但不太出汗的活动'),
    minItem('m_min', '做中等强度活动时，平均每天持续多少分钟？', '只累计每次至少 10 分钟的时段'),
    dayItem('w_days', '过去 7 天内，您有多少天步行？',
      '包括上下班、购物、外出与休闲散步等每次至少 10 分钟的步行'),
    minItem('w_min', '步行时，平均每天持续多少分钟？', '只累计每次至少 10 分钟的时段'),
    dayItem('s_days', '过去 7 天内，您有多少天是坐着完成的（办公、上课、在家、看电视等）？',
      '久坐按规程单独报告，不计入活动 MET 总量'),
    minItem('s_min', '坐着的时间，平均每天累计多少分钟？', '久坐单独报告，不计入活动 MET 总量'),
  ]),
  dimensions: [],
  scoring: {
    method: 'formula',
    formula: 'ipaq-met',
    cutoffs: [
      { max: 599, label: '活动量偏低（<600 MET-min/周）', level: 'severe',
        advice: '活动量明显不足，建议逐步增加步行与中等强度活动；官方 IPAQ 分类仍需结合活动天数判断。' },
      { max: 3000, label: '活动量中等', level: 'mild',
        advice: '已达到中等活动量参考区间，建议维持并向每周 150 分钟中等强度或等量剧烈活动靠拢。' },
      { max: 999999, label: '活动量充足', level: 'normal',
        advice: '活动量处于较高区间，注意久坐时间与运动安全；官方分类需同时满足活动天数条件。' },
    ],
  },
};

module.exports = [ECOG, KPS, MEDAS, IPAQ];
