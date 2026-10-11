'use strict';
/** node:sqlite（同步）→ core 统一 async 接口；SQLITE_BUSY 线性退避重试（对齐 lib/db.js withWriteRetry） */
const WRITE_ATTEMPTS = 5;

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isBusy(e) {
  if (!e) return false;
  if (e.code === 'SQLITE_BUSY') return true;
  return /database is locked|SQLITE_BUSY/i.test(String(e.errstr || e.message || ''));
}

function createSqliteAdapter(dbsync, opts) {
  const o = opts || {};
  async function attempt(fn) {
    for (let i = 0; i < WRITE_ATTEMPTS; i += 1) {
      try { if (o.onRun) o.onRun(); return fn(); }
      catch (e) { if (!isBusy(e) || i === WRITE_ATTEMPTS - 1) throw e; await delay(20 * (i + 1)); }
    }
    throw new Error('unreachable');
  }
  return {
    async first(sql, params) { const r = dbsync.prepare(sql).get(...(params || [])); return r === undefined ? null : r; },
    async all(sql, params) { return dbsync.prepare(sql).all(...(params || [])); },
    async run(sql, params) {
      return attempt(() => {
        const info = dbsync.prepare(sql).run(...(params || []));
        return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
      });
    },
    async exec(sql) { dbsync.exec(sql); },
    async batch(sqlList) {
      return attempt(() => {
        dbsync.exec('BEGIN');
        try { sqlList.forEach((s) => dbsync.exec(s)); dbsync.exec('COMMIT'); }
        catch (e) { try { dbsync.exec('ROLLBACK'); } catch (_) { /* 已回滚 */ } throw e; }
      });
    },
  };
}

module.exports = { createSqliteAdapter };
