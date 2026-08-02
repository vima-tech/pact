#!/usr/bin/env bash
# pact-status.sh — PACT 工序状态机检
#
#   用法: bash pact-status.sh [物料目录] [--quiet]
#
#   物料目录 = .pact/<slug>/（含 PACT.md 与 board.md）。未给时自动扫描 ./.pact/*/PACT.md：
#   恰一份 → 直接用；多份 → 列出候选退出 3，由调用方让用户选择后带路径重跑。
#
# 检查六项（顺序与输出一致）：
#   1 board.md 含 S0–S11 完整工序表
#   2 状态词合法（未开始/进行中/已完成/已跳过），且「已跳过」带理由
#   3 顺序合法（不能出现 S8 已完成而 S4 未开始）
#   4 骨架文件齐备（按进度动态要求：S1 完成则要 interview.md，S8 完成则要 cold-read.md …）
#   5 冻结一致性（S9 已完成 ⇔ PACT.md 头部「已冻结」；S9 已跳过则不强检）
#   6 覆盖一致性（S10 已完成 ⇒ action-graph.json 完成度 100%）
#
# 并输出「下一道该做的工序」。
# 退出码：0=全过（可能有 WARN） 1=有 FAIL 2=用法错误 3=发现多份物料需指定
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/pact-resolve.sh"

ROOT=""; QUIET=0
for a in "$@"; do
  case "$a" in
    --quiet)   QUIET=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  ROOT="$a" ;;
  esac
done

# 兼容一种常见误用：给了项目根而不是物料目录
if [[ -n "$ROOT" && -d "$ROOT" && ! -f "$ROOT/PACT.md" ]]; then
  sub="$(cd "$ROOT" && resolve_pact_dir "")" || exit $?
  ROOT="$ROOT/$sub"
fi
ROOT="$(resolve_pact_dir "$ROOT")" || exit $?
PACT="$ROOT/PACT.md"; BOARD="$ROOT/board.md"

FAILS=0; WARNS=0
say()  { [[ $QUIET -eq 1 ]] || echo -e "$*"; }
pass() { say "  [PASS] $*"; }
warn() { WARNS=$((WARNS+1)); say "  [WARN] $*"; }
fail() { FAILS=$((FAILS+1)); echo -e "  [FAIL] $*"; }

NAMES=(定位与摄入 访谈门 熔合门 存量评估 "写 P 层" "写 A 层" "写 C 层" "写 T 层" 完备性门 冻结 "施工 LOOP" 收尾自检门)

say "\n══ PACT 工序状态 · $ROOT ══\n"

# ── 0 前置：两个真相源必须在 ────────────────────────────────────────────────
say "0 真相源"
missing_core=0
[[ -f "$PACT"  ]] || { fail "缺 PACT.md —— 先跑工序 S0 建骨架"; missing_core=1; }
[[ -f "$BOARD" ]] || { fail "缺 board.md —— 先跑工序 S0，从 $SKILL_DIR/templates/board.md 拷"; missing_core=1; }
if [[ $missing_core -eq 1 ]]; then
  echo; echo "══ 结果: FAIL（$FAILS 项）══"; echo "   下一步：执行工序 S0 · 定位与摄入"; exit 1
fi
pass "PACT.md 与 board.md 均存在"

# ── 1 解析工序表 ───────────────────────────────────────────────────────────
say "\n1 工序表解析"
declare -a ST NOTE
for i in $(seq 0 11); do ST[$i]=""; NOTE[$i]=""; done
while IFS=$'\t' read -r id st note; do
  n="${id#S}"
  [[ "$n" =~ ^[0-9]+$ ]] || continue
  (( n >= 0 && n <= 11 )) || continue
  ST[$n]="$st"; NOTE[$n]="$note"
done < <(awk -F'|' '
  /^[[:space:]]*\|[[:space:]]*S[0-9]+[[:space:]]*\|/ {
    id=$2; st=$4; note=$5
    gsub(/^[ \t]+|[ \t]+$/,"",id); gsub(/^[ \t]+|[ \t]+$/,"",st); gsub(/^[ \t]+|[ \t]+$/,"",note)
    print id "\t" st "\t" note
  }' "$BOARD")

absent=""
for i in $(seq 0 11); do [[ -z "${ST[$i]}" ]] && absent="$absent S$i"; done
if [[ -n "$absent" ]]; then
  fail "工序表缺行:$absent  （board.md 必须含 S0–S11 全部十二行）"
else
  pass "S0–S11 十二道工序均在表内"
fi

# ── 2 状态词合法性 + 跳过需带理由 ──────────────────────────────────────────
say "\n2 状态词与跳过理由"
badword=""; noreason=""
base_of() {  # 取状态词前缀，容忍其后跟任意理由文字（括号、破折号、空格皆可）
  case "$1" in
    未开始*) echo 未开始 ;; 进行中*) echo 进行中 ;;
    已完成*) echo 已完成 ;; 已跳过*) echo 已跳过 ;;
    *) echo "$1" ;;
  esac
}
for i in $(seq 0 11); do
  [[ -z "${ST[$i]}" ]] && continue
  b="$(base_of "${ST[$i]}")"
  case "$b" in
    未开始|进行中|已完成|已跳过) ;;
    *) badword="$badword S$i(${ST[$i]})" ;;
  esac
  if [[ "$b" == "已跳过" ]]; then
    nt="${NOTE[$i]}"
    # 理由可写在状态格（「已跳过 …」）或备注列，二者有其一即可
    if [[ "${ST[$i]}" == "已跳过" && ( -z "$nt" || "$nt" == "-" || "$nt" == "—" ) ]]; then
      noreason="$noreason S$i"
    fi
  fi
done
[[ -z "$badword" ]] && pass "状态词均合法" \
  || fail "非法状态词:$badword  （只许 未开始/进行中/已完成/已跳过）"
[[ -z "$noreason" ]] && pass "跳过项均带理由" \
  || fail "以下工序标了「已跳过」但没写理由:$noreason  （静默略过 = 违反协议）"

# ── 3 顺序合法性 ───────────────────────────────────────────────────────────
say "\n3 顺序合法性"
maxactive=-1
for i in $(seq 0 11); do
  b="$(base_of "${ST[$i]:-未开始}")"
  [[ "$b" == "已完成" || "$b" == "进行中" ]] && maxactive=$i
done
jump=""
if (( maxactive >= 0 )); then
  for i in $(seq 0 $((maxactive-1))); do
    b="$(base_of "${ST[$i]:-未开始}")"
    [[ "$b" == "已完成" || "$b" == "已跳过" ]] || jump="$jump S$i($b)"
  done
fi
[[ -z "$jump" ]] && pass "无跳步（已推进到 S$maxactive，其前序均已收敛）" \
  || fail "跳步:$jump 未收敛，却已推进到 S$maxactive  （工序必须逐道收敛）"

running=0
for i in $(seq 0 11); do [[ "$(base_of "${ST[$i]:-}")" == "进行中" ]] && running=$((running+1)); done
(( running <= 1 )) && pass "同时进行中的工序数 = $running" \
  || warn "有 $running 道工序同时「进行中」——一次只做一道"

# ── 4 骨架文件（按进度动态要求） ───────────────────────────────────────────
say "\n4 骨架文件"
done_ge() { local b; b="$(base_of "${ST[$1]:-未开始}")"; [[ "$b" == "已完成" ]]; }
active_ge() { local b; b="$(base_of "${ST[$1]:-未开始}")"; [[ "$b" == "已完成" || "$b" == "进行中" ]]; }
req() {  # req <文件> <说明>
  [[ -f "$ROOT/$1" ]] && { pass "$1 在"; return; }
  fail "缺 $1 —— $2"
}
opt() { [[ -f "$ROOT/$1" ]] || warn "缺 $1 —— $2"; }

done_ge 1  && req "interview.md"   "S1 已完成就必须有访谈记录"
done_ge 2  && req "source-merge.md" "S2 已完成就必须有差异裁定表"
done_ge 3  && req "assessment.md"  "S3 已完成就必须有八维评估"
done_ge 7  && opt "estimate.md"   "S7 写完 T 层就该过估算门（需对外报价/排期时必做；纯内部项目可在 board 标已跳过）"
done_ge 8  && req "cold-read.md"   "S8 已完成就必须有冷读门报告"
done_ge 9  && req "changelog.md"   "S9 冻结后的改动必须有处留痕"
active_ge 10 && req "action-graph.json"  "S10 施工必须有执行图谱（/pact-new 冻结时生成）"
[[ -f "$(project_root_of "$ROOT")/CLAUDE.md" ]] || warn "缺项目根 CLAUDE.md —— 建议有：讲清「怎么写代码」，与 PACT 的「写什么」分工"
[[ $FAILS -eq 0 ]] && say "         （按当前进度要求的文件均齐备）"

# ── 5 冻结一致性 ───────────────────────────────────────────────────────────
say "\n5 冻结一致性"
frozen_doc=0
# 冻结判据：头部出现「已冻结」且跟着真实日期。模板未填时是「草稿 / 已冻结 · <日期>」，
# 无日期数字，因此不会误判为已冻结。
head -40 "$PACT" | grep -qE '已冻结[^|]*[0-9]{4}-[0-9]{2}-[0-9]{2}' && frozen_doc=1
s9="$(base_of "${ST[9]:-未开始}")"
case "$s9" in
  已完成)
    (( frozen_doc == 1 )) && pass "S9 已完成，PACT.md 头部已标「已冻结」" \
      || fail "S9 标已完成，但 PACT.md 头部没有「已冻结」" ;;
  已跳过)
    # /pact-run 直进施工（规格上轮已冻结）/ /pact-check 只体检不冻结 的正常形态，不做强检
    pass "S9 已跳过（${NOTE[9]:-见 board 备注}）——冻结一致性交人工核对" ;;
  *)
    (( frozen_doc == 0 )) && pass "尚未冻结，状态一致" \
      || fail "PACT.md 已标「已冻结」，但 S9 未走完  （冻结必须先过 S8 完备性门）" ;;
esac

# ── 6 覆盖一致性 ───────────────────────────────────────────────────────────
say "\n6 覆盖一致性"
if done_ge 10 && [[ -f "$ROOT/action-graph.json" ]]; then
  if command -v node >/dev/null 2>&1; then
    if node "$SKILL_DIR/scripts/pact-graph.mjs" "$ROOT" --require-complete --quiet >/dev/null 2>&1; then
      pass "执行图谱完成度 100%"
    else
      fail "S10 标已完成，但 action-graph.json 完成度不足 100%（或图谱结构非法）——跑 pact-graph.mjs 看明细"
    fi
  else
    warn "缺 node，无法校验执行图谱完成度"
  fi
else
  pass "（S10 未完成，暂不校验执行图谱）"
fi

# ── 汇总 + 下一道 ──────────────────────────────────────────────────────────
say ""
say "── 工序进度 ──"
for i in $(seq 0 11); do
  b="$(base_of "${ST[$i]:-未开始}")"
  case "$b" in
    已完成) m="✅" ;; 进行中) m="▶️ " ;; 已跳过) m="⏭️ " ;; *) m="⬜" ;;
  esac
  say "  $m S$i ${NAMES[$i]} — ${ST[$i]:-未开始}${NOTE[$i]:+  · ${NOTE[$i]}}"
done

next=""
for i in $(seq 0 11); do
  b="$(base_of "${ST[$i]:-未开始}")"
  if [[ "$b" == "进行中" ]]; then next="S$i ${NAMES[$i]}（继续）"; break; fi
  if [[ "$b" == "未开始" ]]; then next="S$i ${NAMES[$i]}"; break; fi
done

echo
if [[ $FAILS -eq 0 ]]; then
  echo "══ 结果: PASS（${WARNS} 个 WARN）══"
  if [[ -n "$next" ]]; then
    echo "   下一道：$next"
    echo "   开工前读工序卡：$SKILL_DIR/references/agent-protocol.md"
  else
    echo "   全部十二道工序已收敛。别忘了 pact-lint.sh 与末次冷读门。"
  fi
  exit 0
else
  echo "══ 结果: FAIL（${FAILS} 项不通过，${WARNS} 个 WARN）══"
  [[ -n "$next" ]] && echo "   当前应在：$next"
  echo "   工序协议见：$SKILL_DIR/references/agent-protocol.md"
  exit 1
fi
