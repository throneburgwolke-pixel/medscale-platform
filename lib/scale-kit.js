'use strict';
/**
 * 量表构造工具箱：统一的选项集与条目构造函数
 * 供 scales.js / scales-*.js 使用，保证各量表结构一致
 */
const { PENDING_MARK } = require('./logic.js');

/* ---------- 常用选项集 ---------- */
/** 0-3 频率（两周内） */
const FREQ4 = [
  { label: '完全不会', value: 0 },
  { label: '好几天', value: 1 },
  { label: '一半以上的天数', value: 2 },
  { label: '几乎每天', value: 3 },
];

/** 0-4 频率（过去一个月） */
const FREQ5 = [
  { label: '从来没有', value: 0 },
  { label: '偶尔', value: 1 },
  { label: '有时', value: 2 },
  { label: '经常', value: 3 },
  { label: '总是', value: 4 },
];

/** 0-4 频率（PSS 专用） */
const PSS5 = [
  { label: '从来没有', value: 0 },
  { label: '几乎从来没有', value: 1 },
  { label: '有时', value: 2 },
  { label: '相当经常', value: 3 },
  { label: '非常经常', value: 4 },
];

/** 0-3 严重程度 */
const SEV4 = [
  { label: '无', value: 0 },
  { label: '轻度', value: 1 },
  { label: '中度', value: 2 },
  { label: '重度', value: 3 },
];

/** 0-4 严重程度 */
const SEV5 = [
  { label: '无', value: 0 },
  { label: '轻度', value: 1 },
  { label: '中度', value: 2 },
  { label: '重度', value: 3 },
  { label: '极重度', value: 4 },
];

/** 1-5 同意程度（李克特） */
const AGREE5 = [
  { label: '非常不同意', value: 1 },
  { label: '不同意', value: 2 },
  { label: '一般', value: 3 },
  { label: '同意', value: 4 },
  { label: '非常同意', value: 5 },
];

/** 0-4 符合程度（CD-RISC 等） */
const MATCH5 = [
  { label: '0 完全不正确', value: 0 },
  { label: '1 很少正确', value: 1 },
  { label: '2 有时正确', value: 2 },
  { label: '3 经常正确', value: 3 },
  { label: '4 几乎总是正确', value: 4 },
];

/** 1-4 Zung 式频率（SAS/SDS 专用） */
const ZUNG4 = [
  { label: '没有或很少时间', value: 1 },
  { label: '小部分时间', value: 2 },
  { label: '相当多时间', value: 3 },
  { label: '绝大部分或全部时间', value: 4 },
];

/** 1-4 频率（自我效能等） */
const FREQ4_1 = [
  { label: '完全不正确', value: 1 },
  { label: '有点正确', value: 2 },
  { label: '多数正确', value: 3 },
  { label: '完全正确', value: 4 },
];

/** 1-7 频率（疲劳等） */
const LIKERT7 = [
  { label: '1 = 完全不同意', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4 = 一般', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7 = 完全同意', value: 7 },
];

/** 0-3 频率（每周，PSQI 式） */
const WEEK4 = [
  { label: '无', value: 0 },
  { label: '每周少于1次', value: 1 },
  { label: '每周1-2次', value: 2 },
  { label: '每周3次或以上', value: 3 },
];

/** 0-4 频率（每周，ICIQ 等） */
const WEEK5 = [
  { label: '从不', value: 0 },
  { label: '每周少于1次', value: 1 },
  { label: '每周1-2次', value: 2 },
  { label: '每周3次以上', value: 3 },
  { label: '每天都发生', value: 4 },
];

/** 0-2 频率 */
const FREQ3 = [
  { label: '没有', value: 0 },
  { label: '有时', value: 1 },
  { label: '经常', value: 2 },
];

/** 是 / 否（是=1，否=0） */
const YESNO = [
  { label: '是', value: 1 },
  { label: '否', value: 0 },
];

/** 是 / 否（是=2，否=1） */
const YESNO21 = [
  { label: '是', value: 2 },
  { label: '否', value: 1 },
];

/** 0-5 WHO-5 式 */
const WHO5 = [
  { label: '所有时间', value: 5 },
  { label: '大部分时间', value: 4 },
  { label: '超过一半时间', value: 3 },
  { label: '不到一半时间', value: 2 },
  { label: '偶尔', value: 1 },
  { label: '任何时候都没有', value: 0 },
];

/** 0-3 ESS 式 */
const CHANCE4 = [
  { label: '从不打瞌睡', value: 0 },
  { label: '很少打瞌睡', value: 1 },
  { label: '有时打瞌睡', value: 2 },
  { label: '经常打瞌睡', value: 3 },
];

/** 满意度 1-5 */
const SAT5 = [
  { label: '非常不满意', value: 1 },
  { label: '不满意', value: 2 },
  { label: '一般', value: 3 },
  { label: '满意', value: 4 },
  { label: '非常满意', value: 5 },
];

/* ---------- 构造工具 ---------- */
let seq = 0;

/**
 * 构造一个条目
 * @param {string} id 条目唯一 id
 * @param {string} text 题干
 * @param {string} type radio|checkbox|select|number|slider|text|textarea|time|date
 * @param {Array} options 选项（含 label 与 value）
 * @param {object} extra {dimension,hint,min,max,unit,reverse,required,safety}
 */
function q(id, text, type, options, extra) {
  const e = extra || {};
  const item = { id: id, text: text, type: type, required: e.required !== false };
  if (options) item.options = options;
  ['dimension', 'hint', 'min', 'max', 'unit', 'integer'].forEach(function (k) {
    if (e[k] !== undefined) item[k] = e[k];
  });
  if (e.reverse) item.reverse = true;
  if (e.safety) item.safety = true;
  if (e.exclude) item.exclude = true;
  if (e.bands) item.bands = e.bands;
  if (e.textPending) item.textPending = true;
  return item;
}

/** 给条目编号 */
function numbered(items) {
  return items.map(function (it, i) {
    return Object.assign({}, it, { no: i + 1 });
  });
}

/** 维度定义 */
function dim(id, name, itemIds) {
  return { id: id, name: name, items: itemIds };
}

/** 批量生成条目 id（如 p1..p9） */
function ids(prefix, n) {
  const out = [];
  for (let i = 1; i <= n; i += 1) out.push(prefix + i);
  return out;
}

/** 商业授权量表的占位条目：结构与分值齐全，文字待授权用户填入 */
function pendingQ(id, no, values, extra) {
  const e = Object.assign({}, extra || {});
  const opts = values.map(function (v, k) {
    return { label: '选项 ' + (k + 1) + '（' + v + ' 分）：' + PENDING_MARK, value: v };
  });
  if (e.na) {
    opts.push({ label: '不适用', value: 'na', na: true });
    delete e.na;
  }
  e.textPending = true;
  return q(id, '第 ' + no + ' 题：' + PENDING_MARK + '题干', 'radio', opts, e);
}

/** 常用的"越高越差"四级分级 */
function gradeCutoffs(range, labels, levels, advices) {
  const step = range / labels.length;
  return labels.map(function (label, i) {
    return {
      max: Math.round((i === labels.length - 1 ? range : step * (i + 1)) * 100) / 100,
      label: label,
      level: levels[i] || 'mild',
      advice: advices ? advices[i] : '',
    };
  });
}

module.exports = {
  FREQ4: FREQ4, FREQ5: FREQ5, PSS5: PSS5, SEV4: SEV4, SEV5: SEV5, MATCH5: MATCH5,
  AGREE5: AGREE5, ZUNG4: ZUNG4, FREQ4_1: FREQ4_1, LIKERT7: LIKERT7,
  WEEK4: WEEK4, WEEK5: WEEK5, FREQ3: FREQ3, YESNO: YESNO, YESNO21: YESNO21,
  WHO5: WHO5, CHANCE4: CHANCE4, SAT5: SAT5,
  q: q, numbered: numbered, dim: dim, ids: ids, gradeCutoffs: gradeCutoffs, pendingQ: pendingQ,
};
