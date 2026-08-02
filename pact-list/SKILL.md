---
name: pact-list
description: >
  列出当前项目全部 pact 物料的总览：每份物料的 slug、规格状态（草稿/已冻结）、完备度档位、
  工序进度（S0–S11 走到哪）、施工完成度百分比、一句话定义，并给出各自的下一步建议。
  多 pact 并存时的第一入口；也是 /pact-run、/pact-review 多物料选择时的信息源。只读。
  触发词：pact-list、列出 pact、物料总览、项目里有哪些 pact、pact 进度总览。
argument-hint: "[--help]"
---

# /pact-list — 项目内 pact 物料总览（只读）

> 创建日期: 2026-08-02

```bash
CORE="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
```

若 `$ARGUMENTS` 含 `--help`：只输出 `bash $CORE/scripts/pact-help.sh` 的内容然后停止。

## 做法

1. 在项目根跑：

   ```bash
   bash $CORE/scripts/pact-list.sh
   ```

   它列出每份 `.pact/<slug>/`：规格状态 · 档位 · 工序进度（来自 `board.md`）·
   施工完成度（来自 `action-graph.json`）· 一句话定义（来自 `P1`）。
   0 份物料时它会提示 `/pact-new`（或旧版布局的迁移命令），照转即可。

2. **用自己的话复述**成一张简洁的表——脚本输出的对齐在 CJK 下会歪，别原样照贴；
   每份物料补一行**下一步建议**：
   - 草稿（S0–S8 途中）→ `/pact-new` 续写，标出当前卡在哪道工序；
   - 已冻结、完成度 < 100% → `/pact-run <物料目录>`；
   - 完成度 100% → 建议 `/pact-review <物料目录>` 复核后收档；
   - 图谱缺失但已冻结 → 指出 S9 没走完，回 `/pact-new`。

3. 用户点名想深入某一份 → 指到对应命令（质量 `/pact-check`、完成度 `/pact-review`、
   变更 `/pact-change`、估算 `/pact-estimate`），**本命令自己不做体检**。

**只读**：不建目录、不改任何文件、不跑写盘的机检。
