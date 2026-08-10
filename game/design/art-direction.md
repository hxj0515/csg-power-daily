# 《电亮全城 / PowerLink》视觉圣经（Art Direction）

> 版本 v1.0 ｜ 状态：待审批 ｜ 配套：`concept.md`、`ux-save-spec.md`
> 关键词：**深夜调度中心 · 冷蓝控制台 · 电光青流动 · 克制的琥珀告警**
> 约束：零外部资源。图标全部内联 SVG，字体用系统字体栈，音效用 WebAudio 合成，**不引入任何 CDN / 图片文件 / 字体文件**。

---

## 0. 视觉一句话

> 你坐在一间关了灯的电网调度中心，面前是一块发着冷蓝微光的控制盘。你拖动的每一条线，都会在盘上亮起一道电流。

- **不要**：卡通糖果风、圆滚滚拟物、渐变彩虹、大面积白底。
- **要**：暗色控制台、细描边、低饱和背景 + 高饱和线缆、微弱辉光（glow）、几何精确感。
- 与仓库根目录的「南方电网日报仪表盘」（`#0b1020` 深蓝底 + 卡片 + 青色强调）保持**同一家族的视觉语言**，让玩家从日报点进游戏没有割裂感。

---

## 1. 调色板

### 1.1 基础色（CSS 变量，写在 `:root`）

```css
:root{
  /* —— 底层 —— */
  --bg:          #0b1020;   /* 页面背景 · 深蓝控制室 */
  --bg-soft:     #0e1428;   /* 次级背景 / 顶栏底栏 */
  --panel:       #121a30;   /* 面板 / 卡片 */
  --panel-hi:    #182340;   /* 面板 hover / 选中态 */
  --grid:        #1e2a44;   /* 电网线 / 分隔线 / 描边 */
  --grid-soft:   #16203a;   /* 棋盘格底（比 --grid 更暗，避免抢线） */

  /* —— 文字 —— */
  --text:        #e6f0ff;   /* 主文字 */
  --text-muted:  #9db0d4;   /* 次要文字（对 --bg 对比度 ≈ 8.5:1 ✓） */
  --text-dim:    #6b7fa5;   /* 禁用/占位（仅用于非关键信息） */

  /* —— 强调 —— */
  --accent:      #38e1ff;   /* 电光青 · 主强调 / 主按钮 / 焦点环 */
  --accent-dim:  #1b8fae;   /* 电光青暗态 */
  --amber:       #ffb02e;   /* 琥珀 · 星星 / 提示 / 警示 */
  --danger:      #ff5a6e;   /* 删除等破坏性操作 */
  --success:     #46e08a;   /* 通电成功 */

  /* —— 效果 —— */
  --glow-accent: 0 0 12px rgba(56,225,255,.55);
  --glow-amber:  0 0 12px rgba(255,176,46,.5);
  --shadow-1:    0 4px 14px rgba(0,0,0,.35);
  --shadow-2:    0 12px 34px rgba(0,0,0,.45);
  --overlay:     rgba(6,10,20,.72);   /* 弹窗遮罩 */
}
```

**背景氛围层**（可选但强烈建议，一行 CSS 即可，零成本提质）：
```css
body{
  background:
    radial-gradient(1100px 560px at 78% -12%, rgba(56,225,255,.10), transparent 60%),
    radial-gradient(820px 460px at -8% 8%,  rgba(91,140,255,.10), transparent 55%),
    var(--bg);
}
```

### 1.2 档案头像色板（6 色，与线缆色刻意区分开）

`#38e1ff` 电光青 ｜ `#ffb02e` 琥珀 ｜ `#ff4d9d` 品红 ｜ `#46e08a` 翠绿 ｜ `#9b6bff` 靛紫 ｜ `#4a8cff` 天蓝

---

## 2. 线缆颜色 × 形状系统（色盲适配核心）

**规则：每一对线缆 = 一个颜色 + 一个唯一形状。形状默认渲染在两个端点内部，不是可选装饰。**
关卡按 `K` 对端点数，**从索引 0 依次取用**下表（顺序已按两两感知距离贪心排序，保证少色关卡的颜色差异最大化）。单关颜色数上限 **7**（第 8 色留给完整版扩展）。

| 索引 | 名称 | HEX | 形状 | 形状 ID | 备注 |
|---|---|---|---|---|---|
| 0 | 电光青 | `#38e1ff` | ● 圆 | `circle` | 主色，永远第一个出现 |
| 1 | 琥珀 | `#ffb02e` | ■ 方 | `square` | 与索引 0 明度/色相双重拉开 |
| 2 | 品红 | `#ff4d9d` | ▲ 三角 | `triangle` | |
| 3 | 翠绿 | `#46e08a` | ◆ 菱形 | `diamond` | |
| 4 | 靛紫 | `#9b6bff` | ⬢ 六边 | `hexagon` | |
| 5 | 橙红 | `#ff6b4a` | ★ 星 | `star` | |
| 6 | 柠黄 | `#f5f04a` | ◎ 环 | `ring` | 与索引 1 琥珀色近 → 形状（方 vs 环）强区分 |
| 7 | 天蓝 | `#4a8cff` | ✚ 十字 | `cross` | 与索引 0 青色近 → 形状（圆 vs 十字）强区分 |

**关键配对校验（已做过红绿色盲模拟核对）**
- 0 电光青 / 7 天蓝：色相接近 → `圆` vs `十字`，形状差异极大 ✓
- 1 琥珀 / 6 柠黄：色相接近 → `方` vs `环`，形状差异极大 ✓
- 3 翠绿 / 0 电光青：deuteranopia 下可能靠近 → `菱形` vs `圆` ✓，且明度差 > 15 ✓
- 2 品红 / 5 橙红：protanopia 下可能靠近 → `三角` vs `星` ✓

> **工程实现要求**：颜色与形状必须**成对定义在同一个常量数组**里，禁止两处分别维护。
> ```js
> const CABLES = [
>   { id:0, name:'电光青', hex:'#38e1ff', shape:'circle'   },
>   { id:1, name:'琥珀',   hex:'#ffb02e', shape:'square'   },
>   { id:2, name:'品红',   hex:'#ff4d9d', shape:'triangle' },
>   { id:3, name:'翠绿',   hex:'#46e08a', shape:'diamond'  },
>   { id:4, name:'靛紫',   hex:'#9b6bff', shape:'hexagon'  },
>   { id:5, name:'橙红',   hex:'#ff6b4a', shape:'star'     },
>   { id:6, name:'柠黄',   hex:'#f5f04a', shape:'ring'     },
>   { id:7, name:'天蓝',   hex:'#4a8cff', shape:'cross'    },
> ];
> ```

**形状绘制规范**
- 端点：外层实心圆（半径 `cell*0.34`，填充线缆色 + 该色 40% 外发光），内层形状用 **`--bg` 深色**绘制（挖空感），形状外接圆半径 `cell*0.19`。
- 已连通线路：路径**中点**额外绘制一次同形状小标记（半径 `cell*0.13`，线缆色 70% 透明度描边）；路径长度 >8 格时每隔 4 格重复。
- 形状统一用 Canvas `Path2D` 绘制，集中在 `drawShape(ctx, shape, cx, cy, r)` 一个函数，便于统一调整。

---

## 3. 字体与字号规范

### 3.1 字体栈（与根目录日报保持一致）

```css
--font-ui: "PingFang SC","Microsoft YaHei","Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
--font-num: "SF Mono","JetBrains Mono","Cascadia Mono",Consolas,"Courier New",monospace;
```
- 数字（步数、覆盖率、星数、计时）统一用 `--font-num` + `font-variant-numeric: tabular-nums`，避免跳动。

### 3.2 字阶

| Token | 字号/行高 | 字重 | 用途 |
|---|---|---|---|
| `display` | 34 / 1.2 | 800 | 主菜单游戏标题 |
| `h1` | 24 / 1.3 | 700 | 屏幕标题、结算「送电成功」 |
| `h2` | 18 / 1.4 | 600 | 卡片标题、包名 |
| `body` | 15 / 1.6 | 400 | 正文、说明 |
| `label` | 14 / 1.4 | 600 | 按钮文字、Tab |
| `caption` | 13 / 1.4 | 400 | 辅助说明（`--text-muted`） |
| `micro` | 12 / 1.3 | 500 | 角标、日期（**不承载关键信息**） |

- 移动端 `display` 降为 `clamp(26px, 7vw, 34px)`，其余不变。
- 中文标题字间距 `letter-spacing: .5px`；纯英文/数字标签 `letter-spacing: 1px; text-transform: uppercase`（仅用于 `POWERLINK` LOGO 副标）。
- **正文最小 14px**，禁止出现 <12px 的文字。

---

## 4. 尺度与形状系统

```css
/* 间距（4 的倍数） */
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-7:48px;
/* 圆角 */
--r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:20px; --r-pill:999px;
/* 描边 */
--bd:1px solid var(--grid);
--bd-hi:1px solid rgba(56,225,255,.45);
/* 过渡 */
--t-fast:120ms cubic-bezier(.4,0,.2,1);
--t-base:180ms cubic-bezier(.4,0,.2,1);
```
- 内容最大宽度 `560px`（游戏是竖向布局，不需要宽屏铺满），水平居中。
- 棋盘边长 `min(92vw, 62vh, 520px)`。

---

## 5. 组件风格

### 5.1 按钮

| 类型 | 样式 |
|---|---|
| **Primary** | 背景 `linear-gradient(180deg,#4be8ff,#22c7e8)`，文字 `#04121b`（**深色文字**，保证对比度 ≥ 8:1），圆角 `--r-md`，高度 48px，`box-shadow: var(--glow-accent)`；hover 上移 1px + 辉光增强；active 下沉 1px |
| **Secondary** | 透明底 + `--bd`，文字 `--text`；hover 边框转 `--bd-hi`、底色 `--panel-hi` |
| **Ghost / Icon** | 无边框，40×40（**触控目标补足到 44×44** via padding），hover 底色 `--panel-hi`，图标 `--text-muted` → hover `--accent` |
| **Danger** | 边框与文字 `--danger`，hover 底色 `rgba(255,90,110,.12)` |
| **Disabled** | `opacity:.42; cursor:not-allowed;` 且**同时**移除辉光（不能只靠透明度） |

所有按钮：`:focus-visible { outline:2px solid var(--accent); outline-offset:2px; box-shadow:0 0 0 4px rgba(56,225,255,.18); }`

### 5.2 卡片 / 面板

- 底 `--panel`，`--bd`，圆角 `--r-lg`，`box-shadow: var(--shadow-1)`。
- 可点击卡片 hover：`transform: translateY(-2px)`、边框 `--bd-hi`、`box-shadow: var(--shadow-2)`。
- **关卡格子**：56×56，圆角 `--r-md`。
  - 未通关：底 `--bg-soft`，编号 `--text-muted`
  - 已通关：底 `--panel`，边框 `--bd-hi`，编号 `--text`，下方 3 颗 8px 小星（得到的填 `--amber` + 微辉光，未得到的填 `--grid`）
  - 满铺 3★：格子额外加 `--glow-accent` 内发光
  - 数据异常：斜线纹理 + `--text-dim`

### 5.3 弹窗 / 浮层

- 遮罩 `--overlay` + `backdrop-filter: blur(6px)`（不支持时降级为纯色遮罩）。
- 面板宽 `min(92vw, 420px)`，底 `--panel`，圆角 `--r-xl`，`--shadow-2`，顶部 3px 高的 `--accent` 渐变条作为"通电指示灯"。
- 进入动画：`opacity 0→1` + `translateY(12px)→0`，`--t-base`；`reduce-motion` 下直接显示。
- 打开时焦点移入弹窗首个可聚焦元素，`Esc` 关闭，焦点陷阱（Tab 循环不逃出弹窗）。

### 5.4 棋盘与连线高亮（Canvas 绘制规范）

| 元素 | 规范 |
|---|---|
| 棋盘底 | 圆角矩形 `--panel`，`--bd` 描边，内边距 `cell*0.12` |
| 网格线 | 1px（DPR 缩放后取整），`--grid`，透明度 0.9 |
| 格子底 | `--grid-soft`，圆角 `cell*0.14`，格间距 `cell*0.06` |
| 线缆 | `lineWidth = cell*0.36`，`lineCap:'round'`，`lineJoin:'round'`，颜色=线缆色 |
| 线缆内高光 | 在线缆之上再画一层 `lineWidth = cell*0.12`、`rgba(255,255,255,.28)` 的同路径，制造圆管质感 |
| 未连通线缆 | 透明度 0.78，无辉光 |
| **已连通线缆** | 透明度 1.0，`ctx.shadowColor = 线缆色; ctx.shadowBlur = cell*0.35`（**辉光只在已连通时出现**，这是最重要的正反馈信号） |
| 正在拖拽的线缆 | 线宽 `cell*0.40`（略粗），辉光 `cell*0.25`，其余颜色透明度降到 0.5（聚焦当前操作） |
| 线尾 | 半径 `cell*0.20` 的实心圆帽 |
| 端点 | 见 §2 形状规范；未连通端点为空心感（外环 3px + 内部形状），已连通端点为实心 + 脉冲辉光 |
| 键盘光标 | 2px `--accent` 虚线方框 + 外发光，跟随方向键移动 |
| 通电流光动画 | 沿路径的一段 `rgba(255,255,255,.9)` 高光从起点扫到终点，180ms，一次性；`reduce-motion` 下省略 |

**性能与清晰度**
- Canvas 尺寸 = `CSS 尺寸 × devicePixelRatio`，`ctx.scale(dpr, dpr)`；`resize`/旋屏时重建。
- 分两层：静态层（棋盘底、网格、端点）离屏缓存，只在关卡切换/resize 时重绘；动态层（线缆、线尾、光效）每帧重绘。
- 拖拽期间用 `requestAnimationFrame` 合批，**不要在 `pointermove` 里直接绘制**。
- 辉光（`shadowBlur`）开销大：单帧启用辉光的路径数 >7 时，降级为只对**刚完成**的那条画辉光。

### 5.5 星星与进度

- 星星：五角星 SVG，得到态 `--amber` + `--glow-amber`，未得到态 `--grid` 描边空心。
- 结算页星星**逐颗点亮**，间隔 220ms，每颗伴随缩放 `0.6→1.15→1`；`reduce-motion` 下同时直出。
- 进度条：高 6px，圆角 pill，底 `--grid`，填充 `linear-gradient(90deg,var(--accent-dim),var(--accent))`，右端有 8px 辉光点。

### 5.6 提示条 / Toast

- 存储不可用提示条：固定顶部，底 `rgba(255,176,46,.14)`，左侧 3px `--amber` 竖条，文字 `--text`，含「导出存档」按钮，可关闭。
- Toast：底部居中，`--panel` + `--bd-hi`，2.4s 自动消失，同时最多 1 条。

### 5.7 结算页「城市点亮」

- 结算面板下方一条 **纯 CSS/Canvas 绘制的城市天际线剪影**（若干高低不等的矩形，`--grid` 色）。
- 按星级点亮窗户：1★ 亮 30% 窗户，2★ 亮 65%，3★ 全亮 + 天空泛起 `--accent` 微光。
- 窗户 = 3×4px 小方块，`--amber`，随机延迟 0–600ms 逐个亮起；`reduce-motion` 下全部瞬时亮起。
- **零图片**：天际线用 `for` 循环生成矩形数组，随日期种子固定形状。

---

## 6. 图标规范

- 全部**内联 SVG**，`viewBox="0 0 24 24"`，`fill="none"`，`stroke="currentColor"`，`stroke-width="1.8"`，`stroke-linecap="round"`，`stroke-linejoin="round"`。
- 通过 CSS `color` 控制颜色，不在 SVG 里硬编码颜色。
- 统一放在一个 `ICONS` 常量对象里（key → path 字符串），用 `<svg>` 模板函数渲染。**禁止 `innerHTML` 拼接任何用户输入**（图标是内部常量，可用模板）。

### 6.1 图标清单

| Key | 名称 | 描述（给实现者的形状说明） |
|---|---|---|
| `plant` | **发电站** | 两个梯形冷却塔并排，塔顶各飘一小段波浪线（蒸汽），底部一条地面横线 |
| `bulb` | **电灯（用电点）** | 灯泡外轮廓（圆 + 下方颈部），灯泡内一条 W 形灯丝，底部 2 条灯座横线 |
| `battery` | **电池** | 横置圆角矩形 + 右侧小凸极，内部 3 格电量条 |
| `tower` | **输电铁塔** | 上窄下宽的塔身梯形 + 中部一根横担 + 两侧各一个小绝缘子点 |
| `bolt` | **闪电** | 标准折线闪电（用于「通电/连胜」标识） |
| `plug` | **插头** | 插头本体圆角方 + 两根插脚 + 一段电线弧 |
| `star` | 星星 | 五角星（结算/关卡星级） |
| `undo` | 撤销 | 逆时针箭头 |
| `reset` | 重置 | 顺时针环形箭头 |
| `hint` | 提示 | 灯泡 + 外侧 3 道短射线（与 `bulb` 区分） |
| `back` | 返回 | 左向 chevron |
| `settings` | 设置 | 齿轮（8 齿简化）或滑块三横线（**优先滑块**，绘制更稳） |
| `profile` | 档案 | 人形头肩轮廓 |
| `calendar` | 每日挑战 | 日历方框 + 顶部两个挂环 + 内部一个圆点 |
| `download` | 导出 | 下箭头 + 底部托盘 |
| `upload` | 导入 | 上箭头 + 底部托盘 |
| `close` | 关闭 | X |
| `lock` | 未解锁 | 挂锁 |
| `check` | 完成 | 对勾 |

- 档案头像图标使用：`plant` / `bulb` / `battery` / `tower` / `plug` / `bolt`（6 个，与 `ux-save-spec.md` 的 `icon` 字段枚举一致）。
- 图标默认 20×20（`--text-muted`），按钮内 18×18，档案头像内 22×22（头像底为档案色 18% 透明圆底 + 档案色图标）。

### 6.2 LOGO

- 文字 LOGO：`电亮全城` 用 `display` 字阶，`background: linear-gradient(90deg,#ffffff,var(--accent))` + `background-clip:text` 做渐变文字（与根目录日报 Hero 标题同款手法，保持家族感）。
- 副标：`POWERLINK` `micro` 字阶，`--accent`，`letter-spacing:4px`，大写。
- 标题左侧放一个 24px 的 `bolt` 图标，`--amber` 色 + 辉光。

---

## 7. 动效清单与时长

| 动效 | 时长 | 缓动 | reduce-motion 下 |
|---|---|---|---|
| 按钮 hover/active | 120ms | `cubic-bezier(.4,0,.2,1)` | 保留（无位移，仅颜色）|
| 屏幕切换（淡入 + 上移 8px） | 180ms | 同上 | 直出 |
| 弹窗进入 | 180ms | 同上 | 直出 |
| 线缆通电流光 | 180ms | linear | 省略 |
| 端点连通脉冲 | 260ms | ease-out | 省略 |
| 被截断线段淡出 | 120ms | linear | 直接消失 |
| 结算星星逐颗点亮 | 3×220ms | back-out | 同时直出 |
| 城市窗户点亮 | 0–600ms 随机延迟 | ease-out | 全部瞬时 |
| 非法操作抖动 | 80ms | — | 省略（改为线尾闪一下颜色） |

- 所有动效频率 **< 3Hz**，无全屏高对比闪烁。
- 统一读取：`const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || settings.reduceMotion;`

---

## 8. 音效规范（WebAudio 合成，零文件）

| 事件 | 合成方案 |
|---|---|
| 点击 UI | `sine` 880Hz，60ms，指数衰减，音量 0.05 |
| 一对连通「合闸」 | 三音上行 `triangle` 660→880→1174Hz，各 55ms，音量 0.08 |
| 抢占截断 | `sine` 300Hz，40ms，音量 0.03 |
| 全部连通「送电成功」 | 五音上行 `triangle` 523→659→784→1047→1319Hz，各 90ms，末音带 300ms 混响式衰减，音量 0.09 |
| 星星点亮 | `sine` 1319Hz + 1976Hz 叠加，120ms |

- `AudioContext` 必须在**首次用户手势**后创建/`resume()`（浏览器自动播放策略）。
- 全局音量上限 0.1，`settings.sound === false` 时完全不创建声音节点。
- 不做背景音乐（办公室场景，BGM 是负资产）。

---

## 9. 响应式断点

| 断点 | 布局 |
|---|---|
| `< 420px` | 单列，棋盘 92vw，底栏 4 个图标按钮平铺，关卡网格 5 列 |
| `420–768px` | 同上，间距放大，`display` 字阶恢复 34px |
| `> 768px` | 内容容器固定 560px 居中，棋盘 `min(520px, 62vh)`，两侧留白显示背景光晕；关卡网格 5 列（不加列，保持一致的肌肉记忆） |
| 横屏手机（`height < 500px`） | 棋盘按 `62vh` 收缩，顶栏底栏压缩到 44px，隐藏非必要文字只留图标 |

---

## 10. 交付检查清单（美术侧验收）

- [ ] `:root` 变量齐全，页面中**无任何硬编码色值**（Canvas 里的颜色也从常量读取）
- [ ] 8 组线缆色与形状成对定义在 `CABLES` 单一数组
- [ ] 端点形状默认渲染，关闭「形状标记」后才消失
- [ ] 已连通 / 未连通线缆在**灰度截图**下仍可区分（辉光 + 透明度差）
- [ ] 全部图标为内联 SVG，`stroke="currentColor"`，无外链
- [ ] 无任何 `<img src>` 指向外部、无 `@font-face`、无 `fetch`
- [ ] `prefers-reduced-motion` 下全部动效退化，游戏逻辑不受影响
- [ ] 200% 缩放与 320px 窄屏下不出现横向滚动条
- [ ] 主文字对比度 ≥ 4.5:1，Primary 按钮文字对比度 ≥ 8:1
- [ ] Canvas 在 DPR=2/3 的设备上线条无模糊

---

## 11. 给工程组的注意事项

1. §1.1 的 `:root` 变量块可**整块复制**到实现里，色值均为最终值。
2. 颜色/形状/图标三张表都要落成**单一数据源常量**，UI 与 Canvas 共用，禁止两处维护。
3. `backdrop-filter` 在部分旧浏览器/Firefox 配置下不可用，必须有纯色遮罩降级。
4. `background-clip:text` 需要 `-webkit-background-clip:text` 前缀；降级方案为纯 `--text` 色标题。
5. Canvas 辉光 `shadowBlur` 在低端手机上是主要性能瓶颈，请按 §5.4 的降级策略实现，目标 **中端手机稳定 60fps**。
6. 所有 CSS 建议内联在 `game/index.html` 的 `<style>` 或同目录 `game/style.css`；**不要**使用以 `_` 开头的文件名（GitHub Pages 的 Jekyll 会忽略）。
