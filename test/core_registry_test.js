// test/core_registry_test.js
'use strict';
const path = require('node:path');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const reg = require(path.join(__dirname, '..', 'core', 'registry.js'));
const H = require(path.join(__dirname, '..', 'core', 'http.js'));

(async function () {
  reg.resetForTest();
  reg.route('GET', '/api/x/:id', async (ctx) => H.json(200, { id: ctx.params.id, q: ctx.query.get('a') }));
  reg.route('POST', '/api/pub', async () => H.json(200, { ok: 1 }), { public: true });
  reg.route('DELETE', '/api/adm', async () => H.json(200, {}), { admin: true });

  console.log('\n【1】匹配与参数');
  const m = reg.matchRoute('GET', '/api/x/42');
  t.ok(m && m.params.id === '42', ':id 捕获');
  t.ok(reg.matchRoute('GET', '/api/x/42/9') === null, '多余段不匹配');
  const r = await reg.dispatch({ method: 'GET', path: '/api/x/42', query: new URLSearchParams('a=b'), session: { userId: 1 } });
  t.ok(r.status === 200 && r.json.id === '42' && r.json.q === 'b', 'dispatch 注入 params/query');

  console.log('\n【2】鉴权由注册表统一执行');
  t.ok((await reg.dispatch({ method: 'GET', path: '/api/x/1', query: new URLSearchParams(), session: null })).status === 401, '无会话 401');
  t.ok((await reg.dispatch({ method: 'POST', path: '/api/pub', query: new URLSearchParams(), session: null })).status === 200, 'public 免鉴权');
  t.ok((await reg.dispatch({ method: 'DELETE', path: '/api/adm', query: new URLSearchParams(), session: { userId: 1, admin: 0 } })).status === 403, '非 admin 403');
  t.ok((await reg.dispatch({ method: 'DELETE', path: '/api/adm', query: new URLSearchParams(), session: { userId: 1, admin: 1 } })).status === 200, 'admin 放行');
  t.ok((await reg.dispatch({ method: 'GET', path: '/api/nope', query: new URLSearchParams(), session: {} })).status === 404, '未注册 404');

  console.log('\n【3】异常不外泄');
  reg.route('GET', '/api/boom', async () => { throw new Error('秘密堆栈'); });
  const boom = await reg.dispatch({ method: 'GET', path: '/api/boom', query: new URLSearchParams(), session: { userId: 1 } });
  t.ok(boom.status === 500 && !/秘密/.test(JSON.stringify(boom.json)), '500 通用文案');

  console.log('\n【4】清单');
  const l = reg.list();
  t.ok(l.length === 4 && l[0].auth === true && l[1].auth === false && l[2].admin === true, 'list() 暴露 method/pattern/auth/admin');

  // 子节【1b】路径参数单次解码：适配器（server.js parseRequestUrl）已解码一次，
  // 注册表不得二次解码，也不得对裸 % 抛 URIError（与 server.js:1418 legacy 对齐）。
  console.log('\n【1b】路径参数不二次解码、裸 % 不抛异常');
  reg.resetForTest();
  reg.route('GET', '/api/x/:id', async (ctx) => H.json(200, { id: ctx.params.id }));
  let pct = null; let pctErr = null;
  try { pct = reg.matchRoute('GET', '/api/x/100%'); } catch (e) { pctErr = e; }
  t.ok(!pctErr && pct && pct.params.id === '100%', '裸 % 段原样返回不抛异常', pctErr ? String(pctErr) : (pct && pct.params.id));
  let sp = null; let spErr = null;
  try { sp = reg.matchRoute('GET', '/api/x/a%20b'); } catch (e) { spErr = e; }
  t.ok(!spErr && sp && sp.params.id === 'a%20b', '%20 段保持单次编码（不解码为空格）', spErr ? String(spErr) : (sp && sp.params.id));

  reg.resetForTest();
  process.exit(t.done('核心注册表'));
})();
