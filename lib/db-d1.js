'use strict';
/**
 * 数据层：Cloudflare D1（边缘 SQLite，异步）实现。
 * 与 lib/db.js（node:sqlite 同步版）保持【相同的导出函数名与返回结构】，
 * 仅内部用 D1 的异步 API。server.js 在 Worker 模式下调 setBackend(d1backend) 切换。
 *
 * 差异点：
 *  - 密码哈希改用 Web Crypto PBKDF2（node:crypto 的 scryptSync 在 Workers 不可用）。
 *  - 文件备份/恢复在边缘端无文件系统，统一返回“本部署不支持”（数据可在 D1 控制台导出）。
 *  - 事务用顺序 await 近似（D1 单租户串行写，低并发内部工具可接受）。
 */
const crypto = require('node:crypto');
const { TEMPLATES } = require('./scales.js');
const { scoreResponse } = require('./scoring.js');
const { settlePending } = require('./logic.js');

/* ---------------- PBKDF2 口令哈希 ----------------
   用 Web Crypto 的【异步】crypto.subtle.deriveBits：Workers 原生支持、不计入免费档 10ms CPU 预算。
   （Node 的同步 crypto.pbkdf2Sync(12万次) 会让 Worker CPU 超限被强杀 → 请求挂起 → 前端一直“加载中”。） */
const PBKDF2_ITERS = 100000; // Cloudflare Web Crypto 上限：PBKDF2 迭代次数 > 100000 会报 "Pbkdf2 failed"，故取 100000
const __te = new TextEncoder();
function __hexToBytes(hex) {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
async function __pbkdf2Hex(password, saltHex, iters) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', __te.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: __hexToBytes(saltHex), iterations: iters }, key, 256);
  return Buffer.from(bits).toString('hex');
}
async function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const derived = await __pbkdf2Hex(password, salt, PBKDF2_ITERS);
  return 'pbkdf2$' + salt + '$' + derived;
}
async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const salt = parts[1];
  const expected = parts[2];
  const derived = await __pbkdf2Hex(password, salt, PBKDF2_ITERS);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(derived, 'hex');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function createD1Backend(DB) {
  const q = function (sql, params) { return params ? DB.prepare(sql).bind.apply(DB.prepare(sql), params) : DB.prepare(sql); };
  const run = async function (sql, params) {
    const r = await DB.prepare(sql).bind.apply(DB.prepare(sql), params || []).run();
    return { changes: Number((r && r.meta && r.meta.changes) || 0), lastInsertRowid: Number((r && r.meta && r.meta.last_row_id) || 0) };
  };
  const get = async function (sql, params) {
    const r = await DB.prepare(sql).bind.apply(DB.prepare(sql), params || []).first();
    return r === undefined ? null : r;
  };
  const all = async function (sql, params) {
    const r = await DB.prepare(sql).bind.apply(DB.prepare(sql), params || []).all();
    return (r && r.results) || [];
  };
  async function exec(sql) { return DB.exec(sql); }

  function now() { return new Date().toISOString(); }
  function randomToken(n) {
    const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(n || 10);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  /* ---------------- 设置 / 审计 ---------------- */
  async function getSetting(key, fallback) {
    const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : fallback;
  }
  async function setSetting(key, value) {
    await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
  }
  async function log(action, detail) {
    await run('INSERT INTO audit_log(at,action,detail) VALUES(?,?,?)', [now(), action, detail || '']);
  }

  /* ---------------- 量表 ---------------- */
  function definitionOf(row) {
    const def = JSON.parse(row.definition);
    return { items: def.items || [], dimensions: def.dimensions || [], scoring: def.scoring || { method: 'none' },
      pages: def.pages || null, usage: def.usage || null, licenseTier: def.licenseTier || null, rater: def.rater || 'self' };
  }
  function pickDefinition(t) {
    const inner = t && t.definition ? t.definition : {};
    return settlePending({
      items: t.items || inner.items || [],
      dimensions: t.dimensions || inner.dimensions || [],
      scoring: t.scoring || inner.scoring || { method: 'none' },
      pages: t.pages || inner.pages || null,
      usage: t.usage || inner.usage || null,
      licenseTier: t.licenseTier || inner.licenseTier || null,
      rater: t.rater || inner.rater || 'self',
    });
  }
  function scaleFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, code: row.code, title: row.title, category: row.category, description: row.description,
      instructions: row.instructions, source: row.source, license: row.license, tags: JSON.parse(row.tags || '[]'),
      isTemplate: !!row.is_template, isBuiltin: !!row.is_builtin, consentOn: !!row.consent_on, consentText: row.consent_text,
      anonymous: !!row.anonymous, definition: definitionOf(row), ownerId: row.owner_id === undefined ? null : row.owner_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }
  function insertScaleStatement(t, opts) {
    const o = opts || {};
    const definition = JSON.stringify(pickDefinition(t));
    return DB.prepare(`INSERT INTO scales(code,title,category,description,instructions,source,license,tags,
        is_template,is_builtin,consent_on,consent_text,anonymous,definition,created_at,updated_at,owner_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(t.code || randomToken(8), t.title || '未命名量表', t.category || '未分类', t.description || '', t.instructions || '',
        t.source || '', t.license || '', JSON.stringify(t.tags || []), o.isTemplate ? 1 : 0, o.isBuiltin ? 1 : 0,
        t.consentOn ? 1 : 0, t.consentText || '', t.anonymous === false ? 0 : 1, definition, now(), now(), o.ownerId || null);
  }
  function updateScaleStatement(id, t) {
    const definition = JSON.stringify(pickDefinition(t));
    return DB.prepare(`UPDATE scales SET title=?, category=?, description=?, instructions=?, source=?, license=?,
        tags=?, consent_on=?, consent_text=?, anonymous=?, definition=?, updated_at=? WHERE id=?`)
      .bind(t.title || '未命名量表', t.category || '未分类', t.description || '', t.instructions || '', t.source || '', t.license || '',
        JSON.stringify(t.tags || []), t.consentOn ? 1 : 0, t.consentText || '', t.anonymous === false ? 0 : 1, definition, now(), id);
  }
  async function insertScale(t, opts) {
    const info = await insertScaleStatement(t, opts).run();
    return getScale(Number((info && info.meta && info.meta.last_row_id) || 0));
  }
  async function listScales() {
    const rows = await all('SELECT * FROM scales ORDER BY is_template DESC, category, id');
    return rows.map(scaleFromRow);
  }
  async function getScale(id) { return scaleFromRow(await get('SELECT * FROM scales WHERE id = ?', [id])); }
  async function updateScale(id, t) {
    await updateScaleStatement(id, t).run();
    return getScale(id);
  }
  async function deleteScale(id) {
    const used = await get('SELECT COUNT(*) AS c FROM surveys WHERE scale_id = ?', [id]);
    if (used && used.c > 0) return { ok: false, message: '该量表已有发布的调查，不能删除。' };
    await run('DELETE FROM scales WHERE id = ?', [id]);
    return { ok: true };
  }

  /* ---------------- 发布与答卷 ---------------- */
  function surveyFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, scaleId: row.scale_id, token: row.token, name: row.name, status: row.status, anonymous: !!row.anonymous,
      maxResponses: row.max_responses, closesAt: row.closes_at, showResult: !!row.show_result, collectMeta: !!row.collect_meta,
      createdAt: row.created_at, note: row.note, studyId: row.study_id, wave: row.wave, waveLabel: row.wave_label,
      subjectMode: row.subject_mode || 'none', ownerId: row.owner_id === undefined ? null : row.owner_id,
    };
  }
  async function listSurveys() {
    const rows = await all(`SELECT s.*, sc.title AS scale_title,
        (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) AS response_count
      FROM surveys s JOIN scales sc ON sc.id = s.scale_id ORDER BY s.id DESC`);
    return rows.map(function (r) { const s = surveyFromRow(r); s.scaleTitle = r.scale_title; s.responseCount = r.response_count; return s; });
  }
  async function getSurvey(id) {
    const row = await get(`SELECT s.*, sc.title AS scale_title FROM surveys s JOIN scales sc ON sc.id = s.scale_id WHERE s.id = ?`, [id]);
    if (!row) return null; const s = surveyFromRow(row); s.scaleTitle = row.scale_title; return s;
  }
  async function getSurveyByToken(token) { return surveyFromRow(await get('SELECT * FROM surveys WHERE token = ?', [token])); }
  async function createSurvey(scaleId, opts) {
    const o = opts || {};
    const token = randomToken(9);
    const info = await run(`INSERT INTO surveys(scale_id,token,name,status,anonymous,max_responses,closes_at,show_result,collect_meta,created_at,note,owner_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [scaleId, token, o.name || '未命名调查', 'open', o.anonymous === false ? 0 : 1, o.maxResponses || null, o.closesAt || null,
        o.showResult ? 1 : 0, o.collectMeta === false ? 0 : 1, now(), o.note || '', o.ownerId || null]);
    return getSurvey(Number(info.lastInsertRowid));
  }
  async function updateSurvey(id, patch) {
    const s = await getSurvey(id);
    if (!s) return null;
    const next = Object.assign({}, s, patch);
    await run(`UPDATE surveys SET name=?, status=?, anonymous=?, max_responses=?, closes_at=?, show_result=?, collect_meta=?, note=?
      WHERE id=?`,
      [next.name, next.status, next.anonymous ? 1 : 0, next.maxResponses || null, next.closesAt || null, next.showResult ? 1 : 0,
        next.collectMeta ? 1 : 0, next.note || '', id]);
    return getSurvey(id);
  }
  async function deleteSurvey(id) {
    await run('DELETE FROM responses WHERE survey_id = ?', [id]);
    await run('DELETE FROM surveys WHERE id = ?', [id]);
    return { ok: true };
  }
  async function surveyState(survey) {
    const count = (await get('SELECT COUNT(*) AS c FROM responses WHERE survey_id = ?', [survey.id])).c;
    if (survey.status !== 'open') return { open: false, reason: '该调查已关闭。', count: count };
    if (survey.closesAt && new Date(survey.closesAt).getTime() < Date.now()) return { open: false, reason: '该调查已超过截止时间。', count: count };
    if (survey.maxResponses && count >= survey.maxResponses) return { open: false, reason: '该调查已达到预定样本量，停止回收。', count: count };
    return { open: true, count: count };
  }
  async function saveResponse(survey, scale, payload) {
    const answers = payload.answers || {};
    const scores = scoreResponse(scale.definition, answers);
    const pid = payload.pid || randomToken(8);
    const info = await run(`INSERT INTO responses(survey_id,pid,answers,scores,duration_sec,consent,meta,started_at,submitted_at,subject_id)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [survey.id, pid, JSON.stringify(answers), JSON.stringify(scores), payload.durationSec || null, payload.consent ? 1 : 0,
        JSON.stringify(payload.meta || {}), payload.startedAt || null, now(), payload.subjectId || null]);
    return { id: Number(info.lastInsertRowid), pid: pid, scores: scores, subjectId: payload.subjectId || null };
  }
  async function listResponses(surveyId) {
    const rows = await all('SELECT * FROM responses WHERE survey_id = ? ORDER BY id', [surveyId]);
    return rows.map(function (r) {
      return { id: r.id, pid: r.pid, answers: JSON.parse(r.answers), scores: JSON.parse(r.scores || '{}'), durationSec: r.duration_sec,
        consent: !!r.consent, meta: JSON.parse(r.meta || '{}'), submittedAt: r.submitted_at, subjectId: r.subject_id || null };
    });
  }

  /* ---------------- 随访研究 ---------------- */
  function studyFromRow(row) {
    if (!row) return null;
    return { id: row.id, name: row.name, scaleId: row.scale_id, subjectMode: row.subject_mode, note: row.note, createdAt: row.created_at,
      ownerId: row.owner_id === undefined ? null : row.owner_id };
  }
  async function createStudy(scaleId, opts) {
    const o = opts || {};
    const waves = (o.waves && o.waves.length) ? o.waves : [{ label: '基线' }];
    const info = await run('INSERT INTO studies(name,scale_id,subject_mode,note,created_at,owner_id) VALUES(?,?,?,?,?,?)',
      [o.name || '随访研究', scaleId, o.subjectMode === 'self' ? 'self' : 'auto', o.note || '', now(), o.ownerId || null]);
    const studyId = Number(info.lastInsertRowid);
    const surveys = [];
    for (let i = 0; i < waves.length; i += 1) {
      const w = waves[i];
      const s = await createSurvey(scaleId, { name: (o.name || '随访研究') + ' · ' + (w.label || ('第' + (i + 1) + '次')),
        anonymous: o.subjectMode !== 'self', showResult: o.showResult, collectMeta: o.collectMeta, note: w.note || o.note || '', ownerId: o.ownerId });
      await run('UPDATE surveys SET study_id=?, wave=?, wave_label=?, subject_mode=? WHERE id=?',
        [studyId, i + 1, w.label || ('第' + (i + 1) + '次'), o.subjectMode === 'self' ? 'self' : 'auto', s.id]);
      surveys.push(await getSurvey(s.id));
    }
    return { study: await getStudy(studyId), surveys: surveys };
  }
  async function listStudies() {
    const rows = await all(`SELECT st.*, sc.title AS scale_title,
        (SELECT COUNT(*) FROM surveys s WHERE s.study_id = st.id) AS wave_count,
        (SELECT COUNT(*) FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.study_id = st.id) AS response_count
      FROM studies st JOIN scales sc ON sc.id = st.scale_id ORDER BY st.id DESC`);
    return rows.map(function (r) { const st = studyFromRow(r); st.scaleTitle = r.scale_title; st.waveCount = r.wave_count; st.responseCount = r.response_count; return st; });
  }
  async function getStudy(id) {
    const row = await get(`SELECT st.*, sc.title AS scale_title FROM studies st JOIN scales sc ON sc.id = st.scale_id WHERE st.id = ?`, [id]);
    if (!row) return null;
    const st = studyFromRow(row); st.scaleTitle = row.scale_title;
    const waveRows = await all('SELECT * FROM surveys WHERE study_id = ? ORDER BY wave', [id]);
    const waves = [];
    for (let i = 0; i < waveRows.length; i += 1) {
      const r = waveRows[i];
      const s = surveyFromRow(r);
      s.responseCount = (await get('SELECT COUNT(*) AS c FROM responses WHERE survey_id = ?', [s.id])).c;
      s.subjectCount = (await get('SELECT COUNT(DISTINCT subject_id) AS c FROM responses WHERE survey_id = ? AND subject_id IS NOT NULL', [s.id])).c;
      waves.push(s);
    }
    st.waves = waves;
    return st;
  }
  async function deleteStudy(id) {
    const waves = await all('SELECT id FROM surveys WHERE study_id = ?', [id]);
    for (let i = 0; i < waves.length; i += 1) {
      await run('DELETE FROM responses WHERE survey_id = ?', [waves[i].id]);
      await run('DELETE FROM surveys WHERE id = ?', [waves[i].id]);
    }
    await run('DELETE FROM studies WHERE id = ?', [id]);
    return { ok: true };
  }
  async function findResponseBySubject(surveyId, subjectId) {
    if (!subjectId) return null;
    return (await get('SELECT id, pid, submitted_at FROM responses WHERE survey_id = ? AND subject_id = ? LIMIT 1', [surveyId, subjectId])) || null;
  }
  async function nextSubjectCode(studyId) {
    const row = await get(`SELECT COUNT(DISTINCT r.subject_id) AS c FROM responses r
        JOIN surveys s ON s.id = r.survey_id WHERE s.study_id = ? AND r.subject_id IS NOT NULL`, [studyId]);
    return 'S-' + String((row ? row.c : 0) + 1).padStart(4, '0');
  }

  /* ---------------- 用户 ---------------- */
  function userFromRow(r) {
    if (!r) return null;
    return { id: r.id, username: r.username, name: r.name || '', org: r.org || '', role: r.role || 'user', status: r.status || 'active',
      createdAt: r.created_at, lastLogin: r.last_login };
  }
  async function createUser(data) {
    const username = String(data.username || '').trim();
    if (await get('SELECT id FROM users WHERE username = ?', [username])) return { ok: false, error: '该用户名已被注册' };
    const info = await run('INSERT INTO users(username,name,org,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?,?)',
      [username, String(data.name || '').trim(), String(data.org || '').trim(), await hashPassword(data.password),
        data.role === 'admin' ? 'admin' : 'user', 'active', now()]);
    return { ok: true, user: await getUser(Number(info.lastInsertRowid)) };
  }
  async function getUser(id) { return userFromRow(await get('SELECT * FROM users WHERE id = ?', [id])); }
  async function findUserByUsername(username) {
    const row = await get('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
    return row ? Object.assign(userFromRow(row), { passwordHash: row.password_hash }) : null;
  }
  async function loginUser(id) { await run('UPDATE users SET last_login = ? WHERE id = ?', [now(), id]); }
  async function listUsers() { return (await all('SELECT * FROM users ORDER BY id')).map(userFromRow); }
  async function updateUser(id, patch) {
    const u = await getUser(id);
    if (!u) return null;
    const next = Object.assign({}, u, patch || {});
    await run('UPDATE users SET name=?, org=?, role=?, status=? WHERE id=?', [next.name, next.org, next.role, next.status, id]);
    if (patch && patch.password) await run('UPDATE users SET password_hash=? WHERE id=?', [await hashPassword(patch.password), id]);
    return getUser(id);
  }
  async function countUsers() { return (await get('SELECT COUNT(*) AS c FROM users')).c; }

  /* ---------------- 邀请码 ---------------- */
  function randomInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  function normalizeInviteCode(code) { return String(code || '').trim().toUpperCase().replace(/\s+/g, ''); }
  function inviteFromRow(r) {
    if (!r) return null;
    const maxUses = Number(r.max_uses) || 0;
    const used = Number(r.used) || 0;
    return { id: r.id, code: r.code, note: r.note || '', role: r.role === 'admin' ? 'admin' : 'user', maxUses: maxUses, used: used,
      remaining: Math.max(0, maxUses - used), expiresAt: r.expires_at || '', revoked: !!r.revoked,
      createdBy: r.created_by === undefined ? null : r.created_by, createdAt: r.created_at };
  }
  async function createInvite(data) {
    const o = data || {};
    let code = normalizeInviteCode(o.code);
    if (!code) { for (let i = 0; i < 8 && !code; i += 1) { const c = randomInviteCode(); if (!(await get('SELECT id FROM invite_codes WHERE code = ?', [c]))) code = c; } }
    if (!code) return { ok: false, error: '邀请码生成失败，请重试' };
    if (await get('SELECT id FROM invite_codes WHERE code = ?', [code])) return { ok: false, error: '该邀请码已存在' };
    const maxUses = Math.max(1, Math.min(10000, Number(o.maxUses) || 1));
    const info = await run(`INSERT INTO invite_codes(code,note,role,max_uses,used,expires_at,created_by,revoked,created_at)
        VALUES(?,?,?,?,0,?,?,0,?)`,
      [code, String(o.note || '').trim(), o.role === 'admin' ? 'admin' : 'user', maxUses, o.expiresAt || '', o.createdBy || null, now()]);
    return { ok: true, invite: await getInvite(Number(info.lastInsertRowid)) };
  }
  async function getInvite(id) { return inviteFromRow(await get('SELECT * FROM invite_codes WHERE id = ?', [id])); }
  async function findInviteByCode(code) {
    const c = normalizeInviteCode(code);
    if (!c) return null;
    return inviteFromRow(await get('SELECT * FROM invite_codes WHERE code = ?', [c]));
  }
  async function listInvites() { return (await all('SELECT * FROM invite_codes ORDER BY id DESC')).map(inviteFromRow); }
  async function updateInvite(id, patch) {
    const cur = await getInvite(id);
    if (!cur) return null;
    const next = Object.assign({}, cur, patch || {});
    await run('UPDATE invite_codes SET note=?, role=?, max_uses=?, expires_at=?, revoked=? WHERE id=?',
      [next.note, next.role === 'admin' ? 'admin' : 'user', Math.max(1, Math.min(10000, Number(next.maxUses) || 1)), next.expiresAt || '', next.revoked ? 1 : 0, id]);
    return getInvite(id);
  }
  async function consumeInvite(id) {
    const r = await run('UPDATE invite_codes SET used = used + 1 WHERE id = ? AND revoked = 0 AND used < max_uses', [id]);
    return Number(r.changes) > 0;
  }
  async function refundInvite(id) { await run('UPDATE invite_codes SET used = used - 1 WHERE id = ? AND used > 0', [id]); }

  /* ---------------- 会话 ---------------- */
  const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  function sessionFromRow(row) {
    if (!row) return null;
    return { tokenHash: row.token_hash, userId: row.user_id === null ? null : row.user_id, admin: row.admin === 1 || row.admin === true,
      createdAt: row.created_at, lastSeen: row.last_seen, expiresAt: row.expires_at };
  }
  async function createSession(tokenHash, info) {
    const ts = now();
    const expires = new Date(Date.now() + (info.ttlMs || SESSION_TTL_MS)).toISOString();
    await run('INSERT INTO sessions (token_hash, user_id, admin, ip, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?,?)',
      [tokenHash, info.userId == null ? null : info.userId, info.admin ? 1 : 0, info.ip || '', ts, ts, expires]);
    return { tokenHash: tokenHash, userId: info.userId == null ? null : info.userId, admin: !!info.admin, expiresAt: expires };
  }
  async function getSession(tokenHash) { return sessionFromRow(await get('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash])); }
  async function touchSession(tokenHash, lastSeen) { await run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', [lastSeen, tokenHash]); }
  async function deleteSession(tokenHash) { await run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]); }
  async function deleteSessionsOfUser(userId) { await run('DELETE FROM sessions WHERE user_id = ?', [userId]); }
  async function clearSessions() { await run('DELETE FROM sessions'); }
  async function purgeSessions() { const r = await run('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ?', [now()]); return Number(r.changes || 0); }

  /* ---------------- 限流 ---------------- */
  async function getRateLimit(key) {
    const row = await get('SELECT key, first, n FROM rate_limits WHERE key = ?', [key]);
    return row ? { key: row.key, first: Number(row.first), n: Number(row.n) } : null;
  }
  async function setRateLimit(key, first, n) {
    await run('INSERT INTO rate_limits (key, first, n) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET first = excluded.first, n = excluded.n', [key, first, n]);
  }
  async function clearRateLimit(key) { await run('DELETE FROM rate_limits WHERE key = ?', [key]); }
  async function purgeRateLimits(beforeMs) { const r = await run('DELETE FROM rate_limits WHERE first < ?', [Number(beforeMs)]); return Number(r.changes || 0); }

  /* ---------------- 管理员口令 ---------------- */
  const ADMIN_HASH_KEY = 'admin_password_hash';
  const ADMIN_INITIAL_KEY = 'admin_password_initial';
  async function checkAdminPassword(password) { return await verifyPassword(String(password == null ? '' : password), await getSetting(ADMIN_HASH_KEY, '')); }
  async function setAdminPassword(password) { await setSetting(ADMIN_HASH_KEY, await hashPassword(String(password))); await setSetting(ADMIN_INITIAL_KEY, ''); }
  async function isAdminPasswordDefault() { return (await getSetting(ADMIN_INITIAL_KEY, '')) === '1'; }
  function generateInitialPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(16);
    let out = '';
    for (let i = 0; i < 16; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  /**
   * 初始化管理员口令（边缘端无文件）：优先 MEDSCALE_PASSWORD 环境变量；否则生成随机口令并写进设置，
   * 管理员可在「系统设置」查看到初始口令提示——但更稳妥的是部署时设置 MEDSCALE_PASSWORD。
   */
  async function ensureAdminPasswordHash(env) {
    const stored = await getSetting(ADMIN_HASH_KEY, '');
    if (/^pbkdf2\$[0-9a-f]+\$[0-9a-f]{32,}$/.test(stored)) return;
    const initial = env && env.MEDSCALE_PASSWORD ? env.MEDSCALE_PASSWORD : generateInitialPassword();
    await setSetting(ADMIN_HASH_KEY, await hashPassword(initial));
    await setSetting(ADMIN_INITIAL_KEY, '1');
    console.log('\n  [D1] 管理员初始口令：' + initial + '（建议部署时设置 MEDSCALE_PASSWORD 环境变量，或登录后立即修改）');
  }

  /* ---------------- 种子（内置模板 + 管理员口令） ---------------- */
  /** 一次 batch 完成全部模板与首启记录：冷启动只有个位数 D1 往返 */
  async function seedTemplates() {
    const stmts = TEMPLATES.map(function (t) { return insertScaleStatement(t, { isTemplate: true, isBuiltin: true }); });
    stmts.push(DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('site_title', '医学量表与问卷平台'));
    stmts.push(DB.prepare('INSERT INTO audit_log(at,action,detail) VALUES(?,?,?)')
      .bind(now(), 'seed', '内置模板初始化 ' + TEMPLATES.length + ' 个'));
    await DB.batch(stmts);
  }
  async function syncTemplates() {
    const rows = await all('SELECT id, code FROM scales WHERE is_builtin = 1');
    const usedRows = await all('SELECT DISTINCT scale_id FROM surveys');
    const byCode = new Map(rows.map(function (r) { return [r.code, r.id]; }));
    const usedIds = new Set(usedRows.map(function (r) { return Number(r.scale_id); }));
    const stmts = [];
    let added = 0, updated = 0;
    for (let i = 0; i < TEMPLATES.length; i += 1) {
      const t = TEMPLATES[i];
      const id = byCode.get(t.code);
      if (!id) { stmts.push(insertScaleStatement(t, { isTemplate: true, isBuiltin: true })); added += 1; continue; }
      if (usedIds.has(Number(id))) continue;
      stmts.push(updateScaleStatement(id, t)); updated += 1;
    }
    if (stmts.length) await DB.batch(stmts);
    if (added || updated) await log('template_sync', '内置模板同步：新增 ' + added + ' 个、更新 ' + updated + ' 个');
  }
  async function init(env) {
    const count = (await get('SELECT COUNT(*) AS c FROM scales')).c;
    if (count === 0) {
      await seedTemplates();
      await ensureAdminPasswordHash(env);
      return; // 新库的模板已是最新，无需再跑一轮同步
    }
    await ensureAdminPasswordHash(env);
    await syncTemplates();
  }

  /* ---------------- 备份/恢复（边缘端无文件系统，降级） ---------------- */
  const UNSUPPORTED = { ok: false, error: '本部署（Cloudflare D1）不支持本地文件备份，请在 D1 控制台导出数据。' };
  const backupApi = {
    createBackup: async function () { return UNSUPPORTED; },
    listBackups: async function () { return []; },
    backupFileOf: function () { return null; },
    inspectBackup: async function () { return UNSUPPORTED; },
    restoreBackup: async function () { return UNSUPPORTED; },
    restoreFromBuffer: async function () { return UNSUPPORTED; },
  };

  return {
    // 标记
    backend: 'd1',
    SESSION_TTL_MS: SESSION_TTL_MS,
    // 原语
    now: now,
    randomToken: randomToken,
    getSetting: getSetting, setSetting: setSetting, log: log,
    // 量表
    listScales: listScales, getScale: getScale, insertScale: insertScale, updateScale: updateScale, deleteScale: deleteScale,
    // 发布/答卷
    listSurveys: listSurveys, getSurvey: getSurvey, getSurveyByToken: getSurveyByToken, createSurvey: createSurvey,
    updateSurvey: updateSurvey, deleteSurvey: deleteSurvey, surveyState: surveyState, saveResponse: saveResponse, listResponses: listResponses,
    // 研究
    createStudy: createStudy, listStudies: listStudies, getStudy: getStudy, deleteStudy: deleteStudy,
    findResponseBySubject: findResponseBySubject, nextSubjectCode: nextSubjectCode,
    // 用户
    createUser: createUser, getUser: getUser, findUserByUsername: findUserByUsername, loginUser: loginUser,
    verifyPassword: verifyPassword, hashPassword: hashPassword, listUsers: listUsers, updateUser: updateUser, countUsers: countUsers,
    // 邀请码
    randomInviteCode: randomInviteCode, normalizeInviteCode: normalizeInviteCode, createInvite: createInvite, getInvite: getInvite,
    findInviteByCode: findInviteByCode, listInvites: listInvites, updateInvite: updateInvite, consumeInvite: consumeInvite, refundInvite: refundInvite,
    // 会话
    createSession: createSession, getSession: getSession, touchSession: touchSession, deleteSession: deleteSession,
    deleteSessionsOfUser: deleteSessionsOfUser, clearSessions: clearSessions, purgeSessions: purgeSessions,
    // 限流
    getRateLimit: getRateLimit, setRateLimit: setRateLimit, clearRateLimit: clearRateLimit, purgeRateLimits: purgeRateLimits,
    // 管理员口令
    ensureAdminPasswordHash: ensureAdminPasswordHash, checkAdminPassword: checkAdminPassword, setAdminPassword: setAdminPassword,
    isAdminPasswordDefault: isAdminPasswordDefault, generateInitialPassword: generateInitialPassword,
    // 种子
    init: init,
    // 备份（降级）
    createBackup: backupApi.createBackup, listBackups: backupApi.listBackups, backupFileOf: backupApi.backupFileOf,
    inspectBackup: backupApi.inspectBackup, restoreBackup: backupApi.restoreBackup, restoreFromBuffer: backupApi.restoreFromBuffer,
  };
}

module.exports = { createD1Backend: createD1Backend };
