'use strict';
/**
 * D1 冷启动：灌入内置模板必须走 batch。
 * 目标：首启与后续冷启动的 D1 往返次数保持在个位数，避免触发 Workers 子请求上限。
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { createD1Backend } = require(path.join(__dirname, '..', 'lib', 'db-d1.js'));
const { TEMPLATES } = require(path.join(__dirname, '..', 'lib', 'scales.js'));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

/* D1 shim：统计真正发生往返的 first/all/run/batch/exec 调用次数 */
function makeD1(db, stats) {
  return {
    prepare(sql) {
      let params = [];
      const stmt = {
        bind() { params = Array.prototype.slice.call(arguments); return stmt; },
        async first() {
          stats.exec += 1;
          const r = db.prepare(sql).get.apply(db.prepare(sql), params);
          return r === undefined ? null : r;
        },
        async all() {
          stats.exec += 1;
          return { results: db.prepare(sql).all.apply(db.prepare(sql), params) };
        },
        async run() {
          stats.exec += 1;
          return { meta: stmt._raw() };
        },
        _raw() {
          const r = db.prepare(sql).run.apply(db.prepare(sql), params);
          return { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      stats.batch += 1;
      stats.exec += 1;
      db.exec('BEGIN');
      try {
        const out = stmts.map(function (s) { return s._raw(); });
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) { stats.exec += 1; return db.exec(sql); },
  };
}

(async function run() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'core', 'schema.sql'), 'utf8'));
  const stats = { exec: 0, batch: 0 };
  const backend = createD1Backend(makeD1(db, stats));

  console.log('\n【1】空库首启：模板 + 设置 + 管理员口令');
  await backend.init({ MEDSCALE_PASSWORD: 'test-password' });
  const count = db.prepare('SELECT COUNT(*) AS c FROM scales').get().c;
  ok(count === TEMPLATES.length, '内置模板全部灌入（' + TEMPLATES.length + ' 个）', count);
  const dup = db.prepare('SELECT code, COUNT(*) AS c FROM scales GROUP BY code HAVING c > 1').all();
  ok(dup.length === 0, '模板 code 无重复', dup);
  ok(backend.isAdminPasswordDefault && await backend.isAdminPasswordDefault(), '管理员初始口令标记已写入');
  ok(stats.batch >= 1, '播种使用 D1 batch', stats.batch);
  ok(stats.exec <= 8, '首启 D1 往返 ≤ 8 次', stats.exec);

  console.log('\n【2】已有数据再次冷启动：只做同步，不重复播种');
  const before = stats.exec;
  await backend.init({ MEDSCALE_PASSWORD: 'test-password' });
  const after = stats.exec;
  const count2 = db.prepare('SELECT COUNT(*) AS c FROM scales').get().c;
  ok(count2 === TEMPLATES.length, '二次初始化不重复插入模板', count2);
  ok(after - before <= 6, '二次初始化 D1 往返 ≤ 6 次', after - before);

  console.log('\n———————————————————————————————');
  console.log('  D1 初始化批处理：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('———————————————————————————————\n');
  process.exit(fail);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
