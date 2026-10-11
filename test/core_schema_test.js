'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const ROOT = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(ROOT, 'core/schema.sql'), 'utf8');

console.log('\n【1】DDL 完整');
['users', 'scales', 'surveys', 'responses', 'studies', 'sessions', 'invite_codes', 'rate_limits', 'settings', 'audit_log']
  .forEach((tb) => t.ok(sql.includes('CREATE TABLE IF NOT EXISTS ' + tb), 'schema.sql 建表 ' + tb));
t.ok(/surveys[\s\S]*study_id/.test(sql) && /scales[\s\S]*owner_id/.test(sql) && /responses[\s\S]*subject_id/.test(sql),
  '原 migrateColumns 补的列已并入 DDL');

console.log('\n【2】能在裸库上直接建齐');
const mem = new DatabaseSync(':memory:');
mem.exec(sql);
const tables = mem.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
t.ok(tables.length >= 10, '空库执行 schema.sql 得到全部表', tables);
const cols = mem.prepare('PRAGMA table_info(surveys)').all().map((c) => c.name);
t.ok(cols.includes('study_id') && cols.includes('owner_id'), '新库 surveys 直接带 study_id/owner_id');

console.log('\n【3】lib/db.js 用同一份文件');
process.env.MEDSCALE_DB = path.join(__dirname, 'core_schema_test.db');
['', '-wal', '-shm'].forEach((s) => { const p = process.env.MEDSCALE_DB + s; if (fs.existsSync(p)) fs.unlinkSync(p); });
const dbm = require(path.join(ROOT, 'lib/db.js'));
t.ok(dbm.listScales().length > 0, '经 schema.sql 建库后内置量表照常 seed');
process.exit(t.done('核心 schema'));
