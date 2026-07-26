# CHANGELOG

> 创建日期: 2026-07-26
>
> 升级：`npx skills update pact`（或重新 `npx skills add vima-tech/pact -g`）

## 2026-07-26 · 工序协议强化

在 v1 基础上把「描述性流程」固化为「不许跳步的强制工序协议」，并修掉首版的三个缺陷。

**新增**
- `SKILL.md` 前置「执行协议」六节，优先级高于其余描述：
  S0–S11 十二道工序总表（进入条件 / 必须产出 / 可机检的退出条件）· 每轮三件事 ·
  断点续跑规程 · 两道机检 · 十条禁令 · 何时该停下来问人
- `scripts/pact-status.sh` 工序状态机检（零依赖）：工序表完整性 · 状态词合法且跳过带理由 ·
  顺序合法 · 骨架按进度动态要求 · 冻结一致性 · 覆盖一致性；并输出下一道该做什么
- `references/agent-protocol.md` 十二张工序卡：动作清单 / 退出判定 / 该道最常见的偷懒模式
- **S10-CR 需求变更流程**：冻结后用户改需求必走的五步（回 P5 → 补 T1 → 改 C 层 →
  记 changelog → 判断是否重跑冷读门），堵住"绕过规格直接改代码"这个最常见的破防点
- `templates/board.md` 重写为工序状态表，作为断点续跑的第一真相源

**修复**
- `pact-status.sh` 冻结一致性在 `--build` 模式下误报 FAIL
  （S9 标「已跳过」是该模式的正常形态，不应双向强检）
- `pact-status.sh` 状态词判定过严：「已跳过 —— 理由」这类不带括号的写法被判非法，
  改为前缀匹配 + 理由可写在状态格或备注列
- `S8` 文档里把 lint 档位写死成 `--level=full`，feature 档项目照抄会用错档位
- `pact-status.sh` 头注释里的检查项顺序与实际输出顺序不一致
- 两个脚本 `-h` 的帮助文本打印范围溢出到代码行

## 2026-07-26 · 首个版本

- `PACT.md` 30 锚点单文件完备规格骨架（P1–P8 / A1–A6 / C1–C11 / T1–T5）
- `scripts/pact-lint.sh` 规格完备性机检九项：锚点齐备 · 无占位符 ·
  R-ID 被验收覆盖 · 决策含「已否决方案」· 契约可执行 · 文档带创建日期 等
- 零知识冷读门（`templates/cold-read.md`）：另起只读 PACT 的 agent，
  其追问清单即规格漏洞
- 五种模式 `--new / --feature / --merge / --build / --audit`，两档完备度 `full / feature`
- `references/authoring-guide.md` 逐节精度标准 + 反例；
  `references/example-PACT.md` 通过全部机检的完整范例
- UI 项目可选校验：`token-lint.sh` · `visual-diff.mjs` · `computed-style.spec.ts`
