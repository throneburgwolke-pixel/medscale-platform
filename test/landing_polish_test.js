'use strict';
/**
 * 首页打磨测试（jsdom 真实渲染）：量表库入口去重、图标底板合法、打字行不顶动布局、
 * 以及重度增强（顶栏收缩/回顶/中宽两列/steps 连接线/footer 分栏/动效）是否到位。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');
const dom = require('./helpers/dom.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'landing_polish_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const APP_SRC = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const t = http.makeCounter();

if (!dom.available()) {
  console.log('\n  跳过首页打磨测试：' + dom.reasonUnavailable() + '\n');
  process.exit(0);
}

function cssBlock(css, selectorRe) {
  const m = css.match(selectorRe);
  return m ? m[0] : '';
}

(async function run() {
  const app = dom.makeDom(srv, { value: '' });
  await dom.wait(360);
  const d = app.d;
  const css = app.css;

  console.log('\n【1】量表库入口只留顶栏导航一处');
  const libLinks = Array.prototype.slice.call(d.querySelectorAll('.landing a[href="#/library"]'));
  t.ok(libLinks.length === 1, '指向 #/library 的链接只有 1 个', libLinks.length);
  const libBtns = libLinks.filter(function (a) { return a.classList.contains('btn'); });
  t.ok(libBtns.length === 0, '没有按钮形态的量表库入口（按钮全删，只留导航文字链）', libBtns.length);
  const landText = d.querySelector('.landing').textContent.replace(/\s+/g, '');
  ['先看看量表库', '浏览全部量表', '浏览量表库'].forEach(function (label) {
    t.ok(landText.indexOf(label) < 0, '首页不再出现重复文案「' + label + '」');
  });
  t.ok(/量表库/.test((d.querySelector('.landing-nav-links') || { textContent: '' }).textContent), '顶栏导航仍保留量表库入口');

  console.log('\n【2】功能卡片图标底板全部合法（不再出现裸 emoji）');
  const icos = Array.prototype.slice.call(d.querySelectorAll('.feature .ico'));
  t.ok(icos.length === 6, '渲染出 6 张功能卡片', icos.length);
  const badIco = icos.filter(function (el) {
    const st = el.getAttribute('style') || '';
    return !/linear-gradient\(135deg,\s*#[0-9a-fA-F]{3,8}\s*,\s*#[0-9a-fA-F]{3,8}/.test(st);
  });
  t.ok(badIco.length === 0, '每个图标底板都是合法十六进制渐变（var()+alpha 拼接已修）',
    badIco.map(function (el) { return el.getAttribute('style'); }));

  console.log('\n【3】打字行预留两行高度、光标不占宽、短语不换行');
  const lineBlock = cssBlock(css, /\.hero\s+\.typing-line\s*\{[^}]*\}/);
  const mh = lineBlock.match(/min-height\s*:\s*([\d.]+)em/);
  t.ok(!!mh && parseFloat(mh[1]) >= 3, '打字行 min-height 至少 3em（两行），长句换行不顶动下方', lineBlock);
  const typingBlock = cssBlock(css, /\.hero\s+\.typing\s*\{[^}]*\}/);
  t.ok(typingBlock.indexOf('border-right') < 0, '光标不用 border-right（不随文字增删改变行宽）', typingBlock);
  const call = APP_SRC.match(/typingEffect\([^,]+,\s*\[([^\]]*)\]/);
  const phrases = call ? (call[1].match(/'[^']*'/g) || []).map(function (s) { return s.slice(1, -1); }) : [];
  t.ok(phrases.length >= 3, '打字短语清单存在', phrases.length);
  const tooLong = phrases.filter(function (p) { return p.length > 16; });
  t.ok(tooLong.length === 0, '每条短语不超过 16 字（窄屏单行放得下，不来回换行）', tooLong);

  console.log('\n【4】重度增强：交互逻辑与布局');
  t.ok(/\.landing-nav\.scrolled/.test(css), '顶栏有滚动收缩态样式');
  t.ok(/addEventListener\(\s*['"]scroll['"]/.test(APP_SRC), '前端监听 scroll 以切换顶栏态');
  t.ok(!!d.getElementById('back-top'), '首页渲染出回到顶部按钮');
  t.ok(/#back-top\s*\{[^}]*position\s*:\s*fixed/.test(css), '回顶按钮为固定定位', cssBlock(css, /#back-top\s*\{[^}]*\}/));
  t.ok(/\.feature-grid\s*\{[^}]*repeat\(2/.test(css), '功能网格在中间宽度收为 2 列', cssBlock(css, /\.feature-grid\s*\{[^}]*repeat\(2[^}]*\}/));
  t.ok(/\.step::(before|after)/.test(css), '四步流程有连接线');
  t.ok(/\.landing-foot[^{]*\{[^}]*grid-template-columns/.test(css), '页脚改为分栏布局', cssBlock(css, /\.landing-foot\s*\{[^}]*\}/));

  console.log('\n【5】重度增强：动效');
  t.ok(/\.marquee-wrap:hover[^{]*\{[^}]*animation-play-state\s*:\s*paused|\.marquee-wrap:hover\s+\.marquee\s*\{[^}]*paused/.test(css), '跑马灯悬停暂停');
  t.ok(/\.float-card\.b\s*\{[^}]*animation-delay/.test(css) && /\.float-card\.c\s*\{[^}]*animation-delay/.test(css), 'Hero 浮动卡片错峰漂浮');
  t.ok(/\.hero::after\s*\{[^}]*animation/.test(css), 'Hero 背景有缓慢流动动效', cssBlock(css, /\.hero::after\s*\{[^}]*\}/));

  console.log('\n【6】观感：统一缓动 + 配色层次 + 动效柔化');
  t.ok(/--ease-out\s*:/.test(css) && /--ease-spring\s*:/.test(css), '定义了统一的缓动 token（不再各处硬编码 cubic-bezier）');
  t.ok(/var\(--ease-(out|spring)\)/.test(css), '动效/过渡复用了缓动 token');
  t.ok(/\.hero h1\s*\{[^}]*animation/.test(css), 'Hero 标题有入场动画（不再静态出现）');
  t.ok(/\.section h2::after\s*\{[^}]*linear-gradient/.test(css), '小标题下有渐变装饰线（打破单调）');
  t.ok(/#features\s*\{|#steps\s*\{|#scales\s*\{/.test(css) && /section[^{]*\{[^}]*background/.test(css), '各板块有分层底色，不再整页同色');
  t.ok(/\.step:nth-child\(2\)[^{]*\{/.test(css), '四步流程按步序使用不同强调色');

  process.exit(t.done('首页打磨'));
})();
