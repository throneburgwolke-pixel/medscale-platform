'use strict';
/**
 * 认证服务：语义搬迁自 server.js 的 checkPassword（强度规则见下）、registerMode/
 * registerOpen/registerAvailable、POST /api/login 的校验与限流、POST /api/register
 * 的三态 + 邀请码核销/退回 + 首用户即管理员逻辑。同步 dbm.* 换成 await 服务调用，
 * 业务分支逐行保留；错误文案对用户安全，内部细节只进 audit_log。
 *
 * 口令强度：旧 server.js 唯一的强度规则是「至少 6 位」（/api/register 与 /api/password），
 * checkPasswordStrength 即由此而来；server.js:194 的 checkPassword 实为管理员口令校验，
 * 与强度无关，不在本模块迁移范围内。
 */
const crypto = require('node:crypto');
const kdf = require('../kdf.js');
const users = require('./users.js');
const invites = require('./invites.js');
const { getSetting } = require('./settings.js');
const sessions = require('./sessions.js');
const { checkLimit, resetLimit } = require('./ratelimit.js');
const { logAudit } = require('./audit.js');

/* 与 server.js 现有常量逐字一致 */
const AUTH_MAX_FAILS = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

/** 搬迁自 /api/register、/api/password 的「密码至少 6 位」规则 */
function checkPasswordStrength(pwd) {
  const p = String(pwd === undefined || pwd === null ? '' : pwd);
  if (p.length < 6) return { ok: false, reason: '密码至少 6 位' };
  return { ok: true };
}

/**
 * 注册准入三态：closed（完全关闭）/ invite（凭邀请码自助注册，默认）/ open（免审自助）。
 * 老库只有 allow_register 时按它升级：开过注册的仍是 open，关掉注册的升级为 invite。
 */
async function registerMode(db) {
  const m = await getSetting(db, 'register_mode', '');
  if (m === 'closed' || m === 'invite' || m === 'open') return m;
  return (await getSetting(db, 'allow_register', '0')) === '1' ? 'open' : 'invite';
}

/** 是否可免码自助注册：零用户时始终允许（否则没人能开局），其余看三态设置。 */
async function registerOpen(db) {
  if ((await users.countUsers(db)) === 0) return true;
  return (await registerMode(db)) === 'open';
}

/** 是否还能开账号（含凭邀请码）：只有 closed 且已有用户时才彻底没有入口。 */
async function registerAvailable(db) {
  if ((await users.countUsers(db)) === 0) return true;
  return (await registerMode(db)) !== 'closed';
}

/**
 * 登录限流 key：逐字对齐现有 /api/login handler —— `ip + '|' + (username ? 'u:'+username : 'admin-pw')`
 * 按「来源 + 目标凭据」分桶：爆破某个账号不会把整台机器锁死，成功登录后清零。
 */
function loginLimitKey(ip, username) {
  return String(ip || '') + '|' + (username ? 'u:' + username : 'admin-pw');
}

/**
 * 用户名 + 口令登录。成功：resetLimit → 5% 概率顺手清过期会话 → createSession(仅存
 * sha256 哈希) → loginUser → 返回明文 token（适配器负责 Set-Cookie）。
 * 失败：限流 429、口令错 401、停用 403，文案与现有 handler 一致。
 */
async function login(db, o) {
  const opts = o || {};
  const username = opts.username ? String(opts.username) : '';
  const ip = String(opts.ip || '');
  const lim = opts.limit || {};
  const key = lim.key || loginLimitKey(ip, username);
  const max = lim.max === undefined ? AUTH_MAX_FAILS : lim.max;
  const windowMs = lim.windowMs === undefined ? AUTH_WINDOW_MS : lim.windowMs;

  const rl = await checkLimit(db, key, max, windowMs);
  if (!rl.allowed) {
    await logAudit(db, 'login_throttled', key);
    return {
      ok: false,
      error: '尝试次数过多，请 ' + rl.retryAfterSec + ' 秒后再试',
      status: 429,
      retryAfterSec: rl.retryAfterSec,
    };
  }

  const u = username ? await users.findUserByUsername(db, username) : null;
  // verifyPassword：scrypt 返回同步布尔、pbkdf2 返回 Promise，await 对两者都成立
  if (!u || !(await kdf.verifyPassword(String(opts.password || ''), u.passwordHash))) {
    await logAudit(db, 'login_failed', '用户 ' + username);
    return { ok: false, error: '用户名或密码错误', status: 401 };
  }
  if (u.status !== 'active') return { ok: false, error: '账号已被停用，请联系管理员', status: 403 };

  const token = crypto.randomBytes(24).toString('hex');
  // 过期会话靠这个低频清理兜底，避免表一直长（对齐旧 sessionStore.create）
  if (Math.random() < 0.05) await sessions.purgeSessions(db);
  await sessions.createSession(db, await sessions.sha256Hex(token), {
    userId: u.id, admin: u.role === 'admin', ip: ip, ttlMs: sessions.SESSION_TTL_MS,
  });
  await users.loginUser(db, u.id);
  await logAudit(db, 'login', '用户 ' + u.username);
  await resetLimit(db, key);
  return { ok: true, token: token, user: await users.getUser(db, u.id) };
}

/** 登出：库里只存哈希，适配器把 sha256Hex(明文 token) 传进来即可 */
async function logout(db, tokenHash) {
  if (tokenHash) await sessions.deleteSession(db, tokenHash);
}

/**
 * 三态注册：bootstrap（零用户免码开局即管理员）→ closed 拒绝 → invite 验码
 * → 用户名/口令校验 → 先原子扣次再建账号，建失败退回次数。
 * 与旧 handler 的差异（均为 brief 明确约定）：不发会话（Task 8 路由自行调 login/
 * createSession 实现注册即登录）；password2 一致性校验留在路由层。
 */
async function register(db, o) {
  const opts = o || {};
  const username = String(opts.username || '').trim();
  const ip = String(opts.ip || '');
  // 限流按「来源 + 用户名」分桶并只记失败：共用出口的科室一次开一批账号不会互相锁死
  const limitKey = ip + '|register|' + username;
  const rl = await checkLimit(db, limitKey, AUTH_MAX_FAILS, AUTH_WINDOW_MS);
  if (!rl.allowed) {
    return {
      ok: false,
      error: '尝试次数过多，请 ' + rl.retryAfterSec + ' 秒后再试',
      status: 429,
      retryAfterSec: rl.retryAfterSec,
    };
  }
  const bootstrap = (await users.countUsers(db)) === 0;   // 首个管理员免码开局
  const mode = await registerMode(db);
  let invite = null;
  if (!bootstrap) {
    if (mode === 'closed') {
      await logAudit(db, 'register_denied', 'IP ' + ip + ' 注册已关闭');
      return { ok: false, error: '注册当前已关闭，请联系管理员开通', status: 403 };
    }
    if (mode === 'invite') {
      if (!String(opts.code || '').trim()) {
        return { ok: false, error: '请填写邀请码（由管理员在"系统设置"中生成）', status: 403 };
      }
      const check = invites.inviteUsable(await invites.findInviteByCode(db, opts.code));
      if (!check.ok) {
        await logAudit(db, 'register_denied', '邀请码无效 IP ' + ip);
        return { ok: false, error: check.error, status: 403 };
      }
      invite = check.invite;
    }
  }
  const password = String(opts.password || '');
  if (username.length < 3 || username.length > 32) return { ok: false, error: '用户名需 3-32 个字符', status: 400 };
  if (!/^[\w.@\-\u4e00-\u9fa5]+$/.test(username)) return { ok: false, error: '用户名只能包含中文、字母、数字、下划线、点和@', status: 400 };
  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { ok: false, error: strength.reason, status: 400 };
  // 先原子扣次再建账号：并发下同一码不会超发；账号建失败则退回次数
  if (invite && !(await invites.consumeInvite(db, invite.id))) {
    return { ok: false, error: invites.inviteUsable(await invites.getInvite(db, invite.id)).error, status: 403 };
  }
  const r = await users.createUser(db, {
    username: username,
    password: password,
    name: opts.name || '',
    org: opts.org || '',
    role: bootstrap ? 'admin' : (invite && invite.role === 'admin' ? 'admin' : 'user'),
  });
  if (!r.ok) {
    if (invite) await invites.refundInvite(db, invite.id);
    return { ok: false, error: r.error, status: 400 };
  }
  await logAudit(db, 'register', r.user.username + '（' + r.user.role + '）' + (invite ? ' 邀请码 ' + invite.code : ''));
  await resetLimit(db, limitKey);
  return { ok: true, user: r.user };
}

/**
 * 用户改密：校验原口令（对齐旧 /api/password 的「原密码错误」）→ 新口令强度
 * （「新密码至少 6 位」）→ updateUser 落新 scrypt 哈希。
 */
async function changePassword(db, userId, oldPwd, newPwd) {
  const row = await db.first('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row) return { ok: false, error: '用户不存在' };
  if (!(await kdf.verifyPassword(String(oldPwd === undefined || oldPwd === null ? '' : oldPwd), row.password_hash))) {
    return { ok: false, error: '原密码错误' };
  }
  const strength = checkPasswordStrength(newPwd);
  if (!strength.ok) return { ok: false, error: '新' + strength.reason };
  await users.updateUser(db, userId, { password: String(newPwd) });
  return { ok: true };
}

module.exports = {
  AUTH_MAX_FAILS,
  AUTH_WINDOW_MS,
  checkPasswordStrength,
  registerMode,
  registerOpen,
  registerAvailable,
  register,
  login,
  logout,
  changePassword,
};
