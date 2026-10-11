'use strict';
/**
 * 随访（多次测量）分析：各时点描述统计、配对 t 检验、Wilcoxon 符号秩检验、
 * 失访情况与受试者层面的宽表数据（供重复测量方差分析使用）
 */
const S = require('./stats.js');

function cutoffCounts(scale, responses) {
  const cuts = (scale.scoring || {}).cutoffs || [];
  if (!cuts.length) return [];
  const counts = cuts.map(function () { return 0; });
  responses.forEach(function (r) {
    const t = r.scores ? r.scores.total : null;
    if (t === null || t === undefined) return;
    let idx = cuts.findIndex(function (c) { return t <= c.max; });
    if (idx < 0) idx = cuts.length - 1;
    counts[idx] += 1;
  });
  return cuts.map(function (c, i) {
    return {
      label: c.label,
      count: counts[i],
      pct: responses.length ? S.round(counts[i] / responses.length * 100, 1) : null,
    };
  });
}

function totalsOf(responses) {
  return responses.map(function (r) { return r.scores ? r.scores.total : null; });
}

function summarize(scale, responses) {
  const totals = totalsOf(responses);
  const d = S.describe(totals);
  const dims = (scale.dimensions || []).map(function (dim) {
    const vals = responses.map(function (r) {
      const dv = r.scores && r.scores.dimensions ? r.scores.dimensions[dim.id] : null;
      return dv ? dv.score : null;
    });
    const dd = S.describe(vals);
    return { id: dim.id, name: dim.name, n: dd.n || 0, mean: dd.mean, sd: dd.sd };
  });
  return {
    n: responses.length,
    scored: d.n || 0,
    total: d,
    dimensions: dims,
    cutoffs: cutoffCounts(scale, responses),
  };
}

/** 以受试者编号配对：返回两个时点都完成的受试者编号与两次总分 */
function pairWaves(responsesA, responsesB) {
  const mapB = {};
  responsesB.forEach(function (r) {
    if (r.subjectId) mapB[r.subjectId] = r;
  });
  const ids = [];
  const a = [];
  const b = [];
  responsesA.forEach(function (r) {
    if (!r.subjectId || !mapB[r.subjectId]) return;
    const ta = r.scores ? r.scores.total : null;
    const tb = mapB[r.subjectId].scores ? mapB[r.subjectId].scores.total : null;
    if (ta === null || ta === undefined || tb === null || tb === undefined) return;
    ids.push(r.subjectId);
    a.push(ta);
    b.push(tb);
  });
  return { ids: ids, a: a, b: b };
}

function compare(waves, ia, ib) {
  const wa = waves[ia];
  const wb = waves[ib];
  const p = pairWaves(wa.responses, wb.responses);
  const n = p.a.length;
  const t = S.pairedTTest(p.a, p.b);
  const w = n >= 5 ? S.wilcoxon(p.a, p.b) : { w: null, p: null, n: n };
  const diffs = p.a.map(function (v, i) { return v - p.b[i]; });
  const dd = S.describe(diffs);
  return {
    a: { id: wa.id, label: wa.label },
    b: { id: wb.id, label: wb.label },
    n: n,
    meanA: S.round(S.mean(p.a), 3),
    sdA: S.round(S.sd(p.a), 3),
    meanB: S.round(S.mean(p.b), 3),
    sdB: S.round(S.sd(p.b), 3),
    meanChange: dd.mean,
    sdChange: dd.sd,
    ci95Change: dd.ci95,
    cohensD: t.sdDiff ? S.round(dd.mean / t.sdDiff, 3) : null,
    t: t,
    wilcoxon: w,
    significant: t.p !== null && t.p < 0.05,
    pairCount: 0,
    bonferroni: null,
  };
}

/**
 * 生成随访分析报告
 * @param {object} scale 量表定义
 * @param {Array} waves [{ id, label, token, url, open, responses }]
 */
function buildFollowup(scale, waves) {
  const out = {
    waves: waves.map(function (w) {
      return {
        id: w.id, label: w.label, token: w.token, url: w.url, open: w.open,
        summary: summarize(scale, w.responses),
      };
    }),
    pairs: [],
    retention: null,
  };
  const pairCount = waves.length * (waves.length - 1) / 2;
  for (let i = 0; i < waves.length; i += 1) {
    for (let j = i + 1; j < waves.length; j += 1) {
      const c = compare(waves, i, j);
      c.pairCount = pairCount;
      c.bonferroni = (pairCount > 1 && c.t.p !== null) ? S.round(Math.min(1, c.t.p * pairCount), 4) : null;
      out.pairs.push(c);
    }
  }
  const allIds = {};
  waves.forEach(function (w) {
    w.responses.forEach(function (r) { if (r.subjectId) allIds[r.subjectId] = 1; });
  });
  const subjectIds = Object.keys(allIds);
  const completedAll = subjectIds.filter(function (sid) {
    return waves.every(function (w) {
      return w.responses.some(function (r) { return r.subjectId === sid; });
    });
  });
  out.retention = {
    totalSubjects: subjectIds.length,
    completedAll: completedAll.length,
    completionRate: subjectIds.length ? S.round(completedAll.length / subjectIds.length * 100, 1) : null,
    byWave: waves.map(function (w) {
      const ids = {};
      w.responses.forEach(function (r) { if (r.subjectId) ids[r.subjectId] = 1; });
      return { label: w.label, subjects: Object.keys(ids).length, responses: w.responses.length };
    }),
  };
  const wide = {};
  waves.forEach(function (w) {
    w.responses.forEach(function (r) {
      const sid = r.subjectId || ('(未编号)' + r.pid);
      if (!wide[sid]) wide[sid] = { subjectId: sid, waves: {} };
      wide[sid].waves[w.id] = {
        total: r.scores ? r.scores.total : null,
        grade: r.scores && r.scores.cut ? r.scores.cut.label : '',
        durationSec: r.durationSec,
        submittedAt: r.submittedAt,
        pid: r.pid,
      };
    });
  });
  out.subjects = Object.keys(wide).map(function (k) { return wide[k]; });
  return out;
}

module.exports = { buildFollowup: buildFollowup, summarize: summarize, pairWaves: pairWaves };
