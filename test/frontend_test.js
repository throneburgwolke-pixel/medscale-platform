'use strict';
/**
 * 前端行为测试（jsdom 真实渲染）：注册开关在界面上的表现、首页锚点导航。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');
const dom = require('./helpers/dom.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'frontend_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const t = http.makeCounter();

if (!dom.available()) {
  console.log('\n  跳过前端行为测试：' + dom.reasonUnavailable() + '\n');
  process.exit(0);
}

(async function run() {
  // /logic.js 在 Node 版由 server.js 动态读 lib/logic.js，Workers 版读 public/logic.js 的副本：
  // 两份必须字节一致，否则线上跳题/分类行为会与本地分叉。
  t.ok(fs.readFileSync(path.join(ROOT, 'lib', 'logic.js'), 'utf8') ===
    fs.readFileSync(path.join(ROOT, 'public', 'logic.js'), 'utf8'),
    'public/logic.js 与 lib/logic.js 保持一致（npm run sync:logic）');

  // 登录/注册在首页各只留一处，公开页反复堆同一入口会让人抓不到重点
  const touchpoints = function (d) {
    const nodes = Array.prototype.slice.call(d.querySelectorAll('.landing a, .landing button'));
    const text = function (n) { return (n.textContent || '').replace(/\s+/g, ''); };
    return {
      login: nodes.filter(function (n) { return /登录/.test(text(n)); }).map(text),
      register: nodes.filter(function (n) { return /注册/.test(text(n)); }).map(text),
    };
  };

  console.log('\n【1】零用户：首页与注册页开放自助注册');
  let app = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  t.ok(!!app.d.getElementById('lp-register'), '首页显示"免费注册"入口');
  t.ok(/免费注册/.test(app.d.querySelector('.hero-cta').textContent), '主 CTA 是免费注册');
  let tp = touchpoints(app.d);
  t.ok(tp.login.length === 1, '首页只保留 1 个登录触点', tp.login.join(' / '));
  t.ok(tp.register.length <= 2, '注册触点不超过 2 个', tp.register.join(' / '));
  await dom.goto(app, '#/register');
  t.ok(!!app.d.getElementById('btn-register'), '注册表单可渲染');

  console.log('\n【2】默认进入邀请码模式：注册入口不消失，但要填码');
  const api = http.makeClient(srv);
  const r = await api.request('POST', '/api/register', { username: 'drzhang', password: 'test123456', password2: 'test123456' });
  t.ok(r.status === 200, '首个账号注册成功', r.status);

  app = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  t.ok(!!app.d.getElementById('lp-register'), '邀请码模式下首页仍有注册入口');
  t.ok(/邀请码/.test((app.d.getElementById('lp-register') || {}).textContent || ''), '入口文案说明要邀请码',
    (app.d.getElementById('lp-register') || {}).textContent);
  tp = touchpoints(app.d);
  t.ok(tp.login.length === 1, '首页登录触点仍是 1 个', tp.login.join(' / '));
  await dom.goto(app, '#/register');
  await dom.wait(320);
  const invite = app.d.getElementById('reg-invite');
  t.ok(!!invite, '注册表单提供邀请码输入框');
  t.ok(invite && invite.required === true, '邀请码模式下该项标为必填', invite && invite.required);
  t.ok(/联系管理员|向管理员索取/.test(app.d.body.textContent), '说明码从哪来', app.d.body.textContent.slice(0, 200));

  console.log('\n【3】系统设置：三态单选 + 邀请码发放面板');
  const admin = http.makeClient(srv);
  await admin.request('POST', '/api/login', { username: 'drzhang', password: 'test123456' });
  const s = await admin.request('GET', '/api/session');
  t.ok(s.json.isAdmin === true, '首账号是管理员', s.json.isAdmin);

  const uiStore = { value: '' };
  const boot = dom.makeDom(srv, uiStore);
  await boot.rawRequest('POST', '/api/login', JSON.stringify({ username: 'drzhang', password: 'test123456' }));
  const ui = dom.makeDom(srv, uiStore);
  await dom.wait(320);
  await dom.goto(ui, '#/settings');
  await dom.wait(420);
  t.ok(/系统设置|用户管理/.test(ui.d.body.textContent), '管理员可进入系统设置页', ui.d.body.textContent.slice(0, 120));
  const modes = ui.d.querySelectorAll('input[name="register-mode"]');
  t.ok(modes.length === 3, '注册策略提供三种选择', modes.length);
  const checkedMode = Array.prototype.slice.call(modes).filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
  t.ok(checkedMode.length === 1 && checkedMode[0] === 'invite', '默认选中「邀请码」', checkedMode.join(','));
  t.ok(!!ui.d.getElementById('invite-note') && !!ui.d.getElementById('btn-invite'), '提供邀请码生成表单');
  if (ui.d.getElementById('invite-note')) {
    ui.d.getElementById('invite-note').value = '神内三组';
    ui.d.getElementById('invite-max').value = '3';
    ui.d.getElementById('btn-invite').click();
    await dom.wait(700);
  }
  const listText = (ui.d.getElementById('invite-list') || {}).textContent || '';
  t.ok(/神内三组/.test(listText), '新生成的码出现在列表里', listText.slice(0, 120));
  t.ok(/[A-HJ-NP-Z2-9]{8}/.test(listText), '列表展示可直接转抄的码', listText.slice(0, 80));

  // 切到开放：注册页不再要求填码
  const openRadio = Array.prototype.slice.call(modes).filter(function (x) { return x.value === 'open'; })[0];
  if (openRadio) { openRadio.checked = true; openRadio.dispatchEvent(new ui.w.Event('change')); }
  await dom.wait(700);
  const afterOpen = await admin.request('GET', '/api/settings');
  t.ok(afterOpen.json.allowRegister === true && afterOpen.json.registerMode === 'open', '单选切换会写回服务端', afterOpen.json);
  app = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  t.ok(/免费注册/.test((app.d.getElementById('lp-register') || {}).textContent || ''), '开放模式文案回到免费注册',
    (app.d.getElementById('lp-register') || {}).textContent);
  await dom.goto(app, '#/register');
  await dom.wait(320);
  const freeInvite = app.d.getElementById('reg-invite');
  t.ok(!freeInvite || freeInvite.required !== true, '开放模式不强制填码', freeInvite && freeInvite.required);

  // 切到关闭：入口收掉，注册页给出说明而不是空白表单
  const closedRadio = Array.prototype.slice.call(ui.d.querySelectorAll('input[name="register-mode"]'))
    .filter(function (x) { return x.value === 'closed'; })[0];
  if (closedRadio) { closedRadio.checked = true; closedRadio.dispatchEvent(new ui.w.Event('change')); }
  await dom.wait(700);
  app = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  t.ok(!app.d.getElementById('lp-register'), '关闭模式首页不再有注册入口');
  t.ok(touchpoints(app.d).login.length <= 2, '关闭模式下登录触点不超过 2 个', touchpoints(app.d).login.join(' / '));
  await dom.goto(app, '#/register');
  t.ok(!app.d.getElementById('btn-register'), '注册页不再渲染表单');
  t.ok(/注册.{0,6}已关闭|联系管理员/.test(app.d.body.textContent), '注册页给出关闭说明', app.d.body.textContent.slice(0, 160));
  t.ok(/管理员口令|管理员登录/.test(app.d.body.textContent), '提供管理员登录出口');

  // 后面还要用免码注册建普通账号，这里把开关恢复为开放
  const tog = await admin.request('POST', '/api/settings', { registerMode: 'open' });
  t.ok(tog.status === 200 && tog.json.allowRegister === true, '恢复为开放注册', tog.json);

  console.log('\n【4】首页锚点导航不被当成路由');
  const land = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  const feat = land.d.getElementById('features');
  t.ok(!!feat, '首页存在「功能」板块');
  if (feat) feat.setAttribute('data-sentinel', 'kept');
  await dom.goto(land, '#features');
  t.ok(!!land.d.querySelector('.landing'), '点锚点后首页仍在，未被默认路由接管');
  const kept = land.d.getElementById('features');
  t.ok(kept && kept.getAttribute('data-sentinel') === 'kept', '点锚点不重建整页 DOM', kept && kept.getAttribute('data-sentinel'));
  const scrolled = (land.w.__scrolls || []).map(function (s) { return s.id; });
  t.ok(scrolled.indexOf('features') >= 0, '「功能」链接滚动定位到对应板块', scrolled);
  t.ok(/\.landing\s+\.section\s*\{[^}]*scroll-margin-top/.test(land.css), '锚点目标预留吸顶导航高度');

  const steps = land.d.getElementById('steps');
  if (steps) steps.setAttribute('data-sentinel', 'kept');
  await dom.goto(land, '#steps');
  const keptSteps = land.d.getElementById('steps');
  t.ok(keptSteps && keptSteps.getAttribute('data-sentinel') === 'kept', '「使用流程」锚点同样不重建 DOM');
  const scrolled2 = (land.w.__scrolls || []).map(function (s) { return s.id; });
  t.ok(scrolled2.indexOf('steps') >= 0, '「使用流程」链接定位到步骤板块', scrolled2);

  console.log('\n【5】从其它页面深链到首页锚点');
  await dom.goto(land, '#/guide');
  t.ok(!land.d.querySelector('.hero'), '已进入使用流程页');
  await dom.goto(land, '#features');
  t.ok(!!land.d.querySelector('.landing'), '深链锚点时先渲染首页');
  t.ok(!!land.d.getElementById('features'), '目标板块存在');
  const scrolled3 = (land.w.__scrolls || []).map(function (s) { return s.id; });
  t.ok(scrolled3.lastIndexOf('features') > scrolled3.lastIndexOf('guide'), '渲染首页后再定位锚点', scrolled3);

  console.log('\n【6】窄屏导航折叠为菜单');
  const nav = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  const btn = nav.d.getElementById('lp-menu');
  t.ok(!!btn, '首页导航提供菜单按钮');
  t.ok(btn && btn.getAttribute('aria-expanded') === 'false', '菜单默认收起');
  t.ok(btn && btn.getAttribute('aria-controls') === 'lp-nav-links', '按钮用 aria-controls 关联链接容器');
  const linksBox = nav.d.getElementById('lp-nav-links');
  t.ok(!!linksBox, '导航链接容器有稳定 id');
  t.ok(linksBox && /量表库/.test(linksBox.textContent) && /使用流程/.test(linksBox.textContent), '菜单含全部导航项');
  if (btn) btn.click();
  await dom.wait(80);
  t.ok(btn && btn.getAttribute('aria-expanded') === 'true', '点击按钮展开菜单', btn && btn.getAttribute('aria-expanded'));
  t.ok(linksBox && linksBox.classList.contains('open'), '展开时链接容器可见');
  const featLink = linksBox && linksBox.querySelector('a[href="#features"]');
  t.ok(!!featLink, '菜单里的锚点项仍在');
  if (featLink) featLink.click();
  await dom.wait(200);
  t.ok(btn && btn.getAttribute('aria-expanded') === 'false', '选择菜单项后自动收起', btn && btn.getAttribute('aria-expanded'));
  t.ok(linksBox && !linksBox.classList.contains('open'), '收起后移除 open 状态');

  await dom.goto(nav, '#/library');
  const btn2 = nav.d.getElementById('lp-menu');
  t.ok(!!btn2, '量表库页同样提供菜单按钮');
  t.ok(btn2 && btn2.getAttribute('aria-expanded') === 'false', '量表库页菜单默认收起');
  await dom.goto(nav, '#/guide');
  t.ok(!!nav.d.getElementById('lp-menu'), '使用流程页同样提供菜单按钮');
  t.ok(/\.nav-toggle\s*\{\s*display:\s*none/.test(nav.css), '宽屏隐藏菜单按钮');
  t.ok(/@media[^{]*max-width:\s*980px[\s\S]*?\.nav-toggle\s*\{\s*display:\s*inline-flex/.test(nav.css), '窄屏显示菜单按钮');
  t.ok(/\.landing-nav-links\.open/.test(nav.css), '窄屏展开态有样式');

  console.log('\n【7】Hero 打字机不再抖动布局');
  const hp = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  const typing = hp.d.getElementById('lp-typing');
  t.ok(!!typing, '首页有打字行');
  t.ok(typing && !typing.closest('.lead'), '打字行不嵌在段落里，不会让段落反复回排', typing && typing.parentNode.className);
  t.ok(typing && !!typing.closest('.typing-line'), '打字行有独立容器');
  t.ok(/\.typing-line\s*\{[^}]*min-height\s*:\s*[2-9]/.test(hp.css), '打字行预留至少两行高度，长句换行也不顶动下方内容');

  hp.w.matchMedia = function (q) { return { matches: /reduced-motion/.test(q), media: q, addEventListener: function () { }, removeEventListener: function () { } }; };
  await dom.goto(hp, '#/guide');
  await dom.goto(hp, '#/');
  await dom.wait(500);
  const staticText = (hp.d.getElementById('lp-typing') || {}).textContent;
  await dom.wait(600);
  t.ok(staticText && staticText.length > 0 && hp.d.getElementById('lp-typing').textContent === staticText, '减弱动效时打字行保持静态', staticText);

  console.log('\n【8】首页演示数据必须标明是示例');
  const hd = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  const visual = hd.d.querySelector('.hero-visual');
  t.ok(!!visual, '首页有右侧视觉区');
  const cards = Array.from(hd.d.querySelectorAll('.hero .float-card'));
  t.ok(cards.length >= 3, '三张演示卡片都在', cards.length);
  t.ok(cards.length > 0 && cards.every(function (c) {
    const tag = c.querySelector('.demo-tag');
    return tag && /示例|演示/.test(tag.textContent);
  }), '每张卡片都挂「示例数据」角标', cards.map(function (c) { return c.textContent.trim().slice(0, 18); }));
  t.ok(visual && visual.getAttribute('aria-hidden') === 'true', '编造的指标不朗读给读屏用户');
  const mq = hd.d.querySelector('.marquee-wrap');
  const mqCaption = mq && (mq.getAttribute('aria-label') || '') + (function () {
    const p = mq.previousElementSibling;
    return p ? p.textContent : '';
  })();
  t.ok(/节选|部分|示例/.test(mqCaption), '量表跑马灯标明只是节选', mqCaption);

  console.log('\n【9】每张量表卡片都标明许可状态');
  const lic = dom.makeDom(srv, uiStore);
  await dom.wait(320);
  await dom.goto(lic, '#/scales');
  await dom.wait(420);
  const licCards = Array.from(lic.d.querySelectorAll('.scale-card'));
  t.ok(licCards.length > 10, '量表库渲染出卡片', licCards.length);
  const noTag = licCards.filter(function (c) { return !c.querySelector('.lic-tag'); });
  t.ok(licCards.length > 0 && noTag.length === 0, '所有卡片都有许可标签', noTag.slice(0, 2).map(function (c) { return c.textContent.trim().slice(0, 24); }));
  const tagText = function (c) { const el = c && c.querySelector('.lic-tag'); return el ? el.textContent : ''; };
  const tagTitle = function (c) { const el = c && c.querySelector('.lic-tag'); return el ? (el.getAttribute('title') || '') : ''; };
  const phq = licCards.find(function (c) { return /PHQ-9/.test(c.textContent); });
  t.ok(/免费/.test(tagText(phq)), 'PHQ-9 标为免费使用', tagText(phq));
  t.ok(/Pfizer/.test(tagTitle(phq)), '标签悬停可看完整授权说明', tagTitle(phq));
  const mmas = licCards.find(function (c) { return /MMAS-8/.test(c.textContent); });
  t.ok(/需申请|需授权|商业授权/.test(tagText(mmas)), 'MMAS-8 标出需要授权/正文待填', tagText(mmas));
  const mmasTag = mmas && mmas.querySelector('.lic-tag');
  t.ok(!!mmasTag && /warn|pending/.test(mmasTag.className), '需授权的用警示色', mmasTag && mmasTag.className);
  const src = licCards.find(function (c) { return /PSQI/.test(c.textContent); });
  t.ok(!!src, '量表库含 PSQI');
  if (src) {
    await dom.goto(lic, '#/scale/' + src.getAttribute('data-scale'));
    await dom.wait(420);
    t.ok(/来源文献/.test(lic.d.body.textContent) && !/来源文献<\/dt><dd[^>]*>—/.test(lic.d.innerHTML), '详情页给出出处，不留空');
    t.ok(/授权说明/.test(lic.d.body.textContent), '详情页给出授权说明');
  }

  const pub = dom.makeDom(srv, { value: '' });
  await dom.wait(320);
  await dom.goto(pub, '#/library');
  await dom.wait(420);
  const pubCards = Array.from(pub.d.querySelectorAll('.scale-card'));
  t.ok(pubCards.length > 5 && pubCards.every(function (c) { return !!c.querySelector('.lic-tag'); }), '未登录的量表库同样标注许可', pubCards.length);

  console.log('\n【10】对外文案与实际能力一致');
  const sents = function (text) {
    return String(text).replace(/\s+/g, ' ').split(/(?<=[。！？；])/).map(function (s) { return s.trim(); }).filter(Boolean);
  };
  // 逐个「文字叶子节点」取句，避免整页文本被并成一句导致定位困难
  const leafTexts = function (d) {
    return Array.from(d.querySelectorAll('body *')).filter(function (el) {
      return !el.querySelector('p,li,td,th,h1,h2,h3,h4,div,span,button,a');
    }).map(function (el) { return el.textContent.trim(); }).filter(Boolean);
  };
  const checkCopy = function (name, d) {
    const all = leafTexts(d).reduce(function (acc, t) { return acc.concat(sents(t)); }, []);
    const ocr = all.filter(function (s) { return /图片/.test(s) && /识别|OCR/i.test(s); });
    const vague = ocr.filter(function (s) { return !/macOS|苹果/i.test(s); });
    t.ok(ocr.length > 0 && vague.length === 0, name + '：写到图片识别就讲清只在 macOS 可用', vague.slice(0, 2));
    const spss = all.filter(function (s) { return /SPSS/i.test(s) && /导出/.test(s); });
    const over = spss.filter(function (s) { return !/CSV/i.test(s) || /\.sav/i.test(s); });
    t.ok(over.length === 0, name + '：SPSS 导出说清是数值 CSV，不夸大成 .sav', over.slice(0, 2));
  };
  checkCopy('首页', hd.d);
  await dom.goto(hd, '#/guide');
  checkCopy('使用流程页', hd.d);
  await dom.goto(lic, '#/home');
  await dom.wait(420);
  checkCopy('工作台', lic.d);
  await dom.goto(lic, '#/import');
  await dom.wait(420);
  checkCopy('导入页', lic.d);
  t.ok(/macOS|苹果/i.test(lic.d.body.textContent), '导入页说明图片 OCR 的平台条件');

  console.log('\n【11】页面元信息与兜底页');
  const meta = hp.d.querySelector('meta[name="description"]');
  t.ok(!!meta && (meta.getAttribute('content') || '').length >= 20, '首页有 description，分享与搜索能抓到摘要', meta && meta.getAttribute('content'));
  t.ok(/量表|问卷/.test((meta || {}).getAttribute ? meta.getAttribute('content') : ''), 'description 说清平台是做什么的');
  t.ok(!!hp.d.querySelector('meta[property="og:title"]'), '有 og:title');
  t.ok(!!hp.d.querySelector('meta[property="og:description"]'), '有 og:description');
  t.ok(hp.d.title && hp.d.title.length > 0 && /医学|量表/.test(hp.d.title), '标题不为空且能识别平台', hp.d.title);

  await dom.goto(hd, '#/no-such-page');
  await dom.wait(320);
  t.ok(/页面不存在|地址有误|找不到/.test(hd.d.body.textContent), '未知路由给出 404 说明而不是静默跳到工作台', hd.d.body.textContent.slice(0, 120));
  t.ok(/#\/no-such-page/.test(hd.d.body.textContent), '说明里回显用户输入的地址，便于发现拼写错误', hd.d.body.textContent.slice(0, 160));
  t.ok(!!hd.d.querySelector('a[href="#/"], a[href="#/home"]'), '404 页提供回首页的出口');

  const guide = await http.makeClient(srv).request('GET', '/api/guide.md');
  t.ok(guide.status === 200, '完整使用说明可下载', guide.status);
  let localDoc = '';
  try { localDoc = fs.readFileSync(path.join(ROOT, 'docs', '使用说明.md'), 'utf8'); } catch (e) { localDoc = null; }
  t.ok(localDoc !== null, '仓库内有 docs/使用说明.md，不依赖仓库外的文件');
  t.ok(localDoc !== null && guide.text === localDoc, '线上说明与仓库内文档一致');
  t.ok(/备份/.test(guide.text) && /许可|授权/.test(guide.text), '说明覆盖备份与量表授权', guide.text.slice(0, 60));
  t.ok(!/\/Users\//.test(guide.text), '说明里不含个人机器路径');

  const miss = await http.makeClient(srv).request('GET', '/no-such-page');
  t.ok(miss.status === 404, '不存在的地址返回 404', miss.status);
  t.ok(/text\/html/.test(miss.headers['Content-Type'] || ''), '404 以网页形式返回', miss.headers['Content-Type']);
  t.ok(/返回首页|回到工作台|首页/.test(miss.text), '404 页给出回首页的链接', miss.text.slice(0, 120));

  await dom.goto(hd, '#/guide');
  await dom.wait(320);
  const guideText = hd.d.body.textContent;
  t.ok(!/共享量表库与调查数据/.test(guideText), '使用说明不再声称数据全员共享', guideText.slice(0, 80));
  t.ok(/自己创建|. {0,6}隔离|按创建者/.test(guideText), '使用说明写明数据按创建者隔离');

  console.log('\n【12】登录页与旧版本提示的工程卫生');
  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const fillSrc = fs.readFileSync(path.join(ROOT, 'public', 'fill.js'), 'utf8');
  t.ok(!/renderOldBackendNotice/.test(appSrc), '删掉"旧版本后端"提示页：固定端口后不会再连到旧进程');
  t.ok(!/localhost:51[0-9]{2}/.test(appSrc), '前端不再硬编码一串候选端口', (appSrc.match(/localhost:51\d\d/g) || []).join(','));

  await dom.goto(hd, '#/admin');
  await dom.wait(320);
  const adminText = hd.d.body.textContent;
  t.ok(!/admin123/.test(adminText), '管理员登录页不公开初始口令', adminText.slice(0, 120));
  t.ok(/管理员密码/.test(adminText) && !!hd.d.getElementById('pwd'), '仍清楚说明要输入管理员密码');
  t.ok(/启动(日志|时打印)|服务器日志|日志中/.test(adminText), '指引部署者去服务器启动日志查看当前口令', adminText.slice(0, 160));
  t.ok(!/admin123/.test(appSrc), '前端源码里也不留默认口令字面量', (appSrc.match(/admin123/g) || []).length);

  console.log('\n【13】跳题逻辑与分类清单只有一份实现');
  const logicSrc = fs.readFileSync(path.join(ROOT, 'lib', 'logic.js'), 'utf8');
  const scalesSrc = fs.readFileSync(path.join(ROOT, 'lib', 'scales.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  t.ok(!/function computeVisibility/.test(appSrc), 'app.js 不再自带跳题引擎副本');
  t.ok(!/function matchSkip/.test(appSrc), 'app.js 不再自带 matchSkip 副本');
  t.ok(!/const CATEGORIES = \[/.test(appSrc), 'app.js 不再自带分类清单副本');
  t.ok(!/const CATEGORIES = \[/.test(scalesSrc), 'lib/scales.js 也不再自带分类清单副本');
  t.ok(/const CATEGORIES = \[/.test(logicSrc), '分类清单定义在 lib/logic.js');
  t.ok(/MEDSCALE_LOGIC/.test(logicSrc), 'lib/logic.js 同时暴露给浏览器');
  t.ok(/<script src="\/logic\.js"><\/script>[\s\S]*<script src="\/common\.js"><\/script>[\s\S]*<script src="\/app\.js"><\/script>/.test(idxSrc),
    'index.html 先加载共享模块与 common.js，再加载 app.js');

  const shared = await http.makeClient(srv).request('GET', '/logic.js');
  t.ok(shared.status === 200, '浏览器能取到共享模块', shared.status);
  t.ok(/javascript/.test(shared.headers['Content-Type'] || ''), '共享模块按 JS 类型返回', shared.headers['Content-Type']);

  // 真的复用：app.js 只是接住共享模块的引用，页面行为由同一份实现决定
  const SHARED = hp.w.MEDSCALE_LOGIC || {};
  t.ok(!!SHARED.computeVisibility, '页面里存在 MEDSCALE_LOGIC');
  t.ok(/= *LOGIC\.computeVisibility/.test(fillSrc), 'fill.js 取的是共享引擎引用', 'no alias');
  t.ok(/= *SHARED\.CATEGORIES/.test(appSrc), 'app.js 取的是共享分类清单');
  const skipDef = { items: [
    { id: 'q1', no: 1, text: '是否有头痛？', type: 'radio', options: [{ label: '有', value: 1 }, { label: '无', value: 0 }],
      skip: [{ values: ['0'], action: 'end' }] },
    { id: 'q2', no: 2, text: '头痛频率', type: 'radio', options: [{ label: '每周', value: 1 }, { label: '每月', value: 2 }] },
  ] };
  const vis = (SHARED.computeVisibility || function () { return {}; })(skipDef, { q1: 0 });
  t.ok((vis.visible || []).join(',') === 'q1' && (vis.skipped || []).join(',') === 'q2' && vis.ended,
    '浏览器端跳题判定与服务端一致', JSON.stringify(vis));

  // 端到端：填写页实际渲染跟随共享引擎
  const skipCli = http.makeClient(srv);
  await skipCli.request('POST', '/api/login', { username: 'drzhang', password: 'test123456' });
  const mkScale = await skipCli.request('POST', '/api/scales', {
    scale: { title: '共享引擎回归问卷', category: '症状评估', definition: skipDef },
  });
  t.ok(mkScale.status === 200 && !!mkScale.json.id, '创建含跳题规则的问卷', mkScale.status);
  const mkSurvey = await skipCli.request('POST', '/api/surveys', { scaleId: mkScale.json.id, name: '共享引擎回归', showResult: true });
  t.ok(mkSurvey.status === 200 && !!mkSurvey.json.token, '发放该问卷', mkSurvey.status);

  const fill = dom.makeDom(srv, { value: '' }, { url: 'http://localhost:5173/s/' + mkSurvey.json.token });
  await dom.wait(500);
  t.ok(/是否有头痛/.test(fill.d.body.textContent), '填写页渲染出第 1 题');
  t.ok(/头痛频率/.test(fill.d.body.textContent), '未命中规则时第 2 题可见');
  const trigger = fill.d.querySelector('input[data-in="q1"][value="0"]');
  t.ok(!!trigger, '第 1 题的「无」选项可点击');
  if (trigger) {
    trigger.checked = true;
    trigger.dispatchEvent(new fill.w.Event('change'));
    await dom.wait(400);
    t.ok(!/头痛频率/.test(fill.d.body.textContent), '选中「无」后被跳过的题目从页面上消失',
      fill.d.body.textContent.replace(/\s+/g, ' ').slice(0, 140));
    t.ok(fill.d.querySelectorAll('.q').length === 1, '页面上只剩 1 道题', fill.d.querySelectorAll('.q').length);
  }

  console.log('\n【14】「修改管理员密码」只对管理员可见');
  const staff = http.makeClient(srv);
  const reg = await staff.request('POST', '/api/register', { username: 'wunurse', password: 'nurse123456', name: '吴护士' });
  t.ok(reg.status === 200, '此时注册开关仍开着，可注册普通账号', reg.status);
  const staffDom = dom.makeDom(srv, staff.cookieStore);
  await dom.wait(360);
  await dom.goto(staffDom, '#/settings');
  await dom.wait(460);
  const staffText = staffDom.d.body.textContent.replace(/\s+/g, ' ');
  t.ok(/系统设置/.test(staffText), '普通账号也能打开系统设置页', staffText.slice(0, 100));
  t.ok(!/修改管理员密码/.test(staffText), '普通账号看不到「修改管理员密码」卡片', staffText.slice(0, 200));
  t.ok(!/用户管理/.test(staffText), '普通账号看不到用户管理');

  const adminDom = dom.makeDom(srv, admin.cookieStore);
  await dom.wait(360);
  await dom.goto(adminDom, '#/settings');
  await dom.wait(460);
  const adminSettingsText = adminDom.d.body.textContent.replace(/\s+/g, ' ');
  t.ok(/修改管理员密码/.test(adminSettingsText), '管理员仍能看到修改入口', adminSettingsText.slice(0, 160));

  console.log('\n【15】授权分级徽标、待填拦截、评估者文案');
  const tierSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  t.ok(/licenseTier/.test(tierSrc) && /s\.definition/.test(tierSrc), 'app.js 依据量表定义里的 licenseTier 决定徽标');

  // 真实渲染：建四份量表，看卡片上的授权徽标
  const mkTierScale = async (title, tier, items) => admin.request('POST', '/api/scales', { scale: {
    title: title, category: '情绪与心理', licenseTier: tier,
    definition: { items: items, dimensions: [{ id: 'total', name: '总分', items: items.map((i) => i.id) }], scoring: { method: 'sum' } },
  } });
  const plainItem = (id) => ({ id: id, no: 1, text: '题干', type: 'radio', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] });
  const pendItems = [{ id: 'q1', no: 1, text: '第 1 题：请按授权版本填入题干', type: 'radio', textPending: true,
    options: [{ label: '选项 1（0 分）：请按授权版本填入', value: 0 }, { label: '选项 2（1 分）：请按授权版本填入', value: 1 }] }];
  await mkTierScale('徽标-免费', 'free', [plainItem('a1')]);
  await mkTierScale('徽标-注册', 'registration', [plainItem('a2')]);
  await mkTierScale('徽标-商业待填', 'commercial', pendItems);
  await mkTierScale('徽标-商业已填', 'commercial', [plainItem('a4')]);
  const tierDom = dom.makeDom(srv, admin.cookieStore);
  await dom.wait(360);
  await dom.goto(tierDom, '#/scales');
  await dom.wait(520);
  const tagOfTitle = (title) => {
    const card = Array.from(tierDom.d.querySelectorAll('.scale-card')).find((c) => c.textContent.indexOf(title) >= 0);
    const tag = card && card.querySelector('.lic-tag');
    return tag ? tag.textContent.trim() : null;
  };
  t.ok(tagOfTitle('徽标-免费') === '免费使用', 'free → 免费使用', tagOfTitle('徽标-免费'));
  t.ok(tagOfTitle('徽标-注册') === '免费 · 需注册或引用', 'registration → 免费 · 需注册或引用', tagOfTitle('徽标-注册'));
  t.ok(tagOfTitle('徽标-商业待填') === '商业授权 · 正文待填', 'commercial 且有占位 → 商业授权 · 正文待填', tagOfTitle('徽标-商业待填'));
  t.ok(tagOfTitle('徽标-商业已填') === '商业授权', 'commercial 已填完 → 商业授权', tagOfTitle('徽标-商业已填'));
  t.ok(/pendingItems\(s\.definition\)/.test(tierSrc) && /待填入授权文本/.test(tierSrc),
    '发布对话框在打开前检查待填条目');

  // 行为：带占位条目的量表点「发布为调查」只弹提示，不打开发布对话框
  const pendScale = await admin.request('POST', '/api/scales', { scale: {
    title: '待填量表', category: '情绪与心理', licenseTier: 'commercial',
    definition: { items: pendItems, dimensions: [{ id: 'total', name: '总分', items: ['q1'] }], scoring: { method: 'sum' } },
  } });
  t.ok(pendScale.status === 200 && !!pendScale.json.id, '创建带占位条目的量表', pendScale.json);
  const pendDom = dom.makeDom(srv, admin.cookieStore);
  await dom.wait(360);
  await dom.goto(pendDom, '#/scale/' + pendScale.json.id);
  await dom.wait(420);
  const publishBtn = pendDom.d.getElementById('d-publish');
  t.ok(!!publishBtn, '量表详情页有「发布为调查」按钮');
  t.ok(/还有 *1 *道题待填入授权文本/.test(pendDom.d.body.textContent), '详情页顶部说明还剩几道题待填',
    pendDom.d.body.textContent.slice(0, 200));
  if (publishBtn) publishBtn.click();
  await dom.wait(320);
  const pendToast = pendDom.d.getElementById('toast-host').textContent.replace(/\s+/g, ' ');
  t.ok(/待填入授权文本/.test(pendToast), '待填量表点发布被拦下并说明原因', pendToast.slice(0, 120));
  t.ok(!pendDom.d.getElementById('p-name'), '待填量表不会打开发布对话框');

  const fillSrc2 = fs.readFileSync(path.join(ROOT, 'public', 'fill.js'), 'utf8');
  t.ok(/rater === 'clinician'/.test(fillSrc2) && /评估者填写/.test(fillSrc2) && /评估已记录/.test(fillSrc2),
    'fill.js 为评估者量表切换文案');

  console.log('\n【16】编辑和保存不得改变具名公式');
  const formulaTemplate = (await admin.request('GET', '/api/scales')).json.items.find(function (s) { return s.code === 'meld'; });
  const formulaCopy = await admin.request('POST', '/api/scales', { fromTemplateId: formulaTemplate.id });
  const sumScale = await admin.request('POST', '/api/scales', { scale: {
    title: '未保存的求和自建量表', category: '通用问卷',
    definition: { items: [plainItem('sum1')], dimensions: [{ id: 'total', name: '总分', items: ['sum1'] }], scoring: { method: 'sum' } },
  } });
  const formulaDom = dom.makeDom(srv, admin.cookieStore);
  await dom.wait(320);
  await dom.goto(formulaDom, '#/builder/' + sumScale.json.id);
  t.ok(formulaDom.d.getElementById('f-method').value === 'sum', '先进入求和自建量表编辑器');
  await dom.goto(formulaDom, '#/builder/' + formulaCopy.json.id);
  t.ok(formulaDom.d.getElementById('f-method').value === 'formula', '直接切换量表时编辑器保留公式计分选中项');
  formulaDom.d.getElementById('b-save').click();
  await dom.wait(500);
  const formulaSaved = (await admin.request('GET', '/api/scales/' + formulaCopy.json.id)).json;
  t.ok(formulaSaved.definition.scoring.method === 'formula' && formulaSaved.definition.scoring.formula === 'meld',
    '保存后仍是MELD公式，而不是求和', formulaSaved.definition.scoring);
  const scoredAfterEdit = require(path.join(ROOT, 'lib', 'scoring.js')).scoreResponse(formulaSaved.definition,
    { bili: 51.3, inr: 2, cr: 176.8, dialysis: 0 });
  t.ok(scoredAfterEdit.total === 25, '编辑器保存后的典型MELD输入仍得到25分', scoredAfterEdit.total);

  formulaDom.d.getElementById('b-preview').click();
  await dom.wait(200);
  [['bili', '51.3'], ['inr', '2'], ['cr', '176.8']].forEach(function (entry) {
    const input = formulaDom.d.querySelector('[data-in="' + entry[0] + '"]');
    input.value = entry[1];
    input.dispatchEvent(new formulaDom.w.Event('input', { bubbles: true }));
  });
  formulaDom.d.querySelector('[data-in="dialysis"][value="0"]').click();
  formulaDom.d.getElementById('f-next').click();
  await dom.wait(100);
  const originalPreviewFetch = formulaDom.w.fetch;
  formulaDom.w.fetch = function (url, opts) {
    if (url === '/api/preview-score') return Promise.reject(new Error('计分暂时不可用'));
    return originalPreviewFetch(url, opts);
  };
  formulaDom.d.getElementById('f-submit').click();
  await dom.wait(200);
  t.ok(!!formulaDom.d.getElementById('f-submit'), '预览计分失败保留核对页，不展示成功');
  t.ok(/计分暂时不可用/.test(formulaDom.d.getElementById('toast-host').textContent), '预览计分失败向用户说明原因');
  formulaDom.w.fetch = originalPreviewFetch;
  const retryPreview = formulaDom.d.getElementById('f-submit');
  if (retryPreview) retryPreview.click();
  await dom.wait(260);
  t.ok(/评分结果/.test(formulaDom.d.body.textContent), '成功重试后保留评估者的评分文案');
  t.ok(/25/.test(formulaDom.d.body.textContent), '成功重试无需重新填写，原答案仍得到25分');

  console.log('\n【17】独立分值的选项编辑保留编码及不可计分语义');
  const optionTemplates = (await admin.request('GET', '/api/scales')).json.items;
  const hbiTemplate = optionTemplates.find(function (s) { return s.code === 'hbi'; });
  const hbiCopy = await admin.request('POST', '/api/scales', { fromTemplateId: hbiTemplate.id });
  const hbiDom = dom.makeDom(srv, admin.cookieStore);
  await dom.wait(320);
  await dom.goto(hbiDom, '#/builder/' + hbiCopy.json.id);
  const jointRow = hbiDom.d.querySelector('.item-editor[data-id="hbi5"] [data-opt-label="1"]').closest('.opt-row');
  const jointScore = jointRow.querySelector('input[aria-label="选项分值"]');
  t.ok(jointScore.value === '1', 'HBI 关节痛分值显示1，而不是字符串编码的空值', jointScore.value);
  t.ok(jointScore.dataset.optScore === '1' && jointScore.dataset.optValue === undefined,
    '独立分值框绑定 score 而非编码 value');
  t.ok(/arthralgia/.test(jointRow.textContent), '关节痛的原编码以只读文字显示', jointRow.textContent);
  jointScore.value = '2';
  jointScore.dispatchEvent(new hbiDom.w.Event('input', { bubbles: true }));
  const normalValue = hbiDom.d.querySelector('.item-editor[data-id="hbi2"] [data-opt-value="1"]');
  normalValue.value = '1.5';
  normalValue.dispatchEvent(new hbiDom.w.Event('input', { bubbles: true }));
  hbiDom.d.getElementById('b-save').click();
  await dom.wait(500);
  const hbiSaved = (await admin.request('GET', '/api/scales/' + hbiCopy.json.id)).json;
  const jointSaved = hbiSaved.definition.items.find(function (it) { return it.id === 'hbi5'; }).options[1];
  t.ok(jointSaved.value === 'arthralgia' && jointSaved.score === 2,
    '复制HBI后编辑并保存：关节痛编码仍arthralgia，分值为2', jointSaved);
  const normalSaved = hbiSaved.definition.items.find(function (it) { return it.id === 'hbi2'; }).options[1];
  t.ok(normalSaved.value === 1.5 && normalSaved.score === undefined, '无独立score的选项仍编辑value', normalSaved);
  const hbiScore = await admin.request('POST', '/api/preview-score', { definition: hbiSaved.definition,
    answers: { hbi1: 0, hbi2: 0, hbi3: 0, hbi4: 0, hbi5: ['arthralgia'] } });
  t.ok(hbiScore.status === 200 && hbiScore.json.total === 2, '保存后的关节痛编码实际计入总分2', hbiScore.json);

  const ssrsTemplate = optionTemplates.find(function (s) { return s.code === 'ssrs'; });
  const ssrsCopy = await admin.request('POST', '/api/scales', { fromTemplateId: ssrsTemplate.id });
  const ssrsDef = ssrsCopy.json.definition;
  const ssrsItem = ssrsDef.items.find(function (it) { return (it.options || []).some(function (o) {
    return typeof o.value === 'number' && o.score !== undefined && o.value !== o.score;
  }); });
  const ssrsIndex = ssrsItem.options.findIndex(function (o) { return o.score !== undefined && o.value !== o.score; });
  const ssrsOption = ssrsItem.options[ssrsIndex];
  await dom.goto(hbiDom, '#/builder/' + ssrsCopy.json.id);
  const ssrsRow = hbiDom.d.querySelector('.item-editor[data-id="' + ssrsItem.id + '"] [data-opt-label="' + ssrsIndex + '"]').closest('.opt-row');
  const ssrsInput = ssrsRow.querySelector('input[aria-label="选项分值"]');
  t.ok(ssrsInput.value === String(ssrsOption.score), 'SSRS 数字编码的分值框显示实际score', ssrsInput.value);
  ssrsInput.value = '2';
  ssrsInput.dispatchEvent(new hbiDom.w.Event('input', { bubbles: true }));
  hbiDom.d.getElementById('b-save').click();
  await dom.wait(500);
  const ssrsSaved = (await admin.request('GET', '/api/scales/' + ssrsCopy.json.id)).json.definition.items
    .find(function (it) { return it.id === ssrsItem.id; }).options[ssrsIndex];
  t.ok(ssrsSaved.value === ssrsOption.value && ssrsSaved.score === 2, 'SSRS 编辑分值也不改数字编码', ssrsSaved);

  const nihssTemplate = optionTemplates.find(function (s) { return s.code === 'nihss'; });
  const nihssCopy = await admin.request('POST', '/api/scales', { fromTemplateId: nihssTemplate.id });
  await dom.goto(hbiDom, '#/builder/' + nihssCopy.json.id);
  const unItem = nihssCopy.json.definition.items.find(function (it) { return (it.options || []).some(function (o) { return o.value === 'un'; }); });
  const unIndex = unItem.options.findIndex(function (o) { return o.value === 'un'; });
  const unRow = hbiDom.d.querySelector('.item-editor[data-id="' + unItem.id + '"] [data-opt-label="' + unIndex + '"]').closest('.opt-row');
  const unScore = unRow.querySelector('input[aria-label="选项分值"]');
  t.ok(unScore.value === '' && (unScore.disabled || unScore.readOnly), 'NIHSS UN不可计分框为空且不可编辑');
  // 即使程序派发输入事件，也不能把不可计分null转换为零。
  unScore.value = '';
  unScore.dispatchEvent(new hbiDom.w.Event('input', { bubbles: true }));
  hbiDom.d.getElementById('b-save').click();
  await dom.wait(500);
  const nihssSaved = (await admin.request('GET', '/api/scales/' + nihssCopy.json.id)).json;
  const savedUN = nihssSaved.definition.items.find(function (it) { return it.id === unItem.id; }).options[unIndex];
  t.ok(savedUN.value === 'un' && savedUN.score === null, 'NIHSS 保存后UN编码与score:null原样保留', savedUN);

  console.log('\n【18】快速切换编辑器时旧请求不得覆盖新页面');
  const raceSumScale = await admin.request('POST', '/api/scales', { scale: {
    title: '慢加载求和量表', category: '情绪与心理',
    definition: { items: [{ id: 's1', no: 1, text: '题干', type: 'radio', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] }],
      dimensions: [{ id: 'total', name: '总分', items: ['s1'] }], scoring: { method: 'sum' } },
  } });
  const formulaCopy2 = await admin.request('POST', '/api/scales', { fromTemplateId: formulaTemplate.id });
  const raceDom = dom.makeDom(srv, admin.cookieStore);
  await dom.wait(320);
  const realFetch = raceDom.w.fetch;
  raceDom.w.fetch = function (p, o) {
    if (p === '/api/scales/' + raceSumScale.json.id && (!o || !o.method || o.method === 'GET')) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () { realFetch(p, o).then(resolve, reject); }, 350);
      });
    }
    return realFetch(p, o);
  };
  await dom.goto(raceDom, '#/builder/' + raceSumScale.json.id);
  await dom.goto(raceDom, '#/builder/' + formulaCopy2.json.id);
  await dom.wait(700);
  t.ok(raceDom.w.location.hash === '#/builder/' + formulaCopy2.json.id, '地址仍是后打开的量表', raceDom.w.location.hash);
  t.ok(raceDom.d.getElementById('f-method').value === 'formula', '慢请求返回后编辑器仍是公式计分', raceDom.d.getElementById('f-method').value);
  raceDom.d.getElementById('b-save').click();
  await dom.wait(500);
  const raceSaved = (await admin.request('GET', '/api/scales/' + formulaCopy2.json.id)).json;
  t.ok(raceSaved.definition.scoring.method === 'formula' && raceSaved.definition.scoring.formula === 'meld',
    '保存的是当前公式量表，而不是旧求和量表', raceSaved.definition.scoring);
  raceDom.w.fetch = realFetch;

  process.exit(t.done('前端行为'));
})();
