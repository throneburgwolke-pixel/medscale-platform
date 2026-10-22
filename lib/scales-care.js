'use strict';
/**
 * 量表库 · 护理风险评估 / 老年综合评估 / 功能与照料负担
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* ---------------- Morse 跌倒风险评估 ---------------- */
const MORSE = {
  code: 'morse-fall',
  licenseTier: 'free',
  title: 'Morse 跌倒风险评估量表',
  category: '护理评估',
  description: '住院患者跌倒风险的标准评估工具，6 个条目，总分 0-125 分：<25 低风险、25-44 中风险、≥45 高风险。',
  instructions: '请由医护人员根据患者实际情况逐项评估。',
  source: 'Morse JM, Morse RM, Tylko SJ. Development of a scale to identify the fall-prone patient. Can J Aging. 1989;8(4):366-377.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['跌倒风险', '护理评估', '6项', '住院患者'],
  items: numbered([
    q('morse1', '近 3 个月内有无跌倒史', 'radio', [
      { label: '无', value: 0 }, { label: '有', value: 25 },
    ], { hint: '如有跌倒史，请继续选择"有"，同时关注是否因跌倒受伤。' }),
    q('morse2', '是否同时存在 2 个以上医学诊断', 'radio', [
      { label: '无', value: 0 }, { label: '有', value: 15 },
    ]),
    q('morse3', '行走辅助用具的使用情况', 'radio', [
      { label: '无 / 卧床休息 / 护士帮助', value: 0 },
      { label: '拐杖 / 手杖 / 助行器', value: 15 },
      { label: '扶家具行走', value: 30 },
    ]),
    q('morse4', '是否静脉输液或使用肝素锁', 'radio', [
      { label: '无', value: 0 }, { label: '有', value: 20 },
    ]),
    q('morse5', '步态', 'radio', [
      { label: '正常 / 卧床 / 轮椅', value: 0 },
      { label: '虚弱（步态软弱、步幅短、拖步）', value: 10 },
      { label: '步态不稳（站立或行走时摇晃、需扶持）', value: 20 },
    ]),
    q('morse6', '精神状态（对自身能力的认知）', 'radio', [
      { label: '认知自身能力正常', value: 0 },
      { label: '认知自身能力障碍（高估或遗忘自身限制）', value: 15 },
    ]),
  ]),
  dimensions: [dim('total', 'Morse 总分', K.ids('morse', 6))],
  scoring: {
    method: 'sum',
    totalRange: [0, 125],
    cutoffs: [
      { max: 24, label: '低风险', level: 'normal', advice: '采取基础预防措施，常规健康教育。' },
      { max: 44, label: '中风险', level: 'moderate', advice: '落实标准防跌倒措施：床栏、呼叫器可用、加强巡视、健康教育。' },
      { max: 125, label: '高风险', level: 'severe', advice: '≥45 分属高风险：床头悬挂警示标识、专人陪护、加床栏、地面防滑、夜间加强巡视，并记录交班。' },
    ],
  },
};

/* ---------------- Braden 压疮风险 ---------------- */
const BRADEN = {
  code: 'braden',
  licenseTier: 'free',
  title: 'Braden 压疮风险评估量表',
  category: '护理评估',
  description: '评估压力性损伤（压疮）风险的标准工具，6 个维度，总分 6-23 分：≤9 极高危、10-12 高危、13-14 中度危险、15-18 轻度危险、≥19 无风险。',
  instructions: '请由医护人员根据患者实际情况逐项评估。',
  source: 'Bergstrom N, Braden BJ, Laguzza A, Holman V. The Braden Scale for predicting pressure sore risk. Nurs Res. 1987;36(4):205-210.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['压疮', '压力性损伤', '护理评估', '6个维度'],
  items: numbered([
    q('bra1', '感觉（对压力相关不适的感受能力）', 'radio', [
      { label: '1 完全受限：因意识水平下降或镇静，对疼痛刺激无反应', value: 1 },
      { label: '2 非常受限：仅对疼痛刺激有反应，无法表达不适（除呻吟、躁动）', value: 2 },
      { label: '3 轻度受限：对指令有反应，但表达能力受限或感觉部分丧失', value: 3 },
      { label: '4 未受损：对疼痛和不适感受正常，能表达', value: 4 },
    ], { dimension: 'sensory' }),
    q('bra2', '潮湿（皮肤暴露于潮湿的程度）', 'radio', [
      { label: '1 持续潮湿：每次翻身/移动时皮肤几乎总是潮湿', value: 1 },
      { label: '2 经常潮湿：皮肤经常潮湿，需每班更换床单', value: 2 },
      { label: '3 偶尔潮湿：皮肤偶尔潮湿，需每天额外更换床单约1次', value: 3 },
      { label: '4 很少潮湿：皮肤通常是干的，按常规更换床单', value: 4 },
    ], { dimension: 'moisture' }),
    q('bra3', '活动（身体活动的程度）', 'radio', [
      { label: '1 卧床：卧床不起，不能自行下床', value: 1 },
      { label: '2 坐椅：行走能力严重受限或不能行走，需协助才能坐椅', value: 2 },
      { label: '3 偶尔行走：白天可短距离行走，大部分时间卧床或坐椅', value: 3 },
      { label: '4 经常行走：每天至少 2 次下床行走，清醒时经常活动', value: 4 },
    ], { dimension: 'activity' }),
    q('bra4', '移动（改变和控制体位的能力）', 'radio', [
      { label: '1 完全受限：无自主改变体位的能力', value: 1 },
      { label: '2 严重受限：偶尔能轻微改变体位，但不能自行完成有效翻身', value: 2 },
      { label: '3 轻度受限：能经常自主改变体位，但幅度较小', value: 3 },
      { label: '4 不受限：能自主、经常地完成大幅度体位改变', value: 4 },
    ], { dimension: 'mobility' }),
    q('bra5', '营养（日常营养摄入情况）', 'radio', [
      { label: '1 非常差：从未吃完一餐，很少摄入蛋白质，需静脉输液，进食量低于需要量的 1/3', value: 1 },
      { label: '2 可能不足：很少吃完一餐，蛋白质摄入不足，进食量为需要量的 1/2', value: 2 },
      { label: '3 充足：大部分时间能吃完一餐，每天摄入足量蛋白质，可自主进食或鼻饲', value: 3 },
      { label: '4 非常好：每餐均能吃完，蛋白质摄入充足，偶尔加餐', value: 4 },
    ], { dimension: 'nutrition' }),
    q('bra6', '摩擦力与剪切力', 'radio', [
      { label: '1 有问题：需要中度至大量协助移动，移动时皮肤与床单摩擦明显，体位常下滑', value: 1 },
      { label: '2 潜在问题：移动时较虚弱，需一些协助，皮肤可能与床单摩擦', value: 2 },
      { label: '3 无明显问题：能独立在床上和椅上移动，肌肉力量足够，可保持体位', value: 3 },
    ], { dimension: 'friction' }),
  ]),
  dimensions: [
    dim('sensory', '感觉', ['bra1']), dim('moisture', '潮湿', ['bra2']),
    dim('activity', '活动', ['bra3']), dim('mobility', '移动', ['bra4']),
    dim('nutrition', '营养', ['bra5']), dim('friction', '摩擦力与剪切力', ['bra6']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [6, 23],
    cutoffs: [
      { max: 9, label: '极高危', level: 'severe', advice: '极高危：立即使用减压床垫、至少每 1-2 小时翻身、保持皮肤清洁干燥，并逐级上报。' },
      { max: 12, label: '高危', level: 'severe', advice: '高危：使用减压装置、每 2 小时翻身、加强营养支持与皮肤护理。' },
      { max: 14, label: '中度危险', level: 'moderate', advice: '中度危险：每 2-4 小时翻身，使用减压垫，保持皮肤干燥。' },
      { max: 18, label: '轻度危险', level: 'mild', advice: '轻度危险：加强巡视与健康教育，规律更换体位。' },
      { max: 23, label: '无风险', level: 'normal', advice: '按常规护理，定期复评。' },
    ],
  },
};

/* ---------------- MNA-SF 微型营养评定简版 ---------------- */
const MNASF = {
  code: 'mna-sf',
  licenseTier: 'registration',
  title: 'MNA-SF 微型营养评定简版',
  category: '营养评估',
  description: '老年人营养状况筛查工具，6 个条目，总分 0-14 分：12-14 营养正常、8-11 有营养不良风险、0-7 营养不良。',
  instructions: '请根据患者近 3 个月的情况选择最符合的一项。',
  source: 'Rubenstein LZ, Harker JO, Salva A, et al. Screening for undernutrition in geriatric practice: the MNA-SF. J Gerontol A Biol Sci Med Sci. 2001;56(6):M366-372.',
  license: 'MNA 对非商业用途免费提供，需注明来源。',
  tags: ['营养', '老年', '筛查', '6题'],
  items: numbered([
    q('mna1', '近 3 个月来，食欲或进食情况是否有变化？', 'radio', [
      { label: '0 食欲严重减少', value: 0 }, { label: '1 食欲中度减少', value: 1 }, { label: '2 食欲无变化', value: 2 },
    ]),
    q('mna2', '近 3 个月来，体重下降情况', 'radio', [
      { label: '0 体重下降超过 3 kg', value: 0 }, { label: '1 不知道', value: 1 },
      { label: '2 体重下降 1-3 kg', value: 2 }, { label: '3 体重无下降', value: 3 },
    ]),
    q('mna3', '活动能力', 'radio', [
      { label: '0 卧床或坐轮椅', value: 0 }, { label: '1 可以下床活动但不能外出', value: 1 }, { label: '2 可以外出活动', value: 2 },
    ]),
    q('mna4', '近 3 个月内是否有急性疾病或心理应激', 'radio', [
      { label: '0 有', value: 0 }, { label: '2 无', value: 2 },
    ]),
    q('mna5', '神经心理问题', 'radio', [
      { label: '0 严重痴呆或抑郁', value: 0 }, { label: '1 轻度痴呆', value: 1 }, { label: '2 无神经心理问题', value: 2 },
    ]),
    q('mna6', '体质指数（BMI，kg/m²）；如无法测量 BMI，请按小腿围选择', 'radio', [
      { label: '0 BMI < 19（或小腿围 < 31 cm）', value: 0 },
      { label: '1 BMI 19 - 21', value: 1 },
      { label: '2 BMI 21 - 23', value: 2 },
      { label: '3 BMI ≥ 23（或小腿围 ≥ 31 cm）', value: 3 },
    ]),
  ]),
  dimensions: [dim('total', 'MNA-SF 总分', K.ids('mna', 6))],
  scoring: {
    method: 'sum',
    totalRange: [0, 14],
    cutoffs: [
      { max: 7, label: '营养不良', level: 'severe', advice: '提示营养不良：建议营养科会诊，制定营养支持方案并监测体重与摄入量。' },
      { max: 11, label: '有营养不良风险', level: 'moderate', advice: '存在营养不良风险：建议进一步营养评估（如 MNA 完整版、白蛋白等）并加强饮食指导。' },
      { max: 14, label: '营养状况正常', level: 'normal', advice: '营养状况正常，定期复评。' },
    ],
  },
};

/* ---------------- NRS-2002 营养风险筛查 ---------------- */
const NRS2002 = {
  code: 'nrs-2002',
  licenseTier: 'free',
  title: 'NRS-2002 营养风险筛查',
  category: '营养评估',
  description: '住院患者营养风险筛查的标准工具（疾病严重程度 + 营养状况 + 年龄）。总分 ≥3 分提示存在营养风险，应制定营养支持计划。',
  instructions: '请由医护人员根据患者入院时的实际情况评估。',
  source: 'Kondrup J, Rasmussen HH, Hamberg O, et al. Nutritional risk screening (NRS 2002): a new method based on an analysis of controlled clinical trials. Clin Nutr. 2003;22(3):321-336.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['营养风险', '住院患者', '筛查', '3个维度'],
  items: numbered([
    q('nrs1', '疾病严重程度（营养需要量的增加程度）', 'radio', [
      { label: '0 分 正常营养需要量', value: 0 },
      { label: '1 分 慢性疾病患者因出现并发症而住院；患者虚弱但不需要卧床；蛋白质需要量略增加', value: 1 },
      { label: '2 分 患者需要卧床，如腹部大手术后、脑卒中、重症肺炎、血液系统恶性肿瘤', value: 2 },
      { label: '3 分 患者在重症监护室中，如颅脑损伤、骨髓移植、重症监护患者（APACHE>10）', value: 3 },
    ], { dimension: 'disease' }),
    q('nrs2', '营养状况受损程度', 'radio', [
      { label: '0 分 营养状况正常', value: 0 },
      { label: '1 分 3 个月内体重下降 >5%，或近 1 周摄食量为正常需要量的 50%-75%', value: 1 },
      { label: '2 分 2 个月内体重下降 >5%，或 BMI 18.5-20.5，或近 1 周摄食量为需要量的 25%-50%', value: 2 },
      { label: '3 分 1 个月内体重下降 >5%（3 个月内下降 >15%），或 BMI <18.5，或近 1 周摄食量为需要量的 0-25%', value: 3 },
    ], { dimension: 'nutrition' }),
    q('nrs3', '年龄', 'radio', [
      { label: '0 分 小于 70 岁', value: 0 },
      { label: '1 分 70 岁及以上', value: 1 },
    ], { dimension: 'age' }),
  ]),
  dimensions: [
    dim('disease', '疾病严重程度', ['nrs1']),
    dim('nutrition', '营养状况', ['nrs2']),
    dim('age', '年龄', ['nrs3']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [0, 7],
    cutoffs: [
      { max: 2, label: '暂无营养风险', level: 'normal', advice: '总分 <3 分：暂无营养风险，建议每周复查一次；如拟行大手术，建议术前评估。' },
      { max: 7, label: '存在营养风险', level: 'severe', advice: '总分 ≥3 分：存在营养风险，建议营养科会诊并制定营养支持计划（按 25-30 kcal/kg/d 估算需要量）。' },
    ],
  },
};

/* ---------------- GCS 格拉斯哥昏迷评分 ---------------- */
const GCS = {
  code: 'gcs',
  licenseTier: 'free',
  title: 'GCS 格拉斯哥昏迷评分',
  category: '护理评估',
  description: '评估意识水平的国际标准工具，包括睁眼（1-4）、语言（1-5）、运动（1-6）三项，总分 3-15 分：13-15 轻度、9-12 中度、≤8 重度（昏迷，需考虑气道保护）。',
  instructions: '请由医护人员根据患者最佳反应逐项评分。',
  source: 'Teasdale G, Jennett B. Assessment of coma and impaired consciousness: a practical scale. Lancet. 1974;2(7872):81-84.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['意识状态', '昏迷', '急诊', '神经科'],
  items: numbered([
    q('gcs1', '睁眼反应（E）', 'radio', [
      { label: '1 无睁眼', value: 1 }, { label: '2 疼痛刺激时睁眼', value: 2 },
      { label: '3 呼唤时睁眼', value: 3 }, { label: '4 自动睁眼', value: 4 },
    ], { dimension: 'eye' }),
    q('gcs2', '语言反应（V）', 'radio', [
      { label: '1 无发声', value: 1 }, { label: '2 只能发出含糊不清的声音', value: 2 },
      { label: '3 可说出不恰当的词', value: 3 }, { label: '4 言语混乱、答非所问', value: 4 },
      { label: '5 回答切题、定向力正常', value: 5 },
    ], { dimension: 'verbal' }),
    q('gcs3', '运动反应（M）', 'radio', [
      { label: '1 无运动反应', value: 1 }, { label: '2 疼痛刺激时肢体过伸（去大脑强直）', value: 2 },
      { label: '3 疼痛刺激时肢体屈曲（去皮质强直）', value: 3 }, { label: '4 疼痛刺激时肢体回缩', value: 4 },
      { label: '5 能定位疼痛刺激', value: 5 }, { label: '6 能按指令活动', value: 6 },
    ], { dimension: 'motor' }),
  ]),
  dimensions: [
    dim('eye', '睁眼反应 E', ['gcs1']),
    dim('verbal', '语言反应 V', ['gcs2']),
    dim('motor', '运动反应 M', ['gcs3']),
  ],
  scoring: {
    method: 'sum',
    totalRange: [3, 15],
    cutoffs: [
      { max: 8, label: '重度意识障碍（昏迷）', level: 'severe', advice: 'GCS ≤8：意识障碍严重，注意保护气道、加强监护，建议转入监护病房。' },
      { max: 12, label: '中度意识障碍', level: 'moderate', advice: 'GCS 9-12：中度意识障碍，加强监护与病因评估，动态复评。' },
      { max: 15, label: '轻度或意识清楚', level: 'normal', advice: 'GCS 13-15：轻度意识障碍或意识清楚，继续观察病情变化。' },
    ],
  },
};

/* ---------------- Katz ADL ---------------- */
const KATZ = {
  code: 'katz-adl',
  licenseTier: 'free',
  title: 'Katz ADL 日常生活活动能力量表',
  category: '护理评估',
  description: '评估基本日常生活活动能力（6 项），每项"独立=1 分、需要帮助=0 分"，总分 0-6 分：6 完全独立、5 轻度依赖、3-4 中度依赖、≤2 重度依赖。',
  instructions: '请根据受试者最近一周的实际情况，判断以下 6 项活动是否能独立完成（无需他人帮助）。',
  source: 'Katz S, Ford AB, Moskowitz RW, et al. Studies of illness in the aged: the index of ADL. JAMA. 1963;185(12):914-919.',
  license: '公开发表工具，临床与研究可免费使用，建议引用来源文献。',
  tags: ['日常生活能力', 'ADL', '老年', '护理', '6项'],
  items: numbered([
    q('katz1', '洗澡', 'radio', [{ label: '独立完成（无需帮助）', value: 1 }, { label: '需要帮助', value: 0 }]),
    q('katz2', '穿衣（取衣、穿衣、扣纽扣、系鞋带）', 'radio', [{ label: '独立完成', value: 1 }, { label: '需要帮助', value: 0 }]),
    q('katz3', '如厕（入厕、便后清洁、整理衣裤）', 'radio', [{ label: '独立完成', value: 1 }, { label: '需要帮助', value: 0 }]),
    q('katz4', '转移（从床上到椅子或从椅子到床上）', 'radio', [{ label: '独立完成', value: 1 }, { label: '需要帮助', value: 0 }]),
    q('katz5', '大小便控制', 'radio', [{ label: '完全能控制', value: 1 }, { label: '偶有失禁或需帮助', value: 0 }]),
    q('katz6', '进食', 'radio', [{ label: '独立完成', value: 1 }, { label: '需要帮助', value: 0 }]),
  ]),
  dimensions: [dim('total', 'ADL 总分', K.ids('katz', 6))],
  scoring: {
    method: 'sum',
    totalRange: [0, 6],
    cutoffs: [
      { max: 2, label: '重度依赖', level: 'severe', advice: '重度功能障碍，建议全面护理评估、防跌倒/压疮措施及康复介入。' },
      { max: 4, label: '中度依赖', level: 'moderate', advice: '中度功能障碍，建议部分协助并开展功能训练。' },
      { max: 5, label: '轻度依赖', level: 'mild', advice: '轻度功能障碍，建议康复训练与居家照护指导。' },
      { max: 6, label: '完全独立', level: 'normal', advice: '生活自理能力良好。' },
    ],
  },
};

/* ---------------- Lawton IADL ---------------- */
const LAWTON = {
  code: 'lawton-iadl',
  licenseTier: 'free',
  title: 'Lawton IADL 工具性日常生活能力量表',
  category: '护理评估',
  description: '评估较复杂的工具性日常生活能力（8 项），每项"能独立完成=1 分、需要帮助=0 分"，总分 0-8 分：8 完全独立、6-7 轻度依赖、3-5 中度依赖、≤2 重度依赖。',
  instructions: '请根据受试者最近一周的实际情况评估以下 8 项活动。',
  source: 'Lawton MP, Brody EM. Assessment of older people: self-maintaining and instrumental activities of daily living. Gerontologist. 1969;9(3):179-186.',
  license: '公开发表工具，可免费使用，建议引用来源文献。',
  tags: ['工具性日常生活能力', 'IADL', '老年', '8项'],
  items: numbered([
    q('law1', '使用电话（拨号、接听）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law2', '购物（购买日常用品）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law3', '备餐（计划并烹制饭菜）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law4', '做家务（整理、清洁）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law5', '洗衣服', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law6', '使用交通工具（乘车或自行外出）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law7', '自己服药（按剂量和时间服用）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
    q('law8', '处理钱财（管理收支、缴费）', 'radio', [{ label: '能独立完成', value: 1 }, { label: '需要帮助或不能完成', value: 0 }]),
  ]),
  dimensions: [dim('total', 'IADL 总分', K.ids('law', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 8],
    cutoffs: [
      { max: 2, label: '重度依赖', level: 'severe', advice: '工具性日常生活能力严重受损，建议照护支持与社会服务介入。' },
      { max: 5, label: '中度依赖', level: 'moderate', advice: '中度受损，建议居家照护支持与能力训练。' },
      { max: 7, label: '轻度依赖', level: 'mild', advice: '轻度受损，建议定期评估与安全指导。' },
      { max: 8, label: '完全独立', level: 'normal', advice: '工具性日常生活能力良好。' },
    ],
  },
};

/* ---------------- MMAS-8 用药依从性 ---------------- */
const MMAS8 = {
  code: 'mmas-8',
  licenseTier: 'registration',
  title: 'MMAS-8 用药依从性量表',
  category: '用药与依从性',
  description: 'Morisky 8 条目用药依从性量表，总分 0-8 分：8 分高依从性、6-7 分中等依从性、<6 分低依从性。第 8 题为 5 级计分（1、0.75、0.5、0.25、0 分）。',
  instructions: '请根据您平时的服药情况如实作答。',
  source: 'Morisky DE, Ang A, Krousel-Wood M, Ward HJ. Predictive validity of a medication adherence measure in an outpatient setting. J Clin Hypertens. 2008;10(5):348-354.',
  license: 'MMAS-8 需向原作者申请使用许可（学术研究通常可免费获得），商业使用需付费；建议在论文中说明授权情况。',
  tags: ['用药依从性', '慢病管理', '8题'],
  items: numbered([
    q('mmas1', '您是否有时会忘记服药？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }]),
    q('mmas2', '在过去的 2 周内，您是否曾经忘记过服药？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }]),
    q('mmas3', '您是否曾因为服药后感觉更糟而停药？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }]),
    q('mmas4', '当您外出旅行或长时间离家时，您是否忘记携带药物？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }]),
    q('mmas5', '您昨天服药了吗？', 'radio', [{ label: '是', value: 1 }, { label: '否', value: 0 }]),
    q('mmas6', '当您感觉症状得到控制时，您是否会停止服药？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }]),
    q('mmas7', '每天坚持服药对很多人来说都很不方便，您是否感到坚持服药方案很麻烦？', 'radio', [{ label: '是', value: 0 }, { label: '否', value: 1 }]),
    q('mmas8', '您多久会有一次忘记服药？', 'radio', [
      { label: '从不', value: 1 }, { label: '偶尔', value: 0.75 }, { label: '有时', value: 0.5 },
      { label: '经常', value: 0.25 }, { label: '一直', value: 0 },
    ]),
  ]),
  dimensions: [dim('total', 'MMAS-8 总分', K.ids('mmas', 8))],
  scoring: {
    method: 'sum',
    totalRange: [0, 8],
    cutoffs: [
      { max: 5.99, label: '低依从性', level: 'severe', advice: '用药依从性低，建议分析原因（费用、不良反应、认知、方案复杂）并制定干预措施。' },
      { max: 7.99, label: '中等依从性', level: 'moderate', advice: '中等依从性，建议加强用药教育与随访提醒。' },
      { max: 8, label: '高依从性', level: 'normal', advice: '用药依从性好，继续保持。' },
    ],
  },
};

/* ---------------- ZBI-22 照顾者负担 ---------------- */
const zbiOpts = [
  { label: '0 从不', value: 0 }, { label: '1 偶尔', value: 1 }, { label: '2 有时', value: 2 },
  { label: '3 经常', value: 3 }, { label: '4 总是', value: 4 },
];

const ZBI = {
  code: 'zbi-22',
  licenseTier: 'registration',
  title: 'ZBI-22 照顾者负担量表',
  category: '照护与负担',
  description: 'Zarit 照顾者负担访谈量表（22 条目），评估照护者主观负担，总分 0-88 分：0-21 无或轻度负担、22-46 轻中度、47-62 中度、63-88 重度负担。',
  instructions: '以下句子描述了照顾者可能有的感受，请根据您平时的感受选择符合程度。',
  source: 'Zarit SH, Reever KE, Bach-Peterson J. Relatives of the impaired elderly: correlates of feelings of burden. Gerontologist. 1980;20(6):649-655. 中文版：王烈等，2006。',
  license: '公开发表量表，研究用途免费，建议引用中英文来源文献。',
  tags: ['照顾者负担', '照料者', '22题', '老年/慢病'],
  items: numbered([
    q('zbi1', '您是否觉得病人对您有过多要求？', 'radio', zbiOpts),
    q('zbi2', '您是否觉得由于照顾病人，您没有足够的时间留给自己？', 'radio', zbiOpts),
    q('zbi3', '您是否觉得既要照顾病人又要料理家务或工作，感到压力很大？', 'radio', zbiOpts),
    q('zbi4', '您是否因为病人的行为而感到难堪？', 'radio', zbiOpts),
    q('zbi5', '您是否因为病人而感到生气？', 'radio', zbiOpts),
    q('zbi6', '您是否觉得病人影响了您与家人、朋友的关系？', 'radio', zbiOpts),
    q('zbi7', '您是否担心病人的未来？', 'radio', zbiOpts),
    q('zbi8', '您是否觉得病人依赖您？', 'radio', zbiOpts),
    q('zbi9', '当病人在您身边时，您是否感到紧张？', 'radio', zbiOpts),
    q('zbi10', '您是否觉得由于照顾病人，您的健康受到影响？', 'radio', zbiOpts),
    q('zbi11', '您是否觉得因为照顾病人，您没有足够的个人生活空间？', 'radio', zbiOpts),
    q('zbi12', '您是否觉得因为照顾病人，您的社交生活受到影响？', 'radio', zbiOpts),
    q('zbi13', '您是否觉得因为照顾病人，您不能做自己喜欢的事情？', 'radio', zbiOpts),
    q('zbi14', '您是否觉得病人期望您一直照顾他/她？', 'radio', zbiOpts),
    q('zbi15', '您是否觉得经济上不足以承担照顾病人的费用？', 'radio', zbiOpts),
    q('zbi16', '您是否觉得自己无法再继续照顾病人多久？', 'radio', zbiOpts),
    q('zbi17', '您是否觉得自从病人患病以来，您失去了对生活的掌控？', 'radio', zbiOpts),
    q('zbi18', '您是否希望把照顾病人的责任交给别人？', 'radio', zbiOpts),
    q('zbi19', '您是否觉得您对病人应该做得更多？', 'radio', zbiOpts),
    q('zbi20', '您是否觉得自己能做得更好？', 'radio', zbiOpts),
    q('zbi21', '总体而言，您是否觉得照顾病人给您带来很大的负担？', 'radio', zbiOpts),
    q('zbi22', '总体而言，您是否觉得自己照顾病人的能力不足？', 'radio', zbiOpts),
  ]),
  dimensions: [dim('total', '照顾者负担（总分）', K.ids('zbi', 22))],
  scoring: {
    method: 'sum',
    totalRange: [0, 88],
    cutoffs: [
      { max: 21, label: '无或轻度负担', level: 'normal', advice: '负担较轻，提供常规照护指导。' },
      { max: 46, label: '轻中度负担', level: 'mild', advice: '建议提供照顾技能培训与心理支持。' },
      { max: 62, label: '中度负担', level: 'moderate', advice: '建议评估照护资源，提供喘息服务与社会支持。' },
      { max: 88, label: '重度负担', level: 'severe', advice: '重度负担，建议多学科团队介入（心理支持、社会服务、照护分担），并关注照顾者自身健康。' },
    ],
  },
};

/* ---------------- FSS 疲劳严重程度 ---------------- */
const FSS = {
  code: 'fss',
  licenseTier: 'registration',
  title: 'FSS 疲劳严重程度量表',
  category: '症状评估',
  description: '9 个条目，每条 1-7 分，取均分。均分 ≥4 分提示存在明显疲劳。常用于多发性硬化、脑卒中、肿瘤、慢性病与新冠后疲劳评估。',
  instructions: '以下句子描述疲劳对生活的影响，请选择符合您最近一周情况的分数（1 = 完全不同意，7 = 完全同意）。',
  source: 'Krupp LB, LaRocca NG, Muir-Nash J, Steinberg AD. The fatigue severity scale. Arch Neurol. 1989;46(10):1121-1123.',
  license: '公开发表量表，研究用途免费，建议引用来源文献。',
  tags: ['疲劳', '症状评估', '9题', '慢性病'],
  items: numbered([
    q('fss1', '当我感到疲劳时，我的积极性会降低', 'radio', K.LIKERT7),
    q('fss2', '运动会使我感到疲劳', 'radio', K.LIKERT7),
    q('fss3', '我很容易感到疲劳', 'radio', K.LIKERT7),
    q('fss4', '疲劳影响了我的身体功能', 'radio', K.LIKERT7),
    q('fss5', '疲劳经常给我带来麻烦', 'radio', K.LIKERT7),
    q('fss6', '疲劳使我不能持续进行体力活动', 'radio', K.LIKERT7),
    q('fss7', '疲劳影响了我完成某些职责和任务', 'radio', K.LIKERT7),
    q('fss8', '疲劳是我最严重的三个症状之一', 'radio', K.LIKERT7),
    q('fss9', '疲劳影响了我的工作、家庭或社交生活', 'radio', K.LIKERT7),
  ]),
  dimensions: [dim('total', '疲劳均分', K.ids('fss', 9))],
  scoring: {
    method: 'mean',
    totalRange: [1, 7],
    cutoffs: [
      { max: 3.99, label: '无明显疲劳', level: 'normal', advice: '未达到疲劳判定界值（均分 <4）。' },
      { max: 7, label: '存在明显疲劳', level: 'moderate', advice: '均分 ≥4 提示明显疲劳，建议评估病因（贫血、甲状腺、睡眠、情绪、药物）并制定干预方案。' },
    ],
  },
};

/* ---------------- WHOQOL-BREF ---------------- */
const qual5 = [
  { label: '很差', value: 1 }, { label: '差', value: 2 }, { label: '一般', value: 3 }, { label: '好', value: 4 }, { label: '很好', value: 5 },
];
const wsat5 = [
  { label: '很不满意', value: 1 }, { label: '不满意', value: 2 }, { label: '一般', value: 3 }, { label: '满意', value: 4 }, { label: '很满意', value: 5 },
];
const wamt5 = [
  { label: '完全没有', value: 1 }, { label: '有一点', value: 2 }, { label: '中等程度', value: 3 }, { label: '比较大', value: 4 }, { label: '极大', value: 5 },
];

const WHOQOL = {
  code: 'whoqol-bref',
  licenseTier: 'registration',
  title: 'WHOQOL-BREF 生存质量测定量表（简版）',
  category: '生活质量',
  description: '世界卫生组织生存质量量表简版，26 个条目（24 个维度条目 + 2 个总体条目），覆盖生理、心理、社会关系、环境 4 个领域。各领域得分 = 条目均分 × 4（4-20 分），也可换算为百分制：(得分-4)×100/16。含 3 个反向计分条目（第 3、4、26 题）。',
  instructions: '以下问题询问您对自己生活质量、健康以及生活其他方面的看法。请选择最符合您实际情况的一项。',
  source: 'WHOQOL Group. Development of the World Health Organization WHOQOL-BREF quality of life assessment. Psychol Med. 1998;28(3):551-558. 中文版由中山医科大学卫生统计学教研室修订。',
  license: 'WHO 允许非商业用途使用，需注明来源；建议使用 WHO 官方中文版并与作者核对。',
  tags: ['生活质量', 'WHO', '26题', '4个领域'],
  items: numbered([
    q('wq1', '您怎样评价您的生活质量？', 'radio', qual5, { dimension: 'g' }),
    q('wq2', '您对自己的健康状况满意吗？', 'radio', wsat5, { dimension: 'g' }),
    q('wq3', '您觉得疼痛妨碍您去做自己需要做的事情吗？', 'radio', wamt5, { dimension: 'phys', reverse: true }),
    q('wq4', '您需要依靠医疗的帮助进行日常生活吗？', 'radio', [
      { label: '完全不需要', value: 1 }, { label: '很少需要', value: 2 }, { label: '一般', value: 3 }, { label: '比较需要', value: 4 }, { label: '极需要', value: 5 },
    ], { dimension: 'phys', reverse: true }),
    q('wq5', '您觉得生活有乐趣吗？', 'radio', [
      { label: '毫无乐趣', value: 1 }, { label: '很少有', value: 2 }, { label: '一般', value: 3 }, { label: '比较有', value: 4 }, { label: '极有乐趣', value: 5 },
    ], { dimension: 'psych' }),
    q('wq6', '您觉得自己的生活有意义吗？', 'radio', [
      { label: '毫无意义', value: 1 }, { label: '很少有', value: 2 }, { label: '一般', value: 3 }, { label: '比较有意义', value: 4 }, { label: '极有意义', value: 5 },
    ], { dimension: 'psych' }),
    q('wq7', '您能集中注意力吗？', 'radio', [
      { label: '完全不能', value: 1 }, { label: '很少能', value: 2 }, { label: '一般', value: 3 }, { label: '比较能', value: 4 }, { label: '完全能', value: 5 },
    ], { dimension: 'psych' }),
    q('wq8', '日常生活中您感觉安全吗？', 'radio', [
      { label: '完全不安全', value: 1 }, { label: '很少安全', value: 2 }, { label: '一般', value: 3 }, { label: '比较安全', value: 4 }, { label: '完全安全', value: 5 },
    ], { dimension: 'envir' }),
    q('wq9', '您的生活环境对健康好吗？', 'radio', qual5, { dimension: 'envir' }),
    q('wq10', '您有充沛的精力去应付日常生活吗？', 'radio', [
      { label: '完全没有', value: 1 }, { label: '很少有', value: 2 }, { label: '一般', value: 3 }, { label: '多数有', value: 4 }, { label: '完全有', value: 5 },
    ], { dimension: 'phys' }),
    q('wq11', '您认为自己的外形过得去吗？', 'radio', qual5, { dimension: 'psych' }),
    q('wq12', '您的钱够用吗？', 'radio', [
      { label: '完全不够', value: 1 }, { label: '很少够', value: 2 }, { label: '一般', value: 3 }, { label: '多数够', value: 4 }, { label: '完全够', value: 5 },
    ], { dimension: 'envir' }),
    q('wq13', '在日常生活中您需要的信息都齐备吗？', 'radio', [
      { label: '完全得不到', value: 1 }, { label: '很少得到', value: 2 }, { label: '一般', value: 3 }, { label: '多数得到', value: 4 }, { label: '完全能得到', value: 5 },
    ], { dimension: 'envir' }),
    q('wq14', '您有机会进行休闲活动吗？', 'radio', [
      { label: '完全没有', value: 1 }, { label: '很少有', value: 2 }, { label: '一般', value: 3 }, { label: '多数有', value: 4 }, { label: '完全有', value: 5 },
    ], { dimension: 'envir' }),
    q('wq15', '您行动的能力如何？', 'radio', [
      { label: '完全不能', value: 1 }, { label: '很少能', value: 2 }, { label: '一般', value: 3 }, { label: '多数能', value: 4 }, { label: '完全能', value: 5 },
    ], { dimension: 'phys' }),
    q('wq16', '您对自己的睡眠情况满意吗？', 'radio', wsat5, { dimension: 'phys' }),
    q('wq17', '您对自己做日常生活事情的能力满意吗？', 'radio', wsat5, { dimension: 'phys' }),
    q('wq18', '您对自己的工作能力满意吗？', 'radio', wsat5, { dimension: 'phys' }),
    q('wq19', '您对自己满意吗？', 'radio', wsat5, { dimension: 'psych' }),
    q('wq20', '您对自己的人际关系满意吗？', 'radio', wsat5, { dimension: 'social' }),
    q('wq21', '您对自己的性生活满意吗？', 'radio', wsat5, { dimension: 'social' }),
    q('wq22', '您对从朋友那里得到的支持满意吗？', 'radio', wsat5, { dimension: 'social' }),
    q('wq23', '您对自己居住地的条件满意吗？', 'radio', wsat5, { dimension: 'envir' }),
    q('wq24', '您对得到卫生保健服务的方便程度满意吗？', 'radio', wsat5, { dimension: 'envir' }),
    q('wq25', '您对自己的交通情况满意吗？', 'radio', wsat5, { dimension: 'envir' }),
    q('wq26', '您有消极感受吗？（如情绪低落、绝望、焦虑、忧郁）', 'radio', [
      { label: '从不', value: 1 }, { label: '很少', value: 2 }, { label: '有时', value: 3 }, { label: '经常', value: 4 }, { label: '总是', value: 5 },
    ], { dimension: 'psych', reverse: true }),
  ]),
  dimensions: [
    dim('phys', '生理领域', ['wq3', 'wq4', 'wq10', 'wq15', 'wq16', 'wq17', 'wq18']),
    dim('psych', '心理领域', ['wq5', 'wq6', 'wq7', 'wq11', 'wq19', 'wq26']),
    dim('social', '社会关系领域', ['wq20', 'wq21', 'wq22']),
    dim('envir', '环境领域', ['wq8', 'wq9', 'wq12', 'wq13', 'wq14', 'wq23', 'wq24', 'wq25']),
    dim('g', '总体健康与生活质量', ['wq1', 'wq2']),
  ],
  scoring: {
    method: 'mean',
    dimMultiplier: 4,
    totalRange: [1, 5],
    cutoffs: [],
  },
};

/* ---------------- Barthel 指数 ---------------- */
const BARTHEL = {
  code: 'barthel',
  licenseTier: 'free',
  title: 'Barthel 指数（日常生活活动能力）',
  category: '护理评估',
  description: '临床最常用的日常生活活动能力（ADL）评定工具，共 10 项，总分 0-100 分：100 完全独立、61-99 轻度依赖、41-60 中度依赖、21-40 重度依赖、≤20 完全依赖。',
  instructions: '请根据受试者最近一周的实际情况评估每一项（10 分制版本）。',
  source: 'Mahoney FI, Barthel DW. Functional evaluation: the Barthel Index. Md State Med J. 1965;14:61-65. 中文版广泛用于康复与护理研究。',
  license: '公开发表工具，临床与科研可免费使用，建议引用来源文献。',
  tags: ['日常生活能力', 'ADL', 'Barthel', '康复', '护理'],
  items: numbered([
    q('bi1', '进食', 'radio', [
      { label: '10 自理（能自己进食，必要时可切食物）', value: 10 },
      { label: '5 需部分帮助（如夹菜、盛饭、切食物）', value: 5 },
      { label: '0 完全依赖', value: 0 },
    ]),
    q('bi2', '洗澡', 'radio', [{ label: '5 自理（能独立完成洗澡）', value: 5 }, { label: '0 依赖', value: 0 }]),
    q('bi3', '修饰（洗脸、刷牙、剃须、梳头）', 'radio', [{ label: '5 自理', value: 5 }, { label: '0 需帮助', value: 0 }]),
    q('bi4', '穿衣（含系扣、拉链、系鞋带）', 'radio', [
      { label: '10 自理', value: 10 },
      { label: '5 需帮助，但能完成一半以上', value: 5 },
      { label: '0 完全依赖', value: 0 },
    ]),
    q('bi5', '大便控制', 'radio', [
      { label: '10 能控制', value: 10 },
      { label: '5 偶尔失禁（每周少于1次）或需他人帮助使用塞剂', value: 5 },
      { label: '0 失禁或需他人帮助处理', value: 0 },
    ]),
    q('bi6', '小便控制', 'radio', [
      { label: '10 能控制（包括自行使用集尿器）', value: 10 },
      { label: '5 偶尔失禁（每日少于1次）', value: 5 },
      { label: '0 失禁或需导尿', value: 0 },
    ]),
    q('bi7', '如厕（脱穿衣裤、便后清洁、冲水）', 'radio', [
      { label: '10 自理', value: 10 },
      { label: '5 需部分帮助', value: 5 },
      { label: '0 依赖', value: 0 },
    ]),
    q('bi8', '床椅转移', 'radio', [
      { label: '15 自理', value: 15 },
      { label: '10 需少量帮助（1人）或口头指导', value: 10 },
      { label: '5 需大量帮助（2人）才能坐起', value: 5 },
      { label: '0 完全依赖，不能坐', value: 0 },
    ]),
    q('bi9', '平地行走（45 米以上）', 'radio', [
      { label: '15 独立行走 45 米以上（可用辅助器具）', value: 15 },
      { label: '10 需 1 人帮助或指导', value: 10 },
      { label: '5 使用轮椅可独立移动', value: 5 },
      { label: '0 不能行走', value: 0 },
    ]),
    q('bi10', '上下楼梯', 'radio', [
      { label: '10 自理（可用辅助器具）', value: 10 },
      { label: '5 需帮助或指导', value: 5 },
      { label: '0 不能上下楼梯', value: 0 },
    ]),
  ]),
  dimensions: [dim('total', 'Barthel 总分', K.ids('bi', 10))],
  scoring: {
    method: 'sum',
    totalRange: [0, 100],
    cutoffs: [
      { max: 20, label: '完全依赖', level: 'severe', advice: '完全依赖，需要全面护理与康复介入。' },
      { max: 40, label: '重度依赖', level: 'severe', advice: '重度依赖，建议制定综合康复与照护方案。' },
      { max: 60, label: '中度依赖', level: 'moderate', advice: '中度依赖，建议开展日常生活能力训练。' },
      { max: 99, label: '轻度依赖', level: 'mild', advice: '轻度依赖，建议居家康复训练与安全指导。' },
      { max: 100, label: '完全独立', level: 'normal', advice: '生活自理能力良好。' },
    ],
  },
};

/* ---------------- Norton 压疮风险 ---------------- */
const NORTON = {
  code: 'norton',
  licenseTier: 'free',
  title: 'Norton 压疮风险评估量表',
  category: '护理评估',
  description: '评估压力性损伤风险，5 个维度，总分 5-20 分，**分数越低风险越高**：≤14 分提示存在风险、≤12 分高风险、≤10 分极高风险。',
  instructions: '请由医护人员根据患者实际情况逐项评估。',
  source: 'Norton D, McLaren R, Exton-Smith AN. An investigation of geriatric nursing problems in hospital. 1962.',
  license: '公开发表工具，临床可免费使用，建议引用来源文献。',
  tags: ['压疮', '护理评估', '5个维度', '老年'],
  items: numbered([
    q('nor1', '身体状况', 'radio', [
      { label: '4 良好', value: 4 }, { label: '3 一般', value: 3 }, { label: '2 差', value: 2 }, { label: '1 极差', value: 1 },
    ]),
    q('nor2', '精神状态', 'radio', [
      { label: '4 清醒', value: 4 }, { label: '3 淡漠', value: 3 }, { label: '2 混乱', value: 2 }, { label: '1 木僵或昏迷', value: 1 },
    ]),
    q('nor3', '活动能力', 'radio', [
      { label: '4 自由活动', value: 4 }, { label: '3 需他人协助活动', value: 3 }, { label: '2 坐轮椅', value: 2 }, { label: '1 卧床', value: 1 },
    ]),
    q('nor4', '移动能力', 'radio', [
      { label: '4 完全自主', value: 4 }, { label: '3 轻度受损', value: 3 }, { label: '2 严重受损', value: 2 }, { label: '1 不能移动', value: 1 },
    ]),
    q('nor5', '失禁情况', 'radio', [
      { label: '4 无失禁', value: 4 }, { label: '3 偶尔失禁', value: 3 }, { label: '2 经常失禁', value: 2 }, { label: '1 完全失禁', value: 1 },
    ]),
  ]),
  dimensions: [dim('total', 'Norton 总分', K.ids('nor', 5))],
  scoring: {
    method: 'sum',
    totalRange: [5, 20],
    cutoffs: [
      { max: 10, label: '极高风险', level: 'severe', advice: '极高风险：立即采取减压与皮肤护理措施，至少每 1-2 小时翻身，逐级上报。' },
      { max: 12, label: '高风险', level: 'severe', advice: '高风险：使用减压装置、加强翻身与营养支持。' },
      { max: 14, label: '存在风险', level: 'moderate', advice: '存在风险：落实预防措施，定期复评。' },
      { max: 20, label: '风险较低', level: 'normal', advice: '按常规护理，定期评估。' },
    ],
  },
};

/* ---------------- 洼田饮水试验 ---------------- */
const KUBOTA = {
  code: 'kubota',
  licenseTier: 'free',
  title: '洼田饮水试验（吞咽功能筛查）',
  category: '护理评估',
  description: '让患者饮下 30 ml 温开水，观察所需时间与呛咳情况并分为 5 级。1 级正常、2 级可疑、3 级及以上提示吞咽障碍。',
  instructions: '请评估者按以下方法操作：患者端坐，喝下 30 ml 温开水，观察所需时间和呛咳情况。',
  source: '洼田俊夫. 摄食吞咽障碍的康复. 日本医学介绍, 1982. 国内护理与康复广泛使用。',
  license: '公开发表筛查方法，可免费使用，建议引用来源文献。',
  tags: ['吞咽', '护理评估', '单项目', '卒中'],
  items: numbered([
    q('kub1', '饮水试验结果分级', 'radio', [
      { label: '1 级：5 秒内能 1 次喝完，无呛咳', value: 1 },
      { label: '2 级：需 2 次以上喝完，或超过 5 秒喝完，无呛咳', value: 2 },
      { label: '3 级：能 1 次喝完，但有呛咳', value: 3 },
      { label: '4 级：需 2 次以上喝完，且有呛咳', value: 4 },
      { label: '5 级：频繁呛咳，难以全部喝完', value: 5 },
    ]),
  ]),
  dimensions: [dim('total', '洼田饮水试验分级', ['kub1'])],
  scoring: {
    method: 'sum',
    totalRange: [1, 5],
    cutoffs: [
      { max: 1, label: '正常', level: 'normal', advice: '吞咽功能正常，可经口进食。' },
      { max: 2, label: '可疑', level: 'mild', advice: '可疑吞咽障碍：进食时注意观察，必要时复评。' },
      { max: 5, label: '吞咽障碍', level: 'severe', advice: '3 级及以上提示吞咽障碍：建议进一步吞咽功能评估，调整食物性状，注意误吸与误吸性肺炎风险。' },
    ],
  },
};

module.exports = [MORSE, BRADEN, NORTON, MNASF, NRS2002, BARTHEL, KATZ, LAWTON, GCS, KUBOTA, MMAS8, ZBI, FSS, WHOQOL];
