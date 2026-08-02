---
name: pact
description: >
  PACT = Product · Architecture · Contracts · Tests。核心 skill：总览、路由与共享资源
  （脚本 / 模板 / 工序卡）。实际工作由七个命令承担——/pact-new 创建 pact 物料包
  （单文件完备规格 PACT.md + 知识库 HTML/md + action-graph.json 执行图谱，落 .pact/<slug>/，
  单项目可并存多份）；/pact-run 按物料施工到完成度 100% 才停；/pact-review 审查实现完成度；
  /pact-check 体检物料完备性与遗漏点；/pact-change 需求变更入口（S10-CR）；
  /pact-list 多物料总览；/pact-estimate 工期/报价估算门。
  用户说 /pact 或问 PACT 怎么用 → 输出使用速览并按现场状态建议该用哪个命令，不执行任何工序。
  触发词：pact、PACT 文档、完备规格、pact 怎么用。
argument-hint: "[--help]"
---

# PACT — 单文件完备规格 + 强制工序协议（核心）

> 创建日期: 2026-07-26 ｜ 更新日期: 2026-08-02

**PACT 既是一种文档体裁，也是一条不许跳步的流水线。** 它的验收标准只有一条，且必须被真实检验：

> 一个对本项目**一无所知**的人或 AI，**只读这一份 `PACT.md`**即可开始编码，
> 且不需要追问背景、不需要猜测意图、不会遗漏约束。

**纪律高于速度**：不问清不开写，不冻结不施工，不过冷读门不算完备，不过机检不算完工。

## /pact 被调用时的行为（本 skill 自己只做这一件事）

1. 输出使用速览：`bash <SKILL_DIR>/scripts/pact-help.sh`（脚本不可用时读 `references/help.md` 原样呈现）。
2. 探测现场并给一句建议：
   - 无 `.pact/*/PACT.md` → 建议 `/pact-new <你的需求>`（旧版布局则给 `pact-migrate.sh` 迁移提示）；
   - 有多份物料 → 建议先 `/pact-list` 看总览；
   - 有且未冻结 → 建议 `/pact-new` 续写（读该物料 `board.md` 报当前工序）；
   - 有且已冻结未完工 → 建议 `/pact-run`；
   - 用户在问「写够了吗 / 做完了吗 / 要改需求 / 多久能做完」→ 分别指
     `/pact-check` / `/pact-review` / `/pact-change` / `/pact-estimate`。
3. **停止。不建目录、不写文件、不进任何工序。**

## 七个命令（工作都在它们里）

| 命令 | 干什么 | 工序 | 停止条件 |
|---|---|---|---|
| `/pact-new` | 创建物料包：访谈→（熔合）→（存量评估）→写四层→完备门→冻结→生成知识库+执行图谱 | S0–S9 | 物料齐备且机检+冷读门全过 |
| `/pact-run` | 按物料施工：图谱取活→实现(@pact 标注)→验收→回写图谱 | S10–S11 | **`pact-review.sh` exit 0（100%）** |
| `/pact-review` | 审查实现完成度：五道机检聚合 + 抽查核验，出完成度与缺口清单 | 只读 | 单次 |
| `/pact-check` | 体检物料质量：机检 + 物料反扫 + 零知识冷读门，出问题与遗漏清单 | 只读 | 单次 |
| `/pact-change` | 需求变更入口（S10-CR）：回 P5 立 R-ID → 补验收 → 改契约 → changelog → 同步图谱 → 判断重跑冷读门 | 变更协议 | 六步走完 + 影响面报告 |
| `/pact-list` | 项目内全部物料总览：状态/工序进度/完成度/一句话定义 + 下一步建议 | 只读 | 单次 |
| `/pact-estimate` | 估算门独立入口：四前提核对 + 分层测算 + 三条线（对外只承诺交付线） | 只读+落 estimate.md | 单次 |

旧版单命令模式的对应关系：`--new`/`--feature`/`--merge` → `/pact-new`（模式自动判定）；
`--build` → `/pact-run`；`--audit` → `/pact-check`。
旧版布局（根 `PACT.md` + 扁平 `.pact/`）→ `bash scripts/pact-migrate.sh . --slug=<名字>` 迁移。

## 与相邻体裁的边界

| 体裁 | 它回答 | PACT 的不同 |
|---|---|---|
| `CLAUDE.md` | **怎么写代码**（偏好与惯例） | PACT 回答**写什么、为什么、做到什么算完成** |
| PRD | 要什么 | PACT 必须再给出可执行的接口、表结构、状态机 |
| SDD | 怎么设计（假设读者已知业务背景） | PACT **不做此假设**，且显式记录**决策理由**与**已否决方案** |
| SPEC | 通常只覆盖接口 | PACT 同时承载动机、约束与验收 |

> 推论：凡是「懂行的人自然知道」的东西，PACT 里**必须写出来**。

## 四层（缺一层即不成立）

| 层 | 内容 | 锚点 |
|---|---|---|
| **P**roduct | 背景、用户、场景、需求(R-ID)、非目标、约束、成功定义 | `P1–P8` |
| **A**rchitecture | 结构、模块职责、设计原则、**带理由的决策与已否决方案** | `A1–A6` |
| **C**ontracts | 数据模型、接口、状态机、配置、权限、观测、prompt 契约 | `C1–C11` |
| **T**ests | 验收清单、指标、停工线、交付前置、施工范围 | `T1–T5` |

**两件事不可变**：① 每个必备条目上方带机器锚点 `<!-- PACT:C4 -->`（lint 靠它）；
② 文档头部有「四层 → 本文位置」映射表（人靠它）。

---

# 物料结构（多 pact 并存）

**一个大需求 = 一个物料目录 `.pact/<slug>/`。** 初建项目与后续每个大需求各建一份，互不覆盖。

```
<project>/
  CLAUDE.md          # 【必须】怎么写代码：惯例、门禁、目录导览（templates/CLAUDE.md 起步）
  README.md          # 入口：一句话 + 怎么跑 + 指向 .pact/
  .pact/
    <slug>/          # ★ 一个 pact 物料包（/pact-new 产出，/pact-run 消费）
      PACT.md            # 【真源】单文件完备规格。冻结后改动须走 changelog.md
      board.md           # ★ 工序状态表（断点续跑第一真相源）
      interview.md source-merge.md assessment.md estimate.md   # S1/S2/S3/S7 闸门记录
      cold-read.md changelog.md                                # S8/S9 执行态
      action-graph.json  # ★ AI 执行图谱：module→feature→step DAG，每 step 带 impl/test 状态与证据
      pact-book/         # 【生成物·勿手改】pact-book.html 给人（双击即开），src/**.md 给 AI 施工
      docs/              # 归位后的既有输入物料（若有）
      baseline/          # 设计基准截图（有 UI 时）
```

**分工铁律**：
- `PACT.md` = 冻结的规格（做什么、为什么、算完成），自足，不外链也看得懂；
- `action-graph.json` = **施工执行态唯一真源**（做到哪了、测得怎样）——不另设覆盖表，两份执行态必然漂移；
- `pact-book/` = `PACT.md` 的生成视图，一个字不许手写，`--check` 抓漂移；
- **R-ID / D-ID 号段全项目唯一**：新物料从既有最大号 +1 起，跨物料才可机检野生功能。

---

# 共享协议（全部命令都必须遵守）

## 协议 A：每轮三件事（防上下文压缩失忆）

对话上下文会被压缩，**你的记忆不可信，落盘的文件才可信**：
① 开工先读 `<物料目录>/board.md`（施工期加读 `pact-graph.sh` 进度）；② 只做当前一道工序；
③ 收工必写 `board.md`（施工期同步回写 `action-graph.json`）。**没更新 = 这一轮不算做完。**

## 协议 B：断点续跑

会话中断、上下文压缩、换 agent 接手时，唯一真相源按此顺序读：

```bash
cat .pact/<slug>/board.md                          # ① 我在第几道工序
head -30 .pact/<slug>/PACT.md                      # ② 是否已冻结
bash <SKILL_DIR>/scripts/pact-status.sh .pact/<slug>   # ③ 机检 + 下一道
git status                                         # ④ 有无未收尾改动
```

不重新访谈、不重写已冻结的规格、不重复已完成的工序。

## 协议 C：机检（自称完成不算数）

```bash
SKILL_DIR="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
# 各脚本未给物料目录时自动扫描 .pact/*/PACT.md；多份物料时 exit 3 列候选，须显式传目录

bash $SKILL_DIR/scripts/pact-status.sh  <物料目录>   # 工序：骨架 + 状态 + 顺序 + 下一道
bash $SKILL_DIR/scripts/pact-lint.sh    <物料目录>/PACT.md --level=<full|feature>  # 规格九项
bash $SKILL_DIR/scripts/pact-graph.sh   <物料目录>   # 图谱：结构 + 完成度 + 下一批可执行（--next / --require-complete）
bash $SKILL_DIR/scripts/pact-trace.sh   <物料目录>   # 落地：规格 ↔ 代码 @pact ↔ 图谱 三方比对（收尾 --require-complete）
bash $SKILL_DIR/scripts/pact-book.sh    <物料目录> --check   # 视图：知识库 ↔ 真源漂移
bash $SKILL_DIR/scripts/star-consistency.sh <物料目录>/PACT.md  # 有 ★ 时：P5↔T1 的 ★ 集合一致

# 两个聚合器（命令入口）：
bash $SKILL_DIR/scripts/pact-check.sh   <物料目录>   # /pact-check：物料质量（不看完成度）
bash $SKILL_DIR/scripts/pact-review.sh  <物料目录>   # /pact-review：完成度 100% 才 exit 0
```

| 脚本 | 抓什么 |
|---|---|
| `pact-status.sh` | 跳步、静默略过、冻结状态不一致 |
| `pact-lint.sh` | 锚点缺失、占位符、R-ID 无验收、决策无「已否决」 |
| `pact-graph.mjs` | 图谱结构非法、DAG 成环、R-ID 无 step 承接、done 无证据、完成度虚高 |
| `pact-trace.sh` | **虚报**（图谱说完成、代码无标注）、**野生功能**（代码标了任何规格都没有的 R-ID）、未实现 |
| `pact-book.sh --check` | 手改生成物、改了 PACT 忘重生成、孤儿文件 |
| `star-consistency.sh` | T1 的 ★ 与 P5 权威集合不一致（漏标/越权升级） |

**S8、S10 每轮、S11，以及任何打算说「完成了」的时候，机检必须真跑并贴结果。**

## 协议 D：十四条禁令

1. **禁止跳过工序。** 不适用的在 `board.md` 标 `已跳过（理由）`。
2. **禁止 `board.md` 未更新就进下一道工序。**
3. **禁止在 S8 未 PASS 时写业务代码。** 规格没冻结就施工 = 带病开工。
4. **禁止写没有 R-ID 的功能，也禁止写了不标注。** 每段业务代码带 `@pact R###` 注释，
   否则 `pact-trace.sh` 反查不到。中途加需求必走 S10-CR（含图谱同步）。
5. **禁止自行裁定多来源分歧。** 矛盾类必须 `AskUserQuestion`，不得"择优采用"。
6. **禁止把状态只留在对话里。** 一律落盘 `PACT.md` / 物料目录。
7. **禁止为通过测试而改宽断言。** 失败先查根因，这是 `T3` 停工线。
8. **禁止未跑机检就宣称完成**（协议 C）。
9. **禁止冻结后改规格却不记 `changelog.md`。** 规格漂移是最贵的债。
10. **禁止用「大致」「应该」「后续再定」搪塞 C 层。** 写不出来就回 S1 问清楚。
11. **禁止不走估算门就给工期或报价数字**（协议 E）。凭直觉的数字会被当成承诺。
12. **禁止用骨架完成线对外承诺。** 骨架只覆盖约 50%，缺的是最容易出事的那半。
13. **禁止过度设计——每条设计只解决它对应 R-ID 明写的需求，不多做一分。** 三条红线：
    **约束别扩面**（需求说「A 要隔离」别写成「A、B、C 都要」）；**抽象别提前**（YAGNI，
    只有一种实现时不引第二层抽象）；**字段/表别镀金**（R-ID 没要求的不加，想加先回 `P5` 立需求）。
    每条契约、每个图谱 step 都应能反查到 R-ID；反查不到 = 野生设计。
    过度设计比欠设计更隐蔽：它伪装成「更完备」，实则是未经授权的复杂度。
14. **禁止手改生成物**（`pact-book/`）。改内容改 `PACT.md` 再重新生成。

## 协议 E：估算门（S7 内执行）

**任何人问「多久能做完 / 工作量多大 / 报个价」，不许凭直觉给数字。**
按 `references/effort-estimation.md` 走：四个前提缺一不出数（交付形态/执行者经验/项目类型/②类占比）、
数模块不数功能点、输出骨架/开发完成/交付三条线（**对外只承诺交付线**，× 阻塞缓冲 1.5–2）、
停工线按可追溯性排序、`P5` 缺 `T1` 验收即拒绝估算。

```bash
bash $SKILL_DIR/scripts/pact-estimate.sh <物料目录>/PACT.md            # 可持续卡（默认）
bash $SKILL_DIR/scripts/pact-estimate.sh <物料目录>/PACT.md --card=peak  # 峰值卡，禁止用于承诺
```

> **PACT 写得好不是下调工期的理由**：规格从 60 分到 90 分，骨架覆盖率只从 50% 提到约 55%。
> PACT 消除的是方向性返工与验收扯皮，不是编码量。

## 协议 F：什么时候停下来问人

只在「猜错的代价 > 一次往返」时阻塞提问：S1 判 `阻塞` 的 OPEN-Q、S2 矛盾类分歧、
S10 无法合理假设的关键歧义、命中 `T3` 停工线。方式：**批量** `AskUserQuestion`
（每问 2–4 候选含推荐项），narration 写 `needs input:` 一行。其余取默认标 `假设` 继续。

---

# 本 skill 自带的资源

> `<SKILL_DIR>` = 本 SKILL.md 所在目录。执行脚本前先解析：
> ```bash
> SKILL_DIR="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
> ```

| 路径 | 用途 |
|---|---|
| `references/agent-protocol.md` | **★ 十二张工序卡**（S0–S11）：动作清单 · 退出判定 · 常见偷懒模式。每道工序开工前读对应卡 |
| `references/help.md` | 人类向使用速览（`/pact` 与各命令 `--help` 输出这份） |
| `references/authoring-guide.md` | 逐节「写到什么程度算够」+ 反例 |
| `references/example-PACT.md` | 通过全部机检的 feature 级完整范例 |
| `references/effort-estimation.md` | AI 辅助开发的工期与工作量评估法（S7 估算门） |
| `templates/PACT.md` | 30 锚点骨架，起手拷这个 |
| `templates/action-graph.json` | ★ 执行图谱骨架（节点/状态/依赖约定内嵌 `_doc`） |
| `templates/{board,interview,source-merge,assessment,cold-read,changelog,estimate,CLAUDE}.md` | 各工序模板 |
| `templates/rate-card.json` | 估算费率卡（拷到物料目录改成实测值） |
| `scripts/pact-resolve.sh` | 物料目录解析（被其他脚本 source；多物料时 exit 3 列候选） |
| `scripts/pact-status.sh` | 工序机检（零依赖） |
| `scripts/pact-lint.sh` | 规格机检九项（零依赖） |
| `scripts/pact-graph.sh` / `pact-graph.mjs` | ★ 执行图谱机检：结构/DAG/完成度/`--next` 取活/`--done-rids`（需 node） |
| `scripts/pact-trace.sh` | 落地机检：规格↔代码↔图谱三方比对（虚报/野生检查需 node 读图谱） |
| `scripts/pact-book.sh` + `pact-book.mjs` / `pact-book-html.mjs` | 生成知识库（md + 单文件 HTML）；`--check` 查漂移（需 node） |
| `scripts/pact-check.sh` | /pact-check 聚合器：物料质量四道机检 |
| `scripts/pact-review.sh` | /pact-review 聚合器：五道门全过 + 完成度 100% 才 exit 0 |
| `scripts/pact-list.sh` | /pact-list 入口：全部物料的状态/进度/完成度总览（只读） |
| `scripts/pact-migrate.sh` | 旧版布局迁移：根 PACT.md + 扁平 .pact/ → .pact/<slug>/（含旧路径引用清单） |
| `scripts/pact-estimate.sh` / `.mjs` | 驱动因子分层法测算器（需 node） |
| `scripts/pact-parse.mjs` | PACT.md 解析层（book / estimate / graph 共用，防解析器漂移） |
| `scripts/star-consistency.sh` | ★ 招标强制项 P5↔T1 一致性（纯 bash） |
| `scripts/pact-help.sh` | 打印使用速览 |
| `scripts/token-lint.sh` / `visual-diff.mjs` / `computed-style.spec.ts` | 有 UI 时的三道视觉门禁 |
| `vendor/marked.min.js` | 单文件 HTML 内嵌的 markdown 渲染器（MIT，40KB） |

**输出纪律（后台运行时）**：每轮开头一句「当前工序 · 要做什么」，结尾一句「结果 + 下一道」；
关键数字用自己的话复述；阻塞时 `needs input:` 独占一行并 `AskUserQuestion` 给选项；
完成时 `result:` 独占一行自包含；**默认不提交代码**。
