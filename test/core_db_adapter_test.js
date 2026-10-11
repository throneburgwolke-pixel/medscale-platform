'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const { createSqliteAdapter } = require(path.join(__dirname, '..', 'core', 'db', 'sqlite-adapter.js'));

(async function () {
  const mem = new DatabaseSync(':memory:');
  mem.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
  const db = createSqliteAdapter(mem);

  console.log('\n【1】基本读写');
  const r1 = await db.run('INSERT INTO t(name) VALUES(?)', ['a']);
  t.ok(r1.lastInsertRowid === 1 && r1.changes === 1, 'run 返回 lastInsertRowid/changes', r1);
  await db.run('INSERT INTO t(name) VALUES(?)', ['b']);
  const row = await db.first('SELECT * FROM t WHERE name = ?', ['b']);
  t.ok(row && row.id === 2, 'first 命中单行', row);
  t.ok((await db.first('SELECT * FROM t WHERE name = ?', ['zz'])) === null, 'first 未命中返回 null');
  const rows = await db.all('SELECT * FROM t ORDER BY id');
  t.ok(rows.length === 2 && rows[0].name === 'a', 'all 返回全部行', rows);

  console.log('\n【2】exec 与 batch 事务');
  await db.exec('CREATE TABLE u (id INTEGER PRIMARY KEY, v TEXT)');
  await db.batch(["INSERT INTO u(id,v) VALUES(1,'x')", "INSERT INTO u(id,v) VALUES(2,'y')"]);
  t.ok((await db.all('SELECT * FROM u')).length === 2, 'batch 顺序执行');
  let threw = false;
  try { await db.batch(["INSERT INTO u(id,v) VALUES(3,'z')", 'INSERT INTO u(id,v) VALUES(3,?)']); } catch (e) { threw = true; }
  t.ok(threw, 'batch 中失败会抛错');
  t.ok((await db.first('SELECT COUNT(*) c FROM u')).c === 2, 'batch 失败整体回滚，无半提交');

  console.log('\n【3】写冲突重试');
  let calls = 0;
  const flaky = createSqliteAdapter(mem, {
    onRun: () => { calls += 1; if (calls < 3) { const e = new Error('busy'); e.code = 'SQLITE_BUSY'; throw e; } },
  });
  const r2 = await flaky.run('INSERT INTO t(name) VALUES(?)', ['c']);
  t.ok(calls === 3 && r2.lastInsertRowid === 3, 'SQLITE_BUSY 自动重试到成功', { calls, r2 });

  let calls2 = 0;
  const flaky2 = createSqliteAdapter(mem, {
    onRun: () => { calls2 += 1; if (calls2 < 3) { throw new Error('database is locked'); } },
  });
  const r3 = await flaky2.run('INSERT INTO t(name) VALUES(?)', ['d']);
  t.ok(calls2 === 3 && r3.lastInsertRowid === 4, 'database is locked 文本同样触发重试', { calls2, r3 });

  process.exit(t.done('核心 DB 适配器'));
})();
