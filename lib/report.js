'use strict';
/**
 * 统计分析报告生成
 * 输入：量表定义 + 全部答卷，输出结构化统计结果（供前端渲染与导出）
 */
const S = require('./stats.js');
const SC = require('./scoring.js');
const { answerLabel } = require('./logic.js');

const SCOREABLE = ['radio', 'select', 'checkbox', 'number', 'slider'];

function isScoreable(item) {
  return SCOREABLE.indexOf(item.type) >= 0;
}

function buildMatrix(scale, responses) {
  // 与 scoring.js 的计分条目保持一致：exclude 条目（人口学变量）不进信度矩阵
  const ids = (scale.items || []).filter(function (i) { return isScoreable(i) && !i.exclude; })
    .map(function (i) { return i.id; });
  const rows = responses.map(function (r) {
    return ids.map(function (id) {
      const it = scale.items.find(function (x) { return x.id === id; });
      const v = SC.itemScore(it, r.answers ? r.answers[id] : undefined, scale.scoring);
      return v === null ? null : v;
    });
  });
  return { ids: ids, rows: rows };
}

/** 每题统计 */
function itemLevel(scale, responses) {
  return (scale.items || []).map(function (item) {
    const values = responses.map(function (r) { return r.answers ? r.answers[item.id] : undefined; });
    const answered = values.filter(function (v) {
      return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
    }).length;
    const base = {
      itemId: item.id,
      no: item.no,
      text: item.text,
      type: item.type,
      answered: answered,
      missing: responses.length - answered,
      missingPct: responses.length ? S.round((responses.length - answered) / responses.length * 100, 1) : null,
      dimension: item.dimension || null,
    };
    if (item.type === 'radio' || item.type === 'select' || item.type === 'checkbox') {
      return Object.assign(base, {
        kind: 'category',
        freq: S.frequency(values, item.options),
      });
    }
    if (item.type === 'number' || item.type === 'slider') {
      const nums = values.map(function (v) { return v === '' ? null : v; });
      const numsOnly = nums.filter(function (v) { return v !== undefined; });
      return Object.assign(base, { kind: 'numeric', stats: S.describe(numsOnly) });
    }
    if (item.type === 'time') {
      return Object.assign(base, { kind: 'text', examples: values.slice(0, 5) });
    }
    const texts = values.filter(function (v) { return v !== undefined && v !== null && v !== ''; });
    return Object.assign(base, {
      kind: 'text',
      filled: texts.length,
      examples: texts.slice(0, 8),
    });
  });
}

/** 总分与维度得分 */
function scoreLevel(scale, responses) {
  const scoring = scale.scoring || {};
  const rows = responses.map(function (r) { return r.scores || {}; });
  const total = rows.map(function (s) { return s.total; });
  const out = {
    method: scoring.method || 'none',
    total: S.describe(total),
    totalRange: scoring.totalRange || null,
    dimensions: [],
    cutoffs: [],
  };

  // 维度得分
  const dimIds = Object.keys(rows.reduce(function (acc, s) {
    Object.keys(s.dimensions || {}).forEach(function (k) { acc[k] = 1; });
    return acc;
  }, {}));
  out.dimensions = dimIds.map(function (id) {
    const vals = rows.map(function (s) {
      const d = (s.dimensions || {})[id];
      return d ? d.score : null;
    });
    const meta = (scale.dimensions || []).find(function (d) { return d.id === id; }) || {};
    return {
      id: id,
      name: meta.name || id,
      itemCount: (meta.items || []).length,
      stats: S.describe(vals),
    };
  });

  // 分级分布
  if (Array.isArray(scoring.cutoffs) && scoring.cutoffs.length) {
    const counts = {};
    scoring.cutoffs.forEach(function (c) { counts[c.label] = 0; });
    let unscored = 0;
    total.forEach(function (v) {
      const cut = SC.pickCutoff(v, scoring.cutoffs);
      if (cut) counts[cut.label] += 1; else unscored += 1;
    });
    out.cutoffs = scoring.cutoffs.map(function (c) {
      return {
        label: c.label,
        level: c.level,
        range: rangeLabel(c, scoring.cutoffs),
        advice: c.advice,
        count: counts[c.label] || 0,
        pct: responses.length ? S.round((counts[c.label] || 0) / responses.length * 100, 1) : null,
      };
    });
    if (unscored) out.unscored = unscored;
  }

  // 关键条目预警
  const crit = scoring.criticalItems || [];
  if (crit.length) {
    out.alerts = crit.map(function (id) {
      const it = (scale.items || []).find(function (x) { return x.id === id; });
      const hit = responses.filter(function (r) {
        const v = SC.rawValue(it, r.answers ? r.answers[id] : undefined);
        return v !== null && v >= (scoring.criticalThreshold === undefined ? 1 : scoring.criticalThreshold);
      });
      return {
        itemId: id,
        text: it ? it.text : id,
        count: hit.length,
        pct: responses.length ? S.round(hit.length / responses.length * 100, 1) : null,
        message: scoring.criticalMessage || '',
      };
    });
  }
  return out;
}

function rangeLabel(cut, all) {
  const idx = all.indexOf(cut);
  const lower = idx === 0 ? 0 : all[idx - 1].max;
  const isInt = Number.isInteger(cut.max) && Number.isInteger(lower);
  const lo = idx === 0 ? (all[0].min === undefined ? 0 : all[0].min) : (isInt ? lower + 1 : lower);
  return lo + ' - ' + cut.max;
}

/** 信度分析 */
function reliability(scale, responses) {
  const scoring = scale.scoring || {};
  if (scoring.method !== 'sum' && scoring.method !== 'mean') return { available: false };
  const m = buildMatrix(scale, responses);
  const out = { available: true, n: 0, total: null, dimensions: [], items: [] };
  const complete = m.rows.filter(function (r) {
    return r.length && r.every(function (v) { return v !== null; });
  });
  out.n = complete.length;
  out.completeCases = complete.length;
  out.totalCases = responses.length;
  if (m.ids.length >= 2) {
    out.total = S.cronbachAlpha(m.rows);
    out.splitHalf = S.splitHalf(m.rows);
    out.items = S.itemTotalStats(m.rows, m.ids).map(function (r) {
      const it = (scale.items || []).find(function (x) { return x.id === r.itemId; });
      return Object.assign(r, { no: it ? it.no : null, text: it ? it.text : r.itemId });
    });
  }
  (scale.dimensions || []).forEach(function (d) {
    const ids = (d.items || []).filter(function (id) {
      return m.ids.indexOf(id) >= 0;
    });
    if (ids.length < 2) return;
    const cols = ids.map(function (id) { return m.ids.indexOf(id); });
    const sub = m.rows.map(function (r) { return cols.map(function (c) { return r[c]; }); });
    out.dimensions.push(Object.assign({ id: d.id, name: d.name, itemCount: ids.length }, S.cronbachAlpha(sub)));
  });
  return out;
}

/** 相关分析（维度/总分之间） */
function correlations(scale, responses) {
  const rows = responses.map(function (r) { return r.scores || {}; });
  const vars = [];
  if (rows.some(function (s) { return s.total !== null && s.total !== undefined; })) {
    vars.push({ id: 'total', name: '总分', get: function (s) { return s.total; } });
  }
  const dimIds = Object.keys(rows.reduce(function (acc, s) {
    Object.keys(s.dimensions || {}).forEach(function (k) { acc[k] = 1; });
    return acc;
  }, {}));
  dimIds.forEach(function (id) {
    const meta = (scale.dimensions || []).find(function (d) { return d.id === id; }) || {};
    vars.push({
      id: id,
      name: meta.name || id,
      get: function (s) { return s.dimensions && s.dimensions[id] ? s.dimensions[id].score : null; },
    });
  });
  if (vars.length < 2) return { available: false };
  const matrix = [];
  for (let i = 0; i < vars.length; i += 1) {
    matrix.push([]);
    for (let j = 0; j < vars.length; j += 1) {
      const x = rows.map(function (s) { return vars[i].get(s); });
      const y = rows.map(function (s) { return vars[j].get(s); });
      matrix[i].push({
        pearson: S.pearson(x, y),
        spearman: i === j ? null : S.spearman(x, y),
      });
    }
  }
  return {
    available: true,
    vars: vars.map(function (v) { return { id: v.id, name: v.name }; }),
    matrix: matrix,
  };
}

/** 组间比较：按指定或第一个可用的人口学/分类变量分组 */
function groupComparison(scale, responses, preferId) {
  const candidates = (scale.items || []).filter(function (it) {
    // 只允许人口学/分组条目分组；拿计分条目分组属于循环论证
    if (it.exclude !== true) return false;
    if (it.type !== 'radio' && it.type !== 'select') return false;
    const opts = it.options || [];
    if (opts.length < 2 || opts.length > 6) return false;
    const vals = responses.map(function (r) { return r.answers ? r.answers[it.id] : undefined; })
      .filter(function (v) { return v !== undefined && v !== null && v !== ''; });
    const uniq = Array.from(new Set(vals.map(String)));
    return uniq.length >= 2 && vals.length >= 6;
  });
  if (!candidates.length) return { available: false, groupCandidates: [] };
  const groupItem = (preferId && candidates.find(function (c) { return c.id === preferId; })) || candidates[0];

  const rows = responses.map(function (r) { return r.scores || {}; });
  const targets = [];
  if (rows.some(function (s) { return s.total !== null && s.total !== undefined; })) {
    targets.push({ id: 'total', name: '总分', get: function (s) { return s.total; } });
  }
  const dimIds = Object.keys(rows.reduce(function (acc, s) {
    Object.keys(s.dimensions || {}).forEach(function (k) { acc[k] = 1; });
    return acc;
  }, {}));
  dimIds.forEach(function (id) {
    const meta = (scale.dimensions || []).find(function (d) { return d.id === id; }) || {};
    targets.push({
      id: id,
      name: meta.name || id,
      get: function (s) { return s.dimensions && s.dimensions[id] ? s.dimensions[id].score : null; },
    });
  });

  const optLabel = function (v) { return answerLabel(groupItem, v); };
  const levels = Array.from(new Set(responses.map(function (r) {
    return r.answers ? r.answers[groupItem.id] : undefined;
  }).filter(function (v) { return v !== undefined && v !== null && v !== ''; }).map(String)));

  const tests = targets.map(function (t) {
    const groups = levels.map(function (lv) {
      return {
        name: optLabel(lv),
        data: responses
          .filter(function (r) { return r.answers && String(r.answers[groupItem.id]) === lv; })
          .map(function (r) { return t.get(r.scores || {}); }),
      };
    });
    const desc = groups.map(function (g) {
      const vals = g.data.filter(function (v) { return v !== null && v !== undefined; });
      return {
        name: g.name, n: vals.length, mean: S.round(S.mean(vals), 3), sd: S.round(S.sd(vals), 3),
        median: S.round(S.quantile(vals, 0.5), 3),
      };
    });
    if (levels.length === 2) {
      const r = S.tTest(groups[0].data, groups[1].data);
      const np = S.mannWhitneyU(groups[0].data, groups[1].data);
      return {
        name: t.name, method: '独立样本 t 检验（Welch）', result: r, nonparam: np,
        methodNonparam: 'Mann-Whitney U 检验', groups: desc,
      };
    }
    const r = S.oneWayAnova(groups);
    const np = S.kruskalWallis(groups);
    return {
      name: t.name, method: '单因素方差分析（ANOVA）', result: r, nonparam: np,
      methodNonparam: 'Kruskal-Wallis H 检验', groups: desc,
    };
  });

  // 分级 × 分组 卡方检验
  let chiSquare = null;
  const totalCut = responses.map(function (r) {
    const s = r.scores || {};
    const cut = SC.pickCutoff(s.total, (scale.scoring || {}).cutoffs || []);
    return cut ? cut.label : null;
  });
  const cutLevels = Array.from(new Set(totalCut.filter(Boolean)));
  if (cutLevels.length >= 2) {
    const table = levels.map(function (lv) {
      return cutLevels.map(function (cl) {
        return responses.filter(function (r, i) {
          return r.answers && String(r.answers[groupItem.id]) === lv && totalCut[i] === cl;
        }).length;
      });
    });
    chiSquare = Object.assign(
      { rowLabels: levels.map(optLabel), colLabels: cutLevels, table: table },
      S.chiSquareTest(table)
    );
  }

  return {
    available: true,
    groupItem: { id: groupItem.id, no: groupItem.no, text: groupItem.text, options: groupItem.options },
    groupCandidates: candidates.map(function (c) { return { id: c.id, no: c.no, text: c.text }; }),
    tests: tests,
    chiSquare: chiSquare,
  };
}

/** 回收趋势（按日） */
function trendOf(responses) {
  const byDay = {};
  responses.forEach(function (r) {
    const day = String(r.submittedAt || '').slice(0, 10);
    if (!day) return;
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const days = Object.keys(byDay).sort();
  let cum = 0;
  return days.map(function (d) {
    cum += byDay[d];
    return { date: d, count: byDay[d], cumulative: cum };
  });
}

/** 数据质量：时长、直线作答、重复 IP、完整率 */
function qualityOf(scale, responses) {
  const items = (scale.items || []).filter(isScoreable);
  const durations = responses.map(function (r) { return r.durationSec; })
    .filter(function (v) { return typeof v === 'number' && v > 0; });
  const complete = responses.filter(function (r) { return (r.scores || {}).completeness === 100; }).length;

  // 直线作答：全部计分条目答案完全相同且题量 ≥8
  let straight = 0;
  responses.forEach(function (r) {
    const vals = items.map(function (it) {
      const v = r.answers ? r.answers[it.id] : undefined;
      if (v === undefined || v === null || v === '') return null;
      return Array.isArray(v) ? v.join(',') : String(v);
    }).filter(function (v) { return v !== null; });
    if (vals.length >= 8 && vals.every(function (v) { return v === vals[0]; })) straight += 1;
  });

  // 重复 IP
  const ipCount = {};
  responses.forEach(function (r) {
    const ip = r.meta && r.meta.ip;
    if (ip) ipCount[ip] = (ipCount[ip] || 0) + 1;
  });
  const dupIps = Object.keys(ipCount).filter(function (ip) { return ipCount[ip] > 1; })
    .map(function (ip) { return { ip: ip, count: ipCount[ip] }; });

  // 过快作答：时长 < 3 秒/题
  const tooFast = responses.filter(function (r) {
    return typeof r.durationSec === 'number' && r.durationSec > 0 && items.length &&
      r.durationSec / items.length < 3;
  }).length;

  return {
    duration: S.describe(durations),
    completeCount: complete,
    completeRate: responses.length ? S.round(complete / responses.length * 100, 1) : null,
    straightLining: straight,
    straightRate: responses.length ? S.round(straight / responses.length * 100, 1) : null,
    tooFast: tooFast,
    duplicateIps: dupIps.slice(0, 20),
    duplicateIpCount: dupIps.length,
    itemCount: items.length,
  };
}

/* ---------------- 结果描述：把统计结果写成可直接引用的中文句子 ---------------- */
/** 去尾零的数值格式化：3.000 → 3，3.140 → 3.14 */
function fmtNum(v, d) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return String(parseFloat(Number(v).toFixed(d === undefined ? 2 : d)));
}
function fmtP(p) {
  if (p === null || p === undefined || !isFinite(p)) return '—';
  return p < 0.001 ? '<0.001' : Number(p).toFixed(3);
}
/** α 档位判读词（与看板「信度分析」的提示保持一致） */
function alphaWord(a) {
  if (a === null || a === undefined || !isFinite(a)) return '';
  if (a >= 0.9) return '优秀';
  if (a >= 0.8) return '良好';
  if (a >= 0.7) return '可接受';
  return '偏低，建议修订条目';
}

/**
 * 依据已算好的统计结果拼出描述性文字。输出 lines：每行一句，便于前端逐句渲染与整段复制。
 * 只做「事实陈述 + 常规判读」，不做因果推断；具体措辞由研究者结合设计自行修订。
 */
function narrative(scale, responses, parts) {
  const n = responses.length;
  if (!n) return { available: false, lines: [] };
  const scores = (parts && parts.scores) || {};
  const rel = (parts && parts.reliability) || {};
  const corr = (parts && parts.correlations) || {};
  const grp = (parts && parts.groupComparison) || {};
  const q = (parts && parts.quality) || {};
  const lines = [];

  // ① 样本与量表结构
  const itemCount = (scale.items || []).length;
  lines.push('本次调查共回收问卷 ' + n + ' 份。所用量表共 ' + itemCount + ' 个条目' +
    ((scale.dimensions || []).length ? '，包含 ' + scale.dimensions.length + ' 个维度' : '') + '。');

  // ② 总分描述统计
  if (scores.total && scores.total.n) {
    const t = scores.total;
    let s = '总分均值为 ' + fmtNum(t.mean) + ' ± ' + fmtNum(t.sd) + ' 分（中位数 ' + fmtNum(t.median) +
      '，四分位数间距 ' + fmtNum(t.q1) + '–' + fmtNum(t.q3) + '，范围 ' + fmtNum(t.min) + '–' + fmtNum(t.max) +
      '，95%CI ' + fmtNum(t.ci95[0]) + '–' + fmtNum(t.ci95[1]) + '）。';
    if (t.skew !== undefined && t.skew !== null) {
      s += Math.abs(t.skew) > 1
        ? '总分分布偏度 ' + fmtNum(t.skew) + '，提示偏离正态，组间比较宜采用非参数检验。'
        : '总分分布偏度 ' + fmtNum(t.skew) + '，近似正态。';
    }
    lines.push(s);
  }

  // ③ 维度得分（仅当确实划分了多个维度时才单列，避免与总分重复）
  const dims = (scores.dimensions || []).filter(function (d) { return d.stats && d.stats.n; });
  if (dims.length >= 2) {
    lines.push('各维度得分依次为：' + dims.map(function (d) {
      return d.name + ' ' + fmtNum(d.stats.mean) + ' ± ' + fmtNum(d.stats.sd);
    }).join('，') + '。');
  }

  // ④ 分级构成
  const cuts = (scores.cutoffs || []).filter(function (c) { return c.count !== undefined; });
  if (cuts.length) {
    lines.push('按分级判读标准，' + cuts.map(function (c) {
      return c.label + ' ' + c.count + ' 例（' + fmtNum(c.pct, 1) + '%）';
    }).join('，') + '。');
  }

  // ⑤ 信度
  if (rel.available && rel.total && rel.total.alpha !== null && rel.total.alpha !== undefined) {
    let s = '总量表 Cronbach\'s α 系数为 ' + fmtNum(rel.total.alpha, 3) + '（基于 ' + rel.total.n +
      ' 份完整答卷），内部一致性' + alphaWord(rel.total.alpha) + '。';
    const rd = (rel.dimensions || []).filter(function (d) { return d.alpha !== null && d.alpha !== undefined; });
    if (rd.length >= 2) s += '各维度 α 系数为 ' + rd.map(function (d) { return d.name + ' ' + fmtNum(d.alpha, 3); }).join('，') + '。';
    if (rel.splitHalf && rel.splitHalf.sb !== null && rel.splitHalf.sb !== undefined) {
      s += '分半信度（Spearman-Brown 校正）为 ' + fmtNum(rel.splitHalf.sb, 3) + '。';
    }
    lines.push(s);
  }

  // ⑥ 总分与各维度相关（跳过与总分完全同源的维度，避免出现 r=1 的无意义结论）
  if (corr.available && corr.vars.length >= 2) {
    const ti = corr.vars.findIndex(function (v) { return v.id === 'total'; });
    if (ti >= 0) {
      const pieces = [];
      corr.vars.forEach(function (v, j) {
        if (j === ti) return;
        const cell = corr.matrix[Math.max(ti, j)][Math.min(ti, j)].pearson;
        if (cell && cell.r !== null && isFinite(cell.r) && Math.abs(cell.r) < 0.999) {
          pieces.push(v.name + '（r=' + fmtNum(cell.r, 3) + '，P' + (cell.p < 0.05 ? '<0.05' : '=' + fmtP(cell.p)) + '）');
        }
      });
      if (pieces.length) lines.push('总分与各维度相关：' + pieces.join('，') + '。');
    }
  }

  // ⑦ 组间比较（同一结论只保留一条：维度分与总分的分组检验可能完全重合）
  if (grp.available && grp.tests && grp.tests.length) {
    const gname = String(grp.groupItem.text || '').replace(/\s+/g, '');
    const seen = {};
    grp.tests.forEach(function (t) {
      const r = t.result || {};
      // 以「各组的 n/均值/标准差」为指纹去重：结构相同的检验只写一次
      const fp = (t.groups || []).map(function (g) { return g.name + ':' + g.n + ':' + g.mean + ':' + g.sd; }).join('|');
      if (seen[fp]) return;
      seen[fp] = true;
      // 算不出 t/F 时说明真实原因：样本不足与组内无变异是两回事
      const computed = (r.t !== null && r.t !== undefined) || (r.F !== null && r.F !== undefined);
      if (!computed) {
        const why = r.reason === 'zero_variance'
          ? '各组数据无变异（标准差为 0）'
          : '各组样本量不足';
        lines.push(t.name + '在不同「' + gname + '」组间：' + why + '，未能完成组间检验（' + t.method + '）。');
        return;
      }
      const sig = r.p !== null && r.p !== undefined && r.p < 0.05;
      let s = t.name + '在不同「' + gname + '」组间差异' + (sig ? '有' : '无') + '统计学意义（';
      if (r.t !== undefined && r.t !== null) {
        s += 't=' + fmtNum(r.t, 3) + '，P=' + fmtP(r.p) + '，Cohen\'s d=' + fmtNum(r.cohensD, 3);
      } else {
        s += 'F=' + fmtNum(r.F, 3) + '，P=' + fmtP(r.p) + '，η²=' + fmtNum(r.etaSq, 3);
      }
      s += '）。';
      if (t.groups && t.groups.length) {
        s += '各组分别为 ' + t.groups.map(function (g) {
          return g.name + ' ' + fmtNum(g.mean) + ' ± ' + fmtNum(g.sd) + '（n=' + g.n + '）';
        }).join('，') + '。';
      }
      lines.push(s);
    });
    if (grp.chiSquare && grp.chiSquare.chi2 !== null && grp.chiSquare.chi2 !== undefined) {
      const cs = grp.chiSquare;
      lines.push('不同「' + gname + '」组在严重程度构成上差异' + (cs.p < 0.05 ? '有' : '无') +
        '统计学意义（χ²=' + fmtNum(cs.chi2, 3) + '，df=' + cs.df + '，P=' + fmtP(cs.p) +
        '，Cramér\'s V=' + fmtNum(cs.cramersV, 3) + '）。');
    }
  }

  // ⑧ 数据质量
  if (q.duration && q.duration.n) {
    let s = '平均作答用时约 ' + Math.round(q.duration.mean) + ' 秒（中位数 ' + Math.round(q.duration.median) +
      ' 秒），完整作答率 ' + fmtNum(q.completeRate, 1) + '%。';
    if ((q.straightLining || 0) + (q.tooFast || 0) > 0) {
      s += '检出直线作答 ' + (q.straightLining || 0) + ' 份、作答过快 ' + (q.tooFast || 0) + ' 份，建议逐份核查后再纳入分析。';
    }
    lines.push(s);
  }

  return {
    available: true,
    lines: lines,
    note: '以上文字由平台依据本调查数据自动生成，可直接参考或按需修订后写入论文「结果」部分。'
      + '显著性水平取 α=0.05；相关与组间比较的结论需结合研究设计与临床意义解读，'
      + '回归、因子分析等请在导出数据后用 SPSS/R 完成。',
  };
}

function buildReport(scale, responses, opts) {
  const o = opts || {};
  const items = itemLevel(scale, responses);
  const scores = scoreLevel(scale, responses);
  const rel = reliability(scale, responses);
  const corr = correlations(scale, responses);
  const grp = groupComparison(scale, responses, o.groupVariableId);
  const trend = trendOf(responses);
  const quality = qualityOf(scale, responses);
  return {
    generatedAt: new Date().toISOString(),
    n: responses.length,
    scale: { title: scale.title, code: scale.code, category: scale.category, source: scale.source, license: scale.license },
    items: items,
    scores: scores,
    reliability: rel,
    correlations: corr,
    groupComparison: grp,
    trend: trend,
    quality: quality,
    narrative: narrative(scale, responses, {
      scores: scores, reliability: rel, correlations: corr, groupComparison: grp, quality: quality,
    }),
  };
}

module.exports = { buildReport: buildReport, buildMatrix: buildMatrix, trendOf: trendOf, qualityOf: qualityOf };
