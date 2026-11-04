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

console.log('\n【5】SPSS 编码与缺失（共享纯函数）');
const logic = require(path.join(__dirname, '..', 'lib', 'logic.js'));
t.ok(typeof logic.spssCoding === 'function', '共享 SPSS/codebook 编码函数存在');
if (logic.spssCoding) {
  const item = { type: 'radio', options: [
    { value: 'F', label: '女', score: 99 }, { value: 1, label: '原编码1' },
    { value: 'M', label: '男' }, { value: '02', label: '原编码02' },
    { value: -1.5, label: '负数' }, { value: '1e-3', label: '科学计数' },
    { value: 'na', label: '不适用', na: true }, { value: 'un', label: '未知', score: null },
  ] };
  const before = JSON.stringify(item);
  const coding = logic.spssCoding(item);
  t.ok(coding.encode('F') === 3 && coding.encode('M') === 4, '字符串分类按定义顺序避开数值1和2，不输出医学分值');
  [1, '02', -1.5, '1e-3'].forEach(function (v) { t.ok(coding.encode(v) === v, '保留原始数值编码：' + v); });
  ['na', 'un', 'alien', '', ' ', undefined, null, NaN, Infinity, false, [], {}].forEach(function (v) {
    t.ok(coding.encode(v) === '', '缺失/未知/非法值导出空白：' + String(v));
  });
  t.ok(coding.codebook() === '女=3；原编码1=1；男=4；原编码02=02；负数=-1.5；科学计数=1e-3；不适用=缺失(空白)；未知=缺失(空白)', 'codebook 与导出使用同一映射', coding.codebook());
  t.ok(JSON.stringify(item) === before, '不修改题目定义');
  const checkbox = logic.spssCoding({ type: 'checkbox', options: [{ value: 'A', label: '甲' }, { value: 'B', label: '乙' }, { value: 'na', label: '不适用', na: true }] });
  [undefined, null, [], '', ['alien'], ['na'], ['A', 'alien'], ['A', 'na']].forEach(function (v) {
    t.ok(checkbox.checkbox(v, 'A') === '' && checkbox.checkbox(v, 'B') === '', '整题缺失/无效多选所有列空白：' + JSON.stringify(v));
  });
  t.ok(checkbox.checkbox(['A'], 'A') === 1 && checkbox.checkbox(['A'], 'B') === 0, '真实有效多选产生0/1');
  t.ok(require('../lib/scoring.js').validateAnswers({ items: [{ id: 'c', type: 'checkbox', options: [{ value: 'A', label: '甲' }] }] }, { c: 'A' }).length === 0 &&
    checkbox.checkbox('A', 'A') === 1 && checkbox.checkbox('A', 'B') === 0,
    '后端接受的单值多选答案也按0/1导出，不丢弃合法历史输入');
  t.ok(checkbox.checkbox(['A'], 'na') === '', '缺失选项列不输出编码');
  t.ok(/整题缺失.*空白/.test(checkbox.codebook('A')) && /缺失/.test(checkbox.codebook('na')), '多选 codebook 明确缺失规则');
  const numeric = logic.spssCoding({ type: 'number' });
  t.ok(numeric.encode('02') === '02' && numeric.encode('1e-3') === '1e-3' && numeric.encode(' ') === '' && numeric.encode(Infinity) === '', '连续变量保留编码但不输出NaN');
  const numericMissing = logic.spssCoding({ type: 'slider', options: [{ value: 99, label: '不适用', na: true }, { value: 98, label: '未知', score: null }] });
  t.ok(numericMissing.encode(99) === '' && numericMissing.encode('98') === '', '数值题定义中的缺失选项也导出空白');
  t.ok(require('node:fs').readFileSync(path.join(__dirname, '..', 'lib', 'logic.js'), 'utf8') === require('node:fs').readFileSync(path.join(__dirname, '..', 'public', 'logic.js'), 'utf8'), '前后端 logic.js 完全同步');
}

process.exit(t.done('CSV 公式注入防护与SPSS编码'));
