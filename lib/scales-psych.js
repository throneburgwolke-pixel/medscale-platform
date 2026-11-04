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
  licenseTier: 'commercial',
  description: '参照GLAD-PC 2010 Modified for Teens的9+4结构：9项计分（0-27），另记录过去一年症状、功能困难、过去一个月严重意念与终生行为史。该第三方改编版本与中文电子化许可未核实，暂仅提供结构，正文待填、禁止直接发布；不能把普通PHQ-9的许可自动扩大到第三方改编。',
  instructions: '请先取得所用版本的中文与电子化使用依据，录入获准题干和专用选项后再发布。第9题及两项附加风险条目阳性须由专业人员及时访谈；原始表的版本、时间窗和附加项不应省略。',
  source: 'GLAD-PC. PHQ-9: Modified for Teens. Guidelines for Adolescent Depression in Primary Care, Version 2, 2010. https://www.aacap.org/App_Themes/AACAP/docs/member_resources/toolbox_for_clinical_practice_and_outcomes/symptoms/GLAD-PC_PHQ-9.pdf',
  license: '原表标注“Modified with permission”及“Use with Permission”，其改编与中文版电子化许可尚未核实。本平台保守封存正文，并非认定一定收费；普通PHQ/GAD免费公告不足以证明此第三方改编的许可。',
  tags: ['青少年', '抑郁', '筛查', '自评'],
  usage: {
    population: '11-17 岁青少年自评；需监护人知情与专业解读',
    mode: '自评',
    notes: '分数为症状严重程度的量化，不是诊断。阳性筛查须由精神心理或儿科专业人员结合访谈判断。',
  },
  items: numbered(K.ids('pa', 9).map(function (id, i) {
    return K.pendingQ(id, i + 1, [0, 1, 2, 3], i === 8 ? { safety: true } : {});
  }).concat([
    K.pendingQ('pa_year', 10, [0, 1], { exclude: true, hint: '附加项目：过去一年症状；按获准原表录入，不计入总分。' }),
    K.pendingQ('pa10', 11, [0, 1, 2, 3], { exclude: true, hint: '附加项目：功能困难，单独记录；保留原功能项编码。' }),
    K.pendingQ('pa_month', 12, [0, 1], { exclude: true, safety: true, hint: '附加风险项目：过去一个月；阳性须及时专业访谈。' }),
    K.pendingQ('pa_lifetime', 13, [0, 1], { exclude: true, safety: true, hint: '附加风险项目：终生行为史；阳性须及时专业访谈。' }),
  ])),
  dimensions: [dim('total', '抑郁症状（总分）', K.ids('pa', 9))],
  scoring: {
    method: 'sum',
    totalRange: [0, 27],
    criticalItems: ['pa9', 'pa_month', 'pa_lifetime'],
    criticalThreshold: 1,
    criticalMessage: '风险条目报告阳性，须由专业人员及时访谈并按本机构安全流程处理。',
    cutoffs: [
      { max: 4, label: '无或极轻微抑郁症状', level: 'normal', advice: '建议保持规律作息与运动，按流程复筛。' },
      { max: 9, label: '轻度抑郁症状', level: 'mild', advice: '建议心理支持与生活方式干预，并 2-4 周复评。' },
      { max: 14, label: '中度抑郁症状', level: 'moderate', advice: '建议精神心理或儿科专业评估，结合访谈判断是否达到诊断。' },
      { max: 19, label: '中重度抑郁症状', level: 'severe', advice: '建议尽快专业评估与随访，注意自伤风险与学业功能受损。' },
      { max: 27, label: '重度抑郁症状', level: 'severe', advice: '建议及时转诊精神心理专科，并完成安全评估。' },
    ],
  },
};

/* ---------------- HADS 医院焦虑抑郁量表（结构模板） ---------------- */
const HADS = {
  code: 'hads',
  title: 'HADS 医院焦虑抑郁量表',
  category: '情绪与心理',
  licenseTier: 'commercial',
  description: 'HADS 共 14 项，各 0-3 分：奇数项组成焦虑分量表（0-21）、偶数项组成抑郁分量表（0-21），按分量表判读 0-7 正常、8-10 边缘、11-21 异常。本平台仅内置题数、分值与维度结构，正文需由获准版本录入。',
  instructions: '请从获准中文版逐题录入题干与各题专用选项（0-3 分），保持焦虑/抑郁交替的题序；不要套用统一「轻中重」标签，HADS 每题是带时间窗的陈述句。',
  source: 'Zigmond AS, Snaith RP. The hospital anxiety and depression scale. Acta Psychiatr Scand. 1983;67(6):361-370.',
  license: 'HADS 版权归 GL Assessment（GL Education 集团），需申请授权后方可电子化与分发；本平台不提供正文。参考：<https://eprovide.mapi-trust.org/instruments/hospital-anxiety-and-depression-scale>。',
  tags: ['焦虑', '抑郁', '综合医院', '14题', '双分量表'],
  items: numbered(K.ids('hads', 14).map(function (id, i) {
    return K.pendingQ(id, i + 1, [0, 1, 2, 3], {
      dimension: i % 2 === 0 ? 'anxiety' : 'depression',
    });
  })),
  dimensions: [
    dim('anxiety', '焦虑分量表（0-21）', K.ids('hads', 14).filter(function (id, i) { return i % 2 === 0; })),
    dim('depression', '抑郁分量表（0-21）', K.ids('hads', 14).filter(function (id, i) { return i % 2 === 1; })),
  ].map(function (d) {
    d.cutoffs = [
      { max: 7, label: '正常范围', level: 'normal', advice: '未达常用筛查界值，不能单独排除临床问题。' },
      { max: 10, label: '边缘范围', level: 'moderate', advice: '建议结合访谈进一步评估。' },
      { max: 21, label: '异常范围', level: 'severe', advice: '建议专业评估；筛查分数不等于诊断。' },
    ];
    return d;
  }),
  scoring: {
    method: 'sum',
    totalRange: [0, 42],
    cutoffs: [],
  },
};

module.exports = [EPDS, CESD, PHQA, HADS];
