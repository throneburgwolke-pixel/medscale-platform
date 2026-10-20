'use strict';
/**
 * 量表导入解析引擎 —— Node 运行时（零依赖）
 * 支持：Excel(.xlsx)、Word(.docx)、PDF（文本型，尽力解析）、CSV/TXT、图片（macOS 原生 OCR，失败则返回 null）
 * 解析结果统一为：{ items:[{text,type,options:[{label,value}], required}], warnings:[], text }
 *
 * 纯逻辑（CSV/表头/启发式抽题等）已抽取到 lib/parse-core.js（与 Workers 边缘版共享）；
 * 本文件只保留 Node 专属能力：node:zlib 解压 与 macOS Vision OCR。
 */
const zlib = require('node:zlib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const core = require('./parse-core.js');
const xmlUnescape = core.xmlUnescape;
const colToIndex = core.colToIndex;
const extractItems = core.extractItems;
const parseCsv = core.parseCsv;
const detectHeader = core.detectHeader;
const extOf = core.extOf;

/* ================= ZIP（docx/xlsx 内部结构） ================= */
function unzip(buf) {
  const files = {};
  let p = 0;
  while (p + 30 <= buf.length) {
    if (buf.readUInt32LE(p) !== 0x04034b50) {
      const next = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), p);
      if (next < 0) break;
      p = next;
      continue;
    }
    const method = buf.readUInt16LE(p + 8);
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const nameStart = p + 30;
    const name = buf.slice(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    if (compSize > 0) {
      const comp = buf.slice(dataStart, dataStart + compSize);
      try {
        files[name] = method === 0 ? comp : zlib.inflateRawSync(comp);
      } catch (e) { /* 跳过损坏项 */ }
      p = dataStart + compSize;
    } else {
      // 数据描述符模式：向后找下一个本地头
      const next = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), dataStart);
      if (next < 0) break;
      p = next;
    }
  }
  return files;
}

/* ================= Word (.docx) ================= */
function parseDocx(buf) {
  const files = unzip(buf);
  const xml = files['word/document.xml'];
  if (!xml) return '';
  const s = xml.toString('utf8');
  // 段落 → 一行；表格单元格 → 制表符分隔
  const paras = s.split(/<w:p[ >]/).map(function (chunk) {
    const texts = [];
    chunk.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, function (_, t) { texts.push(xmlUnescape(t)); return ''; });
    const tabs = chunk.match(/<w:tab\b/g);
    return texts.join('') + (tabs ? '\t' : '');
  });
  return paras.filter(function (l) { return l.trim() !== ''; }).join('\n');
}

/* ================= Excel (.xlsx) ================= */
function parseXlsx(buf) {
  const files = unzip(buf);
  const shared = [];
  const ss = files['xl/sharedStrings.xml'];
  if (ss) {
    ss.toString('utf8').replace(/<si>([\s\S]*?)<\/si>/g, function (_, si) {
      const texts = [];
      si.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, function (_2, t) { texts.push(xmlUnescape(t)); return ''; });
      shared.push(texts.join(''));
      return '';
    });
  }
  const sheetNames = Object.keys(files).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
  const rows = [];
  sheetNames.sort().forEach(function (name) {
    const s = files[name].toString('utf8');
    s.replace(/<row[^>]*>([\s\S]*?)<\/row>/g, function (_, rowXml) {
      const cells = [];
      rowXml.replace(/<c([^>]*)>([\s\S]*?)<\/c>/g, function (_2, attrs, body) {
        const refMatch = attrs.match(/r="([A-Z]+\d+)"/);
        const col = refMatch ? colToIndex(refMatch[1]) : cells.length;
        const isShared = /t="s"/.test(attrs);
        const isInline = /t="(inlineStr|str)"/.test(attrs);
        let val = '';
        if (isShared) {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          val = shared[Number(v)] !== undefined ? shared[Number(v)] : '';
        } else if (isInline) {
          const texts = [];
          body.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, function (_3, t) { texts.push(xmlUnescape(t)); return ''; });
          val = texts.join('');
        } else {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          val = v === undefined ? '' : xmlUnescape(v);
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

/* ================= PDF（文本型，尽力解析） ================= */
function pdfDecodeString(raw) {
  // 十六进制串（常为 UTF-16BE / CID）
  if (raw[0] === 0xFE && raw[1] === 0xFF) {
    let out = '';
    for (let i = 2; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw[i] << 8) | raw[i + 1]);
    return out;
  }
  return raw.toString('latin1');
}

function parsePdf(buf) {
  const out = [];
  const re = /stream\r?\n?/g;
  let m;
  while ((m = re.exec(buf.toString('latin1'))) !== null) {
    const start = m.index + m[0].length;
    const end = buf.indexOf(Buffer.from('endstream'), start);
    if (end < 0) break;
    let data = buf.slice(start, end);
    let inflated = null;
    try { inflated = zlib.inflateSync(data); } catch (e) {
      try { inflated = zlib.inflateRawSync(data); } catch (e2) { inflated = null; }
    }
    if (inflated) data = inflated; // 未压缩的内容流直接使用原始数据
    const content = data.toString('latin1');
    if (content.indexOf('Tj') < 0 && content.indexOf('TJ') < 0) { re.lastIndex = end; continue; }
    // 提取 (…) 与 <…> 文本片段；遇到换行类算子（T*、Td、TD、'、"）插入换行
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
        pieces.push(pdfDecodeString(Buffer.from(bytes)));
      }
    }
    if (pieces.length) out.push(pieces.join('').replace(/\n{2,}/g, '\n'));
    re.lastIndex = end;
  }
  return out.join('\n');
}

/* ================= 图片 OCR（macOS 原生 Vision，失败返回 null） ================= */
const OCR_JS = [
  "ObjC.import('Foundation');ObjC.import('Vision');",
  "var p=$.NSProcessInfo.processInfo.environment.objectForKey('MEDSCALE_IMG').js;",
  "var h=$.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath($(p)),$());",
  "var r=$.VNRecognizeTextRequest.alloc.init;r.recognitionLevel=0;r.recognitionLanguages=$(['zh-Hans','en-US']);r.usesLanguageCorrection=true;",
  "var e=Ref();if(h.performRequestsError($([r]),e)){var a=[],s=r.results;for(var i=0;i<s.count;i++){var c=s.objectAtIndex(i).topCandidates(1);if(c.count>0)a.push(c.objectAtIndex(i).string.js);}console.log(a.join('\\n'));}else{console.log('');}",
].join('');

/** 临时文件名带进程号与随机后缀：并发上传的两张图不会写进同一个文件互相覆盖 */
function ocrTempPath(ext) {
  return path.join(os.tmpdir(), 'medscale_ocr_' + Date.now() + '-' + process.pid + '-' +
    crypto.randomBytes(4).toString('hex') + '.' + (ext || 'png'));
}

function ocrImage(buffer, ext, cb) {
  const tmp = ocrTempPath(ext);
  try { fs.writeFileSync(tmp, buffer); } catch (e) { return cb(null); }
  const scriptPath = ocrTempPath('js');
  try { fs.writeFileSync(scriptPath, OCR_JS); } catch (e) { return cb(null); }
  const child = execFile('osascript', ['-l', 'JavaScript', scriptPath], {
    env: Object.assign({}, process.env, { MEDSCALE_IMG: tmp }),
    timeout: 25000,
    maxBuffer: 8 * 1024 * 1024,
  }, function (err, stdout) {
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
    const text = String(stdout || '').trim();
    if (err || !text) return cb(null);
    cb(text);
  });
  child.on('error', function () { cb(null); });
}

/* ================= 统一入口 ================= */
/**
 * 解析上传的文件
 * @param {string} name 文件名
 * @param {Buffer} buffer 内容
 * @param {function} cb cb(result)
 */
function parseFile(name, buffer, cb) {
  const ext = extOf(name);
  const result = {
    kind: ext || 'unknown', items: [], warnings: [], rawText: '', structured: false, ocr: false,
  };
  const finish = function (raw, structuredRows) {
    result.rawText = String(raw || '').slice(0, 20000);
    if (structuredRows) {
      const t = core.parseTemplateRows(structuredRows);
      if (t && t.items.length) {
        result.items = t.items;
        result.dimensions = t.dimensions;
        result.structured = true;
        result.warnings = t.warnings;
        return cb(result);
      }
      if (t) result.warnings = t.warnings;
    }
    const e = extractItems(raw);
    result.items = e.items;
    result.warnings = (result.warnings || []).concat(e.warnings);
    cb(result);
  };

  if (ext === 'docx') {
    try { return finish(parseDocx(buffer)); } catch (err) { result.warnings.push('Word 解析失败：' + err.message); return cb(result); }
  }
  if (ext === 'xlsx') {
    try { return finish('', parseXlsx(buffer)); } catch (err) { result.warnings.push('Excel 解析失败：' + err.message); return cb(result); }
  }
  if (ext === 'pdf') {
    try { return finish(parsePdf(buffer)); } catch (err) { result.warnings.push('PDF 解析失败：' + err.message); return cb(result); }
  }
  if (ext === 'csv' || ext === 'txt' || ext === 'md' || ext === 'tsv') {
    const text = buffer.toString('utf8');
    let rows = null;
    if (ext === 'csv' || ext === 'tsv') {
      rows = parseCsv(ext === 'tsv' ? text.replace(/\t/g, ',') : text);
    } else if (detectHeader(parseCsv(text))) {
      rows = parseCsv(text);
    }
    return finish(text, rows);
  }
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'heic' || ext === 'webp') {
    return ocrImage(buffer, ext === 'jpeg' ? 'jpg' : ext, function (text) {
      if (!text) {
        result.warnings.push('未能自动识别图片文字（本机 OCR 不可用或图片清晰度不足）。可以：① 使用「Excel/CSV 模板」录入后导入；② 直接在下方对照左侧图片手工添加题目。');
        result.needManual = true;
        return cb(result);
      }
      result.ocr = true;
      finish(text);
    });
  }
  if (ext === 'doc') {
    result.warnings.push('不支持旧版 .doc 格式，请在 Word 中另存为 .docx 后重新上传。');
    return cb(result);
  }
  if (ext === 'xls') {
    result.warnings.push('不支持旧版 .xls 格式，请在 Excel 中另存为 .xlsx 或 .csv 后重新上传。');
    return cb(result);
  }
  result.warnings.push('不支持的文件类型（' + (ext || '未知') + '）。支持：.xlsx/.csv/.docx/.pdf/.txt 与 .jpg/.png 图片。');
  return cb(result);
}

module.exports = {
  parseFile: parseFile,
  extractItems: extractItems,
  parseTemplateRows: core.parseTemplateRows,
  parseDocx: parseDocx,
  parseXlsx: parseXlsx,
  parsePdf: parsePdf,
  parseCsv: parseCsv,
  templateCsv: core.templateCsv,
  unzip: unzip,
  ocrTempPath: ocrTempPath,
};
