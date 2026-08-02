#!/usr/bin/env node
// pact-estimate.mjs — 驱动因子分层法：从 PACT.md 算工期与成本
//
//   用法: node pact-estimate.mjs [PACT.md] [--rate=<物料目录>/rate-card.json] [--out=<物料目录>/estimate-calc.md]
//         [--card=peak|sustain] [--persons=1,2,3,4] [--json] [--quiet]
//
// 为什么要这个工具（见 references/effort-estimation.md §四点五）：
//   模块当量法有三层主观性相乘（复杂度分级 × 折算倍数 × 天数），任一层偏 30% 结果偏 2 倍。
//   本工具把分层做成**机器可判的规则**，只留一张费率表需要校准——
//   于是估算从「拍脑袋」变成**任何人跑一遍都得同一个数的算术**。
//
// 分层规则（自上而下匹配，全部来自 PACT 已有数据，不含主观打分）：
//   T3 地基攻坚  传递扇入 ≥ fanInT3 ／ 承载 C3 不变量 ／ 集成与交换组 ／ 类型=权限 ／ 离线冲突
//   T2 中等      ★强制项 ／ 依赖数 ≥2 ／ 传递扇入 ≥ fanInT2
//   T1 常规      其余
//
// **费率绑执行者，不是项目属性。** 换人必须重标整张表。
//
// 退出码：0=成功 1=失败（含缺 T1 验收导致的「无法估算」） 2=用法错误

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parsePact } from './pact-parse.mjs'

// ── 参数 ────────────────────────────────────────────────────────────────────
// RATE / OUT 默认跟随真源所在物料目录（.pact/<slug>/）
let FILE = 'PACT.md', RATE = '', OUT = ''
let CARD = 'sustain', PERSONS = [1, 2, 3, 4], JSON_OUT = 0, QUIET = 0
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--rate=')) RATE = a.slice(7)
  else if (a.startsWith('--out=')) OUT = a.slice(6)
  else if (a.startsWith('--card=')) CARD = a.slice(7)
  else if (a.startsWith('--persons=')) PERSONS = a.slice(10).split(',').map(Number).filter(n => n > 0)
  else if (a === '--json') JSON_OUT = 1
  else if (a === '--quiet') QUIET = 1
  else if (a === '-h' || a === '--help') {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 21).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0)
  } else if (a.startsWith('-')) { console.error(`未知参数: ${a}`); process.exit(2) }
  else FILE = a
}
const say = (...m) => { if (!QUIET && !JSON_OUT) console.log(...m) }
if (!RATE) RATE = `${dirname(FILE)}/rate-card.json`
if (!OUT) OUT = `${dirname(FILE)}/estimate-calc.md`
if (!existsSync(FILE)) { console.error(`[FAIL] 找不到文件: ${FILE}`); process.exit(1) }

// ── 默认费率卡（**必须按本地实测覆盖**）────────────────────────────────────
const DEFAULT_CARD = {
  _说明: '费率绑执行者，换人必须重标。峰值卡禁止用于对外承诺；排期用可持续卡。',
  _来源: '占位默认值（未经本地实测）—— 用前请改成你自己的数，并把本字段改为「本地实测(N 个项目)」',
  peak:    { T1: 20, T2: 8, T3: 2 },
  sustain: { T1: 15, T2: 6, T3: 1.5 },
  stage1: [2, 3],            // 需求→PACT→原型（常数）
  stage2: [3, 5],            // 骨架生成（常数，复杂系统取上限）
  changeBudget: 0.25,        // 变更预算
  blockBuffer: 2.0,          // 阻塞缓冲（六类阻塞源全存在则取上限 2）
  dayRate: 800,              // 元/人天
  fanInT3: 50, fanInT2: 10,  // 分层阈值
  // ②类未知业务约束风险系数（effort-estimation.md §一）：现场才发现的隐藏规矩，不可压缩。
  // 判据：物料目录 source-merge.md 里「实测有、文档无」的条目数越多，本行业没写下来的规矩越密。
  // 阶段3 × (1 + risk2)。0 = 已完全摸清（罕见）；0.15 中；0.3 高（陌生行业/严监管）。
  risk2: 0.15,
  // 分层正则（可覆盖）。组名规则只对「整组确实都难」的分组用；权限与地基逐条判更准。
  groupT3: '集成|交换|网闸|不变量|账务口径',
  descT3: '唯一入口|幂等|审计链|hash\\s*链|账实对账|数据范围裁定|离线',
  negate: '预留|不对接|本期不|暂不|仅.{0,4}声明|mock',
  workdaysPerMonth: 21,
}
let card = DEFAULT_CARD
if (existsSync(RATE)) {
  try { card = { ...DEFAULT_CARD, ...JSON.parse(readFileSync(RATE, 'utf8')) } }
  catch (e) { console.error(`[FAIL] 费率卡解析失败 ${RATE}: ${e.message}`); process.exit(1) }
}
const rates = card[CARD]
if (!rates) { console.error(`[FAIL] 费率卡里没有 "${CARD}"，可选: ${Object.keys(card).filter(k => card[k]?.T1).join('/')}`); process.exit(2) }

// ── 解析 + 分层 ─────────────────────────────────────────────────────────────
const P = parsePact(FILE, readFileSync(FILE, 'utf8'))
const reqs = [...P.reqs.values()]
if (!reqs.length) { console.error('[FAIL] P5 里没解析到任何 R-ID'); process.exit(1) }

// S1 停止条件：缺 T1 验收就不许出数字（effort-estimation.md §六 S1）
const noAccept = reqs.filter(r => !r.t1method)
if (noAccept.length) {
  console.error('══ 结果: 无法估算 ══')
  console.error(`   ${noAccept.length} 条 R-ID 在 T1 没有验收标准，按 effort-estimation.md §六 S1 必须停止估算。`)
  console.error(`   给数字比说不知道更有害——它会被当成承诺。缺验收的条目：`)
  console.error('   ' + noAccept.map(r => r.id).join('、'))
  process.exit(1)
}

// 传递扇入：改这一条会波及多少条需求
const rev = new Map(reqs.map(r => [r.id, []]))
for (const r of reqs) for (const d of r.deps) if (rev.has(d)) rev.get(d).push(r.id)
const fanInCache = new Map()
function fanIn(id) {
  if (fanInCache.has(id)) return fanInCache.get(id)
  const seen = new Set(); const st = [...(rev.get(id) || [])]
  while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); st.push(...(rev.get(x) || [])) }
  fanInCache.set(id, seen.size); return seen.size
}
// 分层判定：**结构化信号优先，正文正则兜底**。
// 早期版本对「描述+验收+组名」全文跑正则，产生两类误判：
//   · 否定语境——「预留接口，本期**不**对接硬件」命中「对接」
//   · 验收串扰——报表类需求的验收写「与出库流水对账一致」命中「对账」
// 现在：只扫描**描述**（不扫验收），先排除否定语境，并优先用作者显式分的「组名」。
// 组名规则只对「整组确实都难」的分组生效。早期把「权限」「地基」也纳入，
// 结果把「组 1 平台基础与权限」整组 12 条（含口令登录这种简单项）全拉进 T3——太粗。
// 权限类由 type=权限 逐条判，地基类由传递扇入逐条判，都比组名精确。
const NEG_RE   = new RegExp(card.negate  || '预留|不对接|本期不|暂不|仅.{0,4}声明|mock')
const GROUP_RE = new RegExp(card.groupT3 || '集成|交换|网闸|不变量|账务口径')
const DESC_RE  = new RegExp(card.descT3  || '唯一入口|幂等|审计链|hash\\s*链|账实对账|数据范围裁定|离线')
function tierOf(r) {
  const fi = fanIn(r.id)
  const desc = P.plain(r.desc)
  const group = P.plain(r.group)
  // ── T3：结构化信号 ──
  if (fi >= card.fanInT3) return ['T3', `传递扇入 ${fi}`]
  if (r.type.includes('权限')) return ['T3', '类型=权限']
  if (GROUP_RE.test(group)) return ['T3', `所属组「${group.slice(0, 18)}」`]
  // ── T3：描述正则（排除否定语境；不扫验收，避免串扰）──
  if (!NEG_RE.test(desc) && DESC_RE.test(desc)) return ['T3', `描述含「${desc.match(DESC_RE)[0]}」`]
  // ── T2 ──
  if (r.star) return ['T2', '★强制项']
  if (r.deps.length >= 2) return ['T2', `依赖 ${r.deps.length} 条`]
  if (fi >= card.fanInT2) return ['T2', `传递扇入 ${fi}`]
  return ['T1', '']
}
const why = new Map()
const tier = new Map(reqs.map(r => { const [t, w] = tierOf(r); why.set(r.id, w); return [r.id, t] }))
const N = { T1: 0, T2: 0, T3: 0 }
for (const t of tier.values()) N[t]++

// ── 测算 ────────────────────────────────────────────────────────────────────
const days = { T1: N.T1 / rates.T1, T2: N.T2 / rates.T2, T3: N.T3 / rates.T3 }
const stage3base = days.T1 + days.T2 + days.T3
const risk2 = card.risk2 ?? 0.15
const stage3 = stage3base * (1 + risk2)
const dev = card.stage1.map((s1, i) => (s1 + card.stage2[i] + stage3) * (1 + card.changeBudget))
const deliver = dev.map(d => d * card.blockBuffer)
const cost = dev.map(d => d * card.dayRate)
const M = card.workdaysPerMonth

// 并发：串行头 = 阶段1+2 + T3 中扇入最高的那批（公共地基，不可并行）
const foundation = reqs.filter(r => tier.get(r.id) === 'T3' && fanIn(r.id) >= card.fanInT3)
const serial = card.stage1.map((s1, i) => s1 + card.stage2[i] + foundation.length / rates.T3)
const concurrency = PERSONS.map(n => {
  const span = dev.map((d, i) => serial[i] + (d - serial[i]) / n)
  const dl = span.map((sp, i) => sp + dev[i] * (card.blockBuffer - 1))
  return { n, span, deliver: dl, months: dl.map(x => x / M), cost: dev.map(d => d * card.dayRate * (1 + 0.03 * (n - 1))) }
})
const base = concurrency[0]?.deliver || deliver

const fmt = (a, d = 0) => `${a[0].toFixed(d)}–${a[1].toFixed(d)}`
const result = {
  file: FILE, card: CARD, rates, counts: N, total: reqs.length,
  stage3base, risk2, stage3, dev, deliver, cost, months: deliver.map(x => x / M),
  tierDays: days,
  tierShare: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, v / stage3])),
  foundation: foundation.map(r => r.id),
  t3: reqs.filter(r => tier.get(r.id) === 'T3').map(r => r.id),
  t3why: Object.fromEntries(reqs.filter(r => tier.get(r.id) === 'T3').map(r => [r.id, why.get(r.id)])),
  concurrency,
  rateSource: card._来源 || '未标注',
}
if (JSON_OUT) { console.log(JSON.stringify(result, null, 1)); process.exit(0) }

// ── 输出 ────────────────────────────────────────────────────────────────────
say(`══ 驱动因子分层法 · ${FILE} · 费率卡「${CARD}」══\n`)
say(`  分层（规则机器可判）  T1 ${N.T1} · T2 ${N.T2} · T3 ${N.T3}   合计 ${reqs.length} 条`)
say(`  费率(条/天)          T1 ${rates.T1} · T2 ${rates.T2} · T3 ${rates.T3}`)
say('')
say('  层           条数    工期      占阶段3')
for (const k of ['T1', 'T2', 'T3']) {
  const bar = '█'.repeat(Math.round(result.tierShare[k] * 30))
  say(`  ${k} ${String(N[k]).padStart(9)} ${days[k].toFixed(1).padStart(8)} 天 ${(result.tierShare[k] * 100).toFixed(1).padStart(7)}%  ${bar}`)
}
say(`\n  阶段3 ${stage3base.toFixed(1)} 天 × (1+${risk2} ②类风险) = ${stage3.toFixed(1)} 天`)
say(`  开发工作量 ${fmt(dev, 1)} 人天 ｜ 交付周期 ${fmt(deliver)} 天 ≈ ${fmt(deliver.map(x => x / M), 1)} 个月`)
say(`  开发时间成本 ${fmt(cost.map(c => c / 10000), 1)} 万元（${card.dayRate} 元/人天，不含实施硬件运维）`)
say('')
say('  并发（阻塞项不随人数减少）')
for (const c of concurrency) {
  const cut = c.n === 1 ? '—' : `${((1 - c.deliver[0] / base[0]) * 100).toFixed(0)}%`
  say(`    ${c.n} 人  跨度 ${fmt(c.span)} 天 ｜ 交付 ${fmt(c.deliver)} 天 ≈ ${fmt(c.months, 1)} 月 ｜ 压缩 ${cut}`)
}
say('')
if (result.tierShare.T3 > 0.5) {
  say(`  ⚠ T3 占条数 ${(N.T3 / reqs.length * 100).toFixed(0)}% 却吃掉 ${(result.tierShare.T3 * 100).toFixed(0)}% 工期。`)
  say(`     要压工期只能减 T3（砍集成方/离线/调拨），砍 T1 的 CRUD 几乎没用。`)
}
if (N.T3 / reqs.length > 0.30) say(`  ⚠ T3 占比 ${(N.T3 / reqs.length * 100).toFixed(0)}% 偏高——复核分层规则是否太松，或该项目确实以集成为主。`)
if (N.T3 / reqs.length < 0.10) say(`  ⚠ T3 占比 ${(N.T3 / reqs.length * 100).toFixed(0)}% 偏低——可能漏判了权限与账务类，请人眼复核 T3 清单。`)
say(`  ⚠ 费率来源：${result.rateSource}`)
say(`     费率绑执行者，换人必须重标整张表。对外只承诺「交付周期」，不报净开发时间。`)

// ── 落盘 ────────────────────────────────────────────────────────────────────
const md = [
  `# 工期测算（驱动因子分层法 · 机器生成）`, '',
  `> 由 \`pact-estimate.sh\` 从 \`${FILE}\` 生成，请勿手改——改费率请改 \`${RATE}\`，改需求请改 \`${FILE}\`。`,
  `> 方法见 \`references/effort-estimation.md\` §四点五。**本文是算术结果，不是承诺**；`,
  `> 对外承诺请用同目录 \`estimate.md\` 的完整格式（含前提、假设、阻塞源、停工线）。`, '',
  `## 分层`, '',
  `| 层 | 条数 | 条数占比 | 费率(条/天) | 工期(天) | **占阶段3** |`,
  `|---|---|---|---|---|---|`,
  ...['T1', 'T2', 'T3'].map(k =>
    `| ${k} | ${N[k]} | ${(N[k] / reqs.length * 100).toFixed(0)}% | ${rates[k]} | ${days[k].toFixed(1)} | **${(result.tierShare[k] * 100).toFixed(1)}%** |`),
  `| 合计 | ${reqs.length} | 100% | — | ${stage3.toFixed(1)} | 100% |`, '',
  `**T3 清单**（${N.T3} 条，须人眼复核「这条真的比一个 CRUD 难十倍吗」）：`, '',
  '| R-ID | 判定理由 |', '|---|---|',
  ...result.t3.map(id => `| \`${id}\` | ${why.get(id)} |`), '',
  `## 工期与成本`, '',
  `| 项 | 值 |`, `|---|---|`,
  `| 阶段1 需求→PACT→原型 | ${card.stage1.join('–')} 天（常数） |`,
  `| 阶段2 骨架生成 | ${card.stage2.join('–')} 天（常数） |`,
  `| 阶段3（分层）| ${stage3base.toFixed(1)} 天 |`,
  `| ②类未知业务约束风险 | ×(1+${risk2}) |`,
  `| 阶段3（含风险）| **${stage3.toFixed(1)} 天** |`,
  `| 变更预算 | +${(card.changeBudget * 100).toFixed(0)}% |`,
  `| **开发工作量** | **${fmt(dev, 1)} 人天** |`,
  `| 阻塞缓冲 | ×${card.blockBuffer} |`,
  `| **交付周期** | **${fmt(deliver)} 天 ≈ ${fmt(deliver.map(x => x / M), 1)} 个月** ← 对外只承诺这行 |`,
  `| 开发时间成本 | ${fmt(cost.map(c => c / 10000), 1)} 万元（${card.dayRate} 元/人天） |`, '',
  `## 并发`, '',
  `| 人数 | 开发跨度(天) | 交付周期(天) | ≈月 | 较单人压缩 |`, `|---|---|---|---|---|`,
  ...concurrency.map(c => `| ${c.n} | ${fmt(c.span)} | ${fmt(c.deliver)} | ${fmt(c.months, 1)} | ${c.n === 1 ? '—' : ((1 - c.deliver[0] / base[0]) * 100).toFixed(0) + '%'} |`),
  '',
  `> 阻塞等待不随人数减少；串行头（阶段1+2 + ${foundation.length} 条公共地基）不可并行。`, '',
  `## 口径声明`, '',
  `- 费率卡：\`${CARD}\`（T1 ${rates.T1} · T2 ${rates.T2} · T3 ${rates.T3} 条/天）`,
  `- **费率来源：${result.rateSource}**`,
  `- **费率绑执行者，换人必须重标整张表**（工具平权，经验不平权）`,
  `- 峰值卡禁止用于对外承诺；排期与报价用可持续卡`,
  `- 成本 = 纯开发量 × 单价；实施/测试/驻场与阻塞等待期不计入`,
].join('\n') + '\n'
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, md)
say(`\n  已写入 ${OUT}`)
process.exit(0)
