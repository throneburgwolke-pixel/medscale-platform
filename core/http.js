// core/http.js
'use strict';
/** 路由 handler 的统一返回形状与构造器：适配器只管把 Result 映射为本地响应 */
function mk(status, payload, headers) {
  return Object.assign({ status: status, headers: headers || {} }, payload);
}
function json(status, obj, headers) { return mk(status, { json: obj }, headers); }
function text(status, str, headers) {
  return mk(status, { text: str }, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers || {}));
}
function buf(status, buffer, contentType, headers) {
  return mk(status, { buf: buffer }, Object.assign({ 'Content-Type': contentType }, headers || {}));
}
function badRequest(msg) { return json(400, { error: msg || '请求有误' }); }
function unauthorized() { return json(401, { error: '请先登录' }); }
function forbidden(msg) { return json(403, { error: msg || '无权访问' }); }
function notFound(msg) { return json(404, { error: msg || '未找到' }); }
/** 500 只回通用文案：细节进 console.error（由适配器负责），绝不进响应 */
function errorResult() { return json(500, { error: '服务器内部错误' }); }

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('|') : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvRows(rows) {
  return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

module.exports = { json, text, buf, badRequest, unauthorized, forbidden, notFound, errorResult, csvCell, csvRows };
