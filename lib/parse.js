'use strict';
/**
 * 量表导入解析引擎（零依赖）
 * 支持：Excel(.xlsx)、Word(.docx)、PDF（文本型，尽力解析）、CSV/TXT、图片（macOS 原生 OCR，失败则返回 null）
 * 解析结果统一为：{ items:[{text,type,options:[{label,value}], required}], warnings:[], text }
 */
const zlib = require('node:zlib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

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

function xmlUnescape(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); })
    .replace(/&amp;/g, '&');
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
function colToIndex(ref) {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (let i = 0; i < m[1].length; i += 1) n = n * 26 + (m[1].charCodeAt(i) - 64);
  return n - 1;
}

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

/* ================= 文本 → 条目（启发式识别） ================= */
const LIKERT_SETS = [
  { key: ['完全不同意', '不同意', '一般', '同意', '非常同意'], values: [1, 2, 3, 4, 5] },
  { key: ['非常不同意', '比较不同意', '一般', '比较同意', '非常同意'], values: [1, 2, 3, 4, 5] },
  { key: ['完全不符合', '比较不符合', '不确定', '比较符合', '完全符合'], values: [1, 2, 3, 4, 5] },
  { key: ['从不', '偶尔', '有时', '经常', '总是'], values: [0, 1, 2, 3, 4] },
  { key: ['从来没有', '很少', '有时', '经常', '总是'], values: [0, 1, 2, 3, 4] },
  { key: ['完全没有', '有一点', '中等', '比较多', '非常多'], values: [0, 1, 2, 3, 4] },
  { key: ['完全不会', '好几天', '一半以上的天数', '几乎每天'], values: [0, 1, 2, 3] },
  { key: ['无', '轻度', '中度', '重度'], values: [0, 1, 2, 3] },
  { key: ['没有', '有时', '经常'], values: [0, 1, 2] },
  { key: ['是', '否'], values: [1, 0] },
  { key: ['从不', '很少', '有时', '经常'], values: [0, 1, 2, 3] },
];

function findLikert(text) {
  const t = String(text).replace(/\s+/g, '');
  let best = null;
  LIKERT_SETS.forEach(function (set) {
    const hit = set.key.filter(function (k) { return t.indexOf(k.replace(/\s/g, '')) >= 0; }).length;
    if (hit >= Math.min(3, set.key.length) || (set.key.length === 2 && hit === 2)) {
      if (!best || hit > best.hit) best = { hit: hit, set: set };
    }
  });
  return best ? best.set : null;
}

/** 拆分选项：支持 A. / A、/ ① / (1) / 1) / 多空格 / Tab */
function splitOptions(line) {
  const patterns = [
    /(?:^|[\s，,;；])([A-Ha-h])\s*[.、．)）]\s*/g,
    /([①②③④⑤⑥⑦⑧⑨⑩])\s*/g,
    /(?:^|\s)[（(](\d{1,2})[)）]\s*/g,
    /(?:^|\s)(\d{1,2})\s*[.、．)）]\s+/g,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const re = patterns[i];
    re.lastIndex = 0;
    const parts = [];
    let m;
    let last = null;
    while ((m = re.exec(line)) !== null) {
      if (last !== null) parts.push(line.slice(last, m.index).trim());
      last = m.index + m[0].length;
    }
    if (last !== null) {
      parts.push(line.slice(last).trim());
      const clean = parts.filter(function (s) { return s !== ''; });
      if (clean.length >= 2) return clean;
    }
  }
  if (/\t/.test(line)) {
    const parts = line.split(/\t+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  if (/\s{2,}/.test(line)) {
    const parts = line.split(/\s{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  return null;
}

/** 从选项文字中提取分值：(0) （2分） -1 【2】 */
function extractValue(label, fallback) {
  const m = String(label).match(/[（(【[]\s*(-?\d+(?:\.\d+)?)\s*分?\s*[)）】\]]\s*$/);
  if (m) return { label: String(label).replace(m[0], '').trim(), value: Number(m[1]) };
  const m2 = String(label).match(/[-—]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m2) return { label: String(label).replace(m2[0], '').trim(), value: Number(m2[1]) };
  return { label: String(label).trim(), value: fallback };
}

/**
 * 纯文本 → 条目列表
 */
function extractItems(rawText) {
  const warnings = [];
  const text = String(rawText || '').replace(/\r\n?/g, '\n').replace(/\u3000/g, ' ');
  let lines = text.split('\n').map(function (l) { return l.replace(/\s+$/, '').trim(); }).filter(function (l) { return l !== ''; });
  // 同一行里含多道题时进一步拆分
  const expanded = [];
  lines.forEach(function (l) {
    if (l.length > 400) { expanded.push(l); return; }
    const parts = l.split(/(?=(?:^|\s)\d{1,3}\s*[.、．)）]\s)/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length > 1) parts.forEach(function (p) { expanded.push(p); });
    else expanded.push(l);
  });
  lines = expanded;

  const items = [];
  let cur = null;
  const isItemStart = function (l) {
    return /^(\d{1,3})\s*[.、．)）]\s*\S/.test(l) || /^第\s*\d{1,3}\s*[题问]/.test(l) ||
      /^[（(]\s*\d{1,3}\s*[)）]\s*\S/.test(l) || /^\d{1,3}\s+[^\d\s]/.test(l);
  };
  const isInstruction = function (l) {
    if (/^(指导语|说明|填写说明|填表说明|注意事项|提示|备注|本问卷|本量表|以下问题|请根据|请阅读|请按|注释|评分方法|计分方法|编制|来源|参考文献)[:：]?/.test(l)) return true;
    if (l.length <= 60 && /(作答|填写|每题只选|仅选一项|根据您的实际情况)/.test(l)) return true;
    return false;
  };
  const stripNo = function (l) {
    return l.replace(/^第\s*\d{1,3}\s*[题问][:：.、]?\s*/, '')
      .replace(/^[（(]\s*\d{1,3}\s*[)）]\s*/, '')
      .replace(/^\d{1,3}\s*[.、．)）]\s*/, '')
      .replace(/^\d{1,3}\s+/, '');
  };

  const flush = function () {
    if (!cur) return;
    const o = splitOptions(cur.body);
    if (o && o.length >= 2) {
      const opts = o.map(function (label, i) { return extractValue(label, i); });
      // 过滤掉被误当选项的题干片段（长度过短或含"题"字样）
      cur.item.type = 'radio';
      cur.item.options = opts;
    } else {
      const lk = findLikert(cur.body + ' ' + cur.next.join(' '));
      if (lk) {
        cur.item.type = 'radio';
        cur.item.options = lk.key.map(function (k, i) { return { label: k, value: lk.values[i] }; });
        warnings.push('第 ' + (items.length + 1) + ' 题未显式列出选项，已按常见选项集「' + lk.key.join('/') + '」识别，请核对。');
      } else if (/^\s*[（(]?\s*\d+\s*[)）]?\s*$/.test(cur.body) || /分|评分|评分__|____/.test(cur.body)) {
        cur.item.type = 'number';
      } else {
        cur.item.type = 'text';
      }
    }
    items.push(cur.item);
    cur = null;
  };

  lines.forEach(function (l) {
    if (isItemStart(l)) {
      flush();
      cur = { item: { text: stripNo(l), type: 'text', required: true }, body: l, next: [] };
      return;
    }
    if (cur) {
      if (cur.next.length < 6) cur.next.push(l);
      const o = splitOptions(l);
      if (o && o.length >= 2) {
        cur.body += ' ' + l;
      } else if (!cur.item.options && cur.body.length < 300) {
        cur.body += ' ' + l;
      }
    } else {
      // 未找到题号前缀但整行像题目
      if (l.length > 3 && !isInstruction(l) && /[？?]$|是否|程度|频率|您|你/.test(l)) {
        cur = { item: { text: l, type: 'text', required: true }, body: l, next: [] };
      }
    }
  });
  flush();

  // 清理题干中的选项文字（题干 = 去掉选项部分）
  items.forEach(function (it) {
    if (it.options && it.options.length) {
      let stem = it.text;
      const firstOpt = it.options[0].label;
      const pos = stem.indexOf(firstOpt);
      if (pos > 0) stem = stem.slice(0, pos);
      it.text = stem.replace(/[.、．)）:：\s]+$/, '').trim();
    }
    it.text = it.text.replace(/\s{2,}/g, ' ').trim();
  });
  const valid = items.filter(function (it) { return it.text && it.text.length >= 2; });
  valid.forEach(function (it, i) { it.no = i + 1; });
  if (!valid.length) warnings.push('未能自动识别出题目，请检查文件内容，或使用「Excel/CSV 模板」录入后导入。');
  return { items: valid, warnings: warnings };
}

/* ================= CSV / 模板表格 ================= */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text).replace(/^\ufeff/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
}

/** 识别表头（支持平台导出的模板，也容忍自定义列名） */
function detectHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i += 1) {
    const r = (rows[i] || []).map(function (c) { return String(c || '').trim(); });
    const idx = {};
    r.forEach(function (c, j) {
      if (idx.text === undefined && /^(题干|题目|问题|量表条目|item|question|stem)/i.test(c)) idx.text = j;
      if (idx.type === undefined && /^(题型|类型|type)/i.test(c)) idx.type = j;
      if (idx.no === undefined && /^(题号|序号|编号|no\.?|index)/i.test(c)) idx.no = j;
      if (idx.dim === undefined && /^(维度|分量表|dimension|subscale)/i.test(c)) idx.dim = j;
      if (idx.req === undefined && /^(必答|是否必答|required)/i.test(c)) idx.req = j;
      if (idx.reverse === undefined && /^(反向计分|反向|reverse)/i.test(c)) idx.reverse = j;
      if (idx.options === undefined && /^(选项|选项列表|choices?|options?)$/i.test(c)) idx.options = j;
      const mo = c.match(/^选项\s*([0-9１-９]+)/);
      if (mo) idx['opt' + mo[1]] = j;
      const mv = c.match(/^(?:分值|得分|分数)\s*([0-9１-９]+)/);
      if (mv) idx['val' + mv[1]] = j;
    });
    if (idx.text !== undefined) return { rowIndex: i, idx: idx };
  }
  return null;
}

function mapType(raw, hasOptions) {
  const s = String(raw || '');
  if (/多选|checkbox|multiple/i.test(s)) return 'checkbox';
  if (/单选|radio|single|选择/i.test(s)) return 'radio';
  if (/下拉|select|dropdown/i.test(s)) return 'select';
  if (/滑块|slider|评分尺/i.test(s)) return 'slider';
  if (/数字|数值|number|amount/i.test(s)) return 'number';
  if (/多行|textarea|长文本/i.test(s)) return 'textarea';
  if (/时间|time/i.test(s)) return 'time';
  if (/日期|date/i.test(s)) return 'date';
  if (/填空|文本|text/i.test(s)) return 'text';
  return hasOptions ? 'radio' : 'text';
}

/** 表格（Excel/CSV 模板）→ 条目列表 */
function parseTemplateRows(rows) {
  const header = detectHeader(rows);
  if (!header) return null;
  const idx = header.idx;
  const items = [];
  const warnings = [];
  const dims = [];
  const dimIds = {};
  for (let i = header.rowIndex + 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const text = String(r[idx.text] === undefined ? '' : r[idx.text]).trim();
    if (!text) continue;
    const options = [];
    if (idx.options !== undefined) {
      String(r[idx.options] === undefined ? '' : r[idx.options] || '').split(/[|｜;；、]/).forEach(function (piece) {
        const s = String(piece).trim();
        if (!s) return;
        const p = extractValue(s, options.length);
        options.push({ label: p.label, value: Number.isFinite(p.value) ? p.value : options.length });
      });
    }
    for (let k = 1; k <= 12; k += 1) {
      const oc = idx['opt' + k];
      if (oc === undefined) continue;
      const raw = r[oc] === undefined ? '' : String(r[oc]).trim();
      if (!raw) continue;
      const vc = idx['val' + k];
      let val = options.length;
      if (vc !== undefined && r[vc] !== undefined && String(r[vc]).trim() !== '') {
        const n = Number(String(r[vc]).trim());
        if (Number.isFinite(n)) val = n;
      }
      const p = extractValue(raw, val);
      options.push({ label: p.label, value: Number.isFinite(p.value) ? p.value : val });
    }
    const item = {
      text: text,
      type: mapType(idx.type === undefined ? '' : r[idx.type], options.length > 0),
      required: true,
    };
    // 容错：手工编辑的表格若列数不足，可能把"维度/必答/计分"等值错当选项，这里做一次清洗
    if (options.length) {
      const junk = /^(是|否|yes|no|必答|选填|反向|反向计分|单选|多选|填空|数字)$/i;
      const dimNames = {};
      if (idx.dim !== undefined) dimNames[String(r[idx.dim] || '').trim()] = 1;
      const cleaned = options.filter(function (o) {
        const lb = String(o.label || '').trim();
        return lb && !junk.test(lb) && !dimNames[lb];
      });
      if (cleaned.length >= 2) item.options = cleaned;
      else delete item.options;
    }
    if (idx.req !== undefined && r[idx.req] !== undefined) {
      const rq = String(r[idx.req]).trim();
      if (/^(否|no|0|false|选填)$/i.test(rq)) item.required = false;
    }
    if (idx.reverse !== undefined && r[idx.reverse] !== undefined && /^(是|yes|1|true)$/i.test(String(r[idx.reverse]).trim())) {
      item.reverse = true;
    }
    if (item.options && !item.options.length) delete item.options;
    if (item.type === 'slider' && !options.length) { item.min = 0; item.max = 10; }
    if (idx.dim !== undefined && r[idx.dim] !== undefined && String(r[idx.dim]).trim()) {
      const dname = String(r[idx.dim]).trim();
      if (!dimIds[dname]) {
        dimIds[dname] = 'd' + (dims.length + 1);
        dims.push({ id: dimIds[dname], name: dname, items: [] });
      }
      item.dimension = dimIds[dname];
    }
    if (['radio', 'select', 'checkbox'].indexOf(item.type) >= 0 && !options.length) {
      item.type = 'text';
      warnings.push('第 ' + (items.length + 1) + ' 题未提供选项，已按填空处理。');
    }
    items.push(item);
  }
  items.forEach(function (it, i) { it.no = i + 1; });
  dims.forEach(function (d) {
    d.items = items.filter(function (it) { return it.dimension === d.id; }).map(function (it) { return 'q' + it.no; });
  });
  if (!items.length) warnings.push('表格中未找到题目数据行，请确认「题干」列已填写。');
  return { items: items, dimensions: dims, warnings: warnings, structured: true };
}

/* ================= 图片 OCR（macOS 原生 Vision，失败返回 null） ================= */
const OCR_JS = [
  "ObjC.import('Foundation');ObjC.import('Vision');",
  "var p=$.NSProcessInfo.processInfo.environment.objectForKey('MEDSCALE_IMG').js;",
  "var h=$.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath($(p)),$());",
  "var r=$.VNRecognizeTextRequest.alloc.init;r.recognitionLevel=0;r.recognitionLanguages=$(['zh-Hans','en-US']);r.usesLanguageCorrection=true;",
  "var e=Ref();if(h.performRequestsError($([r]),e)){var a=[],s=r.results;for(var i=0;i<s.count;i++){var c=s.objectAtIndex(i).topCandidates(1);if(c.count>0)a.push(c.objectAtIndex(0).string.js);}console.log(a.join('\\n'));}else{console.log('');}",
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
function extOf(name) {
  return String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) ? String(name).toLowerCase().match(/\.([a-z0-9]+)$/)[1] : '';
}

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
      const t = parseTemplateRows(structuredRows);
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

/** 供下载的导入模板（CSV） */
function templateCsv() {
  const rows = [
    ['题号', '题干', '题型', '选项1', '分值1', '选项2', '分值2', '选项3', '分值3', '选项4', '分值4', '选项5', '分值5', '维度', '必答', '反向计分'],
    ['1', '过去两周，您有多少时候感到心情低落？', '单选', '完全不会', '0', '好几天', '1', '一半以上的天数', '2', '几乎每天', '3', '', '', '抑郁症状', '是', '否'],
    ['2', '您对目前的睡眠质量满意吗？', '单选', '非常满意', '5', '满意', '4', '一般', '3', '不满意', '2', '非常不满意', '1', '睡眠', '是', '否'],
    ['3', '您每周运动几次？', '数字', '', '', '', '', '', '', '', '', '', '', '生活方式', '是', '否'],
    ['4', '其他建议', '填空', '', '', '', '', '', '', '', '', '', '', '', '否', '否'],
  ];
  const esc = function (v) {
    const s = String(v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + rows.map(function (r) { return r.map(esc).join(','); }).join('\r\n');
}

module.exports = {
  parseFile: parseFile,
  extractItems: extractItems,
  parseTemplateRows: parseTemplateRows,
  parseDocx: parseDocx,
  parseXlsx: parseXlsx,
  parsePdf: parsePdf,
  parseCsv: parseCsv,
  templateCsv: templateCsv,
  unzip: unzip,
  ocrTempPath: ocrTempPath,
};
