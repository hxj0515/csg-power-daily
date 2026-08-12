/* =====================================================================
 * 《电亮学堂》PowerLink2 —— 核心引擎与界面（game.js）
 * ---------------------------------------------------------------------
 * 纯 vanilla JS · 无构建 · 无 CDN · 无 fetch · file:// 双击可玩。
 * 依赖：必须在本文件之前引入 questions.js（提供 window.POWERLINK2_BANK）。
 * 严格禁止使用 ES module / import / export。
 *
 * 关键设计：
 *  - 存储降级：实测 localStorage（set/get/remove），失败→内存存储 + 提示条。
 *  - 弹窗（overlay）隐藏：始终用 hidden 属性 + CSS display:none!important，
 *    绝不以 opacity:0 + fixed 全屏透明层吃掉点击（致命坑已规避）。
 *  - 6 种题型分别实现判定；知识点卡片每题后弹出。
 * ===================================================================== */
(function () {
  'use strict';

  var root = window;
  var BANK = root.POWERLINK2_BANK;

  /* ---------------- 常量（集中可配） ---------------- */
  var STORAGE_PROFILES = 'powerlink2:profiles:v1';
  var STORAGE_CURRENT = 'powerlink2:current:v1';
  var EXPORT_VERSION = 2;
  var MAX_PROFILES = 50;            // ux-save-spec 边缘情况 #15
  var BASE_SCORE = 100;
  // 章节解锁门槛（累计星数）。完整 6 章 24 关目标值见 concept.md：
  //   { 2:9, 3:18, 4:30, 5:45, 6:60 }
  // 占位 MVP 仅 2 章（Ch1 最多 6★），故 Ch2 门槛取 6 以保持可玩；
  // 扩充为真实 24 关题库后，把 2:6 改回 2:9 即可，其余值不变。
  var CHAPTER_UNLOCK_STARS = { 2: 6, 3: 18, 4: 30, 5: 45, 6: 60 };
  var DAILY_COUNT = 6;
  var DAILY_HISTORY_DAYS = 7;

  var PROFILE_COLORS = ['#2E9E5B', '#FFB02E', '#2D7FF9', '#E5484D', '#8B5CF6', '#0EA5A4', '#F472B6', '#64748B'];
  var PROFILE_ICONS = ['⚡', '🔌', '🧤', '🛡️', '📘', '🔧', '🌿', '💡', '🔋', '⭐'];

  var TYPE_LABEL = { single: '单选', multi: '多选', bool: '判断', fill: '填空', order: '排序', match: '连线' };

  /* ---------------- 小工具 ---------------- */
  function uid() { return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function todayStr(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function esc(s) {
    s = String(s == null ? '' : s);
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffleSeeded(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function safeName(s) {
    return String(s || 'profile').replace(/[^\w一-龥-]+/g, '_').slice(0, 20) || 'profile';
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function $(id) { return document.getElementById(id); }

  /* ---------------- 存储（file:// 下可能不可用 → 降级内存，绝不抛错） ---------------- */
  var LS = (function () {
    var mem = {};
    var ok = false;
    var reason = '';
    var listeners = [];
    try {
      var t = '__pl2_probe__';
      if (!root.localStorage) throw new Error('no localStorage');
      root.localStorage.setItem(t, '1');
      if (root.localStorage.getItem(t) !== '1') throw new Error('readback mismatch');
      root.localStorage.removeItem(t);
      ok = true;
    } catch (e) { ok = false; reason = (e && e.message) || 'unknown'; }

    function degrade(why) {
      if (!ok) return;
      ok = false; reason = why || reason;
      for (var i = 0; i < listeners.length; i++) { try { listeners[i](why); } catch (e) {} }
    }
    var api = {
      available: ok,
      mode: ok ? 'local' : 'memory',
      reason: reason,
      onDegrade: function (fn) { listeners.push(fn); if (!ok) { try { fn(reason); } catch (e) {} } },
      get: function (k) {
        if (ok) {
          try {
            var v = root.localStorage.getItem(k);
            if (v == null && Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
            return v;
          } catch (e) { degrade('read: ' + ((e && e.message) || '')); }
        }
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      set: function (k, v) {
        mem[k] = v; // 无论成败都留内存副本，避免会话内数据凭空消失
        if (ok) {
          try { root.localStorage.setItem(k, v); return true; }
          catch (e) { degrade('write: ' + ((e && e.message) || '')); }
        }
        return false;
      },
      remove: function (k) {
        delete mem[k];
        if (ok) { try { root.localStorage.removeItem(k); } catch (e) { degrade('remove: ' + ((e && e.message) || '')); } }
      }
    };
    return api;
  })();

  /* ---------------- 音效（WebAudio 合成，零文件） ---------------- */
  var Sound = (function () {
    var ctx = null;
    var enabled = true;
    function ensure() {
      if (ctx) return ctx;
      try {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      } catch (e) { ctx = null; }
      return ctx;
    }
    function tone(freq, start, dur, type, gain) {
      var c = ensure(); if (!c) return;
      try {
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine'; o.frequency.value = freq;
        var t0 = c.currentTime + start;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + dur + 0.02);
      } catch (e) {}
    }
    return {
      setEnabled: function (v) { enabled = !!v; },
      ui: function () { if (enabled) tone(520, 0, 0.05, 'triangle', 0.08); },
      correct: function () { if (!enabled) return; tone(660, 0, 0.12, 'sine', 0.16); tone(880, 0.09, 0.14, 'sine', 0.14); },
      wrong: function () { if (!enabled) return; tone(150, 0, 0.18, 'square', 0.12); },
      star: function (n) { if (!enabled) return; var base = [523, 659, 784, 988, 1175]; for (var i = 0; i < (n || 3); i++) tone(base[i] || 784, i * 0.08, 0.16, 'sine', 0.15); },
      complete: function () { if (!enabled) return; [392, 523, 659, 784].forEach(function (f, i) { tone(f, i * 0.07, 0.22, 'triangle', 0.14); }); }
    };
  })();

  /* ---------------- 档案存储 ---------------- */
  function normProfile(p) {
    if (!p || typeof p !== 'object') return null;
    var out = {
      id: (typeof p.id === 'string' && p.id) ? p.id : uid(),
      name: (typeof p.name === 'string' && p.name) ? p.name : '学员',
      color: (typeof p.color === 'string' && p.color) ? p.color : PROFILE_COLORS[0],
      icon: (typeof p.icon === 'string' && p.icon) ? p.icon : PROFILE_ICONS[0],
      createdAt: (typeof p.createdAt === 'number') ? p.createdAt : Date.now(),
      updatedAt: (typeof p.updatedAt === 'number') ? p.updatedAt : Date.now(),
      progress: (p.progress && typeof p.progress === 'object') ? p.progress : {},
      daily: (p.daily && typeof p.daily === 'object') ? p.daily : {},
      settings: {
        sound: (p.settings && typeof p.settings.sound === 'boolean') ? p.settings.sound : true,
        reduceMotion: (p.settings && typeof p.settings.reduceMotion === 'boolean') ? p.settings.reduceMotion : false
      }
    };
    // 清理 progress 中已不存在的关卡 id（题库更新后容错）
    return out;
  }

  var Profiles = {
    list: [],
    currentId: null,
    load: function () {
      var arr = [];
      try {
        var raw = LS.get(STORAGE_PROFILES);
        var parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
          for (var i = 0; i < parsed.length; i++) {
            var np = normProfile(parsed[i]);
            if (np) arr.push(np);
          }
        }
      } catch (e) {
        // 损坏 JSON → 重置为空数组（边缘情况 #2）
        arr = [];
        toast('存档已重置（原文件损坏）');
      }
      this.list = arr.slice(0, MAX_PROFILES);
      var cur = LS.get(STORAGE_CURRENT);
      this.currentId = this.findById(cur) ? cur : (this.list.length ? this.list[0].id : null);
      return this.list;
    },
    save: function () {
      try {
        LS.set(STORAGE_PROFILES, JSON.stringify(this.list));
        LS.set(STORAGE_CURRENT, this.currentId || '');
      } catch (e) {
        // QuotaExceeded / 隐私模式：静默降级（内存已留副本）
        if (String((e && e.name) || '').indexOf('Quota') >= 0) toast('存储空间已满，请清理或导出');
      }
    },
    findById: function (id) {
      for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
      return null;
    },
    current: function () { return this.findById(this.currentId); },
    create: function (name, color, icon) {
      if (this.list.length >= MAX_PROFILES) { toast('档案已达上限（' + MAX_PROFILES + '）'); return null; }
      var p = normProfile({ name: name, color: color, icon: icon, id: uid() });
      this.list.push(p);
      this.currentId = p.id;
      this.save();
      return p;
    },
    update: function (id, patch) {
      var p = this.findById(id); if (!p) return null;
      if (patch.name != null) p.name = patch.name;
      if (patch.color != null) p.color = patch.color;
      if (patch.icon != null) p.icon = patch.icon;
      p.updatedAt = Date.now();
      this.save(); return p;
    },
    remove: function (id) {
      var idx = -1;
      for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) { idx = i; break; }
      if (idx < 0) return false;
      this.list.splice(idx, 1);
      if (this.currentId === id) this.currentId = this.list.length ? this.list[0].id : null;
      this.save();
      return true;
    },
    switchTo: function (id) {
      if (!this.findById(id)) return false;
      this.currentId = id;
      this.save();
      return true;
    },
    merge: function (incoming) {
      var added = 0, updated = 0, skipped = 0;
      for (var i = 0; i < incoming.length; i++) {
        var np = normProfile(incoming[i]);
        if (!np) { skipped++; continue; }
        var exist = this.findById(np.id);
        if (exist) { // 同 id 以导入覆盖
          var j = this.list.indexOf(exist);
          this.list[j] = np; updated++;
        } else { this.list.push(np); added++; }
      }
      this.save();
      return { added: added, updated: updated, skipped: skipped };
    }
  };

  /* ---------------- 题库校验 / 归一化 ---------------- */
  function countBlanks(q) { return (q.q.match(/__/g) || []).length; }
  function normQuestion(q) {
    if (!q || typeof q !== 'object') return null;
    var t = q.type;
    if (['single', 'multi', 'bool', 'fill', 'order', 'match'].indexOf(t) < 0) t = 'single';
    var out = { type: t, q: String(q.q || ''), explain: String(q.explain || '（暂无讲解）'), knowledge: String(q.knowledge || '知识点') };
    if (t === 'single' || t === 'multi') {
      out.options = Array.isArray(q.options) ? q.options.map(String) : [];
      out.answer = (t === 'single') ? (typeof q.answer === 'number' ? q.answer : 0)
        : (Array.isArray(q.answer) ? q.answer.slice() : []);
    } else if (t === 'bool') {
      out.answer = (q.answer === true || q.answer === 'true');
    } else if (t === 'fill') {
      out.answer = Array.isArray(q.answer) ? q.answer.slice() : [String(q.answer == null ? '' : q.answer)];
      // __ 数量与 answer 长度对齐（防御性）
      var n = countBlanks(out);
      while (out.answer.length < n) out.answer.push('');
      out.answer = out.answer.slice(0, Math.max(n, 1));
    } else if (t === 'order') {
      out.items = Array.isArray(q.items) ? q.items.map(String) : [];
      out.answer = Array.isArray(q.answer) ? q.answer.slice() : [];
    } else if (t === 'match') {
      out.pairs = Array.isArray(q.pairs) ? q.pairs.map(function (p) {
        return { left: String(p.left || ''), right: String(p.right || '') };
      }) : [];
    }
    return out;
  }
  function flattenBank() {
    var all = [];
    if (!BANK || !Array.isArray(BANK.chapters)) return all;
    for (var c = 0; c < BANK.chapters.length; c++) {
      var ch = BANK.chapters[c];
      if (!ch || !Array.isArray(ch.levels)) continue;
      for (var l = 0; l < ch.levels.length; l++) {
        var lv = ch.levels[l];
        if (!lv || !Array.isArray(lv.questions)) continue;
        for (var i = 0; i < lv.questions.length; i++) {
          var nq = normQuestion(lv.questions[i]);
          if (nq) all.push({ chapterId: ch.id, levelId: lv.id, q: nq });
        }
      }
    }
    return all;
  }
  function findLevel(levelId) {
    if (!BANK) return null;
    var chs = BANK.chapters || [];
    for (var i = 0; i < chs.length; i++) {
      var lv = (chs[i].levels || []).filter(function (x) { return x.id === levelId; })[0];
      if (lv) return { chapter: chs[i], level: lv };
    }
    return null;
  }

  /* ---------------- 解锁判定 ---------------- */
  function totalStars(p) {
    var s = 0;
    if (p && p.progress) for (var k in p.progress) if (Object.prototype.hasOwnProperty.call(p.progress, k)) s += (p.progress[k].stars || 0);
    return s;
  }
  function chapterUnlocked(chapterIdx, p) {
    if (chapterIdx <= 0) return true; // 第一章恒解锁
    var num = chapterIdx + 1;
    var need = (typeof CHAPTER_UNLOCK_STARS[num] === 'number') ? CHAPTER_UNLOCK_STARS[num] : 0;
    return totalStars(p) >= need;
  }
  function levelUnlocked(chapter, levelIdx, p) {
    if (!chapterUnlocked(chapter.__idx, p)) return false;
    if (levelIdx === 0) return true;
    var prev = chapter.levels[levelIdx - 1];
    var rec = p && p.progress[prev.id];
    return !!(rec && rec.completed);
  }

  /* ---------------- DOM 引用 ---------------- */
  var els = {};
  function cacheEls() {
    els.screens = $('screens');
    els.topTitle = $('top-title');
    els.back = $('btn-back');
    els.chip = $('profile-chip');
    els.chipAvatar = $('chip-avatar');
    els.chipName = $('chip-name');
    els.warn = $('storage-warn');
    els.warnText = $('storage-warn-text');
    els.toast = $('toast');
    // overlays
    els.ovCreate = $('overlay-create');
    els.ovKnowledge = $('overlay-knowledge');
    els.ovResult = $('overlay-result');
    els.ovPause = $('overlay-pause');
    els.ovModal = $('overlay-modal');
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg, ms) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, ms || 2200);
  }

  /* ---------------- 弹窗开关（致命坑规避：隐藏即 display:none!important） ---------------- */
  function openOverlay(node) {
    if (!node) return;
    node.hidden = false;                 // 先显示（display:flex）
    requestAnimationFrame(function () { node.classList.add('show'); }); // 再触发淡入
  }
  function closeOverlay(node) {
    if (!node) return;
    node.classList.remove('show');
    node.hidden = true;                  // 立即 display:none，绝不残留透明覆盖层
  }
  function anyOverlayOpen() {
    return [els.ovCreate, els.ovKnowledge, els.ovResult, els.ovPause, els.ovModal]
      .some(function (n) { return n && !n.hidden; });
  }
  function closeAllOverlays() {
    [els.ovCreate, els.ovKnowledge, els.ovResult, els.ovPause, els.ovModal].forEach(closeOverlay);
  }

  // 通用确认弹窗
  function showModal(opts) {
    opts = opts || {};
    $('modal-title').textContent = opts.title || '提示';
    $('modal-body').innerHTML = opts.body || '';
    var acts = $('modal-actions');
    acts.innerHTML = '';
    var buttons = opts.buttons || [{ label: '知道了', primary: true, onClick: closeOverlay.bind(null, els.ovModal) }];
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.primary ? 'btn-primary' : 'btn-ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        closeOverlay(els.ovModal);
        if (b.onClick) b.onClick();
      });
      acts.appendChild(btn);
    });
    openOverlay(els.ovModal);
  }

  /* ---------------- 屏幕路由 ---------------- */
  var SCREENS = ['profiles', 'menu', 'chapters', 'levels', 'quiz', 'daily', 'settings'];
  var SCREEN_TITLE = { profiles: '档案', menu: '电亮学堂', chapters: '章节', levels: '关卡', quiz: '答题', daily: '每日挑战', settings: '设置' };
  var backStack = [];
  var state = {
    screen: 'profiles',
    chapterId: null,
    levelId: null,
    quiz: null,
    fromStartup: false
  };

  function showScreen(name, opts) {
    opts = opts || {};
    state.screen = name;
    SCREENS.forEach(function (s) {
      var node = $('screen-' + s);
      if (node) node.classList.toggle('active', s === name);
    });
    // 顶部栏
    els.topTitle.textContent = opts.title || SCREEN_TITLE[name] || '电亮学堂';
    var canBack = !!backStack.length && name !== 'profiles';
    els.back.hidden = !canBack;
    // 渲染
    if (name === 'profiles') renderProfiles();
    else if (name === 'menu') renderMenu();
    else if (name === 'chapters') renderChapters();
    else if (name === 'levels') renderLevels();
    else if (name === 'daily') renderDaily();
    else if (name === 'settings') renderSettings();
  }
  function navigate(name, opts) {
    if (state.screen && state.screen !== name) backStack.push(state.screen);
    showScreen(name, opts);
  }
  function back() {
    if (!backStack.length) { if (state.screen !== 'profiles') showScreen('profiles'); return; }
    var prev = backStack.pop();
    showScreen(prev);
  }

  /* ---------------- 档案选择与建档 ---------------- */
  var createState = { name: '', color: PROFILE_COLORS[0], icon: PROFILE_ICONS[0], editingId: null };

  function renderProfiles() {
    var list = $('profiles-list');
    list.innerHTML = '';
    if (!Profiles.list.length) {
      var empty = document.createElement('div');
      empty.className = 'page-sub';
      empty.style.padding = '20px 4px';
      empty.textContent = '还没有档案，点下方「新建档案」开始吧。';
      list.appendChild(empty);
    }
    Profiles.list.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'profile-card' + (p.id === Profiles.currentId ? ' current' : '');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<span class="pc-avatar" style="background:' + esc(p.color) + '">' + esc(p.icon) + '</span>' +
        '<div class="pc-info"><div class="pc-name">' + esc(p.name) + '</div>' +
        '<div class="pc-meta">⭐ ' + totalStars(p) + ' · 完成关卡 ' + Object.keys(p.progress).filter(function (k) { return p.progress[k].completed; }).length + '</div></div>';
      var acts = document.createElement('div');
      acts.className = 'pc-acts';
      var editBtn = document.createElement('button');
      editBtn.className = 'icon-btn'; editBtn.type = 'button'; editBtn.setAttribute('aria-label', '编辑'); editBtn.textContent = '✏️';
      editBtn.addEventListener('click', function (e) { e.stopPropagation(); openCreate(p.id); });
      acts.appendChild(editBtn);
      var delBtn = document.createElement('button');
      delBtn.className = 'icon-btn'; delBtn.type = 'button'; delBtn.setAttribute('aria-label', '删除'); delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', function (e) { e.stopPropagation(); confirmDeleteProfile(p.id); });
      acts.appendChild(delBtn);
      card.appendChild(acts);
      function pick() { Profiles.switchTo(p.id); applyProfileToUI(); navigate('menu'); }
      card.addEventListener('click', pick);
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      list.appendChild(card);
    });
  }

  function openCreate(editingId) {
    createState.editingId = editingId || null;
    var p = editingId ? Profiles.findById(editingId) : null;
    createState.name = p ? p.name : '';
    createState.color = p ? p.color : PROFILE_COLORS[0];
    createState.icon = p ? p.icon : PROFILE_ICONS[0];
    $('create-title').textContent = p ? '编辑档案' : '新建档案';
    $('btn-create-ok').textContent = p ? '保存' : '创建并开始';
    $('create-name').value = createState.name;
    // 颜色
    var cw = $('create-colors'); cw.innerHTML = '';
    PROFILE_COLORS.forEach(function (col) {
      var s = document.createElement('button');
      s.type = 'button'; s.className = 'swatch' + (col === createState.color ? ' sel' : '');
      s.style.background = col; s.setAttribute('aria-label', '颜色 ' + col);
      s.addEventListener('click', function () { createState.color = col; renderSwatches(); });
      cw.appendChild(s);
    });
    // 图标
    var iw = $('create-icons'); iw.innerHTML = '';
    PROFILE_ICONS.forEach(function (ic) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'icon-pick' + (ic === createState.icon ? ' sel' : '');
      b.textContent = ic; b.setAttribute('aria-label', '图标 ' + ic);
      b.addEventListener('click', function () { createState.icon = ic; renderIcons(); });
      iw.appendChild(b);
    });
    openOverlay(els.ovCreate);
    setTimeout(function () { try { $('create-name').focus(); } catch (e) {} }, 60);
  }
  function renderSwatches() {
    var cw = $('create-colors');
    Array.prototype.forEach.call(cw.children, function (s, i) {
      s.classList.toggle('sel', PROFILE_COLORS[i] === createState.color);
    });
  }
  function renderIcons() {
    var iw = $('create-icons');
    Array.prototype.forEach.call(iw.children, function (b, i) {
      b.classList.toggle('sel', PROFILE_ICONS[i] === createState.icon);
    });
  }
  function submitCreate() {
    var name = ($('create-name').value || '').trim() || '学员';
    if (createState.editingId) {
      Profiles.update(createState.editingId, { name: name, color: createState.color, icon: createState.icon });
      toast('已保存');
      closeOverlay(els.ovCreate);
      applyProfileToUI();
      renderProfiles();
      if (state.screen === 'settings') renderSettings();
    } else {
      var p = Profiles.create(name, createState.color, createState.icon);
      if (!p) { toast('创建失败'); return; }
      closeOverlay(els.ovCreate);
      applyProfileToUI();
      if (state.fromStartup) { state.fromStartup = false; navigate('menu'); }
      else navigate('menu');
    }
  }
  function confirmDeleteProfile(id) {
    var p = Profiles.findById(id); if (!p) return;
    showModal({
      title: '删除档案',
      body: '确定删除档案「' + esc(p.name) + '」？该档案的进度会一并清除（可先导出备份）。',
      buttons: [
        { label: '取消', primary: false },
        {
          label: '删除', primary: true, onClick: function () {
            Profiles.remove(id);
            applyProfileToUI();
            if (!Profiles.list.length) { state.fromStartup = true; backStack = []; showScreen('profiles'); toast('已删除，请新建档案'); }
            else { renderProfiles(); if (state.screen === 'settings') renderSettings(); }
          }
        }
      ]
    });
  }

  /* ---------------- 主菜单 ---------------- */
  function applyProfileToUI() {
    var p = Profiles.current();
    if (!p) {
      els.chipName.textContent = '—';
      els.chipAvatar.textContent = '⚡';
      els.chipAvatar.style.background = 'var(--green)';
    } else {
      els.chipName.textContent = p.name;
      els.chipAvatar.textContent = p.icon;
      els.chipAvatar.style.background = p.color;
    }
    applySettingsToUI();
  }
  function renderMenu() {
    var p = Profiles.current();
    var total = 0, cleared = 0, dailyDone = 0;
    if (p) {
      total = totalStars(p);
      for (var k in p.progress) if (p.progress[k].completed) cleared++;
      for (var d in p.daily) if (p.daily[d].completed) dailyDone++;
    }
    $('stat-stars').textContent = total;
    $('stat-clear').textContent = cleared;
    $('stat-daily').textContent = dailyDone;
    if (p) {
      $('menu-avatar').textContent = p.icon;
      $('menu-avatar').style.background = p.color;
      $('menu-sub').textContent = '你好，' + p.name + ' · 低压配电网知识闯关';
    }
  }

  /* ---------------- 章节选择 ---------------- */
  function renderChapters() {
    var p = Profiles.current();
    var list = $('chapters-list');
    list.innerHTML = '';
    (BANK.chapters || []).forEach(function (ch, ci) {
      ch.__idx = ci; // 临时挂 index 供解锁判定
      var unlocked = chapterUnlocked(ci, p);
      var need = (typeof CHAPTER_UNLOCK_STARS[ci + 1] === 'number') ? CHAPTER_UNLOCK_STARS[ci + 1] : 0;
      var card = document.createElement('div');
      card.className = 'chapter-card' + (unlocked ? '' : ' locked');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', unlocked ? '0' : '-1');
      card.innerHTML =
        '<span class="chapter-ico">' + esc(ch.icon || '📘') + '</span>' +
        '<div class="chapter-main"><div class="chapter-title">' + esc(ch.title) + '</div>' +
        '<div class="chapter-desc">' + esc(ch.desc || '') + '</div></div>' +
        (unlocked ? '<span class="chapter-badge">▶ 进入</span>'
          : '<span class="chapter-badge lock">🔒 需 ' + need + '★</span>');
      if (unlocked) {
        function go() { Sound.ui(); navigate('levels', { title: ch.title }); state.chapterId = ch.id; renderLevels(); }
        card.addEventListener('click', go);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      }
      list.appendChild(card);
    });
  }

  /* ---------------- 关卡选择 ---------------- */
  function renderLevels() {
    var p = Profiles.current();
    var ch = (BANK.chapters || []).filter(function (c) { return c.id === state.chapterId; })[0];
    var list = $('levels-list');
    list.innerHTML = '';
    if (!ch) { showScreen('chapters'); return; }
    ch.__idx = (BANK.chapters || []).indexOf(ch);
    $('levels-title').textContent = ch.title;
    $('levels-sub').textContent = ch.desc || '';
    ch.levels.forEach(function (lv, li) {
      var rec = p && p.progress[lv.id];
      var unlocked = levelUnlocked(ch, li, p);
      var card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', unlocked ? '0' : '-1');
      var starsHtml = '';
      if (rec) {
        for (var s = 0; s < 3; s++) starsHtml += '<span class="' + (s < rec.stars ? '' : 'star-off') + '">⭐</span>';
      }
      card.innerHTML =
        '<span class="level-ico">' + (li + 1) + '</span>' +
        '<div class="level-main"><div class="level-title">' + esc(lv.title) + '</div>' +
        '<div class="level-sub">共 ' + lv.questions.length + ' 题' + (rec ? ' · 最佳 ' + rec.bestScore + ' 分' : '') + '</div>' +
        (starsHtml ? '<div class="level-stars">' + starsHtml + '</div>' : '') + '</div>' +
        (unlocked ? '<span class="level-badge">▶</span>' : '<span class="level-lock">🔒</span>');
      if (unlocked) {
        function go() { Sound.ui(); startLevel(lv.id); }
        card.addEventListener('click', go);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      }
      list.appendChild(card);
    });
  }

  /* ---------------- 答题引擎 ---------------- */
  function startLevel(levelId) {
    var found = findLevel(levelId); if (!found) return;
    var questions = found.level.questions.map(function (q) { return normQuestion(q); }).filter(Boolean);
    state.quiz = {
      questions: questions, index: 0, correct: 0, wrong: 0,
      answers: [], levelId: levelId, isDaily: false, dateStr: null, ctrl: null
    };
    navigate('quiz', { title: found.level.title });
    renderQuestionAt(0);
  }
  function startDaily(dateStr) {
    var qs = dailyQuestionsFor(dateStr);
    state.quiz = {
      questions: qs, index: 0, correct: 0, wrong: 0,
      answers: [], levelId: null, isDaily: true, dateStr: dateStr, ctrl: null
    };
    navigate('quiz', { title: '每日挑战 · ' + dateStr });
    renderQuestionAt(0);
  }

  function renderQuestionAt(i) {
    var qz = state.quiz;
    if (i >= qz.questions.length) { finishQuiz(); return; }
    qz.index = i;
    var q = qz.questions[i];
    var pct = Math.round((i) / qz.questions.length * 100);
    $('quiz-progress-fill').style.width = pct + '%';
    $('quiz-progress-text').textContent = (i + 1) + ' / ' + qz.questions.length;
    var card = $('quiz-card');
    card.innerHTML = '';
    // 类型标签
    var tag = document.createElement('span');
    tag.className = 'qc-type';
    tag.textContent = (TYPE_LABEL[q.type] || '题') + ' · 第 ' + (i + 1) + ' 题';
    card.appendChild(tag);
    // 题干
    var h = document.createElement('p');
    h.className = 'qc-q';
    h.innerHTML = renderQuestionText(q);
    card.appendChild(h);

    var ctrl = buildController(q, card);
    qz.ctrl = ctrl;
    // 由各题型 buildController 自行调用 updateSubmit(...) 设置初始状态，
    // 避免覆盖排序等题型在初始化时已经设好的启用逻辑。
  }

  function renderQuestionText(q) {
    if (q.type === 'fill') {
      var parts = q.q.split('__');
      var html = esc(parts[0]);
      for (var i = 1; i < parts.length; i++) {
        html += '<span class="blank">＿＿</span>' + esc(parts[i]);
      }
      return html;
    }
    return esc(q.q);
  }

  function updateSubmit(ready) {
    var btn = $('btn-submit');
    btn.disabled = !ready;
  }

  // 根据题型构建交互与判定控制器
  function buildController(q, card) {
    if (q.type === 'single' || q.type === 'bool') return buildChoice(q, card, false);
    if (q.type === 'multi') return buildChoice(q, card, true);
    if (q.type === 'fill') return buildFill(q, card);
    if (q.type === 'order') return buildOrder(q, card);
    if (q.type === 'match') return buildMatch(q, card);
    return buildChoice(q, card, false);
  }

  // 单选 / 判断 / 多选
  function buildChoice(q, card, multi) {
    // 判断题型没有 options 字段，用固定的「正确 / 错误」；其余用题目选项
    var opts = (q.type === 'bool') ? ['正确', '错误'] : q.options.slice();
    var selected = {}; // index -> true
    var wrap = document.createElement('div');
    wrap.className = 'qc-options';
    var nodes = [];
    opts.forEach(function (text, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('data-i', i);
      b.setAttribute('role', multi ? 'checkbox' : 'radio');
      var key = String.fromCharCode(65 + i); // A,B,C...
      b.innerHTML = '<span class="opt-key">' + key + '</span><span class="opt-text">' + esc(text) + '</span>';
      b.addEventListener('click', function () { toggle(i); Sound.ui(); });
      wrap.appendChild(b);
      nodes.push(b);
    });
    card.appendChild(wrap);

    function toggle(i) {
      if (multi) { if (selected[i]) delete selected[i]; else selected[i] = true; }
      else { selected = {}; selected[i] = true; }
      sync();
    }
    function sync() {
      nodes.forEach(function (n, i) { n.classList.toggle('selected', !!selected[i]); });
      var ready = multi ? Object.keys(selected).length > 0 : Object.keys(selected).length === 1;
      updateSubmit(ready);
    }
    sync();

    return {
      type: q.type,
      onKey: function (k) {
        var idx = (k >= '1' && k <= '9') ? (parseInt(k, 10) - 1)
          : (k.length === 1 ? (k.toUpperCase().charCodeAt(0) - 65) : -1);
        if (idx >= 0 && idx < opts.length) { toggle(idx); }
      },
      evaluate: function () {
        var chosen = Object.keys(selected).map(Number).sort(function (a, b) { return a - b; });
        var correct;
        if (q.type === 'bool') {
          var val = (chosen.length === 1) ? (chosen[0] === 0) : null; // 0=正确,1=错误
          correct = (val === q.answer);
        } else if (multi) {
          correct = sameSet(chosen, q.answer);
        } else {
          correct = (chosen.length === 1 && chosen[0] === q.answer);
        }
        return {
          correct: correct,
          reveal: function () {
            nodes.forEach(function (n, i) {
              var isAns = (q.type === 'bool') ? (i === 0 ? q.answer : !q.answer)
                : (multi ? q.answer.indexOf(i) >= 0 : (i === q.answer));
              if (selected[i]) n.classList.add(correct ? 'correct' : 'wrong');
              else if (isAns) n.classList.add('correct');
              else n.classList.add('dim');
              n.disabled = true;
            });
          }
        };
      }
    };
  }

  // 填空
  function buildFill(q, card, rng) {
    var inputs = [];
    var row = document.createElement('div');
    row.className = 'fill-row';
    var parts = q.q.split('__');
    parts.forEach(function (part, i) {
      if (i > 0) {
        var inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'fill-input'; inp.setAttribute('aria-label', '第 ' + i + ' 空');
        inp.autocomplete = 'off';
        inp.addEventListener('input', function () { updateSubmit(allFilled()); });
        row.appendChild(inp);
        inputs.push(inp);
      }
      var span = document.createElement('span');
      span.innerHTML = esc(part);
      row.appendChild(span);
    });
    card.appendChild(row);
    function allFilled() { return inputs.every(function (x) { return x.value.trim() !== ''; }); }
    updateSubmit(allFilled());

    function accepted(arr) { return Array.isArray(arr) ? arr : [arr]; }
    return {
      type: 'fill',
      onKey: function () {},
      evaluate: function () {
        var allRight = true;
        var perBlank = inputs.map(function (inp, i) {
          var val = inp.value.trim().toLowerCase();
          var acc = accepted(q.answer[i]).map(function (a) { return String(a).trim().toLowerCase(); });
          var ok = acc.indexOf(val) >= 0;
          if (!ok) allRight = false;
          return ok;
        });
        return {
          correct: allRight,
          reveal: function () {
            inputs.forEach(function (inp, i) {
              inp.classList.add(perBlank[i] ? 'correct' : 'wrong');
              inp.disabled = true;
            });
          }
        };
      }
    };
  }

  // 排序
  function buildOrder(q, card) {
    var n = q.items.length;
    var order = shuffleSeeded(q.items.map(function (_, i) { return i; }), Math.random).map(function (x) { return x; });
    // order 为当前显示顺序，元素 = 原下标
    var wrap = document.createElement('div');
    wrap.className = 'order-list';
    var nodes = [];
    function render() {
      wrap.innerHTML = '';
      nodes = [];
      order.forEach(function (origIdx, pos) {
        var item = document.createElement('div');
        item.className = 'order-item';
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-pos', pos);
        item.innerHTML = '<span class="order-idx">' + (pos + 1) + '</span>' +
          '<span class="order-text">' + esc(q.items[origIdx]) + '</span>' +
          '<span class="order-btns"><button class="icon-btn up" type="button" aria-label="上移">▲</button>' +
          '<button class="icon-btn down" type="button" aria-label="下移">▼</button></span>';
        item.querySelector('.up').addEventListener('click', function (e) { e.stopPropagation(); move(pos, -1); });
        item.querySelector('.down').addEventListener('click', function (e) { e.stopPropagation(); move(pos, 1); });
        bindDrag(item, pos);
        wrap.appendChild(item);
        nodes.push(item);
      });
    }
    function move(pos, dir) {
      var j = pos + dir;
      if (j < 0 || j >= order.length) return;
      var t = order[pos]; order[pos] = order[j]; order[j] = t;
      Sound.ui(); render();
      updateSubmit(true); // 排序题任何顺序都可提交
    }
    function bindDrag(item, pos) {
      item.addEventListener('dragstart', function (e) {
        item.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', String(pos)); } catch (err) {}
      });
      item.addEventListener('dragend', function () { item.classList.remove('dragging'); });
      item.addEventListener('dragover', function (e) { e.preventDefault(); });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = parseInt((e.dataTransfer && e.dataTransfer.getData('text/plain')) || '-1', 10);
        if (from < 0 || from >= order.length) return;
        var moved = order.splice(from, 1)[0];
        order.splice(pos, 0, moved);
        render();
        updateSubmit(true);
      });
    }
    render();
    card.appendChild(wrap);
    updateSubmit(true);

    return {
      type: 'order',
      onKey: function () {},
      evaluate: function () {
        var ok = order.length === q.answer.length;
        for (var i = 0; ok && i < order.length; i++) if (order[i] !== q.answer[i]) ok = false;
        return {
          correct: ok,
          reveal: function () {
            nodes.forEach(function (item, pos) {
              item.classList.add(order[pos] === q.answer[pos] ? 'correct' : 'wrong');
              item.setAttribute('draggable', 'false');
              var btns = item.querySelectorAll('.order-btns button');
              Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
            });
          }
        };
      }
    };
  }

  // 连线
  function buildMatch(q, card) {
    var n = q.pairs.length;
    var rightOrder = shuffleSeeded(q.pairs.map(function (_, i) { return i; }), Math.random);
    var conn = {};        // leftIdx -> displayPos(right)
    var pending = null;   // 待配对 leftIdx
    var cols = document.createElement('div');
    cols.className = 'match-cols';
    var leftCol = document.createElement('div'); leftCol.className = 'match-col';
    var rightCol = document.createElement('div'); rightCol.className = 'match-col';
    var leftNodes = [], rightNodes = [];

    q.pairs.forEach(function (pair, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'match-item'; b.setAttribute('data-i', i);
      b.textContent = pair.left;
      b.addEventListener('click', function () { clickLeft(i); });
      leftCol.appendChild(b); leftNodes.push(b);
    });
    rightOrder.forEach(function (origIdx, disp) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'match-item'; b.setAttribute('data-disp', disp);
      b.textContent = q.pairs[origIdx].right;
      b.addEventListener('click', function () { clickRight(disp); });
      rightCol.appendChild(b); rightNodes.push(b);
    });
    cols.appendChild(leftCol); cols.appendChild(rightCol);
    card.appendChild(cols);
    updateSubmit(false);

    function refresh() {
      leftNodes.forEach(function (b, i) {
        b.classList.toggle('sel', pending === i);
        b.classList.toggle('matched', Object.prototype.hasOwnProperty.call(conn, i));
      });
      rightNodes.forEach(function (b, disp) {
        var matched = false;
        for (var k in conn) if (Object.prototype.hasOwnProperty.call(conn, k) && conn[k] === disp) matched = true;
        b.classList.toggle('sel', false);
        b.classList.toggle('matched', matched);
      });
      // 全部连完才可提交
      var done = Object.keys(conn).length === n;
      updateSubmit(done);
    }
    function clickLeft(i) {
      pending = (pending === i) ? null : i;
      Sound.ui(); refresh();
    }
    function clickRight(disp) {
      if (pending == null) return;
      // 若右项已被别的左项占用，先解除
      for (var k in conn) if (Object.prototype.hasOwnProperty.call(conn, k) && conn[k] === disp) delete conn[k];
      conn[pending] = disp;
      pending = null;
      Sound.ui(); refresh();
    }
    refresh();

    return {
      type: 'match',
      onKey: function () {},
      evaluate: function () {
        var ok = Object.keys(conn).length === n;
        for (var i = 0; ok && i < n; i++) {
          if (!Object.prototype.hasOwnProperty.call(conn, i)) { ok = false; break; }
          var disp = conn[i];
          if (rightOrder[disp] !== i) ok = false; // 右项原下标应等于左项下标
        }
        return {
          correct: ok,
          reveal: function () {
            leftNodes.forEach(function (b, i) {
              var disp = conn[i];
              var rightOrig = (typeof disp === 'number') ? rightOrder[disp] : -1;
              b.classList.add(rightOrig === i ? 'correct' : 'wrong');
              b.disabled = true;
            });
            rightNodes.forEach(function (b) { b.disabled = true; });
          }
        };
      }
    };
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var sa = a.slice().sort(function (x, y) { return x - y; });
    var sb = b.slice().sort(function (x, y) { return x - y; });
    for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  /* ---------------- 提交 / 判定 / 知识点卡片 ---------------- */
  function handleSubmit() {
    var qz = state.quiz;
    if (!qz || !qz.ctrl) return;
    if ($('btn-submit').disabled) return;
    var res = qz.ctrl.evaluate();
    res.reveal();
    $('btn-submit').disabled = true;
    // 反馈
    var fb = document.createElement('div');
    fb.className = 'qc-feedback ' + (res.correct ? 'ok' : 'no');
    fb.innerHTML = (res.correct ? '✅ 回答正确' : '❌ 回答错误') + ' · 看下方知识点';
    $('quiz-card').appendChild(fb);
    if (res.correct) { qz.correct++; Sound.correct(); }
    else { qz.wrong++; Sound.wrong(); }
    qz.answers.push({ q: qz.questions[qz.index], correct: res.correct });
    // 锁定选项
    var opts = $('quiz-card').querySelectorAll('.opt, .fill-input, .order-item, .match-item');
    Array.prototype.forEach.call(opts, function (o) { o.disabled = true; });
    // 弹知识点卡片
    showKnowledge(qz.questions[qz.index], res.correct);
  }

  function showKnowledge(q, correct) {
    $('knowledge-title').textContent = q.knowledge || '知识点';
    $('knowledge-body').innerHTML = '<span class="kb-tag">' + esc(q.knowledge || '知识点') + '</span>' +
      '<div>' + esc(q.explain || '') + '</div>';
    var btn = $('btn-knowledge-next');
    btn.textContent = (state.quiz.index >= state.quiz.questions.length - 1) ? '完成本关' : '继续';
    openOverlay(els.ovKnowledge);
  }
  function knowledgeContinue() {
    closeOverlay(els.ovKnowledge);
    var qz = state.quiz;
    qz.index++;
    if (qz.index < qz.questions.length) renderQuestionAt(qz.index);
    else finishQuiz();
  }

  /* ---------------- 结算 ---------------- */
  function finishQuiz() {
    var qz = state.quiz;
    var total = qz.questions.length;
    var acc = total ? qz.correct / total : 0;
    var stars = acc >= 0.9 ? 3 : (acc >= 0.7 ? 2 : 1);
    var score = qz.correct * BASE_SCORE;
    var p = Profiles.current();
    if (p) {
      if (qz.isDaily) {
        var prevD = p.daily[qz.dateStr] || {};
        p.daily[qz.dateStr] = { stars: Math.max(stars, prevD.stars || 0), completed: true };
      } else {
        var prev = p.progress[qz.levelId] || {};
        p.progress[qz.levelId] = {
          stars: Math.max(stars, prev.stars || 0),
          bestScore: Math.max(score, prev.bestScore || 0),
          completed: true,
          wrong: (prev.wrong || 0) + qz.wrong
        };
      }
      Profiles.save();
    }
    Sound.star(stars); Sound.complete();
    showResult(stars, score, qz);
  }

  function showResult(stars, score, qz) {
    $('result-title').textContent = qz.isDaily ? '每日挑战完成' : '关卡完成';
    var sb = $('result-stars'); sb.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var sp = document.createElement('span');
      sp.className = 'star' + (i < stars ? '' : ' off');
      sp.textContent = '⭐';
      sp.style.animationDelay = (i * 0.08) + 's';
      sb.appendChild(sp);
    }
    $('result-score').textContent = '正确率 ' + Math.round(qz.correct / qz.questions.length * 100) + '% · ' + qz.correct + '/' + qz.questions.length + ' 题 · ' + score + ' 分';
    var rows = $('result-rows'); rows.innerHTML = '';
    var wrongs = qz.answers.filter(function (a) { return !a.correct; });
    if (wrongs.length) {
      var head = document.createElement('div');
      head.className = 'page-sub'; head.style.margin = '2px 0 2px';
      head.textContent = '易错回顾（' + wrongs.length + ' 题）';
      rows.appendChild(head);
      wrongs.forEach(function (a) {
        var rr = document.createElement('div');
        rr.className = 'rr';
        rr.innerHTML = '<span class="rr-ico">📘</span><span><b>' + esc(a.q.knowledge) + '</b><br><span class="rr-q">' + esc(a.q.explain) + '</span></span>';
        rows.appendChild(rr);
      });
    } else {
      var ok = document.createElement('div');
      ok.className = 'rr';
      ok.innerHTML = '<span class="rr-ico">🎉</span><span>全部答对，知识点已收入囊中！</span>';
      rows.appendChild(ok);
    }
    // 返回按钮目标
    $('btn-result-levels').textContent = qz.isDaily ? '返回每日挑战' : '返回关卡';
    openOverlay(els.ovResult);
  }

  function resultBack() {
    closeOverlay(els.ovResult);
    if (state.quiz && state.quiz.isDaily) { navigate('daily'); }
    else if (state.chapterId) { navigate('levels', { title: (BANK.chapters.filter(function (c) { return c.id === state.chapterId; })[0] || {}).title }); }
    else showScreen('chapters');
  }
  function resultReplay() {
    closeOverlay(els.ovResult);
    if (state.quiz && state.quiz.isDaily) startDaily(state.quiz.dateStr);
    else if (state.quiz && state.quiz.levelId) startLevel(state.quiz.levelId);
  }

  /* ---------------- 暂停 ---------------- */
  function openPause() {
    if (state.screen !== 'quiz') return;
    openOverlay(els.ovPause);
  }
  function resume() { closeOverlay(els.ovPause); }
  function restartLevel() {
    closeOverlay(els.ovPause);
    if (state.quiz && state.quiz.isDaily) startDaily(state.quiz.dateStr);
    else if (state.quiz && state.quiz.levelId) startLevel(state.quiz.levelId);
  }
  function quitToLevels() {
    closeOverlay(els.ovPause);
    if (state.quiz && state.quiz.isDaily) navigate('daily');
    else if (state.chapterId) { navigate('levels', { title: (BANK.chapters.filter(function (c) { return c.id === state.chapterId; })[0] || {}).title }); }
    else showScreen('chapters');
  }

  /* ---------------- 每日挑战 ---------------- */
  function dailyQuestionsFor(dateStr) {
    var all = flattenBank();
    var rng = mulberry32(hashString('PL2-DAILY-' + dateStr));
    var shuffled = shuffleSeeded(all, rng);
    return shuffled.slice(0, Math.min(DAILY_COUNT, shuffled.length)).map(function (x) { return x.q; });
  }
  function renderDaily() {
    var p = Profiles.current();
    var today = todayStr();
    var box = $('daily-today');
    var qs = dailyQuestionsFor(today);
    var rec = p && p.daily[today];
    box.className = 'daily-today' + (rec && rec.completed ? ' done' : '');
    var starsHtml = '';
    if (rec) { for (var s = 0; s < 3; s++) starsHtml += (s < rec.stars ? '⭐' : '<span class="s-off">☆</span>'); }
    box.innerHTML =
      '<div class="daily-date">' + today + '</div>' +
      '<div class="daily-h">今日题库 · ' + qs.length + ' 题</div>' +
      '<div class="daily-meta">' + (rec && rec.completed ? '今日已完成 ' + starsHtml : '按本地日期生成，每天一张新题库') + '</div>';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-block';
    btn.textContent = (rec && rec.completed) ? '再做一次（覆盖最佳）' : '开始挑战';
    btn.addEventListener('click', function () { Sound.ui(); startDaily(today); });
    box.appendChild(btn);

    // 近期战绩（往日灰显，不补做）
    var hist = $('daily-history'); hist.innerHTML = '';
    for (var d = 1; d <= DAILY_HISTORY_DAYS; d++) {
      var dt = new Date(); dt.setDate(dt.getDate() - d);
      var ds = todayStr(dt);
      var r = p && p.daily[ds];
      var card = document.createElement('div');
      card.className = 'dh-card locked';
      var hs = '';
      if (r && r.completed) { for (var k = 0; k < 3; k++) hs += (k < r.stars ? '⭐' : '<span class="s-off">☆</span>'); }
      else hs = '<span class="s-off">🔒</span>';
      card.innerHTML = '<div class="dh-date">' + ds.slice(5) + '</div><div class="dh-stars">' + hs + '</div>';
      hist.appendChild(card);
    }
  }

  /* ---------------- 设置 ---------------- */
  function applySettingsToUI() {
    var p = Profiles.current();
    var reduce = p ? !!p.settings.reduceMotion : false;
    var sound = p ? !!p.settings.sound : true;
    document.documentElement.classList.toggle('reduce-motion', reduce);
    Sound.setEnabled(sound);
    var sc = $('set-sound'), rc = $('set-reduce');
    if (sc) sc.checked = sound;
    if (rc) rc.checked = reduce;
  }
  function renderSettings() {
    var p = Profiles.current();
    $('settings-profile-name').textContent = p ? p.name : '—';
    $('settings-note').textContent = LS.mode === 'memory'
      ? '⚠️ 当前为「内存模式」：进度仅本次有效，关闭页面后丢失。请及时导出备份，或把本游戏放到 http(s):// 下打开以启用本地存档。'
      : '存档已启用（localStorage）。可随时导出 JSON 备份，或在其他设备导入恢复。';
    applySettingsToUI();
  }
  function setSetting(key, val) {
    var p = Profiles.current(); if (!p) return;
    p.settings[key] = val;
    p.updatedAt = Date.now();
    Profiles.save();
    applySettingsToUI();
  }

  /* ---------------- 导出 / 导入 ---------------- */
  function exportProfiles(list, filename) {
    var payload = { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), profiles: list };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename || ('dianliangxuetang-' + todayStr() + '.json');
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 100);
  }
  function exportCurrent() {
    var p = Profiles.current();
    if (!p) { toast('请先创建档案'); return; }
    exportProfiles([p], 'dianliangxuetang-' + safeName(p.name) + '-' + todayStr() + '.json');
    toast('已导出');
  }
  function exportAll() {
    if (!Profiles.list.length) { toast('没有可导出的档案'); return; }
    exportProfiles(Profiles.list, 'dianliangxuetang-all-' + todayStr() + '.json');
    toast('已导出全部档案');
  }
  function importFromFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!data || data.version !== EXPORT_VERSION || !Array.isArray(data.profiles)) {
          toast('导入失败：版本不符或格式错误');
          return;
        }
        var r = Profiles.merge(data.profiles);
        applyProfileToUI();
        var where = state.screen === 'settings' ? renderSettings() : (state.screen === 'profiles' ? renderProfiles() : null);
        toast('导入完成：新增 ' + r.added + ' · 覆盖 ' + r.updated + (r.skipped ? ' · 跳过 ' + r.skipped : ''));
      } catch (e) {
        toast('导入失败：文件已损坏');
      }
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(file);
  }

  /* ---------------- 键盘 ---------------- */
  function onKeydown(e) {
    // 知识点卡片：Enter 继续
    if (!els.ovKnowledge.hidden) {
      if (e.key === 'Enter') { e.preventDefault(); knowledgeContinue(); }
      return;
    }
    // 暂停：Esc 恢复
    if (!els.ovPause.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); resume(); }
      return;
    }
    // 其它弹窗开启时不拦截（确认/建档/结算用按钮）
    if (anyOverlayOpen()) return;
    // 答题中
    if (state.screen === 'quiz' && state.quiz && state.quiz.ctrl) {
      if (e.key === 'Escape') { e.preventDefault(); openPause(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (!$('btn-submit').disabled) handleSubmit(); return; }
      if (state.quiz.ctrl.onKey) state.quiz.ctrl.onKey(e.key);
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    els.back.addEventListener('click', function () {
      if (state.screen === 'quiz') { openPause(); return; }
      Sound.ui(); back();
    });
    els.chip.addEventListener('click', function () { Sound.ui(); navigate('profiles'); });

    // 主菜单卡片
    Array.prototype.forEach.call(document.querySelectorAll('.menu-card'), function (card) {
      card.addEventListener('click', function () {
        Sound.ui();
        navigate(card.getAttribute('data-go'));
      });
    });

    // 建档
    $('btn-new-profile').addEventListener('click', function () { Sound.ui(); openCreate(null); });
    $('btn-create-cancel').addEventListener('click', function () { closeOverlay(els.ovCreate); });
    $('btn-create-ok').addEventListener('click', function () { submitCreate(); });

    // 导入入口
    $('btn-import').addEventListener('click', function () { Sound.ui(); $('import-file').click(); });
    $('btn-import2').addEventListener('click', function () { Sound.ui(); $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      importFromFile(f);
      e.target.value = '';
    });

    // 答题 / 结算 / 暂停
    $('btn-submit').addEventListener('click', function () { handleSubmit(); });
    $('btn-pause').addEventListener('click', function () { openPause(); });
    $('btn-knowledge-next').addEventListener('click', function () { knowledgeContinue(); });
    $('btn-result-levels').addEventListener('click', function () { resultBack(); });
    $('btn-result-replay').addEventListener('click', function () { resultReplay(); });
    $('btn-resume').addEventListener('click', function () { resume(); });
    $('btn-restart').addEventListener('click', function () { restartLevel(); });
    $('btn-quit').addEventListener('click', function () { quitToLevels(); });

    // 设置
    $('set-sound').addEventListener('change', function (e) { setSetting('sound', e.target.checked); });
    $('set-reduce').addEventListener('change', function (e) { setSetting('reduceMotion', e.target.checked); });
    $('btn-export').addEventListener('click', function () { Sound.ui(); exportCurrent(); });
    $('btn-switch').addEventListener('click', function () { Sound.ui(); navigate('profiles'); });
    $('btn-edit-profile').addEventListener('click', function () { Sound.ui(); openCreate(Profiles.currentId); });
    $('btn-delete-profile').addEventListener('click', function () { if (Profiles.currentId) confirmDeleteProfile(Profiles.currentId); });

    // 降级提示条导出
    $('btn-warn-export').addEventListener('click', function () { Sound.ui(); exportAll(); });

    document.addEventListener('keydown', onKeydown);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (!BANK || !Array.isArray(BANK.chapters)) {
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#1F2D27">题库加载失败：请确认 questions.js 已正确引入。</div>';
      return;
    }
    cacheEls();
    bindEvents();

    // 存储降级提示
    if (!LS.available) {
      els.warn.hidden = false;
      els.warnText.textContent = '本地存档不可用（' + (LS.reason || '当前环境') + '），进度仅本次有效，请及时导出备份。';
    } else {
      LS.onDegrade(function (why) {
        els.warn.hidden = false;
        els.warnText.textContent = '本地存档写入失败，已切换为内存模式，进度仅本次有效，请及时导出备份。';
      });
    }

    Profiles.load();
    applyProfileToUI();

    if (!Profiles.list.length) {
      // 首次：建档引导
      state.fromStartup = true;
      backStack = [];
      showScreen('profiles');
      openCreate(null);
    } else {
      showScreen('menu');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
