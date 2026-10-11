// core/registry.js
'use strict';
const H = require('./http.js');
const routes = [];
function compilePattern(pattern) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { regex, keys };
}
function route(method, pattern, handler, opts) {
  const c = compilePattern(pattern);
  routes.push({ method, pattern, regex: c.regex, keys: c.keys, handler, auth: !(opts && opts.public), admin: !!(opts && opts.admin) });
}
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    return { handler: r.handler, params, auth: r.auth, admin: r.admin, pattern: r.pattern };
  }
  return null;
}
async function dispatch(ctx) {
  const m = matchRoute(ctx.method, ctx.path);
  if (!m) return H.notFound('接口不存在');
  if (m.auth && !ctx.session) return H.unauthorized();
  if (m.admin && !(ctx.session && ctx.session.admin)) return H.forbidden('需要管理员权限');
  ctx.params = m.params;
  try { return await m.handler(ctx); }
  catch (e) { console.error('[core]', ctx.method, ctx.path, e); return H.errorResult(); }
}
function list() { return routes.map((r) => ({ method: r.method, pattern: r.pattern, handler: r.handler, auth: r.auth, admin: r.admin })); }
function resetForTest() { routes.length = 0; }
module.exports = { route, list, matchRoute, dispatch, compilePattern, resetForTest };
