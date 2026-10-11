'use strict';
/**
 * 数据备份与恢复测试：一键快照（带校验和与完整性检查）+ 可验证、可回退的恢复流程。
 * 备份是覆盖性操作，因此权限、坏文件、缺确认这三类拒绝路径与成功路径同等重要。
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('./helpers/http.js');
const dom = require('./helpers/dom.js');

const ROOT = path.join(__dirname, '..');
const DB = path.join(__dirname, 'backup_test.db');
const BAK = path.join(__dirname, 'backups');
http.freshDb(DB);
if (fs.existsSync(BAK)) fs.readdirSync(BAK).forEach(function (f) { try { fs.unlinkSync(path.join(BAK, f)); } catch (e) { /* ignore */ } });
process.env.MEDSCALE_DB = DB;

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const t = http.makeCounter();
const sha = function (buf) { return crypto.createHash('sha256').update(buf).digest('hex'); };

t.ok(dbm.dbPath === DB, '数据层报告真实生效的数据库路径', dbm.dbPath);
t.ok(dbm.backupDir === BAK, '备份目录与数据库同级，随部署位置走', dbm.backupDir);

const MINIMAL_SCALE = {
  category: '未分类',
  definition: { items: [{ id: 'q1', type: 'single', label: '题目一', options: [{ label: '是', score: 1 }, { label: '否', score: 0 }] }] },
};

(async function run() {
  const admin = http.makeClient(srv);

  console.log('\n【1】备份与恢复只对管理员开放');
  let r = await admin.request('POST', '/api/backup', {});
  t.ok(r.status === 401 || r.status === 403, '未登录不能生成备份', r.status);
  r = await admin.request('GET', '/api/backups');
  t.ok(r.status === 401 || r.status === 403, '未登录看不到备份列表', r.status);
  r = await admin.request('POST', '/api/restore', { name: 'x.sqlite', confirm: true });
  t.ok(r.status === 401 || r.status === 403, '未登录不能恢复', r.status);

  r = await admin.request('POST', '/api/register', { username: 'dr_backup', password: 'test123456', password2: 'test123456' });
  t.ok(r.status === 200, '创建管理员账号', r.status);

  console.log('\n【2】一键备份：生成快照并给出校验和');
  r = await admin.request('POST', '/api/backup', {});
  t.ok(r.status === 200, '备份成功', r.status);
  const b1 = r.json || {};
  t.ok(/^medscale-[\dTZ-]+.*\.sqlite$/.test(b1.name || ''), '备份文件名带时间戳', b1.name);
  t.ok(/^[0-9a-f]{64}$/.test(b1.sha256 || ''), '返回 sha256 校验和', b1.sha256);
  t.ok(b1.bytes > 0, '返回快照大小', b1.bytes);
  t.ok(b1.integrity === 'ok', '快照通过 PRAGMA integrity_check', b1.integrity);
  t.ok((b1.tables || {}).scales > 0, '快照里量表数据不为空', b1.tables);
  const snapPath = path.join(BAK, b1.name || 'none');
  t.ok(fs.existsSync(snapPath), '快照写入数据库同级的 backups 目录');
  const raw = fs.existsSync(snapPath) ? fs.readFileSync(snapPath) : Buffer.alloc(0);
  t.ok(sha(raw) === b1.sha256, '落盘文件与返回校验和一致');
  t.ok(raw.slice(0, 15).toString('utf8') === 'SQLite format 3', '快照本身是合法 SQLite 文件');

  console.log('\n【3】备份可列出、可下载，且不接受越界路径');
  r = await admin.request('GET', '/api/backups');
  const items = (r.json || {}).items || [];
  t.ok(r.status === 200 && items.some(function (i) { return i.name === b1.name; }), '列表里能看到刚生成的备份', items.length);
  r = await admin.request('GET', '/api/backups/' + encodeURIComponent(b1.name));
  t.ok(r.status === 200, '备份可下载', r.status);
  t.ok(/^attachment/.test(r.headers['Content-Disposition'] || ''), '以下载附件方式返回', r.headers['Content-Disposition']);
  t.ok(sha(r.buf) === b1.sha256, '下载内容与校验和一致');
  r = await admin.request('GET', '/api/backups/' + encodeURIComponent('../../etc/passwd'));
  t.ok(r.status === 400 || r.status === 404, '路径穿越被拒绝', r.status);

  console.log('\n【4】按快照恢复：回滚备份之后的改动，并自动留下安全备份');
  const made = await admin.request('POST', '/api/scales', { scale: Object.assign({}, MINIMAL_SCALE, { title: '恢复前新建', code: 'bak-new' }) });
  t.ok(made.status === 200, '备份之后新增一份数据', made.status);
  r = await admin.request('POST', '/api/restore', { name: b1.name, confirm: true });
  t.ok(r.status === 200, '按快照名恢复成功', r.json);
  t.ok(/pre-restore/.test((r.json || {}).preRestore || ''), '恢复前先自动备份当前数据', r.json);
  let sess = await admin.request('GET', '/api/session');
  t.ok(!sess.json || sess.json.authenticated !== true, '恢复后强制重新登录', sess.json);
  await admin.request('POST', '/api/login', { username: 'dr_backup', password: 'test123456' });
  const scales = await admin.request('GET', '/api/scales');
  const titles = ((scales.json || {}).items || []).map(function (s) { return s.title; });
  t.ok(titles.indexOf('恢复前新建') < 0, '备份后新增的数据被回滚掉', titles.slice(0, 5));
  const after = await admin.request('GET', '/api/backups');
  t.ok(((after.json || {}).items || []).some(function (i) { return i.name === r.json.preRestore; }), '安全备份进入备份列表');

  console.log('\n【5】坏快照必须被拒绝，且不伤及现有数据');
  fs.mkdirSync(BAK, { recursive: true });
  fs.writeFileSync(path.join(BAK, 'medscale-broken.sqlite'), 'this is not a database file');
  r = await admin.request('POST', '/api/restore', { name: 'medscale-broken.sqlite', confirm: true });
  t.ok(r.status === 400, '非 SQLite 文件被拒绝', r.status);
  t.ok(/不是有效|损坏|无法打开|校验/.test((r.json || {}).error || ''), '给出可读原因', r.json);
  r = await admin.request('POST', '/api/restore', { name: '../../etc/passwd', confirm: true });
  t.ok(r.status === 400, '越界文件名被拒绝', r.status);
  sess = await admin.request('GET', '/api/session');
  t.ok(sess.json && sess.json.authenticated === true, '恢复失败时不动现有数据', sess.json);
  r = await admin.request('POST', '/api/restore', { name: b1.name, sha256: '0'.repeat(64), confirm: true });
  t.ok(r.status === 400, '校验和不匹配时拒绝恢复', r.status);
  r = await admin.request('POST', '/api/restore', { name: b1.name });
  t.ok(r.status === 400, '未明确确认时不执行覆盖', r.status);

  console.log('\n【6】支持上传本地下载的备份文件恢复（换机 / 误删场景）');
  r = await admin.request('POST', '/api/restore', {
    filename: 'medscale-local.sqlite', data: raw.toString('base64'), sha256: b1.sha256, confirm: true,
  });
  t.ok(r.status === 200, '上传备份文件可恢复', r.json);
  await admin.request('POST', '/api/login', { username: 'dr_backup', password: 'test123456' });
  const back = await admin.request('GET', '/api/scales');
  t.ok(((back.json || {}).items || []).length > 0, '上传恢复后数据可读');

  console.log('\n【7】恢复早期版本的快照时自动补齐新表（升级后不能靠重建库）');
  const { DatabaseSync } = require('node:sqlite');
  const legacy = Buffer.from(raw);
  const legacyPath = path.join(BAK, 'medscale-legacy.sqlite');
  fs.writeFileSync(legacyPath, legacy);
  const probe = new DatabaseSync(legacyPath);
  probe.exec('DROP TABLE IF EXISTS invite_codes');
  probe.close();
  const legacyBuf = fs.readFileSync(legacyPath);
  t.ok(sha(legacyBuf) !== sha(raw), '构造出的早期快照确实少了新表');
  r = await admin.request('POST', '/api/restore', {
    filename: 'medscale-legacy.sqlite', data: legacyBuf.toString('base64'), sha256: sha(legacyBuf), confirm: true,
  });
  t.ok(r.status === 200, '早期快照可恢复', r.json);
  t.ok(!!dbm.db.prepare("SELECT name FROM sqlite_master WHERE name = 'invite_codes'").get(), '恢复后补齐了新增表');
  await admin.request('POST', '/api/login', { username: 'dr_backup', password: 'test123456' });
  const legacyInvite = await admin.request('POST', '/api/invites', { note: '老快照恢复后发码', maxUses: 1 });
  t.ok(legacyInvite.status === 200 && (legacyInvite.json.invite || {}).code, '恢复后邀请码功能立即可用', legacyInvite.json);
  fs.unlinkSync(legacyPath);

  console.log('\n【8】系统设置里有备份与恢复入口');
  if (!dom.available()) {
    console.log('  跳过界面部分：' + dom.reasonUnavailable());
  } else {
    const app = dom.makeDom(srv, admin.cookieStore);
    await dom.wait(320);
    await dom.goto(app, '#/settings');
    await dom.wait(520);
    t.ok(!!app.d.getElementById('btn-backup'), '提供「生成备份」按钮');
    t.ok(!!app.d.getElementById('backup-list'), '展示备份历史');
    t.ok(!!app.d.getElementById('restore-file'), '提供备份文件上传入口');
    t.ok(!!app.d.getElementById('restore-confirm'), '恢复前需要勾选确认');
    const btnRestore = app.d.getElementById('btn-restore');
    t.ok(!!btnRestore && btnRestore.disabled === true, '未选文件未确认时恢复按钮禁用', btnRestore && btnRestore.disabled);
    t.ok(/覆盖|不可逆|无法撤销/.test(app.d.body.textContent), '界面向用户说明恢复会覆盖现有数据');
    app.d.getElementById('btn-backup').click();
    await dom.wait(1200);
    const result = app.d.getElementById('backup-result');
    t.ok(!!result && /校验/.test(result.textContent), '备份完成后界面显示校验和', result && result.textContent.slice(0, 80));
    t.ok(!!app.d.querySelector('#backup-list a[href^="/api/backups/"]'), '备份历史给出下载链接');
    const shaEl = result.querySelector('.sha');
    t.ok(!!shaEl && /^[0-9a-f]{64}$/.test(shaEl.textContent.trim()), '校验和完整展示给用户核对', shaEl && shaEl.textContent.trim().slice(0, 20));
    t.ok(/\.sha\s*\{[^}]*word-break/.test(app.css), '长校验和可折行，不会撑破卡片', app.css.indexOf('.sha'));
  }

  process.exit(t.done('备份与恢复'));
})();
