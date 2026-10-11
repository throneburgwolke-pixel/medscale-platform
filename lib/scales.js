'use strict';
/**
 * 内置量表 / 问卷模板库
 * ------------------------------------------------------------------
 * 1. 以下中文条目为公开常用版本，用于快速搭建与演示。"license" 字段标注了各
 *    量表的使用条件；正式科研使用前请核对原始量表授权与官方中文版措辞，并在
 *    论文中正确引用来源文献。
 * 2. 需要授权/培训的经典工具（MMSE、MoCA、HADS、SF-36、QLQ-C30 等）未内置
 *    条目文本，仅在 LICENSED_NOTES 中给出提示，避免版权风险。
 * 3. 模板结构：{ code, title, category, description, instructions, source,
 *    license, tags, items[], dimensions[], scoring{} }
 */

/* ---------- 常用选项集 ---------- */
const FREQ4 = [
  { label: '完全不会', value: 0 },
  { label: '好几天', value: 1 },
  { label: '一半以上的天数', value: 2 },
  { label: '几乎每天', value: 3 },
];

const PSS5 = [
  { label: '从来没有', value: 0 },
  { label: '几乎从来没有', value: 1 },
  { label: '有时', value: 2 },
  { label: '相当经常', value: 3 },
  { label: '非常经常', value: 4 },
];

const SEVERITY5 = [
  { label: '无', value: 0 },
  { label: '轻度', value: 1 },
  { label: '中度', value: 2 },
  { label: '重度', value: 3 },
  { label: '极重度', value: 4 },
];

const ISI_SAT = [
  { label: '非常满意', value: 0 },
  { label: '满意', value: 1 },
  { label: '一般', value: 2 },
  { label: '不满意', value: 3 },
  { label: '非常不满意', value: 4 },
];

const ISI_INTERFERE = [
  { label: '没有干扰', value: 0 },
  { label: '轻度干扰', value: 1 },
  { label: '中度干扰', value: 2 },
  { label: '重度干扰', value: 3 },
  { label: '极大干扰', value: 4 },
];

const WHO5_OPTS = [
  { label: '所有时间', value: 5 },
  { label: '大部分时间', value: 4 },
  { label: '超过一半时间', value: 3 },
  { label: '不到一半时间', value: 2 },
  { label: '偶尔', value: 1 },
  { label: '任何时候都没有', value: 0 },
];

const ESS4 = [
  { label: '从不打瞌睡', value: 0 },
  { label: '很少打瞌睡', value: 1 },
  { label: '有时打瞌睡', value: 2 },
  { label: '经常打瞌睡', value: 3 },
];

const PHQ15_3 = [
  { label: '没有', value: 0 },
  { label: '有一点', value: 1 },
  { label: '有很多', value: 2 },
];

const PSQI_FREQ = [
  { label: '无', value: 0 },
  { label: '每周少于1次', value: 1 },
  { label: '每周1-2次', value: 2 },
  { label: '每周3次或以上', value: 3 },
];

const AGREE5 = [
  { label: '非常不同意', value: 1 },
  { label: '不同意', value: 2 },
  { label: '一般', value: 3 },
  { label: '同意', value: 4 },
  { label: '非常同意', value: 5 },
];

const SATISFY5 = [
  { label: '非常不满意', value: 1 },
  { label: '不满意', value: 2 },
  { label: '一般', value: 3 },
  { label: '满意', value: 4 },
  { label: '非常满意', value: 5 },
];

/* ---------- 构造工具 ---------- */
function q(id, text, type, options, extra) {
  const e = extra || {};
  const item = { id: id, text: text, type: type, required: e.required !== false };
  if (options) item.options = options;
  if (e.dimension) item.dimension = e.dimension;
  if (e.hint) item.hint = e.hint;
  if (e.min !== undefined) item.min = e.min;
  if (e.max !== undefined) item.max = e.max;
  if (e.unit) item.unit = e.unit;
  if (e.reverse) item.reverse = true;
  if (e.safety) item.safety = true;
  return item;
}

function numbered(items) {
  return items.map(function (it, i) {
    return Object.assign({}, it, { no: i + 1 });
  });
}

function dim(id, name, itemIds) {
  return { id: id, name: name, items: itemIds };
}

/* ================= 情绪与心理 ================= */

const PHQ9 = {
  code: 'phq-9',
  title: 'PHQ-9 患者健康问卷抑郁量表',
  category: '情绪与心理',
  description: '用于抑郁症状的快速筛查与严重程度评估，共9个条目，反映过去两周内的症状频率。总分0-27分，分值越高提示抑郁症状越重。',
  instructions: '在过去两周内，您有多少时候受到以下问题的困扰？请选择最符合您实际情况的一项。',
  source: 'Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001;16(9):606-613.',
  license: 'Pfizer 声明可免费使用、复制、翻译与分发，无需另行授权；建议在论文中引用来源文献。',
  tags: ['抑郁', '筛查', '9题'],
  items: numbered([
    q('phq1', '做事时提不起劲或没有兴趣', 'radio', FREQ4),
    q('phq2', '感到心情低落、沮丧或绝望', 'radio', FREQ4),
    q('phq3', '入睡困难、睡不安稳或睡眠过多', 'radio', FREQ4),
    q('phq4', '感觉疲倦或没有活力', 'radio', FREQ4),
    q('phq5', '食欲不振或吃太多', 'radio', FREQ4),
    q('phq6', '觉得自己很糟糕，或觉得自己很失败，或让自己和家人失望', 'radio', FREQ4),
    q('phq7', '对事情专注有困难，例如阅读报纸或看电视时', 'radio', FREQ4),
    q('phq8', '动作或说话速度缓慢到别人已经察觉，或正好相反——烦躁、坐立不安、动来动去的情况比平时更严重', 'radio', FREQ4),
    q('phq9', '有不如死掉或用某种方式伤害自己的念头', 'radio', FREQ4, {
      hint: '本条目涉及自伤/自杀意念。如有此类想法，请立即联系精神心理科医生或拨打全国心理援助热线 12356。',
      safety: true,
    }),
  ]),
  dimensions: [dim('total', '抑郁症状（总分）', ['phq1','phq2','phq3','phq4','phq5','phq6','phq7','phq8','phq9'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 27],
    cutoffs: [
      { max: 4, label: '无或极轻微', level: 'normal', advice: '未达到临床关注水平，建议保持规律作息与运动。' },
      { max: 9, label: '轻度抑郁', level: 'mild', advice: '建议观察随访，可考虑心理支持或行为激活。' },
      { max: 14, label: '中度抑郁', level: 'moderate', advice: '建议专科评估，可考虑心理治疗和/或药物治疗。' },
      { max: 19, label: '中重度抑郁', level: 'severe', advice: '建议尽快专科就诊并制定治疗方案。' },
      { max: 27, label: '重度抑郁', level: 'severe', advice: '强烈建议立即专科就诊，并进行安全风险评估。' },
    ],
    criticalItems: ['phq9'],
    criticalThreshold: 1,
    criticalMessage: '第9题选择"好几天"及以上，提示存在自伤/自杀意念，建议立即进行安全风险临床评估。',
  },
};

const GAD7 = {
  code: 'gad-7',
  title: 'GAD-7 广泛性焦虑障碍量表',
  category: '情绪与心理',
  description: '用于焦虑症状筛查与严重程度评估，共7个条目，评估过去两周的焦虑症状频率。总分0-21分。',
  instructions: '在过去两周内，您有多少时候受到以下问题的困扰？',
  source: 'Spitzer RL, Kroenke K, Williams JBW, Lowe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med. 2006;166(10):1092-1097.',
  license: '免费使用，建议引用来源文献。',
  tags: ['焦虑', '筛查', '7题'],
  items: numbered([
    q('gad1', '感到紧张、焦虑或急躁', 'radio', FREQ4),
    q('gad2', '不能停止或控制担忧', 'radio', FREQ4),
    q('gad3', '对各种各样的事情担忧过多', 'radio', FREQ4),
    q('gad4', '很难放松下来', 'radio', FREQ4),
    q('gad5', '由于不安而无法静坐', 'radio', FREQ4),
    q('gad6', '变得容易烦恼或急躁', 'radio', FREQ4),
    q('gad7', '感到似乎将有可怕的事情发生而害怕', 'radio', FREQ4),
  ]),
  dimensions: [dim('total', '焦虑症状（总分）', ['gad1','gad2','gad3','gad4','gad5','gad6','gad7'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 21],
    cutoffs: [
      { max: 4, label: '无或极轻微', level: 'normal', advice: '未达到临床关注水平。' },
      { max: 9, label: '轻度焦虑', level: 'mild', advice: '建议随访观察，可进行放松训练与规律运动。' },
      { max: 14, label: '中度焦虑', level: 'moderate', advice: '建议专科评估，可考虑心理治疗和/或药物治疗。' },
      { max: 21, label: '重度焦虑', level: 'severe', advice: '建议尽快专科就诊。' },
    ],
  },
};

const PHQ15 = {
  code: 'phq-15',
  title: 'PHQ-15 躯体症状量表',
  category: '躯体症状',
  description: '评估过去4周内15种常见躯体症状的严重程度，常用于躯体化症状筛查与症状负担评价。总分0-30分。',
  instructions: '在过去4周内，您被以下问题困扰的程度如何？',
  source: 'Kroenke K, Spitzer RL, Williams JBW. The PHQ-15: validity of a new measure for evaluating the severity of somatic symptoms. Psychosom Med. 2002;64(2):258-266.',
  license: '免费使用，建议引用来源文献。',
  tags: ['躯体化', '症状负担', '15题'],
  items: numbered([
    q('s1', '胃痛', 'radio', PHQ15_3),
    q('s2', '背痛', 'radio', PHQ15_3),
    q('s3', '胳膊、腿或关节疼痛', 'radio', PHQ15_3),
    q('s4', '痛经或月经期不适（男性或无月经者请选择"没有"）', 'radio', PHQ15_3),
    q('s5', '头痛', 'radio', PHQ15_3),
    q('s6', '胸痛', 'radio', PHQ15_3),
    q('s7', '头晕', 'radio', PHQ15_3),
    q('s8', '短时间晕倒（昏倒）', 'radio', PHQ15_3),
    q('s9', '感到心脏砰砰跳或跳动得很快', 'radio', PHQ15_3),
    q('s10', '透不过气来（气短）', 'radio', PHQ15_3),
    q('s11', '性生活时疼痛或不适', 'radio', PHQ15_3),
    q('s12', '便秘、稀便或腹泻', 'radio', PHQ15_3),
    q('s13', '恶心、胀气或消化不良', 'radio', PHQ15_3),
    q('s14', '感到疲劳或精力不足', 'radio', PHQ15_3),
    q('s15', '睡眠困难', 'radio', PHQ15_3),
  ]),
  dimensions: [dim('total', '躯体症状（总分）', ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','s13','s14','s15'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 30],
    cutoffs: [
      { max: 4, label: '极低症状负担', level: 'normal', advice: '躯体症状负担低。' },
      { max: 9, label: '低症状负担', level: 'mild', advice: '存在轻度躯体症状，建议随访。' },
      { max: 14, label: '中等症状负担', level: 'moderate', advice: '建议同时评估共病抑郁与焦虑。' },
      { max: 30, label: '高症状负担', level: 'severe', advice: '提示高躯体症状负担，建议系统评估与干预。' },
    ],
  },
};

/* ================= 睡眠 ================= */

const ISI = {
  code: 'isi',
  title: 'ISI 失眠严重程度指数',
  category: '睡眠',
  description: '自评式失眠严重程度量表，共7个条目，总分0-28分。常用于失眠筛查与疗效评价。',
  instructions: '请根据最近两周的睡眠情况，选择最符合您的一项。',
  source: 'Bastien CH, Vallieres A, Morin CM. Validation of the Insomnia Severity Index as an outcome measure for insomnia research. Sleep Med. 2001;2(4):297-307.',
  license: '研究与非商业临床使用通常无需付费，建议引用来源文献。',
  tags: ['失眠', '睡眠', '7题'],
  items: numbered([
    q('isi1', '入睡困难的严重程度', 'radio', SEVERITY5),
    q('isi2', '睡眠维持困难（夜间易醒）的严重程度', 'radio', SEVERITY5),
    q('isi3', '早醒（醒得过早且无法再入睡）的严重程度', 'radio', SEVERITY5),
    q('isi4', '对您当前睡眠模式的满意程度', 'radio', ISI_SAT),
    q('isi5', '您认为睡眠问题在多大程度上影响了您的日间功能（如日间疲劳、工作或日常事务能力、注意力、记忆、情绪等）', 'radio', ISI_INTERFERE),
    q('isi6', '您认为睡眠问题在多大程度上被他人注意到，并影响了您的生活质量', 'radio', ISI_INTERFERE),
    q('isi7', '您对当前睡眠问题的担心或苦恼程度', 'radio', ISI_INTERFERE),
  ]),
  dimensions: [dim('total', '失眠严重程度（总分）', ['isi1','isi2','isi3','isi4','isi5','isi6','isi7'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 28],
    cutoffs: [
      { max: 7, label: '无临床显著失眠', level: 'normal', advice: '睡眠状况良好。' },
      { max: 14, label: '亚临床失眠', level: 'mild', advice: '建议睡眠卫生教育与随访。' },
      { max: 21, label: '中度临床失眠', level: 'moderate', advice: '建议评估并进行失眠认知行为治疗（CBT-I）。' },
      { max: 28, label: '重度临床失眠', level: 'severe', advice: '建议尽快专科诊治。' },
    ],
  },
};

const PSQI = {
  code: 'psqi',
  title: 'PSQI 匹兹堡睡眠质量指数（自评版）',
  category: '睡眠',
  description: '评估近1个月睡眠质量的经典工具，18个自评条目（第5题含10个分项）归纳为7个成分（睡眠质量、入睡时间、睡眠时间、睡眠效率、睡眠障碍、催眠药物、日间功能障碍），总分0-21分，>7分提示睡眠质量差。',
  instructions: '以下问题均针对最近1个月的情况，请选择或填写最符合您实际情况的答案。',
  source: 'Buysse DJ, Reynolds CF, Monk TH, et al. The Pittsburgh Sleep Quality Index. Psychiatry Res. 1989;28(2):193-213. 中文版：刘贤臣等，1996。',
  license: '研究用途可免费使用，建议引用来源文献。',
  tags: ['睡眠质量', '7个成分', '含跳项说明'],
  items: numbered([
    q('psq1', '近1个月，您通常晚上上床睡觉的时间是', 'time'),
    q('psq2', '近1个月，您从上床到入睡通常需要多少分钟', 'number', null, { min: 0, max: 600, unit: '分钟' }),
    q('psq3', '近1个月，您通常早上起床的时间是', 'time'),
    q('psq4', '近1个月，您每晚实际睡眠时间是多少小时', 'number', null, { min: 0, max: 24, hint: '注意：实际睡眠时间不等于卧床时间' }),
    q('psq5a', '不能在30分钟内入睡', 'radio', PSQI_FREQ),
    q('psq5b', '夜间易醒或早醒', 'radio', PSQI_FREQ),
    q('psq5c', '夜间去厕所', 'radio', PSQI_FREQ),
    q('psq5d', '呼吸不畅', 'radio', PSQI_FREQ),
    q('psq5e', '咳嗽或鼾声高', 'radio', PSQI_FREQ),
    q('psq5f', '感觉冷', 'radio', PSQI_FREQ),
    q('psq5g', '感觉热', 'radio', PSQI_FREQ),
    q('psq5h', '做噩梦', 'radio', PSQI_FREQ),
    q('psq5i', '疼痛不适', 'radio', PSQI_FREQ),
    q('psq5j', '其他影响睡眠的事情（如无请选择"无"）', 'radio', PSQI_FREQ),
    q('psq6', '近1个月，总的来说，您认为自己的睡眠质量', 'radio', [
      { label: '很好', value: 0 }, { label: '较好', value: 1 }, { label: '较差', value: 2 }, { label: '很差', value: 3 },
    ]),
    q('psq7', '近1个月，您是否使用催眠药物才能入睡', 'radio', PSQI_FREQ),
    q('psq8', '近1个月，您是否常感到困倦、难以保持清醒', 'radio', PSQI_FREQ),
    q('psq9', '近1个月，您做事是否感到精力不足', 'radio', [
      { label: '没有', value: 0 }, { label: '偶尔有', value: 1 }, { label: '有时有', value: 2 }, { label: '经常有', value: 3 },
    ]),
  ]),
  dimensions: [
    dim('c1', '睡眠质量', ['psq6']),
    dim('c2', '入睡时间', ['psq2', 'psq5a']),
    dim('c3', '睡眠时间', ['psq4']),
    dim('c4', '睡眠效率', ['psq1', 'psq3', 'psq4']),
    dim('c5', '睡眠障碍', ['psq5b','psq5c','psq5d','psq5e','psq5f','psq5g','psq5h','psq5i','psq5j']),
    dim('c6', '催眠药物', ['psq7']),
    dim('c7', '日间功能障碍', ['psq8', 'psq9']),
  ],
  scoring: {
    method: 'custom',
    custom: 'psqi',
    totalRange: [0, 21],
    cutoffs: [
      { max: 5, label: '睡眠质量很好', level: 'normal', advice: '睡眠质量良好。' },
      { max: 7, label: '睡眠质量一般', level: 'mild', advice: '建议睡眠卫生教育。' },
      { max: 14, label: '睡眠质量差', level: 'moderate', advice: 'PSQI总分>7，提示睡眠质量差，建议进一步评估。' },
      { max: 21, label: '睡眠质量很差', level: 'severe', advice: '建议尽快睡眠专科诊治。' },
    ],
  },
};

const ESS = {
  code: 'ess',
  title: 'ESS Epworth 嗜睡量表',
  category: '睡眠',
  description: '评估日间过度嗜睡程度，共8个条目，总分0-24分。总分>10分提示日间嗜睡。',
  instructions: '在下列情况下，您打瞌睡或睡着的可能性有多大？即使您最近没有做过这些事，也请设想这些情况。',
  source: 'Johns MW. A new method for measuring daytime sleepiness: the Epworth sleepiness scale. Sleep. 1991;14(6):540-545.',
  license: '研究用途可免费使用；部分商业使用需向 Mapi Research Trust 申请授权。',
  tags: ['嗜睡', '睡眠', '8题'],
  items: numbered([
    q('ess1', '坐着阅读时', 'radio', ESS4),
    q('ess2', '看电视时', 'radio', ESS4),
    q('ess3', '在公共场所坐着不动时（如开会、看电影）', 'radio', ESS4),
    q('ess4', '连续乘车1小时不休息时', 'radio', ESS4),
    q('ess5', '下午躺下休息时', 'radio', ESS4),
    q('ess6', '坐着与人交谈时', 'radio', ESS4),
    q('ess7', '午餐后安静地坐着时（未饮酒）', 'radio', ESS4),
    q('ess8', '开车时遇到堵车或等红灯停几分钟时', 'radio', ESS4),
  ]),
  dimensions: [dim('total', '日间嗜睡（总分）', ['ess1','ess2','ess3','ess4','ess5','ess6','ess7','ess8'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 24],
    cutoffs: [
      { max: 10, label: '日间嗜睡正常', level: 'normal', advice: '无明显日间嗜睡。' },
      { max: 12, label: '轻度嗜睡', level: 'mild', advice: '建议关注睡眠时间与睡眠质量。' },
      { max: 15, label: '中度嗜睡', level: 'moderate', advice: '建议睡眠专科评估，排查睡眠呼吸暂停等。' },
      { max: 24, label: '重度嗜睡', level: 'severe', advice: '建议尽快专科评估，注意驾驶与操作安全。' },
    ],
  },
};

/* ================= 生活质量与压力 ================= */

const WHO5 = {
  code: 'who-5',
  title: 'WHO-5 幸福感指数量表',
  category: '生活质量',
  description: '世界卫生组织五项幸福感指数量表，用于主观幸福感与心理健康筛查。原始分0-25分，乘以4换算为0-100分。',
  instructions: '请根据最近两周的情况，选择最符合您的选项。',
  source: 'Topp CW, Ostergaard SD, Sondergaard S, Bech P. The WHO-5 Well-Being Index: a systematic review of the literature. Psychother Psychosom. 2015;84(3):167-176.',
  license: 'WHO 免费提供（非商业用途），建议在论文中引用。',
  tags: ['幸福感', '生活质量', '5题'],
  items: numbered([
    q('who1', '我感到心情愉快、精神饱满', 'radio', WHO5_OPTS),
    q('who2', '我感到平静和放松', 'radio', WHO5_OPTS),
    q('who3', '我感到精力充沛、充满活力', 'radio', WHO5_OPTS),
    q('who4', '我醒来时感到清新和有精神', 'radio', WHO5_OPTS),
    q('who5', '我的日常生活充满了我感兴趣的事情', 'radio', WHO5_OPTS),
  ]),
  dimensions: [dim('total', '幸福感（换算分）', ['who1','who2','who3','who4','who5'])],
  scoring: {
    method: 'sum',
    multiplier: 4,
    totalRange: [0, 100],
    cutoffs: [
      { max: 27, label: '幸福感很低', level: 'severe', advice: '得分提示很可能存在抑郁，建议进一步专业评估。' },
      { max: 50, label: '幸福感偏低', level: 'moderate', advice: '建议进行抑郁筛查并随访。' },
      { max: 100, label: '幸福感良好', level: 'normal', advice: '心理健康状况良好。' },
    ],
  },
};

const PSS10 = {
  code: 'pss-10',
  title: 'PSS-10 知觉压力量表',
  category: '情绪与心理',
  description: '评估过去一个月内个体感知到的压力水平，共10个条目（含4个反向计分条目）。总分0-40分。',
  instructions: '请根据最近一个月的情况，选择最符合您的选项。',
  source: 'Cohen S, Kamarck T, Mermelstein R. A global measure of perceived stress. J Health Soc Behav. 1983;24(4):385-396. 中文版：杨廷忠等，2003。',
  license: '学术研究可免费使用，建议引用中英文来源文献。',
  tags: ['压力', '心理', '10题'],
  items: numbered([
    q('pss1', '因为发生意外的事情而感到心烦', 'radio', PSS5),
    q('pss2', '感到无法控制生活中重要的事情', 'radio', PSS5),
    q('pss3', '感到紧张、有压力', 'radio', PSS5),
    q('pss4', '感到有信心处理好自己的问题', 'radio', PSS5, { reverse: true }),
    q('pss5', '感到事情正按照自己的意愿发展', 'radio', PSS5, { reverse: true }),
    q('pss6', '发现自己无法应付所有必须做的事情', 'radio', PSS5),
    q('pss7', '能够控制生活中令人恼怒的事情', 'radio', PSS5, { reverse: true }),
    q('pss8', '感到自己掌握了一切', 'radio', PSS5, { reverse: true }),
    q('pss9', '因为一些无法控制的事情而生气', 'radio', PSS5),
    q('pss10', '感到困难堆积如山，无法克服', 'radio', PSS5),
  ]),
  dimensions: [
    dim('helpless', '无助感', ['pss1','pss2','pss3','pss6','pss9','pss10']),
    dim('efficacy', '自我效能感', ['pss4','pss5','pss7','pss8']),
  ],
  scoring: {
    method: 'sum',
    reverseMax: 4,
    totalRange: [0, 40],
    cutoffs: [
      { max: 13, label: '压力较低', level: 'normal', advice: '知觉压力处于较低水平。' },
      { max: 26, label: '压力中等', level: 'mild', advice: '存在中等程度压力，建议关注情绪与睡眠。' },
      { max: 40, label: '压力较高', level: 'severe', advice: '知觉压力较高，建议心理支持与减压干预。' },
    ],
  },
};

/* ================= 单条目与模板 ================= */

const NRS_PAIN = {
  code: 'nrs-pain',
  title: 'NRS 疼痛数字评定量表',
  category: '症状评估',
  description: '单条目疼痛强度评估：0分表示无痛，10分表示能想象的最剧烈疼痛。',
  instructions: '请选择最能代表您过去24小时内疼痛程度的数字。',
  source: '常用临床疼痛评估工具（Numeric Rating Scale）。',
  license: '通用临床工具，无特殊授权限制。',
  tags: ['疼痛', '1题'],
  items: numbered([
    q('nrs', '过去24小时内，您疼痛的平均程度', 'slider', null, { min: 0, max: 10 }),
  ]),
  dimensions: [dim('total', '疼痛强度', ['nrs'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 10],
    cutoffs: [
      { max: 0, label: '无痛', level: 'normal', advice: '无疼痛。' },
      { max: 3, label: '轻度疼痛', level: 'mild', advice: '可观察或采用非药物干预。' },
      { max: 6, label: '中度疼痛', level: 'moderate', advice: '建议评估镇痛方案。' },
      { max: 10, label: '重度疼痛', level: 'severe', advice: '建议立即处理。' },
    ],
  },
};

const DEMOGRAPHICS = {
  code: 'demographics-general',
  title: '一般资料调查表（人口学模板）',
  category: '通用问卷',
  description: '科研常用的社会人口学与临床资料收集模板，可按需删改条目。',
  instructions: '请填写以下基本信息，所有信息仅用于本研究统计分析。',
  source: '自定义模板',
  license: '自定义，无版权限制。',
  tags: ['人口学', '基线资料', '可编辑'],
  items: numbered([
    q('d1', '性别', 'radio', [{ label: '男', value: 1 }, { label: '女', value: 2 }]),
    q('d2', '出生年份', 'number', null, { min: 1900, max: 2100, unit: '年' }),
    q('d3', '身高', 'number', null, { min: 80, max: 250, unit: 'cm' }),
    q('d4', '体重', 'number', null, { min: 20, max: 300, unit: 'kg' }),
    q('d5', '文化程度', 'select', [
      { label: '小学及以下', value: 1 }, { label: '初中', value: 2 }, { label: '高中/中专', value: 3 },
      { label: '大专', value: 4 }, { label: '本科', value: 5 }, { label: '硕士及以上', value: 6 },
    ]),
    q('d6', '婚姻状况', 'radio', [
      { label: '未婚', value: 1 }, { label: '已婚', value: 2 }, { label: '离异', value: 3 }, { label: '丧偶', value: 4 },
    ]),
    q('d7', '职业', 'text'),
    q('d8', '常住地', 'radio', [{ label: '城市', value: 1 }, { label: '乡镇', value: 2 }, { label: '农村', value: 3 }]),
    q('d9', '医疗保险类型', 'select', [
      { label: '城镇职工医保', value: 1 }, { label: '城乡居民医保', value: 2 },
      { label: '商业保险', value: 3 }, { label: '自费', value: 4 }, { label: '其他', value: 5 },
    ]),
    q('d10', '吸烟情况', 'radio', [
      { label: '从不吸烟', value: 1 }, { label: '已戒烟', value: 2 }, { label: '目前吸烟', value: 3 },
    ]),
    q('d11', '饮酒情况', 'radio', [
      { label: '从不饮酒', value: 1 }, { label: '偶尔饮酒', value: 2 }, { label: '经常饮酒', value: 3 },
    ]),
    q('d12', '病程（自确诊至今）', 'number', null, { min: 0, max: 100, unit: '年' }),
    q('d13', '合并慢性疾病（可多选，无请选择"无"）', 'checkbox', [
      { label: '无', value: 0 }, { label: '高血压', value: 1 }, { label: '糖尿病', value: 2 },
      { label: '冠心病', value: 3 }, { label: '脑血管疾病', value: 4 }, { label: '慢性呼吸系统疾病', value: 5 },
      { label: '肿瘤', value: 6 }, { label: '其他', value: 7 },
    ]),
    q('d14', '家族史（一级亲属同类疾病）', 'radio', [
      { label: '无', value: 0 }, { label: '有', value: 1 }, { label: '不详', value: 2 },
    ]),
  ]),
  dimensions: [],
  scoring: { method: 'none' },
};

const SATISFACTION = {
  code: 'satisfaction-5',
  title: '满意度调查模板（李克特5级）',
  category: '通用问卷',
  description: '患者/员工满意度调查通用模板，5级李克特计分，可直接修改条目后发布。',
  instructions: '请根据您的实际感受，对以下各项进行评价。',
  source: '自定义模板',
  license: '自定义，无版权限制。',
  tags: ['满意度', '李克特', '可编辑'],
  items: numbered([
    q('sat1', '总体而言，我对本次就医/服务体验感到满意', 'radio', SATISFY5),
    q('sat2', '医护人员的服务态度让我感到被尊重', 'radio', SATISFY5),
    q('sat3', '医护人员对病情和治疗方案的解释清楚易懂', 'radio', SATISFY5),
    q('sat4', '候诊与就诊等待时间可以接受', 'radio', SATISFY5),
    q('sat5', '就医环境整洁、指引清晰', 'radio', SATISFY5),
    q('sat6', '我愿意向亲友推荐这家医院/科室', 'radio', AGREE5),
  ]),
  dimensions: [dim('total', '满意度总分', ['sat1','sat2','sat3','sat4','sat5','sat6'])],
  scoring: {
    method: 'mean',
    totalRange: [1, 5],
    cutoffs: [
      { max: 2, label: '满意度较低', level: 'severe', advice: '需重点关注服务流程与沟通质量。' },
      { max: 3.5, label: '满意度一般', level: 'moderate', advice: '存在改进空间，建议针对低分条目专项整改。' },
      { max: 4.5, label: '满意度较高', level: 'mild', advice: '整体满意，可保持并持续优化。' },
      { max: 5, label: '满意度很高', level: 'normal', advice: '满意度优秀。' },
    ],
  },
};

const BLANK = {
  code: 'blank',
  title: '空白问卷（从零创建）',
  category: '通用问卷',
  description: '从零创建自己的问卷/量表。支持单选、多选、填空、数字、滑块、时间、程度矩阵等题型，可自定义计分与分级。',
  instructions: '请根据实际情况填写。',
  source: '自定义',
  license: '自定义，无版权限制。',
  tags: ['空白', '自定义'],
  items: numbered([
    q('q1', '示例题目：请选择最符合您的一项', 'radio', AGREE5),
  ]),
  dimensions: [dim('total', '总分', ['q1'])],
  scoring: { method: 'sum', totalRange: [1, 5], cutoffs: [] },
};

/* 需授权量表提示（不含条目文本） */
const LICENSED_NOTES = [
  { name: 'MMSE 简易精神状态检查', note: '受版权保护（PAR 公司），需购买或获得授权后方可使用。' },
  { name: 'MoCA 蒙特利尔认知评估', note: '需完成官方培训并取得认证账号后方可使用。' },
  { name: 'HADS 医院焦虑抑郁量表', note: '由 GL Assessment 管理版权，需申请授权。' },
  { name: 'SF-36 / SF-12 健康调查简表', note: '需通过 QualityMetric 或授权机构获取。' },
  { name: 'EORTC QLQ-C30 生活质量量表', note: '需向 EORTC 申请使用许可（学术用途通常可免费注册申请）。' },
  { name: '其他已发表量表', note: '多数需核对原始授权条款，并建议在论文中规范引用。' },
];

const TEMPLATES = [
  PHQ9, GAD7, PHQ15,
  ISI, PSQI, ESS,
  WHO5, PSS10,
  NRS_PAIN, DEMOGRAPHICS, SATISFACTION, BLANK,
]
  .concat(require('./scales-mental.js'))
  .concat(require('./scales-clinical.js'))
  .concat(require('./scales-care.js'))
  .concat(require('./scales-intl.js'));

/** 量表目录（需授权/需培训/条目过长，只提供元数据） */
const CATALOG = require('./scales-catalog.js');

/** 分类顺序：唯一来源在 lib/logic.js，前端与后端读同一份 */
const CATEGORIES = require('./logic.js').CATEGORIES;

module.exports = {
  TEMPLATES: TEMPLATES,
  LICENSED_NOTES: LICENSED_NOTES,
  CATALOG: CATALOG,
  CATEGORIES: CATEGORIES,
};
