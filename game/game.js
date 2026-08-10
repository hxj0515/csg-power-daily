/*!
 * 电亮全城 PowerLink —— 核心引擎与界面
 * ------------------------------------------------------------------
 * 纯 vanilla JS · 无构建 · 无 CDN · 无 fetch · file:// 双击可玩
 * 依赖：必须在本文件之前引入 levels.js
 *
 * 分层：
 *   §1 文案常量  §2 工具  §3 存储(降级安全)  §4 档案  §5 音效(WebAudio 合成)
 *   §6 棋盘核心模型（纯逻辑，可在 Node 中单测）  §7 渲染  §8 界面与路由
 * ------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  /* ================================================================
   * §0 配置读取
   *    真正的旋钮面板在 levels.js 顶部的 CONFIG。
   *    这里只做"读取 + 兜底"，保证即使 levels.js 被替换成精简版，
   *    本文件也不会因为读到 undefined 而崩。
   * ================================================================ */
  var DEFAULT_CFG = {
    ALL_PACKS_OPEN: false,
    PACK_UNLOCK: { p1: 0, p2: 22, p3: 50, p4: 80 },
    LEVELS_PER_PACK: 15,
    STAR3_REQUIRE_FULL: true,
    STAR2_COVER_PERCENT: 80,
    MOVES_AFFECT_STARS: false,
    HINT_PENALTY_MAX_STAR: 2,
    DAILY_ALLOW_MAKEUP: false,
    DAILY_HISTORY_DAYS: 7,
    SOUND_DEFAULT_ON: true
  };
  var CFG = (function () {
    var src = root.POWERLINK_CONFIG || {};
    var out = {}, k;
    for (k in DEFAULT_CFG) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_CFG, k)) continue;
      out[k] = Object.prototype.hasOwnProperty.call(src, k) ? src[k] : DEFAULT_CFG[k];
    }
    if (!out.PACK_UNLOCK || typeof out.PACK_UNLOCK !== 'object') out.PACK_UNLOCK = DEFAULT_CFG.PACK_UNLOCK;
    return out;
  })();

  /** 使用提示后本局星级上限（产品拍板：2★；重玩不用提示仍可拿 3★） */
  var HINT_PENALTY_MAX_STAR = CFG.HINT_PENALTY_MAX_STAR | 0;
  /** 2★ 覆盖率门槛，整数百分比（比较时用整数乘法，不做浮点除法） */
  var STAR2_COVER_PERCENT = CFG.STAR2_COVER_PERCENT | 0;
  /** 满星（3★）总数常量 */
  var MAX_STAR = 3;

  /* ================================================================
   * §1 文案（集中管理，便于统一改）
   * ================================================================ */
  var TEXT = {
    appName: '电亮全城',
    win: '送电成功！',
    winFull: '全城 100% 覆盖，满负荷运行',
    winPartial: '已通电，但还有区域没接上',
    star1: '基本送电',
    star2: '覆盖良好',
    star3: '满负荷 · 完美',
    hintUsed: '本局用过提示，结算封顶 ' + HINT_PENALTY_MAX_STAR + '★（重玩不使用可拿回 ' + MAX_STAR + '★）',
    hintCapRow: '封顶 ' + HINT_PENALTY_MAX_STAR + '★',
    noStorage: '当前为「不保存」模式：这个环境（多为 file:// 直接双击）不允许写入本地存储，'
      + '进度只存在内存里，关掉页面就没了。想留住进度请点右侧「导出存档」，或把整个 game/ 放到 http:// 下打开。',
    noStorageShort: '不保存模式 · 进度仅存内存',
    noStorageNote: '本地存储不可用，已自动切换到内存存储。游戏功能全部正常，但刷新或关闭页面后进度会丢失；'
      + '请用「导出当前档案」把进度存成 JSON 文件，下次用「导入 JSON」接着玩。',
    storageOk: '本地存储可用，进度会自动保存在这台设备的浏览器里。',
    degradedRuntime: '本地存储写入失败（可能是隐私模式或容量已满），已切到内存存储，请尽快导出存档。',
    profileMax: '最多创建 6 个档案',
    nudge: '卡住了？点「提示」看一条正确走法，不扣星以外的任何东西。',
    saved: '已保存',
    imported: '导入完成',
    importBad: '这段 JSON 认不出来，请检查是否为 PowerLink 导出的存档',
    copied: '已复制到剪贴板',
    copyFail: '复制失败，请手动全选文本复制',
    dailyNoMakeup: '每日挑战不能补做，只有今天这张图可以玩',
    dailyRolled: '已经跨天了，给你换上今天的新电网'
  };

  var MAX_PROFILES = 6;
  var STORAGE_PROFILES = 'powerlink:profiles:v1';
  var STORAGE_CURRENT = 'powerlink:current:v1';
  var AVATAR_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star', 'cross', 'ring'];
  var AVATAR_COLORS = ['#38e1ff', '#ffb02e', '#ff4f6d', '#4ade5f', '#b07bff', '#ff8ad8', '#f2ef7a', '#00c2a8'];

  /* ================================================================
   * §2 工具
   * ================================================================ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sgn(v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); }
  function pad2(v) { return v < 10 ? ('0' + v) : ('' + v); }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function shiftDate(dateStr, deltaDays) {
    var p = String(dateStr).split('-');
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    d.setDate(d.getDate() + deltaDays);
    return todayStr(d);
  }
  function uid() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function hex2rgb(h) {
    h = String(h || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    if (isNaN(v)) return [255, 255, 255];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(h, a) {
    var c = hex2rgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mixWhite(h, t) {
    var c = hex2rgb(h);
    return 'rgb(' + Math.round(c[0] + (255 - c[0]) * t) + ',' +
      Math.round(c[1] + (255 - c[1]) * t) + ',' +
      Math.round(c[2] + (255 - c[2]) * t) + ')';
  }

  /* ================================================================
   * §3 存储（file:// 下可能不可用 -> 降级到内存，绝不抛错）
   * ================================================================ */
  var LS = (function () {
    var mem = {};          // 降级后的内存存储
    var ok = false;        // 当前是否真的能写 localStorage
    var reason = '';       // 降级原因，便于排查
    var listeners = [];    // 运行时降级回调（UI 用来弹提示条）

    // 探测：必须实测一次 setItem + removeItem。
    // 只判断 typeof localStorage 是不够的 —— file://、隐私模式、
    // 关闭 Cookie 的场景里对象存在但一写就抛。
    try {
      var t = '__pl_probe__';
      if (!root.localStorage) throw new Error('no localStorage');
      root.localStorage.setItem(t, '1');
      if (root.localStorage.getItem(t) !== '1') throw new Error('readback mismatch');
      root.localStorage.removeItem(t);
      ok = true;
    } catch (e) {
      ok = false;
      reason = (e && e.message) || 'unknown';
    }

    function degrade(why) {
      if (!ok) return;
      ok = false;
      reason = why || 'runtime write failure';
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](reason); } catch (err) { /* 回调不允许影响存储本身 */ }
      }
    }

    var api = {
      /** 探测结果：false 表示走内存存储 */
      available: ok,
      /** 'local' | 'memory' */
      mode: ok ? 'local' : 'memory',
      reason: reason,
      /** 注册降级回调；若已经处于降级态，立即回调一次 */
      onDegrade: function (fn) {
        if (typeof fn !== 'function') return;
        listeners.push(fn);
        if (!ok) { try { fn(reason); } catch (e) { } }
      },
      get: function (k) {
        if (ok) {
          try {
            var v = root.localStorage.getItem(k);
            // localStorage 里没有、内存里有 → 用内存（写失败降级后的续命值）
            if (v == null && Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
            return v;
          } catch (e) {
            degrade('read failure: ' + ((e && e.message) || ''));
            api.available = false; api.mode = 'memory'; api.reason = reason;
          }
        }
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      set: function (k, v) {
        // 无论如何都往内存写一份：这样即便 localStorage 中途失效，
        // 当前会话的数据也不会凭空消失。
        mem[k] = v;
        if (ok) {
          try { root.localStorage.setItem(k, v); return true; }
          catch (e) {
            degrade('write failure: ' + ((e && e.message) || ''));
            api.available = false; api.mode = 'memory'; api.reason = reason;
            return false;
          }
        }
        return false;
      }
    };
    return api;
  })();

  /* ================================================================
   * §4 档案
   * ================================================================ */
  function normLevelRec(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      stars: clamp(r.stars | 0, 0, 3),
      bestMoves: (typeof r.bestMoves === 'number' && isFinite(r.bestMoves) && r.bestMoves > 0) ? (r.bestMoves | 0) : 0,
      completed: !!r.completed
    };
  }

  function normProfile(p) {
    if (!p || typeof p !== 'object') return null;
    var out = {
      id: (typeof p.id === 'string' && p.id) ? p.id : uid(),
      name: String(p.name == null ? '' : p.name).trim().slice(0, 16) || '调度员',
      color: AVATAR_COLORS.indexOf(p.color) >= 0 ? p.color : AVATAR_COLORS[0],
      icon: AVATAR_SHAPES.indexOf(p.icon) >= 0 ? p.icon : AVATAR_SHAPES[0],
      createdAt: (typeof p.createdAt === 'number' && isFinite(p.createdAt)) ? p.createdAt : Date.now(),
      updatedAt: (typeof p.updatedAt === 'number' && isFinite(p.updatedAt)) ? p.updatedAt : Date.now(),
      levels: {},
      daily: {},
      settings: {
        // 音效默认值由 CFG.SOUND_DEFAULT_ON 决定（拍板：默认开）；
        // 只有存档里显式写了 false 才关闭，避免旧存档缺字段就被静音。
        sound: (p.settings && typeof p.settings.sound === 'boolean')
          ? p.settings.sound
          : !!CFG.SOUND_DEFAULT_ON,
        reduceMotion: !!(p.settings && p.settings.reduceMotion)
      }
    };
    var k, r;
    if (p.levels && typeof p.levels === 'object') {
      for (k in p.levels) {
        if (!Object.prototype.hasOwnProperty.call(p.levels, k)) continue;
        r = normLevelRec(p.levels[k]);
        if (r) out.levels[String(k).slice(0, 40)] = r;
      }
    }
    if (p.daily && typeof p.daily === 'object') {
      for (k in p.daily) {
        if (!Object.prototype.hasOwnProperty.call(p.daily, k)) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        r = p.daily[k];
        if (!r || typeof r !== 'object') continue;
        out.daily[k] = { stars: clamp(r.stars | 0, 0, 3), completed: !!r.completed };
      }
    }
    return out;
  }

  var Profiles = {
    list: [],
    currentId: null,

    load: function () {
      var raw = LS.get(STORAGE_PROFILES);
      var arr = [];
      try {
        var parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
          for (var i = 0; i < parsed.length; i++) {
            var np = normProfile(parsed[i]);
            if (np) arr.push(np);
          }
        }
      } catch (e) { arr = []; }
      this.list = arr.slice(0, MAX_PROFILES);
      var cur = LS.get(STORAGE_CURRENT);
      this.currentId = this.findById(cur) ? cur : (this.list.length ? this.list[0].id : null);
      return this.list;
    },

    save: function () {
      try {
        LS.set(STORAGE_PROFILES, JSON.stringify(this.list));
        LS.set(STORAGE_CURRENT, this.currentId || '');
      } catch (e) { /* 存储配额/隐私模式：静默降级 */ }
    },

    findById: function (id) {
      for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
      return null;
    },

    current: function () { return this.findById(this.currentId); },

    create: function (name, color, icon) {
      if (this.list.length >= MAX_PROFILES) return null;
      var p = normProfile({ name: name, color: color, icon: icon, id: uid() });
      this.list.push(p);
      this.currentId = p.id;
      this.save();
      return p;
    },

    rename: function (id, name) {
      var p = this.findById(id);
      if (!p) return false;
      p.name = String(name || '').trim().slice(0, 16) || p.name;
      p.updatedAt = Date.now();
      this.save();
      return true;
    },

    restyle: function (id, color, icon) {
      var p = this.findById(id);
      if (!p) return false;
      if (AVATAR_COLORS.indexOf(color) >= 0) p.color = color;
      if (AVATAR_SHAPES.indexOf(icon) >= 0) p.icon = icon;
      p.updatedAt = Date.now();
      this.save();
      return true;
    },

    remove: function (id) {
      var idx = -1;
      for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) idx = i;
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

    /** 合并导入：同 id 覆盖，新 id 追加 */
    merge: function (incoming) {
      var added = 0, updated = 0, skipped = 0;
      for (var i = 0; i < incoming.length; i++) {
        var np = normProfile(incoming[i]);
        if (!np) { skipped++; continue; }
        var exist = this.findById(np.id);
        if (exist) {
          for (var j = 0; j < this.list.length; j++) {
            if (this.list[j].id === np.id) { this.list[j] = np; break; }
          }
          updated++;
        } else if (this.list.length < MAX_PROFILES) {
          this.list.push(np);
          added++;
        } else { skipped++; }
      }
      if (!this.currentId && this.list.length) this.currentId = this.list[0].id;
      this.save();
      return { added: added, updated: updated, skipped: skipped };
    },

    /** 记录成绩：星级只增不减，步数只降不升 */
    recordLevel: function (levelId, stars, moves) {
      var p = this.current();
      if (!p) return null;
      var rec = p.levels[levelId] || { stars: 0, bestMoves: 0, completed: false };
      var improved = { star: false, moves: false };
      if (stars > rec.stars) { rec.stars = stars; improved.star = true; }
      if (moves > 0 && (!rec.bestMoves || moves < rec.bestMoves)) { rec.bestMoves = moves; improved.moves = true; }
      rec.completed = rec.completed || stars >= 1;
      p.levels[levelId] = rec;
      p.updatedAt = Date.now();
      this.save();
      return { rec: rec, improved: improved };
    },

    recordDaily: function (dateStr, stars) {
      var p = this.current();
      if (!p) return null;
      var rec = p.daily[dateStr] || { stars: 0, completed: false };
      if (stars > rec.stars) rec.stars = stars;
      rec.completed = rec.completed || stars >= 1;
      p.daily[dateStr] = rec;
      p.updatedAt = Date.now();
      this.save();
      return rec;
    },

    totalStars: function () {
      var p = this.current();
      if (!p) return 0;
      var t = 0;
      for (var k in p.levels) {
        if (Object.prototype.hasOwnProperty.call(p.levels, k)) t += p.levels[k].stars | 0;
      }
      return t;
    },

    clearedCount: function () {
      var p = this.current();
      if (!p) return 0;
      var t = 0;
      for (var k in p.levels) {
        if (Object.prototype.hasOwnProperty.call(p.levels, k) && p.levels[k].completed) t++;
      }
      return t;
    },

    dailyStreak: function () {
      var p = this.current();
      if (!p) return 0;
      var d = todayStr(), n = 0, guard = 0;
      // 今天没打不算断，从昨天起算
      if (!(p.daily[d] && p.daily[d].completed)) d = shiftDate(d, -1);
      while (guard++ < 400 && p.daily[d] && p.daily[d].completed) {
        n++;
        d = shiftDate(d, -1);
      }
      return n;
    }
  };

  /* ================================================================
   * §5 音效（WebAudio 实时合成，零音频资源）
   * ================================================================ */
  var Sound = (function () {
    var ctx = null;
    function enabled() {
      var p = Profiles.current();
      return !!(p && p.settings && p.settings.sound);
    }
    function ac() {
      if (ctx) return ctx;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; }
      return ctx;
    }
    function tone(freq, dur, type, gain, delay) {
      if (!enabled()) return;
      var c = ac();
      if (!c) return;
      try {
        if (c.state === 'suspended' && c.resume) c.resume();
        var t0 = c.currentTime + (delay || 0);
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain || 0.06, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) { /* 音频不可用时静默 */ }
    }
    var lastTick = 0;
    return {
      unlock: function () { var c = ac(); if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) { } } },
      tick: function () {
        var now = Date.now();
        if (now - lastTick < 45) return;
        lastTick = now;
        tone(520, 0.045, 'square', 0.018);
      },
      connect: function () { tone(660, 0.10, 'triangle', 0.07); tone(990, 0.12, 'sine', 0.05, 0.05); },
      cut: function () { tone(180, 0.07, 'sawtooth', 0.025); },
      win: function () {
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.07, i * 0.085); });
      },
      ui: function () { tone(420, 0.05, 'sine', 0.03); }
    };
  })();

  /* ================================================================
   * §6 棋盘核心模型（纯逻辑 · 无 DOM 依赖 · 可单测）
   * ================================================================ */
  function createBoard(level) {
    var n = level.size | 0;
    var TOT = n * n;
    var pairs = level.pairs;
    var K = pairs.length;
    var owner = new Int16Array(TOT);   // 每格归属的配对索引，-1 为空
    var epAt = new Int16Array(TOT);    // 每格是否为端点及其配对索引，-1 为否
    var paths = new Array(K);
    var drag = null;
    var api;

    function ix(r, c) { return r * n + c; }
    function inB(r, c) { return r >= 0 && c >= 0 && r < n && c < n; }
    function clearCell(r, c) { var k = ix(r, c); owner[k] = epAt[k] >= 0 ? epAt[k] : -1; }
    function push(p, r, c) { paths[p].push([r, c]); owner[ix(r, c)] = p; }
    function truncAfter(p, pos) {
      var path = paths[p];
      while (path.length - 1 > pos) {
        var cell = path.pop();
        clearCell(cell[0], cell[1]);
      }
    }
    function posIn(p, r, c) {
      var path = paths[p];
      for (var i = 0; i < path.length; i++) if (path[i][0] === r && path[i][1] === c) return i;
      return -1;
    }

    function reset() {
      var i, j;
      for (i = 0; i < TOT; i++) { owner[i] = -1; epAt[i] = -1; }
      for (i = 0; i < K; i++) {
        paths[i] = [];
        var e = pairs[i].endpoints;
        for (j = 0; j < 2; j++) {
          var k = ix(e[j][0], e[j][1]);
          epAt[k] = i;
          owner[k] = i;   // 端点恒占格
        }
      }
      api.moves = 0;
      drag = null;
    }

    function sig() {
      var s = '';
      for (var i = 0; i < K; i++) {
        var p = paths[i];
        s += i + '#';
        for (var j = 0; j < p.length; j++) s += p[j][0] + '.' + p[j][1] + ',';
        s += '|';
      }
      return s;
    }

    function snapshot() {
      var out = new Array(K);
      for (var i = 0; i < K; i++) {
        var src = paths[i], dst = new Array(src.length);
        for (var j = 0; j < src.length; j++) dst[j] = [src[j][0], src[j][1]];
        out[i] = dst;
      }
      return { paths: out, moves: api.moves, sig: sig() };
    }

    function restore(snap) {
      if (!snap || !snap.paths) return false;
      var i, j;
      for (i = 0; i < TOT; i++) owner[i] = epAt[i] >= 0 ? epAt[i] : -1;
      for (i = 0; i < K; i++) {
        paths[i] = [];
        var src = snap.paths[i] || [];
        for (j = 0; j < src.length; j++) {
          if (!inB(src[j][0], src[j][1])) continue;
          push(i, src[j][0], src[j][1]);
        }
      }
      api.moves = snap.moves | 0;
      drag = null;
      return true;
    }

    /** 单步延伸；返回是否发生变化 */
    function step(nr, nc) {
      if (!drag || !inB(nr, nc)) return false;
      var p = drag.pair, path = paths[p];
      if (!path.length) return false;
      var head = path[path.length - 1];
      if (Math.abs(head[0] - nr) + Math.abs(head[1] - nc) !== 1) return false;

      // a) 撞到自己已铺的格 -> 回撤/截断到该点（含反向拖回上一格）
      var sp = posIn(p, nr, nc);
      if (sp >= 0) {
        if (sp === path.length - 1) return false;
        truncAfter(p, sp);
        drag.done = false;
        return true;
      }
      if (drag.done) return false;   // 已抵达另一端点，不可继续外延

      var k = ix(nr, nc);
      var ep = epAt[k];
      if (ep >= 0 && ep !== p) return false;      // 他色端点不可穿越
      if (ep === p) {                              // 抵达同色另一端点 -> 合闸
        push(p, nr, nc);
        drag.done = true;
        drag.connected = true;
        return true;
      }

      // b) 撞到他色线路 -> 该色从被撞点起截断到尾部（标准 Flow 行为）
      var o = owner[k];
      if (o >= 0 && o !== p) {
        var op = posIn(o, nr, nc);
        if (op >= 0) truncAfter(o, op - 1); else clearCell(nr, nc);
        drag.cutOther = true;
      }
      push(p, nr, nc);
      return true;
    }

    function beginAt(r, c) {
      if (!inB(r, c)) return false;
      var before = snapshot();
      var k = ix(r, c);
      var ep = epAt[k];
      if (ep >= 0) {
        truncAfter(ep, -1);              // 点端点即重画该色
        push(ep, r, c);
        drag = { pair: ep, done: false, before: before, sig0: before.sig };
        return true;
      }
      var o = owner[k];
      if (o >= 0) {
        var pos = posIn(o, r, c);
        if (pos < 0) return false;
        truncAfter(o, pos);              // 从线路中段续画
        drag = { pair: o, done: false, before: before, sig0: before.sig };
        return true;
      }
      return false;
    }

    /**
     * 拖到 (r,c)。快速拖拽时指针可能跨越多格，这里逐格插值推进，
     * 优先沿差值较大的轴走，走不通再换另一轴，走不动就停下。
     */
    function dragTo(r, c) {
      if (!drag || !inB(r, c)) return false;
      var changed = false, guard = 0, limit = 4 * n + 8;
      while (guard++ < limit) {
        var path = paths[drag.pair];
        if (!path.length) break;
        var head = path[path.length - 1];
        var dr = r - head[0], dc = c - head[1];
        if (dr === 0 && dc === 0) break;
        var a = [sgn(dr), 0], b = [0, sgn(dc)];
        var order = Math.abs(dr) >= Math.abs(dc) ? [a, b] : [b, a];
        var moved = false;
        for (var t = 0; t < 2; t++) {
          var d = order[t];
          if (d[0] === 0 && d[1] === 0) continue;
          if (step(head[0] + d[0], head[1] + d[1])) { moved = true; changed = true; break; }
        }
        if (!moved) break;
      }
      return changed;
    }

    function endDrag() {
      if (!drag) return null;
      var d = drag;
      drag = null;
      // 只剩起点的"路径"没有任何意义（点一下端点就松手），归零后再比对，
      // 避免把"点一下端点"错记成一步。
      if (paths[d.pair].length === 1) truncAfter(d.pair, -1);
      var changed = sig() !== d.sig0;
      if (changed) api.moves++;
      return { changed: changed, before: d.before, pair: d.pair, connected: !!d.connected, cutOther: !!d.cutOther };
    }

    function cancelDrag() {
      if (!drag) return false;
      var b = drag.before;
      drag = null;
      restore(b);
      return true;
    }

    function isConnected(p) {
      var path = paths[p];
      if (!path || path.length < 2) return false;
      var a = path[0], b = path[path.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) return false;
      return epAt[ix(a[0], a[1])] === p && epAt[ix(b[0], b[1])] === p;
    }

    function connectedCount() {
      var t = 0;
      for (var i = 0; i < K; i++) if (isConnected(i)) t++;
      return t;
    }

    function filledCount() {
      var t = 0;
      for (var i = 0; i < TOT; i++) if (owner[i] >= 0) t++;
      return t;
    }

    api = {
      level: level,
      n: n,
      total: TOT,
      pairCount: K,
      moves: 0,
      reset: reset,
      ownerAt: function (r, c) { return inB(r, c) ? owner[ix(r, c)] : -1; },
      endpointAt: function (r, c) { return inB(r, c) ? epAt[ix(r, c)] : -1; },
      pathOf: function (p) { return paths[p]; },
      inBounds: inB,
      beginAt: beginAt,
      dragTo: dragTo,
      endDrag: endDrag,
      cancelDrag: cancelDrag,
      isDragging: function () { return !!drag; },
      dragPair: function () { return drag ? drag.pair : -1; },
      dragDone: function () { return !!(drag && drag.done); },
      clearPair: function (p) {
        if (p < 0 || p >= K) return false;
        if (!paths[p].length) return false;
        truncAfter(p, -1);
        return true;
      },
      isConnected: isConnected,
      connectedCount: connectedCount,
      filledCount: filledCount,
      /** 总格数（整数），星级与 HUD 一律基于它做整数运算 */
      cellCount: TOT,
      /** 仅供文案展示的比率；判定逻辑禁止使用 */
      coverage: function () { return filledCount() / TOT; },
      /**
       * 展示用整数百分比，向下取整。
       * 用 floor 而不是 round，保证"没铺满就绝不显示 100%"。
       */
      coverPercent: function () {
        var f = filledCount();
        if (f >= TOT) return 100;
        return Math.floor((f * 100) / TOT);
      },
      isSolved: function () { return connectedCount() === K; },
      /**
       * 星级判定 —— 全整数计数，无任何浮点比较（产品决策 #6）。
       *   0★ 未全部接通
       *   1★ 全部接通
       *   2★ 全部接通 且 filled*100 >= TOT*80
       *   3★ 全部接通 且 filled === TOT（严格满铺）
       * 步数不参与星级（CFG.MOVES_AFFECT_STARS = false）。
       */
      stars: function () {
        if (connectedCount() !== K) return 0;
        var filled = filledCount();
        if (filled >= TOT) return 3;                                  // 整数相等：满铺
        if (filled * 100 >= TOT * STAR2_COVER_PERCENT) return 2;      // 整数乘法：>=80%
        return 1;
      },
      snapshot: snapshot,
      restore: restore,
      sig: sig
    };

    reset();
    return api;
  }

  // 导出核心供自检脚本使用
  root.PowerLinkCore = {
    createBoard: createBoard,
    normProfile: normProfile,
    Profiles: Profiles,
    TEXT: TEXT,
    CFG: CFG,
    LS: LS,
    HINT_PENALTY_MAX_STAR: HINT_PENALTY_MAX_STAR
  };

  /* ================================================================
   * 无 DOM 环境（Node 自检）到此为止
   * ================================================================ */
  if (typeof document === 'undefined' || !document.createElement) return;

  /* ================================================================
   * §7 渲染（单 canvas + devicePixelRatio）
   * ================================================================ */
  var COL = {
    bg: '#0b1020',
    panel: '#121a30',
    grid: '#1e2a44',
    cell: '#0e1730',
    text: '#e6f0ff',
    cyan: '#38e1ff',
    amber: '#ffb02e'
  };

  function traceShape(ctx, shape, x, y, r) {
    var i, a, px, py, rr;
    ctx.beginPath();
    switch (shape) {
      case 'square':
        var s = r * 0.86, rad = r * 0.26;
        ctx.moveTo(x - s + rad, y - s);
        ctx.lineTo(x + s - rad, y - s); ctx.quadraticCurveTo(x + s, y - s, x + s, y - s + rad);
        ctx.lineTo(x + s, y + s - rad); ctx.quadraticCurveTo(x + s, y + s, x + s - rad, y + s);
        ctx.lineTo(x - s + rad, y + s); ctx.quadraticCurveTo(x - s, y + s, x - s, y + s - rad);
        ctx.lineTo(x - s, y - s + rad); ctx.quadraticCurveTo(x - s, y - s, x - s + rad, y - s);
        ctx.closePath();
        break;
      case 'triangle':
        ctx.moveTo(x, y - r * 1.08);
        ctx.lineTo(x + r * 0.97, y + r * 0.70);
        ctx.lineTo(x - r * 0.97, y + r * 0.70);
        ctx.closePath();
        break;
      case 'diamond':
        ctx.moveTo(x, y - r * 1.14); ctx.lineTo(x + r * 1.14, y);
        ctx.lineTo(x, y + r * 1.14); ctx.lineTo(x - r * 1.14, y);
        ctx.closePath();
        break;
      case 'hexagon':
        for (i = 0; i < 6; i++) {
          a = Math.PI / 180 * (60 * i - 90);
          px = x + Math.cos(a) * r * 1.08; py = y + Math.sin(a) * r * 1.08;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        break;
      case 'star':
        for (i = 0; i < 10; i++) {
          a = Math.PI / 180 * (36 * i - 90);
          rr = (i % 2 === 0) ? r * 1.18 : r * 0.52;
          px = x + Math.cos(a) * rr; py = y + Math.sin(a) * rr;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        break;
      case 'cross':
        var t = r * 0.36, L = r * 1.06;
        ctx.moveTo(x - t, y - L); ctx.lineTo(x + t, y - L); ctx.lineTo(x + t, y - t);
        ctx.lineTo(x + L, y - t); ctx.lineTo(x + L, y + t); ctx.lineTo(x + t, y + t);
        ctx.lineTo(x + t, y + L); ctx.lineTo(x - t, y + L); ctx.lineTo(x - t, y + t);
        ctx.lineTo(x - L, y + t); ctx.lineTo(x - L, y - t); ctx.lineTo(x - t, y - t);
        ctx.closePath();
        break;
      case 'ring':
        ctx.arc(x, y, r * 1.02, 0, Math.PI * 2, false);
        ctx.moveTo(x + r * 0.52, y);
        ctx.arc(x, y, r * 0.52, 0, Math.PI * 2, true);
        break;
      default:
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
    }
  }

  /** 生成头像 SVG（内联，无外部资源） */
  function avatarSVG(shape, color, px) {
    px = px || 34;
    var body;
    switch (shape) {
      case 'square': body = '<rect x="5.5" y="5.5" width="13" height="13" rx="3"/>'; break;
      case 'triangle': body = '<polygon points="12,4.4 19.6,18 4.4,18"/>'; break;
      case 'diamond': body = '<polygon points="12,3.8 20.2,12 12,20.2 3.8,12"/>'; break;
      case 'hexagon': body = '<polygon points="12,3.8 19.1,8 19.1,16 12,20.2 4.9,16 4.9,8"/>'; break;
      case 'star': body = '<polygon points="12,4 14.12,9.09 19.61,9.53 15.42,13.11 16.7,18.47 12,15.6 7.3,18.47 8.58,13.11 4.39,9.53 9.88,9.09"/>'; break;
      case 'cross': body = '<polygon points="9.6,4 14.4,4 14.4,9.6 20,9.6 20,14.4 14.4,14.4 14.4,20 9.6,20 9.6,14.4 4,14.4 4,9.6 9.6,9.6"/>'; break;
      case 'ring': body = '<circle cx="12" cy="12" r="6.4" fill="none" stroke="' + color + '" stroke-width="3.6"/>'; break;
      default: body = '<circle cx="12" cy="12" r="7"/>'; break;
    }
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false" fill="' + color + '">' + body + '</svg>';
  }

  /* ================================================================
   * §8 界面
   * ================================================================ */
  var $ = function (sel, r) { return (r || document).querySelector(sel); };
  var LEVELS = root.POWERLINK_LEVELS || [];
  var PACKS = root.POWERLINK_PACKS || [];
  var TOTAL_STARS_MAX = LEVELS.length * MAX_STAR;

  /* ---------- 关卡包解锁（产品决策 #1） ----------
   * 累计星数松门槛：p1 全开 / p2 22★ / p3 50★ / p4 80★。
   * CFG.ALL_PACKS_OPEN = true 时一键全开，下面所有判断直接短路。 */

  function packNeed(packId) {
    if (CFG.ALL_PACKS_OPEN) return 0;
    var n = CFG.PACK_UNLOCK[packId];
    return typeof n === 'number' && n > 0 ? (n | 0) : 0;
  }
  function packUnlocked(packId, totalStars) {
    var need = packNeed(packId);
    if (need <= 0) return true;
    return (totalStars | 0) >= need;
  }
  /** 还差几星解锁；已解锁返回 0 */
  function packGap(packId, totalStars) {
    var need = packNeed(packId);
    if (need <= 0) return 0;
    var gap = need - (totalStars | 0);
    return gap > 0 ? gap : 0;
  }
  /** 某关是否可进入（按其所属包判断） */
  function levelUnlocked(index, totalStars) {
    var lv = LEVELS[index];
    if (!lv) return false;
    if (totalStars == null) totalStars = Profiles.totalStars();
    return packUnlocked(lv.pack, totalStars);
  }
  function packById(id) {
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === id) return PACKS[i];
    return null;
  }
  function packName(id) {
    var p = packById(id);
    return p ? p.name : id;
  }

  var state = {
    screen: 'menu',
    level: null,
    board: null,
    mode: 'level',
    levelIndex: -1,
    usedHint: false,
    resets: 0,
    startedAt: 0,
    nudged: false,
    undo: [],
    hint: null,
    kb: { r: 0, c: 0, active: false, drawing: false },
    raf: 0,
    lastFinishStars: 0
  };

  var els = {};
  var canvas, ctx;
  var geo = { ox: 0, oy: 0, cell: 24, dpr: 1, w: 0, h: 0 };
  var reduceMotionMQ = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function motionOff() {
    var p = Profiles.current();
    if (p && p.settings && p.settings.reduceMotion) return true;
    return !!(reduceMotionMQ && reduceMotionMQ.matches);
  }

  /* ---------- 通用 UI 组件 ---------- */
  var toastTimer = 0;
  function toast(msg, ms) {
    var t = els.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2400);
  }

  var modalOnClose = null;
  function openModal(opts) {
    els.modalTitle.textContent = opts.title || '';
    els.modalBody.innerHTML = opts.body || '';
    els.modalActions.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        Sound.ui();
        if (a.onClick) { if (a.onClick() === false) return; }
        if (a.keepOpen !== true) closeModal();
      });
      els.modalActions.appendChild(b);
    });
    els.modal.hidden = false;
    modalOnClose = opts.onClose || null;
    els.modal.classList.add('show');
    if (opts.onOpen) opts.onOpen(els.modalBody);
  }
  function closeModal() {
    els.modal.classList.remove('show');
    els.modal.hidden = true;
    els.modalBody.innerHTML = '';
    if (modalOnClose) { var f = modalOnClose; modalOnClose = null; f(); }
  }

  function starsHTML(n, total) {
    total = total || 3;
    var s = '';
    for (var i = 0; i < total; i++) s += '<i class="star' + (i < n ? ' on' : '') + '"></i>';
    return '<span class="stars-inline">' + s + '</span>';
  }

  /* ---------- 屏幕路由 ---------- */
  var SCREEN_META = {
    menu: { title: '电亮全城', back: null },
    profiles: { title: '档案管理', back: 'menu' },
    levels: { title: '闯关模式', back: 'menu' },
    daily: { title: '每日挑战', back: 'menu' },
    game: { title: '送电中', back: 'levels' },
    settings: { title: '设置', back: 'menu' }
  };

  function showScreen(name) {
    if (!SCREEN_META[name]) name = 'menu';
    if (state.screen === 'game' && name !== 'game') stopLoop();
    state.screen = name;
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
    var el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');

    var meta = SCREEN_META[name];
    els.topTitle.textContent = name === 'game' && state.level ? state.level.name : meta.title;
    els.back.hidden = !meta.back;
    els.back.dataset.target = meta.back || '';
    els.chip.hidden = (name === 'game');

    if (name === 'menu') renderMenu();
    if (name === 'levels') renderLevelGrid();
    if (name === 'profiles') renderProfiles();
    if (name === 'daily') renderDaily();
    if (name === 'settings') renderSettings();
    if (name === 'game') { resizeCanvas(); startLoop(); }
    try { root.scrollTo(0, 0); } catch (e) { }
  }

  /* ---------- 顶部档案芯片 ---------- */
  function renderChip() {
    var p = Profiles.current();
    if (!p) {
      els.chipAvatar.innerHTML = avatarSVG('circle', '#39456b', 22);
      els.chipName.textContent = '未建档';
      return;
    }
    els.chipAvatar.innerHTML = avatarSVG(p.icon, p.color, 22);
    els.chipName.textContent = p.name;
  }

  /* ---------- 主菜单 ---------- */
  /**
   * 「继续闯关」指向哪一关：
   *   1) 已解锁包里第一个未通关的关
   *   2) 都通了 → 已解锁包里最后一关（并在副标题提示下一包门槛）
   * 永远不会指向锁定包，避免点了就被弹回。
   */
  function nextPlayableIndex() {
    var p = Profiles.current();
    var total = Profiles.totalStars();
    var lastUnlocked = -1, i;
    for (i = 0; i < LEVELS.length; i++) {
      if (!packUnlocked(LEVELS[i].pack, total)) continue;
      lastUnlocked = i;
      var rec = p ? p.levels[LEVELS[i].id] : null;
      if (!rec || !rec.completed) return i;
    }
    return lastUnlocked < 0 ? 0 : lastUnlocked;
  }

  /** 下一个还锁着的包（用于提示"再拿 X★ 解锁 XXX"）；没有则 null */
  function nextLockedPack() {
    var total = Profiles.totalStars();
    for (var i = 0; i < PACKS.length; i++) {
      if (!packUnlocked(PACKS[i].id, total)) {
        return { pack: PACKS[i], gap: packGap(PACKS[i].id, total) };
      }
    }
    return null;
  }

  function renderMenu() {
    renderChip();
    var p = Profiles.current();
    els.statStars.textContent = Profiles.totalStars() + ' / ' + TOTAL_STARS_MAX;
    els.statClear.textContent = Profiles.clearedCount() + ' / ' + LEVELS.length;
    els.statStreak.textContent = Profiles.dailyStreak();

    var nextIdx = nextPlayableIndex();
    if (!LEVELS.length) {
      els.menuContinue.textContent = '暂无关卡';
      els.menuContinue.dataset.index = '0';
    } else {
      var lv = LEVELS[nextIdx];
      var rec = p ? p.levels[lv.id] : null;
      var lockInfo = nextLockedPack();
      if (rec && rec.completed && lockInfo) {
        // 已解锁内容全通：把注意力引到解锁门槛上
        els.menuContinue.textContent = '再拿 ' + lockInfo.gap + '★ 解锁「' + lockInfo.pack.name + '」';
      } else {
        els.menuContinue.textContent = '下一关 · ' + lv.id + ' ' + lv.name;
      }
      els.menuContinue.dataset.index = nextIdx;
    }

    var d = todayStr();
    var drec = p && p.daily[d];
    els.menuDaily.textContent = drec && drec.completed
      ? ('今日已完成 · ' + drec.stars + '★')
      : ('今天的电网 · ' + d);
  }

  /* ---------- 关卡选择 ---------- */
  var LOCK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
    '<rect x="4.5" y="10" width="15" height="10.5" rx="2.2" fill="currentColor"/>' +
    '<path d="M8 10V7.4a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  function renderLevelGrid() {
    renderChip();
    var p = Profiles.current();
    var total = Profiles.totalStars();
    var html = '';
    var byPack = {};
    LEVELS.forEach(function (lv, i) {
      (byPack[lv.pack] = byPack[lv.pack] || []).push({ lv: lv, i: i });
    });

    PACKS.forEach(function (pk) {
      var items = byPack[pk.id] || [];
      if (!items.length) return;
      var got = 0, max = items.length * MAX_STAR;
      items.forEach(function (it) { got += (p && p.levels[it.lv.id] ? p.levels[it.lv.id].stars : 0); });

      var unlocked = packUnlocked(pk.id, total);
      var gap = packGap(pk.id, total);
      var need = packNeed(pk.id);

      html += '<div class="pack' + (unlocked ? '' : ' locked') + '">' +
        '<div class="pack-head">' +
        '<h3>' + (unlocked ? '' : '<span class="lock-ico" aria-hidden="true">' + LOCK_SVG + '</span>') + esc(pk.name) + '</h3>' +
        '<span class="pack-meta">' + esc(pk.desc) + ' · ' +
        (unlocked ? (got + '/' + max + '★') : ('需 ' + need + '★')) +
        '</span></div>';

      if (!unlocked) {
        // 锁定包：不渲染任何可点击的关卡格，只给一条清晰的进度条和差距说明
        var pct = need > 0 ? Math.floor((Math.min(total, need) * 100) / need) : 100;
        html += '<div class="lock-strip" role="note">' +
          '<div class="ls-top"><span class="lock-ico" aria-hidden="true">' + LOCK_SVG + '</span>' +
          '<b>还差 ' + gap + '★ 解锁本包</b></div>' +
          '<div class="ls-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="ls-sub">当前累计 ' + total + '★ / 需要 ' + need + '★ · 共 ' + items.length + ' 关（' +
          items[0].lv.size + '×' + items[0].lv.size + ' 起）</div>' +
          '</div></div>';
        return;
      }

      html += '<div class="level-grid">';
      items.forEach(function (it) {
        var rec = p ? p.levels[it.lv.id] : null;
        var st = rec ? rec.stars : 0;
        html += '<button type="button" class="level-tile' + (rec && rec.completed ? ' done' : '') + '" data-index="' + it.i + '" ' +
          'aria-label="第' + (it.i + 1) + '关 ' + esc(it.lv.name) + '，' + it.lv.size + '乘' + it.lv.size +
          '，' + it.lv.pairs.length + '条线路，已获得' + st + '星">' +
          '<span class="lt-no">' + (it.i + 1) + '</span>' +
          '<span class="lt-name">' + esc(it.lv.name) + '</span>' +
          starsHTML(st) +
          '<span class="lt-size">' + it.lv.size + '×' + it.lv.size + ' · ' + it.lv.pairs.length + '路</span>' +
          '</button>';
      });
      html += '</div></div>';
    });

    els.levelWrap.innerHTML = html;
    els.levelsProgress.textContent = total + ' / ' + TOTAL_STARS_MAX + ' ★';
  }

  /* ---------- 每日挑战 ----------
   * 产品决策 #4：种子 = 设备本地日期 YYYY-MM-DD，不允许补做往日。
   * 因此这里只生成"今天"这一张图；历史区纯只读战绩，格子不可点。 */

  /** 只允许玩当天；CFG.DAILY_ALLOW_MAKEUP=true 时才放开补做 */
  function dailyPlayable(dateStr) {
    if (CFG.DAILY_ALLOW_MAKEUP) return true;
    return String(dateStr) === todayStr();
  }

  function renderDaily() {
    renderChip();
    var d = todayStr();
    var lv = root.PowerLinkDaily(d);   // 只生成当天，往日一律不生成
    var p = Profiles.current();
    var rec = p ? p.daily[d] : null;
    els.dailyDate.textContent = d;
    els.dailyMeta.textContent = lv.size + '×' + lv.size + ' · ' + lv.pairs.length + ' 条线路 · 全员同题';
    els.dailyStars.innerHTML = rec
      ? (starsHTML(rec.stars) + '<span class="muted"> 今日已完成</span>')
      : '<span class="muted">今日尚未挑战</span>';
    els.dailyPlay.textContent = rec && rec.completed ? '再挑战一次' : '开始今日电网';
    els.dailyPlay.disabled = false;

    var days = Math.max(1, CFG.DAILY_HISTORY_DAYS | 0);
    var hist = '';
    for (var i = days - 1; i >= 0; i--) {
      var ds = shiftDate(d, -i);
      var r = p ? p.daily[ds] : null;
      var isToday = (ds === d);
      var done = !!(r && r.completed);
      // 往日一律 locked：既没通关记录也不能补做，只显示"—"
      var cls = 'dh-item' + (done ? ' done' : '') + (isToday ? ' today' : '') +
        (!isToday && !done ? ' locked' : '');
      var body = done
        ? starsHTML(r.stars)
        : (isToday ? '<span class="dh-todo">待挑战</span>' : '<span class="dh-miss" aria-label="未参加，不可补做">—</span>');
      hist += '<div class="' + cls + '" aria-label="' + ds + (isToday ? ' 今天' : ' 已过期，不可补做') + '">' +
        '<b>' + ds.slice(5) + '</b>' + body + '</div>';
    }
    els.dailyHistory.innerHTML = hist;
    els.dailyStreakTxt.textContent = Profiles.dailyStreak();
    if (els.dailyNoMakeup) {
      els.dailyNoMakeup.textContent = CFG.DAILY_ALLOW_MAKEUP
        ? '往日关卡可补做。'
        : '往日关卡不可补做：每天只有当天这一张图，错过就只留一条“—”。';
    }
  }

  /* ---------- 档案管理 ---------- */
  function renderProfiles() {
    renderChip();
    var html = '';
    if (!Profiles.list.length) {
      html = '<div class="empty">还没有任何档案。点右上角「新建档案」开始。</div>';
    }
    Profiles.list.forEach(function (p) {
      var stars = 0, cleared = 0, k;
      for (k in p.levels) {
        if (!Object.prototype.hasOwnProperty.call(p.levels, k)) continue;
        stars += p.levels[k].stars | 0;
        if (p.levels[k].completed) cleared++;
      }
      var isCur = p.id === Profiles.currentId;
      html += '<div class="profile-card' + (isCur ? ' current' : '') + '">' +
        '<div class="pc-avatar" style="--pc:' + p.color + '">' + avatarSVG(p.icon, p.color, 30) + '</div>' +
        '<div class="pc-info"><b>' + esc(p.name) + (isCur ? '<span class="tag">使用中</span>' : '') + '</b>' +
        '<span>' + stars + '★ · 通关 ' + cleared + '/' + LEVELS.length + '</span></div>' +
        '<div class="pc-acts">' +
        (isCur ? '' : '<button type="button" class="mini" data-act="use" data-id="' + p.id + '">切换</button>') +
        '<button type="button" class="mini" data-act="edit" data-id="' + p.id + '">编辑</button>' +
        '<button type="button" class="mini danger" data-act="del" data-id="' + p.id + '">删除</button>' +
        '</div></div>';
    });
    els.profileList.innerHTML = html;
    els.newProfile.disabled = Profiles.list.length >= MAX_PROFILES;
  }

  function profileFormHTML(p) {
    var colors = AVATAR_COLORS.map(function (c, i) {
      return '<button type="button" class="swatch' + ((p && p.color === c) || (!p && i === 0) ? ' on' : '') +
        '" data-color="' + c + '" style="background:' + c + '" aria-label="颜色 ' + (i + 1) + '"></button>';
    }).join('');
    var shapes = AVATAR_SHAPES.map(function (s, i) {
      return '<button type="button" class="shape-pick' + ((p && p.icon === s) || (!p && i === 0) ? ' on' : '') +
        '" data-shape="' + s + '" aria-label="图标 ' + (i + 1) + '">' + avatarSVG(s, '#e6f0ff', 22) + '</button>';
    }).join('');
    return '<label class="field"><span>档案名称</span>' +
      '<input type="text" id="pf-name" maxlength="16" placeholder="例如：小李" value="' + esc(p ? p.name : '') + '"></label>' +
      '<div class="field"><span>主题色</span><div class="swatches">' + colors + '</div></div>' +
      '<div class="field"><span>图标（同时用于色盲辨识）</span><div class="swatches">' + shapes + '</div></div>';
  }

  function bindProfileForm(body, sel) {
    body.addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('[data-color]') : null;
      var s = e.target.closest ? e.target.closest('[data-shape]') : null;
      if (c) {
        sel.color = c.getAttribute('data-color');
        Array.prototype.forEach.call(body.querySelectorAll('[data-color]'), function (n) { n.classList.remove('on'); });
        c.classList.add('on');
      }
      if (s) {
        sel.icon = s.getAttribute('data-shape');
        Array.prototype.forEach.call(body.querySelectorAll('[data-shape]'), function (n) { n.classList.remove('on'); });
        s.classList.add('on');
      }
    });
  }

  function openCreateProfile(forced) {
    var sel = { color: AVATAR_COLORS[0], icon: AVATAR_SHAPES[0] };
    openModal({
      title: '新建档案',
      body: profileFormHTML(null),
      actions: (forced ? [] : [{ label: '取消', cls: 'btn-ghost' }]).concat([{
        label: '创建', cls: 'btn-primary', onClick: function () {
          var name = ($('#pf-name') || {}).value || '';
          if (!name.trim()) { toast('给档案起个名字吧'); return false; }
          if (!Profiles.create(name, sel.color, sel.icon)) { toast(TEXT.profileMax); return false; }
          renderProfiles(); renderChip(); renderMenu();
          toast('档案「' + name.trim() + '」已创建');
        }
      }]),
      onOpen: function (body) {
        bindProfileForm(body, sel);
        var i = $('#pf-name'); if (i) setTimeout(function () { try { i.focus(); } catch (e) { } }, 60);
      }
    });
  }

  function openEditProfile(id) {
    var p = Profiles.findById(id);
    if (!p) return;
    var sel = { color: p.color, icon: p.icon };
    openModal({
      title: '编辑档案',
      body: profileFormHTML(p),
      actions: [
        { label: '取消', cls: 'btn-ghost' },
        {
          label: '保存', cls: 'btn-primary', onClick: function () {
            var name = ($('#pf-name') || {}).value || p.name;
            Profiles.rename(id, name);
            Profiles.restyle(id, sel.color, sel.icon);
            renderProfiles(); renderChip();
            toast(TEXT.saved);
          }
        }
      ],
      onOpen: function (body) { bindProfileForm(body, sel); }
    });
  }

  function openDeleteProfile(id) {
    var p = Profiles.findById(id);
    if (!p) return;
    openModal({
      title: '删除档案',
      body: '<p>确定删除档案「<b>' + esc(p.name) + '</b>」吗？该档案的全部关卡星级与每日挑战记录都会被清除，且无法撤销。</p>' +
        '<p class="muted">建议先导出备份。</p>',
      actions: [
        { label: '取消', cls: 'btn-ghost' },
        {
          label: '导出备份', onClick: function () {
            openExport([p], 'powerlink-profile-' + safeName(p.name) + '-' + todayStr() + '.json');
            return false;
          }, keepOpen: true
        },
        {
          label: '确认删除', cls: 'btn-danger', onClick: function () {
            Profiles.remove(id);
            renderProfiles(); renderChip(); renderMenu();
            toast('已删除');
            if (!Profiles.list.length) setTimeout(function () { openCreateProfile(true); }, 260);
          }
        }
      ]
    });
  }

  function safeName(s) {
    return String(s || 'profile').replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 20) || 'profile';
  }

  /* ---------- 导入 / 导出 ---------- */
  function exportPayload(profiles) {
    return {
      app: 'powerlink',
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: profiles
    };
  }

  function openExport(profiles, filename) {
    var text = JSON.stringify(exportPayload(profiles), null, 2);
    openModal({
      title: '导出存档',
      body: '<p class="muted">共 ' + profiles.length + ' 个档案。点「下载」保存文件；若浏览器拦截下载，可直接全选下方文本复制保存。</p>' +
        '<textarea id="ex-text" class="json-area" readonly spellcheck="false"></textarea>',
      actions: [
        { label: '关闭', cls: 'btn-ghost' },
        {
          label: '复制文本', onClick: function () {
            var ta = $('#ex-text');
            if (!ta) return false;
            var done = false;
            try { ta.select(); ta.setSelectionRange(0, ta.value.length); done = document.execCommand('copy'); } catch (e) { done = false; }
            if (!done && root.navigator && root.navigator.clipboard) {
              try { root.navigator.clipboard.writeText(text); done = true; } catch (e) { }
            }
            toast(done ? TEXT.copied : TEXT.copyFail);
            return false;
          }, keepOpen: true
        },
        {
          label: '下载 JSON', cls: 'btn-primary', onClick: function () {
            downloadText(filename, text);
            return false;
          }, keepOpen: true
        }
      ],
      onOpen: function () { var ta = $('#ex-text'); if (ta) ta.value = text; }
    });
  }

  function downloadText(filename, text) {
    try {
      var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      var url = (root.URL || root.webkitURL).createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); (root.URL || root.webkitURL).revokeObjectURL(url); } catch (e) { }
      }, 400);
      toast('已导出 ' + filename);
    } catch (e) {
      toast('下载被拦截，请复制文本保存');
    }
  }

  function parseImport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    var arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.profiles)) arr = data.profiles;
    else if (data && typeof data === 'object' && (data.levels || data.name)) arr = [data];
    if (!arr) return null;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var np = normProfile(arr[i]);
      if (np) out.push(np);
    }
    return out.length ? out : null;
  }

  function openImport() {
    openModal({
      title: '导入存档',
      body: '<p class="muted">选择之前导出的 JSON 文件，或直接把 JSON 文本粘贴到下方。合并规则：同 id 覆盖，新 id 追加（上限 ' + MAX_PROFILES + ' 个档案）。</p>' +
        '<button type="button" class="btn" id="im-file">选择文件…</button>' +
        '<textarea id="im-text" class="json-area" placeholder="或在此粘贴 JSON…" spellcheck="false"></textarea>',
      actions: [
        { label: '取消', cls: 'btn-ghost' },
        {
          label: '导入', cls: 'btn-primary', onClick: function () {
            var ta = $('#im-text');
            var res = parseImport(ta ? ta.value : '');
            if (!res) { toast(TEXT.importBad); return false; }
            var r = Profiles.merge(res);
            renderProfiles(); renderChip(); renderMenu();
            toast(TEXT.imported + '：新增 ' + r.added + '，覆盖 ' + r.updated + (r.skipped ? '，跳过 ' + r.skipped : ''));
          }
        }
      ],
      onOpen: function () {
        var btn = $('#im-file');
        if (btn) {
          btn.addEventListener('click', function () {
            if (els.fileInput) els.fileInput.click();
          });
        }
      }
    });
  }

  /* ---------- 设置 ---------- */
  function renderSettings() {
    renderChip();
    var p = Profiles.current();
    els.setSound.checked = !!(p && p.settings.sound);
    els.setMotion.checked = !!(p && p.settings.reduceMotion);
    els.storageNote.textContent = LS.available ? TEXT.storageOk : TEXT.noStorageNote;
    els.storageNote.className = 'tip' + (LS.available ? '' : ' tip-warn');
    applyStorageMode();
  }

  /* ---------- file:// 降级（产品决策 #5） ----------
   * localStorage 不可用时：
   *   1) 顶部常驻提示条（不可关闭，跟随所有界面）
   *   2) 所有「导出」按钮高亮成主 CTA，并加脉冲描边
   *   3) 顶部提示条自带一个「立即导出」直达按钮
   *   4) 游戏其余功能完全照常（存档写内存）
   * 探测失败与运行时写入失败走同一套处理。 */
  var EXPORT_BTN_IDS = ['btn-export-one', 'btn-export-all', 'btn-set-export', 'btn-warn-export'];

  function applyStorageMode() {
    var degraded = !LS.available;
    if (els.warnBar) {
      els.warnBar.hidden = !degraded;
      if (degraded && els.warnText) els.warnText.textContent = TEXT.noStorage;
    }
    if (document.body) {
      // 供 CSS 做全局降级样式（例如给导出按钮加脉冲）
      if (degraded) document.body.classList.add('no-storage');
      else document.body.classList.remove('no-storage');
    }
    for (var i = 0; i < EXPORT_BTN_IDS.length; i++) {
      var b = document.getElementById(EXPORT_BTN_IDS[i]);
      if (!b) continue;
      if (degraded) {
        b.classList.add('btn-attn');
        if (!b.hasAttribute('data-plain-cls')) b.setAttribute('data-plain-cls', '1');
      } else {
        b.classList.remove('btn-attn');
      }
    }
  }

  /**
   * 存储降级的统一处理。
   * @param {boolean} runtime true = 运行中掉线（需要额外弹 toast 提醒），
   *                          false = 启动探测就不可用（顶部提示条已足够，不再打扰）
   */
  function onStorageDegraded(runtime) {
    applyStorageMode();
    if (state.screen === 'settings') renderSettings();
    if (runtime) toast(TEXT.degradedRuntime, 5200);
  }

  /* ================================================================
   * 游戏流程
   * ================================================================ */
  function startLevel(index) {
    if (index < 0 || index >= LEVELS.length) return;
    // 解锁守卫：任何入口（关卡格、继续闯关、结算"下一关"）都过这一道
    var total = Profiles.totalStars();
    var lv0 = LEVELS[index];
    if (!packUnlocked(lv0.pack, total)) {
      toast('「' + packName(lv0.pack) + '」还差 ' + packGap(lv0.pack, total) + '★ 解锁');
      showScreen('levels');
      return;
    }
    state.mode = 'level';
    state.levelIndex = index;
    loadLevel(lv0);
  }

  function startDaily() {
    // 跨天守卫：页面开着过了零点，重新取"现在的今天"，绝不沿用旧日期
    var d = todayStr();
    if (state.mode === 'daily' && state.level && state.level.date && state.level.date !== d) {
      toast(TEXT.dailyRolled);
    }
    if (!dailyPlayable(d)) { toast(TEXT.dailyNoMakeup); return; }
    state.mode = 'daily';
    state.levelIndex = -1;
    loadLevel(root.PowerLinkDaily(d));
  }

  function loadLevel(level) {
    state.level = level;
    state.board = createBoard(level);
    state.usedHint = false;
    state.resets = 0;
    state.startedAt = Date.now();
    state.nudged = false;
    state.undo = [];
    state.hint = null;
    state.kb.active = false;
    state.kb.drawing = false;
    state.kb.r = level.pairs[0].endpoints[0][0];
    state.kb.c = level.pairs[0].endpoints[0][1];
    els.gameName.textContent = level.name;
    var p = Profiles.current();
    var rec = p ? (level.daily ? p.daily[level.date] : p.levels[level.id]) : null;
    els.gameMeta.textContent = level.size + '×' + level.size + ' · ' + level.pairs.length + ' 条线路' +
      (rec && rec.bestMoves ? ' · 最佳 ' + rec.bestMoves + ' 步' : '');
    renderLegend();
    updateHUD();
    showScreen('game');
  }

  function renderLegend() {
    var b = state.board, lv = state.level;
    if (!b) return;
    var html = '';
    for (var i = 0; i < lv.pairs.length; i++) {
      var pr = lv.pairs[i];
      var on = b.isConnected(i);
      html += '<span class="lg' + (on ? ' on' : '') + '" style="--lc:' + pr.color + '">' +
        avatarSVG(pr.shape, pr.color, 14) + '<i>' + (on ? '已通电' : '待连接') + '</i></span>';
    }
    els.legend.innerHTML = html;
  }

  function updateHUD() {
    var b = state.board;
    if (!b) return;
    // HUD 也走整数：filled/TOT 直接比较，避免出现"99.6% 显示成 100%"的错觉
    var filled = b.filledCount();
    var tot = b.cellCount;
    els.hudPairs.textContent = b.connectedCount() + '/' + b.pairCount;
    els.hudCover.textContent = b.coverPercent() + '%';
    els.hudMoves.textContent = b.moves;
    els.hudCover.className = filled >= tot ? 'good' : (filled * 100 >= tot * STAR2_COVER_PERCENT ? 'ok' : '');
    els.undoBtn.disabled = state.undo.length === 0;
  }

  function pushUndo(snap) {
    state.undo.push(snap);
    if (state.undo.length > 60) state.undo.shift();
  }

  function doUndo() {
    if (!state.undo.length) return;
    var snap = state.undo.pop();
    state.board.restore(snap);
    renderLegend();
    updateHUD();
    Sound.ui();
  }

  function doReset() {
    if (!state.board) return;
    pushUndo(state.board.snapshot());
    state.board.reset();
    state.resets++;
    renderLegend();
    updateHUD();
    Sound.cut();
    maybeNudge();
  }

  function maybeNudge() {
    if (state.nudged || state.usedHint) return;
    var longStay = (Date.now() - state.startedAt) > 180000;
    if (state.resets >= 5 || longStay) {
      state.nudged = true;
      toast(TEXT.nudge, 4200);
    }
  }

  function doHint() {
    var b = state.board, lv = state.level;
    if (!b) return;
    var candidates = [];
    for (var i = 0; i < lv.pairs.length; i++) {
      if (!b.isConnected(i) && lv.pairs[i].solution && lv.pairs[i].solution.length > 1) candidates.push(i);
    }
    if (!candidates.length) {
      // 全连通但未满铺时，提示"最短的那条参考解"帮助重排
      for (var j = 0; j < lv.pairs.length; j++) {
        var sol = lv.pairs[j].solution || [];
        var cur = b.pathOf(j) || [];
        if (sol.length && cur.length !== sol.length) candidates.push(j);
      }
    }
    if (!candidates.length) { toast('已经是满铺解了'); return; }
    var pick = candidates[0];
    var full = lv.pairs[pick].solution;
    var show = full.slice(0, Math.max(3, Math.ceil(full.length * 0.55)));
    state.hint = { pair: pick, cells: show, until: Date.now() + 1800 };
    if (!state.usedHint) {
      state.usedHint = true;
      toast(TEXT.hintUsed, 3200);
    }
    Sound.ui();
  }

  function finishLevel() {
    var b = state.board, lv = state.level;
    var raw = b.stars();
    // 提示惩罚：本局封顶（常量开关，重玩不用提示照样能拿满星）
    var cap = state.usedHint ? HINT_PENALTY_MAX_STAR : MAX_STAR;
    var stars = raw < cap ? raw : cap;
    state.lastFinishStars = stars;
    Sound.win();

    var filled = b.filledCount();
    var tot = b.cellCount;
    var cov = b.coverPercent();
    var res, best = 0;
    if (state.mode === 'daily') {
      Profiles.recordDaily(lv.date, stars);
    } else {
      res = Profiles.recordLevel(lv.id, stars, b.moves);
      var p = Profiles.current();
      if (p && p.levels[lv.id]) best = p.levels[lv.id].bestMoves;
    }

    var sub = filled >= tot ? TEXT.winFull : (TEXT.winPartial + '（覆盖率 ' + cov + '%）');
    els.resultTitle.textContent = TEXT.win;
    els.resultSub.textContent = sub;
    els.resultStars.innerHTML = starsHTML(stars);
    els.resultStars.className = 'stars-big s' + stars + (motionOff() ? ' nomotion' : '');

    var rows = '<div class="rr"><span>覆盖率</span><b>' + filled + '/' + tot + ' 格 · ' + cov + '%</b></div>' +
      '<div class="rr"><span>本局步数</span><b>' + b.moves + ' 步<i class="rr-note">（不计入星级）</i></b></div>';
    if (state.mode !== 'daily' && best) rows += '<div class="rr"><span>个人最佳</span><b>' + best + ' 步</b></div>';
    if (state.usedHint && raw > cap) {
      rows += '<div class="rr warn"><span>使用过提示</span><b>' + raw + '★ → ' + TEXT.hintCapRow + '</b></div>';
    } else if (state.usedHint) {
      rows += '<div class="rr warn"><span>使用过提示</span><b>' + TEXT.hintCapRow + '</b></div>';
    }
    if (stars < MAX_STAR) {
      rows += '<div class="rr tip-row">' +
        (state.usedHint && raw >= MAX_STAR
          ? '这一局其实铺满了 —— 重玩一次不用提示就能拿 ' + MAX_STAR + '★'
          : '铺满全部 ' + tot + ' 格即可拿到 ' + MAX_STAR + '★') +
        '</div>';
    }

    // 解锁播报：这一关的星数刚好把下一个包顶开时，明确告诉玩家
    if (state.mode !== 'daily') {
      var lockInfo = nextLockedPack();
      if (lockInfo) {
        rows += '<div class="rr tip-row">再拿 ' + lockInfo.gap + '★ 解锁「' + esc(lockInfo.pack.name) + '」</div>';
      } else if (state.levelIndex >= 0 && LEVELS[state.levelIndex + 1] &&
        LEVELS[state.levelIndex + 1].pack !== lv.pack) {
        rows += '<div class="rr tip-row">已解锁「' + esc(packName(LEVELS[state.levelIndex + 1].pack)) + '」</div>';
      }
    }
    els.resultRows.innerHTML = rows;

    // "下一关"只在下一关确实可进入时出现
    var hasNext = state.mode === 'level' &&
      state.levelIndex + 1 < LEVELS.length &&
      levelUnlocked(state.levelIndex + 1);
    els.resNext.hidden = !hasNext;

    els.result.hidden = false;
    els.result.classList.add('show');
    stopLoop();
  }

  function closeResult() {
    els.result.classList.remove('show');
    els.result.hidden = true;
  }

  /* ================================================================
   * Canvas 布局 / 输入 / 绘制
   * ================================================================ */
  function resizeCanvas() {
    if (!canvas || !state.board) return;
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(120, rect.width);
    var cssH = Math.max(120, rect.height || rect.width);
    geo.dpr = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
    canvas.width = Math.round(cssW * geo.dpr);
    canvas.height = Math.round(cssH * geo.dpr);
    geo.w = cssW; geo.h = cssH;
    var side = Math.min(cssW, cssH);
    var pad = Math.max(6, Math.round(side * 0.028));
    geo.cell = (side - pad * 2) / state.board.n;
    geo.ox = (cssW - side) / 2 + pad;
    geo.oy = (cssH - side) / 2 + pad;
  }

  function cellFromClient(cx, cy) {
    var rect = canvas.getBoundingClientRect();
    var x = cx - rect.left - geo.ox;
    var y = cy - rect.top - geo.oy;
    return { r: Math.floor(y / geo.cell), c: Math.floor(x / geo.cell) };
  }
  function cx(c) { return geo.ox + (c + 0.5) * geo.cell; }
  function cy(r) { return geo.oy + (r + 0.5) * geo.cell; }

  var pointer = { down: false, id: null, longTimer: 0, startX: 0, startY: 0, moved: false };

  function onDown(clientX, clientY, pointerId, ev) {
    var b = state.board;
    if (!b || !els.result.hidden) return;
    Sound.unlock();
    var p = cellFromClient(clientX, clientY);
    if (!b.inBounds(p.r, p.c)) return;
    state.kb.active = false;
    var snap = b.snapshot();
    if (b.beginAt(p.r, p.c)) {
      pointer.down = true;
      pointer.id = pointerId;
      pointer.snap = snap;
      pointer.startX = clientX; pointer.startY = clientY;
      pointer.moved = false;
      if (ev && canvas.setPointerCapture && pointerId != null) {
        try { canvas.setPointerCapture(pointerId); } catch (e) { }
      }
      // 长按端点 = 清除该色
      var epIdx = b.endpointAt(p.r, p.c);
      if (epIdx >= 0) {
        if (pointer.longTimer) clearTimeout(pointer.longTimer);
        pointer.longTimer = setTimeout(function () {
          if (!pointer.down || pointer.moved) return;
          b.cancelDrag();
          pushUndo(snap);
          b.clearPair(epIdx);
          pointer.down = false;
          renderLegend(); updateHUD();
          Sound.cut();
          if (root.navigator && root.navigator.vibrate) { try { root.navigator.vibrate(12); } catch (e) { } }
        }, 520);
      }
      renderLegend();
      updateHUD();
    }
  }

  function onMove(clientX, clientY) {
    if (!pointer.down || !state.board) return;
    if (Math.abs(clientX - pointer.startX) + Math.abs(clientY - pointer.startY) > 8) pointer.moved = true;
    var p = cellFromClient(clientX, clientY);
    var b = state.board;
    // 指针明显跑出棋盘（>1 格）时不再吸附到边缘格，避免误铺长线
    if (p.r < -1 || p.c < -1 || p.r > b.n || p.c > b.n) return;
    var wasConnected = b.connectedCount();
    if (b.dragTo(clamp(p.r, 0, b.n - 1), clamp(p.c, 0, b.n - 1))) {
      if (b.connectedCount() > wasConnected) Sound.connect(); else Sound.tick();
      renderLegend();
      updateHUD();
    }
  }

  function onUp() {
    if (pointer.longTimer) { clearTimeout(pointer.longTimer); pointer.longTimer = 0; }
    if (!pointer.down || !state.board) { pointer.down = false; return; }
    pointer.down = false;
    var r = state.board.endDrag();
    if (r && r.changed && pointer.snap) pushUndo(pointer.snap);
    pointer.snap = null;
    renderLegend();
    updateHUD();
    if (state.board.isSolved()) setTimeout(finishLevel, 220);
    else maybeNudge();
  }

  function bindInput() {
    if (root.PointerEvent) {
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        onDown(e.clientX, e.clientY, e.pointerId, e);
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!pointer.down) return;
        e.preventDefault();
        onMove(e.clientX, e.clientY);
      });
      canvas.addEventListener('pointerup', function (e) { e.preventDefault(); onUp(); });
      canvas.addEventListener('pointercancel', function () { onUp(); });
      canvas.addEventListener('pointerleave', function () { if (pointer.down) onUp(); });
    } else {
      canvas.addEventListener('mousedown', function (e) { e.preventDefault(); onDown(e.clientX, e.clientY, null, null); });
      root.addEventListener('mousemove', function (e) { if (pointer.down) onMove(e.clientX, e.clientY); });
      root.addEventListener('mouseup', function () { onUp(); });
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        onDown(t.clientX, t.clientY, null, null);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        onMove(t.clientX, t.clientY);
      }, { passive: false });
      canvas.addEventListener('touchend', function (e) { e.preventDefault(); onUp(); }, { passive: false });
      canvas.addEventListener('touchcancel', function () { onUp(); });
    }

    // 右键清除单色
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var b = state.board;
      if (!b) return;
      var p = cellFromClient(e.clientX, e.clientY);
      var o = b.endpointAt(p.r, p.c);
      if (o < 0) o = b.ownerAt(p.r, p.c);
      if (o >= 0) {
        pushUndo(b.snapshot());
        b.clearPair(o);
        renderLegend(); updateHUD(); Sound.cut();
      }
    });

    // 键盘可玩
    canvas.addEventListener('keydown', function (e) {
      var b = state.board;
      if (!b) return;
      var k = state.kb;
      var dr = 0, dc = 0;
      switch (e.key) {
        case 'ArrowUp': dr = -1; break;
        case 'ArrowDown': dr = 1; break;
        case 'ArrowLeft': dc = -1; break;
        case 'ArrowRight': dc = 1; break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          k.active = true;
          if (k.drawing) {
            var res = b.endDrag();
            if (res && res.changed && k.snap) pushUndo(k.snap);
            k.drawing = false;
            renderLegend(); updateHUD();
            if (b.isSolved()) setTimeout(finishLevel, 220);
          } else {
            k.snap = b.snapshot();
            if (b.beginAt(k.r, k.c)) { k.drawing = true; Sound.tick(); renderLegend(); updateHUD(); }
          }
          return;
        case 'Escape':
          if (k.drawing) { b.cancelDrag(); k.drawing = false; renderLegend(); updateHUD(); }
          return;
        case 'z': case 'Z':
          if (!k.drawing) doUndo();
          return;
        default: return;
      }
      e.preventDefault();
      k.active = true;
      k.r = clamp(k.r + dr, 0, b.n - 1);
      k.c = clamp(k.c + dc, 0, b.n - 1);
      if (k.drawing) {
        var was = b.connectedCount();
        if (b.dragTo(k.r, k.c)) {
          if (b.connectedCount() > was) Sound.connect(); else Sound.tick();
          renderLegend(); updateHUD();
        }
      }
    });
    canvas.addEventListener('blur', function () { state.kb.active = false; });
  }

  /* ---------- 绘制 ---------- */
  function draw(ts) {
    var b = state.board, lv = state.level;
    if (!b || !ctx) return;
    var n = b.n, cell = geo.cell;
    var still = motionOff();
    var t = still ? 0 : (ts || 0) / 1000;

    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
    ctx.clearRect(0, 0, geo.w, geo.h);

    // 面板底
    var bx = geo.ox - cell * 0.16, by = geo.oy - cell * 0.16;
    var bw = cell * n + cell * 0.32, bh = cell * n + cell * 0.32;
    ctx.fillStyle = '#0d1428';
    roundRect(ctx, bx, by, bw, bh, Math.min(18, cell * 0.4));
    ctx.fill();

    // 格子
    var i, r, c;
    ctx.lineWidth = 1;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        var x = geo.ox + c * cell, y = geo.oy + r * cell;
        ctx.fillStyle = ((r + c) % 2 === 0) ? '#111b34' : '#0e1730';
        roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, Math.max(2, cell * 0.12));
        ctx.fill();
        ctx.strokeStyle = COL.grid;
        ctx.stroke();
      }
    }

    // 键盘光标
    if (state.kb.active) {
      ctx.strokeStyle = rgba(COL.amber, 0.9);
      ctx.lineWidth = Math.max(2, cell * 0.06);
      roundRect(ctx, geo.ox + state.kb.c * cell + 2, geo.oy + state.kb.r * cell + 2, cell - 4, cell - 4, Math.max(3, cell * 0.14));
      ctx.stroke();
    }

    // 线缆
    var lw = Math.max(3, cell * 0.42);
    for (i = 0; i < lv.pairs.length; i++) {
      var path = b.pathOf(i);
      if (!path || path.length < 2) continue;
      var color = lv.pairs[i].color;
      var connected = b.isConnected(i);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (connected && !still) { ctx.shadowColor = rgba(color, 0.75); ctx.shadowBlur = cell * 0.42; }
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (var j = 0; j < path.length; j++) {
        var px = cx(path[j][1]), py = cy(path[j][0]);
        if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.restore();

      // 内芯高光
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba('#ffffff', connected ? 0.32 : 0.16);
      ctx.lineWidth = lw * 0.34;
      ctx.beginPath();
      for (var j2 = 0; j2 < path.length; j2++) {
        var qx = cx(path[j2][1]), qy = cy(path[j2][0]);
        if (j2) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy);
      }
      ctx.stroke();
      ctx.restore();

      // 通电流光
      if (connected && !still) {
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba('#ffffff', 0.55);
        ctx.lineWidth = lw * 0.26;
        try { ctx.setLineDash([cell * 0.22, cell * 0.78]); } catch (e) { }
        ctx.lineDashOffset = -(t * cell * 2.2) % (cell);
        ctx.beginPath();
        for (var j3 = 0; j3 < path.length; j3++) {
          var rx = cx(path[j3][1]), ry = cy(path[j3][0]);
          if (j3) ctx.lineTo(rx, ry); else ctx.moveTo(rx, ry);
        }
        ctx.stroke();
        try { ctx.setLineDash([]); } catch (e) { }
        ctx.restore();
      }
    }

    // 提示闪回
    if (state.hint) {
      if (Date.now() > state.hint.until) state.hint = null;
      else {
        var hp = state.hint.cells;
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(COL.amber, 0.55 + (still ? 0 : 0.35 * Math.abs(Math.sin(t * 6))));
        ctx.lineWidth = lw * 0.6;
        try { ctx.setLineDash([cell * 0.3, cell * 0.28]); } catch (e) { }
        ctx.beginPath();
        for (var h = 0; h < hp.length; h++) {
          var hx = cx(hp[h][1]), hy = cy(hp[h][0]);
          if (h) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy);
        }
        ctx.stroke();
        try { ctx.setLineDash([]); } catch (e) { }
        ctx.restore();
      }
    }

    // 端点
    var er = cell * 0.33;
    for (i = 0; i < lv.pairs.length; i++) {
      var pr = lv.pairs[i];
      var conn = b.isConnected(i);
      for (var e2 = 0; e2 < 2; e2++) {
        var ep = pr.endpoints[e2];
        var ex = cx(ep[1]), ey = cy(ep[0]);

        // 外圈脉冲
        if (conn && !still) {
          var pulse = 1 + 0.12 * Math.sin(t * 3 + i);
          ctx.beginPath();
          ctx.arc(ex, ey, er * 1.28 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = rgba(pr.color, 0.16);
          ctx.fill();
        }
        // 底盘
        ctx.save();
        if (!still) { ctx.shadowColor = rgba(pr.color, 0.6); ctx.shadowBlur = cell * 0.3; }
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fillStyle = pr.color;
        ctx.fill();
        ctx.restore();
        // 形状（色盲辅助）
        traceShape(ctx, pr.shape, ex, ey, er * 0.56);
        ctx.fillStyle = '#0b1020';
        ctx.fill();
        // 未连通时描一圈虚线，强调"待接"
        if (!conn) {
          ctx.beginPath();
          ctx.arc(ex, ey, er * 1.2, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(pr.color, 0.45);
          ctx.lineWidth = Math.max(1, cell * 0.035);
          ctx.stroke();
        }
      }
    }

    // 拖拽笔头
    if (b.isDragging()) {
      var dp = b.dragPair();
      var path2 = b.pathOf(dp);
      if (path2 && path2.length) {
        var hd = path2[path2.length - 1];
        ctx.beginPath();
        ctx.arc(cx(hd[1]), cy(hd[0]), cell * 0.2, 0, Math.PI * 2);
        ctx.strokeStyle = rgba('#ffffff', 0.85);
        ctx.lineWidth = Math.max(2, cell * 0.05);
        ctx.stroke();
      }
    }
  }

  function roundRect(c2, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c2.beginPath();
    c2.moveTo(x + r, y);
    c2.arcTo(x + w, y, x + w, y + h, r);
    c2.arcTo(x + w, y + h, x, y + h, r);
    c2.arcTo(x, y + h, x, y, r);
    c2.arcTo(x, y, x + w, y, r);
    c2.closePath();
  }

  function loop(ts) {
    if (state.screen !== 'game') { state.raf = 0; return; }
    draw(ts);
    state.raf = root.requestAnimationFrame(loop);
  }
  function startLoop() {
    if (state.raf) return;
    state.raf = root.requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (state.raf) { root.cancelAnimationFrame(state.raf); state.raf = 0; }
  }

  /* ================================================================
   * 启动
   * ================================================================ */
  function cacheEls() {
    els.toast = $('#toast');
    els.modal = $('#overlay-modal');
    els.modalTitle = $('#modal-title');
    els.modalBody = $('#modal-body');
    els.modalActions = $('#modal-actions');
    els.back = $('#btn-back');
    els.topTitle = $('#top-title-text');
    els.chip = $('#profile-chip');
    els.chipAvatar = $('#chip-avatar');
    els.chipName = $('#chip-name');
    els.statStars = $('#stat-stars');
    els.statClear = $('#stat-clear');
    els.statStreak = $('#stat-streak');
    els.menuContinue = $('#menu-continue-sub');
    els.menuDaily = $('#menu-daily-sub');
    els.levelWrap = $('#level-wrap');
    els.levelsProgress = $('#levels-progress');
    els.profileList = $('#profile-list');
    els.newProfile = $('#btn-new-profile');
    els.dailyDate = $('#daily-date');
    els.dailyMeta = $('#daily-meta');
    els.dailyStars = $('#daily-stars');
    els.dailyPlay = $('#btn-daily-play');
    els.dailyHistory = $('#daily-history');
    els.dailyStreakTxt = $('#daily-streak');
    els.setSound = $('#set-sound');
    els.setMotion = $('#set-motion');
    els.storageNote = $('#storage-note');
    els.gameName = $('#game-level-name');
    els.gameMeta = $('#game-level-meta');
    els.hudPairs = $('#hud-pairs');
    els.hudCover = $('#hud-cover');
    els.hudMoves = $('#hud-moves');
    els.legend = $('#game-legend');
    els.undoBtn = $('#btn-undo');
    els.result = $('#overlay-result');
    els.resultTitle = $('#result-title');
    els.resultSub = $('#result-sub');
    els.resultStars = $('#result-stars');
    els.resultRows = $('#result-rows');
    els.resNext = $('#btn-res-next');
    els.fileInput = $('#file-import');
    els.warnBar = $('#storage-warn');
    els.warnText = $('#storage-warn-text');
    els.dailyNoMakeup = $('#daily-nomakeup');
    canvas = $('#board');
    ctx = canvas ? canvas.getContext('2d') : null;
  }

  function bindUI() {
    document.addEventListener('click', function (e) {
      var go = e.target.closest ? e.target.closest('[data-go]') : null;
      if (go) { Sound.ui(); showScreen(go.getAttribute('data-go')); return; }
      var tile = e.target.closest ? e.target.closest('.level-tile') : null;
      if (tile) { Sound.ui(); startLevel(parseInt(tile.getAttribute('data-index'), 10) || 0); return; }
      var pact = e.target.closest ? e.target.closest('[data-act]') : null;
      if (pact) {
        var id = pact.getAttribute('data-id');
        var act = pact.getAttribute('data-act');
        Sound.ui();
        if (act === 'use') { Profiles.switchTo(id); renderProfiles(); renderChip(); toast('已切换到「' + esc(Profiles.current().name) + '」'); }
        if (act === 'edit') openEditProfile(id);
        if (act === 'del') openDeleteProfile(id);
        return;
      }
    });

    els.back.addEventListener('click', function () {
      Sound.ui();
      if (state.screen === 'game') {
        showScreen(state.mode === 'daily' ? 'daily' : 'levels');
      } else {
        showScreen(els.back.dataset.target || 'menu');
      }
    });

    els.chip.addEventListener('click', function () { Sound.ui(); showScreen('profiles'); });
    els.newProfile.addEventListener('click', function () { Sound.ui(); openCreateProfile(false); });

    function exportCurrent() {
      var p = Profiles.current();
      if (!p) { toast('先创建一个档案'); return; }
      openExport([p], 'powerlink-profile-' + safeName(p.name) + '-' + todayStr() + '.json');
    }

    // 顶部降级提示条上的「立即导出」直达入口
    var warnExport = $('#btn-warn-export');
    if (warnExport) {
      warnExport.addEventListener('click', function () { Sound.ui(); exportCurrent(); });
    }

    $('#btn-export-one').addEventListener('click', function () {
      var p = Profiles.current();
      if (!p) { toast('先创建一个档案'); return; }
      openExport([p], 'powerlink-profile-' + safeName(p.name) + '-' + todayStr() + '.json');
    });
    $('#btn-export-all').addEventListener('click', function () {
      if (!Profiles.list.length) { toast('还没有档案'); return; }
      openExport(Profiles.list, 'powerlink-profiles-all-' + todayStr() + '.json');
    });
    $('#btn-import').addEventListener('click', function () { openImport(); });
    $('#btn-set-export').addEventListener('click', function () {
      var p = Profiles.current();
      if (!p) { toast('先创建一个档案'); return; }
      openExport([p], 'powerlink-profile-' + safeName(p.name) + '-' + todayStr() + '.json');
    });
    $('#btn-set-import').addEventListener('click', function () { openImport(); });
    $('#btn-set-reset').addEventListener('click', function () {
      var p = Profiles.current();
      if (!p) return;
      openModal({
        title: '清空进度',
        body: '<p>将清空档案「<b>' + esc(p.name) + '</b>」的全部关卡星级与每日挑战记录，档案本身保留。此操作不可撤销。</p>',
        actions: [
          { label: '取消', cls: 'btn-ghost' },
          {
            label: '确认清空', cls: 'btn-danger', onClick: function () {
              p.levels = {}; p.daily = {}; p.updatedAt = Date.now();
              Profiles.save(); renderSettings(); renderMenu();
              toast('已清空');
            }
          }
        ]
      });
    });

    els.setSound.addEventListener('change', function () {
      var p = Profiles.current();
      if (!p) return;
      p.settings.sound = els.setSound.checked;
      Profiles.save();
      if (p.settings.sound) { Sound.unlock(); Sound.connect(); }
    });
    els.setMotion.addEventListener('change', function () {
      var p = Profiles.current();
      if (!p) return;
      p.settings.reduceMotion = els.setMotion.checked;
      Profiles.save();
    });

    els.dailyPlay.addEventListener('click', function () { Sound.ui(); startDaily(); });

    $('#btn-undo').addEventListener('click', function () { doUndo(); });
    $('#btn-reset').addEventListener('click', function () { doReset(); });
    $('#btn-hint').addEventListener('click', function () { doHint(); });
    $('#btn-quit').addEventListener('click', function () {
      Sound.ui();
      showScreen(state.mode === 'daily' ? 'daily' : 'levels');
    });

    $('#btn-res-back').addEventListener('click', function () {
      Sound.ui(); closeResult();
      showScreen(state.mode === 'daily' ? 'daily' : 'levels');
    });
    $('#btn-res-retry').addEventListener('click', function () {
      Sound.ui(); closeResult();
      if (state.mode === 'daily') startDaily(); else startLevel(state.levelIndex);
    });
    els.resNext.addEventListener('click', function () {
      Sound.ui(); closeResult();
      startLevel(state.levelIndex + 1);
    });

    els.modal.addEventListener('click', function (e) {
      if (e.target === els.modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.modal.hidden) closeModal();
    });

    if (els.fileInput) {
      els.fileInput.addEventListener('change', function () {
        var f = els.fileInput.files && els.fileInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var ta = $('#im-text');
          if (ta) { ta.value = String(reader.result || ''); toast('文件已读取，点「导入」确认'); }
          else {
            var res = parseImport(String(reader.result || ''));
            if (!res) { toast(TEXT.importBad); return; }
            var r = Profiles.merge(res);
            renderProfiles(); renderChip(); renderMenu();
            toast(TEXT.imported + '：新增 ' + r.added + '，覆盖 ' + r.updated);
          }
        };
        reader.onerror = function () { toast('文件读取失败'); };
        try { reader.readAsText(f); } catch (err) { toast('文件读取失败'); }
        els.fileInput.value = '';
      });
    }

    var resizeTimer = 0;
    root.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.screen === 'game') { resizeCanvas(); draw(0); }
      }, 80);
    });
    root.addEventListener('orientationchange', function () {
      setTimeout(function () { if (state.screen === 'game') { resizeCanvas(); draw(0); } }, 220);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopLoop();
      else if (state.screen === 'game') startLoop();
    });
    if (root.ResizeObserver && canvas) {
      try {
        new root.ResizeObserver(function () {
          if (state.screen === 'game') { resizeCanvas(); draw(0); }
        }).observe(canvas.parentNode);
      } catch (e) { }
    }
  }

  var booted = false;
  function boot() {
    // 幂等：无论 DOMContentLoaded 被触发几次、脚本被重复引入几次，
    // 都只初始化一次，避免事件监听器重复绑定导致操作被"抵消"。
    if (booted) return;
    booted = true;
    cacheEls();
    if (!canvas || !ctx) { booted = false; return; }
    Profiles.load();
    bindUI();
    bindInput();
    // file:// 降级：探测态先应用一次，之后若运行中掉线由回调再应用
    var storageWasAvailable = LS.available;
    applyStorageMode();
    LS.onDegrade(function () { onStorageDegraded(storageWasAvailable); });
    renderChip();
    if (!Profiles.list.length) {
      showScreen('profiles');
      setTimeout(function () { openCreateProfile(true); }, 220);
    } else {
      showScreen('menu');
    }
    // 主菜单「继续闯关」直达下一关
    var quick = $('#btn-continue');
    if (quick) {
      quick.addEventListener('click', function (e) {
        e.stopPropagation();
        Sound.ui();
        var idx = parseInt(els.menuContinue.dataset.index, 10);
        startLevel(isNaN(idx) ? 0 : idx);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(typeof window !== 'undefined' ? window : this);
