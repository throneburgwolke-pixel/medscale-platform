'use strict';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
async function sha256Hex(s) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Buffer.from(bits).toString('hex');
}
function nowIso() { return new Date().toISOString(); }
async function createSession(db, tokenHash, info) {
  const i = info || {};
  const at = nowIso();
  const exp = new Date(Date.now() + (i.ttlMs === undefined ? SESSION_TTL_MS : i.ttlMs)).toISOString();
  await db.run(
    'INSERT INTO sessions(token_hash,user_id,admin,ip,created_at,last_seen,expires_at) VALUES(?,?,?,?,?,?,?)',
    [tokenHash, i.userId === undefined ? null : i.userId, i.admin ? 1 : 0, i.ip || '', at, at, exp]);
}
async function getSession(db, tokenHash) {
  if (!tokenHash) return null;
  const row = await db.first('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash]);
  if (!row) return null;
  if (!row.expires_at || row.expires_at <= nowIso()) { await deleteSession(db, tokenHash); return null; }
  return { userId: row.user_id, admin: row.admin, ip: row.ip, createdAt: row.created_at, lastSeen: row.last_seen, expiresAt: row.expires_at };
}
async function touchSession(db, tokenHash, lastSeen) {
  await db.run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', [lastSeen, tokenHash]);
}
async function deleteSession(db, tokenHash) {
  await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}
async function deleteSessionsOfUser(db, userId) {
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}
async function clearSessions(db) { await db.run('DELETE FROM sessions', []); }
async function purgeSessions(db, nowIsoStr) {
  await db.run('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= ?', [nowIsoStr || nowIso()]);
}
module.exports = { sha256Hex, createSession, getSession, touchSession, deleteSession, deleteSessionsOfUser, clearSessions, purgeSessions, SESSION_TTL_MS };
