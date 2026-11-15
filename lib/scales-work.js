'use strict';
/**
 * 量表库 · 职业健康与工作倦怠（自评）
 * 条目与计分说明按使用者提供的 MBI-HSS 中文版材料逐条录入，保留原卷题序。
 */
const K = require('./scale-kit.js');
const q = K.q;
const numbered = K.numbered;
const dim = K.dim;

/* 0-6 频率锚点：按所提供中文版原文措辞录入（含第 5 级原文表述） */
const MBI_FREQ = [
  { label: '0 从未有过', value: 0 },
  { label: '1 极少数时候（一年中有几次或更少）', value: 1 },
  { label: '2 少数时候（一个月一次或更少）', value: 2 },
  { label: '3 稍多时候（一个月中有几次）', value: 3 },
  { label: '4 多数时候（一个星期一次）', value: 4 },
  { label: '5 几乎每天（一个星期中有几次）', value: 5 },
  { label: '6 每天', value: 6 },
];

const MBI_IDS = K.ids('mbi', 17);

const EE_ITEMS = ['mbi1', 'mbi2', 'mbi3', 'mbi9', 'mbi10', 'mbi12', 'mbi16'];
const DP_ITEMS = ['mbi5', 'mbi8', 'mbi11'];
const PA_ITEMS = ['mbi4', 'mbi6', 'mbi7', 'mbi13', 'mbi14', 'mbi15', 'mbi17'];

const MBI_DIM_OF = {};
EE_ITEMS.forEach(function (id) { MBI_DIM_OF[id] = 'ee'; });
DP_ITEMS.forEach(function (id) { MBI_DIM_OF[id] = 'dp'; });
PA_ITEMS.forEach(function (id) { MBI_DIM_OF[id] = 'pa'; });

const MBI_TEXTS = [
  '我感觉自己的感情已经在工作中耗尽了。',
  '每天下班时，我通常感到已经筋疲力尽了。',
  '早上醒来时想到又要面对一天的工作，我感到很累。',
  '我能很容易地理解工作对象的感受。',
  '我把某些工作对象当成没有感情的物品来对待。',
  '我能非常有效地解决工作中的问题。',
  '我感到自己的工作对别人的生活来说很重要。',
  '从事这项工作以来，我变得对人更冷漠了。',
  '我的工作使我有挫折感。',
  '我觉得自己工作得太辛苦。',
  '我不太关心发生在工作对象身上的事情。',
  '从事直接与人打交道的工作给我带来巨大的压力。',
  '我能毫不费劲地创造一个轻松的工作氛围。',
  '能从事与人密切接触的工作使我很愉快。',
  '我在自己的工作中完成了许多有价值的事。',
  '我感到自己已经到了忍受的极点。',
  '在工作中，我能非常冷静地处理情绪问题。',
];

/* ---------------- MBI-HSS 职业倦怠量表（服务行业版） ---------------- */
const MBI_HSS = {
  code: 'mbi-hss',
  title: 'MBI-HSS 职业倦怠量表（服务行业版）',
  category: '情绪与心理',
  licenseTier: 'commercial',
  description: 'Maslach Burnout Inventory-Human Services Survey 中文版，17 个条目均按 0-6 分频率计分，测量情绪耗竭（EE，7 题，0-42 分）、去人性化（DP，3 题，0-18 分）与个人成就感（PA，7 题，0-42 分）三个维度。EE、DP 得分越高倦怠越重，PA 得分越低倦怠越重；三个方面应分别解释，不计算合计总分。',
  instructions: '倦怠感是一种在从事服务性工作的人员中发生的、以身心疲惫、自我成就感降低为特征的综合征。下列表格中列出了有些服务工作人员可能有的问题，请您仔细阅读每一项，然后根据最近一个月的实际情况，选择最符合的一项。要求：独立的、不受任何人影响的自我评定。在本问卷中，职业需要所面对的人群统一称为“工作对象”（如，老师的工作对象是学生，警察的工作对象是普通人、嫌疑人、罪犯等）。',
  source: 'Maslach C, Jackson SE. The measurement of experienced burnout. J Occup Behav. 1981;2(2):99-113；Maslach C, Jackson SE, Leiter MP. Maslach Burnout Inventory Manual, 3rd ed. Palo Alto, CA: Consulting Psychologists Press, 1996. 中文版与常模出处：张姝月、许燕（2006），公安部内部网站网上调查，有效问卷 4855 份（男 4197 人、女 658 人；年龄 16-65 岁，34±7 岁）。',
  license: 'MBI 系列版权归 Mind Garden, Inc.，电子化、公开部署及正式科研使用须取得授权并使用获准的中文版本。本模板 17 条正文与频率锚点由平台使用者依据其提供的中文版材料录入，平台不主张权利、不另行分发；发布前请核对授权与所用版本，并在论文中规范引用来源文献。',
  tags: ['职业倦怠', '服务行业', '17题', '三维度', '自评'],
  usage: {
    population: '从事服务性工作的人员（医务人员、教师、警察等），自评；回顾最近一个月',
    mode: '自评',
    notes: '三个维度分别累加并独立解释，不必计算总分，也可单独使用分量表。个人成就感为反向解释（分数越低倦怠越重），但原始 0-6 分值不做反转，否则与“得分越低越严重”的说明相矛盾。原说明按样本正态分布上 1/3、中 1/3、下 1/3 划分高、中、低度，所提供材料未附常模数值表，因此平台不预设高/中/低界值，结果页只给出得分与判读方向，请按本单位或拟引用文献的常模判读。此为 17 条目中文版本，与 22 条目原版 MBI-HSS 的题数与题序不同，投稿时须注明所用版本；频率锚点按原文录入，其中第 5 级的文字表述与常见译法略有出入，正式使用前请与获准版本核对。',
  },
  items: numbered(MBI_IDS.map(function (id, i) {
    return q(id, MBI_TEXTS[i], 'radio', MBI_FREQ, { dimension: MBI_DIM_OF[id] });
  })),
  /* 原卷 1-17 题按三个维度混排，填写页不得按维度重排；用 pages 显式保持原序 */
  pages: [
    { title: '第 1–9 题', items: MBI_IDS.slice(0, 9) },
    { title: '第 10–17 题', items: MBI_IDS.slice(9) },
  ],
  dimensions: [
    dim('ee', '情绪耗竭 EE（0–42 分，越高越重）', EE_ITEMS),
    dim('dp', '去人性化 DP（0–18 分，越高越重）', DP_ITEMS),
    dim('pa', '个人成就感 PA（0–42 分，越低越重）', PA_ITEMS),
  ].map(function (d) {
    // 无可靠常模界值时不编造高/中/低分级：只给一条覆盖全量程的说明性判读，
    // 结果与导出里明确提示「按所用常模判读」。
    d.cutoffs = [{
      max: d.id === 'dp' ? 18 : 42,
      label: '按所用常模判读',
      level: 'normal',
      advice: '本表不预设高、中、低界值；请按研究方案或拟引用文献的常模判读三个分量表。',
    }];
    return d;
  }),
  scoring: {
    method: 'sum',
    totalEnabled: false,
    cutoffs: [],
  },
};

module.exports = [MBI_HSS];
