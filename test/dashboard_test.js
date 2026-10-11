'use strict';
// 数据看板与填写页的浏览器级回归测试
// 防止这类问题：图表绘制报错（如把 CSS 变量传给 Canvas 的 addColorStop）导致整页"页面加载失败"
// 用法： node test/dashboard_test.js [baseUrl]
//   不传地址时自己拉起一个实例（临时数据库 + 随机端口），不会碰到正式数据
const path = require('node:path');
const fs = require('node:fs');
const browserHelper = require('./helpers/browser.js');

const chromium = browserHelper.resolveChromium();

// 给自拉起实例注入管理员初始口令（env 会被子进程继承；连接外部实例时需两边一致）
process.env.MEDSCALE_PASSWORD = 'Browser!Dashboard#2026';
const ADMIN_PW = process.env.MEDSCALE_PASSWORD;

const TABS = [
  ['overview', '概览'], ['summary', '结果描述'], ['quality', '数据质量'], ['charts', '图表'], ['stats', '每题统计'],
  ['reliability', '信度分析'], ['relation', '相关与组间比较'], ['raw', '原始数据'], ['setting', '设置'],
];

// 除逐个标签页「不报错」外，还有两项要单独查内容：手机填写页、结果描述正文
const EXTRA_CHECKS = 2;

let browser = null;
let temp = null;

async function cleanup() {
  if (browser) await browser.close();
  if (!temp) return;
  await temp.stop();
  ['', '-wal', '-shm'].forEach(function (suffix) {
    const p = temp.dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

if (!chromium) {
  console.log('\n  跳过看板测试：' + browserHelper.skipReason() + '\n');
  process.exit(0);
}

(async function main() {
  temp = process.argv[2] ? null : await browserHelper.startTempServer(path.join(__dirname, 'dashboard_test.db'));
  const BASE = process.argv[2] || temp.base;
  browser = await chromium.launch({
    headless: true, executablePath: browserHelper.executablePath(),
    args: ['--single-process', '--no-zygote', '--disable-gpu'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e.message).slice(0, 160)); });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(async function (arg) {
    await fetch(arg.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: arg.pw }) });
  }, { base: BASE, pw: ADMIN_PW });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
  // 用带分级判读的量表（ISI）建立调查并灌入 5 份答卷
  const info = await page.evaluate(async function (base) {
    const scales = await (await fetch(base + '/api/scales')).json();
    const sc = scales.items.find(function (s) { return s.code === 'isi'; });
    const sv = await (await fetch(base + '/api/surveys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scaleId: sc.id, name: '__看板回归测试__', showResult: true }),
    })).json();
    const items = sc.definition.items;
    for (let k = 0; k < 5; k += 1) {
      const ans = {};
      items.forEach(function (it, i) { ans[it.id] = Math.min(4, k + (i % 2)); });
      await fetch(base + '/api/join/' + sv.token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: ans, consent: true, durationSec: 90 + k * 10, pid: 'T' + k }),
      });
    }
    return { id: sv.id, token: sv.token };
  }, BASE);
  let fail = 0;
  console.log('\n数据看板回归测试 → ' + BASE + '（调查 #' + info.id + '，5 份答卷）');
  for (let i = 0; i < TABS.length; i += 1) {
    errors.length = 0;
    await page.evaluate(function (h) { location.hash = h; }, '#/survey/' + info.id);
    await page.waitForTimeout(600);
    await page.waitForSelector('[data-tab="' + TABS[i][0] + '"]', { timeout: 8000 });
    await page.click('[data-tab="' + TABS[i][0] + '"]');
    await page.waitForTimeout(900);
    const st = await page.evaluate(function () {
      const txt = document.body.innerText;
      return {
        failed: txt.indexOf('页面加载失败') >= 0,
        failMsg: (txt.match(/页面加载失败[^\n]*/) || [''])[0].slice(0, 120),
        canvases: document.querySelectorAll('canvas').length,
      };
    });
    const err = errors.length ? errors[0] : '';
    if (!st.failed && !err) {
      console.log('  PASS  ' + TABS[i][1] + '（canvas ' + st.canvases + ' 个，无脚本错误）');
    } else {
      fail += 1;
      console.log('  FAIL  ' + TABS[i][1] + ' → ' + (st.failMsg || err));
    }
  }
  // 结果描述：不只看「没报错」，还要确认真的按本次数据写出了可引用的句子
  errors.length = 0;
  await page.evaluate(function (h) { location.hash = h; }, '#/survey/' + info.id);
  await page.waitForTimeout(400);
  await page.click('[data-tab="summary"]');
  await page.waitForTimeout(700);
  const nar = await page.evaluate(function () {
    const el = document.getElementById('narrative-print');
    const txt = el ? el.innerText.replace(/\s+/g, '') : '';
    return { len: txt.length, head: txt.slice(0, 40), hasN: /共回收问卷\d+份/.test(txt), hasMean: /均值/.test(txt) };
  });
  if (nar.hasN && nar.hasMean && nar.len > 40 && !errors.length) {
    console.log('  PASS  结果描述（' + nar.len + ' 字，含样本量与描述统计）');
  } else {
    fail += 1;
    console.log('  FAIL  结果描述 → ' + (nar.head || errors[0] || '未渲染叙述文本'));
  }
  // 填写页
  errors.length = 0;
  await page.goto(BASE + '/s/' + info.token, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const fillState = await page.evaluate(function () {
    return {
      questions: document.querySelectorAll('.q').length,
      failed: document.body.innerText.indexOf('页面加载失败') >= 0,
    };
  });
  if (fillState.questions > 0 && !fillState.failed && !errors.length) {
    console.log('  PASS  手机填写页（渲染 ' + fillState.questions + ' 道题，无脚本错误）');
  } else {
    fail += 1;
    console.log('  FAIL  手机填写页 → ' + (errors[0] || '未渲染题目'));
  }
  // 清理测试数据
  await page.evaluate(async function (args) {
    await fetch(args.base + '/api/surveys/' + args.id, { method: 'DELETE' });
  }, { base: BASE, id: info.id });
  console.log('  （已清理测试调查 #' + info.id + '）');
  return fail;
}()).then(function (fail) {
  console.log('\n———————————————————————————————');
  console.log('  看板回归测试：' + (TABS.length + EXTRA_CHECKS - fail) + ' / ' + (TABS.length + EXTRA_CHECKS) + ' 项通过');
  console.log('———————————————————————————————\n');
  return cleanup().then(function () { process.exitCode = fail ? 1 : 0; });
}).catch(function (e) {
  console.error('测试异常：', e.message);
  return cleanup().then(function () { process.exitCode = 1; });
});
