// test/core_http_test.js
'use strict';
const path = require('node:path');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const H = require(path.join(__dirname, '..', 'core', 'http.js'));

console.log('\n【1】结果构造');
const r = H.json(200, { a: 1 });
t.ok(r.status === 200 && r.json && r.json.a === 1, 'json() 形状');
t.ok(H.json(201, {}, { 'X-A': 'b' }).headers['X-A'] === 'b', 'headers 透传');
t.ok(H.badRequest('坏').status === 400 && H.badRequest('坏').json.error === '坏', 'badRequest');
t.ok(H.unauthorized().status === 401 && H.forbidden().status === 403 && H.notFound().status === 404, '401/403/404');
const er = H.errorResult('内部细节');
t.ok(er.status === 500 && !/内部细节/.test(JSON.stringify(er.json)), 'errorResult 不外泄细节');

console.log('\n【2】CSV');
t.ok(H.csvCell('a,b') === '"a,b"' && H.csvCell('he said "hi"') === '"he said ""hi"""', 'csvCell 转义');
t.ok(H.csvCell(null) === '' && H.csvCell(['x', 'y']) === 'x|y', 'csvCell 空值与数组');
const csv = H.csvRows([['h1', 'h2'], ['v', 2]]);
t.ok(csv.charCodeAt(0) === 0xfeff && csv.includes('h1,h2\r\nv,2'), 'csvRows 带 BOM、CRLF');

console.log('\n【3】server.js 复用同一实现');
const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
t.ok(/core\/http\.js/.test(src), 'server.js 引用 core/http.js');
process.exit(t.done('核心 HTTP 结果'));
