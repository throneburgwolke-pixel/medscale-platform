'use strict';
/**
 * 医学量表与问卷平台 —— 零依赖 Node 服务端
 * 运行： node server.js  （默认 http://localhost:5173）
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const cluster = require('node:cluster');

const dbm = require('./lib/db.js');
const { validateAnswers, rawValue } = require('./lib/scoring.js');
const { buildReport } = require('./lib/report.js');
const { buildFollowup } = require('./lib/followup.js');
const { computeVisibility, answerLabel } = require('./lib/logic.js');
const importer = require('./lib/parse.js');
const qr = require('./lib/qr.js');
const { LICENSED_NOTES, CATALOG, CATEGORIES } = require('./lib/scales.js');
const coreHttp = require('./core/http.js');
const coreRegistry = require('./core/registry.js');

/**
 * 过渡期的能力注入点：Task 10 注入 OCR，Task 12 注入 backup store。
 * 现阶段为空——core 注册表还没有任何路由消费它。
 */
const NODE_CAPS = {};

/**
 * 默认只绑定本机回环地址：手机扫码填写需要局域网时，用 MEDSCALE_LAN=1（"启动平台.command"已内置）
 * 或显式 HOST=<网卡地址> 打开，避免把研究数据服务默默暴露给整个局域网。
 */
function resolveHost(env) {
  const e = env || {};
  if (e.HOST) return String(e.HOST);
  return String(e.MEDSCALE_LAN || '') === '1' ? '0.0.0.0' : '127.0.0.1';
}

const PORT = Number(process.env.PORT || 5173);
const HOST = resolveHost(process.env);
// 只有确实部署在反向代理后面才信任 X-Forwarded-For，否则该头可被伪造用于绕过限流/污染数据
const TRUST_PROXY = String(process.env.MEDSCALE_TRUST_PROXY || '') === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * 会话存在数据库里而不是内存里：换进程、开多 worker、重启服务之后，已登录的人不会掉线，
 * 未登录的人也不会因为某个 worker 有缓存而蒙混过关。库里只存 token 的 SHA-256，
 * 明文 token 只在 Cookie 中流转。
 */
const SESSION_TTL = dbm.SESSION_TTL_MS;
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

const sessionStore = {
  create: function (info) {
    const token = crypto.randomBytes(24).toString('hex');
    // 过期会话在读到时会被顺手删掉；没人再访问的会话靠这个低频清理兜底，避免表一直长
    if (Math.random() < 0.05) dbm.purgeSessions();
    dbm.createSession(sha256Hex(token), {
      userId: info.userId === undefined ? null : info.userId,
      admin: !!info.admin,
      ip: info.ip || '',
      ttlMs: SESSION_TTL,
    });
    return token;
  },
  get: function (token) {
    if (!token) return null;
    const hash = sha256Hex(token);
    const s = dbm.getSession(hash);
    if (!s) return null;
    const nowIso = dbm.now();
    if (!s.expiresAt || s.expiresAt <= nowIso) { dbm.deleteSession(hash); return null; }
    // 活跃时间按分钟节流回写，只为排查用，不给每个请求都添一次写
    if (!s.lastSeen || s.lastSeen.slice(0, 16) < nowIso.slice(0, 16)) dbm.touchSession(hash, nowIso);
    return { createdAt: s.createdAt, userId: s.userId, admin: s.admin };
  },
  delete: function (token) { if (token) dbm.deleteSession(sha256Hex(token)); },
  clear: function () { dbm.clearSessions(); },
};

/**
 * 登录态 Cookie：集中一处，避免三处拼字符串各漏一个属性。
 * Secure 只在确实走 HTTPS 时加——本机 http 访问若带上 Secure，浏览器会直接丢掉 Cookie。
 */
function sessionCookie(token, secure) {
  return {
    'Set-Cookie': 'msid=' + token + '; Path=/; HttpOnly; SameSite=Lax' +
      (secure ? '; Secure' : '') + '; Max-Age=' + (SESSION_TTL / 1000),
  };
}

/* ---------------- 公网基线：安全响应头 ---------------- */
/**
 * 脚本只允许同源文件（前端全部是外链 .js，没有内联脚本与内联事件），
 * 样式放行内联是因为渲染时大量使用 style 属性；被注入脚本的可能因此被 CSP 挡住。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

/** 公网收录默认关掉：这是临床数据入口，不该出现在搜索引擎里 */
const INDEXABLE = String(process.env.MEDSCALE_INDEXABLE || '') === '1';

/** 纯函数，便于把「是否加密 / 是否允许收录」的组合测清楚 */
function securityHeaders(opts) {
  const e = opts || {};
  const h = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  };
  if (!e.indexable) h['X-Robots-Tag'] = 'noindex, nofollow';
  // HSTS 只在真加密链路上发：明文下发会把访问者的浏览器永久重定向到 https，本机部署直接瘫
  if (e.https) h['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  return h;
}

/** 是否走的是 HTTPS。只有显式声明在代理后面才认 X-Forwarded-Proto，否则该头可被伪造 */
function isHttps(req, trust) {
  const xf = req && req.headers ? req.headers['x-forwarded-proto'] : '';
  return !!(trust && String(xf).split(',')[0].trim() === 'https');
}

function httpsOf(req) { return isHttps(req, TRUST_PROXY); }

/** 给这次请求的每个响应装上基线安全头（各接口自己传的头部优先级更高） */
function applyBaseHeaders(req, res) {
  const base = securityHeaders({ https: httpsOf(req), indexable: INDEXABLE });
  const orig = res.writeHead.bind(res);
  res.writeHead = function (code, headers) {
    return orig(code, Object.assign({}, base, headers || {}));
  };
}

/* ---------------- 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}

function sendJson(res, code, obj, headers) {
  send(res, code, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {}));
}

/**
 * 把 core 注册表返回的 Result 写回响应，复用现有的 send/sendJson。
 * json→sendJson；text/buf→send；result.headers 透传（Set-Cookie 等由 auth 路由后续注入）。
 * Secure 由调用方在 headers 里给（httpsOf(req) 决定），此处不重复判断。
 */
function writeResult(res, result, req) {
  if (res.headersSent) return;
  if (!result) return sendJson(res, 500, { error: INTERNAL_ERROR });
  if (result.json !== undefined) return sendJson(res, result.status, result.json, result.headers);
  if (result.text !== undefined) return send(res, result.status, result.text, result.headers);
  if (result.buf !== undefined) return send(res, result.status, result.buf, result.headers);
  return sendJson(res, result.status || 500, { error: INTERNAL_ERROR });
}

/** 回显用户请求的地址到 HTML 前必须转义，否则就是反射型 XSS */
function escHtml(s) {
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, function (c) { return MAP[c]; });
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', function (c) {
      data += c;
      if (data.length > 26 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', function () {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function checkPassword(pwd) {
  return dbm.checkAdminPassword(pwd);
}

function isAuthed(req) {
  return !!sessionOf(req);
}

function sessionOf(req) {
  return sessionStore.get(parseCookies(req).msid);
}

function isAdmin(req) {
  const s = sessionOf(req);
  if (!s) return false;
  // 账号会话以用户表里的角色为准：被降级或被删号的会话不会靠会话里缓存的旧标记继续当管理员
  if (s.userId) return (dbm.getUser(s.userId) || {}).role === 'admin';
  return s.admin === true;
}

function requireAdmin(ctx) {
  if (!isAdmin(ctx.req)) {
    sendJson(ctx.res, 403, { error: '需要管理员权限' });
    return false;
  }
  return true;
}

/* ---------------- 数据归属 ---------------- */
/** 当前访问者的身份：{ id, admin }。管理员口令登录时只有 admin，没有用户 id。 */
function viewerOf(req) {
  const s = sessionOf(req);
  if (!s) return null;
  const u = s.userId ? dbm.getUser(s.userId) : null;
  return { id: u ? u.id : null, admin: isAdmin(req) };
}

/**
 * 可见性（三层，从宽到严）：
 *   1. 管理员可见全部；
 *   2. 量表库里的内置/共享模板人人可读——它们只是题库，不含任何答卷数据；
 *   3. 其余内容一律归属到创建者账号：别人的看不见，没有归属的（owner 迁移前的
 *      历史遗留、以及管理员口令会话所建）也只对管理员可见，不再对全部注册账号开放。
 * 之所以不把「无归属 = 公开」保留下来：答卷里可能有 IP、受试者编号等可识别信息，
 * 归属不明的数据默认收紧才是安全的默认值。
 */
function canView(item, v) {
  if (!item) return false;
  if (v && v.admin) return true;
  if (item.isTemplate || item.isBuiltin) return true;
  if (!item.ownerId) return false;
  return !!(v && item.ownerId === v.id);
}

/** 可写性：无归属的历史数据只允许管理员接管修改，避免任意用户改写共享资源。 */
function canEdit(item, v) {
  if (!item || !v) return false;
  if (v.admin) return true;
  return !!item.ownerId && item.ownerId === v.id;
}

function visibleFor(list, v) {
  return list.filter(function (item) { return canView(item, v); });
}

/** 请求来源地址。未开启代理信任时忽略可伪造的 X-Forwarded-For。 */
function peerIp(req, trust) {
  const useProxy = trust === undefined ? TRUST_PROXY : !!trust;
  const xf = req && req.headers ? req.headers['x-forwarded-for'] : null;
  const ip = useProxy && xf
    ? String(xf).split(',')[0].trim()
    : ((req && req.socket && req.socket.remoteAddress) || '');
  return String(ip || '').replace(/^::ffff:/, '');
}

/**
 * 固定窗口失败限流器。返回 limit(key, max, windowMs) → {allowed, retryAfterSec}，
 * 并提供 limit.reset(key) 在凭据校验成功后清零。
 * 计数落在 rate_limits 表里而不是进程内存：开了多 worker 之后，
 * 攻击者不该因为请求被分到另一个进程就重新拿满额度。
 */
function createRateLimiter() {
  function limit(key, max, windowMs) {
    const nowMs = Date.now();
    const rec = dbm.getRateLimit(key);
    if (!rec || nowMs - rec.first > windowMs) {
      dbm.setRateLimit(key, nowMs, 1);
      // 过期计数只在放行新窗口时低频顺手清理，正常流量下不会每请求都扫表
      if (windowMs > 0 && Math.random() < 0.02) dbm.purgeRateLimits(nowMs - windowMs);
      return { allowed: true };
    }
    const n = rec.n + 1;
    dbm.setRateLimit(key, rec.first, n);
    if (n > max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((rec.first + windowMs - nowMs) / 1000)) };
    }
    return { allowed: true };
  }
  limit.reset = function (key) { dbm.clearRateLimit(key); };
  return limit;
}

const dbLimit = createRateLimiter();
const AUTH_MAX_FAILS = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

/**
 * 面向公网后给两类开放接口配额度：
 * 填写提交按「一个科室集体扫码」设计，额度要给足；解析/上传是 CPU 密集操作（含 OCR），最容易被刷穿。
 */
const RATE_POLICY = {
  join: { max: 200, windowMs: 10 * 60 * 1000 },
  upload: { max: 40, windowMs: 10 * 60 * 1000 },
};

function limitKey(kind, ip) { return ip + '|' + kind; }

/** 命中配额时直接回 429 并返回 true，调用方据此提前 return */
function throttle(ctx, kind) {
  const p = RATE_POLICY[kind];
  const rl = dbLimit(limitKey(kind, peerIp(ctx.req)), p.max, p.windowMs);
  if (rl.allowed) return false;
  sendJson(ctx.res, 429, { error: '操作过于频繁，请 ' + rl.retryAfterSec + ' 秒后再试' }, {
    'Retry-After': String(rl.retryAfterSec),
  });
  return true;
}

const REGISTER_MODE_LABEL = {
  closed: '已关闭（仅管理员可在"系统设置"中开通）',
  invite: '需邀请码（管理员在"系统设置 → 谁能开账号"中生成）',
  open: '任何人可自助注册',
};

/**
 * 注册准入三态：closed（完全关闭）/ invite（凭邀请码自助注册，默认）/ open（免审自助）。
 * 老库只有 allow_register 时按它升级：开过注册的仍是 open，关掉注册的升级为 invite，
 * 这样管理员不用改代码就能继续给同事发码开号。
 */
function registerMode() {
  const m = dbm.getSetting('register_mode', '');
  if (m === 'closed' || m === 'invite' || m === 'open') return m;
  return dbm.getSetting('allow_register', '0') === '1' ? 'open' : 'invite';
}

/** 是否可免码自助注册：零用户时始终允许（否则没人能开局），其余看三态设置。 */
function registerOpen() {
  if (dbm.countUsers() === 0) return true;
  return registerMode() === 'open';
}

/** 是否还能开账号（含凭邀请码）：只有 closed 且已有用户时才彻底没有入口。 */
function registerAvailable() {
  if (dbm.countUsers() === 0) return true;
  return registerMode() !== 'closed';
}

/** 邀请码是否仍然可用：未吊销、未过期、未超次 */
function inviteUsable(inv) {
  if (!inv || inv.revoked) return { ok: false, error: '邀请码无效，请核对后重试' };
  if (inv.expiresAt && inv.expiresAt < dbm.now()) return { ok: false, error: '邀请码已过期，请联系管理员重新生成' };
  if (inv.used >= inv.maxUses) return { ok: false, error: '邀请码使用次数已用完，请联系管理员' };
  return { ok: true, invite: inv };
}

function clientIp(req, survey) {
  if (survey && !survey.collectMeta) return '';
  return peerIp(req);
}

function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

/* ---------------- 路由 ---------------- */
const routes = [];
function route(method, pattern, handler, opts) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, function (_, k) {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ method: method, regex: regex, keys: keys, handler: handler, auth: !(opts && opts.public) });
}

/* ---- 会话与设置 ---- */
route('GET', '/api/session', function (ctx) {
  const s = sessionOf(ctx.req);
  const user = s && s.userId ? dbm.getUser(s.userId) : null;
  const admin = isAdmin(ctx.req);
  const body = {
    authenticated: !!s,
    user: user,
    isAdmin: admin,
    allowRegister: registerOpen(),
    registerMode: registerMode(),
    registerAvailable: registerAvailable(),
    siteTitle: dbm.getSetting('site_title', '医学量表与问卷平台'),
  };
  // 口令状态只对管理员可见：未登录者不应被告知"默认密码仍在生效"
  if (admin) body.defaultPassword = dbm.isAdminPasswordDefault();
  sendJson(ctx.res, 200, body);
}, { public: true });

route('POST', '/api/login', async function (ctx) {
  const body = await readBody(ctx.req);
  // 按「来源 + 目标凭据」分桶限流：爆破某个账号不会把整台机器锁死，成功登录后清零
  const limitKey = peerIp(ctx.req) + '|' + (body.username ? 'u:' + body.username : 'admin-pw');
  const rl = dbLimit(limitKey, AUTH_MAX_FAILS, AUTH_WINDOW_MS);
  if (!rl.allowed) {
    dbm.log('login_throttled', limitKey);
    return sendJson(ctx.res, 429, { error: '尝试次数过多，请 ' + rl.retryAfterSec + ' 秒后再试' }, {
      'Retry-After': String(rl.retryAfterSec),
    });
  }
  // ① 用户名 + 密码登录
  if (body.username) {
    const u = dbm.findUserByUsername(body.username);
    if (!u || !dbm.verifyPassword(body.password || '', u.passwordHash)) {
      dbm.log('login_failed', '用户 ' + body.username);
      return sendJson(ctx.res, 401, { error: '用户名或密码错误' });
    }
    if (u.status !== 'active') return sendJson(ctx.res, 403, { error: '账号已被停用，请联系管理员' });
    const token = sessionStore.create({ userId: u.id, admin: u.role === 'admin', ip: peerIp(ctx.req) });
    dbm.loginUser(u.id);
    dbm.log('login', '用户 ' + u.username);
    dbLimit.reset(limitKey);
    return sendJson(ctx.res, 200, { ok: true, user: dbm.getUser(u.id) }, sessionCookie(token, httpsOf(ctx.req)));
  }
  // ② 管理员密码登录（兼容旧方式）
  if (!checkPassword(body.password)) {
    dbm.log('login_failed', 'IP ' + clientIp(ctx.req));
    return sendJson(ctx.res, 401, { error: '密码错误' });
  }
  const token = sessionStore.create({ admin: true, ip: peerIp(ctx.req) });
  dbm.log('login', '管理员密码 IP ' + clientIp(ctx.req));
  dbLimit.reset(limitKey);
  sendJson(ctx.res, 200, { ok: true }, sessionCookie(token, httpsOf(ctx.req)));
}, { public: true });

/* ---- 用户注册 ---- */
route('POST', '/api/register', async function (ctx) {
  const body = await readBody(ctx.req);
  const username = String(body.username || '').trim();
  // 限流按「来源 + 用户名」分桶并只记失败：共用出口的科室一次开一批账号不会互相锁死
  const limitKey = peerIp(ctx.req) + '|register|' + username;
  const rl = dbLimit(limitKey, AUTH_MAX_FAILS, AUTH_WINDOW_MS);
  if (!rl.allowed) {
    return sendJson(ctx.res, 429, { error: '尝试次数过多，请 ' + rl.retryAfterSec + ' 秒后再试' }, {
      'Retry-After': String(rl.retryAfterSec),
    });
  }
  const bootstrap = dbm.countUsers() === 0;   // 首个管理员免码开局
  const mode = registerMode();
  let invite = null;
  if (!bootstrap) {
    if (mode === 'closed') {
      dbm.log('register_denied', 'IP ' + peerIp(ctx.req) + ' 注册已关闭');
      return sendJson(ctx.res, 403, { error: '注册当前已关闭，请联系管理员开通' });
    }
    if (mode === 'invite') {
      if (!String(body.invite || '').trim()) {
        return sendJson(ctx.res, 403, { error: '请填写邀请码（由管理员在"系统设置"中生成）' });
      }
      const check = inviteUsable(dbm.findInviteByCode(body.invite));
      if (!check.ok) {
        dbm.log('register_denied', '邀请码无效 IP ' + peerIp(ctx.req));
        return sendJson(ctx.res, 403, { error: check.error });
      }
      invite = check.invite;
    }
  }
  const password = String(body.password || '');
  if (username.length < 3 || username.length > 32) return sendJson(ctx.res, 400, { error: '用户名需 3-32 个字符' });
  if (!/^[\w.@\-\u4e00-\u9fa5]+$/.test(username)) return sendJson(ctx.res, 400, { error: '用户名只能包含中文、字母、数字、下划线、点和@' });
  if (password.length < 6) return sendJson(ctx.res, 400, { error: '密码至少 6 位' });
  if (body.password2 !== undefined && body.password2 !== password) return sendJson(ctx.res, 400, { error: '两次输入的密码不一致' });
  // 先原子扣次再建账号：并发下同一码不会超发；账号建失败则退回次数
  if (invite && !dbm.consumeInvite(invite.id)) {
    return sendJson(ctx.res, 403, { error: inviteUsable(dbm.getInvite(invite.id)).error });
  }
  const r = dbm.createUser({
    username: username,
    password: password,
    name: body.name || '',
    org: body.org || '',
    role: bootstrap ? 'admin' : (invite && invite.role === 'admin' ? 'admin' : 'user'),
  });
  if (!r.ok) {
    if (invite) dbm.refundInvite(invite.id);
    return sendJson(ctx.res, 400, { error: r.error });
  }
  const token = sessionStore.create({ userId: r.user.id, admin: r.user.role === 'admin', ip: peerIp(ctx.req) });
  dbm.loginUser(r.user.id);
  dbm.log('register', r.user.username + '（' + r.user.role + '）' + (invite ? ' 邀请码 ' + invite.code : ''));
  dbLimit.reset(limitKey);
  sendJson(ctx.res, 200, { ok: true, user: r.user }, sessionCookie(token, httpsOf(ctx.req)));
}, { public: true });

/* ---- 邀请码（仅管理员） ---- */
route('GET', '/api/invites', function (ctx) {
  if (!requireAdmin(ctx)) return;
  sendJson(ctx.res, 200, { items: dbm.listInvites() });
});

route('POST', '/api/invites', async function (ctx) {
  if (!requireAdmin(ctx)) return;
  const body = await readBody(ctx.req);
  const days = Number(body.validDays);
  const expiresAt = days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    : (body.expiresAt || '');
  const v = sessionOf(ctx.req);
  const r = dbm.createInvite({
    note: body.note || '',
    role: body.role,
    maxUses: body.maxUses,
    expiresAt: expiresAt,
    createdBy: v ? v.userId : null,
  });
  if (!r.ok) return sendJson(ctx.res, 400, { error: r.error });
  dbm.log('invite_create', r.invite.code + ' 可用 ' + r.invite.maxUses + ' 次');
  sendJson(ctx.res, 200, { invite: r.invite });
});

route('PATCH', '/api/invites/:id', async function (ctx) {
  if (!requireAdmin(ctx)) return;
  const body = await readBody(ctx.req);
  const patch = {};
  if (body.note !== undefined) patch.note = String(body.note || '');
  if (body.role !== undefined) patch.role = body.role === 'admin' ? 'admin' : 'user';
  if (body.maxUses !== undefined) patch.maxUses = Number(body.maxUses);
  if (body.expiresAt !== undefined) patch.expiresAt = String(body.expiresAt || '');
  if (body.revoked !== undefined) patch.revoked = !!body.revoked;
  const inv = dbm.updateInvite(Number(ctx.params.id), patch);
  if (!inv) return sendJson(ctx.res, 404, { error: '邀请码不存在' });
  dbm.log('invite_update', inv.code + ' ' + JSON.stringify({ revoked: inv.revoked, maxUses: inv.maxUses }));
  sendJson(ctx.res, 200, { invite: inv });
});

/* ---- 用户管理（管理员） ---- */
route('GET', '/api/users', function (ctx) {
  if (!requireAdmin(ctx)) return;
  sendJson(ctx.res, 200, { items: dbm.listUsers() });
});

route('PATCH', '/api/users/:id', async function (ctx) {
  if (!requireAdmin(ctx)) return;
  const body = await readBody(ctx.req);
  const u = dbm.updateUser(Number(ctx.params.id), body);
  if (!u) return sendJson(ctx.res, 404, { error: '用户不存在' });
  // 停用即吊销：否则对方手上的 Cookie 还能继续用两周
  if (u.status !== 'active') dbm.deleteSessionsOfUser(u.id);
  dbm.log('user_update', u.username + ' ' + JSON.stringify({ status: body.status, role: body.role }));
  sendJson(ctx.res, 200, u);
});

route('POST', '/api/logout', function (ctx) {
  const cookies = parseCookies(ctx.req);
  if (cookies.msid) sessionStore.delete(cookies.msid);
  sendJson(ctx.res, 200, { ok: true }, { 'Set-Cookie': 'msid=; Path=/; Max-Age=0' });
}, { public: true });

route('POST', '/api/password', async function (ctx) {
  const body = await readBody(ctx.req);
  if (!checkPassword(body.oldPassword)) return sendJson(ctx.res, 400, { error: '原密码错误' });
  if (!body.newPassword || String(body.newPassword).length < 6) {
    return sendJson(ctx.res, 400, { error: '新密码至少 6 位' });
  }
  dbm.setAdminPassword(body.newPassword);
  sessionStore.clear();
  dbm.log('password_changed', '');
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/settings', function (ctx) {
  if (!requireAdmin(ctx)) return;
  sendJson(ctx.res, 200, {
    siteTitle: dbm.getSetting('site_title', '医学量表与问卷平台'),
    allowRegister: registerOpen(),
    registerMode: registerMode(),
    collectMetaDefault: dbm.getSetting('collect_meta_default', '1') === '1',
  });
});

route('POST', '/api/settings', async function (ctx) {
  if (!requireAdmin(ctx)) return;
  const body = await readBody(ctx.req);
  // 先校验再写入：非法值必须整请求失败，不能把一半设置生效
  let mode = null;
  if (body.registerMode !== undefined) mode = String(body.registerMode);
  else if (body.allowRegister !== undefined) mode = body.allowRegister ? 'open' : 'closed';
  if (mode !== null && mode !== 'closed' && mode !== 'invite' && mode !== 'open') {
    return sendJson(ctx.res, 400, { error: '注册策略只能是 closed / invite / open 之一' });
  }
  if (body.siteTitle) dbm.setSetting('site_title', body.siteTitle);
  if (mode !== null) {
    dbm.setSetting('register_mode', mode);
    dbm.log('register_mode', mode);
  }
  sendJson(ctx.res, 200, {
    ok: true,
    siteTitle: dbm.getSetting('site_title', ''),
    allowRegister: registerOpen(),
    registerMode: registerMode(),
  });
});

/* ---- 数据备份与恢复（仅管理员） ---- */
route('POST', '/api/backup', function (ctx) {
  if (!requireAdmin(ctx)) return;
  let meta;
  try {
    meta = dbm.createBackup('');
  } catch (e) {
    return sendJson(ctx.res, 500, { error: '备份失败：' + e.message });
  }
  dbm.log('backup', meta.name + ' · ' + meta.bytes + ' 字节 · sha256 ' + meta.sha256.slice(0, 12));
  sendJson(ctx.res, 200, meta);
});

route('GET', '/api/backups', function (ctx) {
  if (!requireAdmin(ctx)) return;
  sendJson(ctx.res, 200, { items: dbm.listBackups(), dir: dbm.backupDir });
});

route('GET', '/api/backups/:name', function (ctx) {
  if (!requireAdmin(ctx)) return;
  const file = dbm.backupFileOf(ctx.params.name);
  if (!file) return sendJson(ctx.res, 400, { error: '备份文件名不合法' });
  send(ctx.res, 200, fs.readFileSync(file), {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(ctx.params.name),
  });
});

route('POST', '/api/restore', async function (ctx) {
  if (!requireAdmin(ctx)) return;
  const body = await readBody(ctx.req);
  if (body.confirm !== true) return sendJson(ctx.res, 400, { error: '请先勾选确认：恢复会用备份覆盖当前数据' });
  let result;
  try {
    if (body.data) {
      const buf = Buffer.from(String(body.data).replace(/^data:[^,]+,/, ''), 'base64');
      if (buf.length > 20 * 1024 * 1024) return sendJson(ctx.res, 400, { error: '备份文件过大（上限 20 MB）' });
      result = dbm.restoreFromBuffer(buf, body.sha256);
    } else if (body.name) {
      result = dbm.restoreBackup(body.name, body.sha256);
    } else {
      return sendJson(ctx.res, 400, { error: '请选择要恢复的备份文件' });
    }
  } catch (e) {
    result = { error: e.message };
  }
  if (result.error) return sendJson(ctx.res, 400, { error: result.error });
  dbm.log('restore', '恢复 ' + (body.name || body.filename || '上传文件') + '，恢复前快照 ' + result.preRestore);
  // 数据整体被换掉，旧会话里的用户与权限可能已不存在，一律要求重新登录
  sessionStore.clear();
  sendJson(ctx.res, 200, { ok: true, preRestore: result.preRestore, bytes: result.bytes },
    { 'Set-Cookie': 'msid=; Path=/; Max-Age=0' });
});

/* ---- 概览 ---- */
route('GET', '/api/overview', function (ctx) {
  const v = viewerOf(ctx.req);
  const scales = visibleFor(dbm.listScales(), v);
  const surveys = visibleFor(dbm.listSurveys(), v);
  sendJson(ctx.res, 200, {
    scaleCount: scales.length,
    templateCount: scales.filter(function (s) { return s.isTemplate; }).length,
    customCount: scales.filter(function (s) { return !s.isTemplate; }).length,
    surveyCount: surveys.length,
    openSurveyCount: surveys.filter(function (s) { return s.status === 'open'; }).length,
    responseCount: surveys.reduce(function (a, s) { return a + s.responseCount; }, 0),
    catalogCount: CATALOG.length,
    itemTotal: scales.reduce(function (a, s) { return a + s.definition.items.length; }, 0),
    categories: CATEGORIES,
    recent: surveys.slice(0, 5),
  });
});

/* ---- 量表 ---- */
/** 公开量表清单（仅元数据，供首页/未登录用户浏览，不含条目正文与计分） */
route('GET', '/api/public/scales', function (ctx) {
  // 公开目录只放共享题库（内置/模板）。用户自建的一律不出现——
  // 哪怕它没有归属（历史遗留），也不该把别人起的量表名、题面泄露给未登录访客。
  const items = dbm.listScales().filter(function (s) {
    return s.isTemplate || s.isBuiltin;
  }).map(function (s) {
    return {
      title: s.title,
      category: s.category,
      items: s.definition.items.length,
      dimensions: (s.definition.dimensions || []).length,
      description: s.description,
      tags: s.tags,
      license: s.license,
      isTemplate: s.isTemplate,
    };
  });
  sendJson(ctx.res, 200, { items: items, categories: CATEGORIES });
}, { public: true });

/** 使用说明全文（供站内「使用流程」下载/查看）：只读仓库内文档，不依赖项目目录之外的文件 */
route('GET', '/api/guide.md', function (ctx) {
  const hit = path.join(__dirname, 'docs', '使用说明.md');
  if (!fs.existsSync(hit)) return sendJson(ctx.res, 404, { error: '使用说明文件不存在' });
  send(ctx.res, 200, fs.readFileSync(hit), {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent('使用说明.md'),
  });
}, { public: true });

route('GET', '/api/scales', function (ctx) {
  sendJson(ctx.res, 200, { items: visibleFor(dbm.listScales(), viewerOf(ctx.req)) });
});

route('GET', '/api/scales/:id', function (ctx) {
  const s = dbm.getScale(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '量表不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该量表' });
  sendJson(ctx.res, 200, s);
});

route('POST', '/api/scales', async function (ctx) {
  const v = viewerOf(ctx.req);
  const body = await readBody(ctx.req);
  if (body.fromTemplateId) {
    const src = dbm.getScale(Number(body.fromTemplateId));
    if (!src) return sendJson(ctx.res, 404, { error: '模板不存在' });
    if (!canView(src, v)) return sendJson(ctx.res, 403, { error: '无权复制该量表' });
    const copy = deepCopy(src);
    delete copy.id;
    copy.code = src.code + '-copy-' + dbm.randomToken(5);
    copy.title = body.title || (src.title + '（副本）');
    copy.isTemplate = false;
    copy.isBuiltin = false;
    const id = dbm.insertScale(copy, { ownerId: v && v.id });
    dbm.log('scale_copy', src.title + ' -> #' + id);
    return sendJson(ctx.res, 200, dbm.getScale(id));
  }
  if (body.scale) {
    const t = deepCopy(body.scale);
    t.code = t.code && !/^blank/.test(t.code) ? t.code + '-' + dbm.randomToken(5) : 'custom-' + dbm.randomToken(6);
    t.isTemplate = false;
    const id = dbm.insertScale(t, { ownerId: v && v.id });
    dbm.log('scale_create', t.title + ' #' + id);
    return sendJson(ctx.res, 200, dbm.getScale(id));
  }
  sendJson(ctx.res, 400, { error: '缺少参数' });
});

route('PUT', '/api/scales/:id', async function (ctx) {
  const id = Number(ctx.params.id);
  const cur = dbm.getScale(id);
  if (!cur) return sendJson(ctx.res, 404, { error: '量表不存在' });
  if (!canEdit(cur, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权修改该量表' });
  if (cur.isBuiltin) {
    return sendJson(ctx.res, 400, { error: '内置模板不可直接修改，请先"创建副本"后再编辑。' });
  }
  const body = await readBody(ctx.req);
  const next = Object.assign({}, cur, body);
  const updated = dbm.updateScale(id, next);
  dbm.log('scale_update', updated.title + ' #' + id);
  sendJson(ctx.res, 200, updated);
});

route('DELETE', '/api/scales/:id', function (ctx) {
  const cur = dbm.getScale(Number(ctx.params.id));
  if (!cur) return sendJson(ctx.res, 404, { error: '量表不存在' });
  if (!canEdit(cur, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权删除该量表' });
  const r = dbm.deleteScale(Number(ctx.params.id));
  sendJson(ctx.res, r.ok ? 200 : 400, r.ok ? { ok: true } : { error: r.message });
});

route('GET', '/api/licensed-notes', function (ctx) {
  sendJson(ctx.res, 200, { items: LICENSED_NOTES });
});

/** 量表目录（需授权/需培训/条目过长的量表元数据，可全文检索） */
route('GET', '/api/scale-catalog', function (ctx) {
  sendJson(ctx.res, 200, { items: CATALOG, categories: CATEGORIES });
});

/* ---- 量表导入（上传文件 → 自动识别） ---- */
route('POST', '/api/import/parse', async function (ctx) {
  // 解析与 OCR 是全站最贵的操作，公网访问必须先按来源限流
  if (throttle(ctx, 'upload')) return;
  const body = await readBody(ctx.req);
  const name = String(body.filename || 'upload');
  if (!body.data) return sendJson(ctx.res, 400, { error: '缺少文件内容' });
  let buffer;
  try {
    buffer = Buffer.from(String(body.data).replace(/^data:[^,]+,/, ''), 'base64');
  } catch (e) {
    return sendJson(ctx.res, 400, { error: '文件内容解码失败' });
  }
  if (buffer.length > 20 * 1024 * 1024) return sendJson(ctx.res, 400, { error: '文件过大（上限 20 MB）' });
  importer.parseFile(name, buffer, function (result) {
    dbm.log('import_parse', name + ' → 识别 ' + result.items.length + ' 题（' + result.kind + '）');
    sendJson(ctx.res, 200, {
      filename: name,
      kind: result.kind,
      ocr: !!result.ocr,
      structured: !!result.structured,
      needManual: !!result.needManual,
      items: result.items,
      dimensions: result.dimensions || [],
      warnings: result.warnings || [],
      rawText: (result.rawText || '').slice(0, 12000),
    });
  });
});

route('GET', '/api/import-template.csv', function (ctx) {
  send(ctx.res, 200, importer.templateCsv(), {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('量表导入模板.csv'),
  });
});

/** 单个答卷详情 */
route('GET', '/api/surveys/:id/response/:rid', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  const r = dbm.listResponses(s.id).find(function (x) { return String(x.id) === String(ctx.params.rid) || String(x.pid) === String(ctx.params.rid); });
  if (!r) return sendJson(ctx.res, 404, { error: '答卷不存在' });
  const items = scale.definition.items.map(function (it) {
    const v = r.answers[it.id];
    let display = v;
    if (Array.isArray(v)) {
      display = v.map(function (x) {
        const hit = (it.options || []).find(function (o) { return String(o.value) === String(x); });
        return hit ? hit.label : x;
      });
    } else if (v !== undefined && v !== null && v !== '') {
      const hit = (it.options || []).find(function (o) { return String(o.value) === String(v); });
      display = hit ? hit.label : v;
    }
    return { id: it.id, no: it.no, text: it.text, type: it.type, value: display === undefined ? null : display };
  });
  sendJson(ctx.res, 200, {
    id: r.id, pid: r.pid, submittedAt: r.submittedAt, durationSec: r.durationSec,
    consent: r.consent, meta: r.meta, scores: r.scores, items: items,
  });
});

/* 预览计分（不保存数据，用于编辑器预览） */
route('POST', '/api/preview-score', async function (ctx) {
  const body = await readBody(ctx.req);
  const def = body.definition || {};
  const errors = validateAnswers(def, body.answers || {});
  if (errors.length) return sendJson(ctx.res, 400, { error: '有题目未作答', details: errors });
  const { scoreResponse } = require('./lib/scoring.js');
  sendJson(ctx.res, 200, scoreResponse(def, body.answers || {}));
});

/* ---- 调查发布 ---- */
route('GET', '/api/surveys', function (ctx) {
  sendJson(ctx.res, 200, { items: visibleFor(dbm.listSurveys(), viewerOf(ctx.req)) });
});

route('POST', '/api/surveys', async function (ctx) {
  const v = viewerOf(ctx.req);
  const body = await readBody(ctx.req);
  const scale = dbm.getScale(Number(body.scaleId));
  if (!scale) return sendJson(ctx.res, 404, { error: '量表不存在' });
  if (!canView(scale, v)) return sendJson(ctx.res, 403, { error: '无权使用该量表' });
  const s = dbm.createSurvey(scale.id, {
    name: body.name || scale.title,
    anonymous: body.anonymous !== false,
    maxResponses: body.maxResponses ? Number(body.maxResponses) : null,
    closesAt: body.closesAt || null,
    showResult: !!body.showResult,
    collectMeta: body.collectMeta !== false,
    note: body.note || '',
    ownerId: v && v.id,
  });
  dbm.log('survey_create', s.name + ' #' + s.id + ' token=' + s.token);
  sendJson(ctx.res, 200, s);
});

route('GET', '/api/surveys/:id', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  s.scale = scale;
  s.state = dbm.surveyState(s);
  sendJson(ctx.res, 200, s);
});

route('PATCH', '/api/surveys/:id', async function (ctx) {
  const cur = dbm.getSurvey(Number(ctx.params.id));
  if (!cur) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canEdit(cur, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权修改该调查' });
  const body = await readBody(ctx.req);
  const s = dbm.updateSurvey(cur.id, body);
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  dbm.log('survey_update', JSON.stringify(body));
  sendJson(ctx.res, 200, s);
});

route('DELETE', '/api/surveys/:id', function (ctx) {
  const cur = dbm.getSurvey(Number(ctx.params.id));
  if (!cur) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canEdit(cur, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权删除该调查' });
  dbm.deleteSurvey(cur.id);
  dbm.log('survey_delete', '#' + ctx.params.id);
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/surveys/:id/report', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  const responses = dbm.listResponses(s.id);
  const report = buildReport(scale.definition, responses, { groupVariableId: ctx.query.group || null });
  report.survey = s;
  report.scaleMeta = {
    id: scale.id, title: scale.title, category: scale.category, description: scale.description,
    instructions: scale.instructions, source: scale.source, license: scale.license,
  };
  report.items.map(function (it, i) {
    const def = scale.definition.items[i];
    it.options = def ? def.options : undefined;
    return it;
  });
  // 供前端绘图与原始数据表使用的附加信息
  report.scoreValues = responses.map(function (r) { return r.scores ? r.scores.total : null; });
  report.rawRows = responses.slice(0, 300).map(function (r) {
    return {
      pid: r.pid,
      submittedAt: r.submittedAt,
      durationSec: r.durationSec,
      cells: scale.definition.items.map(function (it) { return answerLabel(it, r.answers[it.id], '/'); }),
      total: r.scores ? r.scores.total : null,
      cut: r.scores && r.scores.cut ? r.scores.cut.label : '',
    };
  });
  report.avgDurationSec = (function () {
    const ds = responses.map(function (r) { return r.durationSec; }).filter(function (v) { return typeof v === 'number' && v > 0 && v < 7200; });
    if (!ds.length) return null;
    return Math.round(ds.reduce(function (a, b) { return a + b; }, 0) / ds.length);
  }());
  sendJson(ctx.res, 200, report);
});

route('GET', '/api/surveys/:id/export.csv', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  const responses = dbm.listResponses(s.id);
  const items = scale.definition.items;
  const header = ['答卷编号', '提交时间', '用时(秒)', '是否同意知情同意'];
  items.forEach(function (it) { header.push('第' + it.no + '题 ' + String(it.text).replace(/\s+/g, ' ')); });
  (scale.definition.dimensions || []).forEach(function (d) { header.push('维度-' + d.name); });
  header.push('总分', '分级');
  if (s.collectMeta) { header.push('IP'); }

  const rows = [header];
  responses.forEach(function (r) {
    const label = function (it) { return answerLabel(it, r.answers[it.id], '|'); };
    const row = [r.pid, r.submittedAt, r.durationSec === null ? '' : r.durationSec, r.consent ? '是' : '否'];
    items.forEach(function (it) { row.push(label(it)); });
    const sc = r.scores || {};
    (scale.definition.dimensions || []).forEach(function (d) {
      const dv = sc.dimensions && sc.dimensions[d.id];
      row.push(dv && dv.score !== null && dv.score !== undefined ? dv.score : '');
    });
    row.push(sc.total === null || sc.total === undefined ? '' : sc.total);
    row.push(sc.cut ? sc.cut.label : '');
    if (s.collectMeta) row.push(r.meta && r.meta.ip ? r.meta.ip : '');
    rows.push(row);
  });

  const csv = coreHttp.csvRows(rows);
  const fname = encodeURIComponent(s.name + '-数据导出.csv');
  dbm.log('export_csv', s.name + ' n=' + responses.length);
  send(ctx.res, 200, csv, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': "attachment; filename*=UTF-8''" + fname,
  });
});

route('GET', '/api/surveys/:id/export.json', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  const responses = dbm.listResponses(s.id);
  const report = buildReport(scale.definition, responses);
  const body = JSON.stringify({
    exportedAt: new Date().toISOString(),
    survey: s,
    scale: scale.definition,
    scaleMeta: { title: scale.title, source: scale.source, license: scale.license },
    responses: responses,
    report: report,
  }, null, 2);
  const fname = encodeURIComponent(s.name + '-完整数据与统计.json');
  send(ctx.res, 200, body, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': "attachment; filename*=UTF-8''" + fname,
  });
});

/** SPSS/R 数值编码版导出：选择题导出为分值（多选拆分为 0/1 虚拟变量） */
route('GET', '/api/surveys/:id/export-spss.csv', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  const responses = dbm.listResponses(s.id);
  const items = scale.definition.items;
  const dims = scale.definition.dimensions || [];

  const header = ['ID', 'SUBMIT', 'DURATION', 'CONSENT'];
  const specs = [];
  items.forEach(function (it) {
    if (it.type === 'checkbox') {
      (it.options || []).forEach(function (o, i) {
        const name = 'Q' + it.no + '_' + (i + 1);
        header.push(name);
        specs.push({ kind: 'multi', itemId: it.id, value: o.value });
      });
    } else if (it.type === 'radio' || it.type === 'select' || it.type === 'number' || it.type === 'slider') {
      header.push('Q' + it.no);
      specs.push({ kind: 'num', itemId: it.id });
    } else {
      header.push('Q' + it.no + '_TXT');
      specs.push({ kind: 'text', itemId: it.id });
    }
  });
  dims.forEach(function (d) {
    header.push('DIM_' + d.id.toUpperCase());
    specs.push({ kind: 'dim', dimId: d.id });
  });
  header.push('TOTAL');
  specs.push({ kind: 'total' });
  header.push('GRADE');
  specs.push({ kind: 'grade' });

  const rows = [header];
  responses.forEach(function (r, idx) {
    const row = ['P' + String(idx + 1).padStart(4, '0'), String(r.submittedAt || '').replace('T', ' ').slice(0, 19),
      r.durationSec === null || r.durationSec === undefined ? '' : r.durationSec, r.consent ? 1 : 0];
    specs.forEach(function (sp) {
      const sc = r.scores || {};
      if (sp.kind === 'num') {
        const v = r.answers[sp.itemId];
        row.push(v === undefined || v === null || v === '' ? '' : Number(v));
      } else if (sp.kind === 'multi') {
        const arr = r.answers[sp.itemId];
        const list = Array.isArray(arr) ? arr.map(String) : (arr === undefined || arr === null || arr === '' ? [] : [String(arr)]);
        row.push(list.indexOf(String(sp.value)) >= 0 ? 1 : 0);
      } else if (sp.kind === 'text') {
        const v = r.answers[sp.itemId];
        row.push(v === undefined || v === null ? '' : v);
      } else if (sp.kind === 'dim') {
        const d = sc.dimensions && sc.dimensions[sp.dimId];
        row.push(d && d.score !== null && d.score !== undefined ? d.score : '');
      } else if (sp.kind === 'total') {
        row.push(sc.total === null || sc.total === undefined ? '' : sc.total);
      } else if (sp.kind === 'grade') {
        const cuts = (scale.definition.scoring || {}).cutoffs || [];
        const i = cuts.findIndex(function (c) { return sc.cut && c.label === sc.cut.label; });
        row.push(i >= 0 ? i + 1 : '');
      }
    });
    rows.push(row);
  });

  const csv = coreHttp.csvRows(rows);
  const fname = encodeURIComponent(s.name + '-SPSS数值版.csv');
  dbm.log('export_spss', s.name + ' n=' + responses.length);
  send(ctx.res, 200, csv, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': "attachment; filename*=UTF-8''" + fname,
  });
});

/** 变量说明（codebook）：题目与变量名对照，便于 SPSS 中设置变量标签 */
route('GET', '/api/surveys/:id/codebook.csv', function (ctx) {
  const s = dbm.getSurvey(Number(ctx.params.id));
  if (!s) return sendJson(ctx.res, 404, { error: '调查不存在' });
  if (!canView(s, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该调查' });
  const scale = dbm.getScale(s.scaleId);
  const rows = [['变量名', '类型', '题目', '取值说明']];
  scale.definition.items.forEach(function (it) {
    if (it.type === 'checkbox') {
      (it.options || []).forEach(function (o, i) {
        rows.push(['Q' + it.no + '_' + (i + 1), '二分类(0/1)', it.text, '选中"' + o.label + '"=1，否则=0']);
      });
    } else if (['radio', 'select', 'number', 'slider'].indexOf(it.type) >= 0) {
      const map = (it.options || []).map(function (o) { return o.label + '=' + o.value; }).join('；');
      rows.push(['Q' + it.no, it.type === 'number' || it.type === 'slider' ? '连续变量' : '分类/等级变量', it.text, map || '数值']);
    } else {
      rows.push(['Q' + it.no + '_TXT', '文本', it.text, '']);
    }
  });
  (scale.definition.dimensions || []).forEach(function (d) {
    rows.push(['DIM_' + d.id.toUpperCase(), '连续变量', '维度得分：' + d.name, '含 ' + (d.items || []).length + ' 个条目']);
  });
  rows.push(['TOTAL', '连续变量', '总分', '计分方式：' + JSON.stringify((scale.definition.scoring || {}).method || 'none')]);
  rows.push(['GRADE', '等级变量', '分级判读', ((scale.definition.scoring || {}).cutoffs || []).map(function (c, i) { return (i + 1) + '=' + c.label; }).join('；')]);
  const csv = coreHttp.csvRows(rows);
  const fname = encodeURIComponent(s.name + '-变量说明.csv');
  send(ctx.res, 200, csv, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': "attachment; filename*=UTF-8''" + fname,
  });
});

/* ---- 公开填写 ---- */
route('GET', '/api/join/:token', function (ctx) {
  const s = dbm.getSurveyByToken(ctx.params.token);
  if (!s) return sendJson(ctx.res, 404, { error: '问卷链接无效或已失效' });
  const scale = dbm.getScale(s.scaleId);
  const state = dbm.surveyState(s);
  const study = s.studyId ? dbm.getStudy(s.studyId) : null;
  sendJson(ctx.res, 200, {
    survey: {
      name: s.name, status: s.status, anonymous: s.anonymous, showResult: s.showResult,
      closesAt: s.closesAt, note: s.note,
      studyId: s.studyId, studyName: study ? study.name : null,
      wave: s.wave, waveLabel: s.waveLabel, subjectMode: s.subjectMode,
    },
    open: state.open,
    reason: state.reason || null,
    responded: state.count,
    suggestSubjectCode: (study && s.subjectMode === 'auto') ? dbm.nextSubjectCode(study.id) : null,
    waves: study ? study.waves.map(function (w) { return { wave: w.wave, label: w.waveLabel, url: '/s/' + w.token }; }) : null,
    scale: {
      title: scale.title,
      description: scale.description,
      instructions: scale.instructions,
      consentOn: scale.consentOn,
      consentText: scale.consentText,
      definition: scale.definition,
    },
  });
}, { public: true });

route('POST', '/api/join/:token', async function (ctx) {
  // 提交是公网匿名可调的写入口，按来源限流；额度按「一个科室集体扫码」留足
  if (throttle(ctx, 'join')) return;
  const s = dbm.getSurveyByToken(ctx.params.token);
  if (!s) return sendJson(ctx.res, 404, { error: '问卷链接无效' });
  const scale = dbm.getScale(s.scaleId);
  const state = dbm.surveyState(s);
  if (!state.open) return sendJson(ctx.res, 400, { error: state.reason });

  const body = await readBody(ctx.req);
  if (scale.consentOn && !body.consent) {
    return sendJson(ctx.res, 400, { error: '请先阅读并同意知情同意说明' });
  }
  // 随访：受试者编号（用于跨时点配对）
  let subjectId = body.subjectId ? String(body.subjectId).trim().slice(0, 40) : null;
  const study = s.studyId ? dbm.getStudy(s.studyId) : null;
  if (study) {
    if (!subjectId) {
      if (s.subjectMode === 'auto') subjectId = dbm.nextSubjectCode(study.id);
      else return sendJson(ctx.res, 400, { error: '请填写您的随访编号（由研究方提供）' });
    }
    const dup = dbm.findResponseBySubject(s.id, subjectId);
    if (dup) {
      return sendJson(ctx.res, 400, {
        error: '编号 ' + subjectId + ' 在本次随访中已提交过（' + String(dup.submitted_at || '').slice(0, 16).replace('T', ' ') + '）。如确需重新填写请联系研究负责人。',
      });
    }
  }
  const errors = validateAnswers(scale.definition, body.answers || {});
  if (errors.length) return sendJson(ctx.res, 400, { error: '有题目未作答', details: errors });

  const saved = dbm.saveResponse(s, scale, {
    answers: body.answers,
    consent: !!body.consent,
    durationSec: body.durationSec ? Math.round(Number(body.durationSec)) : null,
    pid: body.pid || null,
    startedAt: body.startedAt || null,
    subjectId: subjectId,
    meta: {
      ip: clientIp(ctx.req, s),
      ua: s.collectMeta ? String(ctx.req.headers['user-agent'] || '').slice(0, 180) : '',
    },
  });
  dbm.log('response_submit', s.name + ' #' + saved.id + ' total=' + (saved.scores && saved.scores.total));

  const payload = { ok: true, pid: saved.pid, submittedAt: new Date().toISOString() };
  if (subjectId) payload.subjectId = subjectId;
  if (s.showResult && saved.scores) {
    payload.result = {
      total: saved.scores.total,
      cut: saved.scores.cut,
      dimensions: saved.scores.dimensions,
      flags: saved.scores.flags,
      completeness: saved.scores.completeness,
      expected: saved.scores.expected,
      answered: saved.scores.answered,
      skipped: saved.scores.skipped || [],
      ended: !!saved.scores.ended,
    };
  }
  sendJson(ctx.res, 200, payload);
}, { public: true });

/* ---- 二维码 ---- */
/* ---- 随访研究 ---- */

route('GET', '/api/studies', function (ctx) {
  sendJson(ctx.res, 200, { items: visibleFor(dbm.listStudies(), viewerOf(ctx.req)) });
});

route('POST', '/api/studies', async function (ctx) {
  const v = viewerOf(ctx.req);
  const body = await readBody(ctx.req);
  const scale = dbm.getScale(Number(body.scaleId));
  if (!scale) return sendJson(ctx.res, 404, { error: '量表不存在' });
  if (!canView(scale, v)) return sendJson(ctx.res, 403, { error: '无权使用该量表' });
  const waves = (body.waves || []).filter(function (w) { return w && w.label; });
  if (!waves.length) return sendJson(ctx.res, 400, { error: '请至少设置一个随访时点' });
  const r = dbm.createStudy(scale.id, {
    name: body.name || scale.title + ' 随访研究',
    waves: waves,
    subjectMode: body.subjectMode === 'self' ? 'self' : 'auto',
    showResult: !!body.showResult,
    collectMeta: body.collectMeta !== false,
    note: body.note || '',
    ownerId: v && v.id,
  });
  dbm.log('study_create', r.study.name + ' #' + r.study.id + ' 时点 ' + waves.length + ' 个');
  sendJson(ctx.res, 200, r);
});

route('GET', '/api/studies/:id', function (ctx) {
  const st = dbm.getStudy(Number(ctx.params.id));
  if (!st) return sendJson(ctx.res, 404, { error: '随访研究不存在' });
  if (!canView(st, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该随访研究' });
  st.scale = dbm.getScale(st.scaleId);
  sendJson(ctx.res, 200, st);
});

route('DELETE', '/api/studies/:id', function (ctx) {
  const cur = dbm.getStudy(Number(ctx.params.id));
  if (!cur) return sendJson(ctx.res, 404, { error: '随访研究不存在' });
  if (!canEdit(cur, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权删除该随访研究' });
  dbm.deleteStudy(cur.id);
  dbm.log('study_delete', '#' + ctx.params.id);
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/studies/:id/report', function (ctx) {
  const st = dbm.getStudy(Number(ctx.params.id));
  if (!st) return sendJson(ctx.res, 404, { error: '随访研究不存在' });
  if (!canView(st, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该随访研究' });
  const scale = dbm.getScale(st.scaleId);
  const waves = st.waves.map(function (w) {
    return {
      id: w.id, label: w.waveLabel, token: w.token, url: '/s/' + w.token,
      open: dbm.surveyState(w).open,
      responses: dbm.listResponses(w.id),
    };
  });
  const report = buildFollowup(scale.definition, waves);
  report.study = st;
  report.scaleMeta = { id: scale.id, title: scale.title, source: scale.source, license: scale.license };
  sendJson(ctx.res, 200, report);
});

/** 随访宽表导出：一行一个受试者，列 = 各时点总分/分级（可直接做重复测量方差分析） */
route('GET', '/api/studies/:id/export-wide.csv', function (ctx) {
  const st = dbm.getStudy(Number(ctx.params.id));
  if (!st) return sendJson(ctx.res, 404, { error: '随访研究不存在' });
  if (!canView(st, viewerOf(ctx.req))) return sendJson(ctx.res, 403, { error: '无权查看该随访研究' });
  const scale = dbm.getScale(st.scaleId);
  const waves = st.waves.map(function (w) {
    return { id: w.id, label: w.waveLabel, wave: w.wave, responses: dbm.listResponses(w.id) };
  });
  const header = ['SUBJECT'];
  waves.forEach(function (w) {
    header.push('W' + w.wave + '_TOTAL');
    (scale.definition.dimensions || []).forEach(function (d) {
      header.push('W' + w.wave + '_DIM_' + d.id.toUpperCase());
    });
    header.push('W' + w.wave + '_GRADE');
  });
  if (waves.length > 1) {
    for (let i = 0; i + 1 < waves.length; i += 1) header.push('DELTA_W' + waves[i].wave + 'W' + waves[i + 1].wave);
  }
  const rows = [header];
  const subj = {};
  waves.forEach(function (w) {
    w.responses.forEach(function (r) {
      const sid = r.subjectId || ('UNLINKED_' + r.pid);
      if (!subj[sid]) subj[sid] = {};
      subj[sid][w.id] = r;
    });
  });
  Object.keys(subj).sort().forEach(function (sid) {
    const row = [sid];
    const totals = [];
    waves.forEach(function (w) {
      const r = subj[sid][w.id];
      const sc = r && r.scores ? r.scores : {};
      row.push(sc.total === null || sc.total === undefined ? '' : sc.total);
      (scale.definition.dimensions || []).forEach(function (d) {
        const dv = sc.dimensions && sc.dimensions[d.id];
        row.push(dv && dv.score !== null && dv.score !== undefined ? dv.score : '');
      });
      row.push(r && sc.cut ? sc.cut.label : '');
      totals.push(sc.total === null || sc.total === undefined ? null : sc.total);
    });
    for (let i = 0; i + 1 < totals.length; i += 1) {
      row.push(totals[i] === null || totals[i + 1] === null ? '' : totals[i] - totals[i + 1]);
    }
    rows.push(row);
  });
  const fname = encodeURIComponent(st.name + '-随访宽表.csv');
  dbm.log('export_wide', st.name + ' 受试者 ' + (rows.length - 1) + ' 人');
  send(ctx.res, 200, coreHttp.csvRows(rows), {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': "attachment; filename*=UTF-8''" + fname,
  });
});

route('GET', '/api/qr.png', function (ctx) {
  const text = ctx.query.text || '';
  if (!text) return sendJson(ctx.res, 400, { error: '缺少 text 参数' });
  const scale = Math.min(20, Math.max(2, Number(ctx.query.scale || 8)));
  try {
    const png = qr.png(text, scale, 4);
    send(ctx.res, 200, png, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
  } catch (e) {
    sendJson(ctx.res, 400, { error: e.message });
  }
}, { public: true });

/* ---------------- 静态文件与调度 ---------------- */
const SHARED_LOGIC_FILE = path.join(__dirname, 'lib', 'logic.js');

/**
 * 静态文件指纹：用大小 + 修改时间算，改一次文件就换一次 ETag。
 * 没有构建步骤，拿不到内容哈希，但五分钟的回看窗口对这份工具站足够，
 * 而首页 HTML 始终不缓存，改版刷新即生效。
 */
const STATIC_MAX_AGE = 300;

function staticEtag(file) {
  const st = fs.statSync(file);
  return '"' + crypto.createHash('sha1').update(st.size + '-' + st.mtimeMs).digest('hex').slice(0, 16) + '"';
}

function sendStatic(req, res, file, contentType) {
  const tag = staticEtag(file);
  const cache = 'public, max-age=' + STATIC_MAX_AGE;
  if (String(req.headers['if-none-match'] || '') === tag) {
    res.writeHead(304, { 'Cache-Control': cache, ETag: tag });
    res.end();
    return;
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': contentType, 'Cache-Control': cache, ETag: tag });
}

function serveStatic(req, res, pathname) {
  // 前后端共用的跳题引擎：源码在 lib/ 下，单独按 JS 提供，浏览器与 Node 加载的是同一个文件
  if (pathname === '/logic.js') {
    sendStatic(req, res, SHARED_LOGIC_FILE, 'application/javascript; charset=utf-8');
    return true;
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel.indexOf('/s/') === 0) rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  // 入口 HTML 不缓存：它决定浏览器加载哪一版 app.js
  if (ext === '.html') {
    send(res, 200, fs.readFileSync(filePath), { 'Content-Type': MIME[ext] });
    return true;
  }
  sendStatic(req, res, filePath, MIME[ext] || 'application/octet-stream');
  return true;
}

/**
 * 解析请求地址。
 * 用 WHATWG URL 取代 Node 已废弃的旧解析接口（DEP0169），
 * 并把百分号编码非法的地址在这里挡下 —— 此前 decodeURIComponent 会直接抛出 URIError。
 */
function parseRequestUrl(req) {
  let u;
  try {
    u = new URL(req.url, 'http://' + (req.headers && req.headers.host || 'localhost'));
  } catch (e) { return null; }
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); } catch (e) { return null; }
  const query = {};
  u.searchParams.forEach(function (value, key) {
    if (!(key in query)) query[key] = value;
    else if (Array.isArray(query[key])) query[key].push(value);
    else query[key] = [query[key], value];
  });
  return { pathname: pathname, query: query };
}

const INTERNAL_ERROR = '服务器处理时出错，请稍后重试；若反复失败，请把操作时间与步骤反馈给平台管理员。';

async function handleRequest(req, res) {
  applyBaseHeaders(req, res);
  const parsed = parseRequestUrl(req);
  if (!parsed) return sendJson(res, 400, { error: '地址格式有误（百分号编码不完整）' });
  const pathname = parsed.pathname;
  const query = parsed.query;

  // 反向代理与外部监控的探活点：只回答"活着"，不回答"里面有什么"
  if (pathname === '/healthz') {
    return sendJson(res, 200, { ok: true }, { 'Cache-Control': 'no-store' });
  }

  if (pathname.indexOf('/api/') === 0) {
    for (let i = 0; i < routes.length; i += 1) {
      const r = routes[i];
      if (r.method !== req.method) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach(function (k, idx) { params[k] = m[idx + 1]; });
      if (r.auth && !isAuthed(req)) return sendJson(res, 401, { error: '请先登录' });
      try {
        await r.handler({ req: req, res: res, params: params, query: query });
      } catch (e) {
        console.error('[error]', pathname, e);
        // 细节只进服务端日志：原始异常常带 SQL、表名与文件路径，不该出现在给浏览器的响应里
        if (!res.headersSent) sendJson(res, 500, { error: INTERNAL_ERROR });
      }
      return;
    }
    // legacy 表未命中：交给 core 注册表兜底（过渡期注册表为空，等价于原来的 404）
    const s = sessionOf(req);
    const result = await coreRegistry.dispatch({
      method: req.method, path: pathname, query: query, body: null,
      ip: peerIp(req), session: s ? { userId: s.userId, admin: isAdmin(req) ? 1 : 0 } : null,
      env: process.env, caps: NODE_CAPS, req: req, res: res,
    });
    return writeResult(res, result, req);
  }

  if (serveStatic(req, res, pathname)) return;
  send(res, 404, '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>页面不存在 · 医学量表与问卷平台</title>' +
    '<link rel="stylesheet" href="/styles.css"></head><body>' +
    '<main class="main" id="main" tabindex="-1"><div style="max-width:560px;margin:64px auto 0">' +
    '<div class="card" style="text-align:center"><div style="font-size:40px;line-height:1" aria-hidden="true">🧭</div>' +
    '<h1 class="page-title mt8">页面不存在</h1>' +
    '<div class="small muted mt8">没有找到地址 <span class="sha">' + escHtml(pathname) + '</span>，' +
      '可能是链接拼写有误，或该页面已经调整。</div>' +
    '<div class="row mt16" style="justify-content:center;gap:8px">' +
      '<a class="btn primary" href="/">返回首页</a><a class="btn" href="/#/library">量表库</a>' +
      '<a class="btn" href="/#/guide">使用流程</a></div>' +
    '</div></div></main></body></html>', { 'Content-Type': 'text/html; charset=utf-8' });
}

const server = http.createServer(function (req, res) {
  handleRequest(req, res).catch(function (e) {
    console.error('[fatal]', e);
    try { sendJson(res, 500, { error: '服务器内部错误' }); } catch (e2) { /* ignore */ }
  });
});

// ── HTTP 层参数 ────────────────────────────────────────────────────
// keepAliveTimeout 略大于反向代理的 idle_timeout（nginx 默认 75s），
// 避免代理去复用一条 Node 已经关闭的连接；headersTimeout 必须再大一点，
// 否则连接一建立就被掐断。maxHeaderSize 放宽到 64KB：默认 16KB 在
// 长 Cookie 叠加大量代理头时会直接 431。
// requestTimeout 沿用 node 默认 300s —— 局域网内 20MB 量表导入／答卷上传
// 几秒就完成，5 分钟足够宽裕，不必为省资源去掐手机弱网。
server.headersTimeout = 76_000;
server.keepAliveTimeout = 75_000;
server.maxHeaderSize = 64 * 1024;

// ── 进程级兜底 ─────────────────────────────────────────────────────
// 没有这两条时，一个未捕获的异常就会让进程直接死亡，服务就此下线。
// cluster worker 抛异常后以非零码退出，主进程按 cluster.on('exit') 走
// 既有的"补起 + 连续失败熔断"；单进程保持在线，只留日志供排查。
process.on('unhandledRejection', function (reason) {
  console.error('[unhandledRejection]',
    reason instanceof Error ? (reason.stack || reason.message) : String(reason));
});
process.on('uncaughtException', function (err) {
  console.error('[uncaughtException]', err && err.stack ? err.stack : String(err));
  if (cluster.worker) process.exit(1);
});

function announce(port, boundHost) {
  const P = port || PORT;
  const host = boundHost || HOST;
  const lanOpen = host !== '127.0.0.1' && host !== 'localhost';
  const nets = os.networkInterfaces();
  const addrs = [];
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (n) {
      if (n.family !== 'IPv4' || n.internal) return;
      // 只列出局域网可用的私有地址，过滤掉 VPN/虚拟网卡等无效地址
      if (/^192\.168\./.test(n.address) || /^10\./.test(n.address) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) {
        addrs.push(n.address);
      }
    });
  });
  console.log('');
  console.log('  医学量表与问卷平台已启动');
  console.log('  ─────────────────────────────────────────');
  console.log('  本机访问：   http://localhost:' + P);
  if (!lanOpen) {
    console.log('  访问范围：   仅本机。手机扫码填写需与本机处于同一网络，');
    console.log('              请用「启动平台.command」启动，或以 MEDSCALE_LAN=1 node server.js 启动');
  } else {
    addrs.forEach(function (a) { console.log('  局域网访问： http://' + a + ':' + P + '   （手机扫码填写需用这个地址）'); });
    console.log('  ⚠️ 已开放局域网：同一网络内的设备可直接访问本服务与全部数据。');
  }
  const bootPw = dbm.initialAdminPassword();
  console.log('  管理员口令： ' + (dbm.isAdminPasswordDefault()
    ? (bootPw
        ? '首次启动已随机生成：' + bootPw + ' —— 请登录后在"系统设置"中修改'
        : '仍是首次初始化时的口令（见首次启动日志、数据目录下的"管理员初始口令.txt"或部署配置）—— 请登录后在"系统设置"中修改')
    : '已自定义（本机仅保存哈希，不保存明文）'));
  console.log('  注册：       ' + REGISTER_MODE_LABEL[registerMode()] +
    (dbm.countUsers() === 0 ? '（当前为首次启动，可用账号可免码注册成为管理员）' : ''));
  console.log('  数据文件：   ' + dbm.dbPath);
  console.log('  备份目录：   ' + dbm.backupDir + '（系统设置里可一键生成快照）');
  const workers = resolveWorkers(process.env);
  if (workers > 1) {
    console.log('  服务进程：   ' + workers + ' 个 worker 共用同一端口（登录态与限流计数已落库，跨进程一致）');
  }
  console.log('');
}

// 运行地址写在数据文件旁边：测试用 MEDSCALE_DB 拉起临时实例时，
// 不会覆盖（也不会在退出时删掉）正式实例那份供「启动平台.command」使用的地址
const PORT_FILE = path.join(path.dirname(dbm.dbPath), '运行地址.txt');

/** 优雅退出窗口：给在途请求一点时间收尾，超时后强制断开 */
const SHUTDOWN_GRACE_MS = 30_000;

/** 删除运行地址文件；任何退出路径都要走一遍，否则残留会让下次启动读到旧地址 */
function removePortFile() {
  try { if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE); } catch (e) { /* ignore */ }
}

/**
 * 优雅退出：停止接收新连接 → 排空在途请求 → 删除运行地址文件 → 退出。
 * SIGINT（Ctrl+C）与 SIGTERM（launchd 和「停止平台.command」发的就是这个）共用。
 * 先关空闲连接；到点强制关全部，避免某个客户端不关闭就把服务拖住。
 */
function shutdown(cb) {
  let done = false;
  const finish = function () {
    if (done) return;
    done = true;
    removePortFile();
    console.log('\n  服务已停止。');
    if (cb) cb(); else process.exit(0);
  };
  server.close(function () { finish(); });
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  setTimeout(function () {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    finish();
  }, SHUTDOWN_GRACE_MS).unref();
}

function writePortFile(addr) {
  try {
    if (!fs.existsSync(path.dirname(PORT_FILE))) fs.mkdirSync(path.dirname(PORT_FILE), { recursive: true });
    fs.writeFileSync(PORT_FILE, addr);
  } catch (e) { /* ignore */ }
}

/** 单进程足够撑起科室规模的使用量；worker 数是显式选择出来的，不是默认打开的 */
const MAX_WORKERS = 16;

/** MEDSCALE_WORKERS：不设或 0/非法值 → 单进程；max → 按 CPU 核数；数字 → 该数量（封顶 16） */
function resolveWorkers(env) {
  const raw = String((env || {}).MEDSCALE_WORKERS || '').trim().toLowerCase();
  if (!raw || raw === '0') return 1;
  const n = (raw === 'max' || raw === 'all') ? os.cpus().length : Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_WORKERS);
}

/** 运行地址文件只由主进程写：worker 各自写会互相覆盖，退出时还会删掉别人正在用的文件 */
function writesPortFile(isPrimary) { return isPrimary === true; }

/**
 * 监听失败时的处置策略。
 * 端口一旦变化，此前发放的二维码与填写链接（含 host:port）会全部失效，
 * 因此端口被占用时直接失败退出，绝不顺延；仅允许「同端口回退到 127.0.0.1」这一种不改变 URL 的重试。
 */
function planListenRetry(err, st) {
  const code = err && err.code;
  if (code === 'EADDRINUSE') {
    return {
      fail: '端口 ' + st.basePort + ' 已被占用。\n' +
        '  为避免已发放的二维码与填写链接失效，本程序不会自动更换端口。\n' +
        '  查看占用进程： lsof -nP -iTCP:' + st.basePort + ' -sTCP:LISTEN\n' +
        '  若已有另一个平台实例在运行，请先关闭它；确需换端口请用固定值启动：\n' +
        '    PORT=' + (st.basePort + 1) + ' node server.js',
    };
  }
  if (code === 'EACCES' || code === 'EPERM') {
    if (!st.triedLocalFallback) {
      return {
        retry: { port: st.basePort, host: '127.0.0.1' },
        notice: '无法监听 ' + st.host + ':' + st.basePort + '（' + code + '），改用本机 127.0.0.1 重试（端口不变，本机链接仍有效，局域网扫码暂不可用）',
      };
    }
    return { fail: '无法监听端口 ' + st.basePort + '（' + code + '）。请改用 1024 以上的端口：PORT=5173 node server.js' };
  }
  return { fail: (err && err.message) || '未知错误' };
}

const listenState = { basePort: PORT, host: HOST, triedLocalFallback: false };

server.on('error', function (err) {
  const plan = planListenRetry(err, listenState);
  if (plan.retry) {
    listenState.triedLocalFallback = true;
    console.warn('\n  ⚠️ ' + plan.notice + '\n');
    server.listen(plan.retry.port, plan.retry.host);
    return;
  }
  console.error('\n  ✖ 启动失败：' + plan.fail + '\n');
  removePortFile();
  process.exit(1);
});

if (require.main === module) {
  const WORKERS = resolveWorkers(process.env);
  if (WORKERS > 1 && cluster.isPrimary) {
    // 主进程不监听端口，只负责看住 worker；端口由内核在多个 worker 之间分流
    for (let i = 0; i < WORKERS; i += 1) cluster.fork();
    let exits = 0;
    cluster.on('exit', function (worker, code) {
      exits += 1;
      // 反复启动失败（多数是端口被占用）时不要无限补进程
      if (exits > WORKERS * 3) {
        console.error('\n  ✖ worker 连续异常退出，停止拉起。请检查端口 ' + PORT + ' 是否被占用。\n');
        process.exit(1);
      }
      console.warn('\n  ⚠️ worker ' + worker.process.pid + ' 退出（code ' + code + '），已补起新的\n');
      cluster.fork();
    });
    announce(PORT, HOST);
    writePortFile('http://localhost:' + PORT);
    const stopPrimary = function () {
      Object.keys(cluster.workers || {}).forEach(function (id) {
        try { cluster.workers[id].kill('SIGTERM'); } catch (e) { /* ignore */ }
      });
      removePortFile();
      console.log('\n  服务已停止。');
      process.exit(0);
    };
    // SIGINT 是 Ctrl+C；SIGTERM 是 launchd 和「停止平台.command」发的
    process.on('SIGINT', stopPrimary);
    process.on('SIGTERM', stopPrimary);
  } else {
    server.on('listening', function () {
      const addr = server.address();
      const p = addr && addr.port ? addr.port : PORT;
      // 启动信息与地址文件只属于主进程/单进程，worker 重复打印会刷屏并互相覆盖同一个文件
      if (writesPortFile(!cluster.isWorker)) {
        announce(p, addr && addr.address ? addr.address : HOST);
        writePortFile('http://localhost:' + p);
      }
    });
    // 启动即清掉可能残留的旧地址文件：上一次实例若被强杀或断电退出，
    // 旧文件会留着。不先清掉，从启动到 listen 回调之间这段窗口内读到的是陈旧地址。
    // listen 成功后 writePortFile 会立即覆写，所以这里只负责让
    // "文件不存在"优先于"文件里是错的"。
    removePortFile();
    server.listen(PORT, HOST);
    if (!cluster.isWorker) {
      // SIGINT 与 SIGTERM 共用：Ctrl+C、launchd、「停止平台.command」都走同一条路径
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }
  }
}

module.exports = {
  handleRequest: handleRequest, server: server, routes: routes,
  coreRegistry: coreRegistry, writeResult: writeResult,
  planListenRetry: planListenRetry,
  resolveHost: resolveHost, peerIp: peerIp, createRateLimiter: createRateLimiter,
  registerOpen: registerOpen,
  sessionStore: sessionStore, dbLimit: dbLimit,
  resolveWorkers: resolveWorkers, writesPortFile: writesPortFile,
  SHUTDOWN_GRACE_MS: SHUTDOWN_GRACE_MS, shutdown: shutdown, removePortFile: removePortFile,
  isHttps: isHttps, securityHeaders: securityHeaders,
  RATE_POLICY: RATE_POLICY, limitKey: limitKey,
};
