#!/usr/bin/env node
// pact-book.mjs — 把单文件真源 PACT.md 生成为 md 知识库（mdbook 兼容）
//
//   用法: node pact-book.mjs [PACT.md] [--out=<物料目录>/pact-book] [--build|--check] [--quiet]
//
// 设计前提（不可动摇）：
//   PACT.md 是**唯一手写真源**，本知识库**全部由它生成**。
//   任何人不得手改 pact-book/ 生成目录下的文件——改了会被 --check 抓出来，并在下次 --build 覆盖。
//   这样做的理由：PACT 自己定义「规格漂移是最贵的债」，两份手写内容必然漂移。
//
// 产出四类视图：
//   ① 章节页    src/{p,a,c,t}/<锚点>-<标题>.md   —— 按 30 个锚点切分，SUMMARY.md 导航
//   ② R-ID 单页 src/r/R###.md                    —— AI 施工素材：一条需求的全部上下文聚合成一页
//   ③ 里程碑包  src/m/M#.md                      —— 一个里程碑要做的全部东西
//   ④ 反查索引  src/idx/*.md                     —— R-ID / D-ID / 不变量 / 来源 / 依赖图谱 / 术语
//
// 退出码：0=成功（--check 时表示无漂移） 1=失败或检测到漂移 2=用法错误

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, relative, basename } from 'node:path'
import { renderHTML } from './pact-book-html.mjs'
import { parsePact } from './pact-parse.mjs'

// ── 参数 ────────────────────────────────────────────────────────────────────
// OUT 默认跟随真源所在物料目录：<dirname(PACT.md)>/pact-book
let FILE = 'PACT.md', OUT = '', MODE = 'build', QUIET = 0
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--out=')) OUT = a.slice(6)
  else if (a === '--build') MODE = 'build'
  else if (a === '--check') MODE = 'check'
  else if (a === '--quiet') QUIET = 1
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 22).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0) }
  else if (a.startsWith('-')) { console.error(`未知参数: ${a}`); process.exit(2) }
  else FILE = a
}
const say = (...m) => { if (!QUIET) console.log(...m) }
if (!existsSync(FILE)) { console.error(`[FAIL] 找不到文件: ${FILE}`); process.exit(1) }
if (!OUT) OUT = join(dirname(FILE), 'pact-book')
// 生成物里嵌的真源引用统一用文件名：知识库就在 PACT.md 旁边，且 --check 不能因调用路径写法不同而误报漂移
const REF = basename(FILE)

const SRC = readFileSync(FILE, 'utf8')
const LINES = SRC.split('\n')

// ── 解析（共用 pact-parse.mjs，避免两份解析器漂移）───────────────────────────
const { LINES: _L, chapters, chById, missingAnchors, reqs, decisions, invs, milestones,
        sourceIndex, ANCHOR_ORDER, PART, cells, plain, safe, expandRIDs } = parsePact(FILE, SRC)

// ── 写文件（先写内存，再落盘，便于 --check 比对）─────────────────────────────
const files = new Map()
const put = (p, s) => files.set(p, s.replace(/\s+$/, '') + '\n')
const GEN_HEAD = (extra = '') =>
  `> **本页由 \`pact-book.sh\` 从 \`${REF}\` 自动生成，请勿手改。**\n` +
  `> 改内容请改 \`${REF}\`，然后重新 \`pact-book.sh --build\`；\`--check\` 会抓出手改导致的漂移。${extra}`
/** 供标题用的短摘要：切到第一个自然断点，最长 36 字 */
function brief(text, max = 36) {
  const t = plain(text).replace(/\s+/g, ' ')
  const cut = t.search(/[：:，,。;；]/)
  let s = cut > 6 && cut <= max ? t.slice(0, cut) : t.slice(0, max)
  return s + (s.length < t.length ? '…' : '')
}
const rlink = id => `[${id}](../r/${id}.md)`
const rlinkFromIdx = id => `[${id}](../r/${id}.md)`

// —— 章节页 ——
for (const ch of chapters) {
  const [dir] = PART[ch.part] || ['x', '']
  const fname = `${ch.id}-${safe(ch.titleShort) || ch.id}.md`
  ch.path = `${dir}/${fname}`
  const idx = ANCHOR_ORDER.indexOf(ch.id)
  const prev = idx > 0 ? chapters.find(c => c.id === ANCHOR_ORDER[idx - 1]) : null
  const next = idx >= 0 && idx < ANCHOR_ORDER.length - 1 ? chapters.find(c => c.id === ANCHOR_ORDER[idx + 1]) : null
  const nav = [prev && `← [${prev.id} ${prev.titleShort}](../${prev.path})`, next && `[${next.id} ${next.titleShort}](../${next.path}) →`].filter(Boolean).join(' ｜ ')
  // 正文开头那条 `## C1 · 数据模型` 与本页 H1 重复，去掉，避免同一标题连出两次
  let body = ch.body.replace(/^##\s+.*(\r?\n)+/, '')
  // 章节页里把 R-ID / D-ID 变成可点链接（只处理正文，代码块内不动）
  body = linkify(body, '..')
  put(`src/${ch.path}`,
    `# ${ch.title}\n\n${GEN_HEAD()}\n> 锚点 \`<!-- PACT:${ch.id} -->\`｜真源位置：\`${REF}\` 第 ${ch.from}–${ch.to} 行\n\n${nav ? nav + '\n\n---\n\n' : ''}${body}\n`)
}

/** 把正文里的 R###/D###/INV-# 变成链接，跳过代码块与已有链接 */
function linkify(md, base) {
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`|\[[^\]]*\]\([^)]*\))/g)
  return parts.map((seg, i) => {
    if (i % 2 === 1) return seg                                   // 代码块 / 行内代码 / 既有链接：原样
    return seg
      .replace(/\bR(\d{3})\b/g, (m0, n) => reqs.has('R' + n) ? `[${m0}](${base}/r/R${n}.md)` : m0)
      .replace(/\bD(\d{3})\b/g, (m0, n) => decisions.some(d => d.id === 'D' + n) ? `[${m0}](${base}/idx/D-ID决策索引.md#${('d' + n).toLowerCase()})` : m0)
  }).join('')
}

// —— R-ID 单页（AI 施工素材）——
for (const r of [...reqs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const L = []
  L.push(`# ${r.id}${r.star ? ' ★' : ''} · ${brief(r.desc)}`)
  L.push('')
  L.push(GEN_HEAD())
  L.push('')
  L.push(`> **这一页是为「照着它就能开工」准备的**：把 \`P5\` 的需求、\`T1\` 的验收、依赖、`)
  L.push(`> 相关决策与契约位置聚合在一处，施工时读这一页即可，不必通读 ${REF} 全文。`)
  L.push(`> **但凡本页与 \`${REF}\` 有出入，一律以 \`${REF}\` 为准。**`)
  L.push('')
  L.push('| 项 | 值 |')
  L.push('|---|---|')
  L.push(`| 类型 | ${r.type || '—'} |`)
  L.push(`| 优先级 | ${r.prio || '—'} |`)
  L.push(`| 里程碑 | ${r.milestone ? `[${r.milestone}](../m/${r.milestone.split(',')[0].trim()}.md)` : '**未排入任何里程碑**' } |`)
  L.push(`| 招标强制项 | ${r.star ? '**★ 是**（`T4` 要求现场逐条演示）' : '否'} |`)
  L.push(`| 所属分组 | ${r.group || '—'} |`)
  L.push(`| 来源 | ${linkify(r.source || '—', '..')} |`)
  if (plain(r.assume) && plain(r.assume) !== '—') L.push(`| 假设 | ${r.assume} |`)
  L.push('')
  L.push('## 需求（可判真假）')
  L.push('')
  L.push(linkify(r.desc || '—', '..'))
  L.push('')
  L.push('## 验收标准（可量化）')
  L.push('')
  L.push(linkify(r.accept || '—', '..'))
  L.push('')
  L.push('## 怎么验（`T1`）')
  L.push('')
  if (r.t1method) {
    L.push('| 验收方式 | 判定标准 | 检查者 |')
    L.push('|---|---|---|')
    L.push(`| ${r.t1method} | ${r.t1criteria} | ${r.t1checker} |`)
  } else {
    L.push('> ⚠️ **`T1` 中没有这条的验收行。** 按 PACT 的规矩，没有验收方式的需求不算需求——')
    L.push('> 这会被 `pact-lint.sh` 第 6 项判 FAIL。请回 `T1` 补行。')
  }
  L.push('')
  L.push('## 依赖关系')
  L.push('')
  L.push(`- **依赖**（要先做完这些）：${r.deps.length ? r.deps.map(rlink).join('、') : '无'}`)
  L.push(`- **被依赖**（这条不稳，下面这些都会塌）：${r.dependents.length ? [...new Set(r.dependents)].sort().map(rlink).join('、') : '无'}`)
  if (r.deps.length || r.dependents.length) {
    L.push('')
    L.push('```mermaid')
    L.push('graph LR')
    for (const d of r.deps) L.push(`  ${d}["${d}"] --> ${r.id}["${r.id}"]`)
    for (const d of [...new Set(r.dependents)].sort()) L.push(`  ${r.id} --> ${d}["${d}"]`)
    L.push(`  style ${r.id} fill:#fde68a,stroke:#b45309`)
    L.push('```')
  }
  L.push('')
  L.push('## 相关决策')
  L.push('')
  if (r.decisions.length) {
    for (const did of [...new Set(r.decisions)].sort()) {
      const d = decisions.find(x => x.id === did)
      L.push(`- **${d.id} · ${d.title}** —— ${plain(d.fields['结论'] || '').slice(0, 160)}  \n  [看完整决策（含已否决方案）](../idx/D-ID决策索引.md#${d.id.toLowerCase()})`)
    }
  } else {
    L.push('（无直接关联的 D-ID。若施工中需要做取舍，回 `A5` 新增决策，不要就地决定。）')
  }
  L.push('')
  L.push('## 在哪些章节被提到')
  L.push('')
  L.push(r.mentionedIn.length
    ? [...new Set(r.mentionedIn)].map(id => `[${id} ${chById[id] ? chById[id].titleShort : ''}](../${chById[id].path})`).join('、')
    : '（只出现在 `P5`/`T1`。若它需要数据模型或接口支撑，说明 C 层可能漏了。）')
  L.push('')
  put(`src/r/${r.id}.md`, L.join('\n'))
}

// —— 里程碑工作包 ——
for (const ms of milestones) {
  const L = []
  L.push(`# ${ms.name}`)
  L.push('')
  L.push(GEN_HEAD())
  L.push('')
  L.push(`> **这是一个工作包**：本里程碑要做的全部需求、出口条件与明确不含，聚合在这一页。`)
  L.push(`> S10 施工时按此包切工作单元，取活与状态维护在 \`action-graph.json\`（pact-graph.sh --next）。`)
  L.push('')
  L.push(`- **包含需求**：${ms.reqs.length} 条`)
  L.push(`- **★ 强制项**：${ms.reqs.filter(r => reqs.get(r).star).length} 条`)
  L.push('')
  L.push('## 出口条件（全满足才算这个里程碑做完）')
  L.push('')
  L.push(linkify(ms.exit || '—', '..'))
  L.push('')
  L.push('## 明确不含')
  L.push('')
  L.push(linkify(ms.excludes || '—', '..'))
  L.push('')
  L.push('## 需求清单')
  L.push('')
  L.push('| R-ID | ★ | 类型 | 优先级 | 需求 | 依赖 |')
  L.push('|---|---|---|---|---|---|')
  for (const rid of ms.reqs) {
    const r = reqs.get(rid)
    L.push(`| ${rlink(rid)} | ${r.star ? '★' : ''} | ${r.type} | ${r.prio} | ${plain(r.desc).slice(0, 80)} | ${r.deps.map(d => ms.reqs.includes(d) ? d : `${d}⚠️`).join('、') || '—'} |`)
  }
  L.push('')
  const outside = [...new Set(ms.reqs.flatMap(r => reqs.get(r).deps).filter(d => reqs.has(d) && !ms.reqs.includes(d)))].sort()
  if (outside.length) {
    L.push('> ⚠️ 标 ⚠️ 的依赖**不在本里程碑内**，必须确认它们在更早的里程碑已完成，否则本包无法开工：')
    L.push('>')
    for (const d of outside) L.push(`> - ${rlink(d)}（属 ${reqs.get(d).milestone || '**未排入任何里程碑**'}）`)
    L.push('')
  }
  const deps = ms.reqs.length ? ms.reqs.filter(r => reqs.get(r).deps.some(d => ms.reqs.includes(d))) : []
  if (deps.length) {
    L.push('## 包内依赖图谱')
    L.push('')
    L.push('```mermaid')
    L.push('graph LR')
    for (const rid of ms.reqs) for (const d of reqs.get(rid).deps) if (ms.reqs.includes(d)) L.push(`  ${d} --> ${rid}`)
    L.push('```')
    L.push('')
  }
  put(`src/m/${ms.id}.md`, L.join('\n'))
}

// —— 索引：R-ID ——
{
  const L = [`# R-ID 索引`, '', GEN_HEAD(), '',
    `共 **${reqs.size}** 条需求｜★ 招标强制项 **${[...reqs.values()].filter(r => r.star).length}** 条｜`
    + `无验收 **${[...reqs.values()].filter(r => !r.t1method).length}** 条｜未排里程碑 **${[...reqs.values()].filter(r => !r.milestone).length}** 条`, '',
    '| R-ID | ★ | 类型 | 优先级 | 里程碑 | 有验收 | 需求 |', '|---|---|---|---|---|---|---|']
  for (const r of [...reqs.values()].sort((a, b) => a.id.localeCompare(b.id)))
    L.push(`| ${rlinkFromIdx(r.id)} | ${r.star ? '★' : ''} | ${r.type} | ${r.prio} | ${r.milestone || '⚠️ 无'} | ${r.t1method ? '✅' : '⚠️ 无'} | ${plain(r.desc).slice(0, 70)} |`)
  put('src/idx/R-ID索引.md', L.join('\n'))
}

// —— 索引：D-ID 决策 ——
{
  const L = [`# D-ID 决策索引`, '', GEN_HEAD(), '',
    `共 **${decisions.length}** 条决策。**每条四件套齐全才算数：选项 / 结论 / 理由 / 已否决。**`,
    '',
    '> 为什么要保留「已否决」：后人接手时最想知道的不是你选了什么，而是**你否掉了什么、为什么否**。',
    '> 没有这一栏，同一个坑会被重新踩一遍。', '',
    '| D-ID | 决策 | 结论 | 影响需求 |', '|---|---|---|---|']
  for (const d of decisions)
    L.push(`| [${d.id}](#${d.id.toLowerCase()}) | ${d.title} | ${plain(d.fields['结论'] || '').slice(0, 90)} | ${d.reqs.length ? d.reqs.slice(0, 8).map(rlinkFromIdx).join('、') + (d.reqs.length > 8 ? ` 等 ${d.reqs.length} 条` : '') : '—'} |`)
  L.push('')
  L.push('---')
  L.push('')
  for (const d of decisions) {
    L.push(`## ${d.id} · ${d.title}`)
    L.push('')
    L.push(linkify(d.text, '..'))
    L.push('')
  }
  put('src/idx/D-ID决策索引.md', L.join('\n'))
}

// —— 索引：不变量 ——
{
  const L = [`# 不变量索引（C3 数据铁律）`, '', GEN_HEAD(), '',
    `共 **${invs.length}** 条。**这些是任何时候都必须成立的断言**，违反即数据不可信；`,
    '部分条目同时是 `T3` 停工线。', '',
    '| INV | 断言 | 违反的后果 | 对应检查 |', '|---|---|---|---|']
  for (const i of invs) L.push(`| **${i.id}** | ${linkify(i.assert, '..')} | ${i.consequence} | ${i.check} |`)
  put('src/idx/不变量索引.md', L.join('\n'))
}

// —— 索引：来源反查 ——
{
  const L = [`# 来源索引（哪条需求出自哪份物料）`, '', GEN_HEAD(), '',
    '> 验收扯皮时最有用的一张表：甲方问「这条哪来的」，直接指出处。', '',
    '| 来源 | 条数 | R-ID |', '|---|---|---|']
  for (const [k, v] of [...sourceIndex.entries()].sort((a, b) => b[1].size - a[1].size))
    L.push(`| ${k} | ${v.size} | ${[...v].sort().map(rlinkFromIdx).join('、')} |`)
  put('src/idx/来源索引.md', L.join('\n'))
}

// —— 索引：依赖图谱 ——
{
  const L = [`# 依赖图谱`, '', GEN_HEAD(), '',
    `> 全量 ${reqs.size} 个节点的图没人看得懂，因此**按里程碑分图**；单条需求的局部依赖见各 R-ID 页。`, '']
  for (const ms of milestones) {
    const edges = []
    for (const rid of ms.reqs) for (const d of reqs.get(rid).deps) if (ms.reqs.includes(d)) edges.push(`  ${d} --> ${rid}`)
    L.push(`## ${ms.name}`)
    L.push('')
    if (!edges.length) { L.push('（包内无依赖边——这些需求彼此独立，可并行开工。）'); L.push(''); continue }
    L.push('```mermaid'); L.push('graph LR'); L.push(...edges); L.push('```'); L.push('')
  }
  const orphan = [...reqs.values()].filter(r => !r.milestone)
  if (orphan.length) {
    L.push('## ⚠️ 未排入任何里程碑的需求')
    L.push('')
    L.push('这些需求写了但没人认领施工时机，`T5` 需要补：')
    L.push('')
    for (const r of orphan) L.push(`- ${rlinkFromIdx(r.id)} · ${plain(r.desc).slice(0, 70)}`)
    L.push('')
  }
  put('src/idx/依赖图谱.md', L.join('\n'))
}

// —— 索引：健康度自检 ——
{
  const noT1 = [...reqs.values()].filter(r => !r.t1method)
  const noMs = [...reqs.values()].filter(r => !r.milestone)
  const badDep = [...reqs.values()].flatMap(r => r.deps.filter(d => !reqs.has(d)).map(d => [r.id, d]))
  const noDec = decisions.filter(d => !d.fields['已否决'])
  const L = [`# 知识库健康度`, '', GEN_HEAD(), '',
    '> 这是**生成期**能看出来的问题，与另外三道机检互补：它们看结构，这里看**图的连通性**。', '',
    '| 检查 | 结果 |', '|---|---|',
    `| 需求总数 | ${reqs.size} |`,
    `| 决策总数 | ${decisions.length} |`,
    `| 不变量总数 | ${invs.length} |`,
    `| 里程碑总数 | ${milestones.length} |`,
    `| 缺锚点 | ${missingAnchors.length ? '⚠️ ' + missingAnchors.join('、') : '✅ 30 个齐全'} |`,
    `| 无 T1 验收的需求 | ${noT1.length ? '⚠️ ' + noT1.map(r => r.id).join('、') : '✅ 无'} |`,
    `| 未排里程碑的需求 | ${noMs.length ? '⚠️ ' + noMs.map(r => r.id).join('、') : '✅ 无'} |`,
    `| 指向不存在需求的依赖 | ${badDep.length ? '⚠️ ' + badDep.map(([a, b]) => `${a}→${b}`).join('、') : '✅ 无'} |`,
    `| 缺「已否决」的决策 | ${noDec.length ? '⚠️ ' + noDec.map(d => d.id).join('、') : '✅ 无'} |`, '']
  put('src/idx/健康度.md', L.join('\n'))
}

// —— 首页 + SUMMARY + book.toml ——
{
  const title = (LINES.find(l => /^#\s+/.test(l)) || '# PACT').replace(/^#\s+/, '').trim()
  const meta = LINES.slice(0, 40).filter(l => /创建日期|更新日期|状态:|状态：/.test(l)).map(l => l.replace(/^>\s?/, '')).join('  \n')
  put('src/index.md', [
    `# ${title}`, '', GEN_HEAD(), '', meta, '',
    '## 这份知识库是什么',
    '',
    `\`${REF}\` 是**唯一手写真源**，它的验收标准只有一条：`,
    '**一个对本项目一无所知的人或 AI，只读那一份文件就能开工。**',
    '',
    '本知识库是它的**生成视图**，不替代它，只是让同一份内容更好查：',
    '',
    '| 我要做什么 | 看哪里 |',
    '|---|---|',
    '| 我是 AI，要施工某条需求 | **[R-ID 单页](idx/R-ID索引.md)** —— 一条需求的需求/验收/依赖/决策/契约全在一页 |',
    '| 我要领一个里程碑的活 | **[里程碑工作包](m/M0.md)** —— 该阶段全部需求 + 出口条件 + 明确不含 |',
    '| 我是人，想读懂设计 | 下面的 P/A/C/T 四层章节 |',
    '| 我想知道「为什么这么定」 | **[D-ID 决策索引](idx/D-ID决策索引.md)** —— 含**已否决方案**与理由 |',
    '| 我想知道「这条哪来的」 | **[来源索引](idx/来源索引.md)** |',
    '| 我想知道「改这条会炸什么」 | **[依赖图谱](idx/依赖图谱.md)** 或该需求页的「被依赖」 |',
    '| 我要确认规格本身健不健康 | **[健康度](idx/健康度.md)** |',
    '',
    '## 四层',
    '',
    '| 层 | 回答 | 章节 |',
    '|---|---|---|',
    ...['P', 'A', 'C', 'T'].map(p => {
      const cs = chapters.filter(c => c.part === p)
      return `| **${PART[p][1].split(' · ')[0]}** | ${PART[p][1].split(' · ')[1]} | ${cs.map(c => `[${c.id}](${c.path})`).join(' · ')} |`
    }),
    '',
    '> **规矩**：本知识库任何一页与 `' + REF + '` 冲突时，**一律以 `' + REF + '` 为准**。',
    '> 发现不一致就是漂移，跑 `pact-book.sh --check` 会报出来。',
  ].join('\n'))

  // mdbook 规矩：同一文件不得在 SUMMARY 出现两次，且嵌套项只能是纯链接。
  // 因此分组节点一律用 draft 章节 `[标题]()`（不可点、可折叠），不指向任何文件。
  const S = ['# Summary', '', '[总览](index.md)', '']
  S.push('# 规格四层', '')
  for (const p of ['P', 'A', 'C', 'T']) {
    const cs = chapters.filter(c => c.part === p)
    if (!cs.length) continue
    S.push(`- [${PART[p][1]}]()`)
    for (const c of cs) S.push(`  - [${c.id} · ${c.titleShort}](${c.path})`)
  }
  S.push('', '# 施工视图', '')
  if (milestones.length) {
    S.push('- [里程碑工作包]()')
    for (const ms of milestones) S.push(`  - [${ms.name}](m/${ms.id}.md)`)
  }
  S.push('- [需求单页（R-ID）]()')
  for (const r of [...reqs.values()].sort((a, b) => a.id.localeCompare(b.id)))
    S.push(`  - [${r.id}${r.star ? ' ★' : ''} · ${brief(r.desc, 28)}](r/${r.id}.md)`)
  S.push('', '# 索引与反查', '')
  for (const n of ['R-ID索引', 'D-ID决策索引', '不变量索引', '来源索引', '依赖图谱', '健康度'])
    S.push(`- [${n}](idx/${n}.md)`)
  put('src/SUMMARY.md', S.join('\n'))

  const hasMermaid = [...reqs.values()].some(r => r.deps.length || r.dependents.length)
  put('book.toml', [
    '# 由 pact-book.sh 生成。装了 mdbook 就能 `mdbook build`；没装也不影响直接读 src/ 下的 md。',
    '[book]',
    `title = "${title.replace(/"/g, "'")}"`,
    'language = "zh-CN"',
    'src = "src"',
    '',
    '[output.html]',
    'default-theme = "light"',
    'no-section-label = true',
    '',
    '[output.html.fold]',
    'enable = true',
    'level = 1',
    ...(hasMermaid ? ['', '# 依赖图谱用 mermaid。需要 mdbook-mermaid：',
                      '#   cargo install mdbook-mermaid  （或从 GitHub releases 取预编译二进制）',
                      '# 没装也能 build，只是 mermaid 块会显示为代码块。',
                      '[preprocessor.mermaid]', 'command = "mdbook-mermaid"'] : []),
  ].join('\n'))

  put('.gitattributes', 'src/** linguist-generated=true\n')
  put('README.md', [
    '# 生成物 · 不要手改', '', GEN_HEAD(), '',
    `- 真源：\`../${REF}\``,
    '- 重新生成：`bash <SKILL_DIR>/scripts/pact-book.sh`',
    '- 漂移检查：`bash <SKILL_DIR>/scripts/pact-book.sh --check`（S8 / S11 门禁会跑）',
    '- 渲染 HTML（可选，需要 mdbook）：`mdbook build`',
    '',
    '直接在 GitHub 上浏览 `src/` 也可以，全部是纯 markdown，mermaid 图会原生渲染。',
  ].join('\n'))
}

// ── ⑧ 单文件 HTML：正式对外交付的规格文档（有别于 src/ 的 AI 视图）──────────
{
  const title = plain((LINES.find(l => /^#\s+/.test(l)) || '# PACT').replace(/^#\s+/, '').trim())

  // PACT 头部字段表（| 字段 | 值 | 两列）→ 封面元信息；遇到第一个正文标题就停
  const headerMeta = []
  for (const l of LINES.slice(0, 40)) {
    if (/^##\s/.test(l) || /^<!--/.test(l)) break
    const c = cells(l)
    if (c && c.length === 2 && c[0] !== '字段') headerMeta.push({ k: plain(c[0]), v: plain(c[1]) })
  }

  const slimReqs = [...reqs.values()].sort((a, b) => a.id.localeCompare(b.id)).map(r => ({
    id: r.id, desc: plain(r.desc), star: !!r.star, type: plain(r.type), prio: plain(r.prio),
    milestone: r.milestone,
  }))

  // ── 图形化：真源里的流程图/结构图块 ↔ figures/<锚点-序号>.svg（agent 绘制的图源）──
  // 判定：mermaid 块一律算图；无语言/text 块含 ≥2 行制图字符（框线/箭头）也算图。
  // SVG 首行注释携带 src-hash（图块内容 sha1 前 12 位）；hash 一致才内嵌，
  // 缺图 → 保留代码块 + 列待绘清单；hash 不一致（真源图变了没重绘）→ --check 判漂移。
  const FIG_DIR = join(dirname(FILE), 'figures')
  const figHash = t => createHash('sha1').update(t.trim()).digest('hex').slice(0, 12)
  const isDiagram = (lang, body) => lang === 'mermaid' ||
    (['', 'text', 'txt', 'ascii'].includes(lang) &&
     body.split('\n').filter(l => /[─│┌┐└┘├┤┬┴┼═║╔╗╚╝▲▼◀▶←→↔⇄]|-->/.test(l)).length >= 2)
  const figs = new Map()          // id -> {svg, src}   （仅新鲜可嵌入的）
  const figTodo = [], figStale = []
  const htmlChapters = chapters.map(c => {
    let n = 0
    const body = c.body.replace(/```(\w*)\n([\s\S]*?)```/g, (m0, lang, blk) => {
      if (!isDiagram(lang, blk)) return m0
      n++
      const id = `${c.id}-${n}`, h = figHash(blk)
      const svgPath = join(FIG_DIR, `${id}.svg`)
      if (existsSync(svgPath)) {
        const svg = readFileSync(svgPath, 'utf8')
        const m = svg.match(/pact:src-hash=([0-9a-f]+)/)
        if (m && m[1] === h) { figs.set(id, { svg, src: blk.trimEnd() }); return `\n@@FIG:${id}@@\n` }
        figStale.push({ id, hash: h, chapter: c.id })
      } else {
        figTodo.push({ id, hash: h, chapter: `${c.id} · ${c.titleShort}` })
      }
      return m0
    })
    return { id: c.id, part: c.part, title: c.titleShort, body }
  })

  put('pact-book.html', renderHTML({
    title, headerMeta,
    chapters: htmlChapters,
    reqs: slimReqs,
    milestones: milestones.map(m => ({ id: m.id, name: m.name })),
    counts: { decisions: decisions.length, invs: invs.length },
    file: REF, figs,
  }))

  if (figTodo.length) {
    say(`\n── 图形化待办（${figTodo.length} 张）──`)
    say(`  真源含流程图/结构图块，但 figures/ 下还没有对应 SVG——交付 HTML 里暂以文本块呈现。`)
    for (const f of figTodo) say(`  [待绘制] figures/${f.id}.svg   src-hash=${f.hash}   （${f.chapter}）`)
    say(`  绘制规范见 <SKILL_DIR>/references/svg-figure-guide.md；SVG 首行须含 <!-- pact:src-hash=<hash> -->`)
  }
  if (figStale.length) {
    for (const f of figStale)
      console.error(`  [${MODE === 'check' ? 'FAIL' : 'WARN'}] figures/${f.id}.svg 已过期：真源 ${f.chapter} 的图块变了（现 src-hash=${f.hash}）但 SVG 未重绘${MODE === 'check' ? '' : '——本次退回文本块呈现'}`)
    if (MODE === 'check') { console.error('══ 结果: FAIL —— 图源与真源漂移 ══'); process.exit(1) }
  }
}

// ── 落盘 / 比对 ─────────────────────────────────────────────────────────────
function walk(dir, base = dir, acc = new Map()) {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, base, acc)
    else acc.set(relative(base, p).split('\\').join('/'), readFileSync(p, 'utf8'))
  }
  return acc
}

// 两类文件，语义不同：
//   · src/**  = PACT.md 的**投影** → 严格比对，一个字节都不许差（漂移检查的本体）
//   · 其余    = **脚手架**（book.toml / README / .gitattributes）→ 只查存在，允许本地调整
//     理由：book.toml 是本地渲染配置，`mdbook-mermaid install` 等工具会合法地改写它，
//     用户也可能调主题、加预处理器。把配置也纳入严格比对，等于禁止用户配置自己的渲染器。
//   · book/ 与 mermaid*.js 是 mdbook 的构建产物与资源，完全不参与比对。
const isContent = k => k.startsWith('src/') || k === 'pact-book.html'
const isIgnored = k => k.startsWith('book/') || /^mermaid[\w.-]*\.js$/.test(k) || k === '.gitignore'

if (MODE === 'check') {
  const cur = walk(OUT)
  if (!cur.size) {
    console.log(`══ 结果: FAIL ══\n   知识库尚未生成（${OUT}/ 不存在）。跑一次：pact-book.sh --build`)
    process.exit(1)
  }
  const want = [...files.keys()]
  const missing = want.filter(k => !cur.has(k))
  const diff = want.filter(k => isContent(k) && cur.has(k) && cur.get(k) !== files.get(k))
  const extra = [...cur.keys()].filter(k => isContent(k) && !files.has(k))
  const bad = missing.length + extra.length + diff.length
  if (bad === 0) {
    say(`══ 结果: PASS ══\n   ${OUT}/src 与 ${FILE} 一致（${want.filter(isContent).length} 个投影文件，无漂移）`)
    const tweaked = want.filter(k => !isContent(k) && cur.has(k) && cur.get(k) !== files.get(k))
    if (tweaked.length) say(`   [注] 脚手架已被本地调整（不算漂移）：${tweaked.join('、')}`)
    process.exit(0)
  }
  console.log('══ 结果: FAIL（知识库与真源已漂移）══')
  if (diff.length) { console.log(`   投影内容不一致 ${diff.length} 个：`); diff.slice(0, 15).forEach(f => console.log(`     ~ ${f}`)) }
  if (missing.length) { console.log(`   缺失 ${missing.length} 个：`); missing.slice(0, 15).forEach(f => console.log(`     - ${f}`)) }
  if (extra.length) { console.log(`   src/ 下多余（手加的？）${extra.length} 个：`); extra.slice(0, 15).forEach(f => console.log(`     + ${f}`)) }
  console.log(`   修法：重新生成即可 → pact-book.sh --build`)
  console.log(`   若你手改了 ${OUT}/src 下的文件，那些改动会被覆盖——请改 ${FILE}。`)
  process.exit(1)
}

// --build：只清空并重写投影（src/），脚手架缺什么补什么、已存在的不动
if (existsSync(join(OUT, 'src'))) rmSync(join(OUT, 'src'), { recursive: true, force: true })
let kept = 0
for (const [p, s] of files) {
  const full = join(OUT, p)
  if (!isContent(p) && existsSync(full)) { kept++; continue }      // 保住用户/工具对脚手架的调整
  mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, s)
}
{ // 构建产物不进版本库
  const gi = join(OUT, '.gitignore')
  if (!existsSync(gi)) writeFileSync(gi, 'book/\nmermaid.min.js\nmermaid-init.js\n')
}

const warn = []
if (missingAnchors.length) warn.push(`缺 ${missingAnchors.length} 个锚点：${missingAnchors.join('、')}`)
const noT1 = [...reqs.values()].filter(r => !r.t1method)
if (noT1.length) warn.push(`${noT1.length} 条需求在 T1 无验收：${noT1.map(r => r.id).slice(0, 10).join('、')}`)
const noMs = [...reqs.values()].filter(r => !r.milestone)
if (noMs.length) warn.push(`${noMs.length} 条需求未排入里程碑：${noMs.map(r => r.id).slice(0, 10).join('、')}`)

say(`══ 结果: PASS（${warn.length} 个 WARN）══`)
say(`   ${OUT}/  ${files.size} 个文件${kept ? `（其中 ${kept} 个脚手架保留了本地调整，未覆盖）` : ''}`)
say(`   章节 ${chapters.length}｜需求 ${reqs.size}｜决策 ${decisions.length}｜不变量 ${invs.length}｜里程碑 ${milestones.length}`)
warn.forEach(w => say(`   [WARN] ${w}`))
say(`   单文件知识库: ${OUT}/pact-book.html （双击即开，无需任何服务与工具链）`)
say(`   md 原文（AI 施工素材）: ${OUT}/src/`)
process.exit(0)
