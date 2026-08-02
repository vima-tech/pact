#!/usr/bin/env bash
# pact-review.sh — /pact-review 的机检聚合器：一条命令回答「这份 pact 全部实现了吗」
#
#   用法: bash pact-review.sh [物料目录] [--quiet]
#
#   未给目录时自动扫描 ./.pact/*/PACT.md：恰一份 → 直接用；多份 → 列出候选并退出 3，
#   由调用方让用户选择后带路径重跑。
#
# 依次跑五道门（全过才 PASS）：
#   ① pact-status.sh          工序状态：无跳步、无静默略过、冻结一致
#   ② pact-lint.sh            规格完备性（--level 取自 PACT.md 头部「完备度档位」，默认 full）
#      + star-consistency.sh  （PACT 里有 ★ 时）P5↔T1 的 ★ 集合一致
#   ③ pact-graph.mjs --require-complete   执行图谱：结构合法 + 完成度 100%
#   ④ pact-trace.sh --require-complete    规格 ↔ 代码 @pact 标注 ↔ 图谱 三方交叉比对
#   ⑤ pact-book.sh --check                知识库与真源无漂移
#
# **它是 /pact-run 的停止判据：本脚本 exit 0（完成度 100%）之前，/pact-run 不许停。**
#
# 退出码：0=全部通过且完成度 100% 1=有 FAIL 2=用法错误 3=发现多份物料需指定
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/pact-resolve.sh"

DIR=""; QUIET=""
for a in "$@"; do
  case "$a" in
    --quiet)   QUIET="--quiet" ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \?//'; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  DIR="$a" ;;
  esac
done

DIR="$(resolve_pact_dir "$DIR")" || exit $?
PACT="$DIR/PACT.md"

GATES=0; FAILED=()
gate() {  # gate <名称> <命令...>
  local name="$1"; shift
  GATES=$((GATES+1))
  echo
  echo "── 门 $GATES · $name ──"
  if "$@"; then echo "   → PASS"; else FAILED+=("$name"); echo "   → FAIL"; fi
}

echo "══ PACT 完成度审查 · $DIR ══"

# --level 取自 PACT.md 头部「完备度档位」那一行；没写按 full
LEVEL="full"
grep -m1 '完备度档位' "$PACT" 2>/dev/null | grep -q 'feature' && LEVEL="feature"

gate "工序状态 (pact-status)"  bash "$SKILL_DIR/scripts/pact-status.sh" "$DIR" $QUIET
gate "规格完备性 (pact-lint --level=$LEVEL)" bash "$SKILL_DIR/scripts/pact-lint.sh" "$PACT" --level="$LEVEL" $QUIET
if grep -q '★' "$PACT"; then
  gate "★ 一致性 (star-consistency)" bash "$SKILL_DIR/scripts/star-consistency.sh" "$PACT" $QUIET
fi
if command -v node >/dev/null 2>&1; then
  gate "执行图谱 100% (pact-graph)" node "$SKILL_DIR/scripts/pact-graph.mjs" "$DIR" --require-complete $QUIET
  gate "知识库无漂移 (pact-book --check)" bash "$SKILL_DIR/scripts/pact-book.sh" "$PACT" --check $QUIET
else
  FAILED+=("执行图谱/知识库（缺 node，无法机检）")
  echo; echo "── 缺 node：执行图谱与知识库两道门无法机检，直接判 FAIL ──"
fi
gate "可追溯性 (pact-trace --require-complete)" bash "$SKILL_DIR/scripts/pact-trace.sh" "$DIR" --require-complete $QUIET

echo
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "══ 审查结果: PASS —— 全部门通过，完成度 100%，/pact-run 可以收尾 ══"
  exit 0
else
  echo "══ 审查结果: FAIL —— 未通过：${FAILED[*]} ══"
  echo "   完成度未到 100% 之前，/pact-run 不得停止。"
  exit 1
fi
