---
name: pact-check
description: >
  体检一份 pact 物料本身是否完备、有无问题或遗漏点（不看实现进度，那是 /pact-review 的事）：
  机检（工序状态、规格 lint 九项、★ 一致性、执行图谱结构、知识库漂移）
  + 物料反扫（输入物料 ↔ PACT 找遗漏）+ 零知识冷读门（另起空白 agent 只读 PACT.md 找追问点与矛盾）。
  相当于旧版 --audit：出问题清单与回填建议，不改实现。
  未指定路径时自动扫描 .pact/：恰一份物料直接体检，多份则列出让用户选。
  触发词：pact-check、物料体检、规格评审、冷读检查、PACT 写够了吗、有没有遗漏。
argument-hint: "[<pact物料路径>] [--help]"
---

# /pact-check — pact 物料完备性体检（只读）

> 创建日期: 2026-08-02

**回答一个问题：这份物料本身写够了吗——有没有问题、矛盾、遗漏点？**
与 `/pact-review` 的分工：check 查**规格质量**，review 查**实现完成度**。出报告，不改实现。

```bash
CORE="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
```

若 `$ARGUMENTS` 含 `--help`：只输出 `bash $CORE/scripts/pact-help.sh` 的内容然后停止。

## 第一步：定位物料

与 `/pact-run` 同规则：给了路径用路径；没给则扫描 `.pact/*/PACT.md`——
恰一份直接用并说明；0 份告知先跑 `/pact-new`；≥2 份 `AskUserQuestion` 让用户选。

## 第二步：机检聚合器

```bash
bash $CORE/scripts/pact-check.sh <物料目录>
```

跑：① `pact-status.sh` 工序状态 ② `pact-lint.sh` 规格九项（+有 ★ 时 `star-consistency.sh`）
③ `pact-graph.mjs` 图谱**结构**校验（DAG 无环、R-ID 全承接；不要求完成度）
④ `pact-book.sh --check` 知识库漂移。③④ 的产物未冻结时缺失只 WARN，已冻结缺失即 FAIL。

## 第三步：物料反扫（机检管不了的遗漏）

拿全部输入物料（`<物料目录>/docs/` 里归位的 PRD/SDD/原型、访谈记录 `interview.md`、
熔合裁定 `source-merge.md`、存量评估 `assessment.md`）**反向重扫**对照 `PACT.md`，
逐条列出：未覆盖 / 部分覆盖 / 偏离。同时查三类结构性问题：

- **过度设计**：逐个 C 层契约反问「这是哪条 R-ID 要的」——反查不到的字段/表/抽象/约束就是野生设计；
- **横切项缺口**：权限/校验/边界/空状态/错误处理/幂等并发/审计 是否逐项有条目或「不需要+理由」；
- **验收可执行性**：`T1` 里有没有「手工测试」「检查是否正常」这类不可执行的验收。

## 第四步：零知识冷读门

用 `Agent` 工具（`subagent_type: general-purpose`）另起**全新** agent，
**只给 `PACT.md` 绝对路径**（不给对话历史、其他文档、代码背景），prompt 与判定标准见
`$CORE/templates/cold-read.md`。它必须追问的每个问题都是真实的规格漏洞。
报告**追加**到 `<物料目录>/cold-read.md`（保留历史）。

## 报告格式（最终消息必须包含）

- **结论**：`完备 ✅` 或 `不完备 ❌（N 个问题 / M 个遗漏点）`。
- **机检结果**：各门 PASS/FAIL 一览。
- **问题清单**：每条给 位置（锚点/行号）→ 问题 → 建议回填到哪个锚点。按严重度排序：
  矛盾/不可实现 > 冷读追问点 > 遗漏 > 表述不可发现 > WARN 级。
- **冷读门判定**：PASS / FAIL 及追问清单摘要。

**只报告不动手**：修复由用户决定——未冻结的物料建议回 `/pact-new` 续写对应工序；
已冻结的物料提醒改动必须记 `changelog.md`，动到意图与范围层（P1/P2/P4/P5/P6）要重跑冷读门。
