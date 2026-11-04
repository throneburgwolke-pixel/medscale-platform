'use strict';
/**
 * 跳题逻辑与答案文案（前后端共用同一份实现）
 * 浏览器没有构建步骤：index.html 用 <script src="/logic.js"> 直接加载本文件，
 * 服务端与填写页用的是同一个函数对象，不会出现两边规则不一致的问卷。
 *
 * 题目上的配置：item.skip = [{ values:[选项值...], action:'goto'|'end', target:'题目id' }]
 *  - goto：选择这些选项后，跳过中间的题目，直接到 target 题继续作答
 *  - end ：选择这些选项后，问卷提前结束（后面的题目全部跳过）
 */
const MEDSCALE_LOGIC = (function () {

  function toList(v) {
    if (v === undefined || v === null || v === '') return [];
    return (Array.isArray(v) ? v : [v]).map(String);
  }

  /** 当前作答是否命中该题的跳转规则 */
  function matchSkip(item, value) {
    const rules = item && item.skip;
    if (!Array.isArray(rules) || !rules.length) return null;
    const cur = toList(value);
    if (!cur.length) return null;
    for (let i = 0; i < rules.length; i += 1) {
      const r = rules[i];
      if (!r) continue;
      const vals = toList(r.values);
      if (vals.some(function (v) { return cur.indexOf(v) >= 0; })) return r;
    }
    return null;
  }

  /**
   * 根据已作答内容计算题目可见性
   * @returns {{ visible: string[], skipped: string[], ended: boolean }}
   */
  function computeVisibility(def, answers) {
    const items = (def && def.items) || [];
    const ans = answers || {};
    const idxOf = {};
    items.forEach(function (it, i) { idxOf[it.id] = i; });
    const visible = [];
    const skipped = [];
    const skippedSet = {};
    let ended = false;
    let i = 0;
    let guard = 0;
    const maxStep = items.length * 4 + 10;
    while (i < items.length && guard < maxStep) {
      guard += 1;
      const it = items[i];
      visible.push(it.id);
      const rule = matchSkip(it, ans[it.id]);
      if (rule && rule.action === 'end') {
        ended = true;
        for (let j = i + 1; j < items.length; j += 1) {
          if (!skippedSet[items[j].id]) { skippedSet[items[j].id] = 1; skipped.push(items[j].id); }
        }
        break;
      }
      if (rule && rule.action === 'goto') {
        const t = idxOf[rule.target];
        if (t !== undefined && t > i) {
          for (let j = i + 1; j < t; j += 1) {
            if (!skippedSet[items[j].id]) { skippedSet[items[j].id] = 1; skipped.push(items[j].id); }
          }
          i = t;
          continue;
        }
      }
      i += 1;
    }
    return { visible: visible, skipped: skipped, ended: ended };
  }

  /** 某题在本次作答中是否可见 */
  function isVisible(vis, itemId) {
    return vis.visible.indexOf(itemId) >= 0;
  }

  /** 统计整个量表的跳题规则数量（编辑器概览用） */
  function countRules(def) {
    return ((def && def.items) || []).reduce(function (a, it) {
      return a + (Array.isArray(it.skip) ? it.skip.length : 0);
    }, 0);
  }

  /** 把答案值翻译成给人类看的选项文案；多选用 sep 连接（报表用 /，导出用 |） */
  function answerLabel(item, value, sep) {
    if (value === undefined || value === null || value === '') return '';
    const one = function (x) {
      const hit = ((item && item.options) || []).find(function (o) { return String(o.value) === String(x); });
      return hit ? hit.label : String(x);
    };
    return Array.isArray(value) ? value.map(one).join(sep || '/') : one(value);
  }

  /** SPSS 与 codebook 共用原始编码映射：医学分值不替代答案编码。 */
  function spssCoding(item) {
    const numeric = function (v) {
      return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
    };
    const options = (item.options || []).map(function (o) {
      return { value: o.value, label: o.label, missing: o.na === true || o.score === null, code: '' };
    });
    // 先保留所有数值编码，再按选项定义顺序给字符串分类分配不冲突的整数。
    const used = new Set(options.filter(function (o) { return numeric(o.value); }).map(function (o) { return Number(o.value); }));
    const byValue = new Map();
    let next = 1;
    options.forEach(function (o) {
      if (!o.missing) {
        if (numeric(o.value)) o.code = o.value;
        else if (typeof o.value === 'string' && o.value.trim() !== '') {
          if (byValue.has(o.value)) o.code = byValue.get(o.value).code;
          else {
            while (used.has(next)) next += 1;
            o.code = next;
            used.add(next);
            next += 1;
          }
        }
      }
      byValue.set(String(o.value), o);
    });
    return {
      encode: function (value) {
        if (typeof value !== 'number' && typeof value !== 'string') return '';
        if (typeof value === 'string' && value.trim() === '') return '';
        const option = byValue.get(String(value));
        if (option && option.missing) return '';
        if (item.type === 'number' || item.type === 'slider') return numeric(value) ? value : '';
        return option ? (numeric(value) ? value : option.code) : '';
      },
      checkbox: function (value, optionValue) {
        const option = byValue.get(String(optionValue));
        if (!option || option.missing || value === undefined || value === null || value === '') return '';
        const list = Array.isArray(value) ? value : [value];
        if (!list.length) return '';
        const valid = list.every(function (v) {
          if (typeof v !== 'number' && typeof v !== 'string') return false;
          const hit = byValue.get(String(v));
          return hit && !hit.missing && hit.code !== '';
        });
        if (!valid || new Set(list.map(String)).size !== list.length) return '';
        return list.map(String).indexOf(String(optionValue)) >= 0 ? 1 : 0;
      },
      codebook: function (optionValue) {
        if (item.type === 'checkbox') {
          const o = byValue.get(String(optionValue));
          return !o || o.missing ? '缺失选项=空白；整题缺失/无效时所有拆分列空白' :
            '选中"' + o.label + '"=1，否则=0；整题缺失/无效时所有拆分列空白';
        }
        return options.map(function (o) { return o.label + '=' + (o.code === '' ? '缺失(空白)' : o.code); }).join('；') || '数值；缺失/无效=空白';
      },
    };
  }

  /** 商业授权量表的占位文字标记；题干或选项里含这段文字即视为「正文待填」 */
  const PENDING_MARK = '请按授权版本填入';

  function hasPendingText(s) {
    return String(s === undefined || s === null ? '' : s).indexOf(PENDING_MARK) >= 0;
  }

  function isBlankText(s) {
    return s === undefined || s === null || String(s).trim() === '';
  }

  function itemPending(it) {
    const opts = it.options || [];
    return hasPendingText(it.text) || opts.some(function (o) { return hasPendingText(o && o.label); }) ||
      (it.textPending === true && (isBlankText(it.text) || opts.some(function (o) { return isBlankText(o && o.label); })));
  }

  /** 占位正文仍待填；带 textPending 的题干及选项也必须非空。 */
  function pendingItems(def) {
    const items = (def && def.items) || [];
    return items.filter(itemPending).map(function (it) { return it.id; });
  }

  /** 题干与全部选项都已改写的条目，清掉 textPending 标记（原地修改） */
  function settlePending(def) {
    ((def && def.items) || []).forEach(function (it) {
      if (it.textPending && !itemPending(it)) delete it.textPending;
    });
    return def;
  }

  /** 量表分类（导航、筛选、导入默认值共用这一份顺序） */
  const CATEGORIES = [
    '情绪与心理', '睡眠', '认知与老年', '康复与疼痛', '护理评估', '营养评估',
    '呼吸与心血管', '消化与泌尿', '用药与依从性', '成瘾行为', '照护与负担',
    '症状评估', '躯体症状', '生活质量', '临床风险评分', '儿童与青少年', '通用问卷',
  ];

  return {
    matchSkip: matchSkip,
    computeVisibility: computeVisibility,
    isVisible: isVisible,
    countRules: countRules,
    toList: toList,
    answerLabel: answerLabel,
    spssCoding: spssCoding,
    PENDING_MARK: PENDING_MARK,
    pendingItems: pendingItems,
    settlePending: settlePending,
    CATEGORIES: CATEGORIES,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MEDSCALE_LOGIC;
if (typeof window !== 'undefined') window.MEDSCALE_LOGIC = MEDSCALE_LOGIC;
