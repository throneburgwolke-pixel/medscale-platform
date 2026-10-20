'use strict';
/**
 * 公网基线测试：安全响应头、HTTPS 相关标记、静态缓存、健康检查与提交/上传限流。
 * 站点从本机移到公网之后，这些是"陌生人也能访问"时必须先有的东西。
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'headers_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;
// 这份测试模拟"确实部署在反向代理后面"：转发头才允许生效
process.env.MEDSCALE_TRUST_PROXY = '1';

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();

const call = function (name) {
  const fn = srv[name];
  return typeof fn === 'function' ? fn.apply(null, Array.prototype.slice.call(arguments, 1)) : fn;
};

(async function run() {
  console.log('\n【1】每个响应都带同一组安全头');
  const anon = http.makeClient(srv);
  const home = await anon.request('GET', '/');
  const csp = String(home.headers['Content-Security-Policy'] || '');
  t.ok(/default-src 'self'/.test(csp), 'CSP 默认只允许同源', csp);
  t.ok(/script-src 'self'/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), '脚本只允许同源文件，禁内联', csp);
  t.ok(/style-src 'self' 'unsafe-inline'/.test(csp), '样式允许内联（页面大量用行内 style）', csp);
  t.ok(/frame-ancestors 'none'/.test(csp), '禁止被他人 iframe 嵌入', csp);
  t.ok(/object-src 'none'/.test(csp), '禁掉 plugin 内容', csp);
  t.ok(/base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp), 'base 与 form 目标锁同源', csp);
  t.ok(home.headers['X-Content-Type-Options'] === 'nosniff', '禁止 MIME 嗅探');
  t.ok(home.headers['X-Frame-Options'] === 'DENY', '老浏览器的防嵌入兜底');
  t.ok(home.headers['Referrer-Policy'] === 'strict-origin-when-cross-origin', '跨站跳转不带查询串', home.headers['Referrer-Policy']);
  t.ok(/camera=\(\)/.test(String(home.headers['Permissions-Policy'] || '')), '关掉摄像头/麦克风/定位权限', home.headers['Permissions-Policy']);
  t.ok(/noindex/.test(String(home.headers['X-Robots-Tag'] || '')), '默认请搜索引擎不要收录', home.headers['X-Robots-Tag']);

  const api = await anon.request('GET', '/api/session');
  t.ok(api.headers['Content-Security-Policy'] === csp, '接口响应同样带头');
  const notFound = await anon.request('GET', '/no-such-page');
  t.ok(notFound.status === 404 && notFound.headers['X-Content-Type-Options'] === 'nosniff', '404 页也不漏');

  console.log('\n【2】HTTPS 标记只在真的走了加密链路时出现');
  t.ok(!home.headers['Strict-Transport-Security'], '明文 HTTP 下不发 HSTS（发了会把浏览器永久锁到 https）');
  const viaProxy = await anon.request('GET', '/', undefined, { 'x-forwarded-proto': 'https' });
  const hsts = String(viaProxy.headers['Strict-Transport-Security'] || '');
  t.ok(/max-age=\d{7,}/.test(hsts), '经代理的 HTTPS 下发 HSTS', hsts);
  const spoof = { headers: { 'x-forwarded-proto': 'https' }, socket: { remoteAddress: '1.2.3.4' } };
  t.ok(call('isHttps', spoof, false) === false, '未开启代理信任时 X-Forwarded-Proto 不算数');
  t.ok(call('isHttps', spoof, true) === true, '开启代理信任后采用 X-Forwarded-Proto');
  t.ok(call('isHttps', { headers: {}, socket: {} }, true) === false, '没有转发头时按明文处理');

  console.log('\n【3】HTTPS 下登录 Cookie 带 Secure');
  const admin = http.makeClient(srv);
  const boot = await admin.request('POST', '/api/register', { username: 'cap', password: 'pass1234', password2: 'pass1234' });
  t.ok(boot.status === 200, '首个管理员注册成功', boot.json);
  t.ok(!/;\s*Secure/.test(String((boot.headers['Set-Cookie'] || ''))), '明文链路下不加 Secure，否则本机访问直接登不上');
  const secureLogin = await admin.request('POST', '/api/logout', {});
  t.ok(secureLogin.status === 200, '退出成功');
  const httpsLogin = await admin.request('POST', '/api/login', { username: 'cap', password: 'pass1234' },
    { 'x-forwarded-proto': 'https' });
  t.ok(httpsLogin.status === 200, '加密链路下登录成功', httpsLogin.json);
  t.ok(/;\s*Secure/.test(String(httpsLogin.headers['Set-Cookie'] || '')), 'HTTPS 登录的 Cookie 带 Secure', httpsLogin.headers['Set-Cookie']);

  console.log('\n【4】静态资源可缓存并可协商重新验证，首页不缓存');
  const js = await admin.request('GET', '/app.js');
  const etag = String(js.headers['ETag'] || '');
  t.ok(js.status === 200 && /^"[0-9a-f-]{8,}"$/.test(etag), '静态 JS 带 ETag', etag);
  t.ok(/public, max-age=\d+/.test(String(js.headers['Cache-Control'] || '')), '静态资源允许浏览器缓存', js.headers['Cache-Control']);
  const again = await admin.request('GET', '/app.js', undefined, { 'If-None-Match': etag });
  t.ok(again.status === 304, '未变更时回 304，不再重复传文件', again.status);
  t.ok(again.text === '' || again.text.length === 0, '304 不带响应体');
  const css = await admin.request('GET', '/styles.css');
  t.ok(/public, max-age=\d+/.test(String(css.headers['Cache-Control'] || '')), '样式同样可缓存');
  const shell = await admin.request('GET', '/');
  t.ok(/no-store/.test(String(shell.headers['Cache-Control'] || '')), '首页不缓存，改版后刷新即生效');

  console.log('\n【5】健康检查免登录且只给最小信息');
  const health = await anon.request('GET', '/healthz');
  t.ok(health.status === 200 && health.json && health.json.ok === true, '健康检查返回 ok', health.json);
  t.ok(Object.keys(health.json || {}).length === 1, '不暴露用户数/路径/口令状态', Object.keys(health.json || {}));
  t.ok(!health.headers['Set-Cookie'], '健康检查不发会话 Cookie');
  t.ok(/no-store/.test(String(health.headers['Cache-Control'] || '')), '健康检查不许缓存');

  console.log('\n【6】提交与上传接口按来源限流');
  const policy = srv.RATE_POLICY || {};
  t.ok(policy.join && policy.join.max > 0, '填写提交有配额', policy.join);
  t.ok(policy.upload && policy.upload.max > 0, '解析上传有配额', policy.upload);
  const scales = await admin.request('GET', '/api/scales');
  const scaleId = ((scales.json.items || [])[0] || {}).id;
  const pub = await admin.request('POST', '/api/surveys', { scaleId: scaleId, name: '限流测试' });
  const token = (pub.json || {}).token;
  t.ok(!!token, '发布了一份问卷用于测试', pub.json);

  dbm.setRateLimit(srv.limitKey('join', '127.0.0.1'), Date.now(), policy.join.max);
  const throttled = await anon.request('POST', '/api/join/' + token, { answers: {} });
  t.ok(throttled.status === 429, '达到配额后的提交被挡住', throttled.json);
  t.ok(Number(throttled.headers['Retry-After']) > 0, '返回 Retry-After', throttled.headers['Retry-After']);
  dbm.clearRateLimit(srv.limitKey('join', '127.0.0.1'));
  const allowed = await anon.request('POST', '/api/join/' + token, { answers: {} });
  t.ok(allowed.status !== 429, '清零后恢复放行', allowed.status);

  dbm.setRateLimit(srv.limitKey('upload', '127.0.0.1'), Date.now(), policy.upload.max);
  const up = await admin.request('POST', '/api/import/parse', { filename: 'a.csv', data: 'AA==' });
  t.ok(up.status === 429, '上传解析同样限流', up.json);
  dbm.clearRateLimit(srv.limitKey('upload', '127.0.0.1'));

  console.log('\n【7】前端产物不依赖内联脚本（否则 CSP 会拦掉）');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const fillJs = fs.readFileSync(path.join(ROOT, 'public', 'fill.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const fillHtml = fs.readFileSync(path.join(ROOT, 'public', 'fill.html'), 'utf8');
  t.ok(!/\son[a-z]+="/.test(appJs), 'app.js 生成的 HTML 里没有内联事件处理器', (/\son[a-z]+="[^"]{0,40}/.exec(appJs) || [''])[0]);
  t.ok(!/\son[a-z]+="/.test(fillJs), 'fill.js 生成的 HTML 里没有内联事件处理器');
  t.ok(html.indexOf('<script>') < 0 && fillHtml.indexOf('<script>') < 0, '入口 HTML 只用外链脚本');
  t.ok(appJs.indexOf('<script') < 0 && fillJs.indexOf('<script') < 0, '弹窗写入的文档里没有内联脚本');

  console.log('\n【8】允许收录是可显式打开的开关');
  t.ok(call('securityHeaders', { indexable: true })['X-Robots-Tag'] === undefined, '开关打开时不发 noindex');
  t.ok(/noindex/.test(call('securityHeaders', { indexable: false })['X-Robots-Tag'] || ''), '默认仍然 noindex');

  process.exit(t.done('公网基线'));
}()).catch(function (e) {
  console.error('测试异常：', e && e.stack || e);
  process.exit(1);
});
