'use strict';
/**
 * 量表导入测试：Word(.docx) / Excel(.xlsx) / CSV 模板 / 纯文本 / PDF 文本流
 * 并验证「导入 → 入量表库 → 发布调查 → 填写 → 统计」全链路可用
 */
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');

const ROOT = path.join(__dirname, '..');
process.env.MEDSCALE_DB = path.join(__dirname, 'import.db');
['', '-wal', '-shm'].forEach(function (s) {
  const p = process.env.MEDSCALE_DB + s;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});
const importer = require(path.join(ROOT, 'lib', 'parse.js'));
const srv = require(path.join(ROOT, 'server.js'));
const INIT_PW = require(path.join(ROOT, 'lib/db.js')).initialAdminPassword();

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
}

/* ---------- 构造测试用 Office 文件（store 方式打包 ZIP） ---------- */
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  Object.keys(files).forEach(function (name) {
    const data = Buffer.from(files[name], 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    locals.push(local, data);
    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);
    offset += local.length + data.length;
  });
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([centralBuf, end]));
}

function makeDocx(lines) {
  const paras = lines.map(function (l) {
    return '<w:p><w:r><w:t xml:space="preserve">' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</w:t></w:r></w:p>';
  }).join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras + '</w:body></w:document>',
  });
}

function makeXlsx(rows) {
  const shared = [];
  const sharedIdx = {};
  const cell = function (ref, val, isNum) {
    if (val === '' || val === undefined) return '';
    if (isNum) return '<c r="' + ref + '"><v>' + val + '</v></c>';
    const key = String(val);
    if (sharedIdx[key] === undefined) { sharedIdx[key] = shared.length; shared.push(key); }
    return '<c r="' + ref + '" t="s"><v>' + sharedIdx[key] + '</v></c>';
  };
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const sheetRows = rows.map(function (r, i) {
    return '<row r="' + (i + 1) + '">' + r.map(function (v, j) {
      return cell(letters[j] + (i + 1), v, typeof v === 'number');
    }).join('') + '</row>';
  }).join('');
  const sharedXml = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">' +
    shared.map(function (s) { return '<si><t xml:space="preserve">' + s.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></si>'; }).join('') + '</sst>';
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/sharedStrings.xml': sharedXml,
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows + '</sheetData></worksheet>',
  });
}

/** 构造一个含文本流的极简 PDF（用于验证文本提取，不依赖真实 PDF 生成器） */
function makePdf(lines) {
  const content = lines.map(function (l) {
    let hex = 'FEFF';
    for (const ch of String(l)) {
      const cp = ch.codePointAt(0);
      if (cp <= 0xFFFF) hex += cp.toString(16).padStart(4, '0').toUpperCase();
      else { const v = cp - 0x10000; hex += (0xD800 + (v >> 10)).toString(16).padStart(4, '0').toUpperCase() + (0xDC00 + (v & 0x3FF)).toString(16).padStart(4, '0').toUpperCase(); }
    }
    return '<' + hex + '> Tj T*';
  }).join('\n');
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n', 'latin1'),
    Buffer.from('4 0 obj<</Length ' + content.length + '>>stream\n' + content + '\nendstream endobj\n', 'latin1'),
    Buffer.from('trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1'),
  ]);
}

const DOCX_LINES = [
  '睡眠与情绪调查问卷',
  '指导语：请根据您最近两周的实际情况作答，每题只选一项。',
  '1. 您入睡困难的程度',
  'A. 无  B. 轻度  C. 中度  D. 重度',
  '2. 您是否使用催眠药物才能入睡',
  'A. 从不（0）  B. 每周少于1次（1）  C. 每周1-2次（2）  D. 每周3次以上（3）',
  '3. 您对目前的睡眠质量满意吗',
  'A. 非常满意  B. 满意  C. 一般  D. 不满意  E. 非常不满意',
  '4. 您通常需要多长时间入睡（分钟）',
];

let COOKIE = '';
function request(method, url, body) {
  return new Promise(function (resolve) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:5173' };
    req.socket = { remoteAddress: '127.0.0.1' };
    if (COOKIE) req.headers.cookie = COOKIE;
    const chunks = [];
    const res = {
      statusCode: 0, headers: {},
      writeHead: function (c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); },
      end: function (d) {
        if (d && d.length) chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d)));
        const buf = Buffer.concat(chunks);
        const sc = this.headers['Set-Cookie'];
        if (sc) COOKIE = sc.split(';')[0];
        let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; }
        resolve({ status: this.statusCode, text: buf.toString('utf8'), json: json, headers: this.headers });
      },
      on: function () { },
    };
    setTimeout(function () {
      if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    }, 0);
    srv.handleRequest(req, res);
  });
}

function parseVia(name, buf, cb) {
  importer.parseFile(name, buf, cb);
}

(async function run() {
  console.log('\n【1】Word（.docx）识别');
  parseVia('睡眠问卷.docx', makeDocx(DOCX_LINES), function (r) {
    global.__docx = r;
  });
  await new Promise(function (res) { setTimeout(res, 30); });
  const d = global.__docx;
  ok(d.kind === 'docx' && d.items.length === 4, '识别出 4 道题', d && d.items.length);
  ok(d.items[0].text.indexOf('入睡困难的程度') >= 0, '第 1 题题干正确：' + (d.items[0] || {}).text);
  ok(d.items[0].type === 'radio' && d.items[0].options.length === 4, '第 1 题识别为单选且 4 个选项');
  ok(d.items[0].options[2].label === '中度', '选项文字正确（第3项=中度）');
  ok(d.items[1].options[0].value === 0 && d.items[1].options[3].value === 3,
    '选项分值从括号中提取（0/1/2/3）', d.items[1].options.map(function (o) { return o.value; }));
  ok(d.items[2].options.length === 5, '第 3 题 5 个选项');
  ok(d.items[3].type === 'text' || d.items[3].type === 'number', '第 4 题按填空/数字处理（' + d.items[3].type + '）');

  console.log('\n【2】Excel（.xlsx）模板识别');
  const XLSX_ROWS = [
    ['题号', '题干', '题型', '选项1', '分值1', '选项2', '分值2', '选项3', '分值3', '维度', '必答', '反向计分'],
    ['1', '近两周感到紧张、焦虑或急躁', '单选', '完全不会', 0, '好几天', 1, '几乎每天', 3, '焦虑', '是', '否'],
    ['2', '我感到心情平静', '单选', '完全不会', 0, '好几天', 1, '几乎每天', 3, '焦虑', '是', '是'],
    ['3', '每周运动次数', '数字', '', '', '', '', '', '', '生活方式', '是', '否'],
    ['4', '其他补充说明', '填空', '', '', '', '', '', '', '', '否', '否'],
  ];
  parseVia('量表.xlsx', makeXlsx(XLSX_ROWS), function (r) { global.__xlsx = r; });
  await new Promise(function (res) { setTimeout(res, 30); });
  const x = global.__xlsx;
  ok(x.kind === 'xlsx' && x.structured && x.items.length === 4, '识别为结构化模板并导入 4 题');
  ok(x.items[0].options.map(function (o) { return o.value; }).join(',') === '0,1,3', '分值列正确解析');
  ok(x.items[1].reverse === true, '反向计分列被识别');
  ok(x.items[3].required === false, '必答列"否"被识别为选填');
  ok(x.dimensions.length === 2 && x.dimensions[0].name === '焦虑', '维度列被识别（' + x.dimensions.map(function (dd) { return dd.name; }).join('/') + '）');
  ok(x.items[2].type === 'number', '数字题型识别正确');

  console.log('\n【3】CSV / 模板 / PDF / 图片降级');
  const csv = importer.templateCsv();
  ok(csv.indexOf('题干') >= 0 && csv.indexOf('选项1') >= 0, '导入模板 CSV 可生成（含表头）');
  parseVia('模板.csv', Buffer.from(csv, 'utf8'), function (r) { global.__csv = r; });
  await new Promise(function (res) { setTimeout(res, 30); });
  ok(global.__csv.items.length === 4 && global.__csv.structured, '下载的模板可直接回传导入（4 题）', global.__csv.items.length);
  parseVia('报告.pdf', makePdf(DOCX_LINES), function (r) { global.__pdf = r; });
  await new Promise(function (res) { setTimeout(res, 30); });
  ok(global.__pdf.kind === 'pdf' && global.__pdf.items.length >= 3,
    'PDF 文本型文件可识别出题目（' + global.__pdf.items.length + ' 题）');
  parseVia('扫描件.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), function (r) { global.__png = r; });
  await new Promise(function (res) { setTimeout(res, 800); });
  ok(global.__png.kind === 'png' && (global.__png.needManual || global.__png.items.length > 0),
    '图片：OCR 不可用时给出人工录入指引（不报错）');
  parseVia('旧文件.xls', Buffer.from('x'), function (r) { global.__xls = r; });
  await new Promise(function (res) { setTimeout(res, 20); });
  ok(global.__xls.warnings.join('').indexOf('另存为') >= 0, '旧版 .xls 给出明确转换提示');

  console.log('\n【4】导入接口与全链路（导入 → 入库 → 发布 → 填写 → 统计）');
  await request('POST', '/api/login', { password: INIT_PW });
  let r = await request('GET', '/api/import-template.csv');
  ok(r.status === 200 && r.text.indexOf('题干') >= 0, '模板下载接口可用');
  r = await request('POST', '/api/import/parse', {
    filename: '睡眠问卷.docx',
    data: makeDocx(DOCX_LINES).toString('base64'),
  });
  ok(r.status === 200 && r.json.items.length === 4, '上传接口返回识别结果（' + (r.json.items || []).length + ' 题）');
  const parsed = r.json;
  // 用识别结果创建量表（模拟前端校对后保存）
  const scale = {
    title: '睡眠与情绪调查问卷（导入）',
    category: '睡眠',
    description: '由 Word 文档自动识别导入',
    instructions: '请根据最近两周的实际情况作答',
    tags: ['导入'],
    definition: {
      items: parsed.items.map(function (it, i) {
        return Object.assign({}, it, { id: 'q' + (i + 1), no: i + 1 });
      }),
      dimensions: [],
      scoring: {
        method: 'sum',
        totalRange: [0, 12],
        cutoffs: [{ max: 4, label: '睡眠良好', level: 'normal', advice: '注意保持' }, { max: 12, label: '睡眠问题', level: 'moderate', advice: '建议睡眠门诊评估' }],
      },
    },
  };
  r = await request('POST', '/api/scales', { scale: scale });
  const created = r.json;
  ok(created && created.id && created.definition.items.length === 4, '导入结果可直接保存进量表库');
  r = await request('GET', '/api/scales');
  const inLib = r.json.items.find(function (s) { return s.id === created.id; });
  ok(!!inLib && inLib.isTemplate === false && inLib.category === '睡眠', '量表库中可见（我的问卷）');
  r = await request('POST', '/api/surveys', { scaleId: created.id, name: '导入问卷测试', showResult: true });
  const survey = r.json;
  ok(!!survey.token, '导入的量表可发布为调查');
  const answers = {
    q1: parsed.items[0].options[2].value,
    q2: parsed.items[1].options[1].value,
    q3: parsed.items[2].options[0].value,
    q4: '20',
  };
  const scored = parsed.items.filter(function (it) { return ['radio','select','number','slider'].indexOf(it.type) >= 0 && !it.exclude; });
  const expectTotal = scored.reduce(function (a, it) { return a + Number(answers['q' + it.no]); }, 0);
  r = await request('POST', '/api/join/' + survey.token, { answers: answers, consent: true, durationSec: 120 });
  ok(r.status === 200 && r.json.result.total === expectTotal,
    '可正常填写并自动计分（总分=' + expectTotal + '）', r.json.result);
  r = await request('GET', '/api/surveys/' + survey.id + '/report');
  ok(r.json.n === 1 && r.json.scores.total.mean === expectTotal, '统计功能与内置量表完全一致');
  r = await request('GET', '/api/surveys/' + survey.id + '/export-spss.csv');
  ok(r.status === 200, '导入的量表同样支持 SPSS 数值导出');

  console.log('\n———————————————————————————————');
  console.log('  导入功能测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('———————————————————————————————\n');
  ['', '-wal', '-shm'].forEach(function (s) {
    const p = process.env.MEDSCALE_DB + s;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  process.exit(fail ? 1 : 0);
}()).catch(function (e) {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
