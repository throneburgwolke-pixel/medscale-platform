'use strict';
/**
 * 量表库自检：遍历全部内置模板，验证结构完整性、极值计分与判读，
 * 并对关键量表做已知数值核对。
 */
const path = require('node:path');
const { TEMPLATES, CATALOG } = require(path.join(__dirname, '..', 'lib', 'scales.js'));
const { scoreResponse, validateAnswers } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

const scoreable = ['radio', 'select', 'checkbox', 'number', 'slider'];

function pickAnswer(item, mode) {
  if (!item.options || !item.options.length) {
    if (item.type === 'slider') return mode === 'min' ? (item.min || 0) : (item.max === undefined ? 10 : item.max);
    if (item.type === 'number') return mode === 'min' ? (item.min || 0) : (item.max === undefined ? 100 : item.max);
    if (item.type === 'time') return '23:00';
    return '文本';
  }
  const vals = item.options.map(function (o) { return Number(o.value); }).filter(function (v) { return Number.isFinite(v); });
  const target = mode === 'min' ? Math.min.apply(null, vals) : mode === 'max' ? Math.max.apply(null, vals) : vals[Math.floor(vals.length / 2)];
  const hit = item.options.find(function (o) { return String(o.value) === String(target); });
  return hit ? hit.value : item.options[0].value;
}

function fill(t, mode) {
  const a = {};
  t.items.forEach(function (it) { a[it.id] = pickAnswer(it, mode); });
  return a;
}

console.log('\n【1】结构完整性（' + TEMPLATES.length + ' 个模板 / ' + CATALOG.length + ' 条目录）');
const codes = new Set();
TEMPLATES.forEach(function (t) {
  const id = t.code;
  ok(!!t.code && !!t.title && !!t.category && !!t.source && !!t.license, id + ' 元数据完整');
  ok(!codes.has(t.code), id + ' code 唯一');
  codes.add(t.code);
  ok(t.items.length > 0, id + ' 至少有 1 个条目');
  t.items.forEach(function (it, i) {
    ok(it.no === i + 1, id + ' 第' + (i + 1) + '题编号正确');
    ok(!!it.id && !!it.text && !!it.type, id + ' 条目结构完整');
    if (['radio', 'select', 'checkbox'].indexOf(it.type) >= 0) {
      ok(it.options && it.options.length >= 2, id + ' 第' + it.no + '题选项≥2');
      it.options.forEach(function (o) {
        ok(o.label !== undefined && o.value !== undefined, id + ' 第' + it.no + '题选项字段完整');
      });
    }
  });
  if (t.scoring && t.scoring.method && t.scoring.method !== 'none' && t.scoring.method !== 'formula') {
    ok((t.dimensions || []).length > 0, id + ' 计分量表应有维度定义');
  }
  if (t.scoring && t.scoring.method === 'formula') {
    ok(!!require(path.join(__dirname, '..', 'lib', 'scoring.js')).FORMULAS[t.scoring.formula], id + ' 引用的公式已注册');
  }
});

console.log('\n【2】极值计分与判读（每个量表用最小/最大答案各跑一次）');
TEMPLATES.forEach(function (t) {
  const mode = t.scoring && t.scoring.method;
  const rMin = scoreResponse(t, fill(t, 'min'));
  const rMax = scoreResponse(t, fill(t, 'max'));
  ok(rMin.completeness === 100 && rMax.completeness === 100, t.code + ' 全答后完成度 100%');
  if (mode === 'none') {
    ok(rMin.total === null, t.code + ' 不计分量表总分应为空');
    return;
  }
  if (mode === 'custom') {
    ok(rMax.total !== null, t.code + ' 专用计分可算出总分');
    return;
  }
  if (mode === 'formula') {
    ok(rMin.total !== null && rMax.total !== null, t.code + ' 公式计分在取值范围两端都能算出总分', [rMin.total, rMax.total]);
    return;
  }
  const range = t.scoring.totalRange;
  ok(rMin.total !== null && rMax.total !== null, t.code + ' 可算出总分');
  if (range) {
    const tol = 2;
    ok(rMin.total >= range[0] - tol && rMin.total <= range[1] + tol,
      t.code + ' 最小答案总分 ' + rMin.total + ' 在 ' + JSON.stringify(range) + ' 内');
    ok(rMax.total >= range[0] - tol && rMax.total <= range[1] + tol,
      t.code + ' 最大答案总分 ' + rMax.total + ' 在 ' + JSON.stringify(range) + ' 内');
  }
  ok(!rMin.cut || rMin.cut.label !== undefined, t.code + ' 最小答案可判读：' + (rMin.cut ? rMin.cut.label : '无分级'));
  ok(!rMax.cut || rMax.cut.label !== undefined, t.code + ' 最大答案可判读：' + (rMax.cut ? rMax.cut.label : '无分级'));
  // 必答题未答应被校验拦截
  const empty = scoreResponse(t, {});
  ok(validateAnswers(t, {}).length > 0, t.code + ' 空卷会被必答校验拦截');
});

console.log('\n【3】已知数值核对');
function T(code) { return TEMPLATES.find(function (t) { return t.code === code; }); }
function all(t, v) {
  const a = {};
  t.items.forEach(function (it) { a[it.id] = v; });
  return a;
}

let r = scoreResponse(T('phq-9'), all(T('phq-9'), 2));
ok(r.total === 18 && r.cut.label === '中重度抑郁', 'PHQ-9 全选2 = 18 分（中重度抑郁）', r);
r = scoreResponse(T('gad-7'), all(T('gad-7'), 3));
ok(r.total === 21 && r.cut.label === '重度焦虑', 'GAD-7 全选3 = 21 分（重度焦虑）');
r = scoreResponse(T('sas'), all(T('sas'), 1));
ok(r.total === 44 && r.cut.label === '无焦虑', 'SAS 全选"没有或很少" = 粗分35 → 标准分44（无焦虑）', r.total);
r = scoreResponse(T('sas'), all(T('sas'), 4));
ok(r.total === 81 && r.cut.label === '重度焦虑', 'SAS 全选"绝大部分时间" = 标准分81（重度焦虑）', r.total);
r = scoreResponse(T('sds'), all(T('sds'), 4));
ok(r.total === 63 && r.cut.label === '中度抑郁',
  'SDS 全选"绝大部分时间" = 粗分50（10个反向题）→ 标准分63（中度抑郁）', r.total);
r = scoreResponse(T('gds-15'), all(T('gds-15'), 1));
ok(r.total === 10, 'GDS-15 全部答"是" = 10 分（5个反向题不计分）', r.total);
const ssrsMax = fill(T('ssrs'), 'max');
T('ssrs').items.forEach(function (it) {
  if (it.type === 'checkbox') {
    // 多选：全部来源都选中 = 满分
    ssrsMax[it.id] = it.options.filter(function (o) { return Number(o.value) > 0; }).map(function (o) { return o.value; });
  }
});
r = scoreResponse(T('ssrs'), ssrsMax);
ok(r.total === 66, 'SSRS 全部最高分 = 66 分（量表满分核对）', r.total);
ok(r.dimensions.objective.score === 22 && r.dimensions.subjective.score === 32 && r.dimensions.utilize.score === 12,
  'SSRS 维度分：客观支持=22（4+9+9）、主观支持=32、利用度=12', r.dimensions);
r = scoreResponse(T('braden'), all(T('braden'), 1));
ok(r.total === 6 && r.cut.label === '极高危', 'Braden 全选最低 = 6 分（极高危）', r.total);
r = scoreResponse(T('morse-fall'), all(T('morse-fall'), 0));
ok(r.total === 0 && r.cut.label === '低风险', 'Morse 全选最小值 = 0 分（低风险）', r.total);
r = scoreResponse(T('barthel'), all(T('barthel'), 0));
ok(r.total === 0, 'Barthel 全选 0 分', r.total);
const barthelMax = {};
T('barthel').items.forEach(function (it) {
  const mx = it.options.reduce(function (a, b) { return Number(b.value) > Number(a.value) ? b : a; });
  barthelMax[it.id] = mx.value;
});
ok(scoreResponse(T('barthel'), barthelMax).total === 100, 'Barthel 各项最高分合计 = 100 分（满分核对）');
r = scoreResponse(T('whoqol-bref'), all(T('whoqol-bref'), 3));
ok(r.dimensions.phys.score === 12 && r.dimensions.envir.score === 12,
  'WHOQOL-BREF 全部选"一般" = 各领域 3×4 = 12 分（4-20 分制）', r.dimensions);
const { itemScore } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));
const wq3 = T('whoqol-bref').items.find(function (i) { return i.id === 'wq3'; });
ok(itemScore(wq3, 1, T('whoqol-bref').scoring) === 5 && itemScore(wq3, 5, T('whoqol-bref').scoring) === 1,
  'WHOQOL-BREF 反向条目正确反转（"完全没有妨碍"=5分，"极妨碍"=1分）');
r = scoreResponse(T('nrs-2002'), fill(T('nrs-2002'), 'max'));
ok(r.total === 7 && r.cut.label === '存在营养风险', 'NRS-2002 最高分 = 7（存在营养风险）', r.total);
r = scoreResponse(T('gcs'), all(T('gcs'), 1));
ok(r.total === 3, 'GCS 最低分 = 3 分（满分 15）', r.total);
r = scoreResponse(T('mmas-8'), all(T('mmas-8'), 1));
ok(r.total === 8 && r.cut.label === '高依从性', 'MMAS-8 全选最优 = 8 分（高依从性）', r.total);
r = scoreResponse(T('mmrc'), all(T('mmrc'), 4));
ok(r.total === 4 && r.cut.label === '症状较重', 'mMRC = 4 级（症状较重）', r.total);
r = scoreResponse(T('act-asthma'), all(T('act-asthma'), 5));
ok(r.total === 25 && r.cut.label === '哮喘完全控制', 'ACT = 25 分（完全控制）', r.total);
r = scoreResponse(T('cat-copd'), all(T('cat-copd'), 5));
ok(r.total === 40 && r.cut.label === '极严重影响', 'CAT = 40 分（极严重影响）', r.total);
r = scoreResponse(T('eat-10'), all(T('eat-10'), 1));
ok(r.total === 10 && r.cut.label === '存在吞咽异常风险', 'EAT-10 = 10 分（≥3 提示吞咽异常）', r.total);
r = scoreResponse(T('kubota'), all(T('kubota'), 2));
ok(r.total === 2 && r.cut.label === '可疑', '洼田饮水试验 2 级（可疑）', r.total);
r = scoreResponse(T('katz-adl'), all(T('katz-adl'), 1));
ok(r.total === 6 && r.cut.label === '完全独立', 'Katz ADL = 6 分（完全独立）', r.total);
r = scoreResponse(T('lawton-iadl'), all(T('lawton-iadl'), 1));
ok(r.total === 8 && r.cut.label === '完全独立', 'Lawton IADL = 8 分（完全独立）', r.total);
r = scoreResponse(T('fss'), all(T('fss'), 4));
ok(r.total === 4 && r.cut.label === '存在明显疲劳', 'FSS 均分 4 分（提示疲劳）', r.total);
r = scoreResponse(T('ipss'), all(T('ipss'), 5));
ok(r.total === 35 && r.cut.label === '重度症状', 'IPSS 症状条目 = 35 分（生活质量题不计入）', r.total);
r = scoreResponse(T('iciq-sf'), fill(T('iciq-sf'), 'max'));
ok(r.total === 21 && r.cut.label === '极重度尿失禁', 'ICIQ-SF = 21 分（第4题多选不计分）', r.total);

console.log('\n【4】PSQI 专用计分');
const psqiAns = {
  psq1: '23:30', psq2: 60, psq3: '07:00', psq4: 5,
  psq5a: 2, psq5b: 2, psq5c: 2, psq5d: 1, psq5e: 1, psq5f: 1, psq5g: 1, psq5h: 2, psq5i: 1, psq5j: 0,
  psq6: 2, psq7: 0, psq8: 2, psq9: 2,
};
r = scoreResponse(T('psqi'), psqiAns);
ok(r.psqi.inBedMinutes === 450, 'PSQI 卧床时间 = 450 分钟（23:30→07:00）', r.psqi.inBedMinutes);
ok(r.psqi.efficiency === 66.7, 'PSQI 睡眠效率 = 5/7.5 = 66.7%', r.psqi.efficiency);
ok(r.psqi.components.c4 === 2, 'PSQI 睡眠效率成分 = 2 分（65-74%）', r.psqi.components);
ok(r.total === 12 && r.cut.label === '睡眠质量差', 'PSQI 总分 = 12（睡眠质量差）', r.total);

console.log('\n【5】目录与分类');
ok(CATALOG.length >= 60, '量表目录收录 ' + CATALOG.length + ' 条');
ok(CATALOG.every(function (c) { return c.name && c.category && c.items && c.scoring && c.license; }),
  '目录条目字段完整（名称/分类/条目数/计分/授权）');
const cats = new Set(CATALOG.map(function (c) { return c.category; }));
ok(cats.size >= 8, '目录覆盖 ' + cats.size + ' 个分类');

console.log('\n———————————————————————————————');
console.log('  量表库自检：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('———————————————————————————————\n');
process.exit(fail ? 1 : 0);
