'use strict';
/**
 * 量表导入解析引擎 —— Cloudflare Workers 边缘版
 * 与 lib/parse.js（Node 版）行为对齐，差异仅两处：
 *  1. ZIP/PDF 解压用 Web 标准 DecompressionStream（Workers 原生，替代 node:zlib）；
 *  2. 无本地文件系统/OCR：图片返回 needManual 提示，不再调用 macOS Vision。
 * 纯逻辑（CSV/表头/启发式抽题）复用 lib/parse-core.js，与 Node 版零漂移。
 * 支持：Excel(.xlsx)、Word(.docx)、PDF（文本型，尽力解析）、CSV/TXT/MD/TSV。
 */
const core = require('./parse-core.js');
const TD = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function utf8(bytes) { return TD ? TD.decode(bytes) : String(bytes); }
/** 字节 → latin1 字符串（与 Buffer.toString('latin1') 等价，供 PDF 扫描） */
function latin1(bytes) {
  let out = '';
  const CH = 8192;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
  }
  return out;
}

/* ---------------- DecompressionStream 解压 ---------------- */
async function inflateWith(comp, format) {
  try {
    const src = new Response(comp).body;
    const ab = await new Response(src.pipeThrough(new DecompressionStream(format))).arrayBuffer();
    return new Uint8Array(ab);
  } catch (e) { return null; }
}
/** PDF 流：先按 zlib/deflate 原样试；失败再修剪尾随字节（\r\n）重试 */
async function inflateAny(comp) {
  const formats = ['deflate', 'deflate-raw'];
  for (let f = 0; f < formats.length; f += 1) {
    const r = await inflateWith(comp, formats[f]);
    if (r) return r;
  }
  for (let trim = 1; trim <= 2 && trim < comp.length; trim += 1) {
    for (let f = 0; f < formats.length; f += 1) {
      const r = await inflateWith(comp.subarray(0, comp.length - trim), formats[f]);
      if (r) return r;
    }
  }
  return null;
}

/* ---------------- ZIP（docx/xlsx 内部结构），异步解压 ---------------- */
async function unzip(buf) {
  const files = {};
  const SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  let p = 0;
  while (p + 30 <= buf.length) {
    if (buf.readUInt32LE(p) !== 0x04034b50) {
      const next = buf.indexOf(SIG, p);
      if (next < 0) break;
      p = next;
      continue;
    }
    const method = buf.readUInt16LE(p + 8);
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const nameStart = p + 30;
    const name = utf8(buf.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (compSize > 0) {
      const comp = buf.subarray(dataStart, dataStart + compSize);
      try {
        files[name] = method === 0 ? comp : (await inflateWith(comp, 'deflate-raw'));
      } catch (e) { /* 跳过损坏项 */ }
      if (files[name] === null) delete files[name];
      p = dataStart + compSize;
    } else {
      // 数据描述符模式：向后找下一个本地头
      const next = buf.indexOf(SIG, dataStart);
      if (next < 0) break;
      p = next;
    }
  }
  return files;
}

/* ---------------- Word (.docx) ---------------- */
async function parseDocx(buf) {
  const files = await unzip(buf);
  const xml = files['word/document.xml'];
  if (!xml) return '';
  const s = utf8(xml);
  const paras = s.split(/<w:p[ >]/).map(function (chunk) {
    const texts = [];
    chunk.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, function (_, t) { texts.push(core.xmlUnescape(t)); return ''; });
    const tabs = chunk.match(/<w:tab\b/g);
    return texts.join('') + (tabs ? '\t' : '');
  });
  return paras.filter(function (l) { return l.trim() !== ''; }).join('\n');
}

/* ---------------- Excel (.xlsx) ---------------- */
async function parseXlsx(buf) {
  const files = await unzip(buf);
  const shared = [];
  const ss = files['xl/sharedStrings.xml'];
  if (ss) {
    utf8(ss).replace(/<si>([\s\S]*?)<\/si>/g, function (_, si) {
      const texts = [];
      si.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, function (_2, t) { texts.push(core.xmlUnescape(t)); return ''; });
      shared.push(texts.join(''));
      return '';
    });
  }
  const sheetNames = Object.keys(files).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
  const rows = [];
  sheetNames.sort().forEach(function (name) {
    const s = utf8(files[name]);
    s.replace(/<row[^>]*>([\s\S]*?)<\/row>/g, function (_, rowXml) {
      const cells = [];
      rowXml.replace(/<c([^>]*)>([\s\S]*?)<\/c>/g, function (_2, attrs, body) {
        const refMatch = attrs.match(/r="([A-Z]+\d+)"/);
        const col = refMatch ? core.colToIndex(refMatch[1]) : cells.length;
        const isShared = /t="s"/.test(attrs);
        const isInline = /t="(inlineStr|str)"/.test(attrs);
        let val = '';
        if (isShared) {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          val = shared[Number(v)] !== undefined ? shared[Number(v)] : '';
        } else if (isInline) {
          const texts = [];
          body.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, function (_3, t) { texts.push(core.xmlUnescape(t)); return ''; });
          val = texts.join('');
        } else {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          val = v === undefined ? '' : core.xmlUnescape(v);
        }
        while (cells.length < col) cells.push('');
        cells[col] = String(val).trim();
        return '';
      });
      if (cells.some(function (c) { return c !== ''; })) rows.push(cells);
      return '';
    });
  });
  return rows;
}

/* ---------------- PDF（文本型，尽力解析） ---------------- */
function pdfDecodeString(raw) {
  if (raw[0] === 0xFE && raw[1] === 0xFF) {
    let out = '';
    for (let i = 2; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw[i] << 8) | raw[i + 1]);
    return out;
  }
  return latin1(raw);
}

async function parsePdf(buf) {
  const text = latin1(buf);
  const out = [];
  const re = /stream\r?\n?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    const comp = buf.subarray(start, end);
    const inflated = await inflateAny(comp);
    const data = inflated || comp; // 解压失败时按未压缩内容尽力处理
    const content = latin1(data);
    if (content.indexOf('Tj') < 0 && content.indexOf('TJ') < 0) { re.lastIndex = end; continue; }
    const pieces = [];
    const textRe = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|(T\*|\bTd\b|\bTD\b|'|")/g;
    let tm;
    while ((tm = textRe.exec(content)) !== null) {
      const raw = tm[0];
      if (tm[1]) { pieces.push('\n'); continue; }
      if (raw[0] === '(') {
        const inner = raw.slice(1, -1).replace(/\\([nrtbf()\\])/g, function (_, c) {
          return { n: '\n', r: '\r', t: '\t', b: '', f: '' }[c] !== undefined ? { n: '\n', r: '\r', t: '\t', b: '', f: '' }[c] : c;
        });
        pieces.push(inner);
      } else {
        const hex = raw.slice(1, -1).replace(/\s+/g, '');
        const bytes = [];
        for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
        pieces.push(pdfDecodeString(Uint8Array.from(bytes)));
      }
    }
    if (pieces.length) out.push(pieces.join('').replace(/\n{2,}/g, '\n'));
    re.lastIndex = end;
  }
  return out.join('\n');
}

/* ---------------- 统一入口（异步） ---------------- */
/**
 * 解析上传的文件（边缘版）
 * @param {string} name 文件名
 * @param {Buffer|Uint8Array} buffer 内容
 * @returns {Promise<object>} 与 Node 版 parseFile 的 result 同构
 */
async function parseFileEdge(name, buffer) {
  const ext = core.extOf(name);
  const result = {
    kind: ext || 'unknown', items: [], warnings: [], rawText: '', structured: false, ocr: false,
  };
  const finish = async function (raw, structuredRows) {
    result.rawText = String(raw || '').slice(0, 20000);
    if (structuredRows) {
      const t = core.parseTemplateRows(structuredRows);
      if (t && t.items.length) {
        result.items = t.items;
        result.dimensions = t.dimensions;
        result.structured = true;
        result.warnings = t.warnings;
        return result;
      }
      if (t) result.warnings = t.warnings;
    }
    const e = core.extractItems(raw);
    result.items = e.items;
    result.warnings = (result.warnings || []).concat(e.warnings);
    return result;
  };

  if (ext === 'docx') {
    try { return await finish(await parseDocx(buffer)); } catch (err) { result.warnings.push('Word 解析失败：' + err.message); return result; }
  }
  if (ext === 'xlsx') {
    try { return await finish('', await parseXlsx(buffer)); } catch (err) { result.warnings.push('Excel 解析失败：' + err.message); return result; }
  }
  if (ext === 'pdf') {
    try { return await finish(await parsePdf(buffer)); } catch (err) { result.warnings.push('PDF 解析失败：' + err.message); return result; }
  }
  if (ext === 'csv' || ext === 'txt' || ext === 'md' || ext === 'tsv') {
    const text = utf8(buffer);
    let rows = null;
    if (ext === 'csv' || ext === 'tsv') {
      rows = core.parseCsv(ext === 'tsv' ? text.replace(/\t/g, ',') : text);
    } else if (core.detectHeader(core.parseCsv(text))) {
      rows = core.parseCsv(text);
    }
    return finish(text, rows);
  }
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'heic' || ext === 'webp') {
    result.warnings.push('当前部署（Cloudflare Workers）暂不支持图片 OCR 识别。可以：① 使用「Excel/CSV 模板」录入后导入；② 直接在下方手工添加题目。');
    result.needManual = true;
    return result;
  }
  if (ext === 'doc') {
    result.warnings.push('不支持旧版 .doc 格式，请在 Word 中另存为 .docx 后重新上传。');
    return result;
  }
  if (ext === 'xls') {
    result.warnings.push('不支持旧版 .xls 格式，请在 Excel 中另存为 .xlsx 或 .csv 后重新上传。');
    return result;
  }
  result.warnings.push('不支持的文件类型（' + (ext || '未知') + '）。支持：.xlsx/.csv/.docx/.pdf/.txt。');
  return result;
}

module.exports = {
  parseFileEdge: parseFileEdge,
  unzip: unzip,
  parseDocx: parseDocx,
  parseXlsx: parseXlsx,
  parsePdf: parsePdf,
};
