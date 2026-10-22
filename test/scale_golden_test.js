'use strict';
/**
 * 量表黄金值：每个修正过或新增的量表至少一条，取自原始文献示例或按原文规则手算。
 * 每条用例的 note 写明出处，方便复核。
 */
const path = require('node:path');
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));
const { scoreResponse } = require(path.join(__dirname, '..', 'lib', 'scoring.js'));
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();

function T(code) { return TEMPLATES.find(function (x) { return x.code === code; }); }
function allAs(tpl, v) { const a = {}; tpl.items.forEach(function (it) { a[it.id] = v; }); return a; }

const CASES = [
  { code: 'phq-9', answers: function (s) { return allAs(s, 2); }, total: 18, cut: '中重度抑郁',
    note: 'Kroenke 2001：15-19 为中重度抑郁' },
  { code: 'gad-7', answers: function (s) { return allAs(s, 1); }, total: 7, cut: '轻度焦虑',
    note: 'Spitzer 2006：5-9 为轻度焦虑' },
  { code: 'child-pugh', answers: function () { return { bili: 20, alb: 40, inr: 1.2, ascites: 1, he: 1 }; },
    total: 5, cut: 'A 级', note: 'Pugh 1973：五项最轻档合计 5 分为 A 级' },
  { code: 'child-pugh', answers: function () { return { bili: 34, alb: 35, inr: 1.7, ascites: 1, he: 1 }; },
    total: 8, cut: 'B 级', note: 'Pugh 1973：胆红素 34、白蛋白 35、INR 1.7 恰在 2 分档下界，合计 8 分为 B 级' },
  { code: 'child-pugh', answers: function () { return { bili: 51, alb: 27, inr: 2.4, ascites: 3, he: 3 }; },
    total: 15, cut: 'C 级', note: 'Pugh 1973：五项最重档合计 15 分为 C 级' },
  { code: 'meld', answers: function () { return { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0 }; },
    total: 25, cut: '20-29 分', note: 'OPTN/UNOS 2016：胆红素 3 mg/dL、INR 2、肌酐 2 mg/dL' },
  { code: 'meld-na', answers: function () { return { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0, na: 130 }; },
    total: 28, cut: '20-29 分', note: 'OPTN/UNOS 2016 血钠校正：MELD 25 + Na 130' },
];

console.log('\n【黄金值】' + CASES.length + ' 条');
CASES.forEach(function (c) {
  const tpl = T(c.code);
  if (!tpl) { t.ok(false, c.code + ' 模板存在'); return; }
  const r = scoreResponse(tpl, c.answers(tpl));
  t.ok(r.total === c.total, c.code + ' 总分 ' + c.total + '（' + c.note + '）', r.total);
  if (c.cut !== undefined) t.ok((r.cut ? r.cut.label : null) === c.cut, c.code + ' 分级「' + c.cut + '」', r.cut);
});

process.exit(t.done('量表黄金值'));
