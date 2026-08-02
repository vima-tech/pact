#!/usr/bin/env bash
# pact-list.sh — 列出项目内全部 pact 物料的总览（/pact-list 的机检入口）
#
#   用法: bash pact-list.sh [项目根目录]
#
# 每份物料一行：slug · 规格状态（草稿/已冻结）· 档位 · 工序进度 · 施工完成度 · 一句话定义
#   工序进度取自 board.md（已收敛道数 + 当前所在工序）
#   完成度取自 action-graph.json（需 node；无图谱或无 node 时显示 —）
#
# 纯信息输出，不做门禁判定。退出码：0=正常（含 0 份物料时的提示） 2=用法错误
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROOT="."
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  ROOT="$a" ;;
  esac
done
[[ -d "$ROOT" ]] || { echo "[FAIL] 目录不存在: $ROOT" >&2; exit 2; }

shopt -s nullglob
DIRS=()
for f in "$ROOT"/.pact/*/PACT.md; do DIRS+=("$(dirname "$f")"); done

if [[ ${#DIRS[@]} -eq 0 ]]; then
  if [[ -f "$ROOT/PACT.md" ]]; then
    echo "未找到新版物料，但检测到旧版布局（PACT.md 在项目根、.pact/ 扁平）。"
    echo "迁移：bash $SKILL_DIR/scripts/pact-migrate.sh $ROOT --slug=<名字>"
  else
    echo "本项目还没有任何 pact 物料（.pact/*/PACT.md）。用 /pact-new 创建。"
  fi
  exit 0
fi

echo
echo "══ pact 物料总览 · $ROOT（共 ${#DIRS[@]} 份）══"
echo
printf '%-24s %-16s %-8s %-14s %-8s %s\n' "物料" "规格状态" "档位" "工序进度" "完成度" "一句话定义"

for d in "${DIRS[@]}"; do
  slug="${d##*/}"
  pact="$d/PACT.md"

  # 规格状态与档位（取头部表格）
  st="草稿"
  head -40 "$pact" | grep -qE '已冻结[^|]*[0-9]{4}-[0-9]{2}-[0-9]{2}' && \
    st="已冻结 $(head -40 "$pact" | grep -oE '已冻结[^|]*([0-9]{4}-[0-9]{2}-[0-9]{2})' | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)"
  lvl="full"
  grep -m1 '完备度档位' "$pact" 2>/dev/null | grep -q 'feature' && lvl="feature"

  # 工序进度（board.md：已完成/已跳过 计入收敛；当前 = 第一个 进行中/未开始）
  prog="—"
  if [[ -f "$d/board.md" ]]; then
    read -r done_n cur < <(awk -F'|' '
      /^[[:space:]]*\|[[:space:]]*S[0-9]+[[:space:]]*\|/ {
        id=$2; st=$4
        gsub(/^[ \t]+|[ \t]+$/,"",id); gsub(/^[ \t]+|[ \t]+$/,"",st)
        n=substr(id,2)+0
        if (n>=0 && n<=11) {
          total++
          if (st ~ /^已完成/ || st ~ /^已跳过/) done++
          else if (cur=="") cur=id
        }
      }
      END { printf "%d %s\n", done, (cur=="" ? "完" : cur) }' "$d/board.md")
    if [[ "$cur" == "完" ]]; then prog="12/12 ✅"; else prog="$done_n/12 @$cur"; fi
  fi

  # 施工完成度（图谱）
  pct="—"
  if [[ -f "$d/action-graph.json" ]] && command -v node >/dev/null 2>&1; then
    j="$(node "$SKILL_DIR/scripts/pact-graph.mjs" "$d" --json 2>/dev/null)" && \
      pct="$(printf '%s' "$j" | grep -oE '"pct": *[0-9]+' | grep -oE '[0-9]+')%"
  fi

  # 一句话定义（P1 锚点后的第一行正文）
  brief="$(awk '/<!--[[:space:]]*PACT:P1[[:space:]]*-->/{f=1;next}
               /<!--[[:space:]]*PACT:[A-Z][0-9]+[[:space:]]*-->/{f=0}
               f && $0 !~ /^[[:space:]]*$/ && $0 !~ /^#/ && $0 !~ /^>/ {print; exit}' "$pact" \
           | sed 's/\*\*//g' | awk '{ s=substr($0,1,40); print s (length($0)>40 ? "…" : "") }')"

  printf '%-24s %-16s %-8s %-14s %-8s %s\n' ".pact/$slug" "$st" "$lvl" "$prog" "$pct" "$brief"
done

echo
echo "下一步参考：草稿 → /pact-new 续写；已冻结未 100% → /pact-run；查质量 /pact-check；查完成度 /pact-review"
