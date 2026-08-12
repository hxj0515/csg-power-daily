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

  /* ---------------- 防御塔（4 种，各 3 级） ----------------
   * range 单位=格；rate 单位=次/秒；dmg 单次伤害。
   * fire=范围伤害(aoe 半径格)；frost=减速(slow 为速度倍率, slowDur 秒)；
   * mage=pierce 穿透护甲。upgradeCost[i] 为升到第 i+2 级所需金币。
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
      upgradeCost: [60, 110]
    },
    fire: {
      id: 'fire', name: '火攻营', faction: '吴', color: '#e5484d', glyph: '🔥',
      cost: 95, aoe: 0.95, desc: '范围灼烧，克制成群轻骑与步兵，赤壁绝技。',
      levels: [
        { dmg: 11, range: 2.3, rate: 0.90 },
        { dmg: 18, range: 2.5, rate: 1.00 },
        { dmg: 28, range: 2.7, rate: 1.18 }
      ],
      upgradeCost: [80, 140]
    },
    frost: {
      id: 'frost', name: '陷阵营', faction: '魏', color: '#2d7ff9', glyph: '🛡️',
      cost: 80, frost: true, desc: '寒铁减速，控场核心，配合输出塔事半功倍。',
      levels: [
        { dmg: 5, range: 2.4, rate: 1.00, slow: 0.55, slowDur: 1.4 },
        { dmg: 9, range: 2.6, rate: 1.10, slow: 0.45, slowDur: 1.6 },
        { dmg: 14, range: 2.8, rate: 1.20, slow: 0.35, slowDur: 1.9 }
      ],
      upgradeCost: [70, 120]
    },
    mage: {
      id: 'mage', name: '谋士营', faction: '汉', color: '#8e44ad', glyph: '📜',
      cost: 110, pierce: true, desc: '法术穿甲，重甲克星，单体爆发最高。',
      levels: [
        { dmg: 30, range: 2.8, rate: 0.70 },
        { dmg: 52, range: 3.0, rate: 0.80 },
        { dmg: 82, range: 3.2, rate: 0.95 }
      ],
      upgradeCost: [100, 160]
    }
  };
  var TOWER_ORDER = ['archer', 'fire', 'frost', 'mage'];

  /* ---------------- 敌人（6 种） ----------------
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

  /* ---------------- 主动技能（2 个，点地图释放，有冷却） ---------------- */
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
    }
  };
  var SKILL_ORDER = ['fireStrike', 'eightArray'];

  /* ---------------- 地图（3 张战役） ----------------
   * waypoints：路径折线（网格坐标 [col,row]，可越界表示出入口）。
   * blocked：不可建造的装饰格（山/水），仅影响可建造判定。
   * hpScale：敌人血量整体缩放；waveCount：波次数。
   */
  var MAPS = [
    {
      id: 'changban', name: '长坂坡', sub: '赵云救主 · 曹军追兵', theme: '#3f7d4f',
      bgTop: '#eaf6ec', bgBot: '#d6ecd9', road: '#caa472',
      waypoints: [[-1,2],[4,2],[4,6],[9,6],[9,2],[14,2],[14,9],[19,9]],
      blocked: [[6,9],[7,9],[11,5],[12,5],[16,4],[17,4],[2,9],[3,9]],
      startGold: 230, startLives: 20, hpScale: 1.0, waveCount: 12, boss: '张郃'
    },
    {
      id: 'chibi', name: '赤壁', sub: '火攻借风 · 锁船连舟', theme: '#c0392b',
      bgTop: '#e8f1f8', bgBot: '#cfe2f0', road: '#b98a5e',
      waypoints: [[-1,1],[3,1],[3,10],[9,10],[9,3],[15,3],[15,10],[19,10]],
      blocked: [[6,5],[7,5],[12,6],[13,6],[17,5],[18,5],[5,8],[6,8]],
      startGold: 245, startLives: 18, hpScale: 1.35, waveCount: 14, boss: '曹操'
    },
    {
      id: 'guandu', name: '官渡', sub: '以少胜多 · 乌巢奇袭', theme: '#8e44ad',
      bgTop: '#efeaf6', bgBot: '#ddd2ee', road: '#a98b6b',
      waypoints: [[-1,5],[2,5],[2,1],[7,1],[7,10],[12,10],[12,3],[17,3],[17,8],[19,8]],
      blocked: [[4,7],[5,7],[9,5],[10,5],[14,7],[15,7],[3,3],[4,3]],
      startGold: 265, startLives: 16, hpScale: 1.8, waveCount: 16, boss: '袁绍'
    }
  ];

  /* ---------------- 波次生成器 ----------------
   * 依据地图 waveCount / hpScale 程序化生成，确定性（无随机）。
   * 每波返回 { spawns:[{type,at,bossName?}], lead } —— at 为波内秒数。
   */
  function genWaves(map) {
    var waves = [];
    for (var w = 1; w <= map.waveCount; w++) {
      var groups = [];
      if (w === map.waveCount) {
        // BOSS 波：少量护卫 + 名将
        groups.push({ type: 'infantry', count: 6 + MAPS.indexOf(map) * 2, gap: 0.5, start: 0 });
        groups.push({ type: 'cavalry', count: 4 + MAPS.indexOf(map) * 2, gap: 0.5, start: 1.5 });
        groups.push({ type: 'boss', count: 1, gap: 1, start: 4, bossName: map.boss });
      } else {
        groups.push({ type: 'infantry', count: 3 + Math.floor(w * 1.4), gap: 0.7, start: 0 });
        if (w >= 2) groups.push({ type: 'cavalry', count: 2 + Math.floor(w * 0.9), gap: 0.5, start: 1.2 });
        if (w >= 3) groups.push({ type: 'archer', count: 1 + Math.floor(w * 0.7), gap: 0.6, start: 2.0 });
        if (w >= 4) groups.push({ type: 'heavy', count: 1 + Math.floor((w - 3) * 0.6), gap: 1.2, start: 2.8 });
        if (w >= 6) groups.push({ type: 'ram', count: Math.floor((w - 4) / 3) + 1, gap: 2.0, start: 3.5 });
      }
      var spawns = [];
      groups.forEach(function (g) {
        for (var i = 0; i < g.count; i++) {
          spawns.push({ type: g.type, at: g.start + i * g.gap, bossName: g.bossName });
        }
      });
      spawns.sort(function (a, b) { return a.at - b.at; });
      waves.push({ spawns: spawns, lead: 1.6 });
    }
    return waves;
  }

  // 预生成每张地图的波次
  MAPS.forEach(function (m) { m.waves = genWaves(m); });

  return {
    GRID: GRID, W: W, H: H,
    TOWERS: TOWERS, TOWER_ORDER: TOWER_ORDER,
    ENEMIES: ENEMIES,
    SKILLS: SKILLS, SKILL_ORDER: SKILL_ORDER,
    MAPS: MAPS,
    genWaves: genWaves
  };
})();
