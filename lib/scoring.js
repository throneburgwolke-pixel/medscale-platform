'use strict';
const { computeVisibility } = require('./logic.js');
/**
 * 计分引擎
 * ------------------------------------------------------------------
 * 支持：
 *  - method: 'sum' | 'mean' | 'none' | 'custom'
 *  - 反向计分：item.reverse === true（按该题选项最大分值反转）
 *  - 维度小分（scale.dimensions 中的 items 列表）
 *  - multiplier：总分倍数（如 WHO-5 ×4）
 *  - cutoffs：分级解释
 *  - criticalItems：关键条目预警（如 PHQ-9 第9题自杀意念）
 *  - custom: 'psqi' 匹兹堡睡眠质量指数的 7 成分记分
 */

function optionsOf(item) {
  return Array.isArray(item.options) ? item.options : [];
}

/** 选项原始分值（数字型 value） */
function rawValue(item, answer) {
  if (answer === undefined || answer === null || answer === '') return null;
  const opts = optionsOf(item);
  if (item.type === 'radio' || item.type === 'select') {
    const hit = opts.find(function (o) { return String(o.value) === String(answer); });
    return hit ? Number(hit.value) : null;
  }
  if (item.type === 'checkbox') {
    const arr = Array.isArray(answer) ? answer : [answer];
    if (!arr.length) return null;
    return arr.reduce(function (acc, a) {
      const hit = opts.find(function (o) { return String(o.value) === String(a); });
      return acc + (hit ? Number(hit.value) : 0);
    }, 0);
  }
  if (item.type === 'number' || item.type === 'slider') {
    const n = Number(answer);
    return Number.isFinite(n) ? n : null;
  }
  if (item.type === 'time') {
    return parseTimeToMinutes(answer);
  }
  return null; // text/textarea 不参与计分
}

function optionMax(item) {
  const opts = optionsOf(item);
  if (!opts.length) {
    if (item.max !== undefined && Number.isFinite(Number(item.max))) return Number(item.max);
    return null;
  }
  let mx = null;
  opts.forEach(function (o) {
    const v = Number(o.value);
    if (Number.isFinite(v) && (mx === null || v > mx)) mx = v;
  });
  return mx;
}

function optionMin(item) {
  const opts = optionsOf(item);
  if (!opts.length) {
    if (item.min !== undefined && Number.isFinite(Number(item.min))) return Number(item.min);
    return null;
  }
  let mn = null;
  opts.forEach(function (o) {
    const v = Number(o.value);
    if (Number.isFinite(v) && (mn === null || v < mn)) mn = v;
  });
  return mn;
}

/**
 * 计入总分前对单题分值做反转
 * 通用规则：反向分 = (选项最小值 + 选项最大值) - 原始分
 *  - 0-3 计分 → 3 - v；1-4 计分（如 Zung SAS/SDS）→ 5 - v；0-1 计分 → 1 - v
 * 可用 scoring.reverseBase 显式指定基数
 */
function itemScore(item, answer, scoring) {
  let v = rawValue(item, answer);
  if (v === null) return null;
  if (item.reverse) {
    const mn = optionMin(item);
    const mx = optionMax(item);
    if (scoring && scoring.reverseBase !== undefined) v = Number(scoring.reverseBase) - v;
    else if (mn !== null && mx !== null) v = (mn + mx) - v;
    else if (scoring && scoring.reverseMax !== undefined) v = Number(scoring.reverseMax) - v;
    else if (mx !== null) v = mx - v;
  }
  return v;
}

function parseTimeToMinutes(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function pickCutoff(score, cutoffs) {
  if (score === null || score === undefined || !Array.isArray(cutoffs) || !cutoffs.length) return null;
  for (let i = 0; i < cutoffs.length; i += 1) {
    if (score <= cutoffs[i].max) return cutoffs[i];
  }
  return cutoffs[cutoffs.length - 1];
}

/**
 * 按量表要求取整：
 *  'round' 四舍五入取整（如 Zung SAS/SDS 标准分 = 粗分×1.25 取整）
 *  'floor' 向下取整；'ceil' 向上取整；数字 n 表示保留 n 位小数
 */
function applyRounding(v, mode) {
  if (v === null || v === undefined || !Number.isFinite(v)) return v;
  if (mode === 'round') return Math.round(v);
  if (mode === 'floor') return Math.floor(v);
  if (mode === 'ceil') return Math.ceil(v);
  if (typeof mode === 'number' && Number.isFinite(mode)) {
    const p = Math.pow(10, mode);
    return Math.round(v * p) / p;
  }
  return v;
}

/* ---------------- PSQI 专用计分 ---------------- */
function psqiScore(items, answers) {
  const get = function (id) {
    const it = items.find(function (x) { return x.id === id; });
    if (!it) return null;
    return rawValue(it, answers[id]);
  };
  const band = function (v, thresholds) {
    if (v === null || v === undefined) return null;
    let s = 0;
    for (let i = 0; i < thresholds.length; i += 1) if (v > thresholds[i]) s = i + 1;
    return s;
  };

  const bedTime = get('psq1');
  const latencyMin = get('psq2');
  const riseTime = get('psq3');
  const sleepHours = get('psq4');

  // C1 睡眠质量
  const c1 = get('psq6');

  // C2 入睡时间 = 入睡时长分级 + 30分钟内不能入睡的频率
  const latBand = latencyMin === null ? null : band(latencyMin, [15, 30, 60]);
  const notIn30 = get('psq5a');
  let c2 = null;
  if (latBand !== null && notIn30 !== null) {
    const sum = latBand + notIn30;
    c2 = sum === 0 ? 0 : sum <= 2 ? 1 : sum <= 4 ? 2 : 3;
  } else if (latBand !== null) {
    c2 = latBand;
  }

  // C3 睡眠时间
  let c3 = null;
  if (sleepHours !== null) {
    c3 = sleepHours > 7 ? 0 : sleepHours > 6 ? 1 : sleepHours >= 5 ? 2 : 3;
  }

  // C4 睡眠效率 = 实际睡眠时间 / 卧床时间
  let c4 = null;
  let efficiency = null;
  if (bedTime !== null && riseTime !== null && sleepHours !== null) {
    let inBed = riseTime - bedTime;
    if (inBed <= 0) inBed += 24 * 60;
    if (inBed > 0) {
      efficiency = (sleepHours * 60) / inBed * 100;
      c4 = efficiency > 85 ? 0 : efficiency >= 75 ? 1 : efficiency >= 65 ? 2 : 3;
    }
  }

  // C5 睡眠障碍 = 9 个干扰条目的分值之和
  const disturbers = ['psq5b','psq5c','psq5d','psq5e','psq5f','psq5g','psq5h','psq5i','psq5j'];
  const dvals = disturbers.map(get).filter(function (v) { return v !== null; });
  const c5 = dvals.length === disturbers.length ? band(dvals.reduce(function (a, b) { return a + b; }, 0), [0, 9, 18]) : null;

  // C6 催眠药物
  const c6 = get('psq7');

  // C7 日间功能障碍 = 困倦 + 精力不足
  const d8 = get('psq8');
  const d9 = get('psq9');
  const c7 = d8 !== null && d9 !== null ? band(d8 + d9, [0, 2, 4]) : null;

  const comps = { c1: c1, c2: c2, c3: c3, c4: c4, c5: c5, c6: c6, c7: c7 };
  const vals = Object.keys(comps).map(function (k) { return comps[k]; });
  const complete = vals.every(function (v) { return v !== null; });
  const total = complete ? vals.reduce(function (a, b) { return a + b; }, 0) : null;

  return {
    components: comps,
    efficiency: efficiency === null ? null : Math.round(efficiency * 10) / 10,
    inBedMinutes: (bedTime !== null && riseTime !== null)
      ? ((riseTime - bedTime) <= 0 ? riseTime - bedTime + 1440 : riseTime - bedTime)
      : null,
    total: total,
    complete: complete,
  };
}

/* ---------------- 主入口 ---------------- */
/**
 * @param {object} scale  量表定义（items/dimensions/scoring）
 * @param {object} answers { itemId: value }
 * @returns {object} { total, dimensions, cut, flags, answered, expected, completeness }
 */
function scoreResponse(scale, answers) {
  const items = scale.items || [];
  const scoring = scale.scoring || {};
  const ans = answers || {};
  const vis = computeVisibility(scale, ans);
  const visibleItems = items.filter(function (it) { return vis.visible.indexOf(it.id) >= 0; });
  const out = {
    total: null,
    dimensions: {},
    cut: null,
    flags: [],
    answered: 0,
    expected: 0,
    completeness: 0,
    method: scoring.method || 'none',
    skipped: vis.skipped,
    ended: vis.ended,
  };

  const numericTypes = ['radio', 'select', 'checkbox', 'number', 'slider'];
  const scoreable = visibleItems.filter(function (it) {
    // exclude=true 的题目（如性别、年龄等人口学变量）不计入总分与维度分
    return numericTypes.indexOf(it.type) >= 0 && !it.exclude;
  });
  out.expected = visibleItems.length;
  out.answered = visibleItems.filter(function (it) {
    const v = ans[it.id];
    return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
  }).length;
  out.completeness = out.expected ? Math.round(out.answered / out.expected * 100) : 100;

  if (scoring.method === 'custom' && scoring.custom === 'psqi') {
    const r = psqiScore(items, ans);
    out.total = r.total;
    out.psqi = r;
    (scale.dimensions || []).forEach(function (d) {
      out.dimensions[d.id] = { id: d.id, name: d.name, score: r.components[d.id] === undefined ? null : r.components[d.id] };
    });
    if (out.total !== null) out.cut = pickCutoff(out.total, scoring.cutoffs);
  } else if (scoring.method === 'sum' || scoring.method === 'mean') {
    const vals = [];
    scoreable.forEach(function (it) {
      const v = itemScore(it, ans[it.id], scoring);
      if (v !== null) vals.push(v);
    });
    if (vals.length) {
      const s = vals.reduce(function (a, b) { return a + b; }, 0);
      out.total = scoring.method === 'mean'
        ? Math.round(s / vals.length * 100) / 100
        : s * (scoring.multiplier || 1);
      out.totalItems = vals.length;
      out.total = applyRounding(out.total, scoring.round);
      out.cut = pickCutoff(out.total, scoring.cutoffs);
    }
    (scale.dimensions || []).forEach(function (d) {
      const dv = [];
      (d.items || []).forEach(function (id) {
        const it = items.find(function (x) { return x.id === id; });
        if (!it) return;
        if (vis.visible.indexOf(id) < 0) return; // 被跳题逻辑跳过的题目不计入维度分
        const v = itemScore(it, ans[id], scoring);
        if (v !== null) dv.push(v);
      });
      const sum = dv.reduce(function (a, b) { return a + b; }, 0);
      const base = scoring.method === 'mean' ? sum / dv.length : sum;
      const dmul = scoring.dimMultiplier ? Number(scoring.dimMultiplier) : 1;
      out.dimensions[d.id] = {
        id: d.id,
        name: d.name,
        score: dv.length ? Math.round(base * dmul * 100) / 100 : null,
        answered: dv.length,
        expected: (d.items || []).length,
        mean: dv.length ? Math.round(sum / dv.length * 100) / 100 : null,
      };
    });
  }

  // 关键条目预警
  const crit = scoring.criticalItems || [];
  crit.forEach(function (id) {
    const it = items.find(function (x) { return x.id === id; });
    if (!it) return;
    const v = rawValue(it, ans[id]);
    if (v !== null && v >= (scoring.criticalThreshold === undefined ? 1 : scoring.criticalThreshold)) {
      out.flags.push({ itemId: id, text: scoring.criticalMessage || '关键条目出现阳性作答，需临床关注。' });
    }
  });

  return out;
}

/** 校验必答题与数值范围（自动跳过被跳题逻辑隐藏的题目） */
function validateAnswers(scale, answers) {
  const errors = [];
  const ans = answers || {};
  const vis = computeVisibility(scale, ans);
  (scale.items || []).forEach(function (it) {
    if (vis.visible.indexOf(it.id) < 0) return;
    const v = ans[it.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (it.required !== false && empty) {
      errors.push({ itemId: it.id, message: '第' + (it.no || '') + '题未作答' });
      return;
    }
    if (empty) return;
    if (it.type === 'number' || it.type === 'slider') {
      const n = Number(v);
      if (!Number.isFinite(n)) errors.push({ itemId: it.id, message: '第' + (it.no || '') + '题需填写数字' });
      else {
        if (it.min !== undefined && n < it.min) errors.push({ itemId: it.id, message: '第' + (it.no || '') + '题不能小于' + it.min });
        if (it.max !== undefined && n > it.max) errors.push({ itemId: it.id, message: '第' + (it.no || '') + '题不能大于' + it.max });
      }
      return;
    }
    // 选择题：提交值必须是该题已定义的选项，避免客户端篡改导致计分错误
    if (it.type === 'radio' || it.type === 'select' || it.type === 'checkbox') {
      const opts = it.options || [];
      const vals = Array.isArray(v) ? v : [v];
      const bad = vals.filter(function (x) {
        return !opts.some(function (o) { return String(o.value) === String(x); });
      });
      if (bad.length) errors.push({ itemId: it.id, message: '第' + (it.no || '') + '题的选项值无效' });
    }
  });
  return errors;
}

module.exports = {
  scoreResponse: scoreResponse,
  validateAnswers: validateAnswers,
  rawValue: rawValue,
  itemScore: itemScore,
  pickCutoff: pickCutoff,
  parseTimeToMinutes: parseTimeToMinutes,
};
