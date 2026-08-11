# 题库数据 Schema 规范（game2 / PowerLink2）

> ⚠️ 本文题库全部为「**示例占位题**，由用户替换为真实低压配电网题库」。schema 字段为工程实现唯一依据。

## 0. 顶层结构

```js
// questions.js —— 经典脚本，先于 game.js 加载，无 ES module
window.POWERLINK2_BANK = {
  chapters: [
    {
      id: 'c1',                       // 字符串，全局唯一且稳定
      title: '安全用具与操作规程',
      icon: '🧤',                     // emoji 或图标 token
      desc: '低压作业基本安全用具与停电检修规程',
      levels: [
        {
          id: 'c1-l1',                // 字符串，全局唯一，作为存档 progress key
          title: '验电与接地',
          questions: [ /* 见下方 6 种题型 */ ]
        }
      ]
    }
  ]
};
```

加载顺序：先 `questions.js`（定义 `window.POWERLINK2_BANK`），再 `game.js` 读取。无 ES module、无打包。

## 1. 题型字段定义

### 1.1 single 单选
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | `'single'` | 是 | 固定字符串 |
| q | string | 是 | 题干 |
| options | string[] | 是 | 选项，顺序即显示顺序 |
| answer | number | 是 | 正确选项下标（0 起） |
| explain | string | 是 | 知识点卡片讲解 |
| knowledge | string | 是 | 知识点标题/标签 |

```js
// 示例占位
{ type:'single', q:'低压验电笔使用前应在( )上验证好坏。',
  options:['已知带电设备','任意金属','地面','人体'], answer:0,
  explain:'验电笔使用前应在已知带电设备上验电，确认验电笔完好后再用于待测设备。',
  knowledge:'低压验电笔使用规范' }
```

### 1.2 multi 多选
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | `'multi'` | 是 | |
| q | string | 是 | |
| options | string[] | 是 | |
| answer | number[] | 是 | 正确选项下标数组（可多个；判分按**集合相等**，顺序无关） |
| explain | string | 是 | |
| knowledge | string | 是 | |

```js
// 示例占位
{ type:'multi', q:'下列属于低压基本绝缘安全用具的有( )。',
  options:['绝缘手套','绝缘靴','低压验电器','携带型接地线','低压试电笔'],
  answer:[0,2,3,4],
  explain:'基本绝缘安全用具能直接承受工作电压；绝缘靴属辅助安全用具。',
  knowledge:'低压安全用具分类' }
```

### 1.3 bool 判断
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | `'bool'` | 是 | |
| q | string | 是 | 通常陈述句，判断正误 |
| answer | boolean | 是 | true=正确，false=错误 |
| explain | string | 是 | |
| knowledge | string | 是 | |

```js
// 示例占位
{ type:'bool', q:'低压设备停电检修时，必须先验电、后挂接地线。', answer:true,
  explain:'停电→验电→挂接地线是基本安全顺序，防止误送电与感应电触电。',
  knowledge:'停电检修安全顺序' }
```

### 1.4 fill 填空
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | `'fill'` | 是 | |
| q | string | 是 | 题干中用 `__`（双下划线）表示空位 |
| answer | (string \| string[])[] | 是 | 每空一个元素；元素可为字符串，或「可接受的多个答案」数组；顺序与 `__` 出现顺序一一对应 |
| explain | string | 是 | |
| knowledge | string | 是 | |

```js
// 示例占位（单答案）
{ type:'fill',
  q:'我国低压配电网三相四线制系统线电压为 __ V，相电压为 __ V。',
  answer:['380','220'],
  explain:'线电压 380V、相电压 220V，由 380/√3≈220 得到。',
  knowledge:'低压配电系统电压' }
// 多答案示例：answer:[['380','380v','380V'], '220']
```

### 1.5 order 排序
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | `'order'` | 是 | |
| q | string | 是 | |
| items | string[] | 是 | 步骤/条目列表（规范顺序，下标即基准） |
| answer | number[] | 是 | 正确顺序的下标排列，为 `0..n-1` 的一个排列 |
| explain | string | 是 | |
| knowledge | string | 是 | |

```js
// 示例占位
{ type:'order', q:'请按正确顺序排列停电检修操作。',
  items:['断开电源','验电','挂接地线','悬挂标示牌','装设遮栏'],
  answer:[0,1,2,3,4],
  explain:'先断开电源，验明无电后挂接地线，再设标示牌与遮栏。',
  knowledge:'停电检修操作步骤' }
```

### 1.6 match 连线/配对
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | `'match'` | 是 | |
| q | string | 是 | |
| pairs | {left:string, right:string}[] | 是 | 左侧项与右侧释义一一配对；数组下标即配对关系 |
| explain | string | 是 | |
| knowledge | string | 是 | |

```js
// 示例占位
{ type:'match', q:'将左侧低压设备与右侧功能连线。',
  pairs:[
    {left:'漏电保护器', right:'检测剩余电流并迅速切断故障回路'},
    {left:'隔离开关', right:'形成明显断开点，隔离电源'},
    {left:'熔断器', right:'过电流时熔断以切断电路'}
  ],
  explain:'三者分别承担漏电保护、电源隔离与短路/过流保护功能。',
  knowledge:'低压开关设备功能' }
```

## 2. 示例占位题库（14 题，覆盖 6 题型 × 各知识点，待用户替换为真实题库）

> ⚠️ 以下全部为示例占位，知识点仅作格式示范，须由用户以真实低压配电网内容替换。

```js
// ===== 示例占位题库 START（待用户替换为真实题库） =====
// —— single 单选 ——
{ type:'single', q:'低压验电笔使用前应在( )上验证好坏。', // 示例占位
  options:['已知带电设备','任意金属','地面','人体'], answer:0,
  explain:'验电笔使用前应在已知带电设备上验电，确认验电笔完好后再用于待测设备。',
  knowledge:'低压验电笔使用规范' },

{ type:'single', q:'10kV 配电变压器（油浸式）常见的接线组别是( )。', // 示例占位
  options:['Yyn0','Dyn11','Yd11','Yy0'], answer:1,
  explain:'Dyn11 高压侧三角形接线可抑制三次谐波、零序阻抗小、单相接地故障容忍度高，是配电变压器常用组别。',
  knowledge:'配电变压器连接组别' },

{ type:'single', q:'低压三相四线制中，中性线（N 线）的主要作用是( )。', // 示例占位
  options:['传输有功功率','为单相负荷提供回路并稳定中性点','防雷','接地故障保护'], answer:1,
  explain:'N 线为单相负荷提供返回路径，使各相电压平衡稳定；它不等于保护接地线。',
  knowledge:'三相四线制与中性线' },

// —— bool 判断 ——
{ type:'bool', q:'低压设备停电检修时，必须先验电、后挂接地线。', answer:true, // 示例占位
  explain:'停电→验电→挂接地线是基本安全顺序，防止误送电与感应电触电。',
  knowledge:'停电检修安全顺序' },

{ type:'bool', q:'漏电保护器跳闸动作后，在未查明原因并排除故障前，不得强行合闸送电。', answer:true, // 示例占位
  explain:'强行送电可能使故障持续，引发触电或火灾；须先排查剩余电流故障点。',
  knowledge:'剩余电流保护使用' },

{ type:'bool', q:'低压带电作业必须设专人监护，且作业人员应穿戴合格的绝缘防护用具。', answer:true, // 示例占位
  explain:'带电作业风险高，监护与绝缘用具是基本安全保障。',
  knowledge:'带电作业安全规程' },

// —— multi 多选 ——
{ type:'multi', q:'下列属于低压基本绝缘安全用具的有( )。', // 示例占位
  options:['绝缘手套','绝缘靴','低压验电器','携带型接地线','低压试电笔'],
  answer:[0,2,3,4],
  explain:'基本绝缘安全用具能直接承受工作电压；绝缘靴属辅助安全用具。',
  knowledge:'低压安全用具分类' },

{ type:'multi', q:'下列哪些情况可能导致剩余电流动作保护器（RCD）动作？( )', // 示例占位
  options:['设备绝缘破损漏电','相线碰壳','中性线重复接地不当','负荷正常运行','线路过负荷'],
  answer:[0,1,2],
  explain:'RCD 检测剩余电流，设备漏电、相线碰壳、N 线异常均可产生剩余电流；正常负荷与单纯过负荷不直接触发 RCD。',
  knowledge:'剩余电流动作原理' },

{ type:'multi', q:'下列属于低压开关电器的有( )。', // 示例占位
  options:['低压断路器','隔离开关','熔断器','电流互感器','漏电保护器'],
  answer:[0,1,2,4],
  explain:'断路器、隔离开关、熔断器、RCD 均属开关/保护电器；电流互感器是测量设备。',
  knowledge:'低压开关设备分类' },

// —— fill 填空 ——
{ type:'fill', // 示例占位
  q:'我国低压配电网三相四线制系统线电压为 __ V，相电压为 __ V。',
  answer:['380','220'],
  explain:'线电压 380V、相电压 220V，由 380/√3≈220 得到。',
  knowledge:'低压配电系统电压' },

{ type:'fill', // 示例占位
  q:'我国特低电压(ELV)系统中，干燥环境安全电压上限为 __ V，潮湿环境常用 __ V。',
  answer:['50','12'],
  explain:'安全电压限值依环境而定，干燥环境工频上限 50V，潮湿/狭窄环境常用 12V 以防触电。',
  knowledge:'安全电压等级' },

// —— order 排序 ——
{ type:'order', q:'请按正确顺序排列停电检修操作。', // 示例占位
  items:['断开电源','验电','挂接地线','悬挂标示牌','装设遮栏'],
  answer:[0,1,2,3,4],
  explain:'先断开电源，验明无电后挂接地线，再设标示牌与遮栏。',
  knowledge:'停电检修操作步骤' },

{ type:'order', q:'请排列装设接地线的正确步骤。', // 示例占位
  items:['检查接地线外观与编号完好','验电确认无电压','先接接地端','后接导体端'],
  answer:[0,1,2,3],
  explain:'先检查工器具，验明无电后，接地线应先接接地端、后接被停电设备导体端，拆除时顺序相反。',
  knowledge:'接地线装设顺序' },

// —— match 连线 ——
{ type:'match', q:'将低压导线颜色与含义连线。', // 示例占位
  pairs:[
    {left:'A 相', right:'黄色'},
    {left:'B 相', right:'绿色'},
    {left:'C 相', right:'红色'},
    {left:'N 线（中性线）', right:'淡蓝色'},
    {left:'PE 线（保护接地）', right:'黄绿双色'}
  ],
  explain:'按 GB 标准，相序 A黄/B绿/C红，N 淡蓝，PE 黄绿双色，便于识别与防误接。',
  knowledge:'导线颜色标识' }
// ===== 示例占位题库 END =====
```

## 3. 章节/关卡解锁规则建议
- 关卡内顺序解锁：第 N 关需第 N-1 关 `completed = true`（≥1★）。
- 章节解锁：累计星数门槛（见 concept.md 表），或「前一章平均星 ≥ 2」。
- 每日挑战：常驻解锁，不计入章节门槛。
- 建议题库在 `questions.js` 中提供可选 `unlockStars` 字段覆盖默认值（未在 schema 强制，engine 按需读取）。

## 4. 工程易错点（务必对齐）
1. **answer 类型随 type 变化**：single=number，multi/order=number[]，bool=boolean，fill=(string|string[])[]。必须按 `type` 分支解析，不能统一当数组。
2. **fill 的 `__` 数量必须等于 `answer.length`**，且顺序对应；渲染前校验，否则空位错位。
3. **multi 判分是集合相等**（顺序无关），不是数组相等；answer 是否排序无所谓。
4. **order.answer 必须是 `0..n-1` 的排列**；渲染时打乱 `items` 显示，但答案始终按 `items` 下标比对。
5. **match 配对关系由 `pairs` 数组下标决定**；游戏打乱右列顺序，玩家连线后按下标还原比对。
6. **options 顺序即下标**：内容作者改 options 顺序必须同步改 answer 下标，否则错判（建议提供题库校验脚本）。
7. **explain / knowledge 必填**：知识点卡片依赖二者，缺失应给兜底文案。
8. **id 稳定唯一**：chapter/level id 变动会丢失对应 progress；命名用 `c1` / `c1-l1` 风格。
9. **fill 答案比较**：统一 trim + 忽略大小写/单位，数字建议转字符串后比；多答案取任一匹配即算对。
10. **题库体积**：纯静态无打包，questions.js 体积影响首屏；MVP 每关 6–12 题，后续按需扩展。
11. **无 ES module**：`window.POWERLINK2_BANK` 挂全局，game.js 直接读取，勿用 import/export。
12. **校验脚本建议**：上线前用 node 校验（类型、answer 范围、__ 计数、id 唯一），避免低级错配。
