#!/usr/bin/env bash
# star-consistency.sh — 校验 P5 与 T1 的 ★（招标强制项）集合一致
#
#   用法: bash star-consistency.sh [PACT.md]
#
# 为什么需要它（PACT.md P8 第 5 条亲口要求）：
#   ★ 的唯一权威定义是 P5 各表「来源」列带 ★ 的条目。T1 的 ★ 标记必须与之逐条一致——
#   否则「★ 强制项全覆盖」的验收无从判定：到底该演示哪几条？
#   T3 的「★ 被静默降级」停工线也就失去抓手。
#
# 判定：
#   P5 ★ 集合（P5 里 `| R### ... ★` 的行）与 T1 ★ 集合（T1 里 `| R### ★`）必须相等。
#   任一侧多出，即 FAIL 并列出差集。
#
# 退出码：0=一致 1=不一致 2=用法/文件错误
set -uo pipefail

FILE="${1:-PACT.md}"
[[ -f "$FILE" ]] || { echo "[FAIL] 找不到文件: $FILE" >&2; exit 2; }

sect() {  # 抽取 <!-- PACT:$1 --> 到下一个锚点之间的正文
  awk -v a="<!-- PACT:$1 -->" -v b="<!-- PACT:$2 -->" '
    $0==a{on=1;next} $0==b{on=0} on' "$FILE"
}

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# P5 ★：★ 的权威位置是 R-ID 列或「来源」列（倒数第 2 列），不含描述/验收里的 ★。
# 按 | 分列精确取，避免把加粗强调的 ★ 误判为强制项标记。
# P5 表为 8 业务列：|R-ID|类型|描述|验收|优先级|依赖|来源|假设|（-F| 下 $2..$9）。
# ★ 权威位置 = R-ID 列($2) 或 来源列($8)；描述($4)/验收($5) 里的加粗★不算。
sect P5 P6 | awk -F'|' '
  /^\| *R[0-9]{3}/ {
    if ($2 ~ /★/ || $8 ~ /★/) { r=$2; gsub(/[^R0-9]/,"",r); print r }
  }' | awk '!seen[$0]++' | sort > "$TMP/p5"

# T1 ★：R-ID 列直接标 ★ 的（`| R### ★`）
sect T1 T2 | grep -E '^\| R[0-9]{3} ★' \
  | grep -oE 'R[0-9]{3}' | sort -u > "$TMP/t1"

n5=$(wc -l < "$TMP/p5"); n1=$(wc -l < "$TMP/t1")
only5=$(comm -23 "$TMP/p5" "$TMP/t1")
only1=$(comm -13 "$TMP/p5" "$TMP/t1")

echo "══ ★ 一致性 · $FILE ══"
echo "  P5 ★ 集合: $n5 条 ｜ T1 ★ 集合: $n1 条"

if [[ -z "$only5" && -z "$only1" ]]; then
  echo "══ 结果: PASS（P5 与 T1 的 ★ 集合完全一致）══"
  exit 0
fi

echo "══ 结果: FAIL（★ 集合不一致）══"
[[ -n "$only5" ]] && { echo "  只在 P5 标 ★、T1 漏标（验收时会缺演示）:"; echo "$only5" | sed 's/^/    /'; }
[[ -n "$only1" ]] && { echo "  只在 T1 标 ★、P5 未定为强制项（越权升级）:"; echo "$only1" | sed 's/^/    /'; }
echo "  ★ 的唯一权威是 P5 来源列；请以 P5 为准修正 T1（P8 第 5 条）。"
exit 1
