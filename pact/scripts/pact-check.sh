#!/usr/bin/env bash
# pact-check.sh — /pact-check 的机检聚合器：一条命令回答「这份 pact 物料本身完备吗、有没有问题和遗漏」
#
#   用法: bash pact-check.sh [物料目录] [--quiet]
#
#   未给目录时自动扫描 ./.pact/*/PACT.md：恰一份 → 直接用；多份 → 列出候选并退出 3。
#
# 与 pact-review.sh 的分工：
#   pact-check.sh   查**物料质量**（规格写够了没有、结构合法吗、生成物漂移了没有）——不看实现进度
#   pact-review.sh  查**实现完成度**（代码真按规格做完了没有）——完成度 100% 才 PASS
#
# 依次跑（全过才 PASS）：
#   ① pact-status.sh              工序状态：无跳步、无静默略过、冻结一致
#   ② pact-lint.sh                规格完备性（--level 取自 PACT.md 头部「完备度档位」，默认 full）
#      + star-consistency.sh      （PACT 里有 ★ 时）P5↔T1 的 ★ 集合一致
#   ③ pact-graph.mjs              执行图谱结构校验（DAG 无环、R-ID 全承接；**不要求完成度**）
#   ④ pact-book.sh --check        知识库与真源无漂移
#   ③④ 的产物在 S8/S9 才生成：未冻结的 pact 缺它们只 WARN，已冻结的缺了就 FAIL。
#
# 机检之外还有两道**必须由 agent 执行**的检查（本脚本管不了，/pact-check 的指令会带着跑）：
#   · 物料反扫 —— 拿全部输入物料反向对照 PACT，找 未覆盖/部分覆盖/偏离
#   · 零知识冷读门 —— 另起全新 agent 只读 PACT.md，看它能否不追问就开工
#
# 退出码：0=全部通过 1=有 FAIL 2=用法错误 3=发现多份物料需指定
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/pact-resolve.sh"

DIR=""; QUIET=""
for a in "$@"; do
  case "$a" in
    --quiet)   QUIET="--quiet" ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \?//'; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  DIR="$a" ;;
  esac
done

DIR="$(resolve_pact_dir "$DIR")" || exit $?
PACT="$DIR/PACT.md"

FROZEN=0
head -40 "$PACT" | grep -qE '已冻结[^|]*[0-9]{4}-[0-9]{2}-[0-9]{2}' && FROZEN=1

GATES=0; FAILED=(); WARNED=()
gate() {  # gate <名称> <命令...>
  local name="$1"; shift
  GATES=$((GATES+1))
  echo
  echo "── 检 $GATES · $name ──"
  if "$@"; then echo "   → PASS"; else FAILED+=("$name"); echo "   → FAIL"; fi
}

echo "══ PACT 物料完备性体检 · $DIR（$([[ $FROZEN -eq 1 ]] && echo 已冻结 || echo 未冻结)）══"

LEVEL="full"
grep -m1 '完备度档位' "$PACT" 2>/dev/null | grep -q 'feature' && LEVEL="feature"

gate "工序状态 (pact-status)"  bash "$SKILL_DIR/scripts/pact-status.sh" "$DIR" $QUIET
gate "规格完备性 (pact-lint --level=$LEVEL)" bash "$SKILL_DIR/scripts/pact-lint.sh" "$PACT" --level="$LEVEL" $QUIET
if grep -q '★' "$PACT"; then
  gate "★ 一致性 (star-consistency)" bash "$SKILL_DIR/scripts/star-consistency.sh" "$PACT" $QUIET
fi

if command -v node >/dev/null 2>&1; then
  if [[ -f "$DIR/action-graph.json" ]]; then
    gate "执行图谱结构 (pact-graph)" node "$SKILL_DIR/scripts/pact-graph.mjs" "$DIR" $QUIET
  elif [[ $FROZEN -eq 1 ]]; then
    FAILED+=("执行图谱缺失"); echo; echo "── 已冻结却没有 action-graph.json —— S9 没做完，无法据此施工 → FAIL ──"
  else
    WARNED+=("执行图谱未生成（未冻结，S9 时生成）")
  fi
  if [[ -d "$DIR/pact-book" ]]; then
    gate "知识库无漂移 (pact-book --check)" bash "$SKILL_DIR/scripts/pact-book.sh" "$PACT" --check $QUIET
  elif [[ $FROZEN -eq 1 ]]; then
    FAILED+=("知识库缺失"); echo; echo "── 已冻结却没有 pact-book/ —— S8 第④门没过 → FAIL ──"
  else
    WARNED+=("知识库未生成（未冻结，S8 时生成）")
  fi
else
  WARNED+=("缺 node：执行图谱与知识库两道检无法机检")
fi

echo
for w in ${WARNED[@]+"${WARNED[@]}"}; do echo "  [WARN] $w"; done
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "══ 体检结果: PASS（机检部分）══"
  echo "   机检只覆盖结构完备性。剩余两道由 agent 执行：物料反扫 + 零知识冷读门"
  echo "   （冷读 prompt 见 $SKILL_DIR/templates/cold-read.md）。"
  exit 0
else
  echo "══ 体检结果: FAIL —— 未通过：${FAILED[*]} ══"
  exit 1
fi
