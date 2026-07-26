# PACT 进度看板

> 创建日期: <YYYY-MM-DD>

- 模式：`--new` / `--feature` / `--merge` / `--build` / `--audit`
- 档位：`--level=full` / `feature`
- 规格：`PACT.md`（状态：草稿 / 已冻结 · <日期>）
- 启动命令：`<npm run dev / cargo run / ...>`

## 当前阶段
> 例：阶段 7 LOOP · 里程碑 M0 · 正在做「权限过滤」单元

## 闸门状态
- [ ] 访谈门通过（`.pact/interview.md` OPEN 清零）
- [ ] 熔合门通过（`.pact/source-merge.md` 全部 DIFF 已裁定）
- [ ] 存量评估完成（`.pact/assessment.md`，仅 `--feature`）
- [ ] 完备性门 ① lint 全绿
- [ ] 完备性门 ② 反扫无遗漏
- [ ] 完备性门 ③ 冷读门 PASS（`.pact/cold-read.md`）
- [ ] **已冻结**
- [ ] 收尾自检门全绿

## 工作单元队列（按 T5 里程碑顺序）
- [ ] M0-U1 登录与会话 → R001, R002
- [ ] M0-U2 权限过滤 → R002, R010–R014
- [ ] M1-U3 主列表页 → R003, R004

## 本轮
- 做了：
- 验收结果：
- 下一个：
- 阻塞：

## 高风险项汇总（供随时复核）
> `P5` 里 `假设` 非空的条目、验收标准模糊的条目、`来源=目测` 的设计值、
> `A5` 中理由较弱的决策。
