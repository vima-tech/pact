# PACT — 单文件完备规格 skill

**PACT = Product · Architecture · Contracts · Tests**

一个 agent skill：把 PRD / SDD / SPEC / 验收标准 / 施工范围熔成**一份单文件完备规格 `PACT.md`**，
并驱动它落地。用于**新建项目开局**与**大需求设计**。

它的验收标准只有一条，且**必须被真实检验**：

> 一个对本项目**一无所知**的人或 AI，**只读这一份文件**即可开始编码，
> 且不需要追问背景、不需要猜测意图、不会遗漏约束。

## 安装

```bash
npx skills add vima-tech/pact
```

装到全局（所有项目可用）：

```bash
npx skills add vima-tech/pact -g
```

装完在支持 skills 的 agent 里直接说 `/pact` 或「用 PACT 给这个项目写规格」即可触发。

## 为什么不是又一个 PRD 模板

| 体裁 | 它回答 | PACT 的不同 |
|---|---|---|
| `CLAUDE.md` / `AGENTS.md` | **怎么写代码**（偏好与惯例） | PACT 回答**写什么、为什么、做到什么算完成** |
| PRD | 要什么 | PACT 必须再给出可执行的接口、表结构、状态机 |
| SDD | 怎么设计（假设读者已知业务背景） | PACT **不做此假设**，且显式记录**决策理由**与**已否决方案** |
| SPEC | 通常只覆盖接口 | PACT 同时承载动机、约束与验收 |

推论：凡是「懂行的人自然知道」的东西，PACT 里**必须写出来**。

## 三个让它区别于「文档模板」的机制

### 1. 完备性是机检的，不是自觉的

每个必备条目上方带机器可读锚点 `<!-- PACT:C4 -->`，章节编号与标题仍可自由调整。

```bash
bash scripts/pact-lint.sh PACT.md --level=full
```

九项检查：四层锚点齐备且非空 · 无占位符 · **每个 R-ID 都被验收清单覆盖** ·
**每条决策都写了「已否决方案」** · 数据模型与接口是表格或 schema 而非散文 ·
文档带创建日期 · 等。不适用的条目必须写 `N/A（理由）`——删锚点不行。

### 2. 零知识冷读门

lint 只能查结构。「只读这一份就能开工」靠另一道门验证：

> 另起一个**全新** agent，**只给它 `PACT.md`**，不给对话历史、不给其他文档、不给代码库背景。
> 让它输出：(a) 它理解的实现计划 (b) **它必须追问才能动工的问题清单** (c) 它发现的矛盾。

它每问一个问题，就是一处规格漏洞。它答案其实在文里 → 不算漏洞，但说明**表述不可发现**，也要改。
它的实现计划跑偏 → 说明需求表述有歧义。**跑到追问清单为空为止。**

### 3. 决策必须留下「已否决方案」

```markdown
#### D001 · 导出走同步接口还是异步任务
- **选项**：A. 同步返回文件流 / B. 异步任务加轮询
- **结论**：采 A
- **理由**：上限已压到一万行，实测生成约三秒；异步要引入任务表、状态轮询、过期清理三块新代码…
- **已否决**：B——任务生命周期管理成本超过本期收益，且内网无对象存储…
```

理由必须**能被反驳**。「更现代、社区活跃、性能更好」对任何选型都成立，等于没写。
这让后人看到**路口**，而不只是看到**结果**。

## 四层

| 层 | 内容 | 锚点 |
|---|---|---|
| **P**roduct | 背景、用户、场景、需求、非目标、约束、成功定义 | `P1–P8` |
| **A**rchitecture | 结构、模块职责、设计原则、带理由的决策 | `A1–A6` |
| **C**ontracts | 数据模型、接口、状态机、配置、权限、观测、prompt | `C1–C11` |
| **T**ests | 验收清单、指标、**停工线**、交付前置、施工范围 | `T1–T5` |

## 五种模式

| 模式 | 场景 | 干什么 |
|---|---|---|
| `--new` | 空项目 / 只有一句想法 | 访谈补白（十二类）→ 从零写完整 PACT → 冻结 → 施工 |
| `--feature` | 已有代码 + 一个大需求 | 存量八维评估 → 写特性级 PACT → 冻结 → 施工 |
| `--merge` | 有一堆互相打架的既有文档 | 差异按矛盾/细化/缺漏/越界分类逐条裁定 → 熔成一份 |
| `--build` | 已有冻结的 PACT | 直接进施工闭环 |
| `--audit` | 已有 PACT | 只体检：lint + 冷读门，出报告不改实现 |

## 目录

```
SKILL.md                          skill 主体：5 模式 · 9 阶段 · 3 道闸门
templates/
  PACT.md                         30 锚点骨架，起手拷这个
  interview.md                    访谈门：十二类补白清单
  source-merge.md                 多来源差异裁定表
  assessment.md                   存量代码八维评估
  cold-read.md                    冷读门 prompt 与判定标准
  board.md coverage.md changelog.md   执行态
  CLAUDE.md                       项目 CLAUDE.md 模板（讲清与 PACT 的分工）
references/
  authoring-guide.md              逐节「写到什么程度算够」+ 反例
  example-PACT.md                 通过全部机检的完整范例
scripts/
  pact-lint.sh                    完备性机检（零依赖）
  token-lint.sh                   有 UI 时：禁裸 hex/px/rgb（零依赖）
  visual-diff.mjs                 有 UI 时：截图 diff（需 playwright pixelmatch pngjs）
  computed-style.spec.ts          有 UI 时：computed 值 == token 值 的测试模板
```

## 产物骨架

```
<project>/
  PACT.md            # 真源：冻结的完备规格
  CLAUDE.md          # 惯例：怎么写代码
  .pact/             # 过程与执行态（访谈/评估/冷读/看板/覆盖/变更记录）
```

`PACT.md` 自足——不靠外链、不靠对话历史、不靠「你懂的」。
冻结后任何改动都要在 `.pact/changelog.md` 留痕：规格漂移是最贵的债。

## 快速上手

```bash
npx skills add vima-tech/pact -g
cd your-project
# 然后对 agent 说：用 pact 给这个项目写规格
```

手动跑一次机检看看它管什么：

```bash
SKILL_DIR=~/.claude/skills/pact
bash $SKILL_DIR/scripts/pact-lint.sh $SKILL_DIR/references/example-PACT.md --level=feature
# → PASS
bash $SKILL_DIR/scripts/pact-lint.sh $SKILL_DIR/templates/PACT.md --level=full
# → FAIL（空模板本来就不是合格规格，这是预期行为）
```

## 兼容性

`SKILL.md` 遵循 [agent skills](https://github.com/vercel-labs/skills) 规范，
可安装到 Claude Code、Cursor、Codex、Copilot 等支持 skills 的 agent。
`pact-lint.sh` 与 `token-lint.sh` 只依赖 bash + 常见 coreutils。

## License

MIT
