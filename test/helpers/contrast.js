'use strict';
/**
 * WCAG 2.x 对比度计算，供 test/contrast_test.js 与 test/a11y_test.js 共用。
 * 参考 https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function rgb(color) {
  const s = String(color).trim();
  let m = s.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
  m = s.match(/^#([0-9a-fA-F]{3})$/);
  if (m) return m[1].split('').map(function (ch) { return parseInt(ch, 16) * 17; });
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    if (p.length >= 4 && p[3] < 1) return null;   // 半透明色脱离层叠上下文无法计算
    return [p[0], p[1], p[2]];
  }
  return null;
}

function luminance(color) {
  const c = rgb(color);
  if (!c) return null;
  const v = c.map(function (ch) {
    const x = ch / 255;
    return x <= 0.03928 ? x / 12.929 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* 半透明色解析（保留 alpha）：rgb() 对 alpha<1 返回 null，合成计算需要单独解析 */
function rgba(color) {
  const s = String(color).trim();
  let m = s.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); }).concat(1);
  m = s.match(/^#([0-9a-fA-F]{3})$/);
  if (m) return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16); }).concat(1);
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return [p[0], p[1], p[2], p.length >= 4 ? p[3] : 1];
  }
  return null;
}

/* 把半透明前景合成到不透明背景上，返回不透明 rgb() 字符串，供 ratio() 使用 */
function composite(fg, bg) {
  const f = rgba(fg); const b = rgba(bg);
  if (!f || !b) return null;
  const a = f[3];
  const out = [0, 1, 2].map(function (i) { return Math.round(f[i] * a + b[i] * (1 - a)); });
  return 'rgb(' + out.join(',') + ')';
}

module.exports = { rgb: rgb, luminance: luminance, ratio: ratio, rgba: rgba, composite: composite };
