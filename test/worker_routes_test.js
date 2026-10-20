'use strict';
/**
 * Worker 版回归测试（此前为零覆盖）。
 * 覆盖四项线上实测缺陷：
 *   1. /s/<token> 等前端路由回退到 index.html（原为 404，扫码填写入口全部打不开）
 *   2. PATCH /api/surveys/:id（前端发 PATCH，Worker 原只认 PUT → 405）
 *   3. 静态资源必须带安全头（原仅 /api 带 CSP，首页与 app.js 全裸）
 *   4. 量表/调查接口的登录与归属校验（原匿名可读 /api/scales/:id、可建量表）
 * 用 node:sqlite 内存库模拟 D1，public/ 目录模拟 ASSETS 绑定。
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

let pass = 0;
let fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass += 1; console.log('  PASS  ' + name); return; }
  fail += 1;
  console.log('  FAIL  ' + name + (detail === undefined ? '' : '  →  ' + JSON.stringify(detail)));
}

/* D1 shim：只覆盖 lib/db-d1.js 实际用到的 prepare/bind/first/all/run/batch/exec */
function makeD1(db) {
  return {
    prepare(sql) {
      let params = [];
      const api = {
        bind() { params = Array.prototype.slice.call(arguments); return api; },
        async first() { const r = db.prepare(sql).get.apply(db.prepare(sql), params); return r === undefined ? null : r; },
        async all() { return { results: db.prepare(sql).all.apply(db.prepare(sql), params) }; },
        async run() {
          const r = db.prepare(sql).run.apply(db.prepare(sql), params);
          return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
        _runRaw() { return db.prepare(sql).run.apply(db.prepare(sql), params); },
      };
      return api;
    },
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map(function (s) { return s._runRaw(); });
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) { return db.exec(sql); },
  };
}

/* ASSETS shim：真实读 public/，支持 304 条件请求 */
function makeAssets() {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  return {
    async fetch(request) {
      const u = new URL(request.url);
      let p = u.pathname === '/' ? '/index.html' : u.pathname;
      const file = path.join(PUBLIC, p.replace(/^\/+/, ''));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      }
      if (request.headers.get('if-none-match') === '"test-etag"') {
        return new Response(null, { status: 304, headers: { ETag: '"test-etag"' } });
      }
      return new Response(fs.readFileSync(file), {
        status: 200,
        headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ETag: '"test-etag"' },
      });
    },
  };
}

(async function run() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'core', 'schema.sql'), 'utf8'));
  /* lib/logic.js 是 IIFE + module.exports 赋值，Node 无法静态识别其具名导出（Workers 的 esbuild 可以）。
     仅测试时把该行改写成默认导入再解构，不改动生产代码。 */
  const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const IMPORT = "import { computeVisibility, answerLabel } from './lib/logic.js';";
  if (src.indexOf(IMPORT) < 0) throw new Error('worker.js 的 logic.js 导入行已变化，请更新测试中的互操作补丁');
  const tmp = path.join(ROOT, '.worker_under_test.mjs');
  fs.writeFileSync(tmp, src.replace(IMPORT, "import __logic from './lib/logic.js';\nconst { computeVisibility, answerLabel } = __logic;"));
  let worker;
  try {
    worker = (await import(pathToFileURL(tmp).href)).default;
  } finally {
    fs.unlinkSync(tmp);
  }
  const env = { DB: makeD1(db), ASSETS: makeAssets() };

  let cookie = '';
  async function call(method, p, body, headers) {
    const h = Object.assign({ host: 'example.com' }, headers || {});
    if (cookie && !h.cookie) h.cookie = cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await worker.fetch(new Request('https://example.com' + p, {
      method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
    }), env, {});
    const sc = res.headers.get('set-cookie');
    if (sc) {
      const m = sc.match(/msid=([^;]+)/);
      if (m) cookie = 'msid=' + m[1];
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    return { status: res.status, headers: res.headers, text: text, json: json };
  }

  console.log('\n【0】部署配置：静态资源也要经过 Worker');
  const wranglerToml = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  ok(/run_worker_first\s*=\s*true/.test(wranglerToml),
    'run_worker_first = true：否则首页/JS 由资产服务器直出，CSP 等安全头不会生效');

  console.log('\n【准备】初始化 D1 并注册首个管理员');
  const boot = await call('POST', '/api/register', { username: 'admin_t', password: 'secret123' });
  ok(boot.status === 200, '首个注册用户成功（bootstrap）', boot.status);
  ok(boot.json && boot.json.user && boot.json.user.role === 'admin', '首个用户自动成为管理员', boot.json);
  const adminCookie = cookie;

  console.log('\n【1】前端路由回退（原实测 404）');
  const spa1 = await call('GET', '/s/abc123');
  ok(spa1.status === 200, '/s/<token> 返回 200', spa1.status);
  ok(/<div id="app">/.test(spa1.text), '/s/<token> 返回 index.html 内容');
  ok(/text\/html/.test(spa1.headers.get('content-type') || ''), '/s/<token> Content-Type 是 HTML');
  const spa2 = await call('GET', '/home');
  ok(spa2.status === 200, '/home 返回 200', spa2.status);
  const miss = await call('GET', '/missing-file.js');
  ok(miss.status === 404, '缺失的静态文件仍返回 404（不回退成 HTML）', miss.status);
  const apiMiss = await call('GET', '/api/not-implemented');
  ok(apiMiss.status === 501, '未知 API 仍返回 501', apiMiss.status);

  console.log('\n【2】PATCH /api/surveys/:id（前端发的方法）');
  const created = await call('POST', '/api/surveys', { scaleId: 1, name: '原始调查名' });
  ok(created.status === 200, '创建调查成功', created.status);
  const sid = created.json && created.json.id;
  const patched = await call('PATCH', '/api/surveys/' + sid, { name: '改名后的调查' });
  ok(patched.status === 200, 'PATCH 调查返回 200（原 405）', patched.status);
  ok(patched.json && patched.json.name === '改名后的调查', 'PATCH 后名称已更新', patched.json && patched.json.name);
  const reread = await call('GET', '/api/surveys/' + sid);
  ok(reread.json && reread.json.name === '改名后的调查', 'PATCH 结果已持久化', reread.json && reread.json.name);
  const patched2 = await call('PATCH', '/api/surveys/' + sid, { maxResponses: 30 });
  ok(patched2.json && patched2.json.maxResponses === 30 && patched2.json.name === '改名后的调查',
    'PATCH 是部分合并，不覆盖未提交字段', patched2.json && { name: patched2.json.name, maxResponses: patched2.json.maxResponses });

  console.log('\n【3】静态资源安全头（原首页与 app.js 无 CSP）');
  const home = await call('GET', '/');
  ok(/default-src 'self'/.test(home.headers.get('content-security-policy') || ''), '首页带 CSP', home.headers.get('content-security-policy'));
  ok(home.headers.get('x-frame-options') === 'DENY', '首页带 X-Frame-Options: DENY', home.headers.get('x-frame-options'));
  ok(home.headers.get('x-content-type-options') === 'nosniff', '首页带 nosniff');
  const js = await call('GET', '/app.js');
  ok(/default-src 'self'/.test(js.headers.get('content-security-policy') || ''), 'app.js 带 CSP');
  ok(/javascript/.test(js.headers.get('content-type') || ''), 'app.js 的 Content-Type 未被破坏', js.headers.get('content-type'));
  const notMod = await call('GET', '/', undefined, { 'if-none-match': '"test-etag"' });
  ok(notMod.status === 304, '条件请求仍返回 304', notMod.status);
  ok(notMod.text === '', '304 响应无 body', notMod.text.slice(0, 40));

  console.log('\n【4】量表/调查的登录与归属校验');
  cookie = '';
  const anonScales = await call('GET', '/api/scales');
  ok(anonScales.status === 401, '匿名 GET /api/scales → 401（原 200）', anonScales.status);
  const anonScale1 = await call('GET', '/api/scales/1');
  ok(anonScale1.status === 401, '匿名 GET /api/scales/1 → 401（原 200 泄露量表全文）', anonScale1.status);
  const anonCreate = await call('POST', '/api/scales', { scale: { title: 'shark', definition: { items: [] } } });
  ok(anonCreate.status === 401, '匿名 POST /api/scales → 401（原可匿名建量表）', anonCreate.status);
  const anonSurveys = await call('GET', '/api/surveys');
  ok(anonSurveys.status === 401, '匿名 GET /api/surveys → 401', anonSurveys.status);
  const anonSurvey1 = await call('GET', '/api/surveys/' + sid);
  ok(anonSurvey1.status === 401, '匿名 GET /api/surveys/:id → 401（原 200 泄露 token）', anonSurvey1.status);

  db.prepare("INSERT INTO settings(key,value) VALUES('register_mode','open') ON CONFLICT(key) DO UPDATE SET value='open'").run();
  const other = await call('POST', '/api/register', { username: 'researcher2', password: 'secret123' });
  ok(other.status === 200, '第二个研究者注册成功（open 模式）', other.status);
  const otherCookie = cookie;

  cookie = otherCookie;
  const tmpl = await call('GET', '/api/scales/1');
  ok(tmpl.status === 200, '登录用户可读内置模板量表', tmpl.status);
  const foreignGet = await call('GET', '/api/surveys/' + sid);
  ok(foreignGet.status === 403, '非归属者读取他人调查 → 403（原 200）', foreignGet.status);
  const foreignPatch = await call('PATCH', '/api/surveys/' + sid, { name: '被篡改' });
  ok(foreignPatch.status === 403, '非归属者 PATCH 他人调查 → 403', foreignPatch.status);
  const foreignDelete = await call('DELETE', '/api/surveys/' + sid);
  ok(foreignDelete.status === 403, '非归属者删除他人调查 → 403', foreignDelete.status);

  cookie = adminCookie;
  const builtinPut = await call('PUT', '/api/scales/1', { title: '改名内置量表' });
  ok(builtinPut.status === 400, '内置量表不可直接 PUT 修改', builtinPut.status);
  const mine = await call('POST', '/api/scales', { scale: { title: '我的量表', category: '自建', definition: { items: [{ id: 'q1', type: 'radio', text: '题1', options: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] }], dimensions: [], scoring: { method: 'sum' } } } });
  ok(mine.status === 200, '管理员可创建自定义量表', mine.status);
  const mid = mine.json && mine.json.id;
  const partialPut = await call('PUT', '/api/scales/' + mid, { title: '只改标题' });
  ok(partialPut.status === 200 && partialPut.json.title === '只改标题', 'PUT 量表返回 200', partialPut.json && partialPut.json.title);
  ok(partialPut.json && partialPut.json.category === '自建' && partialPut.json.definition.items.length === 1,
    'PUT 是部分合并，未提交字段不被清空（原会写成"未命名量表"）',
    partialPut.json && { category: partialPut.json.category, items: partialPut.json.definition.items.length });

  console.log('\n【8】来源 IP 信任链与限流分桶');
  cookie = adminCookie;
  await call('POST', '/api/login', { password: 'definitely-wrong' },
    { 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' });
  const ipLog = db.prepare("SELECT detail FROM audit_log WHERE action='login_failed' ORDER BY id DESC LIMIT 1").get();
  ok(ipLog && /9\.9\.9\.9/.test(ipLog.detail) && !/1\.2\.3\.4/.test(ipLog.detail),
    'Worker 优先信任 Cloudflare 注入的 cf-connecting-ip，忽略客户端可伪造的 XFF', ipLog && ipLog.detail);

  const join = await call('POST', '/api/join/' + created.json.token, { answers: {} },
    { 'cf-connecting-ip': '198.51.100.5' });
  ok(join.status !== 429, '公开填写提交不被全局配额误伤', join.status);
  const joinKeys = db.prepare("SELECT key FROM rate_limits WHERE key LIKE 'join%'").all().map((r) => r.key);
  ok(joinKeys.includes('join|198.51.100.5'), 'join 限流按来源 IP 分桶', joinKeys);
  ok(!joinKeys.includes('join'), '不再使用全站共用的 join 桶（原会互相挤占额度）', joinKeys);

  const upload = await call('POST', '/api/import/parse',
    { filename: 'a.csv', data: Buffer.from('title,type\n题目,radio').toString('base64') },
    { 'cf-connecting-ip': '198.51.100.6' });
  ok(upload.status !== 401, '登录用户可以上传解析', upload.status);
  const uploadKeys = db.prepare("SELECT key FROM rate_limits WHERE key LIKE 'upload%'").all().map((r) => r.key);
  ok(uploadKeys.includes('upload|198.51.100.6'), 'upload 限流按来源 IP 分桶', uploadKeys);
  ok(!uploadKeys.includes('upload'), '不再使用全站共用的 upload 桶', uploadKeys);

  console.log('\n———————————————————————————————');
  console.log('Worker 路由测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail > 0) process.exitCode = 1;
})().catch(function (e) {
  console.error('测试异常：', e);
  process.exitCode = 1;
});
