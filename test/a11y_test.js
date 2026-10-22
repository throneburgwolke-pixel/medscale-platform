'use strict';
/**
 * 无障碍测试：键盘焦点可见性 + 语义标记（地标、可访问名称、组件角色、动效收口）。
 * 静态部分直接解析 styles.css / index.html；动态部分用 jsdom 真实渲染各视图后普查。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');
const dom = require('./helpers/dom.js');
const { ratio } = require('./helpers/contrast.js');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

const DB = path.join(__dirname, 'a11y_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const t = http.makeCounter();

/* ---------- 小工具 ---------- */
function ruleBody(selectorLike) {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  const hits = [];
  while ((m = re.exec(clean))) if (selectorLike.test(m[1])) hits.push({ sel: m[1].trim(), decls: m[2] });
  return hits;
}
function textOf(el, d) {
  const ref = el.getAttribute('aria-labelledby');
  if (ref) {
    const txt = ref.split(/\s+/).map(function (id) {
      const n = d.getElementById(id);
      return n ? n.textContent.trim() : '';
    }).join(' ').trim();
    if (txt) return txt;
  }
  return (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
}
function hasName(el, d) { return textOf(el, d).replace(/[​-‍﻿]/g, '').length > 0; }
function hasLabel(ctrl, d) {
  if (ctrl.closest('label')) return true;
  const id = ctrl.getAttribute('id');
  if (id && d.querySelector('label[for="' + id + '"]')) return true;
  if (ctrl.getAttribute('aria-label') || ctrl.getAttribute('aria-labelledby')) return true;
  return false;
}

(async function run() {
  console.log('\n【1】键盘焦点可见（CSS 静态）');
  const fv = ruleBody(/:focus-visible/);
  t.ok(fv.length > 0, '存在 :focus-visible 规则', fv.length + ' 条');
  const ring = fv.filter(function (r) { return /outline\s*:\s*(?!none|0)/.test(r.decls); });
  t.ok(ring.length > 0, ':focus-visible 画出可见轮廓（非 outline:none）', ring.map(function (r) { return r.sel; }).join(', '));
  t.ok(fv.some(function (r) { return /outline-offset\s*:\s*[1-9]/.test(r.decls); }), '焦点轮廓带 offset，不会被圆角卡片裁掉');
  t.ok(!/button[^{]*:focus\s*\{[^}]*outline\s*:\s*none/.test(CSS), '没有把按钮的默认焦点轮廓关掉');

  console.log('\n【2】焦点色在两种主题下都能看见（非文本对比 ≥3:1）');
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const lightBlock = (clean.match(/:root\s*\{([\s\S]*?)\}/) || [])[1] || '';
  const darkBlock = (clean.match(/@media\s*\(prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([\s\S]*?)\}/) || [])[1] || '';
  function tokens(block) {
    const map = {}; const re = /(--[\w-]+)\s*:\s*([^;]+);/g; let m;
    while ((m = re.exec(block))) map[m[1]] = m[2].trim();
    return map;
  }
  const light = tokens(lightBlock);
  const dark = Object.assign({}, light, tokens(darkBlock));
  [['浅色', light], ['深色', dark]].forEach(function (pair) {
    const map = pair[1];
    const ringColor = map['--focus-ring'];
    t.ok(!!ringColor, pair[0] + '主题定义了 --focus-ring 焦点色', ringColor);
    ['--surface', '--bg', '--sidebar-bg'].forEach(function (bg) {
      const r = ringColor && ratio(ringColor, map[bg]);
      t.ok(Number.isFinite(r) && r >= 3, pair[0] + ' --focus-ring on ' + bg + ' ≥3:1', Number.isFinite(r) ? r.toFixed(2) + ':1' : '无法解析（令牌缺失或不是颜色）');
    });
  });

  console.log('\n【3】减少动效偏好与跳转链接');
  t.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\s*\)/.test(clean), '存在 prefers-reduced-motion 收口块');
  const rmBlock = (clean.match(/@media\s*\(prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*)/) || [])[1] || '';
  t.ok(/animation\s*:\s*none|animation-duration\s*:\s*0/.test(rmBlock), '减少动效时关闭动画', rmBlock.slice(0, 80));
  t.ok(/transition\s*:\s*none|transition-duration\s*:\s*0/.test(rmBlock), '减少动效时关闭过渡');
  t.ok(/\.reveal[^{]*\{[^}]*opacity\s*:\s*1/.test(rmBlock),
    '减少动效时滚动显现内容仍保持可见（animation:none 不会执行 slideUpIn 的终态）');
  t.ok(ruleBody(/\.skip-link/).length > 0, '存在 .skip-link（键盘用户跳转主内容）');
  t.ok(/\.skip-link:focus|\.skip-link:focus-visible/.test(clean), '.skip-link 聚焦时可见');

  console.log('\n【4】提示气泡与页面地标');
  t.ok(/aria-live|role="status"/.test(HTML), '#toast-host 声明 aria-live/role，读屏能播报提示');
  t.ok(/<main[^>]*id="main"/.test(fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8')), '主内容区有可跳转的 id');

  if (!dom.available()) {
    console.log('\n  跳过渲染普查：' + dom.reasonUnavailable() + '\n');
    process.exit(t.done('无障碍'));
  }

  /* ---- 造一个管理员 + 一份已发布调查 ---- */
  const api = http.makeClient(srv);
  await api.request('POST', '/api/register', { username: 'dr_a11y', password: 'test123456', password2: 'test123456' });
  const own = await api.request('POST', '/api/scales', {
    scale: {
      title: 'A11Y 随访问卷', code: 'a11y-own', category: '未分类',
      definition: { items: [
        { id: 'q1', type: 'single', label: '最近一周睡眠如何', options: [{ label: '好', score: 0 }, { label: '差', score: 1 }] },
        { id: 'q2', type: 'text', label: '补充说明' },
      ] },
    },
  });
  const scaleId = (own.json || {}).id;
  t.ok(own.status === 200 && scaleId, '测试夹具：自建量表可创建', own.status);
  const created = await api.request('POST', '/api/surveys', { scaleId: scaleId, name: 'A11Y 调查' });
  const surveyId = created.json.id;
  const token = created.json.token;
  const store = { value: api.cookieStore.value };

  const views = [
    ['工作台', '#/home'], ['量表库', '#/scales'], ['量表详情', '#/scale/' + scaleId],
    ['问卷编辑器', '#/builder/' + scaleId], ['我的调查', '#/surveys'], ['调查看板', '#/survey/' + surveyId],
    ['系统设置', '#/settings'],
  ];

  console.log('\n【5】每个视图都有地标与唯一 h1');
  for (const pair of views) {
    const app = dom.makeDom(srv, { value: store.value });
    await dom.wait(320);
    await dom.goto(app, pair[1]);
    const d = app.d;
    t.ok(d.querySelectorAll('main').length === 1, pair[0] + '：唯一 <main> 地标', d.querySelectorAll('main').length);
    const h1 = d.querySelectorAll('h1');
    t.ok(h1.length === 1, pair[0] + '：唯一 <h1>', h1.length + ' 个：' + Array.from(h1).map(function (x) { return x.textContent.trim().slice(0, 12); }).join('/'));
    const nav = d.querySelector('.sidebar nav') || d.querySelector('nav[aria-label]');
    t.ok(!!nav && !!nav.getAttribute('aria-label'), pair[0] + '：侧栏导航是带名称的 <nav>');
    const active = d.querySelector('.nav-item.active');
    t.ok(!active || active.getAttribute('aria-current') === 'page', pair[0] + '：当前导航项标注 aria-current', active && active.outerHTML.slice(0, 70));
    const main = d.querySelector('main#main');
    t.ok(!!main && main.getAttribute('tabindex') === '-1', pair[0] + '：跳转链接的目标可接收焦点', main && main.outerHTML.slice(0, 40));
  }

  console.log('\n【6】可访问名称普查（按钮 / 链接 / 图形 / 表单控件）');
  const fillApp = dom.makeDom(srv, { value: '' }, { url: 'http://localhost:5173/s/' + token });
  await dom.wait(420);
  const allApps = [];
  for (const pair of views) {
    const app = dom.makeDom(srv, { value: store.value });
    await dom.wait(320);
    await dom.goto(app, pair[1]);
    allApps.push([pair[0], app]);
  }
  allApps.push(['公开填写页', fillApp]);
  allApps.push(['登录页', (function () { const a = dom.makeDom(srv, { value: '' }); return a; })()]);

  for (const pair of allApps) {
    const name = pair[0];
    const d = pair[1].d;
    const badBtn = Array.from(d.querySelectorAll('button, a[href]')).filter(function (b) {
      if (b.classList.contains('skip-link')) return false;
      return !hasName(b, d);
    });
    t.ok(badBtn.length === 0, name + '：所有按钮/链接都有可读名称', badBtn.slice(0, 3).map(function (b) { return b.outerHTML.slice(0, 70); }).join(' | '));
    const badCtrl = Array.from(d.querySelectorAll('input, select, textarea')).filter(function (c) {
      const ty = (c.getAttribute('type') || 'text').toLowerCase();
      if (ty === 'hidden' || ty === 'file') return false;
      return !hasLabel(c, d);
    });
    t.ok(badCtrl.length === 0, name + '：所有表单控件都有关联标签', badCtrl.slice(0, 3).map(function (c) { return c.outerHTML.slice(0, 70); }).join(' | '));
    const badImg = Array.from(d.querySelectorAll('img, canvas, svg[role="img"]')).filter(function (g) {
      return !g.getAttribute('alt') && !g.getAttribute('aria-label') && !g.closest('[aria-label]');
    });
    t.ok(badImg.length === 0, name + '：图表/图片有文字替代', badImg.slice(0, 3).map(function (g) { return g.outerHTML.slice(0, 60); }).join(' | '));
  }

  console.log('\n【7】组件语义角色');
  const dash = dom.makeDom(srv, { value: store.value });
  await dom.wait(320);
  await dom.goto(dash, '#/survey/' + surveyId);
  const tabs = Array.from(dash.d.querySelectorAll('.tab'));
  t.ok(tabs.length > 0, '看板存在标签页', tabs.length);
  t.ok(tabs.every(function (x) { return x.getAttribute('role') === 'tab'; }), '标签页有 role="tab"');
  t.ok(tabs.filter(function (x) { return x.getAttribute('aria-selected') === 'true'; }).length === 1, '恰好一个标签 aria-selected="true"');
  t.ok(!!dash.d.querySelector('.tabs[role="tablist"]'), '标签容器有 role="tablist"');
  t.ok(!!dash.d.querySelector('[role="tabpanel"]'), '标签面板有 role="tabpanel"');

  const scales = dom.makeDom(srv, { value: store.value });
  await dom.wait(320);
  await dom.goto(scales, '#/scales');
  const chips = Array.from(scales.d.querySelectorAll('.chip'));
  t.ok(chips.length > 0 && chips.every(function (c) { return c.hasAttribute('aria-pressed'); }), '筛选按钮用 aria-pressed 表达选中态', chips.slice(0, 2).map(function (c) { return c.outerHTML.slice(0, 60); }));

  const pub = dom.makeDom(srv, { value: store.value });
  await dom.wait(320);
  await dom.goto(pub, '#/scale/' + scaleId);
  const btn = pub.d.querySelector('#d-publish, [data-act="publish"]');
  if (btn) btn.click();
  await dom.wait(420);
  const modal = pub.d.querySelector('.modal');
  t.ok(!!modal, '发布弹窗可打开', !!modal);
  if (modal) {
    t.ok(modal.getAttribute('role') === 'dialog' && modal.getAttribute('aria-modal') === 'true', '弹窗标注 role="dialog" aria-modal', modal.outerHTML.slice(0, 90));
    t.ok(hasName(modal, pub.d), '弹窗有可访问名称（读屏能报出标题）');
    t.ok(modal.contains(pub.d.activeElement), '弹窗打开后焦点进入弹窗（键盘用户不用重新 Tab）',
      pub.d.activeElement && pub.d.activeElement.outerHTML.slice(0, 60));
    pub.d.dispatchEvent(new pub.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await dom.wait(60);
    t.ok(!pub.d.querySelector('.modal-mask'), 'Escape 能关闭弹窗');
  }

  console.log('\n【8】装饰性图标不干扰朗读');
  const home = dom.makeDom(srv, { value: store.value });
  await dom.wait(320);
  await dom.goto(home, '#/home');
  const icons = Array.from(home.d.querySelectorAll('.nav-item .ico, .feature .ico, .ico-tile'));
  t.ok(icons.length > 0, '页面存在表情图标容器', icons.length);
  t.ok(icons.every(function (i) { return i.getAttribute('aria-hidden') === 'true'; }), '装饰图标标注 aria-hidden', icons.slice(0, 2).map(function (i) { return i.outerHTML.slice(0, 50); }));

  process.exit(t.done('无障碍'));
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
