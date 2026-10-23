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

/* ---------------- PHQ-A 患者健康问卷（青少年版） ---------------- */
const PHQA = {
  code: 'phq-a',
  title: 'PHQ-A 患者健康问卷抑郁量表（青少年版）',
  category: '儿童与青少年',
  licenseTier: 'free',
  description: 'PHQ-9 的青少年修改版，9 个计分条目（0-3 分，总分 0-27）+ 1 项功能受损提问（不计入总分）。青少年常以易激惹而非情绪低落为主要表现，故第 1 题加入「易怒」表述。',
  instructions: '请按过去两周的实际情况作答。若第 9 题选择「有一天以上」，请立即与监护人及专业人员沟通；出现自伤或自杀念头时须即刻求助（全国心理援助热线 12356）。',
  source: 'Kroenke K, Spitzer RL, Williams JBW, Johnson J. The Patient Health Questionnaire for Adolescents: development and validation. J Adolesc Health. 2003;33(5):393-400.; GLAD-PC PHQ-9 Modified for Teens, Version 2, 2010.',
  license: 'PHQ 系列由 Pfizer 免费授权使用，可复制与分发，无需另行申请；使用时请引用原始文献并避免改动条目。',
  tags: ['青少年', '抑郁', '筛查', '自评'],
  usage: {
    population: '11-17 岁青少年自评；需监护人知情与专业解读',
    mode: '自评',
    notes: '分数为症状严重程度的量化，不是诊断。阳性筛查须由精神心理或儿科专业人员结合访谈判断。',
  },
  items: numbered([
    K.q('pa1', '感到情绪低落、抑郁、易怒或没有希望', 'radio', K.FREQ4),
    K.q('pa2', '对做事提不起劲或没有兴趣', 'radio', K.FREQ4),
    K.q('pa3', '入睡困难、睡不安稳或睡得太多', 'radio', K.FREQ4),
    K.q('pa4', '食欲差、体重下降或吃得过多', 'radio', K.FREQ4),
    K.q('pa5', '感到疲倦或没有精力', 'radio', K.FREQ4),
    K.q('pa6', '觉得自己很糟糕，或觉得自己是失败者，或让自己和家人失望', 'radio', K.FREQ4),
    K.q('pa7', '难以集中注意力，例如做作业、阅读或看电视时', 'radio', K.FREQ4),
    K.q('pa8', '动作或说话慢到别人能察觉；或相反——烦躁、坐立不安，活动量明显比平时多', 'radio', K.FREQ4),
    K.q('pa9', '有不如死掉或用某种方式伤害自己的念头', 'radio', K.FREQ4, {
      hint: '本条目涉及自伤/自杀意念。如有此类想法，请立即告知监护人并联系专业人员（全国心理援助热线 12356）。',
      safety: true,
    }),
    K.q('pa10', '这些问题让您在上学、做家务或与人相处方面感到多大困难', 'radio', [
      { label: '完全没有困难', value: 0 },
      { label: '有些困难', value: 1 },
      { label: '非常困难', value: 2 },
      { label: '极其困难', value: 3 },
    ], { exclude: true, hint: '功能受损提问按原表单独记录，不计入 0-27 总分' }),
  ]),
  dimensions: [dim('total', '抑郁症状（总分）', K.ids('pa', 9))],
  scoring: {
    method: 'sum',
    totalRange: [0, 27],
    criticalItems: ['pa9'],
    criticalThreshold: 1,
    criticalMessage: '第 9 题报告自伤或自杀意念（一天以上），需立即进行安全评估并告知监护人。',
    cutoffs: [
      { max: 4, label: '无或极轻微抑郁症状', level: 'normal', advice: '建议保持规律作息与运动，按流程复筛。' },
      { max: 9, label: '轻度抑郁症状', level: 'mild', advice: '建议心理支持与生活方式干预，并 2-4 周复评。' },
      { max: 14, label: '中度抑郁症状', level: 'moderate', advice: '建议精神心理或儿科专业评估，结合访谈判断是否达到诊断。' },
      { max: 19, label: '中重度抑郁症状', level: 'severe', advice: '建议尽快专业评估与随访，注意自伤风险与学业功能受损。' },
      { max: 27, label: '重度抑郁症状', level: 'severe', advice: '建议及时转诊精神心理专科，并完成安全评估。' },
    ],
  },
};

module.exports = [EPDS, CESD, PHQA];
