'use strict';
/**
 * 量表库 · 神经、老年与康复
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* ---------------- SPPB 短时身体活动能力测试 ---------------- */
const SPPB = {
  code: 'sppb',
  title: 'SPPB 短时身体活动能力测试',
  category: '康复与疼痛',
  rater: 'clinician',
  licenseTier: 'free',
  description: '三项客观测试（平衡、4 米步速、5 次起坐），每项 0-4 分，总分 0-12：0-6 差、7-9 中等、10-12 良好，用于老年人身体功能与衰弱评估。',
  instructions: '请评估者按标准流程测试并填写实测值；无法完成的项目填 0（平衡项选「无法完成」）。',
  source: 'Guralnik JM, Simonsick EM, Ferrucci L, et al. A short physical performance battery assessing lower extremity function. J Gerontol. 1994;49(2):M85-M94.',
  license: '公开发表的临床测试，可免费使用，请引用来源文献。',
  tags: ['身体功能', '衰弱', '步速', '起坐', '评估者填写'],
  items: numbered([
    q('balance', '平衡测试（双脚并拢 / 半串联 / 串联 / 单腿站立 10 秒）', 'radio', [
      { label: '无法完成双脚并拢站立 10 秒', value: 0 },
      { label: '双脚并拢 10 秒，但不能半串联', value: 1 },
      { label: '半串联 10 秒，但不能串联', value: 2 },
      { label: '串联 10 秒，但不能单腿站立', value: 3 },
      { label: '单腿站立 10 秒', value: 4 },
    ]),
    q('gait', '4 米步行时间（秒）', 'number', null, { unit: '秒', min: 0, max: 120,
      hint: '无法完成填 0；<4.82 秒=4 分；4.82-6.20=3 分；6.21-8.70=2 分；>8.70=1 分',
      bands: [{ lte: 0, score: 0 }, { lt: 4.82, score: 4 }, { lt: 6.21, score: 3 }, { lt: 8.71, score: 2 }, { score: 1 }] }),
    q('chair', '5 次起坐时间（秒）', 'number', null, { unit: '秒', min: 0, max: 180,
      hint: '无法完成填 0；<11.2 秒=4 分；11.2-13.6=3 分；13.7-16.7=2 分；>16.7=1 分',
      bands: [{ lte: 0, score: 0 }, { lt: 11.2, score: 4 }, { lt: 13.7, score: 3 }, { lt: 16.8, score: 2 }, { score: 1 }] }),
  ]),
  dimensions: [dim('total', 'SPPB 总分', ['balance', 'gait', 'chair'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 12],
    cutoffs: [
      { max: 6, label: '身体功能差', level: 'severe', advice: '提示身体功能明显下降，建议综合评估衰弱、跌倒风险与营养状况。' },
      { max: 9, label: '身体功能中等', level: 'moderate', advice: '建议规律运动与康复训练，并随访功能变化。' },
      { max: 12, label: '身体功能良好', level: 'normal', advice: '身体功能良好，建议保持活动。' },
    ],
  },
};

/* ---------------- NDI 颈椎功能障碍指数 ---------------- */
const ndiOpts = [
  { label: '0 无影响', value: 0 },
  { label: '1 轻度', value: 1 },
  { label: '2 中度', value: 2 },
  { label: '3 较重', value: 3 },
  { label: '4 很重', value: 4 },
  { label: '5 完全不能', value: 5 },
];
const NDI = {
  code: 'ndi',
  title: 'NDI 颈椎功能障碍指数',
  category: '康复与疼痛',
  licenseTier: 'free',
  description: '10 个条目评估颈痛对日常生活的影响，每项 0-5 分，原始总分 0-50，换算为百分比（0-100%）：0-20% 轻度、21-40% 中度、41-60% 重度、61-80% 严重、81-100% 完全受限。',
  instructions: '请选择最能描述您今天情况的一项。',
  source: 'Vernon H, Mior S. The Neck Disability Index: a study of reliability and validity. J Manipulative Physiol Ther. 1991;14(7):409-415.',
  license: '公开发表量表，临床与研究可免费使用，请引用来源文献。',
  tags: ['颈椎', '颈痛', '功能障碍', '10题'],
  items: numbered([
    q('ndi1', '疼痛强度', 'radio', ndiOpts),
    q('ndi2', '个人护理（洗漱、穿衣）', 'radio', ndiOpts),
    q('ndi3', '提举物品', 'radio', ndiOpts),
    q('ndi4', '阅读', 'radio', ndiOpts),
    q('ndi5', '头痛', 'radio', ndiOpts),
    q('ndi6', '注意力集中', 'radio', ndiOpts),
    q('ndi7', '工作', 'radio', ndiOpts),
    q('ndi8', '驾驶', 'radio', ndiOpts),
    q('ndi9', '睡眠', 'radio', ndiOpts),
    q('ndi10', '娱乐活动', 'radio', ndiOpts),
  ]),
  dimensions: [dim('total', 'NDI 总分', K.ids('ndi', 10))],
  scoring: {
    method: 'sum',
    multiplier: 2,
    totalRange: [0, 100],
    cutoffs: [
      { max: 20, label: '轻度障碍', level: 'normal', advice: '颈痛对日常生活影响较小，建议保持活动与姿势管理。' },
      { max: 40, label: '中度障碍', level: 'mild', advice: '建议康复评估与针对性训练。' },
      { max: 60, label: '重度障碍', level: 'moderate', advice: '建议系统康复治疗并评估工作与生活调整。' },
      { max: 80, label: '严重障碍', level: 'severe', advice: '建议多学科评估与强化康复。' },
      { max: 100, label: '完全受限', level: 'severe', advice: '功能严重受限，建议尽快专科评估。' },
    ],
  },
};

module.exports = [SPPB, NDI];
