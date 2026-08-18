/* =====================================================================
 * 《三国塔防·烽火连城》PowerLink3 —— 配置数据（config.js）
 * ---------------------------------------------------------------------
 * 纯静态塔防游戏的全部可调数据集中在此。本文件以经典 <script> 引入，
 * 把 window.PL3_DATA 挂到全局，engine.js / ui.js 直接读取。
 * 无 ES module、无打包、零外部素材依赖。
 * ===================================================================== */

window.PL3_DATA = (function () {
  var GRID = { COLS: 20, ROWS: 12, CELL: 46 };
  var W = GRID.COLS * GRID.CELL;   // 920
  var H = GRID.ROWS * GRID.CELL;   // 552

  /* ---------------- 防御塔（6 种，各 3 级，含满级特技 perk） ----------------
   * range 单位=格；rate 单位=次/秒；dmg 单次伤害。
   * aoe=范围伤害(半径格)；frost=减速(slow 速度倍率, slowDur 秒)；pierce=穿甲；
   * chain=连锁闪电(跳数, chainFall=衰减)；perk=满级(3 级)解锁的专属特技。
   * faction 用于「相邻同势力羁绊」攻速加成。
   */
  var TOWERS = {
    archer: {
      id: 'archer', name: '弓弩营', faction: '蜀', color: '#2e9e5b', glyph: '🏹',
      cost: 70, desc: '单体高频射击，性价比之王，适合密集点射。',
      levels: [
        { dmg: 14, range: 2.6, rate: 1.10 },
        { dmg: 24, range: 2.9, rate: 1.30 },
        { dmg: 42, range: 3.2, rate: 1.65 }
      ],
      upgradeCost: [60, 110], perk: 'crit'
    },
    fire: {
      id: 'fire', name: '火攻营', faction: '吴', color: '#e5484d', glyph: '🔥',
      cost: 95, aoe: 0.95, desc: '范围灼烧，克制成群轻骑与步兵，赤壁绝技。',
      levels: [
        { dmg: 11, range: 2.3, rate: 0.90 },
        { dmg: 18, range: 2.5, rate: 1.00 },
        { dmg: 28, range: 2.7, rate: 1.18 }
      ],
      upgradeCost: [80, 140], perk: 'burn'
    },
    frost: {
      id: 'frost', name: '陷阵营', faction: '魏', color: '#2d7ff9', glyph: '🛡️',
      cost: 80, frost: true, desc: '寒铁减速，控场核心，配合输出塔事半功倍。',
      levels: [
        { dmg: 5, range: 2.4, rate: 1.00, slow: 0.55, slowDur: 1.4 },
        { dmg: 9, range: 2.6, rate: 1.10, slow: 0.45, slowDur: 1.6 },
        { dmg: 14, range: 2.8, rate: 1.20, slow: 0.35, slowDur: 1.9 }
      ],
      upgradeCost: [70, 120], perk: 'frostAura'
    },
    mage: {
      id: 'mage', name: '谋士营', faction: '汉', color: '#8e44ad', glyph: '📜',
      cost: 110, pierce: true, desc: '法术穿甲，重甲克星，单体爆发最高。',
      levels: [
        { dmg: 30, range: 2.8, rate: 0.70 },
        { dmg: 52, range: 3.0, rate: 0.80 },
        { dmg: 82, range: 3.2, rate: 0.95 }
      ],
      upgradeCost: [100, 160], perk: 'overload'
    },
    /* —— 新增：投石营（蜀，超远程范围爆发） —— */
    catapult: {
      id: 'catapult', name: '投石营', faction: '蜀', color: '#6d4c41', glyph: '🪨',
      cost: 120, aoe: 1.15, desc: '超远程范围爆发，专破重甲与密集阵，攻速偏慢。',
      levels: [
        { dmg: 34, range: 3.6, rate: 0.55 },
        { dmg: 56, range: 3.9, rate: 0.62 },
        { dmg: 88, range: 4.2, rate: 0.72 }
      ],
      upgradeCost: [100, 170], perk: 'siege'
    },
    /* —— 新增：雷火营（吴，连锁闪电） —— */
    thunder: {
      id: 'thunder', name: '雷火营', faction: '吴', color: '#b8860b', glyph: '⚡',
      cost: 105, chain: 2, chainFall: 0.7, desc: '连锁闪电跳跃灼敌，成群时越打越爽。',
      levels: [
        { dmg: 20, range: 2.8, rate: 0.90 },
        { dmg: 34, range: 3.0, rate: 1.00 },
        { dmg: 54, range: 3.2, rate: 1.15 }
      ],
      upgradeCost: [90, 150], perk: 'chainPlus'
    }
  };
  var TOWER_ORDER = ['archer', 'fire', 'frost', 'mage', 'catapult', 'thunder'];

  /* 满级特技(perk)中文说明，供 UI 展示 */
  var PERK_DESC = {
    crit: '满级暴击：25% 概率造成双倍伤害',
    burn: '满级点燃：命中附加 3 秒持续灼烧',
    frostAura: '满级寒霜：攻击溅射小范围减速',
    overload: '满级过载：伤害提升 30%',
    siege: '满级攻城：范围半径 +25%',
    chainPlus: '满级连环：闪电额外跳跃 1 次'
  };

  /* ---------------- 敌人（6 种，沿用既有设定） ----------------
   * hp 基础血量；speed 格/秒；gold 击杀奖励；armor 伤害减免[0,1]；
   * boss 额外高血厚甲。color 阵营色环，glyph 卡通字形。
   */
  var ENEMIES = {
    infantry: { id: 'infantry', name: '步兵', hp: 62, speed: 1.6, gold: 8, armor: 0, color: '#8d6e63', glyph: '⚔️' },
    cavalry:  { id: 'cavalry',  name: '轻骑', hp: 42, speed: 3.0, gold: 10, armor: 0, color: '#a1887f', glyph: '🐎' },
    archer:   { id: 'archer',   name: '弓兵', hp: 52, speed: 1.8, gold: 9, armor: 0, color: '#5c6bc0', glyph: '🎯' },
    heavy:    { id: 'heavy',    name: '重甲', hp: 170, speed: 1.0, gold: 18, armor: 0.40, color: '#455a64', glyph: '🐢' },
    ram:      { id: 'ram',      name: '攻城车', hp: 320, speed: 0.8, gold: 30, armor: 0.25, color: '#6d4c41', glyph: '🛖' },
    boss:     { id: 'boss',     name: '名将', hp: 1300, speed: 0.9, gold: 130, armor: 0.30, color: '#b71c1c', glyph: '👑', boss: true }
  };

  /* ---------------- BOSS 名将特技（按 bossName 映射） ----------------
   * charge：周期冲锋，短暂大幅提速直扑城池；
   * summon：周期召唤小兵（在自身当前位置生成步兵/轻骑）；
   * armor ：常态重甲，伤害减免更高；
   * mixed ：冲锋 + 召唤 双重威胁（无尽烽火群雄）。
   */
  var BOSS_ABILITY = {
    '张郃': 'charge',   // 长坂坡
    '曹操': 'summon',   // 赤壁
    '袁绍': 'armor',    // 官渡
    '张辽': 'charge',   // 合肥逍遥津
    '群雄': 'mixed'     // 无尽烽火
  };

  /* ---------------- 主动技能（4 个，前 2 个点地图释放，后 2 个含经济类） ----------------
   * kind: aoe=范围伤害, stun=眩晕, economy=开仓放粮(立即发金+短时全军攻速 buff，无需点地图)。
   */
  var SKILLS = {
    fireStrike: {
      id: 'fireStrike', name: '火烧赤壁', glyph: '🔥', cd: 18, radius: 1.6, dmg: 130,
      kind: 'aoe', color: '#ff7043',
      desc: '指定区域烈火焚敌，范围爆发伤害。'
    },
    eightArray: {
      id: 'eightArray', name: '八阵图', glyph: '🌀', cd: 22, radius: 1.8, stun: 2.6,
      kind: 'stun', color: '#42a5f5',
      desc: '布下石阵，区域内敌军定身眩晕。'
    },
    /* —— 新增：草船借箭（大范围箭雨） —— */
    arrowRain: {
      id: 'arrowRain', name: '草船借箭', glyph: '🌧️', cd: 24, radius: 3.0, dmg: 90,
      kind: 'aoe', color: '#7e57c2',
      desc: '万箭齐发覆盖大片区域，压制成群敌军。'
    },
    /* —— 新增：屯田令（经济技能，点击即放） —— */
    tuntian: {
      id: 'tuntian', name: '屯田令', glyph: '💰', cd: 30, kind: 'economy',
      gold: 150, buffDur: 8, buffMul: 1.3, color: '#f57f17',
      desc: '开仓放粮：立即 +150 金，8 秒内全军攻速 +30%。'
    }
  };
  var SKILL_ORDER = ['fireStrike', 'eightArray', 'arrowRain', 'tuntian'];

  /* ---------------- 锦囊（对局内可点用的消耗道具，开局各送 1 个） ---------------- */
  var ITEMS = {
    shield: { id: 'shield', name: '免伤令牌', glyph: '🛡️', desc: '挡下一次敌军破城，城池不掉血。' },
    gold:   { id: 'gold',   name: '天降横财', glyph: '💰', desc: '立即获得 150 金。' },
    rally:  { id: 'rally',  name: '擂鼓助威', glyph: '🥁', desc: '8 秒内全军攻速 +30%。' }
  };
  var ITEM_ORDER = ['shield', 'gold', 'rally'];
  var START_ITEMS = { shield: 1, gold: 1, rally: 1 };

  /* ---------------- 地图（4 张战役 + 1 张无尽） ----------------
   * waypoints：路径折线（网格坐标 [col,row]，可越界表示出入口）。
   * blocked：不可建造的装饰格（山/水），仅影响可建造判定。
   * hpScale：敌人血量整体缩放；waveCount：波次数；endless：无尽模式。
   */
  var MAPS = [
    {
      id: 'changban', name: '长坂坡', sub: '赵云救主 · 曹军追兵', theme: '#3f7d4f',
      bgTop: '#eaf6ec', bgBot: '#d6ecd9', road: '#caa472',
      waypoints: [[-1,2],[4,2],[4,6],[9,6],[9,2],[14,2],[14,9],[19,9]],
      blocked: [[6,9],[7,9],[11,5],[12,5],[16,4],[17,4],[2,9],[3,9]],
      startGold: 245, startLives: 20, hpScale: 1.0, waveCount: 12, boss: '张郃'
    },
    {
      id: 'chibi', name: '赤壁', sub: '火攻借风 · 锁船连舟', theme: '#c0392b',
      bgTop: '#e8f1f8', bgBot: '#cfe2f0', road: '#b98a5e',
      waypoints: [[-1,1],[3,1],[3,10],[9,10],[9,3],[15,3],[15,10],[19,10]],
      blocked: [[6,5],[7,5],[12,6],[13,6],[17,5],[18,5],[5,8],[6,8]],
      startGold: 260, startLives: 18, hpScale: 1.35, waveCount: 14, boss: '曹操'
    },
    {
      id: 'guandu', name: '官渡', sub: '以少胜多 · 乌巢奇袭', theme: '#8e44ad',
      bgTop: '#efeaf6', bgBot: '#ddd2ee', road: '#a98b6b',
      waypoints: [[-1,5],[2,5],[2,1],[7,1],[7,10],[12,10],[12,3],[17,3],[17,8],[19,8]],
      blocked: [[4,7],[5,7],[9,5],[10,5],[14,7],[15,7],[3,3],[4,3]],
      startGold: 285, startLives: 16, hpScale: 1.8, waveCount: 16, boss: '袁绍'
    },
    /* —— 新增：合肥逍遥津（第 4 战，张辽威震） —— */
    {
      id: 'hefei', name: '合肥逍遥津', sub: '张辽威震 · 孙权败退', theme: '#1b5e20',
      bgTop: '#e9f3ea', bgBot: '#cfe6d2', road: '#a98b6b',
      waypoints: [[-1,3],[3,3],[3,8],[8,8],[8,2],[13,2],[13,9],[19,9]],
      blocked: [[5,5],[6,5],[10,4],[11,4],[15,6],[16,6],[3,6],[4,6],[9,5],[10,5]],
      startGold: 305, startLives: 15, hpScale: 2.35, waveCount: 18, boss: '张辽'
    },
    /* —— 无尽烽火（无限波次，难度递增，永夜征战） —— */
    {
      id: 'endless', name: '无尽烽火', sub: '烽火连城 · 永夜征战', theme: '#c0392b',
      bgTop: '#f3e7dc', bgBot: '#e2cfc0', road: '#b98a5e',
      waypoints: [[-1,2],[4,2],[4,6],[9,6],[9,2],[14,2],[14,9],[19,9]],
      blocked: [[6,9],[7,9],[11,5],[12,5],[16,4],[17,4],[2,9],[3,9]],
      startGold: 270, startLives: 20, hpScale: 1.0, waveCount: 999999, endless: true, boss: '群雄'
    }
  ];

  /* ---------------- 波次生成器（战役，确定性无随机） ----------------
   * 每波返回 { spawns:[{type,at,bossName?}], lead, hpScale } —— at 为波内秒数。
   */
  function genWaves(map) {
    if (map.endless) return [];   // 无尽模式由引擎动态生成
    var waves = [];
    for (var w = 1; w <= map.waveCount; w++) {
      var groups = [];
      if (w === map.waveCount) {
        // BOSS 波：少量护卫 + 名将
        groups.push({ type: 'infantry', count: 6 + MAPS.indexOf(map) * 2, gap: 0.5, start: 0 });
        groups.push({ type: 'cavalry', count: 4 + MAPS.indexOf(map) * 2, gap: 0.5, start: 1.5 });
        groups.push({ type: 'boss', count: 1, gap: 1, start: 4, bossName: map.boss });
      } else {
        groups.push({ type: 'infantry', count: 3 + Math.floor(w * 1.3), gap: 0.7, start: 0 });
        if (w >= 2) groups.push({ type: 'cavalry', count: 2 + Math.floor(w * 0.85), gap: 0.5, start: 1.2 });
        if (w >= 3) groups.push({ type: 'archer', count: 1 + Math.floor(w * 0.65), gap: 0.6, start: 2.0 });
        if (w >= 4) groups.push({ type: 'heavy', count: 1 + Math.floor((w - 3) * 0.55), gap: 1.2, start: 2.8 });
        if (w >= 6) groups.push({ type: 'ram', count: Math.floor((w - 4) / 3) + 1, gap: 2.0, start: 3.5 });
      }
      var spawns = [];
      groups.forEach(function (g) {
        for (var i = 0; i < g.count; i++) {
          spawns.push({ type: g.type, at: g.start + i * g.gap, bossName: g.bossName });
        }
      });
      spawns.sort(function (a, b) { return a.at - b.at; });
      // 波间间隔随关卡推进，前期宽松后期紧张，节奏更顺
      var lead = w <= 2 ? 2.2 : (w <= 5 ? 1.8 : 1.4);
      waves.push({ spawns: spawns, lead: lead, hpScale: map.hpScale });
    }
    return waves;
  }

  /* ---------------- 波次生成器（无尽，难度随波数递增） ---------------- */
  function genEndlessWave(w, map) {
    var scale = 1 + (w - 1) * 0.06;   // 每波血量 +6%
    var groups = [];
    groups.push({ type: 'infantry', count: 4 + Math.floor(w * 1.2), gap: 0.6, start: 0 });
    groups.push({ type: 'cavalry', count: 2 + Math.floor(w * 0.8), gap: 0.5, start: 1.0 });
    if (w >= 2) groups.push({ type: 'archer', count: 1 + Math.floor(w * 0.6), gap: 0.6, start: 1.8 });
    if (w >= 3) groups.push({ type: 'heavy', count: 1 + Math.floor(w * 0.5), gap: 1.0, start: 2.6 });
    if (w >= 4) groups.push({ type: 'ram', count: Math.floor(w / 4) + 1, gap: 1.8, start: 3.4 });
    if (w % 5 === 0) groups.push({ type: 'boss', count: Math.floor(w / 5), gap: 1.2, start: 4.5, bossName: map.boss });
    var spawns = [];
    groups.forEach(function (g) {
      for (var i = 0; i < g.count; i++) spawns.push({ type: g.type, at: g.start + i * g.gap, bossName: g.bossName });
    });
    spawns.sort(function (a, b) { return a.at - b.at; });
    return { spawns: spawns, lead: 1.6, hpScale: scale };
  }

  // 预生成每张战役地图的波次（无尽地图留空，运行时动态追加）
  MAPS.forEach(function (m) { m.waves = genWaves(m); });

  return {
    GRID: GRID, W: W, H: H,
    TOWERS: TOWERS, TOWER_ORDER: TOWER_ORDER, PERK_DESC: PERK_DESC,
    ENEMIES: ENEMIES, BOSS_ABILITY: BOSS_ABILITY,
    SKILLS: SKILLS, SKILL_ORDER: SKILL_ORDER,
    ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, START_ITEMS: START_ITEMS,
    MAPS: MAPS,
    genWaves: genWaves, genEndlessWave: genEndlessWave
  };
})();
