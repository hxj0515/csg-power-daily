/* =====================================================================
 * 《三国塔防·烽火连城》PowerLink3 —— 塔防引擎（engine.js）
 * ---------------------------------------------------------------------
 * TDGame：纯 Canvas 渲染 + 模拟。无外部依赖。
 * 渲染坐标统一用 CSS 像素（0..W, 0..H），dpr 缩放由 init 处理。
 * ui.js 负责 rAF 循环：每帧 engine.update(dt) 后 engine.render()。
 * ===================================================================== */

window.PL3Engine = (function () {
  var D = window.PL3_DATA;
  var CELL = D.GRID.CELL;

  /* ---------------- 轻量音效（WebAudio 合成） ---------------- */
  var Sound = {
    ctx: null, enabled: true,
    init: function () {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    resume: function () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    tone: function (freq, dur, type, vol) {
      if (!this.enabled || !this.ctx) return;
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime((vol || 0.12), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur);
    },
    shoot: function () { this.tone(620, 0.05, 'square', 0.04); },
    fire: function () { this.tone(180, 0.18, 'sawtooth', 0.07); },
    frost: function () { this.tone(880, 0.12, 'sine', 0.05); },
    thunder: function () { this.tone(740, 0.08, 'sawtooth', 0.05); this.tone(1180, 0.06, 'square', 0.04); },
    hit: function () { this.tone(300, 0.04, 'triangle', 0.03); },
    place: function () { this.tone(440, 0.08, 'square', 0.08); this.tone(660, 0.08, 'square', 0.06); },
    upgrade: function () { this.tone(523, 0.08, 'square', 0.08); this.tone(784, 0.1, 'square', 0.07); },
    sell: function () { this.tone(330, 0.1, 'sine', 0.06); },
    skill: function () { this.tone(200, 0.25, 'sawtooth', 0.09); this.tone(500, 0.2, 'triangle', 0.06); },
    win: function () { var s = this; [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { s.tone(f, 0.18, 'square', 0.09); }, i * 130); }); },
    lose: function () { var s = this; [392, 330, 262].forEach(function (f, i) { setTimeout(function () { s.tone(f, 0.25, 'sawtooth', 0.08); }, i * 160); }); }
  };

  /* ---------------- 几何工具 ---------------- */
  function toPx(col, row) { return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL }; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function distToSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return dist(px, py, a.x, a.y);
    var t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, a.x + t * dx, a.y + t * dy);
  }

  /* ---------------- 引擎主体 ---------------- */
  function TDGame(canvas, cb) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = cb || {};
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = D.W * this.dpr;
    canvas.height = D.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.map = null;
    this.pts = [];
    this.blocked = {};
    this.towers = [];
    this.enemies = [];
    this.bolts = [];
    this.fx = [];
    this.floaters = [];
    this.state = null;
    this.selected = null;     // 选中的塔（UI 用）
    this.buildType = null;    // 当前建造中的塔类型
    this.skillTarget = null;  // 当前待选点的技能 id
    this.endless = false;
    this.curScale = 1;
    this.buffTimer = 0; this.buffMul = 1;
    this.shieldCharges = 0;
    this._euid = 0;
    this.items = [];
  }

  TDGame.prototype.init = function (map) {
    this.map = map;
    this.pts = map.waypoints.map(function (w) { return toPx(w[0], w[1]); });
    this.blocked = {};
    (map.blocked || []).forEach(function (c) { this.blocked[c[0] + ',' + c[1]] = true; }, this);
    this.towers = [];
    this.enemies = [];
    this.bolts = []; this.fx = []; this.floaters = [];
    this.selected = null; this.buildType = null; this.skillTarget = null;
    this.endless = !!map.endless;
    this.curScale = map.hpScale;
    this.buffTimer = 0; this.buffMul = 1;
    this.shieldCharges = 0;
    this._euid = 0;
    this.waveIndex = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.waveTimer = 0;
    this.goldEarned = 0;
    this.items = D.ITEM_ORDER.map(function (id) {
      var it = D.ITEMS[id];
      return { id: id, name: it.name, glyph: it.glyph, desc: it.desc, count: D.START_ITEMS[id] || 0 };
    });
    this.state = {
      gold: map.startGold, lives: map.startLives, maxLives: map.startLives,
      waveIndex: 0, totalWaves: map.endless ? 999999 : map.waves.length, waveActive: false,
      status: 'ready', speed: 1, score: 0,
      canStartWave: true, enemiesAlive: 0,
      skills: D.SKILL_ORDER.map(function (id) {
        var s = D.SKILLS[id];
        return { id: id, name: s.name, glyph: s.glyph, cd: s.cd, cdLeft: 0, ready: true, color: s.color };
      })
    };
    this._emit();
  };

  TDGame.prototype._emit = function () {
    if (this.cb.onState) this.cb.onState(this.getState());
  };

  TDGame.prototype.getState = function () {
    var s = this.state;
    return {
      gold: s.gold, lives: s.lives, maxLives: s.maxLives,
      waveIndex: this.waveIndex, totalWaves: s.totalWaves, waveActive: this.waveActive,
      status: s.status, speed: s.speed, score: s.score,
      canStartWave: !this.waveActive && s.status !== 'won' && s.status !== 'lost' && (this.endless || this.waveIndex < s.totalWaves),
      enemiesAlive: this.enemies.length,
      skills: s.skills.map(function (k) { return { id: k.id, name: k.name, glyph: k.glyph, cdLeft: k.cdLeft, ready: k.ready, color: k.color }; }),
      items: this.items.map(function (it) { return { id: it.id, name: it.name, glyph: it.glyph, count: it.count, desc: it.desc }; }),
      shield: this.shieldCharges,
      buffTimer: this.buffTimer,
      endless: this.endless,
      mapName: this.map ? this.map.name : ''
    };
  };

  /* ---- 坐标换算 ---- */
  TDGame.prototype.pixelToCell = function (px, py) {
    return { col: Math.floor(px / CELL), row: Math.floor(py / CELL) };
  };
  TDGame.prototype.cellCenter = function (col, row) { return toPx(col, row); };

  /* ---- 可建造判定 ---- */
  TDGame.prototype.distToPath = function (px, py) {
    var min = Infinity;
    for (var i = 0; i < this.pts.length - 1; i++) {
      var d = distToSeg(px, py, this.pts[i], this.pts[i + 1]);
      if (d < min) min = d;
    }
    return min;
  };
  TDGame.prototype.canBuildAt = function (col, row) {
    if (col < 0 || col >= D.GRID.COLS || row < 0 || row >= D.GRID.ROWS) return false;
    var c = toPx(col, row);
    if (this.distToPath(c.x, c.y) <= CELL * 0.5) return false;
    if (this.blocked[col + ',' + row]) return false;
    for (var i = 0; i < this.towers.length; i++) {
      if (this.towers[i].col === col && this.towers[i].row === row) return false;
    }
    return true;
  };
  TDGame.prototype.getTowerAt = function (col, row) {
    for (var i = 0; i < this.towers.length; i++)
      if (this.towers[i].col === col && this.towers[i].row === row) return this.towers[i];
    return null;
  };

  /* ---- 建造 / 升级 / 出售 ---- */
  TDGame.prototype.placeTower = function (col, row, typeId) {
    var def = D.TOWERS[typeId];
    if (!def) return false;
    if (!this.canBuildAt(col, row)) return false;
    if (this.state.gold < def.cost) return false;
    var c = toPx(col, row);
    this.towers.push({
      type: typeId, def: def, col: col, row: row, x: c.x, y: c.y,
      level: 0, cd: 0, id: 't' + (this.towers.length), synergy: 0
    });
    this.state.gold -= def.cost;
    Sound.place();
    this._emit();
    return true;
  };
  TDGame.prototype.upgradeCost = function (tower) {
    var def = tower.def;
    if (tower.level >= def.levels.length - 1) return null;
    return def.upgradeCost[tower.level];
  };
  TDGame.prototype.upgradeTower = function (tower) {
    var cost = this.upgradeCost(tower);
    if (cost == null || this.state.gold < cost) return false;
    this.state.gold -= cost;
    tower.level++;
    Sound.upgrade();
    this._emit();
    return true;
  };
  TDGame.prototype.sellTower = function (tower) {
    var refund = Math.floor(tower.def.cost * 0.6);
    for (var i = 0; i < tower.level; i++) refund += Math.floor((tower.def.upgradeCost[i] || 0) * 0.6);
    this.state.gold += refund;
    this.towers = this.towers.filter(function (t) { return t !== tower; });
    if (this.selected === tower) this.selected = null;
    Sound.sell();
    this._emit();
    return true;
  };

  /* ---- 波次 ---- */
  TDGame.prototype.startNextWave = function () {
    if (this.waveActive) return false;
    if (!this.endless && this.waveIndex >= this.state.totalWaves) return false;
    if (this.state.status === 'won' || this.state.status === 'lost') return false;
    if (this.endless && this.waveIndex >= this.map.waves.length) {
      this.map.waves.push(D.genEndlessWave(this.waveIndex + 1, this.map));
    }
    var wave = this.map.waves[this.waveIndex];
    this.waveIndex++;
    this.waveActive = true;
    this.spawnQueue = wave.spawns.slice();
    this.waveTimer = 0;
    this.curScale = wave.hpScale || this.map.hpScale;
    if (this.state.status === 'ready') this.state.status = 'playing';
    this._emit();
    return true;
  };

  TDGame.prototype._spawnEnemy = function (spec) {
    var e = D.ENEMIES[spec.type];
    var scale = this.curScale || this.map.hpScale;
    var hp = Math.round(e.hp * (e.boss ? scale * 1.0 : scale));
    var name = e.boss ? (spec.bossName || e.name) : e.name;
    var p0 = this.pts[0];
    this.enemies.push({
      type: spec.type, def: e, name: name,
      x: p0.x, y: p0.y, wp: 1,
      hp: hp, maxHp: hp,
      baseSpeed: e.speed * CELL,
      gold: e.gold, armor: e.armor, boss: !!e.boss,
      slowTimer: 0, slowFactor: 1, stunTimer: 0,
      burnTimer: 0, burnDps: 0,
      glyph: e.glyph, color: e.color,
      radius: e.boss ? CELL * 0.42 : CELL * 0.30,
      uid: 'e' + (++this._euid)
    });
  };

  /* ---- 主动技能 ---- */
  TDGame.prototype.castSkill = function (skillId, col, row) {
    var k = null;
    for (var i = 0; i < this.state.skills.length; i++)
      if (this.state.skills[i].id === skillId) k = this.state.skills[i];
    if (!k || !k.ready) return false;
    var sdef = D.SKILLS[skillId];
    if (sdef.kind === 'economy') {
      // 开仓放粮：立即发金 + 全军攻速 buff，无需点地图
      this.state.gold += (sdef.gold || 0);
      this.goldEarned += (sdef.gold || 0);
      if (sdef.buffDur) { this.buffTimer = sdef.buffDur; this.buffMul = sdef.buffMul || 1.3; }
      this.fx.push({ kind: 'rain', x: D.W / 2, y: D.H / 2, r: 0, max: 0, color: sdef.color, life: 0.9, t: 0 });
      k.cdLeft = k.cd; k.ready = false;
      Sound.skill();
      this._emit();
      return true;
    }
    var c = toPx(col, row);
    var r = sdef.radius * CELL;
    if (sdef.kind === 'aoe') {
      this.enemies.forEach(function (en) {
        if (dist(en.x, en.y, c.x, c.y) <= r) en.hp -= sdef.dmg;
      });
      this.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 0, max: r, color: sdef.color, life: 0.5, t: 0, dmg: true });
    } else if (sdef.kind === 'stun') {
      this.enemies.forEach(function (en) {
        if (dist(en.x, en.y, c.x, c.y) <= r) en.stunTimer = Math.max(en.stunTimer, sdef.stun);
      });
      this.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 0, max: r, color: sdef.color, life: 0.6, t: 0 });
    }
    k.cdLeft = k.cd; k.ready = false;
    Sound.skill();
    this._emit();
    return true;
  };

  /* ---- 锦囊道具 ---- */
  TDGame.prototype.useItem = function (id) {
    var it = null;
    for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) it = this.items[i];
    if (!it || it.count <= 0) return false;
    if (id === 'shield') { this.shieldCharges += 1; }
    else if (id === 'gold') { this.state.gold += 150; this.goldEarned += 150; }
    else if (id === 'rally') { this.buffTimer = 8; this.buffMul = 1.3; }
    it.count--;
    Sound.skill();
    this._emit();
    return true;
  };

  /* ---- 主循环更新 ---- */
  TDGame.prototype.update = function (dt) {
    if (!this.state) return;
    if (this.state.status !== 'playing' && this.state.status !== 'ready') {
      this._updateFx(dt);
      return;
    }
    var sdt = dt * this.state.speed;
    this._updateSkills(sdt);

    if (this.waveActive) {
      this.waveTimer += sdt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTimer) {
        this._spawnEnemy(this.spawnQueue.shift());
      }
    }

    this._updateEnemies(sdt);
    this._updateTowers(sdt);
    this._updateBolts(sdt);
    this._updateFx(sdt);

    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      if (!this.endless && this.waveIndex >= this.state.totalWaves) {
        this._win();
      }
      this._emit();
    }
  };

  TDGame.prototype._updateSkills = function (dt) {
    this.state.skills.forEach(function (k) {
      if (!k.ready) {
        k.cdLeft -= dt;
        if (k.cdLeft <= 0) { k.cdLeft = 0; k.ready = true; }
      }
    });
    if (this.buffTimer > 0) {
      this.buffTimer -= dt;
      if (this.buffTimer <= 0) { this.buffTimer = 0; this.buffMul = 1; }
    }
  };

  TDGame.prototype._updateEnemies = function (dt) {
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var en = this.enemies[i];
      // 死亡
      if (en.hp <= 0) {
        this.state.gold += en.gold; this.goldEarned += en.gold;
        this.floaters.push({ x: en.x, y: en.y, text: '+' + en.gold, color: '#f4c430', t: 0, life: 0.8 });
        this.fx.push({ kind: 'pop', x: en.x, y: en.y, r: en.radius, color: en.color, t: 0, life: 0.3 });
        this.enemies.splice(i, 1);
        Sound.hit();
        continue;
      }
      // 点燃持续伤害
      if (en.burnTimer > 0) {
        en.burnTimer -= dt;
        en.hp -= en.burnDps * dt;
        if (en.hp <= 0) continue; // 下帧开头处理死亡奖励
      }
      // 眩晕
      if (en.stunTimer > 0) { en.stunTimer -= dt; continue; }
      // 减速
      var sp = en.baseSpeed;
      if (en.slowTimer > 0) { en.slowTimer -= dt; sp *= en.slowFactor; }
      // 沿路径移动
      var target = this.pts[en.wp];
      if (!target) { this._reachBase(en, i); continue; }
      var d = dist(en.x, en.y, target.x, target.y);
      var step = sp * dt;
      if (d <= step) {
        en.x = target.x; en.y = target.y; en.wp++;
        if (en.wp >= this.pts.length) { this._reachBase(en, i); }
      } else {
        en.x += (target.x - en.x) / d * step;
        en.y += (target.y - en.y) / d * step;
      }
    }
  };

  TDGame.prototype._reachBase = function (en, idx) {
    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      this.enemies.splice(idx, 1);
      this.fx.push({ kind: 'block', x: this.pts[this.pts.length - 1].x, y: this.pts[this.pts.length - 1].y, t: 0, life: 0.7 });
      this._emit();
      return;
    }
    var loss = en.boss ? 5 : 1;
    this.state.lives -= loss;
    this.enemies.splice(idx, 1);
    this.fx.push({ kind: 'leak', x: this.pts[this.pts.length - 1].x, y: this.pts[this.pts.length - 1].y, t: 0, life: 0.5 });
    if (this.state.lives <= 0) {
      this.state.lives = 0;
      this._lose();
    }
  };

  TDGame.prototype._progress = function (en) {
    if (en.wp >= this.pts.length) return 1e9;
    var a = this.pts[en.wp - 1] || this.pts[0];
    var b = this.pts[en.wp];
    var seg = dist(a.x, a.y, b.x, b.y) || 1;
    var rem = dist(en.x, en.y, b.x, b.y);
    return en.wp + (1 - rem / seg);
  };

  TDGame.prototype._updateTowers = function (dt) {
    var self = this;
    this.towers.forEach(function (tw) {
      if (tw.cd > 0) tw.cd -= dt;
      var L = tw.def.levels[tw.level];
      // 相邻同势力羁绊：每相邻 1 座 +12% 攻速，封顶 +36%
      var syn = 0;
      self.towers.forEach(function (o) {
        if (o !== tw && o.def.faction === tw.def.faction) {
          if (Math.abs(o.col - tw.col) <= 1 && Math.abs(o.row - tw.row) <= 1) syn += 0.12;
        }
      });
      syn = Math.min(syn, 0.36);
      tw.synergy = syn;
      var rateMul = (1 + syn) * self.buffMul;
      // 选目标：射程内 progress 最大者
      var range = L.range * CELL;
      var best = null, bestP = -1;
      self.enemies.forEach(function (en) {
        if (dist(tw.x, tw.y, en.x, en.y) <= range) {
          var p = self._progress(en);
          if (p > bestP) { bestP = p; best = en; }
        }
      });
      if (!best) return;
      if (tw.cd > 0) return;
      tw.cd = 1 / (L.rate * rateMul);
      self._fire(tw, L, best, range);
    });
  };

  TDGame.prototype._fire = function (tw, L, target, range) {
    var def = tw.def;
    var maxLv = tw.level === def.levels.length - 1;
    if (def.aoe) {
      var r = (def.aoe || 0.9) * CELL;
      if (def.perk === 'siege' && maxLv) r *= 1.25;
      this.enemies.forEach(function (en) {
        if (dist(target.x, target.y, en.x, en.y) <= r) {
          var dmg = L.dmg * (1 - en.armor);
          en.hp -= dmg;
          if (def.perk === 'burn' && maxLv) { en.burnTimer = 3; en.burnDps = L.dmg * 0.4; }
          this.floaters.push({ x: en.x, y: en.y - 6, text: Math.round(dmg), color: '#ff7043', t: 0, life: 0.6 });
        }
      }, this);
      this.fx.push({ kind: 'boom', x: target.x, y: target.y, r: r, color: def.color, t: 0, life: 0.3 });
      Sound.fire();
    } else if (def.frost) {
      var dmg = L.dmg * (1 - target.armor);
      target.hp -= dmg;
      target.slowTimer = L.slowDur; target.slowFactor = L.slow;
      if (def.perk === 'frostAura' && maxLv) {
        var ra = 0.85 * CELL;
        this.enemies.forEach(function (en) {
          if (en !== target && dist(target.x, target.y, en.x, en.y) <= ra) {
            en.slowTimer = Math.max(en.slowTimer, L.slowDur * 0.7);
            en.slowFactor = L.slow;
          }
        });
      }
      this.floaters.push({ x: target.x, y: target.y - 6, text: Math.round(dmg), color: '#90caf9', t: 0, life: 0.6 });
      this.bolts.push({ x1: tw.x, y1: tw.y, x2: target.x, y2: target.y, color: def.color, t: 0, life: 0.12 });
      Sound.frost();
    } else if (def.chain) {
      // 连锁闪电：从目标起逐跳，伤害衰减
      var hops = def.chain + (def.perk === 'chainPlus' && maxLv ? 1 : 0);
      var dmg0 = def.pierce ? L.dmg : L.dmg * (1 - target.armor);
      var cur = target, prev = null, hitSet = {}, fall = def.chainFall || 0.7, dmg = dmg0;
      for (var h = 0; h <= hops; h++) {
        if (!cur || hitSet[cur.uid]) break;
        hitSet[cur.uid] = true;
        var dd = def.pierce ? dmg : dmg * (1 - cur.armor);
        cur.hp -= dd;
        this.floaters.push({ x: cur.x, y: cur.y - 6, text: Math.round(dd), color: '#ffe082', t: 0, life: 0.6 });
        if (prev) this.bolts.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y, color: def.color, t: 0, life: 0.14 });
        else this.bolts.push({ x1: tw.x, y1: tw.y, x2: cur.x, y2: cur.y, color: def.color, t: 0, life: 0.14 });
        prev = cur;
        var nx = null, nd = Infinity;
        for (var k = 0; k < this.enemies.length; k++) {
          var e2 = this.enemies[k];
          if (hitSet[e2.uid]) continue;
          var d2 = dist(cur.x, cur.y, e2.x, e2.y);
          if (d2 < nd) { nd = d2; nx = e2; }
        }
        cur = nx; dmg *= fall;
      }
      Sound.thunder();
    } else {
      // 单体（弓弩营 / 谋士营）
      var dmg2 = def.pierce ? L.dmg : L.dmg * (1 - target.armor);
      var crit = false;
      if (def.perk === 'crit' && maxLv && Math.random() < 0.25) { dmg2 *= 2; crit = true; }
      if (def.perk === 'overload' && maxLv) dmg2 *= 1.3;
      target.hp -= dmg2;
      this.floaters.push({ x: target.x, y: target.y - 6, text: Math.round(dmg2), color: def.pierce ? '#ce93d8' : (crit ? '#ffd54f' : '#fff'), t: 0, life: 0.6 });
      this.bolts.push({ x1: tw.x, y1: tw.y, x2: target.x, y2: target.y, color: def.color, t: 0, life: 0.12 });
      Sound.shoot();
    }
  };

  TDGame.prototype._updateBolts = function (dt) {
    for (var i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].t += dt;
      if (this.bolts[i].t >= this.bolts[i].life) this.bolts.splice(i, 1);
    }
  };
  TDGame.prototype._updateFx = function (dt) {
    for (var i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].t += dt;
      if (this.fx[i].t >= this.fx[i].life) this.fx.splice(i, 1);
    }
    for (var j = this.floaters.length - 1; j >= 0; j--) {
      this.floaters[j].t += dt;
      this.floaters[j].y -= dt * 18;
      if (this.floaters[j].t >= this.floaters[j].life) this.floaters.splice(j, 1);
    }
  };

  TDGame.prototype._win = function () {
    this.state.status = 'won';
    var ratio = this.state.lives / this.state.maxLives;
    this.state.stars = ratio >= 0.8 ? 3 : (ratio >= 0.5 ? 2 : 1);
    this.state.score = this.goldEarned + this.state.lives * 100 + this.state.totalWaves * 60;
    Sound.win();
    if (this.cb.onEnd) this.cb.onEnd({ result: 'won', stars: this.state.stars, score: this.state.score, lives: this.state.lives });
  };
  TDGame.prototype._lose = function () {
    this.state.status = 'lost';
    Sound.lose();
    if (this.cb.onEnd) this.cb.onEnd({ result: 'lost', stars: 0, score: this.state.score, lives: 0 });
  };

  TDGame.prototype.setSpeed = function (sp) {
    this.state.speed = sp; this._emit();
  };
  TDGame.prototype.togglePause = function () {
    if (this.state.status === 'playing') this.state.status = 'paused';
    else if (this.state.status === 'paused') this.state.status = 'playing';
    this._emit();
  };

  /* ================= 渲染 ================= */
  TDGame.prototype.render = function () {
    var ctx = this.ctx, map = this.map;
    if (!map) return;
    var g = ctx.createLinearGradient(0, 0, 0, D.H);
    g.addColorStop(0, map.bgTop); g.addColorStop(1, map.bgBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, D.W, D.H);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
    for (var c = 0; c <= D.GRID.COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, D.H); ctx.stroke(); }
    for (var r = 0; r <= D.GRID.ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(D.W, r * CELL); ctx.stroke(); }

    var self = this;
    Object.keys(this.blocked).forEach(function (key) {
      var p = key.split(','); var cc = toPx(+p[0], +p[1]);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      self._roundRect(ctx, cc.x - CELL * 0.42, cc.y - CELL * 0.42, CELL * 0.84, CELL * 0.84, 8);
      ctx.fill();
      ctx.font = (CELL * 0.5) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⛰️', cc.x, cc.y);
    });

    ctx.strokeStyle = map.road; ctx.lineWidth = CELL * 0.82;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.pts[0].x, this.pts[0].y);
    for (var i = 1; i < this.pts.length; i++) ctx.lineTo(this.pts[i].x, this.pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]); ctx.stroke(); ctx.setLineDash([]);

    var start = this.pts[0], base = this.pts[this.pts.length - 1];
    ctx.font = (CELL * 0.55) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🚪', Math.max(12, start.x + CELL * 0.4), start.y);
    ctx.fillText('🏰', base.x, base.y);

    if (this.buildType && this._hover) this._drawBuildPreview(ctx);
    if (this.skillTarget && this._hover) this._drawSkillPreview(ctx);

    this.towers.forEach(function (tw) { self._drawTower(ctx, tw); });
    this.enemies.forEach(function (en) { self._drawEnemy(ctx, en); });
    this.bolts.forEach(function (b) {
      ctx.strokeStyle = b.color; ctx.globalAlpha = 1 - b.t / b.life; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.globalAlpha = 1;
    });
    this.fx.forEach(function (f) { self._drawFx(ctx, f); });
    this.floaters.forEach(function (f) {
      ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color;
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
    });
  };

  TDGame.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  TDGame.prototype._drawTower = function (ctx, tw) {
    var sel = (this.selected === tw);
    if (sel) {
      var L = tw.def.levels[tw.level];
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.arc(tw.x, tw.y, L.range * CELL, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = tw.def.color; ctx.lineWidth = 2; ctx.stroke();
    } else if (tw.synergy > 0) {
      // 羁绊光环：淡绿细环
      ctx.strokeStyle = 'rgba(46,125,50,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tw.x, tw.y, CELL * 0.46, 0, Math.PI * 2); ctx.stroke();
    }
    var s = CELL * 0.40;
    ctx.fillStyle = tw.def.color;
    this._roundRect(ctx, tw.x - s, tw.y - s, s * 2, s * 2, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = (CELL * 0.5) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tw.def.glyph, tw.x, tw.y);
    var stars = '';
    for (var i = 0; i <= tw.level; i++) stars += '★';
    ctx.fillStyle = '#f4c430'; ctx.font = '10px sans-serif';
    ctx.fillText(stars, tw.x, tw.y - s - 6);
  };

  TDGame.prototype._drawEnemy = function (ctx, en) {
    ctx.fillStyle = en.color;
    ctx.beginPath(); ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = (en.radius * 1.3) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(en.glyph, en.x, en.y);
    if (en.slowTimer > 0) {
      ctx.strokeStyle = '#42a5f5'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(en.x, en.y, en.radius + 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (en.burnTimer > 0) {
      ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(en.x, en.y, en.radius + 2, 0, Math.PI * 2); ctx.stroke();
    }
    if (en.stunTimer > 0) {
      ctx.fillStyle = '#ffd54f'; ctx.font = '12px serif';
      ctx.fillText('💫', en.x, en.y - en.radius - 6);
    }
    var w = en.radius * 2, hp = Math.max(0, en.hp / en.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(en.x - w / 2, en.y - en.radius - 9, w, 4);
    ctx.fillStyle = hp > 0.5 ? '#4caf50' : (hp > 0.25 ? '#ffb300' : '#e5484d');
    ctx.fillRect(en.x - w / 2, en.y - en.radius - 9, w * hp, 4);
  };

  TDGame.prototype._drawFx = function (ctx, f) {
    var k = f.t / f.life;
    if (f.kind === 'ring' || f.kind === 'boom') {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.lineWidth = f.kind === 'boom' ? 4 : 6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.max * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'pop') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'leak') {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#e5484d'; ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('城池受损!', f.x, f.y - 10 - k * 20); ctx.globalAlpha = 1;
    } else if (f.kind === 'block') {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#2e7d32'; ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('🛡️ 令牌护城!', f.x, f.y - 10 - k * 20); ctx.globalAlpha = 1;
    }
  };

  TDGame.prototype._drawBuildPreview = function (ctx) {
    var def = D.TOWERS[this.buildType];
    var c = toPx(this._hover.col, this._hover.row);
    var ok = this.canBuildAt(this._hover.col, this._hover.row) && this.state.gold >= def.cost;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = ok ? def.color : '#e5484d';
    this._roundRect(ctx, c.x - CELL * 0.4, c.y - CELL * 0.4, CELL * 0.8, CELL * 0.8, 8); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.arc(c.x, c.y, def.levels[0].range * CELL, 0, Math.PI * 2); ctx.fill();
  };
  TDGame.prototype._drawSkillPreview = function (ctx) {
    var sdef = D.SKILLS[this.skillTarget];
    var c = toPx(this._hover.col, this._hover.row);
    ctx.globalAlpha = 0.4; ctx.fillStyle = sdef.color;
    ctx.beginPath(); ctx.arc(c.x, c.y, sdef.radius * CELL, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  };

  TDGame.prototype.setHover = function (col, row) { this._hover = { col: col, row: row }; };

  return { TDGame: TDGame, Sound: Sound };
})();
