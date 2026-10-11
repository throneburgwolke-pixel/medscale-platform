'use strict';
/**
 * 启动端口策略测试：端口被占用时不得静默顺延（会让已发放的二维码/填写链接全部失效），
 * 必须以明确错误退出；仅允许「同端口回退到 127.0.0.1」这一种不改变 URL 的重试。
 */
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
process.env.MEDSCALE_DB = path.join(__dirname, 'port_test.db');
['', '-wal', '-shm'].forEach(function (s) {
  const p = process.env.MEDSCALE_DB + s;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

const srv = require(path.join(ROOT, 'server.js'));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

console.log('\n【1】端口占用策略 planListenRetry');
const exported = typeof srv.planListenRetry === 'function' ? srv.planListenRetry : function () { return null; };
const plan = exported;
ok(srv.planListenRetry === exported, 'server.js 导出 planListenRetry');

const st = { basePort: 5173, host: '0.0.0.0', triedLocalFallback: false };

const inUse = plan(Object.assign(new Error('listen EADDRINUSE: address already in use 0.0.0.0:5173'), { code: 'EADDRINUSE' }), st);
ok(inUse && inUse.fail, '端口被占用时判定为启动失败（不再顺延）', inUse);
ok(!inUse?.retry, '不返回任何重试端口', inUse);
ok(/5173/.test(inUse?.fail || ''), '失败信息包含被占用的端口号', inUse?.fail);
ok(/PORT/.test(inUse?.fail || ''), '失败信息提示可用 PORT= 指定端口', inUse?.fail);
ok(/已启动|占用|lsof/.test(inUse?.fail || ''), '失败信息说明原因并给出排查线索', inUse?.fail);

console.log('\n【2】权限错误的同端口回退');
const acc = plan(Object.assign(new Error('listen EACCES'), { code: 'EACCES' }), st);
ok(acc && acc.retry, 'EACCES 允许回退重试', acc);
ok(acc?.retry?.port === 5173, '回退保持端口不变（URL 不受影响）', acc?.retry);
ok(acc?.retry?.host === '127.0.0.1', '回退到 127.0.0.1', acc?.retry);

const accTwice = plan(Object.assign(new Error('listen EACCES'), { code: 'EACCES' }),
  { basePort: 5173, host: '0.0.0.0', triedLocalFallback: true });
ok(accTwice && accTwice.fail, '回退只发生一次，第二次直接失败', accTwice);

const perm = plan(Object.assign(new Error('listen EPERM'), { code: 'EPERM' }), st);
ok(perm && perm.retry, 'EPERM 同样允许一次回退', perm);

console.log('\n【3】其它错误');
const other = plan(Object.assign(new Error('boom'), { code: 'ENOTFOUND' }), st);
ok(other && other.fail, '未知错误直接失败', other);
ok(other && /boom/.test(other.fail), '未知错误保留原始信息', other?.fail);

console.log('\n【4】启动脚本不再宣传自动顺延');
const launcher = fs.readFileSync(path.join(ROOT, '启动平台.command'), 'utf8');
ok(!/自动顺延|自动改用/.test(launcher), '启动平台.command 移除"端口自动顺延"表述');
ok(/端口/.test(launcher), '启动脚本对端口问题仍有说明');

console.log('\n———————————————————————————————');
console.log('  端口策略：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('———————————————————————————————\n');
process.exit(fail ? 1 : 0);
