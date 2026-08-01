#!/usr/bin/env bash
# pact-lint.sh — PACT.md 完备性机检
#
#   用法: bash pact-lint.sh [PACT.md] [--level=full|feature] [--quiet]
#
# 检查九项：
#   1 文件头有 创建日期(YYYY-MM-DD)
#   2 有「四层 → 本文位置」映射（Product/Architecture/Contracts/Tests 四词齐备）
#   3 三十个锚点 <!-- PACT:xx --> 全部存在
#   4 必填锚点非空；可选锚点若为 N/A 必须带理由
#   5 无占位符（TBD/TODO/FIXME/XXX/???/待定/待补/待填/待确认）—— 反引号内与代码块内不计
#   6 P5 的每个 R-ID 都被 T1 验收覆盖
#   7 A5 每条 D-ID 四件套齐全（选项/结论/理由/已否决，且有实质内容）
#   8 C1 / C4 契约可执行（含表格或代码块）
#   9 [WARN] 残留尖括号占位符 <...>
#  10 [WARN] P7 声称了工期/团队/周期，却没有 .pact/estimate.md（估算门缺席）
#
# 退出码：0=全过（可能有 WARN） 1=有 FAIL 2=用法错误
set -uo pipefail

# 本脚本所在 skill 的根目录（scripts/ 的上一级），用于指路，不依赖安装位置
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILE="PACT.md"; LEVEL="full"; QUIET=0
for a in "$@"; do
  case "$a" in
    --level=*) LEVEL="${a#--level=}" ;;
    --quiet)   QUIET=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  FILE="$a" ;;
  esac
done
[[ "$LEVEL" == "full" || "$LEVEL" == "feature" ]] || { echo "--level 只能是 full 或 feature" >&2; exit 2; }
[[ -f "$FILE" ]] || { echo "[FAIL] 找不到文件: $FILE" >&2; exit 1; }

ALL_ANCHORS="P1 P2 P3 P4 P5 P6 P7 P8 A1 A2 A3 A4 A5 A6 C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 T1 T2 T3 T4 T5"
if [[ "$LEVEL" == "full" ]]; then
  REQUIRED="P1 P2 P3 P4 P5 P6 P7 P8 A1 A2 A3 A4 A5 A6 C1 C2 C3 C4 C6 C7 C8 T1 T2 T3 T4 T5"
else
  REQUIRED="P1 P2 P4 P5 P6 P7 A2 A3 A5 C1 C4 C8 T1 T3 T4 T5"
fi

FAILS=0; WARNS=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
say()  { [[ $QUIET -eq 1 ]] || echo -e "$*"; }
pass() { say "  [PASS] $*"; }
warn() { WARNS=$((WARNS+1)); say "  [WARN] $*"; }
fail() { FAILS=$((FAILS+1)); echo -e "  [FAIL] $*"; }

# ── 切块：把每个锚点到下一个锚点之间的正文写成独立文件 ────────────────────
awk -v out="$TMP" '
  match($0, /<!--[[:space:]]*PACT:[A-Z][0-9]+[[:space:]]*-->/) {
    seg = substr($0, RSTART, RLENGTH)
    match(seg, /[A-Z][0-9]+/)
    cur = substr(seg, RSTART, RLENGTH)
    f = out "/" cur ".block"
    printf "" > f
    next
  }
  cur != "" { print >> (out "/" cur ".block") }
' "$FILE"

# 去掉代码块与行内代码后的正文（供占位符扫描；保留行号）
awk '
  /^[[:space:]]*```/ { inf = !inf; print ""; next }
  inf { print ""; next }
  { line = $0
    # 整行剥掉单行 HTML 注释
    gsub(/<!--.*-->/, "", line)
    # 跨行 HTML 注释：进入后整段不计
    if (!inc && line ~ /<!--/) { sub(/<!--.*/, "", line); inc = 1 }
    else if (inc) { if (line ~ /-->/) { sub(/.*-->/, "", line); inc = 0 } else line = "" }
    gsub(/`[^`]*`/, "", line)
    print line }
' "$FILE" > "$TMP/prose.txt"

# 块内实质内容字节数（剔除空行、标题行、注释行、引言行）
body_len() {
  local f="$1"; [[ -f "$f" ]] || { echo 0; return; }
  grep -vE '^[[:space:]]*$|^[[:space:]]*#|^[[:space:]]*<!--|^[[:space:]]*>' "$f" \
    | tr -d '[:space:]' | wc -c | tr -d ' '
}

say "\n══ PACT lint · $FILE · level=$LEVEL ══\n"

# ── 1 创建日期 ────────────────────────────────────────────────────────────
say "1 文档日期"
if grep -qE '创建日期[^0-9]{0,6}[0-9]{4}-[0-9]{2}-[0-9]{2}' "$FILE"; then
  pass "创建日期已标注"
else
  fail "头部缺 '创建日期: YYYY-MM-DD'。无日期的规格无法判断时效。"
fi

# ── 2 四层映射表 ──────────────────────────────────────────────────────────
say "2 四层映射"
miss=""
for w in Product Architecture Contracts Tests; do
  grep -q "$w" "$FILE" || miss="$miss $w"
done
[[ -z "$miss" ]] && pass "四层齐备 (P/A/C/T)" || fail "四层映射表缺:$miss"

# ── 3 锚点存在性 ──────────────────────────────────────────────────────────
say "3 锚点存在性"
missing=""
for a in $ALL_ANCHORS; do [[ -f "$TMP/$a.block" ]] || missing="$missing $a"; done
if [[ -z "$missing" ]]; then
  pass "30 个锚点全部存在"
else
  fail "缺锚点:$missing  （不适用的条目也要保留锚点并写 'N/A（理由）'）"
fi

# ── 4 必填非空 / N-A 需带理由 ─────────────────────────────────────────────
say "4 内容完备性"
empty=""; badna=""; naok=""
for a in $ALL_ANCHORS; do
  f="$TMP/$a.block"; [[ -f "$f" ]] || continue
  len="$(body_len "$f")"
  if grep -qE '(^|[^A-Za-z])N/?A([^A-Za-z]|$)' "$f"; then
    if [[ " $REQUIRED " == *" $a "* ]]; then
      badna="$badna $a"
    elif [[ "$len" -lt 12 ]]; then
      badna="$badna $a(无理由)"
    else
      naok="$naok $a"
    fi
    continue
  fi
  if [[ " $REQUIRED " == *" $a "* && "$len" -lt 60 ]]; then
    empty="$empty $a(${len}B)"
  fi
done
[[ -z "$empty" ]] && pass "必填锚点均有实质内容" \
  || fail "必填锚点内容过少:$empty  （level=$LEVEL 下这些不可省）"
[[ -z "$badna" ]] && pass "N/A 用法合规" \
  || fail "不当的 N/A:$badna  （必填项不可 N/A；可选项的 N/A 必须写明理由）"
[[ -n "$naok" ]] && say "         已声明 N/A（合规）:$naok"

# ── 5 占位符 ──────────────────────────────────────────────────────────────
say "5 占位符残留"
if hits="$(grep -nE 'TBD|TODO|FIXME|XXX|\?\?\?|待定|待补|待填|待确认' "$TMP/prose.txt")"; then
  fail "存在未决占位符（行号对应原文）："
  echo "$hits" | head -20 | sed 's/^/         /'
else
  pass "无占位符"
fi

# ── 6 R-ID 验收覆盖 ───────────────────────────────────────────────────────
say "6 R-ID 验收覆盖 (P5 → T1)"
if [[ -f "$TMP/P5.block" && -f "$TMP/T1.block" ]]; then
  grep -oE '\bR[0-9]{3}\b' "$TMP/P5.block" | sort -u > "$TMP/rid_p5"
  grep -oE '\bR[0-9]{3}\b' "$TMP/T1.block" | sort -u > "$TMP/rid_t1"
  n5=$(wc -l < "$TMP/rid_p5" | tr -d ' ')
  if [[ "$n5" -eq 0 ]]; then
    fail "P5 里没有任何 R-ID。需求清单是 PACT 的脊椎，不能为空。"
  else
    uncovered="$(comm -23 "$TMP/rid_p5" "$TMP/rid_t1" | tr '\n' ' ')"
    orphan="$(comm -13 "$TMP/rid_p5" "$TMP/rid_t1" | tr '\n' ' ')"
    [[ -z "${uncovered// /}" ]] && pass "$n5 个 R-ID 全部有验收" \
      || fail "以下 R-ID 无验收方式: $uncovered  （没有验收的需求不算需求）"
    [[ -n "${orphan// /}" ]] && warn "T1 出现 P5 未定义的 R-ID: $orphan"
  fi
else
  fail "缺 P5 或 T1，无法核对 R-ID 覆盖"
fi

# ── 7 决策四件套 ──────────────────────────────────────────────────────────
say "7 决策记录四件套 (A5)"
if [[ -f "$TMP/A5.block" ]]; then
  awk -v out="$TMP" '
    /^####[[:space:]]*D[0-9]+/ { n++; f = out "/dec_" n ".txt"; print > f; next }
    n > 0 { print >> (out "/dec_" n ".txt") }
  ' "$TMP/A5.block"
  ndec=$(ls "$TMP"/dec_*.txt 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$ndec" -eq 0 ]]; then
    fail "A5 没有任何 '#### D001 · 标题' 形式的决策。每个非平凡取舍都应留痕。"
  else
    bad=""
    for d in "$TMP"/dec_*.txt; do
      id="$(head -1 "$d" | grep -oE 'D[0-9]+' | head -1)"
      for k in 选项 结论 理由 已否决; do
        line="$(grep -m1 -E "\*\*${k}\*\*" "$d" || true)"
        if [[ -z "$line" ]]; then
          bad="$bad ${id}:缺${k}"
        else
          val="$(echo "$line" | sed -E "s/.*\*\*${k}\*\*[：:]*//" | tr -d '[:space:]')"
          [[ "$(echo -n "$val" | wc -c)" -lt 4 ]] && bad="$bad ${id}:${k}为空"
        fi
      done
    done
    [[ -z "$bad" ]] && pass "$ndec 条决策四件套齐全（含已否决方案）" \
      || fail "决策不完整:$bad  （已否决方案是 PACT 区别于 SDD 的关键）"
  fi
else
  fail "缺 A5 决策记录"
fi

# ── 8 契约可执行性 ────────────────────────────────────────────────────────
say "8 契约可执行性 (C1/C4)"
notexec=""
for a in C1 C4; do
  f="$TMP/$a.block"; [[ -f "$f" ]] || { notexec="$notexec $a(缺)"; continue; }
  grep -qE '(^|[^A-Za-z])N/?A([^A-Za-z]|$)' "$f" && continue
  if grep -qE '^[[:space:]]*\|[[:space:]]*-{2,}' "$f" || grep -qE '^[[:space:]]*```' "$f"; then :
  else notexec="$notexec $a"; fi
done
[[ -z "$notexec" ]] && pass "C1/C4 含表格或代码块" \
  || fail "以下契约缺可执行形式（需表格或 schema/代码块）:$notexec  散文不算契约。"

# ── 9 尖括号占位（WARN） ──────────────────────────────────────────────────
say "9 尖括号占位符"
ang="$(grep -nE '<[^<>/!][^<>]{0,30}>' "$TMP/prose.txt" | grep -vE '<!--|-->' | head -10 || true)"
if [[ -n "$ang" ]]; then
  warn "疑似未填写的 <占位符>（若是正文内容可忽略）："
  echo "$ang" | sed 's/^/         /'
else
  pass "无尖括号占位"
fi

# ── 10 估算门（WARN） ─────────────────────────────────────────────────────
# 为什么只 WARN 不 FAIL：纯内部、无排期压力的项目可以不做估算门（board.md 标已跳过即可）。
# 但「P7 里写了工期/团队，却没有估算依据」是典型的拍脑袋数字，必须提醒——
# 这种数字一旦进了合同就是承诺。
say "10 估算门"
p7="$(sed -n '/<!-- PACT:P7 -->/,/<!-- PACT:P8 -->/p' "$FILE" 2>/dev/null || true)"
claims="$(echo "$p7" | grep -nEi '工期|周期|团队规模|人月|人天|个月.*人|上线时间' | head -5 || true)"
estfile="$(dirname "$FILE")/.pact/estimate.md"
if [[ -z "$claims" ]]; then
  pass "P7 未声称工期/团队，无需估算依据"
elif [[ -f "$estfile" ]]; then
  pass "P7 声称了工期/团队，且 .pact/estimate.md 在"
else
  warn "P7 声称了工期/团队，但缺 .pact/estimate.md —— 这是拍脑袋数字，进了合同就是承诺"
  echo "$claims" | sed 's/^/         /'
  echo "         修法：按 $SKILL_DIR/references/effort-estimation.md 走估算门，"
  echo "               产出模板 $SKILL_DIR/templates/estimate.md"
fi

# ── 汇总 ──────────────────────────────────────────────────────────────────
echo
if [[ $FAILS -eq 0 ]]; then
  echo "══ 结果: PASS（${WARNS} 个 WARN）══"
  echo "   机检只覆盖结构完备性。'只读这一份就能开工' 仍需跑「零知识冷读门」验证："
  echo "   见 $SKILL_DIR/templates/cold-read.md"
  exit 0
else
  echo "══ 结果: FAIL（${FAILS} 项不通过，${WARNS} 个 WARN）══"
  echo "   逐项修到全绿才可冻结。写作精度标准见:"
  echo "   $SKILL_DIR/references/authoring-guide.md"
  exit 1
fi
