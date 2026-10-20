'use strict';
/**
 * jsdom 前端测试支撑：加载 public/index.html + public/app.js，
 * 把 fetch 接到进程内 server.js 的 handleRequest，从而真实渲染各视图。
 */
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');

let JSDOM = null;
let VirtualConsole = null;
// jsdom 是 devDependency：npm i 后即可用；装在别处时用 JSDOM_PATH 指路
[process.env.JSDOM_PATH, 'jsdom'].forEach(function (p) {
  if (JSDOM || !p) return;
  try {
    const m = require(p.indexOf('/') >= 0 ? path.join(p, '') : p);
    JSDOM = m.JSDOM;
    VirtualConsole = m.VirtualConsole;
  } catch (e) { /* 继续尝试下一个位置 */ }
});

function available() { return !!JSDOM; }

function reasonUnavailable() {
  return '未找到 jsdom：请先 npm i（jsdom 在 devDependencies 里），或设置 JSDOM_PATH 指向其安装目录。';
}

function makeDom(srv, cookieStore, opts) {
  const url = (opts && opts.url) || 'http://localhost:5173/';
  const APP_JS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const COMMON_JS = fs.readFileSync(path.join(ROOT, 'public', 'common.js'), 'utf8');
  const FILL_JS = fs.readFileSync(path.join(ROOT, 'public', 'fill.js'), 'utf8');
  const LOGIC_JS = fs.readFileSync(path.join(ROOT, 'lib', 'logic.js'), 'utf8');
  const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

  function rawRequest(method, url, body) {
    return new Promise(function (resolve) {
      const { EventEmitter } = require('node:events');
      const req = new EventEmitter();
      req.method = method;
      req.url = url;
      req.headers = { host: 'localhost:5173', 'user-agent': 'jsdom-test' };
      req.socket = { remoteAddress: '127.0.0.1' };
      if (cookieStore.value) req.headers.cookie = cookieStore.value;
      const chunks = [];
      const res = {
        statusCode: 0,
        headers: {},
        writeHead: function (code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); },
        end: function (data) {
          if (data && data.length) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
          const buf = Buffer.concat(chunks);
          const sc = this.headers['Set-Cookie'];
          if (sc) {
            const m = sc.match(/msid=([^;]*)/);
            cookieStore.value = m && m[1] ? 'msid=' + m[1] : '';
          }
          resolve({ status: this.statusCode, headers: this.headers, text: buf.toString('utf8') });
        },
        on: function () { },
      };
      setTimeout(function () {
        if (body !== undefined) req.emit('data', Buffer.from(body));
        req.emit('end');
      }, 0);
      srv.handleRequest(req, res);
    });
  }

  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) {
    if (String(e.message).indexOf('Not implemented') < 0) console.log('   [jsdom] ' + e.message);
  });
  const dom = new JSDOM(INDEX_HTML, {
    url: url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.confirm = function () { return true; };
  w.alert = function () { };
  w.fetch = async function (p, o) {
    const opts = o || {};
    const r = await rawRequest(opts.method || 'GET', p, opts.body);
    return {
      ok: r.status >= 200 && r.status < 400,
      status: r.status,
      text: async function () { return r.text; },
      json: async function () { return JSON.parse(r.text); },
    };
  };
  if (w.HTMLCanvasElement && w.HTMLCanvasElement.prototype) w.HTMLCanvasElement.prototype.getContext = function () { return null; };
  // jsdom 不实现滚动：记录调用，供锚点定位断言
  w.__scrolls = [];
  w.Element.prototype.scrollIntoView = function (opt) { w.__scrolls.push({ id: this.id, opt: opt }); };
  // 与浏览器一致：共享模块 → common.js；/s/ 填写入口只加载 fill.js，其余加载 app.js（+ 懒加载的 fill.js）。
  // jsdom 的多次 eval 不共享顶层 const，所以所有脚本合并成一次 eval（等价于多个 <script>）。
  w.eval(LOGIC_JS);
  if (new URL(url).pathname.indexOf('/s/') === 0) {
    w.eval(COMMON_JS + '\n' + FILL_JS);
  } else {
    w.eval(COMMON_JS + '\n' + FILL_JS + '\n' + APP_JS);
  }
  return { dom: dom, w: w, d: w.document, css: CSS, rawRequest: rawRequest };
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms || 40); }); }

async function goto(app, hash) {
  app.w.location.hash = hash;
  app.w.dispatchEvent(new app.w.Event('hashchange'));
  await wait(260);
}

module.exports = {
  available: available, reasonUnavailable: reasonUnavailable, makeDom: makeDom, wait: wait, goto: goto,
  JSDOM: JSDOM, VirtualConsole: VirtualConsole,
};
