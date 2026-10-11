'use strict';
/**
 * 浏览器级检查的共用支撑。
 * - playwright 是可选依赖：没装就跳过，不再写死某台机器上的目录；
 * - 需要真实 HTTP 服务的脚本自己拉起一个临时库 + 随机可用端口的实例，
 *   避免依赖"同事已经启动了服务"，也避免把测试数据写进正式库。
 */
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

/** 解析 chromium：优先 PLAYWRIGHT_PATH 指定的安装目录，其次是 devDependencies 里的 playwright */
function resolveChromium() {
  let chromium = null;
  [process.env.PLAYWRIGHT_PATH, 'playwright'].forEach(function (spec) {
    if (chromium || !spec) return;
    try {
      const target = spec.indexOf('/') >= 0 ? path.join(spec, 'playwright') : spec;
      chromium = require(target).chromium;
    } catch (e) { /* 继续尝试下一个位置 */ }
  });
  return chromium;
}

function skipReason() {
  return '未找到 playwright。如需运行浏览器级检查：npm i && npx playwright install chromium';
}

function freePort() {
  return new Promise(function (resolve, reject) {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', function () {
      const port = probe.address().port;
      probe.close(function () { resolve(port); });
    });
  });
}

function fetchJson(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(text)); } catch (e) { reject(new Error('非 JSON 响应：' + text.slice(0, 80))); }
      });
    }).on('error', reject);
  });
}

/**
 * 用独立数据库拉起一个服务端实例，等待它就绪。
 * @returns {Promise<{base: string, port: number, dbPath: string, stop: function}>}
 */
async function startTempServer(dbPath) {
  const port = await freePort();
  const addrFile = path.join(path.dirname(dbPath), '运行地址.txt');
  ['-wal', '-shm'].forEach(function (suffix) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(addrFile)) fs.unlinkSync(addrFile);
  const pwFile = path.join(path.dirname(dbPath), '管理员初始口令.txt');
  if (fs.existsSync(pwFile)) fs.unlinkSync(pwFile);
  const env = Object.assign({}, process.env, { PORT: String(port), MEDSCALE_DB: dbPath });
  delete env.MEDSCALE_LAN; delete env.HOST;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: env, stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.killed) throw new Error('临时实例意外退出');
    try {
      const s = await fetchJson(base + '/api/session');
      if (s && typeof s.authenticated === 'boolean') break;
    } catch (e) {
      if (Date.now() > deadline) throw new Error('临时实例 15 秒内未就绪：' + e.message);
    }
    await new Promise(function (r) { setTimeout(r, 120); });
  }
  return {
    base: base, port: port, dbPath: dbPath,
    stop: function () {
      return new Promise(function (resolve) {
        child.removeAllListeners('exit');
        child.once('exit', function () {
          if (fs.existsSync(addrFile)) fs.unlinkSync(addrFile);
          resolve();
        });
        child.kill('SIGTERM');
        setTimeout(function () { if (!child.killed) child.kill('SIGKILL'); }, 2000);
      });
    },
  };
}

/** chromium.launch 的可执行文件覆盖：默认用 playwright 自带的浏览器，不再指向个人缓存目录 */
function executablePath() {
  return process.env.PLAYWRIGHT_EXEC || undefined;
}

module.exports = {
  resolveChromium: resolveChromium,
  skipReason: skipReason,
  startTempServer: startTempServer,
  fetchJson: fetchJson,
  freePort: freePort,
  executablePath: executablePath,
};
