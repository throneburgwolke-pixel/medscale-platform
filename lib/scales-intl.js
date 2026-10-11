'use strict';
/**
 * 量表库 · 国际权威量表补充（第一批：心理与成瘾筛查）
 * 每个量表附带 usage 字段（使用方法）：适用人群 / 施测方式 / 用时 / 计分 / 判读 / 注意事项 / 信效度
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

const YN = [{ label: '是', value: 1 }, { label: '否', value: 0 }];
const FREQ_WEEK = [
  { label: '从不', value: 0 }, { label: '很少', value: 1 }, { label: '有时', value: 2 },
  { label: '经常', value: 3 }, { label: '总是', value: 4 },
];

const BORG = [
  { label: '6 非常轻松', value: 6 }, { label: '7', value: 7 }, { label: '8', value: 8 }, { label: '9 很轻松', value: 9 },
  { label: '10', value: 10 }, { label: '11 较轻松', value: 11 }, { label: '12', value: 12 }, { label: '13 稍累', value: 13 },
  { label: '14', value: 14 }, { label: '15 累', value: 15 }, { label: '16', value: 16 }, { label: '17 很累', value: 17 },
  { label: '18', value: 18 }, { label: '19 非常累', value: 19 }, { label: '20 极度疲劳', value: 20 },
];

const SEV5_1 = [
  { label: '无', value: 0 }, { label: '轻度', value: 1 }, { label: '中度', value: 2 }, { label: '重度', value: 3 }, { label: '极重度', value: 4 },
];

/* ---------------- ESAS ---------------- */
const ESAS = {
  code: 'esas',
  title: 'ESAS 埃德蒙顿症状评估系统',
  category: '症状评估',
  description: '姑息治疗与肿瘤科最常用的症状负担评估工具，9 个症状按 0-10 数字评分（0=无症状，10=最严重），可计算症状总分与"总体痛苦评分"（GDS）。',
  instructions: '请为以下每一项症状选择最能代表您过去 24 小时内感受程度的数字（0=没有该症状，10=能想象的最严重程度）。',
  source: 'Bruera E, Kuehn N, Miller MJ, Selmser P, Macmillan K. The Edmonton Symptom Assessment System (ESAS): a simple method for the assessment of palliative care patients. J Palliat Care. 1991;7(2):6-9.',
  license: '公开发表工具，非商业临床与研究使用免费，建议引用来源文献。',
  tags: ['症状负担', '姑息治疗', '肿瘤', '9项', '0-10评分'],
  usage: {
    population: '晚期肿瘤、姑息治疗、慢重症与安宁疗护患者（门诊、住院、居家）',
    mode: '自评（无法自评者由照护者代评或调查员询问）',
    time: '约 2 分钟',
    interpretation: '任一症状 ≥4 分通常提示需要临床干预；9 项之和为症状总分；"总体痛苦评分"（GDS）为前 9 项平均分，也可用于纵向比较',
    scoring: '9 个条目各 0-10 分，求和得 0-90 分；ESAS-r 增加"其他症状"栏可不计分',
    notes: '评分对干预变化敏感，建议固定评估时点（如每日下午同一时间）以方便纵向比较；与生活质量量表（如 EORTC QLQ-C30）可联合使用',
    psychometrics: '多国验证显示良好的内部一致性（α 0.79-0.86）与结构效度，被广泛用作肿瘤症状管理的主要结局指标',
  },
  items: numbered([
    q('esas1', '疼痛', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas2', '疲乏（缺乏精力）', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas3', '恶心', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas4', '抑郁（情绪低落）', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas5', '焦虑（紧张不安）', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas6', '困倦（嗜睡）', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas7', '食欲下降', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas8', '气短（呼吸困难）', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
    q('esas9', '总体舒适度差（安适感不佳）', 'slider', null, { min: 0, max: 10, dimension: 'total' }),
  ]),
  dimensions: [dim('total', '症状总分（GDS）', ['esas1','esas2','esas3','esas4','esas5','esas6','esas7','esas8','esas9'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 90],
    cutoffs: [
      { max: 0, label: '无症状', level: 'normal', advice: '当前无明显症状负担。' },
      { max: 20, label: '轻度症状负担', level: 'mild', advice: '建议对症处理并继续监测。' },
      { max: 45, label: '中度症状负担', level: 'moderate', advice: '建议逐项干预（如≥4 分的症状），并调整支持治疗方案。' },
      { max: 90, label: '重度症状负担', level: 'severe', advice: '症状负担重，建议多学科团队（姑息/疼痛/心理）介入。' },
    ],
  },
};

/* ---------------- PCS 疼痛灾难化 ---------------- */
const PCS = {
  code: 'pcs',
  title: 'PCS 疼痛灾难化量表',
  category: '康复与疼痛',
  description: '评估疼痛相关的灾难化思维（反复思虑、放大、无助），13 个条目（0-4 分），总分 0-52 分。≥30 分提示临床显著的疼痛灾难化，是慢性疼痛预后的重要预测因子。',
  instructions: '以下是与疼痛感受有关的一些描述，请根据您平时的想法与感受选择符合程度（0=完全没有，4=总是如此）。',
  source: 'Sullivan MJL, Bishop SR, Pivik J. The Pain Catastrophizing Scale: development and validation. Psychol Assess. 1995;7(4):524-532.',
  license: '公开发表量表，研究与非商业临床使用免费，建议引用来源文献。',
  tags: ['疼痛', '灾难化', '心理因素', '13题', '慢性疼痛'],
  usage: {
    population: '慢性疼痛（腰痛、颈痛、关节炎、纤维肌痛）、术后疼痛与康复科患者',
    mode: '自评',
    time: '约 3 分钟',
    scoring: '13 个条目各 0-4 分，求和为总分（0-52 分）；含 3 个维度：反复思虑、放大、无助',
    interpretation: '≥30 分提示临床显著的疼痛灾难化；分数越高提示疼痛预后越差，建议联合认知行为治疗',
    notes: '与焦虑、抑郁水平存在相关，解释时需考虑情绪因素；可作为心理干预（CBT、正念）疗效评价指标',
    psychometrics: 'α 0.87-0.93，与疼痛强度、功能障碍及抑郁显著相关；中文版在腰痛与骨关节炎人群中验证良好',
  },
  items: numbered([
    q('pcs1', '我总想着疼痛什么时候才会结束', 'radio', SEV5_1, { dimension: 'rumination' }),
    q('pcs2', '我觉得自己无法继续忍受下去了', 'radio', SEV5_1, { dimension: 'helpless' }),
    q('pcs3', '我想到疼痛就感到害怕', 'radio', SEV5_1, { dimension: 'magnify' }),
    q('pcs4', '疼痛让我感到非常难受，我觉得自己快受不了了', 'radio', SEV5_1, { dimension: 'helpless' }),
    q('pcs5', '我觉得自己再也不能忍受这种疼痛了', 'radio', SEV5_1, { dimension: 'helpless' }),
    q('pcs6', '我担心疼痛会变得更严重', 'radio', SEV5_1, { dimension: 'magnify' }),
    q('pcs7', '我总在想着疼痛相关的事情', 'radio', SEV5_1, { dimension: 'rumination' }),
    q('pcs8', '我急切地希望疼痛消失', 'radio', SEV5_1, { dimension: 'rumination' }),
    q('pcs9', '我无法把疼痛从脑海中赶走', 'radio', SEV5_1, { dimension: 'rumination' }),
    q('pcs10', '我总想着疼痛对我的伤害有多大', 'radio', SEV5_1, { dimension: 'magnify' }),
    q('pcs11', '我总想着自己多么希望疼痛快点结束', 'radio', SEV5_1, { dimension: 'rumination' }),
    q('pcs12', '我觉得没有什么能减轻疼痛', 'radio', SEV5_1, { dimension: 'helpless' }),
    q('pcs13', '我觉得如果发生更糟的事情，疼痛就更无法忍受了', 'radio', SEV5_1, { dimension: 'magnify' }),
  ]),
  dimensions: [
    dim('rumination', '反复思虑', ['pcs1', 'pcs7', 'pcs8', 'pcs9', 'pcs11']),
    dim('magnify', '放大', ['pcs3', 'pcs6', 'pcs10', 'pcs13']),
    dim('helpless', '无助', ['pcs2', 'pcs4', 'pcs5', 'pcs12']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 52],
    cutoffs: [
      { max: 29, label: '疼痛灾难化不明显', level: 'normal', advice: '未达到临床显著水平。' },
      { max: 52, label: '临床显著疼痛灾难化', level: 'severe', advice: '≥30 分提示疼痛灾难化明显，建议转介心理干预（认知行为治疗、正念减压）并纳入疼痛综合管理。' },
    ],
  },
};

/* ---------------- 单条目分级量表（VAS/Bristol/FAC/Ashworth/mRS/NYHA/CCS/EHRA/Borg） ---------------- */
const VAS_PAIN = {
  code: 'vas-pain',
  title: 'VAS 视觉模拟疼痛评分',
  category: '康复与疼痛',
  description: '最经典的疼痛强度自评工具：在 0-10（或 0-100mm）线段上标记疼痛程度，0 为无痛、10 为最剧烈疼痛。与 NRS 相比更连续、对变化更敏感。',
  instructions: '请拖动滑块，标记最能代表您过去 24 小时内平均疼痛程度的位置（0=无痛，10=能想象的最剧烈疼痛）。',
  source: 'Huskisson EC. Measurement of pain. Lancet. 1974;2(7889):1127-1131.',
  license: '通用临床工具，无特殊授权限制。',
  tags: ['疼痛', '单条目', '0-10评分'],
  usage: {
    population: '各类急慢性疼痛患者（术后、癌痛、骨关节炎等）',
    mode: '自评',
    time: '约 30 秒',
    scoring: '0-10 分或换算为 0-100 mm',
    interpretation: '0 无痛；1-3 轻度；4-6 中度；7-10 重度。常用最小临床重要差值（MCID）为 2 分或 30%',
    notes: '与 NRS 相比更适合精细化疗效评价；老年人或认知障碍患者可改用面部表情量表（Wong-Baker）',
    psychometrics: '重测信度 r 约 0.94，与 NRS 相关性高（r>0.9）',
  },
  items: numbered([q('vas1', '过去 24 小时内的平均疼痛程度', 'slider', null, { min: 0, max: 10 })]),
  dimensions: [dim('total', '疼痛强度', ['vas1'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 10],
    cutoffs: [
      { max: 0, label: '无痛', level: 'normal', advice: '无疼痛。' },
      { max: 3, label: '轻度疼痛', level: 'mild', advice: '可观察或非药物干预。' },
      { max: 6, label: '中度疼痛', level: 'moderate', advice: '建议评估镇痛方案。' },
      { max: 10, label: '重度疼痛', level: 'severe', advice: '建议立即处理并复评。' },
    ],
  },
};

const BRISTOL = {
  code: 'bristol-stool',
  title: 'Bristol 粪便性状量表',
  category: '消化与泌尿',
  description: '根据粪便外观分为 7 类（1 型最硬、7 型完全水样），用于评估排便性状与肠道传输功能，是肠易激综合征（IBS）分型的关键依据（Bristol 1-2 型提示便秘，6-7 型提示腹泻）。',
  instructions: '请选择最符合您最近排便性状的一项。',
  source: 'Heaton KW, Radvan J, Cripps H, et al. Defecation frequency and timing, and stool form in the general population: a prospective study. Gut. 1992;33(6):818-824.',
  license: '公开发表分类工具，可免费使用，建议引用来源文献。',
  tags: ['排便', '肠易激综合征', '单条目', '消化'],
  usage: {
    population: '消化科门诊、IBS/便秘患者、肠道功能研究',
    mode: '自评（可配合 Bristol 图卡）',
    time: '约 30 秒',
    scoring: '1-7 型分别计 1-7 分',
    interpretation: '1-2 型提示便秘；3-4 型为理想性状；5 型为缺乏膳食纤维；6-7 型提示腹泻',
    notes: '建议连续记录 1-2 周取平均；IBS-C 需 ≥25% 排便为 1-2 型，IBS-D 需 ≥25% 为 6-7 型',
    psychometrics: '与结肠传输时间显著相关（1 型传输最慢、7 型最快），广泛用于 IBS 研究与临床分型',
  },
  items: numbered([q('bristol1', '过去一周内最常见的粪便性状', 'radio', [
    { label: '1 型：一颗颗硬球（很难排出）', value: 1 },
    { label: '2 型：香肠状但表面凹凸', value: 2 },
    { label: '3 型：香肠状，表面有裂痕', value: 3 },
    { label: '4 型：像香肠或蛇，光滑柔软', value: 4 },
    { label: '5 型：柔软的块状，边缘清晰', value: 5 },
    { label: '6 型：糊状，边缘不清、蓬松', value: 6 },
    { label: '7 型：水样，完全无固体块', value: 7 },
  ])]),
  dimensions: [dim('total', '粪便性状分型', ['bristol1'])],
  scoring: {
    method: 'sum',
    totalRange: [1, 7],
    cutoffs: [
      { max: 2, label: '便秘倾向', level: 'moderate', advice: '提示便秘，建议增加膳食纤维与饮水、规律运动。' },
      { max: 4, label: '正常', level: 'normal', advice: '排便性状正常。' },
      { max: 5, label: '膳食纤维可能不足', level: 'mild', advice: '建议增加膳食纤维摄入。' },
      { max: 7, label: '腹泻倾向', level: 'severe', advice: '提示腹泻，需评估病因（感染、IBS-D、炎症性肠病等）。' },
    ],
  },
};

const FAC = {
  code: 'fac',
  title: 'FAC 功能性步行分级（Holden）',
  category: '康复与疼痛',
  description: '0-5 级评价患者独立步行能力，是卒中、脊髓损伤与骨科术后康复最常用的功能结局指标之一。',
  instructions: '请由评估者根据患者实际行走能力选择对应等级。',
  source: 'Holden MK, Gill KM, Magliozzi MR, Nathan J, Piehl-Baker L. Clinical gait assessment in the neurologically impaired: reliability and meaningfulness. Phys Ther. 1984;64(1):35-40.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['步行能力', '康复', '卒中', '单条目', '他评'],
  usage: {
    population: '卒中、脑外伤、脊髓损伤、下肢骨折与关节置换术后患者',
    mode: '他评（治疗师现场观察）',
    time: '约 1-2 分钟',
    scoring: '0-5 级',
    interpretation: '0 不能行走；1 需持续扶持；2 需间断扶持；3 需语言指导/监护；4 平地独立但上下楼梯等需帮助；5 完全独立',
    notes: '建议同时记录步行速度（如 10 米步行试验）或 TUG 以提高敏感性；可作为康复疗效与出院评估指标',
    psychometrics: '评定者间信度 Kappa 0.86-0.97，对康复变化敏感',
  },
  items: numbered([q('fac1', '功能性步行分级', 'radio', [
    { label: '0 级：不能行走（无功能）', value: 0 },
    { label: '1 级：需持续扶持（他人持续帮助转移体重）', value: 1 },
    { label: '2 级：需间断扶持', value: 2 },
    { label: '3 级：需语言指导或监护（不需身体接触）', value: 3 },
    { label: '4 级：平地可独立行走，但上下坡、楼梯、不平地面需帮助', value: 4 },
    { label: '5 级：任何地面均可独立行走', value: 5 },
  ])]),
  dimensions: [dim('total', '步行功能分级', ['fac1'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 1, label: '严重步行障碍', level: 'severe', advice: '需补偿性训练与辅助器具评估。' },
      { max: 3, label: '中度步行障碍', level: 'moderate', advice: '建议平衡与步态强化训练，注意跌倒风险。' },
      { max: 4, label: '轻度受限', level: 'mild', advice: '建议社区步行与复杂环境训练。' },
      { max: 5, label: '独立步行', level: 'normal', advice: '步行功能良好。' },
    ],
  },
};

const ASHWORTH = {
  code: 'ashworth',
  title: '改良 Ashworth 痉挛量表（MAS）',
  category: '康复与疼痛',
  description: '临床最常用的肌张力（痉挛）评定工具，0-4 级（含 1+ 级）。评估时以关节被动活动时感受到的阻力为依据，通常按关节分别评定。',
  instructions: '请由治疗师对被评定肌群做快速被动活动，根据阻力大小选择等级（可对同一患者的多个关节分别填写）。',
  source: 'Bohannon RW, Smith MB. Interrater reliability of a modified Ashworth scale of muscle spasticity. Phys Ther. 1987;67(2):206-207.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['肌张力', '痉挛', '康复', '单条目', '他评'],
  usage: {
    population: '脑卒中、脑瘫、脊髓损伤、多发性硬化等上运动神经元损伤患者',
    mode: '他评（治疗师）',
    time: '每个关节约 1 分钟',
    interpretation: '0 无肌张力增高；1 轻微增高；1+ 阻力轻微增高（活动范围一半内出现卡顿）；2 明显增高但被动活动容易；3 明显增高、被动活动困难；4 僵直',
    scoring: '0、1、1+、2、3、4 六级（本平台按 0-5 分编码：0、1、2、3、4、5）',
    notes: '评定者间信度中等，建议由同一治疗师纵向随访；对变化不敏感，可配合 Tardieu 量表或表面肌电',
    psychometrics: '评定者间信度 ICC 约 0.5-0.8，是临床与研究中最普及的痉挛分级',
  },
  items: numbered([q('mas1', '被评定肌群的肌张力等级', 'radio', [
    { label: '0 无肌张力增高', value: 0 },
    { label: '1 肌张力轻微增高（活动末端有轻微阻力）', value: 1 },
    { label: '1+ 肌张力轻微增高（在活动范围前半段出现卡顿，后半段阻力较小）', value: 2 },
    { label: '2 肌张力明显增高（大部分活动范围内阻力增大，但可较容易地被动活动）', value: 3 },
    { label: '3 肌张力显著增高（被动活动困难）', value: 4 },
    { label: '4 僵直（受累部位屈伸均呈僵硬状态）', value: 5 },
  ])]),
  dimensions: [dim('total', '痉挛分级', ['mas1'])],
  scoring: { method: 'sum', totalRange: [0, 5], cutoffs: [] },
};

const MRS = {
  code: 'rankin-mrs',
  title: 'mRS 改良 Rankin 量表（卒中后功能结局）',
  category: '认知与老年',
  description: '评价卒中后总体残疾程度（0-6 级），是卒中临床研究最常用的主要结局指标（mRS 0-2 分常定义为功能独立）。',
  instructions: '请由评估者根据患者实际功能状态选择等级（建议结合家属或照护者信息）。',
  source: 'van Swieten JC, Koudstaal PJ, Visser MC, Schouten HJ, van Gijn J. Interobserver agreement for the assessment of handicap in stroke patients. Stroke. 1988;19(5):604-607.',
  license: '公开发表工具，临床与研究可免费使用，建议引用来源文献并注明使用结构化 mRS 问卷（如 smRSq）。',
  tags: ['卒中', '功能结局', '单条目', '他评'],
  usage: {
    population: '脑卒中患者（急性期后至恢复期），也用于其他神经系统疾病功能结局评价',
    mode: '他评（推荐使用结构化问卷以保证一致性）',
    time: '约 2-5 分钟（结构化问卷）',
    scoring: '0-6 级',
    interpretation: '0 完全无症状；1 无明显功能障碍；2 轻度残疾（可独立处理自身事务，不能完成所有既往活动）；3 中度残疾（需部分帮助，能独立行走）；4 中重度（不能独立行走，需帮助处理身体需求）；5 重度（卧床、失禁，需持续护理）；6 死亡',
    notes: '0-1 分常作为"良好结局"、0-2 分作为"功能独立"；建议采用结构化访谈减少评定者差异',
    psychometrics: '与 NIHSS、Barthel 指数显著相关；评定者间信度在结构化施测下可达 Kappa 0.8 以上',
  },
  items: numbered([q('mrs1', '当前功能状态等级', 'radio', [
    { label: '0 完全无症状', value: 0 },
    { label: '1 无明显功能障碍（能完成所有日常活动）', value: 1 },
    { label: '2 轻度残疾（不能完成所有既往活动，但生活自理）', value: 2 },
    { label: '3 中度残疾（需部分帮助，但能独立行走）', value: 3 },
    { label: '4 中重度残疾（不能独立行走，需帮助处理身体需求）', value: 4 },
    { label: '5 重度残疾（卧床、失禁，需持续护理）', value: 5 },
    { label: '6 死亡', value: 6 },
  ])]),
  dimensions: [dim('total', 'mRS 分级', ['mrs1'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 6],
    cutoffs: [
      { max: 2, label: '功能独立', level: 'normal', advice: 'mRS 0-2 分通常被定义为功能独立。' },
      { max: 5, label: '功能依赖', level: 'severe', advice: 'mRS 3-5 分提示需要不同程度的照护支持，建议康复与照护方案评估。' },
      { max: 6, label: '死亡', level: 'severe', advice: '研究终点事件。' },
    ],
  },
};

const NYHA = {
  code: 'nyha',
  title: 'NYHA 心功能分级',
  category: '呼吸与心血管',
  description: '纽约心脏病学会心功能分级（I-IV 级），依据日常活动受限程度评价心力衰竭严重程度，是临床最通用的心衰分级方法。',
  instructions: '请选择最符合您目前心功能状态的等级。',
  source: 'The Criteria Committee of the New York Heart Association. Nomenclature and Criteria for Diagnosis of Diseases of the Heart and Great Vessels. 9th ed. 1994.',
  license: '公开发表分级标准，临床与科研可免费使用，建议引用 NYHA 标准。',
  tags: ['心力衰竭', '心功能', '单条目', '分级'],
  usage: {
    population: '慢性心力衰竭、冠心病、瓣膜病等心血管疾病患者',
    mode: '医师评定（结合病史与活动耐量）',
    time: '约 1 分钟',
    scoring: 'I-IV 级（本平台按 1-4 分编码）',
    interpretation: 'I 级：体力活动不受限；II 级：一般活动即感轻度受限；III 级：低于一般活动即明显受限；IV 级：任何活动均受限，静息时也有症状',
    notes: '分级具有一定主观性，建议结合 6 分钟步行距离、NT-proBNP、心超 EF 值综合判断；心衰治疗期间分级可动态变化',
    psychometrics: '与运动耐量（峰值耗氧量）、预后显著相关，是心衰指南分组的核心指标之一',
  },
  items: numbered([q('nyha1', '心功能分级', 'radio', [
    { label: 'I 级：体力活动不受限，日常活动不引起症状', value: 1 },
    { label: 'II 级：体力活动轻度受限，休息时无症状，日常活动即出现乏力、心悸或呼吸困难', value: 2 },
    { label: 'III 级：体力活动明显受限，低于日常活动即引起症状，休息后可缓解', value: 3 },
    { label: 'IV 级：不能从事任何体力活动，休息时也有症状，活动后加重', value: 4 },
  ])]),
  dimensions: [dim('total', 'NYHA 分级', ['nyha1'])],
  scoring: { method: 'sum', totalRange: [1, 4], cutoffs: [] },
};

const CCS = {
  code: 'ccs-angina',
  title: 'CCS 心绞痛分级（加拿大心血管学会）',
  category: '呼吸与心血管',
  description: '加拿大心血管学会心绞痛分级（I-IV 级），依据诱发心绞痛的体力活动强度评价心绞痛严重程度。',
  instructions: '请选择最能描述您心绞痛发作情况的等级。',
  source: 'Campeau L. Letter: Grading of angina pectoris. Circulation. 1976;54(3):522-523.',
  license: '公开发表分级标准，可免费使用，建议引用来源文献。',
  tags: ['心绞痛', '冠心病', '单条目', '分级'],
  usage: {
    population: '稳定型心绞痛、冠心病患者',
    mode: '医师评定（结合病史）',
    time: '约 1 分钟',
    scoring: 'I-IV 级（本平台按 1-4 分编码）',
    interpretation: 'I 级：剧烈活动才发作；II 级：日常活动轻度受限（如快步走、爬楼、饭后行走）；III 级：日常活动明显受限（平地步行 1-2 街区即发作）；IV 级：任何活动甚至休息时即可发作',
    notes: '与生活质量（如 SAQ 西雅图心绞痛问卷）联合使用更全面；分级变化可用于疗效评价',
    psychometrics: '与运动试验缺血阈值、预后相关，广泛用于冠心病研究',
  },
  items: numbered([q('ccs1', '心绞痛分级', 'radio', [
    { label: 'I 级：剧烈或长时间体力活动才引起心绞痛，日常活动不受限', value: 1 },
    { label: 'II 级：日常活动轻度受限，如快步行走、爬楼梯、餐后行走、寒冷或风中行走时发作', value: 2 },
    { label: 'III 级：日常活动明显受限，如平地步行 1-2 个街区（100-200 米）或爬一层楼即发作', value: 3 },
    { label: 'IV 级：不能进行任何体力活动，休息时也可能发作心绞痛', value: 4 },
  ])]),
  dimensions: [dim('total', 'CCS 分级', ['ccs1'])],
  scoring: { method: 'sum', totalRange: [1, 4], cutoffs: [] },
};

const EHRA = {
  code: 'ehra-af',
  title: 'EHRA 房颤相关症状分级',
  category: '呼吸与心血管',
  description: '欧洲心律学会（EHRA）房颤症状分级（1-4 级），评价房颤症状对日常活动的影响，用于房颤患者症状负担与治疗决策评估。',
  instructions: '请选择最能描述您房颤发作时症状影响的等级。',
  source: 'Wynn GJ, Todd DM, Webber M, et al. The European Heart Rhythm Association symptom classification for atrial fibrillation: validation and improvement through a simple modification. Europace. 2014;16(7):965-972.',
  license: '公开发表分级标准，可免费使用，建议引用来源文献。',
  tags: ['房颤', '心律不齐', '单条目', '分级'],
  usage: {
    population: '心房颤动（阵发性/持续性）患者',
    mode: '医师评定（结合患者症状描述）',
    time: '约 1 分钟',
    scoring: '1-4 级（本平台按 1-4 分编码）',
    interpretation: '1 级：无任何症状；2a 级：症状轻微，日常活动不受影响；2b 级：症状中度，日常活动不受影响但患者受症状困扰；3 级：症状严重，日常活动受影响；4 级：致残性症状，日常活动无法进行',
    notes: '用于评估是否需要节律控制治疗（如导管消融）；与生活质量量表（AFEQT）联合使用更全面',
    psychometrics: '改良 EHRA 分级与房颤症状负担、生活质量显著相关，被欧洲心脏病学会指南采用',
  },
  items: numbered([q('ehra1', '房颤症状分级', 'radio', [
    { label: '1 级：无任何症状', value: 1 },
    { label: '2a 级：症状轻微，不影响日常活动', value: 2 },
    { label: '2b 级：症状中度，不影响日常活动，但患者受到症状困扰', value: 3 },
    { label: '3 级：症状严重，日常活动受到影响', value: 4 },
    { label: '4 级：致残性症状，日常活动无法进行', value: 5 },
  ])]),
  dimensions: [dim('total', 'EHRA 分级', ['ehra1'])],
  scoring: { method: 'sum', totalRange: [1, 5], cutoffs: [] },
};

const BORG_SCALE = {
  code: 'borg-rpe',
  title: 'Borg 自觉疲劳量表（RPE 6-20）',
  category: '康复与疼痛',
  description: '以 6-20 分评价运动时自觉疲劳程度，与心率、耗氧量高度相关，广泛用于运动试验、心肺康复与运动处方强度设定。',
  instructions: '请选择最能代表您目前（运动后即刻）疲劳程度的分数。',
  source: 'Borg GA. Psychophysical bases of perceived exertion. Med Sci Sports Exerc. 1982;14(5):377-381.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['运动', '疲劳', '心肺康复', '单条目'],
  usage: {
    population: '心肺运动试验、心脏康复、慢病运动处方人群',
    mode: '自评（运动过程中或结束后即刻）',
    time: '约 30 秒',
    scoring: '6-20 分',
    interpretation: '12-13 分为"稍累"（约 60% 最大心率，常用于中强度运动处方）；15-16 分为"累"（约 75%-80%）；≥17 分为高强度',
    notes: '可结合心率储备法（Karvonen 公式）设定运动强度；服用 β 受体阻滞剂者心率反应迟钝，宜以 RPE 为主',
    psychometrics: '与心率、%VO₂max 的相关系数约为 0.8-0.9，是国际公认的主观运动强度指标',
  },
  items: numbered([q('borg1', '当前自觉疲劳程度', 'radio', BORG)]),
  dimensions: [dim('total', 'RPE 评分', ['borg1'])],
  scoring: { method: 'sum', totalRange: [6, 20], cutoffs: [] },
};

/* ---------------- 老年认知与营养筛查 ---------------- */
const MINICOG = {
  code: 'mini-cog',
  title: 'Mini-Cog 简易认知筛查',
  category: '认知与老年',
  description: '3 分钟认知筛查工具：3 个词语回忆（0-3 分）+ 画钟测验（0 或 2 分），总分 0-5 分。≤2 分提示认知损害，适合门诊与社区快速筛查。',
  instructions: '（由医护人员施测）① 说出 3 个词（如"苹果、手表、桌子"）请受试者复述并记住；② 请受试者在空白纸上画出时钟的圆形表盘、标出 12 个数字并把指针指向 11:10（画钟评分：对=2 分，错=0 分）；③ 请受试者回忆刚才的 3 个词。',
  source: 'Borson S, Scanlan J, Brush M, Vitaliano P, Dokmak A. The Mini-Cog: a cognitive "vital signs" measure for dementia screening in multi-lingual elderly. Int J Geriatr Psychiatry. 2000;15(11):1021-1027.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['认知筛查', '痴呆', '老年', '2项', '他评', '3分钟'],
  usage: {
    population: '老年人、门诊与社区人群认知损害初筛；低教育程度与不同语言人群均适用',
    mode: '他评（需受试者现场作答，画钟需笔纸）',
    time: '约 3 分钟',
    scoring: '词语回忆 0-3 分 + 画钟 0/2 分 = 0-5 分',
    interpretation: '0-2 分提示可能存在认知损害，建议进一步使用 MoCA/MMSE 与临床评估；3-5 分提示认知筛查正常',
    notes: '画钟评分需按标准（表盘圆整、数字正确、指针位置正确）判定；受教育程度影响较小是其优势；不能替代完整认知评估',
    psychometrics: '敏感度约 76%-99%、特异度约 89%-93%（各研究略有差异），对受教育程度与语言的偏倚小于 MMSE',
  },
  items: numbered([
    q('minicog1', '词语回忆：请受试者回忆刚才记住的 3 个词，正确回忆出的个数', 'radio', [
      { label: '0 个', value: 0 }, { label: '1 个', value: 1 }, { label: '2 个', value: 2 }, { label: '3 个', value: 3 },
    ]),
    q('minicog2', '画钟测验：表盘与数字、指针（11:10）是否正确', 'radio', [
      { label: '正确（2 分）', value: 2 }, { label: '不正确（0 分）', value: 0 },
    ]),
  ]),
  dimensions: [
    dim('recall', '词语回忆', ['minicog1']),
    dim('clock', '画钟测验', ['minicog2']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 2, label: '提示认知损害', level: 'severe', advice: '≤2 分提示可能存在认知损害，建议进一步 MoCA/MMSE 与临床评估。' },
      { max: 5, label: '认知筛查正常', level: 'normal', advice: '未提示明显认知损害，建议定期复评。' },
    ],
  },
};

const AD8 = {
  code: 'ad8',
  title: 'AD8 痴呆筛查访谈量表',
  category: '认知与老年',
  description: '8 个问题评估认知功能变化（由知情者或受试者回答），≥2 项"有变化"提示可能存在认知损害。量表简短、对早期痴呆敏感，适合社区与门诊初筛。',
  instructions: '请回答与以往相比，受试者是否在以下方面出现改变（是=有变化，否=无变化/不知道）。',
  source: 'Galvin JE, Roe CM, Powlishta KK, et al. The AD8: a brief informant interview to detect dementia. Neurology. 2005;65(4):559-564.',
  license: '公开发表工具，非商业用途免费，建议引用来源文献。',
  tags: ['痴呆', '认知筛查', '知情者问卷', '8题', '老年'],
  usage: {
    population: '老年人认知损害初筛；由家属/照护者（知情者）回答效果最佳，也可自评',
    mode: '知情者访谈或自评',
    time: '约 2-3 分钟',
    scoring: '每项"有变化"计 1 分，总分 0-8 分',
    interpretation: '≥2 分提示可能存在认知损害（敏感度约 84%、特异度约 80%），建议进一步认知评估与专科就诊',
    notes: '依赖知情者对受试者既往状态的了解；精神疾病、抑郁可致假阳性；建议与客观认知测验联合使用',
    psychometrics: 'ROC 曲线下面积 0.90，与 CDR、MMSE 显著相关；中文版在社区老年人中验证良好',
  },
  items: numbered([
    q('ad8_1', '判断力方面的问题（如做出错误决定、陷入财务骗局、错误的财务判断）', 'radio', YN),
    q('ad8_2', '对兴趣、活动和爱好的兴趣减少', 'radio', YN),
    q('ad8_3', '重复同一件事（如反复问同样的问题、重复讲同一件事、重复做同一件事）', 'radio', YN),
    q('ad8_4', '学习使用工具、设备（如电视遥控器、手机、微波炉）有困难', 'radio', YN),
    q('ad8_5', '忘记当前的月份或年份', 'radio', YN),
    q('ad8_6', '处理较复杂的财务问题（如收支平衡、缴税、管理银行账户）有困难', 'radio', YN),
    q('ad8_7', '记不住与他人的约定', 'radio', YN),
    q('ad8_8', '思考或记忆方面持续存在问题', 'radio', YN),
  ]),
  dimensions: [dim('total', 'AD8 总分', K.ids('ad8_', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 8],
    cutoffs: [
      { max: 1, label: '筛查阴性', level: 'normal', advice: '未提示明显认知损害，建议每年复评。' },
      { max: 8, label: '提示认知损害', level: 'severe', advice: '≥2 项提示可能存在认知损害，建议神经/老年专科进行完整认知评估（如 MoCA、CDR）。' },
    ],
  },
};

const SARCF = {
  code: 'sarc-f',
  title: 'SARC-F 肌少症筛查量表',
  category: '营养评估',
  description: '5 个条目快速筛查肌少症（肌肉减少症）风险，每项 0-2 分，总分 0-10 分。≥4 分提示肌少症风险，需进一步评估（肌力、肌量、躯体功能）。',
  instructions: '请根据您目前的实际情况，为以下 5 项选择最能描述的选项。',
  source: 'Malmstrom TK, Morley JE. SARC-F: a simple questionnaire to rapidly diagnose sarcopenia. J Am Med Dir Assoc. 2013;14(8):531-532.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['肌少症', '肌肉减少', '老年', '筛查', '5题'],
  usage: {
    population: '社区与住院老年人、慢病（糖尿病、CKD、肿瘤）患者肌少症风险筛查',
    mode: '自评或访谈式施测',
    time: '约 1-2 分钟',
    scoring: '5 项各 0-2 分，总分 0-10 分',
    interpretation: '≥4 分提示肌少症风险，应按 AWGS/EWGSOP2 标准进一步测量握力、步速、肌肉量（DXA/BIA）以确诊',
    notes: 'SARC-F 特异度高但敏感度较低（尤其早期肌少症），可配合小腿围（男<34cm、女<33cm）提高敏感度（SARC-CalF）',
    psychometrics: '与握力、步速、肌量显著相关；被 AWGS 2019 与 EWGSOP2 指南推荐为初筛工具',
  },
  items: numbered([
    q('sarcf1', '搬举或搬动 4.5 公斤（约 10 斤）重物是否困难？', 'radio', [
      { label: '0 不困难', value: 0 }, { label: '1 有些困难', value: 1 }, { label: '2 非常困难或不能完成', value: 2 },
    ]),
    q('sarcf2', '在房间内行走是否有困难？', 'radio', [
      { label: '0 不困难', value: 0 }, { label: '1 有些困难', value: 1 }, { label: '2 非常困难或需帮助', value: 2 },
    ]),
    q('sarcf3', '从椅子或床上起身是否有困难？', 'radio', [
      { label: '0 不困难', value: 0 }, { label: '1 有些困难', value: 1 }, { label: '2 非常困难或不能完成', value: 2 },
    ]),
    q('sarcf4', '上下 10 级台阶是否有困难？', 'radio', [
      { label: '0 不困难', value: 0 }, { label: '1 有些困难', value: 1 }, { label: '2 非常困难或不能完成', value: 2 },
    ]),
    q('sarcf5', '过去一年内跌倒过几次？', 'radio', [
      { label: '0 没有跌倒', value: 0 }, { label: '1 1-3 次', value: 1 }, { label: '2 4 次或以上', value: 2 },
    ]),
  ]),
  dimensions: [dim('total', 'SARC-F 总分', K.ids('sarcf', 5))],
  scoring: {
    method: 'sum',
    totalRange: [0, 10],
    cutoffs: [
      { max: 3, label: '肌少症风险低', level: 'normal', advice: '建议保持规律运动与充足蛋白质摄入。' },
      { max: 10, label: '肌少症风险高', level: 'moderate', advice: '≥4 分提示肌少症风险，建议进一步测量握力、步速与肌肉量；同时评估跌倒与营养风险。' },
    ],
  },
};

const FRAIL = {
  code: 'frail-scale',
  title: 'FRAIL 衰弱筛查量表',
  category: '认知与老年',
  description: '5 个条目筛查老年衰弱（Frailty）：疲乏、耐力下降、自由活动下降、多病共存、体重下降，每项 1 分，总分 0-5 分。≥3 分为衰弱，1-2 分为衰弱前期。',
  instructions: '请根据您最近的情况回答以下 5 个问题。',
  source: 'Morley JE, Malmstrom TK, Miller DK. A simple frailty questionnaire (FRAIL) predicts outcomes in middle aged African Americans. J Nutr Health Aging. 2012;16(7):601-608.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['衰弱', '老年综合评估', '5题', '筛查'],
  usage: {
    population: '老年人（尤其≥65 岁）、慢病与术前评估人群',
    mode: '自评或访谈式施测',
    time: '约 1-2 分钟',
    scoring: '5 项各 1 分（符合计 1 分），总分 0-5 分',
    interpretation: '0 分健壮；1-2 分衰弱前期；≥3 分衰弱（提示跌倒、失能、死亡风险升高）',
    notes: '第 3 项"自由活动下降"指独立完成购物、步行等工具性日常活动的能力下降；建议与握力、步速联合评估',
    psychometrics: '对 5 年死亡与住院风险有独立预测价值；中文版在社区老年人中验证良好',
  },
  items: numbered([
    q('frail1', '您是否感到疲乏（过去 4 周大部分时间感到疲倦）？', 'radio', YN),
    q('frail2', '您是否难以独自上一层楼梯？', 'radio', YN),
    q('frail3', '您是否难以独自步行一个街区（约 100-200 米）？', 'radio', YN),
    q('frail4', '医生是否告诉过您有 5 种以上疾病？', 'radio', YN),
    q('frail5', '过去一年内，您是否体重下降超过 5%？', 'radio', YN),
  ]),
  dimensions: [dim('total', 'FRAIL 总分', K.ids('frail', 5))],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 0, label: '健壮', level: 'normal', advice: '无衰弱表现，建议保持运动与营养。' },
      { max: 2, label: '衰弱前期', level: 'mild', advice: '建议开展抗阻运动、营养支持并定期复评。' },
      { max: 5, label: '衰弱', level: 'severe', advice: '≥3 分提示衰弱，建议老年综合评估（CGA）与多学科干预，关注跌倒、失能与用药。' },
    ],
  },
};

const MUST = {
  code: 'must',
  title: 'MUST 营养不良通用筛查工具',
  category: '营养评估',
  description: '英国 BAPEN 推荐的营养不良筛查工具，由 BMI、体重下降与急性疾病影响三部分组成，总分 0-6 分：0 分低风险、1 分中风险、≥2 分高风险。',
  instructions: '请由医护人员根据患者当前情况完成三项评估并相加。',
  source: 'Elia M. The MUST report: nutritional screening of adults: a multidisciplinary responsibility. BAPEN, 2003. 验证研究见：Stratton RJ, et al. Br J Nutr. 2004;92(5):799-808.',
  license: 'BAPEN 公开发布，非商业用途免费使用，建议注明来源。',
  tags: ['营养筛查', 'MUST', '3项', '住院与社区'],
  usage: {
    population: '成人住院患者、社区与护理机构人群（不适用于<18 岁与孕妇）',
    mode: '医护人员评估（身高体重、体重变化史、疾病状态）',
    time: '约 3 分钟',
    scoring: 'BMI 评分（0-2）+ 体重下降评分（0-2）+ 急性疾病评分（0-2）= 0-6 分',
    interpretation: '0 分低风险（常规复评）；1 分中风险（观察、记录 3 日摄入量、复评）；≥2 分高风险（转营养科、制定营养支持计划）',
    notes: 'BMI 因水肿/腹水不可靠时可参考小腿围；与 NRS-2002、MNA-SF 相比更简单，适合护理人员初筛',
    psychometrics: '与营养师全面评估的一致性良好，可预测住院时间与并发症风险',
  },
  items: numbered([
    q('must1', 'BMI 评分（体重 kg ÷ 身高 m²）', 'radio', [
      { label: '0 分：BMI > 20', value: 0 },
      { label: '1 分：BMI 18.5-20', value: 1 },
      { label: '2 分：BMI < 18.5', value: 2 },
    ]),
    q('must2', '近 3-6 个月非自主体重下降', 'radio', [
      { label: '0 分：体重下降 < 5%', value: 0 },
      { label: '1 分：体重下降 5%-10%', value: 1 },
      { label: '2 分：体重下降 > 10%', value: 2 },
    ]),
    q('must3', '急性疾病影响：患者是否因急性疾病而预计 5 天以上不能进食（或摄入严重不足）', 'radio', [
      { label: '0 分：否', value: 0 },
      { label: '2 分：是', value: 2 },
    ]),
  ]),
  dimensions: [dim('total', 'MUST 总分', K.ids('must', 3))],
  scoring: {
    method: 'sum',
    totalRange: [0, 6],
    cutoffs: [
      { max: 0, label: '低风险', level: 'normal', advice: '常规营养复评（住院每周、社区每年）。' },
      { max: 1, label: '中风险', level: 'moderate', advice: '记录 3 日进食量，观察并复评；提供膳食指导。' },
      { max: 6, label: '高风险', level: 'severe', advice: '≥2 分提示营养不良高风险，建议营养科会诊并制定营养支持计划。' },
    ],
  },
};

const FES_I = {
  code: 'fes-i-7',
  title: 'FES-I 简版跌倒效能量表（7项）',
  category: '护理评估',
  description: '评估老年人对跌倒的担忧程度（跌倒效能），7 个日常活动场景，每项 1-4 分，总分 7-28 分。分数越高表示越担心跌倒，是高跌倒风险与活动回避的重要指标。',
  instructions: '以下活动如果您现在去做，您有多担心会跌倒？请选择 1=完全不担心 到 4=非常担心。',
  source: 'Kempen GI, Yardley L, van Haastregt JC, et al. The Short FES-I: a shortened version of the falls efficacy scale-international to assess fear of falling. Age Ageing. 2008;37(1):45-50.',
  license: '公开发表量表，非商业用途免费，建议引用来源文献。',
  tags: ['跌倒', '恐惧跌倒', '老年', '7题', '护理'],
  usage: {
    population: '社区与住院老年人，尤其有跌倒史或步态不稳者',
    mode: '自评或访谈式施测',
    time: '约 2 分钟',
    scoring: '7 项各 1-4 分，总分 7-28 分',
    interpretation: '7-8 分无担忧；9-13 分中度担忧；≥14 分高度担忧（提示活动回避与跌倒风险增加）',
    notes: '与跌倒风险、平衡能力、日常生活活动受限相关；建议与 Morse 跌倒评分、TUG 联合使用',
    psychometrics: '简版与完整版（16 项）相关性 r>0.9，内部一致性 α 0.92，已在多国验证',
  },
  items: numbered([
    q('fes1', '穿脱衣服', 'radio', severityFES()),
    q('fes2', '洗澡或淋浴', 'radio', severityFES()),
    q('fes3', '从椅子上站起或坐下', 'radio', severityFES()),
    q('fes4', '上下楼梯', 'radio', severityFES()),
    q('fes5', '伸手取高于头顶的物品', 'radio', severityFES()),
    q('fes6', '在湿滑的地面上行走', 'radio', severityFES()),
    q('fes7', '外出参加社交活动', 'radio', severityFES()),
  ]),
  dimensions: [dim('total', 'FES-I 总分', K.ids('fes', 7))],
  scoring: {
    method: 'sum',
    totalRange: [7, 28],
    cutoffs: [
      { max: 8, label: '无跌倒担忧', level: 'normal', advice: '未见明显跌倒担忧。' },
      { max: 13, label: '中度担忧', level: 'mild', advice: '建议平衡训练与跌倒预防宣教。' },
      { max: 28, label: '高度担忧', level: 'severe', advice: '≥14 分提示高度跌倒担忧，建议综合跌倒干预（运动、环境改造、认知行为干预）并评估跌倒风险。' },
    ],
  },
};

function severityFES() {
  return [
    { label: '1 完全不担心', value: 1 }, { label: '2 有点担心', value: 2 },
    { label: '3 比较担心', value: 3 }, { label: '4 非常担心', value: 4 },
  ];
}

/* ---------------- 泌尿与男性健康 ---------------- */
const IIEF5 = {
  code: 'iief-5',
  title: 'IIEF-5 国际勃起功能指数（简版）',
  category: '消化与泌尿',
  description: '国际勃起功能指数 5 条目简版（SHIM），用于勃起功能障碍（ED）的筛查与分级。总分 5-25 分：22-25 无 ED、17-21 轻度、12-16 轻中度、8-11 中度、5-7 重度。',
  instructions: '请根据您过去 6 个月的性活动情况回答以下问题（如近期无性活动，请按设想的感受作答）。',
  source: 'Rosen RC, Cappelleri JC, Smith MD, Lipsky J, Peña BM. Development and evaluation of an abridged, 5-item version of the International Index of Erectile Function (IIEF-5) as a diagnostic tool for erectile dysfunction. Int J Impot Res. 1999;11(6):319-326.',
  license: '公开发表量表，临床与研究可免费使用，建议引用来源文献。',
  tags: ['勃起功能障碍', '男科', '5题', '筛查'],
  usage: {
    population: '成年男性，尤其糖尿病、心血管疾病、前列腺手术后或有性功能主诉者',
    mode: '自评（建议独立、安静环境填写）',
    time: '约 2 分钟',
    scoring: '5 题各 1-5 分，求和（5-25 分，分值越高功能越好）',
    interpretation: '22-25 无 ED；17-21 轻度；12-16 轻中度；8-11 中度；5-7 重度 ED',
    notes: '涉及隐私，注意保护受试者隐私；ED 常为心血管疾病早期信号，建议同时评估血压、血糖、血脂；需排除药物、心理与内分泌因素',
    psychometrics: '与完整版 IIEF 相关性 r>0.95，敏感度 0.98、特异度 0.88（界值 21 分），是国际通用 ED 筛查工具',
  },
  items: numbered([
    q('iief1', '您对获得勃起并维持勃起的信心如何？', 'radio', [
      { label: '1 很低', value: 1 }, { label: '2 低', value: 2 }, { label: '3 中等', value: 3 }, { label: '4 高', value: 4 }, { label: '5 很高', value: 5 },
    ]),
    q('iief2', '受性刺激后，有多少次能勃起并有足够硬度插入阴道？', 'radio', [
      { label: '1 几乎没有', value: 1 }, { label: '2 少数几次', value: 2 }, { label: '3 约一半', value: 3 },
      { label: '4 多数时候', value: 4 }, { label: '5 几乎总是', value: 5 },
    ]),
    q('iief3', '性交过程中，有多少次能维持勃起？', 'radio', [
      { label: '1 几乎没有', value: 1 }, { label: '2 少数几次', value: 2 }, { label: '3 约一半', value: 3 },
      { label: '4 多数时候', value: 4 }, { label: '5 几乎总是', value: 5 },
    ]),
    q('iief4', '性交时维持勃起直到完成（射精）有多困难？', 'radio', [
      { label: '1 极度困难', value: 1 }, { label: '2 很困难', value: 2 }, { label: '3 困难', value: 3 },
      { label: '4 有点困难', value: 4 }, { label: '5 不困难', value: 5 },
    ]),
    q('iief5', '当您尝试性交时，有多少次感到满意？', 'radio', [
      { label: '1 几乎没有', value: 1 }, { label: '2 少数几次', value: 2 }, { label: '3 约一半', value: 3 },
      { label: '4 多数时候', value: 4 }, { label: '5 几乎总是', value: 5 },
    ]),
  ]),
  dimensions: [dim('total', 'IIEF-5 总分', K.ids('iief', 5))],
  scoring: {
    method: 'sum',
    totalRange: [5, 25],
    cutoffs: [
      { max: 7, label: '重度 ED', level: 'severe', advice: '建议泌尿男科系统评估（血管、内分泌、心理因素）并制定治疗方案。' },
      { max: 11, label: '中度 ED', level: 'severe', advice: '建议专科评估与治疗。' },
      { max: 16, label: '轻中度 ED', level: 'moderate', advice: '建议评估心血管危险因素与生活方式。' },
      { max: 21, label: '轻度 ED', level: 'mild', advice: '建议生活方式干预、心理疏导并随访。' },
      { max: 25, label: '无 ED', level: 'normal', advice: '勃起功能正常。' },
    ],
  },
};

const OABSS = {
  code: 'oabss',
  title: 'OABSS 膀胱过度活动症症状评分',
  category: '消化与泌尿',
  description: '评价膀胱过度活动症（OAB）症状严重程度的 4 条目工具，总分 0-15 分：0-5 轻度、6-11 中度、≥12 重度。诊断 OAB 需尿急条目 ≥2 分且总分 ≥3 分。',
  instructions: '请根据您最近一周的排尿情况回答以下问题。',
  source: 'Homma Y, Yoshida M, Seki N, et al. Symptom assessment tool for overactive bladder syndrome—overactive bladder symptom score. Urology. 2006;68(2):318-323.',
  license: '公开发表工具，临床与研究可免费使用，建议引用来源文献。',
  tags: ['膀胱过度活动症', '尿急', '泌尿', '4题'],
  usage: {
    population: '成人尿频、尿急、夜尿或急迫性尿失禁患者（男女性均适用）',
    mode: '自评（可结合排尿日记）',
    time: '约 2 分钟',
    scoring: '4 个条目按频率计分：白天排尿次数 0-2 分、夜间排尿次数 0-3 分、尿急 0-5 分、急迫性尿失禁 0-5 分；总分 0-15 分',
    interpretation: 'OAB 判定：尿急条目 ≥2 分且总分 ≥3 分。严重程度：≤5 轻度、6-11 中度、≥12 重度',
    notes: '需排除尿路感染、结石、前列腺增生梗阻等因素；建议配合排尿日记（每次尿量与时间）与尿流率检查',
    psychometrics: '内部一致性 α 0.86，与排尿日记参数及患者主观改善显著相关；已有多国语言版本',
  },
  items: numbered([
    q('oabss1', '白天排尿次数（从起床到入睡）', 'radio', [
      { label: '0 分：≤7 次', value: 0 }, { label: '1 分：8-14 次', value: 1 }, { label: '2 分：≥15 次', value: 2 },
    ]),
    q('oabss2', '夜间排尿次数（从入睡到起床）', 'radio', [
      { label: '0 分：0 次', value: 0 }, { label: '1 分：1 次', value: 1 },
      { label: '2 分：2 次', value: 2 }, { label: '3 分：≥3 次', value: 3 },
    ]),
    q('oabss3', '尿急（突然出现的强烈尿意，难以推迟）', 'radio', [
      { label: '0 分：无', value: 0 }, { label: '1 分：每周少于 1 次', value: 1 }, { label: '2 分：每周 1 次或以上', value: 2 },
      { label: '3 分：每天 1 次', value: 3 }, { label: '4 分：每天 2-4 次', value: 4 }, { label: '5 分：每天 5 次或以上', value: 5 },
    ]),
    q('oabss4', '急迫性尿失禁（伴随尿急出现的漏尿）', 'radio', [
      { label: '0 分：无', value: 0 }, { label: '1 分：每周少于 1 次', value: 1 }, { label: '2 分：每周 1 次或以上', value: 2 },
      { label: '3 分：每天 1 次', value: 3 }, { label: '4 分：每天 2-4 次', value: 4 }, { label: '5 分：每天 5 次或以上', value: 5 },
    ]),
  ]),
  dimensions: [dim('total', 'OABSS 总分', K.ids('oabss', 4))],
  scoring: {
    method: 'sum',
    totalRange: [0, 15],
    cutoffs: [
      { max: 2, label: '未达 OAB 标准', level: 'normal', advice: '总分 <3 或尿急条目 <2 分，未达 OAB 判定标准。' },
      { max: 5, label: '轻度 OAB', level: 'mild', advice: '建议行为治疗（膀胱训练、液体管理、盆底肌训练）。' },
      { max: 11, label: '中度 OAB', level: 'moderate', advice: '建议行为治疗联合药物治疗，4-12 周后复评。' },
      { max: 15, label: '重度 OAB', level: 'severe', advice: '建议泌尿专科评估，必要时考虑三线治疗（肉毒毒素、神经调节等）。' },
    ],
  },
};

/* ---------------- 心肺功能与围手术期 ---------------- */
const DASI = {
  code: 'dasi',
  title: 'DASI 杜克活动状态指数',
  category: '呼吸与心血管',
  description: '12 个日常活动条目（能/不能），按各活动的代谢当量加权计分，总分 0-58.25 分，可换算峰值耗氧量（VO₂peak = 0.43×DASI + 9.6），是心血管研究中最常用的自评功能容量指标。',
  instructions: '请判断您目前能否完成以下活动（能/不能），无需实际尝试，按您平时的能力判断即可。',
  source: 'Hlatky MA, Boineau RE, Higginbotham MB, et al. A brief self-administered questionnaire to determine functional capacity (the Duke Activity Status Index). Am J Cardiol. 1989;64(10):651-654.',
  license: '公开发表量表，临床与研究可免费使用，建议引用来源文献。',
  tags: ['功能容量', '心血管', '运动耐量', '12题', '术前评估'],
  usage: {
    population: '心血管疾病患者、术前功能评估、心脏康复与慢病人群',
    mode: '自评',
    time: '约 2-3 分钟',
    scoring: '各条目按代谢当量权重计分（能完成计对应分值，不能计 0 分），总分 0-58.25 分',
    interpretation: '分数越高功能容量越好；<16.5 分提示运动耐量明显下降（约 <4 METs），围手术期心血管风险增高；可用 VO₂peak（ml/kg/min）= 0.43 × DASI + 9.6 估算',
    notes: '为自评工具，与实际运动试验结果存在一定偏差；术前评估建议结合 6 分钟步行试验或心肺运动试验',
    psychometrics: '与运动试验测得的 VO₂max 相关系数 r≈0.80，被广泛用于心血管研究中的功能状态分层',
  },
  items: numbered([
    dasiItem('dasi1', '自己吃饭、穿衣、洗澡、上厕所', 2.75),
    dasiItem('dasi2', '在室内或院子里行走', 1.75),
    dasiItem('dasi3', '步行几个街区（约 200-400 米）', 2.75),
    dasiItem('dasi4', '爬一段楼梯或爬小山坡', 5.5),
    dasiItem('dasi5', '跑一小段距离', 8.0),
    dasiItem('dasi6', '做轻体力家务（扫地、洗碗）', 2.7),
    dasiItem('dasi7', '做中等体力家务（吸尘、铺床、提杂物）', 3.5),
    dasiItem('dasi8', '做重体力家务（擦地板、搬家具）', 8.0),
    dasiItem('dasi9', '做庭院劳动（耙地、除草）', 4.5),
    dasiItem('dasi10', '进行性生活', 5.8),
    dasiItem('dasi11', '参加中等强度娱乐活动（高尔夫、保龄球、舞蹈、双打网球）', 6.0),
    dasiItem('dasi12', '参加剧烈运动（游泳、单打网球、足球、滑雪、跑步）', 7.5),
  ]),
  dimensions: [dim('total', 'DASI 总分', K.ids('dasi', 12))],
  scoring: {
    method: 'sum',
    totalRange: [0, 58.25],
    cutoffs: [
      { max: 16.4, label: '运动耐量明显下降', level: 'severe', advice: '提示功能容量 < 约 4 METs，围手术期风险较高，建议心肺功能进一步评估（6MWT 或 CPET）。' },
      { max: 35, label: '运动耐量中等', level: 'moderate', advice: '建议规律有氧运动与心脏康复指导。' },
      { max: 58.25, label: '运动耐量良好', level: 'normal', advice: '功能容量良好。' },
    ],
  },
};

function dasiItem(id, text, weight) {
  return {
    id: id, text: text, type: 'radio', required: true,
    options: [{ label: '能完成', value: weight }, { label: '不能完成', value: 0 }],
  };
}

const SMWT = {
  code: 'smwt',
  title: '6 分钟步行试验记录表（6MWT）',
  category: '呼吸与心血管',
  description: '记录 6 分钟步行试验的距离、是否完成、中止原因与试验后 Borg 疲劳/呼吸困难评分，用于心肺功能与康复疗效评价。',
  instructions: '请在标准 30 米走廊进行试验（按 ATS 指南），记录步行距离、中止情况与试验后评分。',
  source: 'ATS Committee on Proficiency Standards for Clinical Pulmonary Function Laboratories. ATS statement: guidelines for the six-minute walk test. Am J Respir Crit Care Med. 2002;166(1):111-117.',
  license: 'ATS 公开指南，记录表可自由使用，建议引用指南来源。',
  tags: ['6分钟步行试验', '心肺功能', '康复', '他评', '记录表'],
  usage: {
    population: '慢阻肺、心衰、肺动脉高压、肺移植与心脏康复患者',
    mode: '他评（测试者记录，患者尽力行走）',
    time: '约 10 分钟（含准备与恢复）',
    scoring: '记录 6 分钟内行走的最大距离（米）；记录试验后 Borg 评分与心率',
    interpretation: '健康成人常＞550 米；心衰患者＜300 米提示预后较差；COPD 患者最小临床重要差值约 30 米；可用参考方程按年龄、性别、身高、体重计算预计值',
    notes: '试验前避免剧烈活动，按常规用药；出现胸痛、严重呼吸困难、头晕、冷汗等应立即中止并记录原因；同一患者随访需在同一时间、同一走廊进行',
    psychometrics: '重测信度 ICC 0.9 以上，与 peak VO₂ 中度相关，被 ATS/ERS 推荐为心肺疾病功能评价标准试验',
  },
  items: numbered([
    q('smwt1', '6 分钟步行距离', 'number', null, { min: 0, max: 1000, unit: '米' }),
    q('smwt2', '是否完整完成 6 分钟', 'radio', [
      { label: '完整完成', value: 1 }, { label: '提前中止', value: 0 },
    ]),
    q('smwt3', '如提前中止，中止原因（可多选）', 'checkbox', [
      { label: '呼吸困难', value: 1 }, { label: '胸痛', value: 2 }, { label: '头晕', value: 3 },
      { label: '下肢痉挛或疼痛', value: 4 }, { label: '出汗、面色苍白', value: 5 }, { label: '患者要求停止', value: 6 },
    ], { required: false, exclude: true }),
    q('smwt4', '试验后 Borg 自觉疲劳评分（6-20）', 'number', null, { min: 6, max: 20 }),
    q('smwt5', '试验后呼吸困难评分（Borg 0-10，0=无，10=极重）', 'number', null, { min: 0, max: 10 }),
  ]),
  dimensions: [dim('distance', '步行距离', ['smwt1'])],
  scoring: { method: 'none' },
};

const CLAVIEN = {
  code: 'clavien-dindo',
  title: 'Clavien-Dindo 手术并发症分级',
  category: '症状评估',
  description: '国际通用的外科手术并发症严重程度分级（I-V 级），依据并发症所需的治疗措施划分，是外科临床研究的标准结局评价工具。',
  instructions: '请由研究/临床医师根据患者术后并发症情况及所采取的治疗措施选择等级（如无并发症请选"无并发症"）。',
  source: 'Dindo D, Demartines N, Clavien PA. Classification of surgical complications: a new proposal with evaluation in a cohort of 6336 patients and results of a survey. Ann Surg. 2004;240(2):205-213.',
  license: '公开发表分级标准，可免费使用，建议引用来源文献。',
  tags: ['手术并发症', '外科', '分级', '他评'],
  usage: {
    population: '各类外科手术患者（围手术期并发症登记与研究）',
    mode: '医师评定（术后随访）',
    time: '约 1-2 分钟',
    scoring: 'I、II、IIIa、IIIb、IVa、IVb、V 级（本平台按 1-7 编码，无并发症记 0 分）',
    interpretation: 'I 级：无需药物治疗或手术干预（如退热、止吐、理疗）；II 级：需药物治疗（含输血、肠外营养）；IIIa 级：需介入/手术但无需全麻；IIIb 级：需全麻下手术；IVa 级：单器官衰竭（含透析）；IVb 级：多器官衰竭；V 级：死亡',
    notes: '常用于报告"严重并发症率（≥III 级）"；建议同时记录并发症发生时间与 Clavien-Dindo 分级变化；不同研究者判定可能存在差异，建议双人独立判定',
    psychometrics: '被国际外科期刊广泛采用，评定者间一致性良好（Kappa 0.7-0.9），是外科并发症报告的标准',
  },
  items: numbered([
    q('clavien1', '本次手术并发症严重程度分级', 'radio', [
      { label: '无并发症', value: 0 },
      { label: 'I 级：无需药物或手术干预（如退热、止吐、理疗、利尿）', value: 1 },
      { label: 'II 级：需药物治疗（含输血、肠外营养）', value: 2 },
      { label: 'IIIa 级：需介入或手术干预，但无需全身麻醉', value: 3 },
      { label: 'IIIb 级：需全身麻醉下手术干预', value: 4 },
      { label: 'IVa 级：单器官功能衰竭（含透析）', value: 5 },
      { label: 'IVb 级：多器官功能衰竭', value: 6 },
      { label: 'V 级：术后死亡', value: 7 },
    ]),
  ]),
  dimensions: [dim('total', '并发症分级', ['clavien1'])],
  scoring: { method: 'sum', totalRange: [0, 7], cutoffs: [] },
};

/* ---------------- SRQ-20 ---------------- */
const SRQ20 = {
  code: 'srq-20',
  title: 'SRQ-20 自评问卷（WHO 心理困扰筛查）',
  category: '情绪与心理',
  description: '世界卫生组织开发的自评问卷，20 个"是/否"条目，用于基层与社区人群常见精神障碍（抑郁、焦虑、躯体化）的快速筛查。总分 0-20 分，常用界值 7-8 分（≥8 提示可能存在心理困扰）。',
  instructions: '请根据您最近一个月内的实际情况，回答以下问题（是/否）。',
  source: 'Harding TW, de Arango MV, Baltazar J, et al. Mental disorders in primary health care: a study of their frequency and diagnosis in four developing countries. Psychol Med. 1980;10(2):231-241. WHO 用户指南 1994。',
  license: 'WHO 公开发布工具，可免费用于非商业研究与公共卫生筛查，建议引用 WHO 用户指南。',
  tags: ['心理困扰', '筛查', 'WHO', '20题', '是/否作答'],
  usage: {
    population: '基层医疗、社区与流调人群（成人）；也用于慢病、肿瘤患者心理困扰初筛',
    mode: '自评（识字困难者可由调查员逐条询问）',
    time: '约 3-5 分钟',
    scoring: '答"是"计 1 分，答"否"计 0 分，20 题求和（0-20 分）',
    interpretation: '常用界值 7-8 分：≥8 分提示可能存在非特异性心理困扰，建议使用 PHQ-9/GAD-7 或专科访谈进一步评估；不用于单独下诊断',
    notes: '部分条目涉及躯体症状，器质性疾病患者可能出现假阳性；建议与临床访谈结合',
    psychometrics: 'WHO 多国协作研究显示在初级保健人群中敏感度约 63%-90%、特异度约 60%-80%，Cronbach α 约 0.8',
  },
  items: numbered([
    q('srq1', '您是否经常头痛？', 'radio', YN),
    q('srq2', '您是否食欲差？', 'radio', YN),
    q('srq3', '您是否睡眠差？', 'radio', YN),
    q('srq4', '您是否容易被惊吓？', 'radio', YN),
    q('srq5', '您是否手抖？', 'radio', YN),
    q('srq6', '您是否感到紧张、不安或心烦？', 'radio', YN),
    q('srq7', '您是否消化不良？', 'radio', YN),
    q('srq8', '您是否不能思考问题清楚？', 'radio', YN),
    q('srq9', '您是否感到不快乐？', 'radio', YN),
    q('srq10', '您是否经常哭泣？', 'radio', YN),
    q('srq11', '您是否难以从日常活动中获得乐趣？', 'radio', YN),
    q('srq12', '您是否难以做决定？', 'radio', YN),
    q('srq13', '您的日常工作是否因感到痛苦而受到影响？', 'radio', YN),
    q('srq14', '您是否不能完成日常活动中的事情？', 'radio', YN),
    q('srq15', '您是否对生活失去兴趣？', 'radio', YN),
    q('srq16', '您是否感到自己是个没有价值的人？', 'radio', YN),
    q('srq17', '您是否对生活感到绝望？', 'radio', YN, { safety: true }),
    q('srq18', '您是否感到疲劳？', 'radio', YN),
    q('srq19', '您是否感到胃部不适？', 'radio', YN),
    q('srq20', '您是否容易疲劳？', 'radio', YN),
  ]),
  dimensions: [dim('total', 'SRQ-20 总分', K.ids('srq', 20))],
  scoring: {
    method: 'sum',
    totalRange: [0, 20],
    cutoffs: [
      { max: 6, label: '筛查阴性', level: 'normal', advice: '未达到常用筛查界值。' },
      { max: 20, label: '提示心理困扰', level: 'moderate', advice: '≥7-8 分提示可能存在心理困扰，建议进一步使用 PHQ-9、GAD-7 或进行专科访谈。' },
    ],
    criticalItems: ['srq17'],
    criticalThreshold: 1,
    criticalMessage: '第17题回答"是"，提示存在绝望感，建议进行自杀风险临床评估。',
  },
};

/* ---------------- K10 ---------------- */
const K10 = {
  code: 'k10',
  title: 'K10 心理困扰量表（Kessler）',
  category: '情绪与心理',
  description: 'Kessler 心理困扰量表（10 条目），评估过去 4 周焦虑与抑郁症状的总体水平，广泛用于流行病学调查与卫生服务研究。总分 10-50 分，分值越高困扰越重；常用界值：≥22 分提示中等、≥30 分提示严重心理困扰。',
  instructions: '请根据您最近 4 周的感受，选择最符合的频率。',
  source: 'Kessler RC, Andrews G, Colpe LJ, et al. Short screening scales to monitor population prevalences and trends in non-specific psychological distress. Psychol Med. 2002;32(6):959-976.',
  license: '公开发表量表，可用于研究与公共卫生监测，建议引用来源文献。',
  tags: ['心理困扰', '流调', '10题', 'Kessler'],
  usage: {
    population: '成人普通人群、社区与流调样本；亦用于慢病人群心理健康监测',
    mode: '自评',
    time: '约 2-3 分钟',
    scoring: '5 级计分（1=全部时间 ... 5=从不）反向编码后求和，或按标准编码得到总分 10-50 分（分值越高越严重）',
    interpretation: '常用界值：≥22 分中等心理困扰，≥30 分严重心理困扰；用于人群筛查与分级，不作个体诊断',
    notes: 'K10 为维度性量表，不区分具体疾病；如需区分抑郁/焦虑请配合 PHQ-9、GAD-7',
    psychometrics: '多国验证显示良好的内部一致性（α 0.88-0.93）与判别效度，被 WHO 世界心理健康调查等大型研究采用',
  },
  items: numbered([
    q('k10_1', '您有多久感到无缘无故地疲倦？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_2', '您有多久感到紧张？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_3', '您有多久感到紧张到无法平静下来？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_4', '您有多久感到绝望？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_5', '您有多久感到坐立不安或烦躁？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_6', '您有多久感到坐不住？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_7', '您有多久感到抑郁？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_8', '您有多久感到做每件事都很费力？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_9', '您有多久感到悲伤到什么都无法让您高兴起来？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
    q('k10_10', '您有多久感到自己没有价值？', 'radio', [
      { label: '全部时间', value: 5 }, { label: '大部分时间', value: 4 }, { label: '一部分时间', value: 3 },
      { label: '偶尔', value: 2 }, { label: '从不', value: 1 },
    ]),
  ]),
  dimensions: [dim('total', 'K10 总分', K.ids('k10_', 10))],
  scoring: {
    method: 'sum',
    totalRange: [10, 50],
    cutoffs: [
      { max: 19, label: '无明显心理困扰', level: 'normal', advice: '心理困扰水平较低。' },
      { max: 24, label: '轻度心理困扰', level: 'mild', advice: '建议关注情绪状态，必要时复评。' },
      { max: 29, label: '中等心理困扰', level: 'moderate', advice: '建议进一步使用 PHQ-9/GAD-7 评估，并提供心理支持。' },
      { max: 50, label: '严重心理困扰', level: 'severe', advice: '建议尽快精神心理专科评估与干预。' },
    ],
  },
};

/* ---------------- SCOFF ---------------- */
const SCOFF = {
  code: 'scoff',
  title: 'SCOFF 进食障碍筛查问卷',
  category: '情绪与心理',
  description: '5 个"是/否"问题的进食障碍（神经性厌食/贪食）快速筛查工具，≥2 个"是"提示可能存在进食障碍。名称取自 5 个问题的英文关键词首字母。',
  instructions: '请根据您平时的实际情况如实回答以下 5 个问题。',
  source: 'Morgan JF, Reid F, Lacey JH. The SCOFF questionnaire: assessment of a new screening tool for eating disorders. BMJ. 1999;319(7223):1467-1468.',
  license: '公开发表工具，可免费用于临床筛查与研究，建议引用来源文献。',
  tags: ['进食障碍', '厌食症', '贪食症', '5题', '是/否作答'],
  usage: {
    population: '青少年与成人，尤其体重明显波动、过度关注体重体形者；消化科、内分泌科与精神科门诊',
    mode: '自评（也可口头询问）',
    time: '约 1 分钟',
    scoring: '每题"是"计 1 分，总分 0-5 分',
    interpretation: '≥2 分提示可能存在进食障碍，建议转诊精神心理或营养专科进一步评估（如 EDE-Q、临床访谈）',
    notes: '敏感度较高但特异度有限，阳性需进一步评估；对青少年应结合生长发育情况判断；体形关注条目在健身人群中可能出现假阳性',
    psychometrics: '原始研究敏感度 100%、特异度 87.5%（进食障碍 vs 健康对照）；后续系统评价提示在普通人群中敏感度约 80%',
  },
  items: numbered([
    q('scoff1', '您是否因为觉得自己太胖而故意让自己呕吐？', 'radio', YN),
    q('scoff2', '您是否担心自己已经失去了对进食的控制？', 'radio', YN),
    q('scoff3', '您最近是否体重下降超过 6 公斤（在 3 个月内）？', 'radio', YN),
    q('scoff4', '您是否认为自己在别人眼中很胖，而别人却认为您太瘦？', 'radio', YN),
    q('scoff5', '您是否觉得食物支配了您的生活？', 'radio', YN),
  ]),
  dimensions: [dim('total', 'SCOFF 阳性条目数', K.ids('scoff', 5))],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 1, label: '筛查阴性', level: 'normal', advice: '未达到进食障碍筛查阳性界值。' },
      { max: 5, label: '筛查阳性', level: 'severe', advice: '≥2 项"是"提示可能存在进食障碍，建议精神心理/营养专科进一步评估，注意电解质与营养状况。' },
    ],
  },
};

/* ---------------- DAST-10 ---------------- */
const DAST10 = {
  code: 'dast-10',
  title: 'DAST-10 药物滥用筛查量表',
  category: '成瘾行为',
  description: '10 个"是/否"条目，筛查过去 12 个月内非医疗目的使用药物（含处方药滥用）相关问题。总分 0-10 分，分值越高问题越严重。',
  instructions: '以下问题针对您过去 12 个月内使用药物（非医疗目的，包括处方药滥用）的情况，请回答"是"或"否"。',
  source: 'Skinner HA. The Drug Abuse Screening Test. Addict Behav. 1982;7(4):363-371. 简版（DAST-10）见：Gavin DR, Ross HE, Skinner HA. Br J Addict. 1989;84(3):301-307.',
  license: '公开发表量表，研究与非商业临床使用可免费使用，建议引用来源文献。',
  tags: ['药物滥用', '成瘾', '筛查', '10题', '是/否作答'],
  usage: {
    population: '成人；急诊、精神科、疼痛门诊与成瘾治疗人群',
    mode: '自评或访谈式施测（涉及敏感内容，建议保护隐私）',
    time: '约 2 分钟',
    scoring: '除第 3 题外，"是"计 1 分；第 3 题（是否总能停止用药）"否"计 1 分。总分 0-10 分',
    interpretation: '0 分无问题；1-2 分低水平；3-5 分中等；6-8 分相当严重；9-10 分严重，建议成瘾专科评估与干预',
    notes: '不含酒精（酒精问题请用 AUDIT/CAGE）；回答可能受社会期望影响，建议结合临床与实验室检查',
    psychometrics: '内部一致性 α 约 0.86-0.94，与 DSM 药物依赖诊断一致性良好',
  },
  items: numbered([
    q('dast1', '您是否使用过除医疗目的以外的药物？', 'radio', YN),
    q('dast2', '您是否滥用过处方药？', 'radio', YN),
    q('dast3', '您是否能总是停止使用药物？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }], { hint: '本条目为反向计分：回答"否"计 1 分。' }),
    q('dast4', '您是否曾经因为使用药物而出现过记忆丧失（黑朦）？', 'radio', YN),
    q('dast5', '您是否曾经因为使用药物而感到糟糕或内疚？', 'radio', YN),
    q('dast6', '您的配偶（或父母）是否曾经抱怨过您使用药物？', 'radio', YN),
    q('dast7', '您是否曾经因为使用药物而忽视家庭或家人？', 'radio', YN),
    q('dast8', '您是否曾经从事过违法行为以获得药物？', 'radio', YN),
    q('dast9', '您是否曾经在停药后出现戒断症状（身体不适）？', 'radio', YN),
    q('dast10', '您是否曾经因为使用药物而出现过医疗问题？', 'radio', YN),
  ]),
  dimensions: [dim('total', 'DAST-10 总分', K.ids('dast', 10))],
  scoring: {
    method: 'sum',
    totalRange: [0, 10],
    cutoffs: [
      { max: 0, label: '无问题', level: 'normal', advice: '未发现药物使用相关问题。' },
      { max: 2, label: '低水平', level: 'mild', advice: '建议提供简短干预与随访。' },
      { max: 5, label: '中等水平', level: 'moderate', advice: '建议进一步评估并制定干预计划。' },
      { max: 8, label: '相当严重', level: 'severe', advice: '建议成瘾专科系统评估与治疗。' },
      { max: 10, label: '严重', level: 'severe', advice: '建议尽快成瘾医学专科住院或门诊治疗。' },
    ],
  },
};

/* ---------------- AUDIT（完整版） ---------------- */
const AUDIT = {
  code: 'audit',
  title: 'AUDIT 酒精使用障碍筛查量表（完整版）',
  category: '成瘾行为',
  description: 'WHO 编制的酒精使用障碍筛查量表，10 个条目（0-40 分），覆盖饮酒量、依赖症状与有害饮酒。≥8 分提示危险/有害饮酒；在中国人群中常用界值 7-8 分。',
  instructions: '请根据您过去一年的饮酒情况作答。1 标准杯≈啤酒 350ml / 葡萄酒 150ml / 白酒 45ml。',
  source: 'Saunders JB, Aasland OG, Babor TF, de la Fuente JR, Grant M. Development of the Alcohol Use Disorders Identification Test (AUDIT): WHO collaborative project on early detection of persons with harmful alcohol consumption—II. Addiction. 1993;88(6):791-804.',
  license: 'WHO 免费提供，可自由使用，建议引用来源文献。',
  tags: ['饮酒', '成瘾', 'WHO', '10题'],
  usage: {
    population: '成人；内科、急诊、精神科与社区筛查',
    mode: '自评或访谈式施测',
    time: '约 2-3 分钟',
    scoring: '前 8 题 0-4 分五级计分；第 9、10 题 0、2、4 三级计分；总分 0-40 分',
    interpretation: '0-7 分低风险（建议安全教育）；8-15 分危险饮酒（简短干预）；16-19 分有害饮酒（干预+随访）；≥20 分疑似酒精依赖（建议专科治疗）',
    notes: '有研究提示女性与老年人宜采用更低界值（≥6 分）；AUDIT-C 为其 3 题简版（本平台已收录）',
    psychometrics: 'WHO 六国验证：敏感度 92%、特异度 94%（界值 8 分）；中文版在多项研究中验证良好',
  },
  items: numbered([
    q('audit1', '您多久喝一次含酒精的饮料？', 'radio', [
      { label: '从不', value: 0 }, { label: '每月1次或更少', value: 1 }, { label: '每月2-4次', value: 2 },
      { label: '每周2-3次', value: 3 }, { label: '每周4次或更多', value: 4 },
    ]),
    q('audit2', '在喝酒的日子里，您通常喝多少标准杯？', 'radio', [
      { label: '1-2杯', value: 0 }, { label: '3-4杯', value: 1 }, { label: '5-6杯', value: 2 },
      { label: '7-9杯', value: 3 }, { label: '10杯或更多', value: 4 },
    ]),
    q('audit3', '您多久一次一次喝 6 标准杯或以上？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
    q('audit4', '过去一年中，您有多少次发现自己一旦开始喝酒就很难停下来？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
    q('audit5', '过去一年中，您有多少次因为喝酒而未能完成您应该做的事？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
    q('audit6', '过去一年中，您有多少次在大量饮酒后早晨需要喝酒才能正常活动（"睁眼酒"）？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
    q('audit7', '过去一年中，您有多少次在饮酒后感到内疚或后悔？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
    q('audit8', '过去一年中，您有多少次因为饮酒而记不起前一天晚上发生的事情？', 'radio', [
      { label: '从不', value: 0 }, { label: '少于每月1次', value: 1 }, { label: '每月', value: 2 },
      { label: '每周', value: 3 }, { label: '每天或几乎每天', value: 4 },
    ]),
    q('audit9', '您或他人是否曾因您的饮酒而受伤？', 'radio', [
      { label: '没有', value: 0 }, { label: '有，但不是在过去一年', value: 2 }, { label: '有，在过去一年内', value: 4 },
    ]),
    q('audit10', '是否有亲友、医生或其他医务人员曾经关心过您的饮酒问题或建议您减少饮酒？', 'radio', [
      { label: '没有', value: 0 }, { label: '有，但不是在过去一年', value: 2 }, { label: '有，在过去一年内', value: 4 },
    ]),
  ]),
  dimensions: [
    dim('hazardous', '危险饮酒（第1-3题）', ['audit1', 'audit2', 'audit3']),
    dim('dependence', '依赖症状（第4-6题）', ['audit4', 'audit5', 'audit6']),
    dim('harmful', '有害饮酒（第7-10题）', ['audit7', 'audit8', 'audit9', 'audit10']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 40],
    cutoffs: [
      { max: 7, label: '低风险饮酒', level: 'normal', advice: '建议保持安全饮酒习惯，提供健康教育。' },
      { max: 15, label: '危险饮酒', level: 'mild', advice: '建议进行简短干预（反馈+建议+目标设定）并 1-3 个月后复评。' },
      { max: 19, label: '有害饮酒', level: 'moderate', advice: '建议系统干预与随访，评估共病躯体与精神问题。' },
      { max: 40, label: '疑似酒精依赖', level: 'severe', advice: '建议转诊成瘾专科，评估戒断风险并制定治疗方案。' },
    ],
  },
};

/* ---------------- MDQ ---------------- */
const MDQ = {
  code: 'mdq',
  title: 'MDQ 双相情感障碍筛查量表',
  category: '情绪与心理',
  description: '双相谱系障碍筛查工具：13 个"是/否"症状条目 + 1 个"是否同时出现"条目 + 1 个功能损害条目。阳性需同时满足：≥7 项"是" + 确实同时出现 + 造成中度及以上功能问题。',
  instructions: '请回忆您是否曾经有过下列情况（不是现在，而是曾经有过的一段时间）。',
  source: 'Hirschfeld RM, Williams JB, Spitzer RL, et al. Development and validation of a screening instrument for bipolar spectrum disorder: the Mood Disorder Questionnaire. Am J Psychiatry. 2000;157(11):1873-1875.',
  license: '公开发表量表，临床与研究可免费使用，建议引用来源文献。',
  tags: ['双相障碍', '筛查', '15题', '是/否作答'],
  usage: {
    population: '抑郁发作患者、反复情绪波动者、双相障碍高危人群',
    mode: '自评',
    time: '约 3 分钟',
    scoring: '13 个症状条目每项"是"计 1 分（0-13）；另需回答"是否同时出现"与"功能损害程度"',
    interpretation: '阳性标准（三者均需满足）：① 症状条目 ≥7 项"是"；② 这些情况同时出现过；③ 造成中度或严重的问题。阳性提示需进一步做结构化临床访谈',
    notes: '筛查阳性不等于诊断为双相障碍；MDQ 敏感度较高但特异度中等，须结合临床评估；常用于 PHQ-9 呈抑郁的患者中识别潜在双相',
    psychometrics: '原始研究敏感度 0.73、特异度 0.90；社区样本中特异度下降，建议作为初筛工具使用',
  },
  items: numbered([
    q('mdq1', '您是否曾经有一段时间，与平时相比，感觉非常棒或非常兴奋，以至于别人认为您与平时不一样，或因此惹麻烦？', 'radio', YN),
    q('mdq2', '您是否曾经有一段时间，情绪非常容易激动，会因为一些小事对别人大声喊叫或争吵？', 'radio', YN),
    q('mdq3', '您是否曾经有一段时间，感到非常自信，甚至觉得别人都比不上自己？', 'radio', YN),
    q('mdq4', '您是否曾经有一段时间，比平时睡得少很多，但仍然感觉精力充沛？', 'radio', YN),
    q('mdq5', '您是否曾经有一段时间，比平时话多很多，或者说话速度很快？', 'radio', YN),
    q('mdq6', '您是否曾经有一段时间，思维飞快，脑子里想法一个接一个？', 'radio', YN),
    q('mdq7', '您是否曾经有一段时间，很容易被周围的事情打断注意力，难以集中？', 'radio', YN),
    q('mdq8', '您是否曾经有一段时间，比平时更有精力做事情？', 'radio', YN),
    q('mdq9', '您是否曾经有一段时间，比平时更活跃，或做的事情比平时多很多？', 'radio', YN),
    q('mdq10', '您是否曾经有一段时间，比平时更爱社交、更外向，例如深夜给朋友打电话？', 'radio', YN),
    q('mdq11', '您是否曾经有一段时间，对性的兴趣明显高于平时？', 'radio', YN),
    q('mdq12', '您是否曾经有一段时间，做出一些与平时不同、别人觉得过分或愚蠢、甚至可能带来麻烦的事情？', 'radio', YN),
    q('mdq13', '您是否曾经有一段时间，花钱大手大脚，甚至因此负债或遇到经济问题？', 'radio', YN),
    q('mdq14', '如果您对以上多个问题回答"是"：这些事情是否在同一时期同时出现过？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 },
    ], { exclude: true }),
    q('mdq15', '这些问题给您造成了多大程度的影响（如工作、家庭、社交或法律问题）？', 'radio', [
      { label: '没有问题', value: 0 }, { label: '轻微问题', value: 1 }, { label: '中度问题', value: 2 }, { label: '严重问题', value: 3 },
    ], { exclude: true }),
  ]),
  dimensions: [dim('total', 'MDQ 症状条目得分', K.ids('mdq', 13))],
  scoring: {
    method: 'sum',
    totalRange: [0, 13],
    cutoffs: [
      { max: 6, label: '筛查阴性', level: 'normal', advice: '症状条目 <7 项，未达到筛查阳性标准。' },
      { max: 13, label: '症状条目≥7项（需结合后两题判定）', level: 'moderate', advice: '症状条目 ≥7 项时，还须同时满足：第14题"这些情况同时出现过"=是、且第15题影响程度 ≥"中度问题"（≥2分），三者均满足才算 MDQ 阳性；阳性建议精神心理专科进一步评估。' },
    ],
  },
};

module.exports = [
  SRQ20, K10, MDQ, SCOFF, DAST10, AUDIT,
  ESAS, PCS, VAS_PAIN, BRISTOL, FAC, ASHWORTH, MRS, NYHA, CCS, EHRA, BORG_SCALE,
  MINICOG, AD8, SARCF, FRAIL, MUST, FES_I,
  IIEF5, OABSS, DASI, SMWT, CLAVIEN,
];
