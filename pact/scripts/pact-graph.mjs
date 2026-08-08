#!/usr/bin/env node
// pact-graph.mjs — action-graph.json 执行图谱机检：结构校验 + DAG 校验 + 完成度 + 下一批可执行节点
//
//   用法: node pact-graph.mjs [物料目录|action-graph.json] [--next] [--done-rids]
//                             [--require-complete] [--json] [--quiet]
//
//   默认      校验 + 打印按 模块→功能点→步骤 汇总的进度树与完成度
//   --next    只列出「当前可执行」的步骤（依赖已全部完成、自身未完成）—— /pact-run 取活用
//             输出 TSV: id<TAB>rids<TAB>impl.status<TAB>title；步骤若有 pitfalls，
//             逐条以 "#<TAB>⚠ …" 注释行跟随（TSV 消费方跳过 # 开头行）
//   --done-rids       只打印「已完成」的 R-ID 集合（该 R-ID 的全部步骤都完成）—— pact-trace 用
//   --require-complete 完成度不足 100% 时 FAIL —— /pact-review 与收尾用
//
// 图谱是施工执行态的唯一真源（取代旧版 coverage.md）。节点三级：
//   module（功能模块，源自 A2）→ feature（功能点，挂 R-ID）→ step（可执行步骤，带 impl/test 状态）
// deps 为跨节点执行依赖（DAG，禁环）。只有 step 携带状态；上层状态由子节点推导。
//
// 完成判定（对每个 step）：impl.status == "done" 且 test.status ∈ {"pass","na"}。
//   impl done 必须带 evidence（file:line）；test pass/na 必须带 evidence（测试命令/na 理由）。
//
// 退出码：0=校验通过（--require-complete 时还需 100%） 1=FAIL 2=用法错误
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { parsePact } from './pact-parse.mjs'

let TARGET = '.', MODE = 'summary', REQUIRE = 0, QUIET = 0, JSON_OUT = 0
for (const a of process.argv.slice(2)) {
  if (a === '--next') MODE = 'next'
  else if (a === '--done-rids') MODE = 'done-rids'
  else if (a === '--require-complete') REQUIRE = 1
  else if (a === '--json') JSON_OUT = 1
  else if (a === '--quiet') QUIET = 1
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 19).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0) }
  else if (a.startsWith('-')) { console.error(`未知参数: ${a}`); process.exit(2) }
  else TARGET = a
}

// ── 定位文件 ────────────────────────────────────────────────────────────────
let GRAPH_FILE, PACT_FILE
if (existsSync(TARGET) && statSync(TARGET).isFile()) {
  GRAPH_FILE = TARGET; PACT_FILE = join(dirname(TARGET), 'PACT.md')
} else {
  GRAPH_FILE = join(TARGET, 'action-graph.json'); PACT_FILE = join(TARGET, 'PACT.md')
}
if (!existsSync(GRAPH_FILE)) { console.error(`[FAIL] 找不到执行图谱: ${GRAPH_FILE}（/pact-new 收尾时生成）`); process.exit(1) }

const say = (...m) => { if (!QUIET && !JSON_OUT && MODE === 'summary') console.log(...m) }
let FAILS = 0
const fail = m => { FAILS++; console.error(`  [FAIL] ${m}`) }

// ── 解析 ────────────────────────────────────────────────────────────────────
let g
try { g = JSON.parse(readFileSync(GRAPH_FILE, 'utf8')) }
catch (e) { console.error(`[FAIL] action-graph.json 不是合法 JSON：${e.message}`); process.exit(1) }
if (g.version !== 1) fail(`version 应为 1，实际 ${g.version}`)
if (!Array.isArray(g.nodes) || !g.nodes.length) { fail('nodes 缺失或为空'); console.error('══ 结果: FAIL ══'); process.exit(1) }

const byId = new Map()
for (const n of g.nodes) {
  if (!n.id || typeof n.id !== 'string') { fail(`存在无 id 的节点: ${JSON.stringify(n).slice(0, 60)}`); continue }
  if (byId.has(n.id)) fail(`id 重复: ${n.id}`)
  byId.set(n.id, n)
}

// ── 结构校验 ────────────────────────────────────────────────────────────────
const KINDS = ['module', 'feature', 'step']
const IMPL_ST = ['todo', 'doing', 'done', 'blocked']
const TEST_ST = ['todo', 'pass', 'fail', 'na']
for (const n of byId.values()) {
  if (!KINDS.includes(n.kind)) fail(`${n.id}: kind 非法「${n.kind}」（只许 module/feature/step）`)
  if (!n.title) fail(`${n.id}: 缺 title`)
  if (n.kind === 'module' && n.parent) fail(`${n.id}: module 不应有 parent`)
  if (n.kind !== 'module') {
    const p = byId.get(n.parent)
    if (!p) fail(`${n.id}: parent「${n.parent}」不存在`)
    else if (n.kind === 'feature' && p.kind !== 'module') fail(`${n.id}: feature 的 parent 必须是 module`)
    else if (n.kind === 'step' && p.kind !== 'feature') fail(`${n.id}: step 的 parent 必须是 feature`)
  }
  for (const d of n.deps || []) {
    if (!byId.has(d)) fail(`${n.id}: deps 指向不存在的节点「${d}」`)
    if (d === n.id) fail(`${n.id}: deps 指向自己`)
  }
  for (const r of n.rids || []) if (!/^R\d{3}$/.test(r)) fail(`${n.id}: rids 含非法 R-ID「${r}」`)
  if (n.kind === 'step') {
    if (!n.impl || !IMPL_ST.includes(n.impl.status)) fail(`${n.id}: impl.status 非法「${n.impl?.status}」（只许 ${IMPL_ST.join('/')}）`)
    if (!n.test || !TEST_ST.includes(n.test.status)) fail(`${n.id}: test.status 非法「${n.test?.status}」（只许 ${TEST_ST.join('/')}）`)
    if (n.impl?.status === 'done' && !(n.impl.evidence || []).length)
      fail(`${n.id}: impl 标 done 但 evidence 为空——必须给 file:line，否则就是虚报`)
    if ((n.test?.status === 'pass' || n.test?.status === 'na') && !(n.test.evidence || []).length)
      fail(`${n.id}: test 标 ${n.test.status} 但 evidence 为空——pass 给测试命令/名称，na 给理由`)
  } else if (n.impl || n.test) {
    fail(`${n.id}: 只有 step 携带 impl/test 状态（上层状态由子节点推导，存两份必然漂移）`)
  }
}

// ── DAG 校验（deps + parent 均不许成环）─────────────────────────────────────
{
  const color = new Map()
  const dfs = (id, stack) => {
    color.set(id, 1); stack.push(id)
    const n = byId.get(id)
    for (const d of (n?.deps || [])) {
      if (!byId.has(d)) continue
      if (color.get(d) === 1) { fail(`deps 成环: ${[...stack, d].join(' → ')}`); continue }
      if (!color.get(d)) dfs(d, stack)
    }
    stack.pop(); color.set(id, 2)
  }
  for (const id of byId.keys()) if (!color.get(id)) dfs(id, [])
}

// ── 与 PACT.md 的 P5 交叉校验 ───────────────────────────────────────────────
let specRids = null
if (existsSync(PACT_FILE)) {
  const src = readFileSync(PACT_FILE, 'utf8')
  const { reqs } = parsePact(PACT_FILE, src)
  specRids = new Set(reqs.keys())
  const graphRids = new Set()
  for (const n of byId.values()) for (const r of n.rids || []) graphRids.add(r)
  for (const r of graphRids) if (!specRids.has(r)) fail(`图谱引用了 P5 里不存在的 R-ID: ${r}（野生需求，或笔误）`)
  const stepRids = new Set()
  for (const n of byId.values()) if (n.kind === 'step') for (const r of n.rids || []) stepRids.add(r)
  for (const r of specRids) if (!stepRids.has(r)) fail(`P5 的 ${r} 没有任何 step 承接——图谱不完备，无法据此施工`)
} else {
  fail(`找不到同目录的 PACT.md（${PACT_FILE}），无法做 R-ID 交叉校验`)
}

if (FAILS) { console.error(`\n══ 结果: FAIL（${FAILS} 项结构问题）══`); process.exit(1) }

// ── 进度推导 ────────────────────────────────────────────────────────────────
const steps = [...byId.values()].filter(n => n.kind === 'step')
const stepDone = n => n.impl.status === 'done' && (n.test.status === 'pass' || n.test.status === 'na')
const children = new Map()
for (const n of byId.values()) {
  if (n.parent) { if (!children.has(n.parent)) children.set(n.parent, []); children.get(n.parent).push(n) }
}
const descSteps = n => n.kind === 'step' ? [n] : (children.get(n.id) || []).flatMap(descSteps)
const nodeDone = n => { const ss = descSteps(n); return ss.length > 0 && ss.every(stepDone) }

const doneSteps = steps.filter(stepDone)
const pct = steps.length ? Math.floor(doneSteps.length * 100 / steps.length) : 0

// R-ID 完成集：该 R-ID 的全部承接 step 都完成
const ridSteps = new Map()
for (const s of steps) for (const r of s.rids || []) { if (!ridSteps.has(r)) ridSteps.set(r, []); ridSteps.get(r).push(s) }
const doneRids = [...ridSteps.entries()].filter(([, ss]) => ss.every(stepDone)).map(([r]) => r).sort()

// 可执行步骤：自身未完成、未 blocked，且全部直接 deps 已完成
const depOk = d => { const n = byId.get(d); return n.kind === 'step' ? stepDone(n) : nodeDone(n) }
const nextSteps = steps.filter(s => !stepDone(s) && s.impl.status !== 'blocked' && (s.deps || []).every(depOk))
const blocked = steps.filter(s => s.impl.status === 'blocked')

// ── 输出 ────────────────────────────────────────────────────────────────────
if (MODE === 'done-rids') { for (const r of doneRids) console.log(r); process.exit(0) }
if (MODE === 'next') {
  for (const s of nextSteps) {
    console.log(`${s.id}\t${(s.rids || []).join(',') || '-'}\t${s.impl.status}\t${s.title}`)
    // 已知坑随取活一并带出：否则每个接手的 agent 重踩一遍。
    // 以 # 开头，TSV 消费方按惯例跳过注释行即可。
    for (const p of s.pitfalls || []) console.log(`#\t⚠ ${p}`)
  }
  process.exit(0)
}
if (JSON_OUT) {
  console.log(JSON.stringify({
    steps: steps.length, done: doneSteps.length, pct,
    rids: ridSteps.size, doneRids, blocked: blocked.map(s => s.id),
    next: nextSteps.map(s => s.id),
  }, null, 2))
} else {
  say(`\n══ 执行图谱 · ${GRAPH_FILE} ══\n`)
  for (const m of [...byId.values()].filter(n => n.kind === 'module')) {
    const ms = descSteps(m); const md = ms.filter(stepDone).length
    say(`${nodeDone(m) ? '✅' : md ? '▶️ ' : '⬜'} ${m.id} ${m.title}（${md}/${ms.length}）`)
    for (const f of children.get(m.id) || []) {
      const fs = descSteps(f); const fd = fs.filter(stepDone).length
      say(`  ${nodeDone(f) ? '✅' : fd ? '▶️ ' : '⬜'} ${f.id} ${f.title} [${(f.rids || []).join(',')}]（${fd}/${fs.length}）`)
      for (const s of children.get(f.id) || []) {
        const mark = stepDone(s) ? '✅' : s.impl.status === 'blocked' ? '🚫' : s.impl.status === 'doing' ? '▶️ ' : '⬜'
        say(`    ${mark} ${s.id} ${s.title}  impl:${s.impl.status} test:${s.test.status}`)
      }
    }
  }
  say(`\n── 完成度 ──`)
  say(`  步骤: ${doneSteps.length}/${steps.length}（${pct}%）｜R-ID: ${doneRids.length}/${ridSteps.size}`)
  if (blocked.length) say(`  🚫 blocked: ${blocked.map(s => s.id).join(' ')}`)
  if (nextSteps.length && pct < 100)
    say(`  下一批可执行: ${nextSteps.slice(0, 8).map(s => s.id).join(' ')}${nextSteps.length > 8 ? ' …' : ''}`)
}

if (REQUIRE && pct < 100) {
  console.error(`\n══ 结果: FAIL —— 完成度 ${pct}% < 100%（--require-complete）══`)
  process.exit(1)
}
if (!JSON_OUT) say(`\n══ 结果: PASS ══`)
process.exit(0)
