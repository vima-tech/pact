# PACT — 单文件完备规格 skill 套件

**PACT = Product · Architecture · Contracts · Tests**

一套 agent skills：把 PRD / SDD / SPEC / 验收标准 / 施工范围熔成**一份单文件完备规格 `PACT.md`**，
并驱动它落地。用于**新建项目开局**与**大需求设计**。

它的验收标准只有一条，且**必须被真实检验**：

> 一个对本项目**一无所知**的人或 AI，**只读这一份文件**即可开始编码，
> 且不需要追问背景、不需要猜测意图、不会遗漏约束。

## 七个命令

| 命令 | 干什么 | 停止条件 |
|---|---|---|
| **`/pact-new`** | 创建 pact 物料包（新项目 / 大需求 / 多文档熔合通吃）：访谈 → 写四层 → 完备门 → 冻结 → 生成知识库 + 执行图谱 | 物料齐备且机检 + 冷读门全过 |
| **`/pact-run`** | 按物料施工：执行图谱取活 → 实现（`@pact` 标注）→ 自动验收 → 回写状态 | **`pact-review.sh` exit 0（完成度 100%）** |
| **`/pact-review`** | 审查实现完成度：五道机检聚合 + 抽查，出完成度与缺口清单；也是 `/pact-run` 的停止判据 | 单次，只读 |
| **`/pact-check`** | 体检物料质量：机检 + 物料反扫 + 零知识冷读门，出问题与遗漏清单 | 单次，只读 |
| **`/pact-change`** | 需求变更入口（S10-CR）：回 P5 立 R-ID → 补验收 → 改契约 → changelog → 同步图谱 → 判断重跑冷读门 | 六步走完 + 影响面报告 |
| **`/pact-list`** | 项目内全部物料总览：状态 / 工序进度 / 完成度 + 下一步建议 | 单次，只读 |
| **`/pact-estimate`** | 估算门：四前提核对 + 驱动因子分层测算 + 三条线（对外只承诺交付线） | 单次 |

`/pact` 本身只做总览与路由：打印速览，按现场状态告诉你该用哪个命令。
除 `/pact-new`、`/pact-list` 外的命令不给路径时自动扫描 `.pact/`：
恰一份物料直接用；多份列出让你选。
旧版布局（根 `PACT.md` + 扁平 `.pact/`）用 `pact/scripts/pact-migrate.sh . --slug=<名字>` 一键迁移。

## 物料结构：一个大需求 = 一个物料包

```
<你的项目>/
  CLAUDE.md                  # 怎么写代码（全项目一份）
  .pact/
    user-auth/               # 第一个 pact（如初建项目）
    export-center/           # 第二个 pact（后来的大需求）——并存互不干扰
      PACT.md                # 【真源】单文件完备规格（四层 P/A/C/T，30 锚点）
      board.md               # 工序状态表（断点续跑第一真相源）
      action-graph.json      # ★ AI 执行图谱：module→feature→step DAG + 每步实现/测试状态
      interview.md source-merge.md assessment.md estimate.md   # 闸门记录
      cold-read.md changelog.md                                # 执行态
      pact-book/             # 【生成物】知识库（勿手改）
        pact-book.html       #   给人：双击即开的单文件网页，零依赖，可直接发甲方
        src/**.md            #   给 AI：每条需求一页的施工素材
```

- **人读 HTML，AI 读 md**：`pact-book.html` 三栏布局、字段感知搜索、依赖图、明暗主题；
  `src/r/R###.md` 每条需求聚合 需求+验收+依赖+决策+契约位置，施工读一页即可。
- **R-ID 号段全项目唯一**：新物料从既有最大号 +1 起，跨物料才能机检野生功能。

## 执行图谱：AI 施工的依据（DAG）

`/pact-new` 冻结时生成 `action-graph.json`：

- 三级节点：**module**（功能模块，源自 `A2`）→ **feature**（功能点，挂 R-ID 簇）→
  **step**（可执行步骤，引用 C 层契约锚点）；
- `deps` 是跨节点执行依赖（DAG、机检禁环）；施工按「依赖已满足的下一批」取活；
- 每个 step 携带 `impl`（todo/doing/done/blocked + `file:line` 证据）与
  `test`（todo/pass/fail/na + 测试命令或理由）——**执行态的唯一真源**，取代旧版 coverage.md；
- `/pact-run` 按它干活，`/pact-review` 按它算完成度，`pact-trace.sh` 拿它与代码标注对账。

```bash
bash pact/scripts/pact-graph.sh .pact/<slug>            # 进度树 + 完成度
bash pact/scripts/pact-graph.sh .pact/<slug> --next     # 下一批可执行步骤
bash pact/scripts/pact-graph.sh .pact/<slug> --require-complete   # 收尾门禁
```

## 落地是机检的：代码必须能反查回规格

每段业务代码必须带 R-ID 标注：

```js
// @pact R001            单个
// @pact R001,R002       一段代码覆盖多个
# @pact R014             Python / Shell
<!-- @pact R021 -->      模板 / HTML
```

机检矩阵（自称完成不算数）：

| 脚本 | 回答的问题 | 抓什么 |
|---|---|---|
| `pact-status.sh` | 工序走到哪了 | 跳步、静默略过、冻结不一致 |
| `pact-lint.sh` | PACT 写够了没有 | 锚点缺失、占位符、R-ID 无验收、决策无「已否决」 |
| `pact-graph.mjs` | 图谱能不能施工、做到哪了 | 结构非法、DAG 成环、R-ID 无 step 承接、done 无证据 |
| `pact-trace.sh` | 代码真按 PACT 做了没有 | **虚报**（图谱说完成、代码没有）、**野生功能**（代码有、规格没有） |
| `pact-book.sh --check` | 知识库还是不是真源的投影 | 手改生成物、忘了重生成 |
| `star-consistency.sh` | ★ 强制项 P5↔T1 一致吗 | 漏标、越权升级 |
| **`pact-check.sh`** | **物料本身完备吗**（聚合器，/pact-check 入口） | 上面前几项 + 冻结态产物齐备 |
| **`pact-review.sh`** | **全部实现了吗**（聚合器，/pact-review 入口） | 五道门全过 + 完成度 100% 才 exit 0 |
| `pact-list.sh` | 项目里有哪些 pact、各自到哪了（/pact-list 入口） | 只读总览，不做门禁 |
| `pact-migrate.sh` | 旧版布局一键迁移 | 移动 + 旧路径引用清单（改引用与验证留给人/agent） |

## 三个让它区别于「文档模板」的机制

1. **完备性是机检的**：30 个锚点 `<!-- PACT:xx -->` + `pact-lint.sh` 九项检查。
2. **零知识冷读门**：另起一个全新 agent，只给 `PACT.md`，让它输出实现计划 + 必须追问的问题清单——
   每问一个问题就是一处规格漏洞，跑到追问清单为空为止。
3. **决策必须留「已否决方案」**：理由要能被反驳，后人看到的是路口而不只是结果。

内建**估算门**（S7）：驱动因子分层法（T1/T2/T3 + 费率卡）、50% 法则、阻塞缓冲 ×1.5–2、
三条线只承诺交付线——**禁止凭直觉给工期或报价数字**。

## 仓库目录

```
pact/                 核心 skill：/pact 总览路由 + 共享资源
  SKILL.md            协议：物料结构 · 机检 · 十四条禁令 · 估算门
  references/         工序卡(agent-protocol) · 速览(help) · 写作标准 · 范例 · 估算方法
  templates/          PACT.md 30 锚点骨架 · action-graph.json · board 等各工序模板
  scripts/            全部机检与生成脚本（见上表）
  vendor/             marked.min.js（单文件 HTML 内嵌渲染器）
pact-new/SKILL.md      /pact-new  创建物料包（S0–S9）
pact-run/SKILL.md      /pact-run  按物料施工（S10–S11，100% 才停）
pact-review/SKILL.md   /pact-review  完成度审查（只读）
pact-check/SKILL.md    /pact-check   物料体检（只读）
pact-change/SKILL.md   /pact-change  需求变更入口（S10-CR）
pact-list/SKILL.md     /pact-list    多物料总览（只读）
pact-estimate/SKILL.md /pact-estimate  估算门独立入口
```

## 安装与上手

```bash
npx skills add vima-tech/pact -g     # 装到全局（七个命令 skill + 核心）
cd your-project
# 然后对 agent 说：
#   /pact-new 做一个 <你的需求>
#   /pact-run        （物料冻结后）
#   /pact-review     （做完了吗）
#   /pact-check      （规格写够了吗）
#   /pact-change 导出要支持 Excel     （冻结后改需求）
#   /pact-list       （项目里有哪些 pact）
#   /pact-estimate   （多久能做完 / 报个价）
```

手动跑一次机检看看它管什么：

```bash
S=~/.claude/skills/pact
bash $S/scripts/pact-lint.sh $S/references/example-PACT.md --level=feature   # → PASS
bash $S/scripts/pact-lint.sh $S/templates/PACT.md --level=full               # → FAIL（空模板，预期）
# 在你的项目里（有物料后）：
bash $S/scripts/pact-check.sh  .pact/<slug>    # 物料质量
bash $S/scripts/pact-review.sh .pact/<slug>    # 完成度（100% 才 exit 0）
```

**中断后怎么接着干**：物料没冻结说 `/pact-new 继续`，冻结了说 `/pact-run`。
agent 会先读 `board.md` 与执行图谱判断进度，不重新访谈、不重写已冻结的规格。

## 更新已安装的 pact

先确认自己是哪种安装形态（看 skill 目录是不是软链）：

```bash
ls -la ~/.claude/skills/ | grep pact
```

**形态 A · 拷贝式安装**（`npx skills add` 装的，目录是普通文件夹）——更新要重新拉取：

```bash
npx skills update pact
# 或重装：npx skills add vima-tech/pact -g
```

**形态 B · 源码软链安装**（目录是指向本仓库 clone 的软链）——更新只需拉代码，链接自动跟随：

```bash
cd <你的 pact 仓库 clone> && git pull
```

首次做软链安装（clone 仓库后把八个 skill 链进 agent 的 skills 目录）：

```bash
REPO=<你的 pact 仓库 clone 的绝对路径>
for n in pact pact-new pact-run pact-review pact-check pact-change pact-list pact-estimate; do
  ln -sfn "$REPO/$n" ~/.claude/skills/$n
done
```

> 从形态 A 切到形态 B 时，先把旧拷贝目录移出 skills 目录再建链——
> 旧拷贝里的 SKILL.md 会与新版重名，被 agent 当成同名 skill 重复发现。

更新后验证（任一形态）：

```bash
S=~/.claude/skills/pact
bash $S/scripts/pact-help.sh >/dev/null && echo ok    # 脚本可跑
head -5 $S/../pact-new/SKILL.md                        # 命令 skill 在位
```

## 兼容性

`SKILL.md` 遵循 [agent skills](https://github.com/vercel-labs/skills) 规范，
可安装到 Claude Code、Cursor、Codex、Copilot 等支持 skills 的 agent。
bash 脚本零依赖；`pact-graph` / `pact-book` / `pact-estimate` 需 node。

## 更新记录

见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
