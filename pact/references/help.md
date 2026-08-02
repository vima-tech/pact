# PACT 使用速览

> 创建日期: 2026-07-26 ｜ 更新日期: 2026-08-02 ｜ 人类向。AI 执行细则见各命令 `SKILL.md` 与 `references/agent-protocol.md`。

**PACT = Product · Architecture · Contracts · Tests**
把 PRD / SDD / SPEC / 验收标准 / 施工范围熔成**一份 `PACT.md`**，再按它严格施工。

验收标准只有一条：**一个对本项目一无所知的人或 AI，只读 `PACT.md` 就能开工。**

## 一、七个命令

| 命令 | 什么时候用 | 干什么 |
|---|---|---|
| **`/pact-new`** | 新项目开局 / 存量项目加大需求 / 一堆打架的旧文档要熔合 | **创建物料包**：访谈补白 →（熔合裁定）→（存量八维评估）→ 写四层规格 → 完备门（lint+反扫+冷读门）→ 冻结 → 生成知识库与执行图谱 |
| **`/pact-run`** | 物料已冻结，要开发 | **按物料施工**：按执行图谱逐步骤实现 + 自动验收 + 回写状态，**完成度 100% 才停** |
| **`/pact-review`** | 想知道「做完了没有」 | **完成度审查**：五道机检聚合 + 抽查，出完成度百分比与缺口清单。也是 /pact-run 的停止判据 |
| **`/pact-check`** | 想知道「规格写够了没有」 | **物料体检**：机检 + 物料反扫 + 零知识冷读门，出问题与遗漏清单，不改实现 |
| **`/pact-change`** | 冻结后要改需求 / 加功能 | **变更入口**：回 P5 立 R-ID → 补验收 → 改契约 → changelog → 同步图谱 → 判断重跑冷读门，出影响面报告。**别直接让 AI 改代码** |
| **`/pact-list`** | 项目里有好几份 pact | **总览**：每份物料的状态 / 工序进度 / 完成度 + 下一步建议 |
| **`/pact-estimate`** | 问「多久能做完 / 报个价」 | **估算门**：四前提核对 + 分层测算 + 三条线，对外只承诺交付线。禁止拍脑袋数字 |

```
/pact-new 做一个给中小企业用的报销审批系统    # 新项目从零
/pact-new docs/prd.md docs/技术方案.md        # 熔合既有文档（差异逐条裁定）
/pact-run                                     # 施工（自动找物料；多份时让你选）
/pact-run .pact/export-center                 # 指定物料施工
/pact-review .pact/export-center              # 这个需求做完了吗
/pact-check                                   # 规格本身有没有问题和遗漏
/pact-change 导出要支持 Excel 格式            # 冻结后的需求变更
/pact-list                                    # 项目里有哪些 pact、各自到哪了
/pact-estimate                                # 工期/报价测算
/pact                                         # 看速览 + 按现场状态告诉你该用哪个命令
```

除 `/pact-new`、`/pact-list` 外，其余命令不指定路径时会自动扫描 `.pact/`：
只有一份物料就直接用；发现多份会列出来让你选。

旧项目还是「根目录 PACT.md + 扁平 .pact/」的旧布局？一条命令迁移：
`bash ~/.claude/skills/pact/scripts/pact-migrate.sh . --slug=<名字>`（先加 `--dry-run` 看动作）。

## 二、会在你项目里生成什么

**一个大需求 = 一个物料目录 `.pact/<slug>/`**，多个大需求并存互不干扰：

```
CLAUDE.md                ← 怎么写代码的惯例（项目根，全项目一份）
.pact/
  user-auth/             ← 第一个 pact（比如初建项目）
  export-center/         ← 第二个 pact（后来加的大需求）
    PACT.md              ← 唯一要读的规格：需求(R-ID)、契约、决策、验收全在里面
    board.md             ← 工序状态表，看进度就看这个
    action-graph.json    ← AI 执行图谱：模块→功能点→步骤 DAG + 每步实现/测试状态
    interview.md         ← 访谈记录       source-merge.md ← 差异裁定
    assessment.md        ← 存量评估       cold-read.md    ← 冷读门报告
    changelog.md         ← 冻结后的变更记录
    pact-book/           ← 生成的知识库（勿手改）
      pact-book.html     ←   给人：双击即开的单文件网页，可直接发甲方
      src/**.md          ←   给 AI：每条需求一页的施工素材
```

`PACT.md` 是**自足**的——换个人、换个 AI，只读它就能接着干，不用翻聊天记录。

## 三、你需要参与的只有三个时刻

| 时刻 | 它做什么 | 你做什么 |
|---|---|---|
| **S1 访谈门** | 十二类补白，把「猜错代价大」的问题**批量**弹给你 | 一次答完（每问带 2–4 个选项和推荐项） |
| **S2 熔合门**（仅多份文档时） | 列出文档间的矛盾逐条上桌 | 裁定「以哪个为准」。**它不会替你择优采用** |
| **S8 后请求冻结** | 完备门全过 | 扫一眼 `PACT.md` 或双击 `pact-book.html`，确认是你要的东西 |

冻结后 `/pact-run` 就按执行图谱一个个步骤实现 + 自动验收，直到 `/pact-review` 判 100%。

## 四、执行图谱（action-graph.json）是什么

`/pact-new` 冻结时把规格拆成一张 **DAG 执行图谱**：

- **module**（功能模块，来自 A2）→ **feature**（功能点，挂 R-ID）→ **step**（可执行步骤）；
- 步骤之间有依赖边，施工按「依赖已满足的下一批」取活；
- 每个 step 记录**实现状态**（todo/doing/done/blocked + `file:line` 证据）和
  **测试状态**（todo/pass/fail/na + 测试命令或理由）；
- 它是施工执行态的**唯一真源**：`/pact-run` 按它干活，`/pact-review` 按它算完成度，
  `pact-trace.sh` 拿它和代码标注对账抓虚报。

## 五、你唯一需要配合的事：代码标注

每段业务代码要带 R-ID 标注，AI 会自己写，但你 review 时要认得：

```js
// @pact R001            单个
// @pact R001,R002       一段覆盖多个
# @pact R014             Python / Shell
<!-- @pact R021 -->      模板 / HTML
```

**没有标注 = 无法反查 = 图谱状态就是自说自话。** 这是让"严格落地"闭环的钥匙。

## 六、机检（AI 说"做完了"不算数）

```bash
S=~/.claude/skills/pact          # 核心 skill 安装目录
P=.pact/<slug>                   # 物料目录（只有一份时可省略参数）

bash $S/scripts/pact-check.sh  $P   # 物料质量：工序 + lint + 图谱结构 + 知识库漂移
bash $S/scripts/pact-review.sh $P   # 完成度：五道门全过且 100% 才 exit 0
bash $S/scripts/pact-graph.sh  $P   # 单看图谱：进度树 + 下一批可执行步骤（--next）
bash $S/scripts/pact-trace.sh  $P   # 单看落地：规格↔代码↔图谱三方对账（虚报/野生）
```

| 抓什么 | 谁抓 |
|---|---|
| 跳步、静默略过条件工序、冻结状态不一致 | `pact-status.sh` |
| 锚点缺失、占位符、R-ID 没验收、决策没写「已否决」 | `pact-lint.sh` |
| 图谱成环、R-ID 没步骤承接、标 done 却没证据 | `pact-graph.mjs` |
| **虚报**（图谱说完成但代码没有）、**野生功能**（代码有但规格没有） | `pact-trace.sh` |
| 手改了生成的知识库、改了 PACT 忘了重新生成 | `pact-book.sh --check` |

## 七、中断了怎么办

会话断了、上下文被压缩、换个 AI 接手：物料没冻结就说 `/pact-new 继续`，冻结了就 `/pact-run`。
它会先读 `board.md` 判断在第几道工序——**不会凭记忆瞎猜、不会重新访谈你、不会重写已冻结的规格**。

```bash
bash ~/.claude/skills/pact/scripts/pact-status.sh .pact/<slug>
# 列出 S0–S11 进度，并直接告诉你下一道该做什么
```

## 八、问「多久能做完 / 报个价」时（估算门）

**别凭直觉给数字——凭直觉给的数字会被当成承诺。** `/pact-new` 的 S7 内置估算门：

```bash
bash $S/scripts/pact-estimate.sh $P/PACT.md               # 可持续卡
bash $S/scripts/pact-estimate.sh $P/PACT.md --card=peak   # 峰值卡，禁止用于承诺
```

三条最容易翻车的规矩：**骨架只覆盖约 50%**（写更好的文档提不上去）；
**对外只报「交付线」**（= 开发完成线 × 阻塞缓冲 1.5–2）；
**停工线按可追溯性排**（不可追溯的今天不做就永久缺失，禁止逐项降级）。

## 九、几个实用提醒

- **冻结后要改需求？** 别直接改代码。说 `/pact-change <变更描述>`——它走 S10-CR 六步：
  回 `P5` 加 R-ID → `T1` 补验收 → 改 `C` 层 → 记 changelog → 判断重跑冷读门 → 同步执行图谱。
- **冷读门会额外起一个 agent** 读你的 PACT（不给任何上下文），会多花些 token，
  但这是 PACT 的定义性检验——跳过它，PACT 就退化成一份普通 SDD。
- **第一次用别拿真项目练手**。先看 `references/example-PACT.md`，特别是 `A5` 决策的
  「理由 / 已否决」怎么写——那就是 PACT 要求的精度。
- **它默认不提交代码**，改完停在未提交状态，你自己 review 后再决定。

## 十、什么时候**不该**用 PACT

- 改个文案、修个明显的 bug、调个样式 —— 直接说就行，走完整工序是浪费。
- 需求本身还在探索、随时会推翻 —— 先把想法聊清楚，再用 PACT 固化。
- PACT 适合的是：**新项目开局** 和 **值得先想清楚再动手的大需求**。

---

完整执行细则：各命令 `SKILL.md`｜工序卡：`references/agent-protocol.md`｜
写作精度标准：`references/authoring-guide.md`｜范例：`references/example-PACT.md`
