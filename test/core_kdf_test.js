'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const kdf = require(path.join(__dirname, '..', 'core', 'kdf.js'));

(async function () {
  console.log('\n【1】scrypt（Node 版既有格式）');
  const h = kdf.hashScryptSync('s3cret');
  t.ok(/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(h), '格式 = salt32:hash64', h);
  t.ok(kdf.verifyPassword('s3cret', h) === true, '正确口令通过');
  t.ok(kdf.verifyPassword('wrong', h) === false, '错误口令拒绝');
  t.ok(kdf.algorithmOf(h) === 'scrypt', 'algorithmOf 识别 scrypt');

  console.log('\n【2】pbkdf2（Workers 版格式）');
  const p = await kdf.hashPbkdf2('s3cret');
  t.ok(/^pbkdf2\$600000\$sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(p), '格式 = pbkdf2$迭代$算法$salt$hash', p);
  t.ok((await kdf.verifyPassword('s3cret', p)) === true, '异步校验通过');
  t.ok((await kdf.verifyPassword('nope', p)) === false, '异步校验拒绝错口令');
  t.ok(kdf.algorithmOf(p) === 'pbkdf2', 'algorithmOf 识别 pbkdf2');
  const p2 = await kdf.hashPbkdf2('s3cret');
  t.ok(p2 !== p, '同口令两次哈希盐不同');

  console.log('\n【3】边界');
  t.ok(kdf.verifyPassword('x', '') === false && kdf.verifyPassword('x', null) === false, '空存储直接 false');
  t.ok(kdf.verifyPassword('x', 'garbage') === false, '垃圾串 false');
  t.ok(kdf.algorithmOf('garbage') === null, '未知格式 null');

  console.log('\n【4】lib/db.js 委托后旧哈希仍可验');
  const dbmPath = path.join(__dirname, '..', 'lib', 'db.js');
  const src = require('node:fs').readFileSync(dbmPath, 'utf8');
  t.ok(/core\/kdf\.js|core', 'kdf|require\('\.\/\.\.\/core\/kdf/.test(src) || /kdf/.test(src), 'lib/db.js 引用 core/kdf.js');
  process.exit(t.done('核心 KDF'));
})();
