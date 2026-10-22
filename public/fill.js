'use strict';
/* 公开填写页（受试者入口）：/s/<token> 只加载 logic.js + common.js + fill.js */
const LOGIC = window.MEDSCALE_LOGIC;
const computeVisibility = LOGIC.computeVisibility;
const isVisible = LOGIC.isVisible;

function backToBuilder() {
  if (typeof window.MEDSCALE_FILL_BACK === 'function') window.MEDSCALE_FILL_BACK();
  else history.back();
}

/* ================= 视图：公开填写页 ================= */
let fillState = null;

async function viewFill(token) {
  let data;
  try {
    data = await api('/join/' + token);
  } catch (e) {
    $('#app').innerHTML = '<div class="fill-wrap"><div class="card"><div class="empty"><span class="big">🔗</span>' +
      esc(e.message) + '</div></div></div>';
    return;
  }
  if (!data.open) {
    $('#app').innerHTML = '<div class="fill-wrap"><div class="card"><div class="empty"><span class="big">🔒</span>' +
      '<b>' + esc(data.survey.name) + '</b><br>' + esc(data.reason || '该问卷当前不可填写') + '</div></div></div>';
    return;
  }
  renderFill(data, token, false);
}

function renderFill(data, token, isPreview) {
  const items = data.scale.definition.items;
  const sections = buildSections(data.scale.definition);
  const restored = isPreview ? null : loadDraft(token);
  const studyId = data.survey && data.survey.studyId;
  let savedSubject = '';
  try { savedSubject = studyId ? (localStorage.getItem('medscale_subject_' + studyId) || '') : ''; } catch (e) { savedSubject = ''; }
  fillState = {
    data: data,
    token: token,
    isPreview: !!isPreview,
    startedAt: new Date().toISOString(),
    step: 0,
    sections: sections,
    answers: restored ? restored.answers || {} : {},
    restoredAt: restored ? restored.savedAt : null,
    review: false,
    consent: !data.scale.consentOn,
    subjectId: savedSubject || '',
    suggestSubject: data.suggestSubjectCode || '',
    subjectConfirmed: !studyId || !!savedSubject,
  };
  drawFill(isPreview);
}

/** 分节：多维度量表按维度分节，否则每 10 题一节 */
function buildSections(def) {
  const items = def.items || [];
  const dims = (def.dimensions || []).filter(function (d) { return (d.items || []).length; });
  const byId = {};
  items.forEach(function (it) { byId[it.id] = it; });
  if (dims.length >= 2) {
    const sections = [];
    const covered = {};
    dims.forEach(function (d) {
      const list = d.items.map(function (id) { return byId[id]; }).filter(Boolean);
      if (!list.length) return;
      list.forEach(function (it) { covered[it.id] = 1; });
      sections.push({ title: d.name, items: list });
    });
    const rest = items.filter(function (it) { return !covered[it.id]; });
    if (rest.length) sections.push({ title: '其他问题', items: rest });
    return sections;
  }
  const out = [];
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    out.push({ title: items.length > 10 ? '第 ' + (i + 1) + ' – ' + (i + chunk.length) + ' 题' : '', items: chunk });
  }
  return out.length ? out : [{ title: '', items: items }];
}

/* ---------- 草稿自动保存 ---------- */
function draftKey(token) { return 'medscale_draft_' + (token || 'preview'); }
function loadDraft(token) {
  try {
    const raw = localStorage.getItem(draftKey(token));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.answers || !Object.keys(d.answers).length) return null;
    return d;
  } catch (e) { return null; }
}
function saveDraft() {
  const st = fillState;
  if (!st || st.isPreview) return;
  try {
    localStorage.setItem(draftKey(st.token), JSON.stringify({
      answers: st.answers, consent: st.consent, savedAt: new Date().toISOString(),
    }));
  } catch (e) { /* 隐私模式下可能不可用 */ }
}
function clearDraft(token) {
  try { localStorage.removeItem(draftKey(token)); } catch (e) { /* ignore */ }
}

function drawFill(isPreview) {
  const st = fillState;
  const data = st.data;
  const items = data.scale.definition.items;
  const sections = st.sections;
  const total = sections.length + 1; // 最后一节为"检查答案"
  if (st.step >= total) st.step = total - 1;
  const isReview = st.review || st.step === sections.length;
  const section = sections[Math.min(st.step, sections.length - 1)];
  const vis = computeVisibility(data.scale.definition, st.answers);
  let slice = section ? section.items.filter(function (it) { return isVisible(vis, it.id); }) : [];
  if (!isReview && !slice.length && st.step < sections.length - 1) {
    st.step += 1;
    return drawFill(isPreview);
  }
  const visibleItems = items.filter(function (it) { return isVisible(vis, it.id); });
  const answeredCount = visibleItems.filter(hasAnswer).length;
  const pct = Math.round(answeredCount / Math.max(1, visibleItems.length) * 100);

  const consentBlock = (!st.consent && data.scale.consentOn)
    ? '<div class="card"><div class="card-title">知情同意</div>' +
      '<div class="small" style="white-space:pre-wrap;line-height:1.9">' + esc(data.scale.consentText || '') + '</div>' +
      '<label class="row mt16" style="gap:8px"><input type="checkbox" id="c-consent" style="width:auto"> <b>我已阅读并同意参与本次调查</b></label>' +
      '<button class="btn primary block mt16" id="c-start">开始填写</button></div>'
    : '';

  const restoreBanner = st.restoredAt
    ? '<div class="banner info">已为您恢复上次未提交的作答（保存于 ' + fmtDate(st.restoredAt) + '）。' +
      '<button class="btn small" id="draft-clear" style="margin-left:8px">清空重填</button></div>'
    : '';

  const isFollowup = !!(data.survey && data.survey.studyId);
  const subjectBlock = (isFollowup && !st.subjectConfirmed)
    ? '<div class="card"><div class="card-title">随访编号<span class="hint">' + esc(data.survey.waveLabel || '') + '</span></div>' +
      '<div class="small muted mb8">本研究为多次随访。为保证各时点的数据能配对分析，请输入您的随访编号：<br>' +
      '· 首次填写可留空，系统会自动分配一个编号（请记录，后续随访需填写同一编号）<br>' +
      '· 若研究方已提供编号（如住院号、研究编号），请在此填写</div>' +
      '<input type="text" id="subj-input" value="' + esc(st.subjectId || st.suggestSubject || '') + '" placeholder="例如 ' + esc(st.suggestSubject || 'S-0001') + '（可留空）">' +
      '<button class="btn primary block mt16" id="subj-ok">开始填写</button></div>'
    : '';

  const nav = '<div class="fill-bar"><div class="fill-bar-inner">' +
    '<button class="btn" id="f-prev"' + (st.step === 0 ? ' disabled' : '') + '>上一节</button>' +
    '<div class="grow center">' +
      '<div class="small muted">' + (isReview ? '检查答案' : '第 ' + (st.step + 1) + ' / ' + total + ' 节' +
        (section.title ? '：' + esc(section.title) : '')) + '</div>' +
      '<div class="small" style="color:var(--brand-600);font-weight:600">已答 ' + answeredCount + ' / ' + visibleItems.length + ' 题</div>' +
    '</div>' +
    (isReview
      ? '<button class="btn primary" id="f-submit">' + (isPreview ? '提交（预览不保存）' : '确认提交') + '</button>'
      : '<button class="btn primary" id="f-next">下一节</button>') +
  '</div></div>';

  const topbar = (st.consent && st.subjectConfirmed)
    ? '<div class="fill-topbar">' +
        '<div class="fill-topbar-in">' +
          '<span class="ft-step">' + (isReview ? '检查答案' : '第 ' + (st.step + 1) + ' / ' + total + ' 节') + '</span>' +
          '<div class="progress slim" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct +
            '" aria-label="完成度 ' + pct + '%"><i style="width:' + pct + '%"></i></div>' +
          '<span class="ft-count">已答 ' + answeredCount + ' / ' + visibleItems.length + '</span>' +
        '</div>' +
      '</div>'
    : '';

  $('#app').innerHTML = '' +
    '<div class="fill-wrap">' +
      (isPreview ? '<div class="banner warn">预览模式：此页面仅用于检查填写效果，提交不会保存任何数据。</div>' : '') +
      topbar +
      '<div class="fill-head">' +
        '<h1>' + esc(data.scale.title || data.survey.name) + '</h1>' +
        (data.scale.instructions ? '<p>' + esc(data.scale.instructions) + '</p>' : '') +
        '<div class="small" style="color:var(--grad-mist);margin-top:8px">' +
          (data.scale.definition && data.scale.definition.rater === 'clinician'
            ? '评估者填写'
            : (data.survey.anonymous ? '本问卷匿名收集' : '本问卷需署名填写')) +
          ' · 共 ' + items.length + ' 题' +
          (data.scale.consentOn ? ' · 已阅读知情同意' : '') +
          ' · 预计 ' + estimateMinutes(items.length) +
        '</div>' +
        '<div class="progress" style="background:rgba(255,255,255,.25)"><i style="width:' + pct + '%"></i></div>' +
        '<div class="small" style="color:var(--grad-mist)">完成度 ' + pct + '%' +
          (vis.skipped.length ? ' · 已跳过 ' + vis.skipped.length + ' 题' : '') + '</div>' +
        (isFollowup && st.subjectId ? '<div class="small" style="color:var(--grad-mist)">随访编号：' + esc(st.subjectId) + '</div>' : '') +
      '</div>' +
      restoreBanner +
      subjectBlock +
      consentBlock +
      (st.consent && st.subjectConfirmed
        ? (isReview ? renderReview() : '<div id="q-area">' +
            (section.title && sections.length > 1 ? '<div class="section-head">' + esc(section.title) +
              '<span class="desc">' + slice.length + ' 题</span></div>' : '') +
            slice.map(renderQuestion).join('') + '</div>') + nav
        : '<div class="center mt24 muted small">请先阅读上方说明并勾选同意后开始填写</div>') +
      (data.survey.note ? '<div class="muted small center mt16">' + esc(data.survey.note) + '</div>' : '') +
      (isPreview ? '<div class="center mt16"><button class="btn" id="c-back">← 返回编辑器</button></div>' : '') +
    '</div>';

  if ($('#c-start')) {
    $('#c-start').onclick = function () {
      if (!$('#c-consent').checked) return toast('请先勾选"我已阅读并同意"', 'err');
      st.consent = true;
      drawFill(isPreview);
    };
  }
  if ($('#subj-ok')) {
    $('#subj-ok').onclick = function () {
      const v = ($('#subj-input').value || '').trim() || st.suggestSubject || '';
      st.subjectId = v;
      st.subjectConfirmed = true;
      try { localStorage.setItem('medscale_subject_' + data.survey.studyId, v); } catch (e) { /* ignore */ }
      drawFill(isPreview);
    };
  }
  if ($('#draft-clear')) {
    $('#draft-clear').onclick = function () {
      st.answers = {};
      st.restoredAt = null;
      clearDraft(st.token);
      drawFill(isPreview);
    };
  }
  if (isPreview && $('#c-back')) $('#c-back').onclick = backToBuilder;
  if (!st.consent || !st.subjectConfirmed) return;

  if (!isReview) bindQuestions(slice);
  if ($('#f-prev')) $('#f-prev').onclick = function () { st.step -= 1; st.review = false; drawFill(isPreview); window.scrollTo(0, 0); };
  if ($('#f-next')) $('#f-next').onclick = function () {
    const errs = slice.filter(function (it) { return it.required !== false && !hasAnswer(it); }).map(function (it) { return it.id; });
    if (errs.length && !confirmBox('本节还有 ' + errs.length + ' 道必答题未作答，仍要继续吗？')) return showErrors(errs);
    st.step += 1;
    saveDraft();
    drawFill(isPreview);
    window.scrollTo(0, 0);
  };
  if ($('#f-submit')) $('#f-submit').onclick = function () { submitFill(); };
  $$('[data-jump]').forEach(function (b) {
    b.onclick = function () {
      const idx = sections.findIndex(function (s) {
        return s.items.some(function (it) { return it.id === b.dataset.jump; });
      });
      if (idx >= 0) { st.step = idx; drawFill(isPreview); window.scrollTo(0, 0); }
    };
  });
}

/** 提交前检查页 */
function renderReview() {
  const st = fillState;
  const vis = computeVisibility(st.data.scale.definition, st.answers);
  const items = st.data.scale.definition.items.filter(function (it) { return isVisible(vis, it.id); });
  const missing = items.filter(function (it) { return it.required !== false && !hasAnswer(it); });
  const summary = function (it) {
    const v = st.answers[it.id];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '<span class="muted">未作答</span>';
    if (Array.isArray(v)) {
      return v.map(function (x) {
        const hit = (it.options || []).find(function (o) { return String(o.value) === String(x); });
        return esc(hit ? hit.label : x);
      }).join('、');
    }
    const hit = (it.options || []).find(function (o) { return String(o.value) === String(v); });
    return esc(hit ? hit.label : v) + (it.unit ? ' ' + esc(it.unit) : '');
  };
  return '' +
    (vis.skipped.length
      ? '<div class="banner info">根据您的作答，已自动跳过 ' + vis.skipped.length + ' 道题' +
        (vis.ended ? '（问卷已提前结束）' : '') + '，以下仅列出需要作答的题目。</div>'
      : '') +
    (missing.length
      ? '<div class="banner danger">还有 <b>' + missing.length + '</b> 道必答题未作答：' +
        missing.slice(0, 12).map(function (it) {
          return '<button class="btn small" data-jump="' + esc(it.id) + '" style="margin:2px">返回第 ' + it.no + ' 题</button>';
        }).join('') + (missing.length > 12 ? ' 等' : '') + '</div>'
      : '<div class="banner ok">所有必答题均已作答，请核对后提交。</div>') +
    '<div class="card"><div class="card-title">核对答案<span class="hint">点击题号可返回修改</span></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>题号</th><th>题目</th><th>您的作答</th></tr></thead><tbody>' +
    items.map(function (it) {
      return '<tr' + (!hasAnswer(it) && it.required !== false ? ' style="background:var(--danger-50)"' : '') + '>' +
        '<td class="nowrap">第 ' + it.no + ' 题</td><td class="small">' + esc(it.text.slice(0, 60)) + '</td>' +
        '<td class="small">' + summary(it) + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/**
 * 单/下拉题选定后，把视线带到本节的下一道待答必答题；本节已无待答必答题时，
 * 让「下一节」按钮轻微脉动一下，提示可以直接进入下一节。
 * 带跳题规则的题目会触发重绘，此时不自动滚动，避免与重绘后的位置打架。
 */
function focusNextUnanswered(slice, item) {
  const st = fillState;
  if (!st || !item) return;
  if (Array.isArray(item.skip) && item.skip.length) return;
  const vis = computeVisibility(st.data.scale.definition, st.answers);
  const qs = (slice || []).filter(function (x) { return isVisible(vis, x.id); });
  const idx = qs.findIndex(function (x) { return x.id === item.id; });
  const next = qs.slice(idx + 1).find(function (x) { return x.required !== false && !hasAnswer(x); });
  if (next) return flashQuestion(next.id);
  const btn = $('#f-next');
  if (btn) {
    btn.classList.add('pulse');
    setTimeout(function () { btn.classList.remove('pulse'); }, 1200);
  }
}
function flashQuestion(id) {
  const el = $('.q[data-qid="' + id + '"]');
  if (!el) return;
  if (typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
  }
  el.classList.add('q-flash');
  setTimeout(function () { el.classList.remove('q-flash'); }, 950);
}

function hasAnswer(it) {
  const v = fillState.answers[it.id];
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
}

function renderQuestion(it) {
  const v = fillState.answers[it.id];
  const out = [];
  const named = ' aria-labelledby="qt_' + esc(it.id) + '"';
  out.push('<div class="q" data-qid="' + esc(it.id) + '">');
  out.push('<div class="q-text" id="qt_' + esc(it.id) + '"><span class="q-no">' + it.no + '.</span>' + esc(it.text) +
    (it.required === false ? ' <span class="muted small">（选填）</span>' : '') + '</div>');
  if (it.hint) out.push('<div class="banner warn" style="padding:8px 10px;margin-bottom:10px">' + esc(it.hint) + '</div>');

  if (it.type === 'radio') {
    out.push((it.options || []).map(function (o) {
      const sel = String(v) === String(o.value);
      return '<label class="opt' + (sel ? ' sel' : '') + '"><input type="radio" name="r_' + esc(it.id) + '" value="' + esc(o.value) + '"' +
        (sel ? ' checked' : '') + ' data-in="' + esc(it.id) + '"><span>' + esc(o.label) + '</span></label>';
    }).join(''));
  } else if (it.type === 'select') {
    out.push('<select data-in="' + esc(it.id) + '"' + named + '><option value="">请选择</option>' +
      (it.options || []).map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (String(v) === String(o.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select>');
  } else if (it.type === 'checkbox') {
    const arr = Array.isArray(v) ? v.map(String) : [];
    out.push((it.options || []).map(function (o) {
      const sel = arr.indexOf(String(o.value)) >= 0;
      return '<label class="opt' + (sel ? ' sel' : '') + '"><input type="checkbox" value="' + esc(o.value) + '"' +
        (sel ? ' checked' : '') + ' data-in="' + esc(it.id) + '"><span>' + esc(o.label) + '</span></label>';
    }).join(''));
  } else if (it.type === 'slider') {
    const mn = numOr(it.min, 0);
    const mx = numOr(it.max, 10);
    const nv = Number(v);
    const cur = (v === undefined || v === '' || !Number.isFinite(nv)) ? Math.round((mn + mx) / 2) : nv;
    out.push('<div class="row" style="flex-wrap:nowrap"><input type="range" min="' + mn + '" max="' + mx + '" value="' + cur +
      '" data-in="' + esc(it.id) + '"' + named + ' id="rg_' + esc(it.id) + '">' +
      '<span class="slider-val" id="rgv_' + esc(it.id) + '">' + cur + '</span></div>' +
      '<div class="row small muted" style="justify-content:space-between"><span>' + mn + '</span><span>' + mx + (it.unit ? ' ' + esc(it.unit) : '') + '</span></div>');
  } else if (it.type === 'number') {
    const minAttr = Number.isFinite(Number(it.min)) && it.min !== undefined ? ' min="' + Number(it.min) + '"' : '';
    const maxAttr = Number.isFinite(Number(it.max)) && it.max !== undefined ? ' max="' + Number(it.max) + '"' : '';
    out.push('<input type="number" data-in="' + esc(it.id) + '"' + named + ' value="' + esc(v === undefined ? '' : v) + '"' +
      minAttr + maxAttr +
      ' placeholder="请输入数字' + (it.unit ? '（' + esc(it.unit) + '）' : '') + '">');
  } else if (it.type === 'time') {
    out.push('<input type="time" data-in="' + esc(it.id) + '"' + named + ' value="' + esc(v === undefined ? '' : v) + '">');
  } else if (it.type === 'date') {
    out.push('<input type="date" data-in="' + esc(it.id) + '"' + named + ' value="' + esc(v === undefined ? '' : v) + '">');
  } else if (it.type === 'textarea') {
    out.push('<textarea data-in="' + esc(it.id) + '"' + named + ' placeholder="请输入">' + esc(v || '') + '</textarea>');
  } else {
    out.push('<input type="text" data-in="' + esc(it.id) + '"' + named + ' value="' + esc(v || '') + '" placeholder="请输入">');
  }
  out.push('</div>');
  return out.join('');
}

function bindQuestions(slice) {
  const afterChange = function (item) {
    saveDraft();
    // 命中跳题规则的题目：立即重绘，让被跳过的题目消失/恢复
    if (item && Array.isArray(item.skip) && item.skip.length) {
      setTimeout(function () { drawFill(fillState.isPreview); }, 120);
    }
  };
  slice.forEach(function (it) {
    const nodes = $$('[data-in="' + it.id + '"]');
    if (!nodes.length) return;
    if (it.type === 'radio') {
      if (!hasAnswer(it)) fillState.answers[it.id] = '';
      nodes.forEach(function (r) {
        r.onchange = function () {
          fillState.answers[it.id] = r.value;
          const q = r.closest('.q');
          $$('.opt', q).forEach(function (o) { o.classList.remove('sel'); });
          r.closest('.opt').classList.add('sel');
          q.classList.remove('err');
          afterChange(it);
          focusNextUnanswered(slice, it);
        };
      });
    } else if (it.type === 'checkbox') {
      nodes.forEach(function (cb) {
        cb.onchange = function () {
          const arr = nodes.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
          fillState.answers[it.id] = arr;
          cb.closest('.opt').classList.toggle('sel', cb.checked);
          cb.closest('.q').classList.remove('err');
          afterChange(it);
        };
      });
    } else if (it.type === 'slider') {
      const el = nodes[0];
      const out = $('#rgv_' + it.id);
      fillState.answers[it.id] = Number(el.value);
      el.oninput = function () {
        out.textContent = el.value;
        fillState.answers[it.id] = Number(el.value);
        afterChange(it);
      };
    } else {
      const el = nodes[0];
      if (el.value !== '') fillState.answers[it.id] = el.value;
      el.oninput = el.onchange = function () {
        fillState.answers[it.id] = el.value;
        el.closest('.q').classList.remove('err');
        afterChange(it);
        if (it.type === 'select') focusNextUnanswered(slice, it);
      };
    }
  });
}

function showErrors(ids) {
  ids.forEach(function (id) {
    const q = $('.q[data-qid="' + id + '"]');
    if (q) q.classList.add('err');
  });
  const first = $('.q[data-qid="' + ids[0] + '"]');
  if (first && typeof first.scrollIntoView === 'function') {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  toast('还有 ' + ids.length + ' 道必答题未作答', 'err');
}

async function submitFill() {
  const st = fillState;
  const items = st.data.scale.definition.items;
  const vis = computeVisibility(st.data.scale.definition, st.answers);
  const missing = items.filter(function (it) {
    return isVisible(vis, it.id) && it.required !== false && !hasAnswer(it);
  });
  if (missing.length) {
    const first = missing[0];
    st.review = true;
    drawFill(st.isPreview);
    toast('还有 ' + missing.length + ' 道必答题未作答', 'err');
    return;
  }
  if (st.isPreview) {
    const scores = await api('/preview-score', {
      method: 'POST',
      body: { definition: st.data.scale.definition, answers: st.answers },
    }).catch(function () { return null; });
    return showThanks(null, scores, true);
  }
  const payload = {
    answers: st.answers,
    consent: st.consent,
    durationSec: Math.round((Date.now() - new Date(st.startedAt).getTime()) / 1000),
    startedAt: st.startedAt,
    pid: 'P' + Date.now().toString(36).toUpperCase(),
    subjectId: st.subjectId || null,
  };
  const btn = $('#f-submit');
  try {
    if (btn) btn.disabled = true;
    const res = await api('/join/' + st.token, { method: 'POST', body: payload });
    if (res.subjectId) {
      st.subjectId = res.subjectId;
      const sid2 = st.data.survey && st.data.survey.studyId;
      if (sid2) { try { localStorage.setItem('medscale_subject_' + sid2, res.subjectId); } catch (e) { /* ignore */ } }
    }
    clearDraft(st.token);
    showThanks(st.data, res.result, false, st.subjectId);
  } catch (e) {
    if (btn) btn.disabled = false;
    if (e.detail && e.detail.details && e.detail.details.length) {
      const firstId = e.detail.details[0].itemId;
      const idx = st.sections.findIndex(function (sec) {
        return sec.items.some(function (it) { return it.id === firstId; });
      });
      if (idx >= 0) {
        st.step = idx;
        st.review = false;
        drawFill(false);
        setTimeout(function () { showErrors([firstId]); }, 60);
      }
      toast(e.detail.details[0].message, 'err');
    } else {
      toast(e.message, 'err');
    }
  }
}

function showThanks(data, result, isPreview, subjectId) {
  // 临床评分由医护填写：不出现「感谢您的参与」这类面向受试者的话
  const clinician = !!(data && data.scale && data.scale.definition && data.scale.definition.rater === 'clinician');
  let body = '';
  if (result && result.total !== null && result.total !== undefined) {
    const cut = result.cut || {};
    body += '<div class="card mt16"><div class="card-title">' + (clinician ? '评分结果' : '您的评估结果') + '</div>' +
      '<div class="center" style="padding:8px 0 4px">' +
        '<div class="muted small">总分</div>' +
        '<div style="font-size:44px;font-weight:700;color:var(--brand-dark);line-height:1.15">' + result.total + '</div>' +
        (cut.label ? '<div class="tag ' + (cut.level === 'normal' ? 'ok' : cut.level === 'severe' ? 'danger' : 'warn') +
          '" style="font-size:14px;padding:5px 14px">' + esc(cut.label) + '</div>' : '') +
        (cut.advice ? '<div class="small muted mt8">' + esc(cut.advice) + '</div>' : '') +
      '</div>';
    const dims = Object.keys(result.dimensions || {});
    if (dims.length > 1) {
      body += '<div class="table-wrap mt16"><table class="table"><thead><tr><th>维度</th><th>得分</th></tr></thead><tbody>' +
        dims.map(function (k) {
          const d = result.dimensions[k];
          return '<tr><td>' + esc(d.name) + '</td><td><b>' + (d.score === null || d.score === undefined ? '—' : d.score) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (result.flags && result.flags.length) body += '<div class="banner danger mt16">' + esc(result.flags[0].text) + '</div>';
    body += '<div class="banner info mt16 mb0 small">' + (clinician
      ? '评分由系统按量表规则自动计算，请结合临床判断使用。'
      : '本结果基于自评量表自动计算，仅供健康筛查参考，<b>不能替代临床诊断</b>。如有明显不适，请及时就医。') + '</div></div>';
  }
  $('#app').innerHTML = '<div class="fill-wrap">' +
    '<div class="card center"><div style="font-size:42px">✅</div>' +
      '<h2 class="mb8">' + (isPreview ? '这是预览效果' : (clinician ? '评估已记录' : '提交成功，感谢您的参与！')) + '</h2>' +
      '<div class="muted small">' + (isPreview ? '正式发布后，受试者看到的就是这个页面。'
        : (data && data.survey && data.survey.note ? esc(data.survey.note)
          : (clinician ? '本次评估已保存。' : '您的作答已被记录，感谢您的配合。'))) + '</div>' +
      (subjectId ? '<div class="banner info mt16 mb0">您的随访编号：<b style="font-size:18px;letter-spacing:1px">' + esc(subjectId) +
        '</b><br><span class="small">请记录此编号，下次随访时填写同一编号，系统才能将多次结果配对分析。</span></div>' : '') +
    '</div>' + body +
    (isPreview ? '<div class="center mt16"><button class="btn" id="c-back2">← 返回编辑器</button></div>' : '') +
    '</div>';
  if (isPreview && $('#c-back2')) $('#c-back2').onclick = backToBuilder;
}

/* 供 app.js 的编辑器预览按需加载；独立访问 /s/ 时自动进入填写页 */
window.MEDSCALE_FILL = { view: viewFill, render: renderFill };
if (location.pathname.indexOf('/s/') === 0) {
  viewFill(location.pathname.slice(3).replace(/\/$/, ''));
}
