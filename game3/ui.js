/* =====================================================================
 * 《三国塔防·烽火连城》PowerLink3 —— 界面与交互（ui.js）
 * ---------------------------------------------------------------------
 * 屏幕路由：主菜单 → 将军档案 → 战役地图 → 对局。
 * 连接 SaveSystem(存档) 与 TDGame(引擎)。rAF 循环驱动 update+render。
 * ===================================================================== */

(function () {
  var D = window.PL3_DATA, Save = window.PL3Save, E = window.PL3Engine;
  var $ = function (id) { return document.getElementById(id); };
  var engine = null, currentProfile = null, currentMapIdx = -1, lastEnd = null, raf = null;

  /* ---------------- 屏幕切换 ---------------- */
  function show(id) {
    ['screen-menu', 'screen-profiles', 'screen-maps', 'screen-game'].forEach(function (s) {
      $(s).hidden = true;
    });
    $(id).hidden = false;
  }

  /* ---------------- 档案 ---------------- */
  function renderProfiles() {
    var list = Save.loadProfiles();
    var box = $('profile-list'); box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<p class="hint">尚无将军档案，新建一个开始征战吧。</p>';
    }
    list.forEach(function (p) {
      var cleared = 0, totalStars = 0;
      Object.keys(p.progress.maps || {}).forEach(function (k) {
        if (p.progress.maps[k].cleared) cleared++;
        totalStars += (p.progress.maps[k].stars || 0);
      });
      var card = document.createElement('div'); card.className = 'profile-card';
      card.innerHTML =
        '<div class="pc-main"><div class="pc-name">🎖️ ' + esc(p.name) + '</div>' +
        '<div class="pc-sub">通关 ' + cleared + '/' + D.MAPS.length + ' · 累计 ★' + totalStars + '</div></div>' +
        '<div class="pc-actions">' +
        '<button class="btn btn-go" data-enter="' + p.id + '">进入</button>' +
        '<button class="btn btn-sm" data-export="' + p.id + '">导出</button>' +
        '<button class="btn btn-sm btn-danger" data-del="' + p.id + '">删除</button>' +
        '</div>';
      box.appendChild(card);
    });
    box.querySelectorAll('[data-enter]').forEach(function (b) {
      b.onclick = function () { enterProfile(b.getAttribute('data-enter')); };
    });
    box.querySelectorAll('[data-export]').forEach(function (b) {
      b.onclick = function () { exportProfile(b.getAttribute('data-export')); };
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () { delProfile(b.getAttribute('data-del')); };
    });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function enterProfile(id) {
    currentProfile = Save.getProfile(id);
    Save.saveCurrent(id);
    renderMaps();
    show('screen-maps');
  }
  function createProfile() {
    var name = $('profile-name').value.trim();
    var p = Save.createProfile(name);
    $('profile-name').value = '';
    enterProfile(p.id);
  }
  function delProfile(id) {
    if (!confirm('确定删除该将军档案？此操作不可恢复（请先导出备份）。')) return;
    Save.deleteProfile(id);
    renderProfiles();
  }
  function exportProfile(id) {
    var p = Save.getProfile(id); if (!p) return;
    var text = Save.exportJSON(id);
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'powerlink3-' + p.name + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importProfile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var p = Save.importJSON(reader.result);
      if (p) { alert('导入成功：' + p.name); renderProfiles(); }
      else alert('导入失败：文件格式不正确。');
    };
    reader.readAsText(file);
  }

  /* ---------------- 地图选择 ---------------- */
  function renderMaps() {
    var box = $('map-list'); box.innerHTML = '';
    D.MAPS.forEach(function (m, idx) {
      var unlocked = m.endless ? true : Save.isUnlocked(currentProfile.id, idx, D.MAPS);
      var prog = (currentProfile.progress.maps || {})[m.id] || { stars: 0, best: 0, cleared: false };
      var stars = '';
      for (var i = 0; i < 3; i++) stars += '<span class="' + (i < prog.stars ? 'on' : '') + '">★</span>';
      var card = document.createElement('div');
      card.className = 'map-card' + (unlocked ? '' : ' locked') + (m.endless ? ' endless' : '');
      card.style.borderColor = m.theme;
      card.innerHTML =
        '<div class="map-banner" style="background:' + m.theme + '">' + (unlocked ? (m.endless ? '🔥' : '⚔️') : '🔒') + '</div>' +
        '<div class="map-name">' + esc(m.name) + '</div>' +
        '<div class="map-sub">' + esc(m.sub) + '</div>' +
        '<div class="map-stars">' + (m.endless ? '' : stars) + '</div>' +
        '<div class="map-meta">' + (m.endless ? ('历史最佳 ' + (prog.best || 0) + ' 波') : ('最高分 ' + (prog.best || 0) + ' · ' + m.waveCount + ' 波')) + '</div>' +
        (unlocked ? '' : '<div class="map-lock">需先通关上一关</div>');
      if (unlocked) card.onclick = function () { startGame(idx); };
      box.appendChild(card);
    });
  }

  /* ---------------- 对局 ---------------- */
  function startGame(idx) {
    currentMapIdx = idx;
    lastEnd = null;
    var map = D.MAPS[idx];
    show('screen-game');
    $('game-title').textContent = map.name + ' · ' + map.sub;
    if (!engine) engine = new E.TDGame($('game-canvas'), { onState: updateHud, onEnd: onEnd });
    engine.init(map);
    buildTowerPalette();
    buildSkillBar();
    buildItemBar();
    hideTowerPanel();
    engine.buildType = null; engine.skillTarget = null;
    updatePaletteActive();
    updateSkillActive();
    E.Sound.init(); E.Sound.resume();
    startLoop();
  }

  function buildTowerPalette() {
    var box = $('tower-palette'); box.innerHTML = '';
    D.TOWER_ORDER.forEach(function (tid) {
      var t = D.TOWERS[tid];
      var b = document.createElement('button'); b.className = 'tw-btn'; b.dataset.tw = tid;
      b.style.borderColor = t.color;
      b.innerHTML = '<span class="tw-glyph">' + t.glyph + '</span>' +
        '<span class="tw-name">' + t.name + '</span>' +
        '<span class="tw-cost">💰' + t.cost + '</span>';
      b.onclick = function () { selectBuild(tid); };
      box.appendChild(b);
    });
  }
  function buildSkillBar() {
    var box = $('skill-bar'); box.innerHTML = '';
    D.SKILL_ORDER.forEach(function (sid) {
      var s = D.SKILLS[sid];
      var b = document.createElement('button'); b.className = 'sk-btn'; b.dataset.sk = sid;
      b.innerHTML = '<span class="sk-glyph">' + s.glyph + '</span><span class="sk-name">' + s.name + '</span><span class="sk-cd"></span>';
      b.title = s.desc + (s.kind === 'economy' ? '（点击即放）' : '（点地图释放）');
      b.onclick = function () { selectSkill(sid); };
      box.appendChild(b);
    });
  }
  function buildItemBar() {
    var box = $('item-bar'); if (!box) return; box.innerHTML = '';
    D.ITEM_ORDER.forEach(function (iid) {
      var it = D.ITEMS[iid];
      var cnt = 0;
      engine.items.forEach(function (x) { if (x.id === iid) cnt = x.count; });
      var b = document.createElement('button'); b.className = 'it-btn'; b.dataset.it = iid;
      b.title = it.desc;
      b.innerHTML = '<span class="it-glyph">' + it.glyph + '</span><span class="it-name">' + it.name + '</span><span class="it-count">×' + cnt + '</span>';
      b.onclick = function () { if (engine.state.status === 'paused') return; if (engine.useItem(iid)) { updateHud(); } };
      box.appendChild(b);
    });
  }

  function selectBuild(tid) {
    if (engine.buildType === tid) { engine.buildType = null; }
    else { engine.buildType = tid; engine.skillTarget = null; engine.selected = null; hideTowerPanel(); }
    updatePaletteActive(); updateSkillActive();
  }
  function selectSkill(sid) {
    if (engine.state.status === 'paused') return;
    var sdef = D.SKILLS[sid];
    if (sdef && sdef.kind === 'economy') {
      // 经济技能：点击即放，无需选点
      engine.castSkill(sid, 0, 0);
      return;
    }
    if (engine.skillTarget === sid) { engine.skillTarget = null; }
    else { engine.skillTarget = sid; engine.buildType = null; engine.selected = null; hideTowerPanel(); }
    updatePaletteActive(); updateSkillActive();
  }
  function updatePaletteActive() {
    document.querySelectorAll('.tw-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tw === engine.buildType);
    });
  }
  function updateSkillActive() {
    document.querySelectorAll('.sk-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.sk === engine.skillTarget);
    });
  }

  /* ---- 画布交互 ---- */
  function canvasCell(e) {
    var rect = $('game-canvas').getBoundingClientRect();
    var W = D.W, H = D.H;
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    return engine.pixelToCell(x, y);
  }
  function onCanvasClick(e) {
    E.Sound.resume();
    if (engine.state.status === 'paused') return;
    var cell = canvasCell(e);
    if (engine.skillTarget) {
      if (engine.castSkill(engine.skillTarget, cell.col, cell.row)) {
        engine.skillTarget = null; updateSkillActive();
      }
      return;
    }
    if (engine.buildType) {
      engine.placeTower(cell.col, cell.row, engine.buildType);
      if (engine.state.gold < D.TOWERS[engine.buildType].cost) { engine.buildType = null; updatePaletteActive(); }
      return;
    }
    var tw = engine.getTowerAt(cell.col, cell.row);
    if (tw) { engine.selected = tw; showTowerPanel(tw); }
    else { engine.selected = null; hideTowerPanel(); }
  }
  function onCanvasMove(e) {
    var cell = canvasCell(e);
    engine.setHover(cell.col, cell.row);
  }

  /* ---- 选中塔面板 ---- */
  function showTowerPanel(tw) {
    var def = tw.def, L = def.levels[tw.level];
    $('tp-name').textContent = def.name + ' · ' + (tw.level + 1) + ' 级';
    var tags = def.aoe ? ' · 范围' : def.frost ? ' · 减速' : def.chain ? ' · 闪电' : def.pierce ? ' · 穿甲' : '';
    var info = '伤害 ' + L.dmg + ' · 射程 ' + L.range.toFixed(1) + tags + '<br>攻速 ' + L.rate.toFixed(2) + ' 次/秒';
    if (def.faction) info += '<br>势力 ' + def.faction;
    if (engine.buffMul > 1) info += '<br><span style="color:#d4a017">⚡ 全军攻速 buff 中</span>';
    if (tw.synergy > 0) info += '<br><span style="color:#2e7d32">⚔️ 羁绊攻速 +' + Math.round(tw.synergy * 100) + '%</span>';
    if (def.perk && tw.level === def.levels.length - 1) info += '<br><b style="color:#c0392b">★ ' + (D.PERK_DESC[def.perk] || '') + '</b>';
    else if (def.perk) info += '<br><span style="color:#8a7a5c">满级解锁：' + (D.PERK_DESC[def.perk] || '') + '</span>';
    $('tp-info').innerHTML = info;
    var uc = engine.upgradeCost(tw);
    var upBtn = $('btn-upgrade');
    if (uc == null) { upBtn.textContent = '已满级'; upBtn.disabled = true; }
    else { upBtn.textContent = '升级 💰' + uc; upBtn.disabled = engine.state.gold < uc; }
    var refund = Math.floor(def.cost * 0.6);
    for (var i = 0; i < tw.level; i++) refund += Math.floor((def.upgradeCost[i] || 0) * 0.6);
    $('btn-sell').textContent = '出售 💰' + refund;
    $('tower-panel').hidden = false;
    updatePaletteActive();
  }
  function hideTowerPanel() { $('tower-panel').hidden = true; }
  function doUpgrade() { if (engine.selected) { engine.upgradeTower(engine.selected); showTowerPanel(engine.selected); } }
  function doSell() { if (engine.selected) { engine.sellTower(engine.selected); hideTowerPanel(); } }

  /* ---- HUD ---- */
  function updateHud(s) {
    if (!s) s = engine.getState();
    $('hud-gold').textContent = '💰 ' + s.gold;
    $('hud-lives').textContent = '🏰 ' + s.lives + '/' + s.maxLives;
    if (s.endless) $('hud-wave').textContent = '⚔️ 坚守 ' + s.waveIndex + ' 波';
    else $('hud-wave').textContent = '⚔️ 波次 ' + Math.min(s.waveIndex, s.totalWaves) + '/' + s.totalWaves;
    $('hud-score').textContent = '⭐ ' + s.score;
    $('btn-wave').disabled = !s.canStartWave;
    $('btn-wave').textContent = s.waveActive ? '战斗中…' : '出战 ▶';
    s.skills.forEach(function (k) {
      var b = document.querySelector('.sk-btn[data-sk="' + k.id + '"]');
      if (!b) return;
      b.classList.toggle('ready', k.ready);
      b.classList.toggle('cooling', !k.ready);
      b.querySelector('.sk-cd').textContent = k.ready ? '' : Math.ceil(k.cdLeft) + 's';
    });
    if (s.items) s.items.forEach(function (it) {
      var b = document.querySelector('.it-btn[data-it="' + it.id + '"]');
      if (!b) return;
      b.classList.toggle('used', it.count <= 0);
      b.querySelector('.it-count').textContent = '×' + it.count;
    });
    if (engine.selected && !$('tower-panel').hidden) {
      var uc = engine.upgradeCost(engine.selected);
      if (uc != null) $('btn-upgrade').disabled = engine.state.gold < uc;
    }
  }

  /* ---- 胜负 ---- */
  function onEnd(res) {
    if (lastEnd) return; lastEnd = res;
    var ov = $('overlay-msg');
    var isEndless = D.MAPS[currentMapIdx].endless;
    if (res.result === 'won') {
      Save.recordClear(currentProfile.id, D.MAPS[currentMapIdx].id, res.stars, res.score);
      var next = currentMapIdx + 1;
      var hasNext = next < D.MAPS.length;
      $('om-title').textContent = '🎉 大胜！';
      $('om-title').className = 'om-win';
      var starHtml = '';
      for (var si = 0; si < 3; si++) starHtml += '<span class="star-pop' + (si < res.stars ? ' lit' : '') + '" style="animation-delay:' + (si * 0.15) + 's">★</span>';
      $('om-body').innerHTML = '<div class="star-row">' + starHtml + '</div>获得 ' + res.stars + ' 星　得分 ' + res.score + '　剩余城池 ' + res.lives;
      $('btn-next').hidden = !hasNext;
      $('btn-next').onclick = function () { startGame(next); };
    } else {
      $('om-title').textContent = '💀 城池失守';
      $('om-title').className = 'om-lose';
      var txt = '撑过 ' + engine.state.waveIndex + ' 波';
      if (isEndless) {
        Save.recordClear(currentProfile.id, 'endless', 0, engine.state.waveIndex);
        var best = (currentProfile.progress.maps.endless || { best: 0 }).best;
        txt += '　历史最佳 ' + best + ' 波';
      }
      $('om-body').innerHTML = txt + '　得分 ' + res.score;
      $('btn-next').hidden = true;
    }
    ov.hidden = false;
  }
  function retryGame() { $('overlay-msg').hidden = true; startGame(currentMapIdx); }
  function backToMaps() { $('overlay-msg').hidden = true; if (engine) { engine.state.status = 'menu'; } stopLoop(); renderMaps(); show('screen-maps'); }

  /* ---- 主循环 ---- */
  var lastT = 0;
  function loop(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (engine) {
      engine.update(dt);
      engine.render();
      updateHud();
    }
    raf = requestAnimationFrame(loop);
  }
  function startLoop() { if (raf) cancelAnimationFrame(raf); lastT = 0; raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  /* ---------------- 绑定 ---------------- */
  function bind() {
    $('btn-start').onclick = function () { E.Sound.init(); E.Sound.resume(); renderProfiles(); show('screen-profiles'); };
    $('btn-about').onclick = function () { $('overlay-about').hidden = false; };
    $('overlay-about').onclick = function () { this.hidden = true; };
    $('btn-back-menu').onclick = function () { show('screen-menu'); };
    $('btn-back-profiles').onclick = function () { show('screen-menu'); };
    $('btn-create').onclick = createProfile;
    $('profile-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') createProfile(); });
    $('btn-import').onclick = function () { $('file-import').click(); };
    $('file-import').onchange = function (e) { if (e.target.files[0]) importProfile(e.target.files[0]); e.target.value = ''; };

    $('btn-wave').onclick = function () { if (engine.state.status === 'paused') return; engine.startNextWave(); };
    $('btn-auto').onclick = function () {
      if (!engine) return;
      engine.autoWave = !engine.autoWave;
      $('btn-auto').textContent = engine.autoWave ? '自动：开' : '自动：关';
      $('btn-auto').classList.toggle('on', engine.autoWave);
      if (engine.autoWave && engine.state.status === 'ready') engine.startNextWave();
    };
    $('btn-speed').onclick = function () {
      var sp = engine.state.speed === 1 ? 2 : 1; engine.setSpeed(sp);
      $('btn-speed').textContent = sp + '×';
    };
    $('btn-pause').onclick = function () {
      engine.togglePause();
      $('btn-pause').textContent = engine.state.status === 'paused' ? '继续' : '暂停';
    };
    $('btn-quit').onclick = backToMaps;
    $('game-canvas').addEventListener('click', onCanvasClick);
    $('game-canvas').addEventListener('mousemove', onCanvasMove);
    $('game-canvas').addEventListener('mouseleave', function () { if (engine) engine.setHover(-99, -99); });

    $('btn-upgrade').onclick = doUpgrade;
    $('btn-sell').onclick = doSell;
    $('btn-retry').onclick = retryGame;
    $('btn-tomaps').onclick = backToMaps;

    document.addEventListener('pointerdown', function once() {
      E.Sound.init(); E.Sound.resume(); document.removeEventListener('pointerdown', once);
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    bind();
    show('screen-menu');
  });
})();
