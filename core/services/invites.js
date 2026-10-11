'use strict';
/**
 * 邀请码服务：语义搬迁自 lib/db.js（randomInviteCode → refundInvite）
 * 与 server.js inviteUsable。consumeInvite 用 `used < max_uses` 条件更新做原子核销，
 * refundInvite 在账号没建成功时退回次数，避免误伤正常用户。
 */
const crypto = require('node:crypto');

function nowIso() { return new Date().toISOString(); }

/** 8 位人工可抄写的邀请码：去掉 I/O/0/1 等易混字符 */
function randomInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function normalizeInviteCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function inviteFromRow(r) {
  if (!r) return null;
  const maxUses = Number(r.max_uses) || 0;
  const used = Number(r.used) || 0;
  return {
    id: r.id,
    code: r.code,
    note: r.note || '',
    role: r.role === 'admin' ? 'admin' : 'user',
    maxUses: maxUses,
    used: used,
    remaining: Math.max(0, maxUses - used),
    expiresAt: r.expires_at || '',
    revoked: !!r.revoked,
    createdBy: r.created_by === undefined ? null : r.created_by,
    createdAt: r.created_at,
  };
}

/**
 * 成功返回 invite 对象本身（对齐测试与 Task 8 消费方式）；
 * 生成失败/撞码时抛带用户安全文案的 Error，由路由层转成 400。
 */
async function createInvite(db, data) {
  const o = data || {};
  let code = normalizeInviteCode(o.code);
  if (!code) {
    // 随机码可能撞库，重试几次再放弃
    for (let i = 0; i < 8 && !code; i += 1) {
      const c = randomInviteCode();
      const hit = await db.first('SELECT id FROM invite_codes WHERE code = ?', [c]);
      if (!hit) code = c;
    }
  }
  if (!code) throw new Error('邀请码生成失败，请重试');
  const dup = await db.first('SELECT id FROM invite_codes WHERE code = ?', [code]);
  if (dup) throw new Error('该邀请码已存在');
  const maxUses = Math.max(1, Math.min(10000, Number(o.maxUses) || 1));
  const info = await db.run(
    'INSERT INTO invite_codes(code,note,role,max_uses,used,expires_at,created_by,revoked,created_at) VALUES(?,?,?,?,0,?,?,0,?)',
    [code, String(o.note || '').trim(), o.role === 'admin' ? 'admin' : 'user',
      maxUses, o.expiresAt || '', o.createdBy || null, nowIso()]);
  return getInvite(db, info.lastInsertRowid);
}

async function getInvite(db, id) {
  return inviteFromRow(await db.first('SELECT * FROM invite_codes WHERE id = ?', [id]));
}

async function findInviteByCode(db, code) {
  const c = normalizeInviteCode(code);
  if (!c) return null;
  return inviteFromRow(await db.first('SELECT * FROM invite_codes WHERE code = ?', [c]));
}

async function listInvites(db) {
  const rows = await db.all('SELECT * FROM invite_codes ORDER BY id DESC', []);
  return rows.map(inviteFromRow);
}

async function updateInvite(db, id, patch) {
  const cur = await getInvite(db, id);
  if (!cur) return null;
  const next = Object.assign({}, cur, patch || {});
  await db.run('UPDATE invite_codes SET note=?, role=?, max_uses=?, expires_at=?, revoked=? WHERE id=?',
    [next.note, next.role === 'admin' ? 'admin' : 'user',
      Math.max(1, Math.min(10000, Number(next.maxUses) || 1)),
      next.expiresAt || '', next.revoked ? 1 : 0, id]);
  return getInvite(db, id);
}

/** 注册成功后扣一次；并发下用条件更新，避免同一码超额 */
async function consumeInvite(db, id) {
  const info = await db.run(
    'UPDATE invite_codes SET used = used + 1 WHERE id = ? AND revoked = 0 AND used < max_uses', [id]);
  return Number(info.changes) > 0;
}

/** 扣次后账号又没建成功时退回次数，避免误伤正常用户 */
async function refundInvite(db, id) {
  await db.run('UPDATE invite_codes SET used = used - 1 WHERE id = ? AND used > 0', [id]);
}

/** 邀请码是否仍然可用：未吊销、未过期、未超次（搬迁自 server.js inviteUsable） */
function inviteUsable(inv, now) {
  const ts = now || nowIso();
  if (!inv || inv.revoked) return { ok: false, error: '邀请码无效，请核对后重试' };
  if (inv.expiresAt && inv.expiresAt < ts) return { ok: false, error: '邀请码已过期，请联系管理员重新生成' };
  if (inv.used >= inv.maxUses) return { ok: false, error: '邀请码使用次数已用完，请联系管理员' };
  return { ok: true, invite: inv };
}

module.exports = {
  randomInviteCode, normalizeInviteCode, inviteFromRow, createInvite, getInvite,
  findInviteByCode, listInvites, updateInvite, consumeInvite, refundInvite, inviteUsable,
};
