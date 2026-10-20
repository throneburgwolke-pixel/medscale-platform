'use strict';
/**
 * 统计模块：黄金标准数值 + 退化输入。
 * 目标：与教科书临界值对齐；空值/零方差/共线数据不得产出 NaN 或越界系数。
 */
const path = require('node:path');
const S = require(path.join(__dirname, '..', 'lib', 'stats.js'));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function near(v, target, tol, label) {
  ok(typeof v === 'number' && Math.abs(v - target) <= tol, label, v);
}
function noNaN(v, label) {
  let bad = false;
  (function walk(x) {
    if (typeof x === 'number' && !Number.isFinite(x)) bad = true;
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.keys(x).forEach(function (k) { walk(x[k]); });
  })(v);
  ok(!bad, label, v);
}

console.log('\n【1】分布函数与临界值对齐教科书');
near(S.tTwoSidedP(2.228, 10), 0.05, 0.0005, 't 双侧：t=2.228, df=10 → P≈0.05');
near(S.tTwoSidedP(1.96, 1e6), 0.05, 0.0005, 't 双侧：t=1.96, df→∞ → P≈0.05');
near(S.chiSquareP(3.841, 1), 0.05, 0.0005, 'χ²：3.841, df=1 → P≈0.05');
near(S.fPValue(4.9646, 1, 10), 0.05, 0.0005, 'F：4.9646, df=1,10 → P≈0.05');
near(S.tCritical95(10), 2.228, 0.001, 't 临界值 df=10 → 2.228');
near(S.tCritical95(120), 1.9799, 0.001, 't 临界值 df=120 → 1.9799，不得再用 1.96 兜底');
near(S.tCritical95(1000), 1.9623, 0.001, 't 临界值 df=1000 → 1.9623');

console.log('\n【2】检验结果对齐黄金标准');
let r = S.tTest([1, 2, 3, 4], [5, 6, 7, 8]);
near(r.t, -4.3818, 0.01, 'Welch t：两组 1–4 与 5–8 → t≈-4.382');
near(r.df, 6, 0.01, 'Welch t：df=6');
ok(r.p > 0.003 && r.p < 0.006, 'Welch t：P≈0.0047', r.p);
near(r.cohensD, -3.098, 0.01, 'Welch t：Cohen\'s d≈-3.098');

r = S.pairedTTest([1, 2, 3, 4], [2, 4, 6, 8]);
near(r.t, -3.873, 0.01, '配对 t：差值 -1..-4 → t≈-3.873');
ok(r.p > 0.02 && r.p < 0.04, '配对 t：P≈0.030', r.p);

r = S.oneWayAnova([
  { name: 'A', data: [1, 2, 3] },
  { name: 'B', data: [4, 5, 6] },
  { name: 'C', data: [7, 8, 9] },
]);
near(r.F, 27, 0.001, 'ANOVA：三组 1–9 → F=27');
near(r.etaSq, 0.9, 0.001, 'ANOVA：η²=0.9');
ok(r.p < 0.01, 'ANOVA：P<0.01', r.p);

r = S.mannWhitneyU([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
ok(r.u === 0, 'Mann-Whitney：完全分离 → U=0', r.u);
ok(r.p > 0.005 && r.p < 0.02, 'Mann-Whitney：正态近似 P≈0.012', r.p);

r = S.wilcoxon([1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7]);
ok(r.w === 0 && r.p < 0.01, 'Wilcoxon：全部差值 +1 → W=0，P<0.01', r);

r = S.kruskalWallis([
  { name: 'A', data: [1, 2, 3] },
  { name: 'B', data: [4, 5, 6] },
  { name: 'C', data: [7, 8, 9] },
]);
near(r.h, 7.2, 0.001, 'Kruskal-Wallis：H=7.2');
near(r.p, 0.0273, 0.001, 'Kruskal-Wallis：P≈0.027');

r = S.chiSquareTest([[20, 30], [30, 20]]);
near(r.chi2, 4, 0.001, 'χ² 列联表：2×2 交叉表 χ²=4');
near(r.p, 0.0455, 0.001, 'χ² 列联表：P≈0.046');
near(r.cramersV, 0.2, 0.001, 'χ² 列联表：Cramér\'s V=0.2');

console.log('\n【3】零方差/零差值不得静默产出 NaN');
r = S.tTest([5, 5, 5], [1, 1, 1]);
ok(r.t === null && r.p === null, 't 检验两组均无变异 → t/P 为 null', r);
ok(r.reason === 'zero_variance', 't 检验标记 reason=zero_variance', r.reason);
noNaN(r, 't 检验零方差结果不含 NaN');

r = S.pairedTTest([3, 3, 3], [3, 3, 3]);
ok(r.t === null && r.p === null, '配对 t 差值恒为 0 → t/P 为 null', r);
ok(r.reason === 'zero_variance', '配对 t 标记 reason=zero_variance', r.reason);
noNaN(r, '配对 t 零方差结果不含 NaN');

r = S.oneWayAnova([{ name: 'A', data: [5, 5, 5] }, { name: 'B', data: [5, 5, 5] }]);
ok(r.F === null && r.p === null, 'ANOVA 组内零方差 → F/P 为 null', r);
ok(r.reason === 'zero_variance', 'ANOVA 标记 reason=zero_variance', r.reason);

console.log('\n【4】相关系数边界');
r = S.pearson([1, 2, 3], [2, 4, 6]);
ok(r.r === 1 && r.p === 0, '完全正相关 → r=1，P=0', r);
r = S.pearson([1, 2, 3], [3, 2, 1]);
ok(r.r === -1 && r.p === 0, '完全负相关 → r=-1，P=0', r);
ok(r.r >= -1 && r.r <= 1, '相关系数不越界', r.r);

console.log('\n【5】信度：空字符串按缺失处理，矩阵必须等长');
r = S.cronbachAlpha([[1, 2], [3, ''], [2, 4], [4, 5], [5, 3]]);
ok(r.n === 4, '含空字符串的行不计入完整答卷（n=4）', r.n);
near(r.alpha, 0.571, 0.002, '空字符串不得当作 0 计分（α=0.571）');

r = S.cronbachAlpha([[1, 2, 3], [2, 3, 4], [3, 4, 5], [1, 2]]);
ok(r.n === 3 && r.k === 3, '长度不一致的行被剔除（n=3, k=3）', r);
near(r.alpha, 1, 0.001, '等长完整行 α=1');

r = S.cronbachAlpha([[1, ''], [2, ''], [3, '']]);
ok(r.alpha === null && r.n === 0, '整列缺失时 α=null，不得把空串当 0', r);

console.log('\n【6】分半信度：奇数题量与负相关');
const five = [
  [1, 3, 1, 3, 11],
  [3, 5, 2, 5, 6],
  [5, 7, 3, 7, 3],
  [7, 9, 4, 9, 1],
];
r = S.splitHalf(five);
ok(r.r === 1 && r.sb === 1, '奇数题量截去末题后两半等长（r=1, SB=1）', r);

const neg = [
  [1, 4, 1, 6],
  [2, 3, 3, 4],
  [4, 2, 4, 2],
  [5, 1, 6, 5],
];
r = S.splitHalf(neg);
near(r.r, -0.775, 0.002, '分半相关 r≈-0.775');
ok(r.sb !== null && r.sb >= -1 && r.sb <= 1, 'Spearman-Brown 结果必须落在 [-1,1]', r.sb);

console.log('\n【7】描述统计的退化输入与频率分母');
r = S.describe([]);
ok(r.n === 0, '空样本 n=0', r);
r = S.describe([5]);
ok(r.n === 1 && r.mean === 5 && r.sd === null, '单样本：均值可算，SD/CI 为 null', r);
noNaN(r, '单样本描述统计不含 NaN');
r = S.describe([1, 2, 3, 4, 5]);
near(r.ci95[0], 1.037, 0.002, '95%CI 下限≈1.037');
near(r.ci95[1], 4.963, 0.002, '95%CI 上限≈4.963');

r = S.frequency(['a', 'a', '', null]);
ok(r.total === 2, '频率表分母只计有效回答（total=2）', r);
ok(r.missing === 2, '缺失数仍单独统计（missing=2）', r);
ok(r.items.length === 1 && r.items[0].pct === 100, '有效回答中 a 占 100%', r.items);

console.log('\n———————————————————————————————');
console.log('  统计黄金标准：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('———————————————————————————————\n');
process.exit(fail);
