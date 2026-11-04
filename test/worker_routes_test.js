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
  const IMPORT = "import { computeVisibility, answerLabel, pendingItems, spssCoding } from './lib/logic.js';";
  if (src.indexOf(IMPORT) < 0) throw new Error('worker.js 的 logic.js 导入行已变化，请更新测试中的互操作补丁');
  const tmp = path.join(ROOT, '.worker_under_test.mjs');
  fs.writeFileSync(tmp, src.replace(IMPORT, "import __logic from './lib/logic.js';\nconst { computeVisibility, answerLabel, pendingItems, spssCoding } = __logic;"));
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
    if (cookie && !Object.hasOwn(h, 'cookie')) h.cookie = cookie;
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

  console.log('\n【9】发布守卫与结果字段');
  cookie = adminCookie;
  const K = require(path.join(ROOT, 'lib', 'scale-kit.js'));
  const pendScale = await call('POST', '/api/scales', { scale: { title: '待填W', category: '情绪与心理',
    definition: { items: K.numbered([K.pendingQ('w1', 1, [0, 1])]), dimensions: [{ id: 'total', name: '总分', items: ['w1'] }], scoring: { method: 'sum' } } } });
  const wsv = await call('POST', '/api/surveys', { scaleId: pendScale.json.id, name: 'x' });
  ok(wsv.status === 400 && /待填入授权文本/.test(wsv.json.error), 'Worker /api/surveys 拦截待填量表', wsv.json);
  const wst = await call('POST', '/api/studies', { scaleId: pendScale.json.id, name: 'y', waves: [{ label: '基线' }] });
  ok(wst.status === 400 && /待填入授权文本/.test(wst.json.error), 'Worker /api/studies 拦截待填量表', wst.json);
  const ghost = await call('POST', '/api/surveys', { scaleId: 999999, name: 'x' });
  ok(ghost.status === 404, 'Worker /api/surveys 对不存在的量表返回 404（原先会建出孤儿调查）', ghost.status);
  const shown = await call('POST', '/api/surveys', { scaleId: mid, name: '显示结果', showResult: true });
  const subW = await call('POST', '/api/join/' + shown.json.token, { answers: { q1: 2 } }, { cookie: '' });
  ok(subW.json && subW.json.result && subW.json.result.total === 2 && subW.json.scores === undefined,
    'Worker 结果字段与 Node 一致为 result（原为 scores，填写页读不到）', subW.json);

  console.log('\n【10】公开提交先校验答案及知情同意，不保存无效答卷');
  const validatedScale = await call('POST', '/api/scales', { scale: { title: '提交校验', consentOn: false,
    definition: { items: [
      { id: 'choice', no: 1, text: '选择', type: 'radio', options: [{ label: '否', value: 0 }, { label: '是', value: 1 }] },
      { id: 'amount', no: 2, text: '数值', type: 'number', min: 0, max: 10 },
      { id: 'multi', no: 3, text: '多选', type: 'checkbox', required: false, options: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] },
    ], scoring: { method: 'sum' }, dimensions: [] } } });
  const validatedSurvey = await call('POST', '/api/surveys', { scaleId: validatedScale.json.id, name: '公开校验', anonymous: true, showResult: true });
  const joinPath = '/api/join/' + validatedSurvey.json.token;
  cookie = '';
  const publicForm = await call('GET', joinPath);
  ok(publicForm.status === 200 && publicForm.json.survey.anonymous === true, '公开匿名填写入口仍可读取问卷', publicForm.status);
  const invalidCases = [
    { name: '无效选项 999', answers: { choice: 999, amount: 2, multi: [1] }, itemId: 'choice' },
    { name: '缺失必答题', answers: { amount: 2, multi: [1] }, itemId: 'choice' },
    { name: '未提交 answers', itemId: 'choice' },
    { name: '低于 min', answers: { choice: 1, amount: -1, multi: [1] }, itemId: 'amount' },
    { name: '高于 max', answers: { choice: 1, amount: 11, multi: [1] }, itemId: 'amount' },
    { name: '重复多选', answers: { choice: 1, amount: 2, multi: [1, 1] }, itemId: 'multi' },
    { name: '布尔数值', answers: { choice: 1, amount: false, multi: [1] }, itemId: 'amount' },
  ];
  for (const test of invalidCases) {
    const before = db.prepare('SELECT COUNT(*) AS n FROM responses').get().n;
    const response = await call('POST', joinPath, { answers: test.answers });
    ok(response.status === 400, test.name + '返回 400', response.status);
    ok(response.json && response.json.error && Array.isArray(response.json.details) && response.json.details.some((e) => e.itemId === test.itemId),
      test.name + '返回 Node 同形 details', response.json);
    ok(db.prepare('SELECT COUNT(*) AS n FROM responses').get().n === before, test.name + '不落 responses 表');
  }
  const valid = await call('POST', joinPath, { answers: { choice: 1, amount: '2', multi: [1, 2] } });
  ok(valid.status === 200 && valid.json.ok === true && !!valid.json.pid, '有效答案可匿名正常提交', valid.json);
  ok(valid.json && valid.json.result && valid.json.result.total === 6 && valid.json.scores === undefined, '有效提交保留 result 字段与正确总分', valid.json);
  ok(db.prepare('SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?').get(validatedSurvey.json.id).n === 1, '只保存一份有效答卷');

  cookie = adminCookie;
  const consentScale = await call('POST', '/api/scales', { scale: { title: '须知情同意', consentOn: true, consentText: '请同意参与',
    definition: { items: [{ id: 'q', no: 1, text: '数值', type: 'number', min: 0, max: 10 }], scoring: { method: 'sum' } } } });
  const consentSurvey = await call('POST', '/api/surveys', { scaleId: consentScale.json.id, name: '知情同意', showResult: false });
  cookie = '';
  for (const consent of [undefined, false, 'false', {}, []]) {
    const before = db.prepare('SELECT COUNT(*) AS n FROM responses').get().n;
    const response = await call('POST', '/api/join/' + consentSurvey.json.token, { answers: { q: 2 }, consent: consent });
    ok(response.status === 400 && response.json && /知情同意/.test(response.json.error), '未同意知情说明返回 400：' + JSON.stringify(consent), response.json);
    ok(db.prepare('SELECT COUNT(*) AS n FROM responses').get().n === before, '未同意时不落 responses 表');
  }
  const consented = await call('POST', '/api/join/' + consentSurvey.json.token, { answers: { q: 2 }, consent: true });
  ok(consented.status === 200 && consented.json.ok === true && consented.json.result === undefined, '同意后可提交，showResult=false 仍不公开结果', consented.json);
  const savedConsent = db.prepare('SELECT consent FROM responses WHERE survey_id = ?').all(consentSurvey.json.id);
  ok(savedConsent.length === 1 && savedConsent[0].consent === 1, '仅保存已知情同意的有效答卷', savedConsent);

  for (const consent of [false, 'false', {}, []]) {
    const before = db.prepare('SELECT COUNT(*) AS n FROM responses').get().n;
    const response = await call('POST', joinPath, { answers: { choice: 1, amount: 2 }, consent: consent });
    ok(response.status === 200 && db.prepare('SELECT COUNT(*) AS n FROM responses').get().n === before + 1,
      '未要求同意时仍可保存有效答案：' + JSON.stringify(consent), response.json);
    const saved = db.prepare('SELECT consent FROM responses WHERE survey_id = ? ORDER BY id DESC LIMIT 1').get(validatedSurvey.json.id);
    ok(saved.consent === 0, '未要求同意时非布尔true不记录为已同意：' + JSON.stringify(consent), saved);
  }
  const optionalTrue = await call('POST', joinPath, { answers: { choice: 1, amount: 2 }, consent: true });
  const savedOptionalTrue = db.prepare('SELECT consent FROM responses WHERE survey_id = ? ORDER BY id DESC LIMIT 1').get(validatedSurvey.json.id);
  ok(optionalTrue.status === 200 && savedOptionalTrue.consent === 1, '未要求同意时显式true仍记录为已同意', savedOptionalTrue);

  console.log('\n【11】SPSS/codebook共享编码及多选缺失');
  cookie = adminCookie;
  const backend = globalThis.__medscaleBackend;
  const exportScale = await backend.insertScale({ title: '编码回归', definition: { items: [
    { id: 'sex', no: 1, text: '分类', type: 'radio', required: false, options: [
      { value: 'F', label: '女', score: 99 }, { value: 1, label: '原值' }, { value: 'M', label: '男' },
      { value: '02', label: '数字串' }, { value: 'na', label: '不适用', na: true }, { value: 'un', label: '未知', score: null },
    ] },
    { id: 'multi', no: 2, text: '多选', type: 'checkbox', required: false, options: [{ value: 'A', label: '甲' }, { value: 'B', label: '乙' }] },
  ], scoring: { method: 'none' } } });
  const exportSurvey = await backend.createSurvey(exportScale.id, { name: '编码回归' });
  const exportAnswers = [
    { sex: 'F' }, { sex: 'M', multi: null }, { sex: 'na', multi: [] }, { sex: 'un', multi: ['A'] },
    { sex: '02', multi: ['B'] }, { sex: 'alien', multi: ['alien'] }, { sex: 1, multi: ['A', 'B'] },
  ];
  for (const answers of exportAnswers) await backend.saveResponse(exportSurvey, exportScale, { answers: answers });
  const numericExport = await call('GET', '/api/surveys/' + exportSurvey.id + '/export-spss.csv');
  const cells = numericExport.text.trim().split('\r\n').slice(1).map(function (line) { return line.split(',').slice(4, 7); });
  ok(JSON.stringify(cells) === JSON.stringify([['3', '', ''], ['4', '', ''], ['', '', ''], ['', '1', '0'], ['02', '0', '1'], ['', '', ''], ['1', '1', '1']]), 'Worker SPSS 原编码/缺失与真实多选0/1正确', cells);
  ok(!numericExport.text.includes('NaN'), 'Worker 未输出NaN');
  const codebook = await call('GET', '/api/surveys/' + exportSurvey.id + '/codebook.csv');
  ok(codebook.text.includes('女=3；原值=1；男=4；数字串=02；不适用=缺失(空白)；未知=缺失(空白)') && /整题缺失.*空白/.test(codebook.text), 'Worker codebook 映射与缺失一致', codebook.text);
  const textExport = await call('GET', '/api/surveys/' + exportSurvey.id + '/export.csv');
  ok(textExport.text.includes('女') && textExport.text.includes('不适用') && textExport.text.includes('甲|乙'), 'Worker普通文字CSV不变');
  ok(JSON.stringify((await backend.listResponses(exportSurvey.id)).map(function (r) { return r.answers; })) === JSON.stringify(exportAnswers), 'Worker原始答案不变');

  console.log('\n【12】全部随访模式重复保护、保存竞态及历史冲突');
  for (const mode of ['auto', 'self']) {
    const study = await backend.createStudy(exportScale.id, { name: '重复保护', subjectMode: mode, waves: [{ label: '基线' }, { label: '随访' }] });
    const first = study.surveys[0]; const second = study.surveys[1];
    const firstJoin = await call('POST', '/api/join/' + first.token, { subjectId: ' S-test ', answers: { sex: 'F' } });
    const duplicate = await call('POST', '/api/join/' + first.token, { subjectId: 'S-test', answers: { sex: 'F' } });
    const crossWave = await call('POST', '/api/join/' + second.token, { subjectId: 'S-test', answers: { sex: 'M' } });
    ok(firstJoin.status === 200 && duplicate.status === 409 && crossWave.status === 200, mode + '同survey重复拒绝、跨时点允许、编号规范化', [firstJoin.status, duplicate.status, crossWave.status]);
    const concurrent = await Promise.allSettled([backend.saveResponse(first, exportScale, { subjectId: 'RACE', answers: { sex: 'F' } }), backend.saveResponse(first, exportScale, { subjectId: 'RACE', answers: { sex: 'M' } })]);
    ok(concurrent.filter(function (r) { return r.status === 'fulfilled'; }).length === 1 && concurrent.some(function (r) { return r.status === 'rejected' && r.reason.code === 'DUPLICATE_SUBJECT'; }), 'D1保存层并发只允许一份：' + mode, concurrent.map(function (r) { return r.status; }));
    // 模拟检查到保存之间另一请求已提交，确认路由把保存层冲突返回409而非500。
    const originalFind = backend.findResponseBySubject;
    backend.findResponseBySubject = async function () { return null; };
    const raced = await call('POST', '/api/join/' + first.token, { subjectId: 'RACE', answers: { sex: 'F' } });
    backend.findResponseBySubject = originalFind;
    ok(raced.status === 409 && /重复|已提交/.test(raced.json.error), 'Worker保存层竞态返回可读409：' + mode, raced);
    db.prepare('INSERT INTO responses(survey_id,pid,answers,scores,subject_id) VALUES(?,?,?,?,?)').run(first.id, 'history-' + mode, '{"sex":"M"}', '{"total":99}', 'S-test');
    const report = await call('GET', '/api/studies/' + study.study.id + '/report');
    ok(report.json.conflicts && report.json.conflicts.length === 1 && report.json.conflicts[0].surveyId === first.id && report.json.warnings.length === 1 && report.json.pairs[0].n === 0, 'Worker JSON明确报告历史冲突且不扩大配对n：' + mode, report.json.conflicts);
    const wide = await call('GET', '/api/studies/' + study.study.id + '/export-wide.csv');
    const wideCells = wide.text.split('\r\n').find(function (line) { return line.startsWith('S-test,'); }).split(',');
    ok(wideCells[1] === '' && wideCells[wideCells.length - 1] === '', 'Worker宽表冲突时点和差值空白：' + mode, wideCells);
    ok((await backend.listResponses(first.id)).filter(function (r) { return r.subjectId === 'S-test'; }).length === 2, '历史重复两条仍保留：' + mode);
  }
  const unlinkedFirst = await call('POST', '/api/join/' + exportSurvey.token, { subjectId: 'none-id', answers: { sex: 'F' } });
  const unlinkedDup = await call('POST', '/api/join/' + exportSurvey.token, { subjectId: 'none-id', answers: { sex: 'F' } });
  ok(unlinkedFirst.status === 200 && unlinkedDup.status === 409, 'subjectMode none 但有subjectId也拒绝重复');

  const unScale = await call('POST', '/api/scales', { scale: { title: '无法评估记录', consentOn: false,
    definition: { rater: 'clinician', items: [{ id: 'un', no: 1, text: '项目', type: 'radio',
      options: [{ label: '正常', value: 0 }, { label: '无法评估', value: 'un', score: null }] }],
      dimensions: [], scoring: { method: 'sum' } } } });
  const unSurvey = await call('POST', '/api/surveys', { scaleId: unScale.json.id, showResult: false });
  const unSubmitted = await call('POST', '/api/join/' + unSurvey.json.token, { answers: { un: 'un' } });
  ok(unSubmitted.status === 200 && unSubmitted.json.result && unSubmitted.json.result.total === null &&
    unSubmitted.json.result.invalid === true && unSubmitted.json.result.invalidReason === 'invalid_value',
    '正式提交把无法评估的计分状态传给填写页，而不只显示空分数', unSubmitted.json);

  console.log('\n【13】前端接口调用与 Worker 路由一致性（防止新增调用落到 501）');
  const frontendSrc = ['public/app.js', 'public/fill.js'].map(function (f) {
    return fs.readFileSync(path.join(ROOT, f), 'utf8');
  }).join('\n');
  const frontendPaths = Array.from(new Set(Array.from(
    frontendSrc.matchAll(/api\('([^']+)'/g), function (m) { return m[1]; })));
  const apiRoot = function (p) {
    return String(p).replace(/^\/+(api\/)?/, '').replace(/\/+$/, '').split('/')[0];
  };
  const guardedScale = await call('POST', '/api/scales', { scale: { title: '一致性守卫量表', category: '通用问卷',
    definition: { items: [{ id: 'g1', no: 1, text: '题1', type: 'radio',
      options: [{ label: '甲', value: 0 }, { label: '乙', value: 1 }] }], dimensions: [], scoring: { method: 'sum' } } } });
  const guardedSurvey = await call('POST', '/api/surveys', { scaleId: guardedScale.json.id, name: '一致性守卫调查' });
  const guardedInvite = await call('POST', '/api/invites', { maxUses: 1, days: 1 });
  const guardedUsers = await call('GET', '/api/users');
  const guardedStudies = await call('GET', '/api/studies');
  const guardedStudyId = guardedStudies.json.items.length ? guardedStudies.json.items[0].id : null;
  const samples = [
    ['GET', '/api/session'], ['GET', '/api/scales'], ['GET', '/api/surveys'], ['GET', '/api/studies'],
    ['GET', '/api/overview'], ['GET', '/api/settings'], ['GET', '/api/scale-catalog'],
    ['GET', '/api/licensed-notes'], ['GET', '/api/public/scales'], ['GET', '/api/backups'],
    ['GET', '/api/invites'], ['GET', '/api/users'],
    ['GET', '/api/scales/' + guardedScale.json.id],
    ['PUT', '/api/scales/' + guardedScale.json.id, { title: '一致性守卫量表改名' }],
    ['GET', '/api/surveys/' + guardedSurvey.json.id],
    ['PATCH', '/api/surveys/' + guardedSurvey.json.id, { note: '守卫' }],
    ['GET', '/api/surveys/' + guardedSurvey.json.id + '/report'],
    ['GET', '/api/surveys/' + guardedSurvey.json.id + '/export.csv'],
    ['GET', '/api/surveys/' + guardedSurvey.json.id + '/export.json'],
    ['GET', '/api/surveys/' + guardedSurvey.json.id + '/export-spss.csv'],
    ['GET', '/api/surveys/' + guardedSurvey.json.id + '/codebook.csv'],
    ['GET', '/api/join/' + guardedSurvey.json.token],
    ['POST', '/api/preview-score', { definition: guardedScale.json.definition, answers: { g1: 1 } }],
    ['POST', '/api/import/parse', { filename: 'x.txt', data: Buffer.from('1. 题一\nA. 是\nB. 否\n').toString('base64') }],
    ['POST', '/api/invites', { maxUses: 1, days: 1 }],
    ['PATCH', '/api/invites/' + guardedInvite.json.invite.id, { note: '守卫' }],
    ['PATCH', '/api/users/' + guardedUsers.json.items[0].id, { role: 'admin' }],
    ['POST', '/api/backup', {}],
    ['POST', '/api/restore', {}],
  ];
  if (guardedStudyId !== null) {
    samples.push(['GET', '/api/studies/' + guardedStudyId + '/report']);
    samples.push(['GET', '/api/studies/' + guardedStudyId + '/export-wide.csv']);
    samples.push(['DELETE', '/api/studies/' + guardedStudyId]);
  }
  const covered = new Set();
  for (const s of samples) {
    const r = await call(s[0], s[1], s[2]);
    ok(r.status !== 501, 'Worker 已实现前端接口 ' + s[0] + ' ' + s[1], r.json);
    covered.add(apiRoot(s[1]));
  }
  covered.add('login'); covered.add('register');
  ok((await call('GET', '/api/scales/' + guardedScale.json.id)).json.title === '一致性守卫量表改名',
    'PUT改名后量表仍按新标题可读');
  const delSurvey = await call('DELETE', '/api/surveys/' + guardedSurvey.json.id);
  ok(delSurvey.status === 200, 'DELETE调查路径可执行', delSurvey.json);
  const delScale = await call('DELETE', '/api/scales/' + guardedScale.json.id);
  ok(delScale.status === 200, 'DELETE量表路径可执行，守卫样本自清理', delScale.json);
  // 改密接口改的是系统管理员口令（不是账号口令），测试环境里的口令值未知，
  // 因此只用「错误原口令 → 400」证明路由已实现，不猜测口令。
  const wrongPwd = await call('POST', '/api/password', { oldPassword: 'wrong-old-pw', newPassword: 'secret456' });
  ok(wrongPwd.status === 400 && /原密码错误/.test(wrongPwd.json.error), '改密路由已实现且拒绝错误原口令', wrongPwd.json);
  covered.add('password');
  // 登出会销毁会话，必须放在所有需要登录的调用之后。
  ok((await call('POST', '/api/logout', {})).status === 200, '登出接口可调用');
  covered.add('logout');
  const unlisted = frontendPaths.filter(function (p) { return !covered.has(apiRoot(p)); });
  ok(unlisted.length === 0, '前端每个 api() 路径都在一致性守卫样本里登记', unlisted);
  ok((await call('GET', '/api/definitely-not-a-route')).status === 501, '未知接口仍返回明确 501');

  console.log('\n———————————————————————————————');
  console.log('Worker 路由测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail > 0) process.exitCode = 1;
})().catch(function (e) {
  console.error('测试异常：', e);
  process.exitCode = 1;
});
