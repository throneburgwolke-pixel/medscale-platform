'use strict';
// 界面像素级对齐审计（真实 Chromium 渲染 + 边界测量）
// 检查同一网格内每行的宽/高是否一致、列间距是否均匀、子元素是否溢出、
// 卡片内嵌套网格是否撑破外层，并输出截图便于肉眼复核。
// 用法： node test/layout_audit.js [baseUrl]
//   不传地址时自己拉起一个实例（临时数据库 + 随机可用端口），不会碰到正式数据
const path = require('node:path');
const fs = require('node:fs');
const browserHelper = require('./helpers/browser.js');

const chromium = browserHelper.resolveChromium();
const SHOT_DIR = path.join(__dirname, 'shots');

// 给自拉起实例注入管理员初始口令（env 会被子进程继承；连接外部实例时需两边一致）
process.env.MEDSCALE_PASSWORD = 'Browser!Layout#2026';
const ADMIN_PW = process.env.MEDSCALE_PASSWORD;

const PAGES = [
  ['#/home', '工作台'],
  ['#/scales', '量表库'],
  ['#/surveys', '发放与数据'],
  ['#/followups', '随访研究'],
  ['#/import', '导入量表'],
  ['#/settings', '系统设置'],
  ['#/scales?|全部|catalog', '量表目录'],
];

async function measure(page) {
  return await page.evaluate(function () {
    const out = { grids: 0, issues: [] };
    const px = function (v) { return Math.round(v * 10) / 10; };
    document.querySelectorAll('.grid').forEach(function (g, gi) {
      const kids = Array.prototype.slice.call(g.children).filter(function (k) { return k.getBoundingClientRect().width > 0; });
      if (kids.length < 2) return;
      out.grids += 1;
      const items = kids.map(function (k) {
        return { r: k.getBoundingClientRect(), cls: String(k.className || '').split(' ').slice(0, 2).join('.') };
      });
      const rows = [];
      items.forEach(function (it) {
        const row = rows.find(function (r) { return Math.abs(r[0].r.top - it.r.top) < 3; });
        if (row) row.push(it); else rows.push([it]);
      });
      rows.forEach(function (row, ri) {
        const sort = row.slice().sort(function (a, b) { return a.r.left - b.r.left; });
        const widths = sort.map(function (i) { return px(i.r.width); });
        const heights = sort.map(function (i) { return px(i.r.height); });
        if (Math.max.apply(null, widths) - Math.min.apply(null, widths) > 1.5) {
          out.issues.push('网格' + (gi + 1) + ' 第' + (ri + 1) + '行 宽度不一致: ' + widths.join(' / '));
        }
        if (Math.max.apply(null, heights) - Math.min.apply(null, heights) > 1.5) {
          out.issues.push('网格' + (gi + 1) + ' 第' + (ri + 1) + '行 高度不一致: ' + heights.join(' / '));
        }
        if (sort.length > 2) {
          const gaps = [];
          for (let i = 1; i < sort.length; i += 1) gaps.push(px(sort[i].r.left - sort[i - 1].r.right));
          if (Math.max.apply(null, gaps) - Math.min.apply(null, gaps) > 1.5) {
            out.issues.push('网格' + (gi + 1) + ' 第' + (ri + 1) + '行 列间距不均匀: ' + gaps.join(' / ') + 'px');
          }
        }
      });
      const gRect = g.getBoundingClientRect();
      items.forEach(function (i) {
        if (i.r.right - gRect.right > 1.5) {
          out.issues.push('网格' + (gi + 1) + ' 子元素右侧溢出 ' + px(i.r.right - gRect.right) + 'px（' + i.cls + '）');
        }
      });
    });
    document.querySelectorAll('.card > .grid').forEach(function (g, i) {
      const parent = g.parentElement;
      const cs = getComputedStyle(parent);
      const limit = parent.getBoundingClientRect().right - parseFloat(cs.paddingRight) + 1.5;
      const inner = g.getBoundingClientRect();
      if (inner.right > limit) {
        out.issues.push('嵌套网格' + (i + 1) + ' 超出外层卡片 ' + Math.round((inner.right - limit) * 10) / 10 + 'px');
      }
    });
    return out;
  });
}

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

(async function main() {
  if (!chromium) {
    console.log('\n  跳过界面审计：' + browserHelper.skipReason() + '\n');
    return -1;
  }
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  temp = process.argv[2] ? null : await browserHelper.startTempServer(path.join(__dirname, 'layout_audit.db'));
  const BASE = process.argv[2] || temp.base;
  browser = await chromium.launch({
    headless: true,
    executablePath: browserHelper.executablePath(),
    args: ['--single-process', '--no-zygote', '--disable-gpu'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e).slice(0, 120)); });

  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(async function (arg) {
    await fetch(arg.base + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: arg.pw }),
    });
  }, { base: BASE, pw: ADMIN_PW });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // 动态补充：量表详情页、已有调查的数据看板（若存在）
  try {
    const extra = await page.evaluate(async function () {
      const out = [];
      const s = await (await fetch('/api/scales')).json();
      if (s.items && s.items.length) out.push(['#/scale/' + s.items[0].id, '量表详情']);
      const v = await (await fetch('/api/surveys')).json();
      if (v.items && v.items.length) out.push(['#/survey/' + v.items[0].id, '数据看板']);
      return out;
    });
    extra.forEach(function (e) { PAGES.push(e); });
  } catch (e) { /* 忽略 */ }

  let fail = 0;
  console.log('\n界面像素对齐审计 → ' + BASE);
  for (let i = 0; i < PAGES.length; i += 1) {
    const hash = PAGES[i][0];
    const name = PAGES[i][1];
    await page.evaluate(function (h) { location.hash = h; }, hash);
    await page.waitForTimeout(1100);
    const r = await measure(page);
    const pageInfo = await page.evaluate(function () {
      return {
        blocks: document.querySelectorAll('.card, .stat, .table-wrap, .dropzone, details').length,
        textLen: (document.body.innerText || '').length,
      };
    });
    const shot = path.join(SHOT_DIR, name + '.png');
    await page.screenshot({ path: shot, fullPage: false });
    if (r.grids === 0) {
      if (pageInfo.blocks === 0 || pageInfo.textLen < 20) {
        fail += 1;
        console.log('  FAIL  ' + name + '（页面未渲染）');
      } else {
        console.log('  PASS  ' + name + '（表格型页面，无网格布局；' + pageInfo.blocks + ' 个内容块）');
      }
    } else if (r.issues.length === 0) {
      console.log('  PASS  ' + name + '（' + r.grids + ' 个网格全部对齐）');
    } else {
      fail += 1;
      console.log('  FAIL  ' + name + '（' + r.grids + ' 个网格）');
      Array.from(new Set(r.issues)).slice(0, 8).forEach(function (x) { console.log('         - ' + x); });
    }
  }
  if (errors.length) {
    console.log('\n  页面脚本错误：');
    Array.from(new Set(errors)).slice(0, 5).forEach(function (e) { console.log('   - ' + e); });
  }
  return fail;
}()).then(function (fail) {
  if (fail < 0) return;   // 已跳过：没装 playwright
  console.log('\n———————————————————————————————');
  console.log('  界面审计：' + (PAGES.length - fail) + ' / ' + PAGES.length + ' 个页面全部对齐');
  console.log('  截图目录：' + SHOT_DIR);
  console.log('———————————————————————————————\n');
  return cleanup().then(function () { process.exitCode = fail ? 1 : 0; });
}).catch(function (e) {
  console.error('审计脚本异常：', e.message);
  return cleanup().then(function () { process.exitCode = 1; });
});
