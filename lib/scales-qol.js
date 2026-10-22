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

module.exports = [ECOG, KPS, MEDAS];
