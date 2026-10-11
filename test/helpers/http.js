'use strict';
/**
 * 测试共用：把进程内 server.js 的 handleRequest 包装成 Promise 风格的 request()。
 * 不经过真实网络端口，纯内存模拟 req/res。
 */
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

function freshDb(dbPath) {
  ['', '-wal', '-shm'].forEach(function (s) {
    const p = dbPath + s;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  const pwFile = path.join(path.dirname(dbPath), '管理员初始口令.txt');
  if (fs.existsSync(pwFile)) fs.unlinkSync(pwFile);
}

function makeClient(srv, opts) {
  const cookieStore = { value: '' };
  return {
    cookieStore: cookieStore,
    request: function (method, url, body, headers) {
      return new Promise(function (resolve) {
        const req = new EventEmitter();
        req.method = method;
        req.url = url;
        // Node 会把入站头名统一成小写，模拟请求也要照这个规则，否则服务端按小写读头时测试对不上
        const given = Object.assign({ host: 'localhost:5173' }, headers || {});
        req.headers = {};
        Object.keys(given).forEach(function (k) { req.headers[k.toLowerCase()] = given[k]; });
        req.socket = { remoteAddress: '127.0.0.1' };
        if (cookieStore.value && !req.headers.cookie) req.headers.cookie = cookieStore.value;
        const chunks = [];
        const res = {
          statusCode: 0,
          headers: {},
          writeHead: function (code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); },
          end: function (data) {
            if (data && data.length) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
            const buf = Buffer.concat(chunks);
            const ct = this.headers['Content-Type'] || '';
            let json = null;
            if (ct.indexOf('json') >= 0) { try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; } }
            const sc = this.headers['Set-Cookie'];
            if (sc && /msid=[^;]+/.test(sc)) {
              const m = sc.match(/msid=([^;]+)/);
              cookieStore.value = m[1] ? 'msid=' + m[1] : cookieStore.value;
              if (/msid=;/.test(sc) || /Max-Age=0/.test(sc)) cookieStore.value = '';
            }
            resolve({ status: this.statusCode, headers: this.headers, text: buf.toString('utf8'), json: json, buf: buf });
          },
          on: function () { },
        };
        setTimeout(function () {
          if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
          req.emit('end');
        }, 0);
        srv.handleRequest(req, res);
      });
    },
  };
}

function makeCounter() {
  const st = { pass: 0, fail: 0 };
  st.ok = function (cond, label, extra) {
    if (cond) { st.pass += 1; console.log('  PASS  ' + label); }
    else { st.fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
  };
  st.done = function (name) {
    console.log('\n———————————————————————————————');
    console.log('  ' + name + '：通过 ' + st.pass + ' 项，失败 ' + st.fail + ' 项');
    console.log('———————————————————————————————\n');
    return st.fail;
  };
  return st;
}

module.exports = { freshDb: freshDb, makeClient: makeClient, makeCounter: makeCounter };
