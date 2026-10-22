'use strict';
/**
 * 量表库 · 情绪与心理 / 成瘾行为
 * 全部条目为公开常用中文版本，授权与来源逐条标注
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* ---------------- PHQ-2 ---------------- */
const PHQ2 = {
  code: 'phq-2',
  licenseTier: 'free',
  title: 'PHQ-2 抑郁超短筛查（2题）',
  category: '情绪与心理',
  description: '抑郁两步筛查法的第一步，仅 2 个条目，适合大样本快速筛查或门诊分诊。总分 0-6 分，≥3 分建议用 PHQ-9 进一步评估。',
  instructions: '在过去两周内，您有多少时候受到以下问题的困扰？',
  source: 'Kroenke K, Spitzer RL, Williams JB. The Patient Health Questionnaire-2: validity of a two-item depression screener. Med Care. 2003;41(11):1284-1292.',
  license: '免费使用，建议引用来源文献。',
  tags: ['抑郁', '超短', '2题', '分诊筛查'],
  items: numbered([
    q('phq2a', '做事时提不起劲或没有兴趣', 'radio', K.FREQ4),
    q('phq2b', '感到心情低落、沮丧或绝望', 'radio', K.FREQ4),
  ]),
  dimensions: [dim('total', '抑郁筛查（总分）', ['phq2a', 'phq2b'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 6],
    cutoffs: [
      { max: 2, label: '筛查阴性', level: 'normal', advice: '未达到筛查阳性标准。' },
      { max: 6, label: '筛查阳性', level: 'moderate', advice: '建议使用 PHQ-9 进一步评估抑郁严重程度。' },
    ],
  },
};

/* ---------------- GAD-2 ---------------- */
const GAD2 = {
  code: 'gad-2',
  licenseTier: 'free',
  title: 'GAD-2 焦虑超短筛查（2题）',
  category: '情绪与心理',
  description: '广泛性焦虑筛查的第一步，2 个条目，总分 0-6 分，≥3 分建议用 GAD-7 进一步评估。',
  instructions: '在过去两周内，您有多少时候受到以下问题的困扰？',
  source: 'Kroenke K, Spitzer RL, Williams JB, et al. Anxiety disorders in primary care: prevalence, impairment, comorbidity, and detection. Ann Intern Med. 2007;146(5):317-325.',
  license: '免费使用，建议引用来源文献。',
  tags: ['焦虑', '超短', '2题', '分诊筛查'],
  items: numbered([
    q('gad2a', '感到紧张、焦虑或急躁', 'radio', K.FREQ4),
    q('gad2b', '不能停止或控制担忧', 'radio', K.FREQ4),
  ]),
  dimensions: [dim('total', '焦虑筛查（总分）', ['gad2a', 'gad2b'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 6],
    cutoffs: [
      { max: 2, label: '筛查阴性', level: 'normal', advice: '未达到筛查阳性标准。' },
      { max: 6, label: '筛查阳性', level: 'moderate', advice: '建议使用 GAD-7 进一步评估焦虑严重程度。' },
    ],
  },
};

/* ---------------- SAS 焦虑自评量表 ---------------- */
const SAS = {
  code: 'sas',
  licenseTier: 'registration',
  title: 'SAS 焦虑自评量表（Zung，20题）',
  category: '情绪与心理',
  description: 'Zung 焦虑自评量表，20 个条目，评估一周内焦虑的主观感受。粗分 20-80 分，标准分 = 粗分 × 1.25（取整数部分）。中国常模：标准分 ≥50 提示焦虑，50-59 轻度、60-69 中度、≥70 重度。含 5 个反向计分条目（第 5、9、13、17、19 题）。',
  instructions: '请根据您最近一周的实际感受，选择最符合的一项。',
  source: 'Zung WWK. A rating instrument for anxiety disorders. Psychosomatics. 1971;12(6):371-379. 中文常模见：中国行为医学科学编辑委员会《行为医学量表手册》。',
  license: '公开发表量表，学术研究与临床可免费使用，建议引用来源文献。',
  tags: ['焦虑', '自评', '20题', 'Zung', '含反向计分'],
  items: numbered([
    q('sas1', '我觉得比平常容易紧张和着急', 'radio', K.ZUNG4),
    q('sas2', '我无缘无故地感到害怕', 'radio', K.ZUNG4),
    q('sas3', '我容易心里烦乱或觉得惊恐', 'radio', K.ZUNG4),
    q('sas4', '我觉得自己可能将要发疯', 'radio', K.ZUNG4),
    q('sas5', '我觉得一切都很好，也不会发生什么不幸', 'radio', K.ZUNG4, { reverse: true }),
    q('sas6', '我手脚发抖打颤', 'radio', K.ZUNG4),
    q('sas7', '我因为头痛、颈痛和背痛而苦恼', 'radio', K.ZUNG4),
    q('sas8', '我感觉容易衰弱和疲乏', 'radio', K.ZUNG4),
    q('sas9', '我觉得心平气和，并且容易安静坐着', 'radio', K.ZUNG4, { reverse: true }),
    q('sas10', '我觉得心跳得很快', 'radio', K.ZUNG4),
    q('sas11', '我因为一阵阵头晕而苦恼', 'radio', K.ZUNG4),
    q('sas12', '我有晕倒发作，或觉得要晕倒似的', 'radio', K.ZUNG4),
    q('sas13', '我呼气、吸气都感到很容易', 'radio', K.ZUNG4, { reverse: true }),
    q('sas14', '我手脚麻木和刺痛', 'radio', K.ZUNG4),
    q('sas15', '我因为胃痛和消化不良而苦恼', 'radio', K.ZUNG4),
    q('sas16', '我常常要小便', 'radio', K.ZUNG4),
    q('sas17', '我的手常常是干燥温暖的', 'radio', K.ZUNG4, { reverse: true }),
    q('sas18', '我脸红发热', 'radio', K.ZUNG4),
    q('sas19', '我容易入睡，并且一夜睡得很好', 'radio', K.ZUNG4, { reverse: true }),
    q('sas20', '我做噩梦', 'radio', K.ZUNG4),
  ]),
  dimensions: [dim('total', '焦虑标准分', K.ids('sas', 20))],
  scoring: {
    method: 'sum',
    multiplier: 1.25,
    totalRange: [25, 100],
    round: 'round',
    cutoffs: [
      { max: 49, label: '无焦虑', level: 'normal', advice: '标准分 <50，未达到焦虑水平。' },
      { max: 59, label: '轻度焦虑', level: 'mild', advice: '建议心理疏导、放松训练，1-2 周后复评。' },
      { max: 69, label: '中度焦虑', level: 'moderate', advice: '建议专科评估，可考虑心理治疗和/或药物治疗。' },
      { max: 100, label: '重度焦虑', level: 'severe', advice: '建议尽快精神心理科就诊。' },
    ],
  },
};

/* ---------------- SDS 抑郁自评量表 ---------------- */
const SDS = {
  code: 'sds',
  licenseTier: 'registration',
  title: 'SDS 抑郁自评量表（Zung，20题）',
  category: '情绪与心理',
  description: 'Zung 抑郁自评量表，20 个条目，评估一周内抑郁的主观感受。粗分 20-80 分，标准分 = 粗分 × 1.25（取整数部分）。中国常模：标准分 ≥53 提示抑郁，53-62 轻度、63-72 中度、≥73 重度。含 10 个反向计分条目。',
  instructions: '请根据您最近一周的实际感受，选择最符合的一项。',
  source: 'Zung WWK. A self-rating depression scale. Arch Gen Psychiatry. 1965;12:63-70. 中文常模见：中国行为医学科学编辑委员会《行为医学量表手册》。',
  license: '公开发表量表，学术研究与临床可免费使用，建议引用来源文献。',
  tags: ['抑郁', '自评', '20题', 'Zung', '含反向计分'],
  items: numbered([
    q('sds1', '我觉得闷闷不乐，情绪低沉', 'radio', K.ZUNG4),
    q('sds2', '我觉得一天之中早晨最好', 'radio', K.ZUNG4, { reverse: true }),
    q('sds3', '我一阵阵哭出来或觉得想哭', 'radio', K.ZUNG4),
    q('sds4', '我晚上睡眠不好', 'radio', K.ZUNG4),
    q('sds5', '我吃得跟平常一样多', 'radio', K.ZUNG4, { reverse: true }),
    q('sds6', '我与异性密切接触时和以往一样感到愉快', 'radio', K.ZUNG4, { reverse: true }),
    q('sds7', '我发觉我的体重在下降', 'radio', K.ZUNG4),
    q('sds8', '我有便秘的苦恼', 'radio', K.ZUNG4),
    q('sds9', '我心跳比平时快', 'radio', K.ZUNG4),
    q('sds10', '我无缘无故地感到疲乏', 'radio', K.ZUNG4),
    q('sds11', '我的头脑跟平常一样清楚', 'radio', K.ZUNG4, { reverse: true }),
    q('sds12', '我觉得经常做的事情并没有困难', 'radio', K.ZUNG4, { reverse: true }),
    q('sds13', '我觉得不安而平静不下来', 'radio', K.ZUNG4),
    q('sds14', '我对将来抱有希望', 'radio', K.ZUNG4, { reverse: true }),
    q('sds15', '我比平常容易生气激动', 'radio', K.ZUNG4),
    q('sds16', '我觉得作出决定是容易的', 'radio', K.ZUNG4, { reverse: true }),
    q('sds17', '我觉得自己是个有用的人，有人需要我', 'radio', K.ZUNG4, { reverse: true }),
    q('sds18', '我的生活过得很有意思', 'radio', K.ZUNG4, { reverse: true }),
    q('sds19', '我认为如果我死了，别人会生活得好些', 'radio', K.ZUNG4, {
      safety: true,
      hint: '本条目涉及消极意念。如有此类想法，请立即联系精神心理科医生或拨打全国心理援助热线 12356。',
    }),
    q('sds20', '平常感兴趣的事我仍然照样感兴趣', 'radio', K.ZUNG4, { reverse: true }),
  ]),
  dimensions: [dim('total', '抑郁标准分', K.ids('sds', 20))],
  scoring: {
    method: 'sum',
    multiplier: 1.25,
    totalRange: [25, 100],
    round: 'round',
    cutoffs: [
      { max: 52, label: '无抑郁', level: 'normal', advice: '标准分 <53，未达到抑郁水平。' },
      { max: 62, label: '轻度抑郁', level: 'mild', advice: '建议心理支持与随访观察。' },
      { max: 72, label: '中度抑郁', level: 'moderate', advice: '建议专科评估，可考虑心理治疗和/或药物治疗。' },
      { max: 100, label: '重度抑郁', level: 'severe', advice: '建议尽快精神心理科就诊，注意安全风险评估。' },
    ],
    criticalItems: ['sds19'],
    criticalThreshold: 2,
    criticalMessage: '第19题提示存在消极意念，建议立即进行安全风险临床评估。',
  },
};

/* ---------------- GDS-15 ---------------- */
const GDS15 = {
  code: 'gds-15',
  licenseTier: 'free',
  title: 'GDS-15 老年抑郁量表（简版）',
  category: '情绪与心理',
  description: '专为老年人设计的抑郁筛查工具，15 个"是/否"条目，避免躯体症状干扰（适合共病较多的老年患者）。总分 0-15 分，≥5 分提示抑郁：5-8 轻度、9-11 中度、12-15 重度。',
  instructions: '请根据您最近一周的感受，选择"是"或"否"。',
  source: 'Sheikh JI, Yesavage JA. Geriatric Depression Scale (GDS): recent evidence and development of a shorter version. Clin Gerontol. 1986;5(1-2):165-173.',
  license: '免费使用（公有领域工具），建议引用来源文献。',
  tags: ['老年', '抑郁', '15题', '是/否作答', '含反向计分'],
  items: numbered([
    q('gds1', '您对目前的生活基本上满意吗？', 'radio', K.YESNO, { reverse: true }),
    q('gds2', '您是否放弃了许多活动和兴趣？', 'radio', K.YESNO),
    q('gds3', '您是否觉得自己的生活空虚？', 'radio', K.YESNO),
    q('gds4', '您是否常常感到厌烦？', 'radio', K.YESNO),
    q('gds5', '您是否大部分时间心情愉快？', 'radio', K.YESNO, { reverse: true }),
    q('gds6', '您是否担心会有不好的事情发生在自己身上？', 'radio', K.YESNO),
    q('gds7', '您是否大部分时间感到幸福？', 'radio', K.YESNO, { reverse: true }),
    q('gds8', '您是否常常感到无助？', 'radio', K.YESNO),
    q('gds9', '您是否宁愿待在家里，而不愿外出做些新的事情？', 'radio', K.YESNO),
    q('gds10', '您是否觉得自己的记忆力比多数人差？', 'radio', K.YESNO),
    q('gds11', '您是否觉得现在活着是件很好的事情？', 'radio', K.YESNO, { reverse: true }),
    q('gds12', '您是否觉得自己现在很没用？', 'radio', K.YESNO),
    q('gds13', '您是否感到精力充沛？', 'radio', K.YESNO, { reverse: true }),
    q('gds14', '您是否觉得自己的处境没有希望？', 'radio', K.YESNO),
    q('gds15', '您是否觉得大多数人比您过得好？', 'radio', K.YESNO),
  ]),
  dimensions: [dim('total', '老年抑郁（总分）', K.ids('gds', 15))],
  scoring: {
    method: 'sum',
    totalRange: [0, 15],
    cutoffs: [
      { max: 4, label: '无抑郁', level: 'normal', advice: '未达到抑郁筛查阳性标准。' },
      { max: 8, label: '轻度抑郁', level: 'mild', advice: '建议随访与心理支持。' },
      { max: 11, label: '中度抑郁', level: 'moderate', advice: '建议老年精神/心理专科评估。' },
      { max: 15, label: '重度抑郁', level: 'severe', advice: '建议尽快专科就诊，注意安全风险评估。' },
    ],
  },
};

/* ---------------- CD-RISC-10 ---------------- */
const CDRISC10 = {
  code: 'cd-risc-10',
  licenseTier: 'registration',
  title: 'CD-RISC-10 心理韧性量表（简版）',
  category: '情绪与心理',
  description: 'Connor-Davidson 心理韧性量表 10 条目简版，评估个体面对压力与逆境的适应能力。总分 0-40 分，分数越高表示心理韧性越好。',
  instructions: '请根据您最近一个月的实际情况，选择最符合的一项。',
  source: 'Campbell-Sills L, Stein MB. Psychometric analysis and refinement of the Connor-Davidson Resilience Scale (CD-RISC). J Trauma Stress. 2007;20(6):1019-1028.',
  license: 'CD-RISC 由原作者免费提供用于非商业研究，建议在论文中引用来源文献。',
  tags: ['心理韧性', '积极心理', '10题'],
  items: numbered([
    q('cd1', '当事情发生变化时，我能够适应', 'radio', K.MATCH5),
    q('cd2', '无论遇到什么事情，我都能应对', 'radio', K.MATCH5),
    q('cd3', '面对问题时，我试着看到事情有趣的一面', 'radio', K.MATCH5),
    q('cd4', '应对压力会使我变得更坚强', 'radio', K.MATCH5),
    q('cd5', '生病、受伤或其他困难之后，我通常能很快恢复', 'radio', K.MATCH5),
    q('cd6', '即使有障碍，我也相信自己能实现目标', 'radio', K.MATCH5),
    q('cd7', '在压力下，我能集中注意力并清晰地思考', 'radio', K.MATCH5),
    q('cd8', '我不会轻易被失败击倒', 'radio', K.MATCH5),
    q('cd9', '面对生活中的挑战和困难时，我认为自己是个坚强的人', 'radio', K.MATCH5),
    q('cd10', '我能够处理悲伤、恐惧、愤怒等令人不快的情绪', 'radio', K.MATCH5),
  ]),
  dimensions: [dim('total', '心理韧性（总分）', K.ids('cd', 10))],
  scoring: {
    method: 'sum',
    totalRange: [0, 40],
    cutoffs: [
      { max: 20, label: '心理韧性较低', level: 'moderate', advice: '建议关注心理支持需求与压力应对方式。' },
      { max: 30, label: '心理韧性中等', level: 'mild', advice: '心理韧性处于中等水平。' },
      { max: 40, label: '心理韧性良好', level: 'normal', advice: '心理韧性良好，可作为保护性因素。' },
    ],
  },
};

/* ---------------- GSES 一般自我效能感 ---------------- */
const GSES = {
  code: 'gses',
  licenseTier: 'registration',
  title: 'GSES 一般自我效能感量表',
  category: '情绪与心理',
  description: 'Schwarzer 一般自我效能感量表（中文版），10 个条目，评估个体应对困难情境的总体自信心。总分 10-40 分，得分越高自我效能感越强；常用均分 = 总分/10。',
  instructions: '请根据您的实际情况，选择最符合的一项。',
  source: 'Schwarzer R, Jerusalem M. Generalized Self-Efficacy Scale. 1995. 中文版：张建新, Schwarzer R. 一般自我效能感量表. 1995.',
  license: '公开发表量表，研究用途免费，建议引用中英文来源文献。',
  tags: ['自我效能', '积极心理', '10题'],
  items: numbered([
    q('gse1', '如果我尽力去做的话，我总是能够解决问题的', 'radio', K.FREQ4_1),
    q('gse2', '即使别人反对我，我仍有办法取得我所要的', 'radio', K.FREQ4_1),
    q('gse3', '对我来说，坚持理想和达成目标是轻而易举的', 'radio', K.FREQ4_1),
    q('gse4', '我自信能有效地应付任何突如其来的事情', 'radio', K.FREQ4_1),
    q('gse5', '以我的才智，我一定能应付意料之外的情况', 'radio', K.FREQ4_1),
    q('gse6', '如果我付出必要的努力，我一定能解决大多数的难题', 'radio', K.FREQ4_1),
    q('gse7', '我能冷静地面对困难，因为我信赖自己处理问题的能力', 'radio', K.FREQ4_1),
    q('gse8', '面对一个难题时，我通常能找到几个解决方法', 'radio', K.FREQ4_1),
    q('gse9', '有麻烦的时候，我通常能想到一些应付的方法', 'radio', K.FREQ4_1),
    q('gse10', '无论什么事在我身上发生，我都能应付自如', 'radio', K.FREQ4_1),
  ]),
  dimensions: [dim('total', '自我效能感（总分）', K.ids('gse', 10))],
  scoring: {
    method: 'sum',
    totalRange: [10, 40],
    cutoffs: [
      { max: 20, label: '自我效能感较低', level: 'moderate', advice: '建议关注自我效能相关干预（如健康教育、成功体验设置）。' },
      { max: 30, label: '自我效能感中等', level: 'mild', advice: '自我效能感处于中等水平。' },
      { max: 40, label: '自我效能感较高', level: 'normal', advice: '自我效能感较高。' },
    ],
  },
};

/* ---------------- SSRS 社会支持评定量表 ---------------- */
const SSRS = {
  code: 'ssrs',
  licenseTier: 'registration',
  title: 'SSRS 社会支持评定量表（肖水源）',
  category: '情绪与心理',
  description: '肖水源社会支持评定量表，含客观支持、主观支持、支持利用度 3 个维度，总分 0-66 分，分数越高社会支持越好。注意：第 5 题拆分为 5 个小题，第 6、7 题为多选（每选一个来源计 1 分）。',
  instructions: '下面的问题用于反映您在社会中所获得的支持，请按各个问题的具体要求，根据您的实际情况选择。',
  source: '肖水源. 《社会支持评定量表》的理论基础与研究应用. 临床精神医学杂志. 1994;4(2):98-100.',
  license: '国内公开发表量表，学术研究可免费使用，建议引用来源文献。',
  tags: ['社会支持', '护理研究', '10题', '3个维度'],
  items: numbered([
    q('ss1', '您有多少关系密切、可以得到支持和帮助的朋友？', 'radio', [
      { label: '一个也没有', value: 1 }, { label: '1-2个', value: 2 }, { label: '3-5个', value: 3 }, { label: '6个或6个以上', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss2', '近一年来您的居住情况', 'radio', [
      { label: '远离家人且独居一室', value: 1 }, { label: '住处经常变动，多数时间和陌生人住在一起', value: 2 },
      { label: '和同学、同事或朋友住在一起', value: 3 }, { label: '和家人住在一起', value: 4 },
    ], { dimension: 'objective' }),
    q('ss3', '您与邻居的关系', 'radio', [
      { label: '相互之间从不关心，只是点头之交', value: 1 }, { label: '遇到困难可能稍微关心', value: 2 },
      { label: '有些邻居很关心您', value: 3 }, { label: '大部分邻居都很关心您', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss4', '您与同事的关系', 'radio', [
      { label: '相互之间从不关心，只是点头之交', value: 1 }, { label: '遇到困难可能稍微关心', value: 2 },
      { label: '有些同事很关心您', value: 3 }, { label: '大部分同事都很关心您', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss5a', '从配偶（恋人）得到的支持和照顾', 'radio', [
      { label: '无', value: 1 }, { label: '极少', value: 2 }, { label: '一般', value: 3 }, { label: '全力支持', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss5b', '从父母得到的支持和照顾', 'radio', [
      { label: '无', value: 1 }, { label: '极少', value: 2 }, { label: '一般', value: 3 }, { label: '全力支持', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss5c', '从儿女得到的支持和照顾', 'radio', [
      { label: '无', value: 1 }, { label: '极少', value: 2 }, { label: '一般', value: 3 }, { label: '全力支持', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss5d', '从兄弟姐妹得到的支持和照顾', 'radio', [
      { label: '无', value: 1 }, { label: '极少', value: 2 }, { label: '一般', value: 3 }, { label: '全力支持', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss5e', '从其他家庭成员（如嫂子、弟媳等）得到的支持和照顾', 'radio', [
      { label: '无', value: 1 }, { label: '极少', value: 2 }, { label: '一般', value: 3 }, { label: '全力支持', value: 4 },
    ], { dimension: 'subjective' }),
    q('ss6', '过去在您遇到急难情况时，曾经得到的经济支持或解决实际问题的帮助来源（多选，每项 1 分；如无来源请选"无任何来源"）', 'checkbox', [
      { label: '无任何来源', value: 0 }, { label: '配偶（恋人）', value: 1 }, { label: '其他家人', value: 1 },
      { label: '朋友', value: 1 }, { label: '亲戚', value: 1 }, { label: '同事', value: 1 },
      { label: '工作单位', value: 1 }, { label: '党团工会等官方或半官方组织', value: 1 },
      { label: '宗教、社会团体等非官方组织', value: 1 }, { label: '其他', value: 1 },
    ], { dimension: 'objective' }),
    q('ss7', '过去在您遇到急难情况时，曾经得到的安慰和关心的来源（多选，每项 1 分；如无来源请选"无任何来源"）', 'checkbox', [
      { label: '无任何来源', value: 0 }, { label: '配偶（恋人）', value: 1 }, { label: '其他家人', value: 1 },
      { label: '朋友', value: 1 }, { label: '亲戚', value: 1 }, { label: '同事', value: 1 },
      { label: '工作单位', value: 1 }, { label: '党团工会等官方或半官方组织', value: 1 },
      { label: '宗教、社会团体等非官方组织', value: 1 }, { label: '其他', value: 1 },
    ], { dimension: 'objective' }),
    q('ss8', '您遇到烦恼时的倾诉方式', 'radio', [
      { label: '从不向任何人诉说', value: 1 }, { label: '只向关系极为密切的1-2个人诉说', value: 2 },
      { label: '如果朋友主动询问，您会说出来', value: 3 }, { label: '主动诉说自己的烦恼，以获得支持和理解', value: 4 },
    ], { dimension: 'utilize' }),
    q('ss9', '您遇到烦恼时的求助方式', 'radio', [
      { label: '只靠自己，不接受别人帮助', value: 1 }, { label: '很少请求别人帮助', value: 2 },
      { label: '有时请求别人帮助', value: 3 }, { label: '有困难时经常向家人、亲友、组织求援', value: 4 },
    ], { dimension: 'utilize' }),
    q('ss10', '对于团体（如党团组织、宗教组织、工会、学生会等）组织的活动，您', 'radio', [
      { label: '从不参加', value: 1 }, { label: '偶尔参加', value: 2 }, { label: '经常参加', value: 3 }, { label: '主动参加并积极活动', value: 4 },
    ], { dimension: 'utilize' }),
  ]),
  dimensions: [
    dim('objective', '客观支持', ['ss2', 'ss6', 'ss7']),
    dim('subjective', '主观支持', ['ss1', 'ss3', 'ss4', 'ss5a', 'ss5b', 'ss5c', 'ss5d', 'ss5e']),
    dim('utilize', '支持利用度', ['ss8', 'ss9', 'ss10']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [12, 66],
    cutoffs: [
      { max: 22, label: '社会支持较低', level: 'moderate', advice: '社会支持水平较低，建议关注社会支持系统评估与干预。' },
      { max: 32, label: '社会支持一般', level: 'mild', advice: '社会支持处于一般水平。' },
      { max: 66, label: '社会支持良好', level: 'normal', advice: '社会支持良好，为重要的保护性因素。' },
    ],
  },
};

/* ---------------- PCL-5 ---------------- */
const PCL5 = {
  code: 'pcl-5',
  licenseTier: 'free',
  title: 'PCL-5 创伤后应激障碍筛查量表（DSM-5）',
  category: '情绪与心理',
  description: 'DSM-5 对应的 PTSD 症状清单，20 个条目（B 侵入 5 题、C 回避 2 题、D 认知与情绪 7 题、E 警觉与反应 6 题），总分 0-80 分，≥33 分提示可能存在 PTSD（需结合临床访谈确认）。',
  instructions: '以下问题针对您过去一个月内，由某件创伤性事件（如事故、暴力、丧失、重大疾病等）引起的困扰。请选择每个问题困扰您的程度。',
  source: 'Weathers FW, Litz BT, Keane TM, et al. The PTSD Checklist for DSM-5 (PCL-5). National Center for PTSD, 2013.',
  license: '美国国家 PTSD 中心免费提供，可自由使用，建议引用来源。',
  tags: ['创伤后应激', 'PTSD', '20题', 'DSM-5', '4个症状群'],
  items: numbered([
    q('pcl1', '反复出现、不由自主地、侵入性地想起创伤事件的痛苦回忆', 'radio', K.SEV5, { dimension: 'B' }),
    q('pcl2', '反复出现关于创伤事件的痛苦梦境', 'radio', K.SEV5, { dimension: 'B' }),
    q('pcl3', '感觉创伤事件仿佛再次发生（如闪回、错觉、幻觉）', 'radio', K.SEV5, { dimension: 'B' }),
    q('pcl4', '当想起创伤事件时感到非常痛苦', 'radio', K.SEV5, { dimension: 'B' }),
    q('pcl5', '对创伤相关线索产生强烈的生理反应（如心跳加快、出汗、呼吸困难）', 'radio', K.SEV5, { dimension: 'B' }),
    q('pcl6', '回避与创伤事件相关的记忆、想法或感受', 'radio', K.SEV5, { dimension: 'C' }),
    q('pcl7', '回避能勾起创伤回忆的外部线索（人、地点、对话、活动、物品、场合）', 'radio', K.SEV5, { dimension: 'C' }),
    q('pcl8', '无法回忆起创伤事件的重要部分', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl9', '对自己、他人或世界持有持续的、夸大的负面信念（如"我很坏""没人可以信任"）', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl10', '因创伤事件而责备自己或他人', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl11', '持续的负面情绪（如恐惧、愤怒、内疚、羞耻）', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl12', '对以前喜欢的活动失去兴趣', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl13', '感到与他人疏远或分离', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl14', '难以体验到积极情绪（如无法感到幸福、满足或爱）', 'radio', K.SEV5, { dimension: 'D' }),
    q('pcl15', '易激惹、发怒，或做出攻击性行为', 'radio', K.SEV5, { dimension: 'E' }),
    q('pcl16', '冒险或自我毁灭的行为', 'radio', K.SEV5, { dimension: 'E' }),
    q('pcl17', '过度警觉、时刻警惕', 'radio', K.SEV5, { dimension: 'E' }),
    q('pcl18', '惊吓反应过度（如听到突然的响声就跳起来）', 'radio', K.SEV5, { dimension: 'E' }),
    q('pcl19', '注意力难以集中', 'radio', K.SEV5, { dimension: 'E' }),
    q('pcl20', '入睡困难或睡眠不深', 'radio', K.SEV5, { dimension: 'E' }),
  ]),
  dimensions: [
    dim('B', 'B 侵入性症状', ['pcl1', 'pcl2', 'pcl3', 'pcl4', 'pcl5']),
    dim('C', 'C 回避症状', ['pcl6', 'pcl7']),
    dim('D', 'D 认知与情绪负性改变', ['pcl8', 'pcl9', 'pcl10', 'pcl11', 'pcl12', 'pcl13', 'pcl14']),
    dim('E', 'E 警觉性与反应性改变', ['pcl15', 'pcl16', 'pcl17', 'pcl18', 'pcl19', 'pcl20']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 80],
    cutoffs: [
      { max: 32, label: '未达筛查界值', level: 'normal', advice: '总分 <33，暂未达到 PTSD 筛查阳性界值。' },
      { max: 80, label: '提示可能存在 PTSD', level: 'severe', advice: '总分 ≥33，建议由精神心理专科进行结构化临床访谈（如 CAPS-5）确认诊断。' },
    ],
  },
};

/* ---------------- DASS-21 ---------------- */
const DASS21 = {
  code: 'dass-21',
  licenseTier: 'free',
  title: 'DASS-21 抑郁-焦虑-压力量表（简版）',
  category: '情绪与心理',
  description: '一次同时评估抑郁、焦虑、压力三种负性情绪的 21 条目量表（每个维度 7 题）。各维度原始分 ×2 后与常模比较。',
  instructions: '请根据您过去一周的情况，选择每项描述符合您的程度。',
  source: 'Lovibond SH, Lovibond PF. Manual for the Depression Anxiety Stress Scales (2nd ed). 1995. 中文版：龚栩等，2010。',
  license: '公开可自由使用（公有领域），中文版建议引用中文验证文献。',
  tags: ['抑郁', '焦虑', '压力', '21题', '3个维度'],
  items: numbered([
    q('dass1', '我觉得很难让自己平静下来', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass2', '我感到口干', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass3', '我完全无法感受到积极情绪', 'radio', K.SEV4, { dimension: 'depression' }),
    q('dass4', '我感到呼吸困难（如呼吸急促、不喘气就难受）', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass5', '我觉得很难主动去做事情', 'radio', K.SEV4, { dimension: 'depression' }),
    q('dass6', '我容易反应过度', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass7', '我感到发抖（如手抖）', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass8', '我觉得自己消耗了很多精力', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass9', '我担心可能发生让自己恐慌或出丑的场合', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass10', '我觉得自己对将来没有什么可期待的', 'radio', K.SEV4, { dimension: 'depression' }),
    q('dass11', '我发现自己变得烦躁不安', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass12', '我觉得很难放松下来', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass13', '我感到沮丧和忧郁', 'radio', K.SEV4, { dimension: 'depression' }),
    q('dass14', '我无法容忍任何阻碍我继续工作的事情', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass15', '我感到快要崩溃了', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass16', '我对任何事情都提不起兴趣', 'radio', K.SEV4, { dimension: 'depression' }),
    q('dass17', '我觉得自己作为一个人没有什么价值', 'radio', K.SEV4, { dimension: 'depression' }),
    q('dass18', '我觉得自己很容易被触怒', 'radio', K.SEV4, { dimension: 'stress' }),
    q('dass19', '在没有明显体力活动时，我也感到心跳加快或心律不齐', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass20', '我无缘无故地感到害怕', 'radio', K.SEV4, { dimension: 'anxiety' }),
    q('dass21', '我感到生命毫无意义', 'radio', K.SEV4, { dimension: 'depression', safety: true }),
  ]),
  dimensions: [
    dim('depression', '抑郁（原始分）', ['dass3', 'dass5', 'dass10', 'dass13', 'dass16', 'dass17', 'dass21']),
    dim('anxiety', '焦虑（原始分）', ['dass2', 'dass4', 'dass7', 'dass9', 'dass15', 'dass19', 'dass20']),
    dim('stress', '压力（原始分）', ['dass1', 'dass6', 'dass8', 'dass11', 'dass12', 'dass14', 'dass18']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 63],
    cutoffs: [
      { max: 20, label: '总体情绪困扰较低', level: 'normal', advice: '总分较低（各维度原始分×2 后参考分级：抑郁 0-9 正常、焦虑 0-7 正常、压力 0-14 正常）。' },
      { max: 40, label: '轻度情绪困扰', level: 'mild', advice: '存在轻度情绪困扰，建议心理支持与随访。' },
      { max: 63, label: '中重度情绪困扰', level: 'moderate', advice: '建议专科评估；请同时查看各维度得分（原始分×2 后对照常模分级）。' },
    ],
  },
};

/* ---------------- UCLA-3 孤独感 ---------------- */
const UCLA3 = {
  code: 'ucla-3',
  licenseTier: 'registration',
  title: 'UCLA-3 孤独感量表（简版）',
  category: '情绪与心理',
  description: '三条目孤独感量表，常用于大样本调查与老年/慢病人群。总分 3-9 分，≥6 分提示存在孤独感。',
  instructions: '请根据您最近的感受，回答以下三个问题。',
  source: 'Hughes ME, Waite LJ, Hawkley LC, Cacioppo JT. A short scale for measuring loneliness in large surveys. Res Aging. 2004;26(6):655-672.',
  license: '公开发表量表，研究用途免费，建议引用来源文献。',
  tags: ['孤独感', '社会心理', '3题', '超短'],
  items: numbered([
    q('ucla1', '您多久感到缺少陪伴？', 'radio', [
      { label: '几乎没有', value: 1 }, { label: '有时', value: 2 }, { label: '经常', value: 3 },
    ]),
    q('ucla2', '您多久感到被冷落或被排除在外？', 'radio', [
      { label: '几乎没有', value: 1 }, { label: '有时', value: 2 }, { label: '经常', value: 3 },
    ]),
    q('ucla3', '您多久感到与他人隔绝？', 'radio', [
      { label: '几乎没有', value: 1 }, { label: '有时', value: 2 }, { label: '经常', value: 3 },
    ]),
  ]),
  dimensions: [dim('total', '孤独感（总分）', ['ucla1', 'ucla2', 'ucla3'])],
  scoring: {
    method: 'sum',
    totalRange: [3, 9],
    cutoffs: [
      { max: 5, label: '无明显孤独感', level: 'normal', advice: '孤独感不明显。' },
      { max: 9, label: '存在孤独感', level: 'moderate', advice: '提示存在孤独感，建议关注社会支持与心理状态。' },
    ],
  },
};

/* ---------------- AUDIT-C ---------------- */
const AUDITC = {
  code: 'audit-c',
  licenseTier: 'free',
  title: 'AUDIT-C 酒精使用障碍筛查（简版）',
  category: '成瘾行为',
  description: 'WHO AUDIT 的简版（3 个条目），总分 0-12 分。≥4 分（男性）或 ≥3 分（女性）提示存在有害饮酒风险。',
  instructions: '请根据您过去一年的饮酒情况作答（1 标准杯≈啤酒 350ml / 葡萄酒 150ml / 白酒 45ml）。',
  source: 'Bush K, Kivlahan DR, McDonell MB, et al. The AUDIT alcohol consumption questions (AUDIT-C). Arch Intern Med. 1998;158(16):1789-1795.',
  license: 'WHO 免费提供，建议引用来源文献。',
  tags: ['饮酒', '成瘾', '筛查', '3题'],
  items: numbered([
    q('auditc1', '您多久喝一次含酒精的饮料？', 'radio', [
      { label: '从不', value: 0 }, { label: '每月1次或更少', value: 1 }, { label: '每月2-4次', value: 2 },
      { label: '每周2-3次', value: 3 }, { label: '每周4次或更多', value: 4 },
    ]),
    q('auditc2', '在喝酒的日子里，您通常喝多少标准杯？', 'radio', [
      { label: '1-2杯', value: 0 }, { label: '3-4杯', value: 1 }, { label: '5-6杯', value: 2 },
      { label: '7-9杯', value: 3 }, { label: '10杯或更多', value: 4 },
    ]),
    q('auditc3', '您多久一次一次喝 6 标准杯或以上？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
  ]),
  dimensions: [dim('total', '饮酒风险（总分）', ['auditc1', 'auditc2', 'auditc3'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 12],
    cutoffs: [
      { max: 2, label: '饮酒风险低', level: 'normal', advice: '未达到阳性界值（男性≥4、女性≥3 为阳性）。' },
      { max: 12, label: '存在有害饮酒风险', level: 'moderate', advice: '建议进行饮酒行为评估与简短干预（注意男女性别界值不同）。' },
    ],
  },
};

/* ---------------- CAGE ---------------- */
const CAGE = {
  code: 'cage',
  licenseTier: 'free',
  title: 'CAGE 酒精问题筛查问卷',
  category: '成瘾行为',
  description: '最简短的酒精相关问题筛查工具，4 个"是/否"问题，≥2 个"是"提示可能存在酒精滥用/依赖。',
  instructions: '请如实回答以下 4 个问题（答案无对错之分）。',
  source: 'Ewing JA. Detecting alcoholism: the CAGE questionnaire. JAMA. 1984;252(14):1905-1907.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['饮酒', '成瘾', '4题', '是/否作答'],
  items: numbered([
    q('cage1', '您是否曾经觉得自己应该减少饮酒？', 'radio', K.YESNO),
    q('cage2', '您是否曾经因为别人批评您喝酒而感到烦恼？', 'radio', K.YESNO),
    q('cage3', '您是否曾经因为喝酒而感到内疚？', 'radio', K.YESNO),
    q('cage4', '您是否曾经早晨起床后第一件事就是喝酒（"睁眼酒"）？', 'radio', K.YESNO),
  ]),
  dimensions: [dim('total', 'CAGE 阳性条目数', K.ids('cage', 4))],
  scoring: {
    method: 'sum',
    totalRange: [0, 4],
    cutoffs: [
      { max: 1, label: '筛查阴性', level: 'normal', advice: '未达到阳性界值。' },
      { max: 4, label: '筛查阳性', level: 'moderate', advice: '≥2 个"是"提示可能存在酒精滥用或依赖，建议进一步评估（如 AUDIT、AUDIT-C）。' },
    ],
  },
};

/* ---------------- FTND 尼古丁依赖 ---------------- */
const FTND = {
  code: 'ftnd',
  licenseTier: 'free',
  title: 'FTND 尼古丁依赖程度量表',
  category: '成瘾行为',
  description: 'Fagerström 尼古丁依赖测试，6 个条目，总分 0-10 分：0-2 极低、3-4 低、5 中等、6-7 高、8-10 极高依赖。',
  instructions: '请根据您目前（或戒烟前）的吸烟情况作答。',
  source: 'Heatherton TF, Kozlowski LT, Frecker RC, Fagerström KO. The Fagerström Test for Nicotine Dependence. Br J Addict. 1991;86(9):1119-1127.',
  license: '公开发表工具，研究与临床可免费使用，建议引用来源文献。',
  tags: ['吸烟', '尼古丁依赖', '成瘾', '6题'],
  items: numbered([
    q('ftnd1', '您通常在起床后多久吸第一支烟？', 'radio', [
      { label: '5分钟以内', value: 3 }, { label: '6-30分钟', value: 2 }, { label: '31-60分钟', value: 1 }, { label: '60分钟以后', value: 0 },
    ]),
    q('ftnd2', '在禁止吸烟的场所（如医院、图书馆），您能否不吸烟？', 'radio', [
      { label: '能', value: 0 }, { label: '不能', value: 1 },
    ]),
    q('ftnd3', '您认为一天中哪一支烟最难放弃？', 'radio', [
      { label: '早晨的第一支', value: 1 }, { label: '其他时间的某一支', value: 0 },
    ]),
    q('ftnd4', '您每天吸多少支烟？', 'radio', [
      { label: '10支或以下', value: 0 }, { label: '11-20支', value: 1 }, { label: '21-30支', value: 2 }, { label: '31支或以上', value: 3 },
    ]),
    q('ftnd5', '您起床后第一个小时内的吸烟量是否比其他时间多？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 },
    ]),
    q('ftnd6', '即使因生病卧床，您是否仍然吸烟？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 },
    ]),
  ]),
  dimensions: [dim('total', '尼古丁依赖（总分）', K.ids('ftnd', 6))],
  scoring: {
    method: 'sum',
    totalRange: [0, 10],
    cutoffs: [
      { max: 2, label: '极低依赖', level: 'normal', advice: '尼古丁依赖程度极低。' },
      { max: 4, label: '低依赖', level: 'mild', advice: '尼古丁依赖程度低。' },
      { max: 5, label: '中等依赖', level: 'moderate', advice: '尼古丁依赖中等，建议行为干预配合药物辅助。' },
      { max: 7, label: '高依赖', level: 'severe', advice: '依赖程度高，建议药物（尼古丁替代/伐尼克兰等）+ 行为干预。' },
      { max: 10, label: '极高依赖', level: 'severe', advice: '依赖程度极高，建议专科戒烟门诊系统干预。' },
    ],
  },
};

module.exports = [
  PHQ2, GAD2, SAS, SDS, GDS15, CDRISC10, GSES, SSRS, PCL5, DASS21, UCLA3,
  AUDITC, CAGE, FTND,
];
