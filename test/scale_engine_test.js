'use strict';
/**
 * 量表引擎扩展：正文待填判定、kit 构造透传、授权分级与评估者标记持久化。
 */
const path = require('node:path');
const fs = require('node:fs');
const { makeCounter } = require('./helpers/http.js');
const t = makeCounter();
const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'lib', 'logic.js'));
const K = require(path.join(ROOT, 'lib', 'scale-kit.js'));

console.log('\n【1】待填判定按内容，不按标记');
t.ok(L.PENDING_MARK === '请按授权版本填入', 'PENDING_MARK 常量');
const p = K.pendingQ('x1', 1, [0, 1, 2, 3]);
t.ok(p.textPending === true && p.type === 'radio', 'pendingQ 生成带标记的单选题', p);
t.ok(p.text.indexOf(L.PENDING_MARK) >= 0 && p.options.length === 4, '题干与 4 个选项都是占位', p);
t.ok(p.options.map((o) => o.value).join(',') === '0,1,2,3', '选项分值按传入顺序', p.options);
const def = { items: [p, K.q('x2', '已写好的题', 'radio', [{ label: '是', value: 1 }, { label: '否', value: 0 }])] };
t.ok(JSON.stringify(L.pendingItems(def)) === '["x1"]', 'pendingItems 只返回占位条目', L.pendingItems(def));

const stripped = { items: [Object.assign({}, p, { textPending: undefined })] };
t.ok(L.pendingItems(stripped).length === 1, '去掉标记但文字仍是占位 → 仍算待填');

console.log('\n【2】settlePending：题干和全部选项都填完才清标记');
const half = { items: [Object.assign({}, p, { text: '最近两周心情低落' })] };
L.settlePending(half);
t.ok(half.items[0].textPending === true, '只填题干、选项仍占位 → 保留标记');
t.ok(L.pendingItems(half).length === 1, '只填题干 → 仍算待填');
const done = { items: [Object.assign({}, p, {
  text: '最近两周心情低落',
  options: p.options.map((o, i) => ({ label: '程度' + i, value: o.value })),
})] };
L.settlePending(done);
t.ok(done.items[0].textPending === undefined, '全部填完 → 清除标记', done.items[0]);
t.ok(L.pendingItems(done).length === 0, '全部填完 → 不再待填');
t.ok(L.pendingItems({}).length === 0 && L.pendingItems(null).length === 0, '空定义安全返回空数组');

console.log('\n【3】q() 透传 bands / textPending');
const bands = [{ lt: 34, score: 1 }, { lte: 50, score: 2 }, { score: 3 }];
const n = K.q('bili', '总胆红素', 'number', null, { unit: 'μmol/L', min: 0, max: 1000, bands: bands });
t.ok(n.bands === bands && n.unit === 'μmol/L' && n.min === 0 && n.max === 1000, 'number 题保留 bands/unit/min/max', n);

console.log('\n【4】definition 保存 licenseTier / rater，并清理已填的待填标记');
const dbPath = path.join(__dirname, 'scale_engine_test.db');
['', '-wal', '-shm'].forEach((s) => { if (fs.existsSync(dbPath + s)) fs.unlinkSync(dbPath + s); });
process.env.MEDSCALE_DB = dbPath;
const dbm = require(path.join(ROOT, 'lib', 'db.js'));
const filled = Object.assign({}, p, { text: '已填题干', options: p.options.map((o) => ({ label: '已填', value: o.value })) });
const created = dbm.insertScale({
  code: 'engine-t1', title: '引擎测试', licenseTier: 'commercial', rater: 'clinician',
  items: [p, filled], dimensions: [], scoring: { method: 'sum' },
}, { ownerId: null });
const got = dbm.getScale(created.id || created);
t.ok(got.definition.licenseTier === 'commercial', '保存并读回 licenseTier', got.definition.licenseTier);
t.ok(got.definition.rater === 'clinician', '保存并读回 rater', got.definition.rater);
t.ok(got.definition.items[0].textPending === true, '未填条目保留标记');
t.ok(got.definition.items[1].textPending === undefined, '已填条目在保存时清除标记', got.definition.items[1]);
const plain = dbm.insertScale({ code: 'engine-t2', title: '普通', items: [K.q('a', '题', 'text')] }, {});
const got2 = dbm.getScale(plain.id || plain);
t.ok(got2.definition.licenseTier === null && got2.definition.rater === 'self', '缺省值：licenseTier=null、rater=self', got2.definition);

['', '-wal', '-shm'].forEach((s) => { if (fs.existsSync(dbPath + s)) fs.unlinkSync(dbPath + s); });
process.exit(t.done('量表引擎扩展'));
