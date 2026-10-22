'use strict';
/**
 * 数据层：node:sqlite 内置数据库（零依赖）
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { TEMPLATES } = require('./scales.js');
const { scoreResponse } = require('./scoring.js');
const { settlePending } = require('./logic.js');
const kdf = require('../core/kdf.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.MEDSCALE_DB || path.join(DATA_DIR, 'app.db');
/** 备份与数据库放在同一目录：换部署位置时快照跟着数据走，不会散落到仓库里 */
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
let db = new DatabaseSync(DB_PATH);
/**
 * 多进程共用一个库文件时，写冲突是常态而不是异常：
 * busy_timeout 让 SQLite 自己等锁，剩下的偶发 SQLITE_BUSY 交给 withWriteRetry 重试。
 */
const BUSY_TIMEOUT_MS = 5000;
function applyPragmas() {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = ' + BUSY_TIMEOUT_MS);
  db.exec('PRAGMA foreign_keys = ON');
}
applyPragmas();

/** DDL 单一来源：core/schema.sql（Node 与 Workers/D1 共用同一份文件） */
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'core', 'schema.sql'), 'utf8');

/** 建表与补列：启动时执行一次；从备份恢复后对旧文件再执行一次 */
function ensureSchema() {
  db.exec(SCHEMA);
  migrateColumns();
}

/* 兼容旧数据库：按需补充字段 */
function migrateColumns() {
  const has = function (table, col) {
    return db.prepare('PRAGMA table_info(' + table + ')').all().some(function (c) { return c.name === col; });
  };
  if (!has('surveys', 'study_id')) db.exec('ALTER TABLE surveys ADD COLUMN study_id INTEGER');
  if (!has('surveys', 'wave')) db.exec('ALTER TABLE surveys ADD COLUMN wave INTEGER');
  if (!has('surveys', 'wave_label')) db.exec('ALTER TABLE surveys ADD COLUMN wave_label TEXT');
  if (!has('surveys', 'subject_mode')) db.exec("ALTER TABLE surveys ADD COLUMN subject_mode TEXT DEFAULT 'none'");
  if (!has('responses', 'subject_id')) db.exec('ALTER TABLE responses ADD COLUMN subject_id TEXT');
  if (!has('scales', 'owner_id')) db.exec('ALTER TABLE scales ADD COLUMN owner_id INTEGER');
  if (!has('surveys', 'owner_id')) db.exec('ALTER TABLE surveys ADD COLUMN owner_id INTEGER');
  if (!has('studies', 'owner_id')) db.exec('ALTER TABLE studies ADD COLUMN owner_id INTEGER');
}

ensureSchema();

function now() {
  return new Date().toISOString();
}

function randomToken(n) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(n || 10);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function log(action, detail) {
  db.prepare('INSERT INTO audit_log(at,action,detail) VALUES(?,?,?)').run(now(), action, detail || '');
}

/* ---------------- 量表 ---------------- */

function definitionOf(row) {
  const def = JSON.parse(row.definition);
  return {
    items: def.items || [],
    dimensions: def.dimensions || [],
    scoring: def.scoring || { method: 'none' },
    pages: def.pages || null,
    usage: def.usage || null,
    licenseTier: def.licenseTier || null,
    rater: def.rater || 'self',
  };
}

/** 兼容两种输入结构：模板的扁平结构 {items,dimensions,scoring} 与数据库对象的 {definition:{...}} */
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
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    description: row.description,
    instructions: row.instructions,
    source: row.source,
    license: row.license,
    tags: JSON.parse(row.tags || '[]'),
    isTemplate: !!row.is_template,
    isBuiltin: !!row.is_builtin,
    consentOn: !!row.consent_on,
    consentText: row.consent_text,
    anonymous: !!row.anonymous,
    definition: definitionOf(row),
    ownerId: row.owner_id === undefined ? null : row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function insertScale(t, opts) {
  const o = opts || {};
  const definition = JSON.stringify(pickDefinition(t));
  const stmt = db.prepare(`
    INSERT INTO scales(code,title,category,description,instructions,source,license,tags,
      is_template,is_builtin,consent_on,consent_text,anonymous,definition,created_at,updated_at,owner_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const info = stmt.run(
    t.code || randomToken(8),
    t.title || '未命名量表',
    t.category || '未分类',
    t.description || '',
    t.instructions || '',
    t.source || '',
    t.license || '',
    JSON.stringify(t.tags || []),
    o.isTemplate ? 1 : 0,
    o.isBuiltin ? 1 : 0,
    t.consentOn ? 1 : 0,
    t.consentText || '',
    t.anonymous === false ? 0 : 1,
    definition,
    now(),
    now(),
    o.ownerId || null
  );
  return Number(info.lastInsertRowid);
}

function listScales() {
  const rows = db.prepare('SELECT * FROM scales ORDER BY is_template DESC, category, id').all();
  return rows.map(scaleFromRow);
}

function getScale(id) {
  return scaleFromRow(db.prepare('SELECT * FROM scales WHERE id = ?').get(id));
}

function updateScale(id, t) {
  const definition = JSON.stringify(pickDefinition(t));
  db.prepare(`
    UPDATE scales SET title=?, category=?, description=?, instructions=?, source=?, license=?,
      tags=?, consent_on=?, consent_text=?, anonymous=?, definition=?, updated_at=? WHERE id=?
  `).run(
    t.title || '未命名量表',
    t.category || '未分类',
    t.description || '',
    t.instructions || '',
    t.source || '',
    t.license || '',
    JSON.stringify(t.tags || []),
    t.consentOn ? 1 : 0,
    t.consentText || '',
    t.anonymous === false ? 0 : 1,
    definition,
    now(),
    id
  );
  return getScale(id);
}

function deleteScale(id) {
  const used = db.prepare('SELECT COUNT(*) AS c FROM surveys WHERE scale_id = ?').get(id);
  if (used && used.c > 0) return { ok: false, message: '该量表已有发布的调查，不能删除。' };
  db.prepare('DELETE FROM scales WHERE id = ?').run(id);
  return { ok: true };
}

/* ---------------- 发布与答卷 ---------------- */

function surveyFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    scaleId: row.scale_id,
    token: row.token,
    name: row.name,
    status: row.status,
    anonymous: !!row.anonymous,
    maxResponses: row.max_responses,
    closesAt: row.closes_at,
    showResult: !!row.show_result,
    collectMeta: !!row.collect_meta,
    createdAt: row.created_at,
    note: row.note,
    studyId: row.study_id,
    wave: row.wave,
    waveLabel: row.wave_label,
    subjectMode: row.subject_mode || 'none',
    ownerId: row.owner_id === undefined ? null : row.owner_id,
  };
}

function listSurveys() {
  const rows = db.prepare(`
    SELECT s.*, sc.title AS scale_title,
      (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) AS response_count
    FROM surveys s JOIN scales sc ON sc.id = s.scale_id
    ORDER BY s.id DESC
  `).all();
  return rows.map(function (r) {
    const s = surveyFromRow(r);
    s.scaleTitle = r.scale_title;
    s.responseCount = r.response_count;
    return s;
  });
}

function getSurvey(id) {
  const row = db.prepare(`
    SELECT s.*, sc.title AS scale_title FROM surveys s JOIN scales sc ON sc.id = s.scale_id WHERE s.id = ?
  `).get(id);
  if (!row) return null;
  const s = surveyFromRow(row);
  s.scaleTitle = row.scale_title;
  return s;
}

function getSurveyByToken(token) {
  const row = db.prepare('SELECT * FROM surveys WHERE token = ?').get(token);
  return surveyFromRow(row);
}

function createSurvey(scaleId, opts) {
  const o = opts || {};
  const token = randomToken(9);
  const info = db.prepare(`
    INSERT INTO surveys(scale_id,token,name,status,anonymous,max_responses,closes_at,show_result,collect_meta,created_at,note,owner_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    scaleId,
    token,
    o.name || '未命名调查',
    'open',
    o.anonymous === false ? 0 : 1,
    o.maxResponses || null,
    o.closesAt || null,
    o.showResult ? 1 : 0,
    o.collectMeta === false ? 0 : 1,
    now(),
    o.note || '',
    o.ownerId || null
  );
  return getSurvey(Number(info.lastInsertRowid));
}

function updateSurvey(id, patch) {
  const s = getSurvey(id);
  if (!s) return null;
  const next = Object.assign({}, s, patch);
  db.prepare(`
    UPDATE surveys SET name=?, status=?, anonymous=?, max_responses=?, closes_at=?, show_result=?, collect_meta=?, note=?
    WHERE id=?
  `).run(
    next.name,
    next.status,
    next.anonymous ? 1 : 0,
    next.maxResponses || null,
    next.closesAt || null,
    next.showResult ? 1 : 0,
    next.collectMeta ? 1 : 0,
    next.note || '',
    id
  );
  return getSurvey(id);
}

function deleteSurvey(id) {
  db.prepare('DELETE FROM responses WHERE survey_id = ?').run(id);
  db.prepare('DELETE FROM surveys WHERE id = ?').run(id);
  return { ok: true };
}

function surveyState(survey) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM responses WHERE survey_id = ?').get(survey.id).c;
  if (survey.status !== 'open') return { open: false, reason: '该调查已关闭。', count: count };
  if (survey.closesAt && new Date(survey.closesAt).getTime() < Date.now()) {
    return { open: false, reason: '该调查已超过截止时间。', count: count };
  }
  if (survey.maxResponses && count >= survey.maxResponses) {
    return { open: false, reason: '该调查已达到预定样本量，停止回收。', count: count };
  }
  return { open: true, count: count };
}

function saveResponse(survey, scale, payload) {
  const answers = payload.answers || {};
  const scores = scoreResponse(scale.definition, answers);
  const pid = payload.pid || randomToken(8);
  const info = db.prepare(`
    INSERT INTO responses(survey_id,pid,answers,scores,duration_sec,consent,meta,started_at,submitted_at,subject_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run(
    survey.id,
    pid,
    JSON.stringify(answers),
    JSON.stringify(scores),
    payload.durationSec || null,
    payload.consent ? 1 : 0,
    JSON.stringify(payload.meta || {}),
    payload.startedAt || null,
    now(),
    payload.subjectId || null
  );
  return { id: Number(info.lastInsertRowid), pid: pid, scores: scores, subjectId: payload.subjectId || null };
}

function listResponses(surveyId) {
  const rows = db.prepare('SELECT * FROM responses WHERE survey_id = ? ORDER BY id').all(surveyId);
  return rows.map(function (r) {
    return {
      id: r.id,
      pid: r.pid,
      answers: JSON.parse(r.answers),
      scores: JSON.parse(r.scores || '{}'),
      durationSec: r.duration_sec,
      consent: !!r.consent,
      meta: JSON.parse(r.meta || '{}'),
      submittedAt: r.submitted_at,
      subjectId: r.subject_id || null,
    };
  });
}

/* ---------------- 初始化 ---------------- */

/* ---------------- 随访研究 ---------------- */

/* ---------------- 用户 ---------------- */

function hashPassword(password, salt) { return kdf.hashScryptSync(password, salt); }
function verifyPassword(password, stored) { return kdf.verifyPassword(password, stored); }

/* ---------------- 管理员口令（仅存 scrypt 哈希，明文不落库） ---------------- */

const ADMIN_HASH_KEY = 'admin_password_hash';
const ADMIN_LEGACY_KEY = 'admin_password';
/** 标记位：当前哈希仍是首次初始化、未经管理员修改的口令（不保存口令本身） */
const ADMIN_INITIAL_KEY = 'admin_password_initial';
/** 本次进程生成的随机初始口令；明文只在内存和 data 目录的口令文件里，绝不入数据库 */
let initialGenerated = null;

function dropLegacyAdminPassword() {
  db.prepare('DELETE FROM settings WHERE key = ?').run(ADMIN_LEGACY_KEY);
}

/** 16 位随机口令：大小写字母 + 数字，剔除易混淆字符（0/O/1/l/I）；用 crypto 而非 Math.random */
function generateInitialPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** 初始口令文件的落点：跟数据库同一目录（测试库在 test/，生产库在 data/） */
function initialPasswordFile() {
  return path.join(path.dirname(DB_PATH), '管理员初始口令.txt');
}

/**
 * 把生成的初始口令写到数据库同目录（0600 权限），避免错过启动日志就被锁在门外。
 * 管理员改密后由 setAdminPassword 自动删除；写失败则退回只打印在启动日志。
 */
function writeInitialPasswordFile(password) {
  try {
    fs.writeFileSync(initialPasswordFile(), [
      '首次启动自动生成的管理员初始口令：' + password,
      '',
      '请尽快登录后到「系统设置 → 修改管理员密码」改成自己的口令，',
      '改密成功后本文件会被自动删除。',
    ].join('\n') + '\n', { mode: 0o600 });
  } catch (e) { /* 目录只读等场景：口令仍会打印在启动日志里 */ }
}

/**
 * 首次初始化管理员口令，优先级：旧版明文库迁移 > MEDSCALE_PASSWORD 环境变量 > 随机生成。
 * 仓库里不再存在任何固定默认口令：全新部署（不设环境变量）一定拿到随机口令。
 */
function ensureAdminPasswordHash() {
  const stored = getSetting(ADMIN_HASH_KEY, '');
  if (/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored)) { dropLegacyAdminPassword(); return; }
  const legacy = getSetting(ADMIN_LEGACY_KEY, '');
  let initial;
  if (legacy) {
    initial = legacy; // 旧版明文库升级：沿用原口令，不锁死用户
  } else if (process.env.MEDSCALE_PASSWORD) {
    initial = process.env.MEDSCALE_PASSWORD; // 部署脚本 / env 显式指定
  } else {
    initial = generateInitialPassword();
    initialGenerated = initial;
    writeInitialPasswordFile(initial);
    console.log('\n  已生成随机管理员初始口令：' + initial);
    console.log('  （同一份已写入 ' + initialPasswordFile() + '，请登录修改口令，文件会自动删除）');
  }
  setSetting(ADMIN_HASH_KEY, hashPassword(initial));
  setSetting(ADMIN_INITIAL_KEY, '1');
  dropLegacyAdminPassword();
}

function checkAdminPassword(password) {
  return verifyPassword(String(password == null ? '' : password), getSetting(ADMIN_HASH_KEY, ''));
}

function setAdminPassword(password) {
  setSetting(ADMIN_HASH_KEY, hashPassword(String(password)));
  setSetting(ADMIN_INITIAL_KEY, '');
  dropLegacyAdminPassword();
  try { fs.unlinkSync(initialPasswordFile()); } catch (e) { /* 本来就不存在或已手动删除 */ }
}

/** 仍在使用首次初始化、未经管理员修改的口令（仅改密后为 false，与口令具体值无关） */
function isAdminPasswordDefault() {
  return getSetting(ADMIN_INITIAL_KEY, '') === '1';
}

/** 仅当本次进程刚生成随机口令时返回明文；重启后为 null，请查启动日志或口令文件 */
function initialAdminPassword() {
  return initialGenerated;
}

function userFromRow(r) {
  if (!r) return null;
  return {
    id: r.id, username: r.username, name: r.name || '', org: r.org || '',
    role: r.role || 'user', status: r.status || 'active',
    createdAt: r.created_at, lastLogin: r.last_login,
  };
}

function createUser(data) {
  const username = String(data.username || '').trim();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return { ok: false, error: '该用户名已被注册' };
  }
  const info = db.prepare(`
    INSERT INTO users(username,name,org,password_hash,role,status,created_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(
    username,
    String(data.name || '').trim(),
    String(data.org || '').trim(),
    hashPassword(data.password),
    data.role === 'admin' ? 'admin' : 'user',
    'active',
    now()
  );
  return { ok: true, user: getUser(Number(info.lastInsertRowid)) };
}

function getUser(id) {
  return userFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function findUserByUsername(username) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  return row ? Object.assign(userFromRow(row), { passwordHash: row.password_hash }) : null;
}

function loginUser(id) {
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), id);
}

function listUsers() {
  return db.prepare('SELECT * FROM users ORDER BY id').all().map(userFromRow);
}

function updateUser(id, patch) {
  const u = getUser(id);
  if (!u) return null;
  const next = Object.assign({}, u, patch || {});
  db.prepare('UPDATE users SET name=?, org=?, role=?, status=? WHERE id=?')
    .run(next.name, next.org, next.role, next.status, id);
  if (patch && patch.password) {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(patch.password), id);
  }
  return getUser(id);
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

/* ---------------- 邀请码 ---------------- */

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

function createInvite(data) {
  const o = data || {};
  let code = normalizeInviteCode(o.code);
  if (!code) {
    // 随机码可能撞库，重试几次再放弃
    for (let i = 0; i < 8 && !code; i += 1) {
      const c = randomInviteCode();
      if (!db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(c)) code = c;
    }
  }
  if (!code) return { ok: false, error: '邀请码生成失败，请重试' };
  if (db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(code)) {
    return { ok: false, error: '该邀请码已存在' };
  }
  const maxUses = Math.max(1, Math.min(10000, Number(o.maxUses) || 1));
  const info = db.prepare(`
    INSERT INTO invite_codes(code,note,role,max_uses,used,expires_at,created_by,revoked,created_at)
    VALUES(?,?,?,?,0,?,?,0,?)
  `).run(code, String(o.note || '').trim(), o.role === 'admin' ? 'admin' : 'user',
    maxUses, o.expiresAt || '', o.createdBy || null, now());
  return { ok: true, invite: getInvite(Number(info.lastInsertRowid)) };
}

function getInvite(id) {
  return inviteFromRow(db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id));
}

function findInviteByCode(code) {
  const c = normalizeInviteCode(code);
  if (!c) return null;
  return inviteFromRow(db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(c));
}

function listInvites() {
  return db.prepare('SELECT * FROM invite_codes ORDER BY id DESC').all().map(inviteFromRow);
}

function updateInvite(id, patch) {
  const cur = getInvite(id);
  if (!cur) return null;
  const next = Object.assign({}, cur, patch || {});
  db.prepare('UPDATE invite_codes SET note=?, role=?, max_uses=?, expires_at=?, revoked=? WHERE id=?')
    .run(next.note, next.role === 'admin' ? 'admin' : 'user',
      Math.max(1, Math.min(10000, Number(next.maxUses) || 1)),
      next.expiresAt || '', next.revoked ? 1 : 0, id);
  return getInvite(id);
}

/** 注册成功后扣一次；并发下用条件更新，避免同一码超额 */
function consumeInvite(id) {
  const info = db.prepare('UPDATE invite_codes SET used = used + 1 WHERE id = ? AND revoked = 0 AND used < max_uses').run(id);
  return Number(info.changes) > 0;
}

/** 扣次后账号又没建成功时退回次数，避免误伤正常用户 */
function refundInvite(id) {
  db.prepare('UPDATE invite_codes SET used = used - 1 WHERE id = ? AND used > 0').run(id);
}

/* ---------------- 并发写与共享状态 ---------------- */
/** 同步等待：写锁竞争通常是毫秒级，等一下比重试整条请求便宜 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 包住一次写操作：只在「数据库被占用」（SQLITE_BUSY）时重试，其他错误原样抛出。
 * 多进程共用一个库文件时写锁竞争是常态，不该把用户请求变成 500。
 */
function withWriteRetry(fn, attempts) {
  const max = attempts || 6;
  for (let i = 1; ; i += 1) {
    try { return fn(); } catch (e) {
      const busy = /database is locked|SQLITE_BUSY/i.test(String((e && (e.errstr || e.message)) || ''));
      if (!busy || i >= max) throw e;
      sleepSync(Math.min(200, 20 * i));
    }
  }
}

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function sessionFromRow(row) {
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    userId: row.user_id === null ? null : row.user_id,
    admin: row.admin === 1 || row.admin === true,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    expiresAt: row.expires_at,
  };
}

/** 会话落库：只存 token 的哈希，明文 token 仅在 Cookie 里 */
function createSession(tokenHash, info) {
  const ts = now();
  const expires = new Date(Date.now() + (info.ttlMs || SESSION_TTL_MS)).toISOString();
  withWriteRetry(function () {
    db.prepare('INSERT INTO sessions (token_hash, user_id, admin, ip, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(tokenHash, info.userId == null ? null : info.userId, info.admin ? 1 : 0, info.ip || '', ts, ts, expires);
  });
  return { tokenHash: tokenHash, userId: info.userId == null ? null : info.userId, admin: !!info.admin, expiresAt: expires };
}

function getSession(tokenHash) {
  return sessionFromRow(db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash));
}

/** 活跃时间只用于排查，写库按分钟节流，避免每个请求都产生一次写 */
function touchSession(tokenHash, lastSeen) {
  withWriteRetry(function () {
    db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(lastSeen, tokenHash);
  });
}

function deleteSession(tokenHash) {
  withWriteRetry(function () { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); });
}

function deleteSessionsOfUser(userId) {
  withWriteRetry(function () { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); });
}

function clearSessions() {
  withWriteRetry(function () { db.prepare('DELETE FROM sessions').run(); });
}

/** 过期会话在读到时顺手删掉；这里提供一次全量清理，防止长期只用 GET 的库里堆积空行 */
function purgeSessions() {
  const r = db.prepare('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ?').run(now());
  return Number(r.changes || 0);
}

function getRateLimit(key) {
  const row = db.prepare('SELECT key, first, n FROM rate_limits WHERE key = ?').get(key);
  return row ? { key: row.key, first: Number(row.first), n: Number(row.n) } : null;
}

function setRateLimit(key, first, n) {
  withWriteRetry(function () {
    db.prepare('INSERT INTO rate_limits (key, first, n) VALUES (?,?,?) ' +
      'ON CONFLICT(key) DO UPDATE SET first = excluded.first, n = excluded.n').run(key, first, n);
  });
}

function clearRateLimit(key) {
  withWriteRetry(function () { db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key); });
}

/** 清掉已过窗口的计数行，窗口过期后不同进程都会走这条路 */
function purgeRateLimits(beforeMs) {
  const r = db.prepare('DELETE FROM rate_limits WHERE first < ?').run(Number(beforeMs));
  return Number(r.changes || 0);
}

function studyFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, scaleId: row.scale_id, subjectMode: row.subject_mode,
    note: row.note, createdAt: row.created_at,
    ownerId: row.owner_id === undefined ? null : row.owner_id,
  };
}

/**
 * 创建随访研究：一次生成多个时点的调查（每个时点独立链接与二维码）
 * @param {number} scaleId
 * @param {object} opts { name, waves:[{label}], subjectMode:'auto'|'self', showResult, collectMeta, note }
 */
function createStudy(scaleId, opts) {
  const o = opts || {};
  const waves = (o.waves && o.waves.length) ? o.waves : [{ label: '基线' }];
  db.exec('BEGIN');
  try {
    const info = db.prepare('INSERT INTO studies(name,scale_id,subject_mode,note,created_at,owner_id) VALUES(?,?,?,?,?,?)')
      .run(o.name || '随访研究', scaleId, o.subjectMode === 'self' ? 'self' : 'auto', o.note || '', now(), o.ownerId || null);
    const studyId = Number(info.lastInsertRowid);
    const surveys = [];
    waves.forEach(function (w, i) {
      const s = createSurvey(scaleId, {
        name: (o.name || '随访研究') + ' · ' + (w.label || ('第' + (i + 1) + '次')),
        anonymous: o.subjectMode !== 'self',
        showResult: o.showResult,
        collectMeta: o.collectMeta,
        note: w.note || o.note || '',
        ownerId: o.ownerId,
      });
      db.prepare('UPDATE surveys SET study_id=?, wave=?, wave_label=?, subject_mode=? WHERE id=?')
        .run(studyId, i + 1, w.label || ('第' + (i + 1) + '次'), o.subjectMode === 'self' ? 'self' : 'auto', s.id);
      surveys.push(getSurvey(s.id));
    });
    db.exec('COMMIT');
    return { study: getStudy(studyId), surveys: surveys };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function listStudies() {
  const rows = db.prepare(`
    SELECT st.*, sc.title AS scale_title,
      (SELECT COUNT(*) FROM surveys s WHERE s.study_id = st.id) AS wave_count,
      (SELECT COUNT(*) FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.study_id = st.id) AS response_count
    FROM studies st JOIN scales sc ON sc.id = st.scale_id ORDER BY st.id DESC
  `).all();
  return rows.map(function (r) {
    const st = studyFromRow(r);
    st.scaleTitle = r.scale_title;
    st.waveCount = r.wave_count;
    st.responseCount = r.response_count;
    return st;
  });
}

function getStudy(id) {
  const row = db.prepare(`
    SELECT st.*, sc.title AS scale_title FROM studies st JOIN scales sc ON sc.id = st.scale_id WHERE st.id = ?
  `).get(id);
  if (!row) return null;
  const st = studyFromRow(row);
  st.scaleTitle = row.scale_title;
  st.waves = db.prepare('SELECT * FROM surveys WHERE study_id = ? ORDER BY wave').all(id).map(function (r) {
    const s = surveyFromRow(r);
    s.responseCount = db.prepare('SELECT COUNT(*) AS c FROM responses WHERE survey_id = ?').get(s.id).c;
    s.subjectCount = db.prepare('SELECT COUNT(DISTINCT subject_id) AS c FROM responses WHERE survey_id = ? AND subject_id IS NOT NULL').get(s.id).c;
    return s;
  });
  return st;
}

function deleteStudy(id) {
  const waves = db.prepare('SELECT id FROM surveys WHERE study_id = ?').all(id);
  db.exec('BEGIN');
  try {
    waves.forEach(function (w) {
      db.prepare('DELETE FROM responses WHERE survey_id = ?').run(w.id);
      db.prepare('DELETE FROM surveys WHERE id = ?').run(w.id);
    });
    db.prepare('DELETE FROM studies WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: true };
}

/** 某时点是否已有该受试者的答卷（防止重复提交破坏配对） */
function findResponseBySubject(surveyId, subjectId) {
  if (!subjectId) return null;
  return db.prepare('SELECT id, pid, submitted_at FROM responses WHERE survey_id = ? AND subject_id = ? LIMIT 1')
    .get(surveyId, subjectId) || null;
}

/** 生成下一个受试者编号（如 S-0007） */
function nextSubjectCode(studyId) {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT r.subject_id) AS c FROM responses r
    JOIN surveys s ON s.id = r.survey_id
    WHERE s.study_id = ? AND r.subject_id IS NOT NULL
  `).get(studyId);
  return 'S-' + String((row ? row.c : 0) + 1).padStart(4, '0');
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM scales').get().c;
  if (count === 0) {
    db.exec('BEGIN');
    try {
      TEMPLATES.forEach(function (t) {
        insertScale(t, { isTemplate: true, isBuiltin: true });
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    setSetting('site_title', '医学量表与问卷平台');
    log('seed', '内置模板初始化 ' + TEMPLATES.length + ' 个');
  }
  ensureAdminPasswordHash();
  syncTemplates();
}

/**
 * 每次启动同步内置模板：
 *  - 新增的模板自动补齐
 *  - 已存在且尚未被任何调查使用的内置模板，用最新定义更新（条目/计分/分级）
 *  - 已被调查使用的模板保持原样，避免影响正在进行的研究数据
 */
function syncTemplates() {
  const rows = db.prepare('SELECT id, code FROM scales WHERE is_builtin = 1').all();
  const byCode = new Map(rows.map(function (r) { return [r.code, r.id]; }));
  let added = 0;
  let updated = 0;
  db.exec('BEGIN');
  try {
    TEMPLATES.forEach(function (t) {
      const id = byCode.get(t.code);
      if (!id) {
        insertScale(t, { isTemplate: true, isBuiltin: true });
        added += 1;
        return;
      }
      const used = db.prepare('SELECT COUNT(*) AS c FROM surveys WHERE scale_id = ?').get(id).c;
      if (used) return;
      updateScale(id, t);
      updated += 1;
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (added || updated) log('template_sync', '内置模板同步：新增 ' + added + ' 个、更新 ' + updated + ' 个');
}

seed();

/* ================= 数据备份与恢复 ================= */
const BACKUP_NAME_RE = /^medscale-[A-Za-z0-9._-]+\.sqlite$/;
const REQUIRED_TABLES = ['scales', 'surveys', 'responses', 'users', 'settings'];

function sqlLiteral(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function backupStamp() { return now().replace(/[:.]/g, '-').replace(/-Z$/, 'Z'); }

/** 生成一份自包含快照：VACUUM INTO 会输出合并了 WAL 的单文件，不需要额外拷贝 -wal */
function createBackup(label) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const prefix = label ? label + '-' : '';
  const stamp = backupStamp();
  let name = '';
  let target = null;
  let lastTmp = '';
  // 先写唯一临时名，再用硬链接原子占位：两个 worker 在同一秒各出一份快照时互不覆盖，
  // 已存在的备份也不会被半写文件替换掉。
  for (let seq = 1; seq <= 50 && !target; seq += 1) {
    name = 'medscale-' + prefix + stamp + (seq > 1 ? '-' + seq : '') + '.sqlite';
    target = path.join(BACKUP_DIR, name);
    lastTmp = target + '.' + process.pid + '.' + randomToken(4) + '.tmp';
    const tmp = lastTmp;
    try {
      db.exec('VACUUM INTO ' + sqlLiteral(tmp));
      fs.linkSync(tmp, target);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (x) { /* ignore */ }
      if (e.code === 'EEXIST') { target = null; continue; }
      throw e;
    }
    unlinkWithRetry(tmp);
  }
  if (!target) throw new Error('同一秒内的快照过多，请间隔后再试');
  const info = inspectBackup(target);
  if (info.error) {
    try { fs.unlinkSync(target); } catch (e) { /* ignore */ }
    unlinkWithRetry(lastTmp); // 校验失败删掉正式名后，别把硬链接的临时名也留在备份目录里
    throw new Error(info.error);
  }
  return Object.assign({ name: name }, info);
}

/** 高负载下 unlink 偶发失败（EPERM/BUSY）；临时文件是正式备份的硬链接，留着只是目录噪音，重试几次清掉 */
function unlinkWithRetry(file, attempts) {
  const n = attempts || 5;
  for (let i = 0; i < n; i += 1) {
    try { fs.unlinkSync(file); return; } catch (e) {
      if (e.code === 'ENOENT') return;
      if (i === n - 1) return; // 清不掉就留给下次，不影响备份本身
      const until = Date.now() + 25;
      while (Date.now() < until) { /* 短暂自旋等待 */ }
    }
  }
}

/** 校验一个备份文件：格式、完整性、必备数据表，并给出行数概览 */
function inspectBackup(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return { error: '备份文件读取失败' }; }
  if (buf.slice(0, 15).toString('utf8') !== 'SQLite format 3') {
    return { error: '文件不是有效的 SQLite 数据库，可能下载不完整，请核对后重试' };
  }
  let probe = null;
  try {
    probe = new DatabaseSync(file, { readOnly: true });
    const check = probe.prepare('PRAGMA integrity_check').get().integrity_check;
    if (check !== 'ok') return { error: '备份文件完整性检查未通过：' + check };
    const tables = {};
    probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().forEach(function (r) {
        tables[r.name] = probe.prepare('SELECT COUNT(*) AS c FROM "' + r.name.replace(/"/g, '""') + '"').get().c;
      });
    const missing = REQUIRED_TABLES.filter(function (t) { return tables[t] === undefined; });
    if (missing.length) return { error: '备份文件缺少数据表：' + missing.join('、') + '，不是本平台的备份' };
    return { integrity: 'ok', bytes: buf.length, sha256: sha256(buf), tables: tables };
  } catch (e) {
    return { error: '无法打开备份文件：' + e.message };
  } finally {
    if (probe) { try { probe.close(); } catch (e) { /* ignore */ } }
  }
}

function backupFileOf(name) {
  if (!BACKUP_NAME_RE.test(String(name || ''))) return null;
  const file = path.join(BACKUP_DIR, name);
  if (path.dirname(file) !== BACKUP_DIR || !fs.existsSync(file)) return null;
  return file;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(function (n) { return BACKUP_NAME_RE.test(n); })
    .map(function (n) {
      const file = path.join(BACKUP_DIR, n);
      const st = fs.statSync(file);
      return { name: n, bytes: st.size, createdAt: st.mtime.toISOString(), sha256: sha256(fs.readFileSync(file)) };
    })
    .sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
}

function reopenDbFrom(file) {
  db.close();
  fs.copyFileSync(file, DB_PATH);
  ['-wal', '-shm'].forEach(function (s) {
    try { fs.unlinkSync(DB_PATH + s); } catch (e) { /* ignore */ }
  });
  db = new DatabaseSync(DB_PATH);
  applyPragmas();
  ensureSchema();
}

/** 恢复前必须重新校验：文件可能在生成后被改动，也可能来自别的平台版本 */
function restoreFromVerifiedFile(file, expectedSha) {
  const info = inspectBackup(file);
  if (info.error) return info;
  if (expectedSha && info.sha256 !== String(expectedSha).toLowerCase()) {
    return { error: '校验与备份文件不一致，文件可能已损坏或被改动，已取消恢复' };
  }
  const pre = createBackup('pre-restore');
  reopenDbFrom(file);
  return { ok: true, preRestore: pre.name, bytes: info.bytes, tables: info.tables };
}

function restoreBackup(name, expectedSha) {
  const file = backupFileOf(name);
  if (!file) return { error: '备份文件名不合法' };
  return restoreFromVerifiedFile(file, expectedSha);
}

function restoreFromBuffer(buf, expectedSha) {
  if (!buf || !buf.length) return { error: '备份文件内容为空' };
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const tmp = path.join(BACKUP_DIR, 'upload-' + backupStamp() + '-' + process.pid + '-' + randomToken(4) + '.sqlite');
  fs.writeFileSync(tmp, buf);
  try {
    return restoreFromVerifiedFile(tmp, expectedSha);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  }
}

module.exports = {
  get db() { return db; },
  dbPath: DB_PATH,
  SCHEMA: SCHEMA,
  backupDir: BACKUP_DIR,
  createBackup: createBackup,
  listBackups: listBackups,
  backupFileOf: backupFileOf,
  inspectBackup: inspectBackup,
  restoreBackup: restoreBackup,
  restoreFromBuffer: restoreFromBuffer,
  now: now,
  randomToken: randomToken,
  getSetting: getSetting,
  setSetting: setSetting,
  log: log,
  listScales: listScales,
  getScale: getScale,
  insertScale: insertScale,
  updateScale: updateScale,
  deleteScale: deleteScale,
  listSurveys: listSurveys,
  getSurvey: getSurvey,
  getSurveyByToken: getSurveyByToken,
  createSurvey: createSurvey,
  updateSurvey: updateSurvey,
  deleteSurvey: deleteSurvey,
  surveyState: surveyState,
  saveResponse: saveResponse,
  listResponses: listResponses,
  createStudy: createStudy,
  listStudies: listStudies,
  getStudy: getStudy,
  deleteStudy: deleteStudy,
  findResponseBySubject: findResponseBySubject,
  nextSubjectCode: nextSubjectCode,
  createUser: createUser,
  getUser: getUser,
  findUserByUsername: findUserByUsername,
  loginUser: loginUser,
  verifyPassword: verifyPassword,
  hashPassword: hashPassword,
  ensureAdminPasswordHash: ensureAdminPasswordHash,
  checkAdminPassword: checkAdminPassword,
  setAdminPassword: setAdminPassword,
  isAdminPasswordDefault: isAdminPasswordDefault,
  initialAdminPassword: initialAdminPassword,
  generateInitialPassword: generateInitialPassword,
  listUsers: listUsers,
  updateUser: updateUser,
  countUsers: countUsers,
  randomInviteCode: randomInviteCode,
  normalizeInviteCode: normalizeInviteCode,
  createInvite: createInvite,
  getInvite: getInvite,
  findInviteByCode: findInviteByCode,
  listInvites: listInvites,
  updateInvite: updateInvite,
  consumeInvite: consumeInvite,
  refundInvite: refundInvite,
  SESSION_TTL_MS: SESSION_TTL_MS,
  BUSY_TIMEOUT_MS: BUSY_TIMEOUT_MS,
  withWriteRetry: withWriteRetry,
  createSession: createSession,
  getSession: getSession,
  touchSession: touchSession,
  deleteSession: deleteSession,
  deleteSessionsOfUser: deleteSessionsOfUser,
  clearSessions: clearSessions,
  purgeSessions: purgeSessions,
  getRateLimit: getRateLimit,
  setRateLimit: setRateLimit,
  clearRateLimit: clearRateLimit,
  purgeRateLimits: purgeRateLimits,
};
