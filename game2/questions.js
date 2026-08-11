/* =====================================================================
 * 《电亮学堂》PowerLink2 —— 题库数据（questions.js）
 * ---------------------------------------------------------------------
 * ⚠️⚠️⚠️ 本文件全部为「示例占位题」，由用户替换为真实低压配电网题库 ⚠️⚠️⚠️
 *
 * 加载顺序：本文件必须在 game.js 之前以经典 <script> 引入（无 ES module、
 * 无 import/export、无打包）。本文件仅负责把 window.POWERLINK2_BANK 挂到
 * 全局，game.js 直接读取它。
 *
 * 题库 schema 唯一依据见 design/question-spec.md；题型字段：
 *   single : { type, q, options:string[], answer:number, explain, knowledge }
 *   multi  : { type, q, options:string[], answer:number[], explain, knowledge }
 *   bool   : { type, q, answer:boolean, explain, knowledge }
 *   fill   : { type, q(含 __ 占位), answer:(string|string[])[], explain, knowledge }
 *   order  : { type, q, items:string[], answer:number[], explain, knowledge }
 *   match  : { type, q, pairs:{left,right}[], explain, knowledge }
 *
 * 替换真实题库时：保留本结构，把题目换成真实内容即可；answer 类型必须随
 * type 变化（single=number / multi|order=number[] / bool=boolean /
 * fill=(string|string[])[]）。fill 的 __ 数量须等于 answer.length。
 * ===================================================================== */

window.POWERLINK2_BANK = {
  // 章节解锁门槛在 game.js 中集中配置（CHAPTER_UNLOCK_STARS）。
  // 每章可选 unlockStars 覆盖默认值（engine 按需读取），此处留空用全局默认。
  chapters: [

    /* ===================== Ch1 安全用具与操作规程 ===================== */
    {
      id: 'c1',
      title: '安全用具与操作规程',
      icon: '🧤',
      desc: '低压作业基本安全用具、停电检修规程与接地操作',
      levels: [

        /* ---------- c1-l1 验电与接地 ---------- */
        {
          id: 'c1-l1',
          title: '验电与接地',
          questions: [
            // —— single 单选 ——（示例占位）
            { type: 'single',
              q: '低压验电笔使用前应在( )上验证好坏。',
              options: ['已知带电设备', '任意金属', '地面', '人体'],
              answer: 0,
              explain: '验电笔使用前应在已知带电设备上验电，确认验电笔完好后再用于待测设备。',
              knowledge: '低压验电笔使用规范' },

            // —— bool 判断 ——（示例占位）
            { type: 'bool',
              q: '低压设备停电检修时，必须先验电、后挂接地线。',
              answer: true,
              explain: '停电→验电→挂接地线是基本安全顺序，防止误送电与感应电触电。',
              knowledge: '停电检修安全顺序' },

            // —— fill 填空（单答案形态：answer 元素为字符串） ——（示例占位）
            { type: 'fill',
              q: '我国低压配电网三相四线制系统线电压为 __ V，相电压为 __ V。',
              answer: ['380', '220'],
              explain: '线电压 380V、相电压 220V，由 380/√3≈220 得到。',
              knowledge: '低压配电系统电压' },

            // —— order 排序 ——（示例占位）
            { type: 'order',
              q: '请按正确顺序排列停电检修操作。',
              items: ['断开电源', '验电', '挂接地线', '悬挂标示牌', '装设遮栏'],
              answer: [0, 1, 2, 3, 4],
              explain: '先断开电源，验明无电后挂接地线，再设标示牌与遮栏。',
              knowledge: '停电检修操作步骤' }
          ]
        },

        /* ---------- c1-l2 安全用具与监护 ---------- */
        {
          id: 'c1-l2',
          title: '安全用具与监护',
          questions: [
            // —— multi 多选（集合相等判定，顺序无关） ——（示例占位）
            { type: 'multi',
              q: '下列属于低压基本绝缘安全用具的有( )。',
              options: ['绝缘手套', '绝缘靴', '低压验电器', '携带型接地线', '低压试电笔'],
              answer: [0, 2, 3, 4],
              explain: '基本绝缘安全用具能直接承受工作电压；绝缘靴属辅助安全用具。',
              knowledge: '低压安全用具分类' },

            // —— bool 判断 ——（示例占位）
            { type: 'bool',
              q: '低压带电作业必须设专人监护，且作业人员应穿戴合格的绝缘防护用具。',
              answer: true,
              explain: '带电作业风险高，监护与绝缘用具是基本安全保障。',
              knowledge: '带电作业安全规程' },

            // —— match 连线（按下标配对） ——（示例占位）
            { type: 'match',
              q: '将低压导线颜色与含义连线。',
              pairs: [
                { left: 'A 相', right: '黄色' },
                { left: 'B 相', right: '绿色' },
                { left: 'C 相', right: '红色' },
                { left: 'N 线（中性线）', right: '淡蓝色' },
                { left: 'PE 线（保护接地）', right: '黄绿双色' }
              ],
              explain: '按 GB 标准，相序 A黄/B绿/C红，N 淡蓝，PE 黄绿双色，便于识别与防误接。',
              knowledge: '导线颜色标识' },

            // —— fill 填空（多答案形态：answer 元素为可接受答案数组，
            //     任一匹配即算对，引擎统一 trim + 忽略大小写/单位） ——（示例占位）
            { type: 'fill',
              q: '我国特低电压(ELV)系统中，干燥环境安全电压上限为 __ V，潮湿环境常用 __ V。',
              answer: [['50', '50v', '50V'], ['12', '12v']],
              explain: '安全电压限值依环境而定，干燥环境工频上限 50V，潮湿/狭窄环境常用 12V 以防触电。',
              knowledge: '安全电压等级' }
          ]
        }
      ]
    },

    /* ===================== Ch2 变压器与开关设备 ===================== */
    {
      id: 'c2',
      title: '变压器与开关设备',
      icon: '🛢️',
      desc: '配电变压器连接组别、中性线与开关保护电器',
      levels: [

        /* ---------- c2-l1 配电变压器与系统 ---------- */
        {
          id: 'c2-l1',
          title: '配电变压器与系统',
          questions: [
            // —— single 单选 ——（示例占位）
            { type: 'single',
              q: '10kV 配电变压器（油浸式）常见的接线组别是( )。',
              options: ['Yyn0', 'Dyn11', 'Yd11', 'Yy0'],
              answer: 1,
              explain: 'Dyn11 高压侧三角形接线可抑制三次谐波、零序阻抗小、单相接地故障容忍度高，是配电变压器常用组别。',
              knowledge: '配电变压器连接组别' },

            // —— single 单选 ——（示例占位）
            { type: 'single',
              q: '低压三相四线制中，中性线（N 线）的主要作用是( )。',
              options: ['传输有功功率', '为单相负荷提供回路并稳定中性点', '防雷', '接地故障保护'],
              answer: 1,
              explain: 'N 线为单相负荷提供返回路径，使各相电压平衡稳定；它不等于保护接地线。',
              knowledge: '三相四线制与中性线' },

            // —— order 排序 ——（示例占位）
            { type: 'order',
              q: '请排列装设接地线的正确步骤。',
              items: ['检查接地线外观与编号完好', '验电确认无电压', '先接接地端', '后接导体端'],
              answer: [0, 1, 2, 3],
              explain: '先检查工器具，验明无电后，接地线应先接接地端、后接被停电设备导体端，拆除时顺序相反。',
              knowledge: '接地线装设顺序' }
          ]
        },

        /* ---------- c2-l2 开关与保护 ---------- */
        {
          id: 'c2-l2',
          title: '开关与保护',
          questions: [
            // —— bool 判断 ——（示例占位）
            { type: 'bool',
              q: '漏电保护器跳闸动作后，在未查明原因并排除故障前，不得强行合闸送电。',
              answer: true,
              explain: '强行送电可能使故障持续，引发触电或火灾；须先排查剩余电流故障点。',
              knowledge: '剩余电流保护使用' },

            // —— multi 多选 ——（示例占位）
            { type: 'multi',
              q: '下列哪些情况可能导致剩余电流动作保护器（RCD）动作？( )',
              options: ['设备绝缘破损漏电', '相线碰壳', '中性线重复接地不当', '负荷正常运行', '线路过负荷'],
              answer: [0, 1, 2],
              explain: 'RCD 检测剩余电流，设备漏电、相线碰壳、N 线异常均可产生剩余电流；正常负荷与单纯过负荷不直接触发 RCD。',
              knowledge: '剩余电流动作原理' },

            // —— multi 多选 ——（示例占位）
            { type: 'multi',
              q: '下列属于低压开关电器的有( )。',
              options: ['低压断路器', '隔离开关', '熔断器', '电流互感器', '漏电保护器'],
              answer: [0, 1, 2, 4],
              explain: '断路器、隔离开关、熔断器、RCD 均属开关/保护电器；电流互感器是测量设备。',
              knowledge: '低压开关设备分类' }
          ]
        }
      ]
    }

    /* ===== 示例占位题库 END（待用户替换为真实低压配电网题库） ===== */
    // 说明：以上 14 道占位题覆盖 6 种题型，分布于 2 章节 4 关。
    // 全部标「示例占位」，知识点仅作格式示范，须替换为真实内容。
  ]
};
