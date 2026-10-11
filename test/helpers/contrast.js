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

module.exports = { rgb: rgb, luminance: luminance, ratio: ratio };
