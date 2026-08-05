#!/usr/bin/env node
/* =========================================================================
 * 南方电网电力资讯日报 —— 每日自动生成脚本（无人值守版）
 * 用法:  node build-report.mjs
 * 产物:  同目录 daily-report.json  （页面 fetch 它，地址固定不变）
 *
 * 行为:
 *   1. 通过 allorigins 代理抓取南方电网官网新闻列表页
 *   2. 提取标题 + 原文链接，按 8 大领域过滤（仅保留命中的条目）
 *   3. 按五版块启发式分类，生成与页面一致的 JSON 结构
 *   4. 抓取失败 / 无命中时：若已存在 daily-report.json 则保留旧文件，
 *      保证页面永远有数据可展示（绝不写空）
 *
 * 说明: 此脚本为「自动抓取近似值」，摘要取标题截取、质量一般。
 *       若需要高质量人工级日报，请用 WorkBuddy 每日自动化
 *       （由助手亲自联网检索 8 领域并写 daily-report.json）。
 * ========================================================================= */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'daily-report.json');

// 仅保留这 8 大领域
const DOMAINS = ['电能质量','电力电子','智能电网','低压智能台区','配电网','服务类','物资工具类','应急工具类'];

// 五版块 + 启发式关键词
const SECTION_RULES = [
  { id:'model',    name:'模型发布/更新',  kw:['大模型','模型发布','算法模型','人工智能模型','垂类模型','AI模型'] },
  { id:'product',  name:'产品发布/更新',  kw:['产品发布','新品','装置','终端','平台上线','系统上线','应用发布','装备发布','上线'] },
  { id:'industry', name:'行业动态',       kw:['会议','论坛','签约','投运','开工','建成','专项行动','中标','招标','合作','白皮书','开工'] },
  { id:'paper',    name:'论文研究',       kw:['论文','研究','发表','期刊','学报','成果'] },
  { id:'tips',     name:'技巧与观点',      kw:['观点','评论','解读','建议','经验','方法'] },
];

// 领域推断：先精确匹配 8 领域词，再按相关词兜底
function domainOf(text){
  for (const d of DOMAINS) if (text.includes(d)) return d;
  const map = {
    '谐波':'电能质量','无功':'电能质量','三相不平衡':'电能质量','电压质量':'电能质量',
    '变流器':'电力电子','逆变器':'电力电子','换流':'电力电子','电力电子化':'电力电子',
    '台区':'低压智能台区','融合终端':'低压智能台区','透明化':'低压智能台区','低压':'低压智能台区',
    '配网':'配电网','线路':'配电网','供电所':'配电网','馈线':'配电网','配电':'配电网',
    '带电':'应急工具类','应急':'应急工具类','抢修':'应急工具类',
    '无人机':'物资工具类','机器人':'物资工具类','具身':'物资工具类','装备':'物资工具类',
    '服务':'服务类','营业厅':'服务类','客服':'服务类'
  };
  for (const k in map) if (text.includes(k)) return map[k];
  return null;
}

function sectionOf(text){
  for (const r of SECTION_RULES) if (r.kw.some(k=>text.includes(k))) return r;
  return SECTION_RULES[2]; // 默认「行业动态」
}

const PROXY = 'https://api.allorigins.win/raw?url=';
const TARGETS = [
  'https://www.csg.cn/xwzx/',
  'https://www.csg.cn/xwzx/yw/',
  'https://www.csg.cn/xwzx/kj/',
];

async function fetchHtml(url){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 12000);
  try {
    const r = await fetch(PROXY + encodeURIComponent(url), { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : '';
  } catch(e){ clearTimeout(t); return ''; }
}

function parse(html, base){
  const items = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{6,80})<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1], title = m[2].trim();
    if (!/[电|网|能|力|工|设|备|区|网]/.test(title)) continue;
    const full = href.startsWith('http') ? href : (base + href.replace(/^\./, ''));
    items.push({ title, url: full });
  }
  return items;
}

function todayBeijing(){
  const d = new Date(Date.now() + 8*3600*1000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth()+1}月${d.getUTCDate()}日`;
}

(async () => {
  let collected = [];
  for (const u of TARGETS) collected = collected.concat(parse(await fetchHtml(u), 'https://www.csg.cn'));

  const seen = new Set();
  collected = collected.filter(it => { if (seen.has(it.url)) return false; seen.add(it.url); return true; });

  const sections = {};
  SECTION_RULES.forEach(r => sections[r.id] = { id:r.id, name:r.name, items:[] });

  let n = 0;
  for (const it of collected) {
    const dom = domainOf(it.title);
    if (!dom) continue;                       // 仅保留 8 大领域
    const sec = sectionOf(it.title);
    const summary = [...it.title].length > 60 ? [...it.title].slice(0,57).join('') + '…' : it.title;
    sections[sec.id].items.push({
      title: it.title, source: '南方电网官网', url: it.url,
      date: todayBeijing(), summary, domain: dom, sectionId: sec.id
    });
    n++;
  }

  const report = { date: todayBeijing(), source: '南方电网官网（每日自动抓取）', sections: SECTION_RULES.map(r => sections[r.id]) };

  if (n === 0) {
    if (fs.existsSync(OUT)) { console.log('抓取无有效条目，保留现有 daily-report.json（不覆盖）'); return; }
    console.log('抓取失败且无现有文件，写出空骨架');
  }
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`已生成 daily-report.json：共 ${n} 条，日期 ${report.date}`);
})();
