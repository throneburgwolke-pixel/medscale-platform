'use strict';
/**
 * 前端界面测试：用 jsdom 真实渲染 SPA，fetch 直连进程内的服务端处理器，
 * 走完「登录 → 量表库 → 编辑器 → 发布 → 数据看板 → 手机填写」全流程。
 */
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

// jsdom 只在测试里用到，统一由 helpers/dom.js 解析（devDependency，可用 JSDOM_PATH 指路）
const domHelper = require('./helpers/dom.js');
const JSDOM = domHelper.JSDOM;
const VirtualConsole = domHelper.VirtualConsole;
if (!JSDOM) {
  console.log('\n  跳过前端界面测试：' + domHelper.reasonUnavailable() + '\n');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
process.env.MEDSCALE_DB = path.join(__dirname, 'ui_test.db');
['', '-wal', '-shm'].forEach(function (s) {
  const p = process.env.MEDSCALE_DB + s;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});
const srv = require(path.join(ROOT, 'server.js'));
const APP_JS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const COMMON_JS = fs.readFileSync(path.join(ROOT, 'public', 'common.js'), 'utf8');
const FILL_JS = fs.readFileSync(path.join(ROOT, 'public', 'fill.js'), 'utf8');
const LOGIC_JS = fs.readFileSync(path.join(ROOT, 'lib', 'logic.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra ? '  -> ' + String(extra).slice(0, 300) : '')); }
}

/* ---- 把 fetch 接到进程内服务端 ---- */
let COOKIE = '';
function rawRequest(method, url, body) {
  return new Promise(function (resolve) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:5173', 'user-agent': 'jsdom-test' };
    req.socket = { remoteAddress: '127.0.0.1' };
    if (COOKIE) req.headers.cookie = COOKIE;
    const chunks = [];
    const res = {
      statusCode: 0,
      headers: {},
      writeHead: function (code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); },
      end: function (data) {
        if (data && data.length) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        const buf = Buffer.concat(chunks);
        const sc = this.headers['Set-Cookie'];
        if (sc) COOKIE = sc.split(';')[0];
        resolve({ status: this.statusCode, headers: this.headers, text: buf.toString('utf8') });
      },
      on: function () { },
    };
    setTimeout(function () {
      if (body !== undefined) req.emit('data', Buffer.from(body));
      req.emit('end');
    }, 0);
    srv.handleRequest(req, res);
  });
}

function makeApp(url) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) {
    if (String(e.message).indexOf('Not implemented') < 0) console.log('   [jsdom] ' + e.message);
  });
  const dom = new JSDOM(INDEX_HTML, {
    url: url || 'http://localhost:5173/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.confirm = function () { return true; };
  w.alert = function () { };
  w.fetch = async function (p, o) {
    const opts = o || {};
    const r = await rawRequest(opts.method || 'GET', p, opts.body);
    return {
      ok: r.status >= 200 && r.status < 400,
      status: r.status,
      text: async function () { return r.text; },
      json: async function () { return JSON.parse(r.text); },
    };
  };
  w.HTMLCanvasElement.prototype.getContext = function () { return null; };
  // 与浏览器加载顺序一致：共享模块 → common.js；/s/ 填写入口只加载 fill.js。
  // jsdom 的多次 eval 不共享顶层 const，所以合并成一次 eval（管理端同时预载懒加载的 fill.js）。
  w.eval(LOGIC_JS);
  if (new URL(url || 'http://localhost:5173/').pathname.indexOf('/s/') === 0) {
    w.eval(COMMON_JS + '\n' + FILL_JS);
  } else {
    w.eval(COMMON_JS + '\n' + FILL_JS + '\n' + APP_JS);
  }
  return { dom: dom, w: w, d: w.document };
}

const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 40); }); };

const TEST_USER = { username: 'drzhang', password: 'test123456' };

async function ensureLogin(app) {
  await wait(120);
  if (!app.d.querySelector('.hero') && !app.d.querySelector('#btn-register') && !app.d.querySelector('#btn-login')) return;
  app.w.location.hash = '#/login';
  app.w.dispatchEvent(new app.w.Event('hashchange'));
  await wait(180);
  if (app.d.querySelector('#l-user')) {
    app.d.querySelector('#l-user').value = TEST_USER.username;
    app.d.querySelector('#l-pwd').value = TEST_USER.password;
    app.d.querySelector('#btn-login').click();
    await wait(320);
  }
}

async function nav(app, hash) {
  app.w.location.hash = hash;
  app.w.dispatchEvent(new app.w.Event('hashchange'));
  await wait(80);
}

(async function run() {
  console.log('\n【A】登录流程');
  let app = makeApp();
  await wait(150);
  ok(!!app.d.querySelector('.hero') && app.d.body.textContent.indexOf('把量表发放') >= 0, '未登录时显示网站首页（含 Hero 区）');
  ok(app.d.querySelectorAll('.hero-cta .btn').length === 1 && app.d.querySelectorAll('.marquee .pill').length > 10, '首页只留 1 个主 CTA，量表跑马灯正常');
  ok(app.d.querySelectorAll('.float-card').length === 3 && app.d.querySelectorAll('.blob').length === 2, '首页含浮动卡片与光斑动画元素');
  ok(app.d.querySelectorAll('.feature').length >= 6 && app.d.querySelectorAll('.reveal').length >= 6, '首页功能卡片带滚动显现动画');
  // 注册新用户
  app.d.querySelector('#lp-register').click();
  await wait(220);
  ok(!!app.d.querySelector('#btn-register') && !!app.d.querySelector('#tab-login'), '可切换到注册页（登录/注册双标签）');
  app.d.querySelector('#r-user').value = TEST_USER.username;
  app.d.querySelector('#r-pwd').value = TEST_USER.password;
  app.d.querySelector('#r-pwd2').value = TEST_USER.password;
  app.d.querySelector('#r-name').value = '张医生';
  app.d.querySelector('#r-org').value = '心内科';
  app.d.querySelector('#btn-register').click();
  await wait(400);
  ok(app.d.body.textContent.indexOf('工作台') >= 0, '注册后自动登录并进入工作台');
  ok(app.d.body.textContent.indexOf('张医生') >= 0, '侧栏显示当前用户姓名');
  const home = app.d.body.textContent;
  ok(home.indexOf('量表模板') >= 0 && home.indexOf('累计答卷') >= 0, '工作台显示统计卡片');
  ok(app.d.querySelectorAll('[data-count]').length >= 4, '工作台统计卡片数字带动画');
  ok(home.indexOf('常用量表') >= 0 && app.d.querySelectorAll('[data-hot]').length >= 8, '工作台显示常用量表快捷入口');
  ok(home.indexOf('自制问卷') >= 0, '工作台显示自制问卷入口');

  console.log('\n【B】量表库');
  await nav(app, '#/scales');
  const cards = app.d.querySelectorAll('.scale-card');
  ok(cards.length >= 12, '量表卡片渲染数量 = ' + cards.length);
  ok(app.d.body.textContent.indexOf('PHQ-9') >= 0, '含 PHQ-9 模板');
  ok(app.d.body.textContent.indexOf('PSQI') >= 0, '含 PSQI 模板');
  // 搜索过滤
  app.d.querySelector('#kw').value = '睡眠';
  app.d.querySelector('#btn-search').click();
  await wait(80);
  const found = app.d.querySelectorAll('.scale-card').length;
  ok(found > 0 && found < cards.length, '关键词"睡眠"过滤后剩余 ' + found + ' 个');
  // 分类筛选
  await nav(app, '#/scales');
  const catBtn = app.d.querySelector('[data-cat="护理评估"]');
  ok(!!catBtn, '分类筛选按钮存在');
  if (catBtn) {
    catBtn.click();
    await wait(120);
    ok(app.d.querySelectorAll('.scale-card').length >= 6 && app.d.body.textContent.indexOf('护理评估') >= 0,
      '按"护理评估"分类筛选正常（' + app.d.querySelectorAll('.scale-card').length + ' 个）');
  }
  // 量表目录
  await nav(app, '#/scales?|全部|catalog');
  await wait(200);
  const catRows = app.d.querySelectorAll('.table tbody tr').length;
  ok(app.d.body.textContent.indexOf('量表目录') >= 0 && catRows >= 40,
    '量表目录可检索（' + catRows + ' 条目录记录）');
  ok(app.d.body.textContent.indexOf('MMSE') >= 0 && app.d.body.textContent.indexOf('需') >= 0, '目录含需授权量表与授权说明');

  console.log('\n【C】量表详情（PHQ-9）');
  await nav(app, '#/scales');
  const phqCard = Array.from(app.d.querySelectorAll('.scale-card')).find(function (c) {
    return c.textContent.indexOf('PHQ-9') >= 0;
  });
  phqCard.querySelector('[data-act="view"]').click();
  await wait(120);
  ok(app.d.body.textContent.indexOf('第 9 题的题干') < 0, '详情页正常渲染');
  ok(app.d.querySelectorAll('.item-editor').length === 9, 'PHQ-9 展示 9 个条目');
  ok(app.d.body.textContent.indexOf('有不如死掉或用某种方式伤害自己的念头') >= 0, '第9题条文正确');
  ok(app.d.body.textContent.indexOf('重度抑郁') >= 0, '分级解释表已渲染');

  console.log('\n【D】创建副本并进入编辑器');
  app.d.querySelector('#d-copy').click();
  await wait(150);
  ok(app.d.body.textContent.indexOf('编辑量表') >= 0, '进入编辑器');
  ok(app.d.querySelectorAll('#item-list .item-editor').length === 9, '编辑器加载 9 个条目');
  ok(app.d.querySelectorAll('#item-list .item-editor').length === 9, '条目编辑器已渲染');

  // 修改标题与题干
  app.d.querySelector('#f-title').value = 'PHQ-9 本地化修改版';
  const firstText = app.d.querySelector('#item-list .item-editor textarea[data-f="text"]');
  firstText.value = '做事时提不起劲或没有兴趣（修改后）';
  firstText.dispatchEvent(new app.w.Event('input'));
  // 新增一道题
  app.d.querySelector('#add-type').value = 'slider';
  app.d.querySelector('#b-add').click();
  await wait(60);
  ok(app.d.querySelectorAll('#item-list .item-editor').length === 10, '添加题目后条目数为 10');
  // 删除刚添加的题
  const cardsB = app.d.querySelectorAll('#item-list .item-editor');
  cardsB[cardsB.length - 1].querySelector('[data-act="del"]').click();
  await wait(60);
  ok(app.d.querySelectorAll('#item-list .item-editor').length === 9, '删除题目后恢复为 9');

  // 上移第一题
  app.d.querySelectorAll('#item-list .item-editor')[1].querySelector('[data-act="up"]').click();
  await wait(60);
  const firstTextAfter = app.d.querySelector('#item-list .item-editor textarea[data-f="text"]').value;
  ok(firstTextAfter.indexOf('感到心情低落') >= 0, '第2题上移后成为第1题');
  // 再移回去
  app.d.querySelectorAll('#item-list .item-editor')[0].querySelector('[data-act="down"]').click();
  await wait(60);

  // 保存
  app.d.querySelector('#b-save').click();
  await wait(160);
  ok(app.d.body.textContent.indexOf('已保存') >= 0, '保存成功提示');
  const savedTitle = app.d.querySelector('#f-title').value;
  ok(savedTitle === 'PHQ-9 本地化修改版', '标题已保存：' + savedTitle);

  console.log('\n【E】校验与预览');
  const secondText = app.d.querySelectorAll('#item-list .item-editor textarea[data-f="text"]')[1];
  secondText.value = '';
  secondText.dispatchEvent(new app.w.Event('input'));
  app.d.querySelector('#b-save').click();
  await wait(100);
  ok(app.d.body.textContent.indexOf('题干为空') >= 0, '空题干被拦截');
  secondText.value = '感到心情低落、沮丧或绝望';
  secondText.dispatchEvent(new app.w.Event('input'));
  app.d.querySelector('#b-preview').click();
  await wait(160);
  ok(app.d.body.textContent.indexOf('预览模式') >= 0, '预览页渲染成功');
  ok(app.d.querySelectorAll('.q').length === 9, '预览页显示 9 道题（第一页）');
  app.d.querySelector('#c-back').click();
  await wait(80);
  ok(app.d.body.textContent.indexOf('编辑量表') >= 0, '可从预览返回编辑器');

  console.log('\n【F】发布并生成链接/二维码');
  app.d.querySelector('#b-publish2').click();
  await wait(200);
  ok(!!app.d.querySelector('#p-name'), '发布对话框弹出');
  app.d.querySelector('#p-name').value = 'PHQ-9 抑郁筛查（门诊）';
  app.d.querySelector('#p-max').value = '200';
  app.d.querySelector('#p-result').checked = true;
  app.d.querySelector('#p-ok').click();
  await wait(260);
  ok(app.d.body.textContent.indexOf('PHQ-9 抑郁筛查（门诊）') >= 0, '跳转到数据看板');
  ok(app.d.body.textContent.indexOf('已回收答卷') >= 0, '看板显示回收统计');
  const qrImg = app.d.querySelector('.qr-box img');
  ok(qrImg && qrImg.getAttribute('src').indexOf('/api/qr.png') === 0, '看板内嵌二维码图片');
  const linkText = Array.from(app.d.querySelectorAll('.mono')).map(function (e) { return e.textContent; }).join(' ');
  const token = (linkText.match(/\/s\/([a-z0-9]+)/) || [])[1];
  ok(!!token, '看板显示问卷链接 token = ' + token);

  console.log('\n【G】数据看板各标签页');
  const tabs = ['overview', 'quality', 'charts', 'stats', 'reliability', 'relation', 'raw', 'setting'];
  for (let i = 0; i < tabs.length; i += 1) {
    const btn = app.d.querySelector('[data-tab="' + tabs[i] + '"]');
    if (btn) { btn.click(); await wait(150); }
    const t = app.d.body.textContent;
    const expectMap = {
      overview: '发放方式', quality: '数据质量', charts: '总分分布', stats: '每题作答情况',
      reliability: '信度', relation: '组间比较', raw: '原始数据', setting: '调查设置',
    };
    ok(btn && t.indexOf(expectMap[tabs[i]]) >= 0, '标签页「' + expectMap[tabs[i]] + '」正常');
  }
  app.d.querySelector('#set-max').value = '300';
  app.d.querySelector('#set-save').click();
  await wait(200);
  ok(app.d.body.textContent.indexOf('设置已保存') >= 0, '保存调查设置成功');

  console.log('\n【H】手机填写页（公开链接）');
  const fill = makeApp('http://localhost:5173/s/' + token);
  await wait(200);
  ok(fill.d.body.textContent.indexOf('PHQ-9 本地化修改版') >= 0, '填写页显示量表标题');
  ok(fill.d.querySelectorAll('.q').length === 9, '填写页渲染 9 道题');
  ok(!!fill.d.querySelector('#f-next'), '单节问卷显示"下一节"按钮（最后一节为检查答案）');
  ok(!!fill.d.querySelector('.progress'), '填写页显示进度条');
  // 未答完 → 进入检查页应提示缺失
  fill.d.querySelector('#f-next').click();
  await wait(150);
  ok(fill.d.body.textContent.indexOf('必答题未作答') >= 0, '检查答案页提示未作答题数');
  ok(fill.d.querySelectorAll('[data-jump]').length === 9, '未作答题目提供"返回作答"跳转按钮');
  fill.d.querySelector('#f-submit').click();
  await wait(200);
  ok(fill.d.body.textContent.indexOf('还有') >= 0 && fill.d.body.textContent.indexOf('核对答案') >= 0,
    '未答完时提交被拦截并停留在检查页');
  // 返回题目节作答
  fill.d.querySelector('#f-prev').click();
  await wait(150);
  ok(fill.d.querySelectorAll('.q').length === 9, '可返回题目节继续作答');
  // 选择全部"一半以上天数"
  const qs = Array.from(fill.d.querySelectorAll('.q'));
  qs.forEach(function (q) {
    const radios = q.querySelectorAll('input[type=radio]');
    if (radios.length) radios[2].click();
  });
  await wait(60);
  ok(fill.d.querySelectorAll('.opt.sel').length === 9, '选项选中态样式生效');
  fill.d.querySelector('#f-next').click();
  await wait(150);
  ok(fill.d.body.textContent.indexOf('核对答案') >= 0 && fill.d.body.textContent.indexOf('所有必答题均已作答') >= 0,
    '全部作答后检查页提示可以提交');
  fill.d.querySelector('#f-submit').click();
  await wait(300);
  ok(fill.d.body.textContent.indexOf('提交成功') >= 0, '提交成功页显示');
  ok(fill.d.body.textContent.indexOf('您的评估结果') >= 0, '受试者可见计分结果');
  ok(/18/.test(fill.d.body.textContent) && fill.d.body.textContent.indexOf('中重度抑郁') >= 0,
    'PHQ-9 总分 18 判读为中重度抑郁');
  ok(fill.d.body.textContent.indexOf('不能替代临床诊断') >= 0, '结果页含免责声明');

  console.log('\n【H2】多维度量表填写页分节（PSQI 7 个成分）');
  const psqiScale = (await (await rawRequest('GET', '/api/scales')).text && JSON.parse((await rawRequest('GET', '/api/scales')).text)).items
    .find(function (s) { return s.code === 'psqi'; });
  const psqiSurvey = JSON.parse((await rawRequest('POST', '/api/surveys',
    JSON.stringify({ scaleId: psqiScale.id, name: 'PSQI 分节测试' }))).text);
  const fill2 = makeApp('http://localhost:5173/s/' + psqiSurvey.token);
  await wait(250);
  ok(fill2.d.querySelectorAll('.q').length > 0, 'PSQI 填写页可渲染题目');
  ok(fill2.d.querySelectorAll('.section-head').length >= 1, '多维度量表按维度分节显示');
  ok(fill2.d.body.textContent.indexOf('第 1 / 8 节') >= 0 || fill2.d.body.textContent.indexOf('1 / 8') >= 0,
    '分节进度显示（7 个维度 + 检查页 = 8 节）');
  ok(/睡眠质量|入睡时间|睡眠时间|睡眠障碍/.test(fill2.d.body.textContent), '出现维度名称作为小节标题');

  console.log('\n【I】回收后数据看板更新');
  const app2 = makeApp();
  await ensureLogin(app2);
  await nav(app2, '#/survey/' + (token ? 1 : 1));
  await wait(150);
  ok(app2.d.body.textContent.indexOf('已回收答卷') >= 0, '重新打开看板正常');
  ok(/总分均值[\s\S]{0,120}18/.test(app2.d.body.textContent), '看板总分均值 = 18（与填写结果一致）');
  ok(app2.d.body.textContent.indexOf('中度抑郁') >= 0, '分级分布含"中度抑郁"');

  console.log('\n【I2】导入量表（上传 → 识别 → 校对 → 入库）');
  const imp = makeApp();
  await ensureLogin(imp);
  await nav(imp, '#/import');
  await wait(120);
  ok(!!imp.d.querySelector('#dz'), '导入页显示上传区域');
  ok(imp.d.body.textContent.indexOf('下载 Excel/CSV 模板') >= 0, '提供模板下载入口');
  const csvText = [
    '题号,题干,题型,选项1,分值1,选项2,分值2,选项3,分值3,维度,必答,反向计分',
    '1,近两周感到紧张焦虑,单选,完全不会,0,好几天,1,几乎每天,3,焦虑,是,否',
    '2,我感到心情平静,单选,完全不会,0,好几天,1,几乎每天,3,焦虑,是,是',
    '3,每周运动次数,数字,,,,,,,,生活方式,是,否',
  ].join('\n');
  const file = new imp.w.File([csvText], '量表导入测试.csv', { type: 'text/csv' });
  const input = imp.d.querySelector('#file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.onchange();
  await wait(400);
  ok(imp.d.body.textContent.indexOf('校对识别结果') >= 0, '识别后进入校对页');
  ok(imp.d.querySelectorAll('[data-row]').length === 3, '校对页显示 3 道题（' + imp.d.querySelectorAll('[data-row]').length + '）');
  const stem = imp.d.querySelector('[data-imp-text="0"]');
  ok(stem && stem.value.indexOf('紧张焦虑') >= 0, '题干已识别并填入可编辑框');
  const optArea = imp.d.querySelector('[data-imp-opts="0"]');
  ok(optArea && optArea.value.indexOf('好几天|1') >= 0, '选项与分值已识别（含"|分值"）');
  ok(!!imp.d.querySelector('[data-imp-exclude="0"]'), '每题可单独设置"不计分"');
  // 修改题干后再保存
  stem.value = '近两周感到紧张、焦虑或急躁（已校对）';
  stem.dispatchEvent(new imp.w.Event('input'));
  imp.d.querySelector('#imp-title').value = '导入测试量表';
  imp.d.querySelector('#imp-save').click();
  await wait(500);
  ok(imp.d.body.textContent.indexOf('编辑量表') >= 0 && (imp.d.querySelector('#f-title') || {}).value === '导入测试量表', '保存后跳转到编辑器且名称正确');
  ok(imp.d.querySelectorAll('#item-list .item-editor').length === 3, '编辑器中可见 3 道导入的题目');
  ok(imp.d.body.textContent.indexOf('已校对') >= 0, '校对后的题干已保存');

  console.log('\n【K】公开页面（首页 / 量表库浏览 / 使用流程）');
  COOKIE = ''; // 模拟全新访客（清除登录态）
  const pub = makeApp();
  await wait(200);
  ok(!!pub.d.querySelector('.hero'), '未登录默认进入介绍首页');
  ok(pub.d.querySelectorAll('.hero-stats').length === 0, '首页已移除数据统计区（hero-stats）');
  ok(pub.d.querySelectorAll('[data-count]').length === 0, '首页不再出现数字滚动数据介绍');
  ok(pub.d.body.textContent.indexOf('覆盖 16 个专业分类') < 0, '首页不再出现"16 个专业分类"等数据表述');
  ok(pub.d.body.textContent.indexOf('50 个量表') < 0 && pub.d.body.textContent.indexOf('431') < 0, '首页不再出现量表数量等数据介绍');
  ok(pub.d.querySelectorAll('.marquee .pill').length > 10, '首页仍保留量表名称展示（静态清单，不依赖登录）');
  // 左上角「量表库」→ 公开量表库
  const libLink = Array.from(pub.d.querySelectorAll('.landing-nav-links a')).find(function (a) { return a.textContent.indexOf('量表库') >= 0; });
  ok(libLink && libLink.getAttribute('href') === '#/library', '左上角"量表库"链接指向量表库页面');
  libLink.click();
  await wait(350);
  ok(pub.d.body.textContent.indexOf('量表库') >= 0 && pub.d.querySelectorAll('.scale-card').length >= 10,
    '未登录也能进入量表库浏览（' + pub.d.querySelectorAll('.scale-card').length + ' 个量表卡片）');
  ok(pub.d.querySelector('#lib-kw'), '公开量表库提供搜索框');
  pub.d.querySelector('#lib-kw').value = '睡眠';
  pub.d.querySelector('#lib-search').click();
  await wait(250);
  ok(pub.d.querySelectorAll('.scale-card').length >= 2 && pub.d.querySelectorAll('.scale-card').length < 50,
    '公开量表库搜索可用（"睡眠"→ ' + pub.d.querySelectorAll('.scale-card').length + ' 个）');
  // 左上角「使用流程」→ 使用说明
  const guideLink = Array.from(pub.d.querySelectorAll('.landing-nav-links a')).find(function (a) { return a.textContent.indexOf('使用流程') >= 0; });
  ok(guideLink && guideLink.getAttribute('href') === '#/guide', '左上角"使用流程"链接指向使用说明页面');
  guideLink.click();
  await wait(300);
  ok(pub.d.body.textContent.indexOf('使用流程与常见问题') >= 0 && pub.d.querySelectorAll('details').length >= 12,
    '使用说明页可打开（' + pub.d.querySelectorAll('details').length + ' 个问答条目）');
  ok(pub.d.body.textContent.indexOf('下载完整使用说明') >= 0, '使用说明页提供完整文档下载');

  console.log('\n【L】登录后各页面结构对齐核查');
  const audit = makeApp();
  await ensureLogin(audit);
  const pages = [
    ['#/home', '工作台'], ['#/scales', '量表库'], ['#/surveys', '发放与数据'],
    ['#/followups', '随访研究'], ['#/import', '导入量表'], ['#/settings', '系统设置'],
  ];
  let checked = 0;
  for (let i = 0; i < pages.length; i += 1) {
    await nav(audit, pages[i][0]);
    await wait(180);
    const grids = Array.from(audit.d.querySelectorAll('.grid'));
    let issues = [];
    grids.forEach(function (g) {
      const kids = Array.from(g.children);
      if (!kids.length) return;
      const tags = kids.map(function (k) { return k.className.split(' ').slice(0, 2).join('.'); });
      // 同一网格内元素类型不一致（例如混入非卡片元素）
      const types = Array.from(new Set(kids.map(function (k) { return k.tagName; })));
      if (types.length > 1) issues.push('网格内元素标签不一致: ' + types.join('/'));
      // 直接子元素写死宽高会导致不等宽
      kids.forEach(function (k) {
        const st = k.getAttribute('style') || '';
        if (/width:\s*\d+px/.test(st) && !/max-width/.test(st)) issues.push('子元素固定宽度: ' + st.slice(0, 40));
      });
    });
    // 行内混用不同尺寸按钮
    const rows = Array.from(audit.d.querySelectorAll('.row'));
    rows.forEach(function (r) {
      const btns = Array.from(r.children).filter(function (c) { return c.classList && c.classList.contains('btn'); });
      if (btns.length > 1) {
        const small = btns.filter(function (b) { return b.classList.contains('small'); }).length;
        if (small > 0 && small < btns.length) issues.push('同一行按钮尺寸不一致');
      }
    });
    const bodyText = audit.d.body.textContent;
    ok(bodyText.indexOf(pages[i][1]) >= 0 && issues.length === 0,
      pages[i][1] + ' 页面结构统一' + (issues.length ? '：' + issues.slice(0, 2).join('；') : ''));
    if (bodyText.indexOf(pages[i][1]) >= 0 && issues.length === 0) checked += 1;
  }
  ok(checked === pages.length, '全部 ' + pages.length + ' 个登录后页面通过结构核查');

  console.log('\n【J】系统设置');
  await nav(app2, '#/settings');
  ok(app2.d.body.textContent.indexOf('修改管理员密码') >= 0, '设置页渲染');
  ok(app2.d.body.textContent.indexOf('MMSE') >= 0 && app2.d.body.textContent.indexOf('MoCA') >= 0, '授权提示表含需授权量表');

  console.log('\n———————————————————————————————');
  console.log('  前端流程：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('———————————————————————————————\n');
  ['', '-wal', '-shm'].forEach(function (s) {
    const p = process.env.MEDSCALE_DB + s;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  process.exit(fail ? 1 : 0);
}()).catch(function (e) {
  console.error('前端测试异常：', e);
  process.exit(1);
});
