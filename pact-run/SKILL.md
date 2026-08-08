---
name: pact-run
description: >
  按 pact 物料施工：读 .pact/<slug>/ 里的 PACT.md 与 action-graph.json 执行图谱，
  逐步骤实现编码开发（@pact R-ID 标注 + 自动验收 + 回写图谱状态），
  直到 /pact-review 的机检（pact-review.sh）判定完成度 100% 才允许停止——类似 /goal 的自驱闭环。
  未指定路径时自动扫描 .pact/：恰一份物料直接执行，多份则列出让用户选。
  触发词：pact-run、按 pact 施工、按规格实现、按物料开发、继续施工。
argument-hint: "[<pact物料路径>] [--help]"
---

# /pact-run — 按 pact 物料施工到 100%（S10–S11）

> 创建日期: 2026-08-02

**职责边界：只施工，不创造规格。** 规格与执行图谱由 `/pact-new` 产出；
你按它实现代码，**在 `pact-review.sh` exit 0（完成度 100%）之前不许停**。

```bash
CORE="$(ls -d ./.claude/skills/pact ~/.claude/skills/pact 2>/dev/null | head -1)"
```

若 `$ARGUMENTS` 含 `--help`：只输出 `bash $CORE/scripts/pact-help.sh` 的内容然后停止。

## 第一步：定位物料

1. `$ARGUMENTS` 给了路径 → 用它（物料目录或其中的 `PACT.md` 均可）。
2. 没给 → 扫描 `.pact/*/PACT.md`：
   - 恰好 **1 份** → 直接用，开场说明用的是哪份；
   - **0 份** → 告知先跑 `/pact-new`（若根目录有旧版 `PACT.md`，给出迁移提示），停止；
   - **≥2 份** → `AskUserQuestion` 列出各物料（slug + PACT.md 头部一句话定义 + 完成度）让用户选。
   脚本侧同规则：各机检脚本未给路径时自动扫描，多份时 exit 3 并列出候选。
3. **前置检查**：`PACT.md` 头部必须是 `已冻结`、`action-graph.json` 必须存在且
   `bash $CORE/scripts/pact-graph.sh <物料目录>` 结构 PASS。不满足 → 指回 `/pact-new`（S8/S9 没走完），停止。

## 执行协议（硬性）

1. **每轮三件事**：开工先读 `<物料目录>/board.md` 与 `pact-graph.sh <物料目录>`（进度真源，不凭记忆）；
   只做取到的工作单元；收工回写 `action-graph.json` + `board.md`。
2. **落盘高于对话**：实现情况、测试情况一律进 `action-graph.json`（含 `updated` 日期）；决策与变更进 PACT/changelog。
3. **AI 施工读物料的顺序**：总览读 `PACT.md`；做某条需求时读 `pact-book/src/r/R###.md`（该需求的聚合页：
   需求+验收+依赖+决策+契约位置）；里程碑上下文读 `pact-book/src/m/M#.md`。
4. **禁令**（核心 skill 协议 D 的施工侧子集，全文见 `$CORE/SKILL.md`）：
   禁止写没有 R-ID 的功能、写了不标注 · 禁止虚报（图谱标 done 而代码无标注，`pact-trace.sh` 必抓）·
   禁止为通过测试改宽断言（停工线）· 禁止未跑机检就宣称完成 · 禁止过度设计（只做 step 明写的事）·
   禁止手改 `pact-book/`。

## S10 · 施工 LOOP（每轮一个工作单元）

1. **取活**：`bash $CORE/scripts/pact-graph.sh <物料目录> --next` 列出依赖已满足的可执行步骤，
   按 `T5` 里程碑顺序取（M0 的 P0 修复全清前不碰打磨项）。取到后把该 step 的 `impl.status` 改 `doing`。
2. **实现**：代码落到 `A2` 约定位置；配置进 `C7` 集中层，零硬编码魔法值；
   **每段业务代码带 `@pact R###` 标注**（`// @pact R001`，多个 `R001,R002`；Python/Shell 用 `#`，模板用 `<!-- -->`）。
3. **验收**（读 PASS/FAIL，不靠肉眼）：跑 `T1` 为该 step 相关 R-ID 指定的验收方式；
   有 UI 追加 `token-lint.sh` / `visual-diff.mjs` / computed-style 断言；核对 `C3` 相关不变量。
4. **回写图谱**：全过 → `impl.status: done`（evidence 填 `file:line`）、`test.status: pass`（evidence 填测试命令）；
   测试不适用 → `na` + 理由。任一 FAIL → 同一 step 继续修，**不前进**；被外部依赖卡死 → `blocked` + 原因。
5. **可追溯机检**：`bash $CORE/scripts/pact-trace.sh <物料目录>` —— 无虚报、无野生 R-ID。
6. **停工线检查**：对照 `T3`，命中任一条 → **立即停**，`needs input:` 说明命中哪条。
7. 更新 `board.md`；PACT 有变动同步 `changelog.md`。

### S10-CR · 施工中的需求变更（用户中途改需求，必走六步）

> 变更发生在非施工时刻（还没开始跑 /pact-run，或已收工）时，用独立入口 `/pact-change`——流程相同。

1. 回 `P5` 加/改 R-ID（新号不复用；影响 `P6` 非目标则一并更新）；
2. 回 `T1` 补可执行验收；
3. 影响契约 → 同步改 `C` 层；
4. 记 `changelog.md`（改了什么/为什么/影响哪些 R-ID）；
5. 改到 `P1/P2/P4/P5/P6` → 重跑 S8 冷读门；推翻决策 → `A5` 新增 D-ID，旧的标 `已被取代`；
6. **同步 `action-graph.json`**：新 R-ID 加 feature/step 承接、连 deps，跑 `pact-graph.sh` 结构 PASS；
   再 `bash $CORE/scripts/pact-book.sh <物料目录>` 重生成知识库
   （构建报「图过期/待绘制」→ 按 `$CORE/references/svg-figure-guide.md` 重绘对应 `figures/*.svg`）。
   变更超出当前里程碑 → 排 `T5` 后续里程碑，不塞进正在做的单元；与 `P6`/`P7` 冲突 → 问用户，不自行放宽。

## 停止判定（唯一出口）

每轮收尾跑：

```bash
bash $CORE/scripts/pact-review.sh <物料目录>
```

- **exit ≠ 0 → 不许停**，回 S10 取下一个步骤继续。它聚合五道门：工序状态、规格 lint、
  执行图谱 100%、可追溯 `--require-complete`、知识库无漂移。
- 无法继续的情形只有两种：命中 `T3` 停工线，或全部剩余步骤 `blocked` 且解锁条件在用户手里——
  此时 `needs input:` 说明卡在哪，**而不是宣称完成**。
- **节奏**：连续工作。仅在等构建/dev-server 时用 `ScheduleWakeup`（短轮询 ≤270s；长等待 ≥1200s）
  并回传同样的 `/pact-run <物料目录>` 续跑。

## S11 · 收尾自检门（review PASS 后）

1. PACT 反向重扫实现，列 未覆盖/部分覆盖/偏离；`T2` 指标达阈值；`T4` DoD 逐条打勾。
2. 规格与实现一致性：契约（表结构/接口/错误码/配置）与代码实测一致；不一致 → 改代码或改 PACT 并记 changelog。
3. **末次冷读**：对最终 `PACT.md` 再跑一次冷读门，确认它描述的仍是现在的系统。
4. 可接手性：`A2` 与实际目录一致 · `.env.example` 齐备 · 无 TODO 占位 · 项目根干净。
5. 全绿 → `result:` 一行总结（完成度、跑过的机检、有无降级项）。**默认不提交代码。**
