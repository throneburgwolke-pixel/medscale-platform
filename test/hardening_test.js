'use strict';
/**
 * 暴露面加固测试：默认只监听本机、注册默认关闭（仅首个账号可自助成为管理员）、
 * 登录/注册有失败限流、X-Forwarded-For 默认不可信、系统设置仅管理员可改。
 */
const path = require('node:path');
const http = require('./helpers/http.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'hardening_test.db');
http.freshDb(DB);
process.env.MEDSCALE_DB = DB;
delete process.env.MEDSCALE_LAN;
delete process.env.HOST;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();

// 未导出的函数一律返回 undefined，让断言以 FAIL 记录而不是抛异常中断
function call(name) {
  if (typeof srv[name] !== 'function') return undefined;
  return srv[name].apply(null, Array.prototype.slice.call(arguments, 1));
}

(async function run() {
  console.log('\n【1】默认只监听本机');
  t.ok(typeof srv.resolveHost === 'function', 'server.js 导出 resolveHost');
  t.ok(call('resolveHost', {}) === '127.0.0.1', '无任何环境变量时监听 127.0.0.1', call('resolveHost', {}));
  t.ok(call('resolveHost', { MEDSCALE_LAN: '1' }) === '0.0.0.0', 'MEDSCALE_LAN=1 时开放局域网');
  t.ok(call('resolveHost', { HOST: '0.0.0.0' }) === '0.0.0.0', '显式 HOST 生效');
  t.ok(call('resolveHost', { HOST: '192.168.1.9' }) === '192.168.1.9', '可绑定指定网卡地址');
  t.ok(call('resolveHost', { MEDSCALE_LAN: '0' }) === '127.0.0.1', 'MEDSCALE_LAN=0 不开放');

  console.log('\n【2】X-Forwarded-For 默认不可信');
  const req = { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: { remoteAddress: '127.0.0.1' } };
  t.ok(typeof srv.peerIp === 'function', 'server.js 导出 peerIp');
  t.ok(call('peerIp', req, false) === '127.0.0.1', '未开启代理信任时忽略 XFF', call('peerIp', req, false));
  t.ok(call('peerIp', req, true) === '203.0.113.9', '显式开启代理信任后采用 XFF', call('peerIp', req, true));
  const chained = { headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }, socket: { remoteAddress: '127.0.0.1' } };
  t.ok(call('peerIp', chained, true) === '198.51.100.7',
    '多级代理时取最右侧（可信代理追加的）地址，左侧客户端可伪造', call('peerIp', chained, true));

  console.log('\n【3】限流器行为');
  const lim = call('createRateLimiter');
  t.ok(typeof lim === 'function', 'server.js 导出 createRateLimiter');
  const bucket = lim || function () { return {}; };
  let allowedCount = 0;
  for (let i = 0; i < 10; i++) if (bucket('k', 5, 60000).allowed) allowedCount += 1;
  t.ok(allowedCount === 5, '窗口内只放行 max 次', allowedCount);
  const blocked = bucket('k', 5, 60000);
  t.ok(!blocked.allowed && blocked.retryAfterSec > 0, '超出后返回 retryAfterSec', blocked);
  t.ok(bucket('other-key', 5, 60000).allowed, '不同 key 互不影响');
  t.ok(bucket('k', 5, -1).allowed, '窗口过期后恢复放行');

  console.log('\n【4】注册默认关闭，仅首个账号自助开通');
  const anon = http.makeClient(srv);
  const s0 = await anon.request('GET', '/api/session');
  t.ok(s0.json?.allowRegister === true, '零用户时开放注册（用于创建首个管理员）', s0.json?.allowRegister);
  const r1 = await anon.request('POST', '/api/register', { username: 'firstadmin', password: 'pass1234', password2: 'pass1234' });
  t.ok(r1.status === 200 && r1.json?.user?.role === 'admin', '首个注册账号成为管理员', r1.json);
  const adminCli = http.makeClient(srv);
  await adminCli.request('POST', '/api/login', { username: 'firstadmin', password: 'pass1234' });

  const s1 = await http.makeClient(srv).request('GET', '/api/session');
  t.ok(s1.json?.allowRegister === false, '已有用户后注册默认关闭', s1.json?.allowRegister);
  const r2 = await http.makeClient(srv).request('POST', '/api/register', { username: 'intruder', password: 'pass1234', password2: 'pass1234' });
  t.ok(r2.status === 403, '注册关闭时后端直接拒绝（不依赖前端隐藏入口）', r2.status);
  t.ok(dbm.findUserByUsername('intruder') === null, '被关闭的注册不会落库');

  console.log('\n【5】管理员可开启注册');
  const st0 = await adminCli.request('GET', '/api/settings');
  t.ok(st0.status === 200, '管理员可读取设置', st0.status);
  t.ok(st0.json?.allowRegister === false, '设置接口回报当前注册开关', st0.json?.allowRegister);
  const tog = await adminCli.request('POST', '/api/settings', { allowRegister: true });
  t.ok(tog.status === 200, '管理员可切换注册开关', tog.json);
  const r3 = await http.makeClient(srv).request('POST', '/api/register', { username: 'colleague', password: 'pass1234', password2: 'pass1234' });
  t.ok(r3.status === 200 && r3.json?.user?.role === 'user', '开启后新注册账号是普通用户', r3.json);

  console.log('\n【6】系统设置仅管理员可改');
  const peer = http.makeClient(srv);
  await peer.request('POST', '/api/login', { username: 'colleague', password: 'pass1234' });
  const bad = await peer.request('POST', '/api/settings', { siteTitle: '劫持站点名' });
  t.ok(bad.status === 403, '普通用户改设置被拒', bad.status);
  const s2 = await http.makeClient(srv).request('GET', '/api/session');
  t.ok(s2.json?.siteTitle !== '劫持站点名', '站点名未被篡改', s2.json?.siteTitle);

  console.log('\n【7】登录失败限流（真实接口）');
  // 限流按「来源 + 目标账号」分桶：爆破某个账号不应把整台机器锁死
  const attacker = http.makeClient(srv);
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await attacker.request('POST', '/api/login', { username: 'ghostuser', password: 'guess-' + i });
    if (last.status === 429) break;
  }
  t.ok(last.status === 429, '对同一账号连续失败后返回 429', last.status);
  t.ok(Number(last.headers['Retry-After']) > 0, '429 带 Retry-After', last.headers['Retry-After']);
  const stillBlocked = await attacker.request('POST', '/api/login', { username: 'ghostuser', password: 'x' });
  t.ok(stillBlocked.status === 429, '被限流后继续拒绝', stillBlocked.status);
  const okOther = await adminCli.request('POST', '/api/login', { username: 'firstadmin', password: 'pass1234' });
  t.ok(okOther.status === 200, '其它账号不受该桶影响', okOther.status);
  const okAdminPw = await http.makeClient(srv).request('POST', '/api/login', { password: dbm.initialAdminPassword() });
  t.ok(okAdminPw.status === 200, '管理员口令登录是独立桶', okAdminPw.status);

  console.log('\n【8】服务端内部错误不原样回传');
  const { readFileSync } = require('node:fs');
  const serverSrc = readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  // 故意注册一个会抛出底层异常的接口，模拟真实故障（权限、磁盘、SQL 报错都会走到这里）
  srv.routes.push({
    method: 'GET', regex: /^\/api\/__boom$/, keys: [], auth: false,
    handler: function () { throw new Error('SqliteError: no such column: owner_id at /private/tmp/app.db'); },
  });
  const logged = [];
  const realError = console.error;
  console.error = function () { logged.push(Array.prototype.join.call(arguments, ' ')); };
  const boom = await http.makeClient(srv).request('GET', '/api/__boom');
  console.error = realError;
  t.ok(boom.status === 500, '未处理异常返回 500', boom.status);
  t.ok(!/SqliteError|owner_id|\/private\/tmp/.test(boom.text), '不把数据库报错与文件路径回传给浏览器', boom.text);
  t.ok(/稍后再试|联系|管理员/.test(boom.json.error || ''), '给出可行动的中文提示', boom.json.error);
  t.ok(/SqliteError/.test(logged.join('\n')), '细节完整写进服务端日志，排障不受影响', logged.join('\n').slice(0, 80));

  console.log('\n【9】请求地址解析');
  const qr = await http.makeClient(srv).request('GET', '/api/qr.png?text=%E6%B5%8B%E8%AF%95&scale=3');
  t.ok(qr.status === 200 && /image\/png/.test(qr.headers['Content-Type'] || ''), '查询参数中的中文能正常解析并出图', qr.status);
  const malformed = await http.makeClient(srv).request('GET', '/api/%E4%B8');
  t.ok(malformed.status === 400, '残缺的百分号编码被当作错误请求拒绝，而不是崩栈', malformed.status);
  t.ok(!/URI malformed/.test(malformed.text), '不把解码异常文字暴露给客户端', malformed.text.slice(0, 120));
  t.ok(/地址格式有误/.test(malformed.text), '给出中文说明', malformed.text.slice(0, 120));
  t.ok(!/url\.parse\(/.test(serverSrc), 'server.js 不再使用已废弃的 url.parse()');
  t.ok(/new URL\(/.test(serverSrc), '改用标准 URL 解析', 'no new URL()');

  process.exit(t.done('暴露面加固'));
})();
