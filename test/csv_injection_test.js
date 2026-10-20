'use strict';
/**
 * CSV 公式注入：受试者在文本题填 =HYPERLINK(...) 等，研究者用 Excel 打开导出文件
 * 不应触发公式。纯数字（含负数、科学计数法）保持原样，避免把“变化值 -0.5”变成文本。
 */
const path = require('node:path');
const { makeCounter } = require('./helpers/http.js');
const { csvCell, csvRows } = require(path.join(__dirname, '..', 'core', 'http.js'));

const t = makeCounter();

console.log('\n【1】危险前缀一律前置单引号');
['=1+1', '+cmd', '@SUM(A1)', '-2+3', '\tTAB', '\rCR', ' =1+1'].forEach(function (s) {
  const out = csvCell(s);
  t.ok(out.charAt(0) === "'" || out.charAt(0) === '"' && out.charAt(1) === "'",
    JSON.stringify(s) + ' 被当作文本', out);
});

console.log('\n【2】纯数字保持原样');
['-0.5', '-12', '3.14', '1e-3', '-1.5E+2'].forEach(function (s) {
  t.ok(csvCell(s) === s, JSON.stringify(s) + ' 不被加引号前缀', csvCell(s));
});

console.log('\n【3】普通文本与 CSV 引号规则不受影响');
t.ok(csvCell('抑郁') === '抑郁', '普通中文原样输出');
t.ok(csvCell('a,b') === '"a,b"', '含逗号仍按 CSV 规则加引号', csvCell('a,b'));
t.ok(csvCell('=SUM(A1,B1)') === '"\'=SUM(A1,B1)"', '含逗号且以 = 开头：先加单引号再整体加引号',
  csvCell('=SUM(A1,B1)'));
t.ok(csvCell('') === '', '空值仍为空');
t.ok(csvCell(null) === '', 'null 仍为空');
t.ok(csvCell(['=1', '2']) === "'=1|2", '数组拼接后按前缀规则处理', csvCell(['=1', '2']));

console.log('\n【4】整表导出带 BOM/CRLF');
const out = csvRows([['名称', '值'], ['=HYPERLINK("http://x")', 1]]);
t.ok(out.indexOf('\ufeff') === 0, '保留 UTF-8 BOM');
t.ok(out.indexOf('\r\n') > 0, '保留 CRLF 行分隔');
t.ok(out.indexOf("'=HYPERLINK") > 0, '导出表格中的公式被前置单引号', out);

process.exit(t.done('CSV 公式注入防护'));
