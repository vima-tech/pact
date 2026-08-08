// pact-book-html.mjs — 把 pact-book 的数据模型渲染成**可正式对外交付的单文件 HTML 规格文档**
//
// 形态定位（与 src/**.md 的分工）：
//   · src/**.md      给 AI 施工：按需求/里程碑切片、聚合上下文，机器好检索。
//   · pact-book.html 给人交付：一份**网页优先的正式规格书**——hero 封面、目录、四大部分、需求索引附录，
//     内容整合传统交付物中 PRD（产品需求）/ SDD（系统设计）/ SPEC（技术规格）的职能，
//     不拆成三份文档，以 R-ID / 锚点全程交叉引用。可直接作为附件发给甲方/分包方。
//
// 网页优先（不是电子化的纸）：sticky 顶栏 + 阅读进度、侧边目录滚动定位、粘性表头、
//   R-ID 悬停预览卡（数据取自附录 DOM，零额外负载）、明暗主题、平滑滚动。
//   打印样式仅作降级保留（Ctrl+P 仍能出可读的成册文档）。
//
// 实现取舍：
//   ① 构建期渲染——markdown 在生成时就转成静态 HTML（node 里加载 vendored marked），
//      产物不含运行时渲染逻辑：禁用 JS 也完整可读，交互全部是渐进增强。
//   ② 单文件、零外部请求——file:// 双击即开，对方不需要装任何东西。
//   ③ 确定性输出——不嵌生成时间戳，同一份 PACT.md 生成的字节完全一致（--check 依赖这一点）。

import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const requireCjs = createRequire(import.meta.url)

function loadMarked() {
  const p = new URL('../vendor/marked.min.js', import.meta.url)
  if (!existsSync(p)) throw new Error('缺少 vendor/marked.min.js——渲染章节 markdown 需要它')
  const m = requireCjs('../vendor/marked.min.js')
  const marked = m.marked ?? m
  marked.setOptions({ gfm: true, breaks: false })
  return marked
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// 四大部分：P/A/C/T → 正式文档的部编排（整合 PRD / SDD / SPEC 职能，不拆分成三份文档）
const PARTS = [
  ['P', '产品需求', 'PRD', '背景与问题、用户与角色、核心场景、需求清单（R-ID 逐条可验收）、非目标、约束与成功定义。'],
  ['A', '系统设计', 'SDD', '系统边界、模块结构与职责、关键链路、设计原则，以及**含已否决方案**的决策记录（D-ID）。'],
  ['C', '数据与接口规格', 'SPEC', '数据模型、枚举与状态机、不变量、接口契约、错误码、配置、权限与观测约定——精确到实现者不需要再做设计决策。'],
  ['T', '验收与交付', 'ACCEPTANCE', '验收清单（与 R-ID 一一对应）、指标阈值、停工线、交付前置条件与里程碑范围。'],
]

/** 正文里把 R###/D### 变成文内交叉引用（跳过代码块/行内代码/既有链接） */
function crossRef(md, ridSet) {
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`|\[[^\]]*\]\([^)]*\))/g)
  return parts.map((seg, i) => {
    if (i % 2 === 1) return seg
    return seg
      .replace(/\bR(\d{3})\b/g, (m0, n) => ridSet.has('R' + n) ? `[${m0}](#req-R${n})` : m0)
      .replace(/\bD(\d{3})\b/g, m0 => `[${m0}](#ch-A5)`)
  }).join('')
}

/** marked 输出的后处理：表格包横向滚动容器 + 短单元格禁断行
 * （CJK 在窄列里会被逐字断行——"功能"竖成两行、"R001"断成两截，很难看） */
const wrapTables = html => html
  .replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, '</table></div>')
  .replace(/<td>((?:<a href="#[^"]+">)?[^<\s]{1,6}(?:<\/a>)?)<\/td>/g, '<td class="nw">$1</td>')

const CSS = `
:root{
  --bg:#faf9f7; --bg-soft:#f2f0ec; --panel:#ffffff;
  --fg:#211d17; --fg-dim:#5f584c; --fg-faint:#948b7d;
  --line:#e5e1d7; --line-soft:#edeae2;
  --accent:#9a5a1e; --accent-strong:#7c4715; --accent-fg:#fff;
  --accent-soft:#f6ecdd; --accent-line:#e3c9a6;
  --star:#a67c0e; --code-bg:#f4f2ec;
  --hero-grad:radial-gradient(60rem 28rem at 85% -10%,rgba(154,90,30,.12),transparent 60%),
              radial-gradient(40rem 22rem at 5% 0%,rgba(154,90,30,.06),transparent 55%);
  --shadow:0 1px 2px rgba(35,28,16,.05),0 16px 40px -18px rgba(35,28,16,.25);
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --sans:ui-sans-serif,-apple-system,"Segoe UI",system-ui,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
  --content-w:53rem; --side-w:16.5rem; --top-h:3.1rem;
}
:root[data-theme="dark"]{
  --bg:#141210; --bg-soft:#1c1915; --panel:#211d18;
  --fg:#ece7dc; --fg-dim:#b0a695; --fg-faint:#837a6a;
  --line:#373126; --line-soft:#2a251d;
  --accent:#dda668; --accent-strong:#e8b87e; --accent-fg:#2a1a08;
  --accent-soft:#33291a; --accent-line:#59482e;
  --star:#dcb64e; --code-bg:#262119;
  --hero-grad:radial-gradient(60rem 28rem at 85% -10%,rgba(221,166,104,.10),transparent 60%),
              radial-gradient(40rem 22rem at 5% 0%,rgba(221,166,104,.05),transparent 55%);
  --shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -18px rgba(0,0,0,.7);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--sans);
  font-size:15px;line-height:1.85;letter-spacing:.01em;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  transition:background-color .18s ease,color .18s ease}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
::selection{background:var(--accent-soft)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}

/* ── sticky 顶栏 + 阅读进度 ── */
.top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top-in{max-width:calc(var(--content-w) + var(--side-w) + 5rem);margin:0 auto;height:var(--top-h);
  display:flex;align-items:center;gap:.8rem;padding:0 1.2rem;min-width:0}
.top .tt{font-weight:700;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.top .tt a{color:var(--fg)}
.top .tt a:hover{text-decoration:none;color:var(--accent)}
.badge{font-family:var(--mono);font-size:.68rem;padding:.14rem .55rem;border-radius:999px;
  border:1px solid var(--line);color:var(--fg-dim);white-space:nowrap}
.badge.frozen{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent)}
.top .sp{flex:1}
.iconbtn{border:1px solid var(--line);background:transparent;color:var(--fg-dim);cursor:pointer;
  border-radius:8px;padding:.24rem .6rem;font-size:.76rem;font-family:var(--mono);line-height:1.3;
  transition:border-color .12s,color .12s}
.iconbtn:hover{border-color:var(--accent-line);color:var(--fg)}
#bar{position:absolute;left:0;bottom:-1px;height:2px;width:0;background:var(--accent);transition:width .1s linear}

/* ── 布局：侧栏 + 内容 ── */
.wrap{max-width:calc(var(--content-w) + var(--side-w) + 5rem);margin:0 auto;
  display:grid;grid-template-columns:var(--side-w) minmax(0,1fr);gap:2.6rem;padding:0 1.2rem}
@media(max-width:1080px){.wrap{grid-template-columns:minmax(0,1fr)}.side{display:none}}
.side{position:sticky;top:calc(var(--top-h) + 1.2rem);align-self:start;
  max-height:calc(100vh - var(--top-h) - 2.4rem);overflow-y:auto;
  font-size:.75rem;line-height:1.6;padding:.2rem .5rem 1rem 0;scrollbar-width:thin;
  scrollbar-color:var(--line) transparent}
.side .st{font-family:var(--mono);font-size:.64rem;letter-spacing:.14em;color:var(--fg-faint);margin:.8rem 0 .4rem}
.side a{display:block;color:var(--fg-dim);padding:.16rem .55rem;border-radius:7px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background-color .1s,color .1s}
.side a:hover{background:var(--line-soft);color:var(--fg);text-decoration:none}
.side a.part{font-weight:650;color:var(--fg);margin-top:.5rem}
.side a.part .pk{font-family:var(--mono);font-size:.62rem;color:var(--fg-faint);margin-left:.4em;letter-spacing:.06em}
.side a.ch{padding-left:1.3rem}
.side a.on{background:var(--accent-soft);color:var(--accent);font-weight:600;box-shadow:inset 2.5px 0 0 var(--accent)}
.content{min-width:0;padding-bottom:5rem}

/* ── hero 封面区 ── */
.hero{position:relative;padding:3.6rem 0 2.4rem;background-image:var(--hero-grad);
  border-bottom:1px solid var(--line)}
.hero .kicker{font-family:var(--mono);font-size:.74rem;letter-spacing:.32em;color:var(--accent);margin-bottom:.9rem}
.hero h1{font-size:2.3rem;line-height:1.3;margin:0 0 .7rem;letter-spacing:-.022em}
.hero .sub{color:var(--fg-dim);margin:0 0 1.8rem;max-width:38rem}
.stats{display:flex;flex-wrap:wrap;gap:.7rem;margin:0 0 1.5rem}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:.7rem 1.1rem;
  min-width:7.5rem;box-shadow:0 1px 2px rgba(35,28,16,.04)}
.stat .n{font-size:1.25rem;font-weight:700;letter-spacing:-.02em;line-height:1.3}
.stat .l{font-size:.7rem;color:var(--fg-faint);font-family:var(--mono);letter-spacing:.06em}
.meta-line{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 1.3rem}
.hero .note{font-size:.76rem;color:var(--fg-faint);line-height:1.8;border-left:2px solid var(--accent-line);
  padding-left:.9rem;max-width:36rem}

/* ── 目录 ── */
.toc-doc{padding:2.2rem 0 1.6rem;border-bottom:1px solid var(--line)}
.toc-doc h2{font-size:1.05rem;margin:0 0 .9rem;letter-spacing:.02em}
.toc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(19rem,1fr));gap:.9rem}
.toc-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:.9rem 1.05rem;
  transition:border-color .12s,box-shadow .12s}
.toc-card:hover{border-color:var(--accent-line);box-shadow:var(--shadow)}
.toc-card .tp{display:flex;align-items:baseline;gap:.6em;margin-bottom:.35rem}
.toc-card .tp a{font-weight:700;color:var(--fg);font-size:.92rem}
.toc-card .tp .pn{font-family:var(--mono);font-size:.66rem;color:var(--accent);letter-spacing:.12em}
.toc-card ol{list-style:none;margin:0;padding:0;font-size:.8rem}
.toc-card ol li{display:flex;gap:.55em;align-items:baseline;padding:.1rem 0}
.toc-card ol .cn{font-family:var(--mono);font-size:.7rem;color:var(--fg-faint);min-width:2em}
.toc-card ol a{color:var(--fg-dim)}
.toc-card ol a:hover{color:var(--accent)}

/* ── 部与章 ── */
.part{padding:3.4rem 0 .3rem}
.part .pn{font-family:var(--mono);font-size:.74rem;letter-spacing:.3em;color:var(--accent)}
.part h2{font-size:1.7rem;margin:.3rem 0 .6rem;letter-spacing:-.018em;scroll-margin-top:calc(var(--top-h) + .8rem)}
.part .pd{color:var(--fg-dim);max-width:42rem;margin:0;padding-bottom:1.1rem;border-bottom:1px solid var(--line)}
.chp{padding-top:2.4rem}
.chp>h3.ct{font-size:1.2rem;margin:0 0 .9rem;padding-bottom:.45rem;border-bottom:1px solid var(--line-soft);
  scroll-margin-top:calc(var(--top-h) + .8rem)}
.chp>h3.ct .num{font-family:var(--mono);color:var(--accent);margin-right:.7em;font-size:.92em}
.chp>h3.ct .anch{float:right;font-family:var(--mono);font-size:.67rem;color:var(--fg-faint);
  border:1px solid var(--line);border-radius:6px;padding:.12em .55em;margin-top:.35em}

/* ── 章节正文（marked 输出）── */
.bd h2,.bd h3{font-size:1rem;margin:1.7rem 0 .55rem;font-weight:650;scroll-margin-top:calc(var(--top-h) + .8rem)}
.bd h4{font-size:.9rem;margin:1.25rem 0 .4rem;color:var(--fg-dim);font-weight:650}
.bd p{margin:.75rem 0}
.bd ul,.bd ol{padding-left:1.5rem;margin:.6rem 0}
.bd li{margin:.28rem 0}
.bd li::marker{color:var(--fg-faint)}
.bd strong{font-weight:650}
.bd code{font-family:var(--mono);font-size:.85em;background:var(--code-bg);padding:.12em .38em;
  border-radius:5px;border:1px solid var(--line-soft)}
.bd pre{background:var(--code-bg);border:1px solid var(--line);border-radius:10px;padding:.9rem 1.1rem;
  overflow-x:auto;font-size:.8rem;line-height:1.65}
.bd pre code{background:none;border:0;padding:0;font-size:1em}
.bd blockquote{margin:1rem 0;padding:.7rem 1rem;background:var(--bg-soft);
  border-left:3px solid var(--accent-line);border-radius:0 8px 8px 0;color:var(--fg-dim)}
.bd blockquote p{margin:.3rem 0}
.bd blockquote strong{color:var(--fg)}
.bd hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.bd img{max-width:100%}

/* 表格：网页优势——粘性表头 + 悬停行 + 横向滚动 */
.tw{overflow-x:auto;overflow-y:auto;max-height:82vh;margin:1rem 0;border:1px solid var(--line);
  border-radius:10px;background:var(--panel);box-shadow:0 1px 2px rgba(35,28,16,.04)}
table{border-collapse:collapse;width:100%;font-size:.83rem;line-height:1.6}
th,td{padding:.5rem .8rem;text-align:left;vertical-align:top;border-bottom:1px solid var(--line-soft);
  overflow-wrap:anywhere}
thead th{position:sticky;top:0;z-index:1;background:var(--bg-soft);font-weight:650;font-size:.75rem;
  color:var(--fg-dim);letter-spacing:.05em;white-space:nowrap;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:0}
tbody tr{transition:background-color .1s}
tbody tr:hover{background:var(--bg-soft)}
td.nw{white-space:nowrap}
td code{white-space:nowrap}

/* ── 附录 ── */
.apx{padding:3.2rem 0 1rem}
.apx h2{font-size:1.4rem;margin:0 0 .5rem;scroll-margin-top:calc(var(--top-h) + .8rem)}
.apx .pd{color:var(--fg-dim);margin:0 0 1rem;font-size:.86rem}
.apx tr:target td{background:var(--accent-soft)}
.apx tr{scroll-margin-top:calc(var(--top-h) + .8rem)}
.star{color:var(--star)}
.rid{font-family:var(--mono);white-space:nowrap}

/* 图（agent 绘制的 SVG 图源，随明暗主题着色） */
.fig{margin:1.2rem 0;padding:1rem 1rem .6rem;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;box-shadow:0 1px 2px rgba(35,28,16,.04);overflow-x:auto}
.fig svg{display:block;max-width:100%;height:auto;margin:0 auto;font-family:var(--sans)}
.fig figcaption{display:flex;align-items:baseline;gap:.9rem;margin-top:.55rem;
  font-size:.72rem;color:var(--fg-faint)}
.fig .fl{font-family:var(--mono);letter-spacing:.05em;white-space:nowrap}
.fig details{display:inline}
.fig summary{cursor:pointer;color:var(--fg-faint)}
.fig summary:hover{color:var(--accent)}
.fig details[open]{display:block;flex-basis:100%}
.fig details pre{background:var(--code-bg);border:1px solid var(--line-soft);border-radius:8px;
  padding:.7rem .9rem;font-size:.74rem;line-height:1.6;overflow-x:auto;color:var(--fg-dim);
  font-family:var(--mono)}

/* R-ID 悬停预览卡（数据取自附录 DOM） */
#card{position:fixed;z-index:60;max-width:26rem;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;box-shadow:var(--shadow);padding:.75rem 1rem;font-size:.8rem;line-height:1.65;
  display:none;pointer-events:none}
#card .ct{font-family:var(--mono);font-weight:650;color:var(--accent);margin-bottom:.2rem}
#card .cm{color:var(--fg-faint);font-size:.72rem;font-family:var(--mono);margin-top:.35rem}

#toTop{position:fixed;right:1.2rem;bottom:1.2rem;z-index:40;display:none;
  border:1px solid var(--line);background:var(--panel);color:var(--fg-dim);cursor:pointer;
  border-radius:999px;width:2.4rem;height:2.4rem;font-size:1rem;box-shadow:var(--shadow)}
#toTop:hover{color:var(--accent);border-color:var(--accent-line)}

.foot{padding:2.2rem 0 0;margin-top:2.6rem;border-top:1px solid var(--line);
  font-size:.74rem;color:var(--fg-faint);line-height:1.8}

/* ── 打印降级（不是设计目标，但 Ctrl+P 仍可用）── */
@media print{
  body{background:#fff;font-size:10.5pt}
  .top,.side,#toTop,#card{display:none!important}
  .wrap{display:block;max-width:none;padding:0}
  .hero{background:none;padding-top:2rem}
  .part{page-break-before:always}
  .tw{max-height:none;overflow:visible;border-radius:0}
  .tw,.bd pre,.bd blockquote,.chp>h3.ct,.fig{break-inside:avoid}
  thead th{position:static}
  a{color:inherit}
  .apx{page-break-before:always}
}
@page{size:A4;margin:16mm 14mm}
`

// 渐进增强：主题切换 / 阅读进度 / 侧栏滚动定位 / R-ID 悬停卡 / 回到顶部。删掉本段即纯静态文档。
const APP = String.raw`
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)]
/* 主题 */
const setTheme=t=>{document.documentElement.dataset.theme=t
  try{localStorage.setItem('pact-doc-theme',t)}catch(e){}
  const b=$('#theme'); if(b)b.textContent=t==='dark'?'☾':'☀'}
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')
try{setTheme(localStorage.getItem('pact-doc-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))}
catch(e){setTheme('light')}
/* 阅读进度 */
const bar=$('#bar')
addEventListener('scroll',()=>{const h=document.documentElement
  bar.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+'%'
  $('#toTop').style.display=h.scrollTop>800?'block':'none'},{passive:true})
$('#toTop').onclick=()=>scrollTo({top:0,behavior:'smooth'})
/* 侧栏滚动定位 */
const links=$$('.side a[href^="#"]'), map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]))
const obs=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue
  links.forEach(a=>a.classList.remove('on'));const a=map.get(e.target.id);if(a){a.classList.add('on')
  const r=a.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)a.scrollIntoView({block:'nearest'})}}},
  {rootMargin:'-10% 0px -80% 0px'})
map.forEach((_,id)=>{const t=document.getElementById(id);if(t)obs.observe(t)})
/* R-ID 悬停预览卡：数据直接读附录表行，零额外负载 */
const card=$('#card')
document.addEventListener('mouseover',e=>{
  const a=e.target.closest('a[href^="#req-R"]'); if(!a){card.style.display='none';return}
  const tr=document.getElementById(a.getAttribute('href').slice(1)); if(!tr)return
  const td=tr.children
  card.innerHTML='<div class="ct">'+td[0].textContent.trim()+'</div><div>'+td[1].textContent.trim()+'</div>'+
    '<div class="cm">'+[td[2],td[3],td[4]].map(c=>c.textContent.trim()).filter(x=>x&&x!=='—').join(' · ')+'</div>'
  card.style.display='block'
  const b=a.getBoundingClientRect(),h=card.offsetHeight
  card.style.left=Math.min(b.left,innerWidth-card.offsetWidth-12)+'px'
  card.style.top=(b.bottom+h+12>innerHeight?b.top-h-8:b.bottom+8)+'px'
})
document.addEventListener('mouseout',e=>{if(e.target.closest('a[href^="#req-R"]'))card.style.display='none'})
`

export function renderHTML({ title, headerMeta, chapters, reqs, milestones, counts, file, figs }) {
  figs = figs || new Map()
  const marked = loadMarked()
  const ridSet = new Set(reqs.map(r => r.id))
  const byPart = p => chapters.filter(c => c.part === p)
  const status = (headerMeta.find(m => /状态/.test(m.k)) || {}).v || ''
  const frozen = /已冻结/.test(status)

  // ── hero 封面区 ──
  const stats = [
    [reqs.length, '需求 R-ID'],
    [counts.decisions, '决策（含已否决）'],
    [counts.invs, '不变量'],
    [milestones.length, '里程碑'],
  ]
  const metaBadges = headerMeta
    .filter(m => !/状态/.test(m.k))
    .map(m => `<span class="badge">${esc(m.k)} · ${esc(m.v)}</span>`).join('')
  const hero = `<header class="hero" id="cover">
  <div class="kicker">产品需求与系统设计规格书</div>
  <h1>${esc(title)}</h1>
  <p class="sub">本文档整合传统交付物中 PRD（产品需求）、SDD（系统设计）与 SPEC（技术规格）的全部内容，
  以统一编号交叉引用，作为本项目唯一的对外规格交付物。</p>
  <div class="stats">${stats.map(([n, l]) => `<div class="stat"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>
  <div class="meta-line">${status ? `<span class="badge frozen">${esc(status)}</span>` : ''}${metaBadges}</div>
  <p class="note">本文档由规格真源 <code>${esc(file)}</code> 自动生成，与真源逐字对应；
  请勿直接修改本文件——修改真源后重新生成即可。规格冻结后的任何变更均记录于变更记录（changelog）。</p>
</header>`

  // ── 目录（部卡片网格） ──
  const tocCards = PARTS.map(([p, name, en], pi) => {
    const rows = byPart(p).map((c, ci) =>
      `<li><span class="cn">${pi + 1}.${ci + 1}</span><a href="#ch-${c.id}">${esc(c.title)}</a></li>`).join('')
    return `<div class="toc-card"><div class="tp"><span class="pn">${en}</span><a href="#part-${p}">第${'一二三四'[pi]}部分 · ${name}</a></div><ol>${rows}</ol></div>`
  }).join('')
  const toc = `<nav class="toc-doc" id="toc"><h2>目录</h2><div class="toc-grid">${tocCards}
  <div class="toc-card"><div class="tp"><span class="pn">APPENDIX</span><a href="#appendix">附录 · 需求索引（R-ID）</a></div></div></div></nav>`

  // ── 四大部分正文 ──
  const body = PARTS.map(([p, name, en, desc], pi) => {
    const secs = byPart(p).map((c, ci) => {
      let md = c.body.replace(/^##\s+.*(\r?\n)+/, '')          // 去掉与本节标题重复的首行 H2
      let html = wrapTables(marked.parse(crossRef(md, ridSet)))
      // 图占位符 → 内嵌 SVG（agent 绘制的 figures/<id>.svg，src-hash 已在构建侧核对）
      html = html.replace(/<p>@@FIG:([\w.-]+)@@<\/p>/g, (m0, id) => {
        const f = figs.get(id); if (!f) return m0
        const svg = f.svg.replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<script[\s\S]*?<\/script>/gi, '')
        return `<figure class="fig" id="fig-${esc(id)}">${svg}
<figcaption><span class="fl">图 ${esc(id)}</span><details><summary>查看文本源（与真源逐字一致）</summary><pre>${esc(f.src)}</pre></details></figcaption></figure>`
      })
      return `<section class="chp" id="ch-${c.id}">
<h3 class="ct"><span class="num">${pi + 1}.${ci + 1}</span>${esc(c.title)}<span class="anch">${c.id}</span></h3>
<div class="bd">${html}</div></section>`
    }).join('\n')
    return `<section class="part" id="part-${p}">
<div class="pn">第${'一二三四'[pi]}部分 · ${en}</div><h2>${name}</h2><p class="pd">${desc}</p></section>\n${secs}`
  }).join('\n')

  // ── 附录：R-ID 需求索引 ──
  const apxRows = reqs.map(r =>
    `<tr id="req-${r.id}"><td class="rid">${r.id}${r.star ? ' <span class="star">★</span>' : ''}</td>` +
    `<td>${esc(r.desc)}</td><td>${esc(r.type || '—')}</td><td>${esc(r.prio || '—')}</td>` +
    `<td class="rid">${esc(r.milestone || '未排')}</td></tr>`).join('')
  const appendix = `<section class="apx" id="appendix"><h2>附录 · 需求索引（R-ID）</h2>
<p class="pd">全部需求条目一览。每条的验收方式见 <a href="#ch-T1">4.1 验收清单</a>；★ 为强制项。正文中的 R-ID 引用悬停可预览、点击跳回本表。</p>
<div class="tw"><table><thead><tr><th>R-ID</th><th>需求</th><th>类型</th><th>优先级</th><th>里程碑</th></tr></thead>
<tbody>${apxRows}</tbody></table></div></section>`

  // ── 侧边目录 ──
  const side = `<nav class="side" aria-label="目录"><div class="st">目录</div>
<a href="#cover">封面</a>${PARTS.map(([p, name, en], pi) =>
    `<a class="part" href="#part-${p}">第${'一二三四'[pi]}部分 · ${name}<span class="pk">${en}</span></a>` +
    byPart(p).map((c, ci) => `<a class="ch" href="#ch-${c.id}">${pi + 1}.${ci + 1} ${esc(c.title)}</a>`).join('')
  ).join('')}<a class="part" href="#appendix">附录 · 需求索引</a></nav>`

  const foot = `<footer class="foot">本规格书为单文件自包含产物：无外部依赖、无网络请求，可直接作为附件分发；需要纸质版直接打印（Ctrl+P）。<br>
  真源：<code>${esc(file)}</code>（含 30 个机器可校验锚点）· 需求 ${reqs.length} · 决策 ${counts.decisions} · 不变量 ${counts.invs} · 里程碑 ${milestones.length}</footer>`

  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 规格书</title>
<style>${CSS}</style>
</head>
<body>
<div class="top"><div class="top-in">
  <div class="tt"><a href="#cover">${esc(title)}</a></div>
  ${frozen ? `<span class="badge frozen">${esc(status)}</span>` : ''}
  <span class="sp"></span>
  <button class="iconbtn" id="theme" title="明暗主题">☀</button>
</div><div id="bar"></div></div>
<div class="wrap">
${side}
<main class="content">
${hero}
${toc}
${body}
${appendix}
${foot}
</main>
</div>
<div id="card"></div>
<button id="toTop" title="回到顶部">↑</button>
<script>${APP}</script>
</body>
</html>`
}
