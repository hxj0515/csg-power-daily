/* =====================================================================
 * 《三国塔防·烽火连城》PowerLink3 —— 多档案存档（save.js）
 * ---------------------------------------------------------------------
 * 多个人档案存于 localStorage：
 *   powerlink3:profiles:v1  —— 档案数组
 *   powerlink3:current:v1   —— 当前选中档案 id
 * 进度模型：profile.progress.maps[mapId] = { stars, best, cleared }
 * 解锁：第 0 关恒解锁；通关前一关(stars>=1)解锁下一关。
 * 支持 JSON 导出/导入备份。
 * ===================================================================== */

window.PL3Save = (function () {
  var KEY_PROFILES = 'powerlink3:profiles:v1';
  var KEY_CURRENT = 'powerlink3:current:v1';

  function safeParse(s, def) {
    try { return s ? JSON.parse(s) : def; } catch (e) { return def; }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }

  function loadProfiles() {
    var arr = safeParse(read(KEY_PROFILES), []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveProfiles(arr) {
    write(KEY_PROFILES, JSON.stringify(arr));
  }
  function loadCurrent() {
    return read(KEY_CURRENT) || '';
  }
  function saveCurrent(id) {
    write(KEY_CURRENT, id);
  }

  function getProfile(id) {
    var list = loadProfiles();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function createProfile(name) {
    var list = loadProfiles();
    var id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var prof = {
      id: id, name: (name || ('将军' + (list.length + 1))).slice(0, 16),
      createdAt: Date.now(),
      progress: { maps: {} },
      stats: { kills: 0, gold: 0 }
    };
    list.push(prof);
    saveProfiles(list);
    saveCurrent(id);
    return prof;
  }

  function deleteProfile(id) {
    var list = loadProfiles().filter(function (p) { return p.id !== id; });
    saveProfiles(list);
    if (loadCurrent() === id) saveCurrent(list.length ? list[0].id : '');
  }

  function renameProfile(id, name) {
    var p = getProfile(id);
    if (!p) return;
    p.name = (name || p.name).slice(0, 16);
    saveProfiles(loadProfiles().map(function (x) { return x.id === id ? p : x; }));
  }

  // 累计战绩统计（总击杀 / 总缴金），旧存档无 stats 时自动补齐
  function addStats(id, kills, gold) {
    var p = getProfile(id);
    if (!p) return;
    if (!p.stats) p.stats = { kills: 0, gold: 0 };
    p.stats.kills += (kills || 0);
    p.stats.gold += (gold || 0);
    saveProfiles(loadProfiles().map(function (x) { return x.id === id ? p : x; }));
  }

  // 关卡完成：写入星级/最高分，返回是否刷新纪录
  function recordClear(id, mapId, stars, score) {
    var p = getProfile(id);
    if (!p) return false;
    var m = p.progress.maps[mapId] || { stars: 0, best: 0, cleared: false };
    var improved = false;
    if (stars > m.stars) { m.stars = stars; improved = true; }
    if (score > m.best) { m.best = score; improved = true; }
    m.cleared = true;
    p.progress.maps[mapId] = m;
    saveProfiles(loadProfiles().map(function (x) { return x.id === id ? p : x; }));
    return improved;
  }

  // 解锁：依据 MAPS 顺序，返回某关是否解锁
  function isUnlocked(id, mapIndex, MAPS) {
    if (mapIndex <= 0) return true;
    var p = getProfile(id);
    if (!p) return false;
    var prev = MAPS[mapIndex - 1];
    var pm = p.progress.maps[prev.id];
    return !!(pm && pm.cleared);
  }

  function exportJSON(id) {
    var p = getProfile(id);
    if (!p) return '';
    return JSON.stringify({ app: 'powerlink3', version: 1, profile: p }, null, 2);
  }

  function importJSON(text) {
    var obj = safeParse(text, null);
    if (!obj || !obj.profile || !obj.profile.id) return null;
    var list = loadProfiles();
    // 合并：同 id 覆盖，否则新增
    var exist = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === obj.profile.id) { list[i] = obj.profile; exist = true; break; }
    }
    if (!exist) list.push(obj.profile);
    saveProfiles(list);
    saveCurrent(obj.profile.id);
    return obj.profile;
  }

  return {
    loadProfiles: loadProfiles, loadCurrent: loadCurrent, saveCurrent: saveCurrent,
    getProfile: getProfile, createProfile: createProfile, deleteProfile: deleteProfile,
    renameProfile: renameProfile, recordClear: recordClear, isUnlocked: isUnlocked,
    addStats: addStats,
    exportJSON: exportJSON, importJSON: importJSON
  };
})();
