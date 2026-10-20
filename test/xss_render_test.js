'use strict';
/**
 * 存储型 XSS 回归：量表 definition 里的元数据（分类、单位、min/max、维度条目 id、
 * 随访判读标签）曾经直接拼进 innerHTML，匿名可建量表即可注入。
 * 这里用 jsdom 真实渲染详情页 / 工作台 / 填写页，断言恶意标记不会变成 DOM 元素。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');
const dom = require('./helpers/dom.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'xss_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const t = http.makeCounter();

const XSS = '<img data-xss="1" src=x>';

if (!dom.available()) {
  console.log('\n  跳过 XSS 渲染测试：' + dom.reasonUnavailable() + '\n');
  process.exit(0);
}

(async function run() {
  const client = http.makeClient(srv);
  let r = await client.request('POST', '/api/register', {
    username: 'xssadmin', password: 'test123456', password2: 'test123456',
  });
  t.ok(r.status === 200, '首个账号注册成功');

  const custom = {
    title: 'XSS 回归量表',
    category: XSS,
    description: '恶意元数据',
    instructions: '',
    tags: [],
    definition: {
      items: [
        { id: 'q1', no: 1, text: '滑块', type: 'slider', min: XSS, max: '10', unit: XSS },
        { id: 'q2', no: 2, text: '数字', type: 'number', min: XSS, max: XSS },
        { id: 'q3', no: 3, text: '评分', type: 'radio', options: [{ label: '0', value: 0 }, { label: '1', value: 1 }] },
      ],
      dimensions: [{ id: 'd1', name: '维度', items: [XSS, 'q3'] }],
      scoring: { method: 'sum', cutoffs: [{ max: 1, label: '低' }, { max: 2, label: '高' }] },
    },
  };
  r = await client.request('POST', '/api/scales', { scale: custom });
  t.ok(r.status === 200 && r.json.id, '创建含恶意元数据的量表', r.status);
  const scale = r.json;

  console.log('\n【1】量表详情页：条目元数据与维度条目 id');
  const app = dom.makeDom(srv, client.cookieStore);
  await dom.wait(320);
  await dom.goto(app, '#/scale/' + scale.id);
  const appHtml = app.d.getElementById('app').innerHTML;
  t.ok(app.d.querySelectorAll('[data-xss]').length === 0, '详情页没有注入的 img 元素',
    app.d.querySelectorAll('[data-xss]').length);
  t.ok(appHtml.indexOf('&lt;img') >= 0, '恶意元数据以转义文本呈现');

  console.log('\n【2】工作台「最近打开」：分类字段');
  await dom.goto(app, '#/home');
  t.ok(app.d.querySelectorAll('[data-xss]').length === 0, '工作台最近打开卡片没有注入元素',
    app.d.querySelectorAll('[data-xss]').length);

  console.log('\n【3】受试者填写页：slider / number 的 min、max、unit');
  r = await client.request('POST', '/api/surveys', { scaleId: scale.id, name: 'XSS 填写测试' });
  t.ok(r.status === 200 && r.json.token, '发布调查成功');
  const token = r.json.token;
  const fill = dom.makeDom(srv, { value: '' }, { url: 'http://localhost:5173/s/' + token });
  await dom.wait(500);
  t.ok(fill.d.querySelectorAll('[data-xss]').length === 0, '填写页没有注入元素',
    fill.d.querySelectorAll('[data-xss]').length);
  const range = fill.d.querySelector('input[type="range"]');
  t.ok(range && range.getAttribute('min') === '0', '非法 slider min 被强转为数字 0', range && range.getAttribute('min'));
  const num = fill.d.querySelector('input[type="number"]');
  t.ok(num && !num.hasAttribute('min') && !num.hasAttribute('max'), '非法 number min/max 被丢弃',
    num && [num.getAttribute('min'), num.getAttribute('max')]);

  console.log('\n【4】随访时点判读标签（源码回归）');
  const src = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  t.ok(/\.map\(function \(c\) \{ return esc\(c\.label\) \+ ' ' \+ c\.count; \}\)/.test(src),
    '随访时点判读分布对 c.label 做了 esc 转义');

  [DB, DB + '-wal', DB + '-shm', path.join(__dirname, '管理员初始口令.txt')].forEach(function (p) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* 清理失败不影响断言 */ }
  });
  process.exit(t.done('XSS 渲染回归'));
})();
