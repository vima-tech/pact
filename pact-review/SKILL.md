---
name: pact-review
description: >
  审查一份 pact 物料是否已全部完成实现：聚合五道机检（工序状态、规格 lint、
  执行图谱完成度、规格↔代码↔图谱三方可追溯、知识库漂移），输出完成度百分比与缺口清单。
  可单独使用做单次检查，也是 /pact-run 的停止判据——只有完成度 100%（pact-review.sh exit 0）
  /pact-run 才允许停止。只读不改任何实现。
  未指定路径时自动扫描 .pact/：恰一份物料直接检查，多份则列出让用户选。
  触发词：pact-review、完成度检查、pact 实现了没有、验收审查。
argument-hint: "[<pact物料路径>] [--help]"
---

# /pact-review — pact 完成度审查（只读）

> 创建日期: 2026-08-02

**回答一个问题：这份 pact 物料声称要做的，代码里真的全做完了吗？** 出报告，不改实现、不改规格。

```bash
CORE="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
```

若 `$ARGUMENTS` 含 `--help`：只输出 `bash $CORE/scripts/pact-help.sh` 的内容然后停止。

## 第一步：定位物料

与 `/pact-run` 同规则：给了路径用路径；没给则扫描 `.pact/*/PACT.md`——
恰一份直接用并说明；0 份告知先跑 `/pact-new`；≥2 份 `AskUserQuestion` 列出
（slug + 一句话定义 + 当前完成度）让用户选。

## 第二步：跑机检聚合器

```bash
bash $CORE/scripts/pact-review.sh <物料目录>
```

五道门，全过才 PASS（exit 0 = 完成度 100%，`/pact-run` 才可以停）：

| 门 | 脚本 | 回答的问题 |
|---|---|---|
| ① 工序状态 | `pact-status.sh` | 工序有没有跳步、静默略过、冻结不一致 |
| ② 规格完备 | `pact-lint.sh`（+`star-consistency.sh`） | PACT 本身写够了没有、★ 集合一致吗 |
| ③ 执行图谱 | `pact-graph.mjs --require-complete` | 图谱结构合法且每个 step 都 done+pass/na |
| ④ 可追溯 | `pact-trace.sh --require-complete` | 代码 `@pact` 标注 ↔ P5 ↔ 图谱三方对得上（抓**虚报**与**野生功能**） |
| ⑤ 知识库 | `pact-book.sh --check` | 生成物没漂移（没人手改、没忘重生成） |

## 第三步：抽查核验（机检抓不到的）

机检说 100% 也不许直接背书——抽查兜底：

1. 从「图谱标 done 的 step」里抽 2–3 个，打开 evidence 指向的 `file:line`，
   确认代码真实现了该 step 说的事（不是只贴了个 `@pact` 注释的空壳）。
2. 从 `T1` 里抽 1–2 条验收**真跑一遍**（测试命令/操作步骤），贴结果。
3. 有 UI 且 `T2` 定了视觉阈值 → 核对最近一次 diff 结果是否达标。

## 报告格式（最终消息必须包含）

- **结论**：`完成 ✅（可停止 /pact-run）` 或 `未完成 ❌（完成度 N%）`。
- **完成度**：step 完成数/总数、R-ID 完成数/总数（取自 `pact-graph.sh` 输出）。
- **缺口清单**（未完成时）：未实现的 R-ID、未完成/blocked 的 step（含卡在哪）、
  虚报与野生 R-ID（如有，这两类最严重，单独点名）、哪道门 FAIL 及原因。
- **抽查结果**：抽了哪几个 step / 哪几条验收，结论如何。
- 作为 `/pact-run` 的停止检测被调用时：结论就是「能不能停」——FAIL 时明确指出下一步该做哪些 step。

**不改任何东西**：发现虚报也只报告（改状态是 `/pact-run` 的事）；发现规格问题指去 `/pact-check`。
