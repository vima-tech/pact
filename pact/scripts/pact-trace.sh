#!/usr/bin/env bash
# pact-trace.sh — 实现↔规格 可追溯性机检（三方交叉比对）
#
#   用法: bash pact-trace.sh [物料目录] [--require-complete] [--quiet]
#
#   物料目录 = .pact/<slug>/（含 PACT.md 与 action-graph.json）。未给时自动扫描
#   ./.pact/*/PACT.md：恰一份 → 直接用；多份 → 列出候选退出 3，指定后重跑。
#   代码扫描范围 = 物料目录反推出的项目根（.pact/ 的上一级）。
#
# 交叉比对三个来源，让「严格按 PACT 落地」可机检而不是靠自觉：
#   ① PACT.md 的 P5        —— 规格声称要做的 R-ID
#   ② 代码里的 @pact 标注   —— 实际实现了的 R-ID
#   ③ action-graph.json    —— 图谱声称已完成的 R-ID（该 R-ID 全部 step 完成）
#
# 报三类问题：
#   [FAIL] 虚报    图谱标「完成」，代码里却找不到该 R-ID 的标注
#   [FAIL] 野生    代码标了任何一份 pact 物料的 P5 里都不存在的 R-ID
#   [INFO] 未实现  本 pact 的 P5 有、代码无（施工中属正常；--require-complete 时升为 FAIL）
#
# 代码标注格式（任何语言的注释里都能写）：
#   // @pact R001            单个
#   // @pact R001,R002       多个
#   # @pact R014             Python/Shell
#   <!-- @pact R021 -->      模板
#
# 退出码：0=通过 1=有 FAIL 2=用法错误 3=发现多份物料需指定
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/pact-resolve.sh"

DIR=""; QUIET=0; REQUIRE_COMPLETE=0
for a in "$@"; do
  case "$a" in
    --require-complete) REQUIRE_COMPLETE=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  DIR="$a" ;;
  esac
done
DIR="$(resolve_pact_dir "$DIR")" || exit $?
PACT="$DIR/PACT.md"
CODE_ROOT="$(project_root_of "$DIR")"

FAILS=0; WARNS=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
say()  { [[ $QUIET -eq 1 ]] || echo -e "$*"; }
pass() { say "  [PASS] $*"; }
info() { say "  [INFO] $*"; }
warn() { WARNS=$((WARNS+1)); say "  [WARN] $*"; }
fail() { FAILS=$((FAILS+1)); echo -e "  [FAIL] $*"; }
lst()  { tr '\n' ' ' < "$1" | sed 's/ $//'; }

say "\n══ PACT 可追溯性 · $DIR（代码根: $CODE_ROOT）══\n"

# ── ① 规格：本 pact 的 P5 声称要做的 R-ID ─────────────────────────────────
p5_rids() {  # p5_rids <PACT.md>
  awk '/<!--[[:space:]]*PACT:P5[[:space:]]*-->/{f=1;next} /<!--[[:space:]]*PACT:[A-Z][0-9]+[[:space:]]*-->/{f=0} f' \
    "$1" | grep -oE '\bR[0-9]{3}\b'
}
p5_rids "$PACT" | sort -u > "$TMP/spec"
n_spec=$(wc -l < "$TMP/spec" | tr -d ' ')
if [[ "$n_spec" -eq 0 ]]; then
  fail "PACT.md 的 P5 里没有任何 R-ID —— 先完成工序 S4"
  echo; echo "══ 结果: FAIL（$FAILS 项）══"; exit 1
fi

# 野生判定用「全部 pact 物料的 P5 并集」——同一项目多份 pact 时，别的 pact 的
# R-ID 出现在代码里是正常的（R-ID 号段全项目唯一，见 /pact-new 的起号规则）
cp "$TMP/spec" "$TMP/spec-all"
for p in "$CODE_ROOT"/.pact/*/PACT.md; do
  [[ -f "$p" && "$p" -ef "$PACT" ]] && continue
  [[ -f "$p" ]] && p5_rids "$p" >> "$TMP/spec-all"
done
sort -u -o "$TMP/spec-all" "$TMP/spec-all"

# ── ② 实现：代码里的 @pact 标注 ────────────────────────────────────────────
grep -rEnoI '@pact[[:space:]]+R[0-9]{3}([[:space:],]*R[0-9]{3})*' "$CODE_ROOT" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.pact \
  --exclude-dir=dist --exclude-dir=build --exclude-dir=target \
  --exclude-dir=vendor --exclude-dir=.next --exclude-dir=coverage \
  --exclude-dir=__pycache__ 2>/dev/null > "$TMP/hits" || true
grep -oE '\bR[0-9]{3}\b' "$TMP/hits" 2>/dev/null | sort -u > "$TMP/impl"
n_impl=$(wc -l < "$TMP/impl" | tr -d ' ')

# ── ③ 声称：图谱里已完成的 R-ID ────────────────────────────────────────────
: > "$TMP/claimed"; graph_ok=0
if [[ -f "$DIR/action-graph.json" ]]; then
  if command -v node >/dev/null 2>&1; then
    if node "$SKILL_DIR/scripts/pact-graph.mjs" "$DIR" --done-rids 2>/dev/null | sort -u > "$TMP/claimed"; then
      graph_ok=1
    else
      warn "action-graph.json 结构非法，无法取「声称完成」集合（先跑 pact-graph.mjs 修图谱）"
    fi
  else
    warn "缺 node，跳过图谱侧比对（虚报检查不完整）"
  fi
else
  info "尚无 action-graph.json（S9 冻结时由 /pact-new 生成）——跳过图谱侧比对"
fi

say "来源统计：规格 P5 = $n_spec 个 R-ID · 代码标注 = $n_impl 个 · 图谱标完成 = $(wc -l < "$TMP/claimed" | tr -d ' ') 个\n"

# ── 检查 1 · 虚报（最严重）─────────────────────────────────────────────────
say "1 虚报检查（图谱说完成了，代码里有没有）"
if [[ $graph_ok -eq 1 ]]; then
  comm -23 "$TMP/claimed" "$TMP/impl" > "$TMP/ghost"
  if [[ -s "$TMP/ghost" ]]; then
    fail "以下 R-ID 在图谱里标了完成，但代码里找不到 @pact 标注：$(lst "$TMP/ghost")"
    say "         → 要么补上代码标注，要么把 step 状态改回实情。**不许虚报。**"
  else
    pass "无虚报"
  fi
else
  info "（图谱不可用，本项跳过）"
fi

# ── 检查 2 · 野生 R-ID ─────────────────────────────────────────────────────
say "\n2 野生 R-ID（代码标了，所有 pact 物料的规格里都没有）"
comm -13 "$TMP/spec-all" "$TMP/impl" > "$TMP/wild"
if [[ -s "$TMP/wild" ]]; then
  fail "代码标注了任何 P5 中都不存在的 R-ID：$(lst "$TMP/wild")"
  say "         → 笔误就改；确实是新功能，走 S10-CR：回 P5 加条目 + T1 补验收 + 记 changelog。"
  grep -E "$(sed 's/.*/&/' "$TMP/wild" | paste -sd'|')" "$TMP/hits" 2>/dev/null | head -5 | sed 's/^/         /'
else
  pass "无野生 R-ID"
fi

# ── 检查 3 · 未实现 ────────────────────────────────────────────────────────
say "\n3 未实现（本 pact 的 P5 有，代码里还没有）"
comm -23 "$TMP/spec" "$TMP/impl" > "$TMP/todo"
n_todo=$(wc -l < "$TMP/todo" | tr -d ' ')
if [[ "$n_todo" -eq 0 ]]; then
  pass "P5 的 $n_spec 个 R-ID 全部有代码标注"
elif [[ $REQUIRE_COMPLETE -eq 1 ]]; then
  fail "还有 $n_todo 个 R-ID 未实现：$(lst "$TMP/todo")  （--require-complete 下不允许）"
else
  info "还有 $n_todo 个 R-ID 未实现：$(lst "$TMP/todo")"
fi

# ── 汇总 ───────────────────────────────────────────────────────────────────
done_n=$((n_spec - n_todo))
pct=$(( n_spec > 0 ? done_n * 100 / n_spec : 0 ))
say "\n── 实现进度 ──"
say "  $done_n / $n_spec 个 R-ID 有代码标注（${pct}%）"
if [[ -s "$TMP/hits" ]]; then
  say "\n── R-ID → 代码位置（前 20 条）──"
  [[ $QUIET -eq 1 ]] || sed 's/^/  /' "$TMP/hits" | head -20
fi

echo
if [[ $FAILS -eq 0 ]]; then
  echo "══ 结果: PASS（${WARNS} 个 WARN）══"
  [[ "$n_todo" -gt 0 ]] && echo "   施工未完成：还剩 $n_todo 个 R-ID。收尾时用 --require-complete 复核。"
  exit 0
else
  echo "══ 结果: FAIL（${FAILS} 项不通过，${WARNS} 个 WARN）══"
  echo "   可追溯性是「严格按 PACT 落地」的底线：规格、代码、执行图谱三者必须对得上。"
  exit 1
fi
