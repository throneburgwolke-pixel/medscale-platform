/**
 * Cloudflare Workers 入口（ESM）。
 * 对接 lib/db-d1.js（D1 边缘库）+ 纯逻辑模块（scoring/logic/report/qr），
 * 复用与 server.js 一致的业务规则（会话、登录、注册、邀请码、限流、注册三态、数据归属）。
 * 请求层已对齐前端全部调用（含随访研究、导入解析、SPSS/宽表导出、备份降级）；
 * 未知接口返回 501。文件导入用 lib/parse-edge.js（DecompressionStream，图片 OCR 不支持）。
 */
import { createD1Backend } from './lib/db-d1.js';
import qr from './lib/qr.js';
import { scoreResponse, validateAnswers } from './lib/scoring.js';
import { computeVisibility, answerLabel, pendingItems } from './lib/logic.js';
import { buildReport } from './lib/report.js';
import { buildFollowup } from './lib/followup.js';
import { parseFileEdge } from './lib/parse-edge.js';
import { CATALOG, CATEGORIES, LICENSED_NOTES } from './lib/scales.js';
import * as nodeCrypto from 'node:crypto';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const AUTH_MAX_FAILS = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

/* 跨请求复用 D1 后端（同一 isolate 只初始化一次；并发首请求共享同一次初始化，避免竞态重复灌模板） */
let __backendPromise = null;
async function getBackend(env) {
  if (globalThis.__medscaleBackend) return globalThis.__medscaleBackend;
  if (!__backendPromise) {
    __backendPromise = (async () => {
      const b = createD1Backend(env.DB);
      await b.init(env);
      globalThis.__medscaleBackend = b;
      return b;
    })().catch(function (e) { __backendPromise = null; throw e; });
  }
  return __backendPromise;
}

/* ---------------- 基础工具 ---------------- */
function sha256Hex(s) { return nodeCrypto.createHash('sha256').update(String(s)).digest('hex'); }
function randomToken(n) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = nodeCrypto.randomBytes(n || 24);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
function json(code, obj, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {});
  return new Response(JSON.stringify(obj), { status: code, headers: headers });
}
function html(code, body, extra) {
  const headers = Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, extra || {});
  return new Response(body, { status: code, headers: headers });
}
async function readJson(request) {
  try { const t = await request.text(); return t ? JSON.parse(t) : {}; }
  catch (e) { return {}; }
}
function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function sessionCookie(token, secure) {
  return { 'Set-Cookie': 'msid=' + token + '; Path=/; HttpOnly; SameSite=Lax' +
    (secure ? '; Secure' : '') + '; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000) };
}
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "form-action 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join('; ');
function securityHeaders() {
  return { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'X-Robots-Tag': 'noindex, nofollow' };
}
/* ASSETS 返回的响应不经过 securityHeaders()，静态页此前完全没有 CSP */
function secureAsset(asset) {
  if (!asset) return asset;
  const headers = new Headers(asset.headers);
  const extra = securityHeaders();
  Object.keys(extra).forEach(function (k) { headers.set(k, extra[k]); });
  const nullBody = asset.status === 204 || asset.status === 304;
  return new Response(nullBody ? null : asset.body, { status: asset.status, statusText: asset.statusText, headers: headers });
}
function peerIp(req) {
  // Cloudflare 边缘会覆盖 cf-connecting-ip；x-forwarded-for 可由客户端自带，仅在本地开发时兜底
  const cf = req.headers.get('cf-connecting-ip');
  const xf = req.headers.get('x-forwarded-for');
  const hops = xf ? String(xf).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
  const ip = cf || (hops.length ? hops[hops.length - 1] : '');
  return String(ip || '').replace(/^::ffff:/, '');
}

/* ---------------- 会话 ---------------- */
const sessionStore = {
  async create(info) {
    const token = randomToken(24);
    if (Math.random() < 0.05) await dbm.purgeSessions();
    await dbm.createSession(sha256Hex(token), {
      userId: info.userId === undefined ? null : info.userId, admin: !!info.admin,
      ip: info.ip || '', ttlMs: SESSION_TTL_MS,
    });
    return token;
  },
  async get(token) {
    if (!token) return null;
    const s = await dbm.getSession(sha256Hex(token));
    if (!s) return null;
    const nowIso = dbm.now();
    if (!s.expiresAt || s.expiresAt <= nowIso) { await dbm.deleteSession(sha256Hex(token)); return null; }
    if (!s.lastSeen || s.lastSeen.slice(0, 16) < nowIso.slice(0, 16)) await dbm.touchSession(sha256Hex(token), nowIso);
    return { createdAt: s.createdAt, userId: s.userId, admin: s.admin };
  },
  async del(token) { if (token) await dbm.deleteSession(sha256Hex(token)); },
  async clear() { await dbm.clearSessions(); },
};
function sessionOf(req) { return sessionStore.get(getCookie(req, 'msid')); }
async function isAdmin(req) {
  const s = await sessionOf(req);
  if (!s) return false;
  if (s.userId) return (await dbm.getUser(s.userId) || {}).role === 'admin';
  return s.admin === true;
}
async function requireAdmin(req) {
  if (!(await isAdmin(req))) return false;
  return true;
}

/* ---------------- 限流 ---------------- */
function makeLimiter(dbm) {
  return {
    async limit(key, max, windowMs) {
      const nowMs = Date.now();
      const rec = await dbm.getRateLimit(key);
      if (!rec || nowMs - rec.first > windowMs) { await dbm.setRateLimit(key, nowMs, 1); return { allowed: true }; }
      const n = rec.n + 1;
      await dbm.setRateLimit(key, rec.first, n);
      if (n > max) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((rec.first + windowMs - nowMs) / 1000)) };
      return { allowed: true };
    },
    async reset(key) { await dbm.clearRateLimit(key); },
  };
}

/* ---------------- 注册三态 ---------------- */
async function registerMode(dbm) {
  const m = await dbm.getSetting('register_mode', '');
  if (m === 'closed' || m === 'invite' || m === 'open') return m;
  return (await dbm.getSetting('allow_register', '0')) === '1' ? 'open' : 'invite';
}
async function registerOpen(dbm) { if ((await dbm.countUsers()) === 0) return true; return (await registerMode(dbm)) === 'open'; }
async function registerAvailable(dbm) { if ((await dbm.countUsers()) === 0) return true; return (await registerMode(dbm)) !== 'closed'; }
async function inviteUsable(dbm, inv) {
  if (!inv || inv.revoked) return { ok: false, error: '邀请码无效，请核对后重试' };
  if (inv.expiresAt && inv.expiresAt < dbm.now()) return { ok: false, error: '邀请码已过期，请联系管理员重新生成' };
  if (inv.used >= inv.maxUses) return { ok: false, error: '邀请码使用次数已用完，请联系管理员' };
  return { ok: true, invite: inv };
}

/* ---------------- CSV ---------------- */
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  // 与 core/http.js 保持一致：阻断 Excel 公式注入，纯数字例外
  const plainNumber = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s.trim());
  if (!plainNumber && /^[=+\-@\t\r]/.test(s.replace(/^ +/, ''))) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.map(csvCell).join(','), rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(','); }).join('\n')].join('\n');
}
/* 二维数组 → CSV（BOM + CRLF，与 core/http.js csvRows 一致，用于 SPSS 版/随访宽表导出） */
function csvRows(rows) { return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }

let dbm = null; // 由 fetch 注入

/* ---------------- 路由分发 ---------------- */
async function api(method, path, url, request, env) {
  const limiter = makeLimiter(dbm);
  const ip = peerIp(request);
  const params = {};

  /* 会话 */
  if (method === 'GET' && path === '/api/session') {
    const s = await sessionOf(request);
    const user = s && s.userId ? await dbm.getUser(s.userId) : null;
    const admin = await isAdmin(request);
    const body = { authenticated: !!s, user: user, isAdmin: admin, allowRegister: await registerOpen(dbm),
      registerMode: await registerMode(dbm), registerAvailable: await registerAvailable(dbm),
      siteTitle: await dbm.getSetting('site_title', '医学量表与问卷平台') };
    if (admin) body.defaultPassword = await dbm.isAdminPasswordDefault();
    return json(200, body, securityHeaders());
  }
  if (method === 'POST' && path === '/api/login') {
    const b = await readJson(request);
    const limitKey = ip + '|' + (b.username ? 'u:' + b.username : 'admin-pw');
    const rl = await limiter.limit(limitKey, AUTH_MAX_FAILS, AUTH_WINDOW_MS);
    if (!rl.allowed) return json(429, { error: '尝试次数过多，请 ' + rl.retryAfterSec + ' 秒后再试' }, { 'Retry-After': String(rl.retryAfterSec) });
    if (b.username) {
      const u = await dbm.findUserByUsername(b.username);
      if (!u || !(await dbm.verifyPassword(b.password || '', u.passwordHash))) { await dbm.log('login_failed', '用户 ' + b.username); return json(401, { error: '用户名或密码错误' }); }
      if (u.status !== 'active') return json(403, { error: '账号已被停用，请联系管理员' });
      const token = await sessionStore.create({ userId: u.id, admin: u.role === 'admin', ip: ip });
      await dbm.loginUser(u.id); await dbm.log('login', '用户 ' + u.username); await limiter.reset(limitKey);
      return json(200, { ok: true, user: await dbm.getUser(u.id) }, sessionCookie(token, url.protocol === 'https:'));
    }
    if (!(await dbm.checkAdminPassword(b.password))) { await dbm.log('login_failed', 'IP ' + ip); return json(401, { error: '密码错误' }); }
    const token = await sessionStore.create({ admin: true, ip: ip });
    await dbm.log('login', '管理员密码 IP ' + ip); await limiter.reset(limitKey);
    return json(200, { ok: true }, sessionCookie(token, url.protocol === 'https:'));
  }
  if (method === 'POST' && path === '/api/register') {
    const b = await readJson(request);
    const username = String(b.username || '').trim();
    const limitKey = ip + '|register|' + username;
    const rl = await limiter.limit(limitKey, AUTH_MAX_FAILS, AUTH_WINDOW_MS);
    if (!rl.allowed) return json(429, { error: '尝试次数过多，请 ' + rl.retryAfterSec + ' 秒后再试' }, { 'Retry-After': String(rl.retryAfterSec) });
    const bootstrap = (await dbm.countUsers()) === 0;
    const mode = await registerMode(dbm);
    let invite = null;
    if (!bootstrap) {
      if (mode === 'closed') return json(403, { error: '注册当前已关闭，请联系管理员开通' });
      if (mode === 'invite') {
        if (!String(b.invite || '').trim()) return json(403, { error: '请填写邀请码（由管理员在"系统设置"中生成）' });
        const check = await inviteUsable(dbm, await dbm.findInviteByCode(b.invite));
        if (!check.ok) return json(403, { error: check.error });
        invite = check.invite;
      }
    }
    const password = String(b.password || '');
    if (username.length < 3 || username.length > 32) return json(400, { error: '用户名需 3-32 个字符' });
    if (!/^[\w.@\-\u4e00-\u9fa5]+$/.test(username)) return json(400, { error: '用户名只能包含中文、字母、数字、下划线、点和@' });
    if (password.length < 6) return json(400, { error: '密码至少 6 位' });
    if (b.password2 !== undefined && b.password2 !== password) return json(400, { error: '两次输入的密码不一致' });
    if (invite && !(await dbm.consumeInvite(invite.id))) return json(403, { error: (await inviteUsable(dbm, await dbm.getInvite(invite.id))).error });
    const r = await dbm.createUser({ username: username, password: password, name: b.name || '', org: b.org || '',
      role: bootstrap ? 'admin' : (invite && invite.role === 'admin' ? 'admin' : 'user') });
    if (!r.ok) { if (invite) await dbm.refundInvite(invite.id); return json(400, { error: r.error }); }
    const token = await sessionStore.create({ userId: r.user.id, admin: r.user.role === 'admin', ip: ip });
    await dbm.loginUser(r.user.id); await dbm.log('register', r.user.username + '（' + r.user.role + '）' + (invite ? ' 邀请码 ' + invite.code : ''));
    await limiter.reset(limitKey);
    return json(200, { ok: true, user: r.user }, sessionCookie(token, url.protocol === 'https:'));
  }
  if (method === 'POST' && path === '/api/logout') {
    await sessionStore.del(getCookie(request, 'msid'));
    return json(200, { ok: true });
  }

  /* 概览 / 目录 / 公开元数据（对齐 server.js） */
  if (method === 'GET' && path === '/api/overview') {
    const v = await viewer(request);
    const scales = (await dbm.listScales()).filter(function (s) { return canView(s, v); });
    const surveys = (await dbm.listSurveys()).filter(function (s) { return canView(s, v); });
    return json(200, {
      scaleCount: scales.length,
      templateCount: scales.filter(function (s) { return s.isTemplate; }).length,
      customCount: scales.filter(function (s) { return !s.isTemplate; }).length,
      surveyCount: surveys.length,
      openSurveyCount: surveys.filter(function (s) { return s.status === 'open'; }).length,
      responseCount: surveys.reduce(function (a, s) { return a + (s.responseCount || 0); }, 0),
      catalogCount: CATALOG.length,
      itemTotal: scales.reduce(function (a, s) { return a + ((s.definition && s.definition.items) || []).length; }, 0),
      categories: CATEGORIES,
      recent: surveys.slice(0, 5),
    }, securityHeaders());
  }
  if (method === 'GET' && path === '/api/scale-catalog') {
    return json(200, { items: CATALOG, categories: CATEGORIES }, securityHeaders());
  }
  if (method === 'GET' && path === '/api/licensed-notes') {
    return json(200, { items: LICENSED_NOTES }, securityHeaders());
  }
  if (method === 'GET' && path === '/api/public/scales') {
    const items = (await dbm.listScales()).filter(function (s) { return s.isTemplate || s.isBuiltin; }).map(function (s) {
      return { title: s.title, category: s.category, items: (s.definition.items || []).length,
        dimensions: (s.definition.dimensions || []).length, description: s.description,
        tags: s.tags, license: s.license, isTemplate: s.isTemplate };
    });
    return json(200, { items: items, categories: CATEGORIES }, securityHeaders());
  }
  /* 预览计分（不保存数据，用于编辑器/填写页实时预览） */
  if (method === 'POST' && path === '/api/preview-score') {
    const body = await readJson(request);
    const def = body.definition || {};
    const errors = validateAnswers(def, body.answers || {});
    if (errors.length) return json(400, { error: '有题目未作答', details: errors });
    return json(200, scoreResponse(def, body.answers || {}));
  }

  /* 量表 */
  if (method === 'GET' && path === '/api/scales') {
    const v = await viewer(request);
    if (!v) return json(401, { error: '请先登录' });
    return json(200, { items: (await dbm.listScales()).filter(function (s) { return canView(s, v); }) });
  }
  let m;
  if (m = path.match(/^\/api\/scales\/(\d+)$/)) {
    const id = Number(m[1]);
    const v = await viewer(request);
    const s = await dbm.getScale(id);
    if (method === 'GET') {
      if (!v) return json(401, { error: '请先登录' });
      if (!s) return json(404, { error: '量表不存在' });
      if (!canView(s, v)) return json(403, { error: '无权查看该量表' });
      return json(200, s);
    }
    if (method === 'PUT') {
      if (!v) return json(401, { error: '请先登录' });
      if (!s) return json(404, { error: '量表不存在' });
      if (!canEdit(s, v)) return json(403, { error: '无权修改' });
      if (s.isBuiltin) return json(400, { error: '内置模板不可直接修改，请先"创建副本"后再编辑。' });
      const body = await readJson(request);
      return json(200, await dbm.updateScale(id, Object.assign({}, s, body)));
    }
    if (method === 'DELETE') {
      if (!v) return json(401, { error: '请先登录' });
      if (!s) return json(404, { error: '量表不存在' });
      if (!canEdit(s, v)) return json(403, { error: '无权删除' });
      const r = await dbm.deleteScale(id); return r.ok ? json(200, { ok: true }) : json(400, { error: r.message });
    }
  }
  if (method === 'POST' && path === '/api/scales') {
    const v = await viewer(request);
    if (!v) return json(401, { error: '请先登录' });
    const body = await readJson(request);
    let scale = body.scale;
    if (!scale && body.fromTemplateId) {
      const t = await dbm.getScale(Number(body.fromTemplateId));
      if (!t) return json(404, { error: '模板不存在' });
      if (!canView(t, v)) return json(403, { error: '无权复制该量表' });
      scale = { code: t.code + '-' + randomToken(4), title: body.title || (t.title + ' 副本'), category: t.category,
        description: t.description, instructions: t.instructions, source: t.source, license: t.license, tags: t.tags,
        consentOn: t.consentOn, consentText: t.consentText, anonymous: t.anonymous, definition: t.definition };
    }
    if (!scale) return json(400, { error: '缺少量表定义' });
    const created = await dbm.insertScale(scale, { isTemplate: false, isBuiltin: false, ownerId: v.id });
    return json(200, created);
  }

  /* 调查 */
  if (method === 'GET' && path === '/api/surveys') {
    const v = await viewer(request);
    if (!v) return json(401, { error: '请先登录' });
    return json(200, { items: (await dbm.listSurveys()).filter(function (s) { return canView(s, v); }) });
  }
  if (m = path.match(/^\/api\/surveys\/(\d+)$/)) {
    const id = Number(m[1]);
    const v = await viewer(request);
    const s = await dbm.getSurvey(id);
    if (method === 'GET') {
      if (!v) return json(401, { error: '请先登录' });
      if (!s) return json(404, { error: '调查不存在' });
      if (!canView(s, v)) return json(403, { error: '无权查看该调查' });
      return json(200, s);
    }
    if (method === 'PUT' || method === 'PATCH') {
      if (!v) return json(401, { error: '请先登录' });
      if (!s) return json(404, { error: '调查不存在' });
      if (!canEdit(s, v)) return json(403, { error: '无权修改' });
      const body = await readJson(request);
      return json(200, await dbm.updateSurvey(id, body));
    }
    if (method === 'DELETE') {
      if (!v) return json(401, { error: '请先登录' });
      if (!s) return json(404, { error: '调查不存在' });
      if (!canEdit(s, v)) return json(403, { error: '无权删除' });
      return json(200, await dbm.deleteSurvey(id));
    }
  }
  if (method === 'POST' && path === '/api/surveys') {
    const v = await viewer(request);
    if (!v) return json(401, { error: '请先登录' });
    const body = await readJson(request);
    if (!body.scaleId) return json(400, { error: '缺少 scaleId' });
    const scale = await dbm.getScale(Number(body.scaleId));
    if (!scale) return json(404, { error: '量表不存在' });
    if (!canView(scale, v)) return json(403, { error: '无权使用该量表' });
    const pend = pendingError(scale);
    if (pend) return json(400, { error: pend });
    const created = await dbm.createSurvey(scale.id, { name: body.name || scale.title, anonymous: body.anonymous,
      maxResponses: body.maxResponses, closesAt: body.closesAt, showResult: body.showResult, collectMeta: body.collectMeta,
      note: body.note, ownerId: v.id });
    return json(200, created);
  }

  /* 填写提交（GET=问卷元数据供填写页渲染；POST=提交答卷） */
  if (m = path.match(/^\/api\/join\/([A-Za-z0-9]+)$/)) {
    const token = m[1];
    if (method === 'GET') {
      const s0 = await dbm.getSurveyByToken(token);
      if (!s0) return json(404, { error: '问卷链接无效或已失效' });
      const scale0 = await dbm.getScale(s0.scaleId);
      const st0 = await dbm.surveyState(s0);
      const study = s0.studyId ? await dbm.getStudy(s0.studyId) : null;
      return json(200, {
        survey: { name: s0.name, status: s0.status, anonymous: s0.anonymous, showResult: s0.showResult,
          closesAt: s0.closesAt, note: s0.note, studyId: s0.studyId, studyName: study ? study.name : null,
          wave: s0.wave, waveLabel: s0.waveLabel, subjectMode: s0.subjectMode },
        open: st0.open, reason: st0.reason || null, responded: st0.count,
        suggestSubjectCode: (study && s0.subjectMode === 'auto') ? await dbm.nextSubjectCode(study.id) : null,
        waves: study ? (study.waves || []).map(function (w) { return { wave: w.wave, label: w.waveLabel, url: '/s/' + w.token }; }) : null,
        scale: { title: scale0.title, description: scale0.description, instructions: scale0.instructions,
          consentOn: scale0.consentOn, consentText: scale0.consentText, definition: scale0.definition },
      }, securityHeaders());
    }
    if (method !== 'POST') return json(405, { error: '方法不允许' });
    const survey = await dbm.getSurveyByToken(token);
    if (!survey) return json(404, { error: '调查不存在或已失效' });
    const st = await dbm.surveyState(survey);
    if (!st.open) return json(409, { error: st.reason });
    const rl = await limiter.limit('join|' + ip, 200, 10 * 60 * 1000);
    if (!rl.allowed) return json(429, { error: '提交过于频繁，请 ' + rl.retryAfterSec + ' 秒后再试' });
    const b = await readJson(request);
    const scale = await dbm.getScale(survey.scaleId);
    if (scale.consentOn && b.consent !== true) return json(400, { error: '请先阅读并同意知情同意说明' });
    if (survey.subjectMode === 'self' && b.subjectId) {
      const ex = await dbm.findResponseBySubject(survey.id, b.subjectId);
      if (ex) return json(409, { error: '该受试者编号已提交过本次时点答卷，请勿重复提交。' });
    }
    const errors = validateAnswers(scale.definition, b.answers || {});
    if (errors.length) return json(400, { error: '有题目未作答', details: errors });
    const r = await dbm.saveResponse(survey, scale, { answers: b.answers, pid: b.pid, durationSec: b.durationSec,
      consent: b.consent === true, meta: { ip: survey.collectMeta ? ip : '', ua: survey.collectMeta ? (request.headers.get('user-agent') || '') : '' },
      startedAt: b.startedAt, subjectId: b.subjectId });
    // 字段名与 Node 版保持一致：填写页读 result，Worker 原先返回 scores，线上「显示结果」一直没生效
    const payload = { ok: true, pid: r.pid, subjectId: r.subjectId };
    if ((survey.showResult || (scale.definition && scale.definition.rater === 'clinician')) && r.scores) {
      payload.result = {
        total: r.scores.total,
        cut: r.scores.cut,
        dimensions: r.scores.dimensions,
        flags: r.scores.flags,
        completeness: r.scores.completeness,
        expected: r.scores.expected,
        answered: r.scores.answered,
        skipped: r.scores.skipped || [],
        ended: !!r.scores.ended,
      };
    }
    return json(200, payload);
  }

  /* 统计报告（对齐 server.js /api/surveys/:id/report） */
  if (m = path.match(/^\/api\/surveys\/(\d+)\/report$/)) {
    if (method !== 'GET') return json(405, { error: '方法不允许' });
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看该调查' });
    const scale = await dbm.getScale(s.scaleId);
    const responses = await dbm.listResponses(id);
    const url = new URL(request.url);
    const report = buildReport(scale.definition, responses, { groupVariableId: url.searchParams.get('group') || null });
    report.survey = s;
    report.scaleMeta = { id: scale.id, title: scale.title, category: scale.category, description: scale.description,
      instructions: scale.instructions, source: scale.source, license: scale.license };
    report.items.map(function (it, i) { const def = scale.definition.items[i]; it.options = def ? def.options : undefined; return it; });
    report.scoreValues = responses.map(function (r) { return r.scores ? r.scores.total : null; });
    report.rawRows = responses.slice(0, 300).map(function (r) {
      return { pid: r.pid, submittedAt: r.submittedAt, durationSec: r.durationSec,
        cells: scale.definition.items.map(function (it) { return answerLabel(it, (r.answers || {})[it.id], '/'); }),
        total: r.scores ? r.scores.total : null,
        cut: r.scores && r.scores.cut ? r.scores.cut.label : '' };
    });
    report.avgDurationSec = (function () {
      const ds = responses.map(function (r) { return r.durationSec; }).filter(function (x) { return typeof x === 'number' && x > 0 && x < 7200; });
      if (!ds.length) return null;
      return Math.round(ds.reduce(function (a, b) { return a + b; }, 0) / ds.length);
    }());
    return json(200, report, securityHeaders());
  }
  /* 单个答卷详情（对齐 server.js /api/surveys/:id/response/:rid） */
  if (m = path.match(/^\/api\/surveys\/(\d+)\/response\/([^/]+)$/)) {
    if (method !== 'GET') return json(405, { error: '方法不允许' });
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看该调查' });
    const scale = await dbm.getScale(s.scaleId);
    const rows = await dbm.listResponses(id);
    const r = rows.find(function (x) { return String(x.id) === String(m[2]) || String(x.pid) === String(m[2]); });
    if (!r) return json(404, { error: '答卷不存在' });
    const items = scale.definition.items.map(function (it) {
      const val = (r.answers || {})[it.id];
      let display = val;
      if (Array.isArray(val)) {
        display = val.map(function (x) { const hit = (it.options || []).find(function (o) { return String(o.value) === String(x); }); return hit ? hit.label : x; });
      } else if (val !== undefined && val !== null && val !== '') {
        const hit = (it.options || []).find(function (o) { return String(o.value) === String(val); });
        display = hit ? hit.label : val;
      }
      return { id: it.id, no: it.no, text: it.text, type: it.type, value: display === undefined ? null : display };
    });
    return json(200, { id: r.id, pid: r.pid, submittedAt: r.submittedAt, durationSec: r.durationSec,
      consent: r.consent, meta: r.meta, scores: r.scores, items: items }, securityHeaders());
  }

  /* 答卷列表 / 导出 */
  if (m = path.match(/^\/api\/surveys\/(\d+)\/responses$/)) {
    if (method !== 'GET') return json(405, { error: '方法不允许' });
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看' });
    return json(200, { items: await dbm.listResponses(id) });
  }
  if (m = path.match(/^\/api\/surveys\/(\d+)\/export\.csv$/)) {
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看' });
    const rows = await dbm.listResponses(id);
    const flat = rows.map(function (r) {
      const o = { pid: r.pid, submittedAt: r.submittedAt, subjectId: r.subjectId || '', consent: r.consent ? 1 : 0 };
      const ans = r.answers || {};
      Object.keys(ans).forEach(function (k) { o['q_' + k] = ans[k]; });
      const sc = r.scores || {};
      Object.keys(sc).forEach(function (k) { o['score_' + k] = sc[k]; });
      return o;
    });
    return new Response('﻿' + toCsv(flat), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
  }
  if (m = path.match(/^\/api\/surveys\/(\d+)\/export\.json$/)) {
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看' });
    return json(200, { survey: s, responses: await dbm.listResponses(id) });
  }
  /* SPSS/R 数值编码版导出（对齐 server.js /api/surveys/:id/export-spss.csv） */
  if (m = path.match(/^\/api\/surveys\/(\d+)\/export-spss\.csv$/)) {
    if (method !== 'GET') return json(405, { error: '方法不允许' });
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看' });
    const scale = await dbm.getScale(s.scaleId);
    const responses = await dbm.listResponses(id);
    const items = scale.definition.items;
    const dims = scale.definition.dimensions || [];
    const header = ['ID', 'SUBMIT', 'DURATION', 'CONSENT'];
    const specs = [];
    items.forEach(function (it) {
      if (it.type === 'checkbox') {
        (it.options || []).forEach(function (o, i) { header.push('Q' + it.no + '_' + (i + 1)); specs.push({ kind: 'multi', itemId: it.id, value: o.value }); });
      } else if (it.type === 'radio' || it.type === 'select' || it.type === 'number' || it.type === 'slider') {
        header.push('Q' + it.no); specs.push({ kind: 'num', itemId: it.id });
      } else { header.push('Q' + it.no + '_TXT'); specs.push({ kind: 'text', itemId: it.id }); }
    });
    dims.forEach(function (d) { header.push('DIM_' + d.id.toUpperCase()); specs.push({ kind: 'dim', dimId: d.id }); });
    header.push('TOTAL'); specs.push({ kind: 'total' });
    header.push('GRADE'); specs.push({ kind: 'grade' });
    const rows = [header];
    responses.forEach(function (r, idx) {
      const row = ['P' + String(idx + 1).padStart(4, '0'), String(r.submittedAt || '').replace('T', ' ').slice(0, 19),
        r.durationSec === null || r.durationSec === undefined ? '' : r.durationSec, r.consent ? 1 : 0];
      specs.forEach(function (sp) {
        const sc = r.scores || {};
        const ans = r.answers || {};
        if (sp.kind === 'num') { const val = ans[sp.itemId]; row.push(val === undefined || val === null || val === '' ? '' : Number(val)); }
        else if (sp.kind === 'multi') { const arr = ans[sp.itemId]; const list = Array.isArray(arr) ? arr.map(String) : (arr === undefined || arr === null || arr === '' ? [] : [String(arr)]); row.push(list.indexOf(String(sp.value)) >= 0 ? 1 : 0); }
        else if (sp.kind === 'text') { const val = ans[sp.itemId]; row.push(val === undefined || val === null ? '' : val); }
        else if (sp.kind === 'dim') { const d = sc.dimensions && sc.dimensions[sp.dimId]; row.push(d && d.score !== null && d.score !== undefined ? d.score : ''); }
        else if (sp.kind === 'total') { row.push(sc.total === null || sc.total === undefined ? '' : sc.total); }
        else if (sp.kind === 'grade') { const cuts = (scale.definition.scoring || {}).cutoffs || []; const gi = cuts.findIndex(function (c) { return sc.cut && c.label === sc.cut.label; }); row.push(gi >= 0 ? gi + 1 : ''); }
      });
      rows.push(row);
    });
    await dbm.log('export_spss', s.name + ' n=' + responses.length);
    return new Response(csvRows(rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(s.name + '-SPSS数值版.csv') } });
  }
  if (m = path.match(/^\/api\/surveys\/(\d+)\/codebook\.csv$/)) {
    const v = await viewer(request); const id = Number(m[1]); const s = await dbm.getSurvey(id);
    if (!s || !canView(s, v)) return json(403, { error: '无权查看' });
    const def = (await dbm.getScale(s.scaleId)).definition;
    const cb = (def.items || []).map(function (it) { return { var: 'q_' + it.id, label: it.label || it.id, type: it.type || '' }; });
    return new Response('﻿' + toCsv(cb), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
  }

  /* 随访研究（对齐 server.js /api/studies 系列；数据层 db-d1 已支持多时点） */
  if (method === 'GET' && path === '/api/studies') {
    const v = await viewer(request);
    return json(200, { items: (await dbm.listStudies()).filter(function (s) { return canView(s, v); }) }, securityHeaders());
  }
  if (method === 'POST' && path === '/api/studies') {
    const v = await viewer(request);
    if (!v) return json(401, { error: '请先登录' });
    const body = await readJson(request);
    const scale = await dbm.getScale(Number(body.scaleId));
    if (!scale) return json(404, { error: '量表不存在' });
    if (!canView(scale, v)) return json(403, { error: '无权使用该量表' });
    const pend = pendingError(scale);
    if (pend) return json(400, { error: pend });
    const waves = (body.waves || []).filter(function (w) { return w && w.label; });
    if (!waves.length) return json(400, { error: '请至少设置一个随访时点' });
    const r = await dbm.createStudy(scale.id, {
      name: body.name || scale.title + ' 随访研究', waves: waves,
      subjectMode: body.subjectMode === 'self' ? 'self' : 'auto',
      showResult: !!body.showResult, collectMeta: body.collectMeta !== false,
      note: body.note || '', ownerId: v ? v.id : null,
    });
    await dbm.log('study_create', r.study.name + ' #' + r.study.id + ' 时点 ' + waves.length + ' 个');
    return json(200, r, securityHeaders());
  }
  if (m = path.match(/^\/api\/studies\/(\d+)\/report$/)) {
    if (method !== 'GET') return json(405, { error: '方法不允许' });
    const v = await viewer(request); const st = await dbm.getStudy(Number(m[1]));
    if (!st) return json(404, { error: '随访研究不存在' });
    if (!canView(st, v)) return json(403, { error: '无权查看该随访研究' });
    const scale = await dbm.getScale(st.scaleId);
    const waves = [];
    for (let i = 0; i < (st.waves || []).length; i += 1) {
      const w = st.waves[i];
      waves.push({ id: w.id, label: w.waveLabel, token: w.token, url: '/s/' + w.token,
        open: (await dbm.surveyState(w)).open, responses: await dbm.listResponses(w.id) });
    }
    const report = buildFollowup(scale.definition, waves);
    report.study = st;
    report.scaleMeta = { id: scale.id, title: scale.title, source: scale.source, license: scale.license };
    return json(200, report, securityHeaders());
  }
  if (m = path.match(/^\/api\/studies\/(\d+)\/export-wide\.csv$/)) {
    if (method !== 'GET') return json(405, { error: '方法不允许' });
    const v = await viewer(request); const st = await dbm.getStudy(Number(m[1]));
    if (!st) return json(404, { error: '随访研究不存在' });
    if (!canView(st, v)) return json(403, { error: '无权查看该随访研究' });
    const scale = await dbm.getScale(st.scaleId);
    const waves = [];
    for (let i = 0; i < (st.waves || []).length; i += 1) {
      const w = st.waves[i];
      waves.push({ id: w.id, label: w.waveLabel, wave: w.wave, responses: await dbm.listResponses(w.id) });
    }
    const header = ['SUBJECT'];
    waves.forEach(function (w) {
      header.push('W' + w.wave + '_TOTAL');
      (scale.definition.dimensions || []).forEach(function (d) { header.push('W' + w.wave + '_DIM_' + d.id.toUpperCase()); });
      header.push('W' + w.wave + '_GRADE');
    });
    if (waves.length > 1) { for (let i = 0; i + 1 < waves.length; i += 1) header.push('DELTA_W' + waves[i].wave + 'W' + waves[i + 1].wave); }
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
      for (let i = 0; i + 1 < totals.length; i += 1) { row.push(totals[i] === null || totals[i + 1] === null ? '' : totals[i] - totals[i + 1]); }
      rows.push(row);
    });
    await dbm.log('export_wide', st.name + ' 受试者 ' + (rows.length - 1) + ' 人');
    return new Response(csvRows(rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(st.name + '-随访宽表.csv') } });
  }
  if (m = path.match(/^\/api\/studies\/(\d+)$/)) {
    const id = Number(m[1]);
    if (method === 'GET') {
      const v = await viewer(request); const st = await dbm.getStudy(id);
      if (!st) return json(404, { error: '随访研究不存在' });
      if (!canView(st, v)) return json(403, { error: '无权查看该随访研究' });
      st.scale = await dbm.getScale(st.scaleId);
      return json(200, st, securityHeaders());
    }
    if (method === 'DELETE') {
      const v = await viewer(request); const cur = await dbm.getStudy(id);
      if (!cur) return json(404, { error: '随访研究不存在' });
      if (!canEdit(cur, v)) return json(403, { error: '无权删除该随访研究' });
      await dbm.deleteStudy(cur.id);
      await dbm.log('study_delete', '#' + id);
      return json(200, { ok: true }, securityHeaders());
    }
    return json(405, { error: '方法不允许' });
  }

  /* 备份/恢复：边缘端无文件系统，友好降级（备份请到 Cloudflare 控制台 D1 导出） */
  if (method === 'GET' && path === '/api/backups') {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    return json(200, { items: [], dir: 'Cloudflare D1 边缘数据库（备份请到 Cloudflare 控制台 → Workers → D1 → Export 导出）' }, securityHeaders());
  }
  if (method === 'POST' && path === '/api/backup') {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    return json(400, { error: '本部署（Cloudflare D1）不支持应用内备份：请到 Cloudflare 控制台 → Workers & Pages → D1 数据库 medscale → Export 导出全库副本。' }, securityHeaders());
  }
  if (method === 'POST' && path === '/api/restore') {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    return json(400, { error: '本部署（Cloudflare D1）暂不支持网页端恢复备份，如需恢复请在 Cloudflare 控制台操作。' }, securityHeaders());
  }
  if (m = path.match(/^\/api\/backups\/(.+)$/)) {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    return json(404, { error: '备份不存在（Cloudflare D1 部署请在控制台导出）' }, securityHeaders());
  }

  /* 文件导入解析（边缘版：xlsx/docx/pdf/csv/txt/md/tsv，图片暂不支持 OCR） */
  if (method === 'POST' && path === '/api/import/parse') {
    const v = await viewer(request);
    if (!v) return json(401, { error: '请先登录' });
    const rl = await limiter.limit('upload|' + ip, 40, 10 * 60 * 1000);
    if (!rl.allowed) return json(429, { error: '上传过于频繁，请 ' + rl.retryAfterSec + ' 秒后再试' }, { 'Retry-After': String(rl.retryAfterSec) });
    const b = await readJson(request);
    const name = String(b.filename || 'upload');
    if (!b.data) return json(400, { error: '缺少文件内容' });
    let bytes;
    try {
      bytes = Buffer.from(String(b.data).replace(/^data:[^,]+,/, ''), 'base64');
    } catch (e) {
      return json(400, { error: '文件内容解码失败' });
    }
    if (!bytes || !bytes.length) return json(400, { error: '文件内容为空' });
    if (bytes.length > 20 * 1024 * 1024) return json(400, { error: '文件过大（上限 20 MB）' });
    const result = await parseFileEdge(name, bytes);
    await dbm.log('import_parse', name + ' → 识别 ' + result.items.length + ' 题（' + result.kind + '）');
    return json(200, {
      filename: name,
      kind: result.kind,
      ocr: !!result.ocr,
      structured: !!result.structured,
      needManual: !!result.needManual,
      items: result.items,
      dimensions: result.dimensions || [],
      warnings: result.warnings || [],
      rawText: (result.rawText || '').slice(0, 12000),
    }, securityHeaders());
  }

  /* 导入模板下载（与 lib/parse-core.js templateCsv 一致） */
  if (method === 'GET' && path === '/api/import-template.csv') {
    const rows = [
      ['题号', '题干', '题型', '选项1', '分值1', '选项2', '分值2', '选项3', '分值3', '选项4', '分值4', '选项5', '分值5', '维度', '必答', '反向计分'],
      ['1', '过去两周，您有多少时候感到心情低落？', '单选', '完全不会', '0', '好几天', '1', '一半以上的天数', '2', '几乎每天', '3', '', '', '抑郁症状', '是', '否'],
      ['2', '您对目前的睡眠质量满意吗？', '单选', '非常满意', '5', '满意', '4', '一般', '3', '不满意', '2', '非常不满意', '1', '睡眠', '是', '否'],
      ['3', '您每周运动几次？', '数字', '', '', '', '', '', '', '', '', '', '', '生活方式', '是', '否'],
      ['4', '其他建议', '填空', '', '', '', '', '', '', '', '', '', '', '', '否', '否'],
    ];
    return new Response(csvRows(rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('量表导入模板.csv') } });
  }

  /* 邀请码 */
  if (method === 'GET' && path === '/api/invites') { if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' }); return json(200, { items: await dbm.listInvites() }); }
  if (method === 'POST' && path === '/api/invites') {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    const b = await readJson(request);
    const days = Number(b.validDays);
    const expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : (b.expiresAt || '');
    const v = await sessionOf(request);
    const r = await dbm.createInvite({ note: b.note || '', role: b.role, maxUses: b.maxUses, expiresAt: expiresAt, createdBy: v ? v.userId : null });
    if (!r.ok) return json(400, { error: r.error });
    await dbm.log('invite_create', r.invite.code + ' 可用 ' + r.invite.maxUses + ' 次');
    return json(200, { invite: r.invite });
  }
  if (m = path.match(/^\/api\/invites\/(\d+)$/)) {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    if (method !== 'PATCH') return json(405, { error: '方法不允许' });
    const b = await readJson(request); const patch = {};
    if (b.note !== undefined) patch.note = String(b.note || '');
    if (b.role !== undefined) patch.role = b.role === 'admin' ? 'admin' : 'user';
    if (b.maxUses !== undefined) patch.maxUses = Number(b.maxUses);
    if (b.expiresAt !== undefined) patch.expiresAt = String(b.expiresAt || '');
    if (b.revoked !== undefined) patch.revoked = !!b.revoked;
    const inv = await dbm.updateInvite(Number(m[1]), patch);
    if (!inv) return json(404, { error: '邀请码不存在' });
    return json(200, { invite: inv });
  }

  /* 用户管理（管理员） */
  if (method === 'GET' && path === '/api/users') { if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' }); return json(200, { items: await dbm.listUsers() }); }
  if (m = path.match(/^\/api\/users\/(\d+)$/)) {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    if (method !== 'PATCH') return json(405, { error: '方法不允许' });
    const b = await readJson(request); const u = await dbm.updateUser(Number(m[1]), b);
    return u ? json(200, u) : json(404, { error: '用户不存在' });
  }

  /* 系统设置 / 改密 */
  if (method === 'GET' && path === '/api/settings') { if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' }); return json(200, { registerMode: await registerMode(dbm), siteTitle: await dbm.getSetting('site_title', '医学量表与问卷平台') }); }
  if (method === 'POST' && path === '/api/settings') {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    const b = await readJson(request);
    if (b.registerMode) await dbm.setSetting('register_mode', b.registerMode);
    if (b.siteTitle) await dbm.setSetting('site_title', b.siteTitle);
    return json(200, { ok: true });
  }
  if (method === 'POST' && path === '/api/password') {
    if (!(await requireAdmin(request))) return json(403, { error: '需要管理员权限' });
    const b = await readJson(request);
    if (!(await dbm.checkAdminPassword(b.oldPassword || ''))) return json(400, { error: '原密码错误' });
    if (String(b.newPassword || '').length < 6) return json(400, { error: '新密码至少 6 位' });
    await dbm.setAdminPassword(b.newPassword);
    return json(200, { ok: true });
  }

  /* 二维码 / 使用说明 */
  if (method === 'GET' && path === '/api/qr.png') {
    const text = url.searchParams.get('text') || '';
    const scale = Number(url.searchParams.get('scale')) || 8;
    const png = qr.png(text, scale, 4);
    return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
  }
  if (method === 'GET' && path === '/api/guide.md') {
    // 边缘端无文件系统：优先使用环境变量内联的使用说明文本，否则返回占位提示。
    const content = env.MEDSCALE_GUIDE || '# 使用说明\n\nCloudflare 边缘端不读取服务器本地文件。完整使用说明以仓库 `docs/使用说明.md` 为准；如需内置，可把说明文本写入环境变量 `MEDSCALE_GUIDE`。';
    return new Response(content, { status: 200, headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
  }

  return json(501, { error: '该接口在 Cloudflare Workers 版本中未实现。' });
}

/* 可见性/可写性（与 server.js 一致） */
async function viewer(request) {
  const s = await sessionOf(request);
  if (!s) return null;
  const u = s.userId ? await dbm.getUser(s.userId) : null;
  return { id: u ? u.id : null, admin: await isAdmin(request) };
}
function canView(item, v) {
  if (!item) return false;
  if (v && v.admin) return true;
  if (item.isTemplate || item.isBuiltin) return true;
  if (!item.ownerId) return false;
  return !!(v && item.ownerId === v.id);
}

/** 量表里还有占位题干/选项时不能发布：把受试者发给一张空题卷是最糟的失败方式 */
function pendingError(scale) {
  const n = pendingItems(scale.definition).length;
  return n ? '还有 ' + n + ' 道题待填入授权文本，请先复制为「我的量表」并在编辑器中填写后再发布' : null;
}
function canEdit(item, v) {
  if (!item || !v) return false;
  if (v.admin) return true;
  return !!item.ownerId && item.ownerId === v.id;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const isApi = path === '/healthz' || path.startsWith('/api/');
    // 静态资源优先：即便后端尚未就绪或初始化失败，首页/前端仍可正常加载
    if (!isApi && env.ASSETS) {
      try {
        const asset = await env.ASSETS.fetch(request);
        if (asset && asset.status !== 404) return secureAsset(asset);
        // SPA 回退：/s/<token> 走轻量填写页，/home 等管理端路由交给 index.html；
        // 带扩展名的缺失资源仍返回 404，避免把 JS/CSS 请求回成 HTML。
        const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(path);
        if (!looksLikeFile && (method === 'GET' || method === 'HEAD')) {
          const shell = path.startsWith('/s/') ? '/fill.html' : '/index.html';
          const indexReq = new Request(new URL(shell, url.origin).toString(), { method: 'GET', headers: request.headers });
          const index = await env.ASSETS.fetch(indexReq);
          if (index && index.status !== 404) {
            return secureAsset(new Response(method === 'HEAD' ? null : index.body,
              { status: 200, statusText: 'OK', headers: index.headers }));
          }
        }
      } catch (e) { /* 忽略，交给下面统一处理 */ }
    }
    try {
      dbm = await getBackend(env);
      if (path === '/healthz') return json(200, { ok: true }, securityHeaders());
      if (path.startsWith('/api/')) return await api(method, path, url, request, env);
      return html(404, '<h1>404</h1><p>页面不存在。<a href="/">返回首页</a></p>', securityHeaders());
    } catch (e) {
      return json(500, { error: '服务器错误：' + (e && e.message ? e.message : String(e)) });
    }
  },
};
