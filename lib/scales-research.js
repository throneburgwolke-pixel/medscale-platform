'use strict';
/**
 * 量表库 · 科研专项工具（按使用者提供的 Word 版材料录入）
 * - FRAS 家庭韧性评估量表（英文原版 54 条目）
 * - MMAS-8 用药依从性量表（中文版 8 条目）
 * - ZBI 照顾者负担量表（中文版 22 条目）
 * - 一般资料调查表（患者版 / 家属版，自编，不计分）
 *
 * 录入原则：
 * 1. 条目文字按所提供材料逐字录入，不做改写；材料中标注的错字与存疑处在
 *    usage.notes 中显式说明，不在正文里偷偷改掉。
 * 2. 材料未给出、且无法从公开来源核实的赋分方向或维度归属，不自行编造：
 *    缺常模就只给判读方向，缺维度归属就只算总分。
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;
const ids = K.ids;

/* ============================================================
 * 一、FRAS 家庭韧性评估量表（Sixbey 2005 英文原版 54 条目）
 * ============================================================ */

/* 4 级 Likert。中文对照由平台补充，正式使用以英文原版与作者手册为准。 */
const FRAS_OPT = [
  { label: '非常同意（Strongly Agree）', value: 4 },
  { label: '同意（Agree）', value: 3 },
  { label: '不同意（Disagree）', value: 2 },
  { label: '非常不同意（Strongly Disagree）', value: 1 },
];

/* 反向计分题：原表标注 (-) 的第 33、37、45、50 题 */
const FRAS_REVERSE = [33, 37, 45, 50];

const FRAS_EN = [
  'Our family structure is flexible to deal with the unexpected',
  'Our friends value us and who we are',
  'The things we do for each other make us feel a part of the family',
  'We accept stressful events as a part of life',
  'We accept that problems occur unexpectedly',
  'We all have input into major family decisions',
  'We are able to work through pain and come to an understanding',
  'We are adaptable to demands placed on us as a family',
  'We are open to new ways of doing things in our family',
  'We are understood by other family members',
  'We ask neighbors for help and assistance',
  'We attend church/synagogue/mosque services',
  'We believe we can handle our problems',
  'We can ask for clarification if we do not understand each other',
  'We can be honest and direct with each other in our family',
  'We can blow off steam at home without upsetting someone',
  'We can compromise when problems come up',
  'We can deal with family differences in accepting a loss',
  'We can depend upon people in this community',
  'We can question the meaning behind messages in our family',
  'We can solve major problems',
  'We can survive if another problem comes up',
  'We can talk about the way we communicate in our family',
  'We can work through difficulties as a family',
  'We consult with each other about decisions',
  'We define problems positively to solve them',
  'We discuss problems and feel good about the solutions',
  'We discuss things until we reach a resolution',
  'We feel free to express our opinions',
  'We feel good giving time and energy to our family',
  'We feel people in this community are willing to help in an emergency',
  'We feel secure living in this community',
  'We feel taken for granted by family members',
  'We feel we are strong in facing big problems',
  'We have faith in a supreme being',
  'We have the strength to solve our problems',
  'We keep our feelings to ourselves',
  'We know there is community help if there is trouble',
  'We know we are important to our friends',
  "We learn from each other's mistakes",
  'We mean what we say to each other in our family',
  'We participate in church activities',
  'We receive gifts and favors from neighbors',
  'We seek advice from religious advisors',
  'We seldom listen to family members concerns or problems',
  'We share responsibility in the family',
  'We show love and affection for family members',
  'We tell each other how much we care for one',
  'We think this is a good community to raise children',
  'We think we should not get too involved with people in this community',
  'We trust things will work out even in difficult times',
  'We try new ways of working with problems',
  'We understand communication from other family members',
  'We work to make sure family members are not emotionally or physically hurt',
];

const FRAS_IDS = ids('fras', 54);

const FRAS = {
  code: 'fras-54',
  title: 'FRAS 家庭韧性评估量表（英文原版 54 条目）',
  category: '照护与负担',
  licenseTier: 'commercial',
  description: 'Family Resilience Assessment Scale（Sixbey 2005）英文原版，54 个条目，Likert 4 级，含 4 个反向计分条目（第 33、37、45、50 题）。原版为 6 维度结构（家庭沟通与问题解决 27 条、社会经济资源利用 8 条、保持积极态度 6 条、家庭连结性 6 条、家族精神 4 条、赋予逆境意义 3 条），总 α＝0.96。本平台只计总分（54–216 分，得分越高家庭韧性越好），不划分维度——材料明确提示二手题库的条目—维度映射与发表结构不符，不得据此自行划分。',
  instructions: 'Please read each statement and select the response that best describes your family. There are no right or wrong answers. 请阅读每一条陈述，选择最符合您家庭实际情况的一项。答案无对错之分。',
  source: 'Sixbey MT. Development of the family resilience assessment scale to identify family resilience constructs [D]. University of Florida, 2005. 中文版：樊颖维, 张立力, 等. 中文版家庭韧性评估量表的信效度检验[J]. 中国全科医学, 2017（51 条目 6 维度，总 α＝0.944，总分 51–204）。',
  license: '英文原版使用需向 Sixbey / University of Florida 申请许可；中文版系 Sixbey 授权樊颖维、张立力汉化，使用需经中文版作者同意。本模板的 54 条英文正文由平台使用者依据其提供的核验材料录入，平台不主张权利、不另行分发；正式研究前请取得授权文本并逐条核对。',
  tags: ['家庭韧性', '54题', '英文原版', '4级', '反向计分'],
  usage: {
    population: '患者家属（家庭为单位作答），自评',
    mode: '自评',
    notes: '① 本模板是英文原版，中文 51 条目版全文尚未公开，需向中文版通讯作者张立力（南方医科大学护理学院）申请授权文本，或查阅樊颖维 2017 学位论文附录；材料仅公开了 7 条已核实的汉语措辞，不足以拼出完整中文问卷，故平台不提供中文版。② 赋分方向：已核验的公开来源未给出原版 Strongly Agree 计几分，平台按“非常同意＝4 分、非常不同意＝1 分”录入（与“得分越高家庭韧性越好”一致），正式使用请按作者手册核对。③ 反向题按 (最小分＋最大分)－原始分 处理，因此 54 条全选最低分时总分为 66、全选最高分时为 204。④ 材料指出樊颖维 2017 原文称原版“总分 66–204”，与 54×1–4＝54–216 的朴素推算不一致，原因正是反向题；引用时注意版本差异。⑤ 中文 51 条目版删除了原题库第 16、20、30 条。',
  },
  items: numbered(FRAS_IDS.map(function (id, i) {
    const no = i + 1;
    return q(id, FRAS_EN[i], 'radio', FRAS_OPT, FRAS_REVERSE.indexOf(no) >= 0 ? { reverse: true } : undefined);
  })),
  dimensions: [dim('total', '家庭韧性总分（54 条目）', FRAS_IDS)],
  scoring: {
    method: 'sum',
    totalRange: [66, 204],
    /* 原版按样本分布划分高低，材料未附具体界值：只给一条覆盖全量程的判读说明 */
    cutoffs: [{
      max: 204,
      label: '按作者手册 / 常模判读',
      level: 'normal',
      advice: '原版按样本正态分布的上 1/3、中 1/3、下 1/3 划分高低，所提供材料未附具体界值；请按拟引用文献或本课题样本的常模判读，本平台不预设高/中/低界值。',
    }],
  },
};

/* ============================================================
 * 二、MMAS-8 用药依从性量表（中文版 8 条目）
 * ============================================================ */

/* 条目 1–4、6、7：官方计分“是＝0、否＝1” */
const MMAS_YN_A = [
  { label: '是', value: 0 },
  { label: '否', value: 1 },
];
/* 条目 5 反向：官方计分“是＝1、否＝0” */
const MMAS_YN_B = [
  { label: '是', value: 1 },
  { label: '否', value: 0 },
];
/* 条目 8：非常困难→非常容易，对应官方 Never/Rarely…All the time 的 1→0 */
const MMAS_DIFF5 = [
  { label: '非常困难', value: 0 },
  { label: '困难', value: 0.25 },
  { label: '一般', value: 0.5 },
  { label: '容易', value: 0.75 },
  { label: '非常容易', value: 1 },
];

const MMAS = {
  code: 'mmas-8',
  title: 'MMAS-8 用药依从性量表（中文版）',
  category: '用药与依从性',
  licenseTier: 'commercial',
  description: 'Morisky 用药依从性量表 8 条目中文版，评估患者过去一段时间的服药依从行为。第 1–7 题为“是/否”，第 8 题为 5 级难度。总分 0–8 分：＜6 分低依从性、6–＜8 分中等、8 分高依从性。',
  instructions: '下面 8 个问题询问您平时服药的情况。请根据实际做法选择最符合的一项，每题只选一项。答案无对错之分，请如实填写，资料仅用于研究，严格保密。',
  source: 'Morisky DE, Ang A, Krousel-Wood M, Ward HJ. Predictive validity of a medication adherence measure in an outpatient setting. J Clin Hypertens. 2008;10(5):348-354（原始开发文献已撤稿，撤稿说明见 PMC10497024）。中文版：陈强, 曲珊珊, 黄欣. Morisky 用药依从性量表 8 条目中文版的信效度研究[J]. 中国药房, 2019, 30(2):268-271. DOI: 10.6039/j.issn.1001-0408.2019.02.26。精神分裂症人群应用参考：寸金芝, 赵丽琴. 临床精神医学杂志, 2016, 26(3):185-186。',
  license: 'MMAS-8 受美国版权法保护，正式使用（含科研）需向 MMAR, LLC dba adherence 取得许可（moriskyscale.com；Morisky 教授 dmorisky@gmail.com）。本模板中文条目依使用者提供的、已发表验证文献中的文本录入，平台不主张权利；使用前请完成授权并核对最新计分口径。',
  tags: ['依从性', '服药', '8题', '中文版'],
  usage: {
    population: '正在接受药物治疗的患者，自评（可由研究者协助说明）',
    mode: '自评',
    notes: '① 计分口径存在两套且在第 5 题矛盾：官方验证文献为第 5 题“是＝1、否＝0”（本模板采用），《中国药房》2019 中文文献为第 1–7 题统一“是＝0、否＝1”。两套口径会直接改变总分与依从性分组，课题组须选定一套并在论文中说明；建议以官方口径为准，并在申请授权时向 MMAR, LLC 确认最新版本。② 第 8 题按“非常困难＝0、困难＝0.25、一般＝0.5、容易＝0.75、非常容易＝1”计分，与官方 Never/Rarely→All the time 的 1→0 方向一致，故总分以 0.25 为步进；平台据此把分级边界写为 5.75 / 7.75，等价于“＜6 / 6–＜8 / 8”。③ 原始开发文献已被撤稿，量表本身仍被广泛验证和使用；引用时建议改引后续验证文献（如 PMC5026177）并如实注明撤稿事实。④ 中文第 7、8 题措辞与官方英文略有差异，属汉化调适，正式使用以授权方文本为准。',
  },
  items: numbered([
    q('mmas1', '您有忘记过服药吗？', 'radio', MMAS_YN_A),
    q('mmas2', '除了忘记服药外，最近 2 周内是否因为有其他原因漏服过药呢？', 'radio', MMAS_YN_A),
    q('mmas3', '感觉病情加重时，是否有时在未告知医师的情况下自己停用或减少服药呢？', 'radio', MMAS_YN_A),
    q('mmas4', '当您外出旅行或长时间离家时，是否忘记过携带药物呢？', 'radio', MMAS_YN_A),
    q('mmas5', '昨天服药了吗？', 'radio', MMAS_YN_B),
    q('mmas6', '感觉病情得到控制时，是否自行停止服药呢？', 'radio', MMAS_YN_A),
    q('mmas7', '遵守现在的治疗方案有困难吗？', 'radio', MMAS_YN_A),
    q('mmas8', '记住现在所有的治疗药物有困难吗？', 'radio', MMAS_DIFF5),
  ]),
  dimensions: [dim('total', '用药依从性（总分）', ids('mmas', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 8],
    cutoffs: [
      { max: 5.75, label: '低依从性', level: 'severe', advice: '总分＜6 分，提示依从性低，建议评估漏服原因并针对性干预。' },
      { max: 7.75, label: '中等依从性', level: 'moderate', advice: '总分 6–＜8 分，提示依从性中等，建议强化服药提醒与随访。' },
      { max: 8, label: '高依从性', level: 'normal', advice: '总分 8 分，提示依从性高。' },
    ],
  },
};

/* ============================================================
 * 三、ZBI 照顾者负担量表（中文版 22 条目）
 * ============================================================ */

const ZBI_OPT = [
  { label: '没有', value: 0 },
  { label: '偶尔', value: 1 },
  { label: '有时', value: 2 },
  { label: '经常', value: 3 },
  { label: '总是', value: 4 },
];

/* 第 22 题为总体负担自评，选项措辞不同但同为 0–4 */
const ZBI_GLOBAL = [
  { label: '无', value: 0 },
  { label: '轻', value: 1 },
  { label: '中', value: 2 },
  { label: '重', value: 3 },
  { label: '极重', value: 4 },
];

const ZBI_TEXTS = [
  '您所照料的病人会是否向您提出过多的照顾要求?',
  '由于护理病人是否会使自己的时间不够?',
  '在照料病人和努力做好家务及工作之间,你是否感到压力?',
  '您是否因病人的行为而感到为难?',
  '您是否因为有病人在您身边而感到烦恼?',
  '您的病人是否已经影响到了您和您的家人与朋友间的关系?',
  '您对病人的将来,感到担心吗?',
  '您是否认为,病人依赖于您?',
  '当病人在您身边时,您感到紧张吗?',
  '由于护理病人,您的健康是否受到影响?',
  '由于护理病人,您是否没有时间办自己的私事?',
  '由于护理病人,您的社交是否受到影响?',
  '您有没有由于病人在家,放弃请朋友来家的想法?',
  '您是否认为,病人只期盼着您的照料,您好象是他/她唯一可依赖的人?',
  '除外您的花费,您是否没有余钱用于护理病人?',
  '您是否有可能花更多的时间护理病人?',
  '开始护理以来,按照自己的意愿生活是否已经不可能了?',
  '您是否希望,能把病人留给别人来照料?',
  '您对病人有不知如何是好的情形吗?',
  '您认为应该为病人做更多的事情是吗?',
  '您认为在护理患者上您能做的更好吗?',
  '综合看来您怎样评价自己在护理上的负担?',
];

const ZBI_IDS = ids('zbi', 22);

const ZBI = {
  code: 'zbi-22',
  title: 'ZBI Zarit 照顾者负担量表（中文版 22 条目）',
  category: '照护与负担',
  licenseTier: 'registration',
  description: 'Zarit 照顾者负担量表中文版，22 个条目，0–4 五级计分，总分 0–88 分，得分越高照顾者负担越重。可分为个人负担（12 条）与责任负担（6 条）两个维度；条目 7、10、15 因子归属不稳定，第 22 题为总体负担自评，均不纳入维度分，但全部 22 条均计入总分。',
  instructions: '下面 22 个问题询问您在照顾病人过程中的感受和想法。请根据您的实际情况，选择每题最符合您情况的一项。每题只选一项，不要遗漏。答案无对错之分，资料仅用于研究，严格保密。',
  source: '原版：Zarit SH, Todd PA, Zarit JM. Subjective burden of husbands and wives as caregivers: a longitudinal study. Gerontologist. 1986;26(3):260-266. 中文版：王烈, 杨小湜, 侯哲, 等. 护理者负担量表中文版的应用与评价[J]. 中国公共卫生, 2006, 22(8):970-972. DOI: 10.3321/j.issn:1001-0580.2006.08.040。',
  license: 'ZBI 允许学术研究免费使用；中文版条目已公开发表，使用前建议核对授权与正式文本，并在论文中规范引用王烈 2006。',
  tags: ['照顾者负担', '22题', '中文版', '两维度'],
  usage: {
    population: '患者的主要照顾者（家属），自评',
    mode: '自评',
    notes: '① 条目文字按王烈 2006 中文版原文录入，保留了原文的半角标点与个别语序（如“会是否”“您好象是”），以便与文献逐条对照；不改写。② 分级界值有兩套，本模板采用方案 A：0–20 分无或轻度、21–39 分中度、≥40 分重度（中华护理杂志 2025）；另一套为方案 B：0–19 无、20–39 轻、40–59 中、≥60 重（肖芳 2024）。两套界值差异较大，课题组须选定一套并在论文中注明出处。③ 维度分只覆盖个人负担 12 条与责任负担 6 条，因此两个维度分之和小于总分，属预期。④ 条目 22 选项为“无/轻/中/重/极重”，与其余条目的“没有/偶尔/有时/经常/总是”措辞不同，这是原量表设计。',
  },
  items: numbered(ZBI_IDS.map(function (id, i) {
    const no = i + 1;
    if (no === 22) return q(id, ZBI_TEXTS[i], 'radio', ZBI_GLOBAL);
    return q(id, ZBI_TEXTS[i], 'radio', ZBI_OPT);
  })),
  /* 原卷按 1–22 顺序连续作答，维度只是计分归属：用 pages 固定原序，
     否则填写页会按“个人负担/责任负担”重排，题号与原表对不上。 */
  pages: [
    { title: '第 1–11 题', items: ZBI_IDS.slice(0, 11) },
    { title: '第 12–22 题', items: ZBI_IDS.slice(11) },
  ],
  dimensions: [
    dim('personal', '个人负担（12 条）', ['zbi1', 'zbi4', 'zbi5', 'zbi8', 'zbi9', 'zbi14', 'zbi16', 'zbi17', 'zbi18', 'zbi19', 'zbi20', 'zbi21']),
    dim('role', '责任负担（6 条）', ['zbi2', 'zbi3', 'zbi6', 'zbi11', 'zbi12', 'zbi13']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 88],
    cutoffs: [
      { max: 20, label: '无或轻度负担', level: 'normal', advice: '总分 0–20 分，照顾者负担较轻。' },
      { max: 39, label: '中度负担', level: 'moderate', advice: '总分 21–39 分，存在中度照顾负担，建议提供照护技能支持与 respite 服务。' },
      { max: 88, label: '重度负担', level: 'severe', advice: '总分≥40 分，照顾负担重，建议系统评估并给予心理支持、喘息服务与资源链接。' },
    ],
  },
};

/* ============================================================
 * 四、一般资料调查表（患者版 / 家属版，自编，不计分）
 * ============================================================ */

const GP_SEX = [{ label: '男', value: 1 }, { label: '女', value: 2 }];
const GP_MARRIAGE = [
  { label: '未婚', value: 1 }, { label: '已婚', value: 2 },
  { label: '离异', value: 3 }, { label: '丧偶', value: 4 },
];
const GP_EDU_PATIENT = [
  { label: '小学', value: 1 }, { label: '初中', value: 2 }, { label: '高中/中专', value: 3 },
  { label: '大专', value: 4 }, { label: '本科及以上', value: 5 },
];
const GP_EDU_CARE = [
  { label: '初中', value: 1 }, { label: '高中/中专', value: 2 },
  { label: '大专', value: 3 }, { label: '本科及以上', value: 4 },
];
const GP_INCOME = [
  { label: '无收入', value: 0 }, { label: '＜2000', value: 1 }, { label: '2000–4999', value: 2 },
  { label: '5000–7999', value: 3 }, { label: '≥8000', value: 4 }, { label: '不愿透露', value: 9 },
];
const GP_INSURANCE = [
  { label: '职工医保', value: 1 }, { label: '居民医保', value: 2 },
  { label: '自费', value: 3 }, { label: '其他', value: 4 },
];
const GP_YESNO = [{ label: '是', value: 1 }, { label: '否', value: 0 }];

const GENERAL_PATIENT = {
  code: 'general-info-patient',
  title: '一般资料调查表（患者版）',
  category: '通用问卷',
  licenseTier: 'free',
  description: '课题组自编的患者一般资料与疾病相关资料收集表，用于分层与统计分析，不计分。含基本信息与疾病相关资料两部分；研究者筛查、纳入排除判定与知情同意核查不在电子问卷内，由研究者在纸质版填写，避免向患者展示排除标准。',
  instructions: '请您根据实际情况选择或填写。本资料仅用于研究，严格保密。研究编号与分组由研究者填写。',
  source: '课题组自编（依据研究方案的纳入与排除标准、分层因素与统计分析需要设计），非引用他人量表。',
  license: '自编工具，无版权限制；课题组内部使用。',
  tags: ['一般资料', '人口学', '自编', '不计分'],
  usage: {
    population: 'ICD-10 精神分裂症患者（18–60 岁，恢复期或维持期），自填',
    mode: '自评',
    notes: '① 本表不含研究者筛查部分（诊断核对、PANSS 总分、纳入排除判定、知情同意），这些内容涉及排除标准，不宜向患者展示，请在纸质版由研究者填写。② 收入等敏感项已设“不愿透露”。③ 分层随机所需字段为病程（≤5 年 / ＞5 年）与家属关系，务必完整无缺失；病程在电子问卷里按“年 + 月”两题采集，分层判定由研究者完成。④ 诊断与病程应由研究者核对病历确认，患者自报仅作参考。',
  },
  items: numbered([
    q('gp1', '性别', 'radio', GP_SEX),
    q('gp2', '出生年份（如 1985）', 'number', null, { min: 1900, max: 2020, integer: true, unit: '年' }),
    q('gp3', '年龄', 'number', null, { min: 18, max: 60, integer: true, unit: '岁' }),
    q('gp4', '婚姻状况', 'radio', GP_MARRIAGE),
    q('gp5', '文化程度', 'radio', GP_EDU_PATIENT),
    q('gp6', '目前职业状况', 'radio', [
      { label: '在职', value: 1 }, { label: '退休', value: 2 }, { label: '无业/待业', value: 3 },
      { label: '病休', value: 4 }, { label: '学生', value: 5 }, { label: '其他', value: 6 },
    ]),
    q('gp7', '医疗付费方式', 'radio', GP_INSURANCE),
    q('gp8', '个人月收入（元）', 'radio', GP_INCOME, { required: false }),
    q('gp9', '居住情况', 'radio', [
      { label: '与家人同住', value: 1 }, { label: '独居', value: 2 }, { label: '其他', value: 3 },
    ]),
    q('gp10', '首次确诊精神分裂症的时间（如 2019-06）', 'text', null, { hint: '按“年-月”填写，不确定时可先填大概年月，由研究者核对病历后更正。' }),
    q('gp11', '病程（自首次确诊至今）——年', 'number', null, { min: 0, max: 60, integer: true, unit: '年' }),
    q('gp12', '病程（自首次确诊至今）——月', 'number', null, { min: 0, max: 11, integer: true, unit: '月' }),
    q('gp13', '既往精神科住院次数', 'number', null, { min: 0, max: 100, integer: true, unit: '次' }),
    q('gp14', '目前治疗阶段', 'radio', [
      { label: '恢复期', value: 1 }, { label: '维持期', value: 2 },
    ]),
    q('gp15', '目前是否规律服用抗精神病药物', 'radio', GP_YESNO),
    q('gp16', '目前服用抗精神病药物名称', 'text', null, { required: false, hint: '可由研究者抄录病历后补填；患者不确定可留空。' }),
    q('gp17', '除精神分裂症外，是否患有其他疾病', 'radio', [
      { label: '无', value: 0 }, { label: '有', value: 1 },
    ]),
    q('gp18', '其他疾病请注明', 'text', null, { required: false }),
  ]),
  pages: [
    { title: 'A. 基本信息', items: ids('gp', 9) },
    { title: 'B. 疾病相关资料', items: ['gp10', 'gp11', 'gp12', 'gp13', 'gp14', 'gp15', 'gp16', 'gp17', 'gp18'] },
  ],
  dimensions: [],
  scoring: { method: 'none' },
};

const GENERAL_CAREGIVER = {
  code: 'general-info-caregiver',
  title: '一般资料调查表（家属版）',
  category: '通用问卷',
  licenseTier: 'free',
  description: '课题组自编的主要照顾者一般资料、照护相关资料与智能手机使用情况调查表，用于分层与统计分析，不计分。含基本信息、照护相关资料、智能手机使用三部分；研究者筛查与纳入排除判定不在电子问卷内，由研究者在纸质版填写。',
  instructions: '请您根据实际情况选择或填写。本资料仅用于研究，严格保密。研究编号（与患者编号配对）与分组由研究者填写。',
  source: '课题组自编（依据研究方案的纳入与排除标准、分层因素与统计分析需要设计），非引用他人量表。',
  license: '自编工具，无版权限制；课题组内部使用。',
  tags: ['一般资料', '照顾者', '自编', '不计分'],
  usage: {
    population: '患者的一级家属且为日常主要照顾者（18–65 岁），自填',
    mode: '自评',
    notes: '① 本表不含研究者筛查部分（一级家属核实、共同居住与每日照护≥4h 核实、纳入排除判定、知情同意），请在纸质版由研究者填写。② 分层随机所需字段为“与患者的关系”（父母/配偶/子女），务必完整无缺失；电子问卷采集具体关系（父亲/母亲/配偶/儿子/女儿），分层归类由研究者完成。③ 每日照护时间以“小时”采集，≥4h 的判定由研究者完成。④ 智能手机使用部分用于判断能否独立完成线上随访，含微信使用与视频/文章观看能力，并由研究者现场核实。',
  },
  items: numbered([
    q('gc1', '性别', 'radio', GP_SEX),
    q('gc2', '出生年份（如 1970）', 'number', null, { min: 1900, max: 2020, integer: true, unit: '年' }),
    q('gc3', '年龄', 'number', null, { min: 18, max: 65, integer: true, unit: '岁' }),
    q('gc4', '与患者的关系', 'radio', [
      { label: '父亲', value: 1 }, { label: '母亲', value: 2 }, { label: '配偶', value: 3 },
      { label: '儿子', value: 4 }, { label: '女儿', value: 5 },
    ]),
    q('gc5', '婚姻状况', 'radio', GP_MARRIAGE),
    q('gc6', '文化程度', 'radio', GP_EDU_CARE),
    q('gc7', '目前职业状况', 'radio', [
      { label: '在职', value: 1 }, { label: '退休', value: 2 }, { label: '无业/待业', value: 3 },
      { label: '务农', value: 4 }, { label: '其他', value: 5 },
    ]),
    q('gc8', '家庭人均月收入（元）', 'radio', GP_INCOME, { required: false }),
    q('gc9', '患者的医疗付费方式', 'radio', GP_INSURANCE),
    q('gc10', '户口性质', 'radio', [{ label: '城镇', value: 1 }, { label: '农村', value: 2 }]),
    q('gc11', '目前是否与患者共同居住', 'radio', GP_YESNO),
    q('gc12', '同住家庭成员共几人', 'number', null, { min: 1, max: 30, integer: true, unit: '人' }),
    q('gc13', '承担主要照顾工作的起始时间（如 2021-03）', 'text', null, { hint: '按“年-月”填写。' }),
    q('gc14', '照顾年限', 'number', null, { min: 0, max: 60, integer: true, unit: '年' }),
    q('gc15', '照顾月数（不足一年的部分）', 'number', null, { min: 0, max: 11, integer: true, unit: '月' }),
    q('gc16', '平均每日照护患者时间', 'number', null, { min: 0, max: 24, integer: true, unit: '小时' }),
    q('gc17', '是否为日常主要照顾者（承担喂药、陪诊、生活照料等最多者）', 'radio', GP_YESNO),
    q('gc18', '照顾患者是否有报酬', 'radio', [
      { label: '无报酬', value: 0 }, { label: '有报酬', value: 1 },
    ]),
    q('gc19', '家中是否有其他人可分担照护', 'radio', [
      { label: '无', value: 0 }, { label: '有', value: 1 },
    ]),
    q('gc20', '您本人目前健康状况', 'radio', [
      { label: '良好', value: 1 }, { label: '一般', value: 2 }, { label: '较差', value: 3 },
    ]),
    q('gc21', '您本人是否患严重躯体疾病或脑器质性疾病', 'radio', [
      { label: '否', value: 0 }, { label: '是', value: 1 },
    ]),
    q('gc22', '您本人是否患有精神疾病或认知障碍', 'radio', [
      { label: '否', value: 0 }, { label: '是', value: 1 },
    ]),
    q('gc23', '近 3 个月内家庭是否遭遇其他重大生活事件（如亲人离世、重大变故等）', 'radio', [
      { label: '否', value: 0 }, { label: '是', value: 1 },
    ]),
    q('gc24', '您是否拥有本人使用的智能手机', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 },
    ]),
    q('gc25', '您使用微信的情况', 'radio', [
      { label: '每天使用', value: 1 }, { label: '偶尔使用', value: 2 }, { label: '不使用', value: 3 },
    ]),
    q('gc26', '您能否独立观看微信推送的视频、阅读公众号文章', 'radio', [
      { label: '能', value: 1 }, { label: '需少量帮助', value: 2 }, { label: '不能', value: 3 },
    ]),
  ]),
  pages: [
    { title: 'A. 基本信息', items: ids('gc', 12) },
    { title: 'B. 照护相关资料', items: ['gc13', 'gc14', 'gc15', 'gc16', 'gc17', 'gc18', 'gc19', 'gc20', 'gc21', 'gc22', 'gc23'] },
    { title: 'C. 智能手机使用情况', items: ['gc24', 'gc25', 'gc26'] },
  ],
  dimensions: [],
  scoring: { method: 'none' },
};

module.exports = [FRAS, MMAS, ZBI, GENERAL_PATIENT, GENERAL_CAREGIVER];
