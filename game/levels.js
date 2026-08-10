/*!
 * 电亮全城 PowerLink —— 关卡数据与确定性生成器
 * ------------------------------------------------------------------
 * 纯 vanilla JS，无任何依赖，可在 file:// 下由经典 <script> 直接加载。
 * 必须在 game.js 之前引入。
 *
 * 对外导出（挂在 window 上）：
 *   window.POWERLINK_CONFIG   ★唯一旋钮面板★ 所有产品参数都在这里，改一行即可翻转
 *   window.POWERLINK_PALETTE  颜色 + 形状调色板（色盲友好：颜色永不作为唯一区分手段）
 *   window.POWERLINK_PACKS    关卡包元数据（含解锁星数门槛）
 *   window.POWERLINK_LEVELS   60 个内置关卡（确定性生成，每次结果完全一致）
 *   window.PowerLinkDaily(dateStr)  以 YYYY-MM-DD 为种子生成当日关卡
 *   window.PowerLinkGen       生成器内部工具（供自检脚本使用）
 *
 * 关卡结构：
 *   {
 *     id: 'L01', name: '初次合闸', pack: 'p1', size: 5,
 *     pairs: [
 *       { color:'#38e1ff', shape:'square', label:'青',
 *         endpoints: [[r,c],[r,c]],      // 发电站 / 用电点
 *         solution:  [[r,c],[r,c],...] } // 参考解（提示系统用），首尾即 endpoints
 *     ]
 *   }
 *   所有 pair.solution 拼起来恰好覆盖全盘 N×N 每一格恰好一次
 *   —— 因此每关都保证存在 100% 满铺解（三星可达）。
 * ------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  /* ================================================================
   * 0. 配置面板 —— 产品参数集中区
   *    所有"拍板参数"都在这一块，改一行即可生效，不需要动任何逻辑代码。
   *    game.js 会读取 window.POWERLINK_CONFIG；若本文件缺失也有等值兜底。
   * ================================================================ */

  var CONFIG = {
    /* --- 关卡包解锁 ------------------------------------------------ */
    /** 总开关：设为 true → 忽略下面所有门槛，60 关全部开放 */
    ALL_PACKS_OPEN: false,
    /** 累计星数门槛（松门槛：第 N 包的门槛远低于前 N-1 包的满星） */
    PACK_UNLOCK: { p1: 0, p2: 22, p3: 50, p4: 80 },
    /** 每包关卡数（LEVEL_PLAN 会按此切分并自检） */
    LEVELS_PER_PACK: 15,

    /* --- 星级规则（全部整数计数，禁止浮点比较） -------------------- */
    /** 3★：铺满的格子数必须 === 总格数（整数相等） */
    STAR3_REQUIRE_FULL: true,
    /** 2★：filled * 100 >= total * 该值（整数乘法比较，不做除法） */
    STAR2_COVER_PERCENT: 80,
    /** 步数不计入星级；仅作为"个人最佳"展示 */
    MOVES_AFFECT_STARS: false,

    /* --- 提示惩罚 --------------------------------------------------- */
    /** 使用提示后本局星级上限；重玩不用提示仍可拿 3★ */
    HINT_PENALTY_MAX_STAR: 2,

    /* --- 每日挑战 --------------------------------------------------- */
    /** 是否允许补做往日；false = 只有当天可玩，过去的灰显不可点 */
    DAILY_ALLOW_MAKEUP: false,
    /** 每日战绩回看天数（只读展示，不可补做） */
    DAILY_HISTORY_DAYS: 7,

    /* --- 音效 ------------------------------------------------------- */
    /** WebAudio 振荡器实时合成，零音频文件；新档案默认开 */
    SOUND_DEFAULT_ON: true
  };

  /* ================================================================
   * 1. 调色板（按感知距离排序取用，配对形状保证色盲可辨）
   * ================================================================ */

  var PALETTE = [
    { color: '#38e1ff', shape: 'square',   label: '青' },
    { color: '#ffb02e', shape: 'triangle', label: '琥珀' },
    { color: '#ff4f6d', shape: 'circle',   label: '红' },
    { color: '#4ade5f', shape: 'diamond',  label: '绿' },
    { color: '#b07bff', shape: 'hexagon',  label: '紫' },
    { color: '#ff8ad8', shape: 'cross',    label: '粉' },
    { color: '#f2ef7a', shape: 'star',     label: '黄' },
    { color: '#00c2a8', shape: 'ring',     label: '松绿' }
  ];

  /** 单关颜色数硬上限（设计约束：防认知过载） */
  var MAX_PAIRS = 7;

  /* ================================================================
   * 2. 确定性随机（字符串 -> 种子 -> 均匀分布）
   *    Math.imul + 无符号位移，全部为 32 位整数运算，
   *    在任何 JS 引擎上位级一致 => 同种子必得同关卡。
   * ================================================================ */

  function xfnv1a(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** [0, n) 整数 */
  function randInt(rnd, n) {
    var v = (rnd() * n) | 0;
    return v < 0 ? 0 : (v >= n ? n - 1 : v);
  }

  /* ================================================================
   * 3. 哈密顿路径：蛇形起手 + backbite 随机扰动
   *    backbite 是保哈密顿性的局部变换，永不失败、无回溯爆炸。
   * ================================================================ */

  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /** 蛇形路径：一定存在于任意 N×N 网格 */
  function snakePath(n) {
    var p = [], r, c;
    for (r = 0; r < n; r++) {
      if (r % 2 === 0) { for (c = 0; c < n; c++) p.push([r, c]); }
      else { for (c = n - 1; c >= 0; c--) p.push([r, c]); }
    }
    return p;
  }

  function reverseRange(arr, i, j) {
    while (i < j) {
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      i++; j--;
    }
  }

  /**
   * backbite：随机挑一端 e，随机挑它的一个网格邻居 v（v 在路径上且与 e 非路径相邻），
   * 加边 (e,v) 并删掉 v 朝 e 一侧的那条路径边 —— 结果仍是一条哈密顿路径。
   * 反复执行即可把蛇形充分打乱。
   */
  function backbite(path, n, rnd, iterations) {
    var total = n * n;
    var pos = new Int32Array(total);
    var i, k;
    for (i = 0; i < path.length; i++) pos[path[i][0] * n + path[i][1]] = i;

    for (var it = 0; it < iterations; it++) {
      var atHead = rnd() < 0.5;
      var end = atHead ? path[0] : path[path.length - 1];
      var cand = null, candCount = 0, chosen = -1;

      // 蓄水池式随机选取合法邻居，避免额外数组分配
      for (var d = 0; d < 4; d++) {
        var nr = end[0] + DIRS[d][0];
        var nc = end[1] + DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        var j = pos[nr * n + nc];
        if (atHead) { if (j < 2) continue; }
        else { if (j > path.length - 3) continue; }
        candCount++;
        if (randInt(rnd, candCount) === 0) chosen = j;
      }
      if (chosen < 0) continue;
      cand = chosen;

      if (atHead) {
        reverseRange(path, 0, cand - 1);
        for (k = 0; k < cand; k++) pos[path[k][0] * n + path[k][1]] = k;
      } else {
        reverseRange(path, cand + 1, path.length - 1);
        for (k = cand + 1; k < path.length; k++) pos[path[k][0] * n + path[k][1]] = k;
      }
    }
    return path;
  }

  /* ================================================================
   * 4. 切段：把哈密顿路径切成 K 段连续子路径
   * ================================================================ */

  /** 按 σ 档位推导单段长度上下界 */
  function lengthBand(total, k, sigma) {
    var avg = total / k;
    var lo, hi;
    if (sigma === 'low') { lo = avg * 0.78; hi = avg * 1.32; }
    else if (sigma === 'high') { lo = avg * 0.38; hi = avg * 2.10; }
    else { lo = avg * 0.58; hi = avg * 1.66; }

    var minLen = Math.max(3, Math.round(lo));
    // 设计约束：单段不得超过总格数的 55%，防止"一笔画"主导策略
    var hardCap = Math.max(minLen + 2, Math.floor(total * 0.55));
    var maxLen = Math.min(hardCap, Math.max(minLen + 2, Math.round(hi)));

    // 可行性夹取：必须满足 k*minLen <= total <= k*maxLen
    while (k * minLen > total && minLen > 3) minLen--;
    if (k * minLen > total) minLen = Math.max(1, Math.floor(total / k));
    while (k * maxLen < total) maxLen++;
    if (maxLen < minLen) maxLen = minLen;
    return { min: minLen, max: maxLen };
  }

  /** 生成 k 个和为 total 的段长，每个落在 [min,max] */
  function randomLengths(total, k, rnd, band) {
    if (k * band.min > total || k * band.max < total) return null;
    var lens = new Array(k), i;
    for (i = 0; i < k; i++) lens[i] = band.min;
    var extra = total - k * band.min;
    var guard = extra * 40 + 500;
    while (extra > 0 && guard-- > 0) {
      var j = randInt(rnd, k);
      if (lens[j] < band.max) { lens[j]++; extra--; }
    }
    return extra === 0 ? lens : null;
  }

  function cutPath(path, lens) {
    var segs = [], at = 0;
    for (var i = 0; i < lens.length; i++) {
      segs.push(path.slice(at, at + lens[i]));
      at += lens[i];
    }
    return segs;
  }

  /* ================================================================
   * 5. 合法性过滤（全部来自设计文档 §7.2.4）
   * ================================================================ */

  function manhattan(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  }

  function segsValid(segs, total) {
    var offDiagonal = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.length < 3) return false;                    // 段长 >= 3
      if (s.length > total * 0.55) return false;         // 防一笔画主导
      var a = s[0], b = s[s.length - 1];
      if (manhattan(a, b) < 2) return false;             // 端点不得同格/正交相邻
      if (a[0] !== b[0] && a[1] !== b[1]) offDiagonal++;  // 不同行且不同列
    }
    return offDiagonal >= 2;                             // 至少 2 对，避免过度对称
  }

  /* ================================================================
   * 6. 组装关卡
   * ================================================================ */

  function buildLevel(meta, n, segs) {
    var pairs = [];
    for (var i = 0; i < segs.length; i++) {
      var sk = PALETTE[i % PALETTE.length];
      var seg = segs[i];
      var sol = [];
      for (var j = 0; j < seg.length; j++) sol.push([seg[j][0], seg[j][1]]);
      pairs.push({
        color: sk.color,
        shape: sk.shape,
        label: sk.label,
        endpoints: [[sol[0][0], sol[0][1]], [sol[sol.length - 1][0], sol[sol.length - 1][1]]],
        solution: sol
      });
    }
    return {
      id: meta.id,
      name: meta.name,
      pack: meta.pack || null,
      daily: !!meta.daily,
      date: meta.date || null,
      size: n,
      pairs: pairs
    };
  }

  /**
   * 生成一个保证存在 100% 满铺解的关卡。
   * 任何情况下都会返回一个结构合法的关卡（多级降级，永不抛错）。
   */
  function generate(meta) {
    var n = Math.max(3, meta.size | 0);
    var k = Math.max(2, Math.min(MAX_PAIRS, meta.pairs | 0));
    var total = n * n;
    var sigma = meta.sigma || 'mid';
    var rnd = mulberry32(xfnv1a(String(meta.seed || meta.id || 'powerlink')));

    var path = snakePath(n);
    backbite(path, n, rnd, total * 30);

    var band = lengthBand(total, k, sigma);
    var fallback = null;

    for (var attempt = 0; attempt < 220; attempt++) {
      var lens = randomLengths(total, k, rnd, band);
      if (lens) {
        var segs = cutPath(path, lens);
        if (segsValid(segs, total)) return buildLevel(meta, n, segs);
        if (!fallback) fallback = segs;
      }
      backbite(path, n, rnd, total * 3);
    }

    // 降级 1：放宽到"仅要求段长 >=3 且端点不正交相邻"
    for (var a2 = 0; a2 < 120; a2++) {
      var lens2 = randomLengths(total, k, rnd, { min: 3, max: total });
      if (lens2) {
        var segs2 = cutPath(path, lens2);
        var ok = true;
        for (var i = 0; i < segs2.length; i++) {
          var s = segs2[i];
          if (s.length < 3 || manhattan(s[0], s[s.length - 1]) < 2) { ok = false; break; }
        }
        if (ok) return buildLevel(meta, n, segs2);
        if (!fallback) fallback = segs2;
      }
      backbite(path, n, rnd, total * 2);
    }

    // 降级 2：等分切段（一定成立，只是手感平庸）
    if (!fallback) {
      var even = [], base = Math.floor(total / k), rest = total - base * k;
      for (var e = 0; e < k; e++) even.push(base + (e < rest ? 1 : 0));
      fallback = cutPath(path, even);
    }
    return buildLevel(meta, n, fallback);
  }

  /* ================================================================
   * 7. 内置 60 关（4 个关卡包 × 15 关）
   *
   *    难度曲线设计：
   *    - 网格边长在 60 关内单调不降：5×5 → 6×6 → 7×7 → 8×8 → 9×9
   *    - 每个包内部跨两档尺寸，换尺寸的第一关必为"缓冲关"（K 降、σ 降），
   *      让玩家用熟悉的难度先认识新盘面大小。
   *    - 锯齿节律：包内每 4~5 关插一个缓冲关，避免连续高压导致弃坑。
   *    - K（线路条数）上限 7，受 MAX_PAIRS 约束，防止认知过载。
   *
   *    每包 15 关满星 45★，解锁门槛见 CONFIG.PACK_UNLOCK（22/50/80），
   *    均为"松门槛"：拿到前一包约一半星数即可进入下一包。
   * ================================================================ */

  var PACKS = [
    { id: 'p1', name: '配电小区',   size: 5, desc: '5×5 → 6×6 · 入门' },
    { id: 'p2', name: '城区变电',   size: 6, desc: '6×6 → 7×7 · 进阶' },
    { id: 'p3', name: '区域主网',   size: 7, desc: '7×7 → 8×8 · 挑战' },
    { id: 'p4', name: '特高压枢纽', size: 8, desc: '8×8 → 9×9 · 终局' }
  ];

  // 把解锁门槛挂到包元数据上，UI 直接读 pk.need，不必再查表
  for (var pi = 0; pi < PACKS.length; pi++) {
    var needV = CONFIG.PACK_UNLOCK[PACKS[pi].id];
    PACKS[pi].need = typeof needV === 'number' ? needV : 0;
  }

  // [关名, 包 id, 网格边长, 端点对数 K, 长度方差档位]
  var LEVEL_PLAN = [
    /* ---- Pack 1 · 配电小区（1-15）5×5 ×9 → 6×6 ×6 ---- */
    ['初次合闸',   'p1', 5, 3, 'low'],
    ['街角灯箱',   'p1', 5, 3, 'low'],
    ['双回路',     'p1', 5, 3, 'mid'],
    ['楼道声控灯', 'p1', 5, 4, 'low'],
    ['社区配电房', 'p1', 5, 4, 'low'],   // 缓冲
    ['夜市摊位',   'p1', 5, 4, 'mid'],
    ['早点铺',     'p1', 5, 4, 'mid'],
    ['校园环网',   'p1', 5, 5, 'mid'],
    ['小区水泵',   'p1', 5, 5, 'mid'],
    ['便利店冷柜', 'p1', 6, 4, 'low'],   // 缓冲 · 换尺寸
    ['公交充电桩', 'p1', 6, 4, 'mid'],
    ['路灯支线',   'p1', 6, 5, 'low'],
    ['幼儿园',     'p1', 6, 5, 'mid'],
    ['菜市场',     'p1', 6, 5, 'mid'],
    ['街区总闸',   'p1', 6, 6, 'mid'],

    /* ---- Pack 2 · 城区变电（16-30）6×6 ×7 → 7×7 ×8 ---- */
    ['变电所',     'p2', 6, 4, 'low'],   // 缓冲 · 开包
    ['地铁牵引',   'p2', 6, 5, 'mid'],
    ['老城改造',   'p2', 6, 5, 'mid'],
    ['商圈负荷',   'p2', 6, 5, 'high'],
    ['写字楼空调', 'p2', 6, 6, 'mid'],
    ['高压走廊',   'p2', 6, 6, 'high'],
    ['潮汐负荷',   'p2', 6, 6, 'high'],
    ['环路电缆',   'p2', 7, 5, 'low'],   // 缓冲 · 换尺寸
    ['光伏并网',   'p2', 7, 5, 'mid'],
    ['风机集电',   'p2', 7, 5, 'high'],
    ['储能调峰',   'p2', 7, 6, 'mid'],
    ['数据中心',   'p2', 7, 6, 'mid'],
    ['港口岸电',   'p2', 7, 6, 'high'],
    ['冷链仓储',   'p2', 7, 7, 'mid'],
    ['城南枢纽',   'p2', 7, 7, 'high'],

    /* ---- Pack 3 · 区域主网（31-45）7×7 ×8 → 8×8 ×7 ---- */
    ['双母线',     'p3', 7, 5, 'low'],   // 缓冲 · 开包
    ['检修倒闸',   'p3', 7, 6, 'mid'],
    ['雷雨天',     'p3', 7, 6, 'high'],
    ['铁路电气化', 'p3', 7, 6, 'high'],
    ['化工园区',   'p3', 7, 7, 'mid'],
    ['钢厂电弧炉', 'p3', 7, 7, 'high'],
    ['抽水蓄能',   'p3', 7, 7, 'high'],
    ['山区线路',   'p3', 7, 7, 'high'],
    ['医院双电源', 'p3', 8, 5, 'low'],   // 缓冲 · 换尺寸
    ['机场跑道灯', 'p3', 8, 6, 'mid'],
    ['跨江隧道',   'p3', 8, 6, 'mid'],
    ['城市环网',   'p3', 8, 6, 'high'],
    ['会展中心',   'p3', 8, 7, 'mid'],
    ['应急抢修',   'p3', 8, 7, 'high'],
    ['备用电源',   'p3', 8, 7, 'high'],

    /* ---- Pack 4 · 特高压枢纽（46-60）8×8 ×7 → 9×9 ×8 ---- */
    ['换流站',     'p4', 8, 5, 'low'],   // 缓冲 · 开包
    ['直流输电',   'p4', 8, 6, 'mid'],
    ['无功补偿',   'p4', 8, 6, 'high'],
    ['负荷预测',   'p4', 8, 7, 'mid'],
    ['黑启动',     'p4', 8, 7, 'high'],
    ['电网互济',   'p4', 8, 7, 'high'],
    ['迎峰度夏',   'p4', 8, 7, 'high'],
    ['特高压落点', 'p4', 9, 6, 'low'],   // 缓冲 · 换尺寸
    ['智慧微网',   'p4', 9, 6, 'mid'],
    ['全域调度',   'p4', 9, 7, 'mid'],
    ['峰谷平衡',   'p4', 9, 7, 'high'],
    ['跨省联络',   'p4', 9, 7, 'high'],
    ['极端天气',   'p4', 9, 7, 'high'],
    ['零碳城市',   'p4', 9, 7, 'high'],
    ['电亮全城',   'p4', 9, 7, 'high']
  ];

  function pad2(v) { return v < 10 ? ('0' + v) : ('' + v); }

  function buildAllLevels() {
    var out = [];
    for (var i = 0; i < LEVEL_PLAN.length; i++) {
      var row = LEVEL_PLAN[i];
      var id = 'L' + pad2(i + 1);
      out.push(generate({
        id: id,
        name: row[0],
        pack: row[1],
        size: row[2],
        pairs: row[3],
        sigma: row[4],
        // 种子写死：任何设备、任何时间生成的 L07 都是同一张图
        seed: 'powerlink|v1|' + id + '|' + row[2] + 'x' + row[3] + '|' + row[4]
      }));
    }
    return out;
  }

  var LEVELS = buildAllLevels();

  /**
   * 关卡包统计：每包关卡数、满星数。
   * 同时做一次结构自检 —— 如果有人改了 LEVEL_PLAN 却忘了对齐每包数量，
   * 这里会在控制台留下明确告警，而不是在 UI 上出现莫名其妙的空包。
   */
  var PACK_STATS = (function () {
    var m = {}, i;
    for (i = 0; i < PACKS.length; i++) m[PACKS[i].id] = { count: 0, maxStars: 0, first: -1 };
    for (i = 0; i < LEVELS.length; i++) {
      var e = m[LEVELS[i].pack];
      if (!e) continue;
      if (e.first < 0) e.first = i;
      e.count++;
      e.maxStars += 3;
    }
    for (i = 0; i < PACKS.length; i++) {
      var s = m[PACKS[i].id];
      PACKS[i].count = s.count;
      PACKS[i].maxStars = s.maxStars;
      PACKS[i].firstIndex = s.first;
      if (s.count !== CONFIG.LEVELS_PER_PACK && root.console && root.console.warn) {
        root.console.warn('[PowerLink] 关卡包 ' + PACKS[i].id + ' 有 ' + s.count +
          ' 关，与 CONFIG.LEVELS_PER_PACK=' + CONFIG.LEVELS_PER_PACK + ' 不一致');
      }
    }
    return m;
  })();

  /**
   * 关卡包是否解锁（纯函数，便于单测）。
   * @param {string} packId
   * @param {number} totalStars 该档案的累计星数
   */
  function isPackUnlocked(packId, totalStars) {
    if (CONFIG.ALL_PACKS_OPEN) return true;
    var need = CONFIG.PACK_UNLOCK[packId];
    if (typeof need !== 'number' || need <= 0) return true;
    return (totalStars | 0) >= need;
  }

  /** 距离解锁还差多少星（已解锁返回 0） */
  function packStarsNeeded(packId, totalStars) {
    if (isPackUnlocked(packId, totalStars)) return 0;
    return (CONFIG.PACK_UNLOCK[packId] | 0) - (totalStars | 0);
  }

  /* ================================================================
   * 8. 每日挑战：日期字符串 -> 确定性关卡（全员同题）
   * ================================================================ */

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  var DAILY_CACHE = {};

  function PowerLinkDaily(dateStr) {
    dateStr = String(dateStr == null ? '' : dateStr).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) dateStr = todayStr();
    if (DAILY_CACHE[dateStr]) return DAILY_CACHE[dateStr];

    var seed = 'powerlink|daily|' + dateStr;
    var rnd = mulberry32(xfnv1a(seed));

    // 6×6 ~ 8×8 轮换，偶尔上 9×9
    var sizeTable = [6, 6, 6, 7, 7, 7, 8, 8, 9];
    var size = sizeTable[randInt(rnd, sizeTable.length)];
    var lo = size <= 6 ? 4 : (size <= 7 ? 5 : 5);
    var hi = size <= 6 ? 6 : (size <= 7 ? 7 : 7);
    var k = lo + randInt(rnd, hi - lo + 1);
    var sigmaTable = ['low', 'mid', 'mid', 'high', 'high'];
    var sigma = sigmaTable[randInt(rnd, sigmaTable.length)];

    var lv = generate({
      id: 'daily:' + dateStr,
      name: '每日电网 · ' + dateStr,
      size: size,
      pairs: k,
      sigma: sigma,
      daily: true,
      date: dateStr,
      seed: seed + '|gen'
    });

    DAILY_CACHE[dateStr] = lv;
    return lv;
  }

  /**
   * 该日期是否可玩。
   * 产品规则：不允许补做往日 —— 只有"设备本地当天"这一关能进。
   * 未来日期同样拒绝（防止改系统时间刷连击）。
   * 生成函数本身保持纯函数（任意日期都能算出题目，便于自检），
   * 可玩性判定单独放在这里，由 UI/流程层调用。
   */
  PowerLinkDaily.playable = function (dateStr, todayOverride) {
    var t = todayOverride || todayStr();
    if (String(dateStr) === t) return true;
    return !!CONFIG.DAILY_ALLOW_MAKEUP;
  };

  /** 'past' | 'today' | 'future'：供 UI 决定灰显样式 */
  PowerLinkDaily.relation = function (dateStr, todayOverride) {
    var t = todayOverride || todayStr();
    if (String(dateStr) === t) return 'today';
    return String(dateStr) < t ? 'past' : 'future';
  };

  PowerLinkDaily.today = todayStr;

  /* ================================================================
   * 9. 导出
   * ================================================================ */

  root.POWERLINK_CONFIG = CONFIG;
  root.POWERLINK_PALETTE = PALETTE;
  root.POWERLINK_PACKS = PACKS;
  root.POWERLINK_LEVELS = LEVELS;
  root.POWERLINK_PACK_STATS = PACK_STATS;
  root.PowerLinkDaily = PowerLinkDaily;
  root.PowerLinkGen = {
    generate: generate,
    mulberry32: mulberry32,
    xfnv1a: xfnv1a,
    snakePath: snakePath,
    backbite: backbite,
    todayStr: todayStr,
    isPackUnlocked: isPackUnlocked,
    packStarsNeeded: packStarsNeeded,
    MAX_PAIRS: MAX_PAIRS,
    PLAN: LEVEL_PLAN,
    CONFIG: CONFIG
  };

})(typeof window !== 'undefined' ? window : this);
