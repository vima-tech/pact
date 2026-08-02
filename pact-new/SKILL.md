---
name: pact-new
description: >
  创建 PACT 物料包。无论是初建项目还是存量项目上的大需求，都用它：
  访谈补白 → （多来源熔合）→ （存量八维评估）→ 写四层规格 P/A/C/T → 完备性门（lint + 反扫 + 零知识冷读门）
  → 冻结 → 生成知识库（HTML 给人 + md 给 AI）与 action-graph.json 执行图谱。
  产物落在 .pact/<slug>/ —— 一个大需求一个物料目录，单项目可并存多份。
  只造物料，不写业务代码；施工用 /pact-run，完成度审查用 /pact-review，物料体检用 /pact-check。
  触发词：pact-new、新项目开局、大需求设计、写 PRD/SDD/SPEC、完备规格、技术方案设计、需求冻结。
argument-hint: "[<简报文本 | 既有文档路径...>] [--level=full|feature] [--review] [--help]"
---

# /pact-new — 创建 pact 物料包（S0–S9）

> 创建日期: 2026-08-02

**职责边界：只造物料，不写一行业务代码。** 你要在 `.pact/<slug>/` 下产出一套完整的 pact 物料，
让 `/pact-run` 可以只凭这套物料施工、`/pact-review` 可以只凭它判定完成度。

核心协议（四层锚点、机检、禁令、问人规则）在**核心 skill `pact`** 里，共享资源也在那里：

```bash
CORE="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
```

若 `$ARGUMENTS` 含 `--help`：只输出 `bash $CORE/scripts/pact-help.sh` 的内容然后停止，不进任何工序。

## 产出清单（一个物料目录 = 一套完整交付）

```
.pact/<slug>/
  PACT.md            # 【真源】单文件完备规格（四层 P/A/C/T，30 锚点）
  board.md           # ★ 工序状态表（断点续跑第一真相源）
  interview.md       # S1 访谈门记录
  source-merge.md    # S2 熔合门（有 ≥2 份来源时）
  assessment.md      # S3 存量八维评估（有实质代码时）
  estimate.md        # S7 估算门（需报价/排期时）
  cold-read.md       # S8 冷读门报告
  changelog.md       # S9 冻结后的变更记录
  action-graph.json  # ★ AI 执行图谱：模块→功能点→步骤 DAG（S9 生成，/pact-run 的施工依据）
  pact-book/         # 【生成物】S8 生成：pact-book.html 给人查阅（双击即开），src/**.md 给 AI 施工
  docs/              # 归位后的既有输入物料（若有）
```

项目根只放 `CLAUDE.md`（从 `$CORE/templates/CLAUDE.md` 起步，讲「怎么写代码」）与 `README.md`。
**`PACT.md` 不放项目根**——多份大需求各有各的物料目录。

### slug 与 R-ID 起号（多 pact 并存的两条规矩）

1. **slug**：kebab-case 短名，一眼能看出管什么（如 `user-auth`、`export-center`；初建项目可用项目名）。
   已存在同名目录 → 问用户是续写还是另起名字。
2. **R-ID 号段全项目唯一**：新物料的 R-ID 从「全部既有物料的最大号 +1」起，
   `grep -hoE '\bR[0-9]{3}\b' .pact/*/PACT.md 2>/dev/null | sort | tail -1`。
   不同 pact 不共用号，`pact-trace.sh` 才能跨物料判定野生 R-ID。D-ID / INV 同理。

## 执行协议（硬性）

1. **十道工序逐道收敛，禁止跳步**：
   `S0 定位摄入 → S1 访谈门 → [S2 熔合门] → [S3 存量评估] → S4 写P → S5 写A → S6 写C → S7 写T → S8 完备性门 → S9 冻结`。
   条件工序不适用时必须在 `board.md` 标 `已跳过（理由）`，静默略过 = 违反协议。
   **每道工序开工前读 `$CORE/references/agent-protocol.md` 里对应那张工序卡**（动作清单 / 退出判定 / 常见偷懒模式）。
2. **每轮三件事**（上下文会被压缩，你的记忆不可信）：开工先读 `board.md`；只做当前一道工序；收工必写 `board.md`。
3. **断点续跑**：接手时按序读 `board.md` → `PACT.md` 头部 → `bash $CORE/scripts/pact-status.sh <物料目录>` → `git status`，
   不重新访谈、不重写已冻结的规格。若项目里已有多份物料且用户没指明，先 `AskUserQuestion` 问清是续写哪份还是新开。
4. **禁令**（核心 skill 协议 D 的写作侧子集，全文见 `$CORE/SKILL.md`）：
   禁止跳过工序 · 禁止 board 未更新进下道 · 禁止自行裁定多来源分歧（矛盾类必须 `AskUserQuestion`）·
   禁止状态只留在对话里 · 禁止冻结后改规格不记 changelog · 禁止用「大致/应该/后续再定」搪塞 C 层 ·
   禁止不走估算门就给工期报价数字 · **禁止过度设计**（每条设计必须能反查到 R-ID；约束别扩面、抽象别提前、字段别镀金）·
   禁止手改 `pact-book/` 生成物。
5. **什么时候问人**：只在「猜错的代价 > 一次往返」时阻塞提问（批量 `AskUserQuestion`，每问 2–4 候选含推荐项，
   narration 写 `needs input:`）；能合理假设的取默认并标 `假设：<值>（未经确认）` 继续。
6. `--review` 模式：每道闸门后暂停等用户确认；默认不停但产物始终落盘。
7. `--level`：`full`=初建项目（30 锚点全填）；`feature`=大需求（核心 16 锚点必填，其余 `N/A（理由）`）。
   默认按有无实质代码推断，并写进 `PACT.md` 头部「完备度档位」。

## 工序要点（细则以工序卡为准）

- **S0 定位与摄入**：探测项目现状（有无实质代码 / 有无既有 `.pact/*/` 物料 / `$ARGUMENTS` 是简报还是文档路径），
  开场一句话说明判定；建 `.pact/<slug>/`，从 `$CORE/templates/` 拷 `PACT.md`、`board.md`；填真实创建日期；
  既有输入文档归位到 `<物料目录>/docs/`（**先 grep 查引用 → 移动 → 改引用 → 跑构建/测试验证**，四步不能省）。
- **S1 访谈门**：`templates/interview.md` 十二类逐项过（交付形态/用户角色/核心场景/规模性能/数据持久化/
  集成依赖/权限合规/**非目标**/成功定义/约束/视觉交互/既有资产）。阻塞项批量问，可假设项标注后继续。
- **S2 熔合门**（≥2 份来源时必做）：差异按 矛盾/细化/缺漏/越界 分类逐条裁定，矛盾类必须用户裁定；
  每条非平凡裁定落 `A5` 的 D-ID（含已否决）。
- **S3 存量评估**（有实质代码时必做，只读不改码）：八维评估给 `file:line` 证据；结论回流 PACT
  （约束→`P7`、结构→`A2`、P0→`T5` 的 M0）。
- **S4–S7 写四层**：精度标准见 `$CORE/references/authoring-guide.md`，范例见 `references/example-PACT.md`。
  S7 内含**估算门**：要报价/排期时必走 `$CORE/references/effort-estimation.md` + `scripts/pact-estimate.sh`，
  禁止拍脑袋数字；纯内部项目在 board 标「已跳过（理由）」。
- **S8 完备性门**（硬闸门，四道全过才准冻结）：
  ```bash
  bash $CORE/scripts/pact-check.sh <物料目录>        # 机检合集：status + lint + ★ 一致性 + book --check
  ```
  ① lint exit 0；② 拿全部输入物料**反扫** PACT 找遗漏；③ **零知识冷读门**——`Agent` 工具另起全新 agent
  只读 `PACT.md`（prompt 见 `$CORE/templates/cold-read.md`），追问清单为空才 PASS，跑到 PASS 为止；
  ④ `bash $CORE/scripts/pact-book.sh <物料目录>` 生成知识库且 `--check` 无漂移。
- **S9 冻结 + 生成执行图谱**：
  1. `PACT.md` 头部标 `状态: 已冻结 · <日期>`；建 `changelog.md`。
  2. **生成 `action-graph.json`**（从 `$CORE/templates/action-graph.json` 起步）：
     - `module` 节点 ← `A2` 的模块划分；
     - `feature` 节点 ← 按功能点聚簇 `P5` 的 R-ID（挂 `rids`），归属对应 module；
     - `step` 节点 ← 每个 feature 拆成可执行步骤（建表/接口/页面/校验/联调……），引用 C 层锚点写清做什么；
       初始 `impl`/`test` 全部 `todo`；
     - `deps` ← 按 `T5` 里程碑顺序与真实技术依赖连边（M0 的 P0 修复在最前），构成 DAG；
     - **P5 的每个 R-ID 必须被至少一个 step 承接**——这是图谱完备性的底线。
  3. 机检：`bash $CORE/scripts/pact-graph.sh <物料目录>` 必须 PASS（结构合法、无环、R-ID 全承接）。

## 完成标准与收尾输出

`pact-check.sh <物料目录>` exit 0 · 冷读门 PASS · `pact-graph.sh` PASS · board 的 S0–S9 全部 `已完成/已跳过（理由）`。

收尾时告诉用户：物料位置、`pact-book.html` 可双击查看、下一步用 `/pact-run <物料目录>` 施工、
`result:` 一行总结。**不要自作主张开始施工。**
