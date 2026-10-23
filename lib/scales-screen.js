'use strict';
/**
 * 量表库 · 筛查与分级工具（睡眠呼吸、营养、麻醉分级、肺栓塞排除、儿童疼痛行为）
 * 条目的分档阈值均按公开发表的原始计分表逐条核对，来源见各量表 source 字段。
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/** 是 / 否（是=1，否=0），带题号 */
function yn(id, text, hint) {
  return q(id, text, 'radio', [
    { label: '是', value: 1 },
    { label: '否', value: 0 },
  ], hint ? { hint: hint } : null);
}

/* ---------------- STOP-BANG 阻塞性睡眠呼吸暂停筛查 ---------------- */
const STOPBANG = {
  code: 'stop-bang',
  title: 'STOP-BANG 阻塞性睡眠呼吸暂停筛查',
  category: '睡眠',
  licenseTier: 'registration',
  description: '8 项「是/否」问题，总分 0-8：0-2 低危、3-4 中危、5-8 高危。≥3 分常作为筛查阳性阈值，敏感度较高；不能仅凭分数确诊或排除 OSA。',
  instructions: '请按事实逐项回答；颈围与体质指数按「是否超过阈值」回答即可，BMI 与颈围需实测。术前患者请结合麻醉科评估流程。',
  source: 'Chung F, et al. STOP-BANG Questionnaire: A Simple Screening Tool for Detecting Potential Adult Sleep Apnea Patients. Sleep Med Rev. 2008;12(4):271-283.',
  license: 'STOP-BANG 由作者团队免费提供用于临床与科研，使用前请核对官网（stopbang.ca）的获取与使用条件并引用原文。',
  tags: ['睡眠呼吸暂停', 'OSA', '打鼾', '术前筛查'],
  usage: {
    population: '疑似阻塞性睡眠呼吸暂停的成人；不用于中枢性睡眠呼吸暂停的筛查',
    mode: '自评/他评结合',
    notes: '0-2/3-4/5-8 为一般人群分层；术前人群判读需结合合并症与麻醉评估。高分不等于确诊，仍需睡眠监测。',
  },
  items: numbered([
    q('s1', '您的打鼾声音大吗？（足以隔着关闭的门被听到）', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }]),
    q('s2', '您白天常感到疲倦、乏力或嗜睡吗？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }]),
    q('s3', '有人观察到您睡眠中出现呼吸停止吗？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }]),
    q('s4', '您有高血压，或正在接受高血压治疗吗？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }]),
    q('s5', '您的体质指数（BMI）是否超过 35 kg/m²？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }], { hint: 'BMI = 体重(kg) ÷ 身高(m)²，需实测身高体重' }),
    q('s6', '您的年龄是否大于 50 岁？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }]),
    q('s7', '您的颈围是否超过阈值？（男性 > 40 cm，女性 > 38 cm）', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }], { hint: '甲状软骨水平测量颈部周径' }),
    q('s8', '您的性别是否为男性？', 'radio', [
      { label: '是', value: 1 }, { label: '否', value: 0 }]),
  ]),
  dimensions: [dim('total', 'STOP-BANG 总分', K.ids('s', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 8],
    cutoffs: [
      { max: 2, label: 'OSA 低危', level: 'normal', advice: '0-2 分为低危；若仍有日间嗜睡、打鼾或高血压等症状，可结合临床进一步评估。' },
      { max: 4, label: 'OSA 中危', level: 'moderate', advice: '3-4 分为中危，≥3 分常作筛查阳性，建议睡眠专科评估或家庭睡眠呼吸监测。' },
      { max: 8, label: 'OSA 高危', level: 'severe', advice: '5-8 分为高危，建议尽快转诊睡眠专科完成诊断性检查；术前患者需提前告知麻醉团队。' },
    ],
  },
};

/* ---------------- MST 营养不良筛查工具 ---------------- */
const MST = {
  code: 'mst',
  title: 'MST 营养不良筛查工具',
  category: '营养评估',
  rater: 'clinician',
  licenseTier: 'free',
  description: '两个问题（非故意体重下降 + 因食欲减退进食减少），总分 0-5：0-1 无营养风险，≥2 存在营养风险，需在 24-72 小时内完成营养评估与干预。',
  instructions: '「近期」按原表表述，不额外限定时间窗；住院超过 7 天者按流程每周复筛。体重下降需为非故意（未主动减重）。',
  source: 'Morrison RJ, et al. Nutrition screening and the Malnutrition Screening Tool in hospitals. J Hum Nutr Diet. 1999;12(2):101-107.',
  license: '公开发表的筛查工具，医疗机构与科研可免费使用，请引用原始文献并注明版本。',
  tags: ['营养筛查', '体重下降', '食欲', '住院'],
  items: numbered([
    q('m1', '您近期是否在没有主动减重的情况下出现体重下降？', 'radio', [
      { label: '没有', value: 0 },
      { label: '有，下降约 1-6 kg', value: 1 },
      { label: '有，下降约 6-10 kg', value: 2 },
      { label: '有，下降约 11-15 kg', value: 3 },
      { label: '有，下降超过 15 kg', value: 4 },
      { label: '不确定', value: 2 },
    ], { hint: '按非故意体重下降幅度选择，幅度分即为本项得分，不再叠加' }),
    q('m2', '您是否因食欲下降而进食减少？', 'radio', [
      { label: '否', value: 0 },
      { label: '是', value: 1 },
    ]),
  ]),
  dimensions: [dim('total', 'MST 总分', ['m1', 'm2'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 5],
    cutoffs: [
      { max: 1, label: '无营养风险', level: 'normal', advice: '按常规流程随访；住院超过 7 天时建议每周复筛。' },
      { max: 5, label: '存在营养风险', level: 'severe', advice: '≥2 分为营养风险阳性，应尽快实施营养干预，并在 24-72 小时内完成营养科评估。' },
    ],
  },
};

/* ---------------- ASA 体格状况分级 ---------------- */
const ASA = {
  code: 'asa-ps',
  title: 'ASA 体格状况分级',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'registration',
  description: '美国麻醉医师协会 Ⅰ-Ⅵ 级术前合并症分级，用于描述与沟通麻醉前的健康状况；分级本身不预测围术期风险，须结合手术类型、衰弱与体能状态。',
  instructions: '由麻醉医师在麻醉当日评估后确定最终分级；急诊手术附加「E」。请选择最贴近患者整体状况的一级，不叠加计分。',
  source: 'American Society of Anesthesiologists. ASA Physical Status Classification System. 2014 年通过、2020-12-13 修订。',
  license: '版权归 ASA，官方文件免费下载使用；引用时请核对 asahq.org 的使用条款，勿改动分级定义。',
  tags: ['麻醉', '术前评估', '分级', '评估者填写'],
  usage: {
    population: '接受麻醉与手术的患者（成人为主，儿科与产科另有官方示例）',
    mode: '他评',
    notes: 'ASA 分级为合并症描述，不是手术风险评分；同级患者的结局差异很大，不能单独用于风险沟通或研究分层。',
  },
  items: numbered([
    q('asa', 'ASA 体格状况分级', 'radio', [
      { label: 'Ⅰ 正常健康患者（健康、不吸烟、无或极少饮酒）', value: 1 },
      { label: 'Ⅱ 轻度全身性疾病（仅有轻度疾病、无实质功能受限：如当前吸烟、社交饮酒、妊娠、肥胖 30≤BMI<40、控制良好的糖尿病或高血压、轻度肺疾病）', value: 2 },
      { label: 'Ⅲ 严重全身性疾病（如控制不佳的糖尿病或高血压、COPD、BMI≥40、活动性肝炎、酒精依赖或滥用、起搏器植入、射血分数中度降低、规律透析的终末期肾病、3 个月前的梗死/卒中/TIA/冠脉支架史）', value: 3 },
      { label: 'Ⅳ 严重全身性疾病且构成持续生命威胁（如 3 个月内的梗死/卒中/TIA/冠脉支架、持续心肌缺血或严重瓣膜病变、射血分数严重降低、休克、脓毒症、DIC、ARDS、未规律透析的终末期肾病）', value: 4 },
      { label: 'Ⅴ 濒死患者，不实施手术预计无法存活（如破裂的胸/腹主动脉瘤、严重创伤、颅内出血伴占位效应、合并严重心脏病或多器官功能障碍的缺血性肠病）', value: 5 },
      { label: 'Ⅵ 已宣布脑死亡、正在获取器官的供体', value: 6 },
    ], { hint: '按 ASA 官方定义选择，示例仅作参考；最终分级由麻醉医师当日评定' }),
    q('asa_e', '本次手术是否按急诊实施（E）？', 'radio', [
      { label: '是（急诊）', value: 1 },
      { label: '否（择期）', value: 0 },
    ], { exclude: true, hint: '急诊按 ASA 官方规则在分级后加注「E」，不计入分级分值' }),
  ]),
  dimensions: [dim('grade', 'ASA 分级', ['asa'])],
  scoring: {
    method: 'sum',
    totalRange: [1, 6],
    cutoffs: [
      { max: 1, label: 'ASA Ⅰ 级', level: 'normal', advice: '正常健康患者。' },
      { max: 2, label: 'ASA Ⅱ 级', level: 'mild', advice: '轻度全身性疾病，无实质功能受限。' },
      { max: 3, label: 'ASA Ⅲ 级', level: 'moderate', advice: '严重全身性疾病，需按合并症优化围术期管理。' },
      { max: 4, label: 'ASA Ⅳ 级', level: 'severe', advice: '严重全身性疾病并构成持续生命威胁，需多学科评估。' },
      { max: 5, label: 'ASA Ⅴ 级', level: 'severe', advice: '濒死患者，不手术预计无法存活。' },
      { max: 6, label: 'ASA Ⅵ 级', level: 'severe', advice: '已宣布脑死亡的器官获取供体。' },
    ],
  },
};

/* ---------------- PERC 肺栓塞排除规则 ---------------- */
const PERC = {
  code: 'perc',
  title: 'PERC 肺栓塞排除规则',
  category: '临床风险评分',
  rater: 'clinician',
  licenseTier: 'free',
  description: '8 项临床变量。在验前概率低（经验判断或 Wells 等评估为低概率）的成人中，8 项全部阴性可不进一步检查即排除肺栓塞；任一项阳性需继续 D-二聚体或影像评估。',
  instructions: '逐项按客观资料回答，血氧饱和度为吸空气时的实测值；本规则不用于妊娠、正在抗凝或验前概率已偏高的患者。',
  source: 'Kline JA, et al. A clinical rule to safely exclude pulmonary embolism without diagnostic testing. Acad Emerg Med. 2008;15(8):724-731.',
  license: '公开发表的临床规则，可免费使用，请引用原始文献。',
  tags: ['肺栓塞', '急诊', '排除规则', '评估者填写'],
  usage: {
    population: '急诊疑似肺栓塞的成人，用于低验前概率人群的排除',
    mode: '他评',
    notes: 'PERC 阴性只在低验前概率前提下有意义；不适用人群包括妊娠、正在使用雌激素以外的抗凝治疗、D-二聚体已开具等机构流程差异，请按本院方案执行。',
  },
  items: numbered([
    yn('p1', '年龄 ≥ 50 岁'),
    yn('p2', '心率 ≥ 100 次/分'),
    yn('p3', '吸空气时血氧饱和度 < 95%'),
    yn('p4', '单侧下肢肿胀'),
    yn('p5', '咯血'),
    yn('p6', '近 4 周内做过手术或受过创伤', '指需要住院处理或术后明显制动的情况'),
    yn('p7', '既往深静脉血栓或肺栓塞史'),
    yn('p8', '正在使用含雌激素的避孕药或激素治疗'),
  ]),
  dimensions: [dim('total', '阳性项目数', K.ids('p', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 8],
    cutoffs: [
      { max: 0, label: 'PERC 全阴性', level: 'normal', advice: '在低验前概率成人中，8 项全阴性可考虑不再做 D-二聚体与影像检查；结论仍须结合临床判断与本院流程。' },
      { max: 8, label: 'PERC 阳性', level: 'severe', advice: '至少一项阳性，需按验前概率分层继续 D-二聚体或影像学评估。' },
    ],
  },
};

/* ---------------- FLACC 行为疼痛评估量表 ---------------- */
const FLACC = {
  code: 'flacc',
  title: 'FLACC 行为疼痛评估量表',
  category: '症状评估',
  rater: 'clinician',
  licenseTier: 'registration',
  description: '面部、下肢、活动、哭闹、可安慰性 5 项各 0-2 分，总分 0-10：0 放松舒适、1-3 轻度不适、4-6 中度疼痛、7-10 重度疼痛或不适。适用于 2 个月至 7 岁儿童及无法自我报告疼痛者。',
  instructions: '清醒者观察 1-5 分钟以上，必要时暴露下肢与躯干以评估体位与肌张力；睡眠者观察 5 分钟以上。能与患儿交流时应结合其主诉。',
  source: 'Merkel SI, et al. The FLACC: a behavioral scale for scoring postoperative pain in young children. Pediatr Nurs. 1997;23(3):293-297.',
  license: '由密歇根 C. S. Mott 儿童医院团队研制，临床与科研广泛免费使用；印刷分发或修改条目请核对研制方许可。本表条目按公开发表的计分表转写。',
  tags: ['儿童疼痛', '术后疼痛', '行为观察', '评估者填写'],
  usage: {
    population: '无法自我报告疼痛的婴幼儿、发育障碍或意识障碍患者',
    mode: '他评',
    notes: '行为评分不能替代可获取的自我报告；镇静、肌松或神经肌肉疾病会压低行为表现，此时分数会低估疼痛。',
  },
  items: numbered([
    q('fl_face', '面部', 'radio', [
      { label: '0 无特别表情或微笑', value: 0 },
      { label: '1 偶尔皱眉或愁眉苦脸；退缩、不感兴趣', value: 1 },
      { label: '2 频繁或持续皱眉、咬紧牙关、下颌颤抖', value: 2 },
    ]),
    q('fl_legs', '下肢', 'radio', [
      { label: '0 正常体位或放松', value: 0 },
      { label: '1 不安、躁动、紧张', value: 1 },
      { label: '2 踢腿或屈腿抱膝', value: 2 },
    ]),
    q('fl_activity', '活动', 'radio', [
      { label: '0 安静平卧，体位正常，活动自如', value: 0 },
      { label: '1 扭动、来回翻身、紧张', value: 1 },
      { label: '2 拱背、僵硬或抽动', value: 2 },
    ]),
    q('fl_cry', '哭闹', 'radio', [
      { label: '0 无哭闹（清醒或睡眠中）', value: 0 },
      { label: '1 呻吟或呜咽，偶尔抱怨', value: 1 },
      { label: '2 持续哭闹、尖叫或抽泣，频繁抱怨', value: 2 },
    ]),
    q('fl_conso', '可安慰性', 'radio', [
      { label: '0 满足、放松', value: 0 },
      { label: '1 偶尔抚摸、拥抱或言语安慰即可安抚，注意力可被转移', value: 1 },
      { label: '2 难以安慰或无法安抚', value: 2 },
    ]),
  ]),
  dimensions: [dim('total', 'FLACC 总分', ['fl_face', 'fl_legs', 'fl_activity', 'fl_cry', 'fl_conso'])],
  scoring: {
    method: 'sum',
    totalRange: [0, 10],
    cutoffs: [
      { max: 0, label: '放松舒适', level: 'normal', advice: '未见疼痛行为表现，按原方案观察。' },
      { max: 3, label: '轻度不适', level: 'mild', advice: '建议调整体位、安抚与环境的措施，并按镇痛方案评估是否需要用药。' },
      { max: 6, label: '中度疼痛', level: 'moderate', advice: '建议按医嘱给予镇痛处理，并在干预后复评。' },
      { max: 10, label: '重度疼痛或不适', level: 'severe', advice: '需立即评估疼痛原因并请医护处理，干预后复评。' },
    ],
  },
};

module.exports = [STOPBANG, MST, ASA, PERC, FLACC];
