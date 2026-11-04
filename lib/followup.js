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

/** 一个survey/时点内的历史重复：保留原始行，分析时排除冲突编号的全部行。 */
function excludeConflicts(responses) {
  const groups = new Map();
  responses.forEach(function (r) {
    if (!r.subjectId) return;
    const sid = String(r.subjectId);
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(r);
  });
  const conflicts = [];
  groups.forEach(function (rows, sid) {
    if (rows.length > 1) conflicts.push({
      subjectId: sid, count: rows.length,
      responseIds: rows.map(function (r) { return r.id; }),
      pids: rows.map(function (r) { return r.pid; }),
    });
  });
  return {
    responses: responses.filter(function (r) { return !r.subjectId || groups.get(String(r.subjectId)).length === 1; }),
    conflicts: conflicts,
  };
}

/** 以受试者编号配对：任一侧冲突都不纳入，不能通过重复行扩大n。 */
function pairWaves(responsesA, responsesB) {
  const cleanA = excludeConflicts(responsesA);
  const cleanB = excludeConflicts(responsesB);
  const mapB = new Map();
  cleanB.responses.forEach(function (r) {
    if (r.subjectId) mapB.set(String(r.subjectId), r);
  });
  const ids = [];
  const a = [];
  const b = [];
  cleanA.responses.forEach(function (r) {
    const other = r.subjectId && mapB.get(String(r.subjectId));
    if (!other) return;
    const ta = r.scores ? r.scores.total : null;
    const tb = other.scores ? other.scores.total : null;
    if (ta === null || ta === undefined || tb === null || tb === undefined) return;
    ids.push(r.subjectId);
    a.push(ta);
    b.push(tb);
  });
  return { ids: ids, a: a, b: b, conflicts: { a: cleanA.conflicts, b: cleanB.conflicts } };
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
  const conflicts = [];
  const allIds = Object.create(null);
  waves = waves.map(function (w) {
    w.responses.forEach(function (r) { if (r.subjectId) allIds[r.subjectId] = 1; });
    const clean = excludeConflicts(w.responses);
    const waveConflicts = clean.conflicts.map(function (c) { return Object.assign({ surveyId: w.id, waveLabel: w.label }, c); });
    conflicts.push.apply(conflicts, waveConflicts);
    return Object.assign({}, w, { responses: clean.responses, rawResponseCount: w.responses.length, conflicts: waveConflicts });
  });
  const out = {
    waves: waves.map(function (w) {
      return {
        id: w.id, label: w.label, token: w.token, url: w.url, open: w.open,
        summary: summarize(scale, w.responses), rawResponseCount: w.rawResponseCount, conflicts: w.conflicts,
      };
    }),
    conflicts: conflicts,
    warnings: conflicts.map(function (c) {
      return '时点 ' + (c.waveLabel || c.surveyId) + '（survey ' + c.surveyId + '）编号 ' + c.subjectId +
        ' 有 ' + c.count + ' 份冲突答卷；该受试者时点已从统计、配对及宽表排除，原始数据保留。';
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
      const ids = Object.create(null);
      w.responses.forEach(function (r) { if (r.subjectId) ids[r.subjectId] = 1; });
      return { label: w.label, subjects: Object.keys(ids).length, responses: w.responses.length, rawResponses: w.rawResponseCount };
    }),
  };
  const wide = Object.create(null);
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

module.exports = { buildFollowup: buildFollowup, summarize: summarize, pairWaves: pairWaves, excludeConflicts: excludeConflicts };
