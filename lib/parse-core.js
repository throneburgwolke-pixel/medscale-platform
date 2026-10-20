'use strict';
/**
 * 量表导入解析 —— 共享核心（纯 JS，零 Node/Web 专属依赖）
 * 供两个运行时复用，避免两份逻辑漂移：
 *  - lib/parse.js      （Node 版：zlib 解压 + macOS OCR）
 *  - lib/parse-edge.js （Workers 版：DecompressionStream 解压，无 OCR）
 * 只放与「文件格式无关」的纯逻辑：XML 反转义、CSV 解析、表头识别、
 * 题目启发式抽取、Likert 选项集推断、选项分值提取、模板表格 → 条目。
 */

function xmlUnescape(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); })
    .replace(/&amp;/g, '&');
}

function colToIndex(ref) {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (let i = 0; i < m[1].length; i += 1) n = n * 26 + (m[1].charCodeAt(i) - 64);
  return n - 1;
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

/* ================= 杂项 ================= */
function extOf(name) {
  return String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) ? String(name).toLowerCase().match(/\.([a-z0-9]+)$/)[1] : '';
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
  xmlUnescape: xmlUnescape,
  colToIndex: colToIndex,
  findLikert: findLikert,
  splitOptions: splitOptions,
  extractValue: extractValue,
  extractItems: extractItems,
  parseCsv: parseCsv,
  detectHeader: detectHeader,
  mapType: mapType,
  parseTemplateRows: parseTemplateRows,
  extOf: extOf,
  templateCsv: templateCsv,
};
