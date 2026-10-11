'use strict';
/**
 * 口令 KDF 单一来源：scrypt（Node 既有格式，无前缀）与 PBKDF2-SHA256（Workers，带前缀）。
 * 只用 node:crypto 与全局 WebCrypto（Node≥22.5 与 Workers 都提供 crypto.subtle），不引第三方。
 */
const crypto = require('node:crypto');
const PBKDF2_ITERATIONS = 600000; // OWASP 当前对 PBKDF2-SHA256 的建议值

function hashScryptSync(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 32).toString('hex');
  return s + ':' + hash;
}

async function hashPbkdf2(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(s), iterations: PBKDF2_ITERATIONS },
    key, 256);
  const hex = Buffer.from(bits).toString('hex');
  return 'pbkdf2$' + PBKDF2_ITERATIONS + '$sha256$' + s + '$' + hex;
}

/** 定长时间比较：不依赖 timingSafeEqual（Workers 没有），逐字符累积差异 */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function algorithmOf(stored) {
  if (typeof stored !== 'string' || !stored) return null;
  if (stored.startsWith('pbkdf2$')) return 'pbkdf2';
  if (/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored)) return 'scrypt';
  return null;
}

async function verifyPbkdf2(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 5) return false;
  const iters = Number(parts[1]);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(parts[3]), iterations: iters },
    key, 256);
  return safeEqualHex(Buffer.from(bits).toString('hex'), parts[4]);
}

function verifyPassword(password, stored) {
  const alg = algorithmOf(stored);
  if (alg === 'scrypt') {
    const parts = stored.split(':');
    const hash = crypto.scryptSync(String(password), parts[0], 32).toString('hex');
    return safeEqualHex(hash, parts[1]);
  }
  if (alg === 'pbkdf2') return verifyPbkdf2(password, stored);
  return false;
}

module.exports = { hashScryptSync, hashPbkdf2, verifyPassword, algorithmOf, PBKDF2_ITERATIONS };
