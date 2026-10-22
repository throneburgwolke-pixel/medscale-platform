'use strict';
/**
 * 量表库 · 呼吸 / 泌尿 / 消化 / 妇科 / 吞咽 / 功能评估
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

const catOpts = [
  { label: '0 从来没有', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5 一直如此', value: 5 },
];

/* ---------------- CAT 慢阻肺评估测试 ---------------- */
const CAT = {
  code: 'cat-copd',
  licenseTier: 'registration',
  title: 'CAT 慢阻肺评估测试',
  category: '呼吸与心血管',
  description: 'COPD 患者症状与生活质量自评工具，8 个条目（0-5 分），总分 0-40 分：0-10 轻微影响、11-20 中等影响、21-30 严重影响、31-40 极严重影响。',
  instructions: '请为以下每一项选择最能反映您目前状况的分数（0 表示最好，5 表示最差）。',
  source: 'Jones PW, Harding G, Berry P, et al. Development and first validation of the COPD Assessment Test. Eur Respir J. 2009;34(3):648-654.',
  license: 'CAT 可免费用于临床与研究（建议使用官方版本并注册），请引用来源文献。',
  tags: ['慢阻肺', 'COPD', '症状评估', '8题'],
  items: numbered([
    q('cat1', '我从不咳嗽', 'radio', catOpts, { hint: '0 = 从不咳嗽；5 = 一直在咳嗽' }),
    q('cat2', '我一点痰也没有', 'radio', catOpts, { hint: '0 = 无痰；5 = 痰很多' }),
    q('cat3', '我一点也没有胸闷的感觉', 'radio', catOpts, { hint: '0 = 无胸闷；5 = 胸闷很重' }),
    q('cat4', '当我爬坡或爬一层楼梯时，并不感到喘不过气来', 'radio', catOpts, { hint: '0 = 不喘；5 = 非常喘' }),
    q('cat5', '我在家里的任何劳动都不受慢阻肺的影响', 'radio', catOpts, { hint: '0 = 完全不受影响；5 = 很受影响' }),
    q('cat6', '尽管我有肺病，但我外出很有信心', 'radio', catOpts, { hint: '0 = 很有信心；5 = 完全没有信心' }),
    q('cat7', '我睡眠非常好', 'radio', catOpts, { hint: '0 = 睡眠很好；5 = 睡眠很差' }),
    q('cat8', '我精力旺盛', 'radio', catOpts, { hint: '0 = 精力旺盛；5 = 一点精力都没有' }),
  ]),
  dimensions: [dim('total', 'CAT 总分', K.ids('cat', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 40],
    cutoffs: [
      { max: 10, label: '轻微影响', level: 'normal', advice: '症状对生活影响较小。' },
      { max: 20, label: '中等影响', level: 'mild', advice: '症状对生活有中等影响，建议评估并优化治疗方案。' },
      { max: 30, label: '严重影响', level: 'moderate', advice: '症状影响严重，建议呼吸科系统评估。' },
      { max: 40, label: '极严重影响', level: 'severe', advice: '影响极严重，建议尽快专科就诊。' },
    ],
  },
};

/* ---------------- mMRC ---------------- */
const MMRC = {
  code: 'mmrc',
  licenseTier: 'free',
  title: 'mMRC 改良呼吸困难量表',
  category: '呼吸与心血管',
  description: '单条目呼吸困难分级（0-4 级），是慢阻肺症状评估与 GOLD 分组的核心指标。0-1 级症状轻，≥2 级症状重。',
  instructions: '请选择最符合您呼吸困难程度的一项。',
  source: 'Mahler DA, Wells CK. Evaluation of clinical methods for rating dyspnea. Chest. 1988;93(3):580-586.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['呼吸困难', '慢阻肺', '单条目', 'GOLD分组'],
  items: numbered([
    q('mmrc1', '您呼吸困难的程度属于以下哪一级？', 'radio', [
      { label: '0 级：只有在剧烈活动时才感到呼吸困难', value: 0 },
      { label: '1 级：在平地快步行走或步行爬小坡时出现气短', value: 1 },
      { label: '2 级：由于气短，平地行走时比同龄人慢，或需要停下来休息', value: 2 },
      { label: '3 级：在平地行走约100米或数分钟后需要停下来喘气', value: 3 },
      { label: '4 级：因严重呼吸困难不能离开家，或在穿脱衣服时出现呼吸困难', value: 4 },
    ]),
  ]),
  dimensions: [dim('total', 'mMRC 分级', ['mmrc1'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 4],
    cutoffs: [
      { max: 1, label: '症状较轻', level: 'normal', advice: '呼吸困难症状较轻（mMRC 0-1 级）。' },
      { max: 4, label: '症状较重', level: 'moderate', advice: 'mMRC ≥2 级，症状负担较重，建议加强治疗与肺康复评估。' },
    ],
  },
};

/* ---------------- ACT 哮喘控制测试 ---------------- */
const ACT = {
  code: 'act-asthma',
  licenseTier: 'free',
  title: 'ACT 哮喘控制测试',
  category: '呼吸与心血管',
  description: '评估哮喘控制水平的 5 条目工具，总分 5-25 分：25 分完全控制、20-24 良好控制、16-19 未良好控制、5-15 完全未控制。',
  instructions: '请根据过去 4 周的情况作答，每个问题选择 1-5 分。',
  source: 'Nathan RA, Sorkness CA, Kosinski M, et al. Development of the Asthma Control Test. J Allergy Clin Immunol. 2004;113(1):59-65.',
  license: '公开发表工具，学术使用免费，建议引用来源文献。',
  tags: ['哮喘', '控制水平', '5题'],
  items: numbered([
    q('act1', '在过去4周内，在工作、学习或家中，有多少时候哮喘妨碍您进行日常活动？', 'radio', [
      { label: '1 所有时间', value: 1 }, { label: '2 大多数时间', value: 2 }, { label: '3 有些时候', value: 3 },
      { label: '4 极少时候', value: 4 }, { label: '5 没有', value: 5 },
    ]),
    q('act2', '在过去4周内，您有多少次呼吸困难？', 'radio', [
      { label: '1 每天不止1次', value: 1 }, { label: '2 每天1次', value: 2 }, { label: '3 每周3-6次', value: 3 },
      { label: '4 每周1-2次', value: 4 }, { label: '5 完全没有', value: 5 },
    ]),
    q('act3', '在过去4周内，因为哮喘症状（喘息、咳嗽、呼吸困难、胸闷或疼痛），您有多少次夜间醒来或比平时早醒？', 'radio', [
      { label: '1 每晚或几乎每晚', value: 1 }, { label: '2 每周3-4个晚上', value: 2 }, { label: '3 每周2-3个晚上', value: 3 },
      { label: '4 每周1个晚上', value: 4 }, { label: '5 没有', value: 5 },
    ]),
    q('act4', '在过去4周内，您有多少次使用急救药物（如沙丁胺醇）？', 'radio', [
      { label: '1 每天3次以上', value: 1 }, { label: '2 每天1-2次', value: 2 }, { label: '3 每周2-3次', value: 3 },
      { label: '4 每周1次或更少', value: 4 }, { label: '5 没有使用', value: 5 },
    ]),
    q('act5', '您如何评价过去4周内您的哮喘控制情况？', 'radio', [
      { label: '1 完全没有控制', value: 1 }, { label: '2 控制很差', value: 2 }, { label: '3 有所控制', value: 3 },
      { label: '4 控制很好', value: 4 }, { label: '5 完全控制', value: 5 },
    ]),
  ]),
  dimensions: [dim('total', 'ACT 总分', K.ids('act', 5))],
  scoring: {
    method: 'sum',
    totalRange: [5, 25],
    cutoffs: [
      { max: 15, label: '哮喘未控制', level: 'severe', advice: '哮喘完全未控制，建议尽快调整治疗方案。' },
      { max: 19, label: '哮喘未良好控制', level: 'moderate', advice: '建议评估用药依从性与吸入技术，必要时升级治疗。' },
      { max: 24, label: '哮喘良好控制', level: 'mild', advice: '哮喘控制良好，维持治疗并定期随访。' },
      { max: 25, label: '哮喘完全控制', level: 'normal', advice: '哮喘完全控制。' },
    ],
  },
};

/* ---------------- IPSS ---------------- */
const ipssOpts = [
  { label: '0 无', value: 0 }, { label: '1 少于1/5次', value: 1 }, { label: '2 少于1/2次', value: 2 },
  { label: '3 约1/2次', value: 3 }, { label: '4 多于1/2次', value: 4 }, { label: '5 几乎总是', value: 5 },
];

const IPSS = {
  code: 'ipss',
  licenseTier: 'free',
  title: 'IPSS 国际前列腺症状评分（含生活质量）',
  category: '消化与泌尿',
  description: '评估前列腺增生下尿路症状的标准工具：7 个症状条目（0-5 分，总分 0-35）+ 1 个生活质量条目（0-6 分，单独评价不计入总分）。分级：0-7 轻度、8-19 中度、20-35 重度。',
  instructions: '请根据过去一个月内下列症状出现的频率作答。',
  source: 'Barry MJ, Fowler FJ, O\'Leary MP, et al. The American Urological Association symptom index for benign prostatic hyperplasia. J Urol. 1992;148(5):1549-1557.',
  license: '公开发表工具，临床与研究可免费使用，建议引用来源文献。',
  tags: ['前列腺增生', '下尿路症状', '泌尿', '8题'],
  items: numbered([
    q('ipss1', '排尿后，您是否感到膀胱内仍有尿液未排尽？', 'radio', ipssOpts),
    q('ipss2', '排尿后不到2小时，您是否又要排尿？', 'radio', ipssOpts),
    q('ipss3', '排尿过程中，您是否出现尿流中断（断续排尿）？', 'radio', ipssOpts),
    q('ipss4', '排尿时您是否难以推迟、需要用力等待？', 'radio', ipssOpts),
    q('ipss5', '您是否感到尿线变细、力量减弱？', 'radio', ipssOpts),
    q('ipss6', '排尿开始时，您是否需要用力才能排出尿液？', 'radio', ipssOpts),
    q('ipss7', '从入睡到早晨起床，您通常需要起床排尿几次？', 'radio', [
      { label: '0 无', value: 0 }, { label: '1 1次', value: 1 }, { label: '2 2次', value: 2 },
      { label: '3 3次', value: 3 }, { label: '4 4次', value: 4 }, { label: '5 5次或以上', value: 5 },
    ]),
    q('ipssQ', '如果您今后终身都要忍受现在的排尿症状，您觉得如何？（单独评价，不计入总分）', 'radio', [
      { label: '0 很好', value: 0 }, { label: '1 满意', value: 1 }, { label: '2 大致满意', value: 2 },
      { label: '3 还可以', value: 3 }, { label: '4 不太满意', value: 4 }, { label: '5 苦恼', value: 5 }, { label: '6 很糟', value: 6 },
    ], { exclude: true }),
  ]),
  dimensions: [dim('total', 'IPSS 总分', ['ipss1','ipss2','ipss3','ipss4','ipss5','ipss6','ipss7'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 35],
    cutoffs: [
      { max: 7, label: '轻度症状', level: 'normal', advice: '轻度下尿路症状，可观察随访（IPSS 0-7）。' },
      { max: 19, label: '中度症状', level: 'moderate', advice: '中度症状，建议泌尿外科评估治疗（IPSS 8-19）。' },
      { max: 35, label: '重度症状', level: 'severe', advice: '重度症状，建议尽快泌尿外科专科治疗（IPSS 20-35）。' },
    ],
  },
};

/* ---------------- EAT-10 ---------------- */
const EAT10 = {
  code: 'eat-10',
  licenseTier: 'free',
  title: 'EAT-10 吞咽功能筛查量表',
  category: '消化与泌尿',
  description: '10 个条目的吞咽障碍自评筛查工具，每条 0-4 分，总分 0-40 分。≥3 分提示存在吞咽异常风险，建议进一步吞咽功能评估。',
  instructions: '以下情况在多大程度上符合您目前的状况？（0 = 没有，4 = 严重）',
  source: 'Belafsky PC, Mouadeb DA, Rees CJ, et al. Validity and reliability of the Eating Assessment Tool (EAT-10). Ann Otol Rhinol Laryngol. 2008;117(12):919-924.',
  license: '公开发表工具，可免费用于临床与研究，建议引用来源文献。',
  tags: ['吞咽障碍', '筛查', '10题', '老年'],
  items: numbered([
    q('eat1', '我的吞咽问题已经导致体重减轻', 'radio', K.SEV5),
    q('eat2', '我的吞咽问题影响到我在外就餐', 'radio', K.SEV5),
    q('eat3', '吞咽液体时需要费力', 'radio', K.SEV5),
    q('eat4', '吞咽固体食物时需要费力', 'radio', K.SEV5),
    q('eat5', '吞咽药片时需要费力', 'radio', K.SEV5),
    q('eat6', '吞咽时感到疼痛', 'radio', K.SEV5),
    q('eat7', '我的吞咽问题使我在进食时感到不愉快', 'radio', K.SEV5),
    q('eat8', '吞咽时食物卡在喉咙里', 'radio', K.SEV5),
    q('eat9', '进食时咳嗽', 'radio', K.SEV5),
    q('eat10', '吞咽时感到紧张', 'radio', K.SEV5),
  ]),
  dimensions: [dim('total', 'EAT-10 总分', K.ids('eat', 10))],
  scoring: {
    method: 'sum',
    totalRange: [0, 40],
    cutoffs: [
      { max: 2, label: '吞咽功能正常', level: 'normal', advice: '未达到吞咽异常筛查界值。' },
      { max: 40, label: '存在吞咽异常风险', level: 'severe', advice: '总分 ≥3，建议由言语治疗师/康复科进行临床吞咽功能评估（如洼田饮水试验、VFSS）。' },
    ],
  },
};

/* ---------------- Wexner 便秘评分 ---------------- */
const wexFreq = [
  { label: '从不', value: 0 }, { label: '很少', value: 1 }, { label: '有时', value: 2 },
  { label: '经常', value: 3 }, { label: '总是', value: 4 },
];

const WEXNER = {
  code: 'wexner',
  licenseTier: 'free',
  title: 'Wexner 便秘评分（克利夫兰便秘评分）',
  category: '消化与泌尿',
  description: '评估便秘严重程度的 8 条目工具，总分 0-30 分，≥15 分提示重度便秘。',
  instructions: '请根据您近 3 个月的排便情况作答。',
  source: 'Agachan F, Chen T, Pfeifer J, et al. A constipation scoring system to simplify evaluation and management of constipated patients. Dis Colon Rectum. 1996;39(6):681-685.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['便秘', '消化', '8题', '症状评分'],
  items: numbered([
    q('wex1', '排便频率', 'radio', [
      { label: '1-2天1次', value: 0 }, { label: '每周2次', value: 1 }, { label: '每周1次', value: 2 },
      { label: '每周少于1次', value: 3 }, { label: '每月少于1次', value: 4 },
    ]),
    q('wex2', '排便费力程度', 'radio', wexFreq),
    q('wex3', '排便不尽感（排空不完全）', 'radio', wexFreq),
    q('wex4', '腹痛程度', 'radio', wexFreq),
    q('wex5', '每次排便所用的时间', 'radio', [
      { label: '少于5分钟', value: 0 }, { label: '5-10分钟', value: 1 }, { label: '10-20分钟', value: 2 },
      { label: '20-30分钟', value: 3 }, { label: '超过30分钟', value: 4 },
    ]),
    q('wex6', '排便时需要辅助的方式', 'radio', [
      { label: '不需要辅助', value: 0 }, { label: '使用泻药', value: 1 },
      { label: '用手指辅助排便', value: 2 }, { label: '需灌肠', value: 3 }, { label: '需用手挖便等其他方式', value: 4 },
    ]),
    q('wex7', '24小时内尝试排便但未能排出的次数', 'radio', [
      { label: '无', value: 0 }, { label: '1-3次', value: 1 }, { label: '3-6次', value: 2 },
      { label: '6-9次', value: 3 }, { label: '超过9次', value: 4 },
    ]),
    q('wex8', '每天便秘相关症状持续的时间', 'radio', [
      { label: '0小时', value: 0 }, { label: '1-3小时', value: 1 }, { label: '3-6小时', value: 2 },
      { label: '6-9小时', value: 3 }, { label: '超过9小时', value: 4 },
    ]),
  ]),
  dimensions: [dim('total', 'Wexner 总分', K.ids('wex', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 30],
    cutoffs: [
      { max: 5, label: '正常或轻微', level: 'normal', advice: '便秘症状轻微。' },
      { max: 14, label: '轻中度便秘', level: 'mild', advice: '建议生活方式干预（膳食纤维、足量饮水、运动、规律排便习惯）。' },
      { max: 30, label: '重度便秘', level: 'severe', advice: '评分 ≥15，提示重度便秘，建议消化科/肛肠科专项评估。' },
    ],
  },
};

/* ---------------- ICIQ-SF ---------------- */
const ICIQ = {
  code: 'iciq-sf',
  licenseTier: 'registration',
  title: 'ICIQ-SF 尿失禁简表',
  category: '消化与泌尿',
  description: '国际尿失禁咨询委员会简表，4 个条目。总分 0-21 分：1-5 轻度、6-12 中度、13-18 重度、19-21 极重度。',
  instructions: '请根据您最近 4 周内的排尿情况作答。',
  source: 'Avery K, Donovan J, Peters TJ, et al. ICIQ: a brief and robust measure for evaluating the symptoms and impact of urinary incontinence. Neurourol Urodyn. 2004;23(4):322-330.',
  license: 'ICIQ 系列问卷对非商业用途免费提供，建议引用来源文献。',
  tags: ['尿失禁', '泌尿', '4题', '生活质量影响'],
  items: numbered([
    q('iciq1', '您多久漏一次尿？', 'radio', [
      { label: '0 从不', value: 0 }, { label: '1 每周约1次或更少', value: 1 }, { label: '2 每周2-3次', value: 2 },
      { label: '3 每天约1次', value: 3 }, { label: '4 每天数次', value: 4 }, { label: '5 一直漏尿', value: 5 },
    ]),
    q('iciq2', '您通常漏多少尿？（无论是否使用护垫）', 'radio', [
      { label: '0 无漏尿', value: 0 }, { label: '2 少量', value: 2 }, { label: '4 中等量', value: 4 }, { label: '6 大量', value: 6 },
    ]),
    q('iciq3', '总体来说，漏尿对您的日常生活影响有多大？', 'radio', [
      { label: '0 没有影响', value: 0 }, { label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 },
      { label: '4', value: 4 }, { label: '5', value: 5 }, { label: '6', value: 6 }, { label: '7', value: 7 },
      { label: '8', value: 8 }, { label: '9', value: 9 }, { label: '10 影响极大', value: 10 },
    ]),
    q('iciq4', '您什么时候会漏尿？（可多选，不计入总分）', 'checkbox', [
      { label: '在咳嗽或打喷嚏时', value: 1 }, { label: '在活动和运动时', value: 2 },
      { label: '在还没到厕所时就漏尿', value: 3 }, { label: '睡着时', value: 4 },
      { label: '体力活动结束后', value: 5 }, { label: '没有明显原因', value: 6 }, { label: '总是漏尿', value: 7 },
    ], { exclude: true, required: false }),
  ]),
  dimensions: [dim('total', 'ICIQ-SF 总分', ['iciq1', 'iciq2', 'iciq3'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 21],
    cutoffs: [
      { max: 0, label: '无尿失禁', level: 'normal', advice: '未报告尿失禁症状。' },
      { max: 5, label: '轻度尿失禁', level: 'mild', advice: '建议生活方式干预与盆底肌训练。' },
      { max: 12, label: '中度尿失禁', level: 'moderate', advice: '建议泌尿/妇科专科评估，考虑盆底康复治疗。' },
      { max: 18, label: '重度尿失禁', level: 'severe', advice: '建议专科评估治疗方案。' },
      { max: 21, label: '极重度尿失禁', level: 'severe', advice: '建议尽快专科治疗。' },
    ],
  },
};

/* ---------------- MRS 绝经评定量表 ---------------- */
const MRS = {
  code: 'mrs',
  licenseTier: 'registration',
  title: 'MRS 绝经评定量表',
  category: '情绪与心理',
  description: '评估绝经期症状及其对生活质量影响的国际通用量表，11 个条目（0-4 分），总分 0-44 分：0-4 无/很轻、5-8 轻度、9-16 中度、≥17 重度。',
  instructions: '请根据您目前的感受，评价以下症状对您的困扰程度（0 = 无，4 = 非常严重）。',
  source: 'Heinemann LA, Potthoff P, Schneider HP. International versions of the Menopause Rating Scale (MRS). Health Qual Life Outcomes. 2003;1:28.',
  license: 'MRS 对非商业用途免费提供（需注明来源），商业使用需获得授权。',
  tags: ['绝经', '更年期', '生活质量', '11题'],
  items: numbered([
    q('mrs1', '潮热、出汗', 'radio', K.SEV5, { dimension: 'somatic' }),
    q('mrs2', '心脏不适（心悸、心慌、胸闷）', 'radio', K.SEV5, { dimension: 'somatic' }),
    q('mrs3', '睡眠障碍（入睡困难、易醒、早醒）', 'radio', K.SEV5, { dimension: 'somatic' }),
    q('mrs4', '情绪低落、抑郁', 'radio', K.SEV5, { dimension: 'psychological' }),
    q('mrs5', '易激惹、烦躁', 'radio', K.SEV5, { dimension: 'psychological' }),
    q('mrs6', '焦虑、紧张', 'radio', K.SEV5, { dimension: 'psychological' }),
    q('mrs7', '体力与精力下降', 'radio', K.SEV5, { dimension: 'somatic' }),
    q('mrs8', '性生活问题（性欲下降、性交不适）', 'radio', K.SEV5, { dimension: 'urogenital' }),
    q('mrs9', '膀胱问题（尿频、尿急、排尿不适）', 'radio', K.SEV5, { dimension: 'urogenital' }),
    q('mrs10', '阴道干涩', 'radio', K.SEV5, { dimension: 'urogenital' }),
    q('mrs11', '关节与肌肉疼痛', 'radio', K.SEV5, { dimension: 'somatic' }),
  ]),
  dimensions: [
    dim('somatic', '躯体症状', ['mrs1', 'mrs2', 'mrs3', 'mrs7', 'mrs11']),
    dim('psychological', '心理症状', ['mrs4', 'mrs5', 'mrs6']),
    dim('urogenital', '泌尿生殖道症状', ['mrs8', 'mrs9', 'mrs10']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 44],
    cutoffs: [
      { max: 4, label: '无或很轻', level: 'normal', advice: '绝经症状影响很小。' },
      { max: 8, label: '轻度', level: 'mild', advice: '建议健康教育与自我调适。' },
      { max: 16, label: '中度', level: 'moderate', advice: '建议妇科/内分泌科评估，可考虑个体化治疗。' },
      { max: 44, label: '重度', level: 'severe', advice: '症状严重影响生活质量，建议尽快专科就诊。' },
    ],
  },
};

/* ---------------- Harvey-Bradshaw 指数 ---------------- */
const HBI = {
  code: 'hbi',
  licenseTier: 'free',
  title: 'Harvey-Bradshaw 指数（克罗恩病活动度）',
  category: '消化与泌尿',
  description: '简化的克罗恩病活动指数，5 个条目：≤4 缓解期、5-7 轻度活动、8-16 中度活动、>16 重度活动。',
  instructions: '请根据您最近 24 小时（腹泻次数按昨日）的情况作答。',
  source: 'Harvey RF, Bradshaw JM. A simple index of Crohn\'s-disease activity. Lancet. 1980;1(8167):514.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['克罗恩病', '炎症性肠病', '活动度', '5题'],
  items: numbered([
    q('hbi1', '您近日的一般状况如何？', 'radio', [
      { label: '0 很好', value: 0 }, { label: '1 稍差', value: 1 }, { label: '2 差', value: 2 },
      { label: '3 很差', value: 3 }, { label: '4 极差', value: 4 },
    ]),
    q('hbi2', '您近期的腹痛程度', 'radio', [
      { label: '0 无腹痛', value: 0 }, { label: '1 轻度', value: 1 }, { label: '2 中度', value: 2 }, { label: '3 重度', value: 3 },
    ]),
    q('hbi3', '昨日腹泻（稀便/水样便）次数', 'radio', [
      { label: '0 0-1次', value: 0 }, { label: '1 2-3次', value: 1 }, { label: '2 4-5次', value: 2 },
      { label: '3 6-7次', value: 3 }, { label: '4 8次及以上', value: 4 },
    ], { hint: '原量表按腹泻实际次数计分，本表按常用 5 级分组收集，便于患者自评。' }),
    q('hbi4', '腹部包块（由医生触诊判断）', 'radio', [
      { label: '0 无', value: 0 }, { label: '1 可疑', value: 1 }, { label: '2 肯定', value: 2 }, { label: '3 肯定且有压痛', value: 3 },
    ]),
    q('hbi5', '并发症（可多选，每项计 1 分；无请选"无"）', 'checkbox', [
      { label: '无', value: 0 }, { label: '关节痛', value: 1 }, { label: '虹膜炎/葡萄膜炎', value: 1 },
      { label: '结节性红斑/坏疽性脓皮病', value: 1 }, { label: '阿弗他口腔溃疡', value: 1 },
      { label: '肛裂', value: 1 }, { label: '新发瘘管', value: 1 }, { label: '腹腔脓肿', value: 1 },
    ], { required: false }),
  ]),
  dimensions: [dim('total', 'HBI 总分', K.ids('hbi', 5))],
  scoring: {
    method: 'sum',
    totalRange: [0, 22],
    cutoffs: [
      { max: 4, label: '缓解期', level: 'normal', advice: '疾病处于缓解期（HBI ≤4）。' },
      { max: 7, label: '轻度活动', level: 'mild', advice: '轻度活动期，建议门诊调整治疗。' },
      { max: 16, label: '中度活动', level: 'moderate', advice: '中度活动期，建议消化专科系统评估。' },
      { max: 22, label: '重度活动', level: 'severe', advice: '重度活动期，建议尽快专科就诊。' },
    ],
  },
};

/* ---------------- TUG ---------------- */
const TUG = {
  code: 'tug',
  licenseTier: 'free',
  title: 'TUG 起立-行走计时测试',
  category: '康复与疼痛',
  description: '评估移动能力与跌倒风险的简易测试：从椅子站起、走 3 米、转身、返回坐下所用时间（秒）。≤10 秒正常，>13.5 秒跌倒风险增高，≥20 秒明显活动障碍。',
  instructions: '请由评估者在受试者完成"起立-行走 3 米-转身-返回坐下"后填写所用时间（秒）。',
  source: 'Podsiadlo D, Richardson S. The timed "Up & Go" test of basic functional mobility for frail elderly persons. J Am Geriatr Soc. 1991;39(2):142-148.',
  license: '公开发表测试，可免费使用，建议引用来源文献。',
  tags: ['跌倒风险', '移动能力', '老年', '1项'],
  items: numbered([
    q('tug1', '完成测试所用时间', 'number', null, { min: 0, max: 120, unit: '秒' }),
  ]),
  dimensions: [dim('total', 'TUG 用时', ['tug1'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 120],
    cutoffs: [
      { max: 10, label: '移动能力正常', level: 'normal', advice: '移动能力正常。' },
      { max: 13.5, label: '需关注', level: 'mild', advice: '建议平衡与步态训练，定期复评。' },
      { max: 20, label: '跌倒风险增高', level: 'moderate', advice: '>13.5 秒提示跌倒风险增高，建议康复评估与干预。' },
      { max: 120, label: '明显活动障碍', level: 'severe', advice: '≥20 秒提示需辅助活动，建议综合康复与跌倒预防措施。' },
    ],
  },
};

module.exports = [CAT, MMRC, ACT, IPSS, EAT10, WEXNER, ICIQ, MRS, HBI, TUG];
