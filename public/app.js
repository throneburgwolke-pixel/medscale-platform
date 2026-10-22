'use strict';
/* 医学量表与问卷平台 —— 前端应用（原生 JS，无框架） */

/* ================= 基础工具 ================= */
/* $ / $$ / esc / numOr / toast / confirmBox / mountModal / fmtDate / estimateMinutes / api
   定义在 common.js，管理端与公开填写页共用 */

function num(v, d) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toFixed(d === undefined ? 2 : d);
}

function pfmt(p) {
  if (p === null || p === undefined || !isFinite(p)) return '—';
  if (p < 0.001) return '<0.001';
  return Number(p).toFixed(3);
}

function fmtDuration(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '—';
  const s = Math.round(Number(sec));
  if (s < 60) return s + ' 秒';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ' 分' + (r ? ' ' + r + ' 秒' : '');
}

/** 下载二维码 PNG */
function downloadQr(link, name) {
  const a = document.createElement('a');
  a.href = qrSrc(link, 12);
  a.download = (name || '问卷') + '-二维码.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('二维码已开始下载');
}

/* ================= 全局状态 ================= */
const state = {
  session: null,
  scales: [],
  surveys: [],
  catalog: null,
  categories: [],
  loading: false,
};

/* 分类配色：统一使用十六进制色值 —— 既可用于 CSS，也可直接用于 Canvas 图表
   （注意：Canvas 无法解析 var(--x)，会造成图表报错并使整页加载失败） */
const CAT_COLOR = {
  '情绪与心理': '#7c5ce0',
  '睡眠': '#3b6fe0',
  '认知与老年': '#0ea5a4',
  '康复与疼痛': '#e08b1a',
  '护理评估': '#dc6b6b',
  '营养评估': '#16a34a',
  '呼吸与心血管': '#2563eb',
  '消化与泌尿': '#0891b2',
  '用药与依从性': '#9333ea',
  '成瘾行为': '#b45309',
  '照护与负担': '#db2777',
  '症状评估': '#0d9488',
  '躯体症状': '#64748b',
  '生活质量': '#f59e0b',
  '临床风险评分': '#b91c1c',
  '儿童与青少年': '#ec4899',
  '通用问卷': '#6b7280',
};

function catColor(c) { return CAT_COLOR[c] || '#6b7280'; }

/* 授权说明收敛成一眼可辨的档位，供量表卡片、公开库与授权目录共用。
   正则里的 (?<![无需不]) 很关键：「无需付费」「无需另行授权」是免费的意思，不能误判为要申请。 */
function licenseKind(text, isOwn) {
  const t = String(text || '').trim();
  if (!t) return isOwn ? { key: 'gray', label: '自有内容' } : { key: 'warn', label: '授权未标注' };
  if (/(?<![无需不])(?:需|须)(?:向|获得|取得|申请|付费|授权)/.test(t)) return { key: 'warn', label: '需申请授权' };
  if (/(?:禁止|不可|不得|未经授权).{0,8}(?:商用|商业|使用|修改|分发|复制)/.test(t)) return { key: 'warn', label: '需授权' };
  if (/免费|自由使用|无版权|无特殊授权|公有领域|公开|无需付费|允许.{0,8}使用/.test(t)) {
    return { key: 'ok', label: /注明来源|引用/.test(t) ? '免费 · 需引用' : '免费使用' };
  }
  return { key: 'warn', label: '使用前请核对授权' };
}

/* 授权徽标优先看结构化分级（licenseTier），没有分级时退回按文字判断。
   商业授权且正文仍是占位时，明确标出「正文待填」，避免把空题卷发给受试者。 */
const TIER_TAG = {
  free: { key: 'ok', label: '免费使用' },
  registration: { key: 'ok', label: '免费 · 需注册或引用' },
  commercial: { key: 'warn', label: '商业授权' },
};

function licenseTag(s) {
  const def = s.definition || {};
  let lic = TIER_TAG[def.licenseTier] || licenseKind(s.license, !s.isTemplate);
  // 同为「免费但有限制」，需要向作者申请许可的必须显眼，不能和仅需引用的一视同仁
  if (def.licenseTier === 'registration' && /申请|许可|授权/.test(String(s.license || ''))) {
    lic = { key: 'warn', label: '免费 · 需申请许可' };
  }
  if (def.licenseTier === 'commercial' && SHARED.pendingItems(def).length) {
    lic = { key: 'pending', label: '商业授权 · 正文待填' };
  }
  return '<span class="tag lic-tag ' + lic.key + '" title="授权说明：' + esc(s.license || '未标注') + '">' + lic.label + '</span>';
}

/* ---------------- 共享模块：跳题判定与分类清单 ----------------
   实现只在 lib/logic.js 一份，由 index.html 先于本文件加载；
   服务端计分与填写页预览因此永远按同一套规则走，不会出现
   「网页上能跳过、提交时被要求必答」的不一致。 */
const SHARED = window.MEDSCALE_LOGIC;

const CATEGORIES = SHARED.CATEGORIES;
const toList = SHARED.toList;

function allCategories() {
  return (state.categories && state.categories.length) ? state.categories : CATEGORIES;
}

/* ---------------- 收藏与最近使用 ----------------
   只存在浏览器本地（localStorage），不经过服务端：换电脑或清缓存即消失，
   与「数据按创建者隔离」的约定一致，不会把个人偏好写进调查数据库。 */
const FAV_KEY = 'medscale_fav_scales';
const RECENT_KEY = 'medscale_recent_scales';

function readCodeList(key) {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x; }) : [];
  } catch (e) { return []; }
}
function writeCodeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 60))); } catch (e) { /* 隐私模式可能不可用 */ }
}

/* 编辑器草稿：按账号+量表隔离，只用于本机恢复，不写进数据库 */
const EDITOR_DRAFT_PREFIX = 'medscale_editor_draft_';
let editorDirty = false;
let editorDraftTimer = null;
let editorDraftKey = null;

function editorUserKey() {
  const id = state.session && state.session.user && state.session.user.id;
  return id ? 'u' + id : 'session';
}
function editorStorageKey(scaleId) {
  return EDITOR_DRAFT_PREFIX + editorUserKey() + '_' + (scaleId || 'new');
}
function readEditorDraft(scaleId) {
  try {
    const d = JSON.parse(localStorage.getItem(editorStorageKey(scaleId)) || 'null');
    return d && d.draft && d.savedAt ? d : null;
  } catch (e) { return null; }
}
function clearEditorDraft(scaleId) {
  try { localStorage.removeItem(editorStorageKey(scaleId)); } catch (e) { /* ignore */ }
}
/** 输入后立即标记未保存，防抖写入；快照与键名都取当下值，避免切页后写错量表 */
function scheduleEditorDraft() {
  editorDirty = true;
  if (!editorDraftKey || !draft) return;
  if (editorDraftTimer) clearTimeout(editorDraftTimer);
  const key = editorDraftKey;
  const snapshot = JSON.stringify({ savedAt: new Date().toISOString(), draft: draft, isNew: draftIsNew });
  editorDraftTimer = setTimeout(function () {
    try { localStorage.setItem(key, snapshot); } catch (e) { /* 隐私模式可能不可用 */ }
  }, 400);
}
window.addEventListener('beforeunload', function (e) {
  if (!editorDirty) return;
  e.preventDefault();
  e.returnValue = '';
});
function favCodes() { return readCodeList(FAV_KEY); }
function isFavCode(code) { return !!code && favCodes().indexOf(code) >= 0; }
function toggleFavCode(code) {
  if (!code) return false;
  const list = favCodes();
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1); else list.unshift(code);
  writeCodeList(FAV_KEY, list);
  return i < 0;
}
function pushRecentCode(code) {
  if (!code) return;
  const list = readCodeList(RECENT_KEY).filter(function (c) { return c !== code; });
  list.unshift(code);
  writeCodeList(RECENT_KEY, list);
}
/** 收藏按钮：图标按钮必须带可读名称，供读屏与键盘用户识别 */
function favBtn(code, name) {
  const on = isFavCode(code);
  return '<button class="fav-btn' + (on ? ' on' : '') + '" type="button" data-fav="' + esc(code) + '" data-name="' + esc(name || '') + '"' +
    ' aria-pressed="' + on + '" aria-label="' + (on ? '取消收藏' : '收藏') + '：' + esc(name || '') + '"' +
    ' title="' + (on ? '已收藏，点击取消' : '收藏到「我的常用」') + '">' + (on ? '★' : '☆') + '</button>';
}
function bindFavButtons() {
  $$('[data-fav]').forEach(function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      e.preventDefault();
      const on = toggleFavCode(b.dataset.fav);
      b.classList.toggle('on', on);
      b.textContent = on ? '★' : '☆';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', (on ? '取消收藏' : '收藏') + '：' + (b.dataset.name || ''));
      b.setAttribute('title', on ? '已收藏，点击取消' : '收藏到「我的常用」');
      toast(on ? '已加入「我的常用」' : '已从常用中移除');
      refreshFavArea();
    };
  });
}
/** 工作台「我的常用 / 最近打开」区块；收藏变化时只重绘这一块，不打断页面滚动位置 */
function favSectionHtml() {
  const pick = function (codes) {
    return codes.map(function (c) {
      return state.scales.find(function (s) { return s.code === c; });
    }).filter(Boolean);
  };
  const picks = pick(favCodes());
  const seen = {};
  picks.forEach(function (s) { seen[s.code] = 1; });
  const recents = pick(readCodeList(RECENT_KEY)).filter(function (s) { return !seen[s.code]; }).slice(0, 4);
  if (!picks.length && !recents.length) return '';
  let html = '';
  if (picks.length) {
    html += '<div class="section-row"><h3>我的常用</h3><span class="hint">点卡片右上角的 ☆ 可收藏</span></div>' +
      '<div class="grid cols-4">' + picks.slice(0, 8).map(hotCard).join('') + '</div>';
  }
  if (recents.length) {
    html += '<div class="section-row"><h3>最近打开</h3></div>' +
      '<div class="grid cols-4">' + recents.map(hotCard).join('') + '</div>';
  }
  return html;
}
/** 返回工作台里「我的常用」整块 HTML（无收藏也无最近记录时返回空串） */
function favAreaHtml() {
  const inner = favSectionHtml();
  return inner ? '<div id="fav-area">' + inner + '</div>' : '';
}
function refreshFavArea() {
  const el = $('#fav-area');
  if (!el) return;
  const inner = favSectionHtml();
  if (!inner) { el.remove(); return; }
  el.innerHTML = inner;
  bindHotCards();
  bindFavButtons();
}
function bindHotCards() {
  $$('[data-hot]').forEach(function (el) {
    el.onclick = function () { go('/scale/' + el.dataset.hot); };
  });
}

/** 估算作答用时（分钟）：按每题 12 秒粗估 */
/* ================= 路由 ================= */
function currentRoute() {
  if (location.pathname.indexOf('/s/') === 0) {
    return { name: 'fill', token: location.pathname.slice(3).replace(/\/$/, '') };
  }
  const raw = location.hash.replace(/^#/, '') || '/home';
  // 不以 / 开头的 hash 是页内锚点（如 #features），不能当作路由处理，否则整页重渲染会打断定位滚动
  if (raw[0] !== '/') return { name: 'anchor', args: [raw], query: '' };
  const qi = raw.indexOf('?');
  const pathPart = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = qi >= 0 ? raw.slice(qi + 1) : '';
  const parts = pathPart.split('/').filter(Boolean);
  return { name: parts[0] || 'home', args: parts.slice(1), query: query };
}

function go(path) { location.hash = path; }

/** 已注册的前端视图名；不在表里的地址走 404 兜底页，而不是静默跳回工作台 */
const VIEW_NAMES = [
  'home', 'scales', 'scale', 'builder', 'import', 'surveys', 'survey',
  'followups', 'followup', 'settings', 'login', 'register', 'admin',
  'library', 'guide',
];

function viewNotFound(r) {
  const path = '#/' + [r.name].concat(r.args || []).join('/');
  const authed = !!(state.session && state.session.authenticated);
  $('#app').innerHTML = '<main class="main" id="main" tabindex="-1">' +
    '<div style="max-width:560px;margin:64px auto 0">' +
      '<div class="card" style="text-align:center">' +
        '<div style="font-size:40px;line-height:1" aria-hidden="true">🧭</div>' +
        '<h1 class="page-title mt8">页面不存在</h1>' +
        '<div class="small muted mt8">没有找到地址 <span class="mono">' + esc(path) + '</span>，' +
          '可能是链接拼写有误，或该页面已经调整。</div>' +
        '<div class="row mt16" style="justify-content:center;gap:8px">' +
          '<a class="btn primary" href="' + (authed ? '#/home' : '#/') + '">' + (authed ? '回到工作台' : '返回首页') + '</a>' +
          '<a class="btn" href="' + (authed ? '#/scales' : '#/library') + '">量表库</a>' +
          '<a class="btn" href="#/guide">使用流程</a>' +
        '</div>' +
      '</div>' +
    '</div></main>';
}

window.addEventListener('hashchange', render);
window.addEventListener('popstate', render);

/* ================= 骨架 ================= */
const NAV = [
  { key: 'home', label: '工作台', ico: '🏠' },
  { key: 'scales', label: '量表库', ico: '📚' },
  { key: 'surveys', label: '发放与数据', ico: '📊' },
  { key: 'followups', label: '随访研究', ico: '🔁' },
  { key: 'settings', label: '系统设置', ico: '⚙️' },
];

function shell(activeKey, content, crumbs) {
  const crumbHtml = crumbs && crumbs.length
    ? '<div class="crumbs">' + crumbs.map(function (c, i) {
        const sep = i ? '<span class="sep">/</span>' : '';
        return sep + (c.href ? '<a href="' + esc(c.href) + '">' + esc(c.label) + '</a>' : '<span>' + esc(c.label) + '</span>');
      }).join('') + '</div>'
    : '<div class="crumbs"><span>医学量表与问卷平台</span></div>';
  return '' +
    '<a class="skip-link" href="#main">跳到主内容</a>' +
    '<div class="shell">' +
      '<aside class="sidebar">' +
        '<div class="brand">' +
          '<div class="brand-mark">量</div>' +
          '<div class="brand-text">医学量表平台<small>收集 · 计分 · 统计分析</small></div>' +
        '</div>' +
        '<div class="nav-group">主要功能</div>' +
        '<nav aria-label="主导航">' +
        NAV.map(function (n) {
          const on = activeKey === n.key;
          return '<a class="nav-item' + (on ? ' active' : '') + '" href="#/' + n.key + '"' +
            (on ? ' aria-current="page"' : '') + '>' +
            '<span class="ico" aria-hidden="true">' + n.ico + '</span>' + n.label + '</a>';
        }).join('') +
        '</nav>' +
        '<div class="sidebar-foot">' +
          '<div class="row" style="gap:8px;padding:6px 12px 8px;align-items:center">' +
            '<div class="brand-mark" style="width:28px;height:28px;flex-basis:28px;font-size:14px;border-radius:9px;background:linear-gradient(135deg,var(--accent),var(--violet))">' +
              esc((state.session && state.session.user && (state.session.user.name || state.session.user.username) || '管').slice(0, 1)) + '</div>' +
            '<div style="min-width:0">' +
              '<div class="small" style="color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                esc(state.session && state.session.user ? (state.session.user.name || state.session.user.username) : '管理员') + '</div>' +
              '<div style="font-size:11px;color:var(--grad-fog)">' +
                (state.session && state.session.user ? (state.session.user.org || (state.session.isAdmin ? '管理员' : '研究者')) : '管理员模式') + '</div>' +
            '</div>' +
          '</div>' +
          '<a class="nav-item" href="#/scales?|全部|catalog"><span class="ico" aria-hidden="true">🗂️</span>量表目录</a>' +
          '<button class="nav-item" id="btn-logout"><span class="ico" aria-hidden="true">🚪</span>退出登录</button>' +
        '</div>' +
      '</aside>' +
      '<main class="main" id="main" tabindex="-1">' +
        '<div class="topbar">' +
          crumbHtml +
          '<div class="topbar-search"><input type="search" id="global-search" aria-label="搜索量表" placeholder="搜索量表…（回车）" autocomplete="off"></div>' +
        '</div>' +
        '<div class="content">' + content + '</div>' +
      '</main>' +
    '</div>';
}

function afterShell() {
  bindRipple();
  countUp();
  const lo = $('#btn-logout');
  if (lo) lo.onclick = async function () {
    await api('/logout', { method: 'POST' });
    state.session = null;
    location.hash = '';
    render();
  };
  const gs = $('#global-search');
  if (gs) {
    gs.onkeydown = function (e) {
      if (e.key === 'Enter') {
        go('/scales?' + encodeURIComponent(gs.value.trim()) + '|全部|all');
      }
    };
  }
}

/* ================= 视图：登录 ================= */
/* ---------- 动效工具 ---------- */
/* 数字滚动动画：仅在动画确实会推进时才改写文本。
   背景：step 在 p=0 时会先把文本写成 "0"，一旦 requestAnimationFrame 不触发
   （后台标签页被节流、自动化环境、某些无头浏览器），数字就会永久停在 "0"，
   比没有动画更糟。这里先确认下一帧会来，再开始改写。 */
function countUp(root) {
  $$('[data-count]', root || document).forEach(function (el) {
    const to = Number(el.dataset.count) || 0;
    const fmt = function (n) { return Math.round(n).toLocaleString('zh-CN'); };
    // 已经是终值就不碰；rAF 不可用（未注册、被节流）时保持静态终值
    if (fmt(to) === el.textContent.trim()) return;
    if (typeof requestAnimationFrame !== 'function') { el.textContent = fmt(to); return; }
    const dur = 900;
    const step = function () {
      const p = Math.min(1, (performance.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    const t0 = performance.now();
    requestAnimationFrame(step);
  });
}

function revealOnScroll() {
  const els = $$('.reveal');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach(function (el, i) {
    el.style.animationDelay = Math.min(i * 0.06, 0.42) + 's';
    io.observe(el);
  });
}

function typingEffect(el, texts) {
  if (!el) return;
  // 逐字增删会不停改变文本长度，要求减弱动效时直接显示完整首句
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = texts[0] || '';
    return;
  }
  let ti = 0;
  let ci = 0;
  let deleting = false;
  const tick = function () {
    const full = texts[ti];
    if (!deleting) {
      ci += 1;
      el.textContent = full.slice(0, ci);
      if (ci >= full.length) { deleting = true; setTimeout(tick, 1600); return; }
      setTimeout(tick, 110);
    } else {
      ci -= 1;
      el.textContent = full.slice(0, ci);
      if (ci <= 0) { deleting = false; ti = (ti + 1) % texts.length; setTimeout(tick, 320); return; }
      setTimeout(tick, 45);
    }
  };
  tick();
}

function bindRipple() {
  if (bindRipple._done) return;
  bindRipple._done = true;
  document.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.btn') : null;
    if (!btn || btn.classList.contains('ghost')) return;
    const rect = btn.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.left = (e.clientX - rect.left - 6) + 'px';
    span.style.top = (e.clientY - rect.top - 6) + 'px';
    btn.appendChild(span);
    setTimeout(function () { span.remove(); }, 620);
  });
}

/** 首页滚动交互：顶栏滚过首屏前收缩加阴影，滚深后浮现回顶按钮。监听只绑一次。 */
function bindLandingScroll() {
  if (bindLandingScroll._done) return;
  bindLandingScroll._done = true;
  const onScroll = function () {
    const y = window.scrollY || window.pageYOffset || 0;
    const nav = document.querySelector('.landing-nav');
    if (nav) nav.classList.toggle('scrolled', y > 8);
    const top = document.getElementById('back-top');
    if (top) top.classList.toggle('show', y > 480);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  document.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('#back-top') : null;
    if (!btn) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ================= 视图：网站首页（Landing） ================= */
/** 静态量表元数据（供旧后端降级显示，不依赖接口） */
const DEMO_SCALE_META = [
  ['PHQ-9 患者健康问卷抑郁量表', '情绪与心理', 9], ['GAD-7 广泛性焦虑障碍量表', '情绪与心理', 7],
  ['SAS 焦虑自评量表', '情绪与心理', 20], ['SDS 抑郁自评量表', '情绪与心理', 20],
  ['PSS-10 知觉压力量表', '情绪与心理', 10], ['GDS-15 老年抑郁量表', '情绪与心理', 15],
  ['PCL-5 创伤后应激筛查', '情绪与心理', 20], ['DASS-21 抑郁焦虑压力量表', '情绪与心理', 21],
  ['PSQI 匹兹堡睡眠质量指数', '睡眠', 18], ['ISI 失眠严重程度指数', '睡眠', 7], ['ESS 嗜睡量表', '睡眠', 8],
  ['Barthel 指数', '护理评估', 10], ['Braden 压疮风险', '护理评估', 6], ['Norton 压疮风险', '护理评估', 5],
  ['Morse 跌倒风险', '护理评估', 6], ['Katz ADL', '护理评估', 6], ['Lawton IADL', '护理评估', 8],
  ['GCS 格拉斯哥昏迷评分', '护理评估', 3], ['洼田饮水试验', '护理评估', 1],
  ['NRS-2002 营养风险筛查', '营养评估', 3], ['MNA-SF 微型营养评定', '营养评估', 6],
  ['CAT 慢阻肺评估测试', '呼吸与心血管', 8], ['mMRC 呼吸困难量表', '呼吸与心血管', 1], ['ACT 哮喘控制测试', '呼吸与心血管', 5],
  ['IPSS 国际前列腺症状评分', '消化与泌尿', 8], ['EAT-10 吞咽筛查', '消化与泌尿', 10],
  ['Wexner 便秘评分', '消化与泌尿', 8], ['ICIQ-SF 尿失禁简表', '消化与泌尿', 3],
  ['MMAS-8 用药依从性', '用药与依从性', 8], ['AUDIT-C 饮酒筛查', '成瘾行为', 3],
  ['CAGE 酒精问题筛查', '成瘾行为', 4], ['FTND 尼古丁依赖', '成瘾行为', 6],
  ['ZBI-22 照顾者负担量表', '照护与负担', 22], ['FSS 疲劳严重程度量表', '症状评估', 9],
  ['WHOQOL-BREF 生存质量量表', '生活质量', 26], ['WHO-5 幸福感指数', '生活质量', 5],
  ['MRS 绝经评定量表', '情绪与心理', 11], ['UCLA-3 孤独感量表', '情绪与心理', 3],
].map(function (x) {
  return { title: x[0], category: x[1], items: x[2], dimensions: 0, description: '', tags: [], license: '', isTemplate: true };
});

const LANDING_FEATURES = [
  // 色标必须是字面量：var(--x) 拼 alpha 后缀（如 var(--accent)cc）是非法值，会让整条 background 失效、图标底板消失
  { ico: '📚', c: '#10766b', t: '内置常用医学量表', d: 'PHQ-9、GAD-7、PSQI、SAS/SDS、Barthel、Braden、CAT、IPSS…条目、选项与判读阈值全部配置好，点选即可发布。' },
  { ico: '📥', c: '#3b6fe0', t: '导入自己的量表', d: '上传 Excel / Word / PDF / 图片，自动识别题干与选项（图片 OCR 依赖 macOS 服务器），校对后直接入库使用。' },
  { ico: '✍️', c: '#7c5ce0', t: '自制问卷与跳题逻辑', d: '9 种题型、维度、反向计分、分级判读、条件跳题；人口学题可标记不计入总分。' },
  { ico: '🔳', c: '#e08b1a', t: '扫码发放 · 手机填写', d: '生成链接与二维码，按维度分节、进度可视、断点续填、提交前核对答案。' },
  { ico: '📊', c: '#dc6b6b', t: '自动计分与统计', d: '描述统计、Cronbach α、CITC、相关矩阵、t 检验/ANOVA/卡方，并自动给出数据质量报告。' },
  { ico: '🔁', c: '#0891b2', t: '随访与配对分析', d: '多时点重复测量，按受试者编号自动配对，输出配对 t 检验、Wilcoxon 与随访宽表。' },
];

/**
 * 注册入口统一按服务端策略决定：closed 收起所有入口，invite 提示要邀请码，open 直接免费注册。
 * 后端把结论算好放在 /api/session 里，前端不再自己猜开关状态。
 */
function registerAvailable() {
  const s = state.session;
  if (!s) return true;   // 会话尚未到位时按可注册展示，session 到位后会重渲染
  return s.registerAvailable !== false;
}

function registerMode() {
  return (state.session || {}).registerMode || 'invite';
}

/** 需要填码：邀请码模式且已过"首个管理员免码开局"阶段 */
function registerNeedsCode() {
  return registerMode() === 'invite' && !(state.session || {}).allowRegister;
}

function registerLabel() {
  return registerNeedsCode() ? '邀请码注册' : '免费注册';
}

/** 公开页顶栏：首页/量表库/使用说明共用，窄屏时链接折叠为菜单 */
function landingNav(subtitle, items, actions) {
  return '<nav class="landing-nav">' +
    '<div class="brand" style="padding:0"><div class="brand-mark">量</div>' +
      '<div class="brand-text">医学量表平台<small>' + esc(subtitle) + '</small></div></div>' +
    '<div class="landing-nav-links" id="lp-nav-links">' + items.map(function (n) {
      return '<a href="' + n[0] + '"' + (n[2] ? ' class="current"' : '') + '>' + esc(n[1]) + '</a>';
    }).join('') + '</div>' +
    '<div class="row" style="margin-left:auto">' + actions +
      '<button class="btn nav-toggle" id="lp-menu" aria-expanded="false" aria-controls="lp-nav-links">☰ 菜单</button>' +
    '</div></nav>';
}

/** 折叠菜单：展开/收起，选中一项后自动收起 */
function bindLandingNav() {
  const btn = $('#lp-menu');
  const box = $('#lp-nav-links');
  if (!btn || !box) return;
  btn.onclick = function () {
    const open = box.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  $$('#lp-nav-links a').forEach(function (a) {
    a.addEventListener('click', function () {
      box.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
}

/**
 * 页内锚点（#features / #steps 等）：已在首页时只滚动定位，
 * 重渲染整页会把滚动位置清零并让打字动画重新开始。
 */
function viewAnchor(id) {
  const target = /^[A-Za-z][A-Za-z0-9_-]*$/.test(id || '') ? id : '';
  if (!target || !document.getElementById(target)) viewLanding();
  const el = target ? document.getElementById(target) : null;
  if (!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function viewLanding() {
  // 首页不依赖任何数据接口（未登录也能完整展示），量表名称使用静态清单
  const DEMO_SCALES = [
    ['PHQ-9 抑郁量表', '情绪与心理'], ['GAD-7 焦虑量表', '情绪与心理'], ['SAS 焦虑自评', '情绪与心理'],
    ['SDS 抑郁自评', '情绪与心理'], ['PSS-10 知觉压力', '情绪与心理'], ['GDS-15 老年抑郁', '情绪与心理'],
    ['PSQI 睡眠质量指数', '睡眠'], ['ISI 失眠严重指数', '睡眠'], ['ESS 嗜睡量表', '睡眠'],
    ['Barthel 指数', '护理评估'], ['Braden 压疮风险', '护理评估'], ['Morse 跌倒风险', '护理评估'],
    ['洼田饮水试验', '护理评估'], ['NRS-2002 营养风险', '营养评估'], ['MNA-SF 营养评定', '营养评估'],
    ['CAT 慢阻肺评估', '呼吸与心血管'], ['mMRC 呼吸困难', '呼吸与心血管'], ['ACT 哮喘控制', '呼吸与心血管'],
    ['IPSS 前列腺症状', '消化与泌尿'], ['EAT-10 吞咽筛查', '消化与泌尿'], ['Wexner 便秘评分', '消化与泌尿'],
    ['MMAS-8 用药依从性', '用药与依从性'], ['AUDIT-C 饮酒筛查', '成瘾行为'], ['ZBI-22 照顾者负担', '照护与负担'],
    ['WHOQOL-BREF 生活质量', '生活质量'], ['PCL-5 创伤后应激', '情绪与心理'], ['Katz ADL 日常生活能力', '护理评估'],
  ];
  const pills = DEMO_SCALES.map(function (s) {
    return '<span class="pill"><i class="dot" style="background:' + catColor(s[1]) + '"></i>' + esc(s[0]) + '</span>';
  }).join('');
  const canRegister = registerAvailable();
  const regLabel = registerLabel();
  const signedIn = !!(state.session && state.session.authenticated);
  $('#app').innerHTML = '' +
    '<div class="landing">' +
      landingNav('收集 · 计分 · 统计分析', [
        ['#features', '功能'], ['#/library', '量表库'], ['#/guide', '使用流程'],
      ], '<button class="btn" id="lp-login">登录</button>' +
        (canRegister ? '<button class="btn primary" id="lp-register">' + regLabel + '</button>' : '')) +

      '<header class="hero">' +
        '<div class="hero-inner">' +
          '<div>' +
            '<h1>把量表发放、回收与统计<br><span class="accent">变成一条流水线</span></h1>' +
            '<p class="lead">临床科研用的量表工具：内置常用医学量表，支持导入自己的量表，手机扫码填写，' +
              '自动计分、信度分析与随访配对检验。</p>' +
            '<div class="typing-line"><span class="typing" id="lp-typing"></span></div>' +
            '<div class="hero-cta">' +
              // 登录入口已在顶栏，这里只留一个主动作；量表库统一走顶栏导航，首屏不再堆第二个入口
              (signedIn
                ? '<button class="btn white" id="lp-home">进入工作台</button>'
                : (canRegister
                  ? '<button class="btn white" id="lp-start">' + regLabel + '</button>'
                  : '<button class="btn white" id="lp-login2">登录进入工作台</button>')) +
            '</div>' +
          '</div>' +
          '<div class="hero-visual" aria-hidden="true">' +
            '<span class="blob b1"></span><span class="blob b2"></span>' +
            '<div class="float-card a"><span class="demo-tag">示例数据</span><div class="t">PHQ-9 抑郁筛查</div><div class="d">9 题 · 自动判读 · 第9题安全预警</div>' +
              '<div class="bar"><i style="width:72%;background:linear-gradient(90deg,#34d399,var(--grad-teal-3))"></i></div></div>' +
            '<div class="float-card b"><span class="demo-tag">示例数据</span><div class="t">回收进度</div><div class="d">今日 +18 份 · 累计 246 份</div>' +
              '<div class="bar"><i style="width:58%;background:linear-gradient(90deg,#60a5fa,var(--accent))"></i></div></div>' +
            '<div class="float-card c"><span class="demo-tag">示例数据</span><div class="t">Cronbach α = 0.912</div><div class="d">信度良好 · CITC 全部 > 0.3</div>' +
              '<div class="bar"><i style="width:91%;background:linear-gradient(90deg,#c4b5fd,var(--violet))"></i></div></div>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<section class="section" id="features">' +
        '<div class="section-inner">' +
          '<h2>为临床科研设计的功能</h2>' +
          '<div class="sub">从选题、发放到统计，全部在一个本地部署的系统里完成</div>' +
          '<div class="feature-grid">' +
            LANDING_FEATURES.map(function (f, i) {
              return '<div class="feature reveal" style="animation-delay:' + (i * 0.06) + 's;--fc:' + f.c + '">' +
                '<div class="ico" aria-hidden="true" style="background:linear-gradient(135deg,' + f.c + ',' + f.c + 'cc)">' + f.ico + '</div>' +
                '<h3>' + esc(f.t) + '</h3><p>' + esc(f.d) + '</p></div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="section" id="scales" style="padding-top:0">' +
        '<div class="section-inner">' +
          '<h2>覆盖多个专业方向的量表库</h2>' +
          '<div class="sub">情绪与心理 · 睡眠 · 认知与老年 · 护理评估 · 营养评估 · 呼吸与心血管 · 消化与泌尿 · 成瘾行为 · 生活质量 · 照护与负担</div>' +
          '<div class="small muted">下面是部分内置量表节选，完整清单请进入量表库查看</div>' +
          '<div class="marquee-wrap" aria-label="部分内置量表节选"><div class="marquee">' + pills + pills + '</div></div>' +
        '</div>' +
      '</section>' +

      '<section class="section" id="steps">' +
        '<div class="section-inner">' +
          '<h2>四步完成一项调查</h2>' +
          '<div class="sub">首次使用 3 分钟即可发布第一份问卷</div>' +
          '<div class="steps">' +
            [['选题', '从量表库选择模板，或上传自己的量表文件自动识别导入，也可从零自制。'],
              ['发布', '设置样本量、截止时间、匿名与知情同意，一键生成链接与二维码。'],
              ['回收', '受试者手机扫码填写，支持分节进度、断点续填、提交前核对。'],
              ['统计', '自动计分与判读，输出信度、相关、组间/随访比较，可导出 SPSS/R 直接读取的数值 CSV 与变量说明表。']]
              .map(function (s, i) {
                return '<div class="step reveal" style="animation-delay:' + (i * 0.08) + 's">' +
                  '<div class="num">' + (i + 1) + '</div><h4>' + s[0] + '</h4><p>' + s[1] + '</p></div>';
              }).join('') +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="section">' +
        '<div class="section-inner center">' +
          '<h2>现在就把下一项研究跑起来</h2>' +
          '<div class="sub">数据保存在你自己的服务器或电脑上，不经过任何第三方</div>' +
          '<div class="row" style="justify-content:center;gap:12px">' +
            // 主动作已在顶栏与首屏，收尾区只做导览；量表库入口统一收敛到顶栏导航
            '<a class="btn" href="#/guide">看使用流程</a>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<footer class="landing-foot">' +
        '<div class="foot-col">' +
          '<div class="foot-brand">医学量表与问卷平台</div>' +
          '<div class="small muted">本地部署 · 数据保存在自己的服务器或电脑上</div>' +
        '</div>' +
        '<div class="foot-col">' +
          '<div class="foot-h">快捷入口</div>' +
          '<a href="#features">功能一览</a>' +
          '<a href="#/guide">使用流程</a>' +
        '</div>' +
        '<div class="foot-col">' +
          '<div class="foot-h">合规提示</div>' +
          '<div class="small muted">量表授权与伦理审批请按机构要求执行</div>' +
        '</div>' +
      '</footer>' +
      '<button id="back-top" type="button" aria-label="回到顶部" title="回到顶部">↑</button>' +
    '</div>';

  bindRipple();
  bindLandingScroll();
  countUp();
  revealOnScroll();
  bindLandingNav();
  // 短语控制在 16 字内：窄屏单行放得下，打字增删不会触发换行把下方内容顶得乱跳
  typingEffect($('#lp-typing'), ['内置常用医学量表', '支持导入多种文件格式', '自动计分与统计分析', '随访多时点配对检验']);
  ['lp-login', 'lp-login2'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.onclick = function () { go('/login'); };
  });
  ['lp-register', 'lp-start'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.onclick = function () { go('/register'); };
  });
  const homeBtn = document.getElementById('lp-home');
  if (homeBtn) homeBtn.onclick = function () { go('/home'); };
}

/* ================= 视图：登录 / 注册 ================= */
/* ================= 公开页：量表库浏览 / 使用说明 ================= */
async function viewPublicLibrary() {
  if (!state.publicScales) {
    try {
      const d = await api('/public/scales');
      state.publicScales = d.items || [];
      state.publicCategories = d.categories || [];
    } catch (e) {
      // 旧版本后端没有该接口：降级为静态清单 + 提示，而不是报"接口不存在"
      state.publicScales = (state.publicScales || []).concat(DEMO_SCALE_META);
      state.publicCategories = CATEGORIES;
      toast('当前服务版本较旧，已显示基础量表清单；建议重启服务获取完整功能', 'err');
    }
  }
  const all = state.publicScales;
  const kw = (state.libKw || '').trim().toLowerCase();
  const cat = state.libCat || '全部';
  let list = all.filter(function (s) { return cat === '全部' || s.category === cat; });
  if (kw) {
    list = list.filter(function (s) {
      return (s.title + ' ' + s.description + ' ' + s.category + ' ' + (s.tags || []).join(' ')).toLowerCase().indexOf(kw) >= 0;
    });
  }
  const cats = ['全部'].concat(state.publicCategories.filter(function (c) {
    return all.some(function (s) { return s.category === c; });
  }));
  $('#app').innerHTML = '' +
    '<div class="landing">' +
      landingNav('量表库', [
        ['#/', '首页'], ['#/library', '量表库', true], ['#/guide', '使用流程'],
      ], '<button class="btn" id="lib-login">登录</button>' +
        (registerAvailable() ? '<button class="btn primary" id="lib-reg">' + registerLabel() + '</button>' : '')) +
      '<div class="section" style="padding-bottom:20px">' +
        '<div class="section-inner">' +
          '<h2>量表库</h2>' +
          '<div class="sub">浏览全部量表模板与专业分类；注册登录后即可直接发布、回收与统计</div>' +
          '<div class="card">' +
            '<div class="row mb16">' +
              '<input type="search" id="lib-kw" class="grow" aria-label="搜索量表名称、用途或关键词" style="max-width:460px" placeholder="搜索量表名称、用途或关键词，如：抑郁 / 睡眠 / 跌倒" value="' + esc(state.libKw || '') + '">' +
              '<button class="btn primary" id="lib-search">搜索</button>' +
            '</div>' +
            '<div class="chips">' + cats.map(function (c) {
              return '<button class="chip' + (c === cat ? ' active' : '') + '" aria-pressed="' + (c === cat) + '" data-lib-cat="' + esc(c) + '">' + (c === '全部' ? '全部分类' : esc(c)) + '</button>';
            }).join('') + '</div>' +
          '</div>' +
          '<div class="muted small mt16">共 ' + list.length + ' 个量表</div>' +
          '<div class="grid cols-3 mt8">' +
            list.map(function (s) {
              return '<div class="card scale-card hoverable" style="--accent-color:' + catColor(s.category) + '">' +
                '<div class="title"><span class="cat-dot" style="background:' + catColor(s.category) + '"></span>' + esc(s.title) + '</div>' +
                '<div class="small muted mb8">' + esc(s.category) + ' · ' + s.items + ' 题' + (s.dimensions ? ' · ' + s.dimensions + ' 个维度' : '') + '</div>' +
                '<div class="desc">' + esc((s.description || '').slice(0, 92)) + ((s.description || '').length > 92 ? '…' : '') + '</div>' +
                '<div class="row" style="gap:6px;margin-top:8px">' + licenseTag(s) + '</div>' +
                '<div class="foot"><button class="btn small primary" data-lib-use="1">登录后使用</button></div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  const goReg = function () { go(registerAvailable() ? '/register' : '/login'); };
  bindLandingNav();
  $('#lib-login').onclick = function () { go('/login'); };
  if ($('#lib-reg')) $('#lib-reg').onclick = goReg;
  $$('[data-lib-use]').forEach(function (b) { b.onclick = goReg; });
  const doSearch = function () {
    state.libKw = $('#lib-kw').value;
    viewPublicLibrary();
  };
  $('#lib-search').onclick = doSearch;
  $('#lib-kw').onkeydown = function (e) { if (e.key === 'Enter') doSearch(); };
  $$('[data-lib-cat]').forEach(function (b) {
    b.onclick = function () { state.libCat = b.dataset.libCat; viewPublicLibrary(); };
  });
  bindRipple();
}

const GUIDE_SECTIONS = [
  { t: '快速开始', ico: '🚀', items: [
    ['如何开始使用？', '注册账号后进入工作台。首次使用建议从「量表库」选择现成量表，或到「导入量表」上传自己的量表文件。'],
    ['支持哪些量表？', '内置常用医学量表（情绪与心理、睡眠、护理评估、营养、呼吸心血管、消化泌尿、成瘾行为等方向），另有量表目录收录需要授权或培训的量表，标明授权与获取途径。'],
    ['数据保存在哪里？', '全部数据保存在你部署的这台机器的数据库文件中（medscale/data/app.db），不经过任何第三方服务器。'],
  ] },
  { t: '选题与导入', ico: '📚', items: [
    ['怎么把纸质量表变成电子问卷？', '用「导入量表」上传 Excel/Word/PDF 或图片文件。Excel 建议直接下载模板填写，识别最准；Word/PDF 会自动识别题干与选项。图片走服务器本机 OCR，目前仅 macOS 服务器支持，其它系统请改用模板或对照原图手工录入。识别后进入校对页逐题确认即可入库。'],
    ['量表需要授权怎么办？', '平台内置的量表已标注来源与授权状态；需授权的量表（如 MMSE、MoCA、SF-36）请先通过正规渠道获取授权，再自行录入或导入。'],
    ['能改内置量表的条目吗？', '内置模板受保护，创建副本后即可自由修改，原模板保持完整便于对照与引用。'],
  ] },
  { t: '发放与回收', ico: '🔳', items: [
    ['怎么发给受试者？', '发布后生成链接与二维码，可复制链接、下载/打印二维码，手机扫码即可填写。局域网使用时用命令行显示的 IP 地址，公网使用需部署 HTTPS。'],
    ['受试者填到一半退出怎么办？', '系统会自动保存草稿到浏览器本地，重新打开链接会提示恢复，可继续填写或清空重填。'],
    ['如何保证数据质量？', '支持必答校验、提交前核对、匿名模式、样本量上限、截止时间；看板的「数据质量」页会自动检测作答时长异常、直线作答与重复 IP。'],
  ] },
  { t: '统计与导出', ico: '📊', items: [
    ['自动给出哪些统计结果？', '描述统计（均值、SD、中位数、四分位、偏度等）、选项频数、总分与维度分、分级判读分布、Cronbach α 与 CITC、分半信度、相关矩阵、组间 t 检验/ANOVA/卡方（含非参数检验）。'],
    ['怎么做回归或因子分析？', '导出「SPSS 数值版 CSV」与「变量说明」两份文件，直接导入 SPSS/R 即可；选择题导出为分值，多选题拆成 0/1 虚拟变量。'],
    ['什么是分级判读？', '量表可设置分数区间对应的判读与建议（如 PHQ-9 的轻/中/重度），提交后系统自动判定每位受试者的等级并统计分布。'],
  ] },
  { t: '随访与跳题', ico: '🔁', items: [
    ['怎么做干预前后对比？', '在「随访研究」中创建多个时点（如基线、1 个月、3 个月），每个时点有独立链接。受试者填写同一随访编号后，系统自动配对并输出配对 t 检验、Wilcoxon 符号秩检验与随访宽表。'],
    ['跳题逻辑怎么设置？', '在编辑器中，对作为触发条件的单选题设置「跳题逻辑」：勾选触发选项（如"无"），选择"跳至某题"或"结束问卷"。被跳过的题目不计分、不要求作答，统计中单独标记为跳过。'],
  ] },
  { t: '账号与安全', ico: '🔐', items: [
    ['忘记密码怎么办？', '请联系系统管理员在「系统设置 → 用户管理」中重置密码。'],
    ['多个科室一起用会不会互相看到数据？', '数据按创建者隔离：每个人只看得见自己创建的量表与调查及其答卷，管理员可查看全部；内置量表模板对所有人开放。同一台服务器上仍可协作，但请各自用管理员创建的账号登录。'],
    ['研究伦理要注意什么？', '涉及患者的研究请先完成伦理审查与知情同意；平台支持强制知情同意并留痕，建议开启匿名模式、关闭 IP 采集，并在「系统设置」里定期生成数据备份。'],
  ] },
];

function viewGuide() {
  $('#app').innerHTML = '' +
    '<div class="landing">' +
      landingNav('使用说明', [
        ['#/', '首页'], ['#/library', '量表库'], ['#/guide', '使用流程', true],
      ], (state.session && state.session.authenticated
        ? '<a class="btn" href="#/home">返回工作台</a>'
        : '<button class="btn" id="gd-login">登录</button>' +
          (registerAvailable() ? '<button class="btn primary" id="gd-reg">' + registerLabel() + '</button>' : ''))) +
      '<div class="section">' +
        '<div class="section-inner" style="max-width:900px">' +
          '<h2>使用流程与常见问题</h2>' +
          '<div class="sub">从选题、发放到统计的完整说明；也可下载文档留存</div>' +
          '<div class="row mb16" style="justify-content:center;gap:10px">' +
            '<a class="btn small" href="#/library">浏览量表库</a>' +
            '<a class="btn small" href="/api/guide.md" target="_blank" rel="noopener">下载完整使用说明（Markdown）</a>' +
          '</div>' +
          GUIDE_SECTIONS.map(function (sec, si) {
            return '<div class="card reveal mb16" style="animation-delay:' + (si * 0.05) + 's">' +
              '<div class="card-title" style="font-size:16px"><span>' + sec.ico + ' ' + esc(sec.t) + '</span></div>' +
              sec.items.map(function (qa) {
                return '<details style="border-top:1px solid var(--line-2);padding:10px 0">' +
                  '<summary style="cursor:pointer;font-weight:600;font-size:14px;list-style:none">▸ ' + esc(qa[0]) + '</summary>' +
                  '<div class="small" style="color:var(--ink-2);line-height:1.85;margin-top:8px;padding-left:16px">' + esc(qa[1]) + '</div>' +
                '</details>';
              }).join('') +
            '</div>';
          }).join('') +
          '<div class="card"><div class="card-title">还需要帮助？</div>' +
            '<div class="small muted" style="line-height:1.9">' +
              '系统设置中可查看量表授权提示与数据合规建议；如需新增量表、部署到院内服务器或增加多用户隔离，' +
              '可联系开发方按需扩展。</div></div>' +
        '</div>' +
      '</div>' +
      '<footer class="landing-foot">医学量表与问卷平台 · 本地部署 · 量表授权与伦理审批请按机构要求执行</footer>' +
    '</div>';
  bindLandingNav();
  if ($('#gd-login')) $('#gd-login').onclick = function () { go('/login'); };
  if ($('#gd-reg')) $('#gd-reg').onclick = function () { go('/register'); };
  bindRipple();
  revealOnScroll();
}

function viewRegisterClosed() {
  $('#app').innerHTML = '' +
    '<div class="auth-wrap"><div class="auth-card">' +
      '<div class="brand" style="padding:0 0 4px"><div class="brand-mark">量</div>' +
        '<div class="brand-text" style="color:var(--ink)">医学量表平台<small style="color:var(--ink-3)">收集 · 计分 · 统计分析</small></div></div>' +
      '<h1 style="font-size:19px;margin:16px 0 4px">注册已关闭</h1>' +
      '<div class="muted small mb16">本服务由使用方自行部署，账号由管理员统一开通。' +
        '如需账号，请联系管理员在「系统设置 → 谁能开账号」中为你创建，或临时开放注册。</div>' +
      '<a class="btn primary block" href="#/login">用已有账号登录</a>' +
      '<div class="center mt16"><a href="#/admin" class="small muted">用管理员口令登录</a></div>' +
      '<div class="center mt16"><a href="#/" class="small muted">← 返回网站首页</a></div>' +
    '</div></div>';
  bindRipple();
}

function viewAuth(mode) {
  const isReg = mode === 'register';
  const adminMode = mode === 'admin';
  if (isReg && !registerAvailable()) return viewRegisterClosed();
  $('#app').innerHTML = '' +
    '<div class="auth-wrap"><div class="auth-card">' +
      '<div class="brand" style="padding:0 0 4px"><div class="brand-mark">量</div>' +
        '<div class="brand-text" style="color:var(--ink)">医学量表平台<small style="color:var(--ink-3)">收集 · 计分 · 统计分析</small></div></div>' +
      (adminMode
        ? '<div style="margin-top:16px"><h1 style="font-size:19px;margin:0 0 4px">管理员登录</h1>' +
          '<div class="muted small mb16">使用系统管理员密码进入。口令由部署本机的老师保管，' +
          '首次部署时的初始口令会显示在服务器启动日志里，登录后请尽快在「系统设置」中修改。</div></div>'
        : '<div class="auth-tabs">' +
            '<button class="' + (!isReg ? 'active' : '') + '" id="tab-login">登录</button>' +
            '<button class="' + (isReg ? 'active' : '') + '" id="tab-reg">注册</button>' +
          '</div>') +
      (adminMode
        ? '<label class="fld"><span>管理员密码</span><input type="password" id="pwd" placeholder="请输入管理员密码"></label>' +
          '<button class="btn primary block" id="btn-login">进入系统</button>' +
          '<div class="center mt16"><a href="#/login" class="small">← 返回用户登录</a></div>'
        : (isReg
          ? '<label class="fld"><span>用户名（用于登录，3-32 位）*</span><input type="text" id="r-user" placeholder="如 zhangys 或 张医生" autocomplete="username"></label>' +
            // 邀请码模式：把"找管理员要码"写在字段旁边，比只靠提交失败的报错更好懂
            (registerNeedsCode()
              ? '<label class="fld"><span>邀请码 *</span><input type="text" id="reg-invite" placeholder="8 位邀请码" autocomplete="off" autocapitalize="characters" required></label>' +
                '<div class="small muted mb16">没有邀请码？请向管理员索取，管理员在「系统设置 → 谁能开账号」中生成。</div>'
              : '') +
            '<div class="row"><label class="fld grow"><span>密码（至少 6 位）*</span><input type="password" id="r-pwd" autocomplete="new-password"></label>' +
            '<label class="fld grow"><span>确认密码 *</span><input type="password" id="r-pwd2" autocomplete="new-password"></label></div>' +
            '<div class="row"><label class="fld grow"><span>姓名（选填）</span><input type="text" id="r-name" placeholder="如 张医生"></label>' +
            '<label class="fld grow"><span>科室 / 单位（选填）</span><input type="text" id="r-org" placeholder="如 心内科"></label></div>' +
            '<button class="btn primary block" id="btn-register">注册并开始使用</button>' +
            '<div class="banner info mt16 mb0 small">注册后即可创建量表与调查。数据保存在本机服务器，请按机构要求做好伦理与隐私合规。</div>'
          : '<label class="fld"><span>用户名</span><input type="text" id="l-user" placeholder="请输入用户名" autocomplete="username"></label>' +
            '<label class="fld"><span>密码</span><input type="password" id="l-pwd" placeholder="请输入密码" autocomplete="current-password"></label>' +
            '<button class="btn primary block" id="btn-login">登录</button>')) +
      (adminMode ? '' : '<div class="center mt16"><a href="#/admin" class="small muted">用管理员密码登录</a></div>') +
      '<div class="center mt16"><a href="#/" class="small muted">← 返回网站首页</a></div>' +
    '</div></div>';

  bindRipple();
  if (!adminMode) {
    $('#tab-login').onclick = function () { go('/login'); };
    $('#tab-reg').onclick = function () { go('/register'); };
  }
  const doLogin = async function () {
    const btn = $('#btn-login');
    btn.disabled = true;
    try {
      if (adminMode) {
        await api('/login', { method: 'POST', body: { password: $('#pwd').value } });
      } else {
        await api('/login', { method: 'POST', body: { username: $('#l-user').value.trim(), password: $('#l-pwd').value } });
      }
      state.session = await api('/session');
      go('/home');
      render();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
  if ($('#btn-login')) {
    $('#btn-login').onclick = doLogin;
    const pw = adminMode ? $('#pwd') : $('#l-pwd');
    if (pw) pw.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    if (adminMode && $('#pwd')) $('#pwd').focus();
  }
  if ($('#btn-register')) {
    $('#btn-register').onclick = async function () {
      const btn = $('#btn-register');
      btn.disabled = true;
      try {
        await api('/register', {
          method: 'POST',
          body: {
            username: $('#r-user').value.trim(),
            password: $('#r-pwd').value,
            password2: $('#r-pwd2').value,
            name: $('#r-name').value.trim(),
            org: $('#r-org').value.trim(),
            invite: ($('#reg-invite') ? $('#reg-invite').value : '').trim(),
          },
        });
        state.session = await api('/session');
        toast('注册成功，欢迎使用！', 'ok');
        go('/home');
        render();
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    };
  }
}

function viewLogin(subtitle) {
  $('#app').innerHTML = '' +
    '<div class="login-wrap"><div class="login-card">' +
      '<h1>医学量表与问卷平台</h1>' +
      '<div class="sub">' + esc(subtitle || '量表发放 · 数据收集 · 统计分析') + '</div>' +
      '<label class="fld"><span>管理员密码</span>' +
        '<input type="password" id="pwd" placeholder="请输入密码" autocomplete="current-password"></label>' +
      '<button class="btn primary block" id="btn-login">登录</button>' +
    '</div></div>';
  const submit = async function () {
    const pwd = $('#pwd').value;
    if (!pwd) return toast('请输入密码', 'err');
    try {
      await api('/login', { method: 'POST', body: { password: pwd } });
      const s = await api('/session');
      state.session = s;
      render();
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#btn-login').onclick = submit;
  $('#pwd').onkeydown = function (e) { if (e.key === 'Enter') submit(); };
  $('#pwd').focus();
}

/* ================= 视图：首页 ================= */
async function viewHome() {
  const ov = await api('/overview');
  if (!state.scales.length) state.scales = (await api('/scales')).items;
  const tplCount = ov.templateCount !== undefined
    ? ov.templateCount
    : state.scales.filter(function (s) { return s.isTemplate; }).length;
  const hot = ['phq-9', 'gad-7', 'sas', 'sds', 'isi', 'psqi', 'cat-copd', 'act-asthma', 'braden', 'morse-fall', 'katz-adl', 'mmas-8']
    .map(function (code) { return state.scales.find(function (s) { return s.code === code; }); })
    .filter(Boolean);
  const content = '' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">工作台</h1>' +
      '<div class="page-sub">' + tplCount + ' 个内置量表模板 · 量表目录 ' + ov.catalogCount + ' 条 · 数据仅保存在本机</div></div>' +
      '<div class="row">' +
        '<button class="btn" id="btn-new-blank">＋ 自制问卷</button>' +
        '<button class="btn primary" id="btn-goto-library">从量表库选择</button>' +
      '</div>' +
    '</div>' +
    '<div class="grid cols-4">' +
      statCard('量表模板', ov.templateCount, '含 ' + ov.catalogCount + ' 条目录可查') +
      statCard('我的问卷', ov.customCount, '可自由编辑') +
      statCard('进行中调查', ov.openSurveyCount, '共 ' + ov.surveyCount + ' 个调查') +
      statCard('累计答卷', ov.responseCount, '含全部调查') +
    '</div>' +
    '<div class="grid cols-4 mt16">' +
      quickCard('📚', '从量表库发起调查', tplCount + ' 个内置量表模板，含 PHQ-9、PSQI、Barthel、Braden 等，点选即可发布', 'goto-library') +
      quickCard('📥', '导入自己的量表', '上传 Excel / Word / PDF / 图片自动识别题目（图片需 macOS OCR），校对后即可使用', 'goto-import') +
      quickCard('✍️', '自制问卷 / 量表', '自定义题型、维度、反向计分与分级判读，支持跳题逻辑', 'new-blank') +
      quickCard('📈', '查看数据与统计', '自动计分、信度分析、组间比较，一键导出 CSV（含 SPSS 数值版）与变量说明', 'goto-surveys') +
    '</div>' +
    favAreaHtml() +
    '<div class="section-row"><h3>常用量表 · 一键发布</h3><span class="hint">点击卡片查看条目</span></div>' +
    '<div class="grid cols-4">' + hot.map(hotCard).join('') + '</div>' +
    '<div class="grid cols-2 mt16">' +
      '<div class="card"><div class="card-title">最近调查</div>' + recentTable(ov.recent) + '</div>' +
      '<div class="card"><div class="card-title">使用流程</div>' +
        '<ol class="small" style="padding-left:18px;color:var(--ink-2);line-height:2">' +
          '<li><b>选量表</b>：从量表库选择，或从"量表目录"查找需授权的量表。</li>' +
          '<li><b>按需调整</b>：创建副本后删改条目、调整维度与分级。</li>' +
          '<li><b>发布发放</b>：生成链接与二维码，手机扫码即可填写。</li>' +
          '<li><b>回收统计</b>：实时查看进度，自动算分并导出分析。</li>' +
        '</ol>' +
        '<div class="banner info mb0 mt12">正式研究前请核对量表授权、准备知情同意与伦理审批（见"系统设置"）。</div>' +
      '</div>' +
    '</div>';
  $('#app').innerHTML = shell('home', content, [{ label: '工作台' }]);
  afterShell();
  $('#btn-goto-library').onclick = function () { go('/scales'); };
  $('#btn-goto-surveys').onclick = function () { go('/surveys'); };
  $('#btn-goto-import').onclick = function () { go('/import'); };
  $('#btn-new-blank').onclick = async function () {
    const blank = state.scales.find(function (s) { return s.code === 'blank'; });
    if (!blank) return toast('未找到空白模板', 'err');
    const created = await api('/scales', { method: 'POST', body: { fromTemplateId: blank.id, title: '未命名问卷' } });
    go('/builder/' + created.id);
  };
  bindHotCards();
  bindFavButtons();
}

function quickCard(ico, title, desc, id) {
  return '<div class="card hoverable" id="btn-' + id + '" style="cursor:pointer">' +
    '<div style="font-size:26px">' + ico + '</div>' +
    '<div style="font-weight:650;margin:8px 0 4px">' + esc(title) + '</div>' +
    '<div class="muted small">' + esc(desc) + '</div></div>';
}

function hotCard(s) {
  const name = s.title.replace(/（.*?）/g, '');
  return '<div class="card hoverable scale-card" data-hot="' + s.id + '" style="padding:13px">' +
    '<div class="title" style="font-size:14px;margin-bottom:6px">' +
      '<span class="cat-dot" style="background:' + catColor(s.category) + '"></span>' +
      '<span class="grow">' + esc(name) + '</span>' + favBtn(s.code, name) + '</div>' +
    '<div class="muted small">' + s.definition.items.length + ' 题 · ' + esc(s.category) + '</div></div>';
}

function statCard(k, v, sub) {
  // 文本内容一律写终值：动画只是锦上添花，不能依赖 requestAnimationFrame 才能看到正确数字
  const numeric = typeof v === 'number' || (/^\d+$/.test(String(v)) && !Number.isNaN(Number(v)));
  return '<div class="stat"><div class="k">' + esc(k) + '</div>' +
    '<div class="v"' + (numeric ? ' data-count="' + Number(v) + '">' : '>') + esc(v) + '</div>' +
    '<div class="muted small">' + esc(sub || '') + '</div></div>';
}

function recentTable(items) {
  if (!items || !items.length) {
    return '<div class="empty"><p>还没有发布过调查。选一个量表发布后，最近的回收情况会显示在这里。</p>' +
      '<a class="btn primary" href="#/scales">去量表库发布</a></div>';
  }
  return '<div class="table-wrap"><table class="table"><thead><tr>' +
    '<th>调查名称</th><th>状态</th><th class="num">回收</th><th>创建时间</th><th class="acts"></th></tr></thead><tbody>' +
    items.map(function (s) {
      return '<tr><td>' + esc(s.name) + '<div class="muted small">' + esc(s.scaleTitle) + '</div></td>' +
        '<td>' + statusTag(s.status) + '</td>' +
        '<td class="num">' + s.responseCount + '</td>' +
        '<td class="nowrap small">' + fmtDate(s.createdAt) + '</td>' +
        '<td class="acts"><a href="#/survey/' + s.id + '">查看</a></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function statusTag(st) {
  if (st === 'open') return '<span class="tag ok">进行中</span>';
  if (st === 'closed') return '<span class="tag gray">已关闭</span>';
  return '<span class="tag gray">' + esc(st) + '</span>';
}

/* ================= 视图：量表库 ================= */
/* ================= 视图：导入量表 ================= */
let importState = null;

async function viewImport() {
  importState = null;
  const content = '' +
    '<div class="page-head"><div><a href="#/scales" class="small">← 返回量表库</a>' +
      '<h1 class="page-title mt8">导入量表 / 问卷</h1>' +
      '<div class="page-sub">上传文件后自动识别题目与选项，校对确认即可入量表库，之后可像内置量表一样发布、回收、统计</div></div></div>' +
    '<div class="card">' +
      '<div class="dropzone" id="dz">' +
        '<span class="big">📥</span>' +
        '<div style="font-weight:650">点击选择文件，或把文件拖到这里</div>' +
        '<div class="muted small mt8">支持 Excel（.xlsx）、Word（.docx）、PDF、CSV/TXT，以及图片（.jpg/.png 本机 OCR，仅 macOS 服务器可用）</div>' +
        '<input type="file" id="file-input" class="hidden" accept=".xlsx,.docx,.csv,.txt,.pdf,.jpg,.jpeg,.png,.md">' +
      '</div>' +
      '<div class="row mt16" style="justify-content:space-between">' +
        '<div class="small muted">旧版 .doc / .xls 请先在 Office 中另存为 .docx / .xlsx 或 .csv</div>' +
        '<a class="btn small" href="/api/import-template.csv">下载 Excel/CSV 模板</a>' +
      '</div>' +
    '</div>' +
    '<div class="card"><div class="card-title">识别效果最好的方式</div>' +
      '<ol class="small" style="padding-left:18px;color:var(--ink-2);line-height:2">' +
        '<li><b>用模板最省事</b>：下载上面的模板 → 在 Excel 里把题干、选项、分值填好 → 上传，识别准确率 100%。</li>' +
        '<li><b>Word 文档</b>：每道题单独一行，选项写在题目下方（如 <span class="mono">A. 完全没有 B. 好几天</span>），分值可写成 <span class="mono">完全没有（0）</span>。</li>' +
        '<li><b>PDF</b>：仅支持可选中文字的 PDF；扫描版请截图上传走 OCR（仅 macOS 服务器），或改用模板。</li>' +
        '<li><b>图片</b>：会上传后在服务器本机做 OCR（macOS 原生能力），识别失败时可在左侧对照图片手工录入。</li>' +
        '<li>无论哪种方式，识别结果都会进入<b>校对页</b>，逐题可改，确认后才会入量表库。</li>' +
      '</ol>' +
    '</div>' +
    '<div id="import-area"></div>';
  $('#app').innerHTML = shell('scales', content, [{ label: '量表库', href: '#/scales' }, { label: '导入量表' }]);
  afterShell();
  const dz = $('#dz');
  const input = $('#file-input');
  dz.onclick = function () { input.click(); };
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
  });
  dz.addEventListener('drop', function (e) {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleImportFile(f);
  });
  input.onchange = function () { if (input.files[0]) handleImportFile(input.files[0]); };
}

function handleImportFile(file) {
  if (file.size > 20 * 1024 * 1024) return toast('文件过大（上限 20 MB）', 'err');
  const area = $('#import-area');
  area.innerHTML = '<div class="card"><div class="card-title">正在解析 ' + esc(file.name) + '…</div>' +
    '<div class="skeleton" style="height:14px;margin-bottom:8px"></div><div class="skeleton" style="height:14px;width:60%"></div>' +
    '<div class="small muted mt12">本地解析，文件不会上传到任何第三方服务器</div></div>';
  const reader = new FileReader();
  reader.onload = async function () {
    const isImg = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp|heic)$/i.test(file.name);
    const base64 = String(reader.result).split(',')[1] || '';
    if (isImg) {
      try { importState = Object.assign({}, importState || {}); importState.imageDataUrl = reader.result; } catch (e) { /* ignore */ }
    }
    try {
      const res = await api('/import/parse', { method: 'POST', body: { filename: file.name, data: base64 } });
      importState = Object.assign(importState || {}, res, { filename: file.name });
      renderImportReview();
    } catch (e) {
      area.innerHTML = '<div class="card"><div class="banner danger">解析失败：' + esc(e.message) + '</div>' +
        '<button class="btn" data-reload="import">重新选择文件</button></div>';
    }
  };
  reader.onerror = function () { toast('读取文件失败', 'err'); };
  reader.readAsDataURL(file);
}

function renderImportReview() {
  const st = importState;
  if (!st) return;
  const typeOpts = Object.keys(TYPE_LABEL).filter(function (t) { return t !== 'matrix'; });
  const warn = (st.warnings || []).length
    ? '<div class="banner warn"><b>识别提示（请重点核对）</b><br>' + st.warnings.map(esc).join('<br>') + '</div>'
    : '<div class="banner ok">已成功识别 ' + st.items.length + ' 道题，请核对后保存。</div>';
  const rows = st.items.map(function (it, i) {
    const opts = (it.options || []).map(function (o) { return o.label + (o.value !== undefined ? '|' + o.value : ''); }).join('\n');
    return '<div class="import-row" data-row="' + i + '">' +
      '<div class="row" style="gap:8px;align-items:flex-start">' +
        '<span class="no">第 ' + (i + 1) + ' 题</span>' +
        '<select data-imp-type="' + i + '" style="width:118px">' +
          typeOpts.map(function (t) { return opt(t, TYPE_LABEL[t], it.type); }).join('') + '</select>' +
        '<input type="text" class="grow" data-imp-text="' + i + '" value="' + esc(it.text) + '" placeholder="题干">' +
        '<label class="row nowrap small" style="gap:4px"><input type="checkbox" style="width:auto" data-imp-exclude="' + i + '"' + (it.exclude ? ' checked' : '') + '>不计分</label>' +
        '<button class="btn small danger" data-imp-del="' + i + '">删除</button>' +
      '</div>' +
      (['radio', 'select', 'checkbox'].indexOf(it.type) >= 0
        ? '<textarea class="mt8" data-imp-opts="' + i + '" placeholder="每行一个选项，可写「完全不会|0」指定分值">' + esc(opts) + '</textarea>'
        : '<input type="text" class="mt8" data-imp-opts="' + i + '" value="" placeholder="（填空题/数字题无需填写选项）" disabled>') +
    '</div>';
  }).join('');
  $('#import-area').innerHTML = '' +
    '<div class="card mt16"><div class="card-title">校对识别结果<span class="hint">来源：' + esc(st.filename) + '（' +
      esc(st.kind) + (st.ocr ? ' · OCR' : '') + (st.structured ? ' · 模板结构' : '') + '）</span></div>' +
      warn +
      '<div class="grid split-grid">' +
        '<div><div id="imp-rows">' + rows + '</div>' +
          '<button class="btn small mt8" id="imp-add">＋ 添加一题</button></div>' +
        '<div>' +
          (st.imageDataUrl ? '<div class="card"><div class="card-title">原图对照</div><img class="import-thumb" src="' + st.imageDataUrl + '" alt="上传的图片"></div>' : '') +
          (st.rawText ? '<div class="card"><div class="card-title">识别到的原文<span class="hint">便于比对</span></div>' +
            '<div class="import-preview">' + esc(st.rawText.slice(0, 4000)) + '</div></div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card mt16"><div class="card-title">量表信息</div>' +
        '<div class="row">' +
          '<label class="fld grow"><span>量表名称 *</span><input type="text" id="imp-title" value="' + esc(st.title || st.filename.replace(/\.[^.]+$/, '')) + '"></label>' +
          '<label class="fld" style="width:200px"><span>分类</span><select id="imp-cat">' +
            allCategories().map(function (c) { return opt(c, c, st.category || '通用问卷'); }).join('') + '</select></label>' +
        '</div>' +
        '<label class="fld"><span>指导语</span><textarea id="imp-inst">' + esc(st.instructions || '请根据您的实际情况作答，每题选择最符合的一项。') + '</textarea></label>' +
        '<div class="row">' +
          '<label class="fld" style="width:190px"><span>计分方式</span><select id="imp-method">' +
            opt('sum', '各题求和', 'sum') + opt('mean', '各题均分', 'sum') + opt('none', '不计分（纯调查）', 'sum') + '</select></label>' +
          '<div class="fld grow"><span>&nbsp;</span>' +
            '<div class="row"><button class="btn primary" id="imp-save">保存到量表库</button>' +
            '<button class="btn" id="imp-save-pub">保存并发布调查</button></div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  bindImportRows();
}

function bindImportRows() {
  $$('[data-imp-text]').forEach(function (el) {
    el.oninput = function () { importState.items[Number(el.dataset.impText)].text = el.value; };
  });
  $$('[data-imp-type]').forEach(function (el) {
    el.onchange = function () {
      const i = Number(el.dataset.impType);
      importState.items[i].type = el.value;
      if (['radio', 'select', 'checkbox'].indexOf(el.value) >= 0 && !(importState.items[i].options || []).length) {
        importState.items[i].options = [
          { label: '完全不同意', value: 1 }, { label: '不同意', value: 2 }, { label: '一般', value: 3 },
          { label: '同意', value: 4 }, { label: '非常同意', value: 5 },
        ];
      }
      renderImportReview();
    };
  });
  $$('[data-imp-exclude]').forEach(function (el) {
    el.onchange = function () {
      const i = Number(el.dataset.impExclude);
      if (el.checked) importState.items[i].exclude = true; else delete importState.items[i].exclude;
    };
  });
  $$('[data-imp-opts]').forEach(function (el) {
    el.oninput = function () {
      const i = Number(el.dataset.impOpts);
      const opts = el.value.split('\n').map(function (line) {
        const s = line.trim();
        if (!s) return null;
        const parts = s.split('|');
        const label = (parts[0] || '').trim();
        const v = parts[1] !== undefined ? Number(parts[1]) : null;
        return { label: label, value: Number.isFinite(v) ? v : undefined };
      }).filter(Boolean);
      opts.forEach(function (o, k) { if (o.value === undefined) o.value = k; });
      importState.items[i].options = opts;
    };
  });
  $$('[data-imp-del]').forEach(function (b) {
    b.onclick = function () {
      importState.items.splice(Number(b.dataset.impDel), 1);
      renderImportReview();
    };
  });
  if ($('#imp-add')) {
    $('#imp-add').onclick = function () {
      importState.items.push({ text: '', type: 'radio', required: true, options: [
        { label: '完全不同意', value: 1 }, { label: '不同意', value: 2 }, { label: '一般', value: 3 },
        { label: '同意', value: 4 }, { label: '非常同意', value: 5 }] });
      renderImportReview();
    };
  }
  $('#imp-save').onclick = function () { saveImported(false); };
  $('#imp-save-pub').onclick = function () { saveImported(true); };
}

async function saveImported(thenPublish) {
  const st = importState;
  const items = (st.items || []).map(function (it, i) {
    const o = Object.assign({}, it);
    o.id = 'q' + (i + 1);
    o.no = i + 1;
    if (['radio', 'select', 'checkbox'].indexOf(o.type) >= 0) {
      if (!o.options || o.options.length < 2) return null;
    }
    return o;
  });
  if (items.some(function (x) { return x === null; })) return toast('有选择题的选项不足 2 个，请补充', 'err');
  const bad = items.findIndex(function (it) { return !String(it.text || '').trim(); });
  if (bad >= 0) return toast('第 ' + (bad + 1) + ' 题题干为空', 'err');
  if (!items.length) return toast('至少需要一道题', 'err');
  const scored = items.filter(function (it) {
    return ['radio', 'select', 'number', 'slider'].indexOf(it.type) >= 0 && !it.exclude;
  });
  let lo = 0;
  let hi = 0;
  scored.forEach(function (it) {
    const vals = (it.options || []).map(function (o) { return Number(o.value); }).filter(Number.isFinite);
    if (vals.length) { lo += Math.min.apply(null, vals); hi += Math.max.apply(null, vals); }
  });
  const scale = {
    title: $('#imp-title').value.trim() || '导入的量表',
    category: $('#imp-cat').value,
    description: '由文件「' + st.filename + '」自动识别导入，共 ' + items.length + ' 题',
    instructions: $('#imp-inst').value,
    tags: ['导入'],
    source: '用户导入（' + st.filename + '）',
    license: '请自行确认原量表授权情况',
    definition: {
      items: items,
      dimensions: [],
      scoring: {
        method: $('#imp-method').value,
        totalRange: [lo, hi],
        cutoffs: [],
      },
    },
  };
  try {
    const created = await api('/scales', { method: 'POST', body: { scale: scale } });
    state.scales = [];
    toast('已保存到量表库');
    if (thenPublish) return openPublishDialog(created.id);
    go('/builder/' + created.id);
  } catch (e) { toast(e.message, 'err'); }
}

async function viewScales(query) {
  if (!state.scales.length) state.scales = (await api('/scales')).items;
  if (!state.categories.length) state.categories = (await api('/overview')).categories || [];
  const kw = (query && query.kw) || '';
  const cat = (query && query.cat) || '全部';
  const only = (query && query.only) || 'all';
  const sort = (query && query.sort) || 'default';

  const isCatalog = only === 'catalog';
  const content = '' +
    '<div class="page-head"><div><h1 class="page-title">量表库</h1>' +
    '<div class="page-sub">' + (isCatalog
      ? '收录需授权/需培训的常用量表，便于选表；如需使用请通过正规渠道获取授权'
      : '共 ' + state.scales.length + ' 个量表可用，点选即可发布或创建副本') + '</div></div>' +
    '<div class="row"><button class="btn" id="btn-blank2">＋ 空白问卷</button>' +
    '<button class="btn" id="btn-import">📥 导入量表</button>' +
    '<button class="btn primary" id="btn-from-template">从模板创建副本</button></div></div>' +

    '<div class="card">' +
      '<div class="row mb16">' +
        '<input type="text" id="kw" class="grow" aria-label="按名称、用途或关键词搜索量表" placeholder="搜索名称、用途或关键词，如：抑郁 / 睡眠 / PSQI / 跌倒" value="' + esc(kw) + '" style="max-width:460px">' +
        '<select id="only" aria-label="量表来源筛选" style="width:150px">' +
          opt('all', '全部来源', only) + opt('template', '内置模板', only) +
          opt('custom', '我的问卷', only) + opt('catalog', '量表目录', only) +
        '</select>' +
        '<select id="sort" aria-label="量表排序方式" style="width:130px">' +
          opt('default', '默认排序', sort) + opt('items', '按题量', sort) + opt('name', '按名称', sort) +
        '</select>' +
        '<button class="btn primary" id="btn-search">搜索</button>' +
      '</div>' +
      (isCatalog ? '' :
        '<div class="chips">' +
          ['全部'].concat(allCategories()).map(function (c) {
            return '<button class="chip' + (c === cat ? ' active' : '') + '" aria-pressed="' + (c === cat) + '" data-cat="' + esc(c) + '">' +
              (c === '全部' ? '全部分类' : esc(c)) + '</button>';
          }).join('') +
        '</div>') +
    '</div>' +
    '<div id="list-area" class="mt16"></div>';

  $('#app').innerHTML = shell('scales', content, [{ label: '量表库' }]);
  afterShell();

  const goto = function (over) {
    const q = Object.assign({ kw: kw, cat: cat, only: only, sort: sort }, over || {});
    go('/scales?' + [q.kw, q.cat, q.only, q.sort].map(encodeURIComponent).join('|'));
  };
  const doSearch = function () { goto({ kw: $('#kw').value }); };
  $('#btn-search').onclick = doSearch;
  $('#kw').onkeydown = function (e) { if (e.key === 'Enter') doSearch(); };
  $('#only').onchange = function () { goto({ only: $('#only').value }); };
  $('#sort').onchange = function () { goto({ sort: $('#sort').value }); };
  $$('[data-cat]').forEach(function (b) { b.onclick = function () { goto({ cat: b.dataset.cat }); }; });
  $('#btn-from-template').onclick = function () { goto({ only: 'template' }); };
  $('#btn-import').onclick = function () { go('/import'); };
  $('#btn-blank2').onclick = async function () {
    const blank = state.scales.find(function (s) { return s.code === 'blank'; });
    const created = await api('/scales', { method: 'POST', body: { fromTemplateId: blank.id, title: '未命名问卷' } });
    go('/builder/' + created.id);
  };

  if (isCatalog) return renderCatalog(kw, sort);

  let list = state.scales.slice();
  if (cat !== '全部') list = list.filter(function (s) { return s.category === cat; });
  if (only === 'template') list = list.filter(function (s) { return s.isTemplate; });
  if (only === 'custom') list = list.filter(function (s) { return !s.isTemplate; });
  if (kw) {
    const k = kw.toLowerCase();
    list = list.filter(function (s) {
      return (s.title + ' ' + s.description + ' ' + s.code + ' ' + s.category + ' ' + (s.tags || []).join(' '))
        .toLowerCase().indexOf(k) >= 0;
    });
  }
  if (sort === 'items') list.sort(function (a, b) { return a.definition.items.length - b.definition.items.length; });
  if (sort === 'name') list.sort(function (a, b) { return a.title.localeCompare(b.title, 'zh'); });

  $('#list-area').innerHTML = list.length
    ? '<div class="muted small mb8">共 ' + list.length + ' 个结果</div><div class="grid cols-3">' + list.map(scaleCard).join('') + '</div>'
    : '<div class="card"><div class="empty"><span class="big">🔍</span>没有匹配的量表<br><span class="small">试试其他关键词，或到「量表目录」查找需授权的量表</span></div></div>';
  bindScaleCards();
  bindFavButtons();
}

/** 量表目录（元数据检索） */
async function renderCatalog(kw, sort) {
  if (!state.catalog) {
    const d = await api('/scale-catalog');
    state.catalog = d.items;
  }
  let list = state.catalog.slice();
  if (kw) {
    const k = kw.toLowerCase();
    list = list.filter(function (c) {
      return (c.name + ' ' + (c.alias || '') + ' ' + c.category + ' ' + c.note + ' ' + c.license).toLowerCase().indexOf(k) >= 0;
    });
  }
  if (sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
  const grouped = {};
  list.forEach(function (c) { (grouped[c.category] = grouped[c.category] || []).push(c); });

  $('#list-area').innerHTML = list.length
    ? '<div class="muted small mb8">共 ' + list.length + ' 条 · 点击任意条目可查看授权与获取途径</div>' +
      Object.keys(grouped).map(function (catName) {
        return '<div class="card mb16"><div class="card-title">' +
          '<span><span class="cat-dot" style="background:' + catColor(catName) + '"></span>' + esc(catName) + '</span>' +
          '<span class="hint">' + grouped[catName].length + ' 项</span></div>' +
          '<div class="table-wrap"><table class="table"><thead><tr>' +
          '<th>量表名称</th><th>条目数</th><th>计分方式</th><th>授权状态</th></tr></thead><tbody>' +
          grouped[catName].map(function (c) {
            const lic = licenseKind(c.license, false);
            return '<tr><td><b>' + esc(c.name) + '</b>' + (c.alias ? '<div class="muted small">' + esc(c.alias) + '</div>' : '') +
              '<div class="small muted">' + esc(c.note) + '</div></td>' +
              '<td class="nowrap">' + esc(c.items) + '</td>' +
              '<td class="small">' + esc(c.scoring) + '</td>' +
              '<td class="small"><span class="tag lic-tag ' + lic.key + '">' + esc(c.license) + '</span></td></tr>';
          }).join('') +
          '</tbody></table></div></div>';
      }).join('')
    : '<div class="card"><div class="empty"><span class="big">🗂️</span>没有匹配的目录条目</div></div>';
}

function opt(v, label, cur) {
  return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function parseScaleQuery(raw) {
  if (!raw) return {};
  const parts = raw.split('|');
  const dec = function (s) {
    try { return decodeURIComponent(s || ''); } catch (e) { return s || ''; }
  };
  return {
    kw: dec(parts[0]),
    cat: dec(parts[1]) || '全部',
    only: parts[2] || 'all',
    sort: parts[3] || 'default',
  };
}

function scaleCard(s) {
  const n = s.definition.items.length;
  const dims = (s.definition.dimensions || []).length;
  const scoring = s.definition.scoring || {};
  const scoreInfo = scoring.method && scoring.method !== 'none' ? '自动计分' : '不计分';
  const hasReverse = s.definition.items.some(function (i) { return i.reverse; });
  return '<div class="card scale-card hoverable" data-scale="' + s.id + '">' +
    '<div class="title"><span class="cat-dot" style="background:' + catColor(s.category) + '"></span>' +
      '<span class="grow">' + esc(s.title) + '</span>' + favBtn(s.code, s.title) + '</div>' +
    '<div class="small muted mb8">' +
      esc(s.category) + ' · ' + n + ' 题 · ' + estimateMinutes(n) + (dims ? ' · ' + dims + ' 个维度' : '') +
    '</div>' +
    '<div class="desc">' + esc((s.description || '').slice(0, 96)) + ((s.description || '').length > 96 ? '…' : '') + '</div>' +
    '<div class="row" style="gap:6px;margin-top:8px">' +
      (s.isTemplate ? '<span class="tag gray">内置模板</span>' : '<span class="tag ok">我的问卷</span>') +
      licenseTag(s) +
      '<span class="tag blue">' + scoreInfo + '</span>' +
      (hasReverse ? '<span class="tag gray">含反向计分</span>' : '') +
      ((scoring.cutoffs || []).length ? '<span class="tag">' + scoring.cutoffs.length + ' 级判读</span>' : '') +
    '</div>' +
    '<div class="foot">' +
      '<button class="btn small" data-act="view" data-id="' + s.id + '">查看条目</button>' +
      (s.isTemplate
        ? '<button class="btn small primary" data-act="copy" data-id="' + s.id + '">创建副本</button>'
        : '<button class="btn small primary" data-act="edit" data-id="' + s.id + '">编辑</button>' +
          '<button class="btn small danger" data-act="del" data-id="' + s.id + '">删除</button>') +
      '<button class="btn small" data-act="publish" data-id="' + s.id + '">发布调查</button>' +
    '</div>' +
  '</div>';
}

function bindScaleCards() {
  // 整卡可点进详情：卡片本来就有手型光标和悬停抬升，只在按钮上响应会让人觉得"点了没反应"。
  // 卡内按钮/星标/链接各自先 stopPropagation，互不打架；键盘用户仍走「查看条目」按钮。
  $$('[data-scale]').forEach(function (card) {
    card.onclick = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-act],[data-fav],a,input,select,button')) return;
      go('/scale/' + card.dataset.scale);
    };
  });
  $$('[data-act]').forEach(function (b) {
    b.onclick = async function (e) {
      e.stopPropagation();
      const id = Number(b.dataset.id);
      const act = b.dataset.act;
      if (act === 'view') return go('/scale/' + id);
      if (act === 'edit') return go('/builder/' + id);
      if (act === 'copy') {
        const created = await api('/scales', { method: 'POST', body: { fromTemplateId: id } });
        state.scales = [];
        toast('已创建副本，可自由编辑');
        return go('/builder/' + created.id);
      }
      if (act === 'publish') return openPublishDialog(id);
      if (act === 'del') {
        if (!confirmBox('确定删除这个量表？删除后不可恢复。')) return;
        try {
          await api('/scales/' + id, { method: 'DELETE' });
          state.scales = [];
          toast('已删除');
          render();
        } catch (err) { toast(err.message, 'err'); }
      }
    };
  });
}

/* ================= 视图：量表详情 ================= */
async function viewScaleDetail(id) {
  const s = await api('/scales/' + id);
  const def = s.definition;
  const scoring = def.scoring || {};
  const usage = scaleUsage(s);
  const pendCount = SHARED.pendingItems(def).length;
  pushRecentCode(s.code);
  const content = '' +
    '<div class="page-head">' +
      '<div><a href="#/scales" class="small">← 返回量表库</a>' +
      '<h1 class="page-title mt8">' + esc(s.title) + '</h1>' +
      '<div class="row small" style="gap:6px">' +
        '<span class="tag gray">' + esc(s.category) + '</span>' +
        '<span class="tag gray">' + def.items.length + ' 个条目</span>' +
        ((def.dimensions || []).length ? '<span class="tag gray">' + def.dimensions.length + ' 个维度</span>' : '') +
      '</div>' +
      (pendCount ? '<div class="banner warn mt12">这份量表还有 <b>' + pendCount + '</b> 道题待填入授权文本。' +
        (s.isTemplate ? '点「创建副本并编辑」，把题干和选项替换成授权版本原文后即可发布。' : '请在编辑器中补全后再发布。') + '</div>' : '') +
      '</div>' +
      '<div class="row">' +
        favBtn(s.code, s.title) +
        (s.isTemplate
          ? '<button class="btn" id="d-copy">创建副本并编辑</button>'
          : '<button class="btn" id="d-edit">编辑量表</button>') +
        '<button class="btn primary" id="d-publish">发布为调查</button>' +
      '</div>' +
    '</div>' +
    '<div class="grid cols-2">' +
      '<div class="card"><div class="card-title">量表说明</div>' +
        '<div class="kv">' +
          '<dt>指导语</dt><dd>' + esc(s.instructions || '—') + '</dd>' +
          '<dt>计分方式</dt><dd>' + esc(scoringText(scoring)) + '</dd>' +
          '<dt>来源文献</dt><dd class="small">' + esc(s.source || '—') + '</dd>' +
          '<dt>授权说明</dt><dd class="small">' + esc(s.license || '—') + '</dd>' +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-title">使用方法<span class="hint">施测与结果解释要点</span></div>' +
        '<div class="kv">' +
          '<dt>适用人群</dt><dd>' + esc(usage.population) + '</dd>' +
          '<dt>施测方式</dt><dd>' + esc(usage.mode) + '</dd>' +
          '<dt>预计用时</dt><dd>' + esc(usage.time) + '（' + def.items.length + ' 个条目）</dd>' +
          '<dt>计分方法</dt><dd>' + esc(usage.scoring) + '</dd>' +
          '<dt>结果判读</dt><dd class="small">' + esc(usage.interpretation) + '</dd>' +
          '<dt>注意事项</dt><dd class="small">' + esc(usage.notes) + '</dd>' +
          '<dt>信效度参考</dt><dd class="small">' + esc(usage.psychometrics) + '</dd>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid cols-2 mt16">' +
      '<div class="card"><div class="card-title">分级解释（自动判定）</div>' +
        (Array.isArray(scoring.cutoffs) && scoring.cutoffs.length
          ? '<div class="table-wrap"><table class="table"><thead><tr><th>分值区间</th><th>判读</th><th>建议</th></tr></thead><tbody>' +
            scoring.cutoffs.map(function (c, i) {
              const lo = i === 0 ? 0 : scoring.cutoffs[i - 1].max;
              const loTxt = i === 0 ? (scoring.totalRange ? scoring.totalRange[0] : 0) : (Number.isInteger(lo) ? lo + 1 : lo);
              return '<tr><td class="nowrap">' + loTxt + ' – ' + c.max + '</td><td>' + esc(c.label) + '</td>' +
                '<td class="small">' + esc(c.advice || '') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="empty">该量表不计分，或未设置分级</div>') +
      '</div>' +
    '</div>' +
    '<div class="card mt16"><div class="card-title">条目内容<span class="hint">发布后受试者看到的顺序</span></div>' +
      def.items.map(function (it) { return itemPreview(it); }).join('') +
    '</div>' +
    (def.dimensions && def.dimensions.length
      ? '<div class="card mt16"><div class="card-title">维度结构</div><div class="table-wrap"><table class="table">' +
        '<thead><tr><th>维度</th><th>包含条目</th><th>条目数</th></tr></thead><tbody>' +
        def.dimensions.map(function (d) {
          return '<tr><td>' + esc(d.name) + '</td><td class="small">' +
            (d.items || []).map(function (iid) {
              const it = def.items.find(function (x) { return x.id === iid; });
              return it ? '第' + esc(it.no) + '题' : esc(iid);
            }).join('、') + '</td><td>' + (d.items || []).length + '</td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '');

  $('#app').innerHTML = shell('scales', content, [{ label: '量表库', href: '#/scales' }, { label: s.title }]);
  afterShell();
  const copyBtn = $('#d-copy');
  if (copyBtn) copyBtn.onclick = async function () {
    const created = await api('/scales', { method: 'POST', body: { fromTemplateId: s.id } });
    state.scales = [];
    go('/builder/' + created.id);
  };
  const editBtn = $('#d-edit');
  if (editBtn) editBtn.onclick = function () { go('/builder/' + s.id); };
  $('#d-publish').onclick = function () { openPublishDialog(s.id); };
  bindFavButtons();
}

const TYPE_LABEL = {
  radio: '单选题', checkbox: '多选题', select: '下拉单选', number: '数字填空',
  text: '单行填空', textarea: '多行填空', slider: '滑块评分', time: '时间', date: '日期', matrix: '矩阵题',
};

function itemPreview(it) {
  return '<div class="item-editor">' +
    '<div class="head"><span class="no-chip">第 ' + it.no + ' 题</span>' +
      '<span class="tag gray">' + esc(TYPE_LABEL[it.type] || it.type) + '</span>' +
      (it.reverse ? '<span class="tag warn">反向计分</span>' : '') +
      (it.exclude ? '<span class="tag gray">不计入总分</span>' : '') +
      (it.required === false ? '<span class="tag gray">选填</span>' : '') +
      (it.safety ? '<span class="tag danger">安全预警条目</span>' : '') +
    '</div>' +
    '<div style="font-weight:600;margin-bottom:8px">' + esc(it.text) + '</div>' +
    (it.hint ? '<div class="banner warn" style="margin:0 0 8px;padding:8px 10px">' + esc(it.hint) + '</div>' : '') +
    (it.options && it.options.length
      ? '<div class="small muted">' + it.options.map(function (o) { return esc(o.label) + '（' + esc(o.value) + '分）'; }).join('　·　') + '</div>'
      : '<div class="small muted">' + (it.type === 'slider' ? '滑块范围 ' + numOr(it.min, 0) + ' – ' + numOr(it.max, 10)
        : it.type === 'number' ? '数值范围 ' + numOr(it.min, '不限') + ' – ' + numOr(it.max, '不限') + (it.unit ? ' ' + esc(it.unit) : '')
        : '受试者自行填写文本') + '</div>') +
    '</div>';
}

function scoringText(sc) {
  if (!sc || sc.method === 'none') return '本表不计总分（仅做描述统计）';
  if (sc.method === 'custom') return '专用计分规则（' + (sc.custom === 'psqi' ? 'PSQI 七成分记分' : sc.custom) + '）';
  const base = sc.method === 'mean' ? '各条目均分' : '各条目求和';
  const hi = sc.method === 'mean' ? '分数越高代表程度越重' : '总分越高代表程度越重';
  const rev = sc.reverseMax !== undefined ? '；含反向计分条目（按 ' + sc.reverseMax + ' 分制反转）' : '';
  const mul = sc.multiplier ? '；总分 ×' + sc.multiplier : '';
  return base + '计分' + mul + rev + '，' + hi + '。';
}

/** 生成/读取量表的"使用方法"信息（内置 usage 优先，否则按量表结构自动生成） */
function scaleUsage(s) {
  const u = s.usage || (s.definition && s.definition.usage);
  if (u) return u;
  const def = s.definition || {};
  const items = def.items || [];
  const sc = def.scoring || {};
  const isRater = (s.tags || []).some(function (t) { return /他评|医师|评定者|访谈/.test(t); });
  const popMap = {
    '情绪与心理': '有情绪困扰或心理筛查需求的人群；可用于临床、社区与科研样本',
    '睡眠': '存在入睡困难、易醒、早醒或日间嗜睡的人群',
    '认知与老年': '老年人或有认知功能主诉者，需结合临床评估',
    '护理评估': '住院与社区患者，用于护理风险评估与分级',
    '营养评估': '存在营养风险的人群（老年、肿瘤、术后、慢病患者）',
    '呼吸与心血管': '呼吸系统或心血管疾病患者，用于症状与功能评估',
    '消化与泌尿': '相应系统症状患者，用于症状严重程度与疗效评价',
    '康复与疼痛': '疼痛或功能障碍患者，用于功能评定与康复疗效评价',
    '用药与依从性': '长期用药的慢病患者',
    '成瘾行为': '需要筛查饮酒、吸烟或药物使用问题的人群',
    '照护与负担': '患者的主要照顾者',
    '症状评估': '有相应症状负担的患者（如肿瘤、姑息治疗人群）',
    '躯体症状': '存在多种躯体不适的患者',
    '生活质量': '需要评价健康相关生活质量的人群',
    '通用问卷': '一般人群或特定研究人群',
  };
  const cuts = (sc.cutoffs || []);
  return {
    population: popMap[s.category] || '适用人群请结合量表来源文献与本研究纳入标准确定',
    mode: isRater ? '他评（由医护人员或评定者完成）' : '自评（受试者自行填写）',
    time: estimateMinutes(items.length),
    scoring: scoringText(sc),
    interpretation: cuts.length
      ? cuts.map(function (c, i) {
          const lo = i === 0 ? (sc.totalRange ? sc.totalRange[0] : 0) : cuts[i - 1].max;
          return (i === 0 ? lo : lo) + '–' + c.max + ' 分：' + c.label + (c.advice ? '（' + c.advice + '）' : '');
        }).join('；')
      : '本量表未设置分级判读，请参考来源文献解释得分。',
    notes: (s.license ? '授权：' + s.license + ' ' : '') +
      '正式研究前请核对官方版本的条目措辞，并在论文中规范引用来源文献。',
    psychometrics: '信效度指标请参见来源文献（见"来源文献"栏）。',
  };
}

/* ================= 视图：量表编辑器 ================= */
let draft = null;
let draftIsNew = false;
const collapsedItems = new Set();
let dragFromIdx = -1;

function newBlankScale() {
  return {
    code: 'custom-' + Math.random().toString(36).slice(2, 8),
    title: '未命名问卷',
    category: '通用问卷',
    description: '',
    instructions: '请根据您的实际情况填写以下问题。',
    source: '',
    license: '',
    tags: [],
    consentOn: false,
    consentText: '本问卷用于医学研究，采用匿名方式收集数据，结果仅用于统计分析，不会泄露您的个人信息。填写即表示您同意参与本次调查。',
    anonymous: true,
    definition: {
      items: [blankItem('radio', 1)],
      dimensions: [],
      scoring: { method: 'sum', totalRange: null, cutoffs: [] },
    },
  };
}

function blankItem(type, no) {
  const t = type || 'radio';
  const it = {
    id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    no: no || 1,
    text: '',
    type: t,
    required: true,
  };
  if (t === 'radio' || t === 'select' || t === 'checkbox') {
    it.options = [
      { label: '非常不同意', value: 1 },
      { label: '不同意', value: 2 },
      { label: '一般', value: 3 },
      { label: '同意', value: 4 },
      { label: '非常同意', value: 5 },
    ];
  }
  if (t === 'slider') { it.min = 0; it.max = 10; }
  if (t === 'number') { it.min = 0; it.max = 100; it.unit = ''; }
  return it;
}

async function viewBuilder(id) {
  if (editorDraftTimer) { clearTimeout(editorDraftTimer); editorDraftTimer = null; }
  if (id) {
    const s = await api('/scales/' + id);
    // 请求期间用户可能已切到另一个编辑器；旧响应不能覆盖新页面或写错量表
    const now = currentRoute();
    if (now.name !== 'builder' || String(now.args[0]) !== String(id)) return;
    if (s.isBuiltin) {
      toast('内置模板不可直接修改，正在创建副本…');
      const created = await api('/scales', { method: 'POST', body: { fromTemplateId: s.id } });
      const still = currentRoute();
      if (still.name !== 'builder' || String(still.args[0]) !== String(id)) return;
      return go('/builder/' + created.id);
    }
    draft = s;
    draftIsNew = false;
    normalizeDraft();
    editorDraftKey = editorStorageKey(id);
    const pending = readEditorDraft(id);
    const newer = pending && (!s.updatedAt || Date.parse(pending.savedAt) > Date.parse(s.updatedAt));
    if (newer) {
      draft = pending.draft;
      draftIsNew = false;
      normalizeDraft();
      editorDirty = true;
      toast('已恢复上次未保存的编辑');
    } else {
      editorDirty = false;
    }
  } else {
    draft = newBlankScale();
    draftIsNew = true;
    editorDraftKey = editorStorageKey(null);
    editorDirty = false;
  }
  renderBuilder(true);
}

function normalizeDraft() {
  const def = draft.definition;
  if (!def.scoring) def.scoring = { method: 'none' };
  if (!def.dimensions) def.dimensions = [];
  // 把维度成员回填到题目上，便于编辑
  def.dimensions.forEach(function (d) {
    (d.items || []).forEach(function (iid) {
      const it = def.items.find(function (x) { return x.id === iid; });
      if (it && !it.dimension) it.dimension = d.id;
    });
  });
  def.items.forEach(function (it, i) {
    it.no = i + 1;
    if (!it.id) it.id = 'q' + (i + 1);
  });
}

function renderBuilder(skipSync) {
  // 同一草稿重绘前同步当前输入；首次载入另一量表时不得读取旧页面的表单。
  if (!skipSync) {
    syncBasicFields();
    scheduleEditorDraft();
  }
  const def = draft.definition;
  const sc = def.scoring;
  const content = '' +
    '<div class="page-head">' +
      '<div><a href="#/scales" class="small">← 返回量表库</a>' +
        '<h1 class="page-title mt8">' + (draftIsNew ? '新建问卷' : '编辑量表') + '</h1>' +
        '<div class="page-sub">共 ' + def.items.length + ' 个条目 · 修改后请点击右上角"保存"' +
        (draft.updatedAt ? ' · 上次保存 ' + fmtDate(draft.updatedAt) : '') + '</div></div>' +
      '<div class="row">' +
        '<button class="btn" id="b-preview">预览填写效果</button>' +
        '<button class="btn primary" id="b-save">保存</button>' +
      '</div>' +
    '</div>' +
    '<div class="grid builder-grid">' +
      '<div>' +
        '<div class="card"><div class="card-title">基本信息</div>' +
          '<label class="fld"><span>量表/问卷名称 *</span><input type="text" id="f-title" value="' + esc(draft.title) + '"></label>' +
          '<div class="row">' +
            '<label class="fld grow"><span>分类</span><select id="f-category">' +
              allCategories().map(function (c) { return opt(c, c, draft.category); }).join('') +
              (allCategories().indexOf(draft.category) < 0 ? opt(draft.category, draft.category, draft.category) : '') +
            '</select></label>' +
            '<label class="fld grow"><span>关键词标签（逗号分隔）</span><input type="text" id="f-tags" value="' + esc((draft.tags || []).join('，')) + '"></label>' +
          '</div>' +
          '<label class="fld"><span>简介（用于列表展示）</span><textarea id="f-desc">' + esc(draft.description) + '</textarea></label>' +
          '<label class="fld"><span>指导语（受试者在题目上方看到）</span><textarea id="f-instructions">' + esc(draft.instructions) + '</textarea></label>' +
          '<div class="row">' +
            '<label class="fld grow"><span>来源文献</span><input type="text" id="f-source" value="' + esc(draft.source) + '"></label>' +
            '<label class="fld grow"><span>授权说明</span><input type="text" id="f-license" value="' + esc(draft.license) + '"></label>' +
          '</div>' +
        '</div>' +

        '<div class="card"><div class="card-title">条目编辑 <span class="hint">拖动不便时可用 ↑↓ 调整顺序</span></div>' +
          '<div id="item-list">' + def.items.map(itemEditor).join('') + '</div>' +
          '<div class="row mt12">' +
            '<select id="add-type" aria-label="新题的题型" style="width:170px">' +
              Object.keys(TYPE_LABEL).filter(function (t) { return t !== 'matrix'; })
                .map(function (t) { return opt(t, TYPE_LABEL[t], 'radio'); }).join('') +
            '</select>' +
            '<button class="btn primary" id="b-add">＋ 添加题目</button>' +
            '<button class="btn" id="b-add5">＋ 快速添加 5 道李克特题</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div>' +
        builderSummary() +
        '<div class="card"><div class="card-title">维度设置<span class="hint">可留空</span></div>' +
          '<div id="dim-list">' +
            (def.dimensions.length ? def.dimensions.map(function (d, i) {
              const cnt = def.items.filter(function (x) { return x.dimension === d.id; }).length;
              return '<div class="opt-row"><input type="text" class="lab" aria-label="维度名称" data-dim-name="' + i + '" value="' + esc(d.name) + '">' +
                '<span class="muted small nowrap">' + cnt + ' 题</span>' +
                '<button class="btn small danger" data-dim-del="' + i + '" aria-label="删除该维度">删</button></div>';
            }).join('') : '<div class="muted small">尚未设置维度。多维度量表（如 PSQI、PSS-10）可在此添加。</div>') +
          '</div>' +
          '<button class="btn small mt8" id="b-add-dim">＋ 添加维度</button>' +
        '</div>' +

        '<div class="card"><div class="card-title">计分设置</div>' +
          '<label class="fld"><span>计分方式</span><select id="f-method">' +
            opt('sum', '各题求和（总分）', sc.method) +
            opt('mean', '各题均分', sc.method) +
            opt('none', '不计分（仅描述统计）', sc.method) +
            (sc.method === 'custom' ? opt('custom', '专用计分规则（' + sc.custom + '）', sc.method) : '') +
            (sc.method === 'formula' ? opt('formula', '具名公式（' + sc.formula + '）', sc.method) : '') +
          '</select></label>' +
          '<div class="row">' +
            '<label class="fld grow"><span>总分倍数（如 WHO-5 填 4）</span><input type="number" id="f-mult" value="' + esc(sc.multiplier || 1) + '"></label>' +
            '<label class="fld grow"><span>反向计分最大分（如 4）</span><input type="number" id="f-revmax" value="' + esc(sc.reverseMax === undefined ? '' : sc.reverseMax) + '"></label>' +
          '</div>' +
          '<div class="card-title mt8">分级解释</div>' +
          '<div id="cut-list">' +
            ((sc.cutoffs || []).length ? sc.cutoffs.map(function (c, i) {
              return '<div class="item-editor" style="padding:10px">' +
                '<div class="opt-row"><input type="text" class="lab" aria-label="判读名称" data-cut-label="' + i + '" value="' + esc(c.label) + '" placeholder="判读名称，如：轻度">' +
                '<input type="number" class="val" step="0.1" aria-label="该档总分上限" data-cut-max="' + i + '" value="' + esc(c.max) + '" placeholder="≤"></div>' +
                '<div class="opt-row"><select class="lab" aria-label="判读等级" data-cut-level="' + i + '">' +
                  ['normal:正常', 'mild:轻度', 'moderate:中度', 'severe:重度'].map(function (lv) {
                    const [v, l] = lv.split(':');
                    return opt(v, l, c.level || 'normal');
                  }).join('') + '</select>' +
                  '<button class="btn small danger" data-cut-del="' + i + '" aria-label="删除该分级">删</button></div>' +
                '<input type="text" class="mt8" aria-label="处理建议" data-cut-advice="' + i + '" value="' + esc(c.advice || '') + '" placeholder="处理建议（选填）">' +
                '</div>';
            }).join('') : '<div class="muted small">未设置分级。设置后系统会自动判读每位受试者的严重程度。</div>') +
          '</div>' +
          '<button class="btn small mt8" id="b-add-cut">＋ 添加分级</button>' +
        '</div>' +

        '<div class="card"><div class="card-title">知情同意</div>' +
          '<label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="f-consent"' + (draft.consentOn ? ' checked' : '') + ' style="width:auto"> ' +
          '<span>填写前须阅读并勾选知情同意</span></label>' +
          '<textarea id="f-consent-text" aria-label="知情同意说明文本" placeholder="知情同意说明文本">' + esc(draft.consentText || '') + '</textarea>' +
        '</div>' +

        '<div class="card"><button class="btn primary block" id="b-save2">保存</button>' +
          '<button class="btn block mt8" id="b-publish2">保存并发布</button></div>' +
      '</div>' +
    '</div>';

  $('#app').innerHTML = shell('scales', content, [{ label: '量表库', href: '#/scales' }, { label: draftIsNew ? '新建问卷' : '编辑量表' }]);
  afterShell();
  bindBuilder();
}

/** 编辑器右侧的实时概览 */
function builderSummary() {
  const def = draft.definition;
  const items = def.items || [];
  const scoreable = items.filter(function (it) {
    return ['radio', 'select', 'checkbox', 'number', 'slider'].indexOf(it.type) >= 0 && !it.exclude;
  });
  let maxScore = 0;
  let minScore = 0;
  scoreable.forEach(function (it) {
    let vals = [];
    if (it.options && it.options.length) vals = it.options.map(function (o) { return Number(o.value); }).filter(Number.isFinite);
    else if (it.type === 'slider' || it.type === 'number') vals = [Number(it.min || 0), Number(it.max === undefined ? 10 : it.max)];
    if (vals.length) {
      const lo = Math.min.apply(null, vals);
      const hi = Math.max.apply(null, vals);
      // 反向计分题：作答值越低得分越高
      minScore += it.reverse ? hi : lo;
      maxScore += it.reverse ? lo : hi;
    }
  });
  const sc = def.scoring || {};
  const mul = sc.multiplier || 1;
  if (sc.method === 'mean' && scoreable.length) {
    minScore = Math.round(minScore / scoreable.length * 100) / 100;
    maxScore = Math.round(maxScore / scoreable.length * 100) / 100;
  } else {
    minScore = Math.round(minScore * mul * 100) / 100;
    maxScore = Math.round(maxScore * mul * 100) / 100;
  }
  const kpi = function (k, v, extra) {
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line-2)">' +
      '<span class="small muted">' + k + '</span><span class="small"><b>' + v + '</b>' + (extra ? ' ' + extra : '') + '</span></div>';
  };
  return '<div class="card"><div class="card-title">实时概览</div>' +
    kpi('题目总数', items.length + ' 题') +
    kpi('计入总分', scoreable.length + ' 题') +
    kpi('反向计分题', items.filter(function (i) { return i.reverse; }).length + ' 题') +
    kpi('维度数', (def.dimensions || []).length + ' 个') +
    (sc.method === 'none' ? kpi('计分方式', '不计分') :
      kpi('可能得分范围', minScore + ' – ' + maxScore, sc.multiplier ? '（×' + sc.multiplier + '）' : '')) +
    kpi('判读分级', ((sc.cutoffs || []).length || '未设置') + ((sc.cutoffs || []).length ? ' 级' : '')) +
    '<div class="small muted mt8">提示：按 ⌘S / Ctrl+S 可快速保存</div>' +
  '</div>';
}

function itemEditor(it, i) {
  const hasOpts = ['radio', 'select', 'checkbox'].indexOf(it.type) >= 0;
  const dimOpts = draft.definition.dimensions.map(function (d) {
    return opt(d.id, d.name, it.dimension || '');
  }).join('');
  const folded = collapsedItems.has(it.id);
  return '<div class="item-editor' + (folded ? ' collapsed' : '') + '" draggable="false" data-idx="' + i + '" data-id="' + esc(it.id) + '">' +
    '<div class="head">' +
      (folded
        ? '<span class="drag-handle" draggable="true" title="拖动排序">⋮⋮</span>'
        : '<span class="drag-handle" draggable="true" title="拖动排序">⋮⋮</span>') +
      '<span class="no-chip">第 ' + (i + 1) + ' 题</span>' +
      '<select data-f="type" aria-label="题型" style="width:130px">' +
        Object.keys(TYPE_LABEL).filter(function (t) { return t !== 'matrix'; })
          .map(function (t) { return opt(t, TYPE_LABEL[t], it.type); }).join('') +
      '</select>' +
      (folded ? '<span class="muted small grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(String(it.text || '').slice(0, 40)) + '</span>' : '') +
      '<span class="grow"></span>' +
      '<button class="btn small" data-act="fold" title="折叠/展开">' + (folded ? '展开' : '折叠') + '</button>' +
      '<button class="btn small" data-act="up" aria-label="上移该题">↑</button>' +
      '<button class="btn small" data-act="down" aria-label="下移该题">↓</button>' +
      '<button class="btn small" data-act="dup">复制</button>' +
      '<button class="btn small danger" data-act="del">删除</button>' +
    '</div>' +
    '<textarea data-f="text" aria-label="题干文字" placeholder="请输入题干">' + esc(it.text) + '</textarea>' +
    (hasOpts ? '<div class="mt8"><div class="muted small mb8">选项与分值（“分值”用于自动计分）</div>' +
      '<div data-opts>' + (it.options || []).map(function (o, j) {
        const hasScore = o.score !== undefined;
        return '<div class="opt-row"><input type="text" class="lab" aria-label="选项文字" data-opt-label="' + j + '" value="' + esc(o.label) + '" placeholder="选项文字">' +
          (hasScore ? '<span class="small muted">编码：' + esc(o.value) + '</span>' : '') +
          '<input type="number" class="val" step="0.5" aria-label="选项分值" data-opt-' + (hasScore ? 'score' : 'value') + '="' + j +
            '" value="' + esc(hasScore ? (o.score === null ? '' : o.score) : o.value) + '" placeholder="分值"' + (hasScore && o.score === null ? ' disabled' : '') + '>' +
          '<button class="btn small danger" data-opt-del="' + j + '" aria-label="删除该选项">×</button></div>';
      }).join('') + '</div>' +
      '<button class="btn small" data-act="add-opt">＋ 添加选项</button></div>' : '') +
    (it.type === 'slider' || it.type === 'number'
      ? '<div class="row mt8"><input type="number" data-f="min" class="val" aria-label="最小值" value="' + esc(it.min === undefined ? 0 : it.min) + '" placeholder="最小值">' +
        '<input type="number" data-f="max" class="val" aria-label="最大值" value="' + esc(it.max === undefined ? 10 : it.max) + '" placeholder="最大值">' +
        '<input type="text" data-f="unit" aria-label="单位" style="width:110px" value="' + esc(it.unit || '') + '" placeholder="单位"></div>' : '') +
    ((it.type === 'radio' || it.type === 'select')
      ? '<div class="mt8" style="border-top:1px dashed var(--line);padding-top:10px">' +
        '<div class="small muted mb8">跳题逻辑（可选）：满足条件时跳过后续题目</div>' +
        (it.skip || []).map(function (r, k) {
          const others = draft.definition.items.filter(function (x, xi2) { return xi2 > i; });
          return '<div class="opt-row" style="flex-wrap:wrap;gap:6px">' +
            '<span class="small muted nowrap">当选择</span>' +
            (it.options || []).map(function (o, oi) {
              const on = toList(r.values).indexOf(String(o.value)) >= 0;
              return '<label class="small row nowrap" style="gap:3px"><input type="checkbox" style="width:auto" data-skip-val="' + k + ':' + oi + '"' + (on ? ' checked' : '') + '>' + esc(o.label) + '</label>';
            }).join('') +
            '<span class="small muted nowrap">时</span>' +
            '<select data-skip-action="' + k + '" aria-label="跳题动作" style="width:auto">' +
              '<option value="goto"' + (r.action === 'goto' ? ' selected' : '') + '>跳至</option>' +
              '<option value="end"' + (r.action === 'end' ? ' selected' : '') + '>结束问卷</option>' +
            '</select>' +
            (r.action === 'goto'
              ? '<select data-skip-target="' + k + '" aria-label="跳转目标题目" style="width:auto">' + others.map(function (x) {
                  return '<option value="' + esc(x.id) + '"' + (r.target === x.id ? ' selected' : '') + '>第 ' + x.no + ' 题</option>';
                }).join('') + '</select>'
              : '<span class="small muted nowrap">（后面题目全部跳过）</span>') +
            '<button class="btn small danger" data-skip-del="' + k + '" aria-label="删除该跳题规则">×</button>' +
          '</div>';
        }).join('') +
        '<button class="btn small" data-act="add-skip">＋ 添加跳题规则</button></div>'
      : '') +
    '<div class="row mt8 small">' +
      '<label class="row" style="gap:6px"><input type="checkbox" data-f="required"' + (it.required === false ? '' : ' checked') + ' style="width:auto"> 必答</label>' +
      '<label class="row" style="gap:6px"><input type="checkbox" data-f="exclude"' + (it.exclude ? ' checked' : '') + ' style="width:auto"> 不计入总分</label>' +
      '<label class="row" style="gap:6px"><input type="checkbox" data-f="reverse"' + (it.reverse ? ' checked' : '') + ' style="width:auto"> 反向计分</label>' +
      (draft.definition.dimensions.length
        ? '<label class="row" style="gap:6px">所属维度 <select data-f="dimension" style="width:auto"><option value="">（无）</option>' + dimOpts + '</select></label>' : '') +
    '</div>' +
    '<input type="text" class="mt8" aria-label="提示语 / 跳转说明" data-f="hint" value="' + esc(it.hint || '') + '" placeholder="提示语 / 跳转说明（选填）">' +
  '</div>';
}

function bindBuilder() {
  if (!bindBuilder._keys) {
    bindBuilder._keys = true;
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if ($('#b-save')) {
          e.preventDefault();
          saveBuilder(false);
        }
      }
    });
  }
  ['f-title', 'f-category', 'f-tags', 'f-desc', 'f-instructions', 'f-source', 'f-license',
    'f-consent-text', 'f-method', 'f-mult', 'f-revmax'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.oninput = el.onchange = function () { syncBasicFields(); scheduleEditorDraft(); };
  });
  // 输入即写入草稿
  const bindFields = function (root) {
    $$('[data-f]', root).forEach(function (el) {
      el.oninput = el.onchange = function () { applyItemField(el); };
    });
    $$('[data-opt-label],[data-opt-value],[data-opt-score]', root).forEach(function (el) {
      el.oninput = function () { applyOptionField(el); };
    });
    $$('[data-skip-val]', root).forEach(function (el) {
      el.onchange = function () { applySkipField(card, el, 'val'); };
    });
    $$('[data-skip-action]', root).forEach(function (el) {
      el.onchange = function () { applySkipField(card, el, 'action'); };
    });
    $$('[data-skip-target]', root).forEach(function (el) {
      el.onchange = function () { applySkipField(card, el, 'target'); };
    });
    $$('[data-skip-del]', root).forEach(function (b) {
      b.onclick = function () {
        draft.definition.items[Number(card.dataset.idx)].skip.splice(Number(b.dataset.skipDel), 1);
        renderBuilder();
      };
    });
  };
  $$('#item-list .item-editor').forEach(function (card) {
    bindFields(card);
    // 拖拽排序
    const handle = $('.drag-handle', card);
    if (handle) {
      handle.ondragstart = function (e) {
        dragFromIdx = Number(card.dataset.idx);
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(dragFromIdx));
        }
      };
      handle.ondragend = function () {
        card.classList.remove('dragging');
        $$('.item-editor').forEach(function (c) { c.classList.remove('drop-target'); });
      };
    }
    card.ondragover = function (e) {
      if (dragFromIdx < 0) return;
      e.preventDefault();
      card.classList.add('drop-target');
    };
    card.ondragleave = function () { card.classList.remove('drop-target'); };
    card.ondrop = function (e) {
      e.preventDefault();
      card.classList.remove('drop-target');
      const to = Number(card.dataset.idx);
      if (dragFromIdx < 0 || dragFromIdx === to) return;
      syncBasicFields();
      const items = draft.definition.items;
      const moved = items.splice(dragFromIdx, 1)[0];
      items.splice(to, 0, moved);
      items.forEach(function (it, i) { it.no = i + 1; });
      dragFromIdx = -1;
      renderBuilder();
    };
    $$('[data-act]', card).forEach(function (b) {
      b.onclick = function () { itemAction(card, b.dataset.act, b); };
    });
    $$('[data-opt-del]', card).forEach(function (b) {
      b.onclick = function () {
        const idx = Number(card.dataset.idx);
        draft.definition.items[idx].options.splice(Number(b.dataset.optDel), 1);
        renderBuilder();
      };
    });
  });

  $('#b-add').onclick = function () {
    const type = $('#add-type').value;
    draft.definition.items.push(blankItem(type, draft.definition.items.length + 1));
    renderBuilder();
  };
  $('#b-add5').onclick = function () {
    for (let i = 0; i < 5; i += 1) {
      const it = blankItem('radio', draft.definition.items.length + 1);
      it.text = '';
      draft.definition.items.push(it);
    }
    renderBuilder();
  };
  $('#b-add-dim').onclick = function () {
    draft.definition.dimensions.push({ id: 'd' + Math.random().toString(36).slice(2, 7), name: '维度' + (draft.definition.dimensions.length + 1), items: [] });
    renderBuilder();
  };
  $$('[data-dim-name]').forEach(function (el) {
    el.oninput = function () { draft.definition.dimensions[Number(el.dataset.dimName)].name = el.value; };
  });
  $$('[data-dim-del]').forEach(function (b) {
    b.onclick = function () {
      const i = Number(b.dataset.dimDel);
      const dim = draft.definition.dimensions[i];
      draft.definition.items.forEach(function (it) { if (it.dimension === dim.id) delete it.dimension; });
      draft.definition.dimensions.splice(i, 1);
      renderBuilder();
    };
  });
  $('#b-add-cut').onclick = function () {
    const cuts = draft.definition.scoring.cutoffs || (draft.definition.scoring.cutoffs = []);
    const last = cuts.length ? Number(cuts[cuts.length - 1].max) : 0;
    cuts.push({ max: last + 5, label: '分级' + (cuts.length + 1), level: 'mild', advice: '' });
    renderBuilder();
  };
  $$('[data-cut-label]').forEach(function (el) {
    el.oninput = function () { draft.definition.scoring.cutoffs[Number(el.dataset.cutLabel)].label = el.value; };
  });
  $$('[data-cut-max]').forEach(function (el) {
    el.oninput = function () { draft.definition.scoring.cutoffs[Number(el.dataset.cutMax)].max = Number(el.value); };
  });
  $$('[data-cut-level]').forEach(function (el) {
    el.onchange = function () { draft.definition.scoring.cutoffs[Number(el.dataset.cutLevel)].level = el.value; };
  });
  $$('[data-cut-advice]').forEach(function (el) {
    el.oninput = function () { draft.definition.scoring.cutoffs[Number(el.dataset.cutAdvice)].advice = el.value; };
  });
  $$('[data-cut-del]').forEach(function (b) {
    b.onclick = function () { draft.definition.scoring.cutoffs.splice(Number(b.dataset.cutDel), 1); renderBuilder(); };
  });

  $('#f-consent').onchange = function () { draft.consentOn = $('#f-consent').checked; };
  $('#b-save').onclick = function () { saveBuilder(false); };
  $('#b-save2').onclick = function () { saveBuilder(false); };
  $('#b-publish2').onclick = function () { saveBuilder(true); };
  $('#b-preview').onclick = function () { saveBuilder(false, true); };
}

function applyItemField(el) {
  const card = el.closest('.item-editor');
  const it = draft.definition.items[Number(card.dataset.idx)];
  const f = el.dataset.f;
  if (f === 'text') it.text = el.value;
  else if (f === 'type') it.type = el.value;
  else if (f === 'required') it.required = el.checked;
  else if (f === 'exclude') { if (el.checked) it.exclude = true; else delete it.exclude; }
  else if (f === 'reverse') { if (el.checked) it.reverse = true; else delete it.reverse; }
  else if (f === 'dimension') { if (el.value) it.dimension = el.value; else delete it.dimension; }
  else if (f === 'hint') { if (el.value) it.hint = el.value; else delete it.hint; }
  else if (f === 'min' || f === 'max') it[f] = el.value === '' ? undefined : Number(el.value);
  else if (f === 'unit') it.unit = el.value;
  scheduleEditorDraft();
  if (el.tagName === 'SELECT' && f === 'type') {
    if (['radio', 'select', 'checkbox'].indexOf(it.type) >= 0 && !it.options) {
      it.options = blankItem('radio').options;
    }
    renderBuilder();
  }
}

function applyOptionField(el) {
  const card = el.closest('.item-editor');
  const it = draft.definition.items[Number(card.dataset.idx)];
  if (el.dataset.optLabel !== undefined) it.options[Number(el.dataset.optLabel)].label = el.value;
  if (el.dataset.optValue !== undefined) it.options[Number(el.dataset.optValue)].value = el.value === '' ? 0 : Number(el.value);
  if (el.dataset.optScore !== undefined) {
    const option = it.options[Number(el.dataset.optScore)];
    if (option.score !== null) option.score = el.value === '' ? 0 : Number(el.value);
  }
  scheduleEditorDraft();
}

/** 跳题规则字段变更 */
function applySkipField(card, el, kind) {
  const it = draft.definition.items[Number(card.dataset.idx)];
  it.skip = it.skip || [];
  if (kind === 'val') {
    const parts = String(el.dataset.skipVal).split(':');
    const k = Number(parts[0]);
    const oi = Number(parts[1]);
    const rule = it.skip[k];
    if (!rule) return;
    const v = it.options[oi] ? it.options[oi].value : oi;
    const list = toList(rule.values);
    const key = String(v);
    const pos = list.indexOf(key);
    if (el.checked && pos < 0) list.push(key);
    if (!el.checked && pos >= 0) list.splice(pos, 1);
    rule.values = list;
    if (!list.length) { it.skip.splice(k, 1); renderBuilder(); }
    return;
  }
  if (kind === 'action') {
    const k = Number(el.dataset.skipAction);
    if (!it.skip[k]) return;
    it.skip[k].action = el.value;
    if (el.value === 'goto' && !it.skip[k].target) {
      const others = draft.definition.items.slice(Number(card.dataset.idx) + 1);
      it.skip[k].target = others.length ? others[0].id : '';
    }
    renderBuilder();
    return;
  }
  if (kind === 'target') {
    const k = Number(el.dataset.skipTarget);
    if (it.skip[k]) it.skip[k].target = el.value;
  }
  scheduleEditorDraft();
}

function itemAction(card, act) {
  const idx = Number(card.dataset.idx);
  const items = draft.definition.items;
  if (act === 'fold') {
    const id = items[idx].id;
    if (collapsedItems.has(id)) collapsedItems.delete(id); else collapsedItems.add(id);
    renderBuilder();
    return;
  }
  if (act === 'add-skip') {
    const it = items[idx];
    const others = items.slice(idx + 1);
    if (!others.length) return toast('最后一题无法设置跳题', 'err');
    it.skip = it.skip || [];
    it.skip.push({
      values: it.options && it.options.length ? [String(it.options[0].value)] : [],
      action: 'goto',
      target: others[0].id,
    });
    renderBuilder();
    return;
  }
  if (act === 'up' && idx > 0) {
    const t = items[idx - 1]; items[idx - 1] = items[idx]; items[idx] = t;
  } else if (act === 'down' && idx < items.length - 1) {
    const t = items[idx + 1]; items[idx + 1] = items[idx]; items[idx] = t;
  } else if (act === 'del') {
    if (items.length <= 1) return toast('至少保留一道题', 'err');
    if (!confirmBox('删除第 ' + (idx + 1) + ' 题？')) return;
    items.splice(idx, 1);
  } else if (act === 'dup') {
    const cp = JSON.parse(JSON.stringify(items[idx]));
    cp.id = 'q' + Math.random().toString(36).slice(2, 9);
    items.splice(idx + 1, 0, cp);
  } else if (act === 'add-opt') {
    const it = items[idx];
    it.options = it.options || [];
    const lastVal = it.options.length ? Number(it.options[it.options.length - 1].value) : 0;
    it.options.push({ label: '', value: lastVal + 1 });
  }
  items.forEach(function (it, i) { it.no = i + 1; });
  renderBuilder();
}

/** 把「基本信息 / 计分设置」表单的当前值同步进草稿 */
function syncBasicFields() {
  if (!draft) return;
  const t = $('#f-title');
  if (t) draft.title = t.value.trim() || '未命名问卷';
  if ($('#f-category')) draft.category = $('#f-category').value;
  if ($('#f-tags')) draft.tags = $('#f-tags').value.split(/[,，\s]+/).filter(Boolean);
  if ($('#f-desc')) draft.description = $('#f-desc').value;
  if ($('#f-instructions')) draft.instructions = $('#f-instructions').value;
  if ($('#f-source')) draft.source = $('#f-source').value;
  if ($('#f-license')) draft.license = $('#f-license').value;
  if ($('#f-consent-text')) draft.consentText = $('#f-consent-text').value;
  if ($('#f-consent')) draft.consentOn = $('#f-consent').checked;

  const sc = draft.definition.scoring;
  if ($('#f-method') && sc.method !== 'custom') sc.method = $('#f-method').value;
  if ($('#f-mult')) sc.multiplier = Number($('#f-mult').value) || 1;
  if ($('#f-revmax')) {
    const v = $('#f-revmax').value;
    if (v === '') delete sc.reverseMax; else sc.reverseMax = Number(v);
  }
  if (sc.multiplier === 1) delete sc.multiplier;
}

async function saveBuilder(thenPublish, previewOnly) {
  syncBasicFields();

  // 校验
  if (!draft.title) return toast('请填写量表名称', 'err');
  const empty = draft.definition.items.findIndex(function (it) { return !String(it.text || '').trim(); });
  if (empty >= 0) return toast('第 ' + (empty + 1) + ' 题的题干为空', 'err');
  const badOpt = draft.definition.items.find(function (it) {
    return ['radio', 'select', 'checkbox'].indexOf(it.type) >= 0 &&
      (!it.options || it.options.length < 2 || it.options.some(function (o) { return !String(o.label || '').trim(); }));
  });
  if (badOpt) return toast('选择题"' + badOpt.text.slice(0, 12) + '…"的选项不完整（至少 2 个且文字不为空）', 'err');

  // 由题目上的维度归属重建维度结构
  draft.definition.dimensions.forEach(function (d) {
    d.items = draft.definition.items.filter(function (it) { return it.dimension === d.id; }).map(function (it) { return it.id; });
  });
  draft.definition.dimensions = draft.definition.dimensions.filter(function (d) { return d.items.length > 0; });
  draft.definition.items.forEach(function (it, i) { it.no = i + 1; });

  if (previewOnly && draftIsNew) {
    return openFillPreview(draft);
  }
  if (previewOnly) return openFillPreview(draft);

  try {
    let saved;
    if (draftIsNew) {
      const payload = JSON.parse(JSON.stringify(draft));
      delete payload.id;
      saved = await api('/scales', { method: 'POST', body: { scale: payload } });
      draftIsNew = false;
    } else {
      saved = await api('/scales/' + draft.id, { method: 'PUT', body: draft });
    }
    draft = saved;
    normalizeDraft();
    editorDirty = false;
    if (editorDraftTimer) { clearTimeout(editorDraftTimer); editorDraftTimer = null; }
    clearEditorDraft(saved.id);
    editorDraftKey = editorStorageKey(saved.id);
    state.scales = [];
    toast('已保存');
    if (location.hash !== '#/builder/' + saved.id) {
      history.replaceState(null, '', '#/builder/' + saved.id);
    }
    // 保存后的重绘不得重新标脏：表单值已与刚保存的草稿一致
    renderBuilder(true);
    if (thenPublish) openPublishDialog(saved.id);
  } catch (e) {
    toast(e.message, 'err');
  }
}

/** 填写页按需加载：管理端首屏不必下载受试者填写逻辑 */
let fillScriptPromise = null;
function ensureFill() {
  if (window.MEDSCALE_FILL) return Promise.resolve(window.MEDSCALE_FILL);
  if (!fillScriptPromise) {
    fillScriptPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = '/fill.js';
      s.onload = function () { resolve(window.MEDSCALE_FILL); };
      s.onerror = function () {
        fillScriptPromise = null;
        reject(new Error('填写页脚本加载失败，请刷新后重试'));
      };
      document.head.appendChild(s);
    });
  }
  return fillScriptPromise;
}

async function openFillPreview(scaleLike) {
  const mock = {
    survey: {
      name: scaleLike.title,
      anonymous: true,
      showResult: true,
      note: '',
      status: 'open',
      closesAt: null,
    },
    open: true,
    responded: 0,
    scale: {
      title: scaleLike.title,
      description: scaleLike.description,
      instructions: scaleLike.instructions,
      consentOn: scaleLike.consentOn,
      consentText: scaleLike.consentText,
      definition: scaleLike.definition,
    },
    preview: true,
  };
  try {
    await ensureFill();
    window.MEDSCALE_FILL_BACK = renderBuilder;
    window.MEDSCALE_FILL.render(mock, null, true);
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ================= 发布对话框 ================= */
async function openPublishDialog(scaleId) {
  const s = await api('/scales/' + scaleId);
  const pend = SHARED.pendingItems(s.definition);
  if (pend.length) {
    toast('还有 ' + pend.length + ' 道题待填入授权文本，请先复制为「我的量表」并在编辑器中填写后再发布', 'err');
    return;
  }
  const div = document.createElement('div');
  div.className = 'modal-mask';
  div.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-t-publish">' +
    '<div class="card-title" id="dlg-t-publish" style="font-size:17px">发布调查：' + esc(s.title) + '</div>' +
    '<label class="fld"><span>调查名称（受试者可见）</span><input type="text" id="p-name" value="' + esc(s.title) + '"></label>' +
    '<div class="row">' +
      '<label class="fld grow"><span>目标样本量（可留空）</span><input type="number" id="p-max" placeholder="如 200"></label>' +
      '<label class="fld grow"><span>截止时间（可留空）</span><input type="date" id="p-close"></label>' +
    '</div>' +
    '<label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="p-anon" checked style="width:auto"> <span>匿名收集（不记录可识别个人身份的信息）</span></label>' +
    '<label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="p-result"> <span>提交后立即向受试者展示计分结果与解释</span></label>' +
    '<label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="p-meta" checked style="width:auto"> <span>记录 IP 与设备信息（用于质控，如重复提交排查）</span></label>' +
    '<label class="fld"><span>致谢语 / 备注</span><input type="text" id="p-note" placeholder="如：感谢您参与本次调查！"></label>' +
    (s.license ? '<div class="banner info small">授权提示：' + esc(s.license) + '</div>' : '') +
    '<div class="row mt16" style="justify-content:flex-end">' +
      '<button class="btn" id="p-cancel">取消</button>' +
      '<button class="btn primary" id="p-ok">生成链接与二维码</button>' +
    '</div></div>';
  mountModal(div);
  div.onclick = function (e) { if (e.target === div) div.remove(); };
  $('#p-cancel', div).onclick = function () { div.remove(); };
  $('#p-ok', div).onclick = async function () {
    try {
      const created = await api('/surveys', {
        method: 'POST',
        body: {
          scaleId: scaleId,
          name: $('#p-name', div).value,
          maxResponses: $('#p-max', div).value || null,
          closesAt: $('#p-close', div).value || null,
          anonymous: $('#p-anon', div).checked,
          showResult: $('#p-result', div).checked,
          collectMeta: $('#p-meta', div).checked,
          note: $('#p-note', div).value,
        },
      });
      div.remove();
      state.surveys = [];
      go('/survey/' + created.id);
    } catch (e) { toast(e.message, 'err'); }
  };
}

function surveyUrl(token) {
  return location.origin + '/s/' + token;
}

function qrSrc(text, size) {
  return '/api/qr.png?text=' + encodeURIComponent(text) + '&scale=' + (size || 8);
}

/* ================= 视图：调查列表 ================= */
async function viewSurveys() {
  const data = await api('/surveys');
  state.surveys = data.items;
  const content = '' +
    '<div class="page-head"><div><h1 class="page-title">发放与数据</h1>' +
      '<div class="page-sub">共 ' + data.items.length + ' 个调查 · 扫码或链接即可填写</div></div>' +
      '<button class="btn primary" id="s-new">＋ 发布新调查</button></div>' +
    (data.items.length
      ? '<div class="card"><div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>调查名称</th><th>量表</th><th>状态</th><th class="num">回收</th><th>创建时间</th><th class="acts">操作</th></tr></thead><tbody>' +
        data.items.map(function (s) {
          return '<tr><td><a href="#/survey/' + s.id + '"><b>' + esc(s.name) + '</b></a>' +
              '<div class="muted small mono">' + esc(surveyUrl(s.token)) + '</div></td>' +
            '<td class="small">' + esc(s.scaleTitle) + '</td>' +
            '<td>' + statusTag(s.status) + '</td>' +
            '<td class="num">' + s.responseCount + (s.maxResponses ? ' / ' + s.maxResponses : '') + '</td>' +
            '<td class="small nowrap">' + fmtDate(s.createdAt) + '</td>' +
            '<td class="acts"><button class="btn small" data-copy="' + esc(s.token) + '">复制链接</button> ' +
            '<button class="btn small" data-qr="' + esc(s.token) + '">二维码</button> ' +
            '<a class="btn small" href="#/survey/' + s.id + '">数据</a></td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '<div class="card"><div class="empty"><span class="big">📋</span>' +
        '<p>还没有发布调查。选一个量表发布后，会得到填写链接与二维码，发给受试者即可回收数据。</p>' +
        '<div class="row" style="justify-content:center"><button class="btn primary" id="s-new2">去量表库发布</button>' +
        '<a class="btn" href="#/guide">看使用流程</a></div></div></div>');

  $('#app').innerHTML = shell('surveys', content, [{ label: '发放与数据' }]);
  afterShell();
  const goNew = function () { go('/scales'); };
  if ($('#s-new')) $('#s-new').onclick = goNew;
  if ($('#s-new2')) $('#s-new2').onclick = goNew;
  $$('[data-copy]').forEach(function (b) {
    b.onclick = function () { copyText(surveyUrl(b.dataset.copy)); };
  });
  $$('[data-qr]').forEach(function (b) { b.onclick = function () { showQrModal(b.dataset.qr); }; });
}

function copyToClipboard(t, okMsg) {
  const done = function () { toast(okMsg || '已复制到剪贴板'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done, function () { window.prompt('请手动复制：', t); });
  } else {
    window.prompt('请手动复制：', t);
  }
}

function copyText(t) {
  copyToClipboard(t, '链接已复制，可直接粘贴到微信/短信发放');
}

function showQrModal(token) {
  const link = surveyUrl(token);
  const div = document.createElement('div');
  div.className = 'modal-mask';
  div.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-t-qr" style="max-width:420px;text-align:center">' +
    '<div class="card-title" id="dlg-t-qr">扫码填写</div>' +
    '<div class="qr-box"><img src="' + qrSrc(link, 8) + '" alt="二维码"></div>' +
    '<div class="mono small mt12" style="word-break:break-all">' + esc(link) + '</div>' +
    '<div class="row mt16" style="justify-content:center">' +
      '<button class="btn" id="q-copy">复制链接</button>' +
      '<button class="btn" id="q-print">打印/另存二维码</button>' +
      '<button class="btn primary" id="q-close">关闭</button>' +
    '</div></div>';
  mountModal(div);
  div.onclick = function (e) { if (e.target === div) div.remove(); };
  $('#q-close', div).onclick = function () { div.remove(); };
  $('#q-copy', div).onclick = function () { copyText(link); };
  $('#q-print', div).onclick = function () {
    const w = window.open('', '_blank');
    if (!w) return toast('浏览器阻止了弹窗', 'err');
    // 打印由这一侧触发而不是在新窗口里塞内联脚本：站点的 CSP 只允许同源外部脚本，内联会被拦掉
    w.document.write('<html><head><title>问卷二维码</title></head><body style="text-align:center;font-family:sans-serif;padding:40px">' +
      '<h3>' + esc(document.title) + '</h3><img src="' + qrSrc(link, 12) + '" style="width:420px"><p style="font-family:monospace">' + esc(link) + '</p>' +
      '</body></html>');
    w.document.close();
    setTimeout(function () {
      try { w.focus(); w.print(); } catch (e) { toast('浏览器阻止了打印，请右键图片另存', 'err'); }
    }, 300);
  };
}

/* ================= 视图：调查数据看板 ================= */
let dashTab = 'overview';
let groupVar = '';

async function viewSurveyDetail(id) {
  const [survey, report] = await Promise.all([
    api('/surveys/' + id),
    api('/surveys/' + id + '/report' + (groupVar ? '?group=' + encodeURIComponent(groupVar) : '')),
  ]);
  const link = surveyUrl(survey.token);
  const n = report.n;

  const head = '' +
    '<div class="page-head"><div><a href="#/surveys" class="small">← 返回调查列表</a>' +
      '<h1 class="page-title mt8">' + esc(survey.name) + '</h1>' +
      '<div class="page-sub">' + esc(report.scaleMeta.title) + ' · 发布于 ' + fmtDate(survey.createdAt) +
      ' · ' + (survey.status === 'open' ? '<span class="tag ok">进行中</span>' : '<span class="tag gray">已关闭</span>') +
      (survey.closesAt ? ' · 截止 ' + esc(survey.closesAt) : '') + '</div></div>' +
      '<div class="row">' +
        '<button class="btn" id="d-qr">二维码</button>' +
        '<button class="btn" id="d-copy">复制链接</button>' +
        '<div class="btn-group">' +
          '<a class="btn small" href="/api/surveys/' + id + '/export.csv">CSV（文字）</a>' +
          '<a class="btn small" href="/api/surveys/' + id + '/export-spss.csv">SPSS 数值版 CSV</a>' +
          '<a class="btn small" href="/api/surveys/' + id + '/codebook.csv">变量说明</a>' +
          '<a class="btn small" href="/api/surveys/' + id + '/export.json">JSON</a>' +
        '</div>' +
      '</div></div>';

  const tabs = [
    ['overview', '概览'], ['summary', '结果描述'], ['quality', '数据质量'], ['charts', '图表'], ['stats', '每题统计'],
    ['reliability', '信度分析'], ['relation', '相关与组间比较'], ['raw', '原始数据'], ['setting', '设置'],
  ];
  const tabBar = '<div class="tabs" role="tablist" aria-label="看板视图">' + tabs.map(function (t) {
    const on = dashTab === t[0];
    return '<button class="tab' + (on ? ' active' : '') + '" role="tab" id="tab-' + t[0] + '"' +
      ' aria-selected="' + on + '" aria-controls="dash-panel" data-tab="' + t[0] + '">' + t[1] + '</button>';
  }).join('') + '</div>';

  let body = '';
  if (dashTab === 'overview') {
    body = '' +
      '<div class="grid cols-4">' +
        statCard('已回收答卷', n, survey.maxResponses ? '目标 ' + survey.maxResponses + ' 份' : '不设上限') +
        statCard('总分均值', report.scores.total && report.scores.total.mean !== undefined ? num(report.scores.total.mean) : '—',
          report.scores.total && report.scores.total.sd !== undefined ? 'SD ' + num(report.scores.total.sd) : '') +
        statCard('平均填答用时', report.quality && report.quality.duration && report.quality.duration.n
          ? fmtDuration(report.quality.duration.median) : '—', '中位数（共 ' + n + ' 份）') +
        statCard('信度 Cronbach α', report.reliability.available && report.reliability.total ? num(report.reliability.total.alpha, 3) : '—',
          report.reliability.available ? '完整作答 ' + report.reliability.n + ' 份' : '该量表不计分') +
      '</div>' +
      (n ? '' : '<div class="banner info mt16">还没有回收数据。把上面的链接或二维码发给受试者，数据会自动汇总到这里。</div>') +
      (report.scores.alerts && report.scores.alerts.length
        ? '<div class="banner danger mt16"><b>安全预警</b><br>' + esc(report.scores.alerts[0].message || '') + '</div>' : '') +
      '<div class="grid cols-2 mt16">' +
        '<div class="card"><div class="card-title">回收进度<span class="hint">按日累计</span></div>' +
          (report.trend && report.trend.length > 1 ? '<canvas id="trend-chart" height="200"></canvas>'
            : '<div class="empty">数据积累 2 天以上后可显示趋势</div>') +
          (report.trend && report.trend.length
            ? '<div class="muted small mt8">首份提交：' + esc(report.trend[0].date) + ' · 最近提交：' + esc(report.trend[report.trend.length - 1].date) + '</div>' : '') +
        '</div>' +
        '<div class="card"><div class="card-title">分级分布</div>' +
          (report.scores.cutoffs && report.scores.cutoffs.length
            ? '<canvas id="cut-chart" height="220"></canvas>' +
              '<div class="table-wrap mt12"><table class="table"><thead><tr><th>判读</th><th>分值区间</th><th>人数</th><th>占比</th></tr></thead><tbody>' +
              report.scores.cutoffs.map(function (c) {
                return '<tr><td>' + esc(c.label) + '</td><td class="nowrap">' + esc(c.range) + '</td><td>' + c.count + '</td><td>' + num(c.pct, 1) + '%</td></tr>';
              }).join('') + '</tbody></table></div>'
            : '<div class="empty">未设置分级解释，或该量表不计分</div>') +
        '</div>' +
      '</div>' +
      '<div class="card mt16"><div class="card-title">发放方式</div>' +
        '<div class="row" style="align-items:flex-start">' +
          '<div class="qr-box" style="flex:0 0 auto"><img src="' + qrSrc(link, 7) + '" alt="二维码" style="width:170px;height:170px">' +
            '<div class="mt8"><button class="btn small" id="d-download-qr">下载二维码</button></div></div>' +
          '<div class="grow">' +
            '<div class="small muted">填写链接</div>' +
            '<div class="mono small" style="word-break:break-all">' + esc(link) + '</div>' +
            '<div class="small muted mt12">发放提示</div>' +
            '<ul class="small muted" style="padding-left:18px;line-height:1.9">' +
              '<li>手机与电脑需在同一局域网，或用公网部署的域名地址。</li>' +
              '<li>可在弹窗中「打印/另存二维码」贴于诊室、病房或印在纸质问卷上。</li>' +
              '<li>需要停止回收时，到「设置」标签页将状态改为"已关闭"。</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
      '</div>';
  } else if (dashTab === 'summary') {
    const nar = report.narrative || { available: false, lines: [] };
    if (!n || !nar.lines || !nar.lines.length) {
      body = '<div class="card"><div class="empty"><span class="big">📝</span>' +
        (n ? '当前数据结构暂不支持自动生成结果描述。' : '回收数据后，这里会自动把统计结果写成可直接引用的文字。') +
        '</div></div>';
    } else {
      body = '<div class="card">' +
        '<div class="card-title">结果描述<span class="hint">可直接复制到论文「结果」部分</span></div>' +
        '<div class="narrative" id="narrative-print">' +
          nar.lines.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') +
        '</div>' +
        '<div class="row mt16">' +
          '<button class="btn primary" id="n-copy">复制全文</button>' +
          '<button class="btn" id="n-print">打印 / 另存为 PDF</button>' +
        '</div>' +
        (nar.note ? '<div class="banner info mt16 mb0 small">' + esc(nar.note) + '</div>' : '') +
        '</div>';
    }
  } else if (dashTab === 'quality') {
    const q = report.quality || {};
    const flags = [];
    if (q.tooFast) flags.push('有 ' + q.tooFast + ' 份答卷平均每题用时不足 3 秒，可能存在随意作答。');
    if (q.straightLining) flags.push('有 ' + q.straightLining + ' 份答卷所有条目选择完全相同（直线作答），建议逐一核查。');
    if (q.duplicateIpCount) flags.push('有 ' + q.duplicateIpCount + ' 个 IP 提交了多份答卷，请注意是否为同一人重复填写。');
    if (q.completeRate !== null && q.completeRate < 100) flags.push('完整作答率 ' + num(q.completeRate, 1) + '%，缺失部分会在信度分析中被自动排除。');
    body = '' +
      '<div class="grid cols-4">' +
        statCard('有效答卷', n, '全部记录') +
        statCard('完整作答率', q.completeRate === null || q.completeRate === undefined ? '—' : num(q.completeRate, 1) + '%',
          q.completeCount + ' / ' + n + ' 份全部作答') +
        statCard('作答时长中位数', q.duration && q.duration.n ? fmtDuration(q.duration.median) : '—',
          q.duration && q.duration.n ? '范围 ' + fmtDuration(q.duration.min) + ' – ' + fmtDuration(q.duration.max) : '') +
        statCard('可疑答卷', (q.straightLining || 0) + (q.tooFast || 0), '直线作答 + 过快作答') +
      '</div>' +
      (flags.length
        ? '<div class="banner warn mt16"><b>质量提示</b><br>' + flags.map(esc).join('<br>') + '</div>'
        : '<div class="banner ok mt16">未发现明显的数据质量异常。</div>') +
      '<div class="grid cols-2 mt16">' +
        '<div class="card"><div class="card-title">作答时长分布</div>' +
          (q.duration && q.duration.n ? '<canvas id="dur-chart" height="220"></canvas>' : '<div class="empty">暂无用时数据</div>') +
        '</div>' +
        '<div class="card"><div class="card-title">时长描述统计</div>' +
          (q.duration && q.duration.n
            ? '<div class="table-wrap"><table class="table"><tbody>' +
              '<tr><td>样本数</td><td>' + q.duration.n + '</td></tr>' +
              '<tr><td>中位数</td><td>' + fmtDuration(q.duration.median) + '</td></tr>' +
              '<tr><td>均值 ± 标准差</td><td>' + fmtDuration(q.duration.mean) + ' ± ' + fmtDuration(q.duration.sd) + '</td></tr>' +
              '<tr><td>P25 – P75</td><td>' + fmtDuration(q.duration.q1) + ' – ' + fmtDuration(q.duration.q3) + '</td></tr>' +
              '<tr><td>范围</td><td>' + fmtDuration(q.duration.min) + ' – ' + fmtDuration(q.duration.max) + '</td></tr>' +
              '<tr><td>题目数</td><td>' + q.itemCount + ' 题</td></tr>' +
              '<tr><td>每题平均用时</td><td>' + (q.duration.mean && q.itemCount ? num(q.duration.mean / q.itemCount, 1) + ' 秒' : '—') + '</td></tr>' +
              '</tbody></table></div>' : '<div class="empty">暂无数据</div>') +
        '</div>' +
      '</div>' +
      '<div class="card mt16"><div class="card-title">重复 IP 记录<span class="hint">如关闭了 IP 采集则不会显示</span></div>' +
        (q.duplicateIps && q.duplicateIps.length
          ? '<div class="table-wrap"><table class="table"><thead><tr><th>IP 地址</th><th>提交份数</th></tr></thead><tbody>' +
            q.duplicateIps.map(function (d) { return '<tr><td class="mono">' + esc(d.ip) + '</td><td>' + d.count + '</td></tr>'; }).join('') +
            '</tbody></table></div>'
          : '<div class="empty">未发现重复 IP 提交</div>') +
      '</div>';
  } else if (dashTab === 'charts') {
    body = '' +
      '<div class="card"><div class="card-title">总分分布<span class="hint">柱高为人数，虚线为均值</span></div>' +
        (n ? '<canvas id="hist-chart" height="240"></canvas>' : '<div class="empty">暂无数据</div>') + '</div>' +
      '<div class="card"><div class="card-title">维度得分均值</div>' +
        (report.scores.dimensions.length ? '<canvas id="dim-chart" height="260"></canvas>' : '<div class="empty">该量表未划分维度</div>') +
      '</div>' +
      '<div class="card"><div class="card-title">题目作答分布 <span class="hint">选择"题目"，查看各选项人数</span></div>' +
        '<select id="item-pick" class="mb16" style="max-width:520px"></select>' +
        '<canvas id="item-chart" height="240"></canvas>' +
      '</div>';
  } else if (dashTab === 'stats') {
    body = '<div class="card"><div class="card-title">总分与维度得分<span class="hint">n=' + n + '</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>指标</th><th>n</th><th>均值</th><th>标准差</th><th>中位数</th><th>P25</th><th>P75</th><th>最小</th><th>最大</th><th>偏度</th><th>95%CI</th>' +
      '</tr></thead><tbody>' +
      (report.scores.total && report.scores.total.n ? describeRow('总分', report.scores.total) : '') +
      report.scores.dimensions.map(function (d) { return describeRow(d.name, d.stats); }).join('') +
      '</tbody></table></div>' +
      (report.scores.total && report.scores.total.n
        ? '<div class="small muted mt12">提示：总分偏度绝对值 >1 提示分布偏离正态，组间比较时建议使用非参数检验（可导出数据后在 SPSS/R 中完成）。</div>' : '') +
      '</div>' +
      '<div class="card"><div class="card-title">每题作答情况</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>题号</th><th>题目</th><th>类型</th><th>缺失</th><th>作答分布 / 描述统计</th></tr></thead><tbody>' +
      report.items.map(function (it) {
        let detail = '';
        if (it.kind === 'category') {
          detail = it.freq.items.map(function (f) {
            return esc(f.label) + '：<b>' + f.count + '</b>（' + num(f.pct, 1) + '%）';
          }).join('　') || '—';
        } else if (it.kind === 'numeric') {
          detail = it.stats && it.stats.n
            ? '均值 ' + num(it.stats.mean) + ' ± ' + num(it.stats.sd) + '，中位数 ' + num(it.stats.median) +
              '，范围 ' + num(it.stats.min) + '–' + num(it.stats.max)
            : '—';
        } else {
          detail = it.kind === 'text' ? '文本/时间题，已填写 ' + (it.filled || it.answered) + ' 份' : '—';
        }
        return '<tr><td class="nowrap">第 ' + it.no + ' 题</td><td>' + esc(it.text) + '</td>' +
          '<td class="nowrap small">' + esc(TYPE_LABEL[it.type] || it.type) + '</td>' +
          '<td>' + it.missing + (it.missingPct !== null ? ' <span class="muted small">(' + num(it.missingPct, 1) + '%)</span>' : '') + '</td>' +
          '<td class="small">' + detail + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  } else if (dashTab === 'reliability') {
    const r = report.reliability;
    if (!r.available) {
      body = '<div class="card"><div class="empty">该量表未设置计分（描述性问卷），不计算信度。</div></div>';
    } else {
      body = '<div class="grid cols-3">' +
          statCard('Cronbach α（总分）', r.total ? num(r.total.alpha, 3) : '—', r.total ? '基于 ' + r.total.n + ' 份完整答卷 / ' + r.total.k + ' 题' : '') +
          statCard('分半信度（Spearman-Brown）', r.splitHalf ? num(r.splitHalf.sb, 3) : '—', r.splitHalf ? '奇偶分半 r=' + num(r.splitHalf.r, 3) : '') +
          statCard('完整作答样本', r.completeCases + ' / ' + r.totalCases, '缺失任一题的答卷不计入信度分析') +
        '</div>' +
        '<div class="banner ' + (r.total && r.total.alpha >= 0.7 ? 'ok' : 'warn') + ' mt16">判读参考：α ≥ 0.9 优秀；0.8–0.9 良好；0.7–0.8 可接受；<0.7 建议修改条目。' +
          (r.total && r.total.alpha < 0.7 ? ' 当前 α 偏低，可参考下表"CITC"与"删除该题后 α"，考虑删除或修改区分度不足的条目。' : '') + '</div>' +
        '<div class="card"><div class="card-title">各维度信度</div>' +
          (r.dimensions.length
            ? '<div class="table-wrap"><table class="table"><thead><tr><th>维度</th><th>题目数</th><th>Cronbach α</th><th>样本数</th></tr></thead><tbody>' +
              r.dimensions.map(function (d) {
                return '<tr><td>' + esc(d.name) + '</td><td>' + d.k + '</td><td>' + num(d.alpha, 3) + '</td><td>' + d.n + '</td></tr>';
              }).join('') + '</tbody></table></div>'
            : '<div class="empty">未划分维度</div>') +
        '</div>' +
        '<div class="card"><div class="card-title">项目分析（CITC）<span class="hint">校正后题总相关</span></div>' +
          '<div class="table-wrap"><table class="table"><thead><tr><th>题号</th><th>题目</th><th>均值</th><th>标准差</th><th>CITC</th><th>删除该题后 α</th></tr></thead><tbody>' +
          r.items.map(function (it) {
            const weak = it.citc !== null && it.citc < 0.3;
            return '<tr' + (weak ? ' style="background:#fffaf5"' : '') + '><td class="nowrap">第 ' + it.no + ' 题</td><td>' + esc(it.text) + '</td>' +
              '<td>' + num(it.mean) + '</td><td>' + num(it.sd) + '</td><td>' + num(it.citc, 3) + (weak ? ' <span class="tag warn">偏低</span>' : '') + '</td>' +
              '<td>' + num(it.alphaIfDeleted, 3) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>';
    }
  } else if (dashTab === 'relation') {
    const c = report.correlations;
    const g = report.groupComparison;
    body = '';
    if (c.available) {
      body += '<div class="card"><div class="card-title">维度 / 总分相关矩阵<span class="hint">下三角为 Pearson r，括号内为 p 值</span></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th></th>' +
        c.vars.map(function (v) { return '<th>' + esc(v.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        c.vars.map(function (v, i) {
          return '<tr><td><b>' + esc(v.name) + '</b></td>' + c.vars.map(function (_, j) {
            if (j > i) return '<td class="muted">—</td>';
            const cell = c.matrix[i][j].pearson;
            return '<td>' + num(cell.r, 3) + '<div class="muted small">' + (i === j ? '' : '(' + pfmt(cell.p) + ')') + '</div></td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="small muted mt8">判读参考：|r| ≥ 0.7 强相关；0.4–0.7 中等相关；0.2–0.4 弱相关。</div></div>';
    } else {
      body += '<div class="card"><div class="empty">该量表未划分维度，暂无相关分析。</div></div>';
    }
    if (g.available) {
      body += '<div class="card"><div class="card-title">组间比较<span class="hint">分组变量：' + esc(g.groupItem.text) + '</span></div>' +
        (g.groupCandidates && g.groupCandidates.length > 1
          ? '<div class="row mb16"><span class="small muted">选择分组变量</span>' +
            '<select id="group-pick" style="width:auto;min-width:280px">' +
            g.groupCandidates.map(function (c) {
              return '<option value="' + esc(c.id) + '"' + (c.id === g.groupItem.id ? ' selected' : '') + '>第 ' + c.no + ' 题 · ' + esc(c.text.slice(0, 30)) + '</option>';
            }).join('') + '</select></div>' : '') +
        g.tests.map(function (t) {
          const r = t.result;
          const sig = r.p !== null && r.p < 0.05;
          const np = t.nonparam;
          return '<div class="item-editor"><div style="font-weight:600;margin-bottom:8px">' + esc(t.name) + ' <span class="tag gray">' + esc(t.method) + '</span>' +
            (sig ? ' <span class="tag ok">差异有统计学意义</span>' : ' <span class="tag gray">差异无统计学意义</span>') + '</div>' +
            '<div class="table-wrap"><table class="table"><thead><tr><th>组别</th><th>n</th><th>均值</th><th>标准差</th></tr></thead><tbody>' +
            t.groups.map(function (gr) {
              return '<tr><td>' + esc(gr.name) + '</td><td>' + gr.n + '</td><td>' + num(gr.mean) + '</td><td>' + num(gr.sd) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="small mt8">' + (r.t !== undefined
              ? 't = ' + num(r.t, 3) + '，df = ' + num(r.df, 2) + '，p = ' + pfmt(r.p) + '，Cohen\'s d = ' + num(r.cohensD, 3)
              : 'F = ' + num(r.F, 3) + '，df = ' + r.df1 + ',' + r.df2 + '，p = ' + pfmt(r.p) + '，η² = ' + num(r.etaSq, 3)) +
            '</div>' +
            (np && np.p !== null && np.p !== undefined
              ? '<div class="small muted mt8">非参数检验（' + esc(t.methodNonparam) + '）：' +
                (np.u !== undefined ? 'U = ' + num(np.u, 1) + '，' : 'H = ' + num(np.h, 3) + '，') + 'p = ' + pfmt(np.p) +
                (np.effectR !== undefined ? '，效应量 r = ' + num(np.effectR, 3) : '') + '　（分布偏态或等级资料时建议采用）</div>' : '') +
            '</div>';
        }).join('') +
        (g.chiSquare && g.chiSquare.chi2 !== null
          ? '<div class="card-title mt16">严重程度 × ' + esc(g.groupItem.text) + '（卡方检验）</div>' +
            '<div class="table-wrap"><table class="table"><thead><tr><th></th>' +
            g.chiSquare.colLabels.map(function (cl) { return '<th>' + esc(cl) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            g.chiSquare.rowLabels.map(function (rl, i) {
              const total = g.chiSquare.table ? 0 : 0;
              return '<tr><td><b>' + esc(rl) + '</b></td>' + g.chiSquare.table[i].map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="small mt8">χ² = ' + num(g.chiSquare.chi2, 3) + '，df = ' + g.chiSquare.df + '，p = ' + pfmt(g.chiSquare.p) +
            '，Cramér\'s V = ' + num(g.chiSquare.cramersV, 3) + '</div>' +
            (g.chiSquare.warning ? '<div class="banner warn mb0 mt8">' + esc(g.chiSquare.warning) + '</div>' : '')
          : '') +
        '</div>';
    }
    if (!c.available && !g.available) {
      body += '<div class="card"><div class="empty">数据量不足或量表结构不支持组间比较（需要至少 6 份答卷且含分组变量）。</div></div>';
    }
  } else if (dashTab === 'raw') {
    body = '<div class="card"><div class="card-title">原始数据<span class="hint">共 ' + n + ' 条 · 完整数据请导出 CSV/JSON</span></div>' +
      '<div class="table-wrap" style="max-height:60vh"><table class="table"><thead><tr><th>编号</th><th>提交时间</th><th>用时</th>' +
      report.items.map(function (it) { return '<th title="' + esc(it.text) + '">第' + it.no + '题</th>'; }).join('') +
      '<th>总分</th><th>判读</th><th></th></tr></thead><tbody>' +
      (report.rawRows || []).map(function (r) {
        return '<tr><td class="mono">' + esc(r.pid) + '</td><td class="small nowrap">' + fmtDate(r.submittedAt) + '</td>' +
          '<td class="small">' + (r.durationSec ? r.durationSec + 's' : '—') + '</td>' +
          r.cells.map(function (c) { return '<td class="small nowrap">' + esc(c) + '</td>'; }).join('') +
          '<td><b>' + (r.total === null || r.total === undefined ? '—' : r.total) + '</b></td>' +
          '<td class="small">' + esc(r.cut || '') + '</td>' +
          '<td><button class="btn small" data-resp="' + esc(r.pid) + '">查看</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  } else if (dashTab === 'setting') {
    body = '<div class="card" style="max-width:640px"><div class="card-title">调查设置</div>' +
      '<label class="fld"><span>调查名称</span><input type="text" id="set-name" value="' + esc(survey.name) + '"></label>' +
      '<div class="row">' +
        '<label class="fld grow"><span>状态</span><select id="set-status">' +
          opt('open', '进行中（可继续回收）', survey.status) + opt('closed', '已关闭（停止回收）', survey.status) +
        '</select></label>' +
        '<label class="fld grow"><span>目标样本量</span><input type="number" id="set-max" value="' + esc(survey.maxResponses || '') + '"></label>' +
        '<label class="fld grow"><span>截止日期</span><input type="date" id="set-close" value="' + esc((survey.closesAt || '').slice(0, 10)) + '"></label>' +
      '</div>' +
      '<label class="row mb16" style="gap:8px"><input type="checkbox" id="set-result"' + (survey.showResult ? ' checked' : '') + ' style="width:auto"> 提交后向受试者展示结果</label>' +
      '<label class="row mb16" style="gap:8px"><input type="checkbox" id="set-meta"' + (survey.collectMeta ? ' checked' : '') + ' style="width:auto"> 记录 IP 与设备信息</label>' +
      '<label class="fld"><span>备注</span><input type="text" id="set-note" value="' + esc(survey.note || '') + '"></label>' +
      '<div class="row"><button class="btn primary" id="set-save">保存设置</button>' +
      '<button class="btn danger" id="set-del">删除该调查及其数据</button></div></div>' +
      '<div class="card" style="max-width:640px"><div class="card-title">数据安全提示</div>' +
      '<div class="small muted">数据保存在本机 SQLite 数据库文件中：<span class="mono">medscale/data/app.db</span>。' +
      '建议：① 定期备份该文件；② 涉及患者隐私的研究应关闭 IP 采集并使用匿名模式；③ 正式发表前请完成伦理审批并保留知情同意记录。</div></div>';
  }

  $('#app').innerHTML = shell('surveys', head + tabBar +
    '<div role="tabpanel" id="dash-panel" aria-labelledby="tab-' + dashTab + '">' + body + '</div>',
    [{ label: '发放与数据', href: '#/surveys' }, { label: survey.name }]);
  afterShell();
  $$('[data-tab]').forEach(function (b) {
    b.onclick = function () { dashTab = b.dataset.tab; render(); };
  });
  $('#d-copy').onclick = function () { copyText(link); };
  $('#d-qr').onclick = function () { showQrModal(survey.token); };
  if ($('#n-copy')) {
    $('#n-copy').onclick = function () {
      copyToClipboard(((report.narrative || {}).lines || []).join('\n\n'), '结果描述已复制，可粘贴到论文中');
    };
  }
  if ($('#n-print')) $('#n-print').onclick = function () {
    document.body.classList.add('printing-narrative');
    const clean = function () {
      document.body.classList.remove('printing-narrative');
      window.removeEventListener('afterprint', clean);
    };
    window.addEventListener('afterprint', clean);
    window.print();
    setTimeout(clean, 2000);
  };
  if ($('#d-download-qr')) {
    $('#d-download-qr').onclick = function () { downloadQr(link, survey.name); };
  }
  $$('[data-resp]').forEach(function (b) {
    b.onclick = function () { showResponseModal(id, b.dataset.resp, survey.name); };
  });
  if ($('#group-pick')) {
    $('#group-pick').onchange = function () {
      groupVar = $('#group-pick').value;
      render();
    };
  }
  if (dashTab === 'overview' && report.trend && report.trend.length > 1) {
    safeDraw(function () {
      drawLine($('#trend-chart'), report.trend.map(function (t) { return t.date.slice(5); }),
        report.trend.map(function (t) { return t.cumulative; }), '#10766b', '累计份数');
    });
  }
  if (dashTab === 'quality' && report.quality && report.quality.duration && report.quality.duration.n) {
    const durations = (report.rawRows || []).map(function (r) { return r.durationSec; })
      .filter(function (v) { return typeof v === 'number' && v > 0 && v < 7200; });
    if (durations.length) safeDraw(function () { drawHistogram($('#dur-chart'), durations, null, report.quality.duration.median, '作答时长（秒）'); });
  }

  if (dashTab === 'overview' && report.scores.cutoffs && report.scores.cutoffs.length) {
    safeDraw(function () {
      drawBars($('#cut-chart'), report.scores.cutoffs.map(function (c) { return c.label; }),
        report.scores.cutoffs.map(function (c) { return c.count; }), '#10766b');
    });
  }
  if (dashTab === 'charts') {
    const totals = (report.scoreValues || []).filter(function (v) { return v !== null; });
    if (totals.length) {
      safeDraw(function () { drawHistogram($('#hist-chart'), totals, report.scores.totalRange || null, report.scores.total ? report.scores.total.mean : null); });
    }
    const dims = report.scores.dimensions.filter(function (d) { return d.stats && d.stats.n; });
    if (dims.length) {
      safeDraw(function () {
        drawBars($('#dim-chart'), dims.map(function (d) { return d.name; }), dims.map(function (d) { return d.stats.mean; }), '#2563eb',
          dims.map(function (d) { return d.stats.sd; }));
      });
    }
    const pick = $('#item-pick');
    if (pick) {
      const catItems = report.items.filter(function (it) { return it.kind === 'category'; });
      pick.innerHTML = catItems.map(function (it) { return '<option value="' + esc(it.itemId) + '">第 ' + it.no + ' 题 · ' + esc(it.text.slice(0, 40)) + '</option>'; }).join('');
      const draw = function () {
        const it = catItems.find(function (x) { return x.itemId === pick.value; });
        if (it) safeDraw(function () {
          drawBars($('#item-chart'), it.freq.items.map(function (f) { return f.label; }), it.freq.items.map(function (f) { return f.count; }), '#7c3aed');
        });
      };
      pick.onchange = draw;
      draw();
    }
  }
  if (dashTab === 'setting') {
    $('#set-save').onclick = async function () {
      try {
        await api('/surveys/' + id, {
          method: 'PATCH',
          body: {
            name: $('#set-name').value,
            status: $('#set-status').value,
            maxResponses: $('#set-max').value || null,
            closesAt: $('#set-close').value || null,
            showResult: $('#set-result').checked,
            collectMeta: $('#set-meta').checked,
            note: $('#set-note').value,
          },
        });
        toast('设置已保存');
        render();
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#set-del').onclick = async function () {
      if (!confirmBox('删除调查「' + survey.name + '」及全部 ' + n + ' 份答卷？此操作不可恢复！')) return;
      await api('/surveys/' + id, { method: 'DELETE' });
      toast('已删除');
      go('/surveys');
    };
  }
}

function describeRow(name, s) {
  if (!s || !s.n) return '<tr><td>' + esc(name) + '</td><td colspan="10" class="muted">暂无数据</td></tr>';
  return '<tr><td><b>' + esc(name) + '</b></td><td>' + s.n + '</td><td>' + num(s.mean) + '</td><td>' + num(s.sd) + '</td>' +
    '<td>' + num(s.median) + '</td><td>' + num(s.q1) + '</td><td>' + num(s.q3) + '</td>' +
    '<td>' + num(s.min) + '</td><td>' + num(s.max) + '</td><td>' + num(s.skew) + '</td>' +
    '<td class="nowrap small">' + num(s.ci95[0]) + ' ~ ' + num(s.ci95[1]) + '</td></tr>';
}

function avgDuration(report, id) {
  return null;
}

/** 查看单份答卷 */
async function showResponseModal(surveyId, pid, surveyName) {
  let r;
  try {
    r = await api('/surveys/' + surveyId + '/response/' + encodeURIComponent(pid));
  } catch (e) { return toast(e.message, 'err'); }
  const sc = r.scores || {};
  const div = document.createElement('div');
  div.className = 'modal-mask';
  div.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-t-detail">' +
    '<div class="card-title" id="dlg-t-detail" style="font-size:17px">答卷详情<span class="hint">' + esc(surveyName) + '</span></div>' +
    '<div class="kv mb16">' +
      '<dt>答卷编号</dt><dd class="mono">' + esc(r.pid) + '</dd>' +
      '<dt>提交时间</dt><dd>' + fmtDate(r.submittedAt) + '</dd>' +
      '<dt>作答用时</dt><dd>' + fmtDuration(r.durationSec) + '</dd>' +
      '<dt>总分</dt><dd><b>' + (sc.total === null || sc.total === undefined ? '—' : sc.total) + '</b>' +
        (sc.cut ? ' <span class="tag">' + esc(sc.cut.label) + '</span>' : '') + '</dd>' +
      (r.meta && r.meta.ip ? '<dt>IP 地址</dt><dd class="mono small">' + esc(r.meta.ip) + '</dd>' : '') +
    '</div>' +
    (sc.flags && sc.flags.length ? '<div class="banner danger">' + esc(sc.flags[0].text) + '</div>' : '') +
    '<div class="table-wrap" style="max-height:52vh"><table class="table"><thead><tr><th>题号</th><th>题目</th><th>作答</th></tr></thead><tbody>' +
    r.items.map(function (it) {
      const v = it.value === null || it.value === undefined || it.value === '' ? '<span class="muted">未作答</span>'
        : esc(Array.isArray(it.value) ? it.value.join('、') : it.value);
      return '<tr><td class="nowrap">第 ' + it.no + ' 题</td><td>' + esc(it.text) + '</td><td>' + v + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="row mt16" style="justify-content:flex-end"><button class="btn primary" id="r-close">关闭</button></div>' +
    '</div>';
  mountModal(div);
  div.onclick = function (e) { if (e.target === div) div.remove(); };
  $('#r-close', div).onclick = function () { div.remove(); };
}

/* ================= 视图：系统设置 ================= */
/* ================= 视图：随访研究 ================= */
async function viewFollowups() {
  const list = (await api('/studies')).items;
  if (!state.scales.length) state.scales = (await api('/scales')).items;
  const content = '' +
    '<div class="page-head"><div><h1 class="page-title">随访研究</h1>' +
      '<div class="page-sub">同一份量表在多个时点重复测量，自动按受试者编号配对并做配对检验</div></div>' +
      '<button class="btn primary" id="new-study">＋ 新建随访研究</button></div>' +
    (list.length
      ? '<div class="card"><div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>研究名称</th><th>量表</th><th class="num">时点数</th><th class="num">回收答卷</th><th>创建时间</th><th class="acts"></th></tr></thead><tbody>' +
        list.map(function (s) {
          return '<tr><td><a href="#/followup/' + s.id + '"><b>' + esc(s.name) + '</b></a>' +
            '<div class="muted small">' + (s.subjectMode === 'self' ? '受试者自填编号' : '系统自动分配编号') + '</div></td>' +
            '<td class="small">' + esc(s.scaleTitle) + '</td><td class="num">' + s.waveCount + '</td><td class="num">' + s.responseCount + '</td>' +
            '<td class="small nowrap">' + fmtDate(s.createdAt) + '</td>' +
            '<td class="acts"><a class="btn small" href="#/followup/' + s.id + '">分析与发放</a></td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '<div class="card"><div class="empty"><span class="big">🔁</span>' +
        '<p>还没有随访研究。适合干预前后对比、术后 1/3/6 个月随访等场景——' +
        '同一份量表在多个时点重复测量，系统按受试者编号自动配对并做配对检验。</p>' +
        '<div class="row" style="justify-content:center"><button class="btn primary" id="new-study2">创建第一个随访研究</button>' +
        '<a class="btn" href="#/guide">看使用流程</a></div></div></div>');
  $('#app').innerHTML = shell('followups', content, [{ label: '随访研究' }]);
  afterShell();
  const open = function () { openFollowupDialog(); };
  if ($('#new-study')) $('#new-study').onclick = open;
  if ($('#new-study2')) $('#new-study2').onclick = open;
}

function openFollowupDialog() {
  const usable = state.scales.filter(function (s) { return s.code !== 'blank' || false; });
  const opts = usable.map(function (s) {
    return '<option value="' + s.id + '">' + esc(s.title) + '（' + s.definition.items.length + ' 题）</option>';
  }).join('');
  const waveRow = function (label, i) {
    return '<div class="opt-row" data-wave="' + i + '"><input type="text" class="lab" aria-label="随访时点名称" value="' + esc(label) + '" placeholder="如：基线 / 术后1个月">' +
      '<button class="btn small danger" data-wave-del="' + i + '" aria-label="删除该时点">删</button></div>';
  };
  const div = document.createElement('div');
  div.className = 'modal-mask';
  div.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-t-study">' +
    '<div class="card-title" id="dlg-t-study" style="font-size:17px">新建随访研究</div>' +
    '<label class="fld"><span>选择题量</span><select id="st-scale">' + opts + '</select></label>' +
    '<label class="fld"><span>研究名称</span><input type="text" id="st-name" value="随访研究" ></label>' +
    '<div class="fld"><span style="display:block;font-size:13px;color:var(--ink-2);margin-bottom:5px">随访时点（每个时点生成独立链接与二维码）</span>' +
      '<div id="wave-list">' + ['基线', '1个月', '3个月'].map(waveRow).join('') + '</div>' +
      '<button class="btn small mt8" id="wave-add">＋ 添加时点</button></div>' +
    '<div class="fld"><span style="display:block;font-size:13px;color:var(--ink-2);margin-bottom:5px">受试者编号方式</span>' +
      '<label class="row mb8" style="gap:8px"><input type="radio" name="subj-mode" value="auto" checked style="width:auto"> ' +
      '<span>系统自动分配（首次填写后显示编号，受试者自行记录）</span></label>' +
      '<label class="row" style="gap:8px"><input type="radio" name="subj-mode" value="self" style="width:auto"> ' +
      '<span>受试者自填编号（如住院号、研究编号；需研究方统一管理）</span></label></div>' +
    '<label class="row mb16" style="gap:8px"><input type="checkbox" id="st-result" style="width:auto"> 提交后向受试者展示计分结果</label>' +
    '<div class="banner info">提示：只有填写了相同编号的多次作答才能配对分析；同一编号在同一时点重复提交会被拒绝。</div>' +
    '<div class="row mt16" style="justify-content:flex-end"><button class="btn" id="st-cancel">取消</button>' +
    '<button class="btn primary" id="st-ok">创建并生成链接</button></div></div>';
  mountModal(div);
  div.onclick = function (e) { if (e.target === div) div.remove(); };
  $('#st-cancel', div).onclick = function () { div.remove(); };
  $('#wave-add', div).onclick = function () {
    const i = $('#wave-list', div).children.length;
    const holder = document.createElement('div');
    holder.innerHTML = waveRow('第 ' + (i + 1) + ' 次随访', i);
    $('#wave-list', div).appendChild(holder.firstChild);
    bindWaveDel();
  };
  const bindWaveDel = function () {
    $$('[data-wave-del]', div).forEach(function (b) {
      b.onclick = function () {
        if ($$('[data-wave]', div).length <= 1) return toast('至少保留一个时点', 'err');
        b.closest('[data-wave]').remove();
      };
    });
  };
  bindWaveDel();
  $('#st-ok', div).onclick = async function () {
    const waves = $$('[data-wave]', div).map(function (row) {
      return { label: $('input', row).value.trim() || '随访' };
    });
    try {
      const r = await api('/studies', {
        method: 'POST',
        body: {
          scaleId: Number($('#st-scale', div).value),
          name: $('#st-name', div).value.trim() || '随访研究',
          waves: waves,
          subjectMode: ($('input[name="subj-mode"]:checked', div) || {}).value || 'auto',
          showResult: $('#st-result', div).checked,
          collectMeta: true,
        },
      });
      div.remove();
      go('/followup/' + r.study.id);
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function viewFollowupDetail(id) {
  const [study, report] = await Promise.all([api('/studies/' + id), api('/studies/' + id + '/report')]);
  const ret = report.retention || {};
  const head = '<div class="page-head"><div><a href="#/followups" class="small">← 返回随访研究</a>' +
    '<h1 class="page-title mt8">' + esc(study.name) + '</h1>' +
    '<div class="page-sub">' + esc(study.scaleTitle) + ' · ' + study.waves.length + ' 个时点 · ' +
    (study.subjectMode === 'self' ? '受试者自填编号' : '系统自动分配编号') + '</div></div>' +
    '<div class="row"><a class="btn" href="/api/studies/' + id + '/export-wide.csv">导出随访宽表</a>' +
    '<button class="btn danger" id="st-del">删除研究</button></div></div>';

  const waveCards = '<div class="grid cols-' + Math.min(3, Math.max(1, study.waves.length)) + '">' +
    study.waves.map(function (w) {
      const sum = (report.waves.find(function (x) { return x.id === w.id; }) || {}).summary || {};
      const link = location.origin + '/s/' + w.token;
      return '<div class="card"><div class="card-title">' + esc(w.waveLabel) + '<span class="hint">' +
        (w.status === 'open' ? '进行中' : '已关闭') + '</span></div>' +
        '<div class="small muted">已回收 <b>' + w.responseCount + '</b> 份 · 受试者 <b>' + w.subjectCount + '</b> 人</div>' +
        (sum.total && sum.total.n ? '<div class="small muted">总分 ' + num(sum.total.mean) + ' ± ' + num(sum.total.sd) + '（n=' + sum.total.n + '）</div>' : '') +
        '<div class="qr-box mt12"><img src="' + qrSrc(link, 6) + '" alt="二维码" style="width:130px;height:130px"></div>' +
        '<div class="mono small center mt8" style="word-break:break-all">' + esc(link) + '</div>' +
        '<div class="row mt8" style="justify-content:center"><button class="btn small" data-copy-w="' + esc(w.token) + '">复制链接</button>' +
        '<button class="btn small" data-qr-w="' + esc(w.token) + '">二维码</button></div></div>';
    }).join('') + '</div>';

  const summaryTable = '<div class="card mt16"><div class="card-title">各时点得分<span class="hint">n = 完成该时点计分的人数</span></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>时点</th><th>n</th><th>均值</th><th>标准差</th><th>中位数</th><th>范围</th><th>主要判读分布</th></tr></thead><tbody>' +
    report.waves.map(function (w) {
      const s = w.summary;
      const cuts = (s.cutoffs || []).filter(function (c) { return c.count; })
        .map(function (c) { return esc(c.label) + ' ' + c.count; }).join('；');
      return '<tr><td><b>' + esc(w.label) + '</b></td><td>' + s.n + '</td><td>' + num(s.total && s.total.mean) + '</td>' +
        '<td>' + num(s.total && s.total.sd) + '</td><td>' + num(s.total && s.total.median) + '</td>' +
        '<td>' + (s.total ? num(s.total.min) + ' – ' + num(s.total.max) : '—') + '</td><td class="small">' + (cuts || '—') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';

  const pairTable = '<div class="card mt16"><div class="card-title">配对比较<span class="hint">仅纳入两个时点均完成、且编号一致的受试者</span></div>' +
    (report.pairs.some(function (p) { return p.n > 0; })
      ? '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>比较</th><th>配对数 n</th><th>前次 均值±SD</th><th>后次 均值±SD</th><th>变化值 Δ（95%CI）</th>' +
        '<th>配对 t 检验</th><th>Wilcoxon 符号秩</th><th>Cohen\'s d</th><th>结论</th></tr></thead><tbody>' +
        report.pairs.map(function (p) {
          if (!p.n) {
            return '<tr><td>' + esc(p.a.label) + ' vs ' + esc(p.b.label) + '</td><td colspan="8" class="muted">暂无配对数据（需要同一编号在两个时点都完成）</td></tr>';
          }
          const sig = p.t.p !== null && p.t.p < 0.05;
          return '<tr><td class="nowrap">' + esc(p.a.label) + ' → ' + esc(p.b.label) + '</td><td>' + p.n + '</td>' +
            '<td>' + num(p.meanA) + ' ± ' + num(p.sdA) + '</td><td>' + num(p.meanB) + ' ± ' + num(p.sdB) + '</td>' +
            '<td>' + num(p.meanChange) + '（' + num(p.ci95Change && p.ci95Change[0]) + ' ~ ' + num(p.ci95Change && p.ci95Change[1]) + '）</td>' +
            '<td>t=' + num(p.t.t, 2) + '，p=' + pfmt(p.t.p) + '</td>' +
            '<td>' + (p.wilcoxon && p.wilcoxon.p !== null ? 'p=' + pfmt(p.wilcoxon.p) : '<span class="muted">n 不足</span>') + '</td>' +
            '<td>' + num(p.cohensD) + '</td>' +
            '<td>' + (sig ? '<span class="tag ok">差异有统计学意义</span>' : '<span class="tag gray">无统计学差异</span>') +
            (p.bonferroni !== null ? '<div class="muted small">Bonferroni p=' + pfmt(p.bonferroni) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="small muted mt8">判读提示：变化值 Δ = 前次 − 后次（本例为正表示分数下降、症状改善）。多时点两两比较建议参考 Bonferroni 校正后的 p 值；更多时点（≥3）的正规分析建议导出宽表后用重复测量方差分析（RM-ANOVA）。</div>'
      : '<div class="empty">暂无配对数据：请确认受试者在两个时点都填写了相同的随访编号</div>') +
    '</div>';

  const retention = '<div class="card mt16"><div class="card-title">随访完成情况<span class="hint">失访分析</span></div>' +
    '<div class="grid cols-2"><div class="table-wrap"><table class="table"><thead><tr><th>时点</th><th>受试者</th><th>答卷</th></tr></thead><tbody>' +
    (ret.byWave || []).map(function (b) {
      return '<tr><td>' + esc(b.label) + '</td><td>' + b.subjects + '</td><td>' + b.responses + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div><div class="kv"><dt>纳入受试者</dt><dd>' + (ret.totalSubjects || 0) + ' 人</dd>' +
    '<dt>完成全部时点</dt><dd>' + (ret.completedAll || 0) + ' 人</dd>' +
    '<dt>随访完成率</dt><dd>' + (ret.completionRate === null || ret.completionRate === undefined ? '—' : num(ret.completionRate, 1) + '%') + '</dd></div>' +
    '<div class="small muted mt12">论文中建议报告：各时点例数、失访人数与原因、完成率；如失访比例较高，需说明处理方式（如 ITT / PP 分析）。</div></div></div></div>';

  $('#app').innerHTML = shell('followups', head + waveCards + summaryTable + pairTable + retention, [{ label: '随访研究', href: '#/followups' }, { label: study.name }]);
  afterShell();
  $$('[data-copy-w]').forEach(function (b) { b.onclick = function () { copyText(location.origin + '/s/' + b.dataset.copyW); }; });
  $$('[data-qr-w]').forEach(function (b) { b.onclick = function () { showQrModal(b.dataset.qrW); }; });
  $('#st-del').onclick = async function () {
    if (!confirmBox('删除随访研究「' + study.name + '」及其全部时点数据？不可恢复。')) return;
    await api('/studies/' + id, { method: 'DELETE' });
    toast('已删除');
    go('/followups');
  };
}

/* ---- 注册策略与邀请码面板（系统设置内，仅管理员可见） ---- */
function initRegisterPanel() {
  const radios = $$('input[name="register-mode"]');
  const list = $('#invite-list');
  if (!radios.length || !list) return;

  const syncRadios = function (st) {
    radios.forEach(function (r) { r.checked = r.value === (st.registerMode || 'invite'); });
  };
  api('/settings').then(syncRadios).catch(function () {
    radios.forEach(function (r) { r.disabled = true; });
  });

  const MODE_TOAST = { closed: '已关闭自助注册', invite: '已改为凭邀请码注册', open: '已开放自助注册' };
  radios.forEach(function (r) {
    r.onchange = async function () {
      try {
        const st = await api('/settings', { method: 'POST', body: { registerMode: r.value } });
        if (state.session) {
          state.session.registerMode = st.registerMode;
          state.session.allowRegister = st.allowRegister;
          state.session.registerAvailable = st.registerMode !== 'closed';
        }
        toast(MODE_TOAST[st.registerMode] || '设置已保存');
      } catch (e) {
        toast(e.message, 'err');
        api('/settings').then(syncRadios).catch(function () { /* 保持当前勾选状态 */ });
      }
    };
  });

  const load = async function () {
    let d;
    try {
      d = await api('/invites');
    } catch (e) {
      list.innerHTML = '<tr><td colspan="6" class="small">邀请码读取失败：' + esc(e.message) + '</td></tr>';
      return;
    }
    const items = d.items || [];
    list.innerHTML = items.length ? items.map(function (inv) {
      const badge = inv.revoked ? '<span class="tag danger">已吊销</span>'
        : (inv.remaining > 0 ? '<span class="tag ok">可注册 ' + inv.remaining + ' 人</span>' : '<span class="tag gray">已用完</span>');
      return '<tr><td class="mono">' + esc(inv.code) + '</td>' +
        '<td class="small">' + esc(inv.note || '—') + '</td>' +
        '<td class="num">' + inv.used + ' / ' + inv.maxUses + '</td>' +
        '<td class="small nowrap">' + (inv.expiresAt ? fmtDate(inv.expiresAt) : '长期有效') + '</td>' +
        '<td>' + badge + '</td>' +
        '<td class="acts">' + (inv.revoked ? '' :
          '<button class="btn small" data-invite-revoke="' + inv.id + '">吊销</button>') + '</td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty" style="padding:28px var(--space-5)"><p>还没有邀请码。用上方表单生成一个发给同事，对方凭码就能自己开号，不用你逐人建账号。</p></div></td></tr>';
    $$('[data-invite-revoke]').forEach(function (b) {
      b.onclick = async function () {
        try {
          await api('/invites/' + b.dataset.inviteRevoke, { method: 'PATCH', body: { revoked: true } });
          toast('邀请码已吊销');
          load();
        } catch (e) { toast(e.message, 'err'); }
      };
    });
  };

  $('#btn-invite').onclick = async function () {
    const btn = $('#btn-invite');
    btn.disabled = true;
    try {
      await api('/invites', {
        method: 'POST',
        body: {
          note: $('#invite-note').value.trim(),
          maxUses: Number($('#invite-max').value) || 1,
          validDays: Number($('#invite-days').value) || 0,
        },
      });
      $('#invite-note').value = '';
      toast('邀请码已生成，可抄给同事');
      await load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  };
  load();
}

/* ---- 备份与恢复面板（系统设置内，仅管理员可见） ---- */
function fmtBytes(n) {
  if (!(n > 0)) return '—';
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

function initBackupPanel() {
  const list = $('#backup-list');
  const result = $('#backup-result');
  if (!list || !result) return;
  const load = async function () {
    try {
      const bs = await api('/backups');
      const items = bs.items || [];
      if ($('#backup-dir')) $('#backup-dir').textContent = bs.dir || 'backups/';
      list.innerHTML = items.length ? items.map(function (b) {
        return '<tr><td class="mono small sha">' + esc(b.name) +
            (/-pre-restore-/.test(b.name) ? ' <span class="tag gray">恢复前自动</span>' : '') + '</td>' +
          '<td class="small nowrap">' + fmtDate(b.createdAt) + '</td>' +
          '<td class="num">' + fmtBytes(b.bytes) + '</td>' +
          '<td class="mono small">' + esc((b.sha256 || '').slice(0, 12)) + '</td>' +
          '<td class="acts"><a class="btn small" href="/api/backups/' + encodeURIComponent(b.name) + '">下载</a></td></tr>';
      }).join('') : '<tr><td colspan="5"><div class="empty" style="padding:28px var(--space-5)"><p>还没有备份。点上方「立即生成备份」会生成一个独立的 SQLite 文件，可下载到别处留存；删除调查前留一份快照最稳妥。</p></div></td></tr>';
    } catch (e) {
      list.innerHTML = '<tr><td colspan="5" class="small">备份列表读取失败：' + esc(e.message) + '</td></tr>';
    }
  };
  $('#btn-backup').onclick = async function () {
    result.textContent = '正在生成快照…';
    try {
      const meta = await api('/backup', { method: 'POST', body: {} });
      result.innerHTML = '已生成 <b class="mono">' + esc(meta.name) + '</b>（' + fmtBytes(meta.bytes) +
        '，完整性检查通过）。校验和 SHA-256：<span class="mono sha">' + esc(meta.sha256) + '</span>' +
        '<div class="mt8"><a class="btn small primary" href="/api/backups/' + encodeURIComponent(meta.name) + '">下载这份备份</a>' +
        '<span class="muted"> 请把文件和校验和一起留存，恢复时可核对是否一致。</span></div>';
      toast('备份已生成');
      load();
    } catch (e) {
      result.textContent = '备份失败：' + e.message;
      toast('备份失败：' + e.message, 'err');
    }
  };
  const fileInput = $('#restore-file');
  const confirmBox = $('#restore-confirm');
  const btnRestore = $('#btn-restore');
  const sync = function () { btnRestore.disabled = !(fileInput.files.length && confirmBox.checked); };
  fileInput.onchange = sync;
  confirmBox.onchange = sync;
  btnRestore.onclick = function () {
    const f = fileInput.files[0];
    if (!f || !confirmBox.checked) return;
    const reader = new FileReader();
    reader.onload = async function () {
      btnRestore.disabled = true;
      result.textContent = '正在恢复…';
      try {
        await api('/restore', {
          method: 'POST',
          body: { filename: f.name, data: String(reader.result), confirm: true },
        });
        toast('已恢复，请重新登录');
        state.session = null;
        setTimeout(function () { go('/login'); }, 500);
      } catch (e) {
        result.textContent = '恢复失败：' + e.message;
        toast('恢复失败：' + e.message, 'err');
        confirmBox.checked = false;
        sync();
      }
    };
    reader.readAsDataURL(f);
  };
  load();
}

async function viewSettings() {
  const notes = await api('/licensed-notes');
  const session = state.session || {};
  const content = '' +
    '<div class="page-head"><div><h1 class="page-title">系统设置</h1>' +
      '<div class="page-sub">账号安全、数据说明与量表授权提示</div></div></div>' +
    ((session.isAdmin) ? '<div class="card mb16"><div class="card-title">用户管理<span class="hint" id="user-count"></span></div>' +
      '<div id="user-list"><div class="skeleton" style="height:60px"></div></div>' +
      '</div>' : '') +
    ((session.isAdmin) ? '<div class="card mb16"><div class="card-title">谁能开账号<span class="hint">影响注册入口与安全边界，公网发布前先定这一项</span></div>' +
      '<div class="row" style="gap:18px;flex-wrap:wrap">' +
        [['closed', '关闭自助注册', '只由管理员在上方创建账号'],
          ['invite', '凭邀请码注册', '对方需填管理员生成的邀请码'],
          ['open', '开放注册', '任何人可自助注册为研究者']]
          .map(function (m) {
            return '<label class="row" style="gap:8px"><input type="radio" name="register-mode" value="' + m[0] + '" style="width:auto">' +
              '<span class="small"><b>' + m[1] + '</b><br>' + m[2] + '</span></label>';
          }).join('') +
      '</div>' +
      '<div class="row mt16" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' +
        '<label class="fld grow"><span>用途备注</span><input type="text" id="invite-note" placeholder="如 神内三组 / 2026 随访"></label>' +
        '<label class="fld" style="width:110px"><span>可用次数</span><input type="number" id="invite-max" value="5" min="1"></label>' +
        '<label class="fld" style="width:110px"><span>有效天数</span><input type="number" id="invite-days" value="30" min="1"></label>' +
        '<button class="btn primary" id="btn-invite">生成邀请码</button>' +
      '</div>' +
      '<div class="small muted mt8">邀请码是 8 位、去掉易混字符的码，抄在纸上或发群里都能用；用完或到期自动失效，也可随时吊销。</div>' +
      '<div class="table-wrap mt16"><table class="table"><thead><tr>' +
        '<th>邀请码</th><th>用途</th><th class="num">已用 / 可用</th><th>失效时间</th><th>状态</th><th class="acts"></th></tr></thead>' +
        '<tbody id="invite-list"><tr><td colspan="6" class="muted small center">正在读取…</td></tr></tbody></table></div>' +
      '</div>' : '') +
    '<div class="grid cols-2">' +
      ((session.isAdmin) ? '<div class="card"><div class="card-title">修改管理员密码</div>' +
        (session.defaultPassword ? '<div class="banner warn">当前仍在使用首次初始化的管理员口令，建议立即修改；口令值见服务器启动日志或数据目录下的「管理员初始口令.txt」。</div>' : '') +
        '<label class="fld"><span>原密码</span><input type="password" id="old-pwd"></label>' +
        '<label class="fld"><span>新密码（至少 6 位）</span><input type="password" id="new-pwd"></label>' +
        '<button class="btn primary" id="btn-pwd">修改密码</button>' +
        '<div class="small muted mt8">修改后所有登录会话将失效，需要重新登录。</div>' +
        '</div>' : '') +
      '<div class="card"><div class="card-title">数据存储与合规提示</div>' +
        '<ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.85">' +
          '<li>所有数据保存在本机文件 <span class="mono">medscale/data/app.db</span>（SQLite），未上传到任何第三方服务器。</li>' +
          '<li>可用下方「数据备份与恢复」一键生成快照；删除调查时对应答卷会一并删除且不可恢复。</li>' +
          '<li>开展涉及患者的研究前，请完成<b>伦理审查</b>与<b>知情同意</b>；本平台支持在问卷前强制显示知情同意并留痕。</li>' +
          '<li>涉及个人健康信息时建议：启用匿名模式、关闭 IP 采集、使用院内网络或内网服务器部署，并按《个人信息保护法》最小化采集。</li>' +
          '<li>如需公网发放，请为服务器配置 HTTPS（Nginx/Caddy 反向代理），并设置访问日志与定期备份。</li>' +
        '</ul>' +
      '</div>' +
    '</div>' +
    ((session.isAdmin) ? '<div class="card mt16"><div class="card-title">数据备份与恢复<span class="hint">快照是独立的 SQLite 文件，可下载到别处留存</span></div>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">' +
        '<button class="btn primary" id="btn-backup">立即生成备份</button>' +
        '<span class="small muted">快照保存在服务器 <span class="mono" id="backup-dir">backups/</span></span>' +
      '</div>' +
      '<div id="backup-result" class="small mt8" aria-live="polite"></div>' +
      '<div class="table-wrap mt16"><table class="table"><thead><tr>' +
        '<th>备份文件</th><th>生成时间</th><th class="num">大小</th><th>校验和</th><th class="acts"></th>' +
      '</tr></thead><tbody id="backup-list"><tr><td colspan="5" class="muted small center">加载中…</td></tr></tbody></table></div>' +
      '<div class="card-title mt16" style="font-size:14px">恢复数据</div>' +
      '<div class="banner warn">恢复会用所选快照<b>整体覆盖</b>当前数据，覆盖后新产生的答卷无法找回。' +
        '执行前系统会自动为当前数据生成一份「恢复前」快照，万一恢复错了还能再恢复回去。</div>' +
      '<label class="fld"><span>选择本地备份文件（.sqlite）</span>' +
        '<input type="file" id="restore-file" accept=".sqlite,application/octet-stream"></label>' +
      '<label class="row" style="gap:8px"><input type="checkbox" id="restore-confirm" style="width:auto">' +
        '<span class="small">我已确认：当前数据将被所选备份覆盖</span></label>' +
      '<button class="btn danger mt8" id="btn-restore" disabled>恢复所选备份</button>' +
      '</div>' : '') +
    '<div class="card mt16"><div class="card-title">量表授权提示<span class="hint">正式研究使用前请逐条核对</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>量表</th><th>授权要求</th></tr></thead><tbody>' +
      notes.items.map(function (n) {
        return '<tr><td class="nowrap"><b>' + esc(n.name) + '</b></td><td class="small">' + esc(n.note) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="banner info mt16 mb0">平台内置量表均标注了来源文献与授权说明；发表论文时请按各量表要求引用原始文献与中文版文献。</div>' +
    '</div>' +
    '<div class="card mt16"><div class="card-title">部署建议</div>' +
      '<div class="grid cols-2">' +
        '<div><b class="small">本机 / 局域网使用（推荐起步）</b>' +
          '<div class="small muted mt8">服务默认只监听 127.0.0.1（仅本机可访问）。需要手机扫码填写时，用「启动平台.command」启动或以 <span class="mono">MEDSCALE_LAN=1</span> 启动，命令行会显示局域网地址（如 http://192.168.1.5:5173），受试者连接同一 WiFi 即可填写，数据不出内网。</div></div>' +
        '<div><b class="small">公网服务器部署</b>' +
          '<div class="small muted mt8">部署到云服务器后，用域名 + HTTPS 对外发放。建议配置防火墙与自动备份 app.db，并按机构要求完成数据安全评估。</div></div>' +
      '</div>' +
    '</div>';
  $('#app').innerHTML = shell('settings', content, [{ label: '系统设置' }]);
  afterShell();
  if (session.isAdmin) {
    $('#btn-pwd').onclick = async function () {
      try {
        await api('/password', { method: 'POST', body: { oldPassword: $('#old-pwd').value, newPassword: $('#new-pwd').value } });
        toast('密码已修改，请重新登录');
        state.session = null;
        render();
      } catch (e) { toast(e.message, 'err'); }
    };
    initBackupPanel();
    initRegisterPanel();
    try {
      const us = await api('/users');
      $('#user-count').textContent = '共 ' + us.items.length + ' 人';
      $('#user-list').innerHTML = '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>用户名</th><th>姓名</th><th>科室/单位</th><th>角色</th><th>状态</th><th>注册时间</th><th class="acts"></th></tr></thead><tbody>' +
        us.items.map(function (u) {
          return '<tr><td class="mono">' + esc(u.username) + '</td><td>' + esc(u.name || '—') + '</td>' +
            '<td class="small">' + esc(u.org || '—') + '</td>' +
            '<td>' + (u.role === 'admin' ? '<span class="tag">管理员</span>' : '<span class="tag gray">研究者</span>') + '</td>' +
            '<td>' + (u.status === 'active' ? '<span class="tag ok">正常</span>' : '<span class="tag danger">已停用</span>') + '</td>' +
            '<td class="small nowrap">' + fmtDate(u.createdAt) + '</td>' +
            '<td class="acts"><button class="btn small" data-user-toggle="' + u.id + '" data-status="' + u.status + '">' +
              (u.status === 'active' ? '停用' : '启用') + '</button> ' +
            '<button class="btn small" data-user-pwd="' + u.id + '">重置密码</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      $$('[data-user-toggle]').forEach(function (b) {
        b.onclick = async function () {
          await api('/users/' + b.dataset.userToggle, {
            method: 'PATCH',
            body: { status: b.dataset.status === 'active' ? 'disabled' : 'active' },
          });
          toast('已更新用户状态');
          render();
        };
      });
      $$('[data-user-pwd]').forEach(function (b) {
        b.onclick = async function () {
          const np = window.prompt('为该用户设置新密码（至少 6 位）：');
          if (!np) return;
          if (String(np).length < 6) return toast('密码至少 6 位', 'err');
          await api('/users/' + b.dataset.userPwd, { method: 'PATCH', body: { password: np } });
          toast('密码已重置');
        };
      });
    } catch (e) { $('#user-list').innerHTML = '<div class="muted small">用户列表加载失败：' + esc(e.message) + '</div>'; }
  }
}

/* ================= 图表（Canvas 手绘） ================= */
/**
 * Canvas 颜色安全化：CSS 变量（var(--x)）与非法颜色无法用于 Canvas，
 * 一旦传入会导致 addColorStop 抛错（Safari: "The string did not match the expected pattern."），
 * 进而使整页渲染失败。这里统一兜底。
 */
function safeColor(c, fallback) {
  const f = fallback || '#10766b';
  if (!c) return f;
  const s = String(c).trim();
  if (!s || /^var\(/i.test(s)) return f;
  try {
    if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', s)) return f;
  } catch (e) { return f; }
  return s;
}

/** 图表绘制容错：任何绘制异常都不应影响页面其余部分 */
function safeDraw(fn) {
  try { return fn(); } catch (e) {
    if (typeof console !== 'undefined') console.warn('图表绘制失败：', e && e.message);
    return null;
  }
}

function prepCanvas(cv) {
  if (!cv) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || (cv.parentElement ? cv.parentElement.clientWidth : 600) || 600;
  const h = Number(cv.getAttribute('height')) || 220;
  cv.width = Math.floor(w * dpr);
  cv.height = Math.floor(h * dpr);
  cv.style.width = '100%';
  cv.style.height = h + 'px';
  const ctx = cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx: ctx, w: w, h: h };
}

function drawBars(cv, labels, values, color, errors) {
  const p = prepCanvas(cv);
  if (!p) return;
  const ctx = p.ctx;
  const mainColor = safeColor(color, '#10766b');
  const max = Math.max.apply(null, values.concat([1])) * 1.2;
  const padL = 46;
  const padB = 48;
  const padT = 16;
  const plotW = p.w - padL - 16;
  const plotH = p.h - padB - padT;
  const n = values.length || 1;
  const step = plotW / n;
  const barW = Math.min(58, step * 0.62);

  ctx.strokeStyle = '#e2ecf0';
  ctx.fillStyle = '#8399a4';
  ctx.font = '11px sans-serif';
  for (let i = 0; i <= 4; i += 1) {
    const y = padT + plotH - plotH * i / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(max * i / 4)), 8, y + 4);
  }

  values.forEach(function (v, i) {
    const x = padL + step * i + (step - barW) / 2;
    const hgt = Math.max(0, plotH * (v / max));
    const y = padT + plotH - hgt;
    const g = ctx.createLinearGradient(0, y, 0, padT + plotH);
    g.addColorStop(0, mainColor);
    g.addColorStop(1, 'rgba(13,122,114,.5)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, barW, hgt);
    if (errors && errors[i] !== undefined && errors[i] !== null && isFinite(errors[i])) {
      const eh = plotH * (errors[i] / max);
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, y - eh);
      ctx.lineTo(x + barW / 2, y + eh);
      ctx.moveTo(x + barW / 2 - 6, y - eh);
      ctx.lineTo(x + barW / 2 + 6, y - eh);
      ctx.moveTo(x + barW / 2 - 6, y + eh);
      ctx.lineTo(x + barW / 2 + 6, y + eh);
      ctx.stroke();
    }
    ctx.fillStyle = '#16323b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(v * 100) / 100), x + barW / 2, Math.max(12, y - 6));
    ctx.fillStyle = '#4b6470';
    ctx.font = '11px sans-serif';
    const label = String(labels[i] === undefined ? '' : labels[i]);
    const short = label.length > 7 ? label.slice(0, 6) + '…' : label;
    ctx.fillText(short, x + barW / 2, padT + plotH + 17);
    if (label.length > 7) ctx.fillText(label.slice(6, 14), x + barW / 2, padT + plotH + 31);
    ctx.textAlign = 'left';
  });
}

/** 折线图（累计回收趋势） */
function drawLine(cv, labels, values, color, seriesName) {
  const p = prepCanvas(cv);
  if (!p || !values.length) return;
  const ctx = p.ctx;
  const lineColor = safeColor(color, '#10766b');
  const max = Math.max.apply(null, values.concat([1])) * 1.15;
  const padL = 46;
  const padB = 38;
  const padT = 18;
  const plotW = p.w - padL - 16;
  const plotH = p.h - padB - padT;
  const n = values.length;
  const xAt = function (i) { return padL + (n === 1 ? plotW / 2 : plotW * i / (n - 1)); };
  const yAt = function (v) { return padT + plotH - plotH * (v / max); };

  ctx.strokeStyle = '#e2ecf0';
  ctx.fillStyle = '#8399a4';
  ctx.font = '11px sans-serif';
  for (let i = 0; i <= 4; i += 1) {
    const y = padT + plotH - plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillText(String(Math.round(max * i / 4)), 8, y + 4);
  }

  // 面积
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, 'rgba(16,118,107,.28)');
  grad.addColorStop(1, 'rgba(16,118,107,.02)');
  ctx.beginPath();
  ctx.moveTo(xAt(0), padT + plotH);
  values.forEach(function (v, i) { ctx.lineTo(xAt(i), yAt(v)); });
  ctx.lineTo(xAt(n - 1), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 折线
  ctx.beginPath();
  values.forEach(function (v, i) {
    if (i === 0) ctx.moveTo(xAt(i), yAt(v)); else ctx.lineTo(xAt(i), yAt(v));
  });
  ctx.strokeStyle = color || '#10766b';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 数据点 + 末值
  values.forEach(function (v, i) {
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(v), i === n - 1 ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i === n - 1 ? lineColor : '#fff';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  });
  ctx.fillStyle = '#16323b';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(values[n - 1]), Math.min(p.w - 6, xAt(n - 1) + 26), Math.max(12, yAt(values[n - 1]) - 8));
  ctx.textAlign = 'left';

  const step = Math.max(1, Math.ceil(n / 8));
  ctx.fillStyle = '#8399a4';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  labels.forEach(function (lb, i) {
    if (i % step === 0 || i === n - 1) ctx.fillText(String(lb), xAt(i), padT + plotH + 16);
  });
  ctx.textAlign = 'left';
  if (seriesName) {
    ctx.fillStyle = lineColor;
    ctx.font = '12px sans-serif';
    ctx.fillText('● ' + seriesName, padL, p.h - 6);
  }
}

function drawHistogram(cv, values, range, meanValue, axisLabel) {
  const p = prepCanvas(cv);
  if (!p || !values.length) return;
  const ctx = p.ctx;
  const lo = range && range[0] !== null ? range[0] : Math.min.apply(null, values);
  const hi = range && range[1] !== null ? range[1] : Math.max.apply(null, values);
  const span = (hi - lo) || 1;
  const bins = Math.max(5, Math.min(20, Math.round(Math.sqrt(values.length) * 2)));
  const width = span / bins;
  const counts = new Array(bins).fill(0);
  values.forEach(function (v) {
    let i = Math.floor((v - lo) / width);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    counts[i] += 1;
  });
  const max = Math.max.apply(null, counts.concat([1]));
  const padL = 42;
  const padB = 44;
  const padT = 16;
  const plotW = p.w - padL - 16;
  const plotH = p.h - padB - padT;
  const step = plotW / bins;
  const barW = Math.max(4, step * 0.86);

  for (let i = 0; i <= 4; i += 1) {
    const y = padT + plotH - plotH * i / 4;
    ctx.strokeStyle = '#e2ecf0';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = '#8399a4'; ctx.font = '11px sans-serif';
    ctx.fillText(String(Math.round(max * i / 4)), 8, y + 4);
  }
  const labelEvery = Math.max(1, Math.ceil(bins / 10));
  counts.forEach(function (c, i) {
    const hgt = plotH * (c / max);
    const x = padL + step * i + (step - barW) / 2;
    const y = padT + plotH - hgt;
    ctx.fillStyle = 'rgba(37,99,235,.85)';
    ctx.fillRect(x, y, barW, hgt);
    if (i % labelEvery === 0) {
      ctx.fillStyle = '#8399a4';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round((lo + width * i) * 10) / 10), x + barW / 2, padT + plotH + 16);
      ctx.textAlign = 'left';
    }
  });
  if (meanValue !== null && meanValue !== undefined && isFinite(meanValue)) {
    const mx = padL + plotW * (meanValue - lo) / span;
    ctx.strokeStyle = 'var(--danger)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'var(--danger)';
    ctx.font = '11px sans-serif';
    ctx.fillText('均值 ' + Math.round(meanValue * 100) / 100, Math.min(mx + 5, p.w - 72), padT + 12);
  }
  ctx.fillStyle = '#8399a4';
  ctx.font = '11px sans-serif';
  ctx.fillText('横轴：' + (axisLabel || '得分区间') + '　纵轴：人数', padL, p.h - 8);
}

/* ================= 主调度 ================= */
async function render() {
  const r = currentRoute();
  const progress = document.getElementById('nav-progress');
  let progressTimer = null;
  if (progress && r.name !== 'anchor') {
    progressTimer = setTimeout(function () { progress.classList.add('on'); }, 120);
  }
  const endProgress = function () {
    if (progressTimer) clearTimeout(progressTimer);
    if (progress) progress.classList.remove('on');
  };
  try {
    if (r.name === 'fill') {
      if (!r.token) {
        $('#app').innerHTML = '<div class="fill-wrap"><div class="card"><div class="empty">问卷链接不完整</div></div></div>';
        return;
      }
      await ensureFill();
      await window.MEDSCALE_FILL.view(r.token);
      return;
    }
    if (!state.session) state.session = await api('/session');
    if (r.name === 'anchor') return viewAnchor(r.args[0]);
    if (VIEW_NAMES.indexOf(r.name) < 0) return viewNotFound(r);
    if (!state.session.authenticated) {
      if (r.name === 'login') return viewAuth('login');
      if (r.name === 'register') return viewAuth('register');
      if (r.name === 'admin') return viewAuth('admin');
      if (r.name === 'library') return await viewPublicLibrary();
      if (r.name === 'guide') return viewGuide();
      return viewLanding();
    }
    if (['login', 'register', 'admin'].indexOf(r.name) >= 0) { location.hash = '#/home'; return render(); }
    if (r.name === 'library') { location.hash = '#/scales'; return render(); }
    if (r.name === 'guide') return viewGuide();

    if (r.name === 'home') return await viewHome();
    if (r.name === 'scales') return await viewScales(parseScaleQuery(r.query));
    if (r.name === 'import') return await viewImport();
    if (r.name === 'scale') return await viewScaleDetail(Number(r.args[0]));
    if (r.name === 'builder') return await viewBuilder(r.args[0] ? Number(r.args[0]) : null);
    if (r.name === 'surveys') return await viewSurveys();
    if (r.name === 'followups') return await viewFollowups();
    if (r.name === 'followup') return await viewFollowupDetail(Number(r.args[0]));
    if (r.name === 'survey') return await viewSurveyDetail(Number(r.args[0]));
    if (r.name === 'settings') return await viewSettings();
    return await viewHome();
  } catch (e) {
    if (e.message && e.message.indexOf('请先登录') >= 0) {
      state.session = null;
      return viewLanding();
    }
    $('#app').innerHTML = '<div class="main"><div class="card"><div class="empty">' +
      '<span class="big">⚠️</span>页面加载失败：' + esc(e.message) +
      '<div class="mt16"><button class="btn" data-reload="1">重新加载</button></div></div></div></div>';
  } finally {
    endProgress();
  }
}

/* 出错兜底页与解析失败提示里的按钮：内联 onclick 会被 CSP 拦掉，改用事件委托 */
document.addEventListener('click', function (ev) {
  const btn = ev.target && ev.target.closest ? ev.target.closest('[data-reload]') : null;
  if (!btn) return;
  if (btn.getAttribute('data-reload') === 'import') location.hash = '#/import';
  location.reload();
});

render();
