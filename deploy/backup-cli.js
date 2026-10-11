#!/usr/bin/env node
'use strict';
/**
 * 命令行快照工具 —— 供 systemd timer 每天自动调用。
 *
 * 设计要点：直接复用应用自己的备份实现（lib/db.js 的 createBackup），
 * 因此
 *   - 服务器上不需要额外装 sqlite3 命令行；
 *   - 快照走 VACUUM INTO，输出的是「已合并 WAL 的自包含单文件」，
 *     不会出现「拷了 app.db 却漏了 app.db-wal 导致数据不全」这种经典事故；
 *   - 格式与网页「系统设置 → 数据备份与恢复」里手动生成的完全一致，
 *     网页里能恢复的，这里也能恢复，反之亦然。
 *
 * 用法：
 *   node deploy/backup-cli.js                    # 打一份快照，保留全部
 *   node deploy/backup-cli.js --keep 30          # 打一份，并只保留最近 30 份
 *   node deploy/backup-cli.js --keep-days 90     # 打一份，并删掉 90 天前的
 *   node deploy/backup-cli.js --label nightly    # 文件名带标记，便于区分
 *   node deploy/backup-cli.js --list             # 只列出已有快照，不新建
 *   node deploy/backup-cli.js --verify <文件名>   # 校验某一份是否完整可用
 *
 * 退出码：0 成功；1 失败（systemd 会据此在 journal 里标红）。
 */

const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const dbm = require(path.join(ROOT, 'lib', 'db.js'));

const USAGE = [
  '用法：node deploy/backup-cli.js [选项]',
  '',
  '  --keep <N>         保留最近 N 份，其余的删掉',
  '  --keep-days <D>    删掉 D 天以前的快照',
  '  --label <文本>     给文件名加标记（例如 nightly）',
  '  --list             只列出已有快照，不新建',
  '  --verify <文件名>   校验某一份快照的完整性',
  '  --json             以 JSON 输出结果（给脚本消费）',
  '  -h, --help         显示本帮助',
].join('\n');

function parseArgs(argv) {
  const o = { keep: null, keepDays: null, label: '', list: false, verify: null, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--keep') { o.keep = Number(argv[++i]); }
    else if (a === '--keep-days') { o.keepDays = Number(argv[++i]); }
    else if (a === '--label') { o.label = String(argv[++i] || ''); }
    else if (a === '--list') { o.list = true; }
    else if (a === '--verify') { o.verify = String(argv[++i] || ''); }
    else if (a === '--json') { o.json = true; }
    else if (a === '-h' || a === '--help') { o.help = true; }
    else { throw new Error('无法识别的参数：' + a); }
  }
  if (o.keep !== null && (!Number.isInteger(o.keep) || o.keep < 1)) throw new Error('--keep 必须是 ≥1 的整数');
  if (o.keepDays !== null && (!Number.isFinite(o.keepDays) || o.keepDays < 1)) throw new Error('--keep-days 必须是 ≥1 的数字');
  if (o.keep !== null && o.keepDays !== null) throw new Error('--keep 与 --keep-days 只能选一个');
  return o;
}

function human(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return (i === 0 ? v : v.toFixed(1)) + ' ' + u[i];
}

/** 按保留策略挑出该删的快照。返回的文件名都经 backupFileOf 校验过，防止路径穿越。 */
function pickPrunable(backups, opt) {
  // listBackups() 已按 createdAt 倒序（最新在前）
  const sorted = backups.slice();
  if (opt.keep !== null) return sorted.slice(opt.keep);
  if (opt.keepDays !== null) {
    const cutoff = Date.now() - opt.keepDays * 24 * 60 * 60 * 1000;
    return sorted.filter(function (b) { return new Date(b.createdAt).getTime() < cutoff; });
  }
  return [];
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { console.log(USAGE); return 0; }

  if (opt.json) {
    // JSON 模式下把所有诊断信息压到 stderr，保证 stdout 只有一行 JSON
    console.log = function () {};
  }
  const say = function (line) { process.stderr.write(line + '\n'); };

  if (opt.verify) {
    const file = dbm.backupFileOf(opt.verify);
    if (!file) { say('✖ 找不到这份快照，或文件名不合法：' + opt.verify); return 1; }
    const info = dbm.inspectBackup(file);
    if (opt.json) { process.stdout.write(JSON.stringify({ action: 'verify', name: opt.verify, ok: !info.error, info: info }) + '\n'); }
    if (info.error) { say('✖ ' + info.error); return 1; }
    say('✔ ' + opt.verify + ' 完整可用（' + human(info.bytes) + '，sha256 ' + info.sha256.slice(0, 12) + '…）');
    return 0;
  }

  if (opt.list) {
    const backups = dbm.listBackups();
    if (opt.json) { process.stdout.write(JSON.stringify({ action: 'list', backups: backups }) + '\n'); return 0; }
    console.log('库文件：' + dbm.dbPath);
    console.log('快照目录：' + dbm.backupDir);
    if (!backups.length) { console.log('（还没有任何快照）'); return 0; }
    backups.forEach(function (b, i) {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + b.name + '  ' + human(b.bytes) + '  ' + b.createdAt);
    });
    return 0;
  }

  // ── 打一份新快照 ───────────────────────────────────────────────────────────
  const before = dbm.listBackups();
  let created;
  try {
    created = dbm.createBackup(opt.label || undefined);
  } catch (e) {
    say('✖ 生成快照失败：' + (e && e.message ? e.message : e));
    return 1;
  }

  // 策略兜底：即使 --keep 1，也绝不能把刚生成的那份删掉
  const prunable = pickPrunable(before.concat([{ name: created.name, createdAt: created.createdAt || new Date().toISOString(), bytes: created.bytes || 0 }])
    .sort(function (a, b) { return String(b.createdAt) < String(a.createdAt) ? -1 : 1; }), opt)
    .filter(function (b) { return b.name !== created.name; });

  const removed = [];
  prunable.forEach(function (b) {
    const file = dbm.backupFileOf(b.name);
    if (!file) return;                       // 名字不合法就不可能被删，静默跳过
    try { fs.unlinkSync(file); removed.push(b.name); }
    catch (e) { say('⚠ 删除旧快照失败（不影响本次备份）：' + b.name + ' → ' + e.message); }
  });

  const remain = dbm.listBackups();
  if (opt.json) {
    process.stdout.write(JSON.stringify({
      action: 'backup', created: created.name, bytes: created.bytes,
      integrity: created.integrity, sha256: created.sha256,
      removed: removed, total: remain.length,
    }) + '\n');
  } else {
    console.log('✔ 已生成快照：' + created.name);
    console.log('  大小：' + human(created.bytes) + '　完整性：' + created.integrity +
      '　sha256：' + String(created.sha256 || '').slice(0, 12) + '…');
    console.log('  目录：' + dbm.backupDir);
    if (removed.length) console.log('  按保留策略清理了 ' + removed.length + ' 份旧快照');
    console.log('  当前共 ' + remain.length + ' 份快照');
  }
  return 0;
}

let code = 1;
try {
  code = main();
} catch (e) {
  process.stderr.write('✖ ' + (e && e.message ? e.message : String(e)) + '\n');
  process.stderr.write(USAGE + '\n');
  code = 1;
}
try { dbm.db.close(); } catch (e) { /* ignore */ }
process.exit(code);
