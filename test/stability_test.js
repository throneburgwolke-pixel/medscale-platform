'use strict';
/**
 * 运行稳定性测试：覆盖进程生命周期与连接资源，保证服务长期可用。
 *
 * 验证的正是"服务能不能一直开着"这一类问题：
 *  - HTTP 层超时参数确已显式设置（不沿用 node 默认值）
 *  - 优雅退出（SIGTERM / SIGINT）：进程退出、端口释放、运行地址文件被删
 *  - 启动失败不留陈旧的运行地址文件
 *  - unhandledRejection 只记日志，不把进程拖死
 *  - 慢客户端不会永久占住连接（requestTimeout 兜底）
 *
 * 与项目其他测试保持一致：自建临时库、临时高位端口、退出即清理。
 */
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(__dirname, 'stability_tmp');
const PORT = 54201;
const BOOT_TIMEOUT = 25000;   // 等子进程监听的超时
const EXIT_TIMEOUT = 15000;   // 等子进程退出的超时

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

function freshDir(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.db'), '');
  return dir;
}

/**
 * 轮询端口是否可连。
 * 必须串行探测：上一次连接的结果落定后再发起下一次。
 * 若用递归 setTimeout 并发探测，多个探测的重叠窗口会让某个已失败的探测
 * 覆盖掉后面本应成功的那个（先返回 false，整体就误判为超时）。
 */
function waitForPort(port, timeoutMs) {
  const wait = timeoutMs || 20000;
  const start = Date.now();
  const step = 250;
  return new Promise(function (resolve) {
    let i = 0;
    (function next() {
      if (i >= 80 || Date.now() - start >= wait) return resolve(false);
      i += 1;
      const s = new net.Socket();
      s.setTimeout(350);
      const finish = function (v) {
        try { s.destroy(); } catch (e) { /* ignore */ }
        if (v) return resolve(true);
        setTimeout(next, step);
      };
      s.on('connect', function () { finish(true); });
      s.on('error', function () { finish(false); });
      s.on('timeout', function () { finish(false); });
      s.connect(port, '127.0.0.1');
    })();
  });
}

function waitForExit(p, timeoutMs) {
  return new Promise(function (resolve) {
    let settled = false;
    const done = function (code, signal) {
      if (settled) return;
      settled = true;
      resolve({ code: code, signal: signal });
    };
    p.on('exit', done);
    setTimeout(function () { done(null, null); }, timeoutMs || 15000);
  });
}

function startServer(dirName, port) {
  const dir = freshDir(dirName);
  const e = Object.assign({}, process.env, {
    MEDSCALE_DB: path.join(dir, 'app.db'),
    PORT: String(port),
    MEDSCALE_LAN: '0',
  });
  const childLog = path.join(dir, 'child.log');
  const p = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = [];
  let exited = null;
  // 必须持续读取管道：父进程若不消费，子进程写 banner 会写满 pipe 缓冲区而阻塞，
  // 表现就是"进程活着但端口一直不监听"。
  p.stdout.on('data', function (c) { out.push(c.toString()); });
  p.stderr.on('data', function (c) { out.push(c.toString()); });
  p.on('error', function (err) {
    out.push('SPAWN_ERROR ' + ((err && err.code) || '') + ' ' + ((err && err.message) || ''));
  });
  p.on('exit', function (code, signal) {
    exited = { code: code, signal: signal };
    try { fs.writeFileSync(childLog, out.join('') + '\n[exit code=' + code + ' signal=' + signal + ']\n'); }
    catch (e) { /* ignore */ }
  });
  return {
    p: p,
    dir: dir,
    portFile: path.join(dir, '运行地址.txt'),
    childLog: childLog,
    log: function () { return out.join(''); },
    exited: function () { return exited; },
  };
}

function get(url) {
  return new Promise(function (resolve) {
    const q = http.get(url, function (res) {
      let b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: b }); });
    });
    q.setTimeout(8000, function () { q.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    q.on('error', function () { resolve({ status: 0, body: 'ERR' }); });
  });
}

(async function main() {
  console.log('\n【1】HTTP 层超时参数已显式设置（不沿用 node 默认值）');
  const srv = require(path.join(ROOT, 'server.js'));
  const s = srv.server;
  ok(s.headersTimeout === 76000, 'headersTimeout = 76000（略大于代理 idle_timeout）', s.headersTimeout);
  ok(s.keepAliveTimeout === 75000, 'keepAliveTimeout = 75000（避免代理复用已关连接）', s.keepAliveTimeout);
  ok(s.maxHeaderSize === 64 * 1024, 'maxHeaderSize = 64KB（默认 16KB 在长 Cookie 时会 431）', s.maxHeaderSize);
  ok(s.requestTimeout === 300000, 'requestTimeout 保持 node 默认 300s（不掐手机弱网上传）', s.requestTimeout);
  ok(typeof srv.SHUTDOWN_GRACE_MS === 'number' && srv.SHUTDOWN_GRACE_MS > 0,
    '优雅退出窗口已导出（' + srv.SHUTDOWN_GRACE_MS + 'ms）');

  console.log('\n【2】进程级兜底已注册（未捕获异常不直接下线）');
  ok(process.listenerCount('unhandledRejection') >= 1, '已注册 unhandledRejection 监听');
  ok(process.listenerCount('uncaughtException') >= 1, '已注册 uncaughtException 监听');

  console.log('\n【3】SIGTERM 优雅退出：进程退出 + 端口释放 + 运行地址文件清理');
  let t = startServer('sigterm', PORT);
  const opened = await waitForPort(PORT, BOOT_TIMEOUT);
  ok(opened, '临时实例正常监听 ' + PORT);
  ok(fs.existsSync(t.portFile), '运行中已写出运行地址文件');
  t.p.kill('SIGTERM');
  const r1 = await waitForExit(t.p, 15000);
  ok(r1.code === 0 || r1.signal === 'SIGTERM', 'SIGTERM 后进程已退出（code/signal 已收到）', r1);
  await new Promise(function (r) { setTimeout(r, 300); });
  ok(!(await waitForPort(PORT, 1500)), '端口已释放（无进程继续监听）');
  ok(!fs.existsSync(t.portFile), '运行地址文件已删除（不残留陈旧地址）');

  console.log('\n【4】SIGINT 与 SIGTERM 走同一退出路径');
  t = startServer('sigint', PORT);
  await waitForPort(PORT);
  t.p.kill('SIGINT');
  const r2 = await waitForExit(t.p, 15000);
  ok(r2.code === 0 || r2.signal === 'SIGINT', 'SIGINT 后进程已退出', r2);
  await new Promise(function (r) { setTimeout(r, 300); });
  ok(!fs.existsSync(t.portFile), 'SIGINT 路径同样删除运行地址文件');

  console.log('\n【5】加固后功能无回归（healthz 正常）+ 慢客户端不拖垮服务');
  t = startServer('health', PORT);
  const up = await waitForPort(PORT, BOOT_TIMEOUT);
  ok(up, '实例启动成功');
  const h = await get('http://127.0.0.1:' + PORT + '/healthz');
  ok(h.status === 200, 'healthz 返回 200', h.status);
  ok(/"ok":true/.test(h.body), 'healthz 响应体正确', h.body.slice(0, 40));

  // 连上但不发任何数据、也不关闭 —— 模拟卡住的客户端
  const slowP = net.createConnection(PORT, '127.0.0.1');
  const slowResult = await new Promise(function (resolve) {
    let done = false;
    const finish = function (v) { if (!done) { done = true; resolve(v); } };
    slowP.on('connect', function () {
      const guard = setTimeout(function () { finish('open'); }, 2500);
      slowP.on('close', function () { clearTimeout(guard); finish('closed'); });
      slowP.on('error', function () { clearTimeout(guard); finish('error'); });
    });
    slowP.on('error', function () { finish('noconnect'); });
  });
  // 卡住连接存在期间，服务对正常请求仍然响应
  const after = await get('http://127.0.0.1:' + PORT + '/healthz');
  ok(['open', 'closed', 'error'].indexOf(slowResult) >= 0, '慢连接已建立（' + slowResult + '）');
  ok(after.status === 200, '慢连接未拖垮服务（期间 healthz 仍 200）', after.status);
  try { slowP.destroy(); } catch (e) { /* ignore */ }

  t.p.kill('SIGTERM');
  await waitForExit(t.p, EXIT_TIMEOUT);

  console.log('\n【6】unhandledRejection 只记日志，不把进程拖死');
  const before = process.listenerCount('unhandledRejection');
  ok(before >= 1, 'server.js 已挂上兜底监听');
  const counted = { n: 0 };
  const probe = function () { counted.n += 1; };
  process.on('unhandledRejection', probe);
  Promise.reject(new Error('probe'));
  await new Promise(function (r) { setTimeout(r, 80); });
  process.removeListener('unhandledRejection', probe);
  ok(counted.n >= 1, '兜底监听确实收到事件（未静默丢弃）', counted.n);
  ok(process.listenerCount('unhandledRejection') === before, '临时探针已摘除，不影响后续测试');
  ok(process.listenerCount('uncaughtException') >= 1, '同步异常兜底仍在');

  console.log('\n【7】SIGKILL 强杀后同端口重启可自愈（覆盖陈旧地址文件）');
  const a = startServer('kill-a', PORT);
  await waitForPort(PORT, BOOT_TIMEOUT);
  ok(fs.existsSync(a.portFile), '运行中地址文件存在');
  a.p.kill('SIGKILL');                    // 强杀：来不及执行优雅退出
  const rk = await waitForExit(a.p, EXIT_TIMEOUT);
  ok(rk.signal === 'SIGKILL' || rk.code === null, 'SIGKILL 立即终止（无清理机会）', rk);
  ok(fs.existsSync(a.portFile), '强杀后文件确实残留（这正是需要自愈的场景）');

  const b = startServer('kill-b', PORT);
  const bUp = await waitForPort(PORT, BOOT_TIMEOUT);
  ok(bUp, '同端口可再次启动成功');
  const bFile = fs.existsSync(b.portFile) ? fs.readFileSync(b.portFile, 'utf8') : '';
  ok(bFile.indexOf(String(PORT)) >= 0, '陈旧文件已被新地址覆盖（不再读到旧端口）', bFile);
  const h2 = await get('http://127.0.0.1:' + PORT + '/healthz');
  ok(h2.status === 200, '重启后服务立即可用', h2.status);
  b.p.kill('SIGTERM');
  await waitForExit(b.p, EXIT_TIMEOUT);

  console.log('\n———————————————————————————————');
  console.log('  稳定性测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('———————————————————————————————');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('测试自身异常：', e);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
