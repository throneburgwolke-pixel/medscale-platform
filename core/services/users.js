'use strict';
/**
 * 用户服务：语义搬迁自 lib/db.js（userFromRow/createUser/getUser/findUserByUsername/
 * loginUser/listUsers/updateUser/countUsers），同步 dbm.* 换成统一 async db 适配器。
 * 口令哈希仍走 Task 2 kdf.hashScryptSync（既有 hex(salt16):hex(hash32) scrypt 格式），
 * 库里已有的存量哈希保持可校验，不改存储格式。
 */
const kdf = require('../kdf.js');

function nowIso() { return new Date().toISOString(); }

function userFromRow(r) {
  if (!r) return null;
  return {
    id: r.id, username: r.username, name: r.name || '', org: r.org || '',
    role: r.role || 'user', status: r.status || 'active',
    createdAt: r.created_at, lastLogin: r.last_login,
  };
}

async function createUser(db, data) {
  const username = String(data.username || '').trim();
  const dup = await db.first('SELECT id FROM users WHERE username = ?', [username]);
  if (dup) return { ok: false, error: '该用户名已被注册' };
  const info = await db.run(
    'INSERT INTO users(username,name,org,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?,?)',
    [
      username,
      String(data.name || '').trim(),
      String(data.org || '').trim(),
      kdf.hashScryptSync(data.password),
      data.role === 'admin' ? 'admin' : 'user',
      'active',
      nowIso(),
    ]);
  return { ok: true, user: await getUser(db, info.lastInsertRowid) };
}

async function getUser(db, id) {
  return userFromRow(await db.first('SELECT * FROM users WHERE id = ?', [id]));
}

/** 附带 passwordHash 仅供登录校验内部使用，绝不可直接回给客户端 */
async function findUserByUsername(db, username) {
  const row = await db.first('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
  return row ? Object.assign(userFromRow(row), { passwordHash: row.password_hash }) : null;
}

async function loginUser(db, id) {
  await db.run('UPDATE users SET last_login = ? WHERE id = ?', [nowIso(), id]);
}

async function listUsers(db) {
  const rows = await db.all('SELECT * FROM users ORDER BY id', []);
  return rows.map(userFromRow);
}

async function updateUser(db, id, patch) {
  const u = await getUser(db, id);
  if (!u) return null;
  const next = Object.assign({}, u, patch || {});
  await db.run('UPDATE users SET name=?, org=?, role=?, status=? WHERE id=?',
    [next.name, next.org, next.role, next.status, id]);
  if (patch && patch.password) {
    await db.run('UPDATE users SET password_hash=? WHERE id=?', [kdf.hashScryptSync(patch.password), id]);
  }
  return getUser(db, id);
}

async function countUsers(db) {
  const row = await db.first('SELECT COUNT(*) AS c FROM users', []);
  return row ? row.c : 0;
}

module.exports = {
  userFromRow, createUser, getUser, findUserByUsername,
  loginUser, listUsers, updateUser, countUsers,
};
