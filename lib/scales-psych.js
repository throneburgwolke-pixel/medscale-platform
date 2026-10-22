'use strict';
/**
 * 量表库 · 精神心理（自评）
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* 0-3 频率（最近一周，CES-D 式） */
const FREQ_WEEK = [
  { label: '没有或很少（少于 1 天）', value: 0 },
  { label: '少部分时间（1-2 天）', value: 1 },
  { label: '相当多时间（3-4 天）', value: 2 },
  { label: '绝大部分时间（5-7 天）', value: 3 },
];

/* ---------------- EPDS 爱丁堡产后抑郁量表 ---------------- */
const EPDS = {
  code: 'epds',
  title: 'EPDS 爱丁堡产后抑郁量表',
  category: '情绪与心理',
  licenseTier: 'commercial',
  description: 'EPDS为10项产后抑郁筛查工具，总分0–30；不同地区中文版阈值与措辞需使用获准且完成本地验证的正式版本。平台仅保留结构和计分，正文待填。',
  instructions: '请从权利方或医疗机构认可的正式中文版录入每题专用选项，完成本地阈值核对后再发布。',
  source: 'Cox JL, Holden JM, Sagovsky R. Detection of postnatal depression. Development of the 10-item Edinburgh Postnatal Depression Scale. Br J Psychiatry. 1987;150:782-786.',
  license: '中文官方表明确标注“Reproduced with permission”。公开部署前须取得电子化及所用中文版本许可；平台不分发正文。参考官方语言验证入口：https://www.mhcs.health.nsw.gov.au/publications/epds/chinese-simplified-2013-antenatal',
  tags: ['产后抑郁', '围产期', '10题', '自评'],
  items: numbered(K.ids('epds', 10).map(function (id, i) {
    return K.pendingQ(id, i + 1, [0, 1, 2, 3], i === 9 ? { safety: true } : {});
  })),
  dimensions: [dim('total', 'EPDS 总分', K.ids('epds', 10))],
  scoring: {
    method: 'sum',
    totalRange: [0, 30],
    cutoffs: [
      { max: 9, label: '无明显抑郁', level: 'normal', advice: '未达筛查界值，建议保持随访与家庭支持。' },
      { max: 12, label: '可能存在抑郁', level: 'moderate', advice: '≥10 分提示可能存在产后抑郁，建议进一步专业评估与随访。' },
      { max: 30, label: '很可能抑郁', level: 'severe', advice: '≥13 分提示很可能存在产后抑郁，建议尽快转介心理/精神专科，并评估自伤风险。' },
    ],
    criticalItems: ['epds10'],
    criticalThreshold: 1,
    criticalMessage: '第 10 题出现自伤意念，建议立即进行安全风险评估并转介。',
  },
};

/* ---------------- CES-D 抑郁自评量表 ---------------- */
const CESD = {
  code: 'ces-d',
  title: 'CES-D 流调中心抑郁量表',
  category: '情绪与心理',
  licenseTier: 'free',
  description: '20 个条目的抑郁症状自评量表，总分 0-60；≥16 分提示可能存在抑郁症状。第 4、8、12、16 题为反向条目（已按得分方向编排）。',
  instructions: '请根据过去一周内您的感受与行为出现的频率作答。',
  source: 'Radloff LS. The CES-D Scale: a self-report depression scale for research in the general population. Appl Psychol Meas. 1977;1(3):385-401.',
  license: '公开发表量表，可免费用于研究与临床，请引用来源文献。',
  tags: ['抑郁', '流行病学', '20题', '自评'],
  items: numbered([
    q('cesd1', '我因一些小事而烦恼', 'radio', FREQ_WEEK),
    q('cesd2', '我不想吃东西，胃口不好', 'radio', FREQ_WEEK),
    q('cesd3', '即使家人和朋友帮助我，我仍然无法摆脱心中苦闷', 'radio', FREQ_WEEK),
    q('cesd4', '我觉得我和别人一样好', 'radio', [
      { label: '大多数时间', value: 0 }, { label: '不少时间', value: 1 }, { label: '有时', value: 2 }, { label: '很少', value: 3 },
    ]),
    q('cesd5', '我在做事时无法集中注意力', 'radio', FREQ_WEEK),
    q('cesd6', '我感到情绪低沉', 'radio', FREQ_WEEK),
    q('cesd7', '我感到做任何事都很费力', 'radio', FREQ_WEEK),
    q('cesd8', '我对未来抱有希望', 'radio', [
      { label: '大多数时间', value: 0 }, { label: '不少时间', value: 1 }, { label: '有时', value: 2 }, { label: '很少', value: 3 },
    ]),
    q('cesd9', '我觉得我的生活是失败的', 'radio', FREQ_WEEK),
    q('cesd10', '我感到害怕', 'radio', FREQ_WEEK),
    q('cesd11', '我的睡眠不好', 'radio', FREQ_WEEK),
    q('cesd12', '我感到幸福', 'radio', [
      { label: '大多数时间', value: 0 }, { label: '不少时间', value: 1 }, { label: '有时', value: 2 }, { label: '很少', value: 3 },
    ]),
    q('cesd13', '我比平时说话少', 'radio', FREQ_WEEK),
    q('cesd14', '我感到孤独', 'radio', FREQ_WEEK),
    q('cesd15', '我觉得人们对我不友好', 'radio', FREQ_WEEK),
    q('cesd16', '我觉得生活快乐', 'radio', [
      { label: '大多数时间', value: 0 }, { label: '不少时间', value: 1 }, { label: '有时', value: 2 }, { label: '很少', value: 3 },
    ]),
    q('cesd17', '我有时会哭泣', 'radio', FREQ_WEEK),
    q('cesd18', '我感到悲伤', 'radio', FREQ_WEEK),
    q('cesd19', '我觉得别人不喜欢我', 'radio', FREQ_WEEK),
    q('cesd20', '我做事提不起劲', 'radio', FREQ_WEEK),
  ]),
  dimensions: [
    dim('somatic', '躯体症状', ['cesd1', 'cesd2', 'cesd5', 'cesd7', 'cesd11', 'cesd13', 'cesd20']),
    dim('depressed', '抑郁情绪', ['cesd3', 'cesd6', 'cesd9', 'cesd10', 'cesd14', 'cesd17', 'cesd18']),
    dim('social', '人际困难', ['cesd15', 'cesd19']),
    dim('positive', '积极情绪（反向）', ['cesd4', 'cesd8', 'cesd12', 'cesd16']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 60],
    cutoffs: [
      { max: 15, label: '未达筛查界值', level: 'normal', advice: '未达抑郁症状筛查界值，建议保持规律作息与社会支持。' },
      { max: 60, label: '可能存在抑郁症状', level: 'moderate', advice: '≥16 分提示可能存在抑郁症状，建议进一步专业评估。' },
    ],
  },
};

module.exports = [EPDS, CESD];
