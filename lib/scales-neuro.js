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
    q('balance', '平衡测试（并脚、半串联、串联站立）', 'radio', [
      { label: '并脚站立不足10秒', value: 0 },
      { label: '并脚满10秒，半串联不足10秒', value: 1 },
      { label: '并脚和半串联均满10秒，串联不足3秒', value: 2 },
      { label: '并脚和半串联均满10秒，串联3–9.99秒', value: 3 },
      { label: '三种站立均满10秒', value: 4 },
    ]),
    q('gait', '4 米步行时间（秒）', 'number', null, { unit: '秒', min: 0, max: 120,
      hint: '无法完成填 0；<4.82 秒=4 分；4.82-6.20=3 分；6.21-8.70=2 分；>8.70=1 分',
      bands: [{ lte: 0, score: 0 }, { lt: 4.82, score: 4 }, { lt: 6.21, score: 3 }, { lte: 8.70, score: 2 }, { score: 1 }] }),
    q('chair', '不使用手臂连续5次起坐时间（秒）', 'number', null, { unit: '秒', min: 0, max: 180,
      hint: '无法完成填0；≤11.19秒=4分；11.20–13.69=3分；13.70–16.69=2分；16.70–60=1分；>60秒=0分。',
      bands: [{ lte: 0, score: 0 }, { lt: 11.20, score: 4 }, { lt: 13.70, score: 3 }, { lt: 16.70, score: 2 }, { lte: 60, score: 1 }, { score: 0 }] }),
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
const NDI = {
  code: 'ndi',
  title: 'NDI 颈椎功能障碍指数',
  category: '康复与疼痛',
  licenseTier: 'commercial',
  description: 'NDI为10项工具，原始分0–50，可乘2换算百分分。原始分0–4无障碍、5–14轻度、15–24中度、25–34重度、35–50完全受限。仅提供结构，题干和每项专用选项需从获准版本录入。',
  instructions: '请先按获准中文版填写全部题干与选项，不能用通用“轻中重”标签代替原始计分锚点。',
  source: 'Vernon H, Mior S. The Neck Disability Index: a study of reliability and validity. J Manipulative Physiol Ther. 1991;14(7):409-415.',
  license: 'NDI有版权与电子化使用条件，须向权利方核实版本许可（Mapi ePROVIDE）；本平台不分发正文，只保留计分结构。',
  tags: ['颈椎', '颈痛', '功能障碍', '10题'],
  items: numbered(K.ids('ndi', 10).map(function (id, i) {
    return K.pendingQ(id, i + 1, [0, 1, 2, 3, 4, 5]);
  })),
  dimensions: [dim('total', 'NDI 总分', K.ids('ndi', 10))],
  scoring: {
    method: 'sum',
    multiplier: 2,
    totalRange: [0, 100],
    cutoffs: [
      { max: 8, label: '无功能障碍', level: 'normal', advice: '原始分0–4，未见明显功能障碍。' },
      { max: 28, label: '轻度障碍', level: 'mild', advice: '原始分5–14，建议活动与姿势管理。' },
      { max: 48, label: '中度障碍', level: 'moderate', advice: '原始分15–24，建议康复评估。' },
      { max: 68, label: '重度障碍', level: 'severe', advice: '原始分25–34，建议系统康复评估。' },
      { max: 100, label: '完全受限', level: 'severe', advice: '功能严重受限，建议尽快专科评估。' },
    ],
  },
};

const NIHSS = {
  code: 'nihss',
  title: 'NIHSS 卒中神经功能缺损评分',
  category: '认知与老年',
  rater: 'clinician',
  licenseTier: 'registration',
  description: '用于记录受训评估者完成的 NIHSS 检查，15个计分项目，总分0–42。不是患者自评表，低分或0分不能排除卒中。',
  instructions: '使用NINDS官方检查指导语和语言/构音测试材料，按规定顺序检查、记录实际表现。此页面仅记录评分，不提供替代检查材料。截肢、融合或插管等无法评估情况请按官方规则记录，不能猜分。',
  source: 'Brott T, et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke. 1989;20:864-870. NINDS NIH Stroke Scale; Canadian Stroke Research Network NIHSS Scoring Tips, November 2023.',
  license: 'NIH公开提供评分表，使用者应完成规范培训。官方材料：https://www.ninds.nih.gov/health-information/stroke/assess-and-treat/nih-stroke-scale',
  tags: ['卒中', 'NIHSS', '神经功能', '评估者填写'],
  usage: {
    population: '疑似或确诊急性卒中的成人，由受训临床评估者使用',
    mode: '他评',
    notes: '记录首次表现而非最佳尝试；肢体按规定体位和计时检查。后循环卒中可能分数很低，不能用评分单独决定或拒绝治疗。',
  },
  items: numbered([
    q('n1a', '1a 意识水平', 'radio', [
      { label: '清醒，反应敏锐', value: 0 },
      { label: '轻微刺激可唤醒并完成指令', value: 1 },
      { label: '需反复刺激，或强/疼痛刺激才能引出非刻板反应', value: 2 },
      { label: '仅有反射性活动、自主神经反应或完全无反应', value: 3 },
    ]),
    q('n1b', '1b 意识提问（月份、年龄）', 'radio', [
      { label: '两项均正确', value: 0 }, { label: '一项正确', value: 1 }, { label: '两项均错误', value: 2 },
    ]),
    q('n1c', '1c 指令（睁闭眼、健侧握拳及松开）', 'radio', [
      { label: '两项均完成', value: 0 }, { label: '完成一项', value: 1 }, { label: '均未完成', value: 2 },
    ]),
    q('n2', '2 最佳水平凝视', 'radio', [
      { label: '正常', value: 0 }, { label: '部分凝视麻痹', value: 1 },
      { label: '强迫偏视或无法通过头眼反射克服的完全凝视麻痹', value: 2 },
    ]),
    q('n3', '3 视野', 'radio', [
      { label: '无视野缺损', value: 0 }, { label: '部分偏盲', value: 1 },
      { label: '完全偏盲', value: 2 }, { label: '双侧偏盲或失明', value: 3 },
    ]),
    q('n4', '4 面瘫', 'radio', [
      { label: '正常，对称', value: 0 }, { label: '轻微面瘫（鼻唇沟变浅、微笑不对称）', value: 1 },
      { label: '部分面瘫（下部面肌完全或几乎完全麻痹）', value: 2 },
      { label: '一侧或双侧上、下部面肌完全麻痹', value: 3 },
    ]),
    q('n5a', '5a 左上肢运动（保持10秒）', 'radio', [
      { label: '无漂移', value: 0 }, { label: '漂移但不触及床面', value: 1 },
      { label: '有抗重力动作，但不能维持，落到床面', value: 2 },
      { label: '无抗重力动作', value: 3 }, { label: '无活动', value: 4 },
      { label: 'UN：截肢/关节融合，无法评估（不产出完整总分）', value: 'un', score: null },
    ], { hint: '坐位抬臂90°，仰卧位45°。截肢或关节融合无法测时，按官方UN规则另行记录。' }),
    q('n5b', '5b 右上肢运动（保持10秒）', 'radio', [
      { label: '无漂移', value: 0 }, { label: '漂移但不触及床面', value: 1 },
      { label: '有抗重力动作，但不能维持，落到床面', value: 2 },
      { label: '无抗重力动作', value: 3 }, { label: '无活动', value: 4 },
      { label: 'UN：截肢/关节融合，无法评估（不产出完整总分）', value: 'un', score: null },
    ], { hint: '坐位抬臂90°，仰卧位45°。无法测者不能任意选0分。' }),
    q('n6a', '6a 左下肢运动（仰卧抬腿30°，保持5秒）', 'radio', [
      { label: '无漂移', value: 0 }, { label: '漂移但不触及床面', value: 1 },
      { label: '有抗重力动作，但落到床面', value: 2 },
      { label: '无抗重力动作', value: 3 }, { label: '无活动', value: 4 },
      { label: 'UN：截肢/关节融合，无法评估（不产出完整总分）', value: 'un', score: null },
    ]),
    q('n6b', '6b 右下肢运动（仰卧抬腿30°，保持5秒）', 'radio', [
      { label: '无漂移', value: 0 }, { label: '漂移但不触及床面', value: 1 },
      { label: '有抗重力动作，但落到床面', value: 2 },
      { label: '无抗重力动作', value: 3 }, { label: '无活动', value: 4 },
      { label: 'UN：截肢/关节融合，无法评估（不产出完整总分）', value: 'un', score: null },
    ]),
    q('n7', '7 肢体共济失调', 'radio', [
      { label: '无', value: 0 }, { label: '一个肢体有', value: 1 }, { label: '两个肢体有', value: 2 },
      { label: 'UN：肢体截肢/关节融合，无法评估（不产出完整总分）', value: 'un', score: null },
    ], { hint: '仅计与无力不成比例的共济失调；瘫痪或不能理解指令不等于共济失调。' }),
    q('n8', '8 感觉', 'radio', [
      { label: '正常，无感觉缺失', value: 0 }, { label: '轻中度感觉缺失', value: 1 },
      { label: '重度或完全感觉缺失', value: 2 },
    ]),
    q('n9', '9 最佳语言', 'radio', [
      { label: '无失语', value: 0 }, { label: '轻中度失语，仍可传递部分信息', value: 1 },
      { label: '重度失语，交流片段化，评估者需推测', value: 2 },
      { label: '缄默或完全失语，没有可用的语言或理解', value: 3 },
    ], { hint: '须配合官方图片、命名及阅读材料检查。' }),
    q('n10', '10 构音障碍', 'radio', [
      { label: '正常', value: 0 }, { label: '轻中度含糊，但仍可理解', value: 1 },
      { label: '严重含糊、难以理解，或缄默', value: 2 },
      { label: 'UN：插管或其他物理障碍，无法评估（不产出完整总分）', value: 'un', score: null },
    ], { hint: '插管或其他物理障碍导致无法测者需记录UN，不能猜分。' }),
    q('n11', '11 消退和忽视', 'radio', [
      { label: '无异常', value: 0 },
      { label: '一类感觉忽视或双侧同时刺激消退', value: 1 },
      { label: '严重半侧忽视，或多类感觉忽视', value: 2 },
    ]),
  ]),
  dimensions: [dim('total', 'NIHSS 总分', ['n1a', 'n1b', 'n1c', 'n2', 'n3', 'n4', 'n5a', 'n5b', 'n6a', 'n6b', 'n7', 'n8', 'n9', 'n10', 'n11'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 42],
    cutoffs: [
      { max: 0, label: '未检出神经功能缺损', level: 'normal', advice: 'NIHSS为0不能排除卒中，尤其后循环卒中，仍须结合临床与影像。' },
      { max: 4, label: '轻度神经功能缺损', level: 'mild', advice: '缺损程度分层不能单独决定治疗，须由卒中团队评估。' },
      { max: 15, label: '中度神经功能缺损', level: 'moderate', advice: '建议卒中团队及时评估，记录检查时间及动态变化。' },
      { max: 20, label: '中重度神经功能缺损', level: 'severe', advice: '须由卒中团队及时评估和处理。' },
      { max: 42, label: '重度神经功能缺损', level: 'severe', advice: '严重神经功能缺损，须及时临床评估。' },
    ],
  },
};

/* ---------------- Hachinski 缺血指数 ---------------- */
function hisItem(id, text, yesScore) {
  return K.q(id, text, 'radio', [{ label: '否', value: 0 }, { label: '是（' + yesScore + '分）', value: yesScore }]);
}
const HACHINSKI = {
  code: 'hachinski',
  title: 'Hachinski 缺血指数量表',
  category: '认知与老年',
  rater: 'clinician',
  licenseTier: 'free',
  description: '用于痴呆病因鉴别（0–18分）：≥7分支持血管性痴呆，≤4分倾向原发性变性痴呆，5–6分提示混合性。该分数不能单独确定病因，须结合病史、影像和临床评估。',
  instructions: '请由临床评估者根据病史、查体与影像资料逐项判断。',
  source: 'Hachinski VC, Iliff LD, Zilhka E, et al. Cerebral blood flow in dementia. Arch Neurol. 1975;32(9):632-637.',
  license: '公开发表的临床评分，可免费使用，请引用来源文献。',
  tags: ['痴呆', '血管性痴呆', 'Hachinski', '评估者填写'],
  items: numbered([
    hisItem('h1', '突然起病', 2),
    hisItem('h2', '阶梯式恶化', 1),
    hisItem('h3', '波动性病程', 2),
    hisItem('h4', '夜间意识模糊', 1),
    hisItem('h5', '人格相对保留', 1),
    hisItem('h6', '抑郁', 1),
    hisItem('h7', '躯体主诉', 1),
    hisItem('h8', '情绪失控', 1),
    hisItem('h9', '高血压史', 1),
    hisItem('h10', '卒中史', 2),
    hisItem('h11', '伴动脉粥样硬化证据', 1),
    hisItem('h12', '局灶性神经系统症状', 2),
    hisItem('h13', '局灶性神经系统体征', 2),
  ]),
  dimensions: [dim('total', 'Hachinski总分', K.ids('h', 13))],
  scoring: {
    method: 'sum',
    totalRange: [0, 18],
    cutoffs: [
      { max: 4, label: '倾向变性性痴呆', level: 'normal', advice: '倾向原发性变性痴呆，仍须结合临床和影像。' },
      { max: 6, label: '混合性', level: 'moderate', advice: '提示混合性可能，建议多学科评估。' },
      { max: 18, label: '支持血管性痴呆', level: 'severe', advice: '支持血管性痴呆，建议结合影像、血管危险因素与认知评估。' },
    ],
  },
};

/* ---------------- ODI Oswestry 功能障碍指数（结构模板） ---------------- */
const ODI = {
  code: 'odi',
  title: 'ODI Oswestry 功能障碍指数',
  category: '康复与疼痛',
  licenseTier: 'commercial',
  description: 'ODI为10项腰痛功能障碍问卷，每项0–5分；总分按已作答项折算为百分分（不适用项退出分母）：0–20 轻度、21–40 中度、41–60 重度、61–80 致残、81–100 极重。本平台仅提供结构，题干与每项专用选项须由获准版本录入。',
  instructions: '请从获准中文版逐题录入题干与 6 个专用选项（0–5 分），不要以通用「轻中重」代替；「不适用」已作为第 7 个选项预置，按原表保留。',
  source: 'Fairbank JC, et al. The Oswestry Disability Index questionnaire. Physiotherapy. 1980;66:464-469.; Fairbank JCT, Pynsent PB. The Oswestry Disability Index. Spine. 2000;25(22):2940-2953.',
  license: 'ODI 有版权与使用条件（含电子化使用），使用前请核对所用版本的权利方与授权条款；本平台不分发正文，只保留计分结构。',
  tags: ['腰痛', '功能障碍', '10题', '百分分'],
  items: numbered(K.ids('odi', 10).map(function (id, i) {
    return K.pendingQ(id, i + 1, [0, 1, 2, 3, 4, 5], { na: true });
  })),
  dimensions: [dim('total', 'ODI 指数', K.ids('odi', 10))],
  scoring: {
    method: 'mean',
    multiplier: 20,
    totalRange: [0, 100],
    cutoffs: [
      { max: 20, label: '无明显至轻度功能障碍', level: 'mild', advice: '0–20%，建议维持活动与康复训练。' },
      { max: 40, label: '中度功能障碍', level: 'moderate', advice: '21–40%，建议康复评估并随访功能变化。' },
      { max: 60, label: '重度功能障碍', level: 'severe', advice: '41–60%，建议专科评估与系统康复干预。' },
      { max: 80, label: '致残性功能障碍', level: 'severe', advice: '61–80%，日常生活明显受限，建议尽快专科评估。' },
      { max: 100, label: '极重度或卧床', level: 'severe', advice: '81–100%，需临床团队综合评估卧床风险、情绪与并发症。' },
    ],
  },
};

/* ---------------- WOMAC 骨关节炎指数（结构模板） ---------------- */
const WOMAC = {
  code: 'womac',
  title: 'WOMAC 西部安大略与麦克马斯特大学骨关节炎指数',
  category: '康复与疼痛',
  licenseTier: 'commercial',
  description: 'WOMAC 24 项版：疼痛 5 项（0–20）、僵硬 2 项（0–8）、躯体功能 17 项（0–68），每项 0–4 分，分越高症状越重；各维度可按「维度分×100÷该维度满分」换算为 0–100 分。本平台仅提供结构与维度划分。',
  instructions: '请从获准中文版逐题录入题干与 5 个专用选项（0–4 分），保持疼痛/僵硬/功能三个维度的条目顺序与归属。',
  source: 'Bellamy N, et al. Validation study of WOMAC: a health status instrument for measuring clinically important patient relevant outcomes to antirheumatic drug therapy in patients with osteoarthritis of the hip or knee. J Rheumatol. 1988;15(12):1833-1840.',
  license: 'WOMAC 存在多个版本与计量形式（Likert 与 11 点数值量表），部分版本需注册或付费；使用前请核对所用版本的许可，本平台不分发正文。',
  tags: ['骨关节炎', '膝髋', '疼痛', '躯体功能'],
  items: numbered(K.ids('womac', 24).map(function (id, i) {
    return K.pendingQ(id, i + 1, [0, 1, 2, 3, 4]);
  })),
  dimensions: [
    dim('pain', '疼痛', ['womac1', 'womac2', 'womac3', 'womac4', 'womac5']),
    dim('stiffness', '僵硬', ['womac6', 'womac7']),
    dim('function', '躯体功能', K.ids('womac', 24).slice(7)),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 96],
    cutoffs: [],
  },
};

/* ---------------- QuickDASH 上肢功能评定（结构模板） ---------------- */
const QUICKDASH = {
  code: 'quickdash',
  title: 'QuickDASH 上肢功能障碍评定问卷',
  category: '康复与疼痛',
  licenseTier: 'commercial',
  description: 'QuickDASH 为 DASH 的 11 项简版，每项 1–5 分，按「[(均分−1)÷4]×100」折算为 0–100 分，分数越高上肢功能受限越重。本平台仅提供结构与换算公式，条目正文须由获准版本录入。',
  instructions: '请从获准中文版逐题录入题干与 5 个专用选项（1–5 分），选项分值必须保持 1–5，否则换算公式失效。本平台要求 11 项全部作答；官方规则允许缺 1 项按实际作答数折算。',
  source: 'Beaton DE, et al. The DASH and QuickDASH Outcome Measure User Manual. 2nd ed. Institute for Work & Health, 2007.',
  license: 'DASH/QuickDASH 由 Institute for Work & Health 管理，多数用途需注册获取并遵守使用条款；本平台不分发正文，只保留计分结构。',
  tags: ['上肢', '肩肘腕手', '功能评定', '11题'],
  items: numbered([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (n) {
    return K.pendingQ('d' + n, n, [1, 2, 3, 4, 5]);
  })),
  dimensions: [dim('total', 'QuickDASH 指数', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (n) { return 'd' + n; }))],
  scoring: {
    method: 'formula',
    formula: 'quickdash',
    totalRange: [0, 100],
    cutoffs: [],
  },
};

/* ---------------- Berg 平衡量表 ---------------- */
function bergItem(id, name, instr, a4, a3, a2, a1, a0) {
  return K.q(id, name + '——' + instr, 'radio', [
    { label: '4 ' + a4, value: 4 },
    { label: '3 ' + a3, value: 3 },
    { label: '2 ' + a2, value: 2 },
    { label: '1 ' + a1, value: 1 },
    { label: '0 ' + a0, value: 0 },
  ]);
}
const BERG = {
  code: 'berg',
  title: 'Berg 平衡量表（BBS）',
  category: '康复与疼痛',
  rater: 'clinician',
  licenseTier: 'registration',
  description: '14 项平衡动作，每项 0-4 分，总分 0-56，分越高平衡越好：41-56 跌倒风险低、21-40 中等、0-20 高。45/56 常作为独立安全行走的阈值，也有人建议用 40/56 判跌倒风险；量表不含步态条目，高分不能完全替代跌倒综合评估。',
  instructions: '由治疗师按标准口令逐条检查并记录：每题取「适用中最低的档次」。需秒表、直尺、两把椅子（一把带扶手）、踏凳与 3 米通道；测试全程须在可保护的姿势下进行。能独立站立 2 分钟者，第 3 项（无支撑坐）直接计满分。',
  source: 'Berg K, Wood Dailey C, Chua K, et al. Measuring balance in the elderly: validation of the Berg Balance Scale. Phys Ther. 1992;72(12):977. 逐条锚点参照公开发布的计分表（Falls Management South Australia；Riddle & Stratford 1999 对 45/56 阈值的验证）。',
  license: '原表公开发表，临床与科研普遍免费使用；正式研究或印刷分发请核对所用版本与研制方许可。本表锚点为按公开计分表转写的中文，未宣称等同于某官方中文版。',
  tags: ['平衡', '跌倒风险', '卒中', '老年', '评估者填写'],
  usage: {
    population: '老年及卒中、骨科康复等需要平衡评估的成人；无法站立或严重认知障碍者不适用',
    mode: '他评',
    notes: '存在天花板效应，高活动水平者区分度有限；分数不能单独决定出院或居家安全性，需结合步态、视力、用药与环境评估。',
  },
  items: numbered([
    bergItem('bg1', '坐位站起', '请站起来，尽量不用手支撑',
      '不用手支撑即可站起并保持稳定', '需要用手支撑才能站起', '用手撑多次尝试后能站起',
      '需要少量帮助才能站起或保持稳定', '需要中量或大量帮助才能站起'),
    bergItem('bg2', '无支撑站立', '请站立 2 分钟，不要扶任何东西',
      '能安全站立 2 分钟', '在监督下能站立 2 分钟', '能无支撑站立 30 秒',
      '需多次尝试才能无支撑站立 30 秒', '无法无支撑站立 30 秒'),
    bergItem('bg3', '无靠背坐（双脚着地或踏凳）', '请双臂交叉坐 2 分钟',
      '能安全稳固地坐 2 分钟', '在监督下能坐 2 分钟', '能坐 30 秒',
      '能坐 10 秒', '无支撑时坐不到 10 秒'),
    bergItem('bg4', '坐位坐下', '请坐下',
      '能安全坐下，几乎不用手支撑', '用手控制下落过程', '用腿后侧抵住椅边控制下落',
      '能独立坐下但下落不受控制', '需要帮助才能坐下'),
    bergItem('bg5', '转移（含扶手椅与无扶手椅各一次）', '请完成往返转移，可用椅或床',
      '能安全转移，仅轻微使用手', '能安全转移但明确需要用手', '在口头提示或监督下能转移',
      '需要 1 人帮助', '需要 2 人帮助或监督才安全'),
    bergItem('bg6', '闭眼站立', '请闭眼站立不动 10 秒',
      '能安全站立 10 秒', '在监督下能站立 10 秒', '能站立 3 秒',
      '无法保持闭眼 3 秒但未失衡', '需要帮助才能防止跌倒'),
    bergItem('bg7', '双脚并拢无支撑站立', '请双脚并拢站立，不要扶',
      '能自行并拢双脚并安全站立 1 分钟', '能自行并拢双脚，在监督下站立 1 分钟',
      '能自行并拢双脚但坚持不到 30 秒', '需帮助摆好姿势，但可并脚站立 15 秒',
      '需帮助摆好姿势且无法站立 15 秒'),
    bergItem('bg8', '站立位前伸（手臂抬至 90°）', '请伸直手指尽力向前够',
      '能自信地前伸 25 cm', '能前伸 12 cm', '能前伸 5 cm',
      '能前伸但需要监督', '尝试时失衡或需要外部支撑'),
    bergItem('bg9', '站立位从地上取物', '请捡起放在脚前的拖鞋',
      '能安全轻松地捡起', '能捡起但需要监督', '捡不到但可接近至距拖鞋 2-5 cm 且保持平衡',
      '捡不到，尝试时需要监督', '无法尝试，或需要帮助才不会失衡跌倒'),
    bergItem('bg10', '站立位左右后望', '请从左、右肩方向分别向后直视',
      '两侧都能回头看且重心转移良好', '仅一侧能回头看，另一侧重心转移不足',
      '只能侧身转动但保持平衡', '转动时需要监督', '需要帮助才不会失衡跌倒'),
    bergItem('bg11', '原地转 360°（双向各一圈）', '转完整一圈，停下，再反向转一圈',
      '能在 4 秒内安全转完 360°', '仅一侧能在 4 秒内安全转完 360°', '能安全转完 360°但速度慢',
      '需要近距离监督或口头提示', '转动时需要帮助'),
    bergItem('bg12', '交替踏凳（每脚 4 次）', '两脚交替踏上踏凳，每脚各触 4 次',
      '能独立安全地在 20 秒内完成 8 次踏步', '能独立在 20 秒以上完成 8 次踏步',
      '在监督下不用支撑完成 4 次', '完成 2 次以上但需要少量帮助',
      '需要帮助才不会跌倒，或无法尝试'),
    bergItem('bg13', '一脚置于另一脚前方站立', '示范后请前后串联站立',
      '能自行串联站位并保持 30 秒', '能自行将脚向前迈出并保持 30 秒',
      '能自行迈小步并保持 30 秒', '需要帮助迈步但可保持 15 秒', '踏步或站立时失衡'),
    bergItem('bg14', '单腿站立', '请单腿站立，尽可能久且不要扶',
      '能独立抬腿并保持 10 秒以上', '能独立抬腿保持 5-10 秒', '能独立抬腿保持 3 秒以上',
      '尝试抬腿但坚持不到 3 秒，仍可独立站立', '无法尝试，或需要帮助防止跌倒'),
  ]),
  dimensions: [dim('total', 'Berg 总分', K.ids('bg', 14))],
  scoring: {
    method: 'sum',
    totalRange: [0, 56],
    cutoffs: [
      { max: 20, label: '跌倒风险高（0-20）', level: 'severe', advice: '平衡功能严重受限，需即时跌倒防护、辅助器具与家属教育，并转康复科系统训练。' },
      { max: 40, label: '跌倒风险中等（21-40）', level: 'moderate', advice: '建议康复评估与平衡训练，同时排查视力、用药与环境危险因素；有研究建议把跌倒风险阈值放宽到 40/56。' },
      { max: 56, label: '跌倒风险低（41-56）', level: 'normal', advice: '处于低风险区间。45/56 常作为「独立安全行走」的阈值，41-44 仍需在监督下评估行走独立性；量表不含步态条目，不能单独决定居家或出院安全。' },
    ],
  },
};

/* ---------------- Hunt-Hess 动脉瘤性蛛网膜下腔出血分级 ---------------- */
const HUNT_HESS = {
  code: 'hunt-hess',
  title: 'Hunt-Hess 动脉瘤性蛛网膜下腔出血分级',
  category: '认知与老年',
  rater: 'clinician',
  licenseTier: 'free',
  description: '按就诊时临床表现分 Ⅰ-Ⅴ 级，用于描述动脉瘤性 SAH 的病情严重度与预后分层。分级受年龄、插管、镇静与合并症影响，不能单独决定手术或介入时机。',
  instructions: '由接诊医师在首次评估时确定级别并记录时间与依据；患者若已插管或镇静，应注明评估受限，不能把药物影响当作更高级别。',
  source: 'Hunt WE, Hess RM. Daily risk of time and rupture of intracranial aneurysms. J Neurosurg. 1968;28(5):473-476. 级别定义核对自 Joint Commission v2026B CSTK-03 数据元说明。',
  license: '公开发表的临床分级，可免费使用，请引用原始文献。',
  tags: ['蛛网膜下腔出血', '卒中', '分级', '评估者填写'],
  usage: {
    population: '确诊动脉瘤性蛛网膜下腔出血的成人',
    mode: '他评',
    notes: '该分级只是预后提示；是否需要急诊干预由影像、动脉瘤特征与临床综合判断。',
  },
  items: numbered([
    q('hh', 'Hunt-Hess 分级', 'radio', [
      { label: 'Ⅰ 无症状或轻微头痛、轻度颈僵', value: 1 },
      { label: 'Ⅱ 中重度头痛、颈僵，除脑神经麻痹外无其他神经功能缺损', value: 2 },
      { label: 'Ⅲ 嗜睡、意识模糊或轻度局灶性神经功能缺损', value: 3 },
      { label: 'Ⅳ 木僵，中重度偏瘫', value: 4 },
      { label: 'Ⅴ 昏迷，去脑强直', value: 5 },
    ]),
  ]),
  dimensions: [dim('grade', 'Hunt-Hess 级别', ['hh'])],
  scoring: {
    method: 'sum',
    totalRange: [1, 5],
    cutoffs: [
      { max: 1, label: 'Hunt-Hess Ⅰ 级', level: 'normal', advice: '临床表现最轻，仍需按 SAH 流程完成血管评估与再出血预防。' },
      { max: 2, label: 'Hunt-Hess Ⅱ 级', level: 'mild', advice: '头痛与颈僵为主，无实质神经功能缺损；按专科流程处理。' },
      { max: 3, label: 'Hunt-Hess Ⅲ 级', level: 'moderate', advice: '意识改变或轻度局灶缺损，需密切监测脑积水、血管痉挛与意识变化。' },
      { max: 4, label: 'Hunt-Hess Ⅳ 级', level: 'severe', advice: '木僵或偏瘫，属重型，建议重症监护与多学科决策。' },
      { max: 5, label: 'Hunt-Hess Ⅴ 级', level: 'severe', advice: '昏迷伴去脑强直，预后差；治疗决策须结合影像、年龄与家属意愿，不能仅凭级别放弃或积极干预。' },
    ],
  },
};

/* ---------------- WFNS 动脉瘤性 SAH 临床分级（由 GCS 推导） ---------------- */
const WFNS = {
  code: 'wfns-sah',
  title: 'WFNS 动脉瘤性蛛网膜下腔出血分级',
  category: '认知与老年',
  rater: 'clinician',
  licenseTier: 'free',
  description: '按就诊时 GCS 与有无运动功能障碍分为 Ⅰ-Ⅴ 级：Ⅰ 级 GCS 15；Ⅱ 级 GCS 13-14 无运动缺损；Ⅲ 级 GCS 13-14 伴运动缺损；Ⅳ 级 GCS 7-12；Ⅴ 级 GCS 3-6。填 GCS 与运动缺损两项即可，级别由公式给出，避免自报级别与 GCS 矛盾。',
  instructions: 'GCS 按睁眼、语言、运动三部分求和后填入；运动缺损指检查确定的肌力下降，而非因疼痛或制动不愿意活动。',
  source: 'Teasdale GM, et al. Subarachnoid hemorrhage grading scale derived from the Canadian Neurological Alliance. J Neurosurg. 1988;68(1):3-5. 分级表核对自 Radiopaedia 与 Leicestershire 急症医学教育页面。',
  license: '公开发表的临床分级，可免费使用，请引用原始文献。',
  tags: ['蛛网膜下腔出血', 'GCS', '分级', '评估者填写'],
  usage: {
    population: '确诊动脉瘤性蛛网膜下腔出血的成人',
    mode: '他评',
    notes: '与 Hunt-Hess 相比更依赖客观 GCS，但同样不能单独决定治疗；GCS 受镇静、插管影响时须注明。',
  },
  items: numbered([
    q('gcs', '就诊时 GCS 总分', 'number', null, { unit: '分', min: 3, max: 15, integer: true,
      hint: '睁眼(1-4) + 语言(1-5) + 运动(1-6)' }),
    q('motor', '是否存在运动功能障碍（肌力下降）', 'radio', [
      { label: '有', value: 1 },
      { label: '无', value: 0 },
    ]),
  ]),
  dimensions: [],
  scoring: {
    method: 'formula',
    formula: 'wfns-sah',
    totalRange: [1, 5],
    cutoffs: [
      { max: 1, label: 'WFNS Ⅰ 级', level: 'normal', advice: 'GCS 15 且无运动缺损。' },
      { max: 2, label: 'WFNS Ⅱ 级', level: 'mild', advice: 'GCS 13-14，无运动缺损。' },
      { max: 3, label: 'WFNS Ⅲ 级', level: 'moderate', advice: 'GCS 13-14，伴运动缺损，需监测意识与神经体征变化。' },
      { max: 4, label: 'WFNS Ⅳ 级', level: 'severe', advice: 'GCS 7-12，建议重症监护与多学科决策。' },
      { max: 5, label: 'WFNS Ⅴ 级', level: 'severe', advice: 'GCS 3-6，属重型 SAH，治疗决策须综合影像、年龄与家属意愿。' },
    ],
  },
};

/* ---------------- 改良 Hoehn-Yahr 帕金森病分期 ---------------- */
const HOEHN_YAHR = {
  code: 'hoehn-yahr',
  title: '改良 Hoehn-Yahr 帕金森病分期',
  category: '认知与老年',
  rater: 'clinician',
  licenseTier: 'free',
  description: '描述帕金森病运动症状进展的 0-5 期（含 1.5 与 2.5 两个中间期）。分期只反映运动功能，不含非运动症状，也不能替代 UPDRS 等完整评估。',
  instructions: '由医师按查体与日常功能确定分期；平衡障碍以拉试验等检查结果为准，不按家属主观描述。',
  source: 'Hoehn MM, Yahr MD. Parkinsonism: onset, progression and mortality. Neurology. 1967;17:517-526. 改良分期定义核对自美国退伍军人事务部帕金森病 PD-TEC 教育资料。',
  license: '公开发表的经典分期，可免费使用，请引用原始文献。',
  tags: ['帕金森病', '分期', '运动功能', '评估者填写'],
  usage: {
    population: '确诊帕金森病的患者',
    mode: '他评',
    notes: '同一分期内功能差异很大，且治疗后的波动会使分期不稳定；用于研究时需说明采用原始版还是改良版。',
  },
  items: numbered([
    q('hy', '改良 Hoehn-Yahr 分期', 'radio', [
      { label: '0 无疾病体征', value: 0 },
      { label: '1 单侧受累', value: 1 },
      { label: '1.5 单侧加中轴（躯干）受累', value: 1.5 },
      { label: '2 双侧受累，平衡未受损', value: 2 },
      { label: '2.5 轻度双侧受累，拉试验可自行恢复平衡', value: 2.5 },
      { label: '3 轻中度双侧受累，有一定姿势不稳，生活仍可自理', value: 3 },
      { label: '4 重残，但仍可自行站立或行走（无需帮助）', value: 4 },
      { label: '5 卧床或轮椅依赖（除非他人帮助）', value: 5 },
    ]),
  ]),
  dimensions: [dim('stage', 'Hoehn-Yahr 分期', ['hy'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 0, label: '0 期（无疾病体征）', level: 'normal', advice: '未见运动症状体征。' },
      { max: 1, label: '1 期（单侧受累）', level: 'mild', advice: '单侧症状，功能影响有限。' },
      { max: 1.5, label: '1.5 期（单侧加中轴）', level: 'mild', advice: '开始出现中轴受累，注意姿势与步态随访。' },
      { max: 2, label: '2 期（双侧，平衡未损）', level: 'moderate', advice: '双侧症状，评估跌倒风险与用药方案。' },
      { max: 2.5, label: '2.5 期（轻度双侧，拉试验可恢复）', level: 'moderate', advice: '平衡开始受影响但可代偿，建议康复与跌倒预防。' },
      { max: 3, label: '3 期（姿势不稳，仍自理）', level: 'moderate', advice: '疾病进展的中点，需强化平衡训练并重新评估用药方案。' },
      { max: 4, label: '4 期（重残但能自行站立行走）', level: 'severe', advice: '日常活动明显受限，需照护支持与并发症管理。' },
      { max: 5, label: '5 期（卧床或轮椅依赖）', level: 'severe', advice: '需全面照护，重点预防压疮、吸入性肺炎与营养不良。' },
    ],
  },
};

/* ---------------- Kellgren-Lawrence 骨关节炎 X 线分级 ---------------- */
const KELLGREN = {
  code: 'kellgren-lawrence',
  title: 'Kellgren-Lawrence 骨关节炎 X 线分级',
  category: '康复与疼痛',
  rater: 'clinician',
  licenseTier: 'free',
  description: '按 X 线征象分 0-Ⅳ 级的放射学分级，常用于膝/髋骨关节炎的影像分层与研究入组。分级只看影像，不反映症状严重程度；2 级是否达到「 definite OA」在不同研究定义不同，报告时须写明所用阈值。',
  instructions: '由医师按标准体位影像判定；1 级为「可疑」，通常不作为确定性骨关节炎入组标准。',
  source: 'Kellgren JH, Lawrence JS. Radiological assessment of osteo-arthrosis. Ann Rheum Dis. 1957;16(4):494-502. 各级定义核对自 Radiopaedia 与 Kohn 2016（AJSM）综述。',
  license: '公开发表的放射学分级，可免费使用，请引用原始文献。',
  tags: ['骨关节炎', 'X 线', '放射学分级', '评估者填写'],
  usage: {
    population: '膝、髋等关节骨关节炎的影像学评估',
    mode: '他评',
    notes: '影像与症状可分离：分级高不等于疼痛重，分级低也不能排除早期中晚期病变，需结合临床。',
  },
  items: numbered([
    q('kl', 'Kellgren-Lawrence 分级', 'radio', [
      { label: '0 无骨关节炎的 X 线改变', value: 0 },
      { label: 'Ⅰ 可疑关节间隙变窄，可能有骨赘形成', value: 1 },
      { label: 'Ⅱ 可见骨赘，关节间隙可能变窄（最小组织改变）', value: 2 },
      { label: 'Ⅲ 多发骨赘，关节间隙明确变窄，部分硬化，骨端可能变形', value: 3 },
      { label: 'Ⅳ 大型骨赘，关节间隙明显变窄，严重硬化，骨端明确变形', value: 4 },
    ]),
  ]),
  dimensions: [dim('grade', 'Kellgren-Lawrence 级别', ['kl'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 4],
    cutoffs: [
      { max: 0, label: '0 级（无异常）', level: 'normal', advice: '未见骨关节炎的放射学征象。' },
      { max: 1, label: 'Ⅰ 级（可疑）', level: 'mild', advice: '征象可疑，建议结合症状与随访影像，不宜据此确诊。' },
      { max: 2, label: 'Ⅱ 级（轻微）', level: 'moderate', advice: '已可见骨赘，属多数研究认定的最小确定性改变，需按入选标准说明。' },
      { max: 3, label: 'Ⅲ 级（中度）', level: 'severe', advice: '关节间隙明确变窄，建议骨科评估与康复管理。' },
      { max: 4, label: 'Ⅳ 级（重度）', level: 'severe', advice: '重度放射学改变，需结合症状评估手术（如关节置换）指征。' },
    ],
  },
};

module.exports = [SPPB, NDI, NIHSS, HACHINSKI, ODI, WOMAC, QUICKDASH, BERG, HUNT_HESS, WFNS, HOEHN_YAHR, KELLGREN];
