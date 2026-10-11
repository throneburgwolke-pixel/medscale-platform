'use strict';
/**
 * 统计分析模块（零依赖实现）
 * 描述性统计 / 信度 / 相关 / t 检验 / 方差分析 / 卡方检验
 */

/* ---------------- 基础数学 ---------------- */
const LOG_GAMMA_C = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
];

function logGamma(x) {
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += LOG_GAMMA_C[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** 正则化不完全贝塔函数 I_x(a,b) */
function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

/** 上不完全伽马函数 Q(a,x) */
function gammaq(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  if (x < a + 1) {
    // 级数展开求 P(a,x)
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 500; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // 连分式求 Q(a,x)
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** t 分布双侧 p 值 */
function tTwoSidedP(t, df) {
  if (!Number.isFinite(t) || df <= 0) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

/** F 分布上侧 p 值 */
function fPValue(F, df1, df2) {
  if (!Number.isFinite(F) || df1 <= 0 || df2 <= 0 || F <= 0) return NaN;
  return betai(df2 / 2, df1 / 2, df2 / (df2 + df1 * F));
}

/** 卡方分布上侧 p 值 */
function chiSquareP(chi2, df) {
  if (!Number.isFinite(chi2) || df <= 0) return NaN;
  return gammaq(df / 2, chi2 / 2);
}

/** 正态分布 CDF（Abramowitz-Stegun 近似） */
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? p : 1 - p;
}

/* ---------------- 描述统计 ---------------- */
function clean(arr) {
  return (arr || []).filter(function (v) { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)); })
    .map(Number);
}

function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
function mean(a) { return a.length ? sum(a) / a.length : NaN; }

function variance(a, sample) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  const ss = a.reduce(function (acc, v) { return acc + (v - m) * (v - m); }, 0);
  return ss / ((sample === false ? a.length : a.length - 1));
}

function sd(a) { return Math.sqrt(variance(a)); }

function quantile(a, p) {
  if (!a.length) return NaN;
  const s = a.slice().sort(function (x, y) { return x - y; });
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function skewness(a) {
  const n = a.length;
  if (n < 3) return NaN;
  const m = mean(a);
  const s = Math.sqrt(variance(a, false));
  if (!s) return 0;
  const m3 = a.reduce(function (acc, v) { return acc + Math.pow((v - m) / s, 3); }, 0);
  return n / ((n - 1) * (n - 2)) * m3;
}

function kurtosis(a) {
  const n = a.length;
  if (n < 4) return NaN;
  const m = mean(a);
  const s = Math.sqrt(variance(a, false));
  if (!s) return 0;
  const m4 = a.reduce(function (acc, v) { return acc + Math.pow((v - m) / s, 4); }, 0);
  return (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * m4 - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
}

function describe(raw) {
  const a = clean(raw);
  const n = a.length;
  if (!n) return { n: 0 };
  const m = mean(a);
  const s = sd(a);
  const se = s / Math.sqrt(n);
  const tCrit = tCritical95(n - 1);
  return {
    n: n,
    mean: round(m, 3),
    sd: round(s, 3),
    se: round(se, 3),
    min: round(Math.min.apply(null, a), 3),
    max: round(Math.max.apply(null, a), 3),
    median: round(quantile(a, 0.5), 3),
    q1: round(quantile(a, 0.25), 3),
    q3: round(quantile(a, 0.75), 3),
    iqr: round(quantile(a, 0.75) - quantile(a, 0.25), 3),
    skew: round(skewness(a), 3),
    kurt: round(kurtosis(a), 3),
    ci95: [round(m - tCrit * se, 3), round(m + tCrit * se, 3)],
  };
}

/** t 分布 95% 临界值（常用自由度查表 + 插值） */
function tCritical95(df) {
  const table = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
    9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074,
    23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045,
    30: 2.042, 40: 2.021, 50: 2.009, 60: 2.000, 80: 1.990, 100: 1.984, 120: 1.980,
  };
  if (df <= 0) return NaN;
  const keys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
  if (df >= 120) return 1.96;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (df >= keys[i] && df <= keys[i + 1]) {
      const x0 = keys[i];
      const x1 = keys[i + 1];
      const y0 = table[x0];
      const y1 = table[x1];
      return y0 + (y1 - y0) * (df - x0) / (x1 - x0);
    }
  }
  return 1.96;
}

function round(v, d) {
  if (!Number.isFinite(v)) return null;
  const p = Math.pow(10, d === undefined ? 3 : d);
  return Math.round(v * p) / p;
}

/** 频数表（分类/等级变量） */
function frequency(values, options) {
  const map = new Map();
  let missing = 0;
  (values || []).forEach(function (v) {
    if (v === null || v === undefined || v === '') { missing += 1; return; }
    const arr = Array.isArray(v) ? v : [v];
    arr.forEach(function (x) {
      const k = String(x);
      map.set(k, (map.get(k) || 0) + 1);
    });
  });
  const total = (values || []).length;
  const items = Array.from(map.entries()).map(function (e) {
    const labelHit = (options || []).find(function (o) { return String(o.value) === e[0]; });
    return {
      value: e[0],
      label: labelHit ? labelHit.label : e[0],
      count: e[1],
      pct: total ? round(e[1] / total * 100, 1) : null,
    };
  });
  items.sort(function (a, b) { return b.count - a.count; });
  return { total: total, missing: missing, items: items };
}

/* ---------------- 信度 ---------------- */
/** Cronbach's alpha，输入为“列=题目，行=被试”的二维数组 */
function cronbachAlpha(matrix) {
  const rows = (matrix || []).filter(function (r) {
    return r.length && r.every(function (v) { return v !== null && Number.isFinite(Number(v)); });
  });
  const k = rows.length ? rows[0].length : 0;
  if (k < 2 || rows.length < 2) return { alpha: null, n: rows.length, k: k };
  const itemVars = [];
  for (let j = 0; j < k; j += 1) itemVars.push(variance(rows.map(function (r) { return Number(r[j]); })));
  const totals = rows.map(function (r) { return r.reduce(function (a, b) { return a + Number(b); }, 0); });
  const totalVar = variance(totals);
  if (!totalVar) return { alpha: null, n: rows.length, k: k };
  const alpha = k / (k - 1) * (1 - sum(itemVars) / totalVar);
  return { alpha: round(alpha, 3), n: rows.length, k: k };
}

/** 分半信度（奇偶分半 + Spearman-Brown 校正） */
function splitHalf(matrix) {
  const rows = (matrix || []).filter(function (r) {
    return r.length && r.every(function (v) { return v !== null && Number.isFinite(Number(v)); });
  });
  const k = rows.length ? rows[0].length : 0;
  if (k < 4) return { r: null, sb: null, n: rows.length };
  const odd = rows.map(function (r) { return r.filter(function (_, i) { return i % 2 === 0; }).reduce(function (a, b) { return a + Number(b); }, 0); });
  const even = rows.map(function (r) { return r.filter(function (_, i) { return i % 2 === 1; }).reduce(function (a, b) { return a + Number(b); }, 0); });
  const r = pearson(odd, even).r;
  return { r: round(r, 3), sb: round(2 * r / (1 + r), 3), n: rows.length };
}

/** 校正后题总相关（CITC） */
function itemTotalStats(matrix, itemIds) {
  const rows = (matrix || []).filter(function (r) {
    return r.length && r.every(function (v) { return v !== null && Number.isFinite(Number(v)); });
  });
  if (!rows.length) return [];
  const k = rows[0].length;
  return Array.from({ length: k }).map(function (_, j) {
    const x = rows.map(function (r) { return Number(r[j]); });
    const rest = rows.map(function (r) {
      return r.reduce(function (a, b, i) { return i === j ? a : a + Number(b); }, 0);
    });
    const corr = pearson(x, rest).r;
    const alphaDrop = cronbachAlpha(rows.map(function (r) { return r.filter(function (_, i) { return i !== j; }); })).alpha;
    return {
      itemId: itemIds ? itemIds[j] : String(j + 1),
      mean: round(mean(x), 2),
      sd: round(sd(x), 2),
      citc: round(corr, 3),
      alphaIfDeleted: alphaDrop,
    };
  });
}

/* ---------------- 相关分析 ---------------- */
function pearson(x, y) {
  const pairs = [];
  const n = Math.min((x || []).length, (y || []).length);
  for (let i = 0; i < n; i += 1) {
    const a = Number(x[i]);
    const b = Number(y[i]);
    if (Number.isFinite(a) && x[i] !== null && x[i] !== '' && Number.isFinite(b) && y[i] !== null && y[i] !== '') pairs.push([a, b]);
  }
  const m = pairs.length;
  if (m < 3) return { r: null, p: null, n: m };
  const mx = mean(pairs.map(function (p) { return p[0]; }));
  const my = mean(pairs.map(function (p) { return p[1]; }));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  pairs.forEach(function (p) {
    sxy += (p[0] - mx) * (p[1] - my);
    sxx += (p[0] - mx) * (p[0] - mx);
    syy += (p[1] - my) * (p[1] - my);
  });
  if (!sxx || !syy) return { r: null, p: null, n: m };
  const r = sxy / Math.sqrt(sxx * syy);
  if (Math.abs(r) >= 1) return { r: round(r, 3), p: 0, n: m };
  const t = r * Math.sqrt((m - 2) / (1 - r * r));
  return { r: round(r, 3), p: round(tTwoSidedP(t, m - 2), 4), n: m };
}

function rank(a) {
  const idx = a.map(function (v, i) { return [v, i]; }).sort(function (p, q) { return p[0] - q[0]; });
  const out = new Array(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/** 秩和检验的秩（含并列平均秩）与并列校正项 */
function rankedWithTies(values) {
  const idx = values.map(function (v, i) { return { v: v, i: i }; })
    .sort(function (p, q) { return p.v - q.v; });
  const ranks = new Array(values.length);
  let tieSum = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[idx[k].i] = avg;
    const t = j - i + 1;
    if (t > 1) tieSum += t * t * t - t;
    i = j + 1;
  }
  return { ranks: ranks, tieSum: tieSum };
}

/** Mann-Whitney U 检验（正态近似 + 并列校正） */
function mannWhitneyU(a, b) {
  const x = clean(a);
  const y = clean(b);
  const n1 = x.length;
  const n2 = y.length;
  if (n1 < 3 || n2 < 3) return { u: null, p: null, n1: n1, n2: n2 };
  const r = rankedWithTies(x.concat(y));
  let r1 = 0;
  for (let i = 0; i < n1; i += 1) r1 += r.ranks[i];
  const u1 = r1 - n1 * (n1 + 1) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const n = n1 + n2;
  const mu = n1 * n2 / 2;
  const sigma = Math.sqrt(n1 * n2 / 12 * ((n + 1) - r.tieSum / (n * (n - 1))));
  if (!sigma) return { u: u, p: null, n1: n1, n2: n2 };
  const z = (u1 - mu >= 0 ? u1 - mu - 0.5 : u1 - mu + 0.5) / sigma;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return {
    u: round(u, 1),
    z: round(z, 3),
    p: round(Math.min(1, p), 4),
    n1: n1,
    n2: n2,
    median1: round(quantile(x, 0.5), 3),
    median2: round(quantile(y, 0.5), 3),
    effectR: round(Math.abs(z) / Math.sqrt(n), 3),
  };
}

/** Kruskal-Wallis H 检验（多组秩和，卡方近似） */
function kruskalWallis(groups) {
  const gs = (groups || []).map(function (g) { return clean(g.data); }).filter(function (g) { return g.length >= 2; });
  if (gs.length < 3) return { h: null, p: null };
  const all = [];
  const groupIdx = [];
  gs.forEach(function (g, gi) {
    g.forEach(function (v) { all.push(v); groupIdx.push(gi); });
  });
  const r = rankedWithTies(all);
  const n = all.length;
  const rankSums = new Array(gs.length).fill(0);
  r.ranks.forEach(function (rk, i) { rankSums[groupIdx[i]] += rk; });
  let h = 0;
  gs.forEach(function (g, gi) {
    h += rankSums[gi] * rankSums[gi] / g.length;
  });
  h = 12 / (n * (n + 1)) * h - 3 * (n + 1);
  const correction = 1 - r.tieSum / (n * n * n - n);
  if (correction > 0) h /= correction;
  return { h: round(h, 3), df: gs.length - 1, p: round(chiSquareP(h, gs.length - 1), 4), n: n };
}

function spearman(x, y) {
  const px = [];
  const py = [];
  const n = Math.min((x || []).length, (y || []).length);
  for (let i = 0; i < n; i += 1) {
    const a = Number(x[i]);
    const b = Number(y[i]);
    if (Number.isFinite(a) && Number.isFinite(b) && x[i] !== null && x[i] !== '' && y[i] !== null && y[i] !== '') {
      px.push(a);
      py.push(b);
    }
  }
  if (px.length < 3) return { r: null, p: null, n: px.length };
  return pearson(rank(px), rank(py));
}

/* ---------------- 组间比较 ---------------- */
/** 独立样本 t 检验（Welch 校正） */
function tTest(a, b) {
  const x = clean(a);
  const y = clean(b);
  if (x.length < 2 || y.length < 2) return { t: null, df: null, p: null };
  const m1 = mean(x);
  const m2 = mean(y);
  const v1 = variance(x);
  const v2 = variance(y);
  const se = Math.sqrt(v1 / x.length + v2 / y.length);
  if (!se) return { t: null, df: null, p: null };
  const t = (m1 - m2) / se;
  const df = Math.pow(v1 / x.length + v2 / y.length, 2) /
    (Math.pow(v1 / x.length, 2) / (x.length - 1) + Math.pow(v2 / y.length, 2) / (y.length - 1));
  const sp = Math.sqrt(((x.length - 1) * v1 + (y.length - 1) * v2) / (x.length + y.length - 2));
  const d = sp ? (m1 - m2) / sp : null;
  return {
    t: round(t, 3),
    df: round(df, 2),
    p: round(tTwoSidedP(t, df), 4),
    mean1: round(m1, 3),
    mean2: round(m2, 3),
    sd1: round(Math.sqrt(v1), 3),
    sd2: round(Math.sqrt(v2), 3),
    n1: x.length,
    n2: y.length,
    diff: round(m1 - m2, 3),
    ci95: [round(m1 - m2 - tCritical95(df) * se, 3), round(m1 - m2 + tCritical95(df) * se, 3)],
    cohensD: round(d, 3),
  };
}

/** 配对样本 t 检验 */
function pairedTTest(a, b) {
  const d = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (Number.isFinite(x) && Number.isFinite(y) && a[i] !== null && a[i] !== '' && b[i] !== null && b[i] !== '') d.push(x - y);
  }
  if (d.length < 2) return { t: null, df: null, p: null };
  const md = mean(d);
  const sdd = sd(d);
  const t = md / (sdd / Math.sqrt(d.length));
  return {
    t: round(t, 3),
    df: d.length - 1,
    p: round(tTwoSidedP(t, d.length - 1), 4),
    meanDiff: round(md, 3),
    sdDiff: round(sdd, 3),
    n: d.length,
  };
}

/** Wilcoxon 符号秩检验（配对，正态近似 + 并列校正 + 零差值处理） */
function wilcoxonSignedRank(a, b) {
  const diffs = [];
  const n = Math.min((a || []).length, (b || []).length);
  for (let i = 0; i < n; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (a[i] === null || a[i] === '' || b[i] === null || b[i] === '') continue;
    diffs.push(x - y);
  }
  const nonZero = diffs.filter(function (d) { return d !== 0; });
  const nz = nonZero.length;
  if (nz < 5) return { w: null, p: null, n: diffs.length, nNonZero: nz };
  const abs = nonZero.map(Math.abs);
  const r = rankedWithTies(abs);
  let wPlus = 0;
  let wMinus = 0;
  nonZero.forEach(function (d, i) {
    if (d > 0) wPlus += r.ranks[i]; else wMinus += r.ranks[i];
  });
  const w = Math.min(wPlus, wMinus);
  // E(W+) = Σr/2，Var(W+) = Σr²/4（对并列取平均秩时同样成立）
  let rankSum = 0;
  let rankSqSum = 0;
  for (let i = 0; i < nz; i += 1) {
    rankSum += r.ranks[i];
    rankSqSum += r.ranks[i] * r.ranks[i];
  }
  const mu = rankSum / 2;
  const sigma = Math.sqrt(rankSqSum / 4);
  if (!sigma) return { w: w, p: null, n: diffs.length, nNonZero: nz };
  const z = (Math.abs(w - mu) - 0.5) / sigma;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return {
    w: round(w, 1),
    z: round(z, 3),
    p: round(Math.min(1, Math.max(0, p)), 4),
    n: diffs.length,
    nNonZero: nz,
    medianDiff: round(quantile(diffs, 0.5), 3),
    effectR: round(Math.abs(z) / Math.sqrt(nz), 3),
  };
}

/** 单因素方差分析 */
function oneWayAnova(groups) {
  const gs = (groups || []).map(function (g) { return { name: g.name, data: clean(g.data) }; })
    .filter(function (g) { return g.data.length >= 2; });
  if (gs.length < 2) return { F: null, p: null };
  const all = gs.reduce(function (acc, g) { return acc.concat(g.data); }, []);
  const grand = mean(all);
  const N = all.length;
  const k = gs.length;
  const ssb = gs.reduce(function (acc, g) { return acc + g.data.length * Math.pow(mean(g.data) - grand, 2); }, 0);
  const ssw = gs.reduce(function (acc, g) {
    return acc + g.data.reduce(function (a, v) { return a + Math.pow(v - mean(g.data), 2); }, 0);
  }, 0);
  const df1 = k - 1;
  const df2 = N - k;
  if (df1 < 1 || df2 < 1 || !ssw) return { F: null, p: null };
  const msb = ssb / df1;
  const msw = ssw / df2;
  const F = msb / msw;
  return {
    F: round(F, 3),
    df1: df1,
    df2: df2,
    p: round(fPValue(F, df1, df2), 4),
    etaSq: round(ssb / (ssb + ssw), 3),
    groups: gs.map(function (g) {
      return { name: g.name, n: g.data.length, mean: round(mean(g.data), 3), sd: round(sd(g.data), 3) };
    }),
  };
}

/** 卡方检验（列联表） */
function chiSquareTest(table) {
  const rows = (table || []).filter(function (r) { return r.length; });
  if (rows.length < 2 || rows[0].length < 2) return { chi2: null, p: null };
  const nRows = rows.length;
  const nCols = rows[0].length;
  const rowSums = rows.map(function (r) { return sum(r); });
  const colSums = [];
  for (let j = 0; j < nCols; j += 1) colSums.push(sum(rows.map(function (r) { return r[j]; })));
  const N = sum(rowSums);
  if (!N) return { chi2: null, p: null };
  let chi2 = 0;
  let minExpected = Infinity;
  for (let i = 0; i < nRows; i += 1) {
    for (let j = 0; j < nCols; j += 1) {
      const e = rowSums[i] * colSums[j] / N;
      if (e < minExpected) minExpected = e;
      if (e > 0) chi2 += Math.pow(rows[i][j] - e, 2) / e;
    }
  }
  const df = (nRows - 1) * (nCols - 1);
  const cramersV = Math.sqrt(chi2 / (N * Math.min(nRows - 1, nCols - 1)));
  return {
    chi2: round(chi2, 3),
    df: df,
    p: round(chiSquareP(chi2, df), 4),
    n: N,
    minExpected: round(minExpected, 2),
    cramersV: round(cramersV, 3),
    warning: minExpected < 5 ? '存在理论频数<5的格子，卡方检验结果需谨慎（建议使用 Fisher 精确检验或合并类别）。' : null,
  };
}

module.exports = {
  mean: mean,
  sd: sd,
  variance: variance,
  median: function (a) { return quantile(clean(a), 0.5); },
  quantile: quantile,
  describe: describe,
  frequency: frequency,
  cronbachAlpha: cronbachAlpha,
  splitHalf: splitHalf,
  itemTotalStats: itemTotalStats,
  pearson: pearson,
  spearman: spearman,
  tTest: tTest,
  pairedTTest: pairedTTest,
  wilcoxon: wilcoxonSignedRank,
  oneWayAnova: oneWayAnova,
  mannWhitneyU: mannWhitneyU,
  kruskalWallis: kruskalWallis,
  chiSquareTest: chiSquareTest,
  tTwoSidedP: tTwoSidedP,
  fPValue: fPValue,
  chiSquareP: chiSquareP,
  normCdf: normCdf,
  round: round,
};
