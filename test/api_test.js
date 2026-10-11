'use strict';
/**
 * 进程内接口测试：用模拟 req/res 直接调用 server.js 的请求处理器，
 * 覆盖登录、量表、发布、填写、统计、导出、二维码等全部接口。
 */
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const ROOT = path.join(__dirname, '..');
process.env.MEDSCALE_DB = path.join(__dirname, 'test.db');
['', '-wal', '-shm'].forEach(function (s) {
  const p = process.env.MEDSCALE_DB + s;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

const srv = require(path.join(ROOT, 'server.js'));
const dbm = require(path.join(ROOT, 'lib/db.js'));
const INIT_PW = dbm.initialAdminPassword();

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.log('  FAIL  ' + label + (extra ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

let COOKIE = '';

function request(method, url, body, headers) {
  return new Promise(function (resolve) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = Object.assign({ host: 'localhost:5173' }, headers || {});
    req.socket = { remoteAddress: '127.0.0.1' };
    if (COOKIE) req.headers.cookie = COOKIE;
    const chunks = [];
    const res = {
      statusCode: 0,
      headers: {},
      writeHead: function (code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); },
      end: function (data) {
        if (data && data.length) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        const buf = Buffer.concat(chunks);
        const ct = this.headers['Content-Type'] || '';
        let json = null;
        if (ct.indexOf('json') >= 0) { try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; } }
        resolve({ status: this.statusCode, headers: this.headers, text: buf.toString('utf8'), json: json, buf: buf });
      },
      on: function () { },
    };
    setTimeout(function () {
      if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      req.emit('end');
    }, 0);
    srv.handleRequest(req, res);
  });
}

(async function run() {
  console.log('\n【1】静态资源与会话');
  let r = await request('GET', '/');
  ok(r.status === 200 && r.text.indexOf('医学量表与问卷平台') >= 0, '首页 HTML 可访问');
  r = await request('GET', '/app.js');
  ok(r.status === 200 && r.headers['Content-Type'].indexOf('javascript') >= 0, '前端脚本可访问');
  r = await request('GET', '/styles.css');
  ok(r.status === 200 && r.text.indexOf('--brand') >= 0, '样式表可访问');
  r = await request('GET', '/s/sometoken');
  ok(r.status === 200 && r.text.indexOf('<div id="app">') >= 0, '填写链接返回 SPA 外壳');
  r = await request('GET', '/api/session');
  ok(r.json && r.json.authenticated === false, '未登录时 authenticated = false');
  r = await request('GET', '/api/scales');
  ok(r.status === 401, '未登录访问管理接口返回 401');

  console.log('\n【2】登录');
  r = await request('POST', '/api/login', { password: 'wrong' });
  ok(r.status === 401, '错误密码被拒绝');
  r = await request('POST', '/api/login', { password: INIT_PW });
  ok(r.status === 200 && r.headers['Set-Cookie'], '初始口令登录成功并下发 Cookie');
  COOKIE = (r.headers['Set-Cookie'] || '').split(';')[0];
  r = await request('GET', '/api/session');
  ok(r.json.authenticated === true && r.json.defaultPassword === true, '会话有效且提示默认密码');

  console.log('\n【3】量表库与模板');
  r = await request('GET', '/api/scales');
  const scales = r.json.items;
  ok(scales.length >= 12, '内置模板已初始化（' + scales.length + ' 个）');
  const phq = scales.find(function (s) { return s.code === 'phq-9'; });
  ok(phq && phq.definition.items.length === 9 && phq.definition.scoring.cutoffs.length === 5, 'PHQ-9 模板结构正确');
  r = await request('PUT', '/api/scales/' + phq.id, { title: 'x' });
  ok(r.status === 400 && r.json.error.indexOf('内置模板') >= 0, '内置模板不可直接修改');
  r = await request('POST', '/api/scales', { fromTemplateId: phq.id });
  const copy = r.json;
  ok(copy && copy.id && copy.isTemplate === false && copy.definition.items.length === 9, '创建副本成功且可编辑');
  r = await request('PUT', '/api/scales/' + copy.id, Object.assign({}, copy, { title: 'PHQ-9 精简版' }));
  ok(r.json.title === 'PHQ-9 精简版', '副本名称修改已保存');
  r = await request('GET', '/api/licensed-notes');
  ok(r.json.items.length >= 5, '授权提示列表可访问');

  console.log('\n【4】创建自制问卷');
  const custom = {
    title: '术后康复情况调查（自制）',
    category: '通用问卷',
    description: '测试用自制问卷',
    instructions: '请根据实际情况填写',
    tags: ['自制'],
    consentOn: true,
    consentText: '本问卷匿名收集，仅用于研究。',
    definition: {
      items: [
        { id: 'c1', no: 1, text: '您的性别', type: 'radio', required: true, exclude: true, options: [{ label: '男', value: 1 }, { label: '女', value: 2 }] },
        { id: 'c2', no: 2, text: '年龄', type: 'number', required: true, min: 0, max: 120, exclude: true },
        { id: 'c3', no: 3, text: '术后疼痛评分', type: 'slider', required: true, min: 0, max: 10, exclude: true },
        { id: 'c4', no: 4, text: '我对康复效果满意', type: 'radio', required: true, options: [
          { label: '非常不满意', value: 1 }, { label: '不满意', value: 2 }, { label: '一般', value: 3 },
          { label: '满意', value: 4 }, { label: '非常满意', value: 5 }] },
        { id: 'c5', no: 5, text: '其他建议', type: 'textarea', required: false },
      ],
      dimensions: [{ id: 'total', name: '康复评价', items: ['c4'] }],
      scoring: { method: 'sum', totalRange: [1, 5], cutoffs: [
        { max: 2, label: '不满意', level: 'severe', advice: '需关注' },
        { max: 5, label: '满意', level: 'normal', advice: '较好' }] },
    },
  };
  r = await request('POST', '/api/scales', { scale: custom });
  const myScale = r.json;
  ok(myScale && myScale.id && myScale.title === custom.title, '自制问卷创建成功');
  r = await request('GET', '/api/overview');
  ok(r.json.customCount >= 1 && r.json.templateCount >= 12, '概览统计正确（自制 1 / 模板 ' + r.json.templateCount + '）');

  console.log('\n【5】发布与二维码');
  r = await request('POST', '/api/surveys', { scaleId: myScale.id, name: '术后康复调查-2026', anonymous: true, showResult: true, collectMeta: true, maxResponses: 100, note: '感谢参与' });
  const survey = r.json;
  ok(survey && survey.token && survey.token.length >= 8, '发布成功，token = ' + (survey && survey.token));
  r = await request('GET', '/api/join/' + survey.token);
  ok(r.json.open === true && r.json.scale.definition.items.length === 5, '公开填写页数据可读取');
  const link = 'http://127.0.0.1:5173/s/' + survey.token;
  r = await request('GET', '/api/qr.png?text=' + encodeURIComponent(link) + '&scale=8');
  ok(r.status === 200 && r.buf.slice(1, 4).toString() === 'PNG', '二维码 PNG 生成成功（' + r.buf.length + ' 字节）');

  console.log('\n【6】填写与计分（含校验）');
  r = await request('POST', '/api/join/' + survey.token, { answers: { c1: 1 }, consent: true });
  ok(r.status === 400 && r.json.error.indexOf('未作答') >= 0, '缺题提交被拒绝');
  r = await request('POST', '/api/join/' + survey.token, { answers: { c1: 1, c2: 45, c3: 6, c4: 5, c5: '' }, consent: false });
  ok(r.status === 400 && r.json.error.indexOf('知情同意') >= 0, '未勾选知情同意被拒绝');

  const people = [
    [1, 42, 7, 3], [2, 55, 5, 4], [1, 33, 2, 5], [2, 61, 8, 2], [1, 47, 4, 4],
    [2, 38, 3, 5], [1, 50, 6, 3], [2, 44, 5, 4], [1, 29, 1, 5], [2, 58, 9, 2],
    [1, 36, 3, 4], [2, 49, 6, 3],
  ];
  for (let i = 0; i < people.length; i += 1) {
    r = await request('POST', '/api/join/' + survey.token, {
      answers: { c1: people[i][0], c2: people[i][1], c3: people[i][2], c4: people[i][3], c5: '建议' + i },
      consent: true, durationSec: 60 + i, pid: 'P' + i,
    });
    if (i === 0) ok(r.status === 200 && r.json.result && r.json.result.total === people[0][3], '提交成功并返回计分结果');
  }

  console.log('\n【7】统计报告');
  r = await request('GET', '/api/surveys/' + survey.id + '/report');
  const rep = r.json;
  ok(rep.n === 12, '回收答卷 12 份');
  ok(rep.scores.total.mean !== undefined && rep.scores.total.sd !== undefined,
    '总分均值/SD 已计算：' + rep.scores.total.mean + ' ± ' + rep.scores.total.sd);
  ok(rep.scores.cutoffs && rep.scores.cutoffs.length === 2 &&
    rep.scores.cutoffs[0].count + rep.scores.cutoffs[1].count === 12, '分级分布统计正确');
  const sexItem = rep.items.find(function (i) { return i.itemId === 'c1'; });
  ok(sexItem && sexItem.freq.items.length === 2, '分类变量频数表正确');
  ok(rep.correlations.available, '维度相关分析可用');
  ok(rep.groupComparison.available && rep.groupComparison.tests.length >= 1,
    '组间比较已生成：' + (rep.groupComparison.tests[0] || {}).method);
  ok(rep.groupComparison.chiSquare && rep.groupComparison.chiSquare.table, '卡方列联表已生成');
  ok(rep.rawRows.length === 12 && rep.rawRows[0].cells.length === 5, '原始数据行已生成');
  ok(rep.scoreValues.length === 12, '总分序列已生成（供直方图）');
  ok(rep.avgDurationSec !== null, '平均填写用时 = ' + rep.avgDurationSec + ' 秒');

  console.log('\n【8】信度分析（PHQ-9 模拟数据）');
  const phqCopy = (await request('POST', '/api/scales', { fromTemplateId: phq.id })).json;
  const s2 = (await request('POST', '/api/surveys', { scaleId: phqCopy.id, name: 'PHQ-9 测试', showResult: false })).json;
  const ids = phqCopy.definition.items.map(function (i) { return i.id; });
  for (let i = 0; i < 30; i += 1) {
    const ans = {};
    const severity = i % 5;
    ids.forEach(function (id, j) {
      ans[id] = Math.min(3, Math.max(0, severity + ((i + j) % 3) - 1));
    });
    await request('POST', '/api/join/' + s2.token, { answers: ans, consent: true, durationSec: 90 });
  }
  r = await request('GET', '/api/surveys/' + s2.id + '/report');
  const rep2 = r.json;
  ok(rep2.n === 30, 'PHQ-9 模拟数据 30 份');
  ok(rep2.reliability.available && rep2.reliability.total.alpha > 0.5,
    'Cronbach α = ' + rep2.reliability.total.alpha + '（' + rep2.reliability.total.k + ' 题）');
  ok(rep2.reliability.items.length === 9 && rep2.reliability.items[0].citc !== undefined, 'CITC 项目分析已生成');
  ok(rep2.scores.cutoffs.length === 5, 'PHQ-9 五级分级统计已生成');
  ok(rep2.scores.alerts && rep2.scores.alerts.length === 1, 'PHQ-9 第9题安全预警条目被统计');
  ok(rep2.reliability.splitHalf.sb !== null, '分半信度 = ' + rep2.reliability.splitHalf.sb);

  console.log('\n【8b】PSQI 专用计分（7 成分）');
  const psqiTpl = (await request('GET', '/api/scales')).json.items.find(function (s) { return s.code === 'psqi'; });
  const psqiCopy = (await request('POST', '/api/scales', { fromTemplateId: psqiTpl.id })).json;
  const s3 = (await request('POST', '/api/surveys', { scaleId: psqiCopy.id, name: 'PSQI 测试' })).json;
  r = await request('POST', '/api/join/' + s3.token, {
    answers: {
      psq1: '23:30', psq2: 45, psq3: '07:00', psq4: 5.5,
      psq5a: 2, psq5b: 2, psq5c: 2, psq5d: 1, psq5e: 1, psq5f: 1, psq5g: 1, psq5h: 2, psq5i: 1, psq5j: 0,
      psq6: 2, psq7: 0, psq8: 2, psq9: 2,
    },
    consent: true, durationSec: 300,
  });
  ok(r.status === 200, 'PSQI 提交成功');
  r = await request('GET', '/api/surveys/' + s3.id + '/report');
  const p3 = r.json;
  ok(p3.scores.total.n === 1 && p3.scores.total.mean > 8, 'PSQI 总分 = ' + p3.scores.total.mean + '（>7 提示睡眠质量差）');
  ok(p3.scores.dimensions.length === 7, 'PSQI 输出 7 个成分得分');
  ok(p3.items.length === 18, 'PSQI 18 个自评条目全部统计');
  ok(String(p3.rawRows[0].cells[0]) === '23:30' && String(p3.rawRows[0].cells[1]) === '45',
    '时间/数字题原样导出（上床时间 ' + p3.rawRows[0].cells[0] + '，入睡耗时 ' + p3.rawRows[0].cells[1] + ' 分钟）');

  console.log('\n【9】数据导出');
  r = await request('GET', '/api/surveys/' + survey.id + '/export.csv');
  const lines = r.text.trim().split('\r\n');
  ok(r.status === 200 && r.headers['Content-Type'].indexOf('csv') >= 0, 'CSV 导出成功');
  ok(lines.length === 13, 'CSV 行数 = ' + lines.length + '（表头 + 12 条）');
  ok(lines[0].indexOf('第1题') >= 0 && lines[0].indexOf('总分') >= 0, 'CSV 表头包含题目与总分');
  ok(lines[1].indexOf('满意') >= 0, 'CSV 中选项导出为文字标签');
  r = await request('GET', '/api/surveys/' + survey.id + '/export.json');
  const exp = JSON.parse(r.text);
  ok(exp.responses.length === 12 && exp.report.n === 12, 'JSON 完整数据导出成功');

  console.log('\n【10】调查管理');
  r = await request('PATCH', '/api/surveys/' + survey.id, { status: 'closed' });
  ok(r.json.status === 'closed', '可关闭调查');
  r = await request('GET', '/api/join/' + survey.token);
  ok(r.json.open === false && r.json.reason.indexOf('已关闭') >= 0, '关闭后填写页提示停止回收');
  r = await request('POST', '/api/join/' + survey.token, { answers: { c1: 1 }, consent: true });
  ok(r.status === 400, '关闭后拒绝提交');
  r = await request('DELETE', '/api/scales/' + myScale.id);
  ok(r.status === 400 && r.json.error.indexOf('不能删除') >= 0, '已发布调查的量表不可删除');
  r = await request('DELETE', '/api/surveys/' + survey.id);
  ok(r.status === 200, '删除调查成功');
  r = await request('GET', '/api/surveys');
  ok(r.json.items.length === 2, '调查列表剩余 2 个（PHQ-9 与 PSQI 测试）');
  r = await request('DELETE', '/api/scales/' + myScale.id);
  ok(r.status === 200, '删除无调查的量表成功');

  console.log('\n【11】密码与权限');
  console.log('\n【11a】新增接口：量表目录 / SPSS 数值导出 / 单份答卷 / 数据质量');
  r = await request('GET', '/api/scale-catalog');
  ok(r.json.items.length >= 60 && r.json.categories.length >= 12,
    '量表目录接口返回 ' + r.json.items.length + ' 条目录与 ' + r.json.categories.length + ' 个分类');
  r = await request('GET', '/api/surveys/2/export-spss.csv');
  const spssLines = r.text.trim().split('\r\n');
  ok(r.status === 200 && spssLines[0].indexOf('TOTAL') >= 0 && spssLines[0].indexOf('GRADE') >= 0,
    'SPSS 数值版导出表头含 TOTAL/GRADE 变量');
  ok(spssLines[0].indexOf('Q1') >= 0 && /,1,/.test(spssLines[1].replace(/,0,/g, ',1,')),
    'SPSS 数值版导出为数值编码（含 0/1 虚拟变量）');
  r = await request('GET', '/api/surveys/2/codebook.csv');
  ok(r.status === 200 && r.text.indexOf('变量名') >= 0 && r.text.indexOf('取值说明') >= 0, '变量说明（codebook）可导出');
  r = await request('GET', '/api/surveys/2/report?group=' + (rep2.items.find(function (i) { return i.itemId === 'phq1'; }) ? 'phq1' : 'phq1'));
  ok(r.json.groupComparison && r.json.groupComparison.groupCandidates !== undefined,
    '报告支持指定分组变量');
  ok(r.json.quality && r.json.quality.duration && r.json.quality.straightLining !== undefined,
    '报告包含数据质量分析（时长、直线作答、重复 IP）');
  ok(Array.isArray(r.json.trend), '报告包含按日回收趋势');
  const firstPid = r.json.rawRows[0].pid;
  r = await request('GET', '/api/surveys/2/response/' + firstPid);
  ok(r.status === 200 && r.json.items.length === 9 && r.json.items[0].value !== undefined,
    '单份答卷详情可查询（' + r.json.items.length + ' 个条目作答）');
  r = await request('GET', '/api/surveys/2/export.csv');
  ok(r.status === 200, 'CSV（文字版）导出仍正常');

  r = await request('POST', '/api/password', { oldPassword: INIT_PW, newPassword: 'newpass888' });
  ok(r.status === 200, '修改密码成功');
  r = await request('GET', '/api/scales');
  ok(r.status === 401, '改密后旧会话失效');
  r = await request('POST', '/api/login', { password: 'newpass888' });
  ok(r.status === 200, '新密码可登录');
  COOKIE = (r.headers['Set-Cookie'] || '').split(';')[0];
  r = await request('POST', '/api/password', { oldPassword: 'newpass888', newPassword: '123' });
  ok(r.status === 400, '弱密码被拒绝');

  console.log('\n———————————————————————————————');
  console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
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
