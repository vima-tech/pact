#!/usr/bin/env bash
# pact-trace.sh — 实现↔规格 可追溯性机检（三方交叉比对）
#
#   用法: bash pact-trace.sh [项目根] [--require-complete] [--quiet]
#
# 交叉比对三个来源，让「严格按 PACT 落地」可机检而不是靠自觉：
#   ① PACT.md 的 P5   —— 规格声称要做的 R-ID
#   ② 代码里的 @pact 标注 —— 实际实现了的 R-ID
#   ③ .pact/coverage.md —— AI 声称的完成状态
#
# 报四类问题：
#   [FAIL] 虚报    coverage 标「已验证」，代码里却找不到该 R-ID 的标注
#   [FAIL] 野生    代码标了 P5 里不存在的 R-ID（笔误，或写了没进规格的功能）
#   [WARN] 漏登记  代码已实现，coverage.md 里没这一行
#   [INFO] 未实现  P5 有、代码无（施工中属正常；--require-complete 时升为 FAIL）
#
# 代码标注格式（任何语言的注释里都能写）：
#   // @pact R001            单个
#   // @pact R001,R002       多个
#   # @pact R014             Python/Shell
#   <!-- @pact R021 -->      模板
#
# 退出码：0=通过 1=有 FAIL 2=用法错误
set -uo pipefail

ROOT="."; QUIET=0; REQUIRE_COMPLETE=0
for a in "$@"; do
  case "$a" in
    --require-complete) REQUIRE_COMPLETE=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  ROOT="$a" ;;
  esac
done
[[ -d "$ROOT" ]] || { echo "[FAIL] 目录不存在: $ROOT" >&2; exit 2; }
PACT="$ROOT/PACT.md"; COV="$ROOT/.pact/coverage.md"
[[ -f "$PACT" ]] || { echo "[FAIL] 找不到 $PACT" >&2; exit 1; }

FAILS=0; WARNS=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
say()  { [[ $QUIET -eq 1 ]] || echo -e "$*"; }
pass() { say "  [PASS] $*"; }
info() { say "  [INFO] $*"; }
warn() { WARNS=$((WARNS+1)); say "  [WARN] $*"; }
fail() { FAILS=$((FAILS+1)); echo -e "  [FAIL] $*"; }
lst()  { tr '\n' ' ' < "$1" | sed 's/ $//'; }

say "\n══ PACT 可追溯性 · $ROOT ══\n"

# ── ① 规格：P5 声称要做的 R-ID ─────────────────────────────────────────────
awk '/<!--[[:space:]]*PACT:P5[[:space:]]*-->/{f=1;next} /<!--[[:space:]]*PACT:[A-Z][0-9]+[[:space:]]*-->/{f=0} f' \
  "$PACT" | grep -oE '\bR[0-9]{3}\b' | sort -u > "$TMP/spec"
n_spec=$(wc -l < "$TMP/spec" | tr -d ' ')
if [[ "$n_spec" -eq 0 ]]; then
  fail "PACT.md 的 P5 里没有任何 R-ID —— 先完成工序 S4"
  echo; echo "══ 结果: FAIL（$FAILS 项）══"; exit 1
fi

# ── ② 实现：代码里的 @pact 标注 ────────────────────────────────────────────
grep -rEnoI '@pact[[:space:]]+R[0-9]{3}([[:space:],]*R[0-9]{3})*' "$ROOT" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.pact \
  --exclude-dir=dist --exclude-dir=build --exclude-dir=target \
  --exclude-dir=vendor --exclude-dir=.next --exclude-dir=coverage \
  --exclude-dir=__pycache__ --exclude=PACT.md 2>/dev/null > "$TMP/hits" || true
grep -oE '\bR[0-9]{3}\b' "$TMP/hits" 2>/dev/null | sort -u > "$TMP/impl"
n_impl=$(wc -l < "$TMP/impl" | tr -d ' ')

# ── ③ 声称：coverage.md 里标「已验证」的 R-ID ──────────────────────────────
: > "$TMP/claimed"
if [[ -f "$COV" ]]; then
  grep -E '已验证' "$COV" | grep -oE '\bR[0-9]{3}\b' | sort -u > "$TMP/claimed"
fi
: > "$TMP/incov"
[[ -f "$COV" ]] && grep -oE '\bR[0-9]{3}\b' "$COV" | sort -u > "$TMP/incov"

say "来源统计：规格 P5 = $n_spec 个 R-ID · 代码标注 = $n_impl 个 · coverage 标已验证 = $(wc -l < "$TMP/claimed" | tr -d ' ') 个\n"

# ── 检查 1 · 虚报（最严重）─────────────────────────────────────────────────
say "1 虚报检查（coverage 说已验证，代码里有没有）"
comm -23 "$TMP/claimed" "$TMP/impl" > "$TMP/ghost"
if [[ -s "$TMP/ghost" ]]; then
  fail "以下 R-ID 在 coverage.md 标了「已验证」，但代码里找不到 @pact 标注：$(lst "$TMP/ghost")"
  say "         → 要么补上代码标注，要么把状态改回实情。**不许虚报。**"
else
  pass "无虚报"
fi

# ── 检查 2 · 野生 R-ID ─────────────────────────────────────────────────────
say "\n2 野生 R-ID（代码标了，规格里没有）"
comm -13 "$TMP/spec" "$TMP/impl" > "$TMP/wild"
if [[ -s "$TMP/wild" ]]; then
  fail "代码标注了 P5 中不存在的 R-ID：$(lst "$TMP/wild")"
  say "         → 笔误就改；确实是新功能，走 S10-CR：回 P5 加条目 + T1 补验收 + 记 changelog。"
  grep -E "$(sed 's/.*/&/' "$TMP/wild" | paste -sd'|')" "$TMP/hits" 2>/dev/null | head -5 | sed 's/^/         /'
else
  pass "无野生 R-ID"
fi

# ── 检查 3 · 漏登记 ────────────────────────────────────────────────────────
say "\n3 漏登记（代码已实现，coverage.md 没记）"
comm -23 "$TMP/impl" "$TMP/incov" > "$TMP/unlogged"
if [[ -s "$TMP/unlogged" ]]; then
  warn "以下 R-ID 代码里有标注，但 coverage.md 无对应行：$(lst "$TMP/unlogged")"
else
  pass "代码标注均已登记"
fi

# ── 检查 4 · 未实现 ────────────────────────────────────────────────────────
say "\n4 未实现（P5 有，代码里还没有）"
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
  echo "   可追溯性是「严格按 PACT 落地」的底线：规格、代码、覆盖表三者必须对得上。"
  exit 1
fi
