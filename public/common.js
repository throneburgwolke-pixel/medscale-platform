'use strict';
/* 管理端（app.js）与填写页（fill.js）共用的基础工具 */

const $ = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** 数字字段进 HTML 前先强转：imported/自建量表的 min/max 可能是任意字符串 */
function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toast(msg, type) {
  const host = $('#toast-host');
  host.innerHTML = '<div class="toast ' + (type || '') + '">' + esc(msg) + '</div>';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { host.innerHTML = ''; }, type === 'err' ? 4600 : 2600);
}

function confirmBox(msg) {
  return window.confirm(msg);
}

/* 弹窗挂载：打开即把焦点移入对话框，键盘用户不必从头 Tab */
function mountModal(mask) {
  document.body.appendChild(mask);
  const box = mask.querySelector('.modal');
  if (box) {
    if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
    box.focus();
  }
  return box;
}
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  const masks = $$('.modal-mask');
  if (masks.length) masks[masks.length - 1].remove();
});

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function estimateMinutes(n) {
  const sec = n * 12;
  if (sec < 60) return '约 ' + sec + ' 秒';
  return '约 ' + Math.max(1, Math.round(sec / 60)) + ' 分钟';
}

async function api(path, opts) {
  const o = Object.assign({ credentials: 'same-origin', headers: {} }, opts || {});
  if (o.body && typeof o.body !== 'string') {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(o.body);
  }
  if (o.method && o.method !== 'GET') o.headers['Content-Type'] = o.headers['Content-Type'] || 'application/json';
  const res = await fetch('/api' + path, o);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data.error || ('请求失败 ' + res.status));
    err.detail = data;
    throw err;
  }
  return data;
}
