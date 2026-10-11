'use strict';
/**
 * 对比度测试：文字颜色必须满足 WCAG AA（正文 ≥4.5:1，≥24px 或 ≥18.66px 粗体的大字 ≥3:1）。
 * 直接解析 public/styles.css 的设计令牌与规则，不依赖浏览器，改配色即被覆盖。
 */
const path = require('node:path');
const fs = require('node:fs');
const { luminance, ratio } = require('./helpers/contrast.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

/* ---------- 令牌解析 ---------- */
function tokenize(block) {
  const map = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) map[m[1]] = m[2].trim();
  return map;
}
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
const clean = stripComments(CSS);

const lightBlock = (clean.match(/:root\s*\{([\s\S]*?)\}/) || [])[1] || '';
const darkBlock = (clean.match(/@media\s*\(prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([\s\S]*?)\}/) || [])[1] || '';
const light = tokenize(lightBlock);
const dark = Object.assign({}, light, tokenize(darkBlock));

function resolve(token, map, depth) {
  if (depth > 8) return null;
  let v = token;
  const m = String(v).match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (m) return resolve(map[m[1]], map, depth + 1);
  v = String(v).trim();
  if (v[0] === '#' || /^rgba?\(/.test(v)) return v;
  return null;
}

ok(Object.keys(light).length > 20, '解析出浅色主题设计令牌', Object.keys(light).length);
ok(Object.keys(dark).length > 20, '解析出深色主题设计令牌', Object.keys(dark).length);
ok(/prefers-color-scheme: dark/.test(clean), '存在深色模式令牌覆盖块');

/* ---------- 【1】正文令牌 × 卡片/页面底色 ---------- */
const SURFACES = ['--surface', '--surface-2', '--bg'];
const INKS = ['--ink', '--ink-2', '--ink-3'];
[['浅色', light], ['深色', dark]].forEach(function (pair) {
  const name = pair[0];
  const map = pair[1];
  INKS.forEach(function (ink) {
    SURFACES.forEach(function (surf) {
      const r = ratio(map[ink], map[surf]);
      ok(r >= 4.5, name + ' ' + ink + ' on ' + surf + ' ≥4.5:1', r === null ? '无法解析颜色' : r.toFixed(2) + ':1 (' + map[ink] + ' / ' + map[surf] + ')');
    });
  });
});

/* ---------- 【2】次要文字落在彩色底纹上 ---------- */
const TINTS = ['--brand-50', '--accent-50', '--ok-50', '--warn-50', '--danger-50', '--line-2'];
[['浅色', light], ['深色', dark]].forEach(function (pair) {
  const name = pair[0];
  const map = pair[1];
  TINTS.forEach(function (tint) {
    const r = ratio(map['--ink-3'], map[tint]);
    ok(r >= 4.5, name + ' --ink-3 on ' + tint + ' ≥4.5:1', r === null ? '无法解析颜色' : r.toFixed(2) + ':1');
  });
});

/* ---------- 【3】链接 / 侧栏 / 反白按钮 ---------- */
[['浅色', light], ['深色', dark]].forEach(function (pair) {
  const name = pair[0];
  const map = pair[1];
  const link = ratio(map['--brand'], map['--surface']);
  ok(link >= 4.5, name + ' 链接色 --brand on --surface ≥4.5:1', link === null ? '无法解析' : link.toFixed(2) + ':1');
  const side = ratio(map['--sidebar-ink'], map['--sidebar-bg']);
  ok(side >= 4.5, name + ' 侧栏文字 --sidebar-ink on --sidebar-bg ≥4.5:1', side === null ? '无法解析' : side.toFixed(2) + ':1');
  const inv = ratio('#ffffff', map['--brand-solid']);
  ok(inv >= 4.5, name + ' 主按钮/选中态反白 on --brand-solid ≥4.5:1', inv === null ? '无法解析' : inv.toFixed(2) + ':1');
  const inv2 = ratio('#ffffff', map['--brand-solid-2']);
  ok(inv2 >= 4.5, name + ' 反白文字 on --brand-solid-2（渐变深端）≥4.5:1', inv2 === null ? '无法解析' : inv2.toFixed(2) + ':1');
  const side2 = ratio(map['--sidebar-ink-2'], map['--sidebar-bg']);
  ok(side2 >= 4.5, name + ' 侧栏分组标题 --sidebar-ink-2 on --sidebar-bg ≥4.5:1', side2 === null ? '无法解析（令牌缺失）' : side2.toFixed(2) + ':1');
});

/* ---------- 【4】逐条规则扫描：同一规则里的前景色 × 背景色 ---------- */
function colorOf(value, map) {
  const raw = String(value).trim();
  if (/^none$|^transparent$|^currentColor$/i.test(raw)) return null;
  const direct = resolve(raw, map, 0);
  if (direct) return direct;
  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (ref && map[ref[1]] === undefined) missing.push(ref[1] + '（未定义令牌）');
  return null;
}
const missing = [];
function checkRules(map) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  let checked = 0;
  const bad = [];
  while ((m = re.exec(clean))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (/^@/.test(sel)) continue;
    const decls = m[2];
    const bgM = decls.match(/(?:^|;)\s*(?:background-color|background)\s*:\s*([^;]+)/);
    const fgM = decls.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
    if (!bgM || !fgM) continue;
    if (/gradient|image|url\(/.test(bgM[1])) continue;
    const bg = colorOf(bgM[1], map);
    const fg = colorOf(fgM[1], map);
    if (!bg || !fg) continue;
    const r = ratio(fg, bg);
    if (r === null) continue;
    checked += 1;
    const large = /font-size\s*:\s*var\(--fs-(?:2[2-9]|[3-9]\d)\)/i.test(decls) || /font-weight\s*:\s*[789]\d\d/.test(decls);
    const need = large ? 3 : 4.5;
    if (r < need) bad.push(sel + ' { ' + fg + ' on ' + bg + ' = ' + r.toFixed(2) + '，需 ≥' + need);
  }
  return { checked: checked, bad: bad };
}
[['浅色', light], ['深色', dark]].forEach(function (pair) {
  const res = checkRules(pair[1]);
  ok(res.checked >= 20, pair[0] + '主题扫描到「前景色 × 背景色」成对规则（标签/横幅/选中态等）', res.checked + ' 条');
  ok(res.bad.length === 0, pair[0] + '主题所有成对文字规则达到 WCAG AA', res.bad.join(' | '));
});
ok(missing.length === 0, '规则引用的颜色令牌全部有定义', Array.from(new Set(missing)).join(' | '));

/* ---------- 【5】渐变底上的文字：取全部色标，按最差的一档判定 ---------- */
function checkGradients(map) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  let checked = 0;
  const bad = [];
  while ((m = re.exec(clean))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (/^@/.test(sel)) continue;
    const decls = m[2];
    const bgM = decls.match(/(?:^|;)\s*(?:background-color|background)\s*:\s*([^;]+)/);
    const fgM = decls.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
    if (!bgM || !fgM || !/gradient\(/.test(bgM[1])) continue;
    const fg = colorOf(fgM[1], map);
    if (!fg) continue;
    const stops = [];
    const sre = /var\(\s*(--[\w-]+)\s*\)|(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/g;
    let s;
    while ((s = sre.exec(bgM[1]))) {
      const c = colorOf(s[1] ? 'var(' + s[1] + ')' : s[2], map);
      if (c && luminance(c) !== null) stops.push(c);
    }
    if (!stops.length) continue;
    checked += 1;
    const worst = stops.map(function (c) { return ratio(fg, c); }).reduce(function (a, b) { return Math.min(a, b); });
    if (worst < 4.5) bad.push(sel + ' { ' + fg + ' on ' + stops.join('/') + ' 最差 ' + worst.toFixed(2) + '，需 ≥4.5');
  }
  return { checked: checked, bad: bad };
}
[['浅色', light], ['深色', dark]].forEach(function (pair) {
  const res = checkGradients(pair[1]);
  ok(res.checked >= 4, pair[0] + '主题扫描到「渐变底 × 文字色」规则（主按钮/徽标/头图）', res.checked + ' 条');
  ok(res.bad.length === 0, pair[0] + '主题渐变底上的反白文字达到 WCAG AA', res.bad.join(' | '));
});

console.log('\n———————————————————————————————');
console.log('  对比度：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
