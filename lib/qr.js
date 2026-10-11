'use strict';
/**
 * 二维码生成器（字节模式，纠错等级 M，版本 1-10 自动选择）+ PNG 输出
 * 仅使用 Node 内置模块，无需联网安装依赖。
 */
const zlib = require('node:zlib');

/* ---------------- GF(256) 与 Reed-Solomon ---------------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}());

function gfMul(a, b) {
  if (!a || !b) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function polyMul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) r[i + j] ^= gfMul(a[i], b[j]);
  }
  return r;
}

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i += 1) g = polyMul(g, [1, EXP[i]]);
  return g;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ res[0];
    res.shift();
    res.push(0);
    for (let j = 0; j < ecLen; j += 1) res[j] ^= gfMul(gen[j + 1], factor);
  }
  return res;
}

/* ---------------- 版本参数表（纠错等级 M） ---------------- */
// [总码字数, [ [块数, 每块数据码字, 每块纠错码字], ... ]]
const VERSIONS_M = {
  1: [26, [[1, 16, 10]]],
  2: [44, [[1, 28, 16]]],
  3: [70, [[1, 44, 26]]],
  4: [100, [[2, 32, 18]]],
  5: [134, [[2, 43, 24]]],
  6: [172, [[4, 27, 16]]],
  7: [196, [[4, 31, 18]]],
  8: [242, [[2, 38, 22], [2, 39, 24]]],
  9: [292, [[3, 36, 22], [2, 37, 22]]],
  10: [346, [[4, 43, 26], [1, 44, 28]]],
};

const ALIGN_POS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

function dataCodewords(version) {
  return VERSIONS_M[version][1].reduce(function (acc, b) { return acc + b[0] * b[1]; }, 0);
}

function pickVersion(byteLen) {
  for (let v = 1; v <= 10; v += 1) {
    const cap = dataCodewords(v) * 8 - 4 - (v <= 9 ? 8 : 16);
    if (byteLen * 8 <= cap) return v;
  }
  return null;
}

function getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

/* ---------------- 编码 ---------------- */
function buildCodewords(bytes, version) {
  const bits = [];
  const push = function (val, len) {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4); // 字节模式
  push(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach(function (b) { push(b, 8); });

  const capacity = dataCodewords(version) * 8;
  // 终止符
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0);
  // 补齐到字节
  while (bits.length % 8 !== 0) bits.push(0);
  // 填充字节
  const pads = [0xec, 0x11];
  let pi = 0;
  while (bits.length < capacity) {
    push(pads[pi % 2], 8);
    pi += 1;
  }

  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  return cw;
}

function interleave(codewords, version) {
  const blocks = VERSIONS_M[version][1];
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  blocks.forEach(function (b) {
    const cnt = b[0];
    const dLen = b[1];
    const eLen = b[2];
    for (let i = 0; i < cnt; i += 1) {
      const d = codewords.slice(offset, offset + dLen);
      offset += dLen;
      dataBlocks.push(d);
      ecBlocks.push(rsEncode(d, eLen));
    }
  });

  const out = [];
  const maxData = Math.max.apply(null, dataBlocks.map(function (b) { return b.length; }));
  for (let i = 0; i < maxData; i += 1) {
    dataBlocks.forEach(function (b) { if (i < b.length) out.push(b[i]); });
  }
  const maxEc = Math.max.apply(null, ecBlocks.map(function (b) { return b.length; }));
  for (let i = 0; i < maxEc; i += 1) {
    ecBlocks.forEach(function (b) { if (i < b.length) out.push(b[i]); });
  }
  return out;
}

/* ---------------- 矩阵构建 ---------------- */
function createMatrix(version) {
  const size = version * 4 + 17;
  const modules = [];
  const reserved = [];
  for (let i = 0; i < size; i += 1) {
    modules.push(new Array(size).fill(false));
    reserved.push(new Array(size).fill(false));
  }

  function set(r, c, dark, isFunction) {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = !!dark;
    if (isFunction !== false) reserved[r][c] = true;
  }

  // 定位图形 + 分隔符
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (pos) {
    const r0 = pos[0];
    const c0 = pos[1];
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inFinder && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, dark, true);
      }
    }
  });

  // 校正图形
  const ap = ALIGN_POS[version] || [];
  for (let i = 0; i < ap.length; i += 1) {
    for (let j = 0; j < ap.length; j += 1) {
      const r0 = ap[i];
      const c0 = ap[j];
      if ((r0 <= 8 && c0 <= 8) || (r0 <= 8 && c0 >= size - 9) || (r0 >= size - 9 && c0 <= 8)) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          set(r0 + r, c0 + c, dark, true);
        }
      }
    }
  }

  // 定时图形
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0, true);
    set(i, 6, i % 2 === 0, true);
  }

  // 固定暗模块
  set(size - 8, 8, true, true);

  // 预留格式信息区域
  for (let i = 0; i <= 8; i += 1) {
    if (!reserved[8][i]) set(8, i, false, true);
    if (!reserved[i][8]) set(i, 8, false, true);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false, true);
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, false, true);
  }

  // 预留版本信息区域（版本 >= 7）
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        set(size - 11 + j, i, false, true);
        set(i, size - 11 + j, false, true);
      }
    }
  }

  return { size: size, modules: modules, reserved: reserved };
}

function placeData(m, codewords) {
  const size = m.size;
  const modules = m.modules;
  const reserved = m.reserved;
  const totalBits = codewords.length * 8;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!reserved[y][x] && i < totalBits) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i += 1;
        }
      }
    }
  }
}

function maskFn(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    default: return false;
  }
}

function applyMask(m, mask) {
  const size = m.size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!m.reserved[y][x] && maskFn(mask, x, y)) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

function penalty(m) {
  const size = m.size;
  const mod = m.modules;
  let score = 0;

  // 规则1：同色连续 5 个以上
  for (let y = 0; y < size; y += 1) {
    let run = 1;
    for (let x = 1; x < size; x += 1) {
      if (mod[y][x] === mod[y][x - 1]) run += 1;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let x = 0; x < size; x += 1) {
    let run = 1;
    for (let y = 1; y < size; y += 1) {
      if (mod[y][x] === mod[y - 1][x]) run += 1;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }

  // 规则2：2x2 同色区块
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const v = mod[y][x];
      if (v === mod[y][x + 1] && v === mod[y + 1][x] && v === mod[y + 1][x + 1]) score += 3;
    }
  }

  // 规则3：类定位图形
  const p1 = [true, false, true, true, true, false, true, false, false, false, false];
  const p2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = function (get, len) {
    let cnt = 0;
    for (let i = 0; i + 11 <= len; i += 1) {
      let m1 = true;
      let m2 = true;
      for (let j = 0; j < 11; j += 1) {
        const v = get(i + j);
        if (v !== p1[j]) m1 = false;
        if (v !== p2[j]) m2 = false;
        if (!m1 && !m2) break;
      }
      if (m1) cnt += 1;
      if (m2) cnt += 1;
    }
    return cnt;
  };
  for (let y = 0; y < size; y += 1) score += 40 * matches(function (x) { return mod[y][x]; }, size);
  for (let x = 0; x < size; x += 1) score += 40 * matches(function (y) { return mod[y][x]; }, size);

  // 规则4：明暗比例偏离
  let dark = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (mod[y][x]) dark += 1;
  const ratio = dark * 100 / (size * size);
  score += Math.abs(Math.ceil(ratio / 5) - 10) * 10;

  return score;
}

function bchFormat(data) {
  let d = data << 10;
  const g = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if (getBit(d, i)) d ^= g << (i - 10);
  }
  return ((data << 10) | d) ^ 0x5412;
}

function bchVersion(version) {
  let d = version << 12;
  const g = 0x1f25;
  for (let i = 17; i >= 12; i -= 1) {
    if (getBit(d, i)) d ^= g << (i - 12);
  }
  return (version << 12) | d;
}

function placeFormatAndVersion(m, mask, ecBits) {
  const size = m.size;
  const mod = m.modules;
  const bits = bchFormat((ecBits << 3) | mask);
  const bitAt = function (i) { return getBit(bits, i); };

  // 第一份
  for (let i = 0; i <= 5; i += 1) mod[i][8] = bitAt(i);
  mod[7][8] = bitAt(6);
  mod[8][8] = bitAt(7);
  mod[8][7] = bitAt(8);
  for (let i = 9; i < 15; i += 1) mod[8][14 - i] = bitAt(i);
  // 第二份
  for (let i = 0; i < 8; i += 1) mod[8][size - 1 - i] = bitAt(i);
  for (let i = 8; i < 15; i += 1) mod[size - 15 + i][8] = bitAt(i);
  mod[size - 8][8] = true;

  if (m.version >= 7) {
    const vbits = bchVersion(m.version);
    for (let i = 0; i < 18; i += 1) {
      const bit = getBit(vbits, i);
      const a = Math.floor(i / 3);
      const b = i % 3;
      mod[a][size - 11 + b] = bit;
      mod[size - 11 + b][a] = bit;
    }
  }
}

/* ---------------- 对外接口 ---------------- */
function encode(text) {
  const bytes = Array.from(Buffer.from(String(text), 'utf8'));
  const version = pickVersion(bytes.length);
  if (!version) throw new Error('内容过长，超过二维码容量上限');
  const codewords = interleave(buildCodewords(bytes, version), version);
  const base = createMatrix(version);
  base.version = version;
  placeData(base, codewords);

  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const m = {
      size: base.size,
      version: version,
      modules: base.modules.map(function (r) { return r.slice(); }),
      reserved: base.reserved,
    };
    applyMask(m, mask);
    placeFormatAndVersion(m, mask, 0b00 /* M */);
    const s = penalty(m);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/* ---------------- PNG 输出 ---------------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function toPng(matrix, scale, quiet) {
  const s = scale || 8;
  const q = quiet === undefined ? 4 : quiet;
  const size = matrix.size;
  const dim = (size + q * 2) * s;
  const raw = Buffer.alloc((dim * 3 + 1) * dim);
  let p = 0;
  for (let y = 0; y < dim; y += 1) {
    raw[p] = 0;
    p += 1;
    const my = Math.floor(y / s) - q;
    for (let x = 0; x < dim; x += 1) {
      const mx = Math.floor(x / s) - q;
      const dark = my >= 0 && mx >= 0 && my < size && mx < size && matrix.modules[my][mx];
      const v = dark ? 0 : 255;
      raw[p] = v; raw[p + 1] = v; raw[p + 2] = v;
      p += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0);
  ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function png(text, scale, quiet) {
  return toPng(encode(text), scale, quiet);
}

module.exports = {
  encode: encode,
  png: png,
  toPng: toPng,
  // 供自检脚本使用
  __internal: {
    pickVersion: pickVersion,
    buildCodewords: buildCodewords,
    interleave: interleave,
    createMatrix: createMatrix,
    placeData: placeData,
    applyMask: applyMask,
    placeFormatAndVersion: placeFormatAndVersion,
    penalty: penalty,
    maskFn: maskFn,
    bchFormat: bchFormat,
    bchVersion: bchVersion,
  },
};
