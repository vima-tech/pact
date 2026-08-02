// pact-book-html.mjs — 把 pact-book 的数据模型渲染成**单文件 HTML 知识库**
//
// 为什么自研而不用 mdbook：
//   ① 依赖——mdbook 要装 Rust 二进制，还要再装 mdbook-mermaid，跨机器跨项目都是摩擦；
//      本文件只依赖 node（生成器本来就要），产物零外部请求，file:// 双击即开。
//   ② 分发——规格是要发给甲方/分包方的东西，对方不会为了看设计去装工具链。一个 .html 附件解决。
//   ③ 交互——我们手里有 mdbook 没有的结构化数据（R-ID 依赖图、决策、里程碑、来源），
//      能做字段感知搜索、悬停预览、影响面高亮、里程碑过滤。这些靠换皮做不到。
//   ④ 样式——完全掌控，不受 Handlebars 模板与既有 DOM 结构限制。
//
// 依赖图不用 mermaid（3MB 运行时）：图数据本来就在手上，直接出可点击的 SVG，0 字节额外开销。
// 唯一 vendored 的是 marked（40KB）——章节页搬运的是 PACT.md 正文，作者可写任意 markdown，
// 这块手搓解析器必踩坑。

import { readFileSync, existsSync } from 'node:fs'

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** 供 <script> 内嵌的安全 JSON（防 </script> 与 HTML 注释序列提前闭合） */
const safeJSON = o => JSON.stringify(o)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const THEME = `
:root{
  --bg:#fbfaf8; --bg-soft:#f4f2ee; --panel:#fff; --line:#e6e2db; --line-soft:#efece6;
  --fg:#22201d; --fg-dim:#6b665e; --fg-faint:#959087;
  --accent:#9a5b28; --accent-soft:#f2e5d8; --accent-line:#e0c3a4;
  --star:#b8860b; --star-soft:#fdf4dc;
  --ok:#2f7a4f; --warn:#b4501a; --danger:#a52d2d;
  --code-bg:#f4f2ee;
  --shadow:0 1px 2px rgba(30,25,18,.05),0 8px 24px -12px rgba(30,25,18,.18);
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
  --nav-w:19rem; --toc-w:15rem; --read:74rem;
}
:root[data-theme="dark"]{
  --bg:#15140f; --bg-soft:#1c1a15; --panel:#1a1813; --line:#312d25; --line-soft:#26231c;
  --fg:#e8e3d8; --fg-dim:#a49d90; --fg-faint:#7d766a;
  --accent:#d9a066; --accent-soft:#2e2519; --accent-line:#4a3a26;
  --star:#e0b84a; --star-soft:#2c2413;
  --ok:#6cc08a; --warn:#e0904f; --danger:#e07a7a;
  --code-bg:#211e18;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--sans);
  font-size:15px;line-height:1.75;letter-spacing:.006em}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:2px}

/* ── 布局：三栏 ───────────────────────────────────────────── */
.shell{display:grid;grid-template-columns:var(--nav-w) minmax(0,1fr);min-height:100vh}
@media(max-width:1000px){.shell{grid-template-columns:1fr}}

/* ── 左：导航 ─────────────────────────────────────────────── */
.nav{position:sticky;top:0;height:100vh;overflow:hidden;display:flex;flex-direction:column;
  background:var(--bg-soft);border-right:1px solid var(--line)}
.nav-head{padding:1rem 1rem .75rem;border-bottom:1px solid var(--line)}
.brand{font-weight:650;font-size:.95rem;line-height:1.35;margin:0 0 .1rem;letter-spacing:-.01em}
.brand a{color:var(--fg)}
.brand-sub{font-size:.72rem;color:var(--fg-faint);font-family:var(--mono)}
.search-wrap{position:relative;margin-top:.7rem}
#q{width:100%;padding:.42rem .6rem .42rem 1.85rem;border:1px solid var(--line);border-radius:7px;
  background:var(--panel);color:var(--fg);font-family:inherit;font-size:.82rem;outline:none}
#q:focus{border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
.search-wrap::before{content:"";position:absolute;left:.6rem;top:50%;width:.72rem;height:.72rem;
  margin-top:-.36rem;border:1.6px solid var(--fg-faint);border-radius:50%;pointer-events:none}
.search-wrap::after{content:"";position:absolute;left:1.18rem;top:50%;width:.3rem;height:1.6px;
  margin-top:.22rem;background:var(--fg-faint);transform:rotate(45deg);pointer-events:none}
.hint{font-size:.68rem;color:var(--fg-faint);margin-top:.35rem;font-family:var(--mono)}
.filters{display:flex;gap:.28rem;flex-wrap:wrap;margin-top:.5rem}
.chip{font-size:.68rem;padding:.12rem .42rem;border:1px solid var(--line);border-radius:20px;
  background:var(--panel);color:var(--fg-dim);cursor:pointer;user-select:none;font-family:var(--mono)}
.chip:hover{border-color:var(--accent-line);color:var(--fg)}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.nav-body{overflow-y:auto;flex:1;padding:.5rem .4rem 2rem;scrollbar-width:thin}
.grp{margin:.15rem 0}
.grp>summary{cursor:pointer;list-style:none;padding:.3rem .55rem;border-radius:6px;
  font-size:.74rem;font-weight:650;color:var(--fg-dim);letter-spacing:.04em;
  display:flex;align-items:center;gap:.35rem}
.grp>summary::-webkit-details-marker{display:none}
.grp>summary:hover{background:var(--line-soft);color:var(--fg)}
.grp>summary::before{content:"▸";font-size:.6rem;color:var(--fg-faint);transition:transform .12s}
.grp[open]>summary::before{transform:rotate(90deg)}
.grp .cnt{margin-left:auto;font-family:var(--mono);font-size:.66rem;color:var(--fg-faint);font-weight:400}
.nav a.item{display:block;padding:.24rem .55rem .24rem 1.5rem;border-radius:6px;color:var(--fg-dim);
  font-size:.79rem;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav a.item:hover{background:var(--line-soft);color:var(--fg);text-decoration:none}
.nav a.item.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.nav a.item .rid{font-family:var(--mono);font-size:.72rem;opacity:.85;margin-right:.3rem}
.nav a.item.hide{display:none}
.star{color:var(--star)}
.nav-foot{padding:.5rem .8rem;border-top:1px solid var(--line);display:flex;gap:.5rem;align-items:center;
  font-size:.7rem;color:var(--fg-faint);font-family:var(--mono)}
.iconbtn{border:1px solid var(--line);background:var(--panel);color:var(--fg-dim);cursor:pointer;
  border-radius:6px;padding:.2rem .45rem;font-size:.7rem;font-family:var(--mono)}
.iconbtn:hover{border-color:var(--accent-line);color:var(--fg)}

/* ── 右：正文 + 当页目录 ──────────────────────────────────── */
.main{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) var(--toc-w);gap:2.5rem;
  padding:2.2rem 2.4rem 6rem;max-width:calc(var(--read) + var(--toc-w) + 2.5rem);margin:0 auto;width:100%}
@media(max-width:1240px){.main{grid-template-columns:minmax(0,1fr);--toc-w:0}.toc{display:none}}
@media(max-width:640px){.main{padding:1.2rem 1rem 4rem}}
.toc{position:sticky;top:2.2rem;align-self:start;max-height:calc(100vh - 4rem);overflow-y:auto;
  font-size:.76rem;border-left:1px solid var(--line);padding-left:.9rem}
.toc-t{font-size:.68rem;color:var(--fg-faint);letter-spacing:.08em;margin-bottom:.4rem;font-family:var(--mono)}
.toc a{display:block;color:var(--fg-dim);padding:.16rem 0;line-height:1.45}
.toc a:hover{color:var(--fg);text-decoration:none}
.toc a.h3{padding-left:.75rem;font-size:.73rem}
.toc a.on{color:var(--accent);font-weight:600}

/* ── 排版 ─────────────────────────────────────────────────── */
.doc{min-width:0}
.doc h1{font-size:1.72rem;line-height:1.3;margin:0 0 .3rem;letter-spacing:-.022em;font-weight:680}
.doc h2{font-size:1.16rem;margin:2.4rem 0 .7rem;padding-bottom:.32rem;border-bottom:1px solid var(--line);
  letter-spacing:-.012em;font-weight:660;scroll-margin-top:1.5rem}
.doc h3{font-size:.98rem;margin:1.7rem 0 .5rem;font-weight:650;scroll-margin-top:1.5rem}
.doc h4{font-size:.9rem;margin:1.2rem 0 .4rem;color:var(--fg-dim);font-weight:650}
.doc p{margin:.75rem 0}
.doc ul,.doc ol{padding-left:1.35rem;margin:.6rem 0}
.doc li{margin:.28rem 0}
.doc li>ul,.doc li>ol{margin:.2rem 0}
.doc code{font-family:var(--mono);font-size:.855em;background:var(--code-bg);padding:.1em .34em;
  border-radius:4px;border:1px solid var(--line-soft)}
.doc pre{background:var(--code-bg);border:1px solid var(--line);border-radius:9px;padding:.85rem 1rem;
  overflow-x:auto;font-size:.8rem;line-height:1.6}
.doc pre code{background:none;border:0;padding:0;font-size:1em}
.doc blockquote{margin:1rem 0;padding:.7rem 1rem;background:var(--bg-soft);
  border-left:3px solid var(--accent-line);border-radius:0 8px 8px 0;color:var(--fg-dim)}
.doc blockquote p{margin:.35rem 0}
.doc blockquote strong{color:var(--fg)}
.doc hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.doc img{max-width:100%}

/* 表格：信息密度优先 + 横向滚动 + 固定表头 */
.tw{overflow-x:auto;margin:1rem 0;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
.doc table{border-collapse:collapse;width:100%;font-size:.83rem;line-height:1.55}
.doc td{overflow-wrap:anywhere}
/* 窄列里的短词（如「功能」「P0」）不该被压成竖排，由 enhance() 精准打标 */
.doc .nw{white-space:nowrap}
.doc th,.doc td{padding:.44rem .7rem;text-align:left;vertical-align:top;border-bottom:1px solid var(--line-soft)}
.doc thead th{position:sticky;top:0;background:var(--bg-soft);font-weight:650;font-size:.78rem;
  white-space:nowrap;border-bottom:1px solid var(--line);z-index:1}
.doc tbody tr:last-child td{border-bottom:0}
.doc tbody tr:hover{background:var(--bg-soft)}
.doc td code{white-space:nowrap}

/* ── 组件 ─────────────────────────────────────────────────── */
.meta{display:flex;flex-wrap:wrap;gap:.4rem;margin:.9rem 0 1.4rem}
.tag{font-size:.73rem;font-family:var(--mono);padding:.16rem .5rem;border-radius:6px;
  border:1px solid var(--line);background:var(--panel);color:var(--fg-dim)}
.tag b{color:var(--fg);font-weight:600}
.tag.acc{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent)}
.tag.st{border-color:var(--star);background:var(--star-soft);color:var(--star)}
.tag.wn{border-color:var(--warn);color:var(--warn)}
.gen{font-size:.75rem;color:var(--fg-faint);border-left:2px solid var(--line);padding-left:.7rem;margin:.8rem 0 1.2rem}
.crumb{font-size:.74rem;color:var(--fg-faint);font-family:var(--mono);margin-bottom:.45rem}
.crumb a{color:var(--fg-faint)}

/* R-ID 芯片与悬停卡 */
.rid-chip{font-family:var(--mono);font-size:.86em;padding:.04em .3em;border-radius:4px;
  background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-line);white-space:nowrap}
a:hover>.rid-chip{text-decoration:none}
#card{position:fixed;z-index:60;max-width:27rem;background:var(--panel);border:1px solid var(--line);
  border-radius:10px;box-shadow:var(--shadow);padding:.7rem .85rem;font-size:.8rem;line-height:1.6;
  display:none;pointer-events:none}
#card .ct{font-family:var(--mono);font-weight:650;color:var(--accent);margin-bottom:.15rem}
#card .cd{color:var(--fg);margin-bottom:.4rem}
#card .cm{color:var(--fg-faint);font-size:.73rem;font-family:var(--mono)}

/* 依赖图（自绘 SVG，不用 mermaid） */
.graph{margin:1rem 0;border:1px solid var(--line);border-radius:9px;background:var(--panel);
  padding:.6rem;overflow-x:auto}
.graph svg{display:block}
.graph .nd{cursor:pointer}
.graph .nd rect{fill:var(--bg-soft);stroke:var(--line);rx:5}
.graph .nd text{font-family:var(--mono);font-size:11px;fill:var(--fg-dim)}
.graph .nd:hover rect{stroke:var(--accent);fill:var(--accent-soft)}
.graph .nd:hover text{fill:var(--accent)}
.graph .nd.self rect{fill:var(--star-soft);stroke:var(--star);stroke-width:1.5}
.graph .nd.self text{fill:var(--fg);font-weight:650}
.graph .ed{stroke:var(--line);stroke-width:1.2;fill:none;marker-end:url(#ah)}
.graph-lbl{font-size:.7rem;color:var(--fg-faint);font-family:var(--mono);margin-bottom:.3rem}

/* 搜索结果 */
.res{margin:.35rem 0 0}
.res-i{display:block;padding:.4rem .55rem;border-radius:7px;color:var(--fg-dim);font-size:.79rem;line-height:1.45}
.res-i:hover{background:var(--line-soft);text-decoration:none}
.res-i .rt{color:var(--fg);font-weight:600}
.res-i .rk{font-family:var(--mono);font-size:.7rem;color:var(--accent)}
.res-i mark{background:var(--star-soft);color:inherit;border-radius:2px;padding:0 .1em}
.empty{padding:.7rem .55rem;font-size:.78rem;color:var(--fg-faint)}

/* 页脚上/下一页 */
.pager{display:flex;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1.2rem;
  border-top:1px solid var(--line);font-size:.82rem}
.pager a{max-width:47%}
.pager .pl{display:block;font-size:.68rem;color:var(--fg-faint);font-family:var(--mono)}

@media print{
  .nav,.toc,.pager,#card{display:none!important}
  .main{grid-template-columns:1fr;padding:0;max-width:none}
  body{font-size:11pt}
  .doc pre,.tw{break-inside:avoid}
}
`

const APP = String.raw`
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)]
const D=window.__PACT__, PAGES=D.pages, META=D.meta
const REQ=Object.fromEntries(META.reqs.map(r=>[r.id,r]))
marked.setOptions({gfm:true,breaks:false})

/* ── 路由 ─────────────────────────────────────────── */
const routeOf=()=>decodeURIComponent((location.hash||'#index').slice(1))||'index'
const norm=p=>p.replace(/^\.\//,'').replace(/\.md$/,'')
function go(p,push){ if(push!==false) location.hash='#'+p; else render(p) }

/* ── 渲染 ─────────────────────────────────────────── */
function render(key){
  const k=norm(key), page=PAGES[k]||PAGES['index']
  const doc=$('#doc')
  if(!page){doc.innerHTML='<h1>找不到这一页</h1>';return}
  let html=marked.parse(page.md)
  doc.innerHTML=html
  enhance(doc,k)
  buildToc(doc)
  pager(k)
  $$('.nav a.item').forEach(a=>a.classList.toggle('on',a.dataset.k===k))
  const on=$('.nav a.item.on')
  if(on){ const d=on.closest('details'); if(d)d.open=true;
          if(on.getBoundingClientRect().top<0||on.getBoundingClientRect().bottom>innerHeight) on.scrollIntoView({block:'center'}) }
  document.title=(page.title?page.title+' · ':'')+META.title
  doc.parentElement.scrollTo?.(0,0); window.scrollTo(0,0)
}

/* 把生成的 md 链接改成 hash 路由；表格包滚动容器；R-ID 加芯片；插依赖图 */
function enhance(root,key){
  const dir=key.includes('/')?key.slice(0,key.lastIndexOf('/')):''
  $$('a[href]',root).forEach(a=>{
    const h=a.getAttribute('href')
    if(/^(https?:|mailto:|#)/.test(h))return
    let t=h.replace(/\.md$/,'')
    if(t.startsWith('../')||t.startsWith('./')||!t.includes('/')){
      const parts=(dir?dir.split('/'):[]).concat(t.split('/')); const st=[]
      for(const s of parts){ if(s==='..')st.pop(); else if(s!=='.'&&s!=='')st.push(s) }
      t=st.join('/')
    }
    a.setAttribute('href','#'+t)
    const m=a.textContent.match(/^(R\d{3})/)
    if(m&&REQ[m[1]]){ a.innerHTML=a.innerHTML.replace(m[1],'<span class="rid-chip">'+m[1]+'</span>'); a.dataset.rid=m[1] }
  })
  $$('table',root).forEach(t=>{
    // 短单元格加 nowrap：CJK 在窄列里会被逐字断行，"功能" 竖成两行很难看
    $$('td,th',t).forEach(c=>{ const x=c.textContent.trim()
      if(x.length<=6 && !/\s/.test(x)) c.classList.add('nw') })
    if(t.parentElement.classList.contains('tw'))return
    const w=document.createElement('div'); w.className='tw'; t.replaceWith(w); w.appendChild(t) })
  $$('pre code.language-mermaid,pre code',root).forEach(c=>{
    if(!/^\s*graph\s/.test(c.textContent))return
    const g=parseGraph(c.textContent); if(!g.edges.length)return
    c.closest('pre').replaceWith(drawGraph(g,key.startsWith('r/')?key.slice(2):null))
  })
  collapseGenNote(root)
  addHeadingIds(root)
}

/* 「本页由 … 自动生成」这段在 md 里必须显眼（AI 读的是 md），
   但在网页里每页顶上杵一个大引用块太占首屏 —— 折成一行淡色注记。 */
function collapseGenNote(root){
  const bq=root.querySelector('blockquote')
  if(!bq||!/自动生成/.test(bq.textContent))return
  const d=document.createElement('div'); d.className='gen'
  d.innerHTML=bq.innerHTML.replace(/<\/p>\s*<p>/g,' ').replace(/<\/?p>/g,'')
  bq.replaceWith(d)
}

/* marked v15 起不再自动给标题加 id（旧版的 headerIds 选项已移除），
   而当页目录与锚点跳转都依赖它，所以这里自己补，并对重名做去重。 */
function addHeadingIds(root){
  const used=new Set()
  $$('h2,h3,h4',root).forEach(h=>{
    if(h.id){used.add(h.id);return}
    let base=(h.textContent||'').trim().toLowerCase()
      .replace(/[\s·・]+/g,'-').replace(/[^\w\u4e00-\u9fa5-]/g,'').replace(/-{2,}/g,'-')
      .replace(/^-|-$/g,'')||'h'
    let id=base,i=2
    while(used.has(id)) id=base+'-'+(i++)
    used.add(id); h.id=id
  })
}

/* mermaid 源 → 图数据（我们自己生成的，格式已知） */
function parseGraph(src){
  const edges=[],nodes=new Set()
  src.split('\n').forEach(l=>{
    const m=l.match(/(\w+)(?:\["[^"]*"\])?\s*-->\s*(\w+)(?:\["[^"]*"\])?/)
    if(m){edges.push([m[1],m[2]]);nodes.add(m[1]);nodes.add(m[2])}
  })
  return {edges,nodes:[...nodes]}
}

/* 自绘 SVG 依赖图：左=依赖 中=本体 右=被依赖。节点可点。 */
function drawGraph(g,self){
  const L=new Set(),R=new Set()
  g.edges.forEach(([a,b])=>{ if(b===self)L.add(a); else if(a===self)R.add(b) })
  let cols
  if(self&&(L.size||R.size)) cols=[[...L],[self],[...R]].filter(c=>c.length)
  else{ // 无自身节点（里程碑图）：按入度分层，最多 4 层
    const indeg={}; g.nodes.forEach(n=>indeg[n]=0); g.edges.forEach(([,b])=>indeg[b]++)
    const lay={},order=[...g.nodes].sort()
    order.forEach(n=>lay[n]=0)
    for(let i=0;i<6;i++) g.edges.forEach(([a,b])=>{ if(lay[b]<=lay[a]) lay[b]=lay[a]+1 })
    const mx=Math.max(...Object.values(lay),0); cols=[]
    for(let i=0;i<=Math.min(mx,5);i++) cols.push(order.filter(n=>lay[n]===i))
    cols=cols.filter(c=>c.length)
  }
  const NW=62,NH=24,GX=52,GY=10
  const H=Math.max(...cols.map(c=>c.length))*(NH+GY)+GY
  const W=cols.length*(NW+GX)+GX
  const pos={}
  cols.forEach((col,ci)=>col.forEach((n,ri)=>{
    const colH=col.length*(NH+GY)
    pos[n]={x:GX/2+ci*(NW+GX), y:(H-colH)/2+ri*(NH+GY)}
  }))
  const wrap=document.createElement('div'); wrap.className='graph'
  const seen=new Set()
  const paths=g.edges.map(([a,b])=>{
    if(!pos[a]||!pos[b])return ''
    const k=a+'>'+b; if(seen.has(k))return ''; seen.add(k)
    const x1=pos[a].x+NW,y1=pos[a].y+NH/2,x2=pos[b].x,y2=pos[b].y+NH/2
    const mx=(x1+x2)/2
    return '<path class="ed" d="M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+(x2-6)+','+y2+'"/>'
  }).join('')
  const nds=Object.keys(pos).map(n=>{
    const r=REQ[n],t=r?(r.star?'★ ':'')+n:n
    return '<g class="nd'+(n===self?' self':'')+'" data-go="r/'+n+'"><title>'+
      (r?esc(r.desc).slice(0,90):n)+'</title>'+
      '<rect x="'+pos[n].x+'" y="'+pos[n].y+'" width="'+NW+'" height="'+NH+'"/>'+
      '<text x="'+(pos[n].x+NW/2)+'" y="'+(pos[n].y+NH/2+4)+'" text-anchor="middle">'+t+'</text></g>'
  }).join('')
  wrap.innerHTML='<div class="graph-lbl">依赖关系（点击节点跳转）</div>'+
    '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+
    '<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">'+
    '<path d="M0,0 L8,4 L0,8 z" fill="var(--line)"/></marker></defs>'+paths+nds+'</svg>'
  wrap.addEventListener('click',e=>{const g2=e.target.closest('[data-go]'); if(g2)go(g2.dataset.go)})
  return wrap
}
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

/* ── 当页目录 ─────────────────────────────────────── */
function buildToc(doc){
  const hs=$$('h2,h3',doc).filter(h=>h.id)
  const t=$('#toc')
  if(hs.length<2){t.innerHTML='';return}
  t.innerHTML='<div class="toc-t">本页</div>'+hs.map(h=>
    '<a href="#'+routeOf()+'" data-jump="'+h.id+'" class="'+(h.tagName==='H3'?'h3':'')+'">'+esc(h.textContent)+'</a>').join('')
  t.onclick=e=>{const a=e.target.closest('[data-jump]'); if(!a)return; e.preventDefault()
    document.getElementById(a.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'})}
  const obs=new IntersectionObserver(es=>{es.forEach(en=>{ if(!en.isIntersecting)return
    $$('#toc a').forEach(a=>a.classList.toggle('on',a.dataset.jump===en.target.id))})},
    {rootMargin:'0px 0px -75% 0px'})
  hs.forEach(h=>obs.observe(h))
}

/* ── 上/下一页 ────────────────────────────────────── */
function pager(k){
  const i=META.order.indexOf(k), p=$('#pager')
  if(i<0){p.innerHTML='';return}
  const a=META.order[i-1],b=META.order[i+1]
  const cell=(key,lbl)=>key?'<a href="#'+key+'"><span class="pl">'+lbl+'</span>'+esc(PAGES[key].title)+'</a>':'<span></span>'
  p.innerHTML=cell(a,'← 上一页')+cell(b,'下一页 →')
}

/* ── 搜索：字段感知 ───────────────────────────────── */
const IDX=META.order.map(k=>({k,t:PAGES[k].title,s:PAGES[k].search||''}))
function search(q){
  q=q.trim(); const box=$('#results'), tree=$('#tree')
  if(!q){box.innerHTML='';box.hidden=true;tree.hidden=false;return}
  box.hidden=false;tree.hidden=true
  let f=null,term=q
  const m=q.match(/^(ms|来源|src|type|类型|prio|优先级)[:：]\s*(.+)$/i)
  if(m){f=m[1].toLowerCase();term=m[2].trim()}
  const T=term.toLowerCase()
  let hits=[]
  if(f){
    const key={ms:'milestone','来源':'source',src:'source',type:'type','类型':'type',prio:'prio','优先级':'prio'}[f]
    hits=META.reqs.filter(r=>String(r[key]||'').toLowerCase().includes(T))
      .map(r=>({k:'r/'+r.id,t:r.id+' · '+r.desc,why:key+'='+(r[key]||'—')}))
  }else{
    hits=IDX.filter(x=>x.t.toLowerCase().includes(T)||x.s.toLowerCase().includes(T))
      .map(x=>({k:x.k,t:x.t,why:''}))
    hits.sort((a,b)=>{const A=a.t.toLowerCase().indexOf(T),B=b.t.toLowerCase().indexOf(T)
      return (A<0?99:A)-(B<0?99:B)})
  }
  if(!hits.length){box.innerHTML='<div class="empty">没有匹配。试试 <code>ms:M3</code>、<code>src:SRC-B</code>、<code>类型:权限</code></div>';return}
  box.innerHTML='<div class="empty">'+hits.length+' 条结果</div>'+hits.slice(0,140).map(h=>{
    const t=esc(h.t).replace(new RegExp('('+T.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>')
    return '<a class="res-i" href="#'+h.k+'"><span class="rt">'+t+'</span>'+
      (h.why?' <span class="rk">'+esc(h.why)+'</span>':'')+'</a>'}).join('')
}

/* ── 侧栏过滤芯片 ─────────────────────────────────── */
function applyChips(){
  const on=$$('.chip[aria-pressed="true"]').map(c=>c.dataset.f)
  $$('.nav a.item[data-rid]').forEach(a=>{
    const r=REQ[a.dataset.rid]; if(!r)return
    let ok=true
    for(const f of on){
      if(f==='star') ok=ok&&!!r.star
      else if(f.startsWith('ms:')) ok=ok&&String(r.milestone||'').includes(f.slice(3))
      else if(f==='noms') ok=ok&&!r.milestone
    }
    a.classList.toggle('hide',!ok)
  })
  $$('.grp').forEach(d=>{
    const vis=$$('a.item:not(.hide)',d).length, c=$('.cnt',d)
    if(c&&d.dataset.cnt) c.textContent=vis===+d.dataset.cnt?d.dataset.cnt:vis+'/'+d.dataset.cnt
  })
}

/* ── 悬停预览卡 ───────────────────────────────────── */
const card=$('#card')
document.addEventListener('mouseover',e=>{
  const a=e.target.closest('a[data-rid]'); if(!a){card.style.display='none';return}
  const r=REQ[a.dataset.rid]; if(!r)return
  card.innerHTML='<div class="ct">'+r.id+(r.star?' ★':'')+'</div><div class="cd">'+esc(r.desc)+'</div>'+
    '<div class="cm">'+[r.type,r.prio,r.milestone||'未排里程碑',r.deps.length?'依赖 '+r.deps.join(' '):''].filter(Boolean).join(' · ')+'</div>'
  card.style.display='block'
  const b=a.getBoundingClientRect(),h=card.offsetHeight
  card.style.left=Math.min(b.left,innerWidth-card.offsetWidth-12)+'px'
  card.style.top=(b.bottom+h+12>innerHeight?b.top-h-8:b.bottom+8)+'px'
})
document.addEventListener('mouseout',e=>{if(e.target.closest('a[data-rid]'))card.style.display='none'})

/* ── 主题 ─────────────────────────────────────────── */
const setTheme=t=>{document.documentElement.dataset.theme=t;try{localStorage.setItem('pact-theme',t)}catch(e){}
  $('#theme').textContent=t==='dark'?'☾':'☀'}
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')
try{setTheme(localStorage.getItem('pact-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))}
catch(e){setTheme('light')}

/* ── 绑定 ─────────────────────────────────────────── */
$('#q').addEventListener('input',e=>search(e.target.value))
$('#q').addEventListener('keydown',e=>{if(e.key==='Escape'){e.target.value='';search('');e.target.blur()}
  if(e.key==='Enter'){const f=$('#results .res-i'); if(f)location.hash=f.getAttribute('href')}})
$$('.chip').forEach(c=>c.onclick=()=>{c.setAttribute('aria-pressed',c.getAttribute('aria-pressed')==='true'?'false':'true');applyChips()})
addEventListener('keydown',e=>{
  if((e.key==='/'||(e.key==='k'&&(e.metaKey||e.ctrlKey)))&&document.activeElement!==$('#q')){e.preventDefault();$('#q').focus();$('#q').select()}})
addEventListener('hashchange',()=>render(routeOf()))
render(routeOf())
`

export function renderHTML({ title, meta, pages, order, reqs, milestones, navGroups, file, date }) {
  const payload = {
    meta: { title, order, reqs, milestones },
    pages,
  }
  const navHTML = navGroups.map(g => {
    const items = g.items.map(it =>
      `<a class="item" href="#${esc(it.key)}" data-k="${esc(it.key)}"${it.rid ? ` data-rid="${it.rid}"` : ''}>` +
      (it.rid ? `<span class="rid">${it.rid}</span>` : '') +
      `${esc(it.label)}${it.star ? ' <span class="star">★</span>' : ''}</a>`).join('')
    return `<details class="grp"${g.open ? ' open' : ''} data-cnt="${g.items.length}">` +
      `<summary>${esc(g.name)}<span class="cnt">${g.items.length}</span></summary>${items}</details>`
  }).join('')

  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${THEME}</style>
</head>
<body>
<div class="shell">
  <aside class="nav">
    <div class="nav-head">
      <div class="brand"><a href="#index">${esc(title)}</a></div>
      <div class="brand-sub">${esc(meta)}</div>
      <div class="search-wrap"><input id="q" placeholder="搜索  /  ⌘K" autocomplete="off" spellcheck="false"></div>
      <div class="hint">支持 ms:M3 · src:SRC-B · 类型:权限</div>
      <div class="filters">
        <button class="chip" data-f="star" aria-pressed="false">★ 强制项</button>
        <button class="chip" data-f="noms" aria-pressed="false">未排里程碑</button>
        ${milestones.map(m => `<button class="chip" data-f="ms:${esc(m.id)}" aria-pressed="false">${esc(m.id)}</button>`).join('')}
      </div>
    </div>
    <div class="nav-body">
      <div id="results" class="res" hidden></div>
      <div id="tree">${navHTML}</div>
    </div>
    <div class="nav-foot">
      <button class="iconbtn" id="theme">☀</button>
      <span>${reqs.length} 需求 · ${milestones.length} 里程碑</span>
    </div>
  </aside>
  <div class="main">
    <article class="doc" id="doc"></article>
    <nav class="toc" id="toc"></nav>
    <div class="pager" id="pager" style="grid-column:1/2"></div>
  </div>
</div>
<div id="card"></div>
<script>${readVendor('marked.min.js')}</script>
<script>window.__PACT__=${safeJSON(payload)};</script>
<script>${APP}</script>
</body>
</html>`
}

function readVendor(name) {
  const url = new URL(`../vendor/${name}`, import.meta.url)
  if (!existsSync(url)) throw new Error(`缺少 vendor/${name}——单文件 HTML 需要它内嵌渲染 markdown`)
  return readFileSync(url, 'utf8')
}
