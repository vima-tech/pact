#!/usr/bin/env bash
# pact-status.sh — PACT 工序状态机检
#
#   用法: bash pact-status.sh [项目根目录] [--quiet]
#
# 检查六项：
#   1 骨架文件齐备（按工序进度动态要求：S1 完成则要 interview.md，S8 完成则要 cold-read.md …）
#   2 board.md 含 S0–S11 完整工序表
#   3 状态词合法（未开始/进行中/已完成/已跳过），且「已跳过」带理由
#   4 顺序合法（不能出现 S8 已完成而 S4 未开始）
#   5 冻结一致性（PACT.md 头部「已冻结」⇔ S9 已完成）
#   6 覆盖一致性（S10 已完成 ⇒ coverage.md 无「未实现 / 已实现(待验)」）
#
# 并输出「下一道该做的工序」。
# 退出码：0=全过（可能有 WARN） 1=有 FAIL 2=用法错误
set -uo pipefail

ROOT="."; QUIET=0
for a in "$@"; do
  case "$a" in
    --quiet)   QUIET=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  ROOT="$a" ;;
  esac
done
[[ -d "$ROOT" ]] || { echo "[FAIL] 目录不存在: $ROOT" >&2; exit 2; }

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACT="$ROOT/PACT.md"; BOARD="$ROOT/.pact/board.md"

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
[[ -f "$BOARD" ]] || { fail "缺 .pact/board.md —— 先跑工序 S0，从 $SKILL_DIR/templates/board.md 拷"; missing_core=1; }
if [[ $missing_core -eq 1 ]]; then
  echo; echo "══ 结果: FAIL（$FAILS 项）══"; echo "   下一步：执行工序 S0 · 定位与摄入"; exit 1
fi
pass "PACT.md 与 .pact/board.md 均存在"

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
base_of() { local s="$1"; s="${s%%（*}"; s="${s%%(*}"; echo "$s"; }
for i in $(seq 0 11); do
  [[ -z "${ST[$i]}" ]] && continue
  b="$(base_of "${ST[$i]}")"
  case "$b" in
    未开始|进行中|已完成|已跳过) ;;
    *) badword="$badword S$i(${ST[$i]})" ;;
  esac
  if [[ "$b" == "已跳过" ]]; then
    nt="${NOTE[$i]}"
    if [[ "${ST[$i]}" == "$b" && ( -z "$nt" || "$nt" == "-" || "$nt" == "—" ) ]]; then
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

done_ge 1  && req ".pact/interview.md"   "S1 已完成就必须有访谈记录"
done_ge 2  && req ".pact/source-merge.md" "S2 已完成就必须有差异裁定表"
done_ge 3  && req ".pact/assessment.md"  "S3 已完成就必须有八维评估"
done_ge 8  && req ".pact/cold-read.md"   "S8 已完成就必须有冷读门报告"
done_ge 9  && req ".pact/changelog.md"   "S9 冻结后的改动必须有处留痕"
active_ge 10 && req ".pact/coverage.md"  "S10 施工必须有 R-ID 覆盖审计表"
opt "CLAUDE.md" "建议有：讲清「怎么写代码」，与 PACT 的「写什么」分工"
[[ $FAILS -eq 0 ]] && say "         （按当前进度要求的文件均齐备）"

# ── 5 冻结一致性 ───────────────────────────────────────────────────────────
say "\n5 冻结一致性"
frozen_doc=0
# 冻结判据：头部出现「已冻结」且跟着真实日期。模板未填时是「草稿 / 已冻结 · <日期>」，
# 无日期数字，因此不会误判为已冻结。
head -40 "$PACT" | grep -qE '已冻结[^|]*[0-9]{4}-[0-9]{2}-[0-9]{2}' && frozen_doc=1
if done_ge 9; then
  (( frozen_doc == 1 )) && pass "S9 已完成，PACT.md 头部已标「已冻结」" \
    || fail "S9 标已完成，但 PACT.md 头部没有「已冻结」"
else
  (( frozen_doc == 0 )) && pass "尚未冻结，状态一致" \
    || fail "PACT.md 已标「已冻结」，但 S9 未完成  （冻结必须走 S8 三道门）"
fi

# ── 6 覆盖一致性 ───────────────────────────────────────────────────────────
say "\n6 覆盖一致性"
if done_ge 10 && [[ -f "$ROOT/.pact/coverage.md" ]]; then
  if grep -qE '未实现|已实现\(待验\)|已实现（待验）' "$ROOT/.pact/coverage.md"; then
    fail "S10 标已完成，但 coverage.md 里还有「未实现 / 已实现(待验)」的 R-ID"
  else
    pass "coverage.md 无未验证 R-ID"
  fi
else
  pass "（S10 未完成，暂不校验覆盖表）"
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
