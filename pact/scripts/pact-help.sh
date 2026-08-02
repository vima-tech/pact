#!/usr/bin/env bash
# pact-help.sh — 打印 PACT 使用速览（人类向）
#
#   用法: bash pact-help.sh [--raw]
#
#   --raw   只输出 references/help.md 原文，不加页眉页脚（便于管道/重定向）
#
# 在 agent 里直接说 `/pact --help` 也会输出同一份内容。
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELP="$SKILL_DIR/references/help.md"

RAW=0
for a in "$@"; do
  case "$a" in
    --raw) RAW=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "未知参数: $a" >&2; exit 2 ;;
  esac
done

[[ -f "$HELP" ]] || { echo "[FAIL] 找不到 $HELP —— skill 安装可能不完整" >&2; exit 1; }

if [[ $RAW -eq 1 ]]; then
  cat "$HELP"
  exit 0
fi

cat "$HELP"
echo
echo "────────────────────────────────────────────────────────────"
echo "核心 skill 安装于: $SKILL_DIR"
echo "机检（<物料目录> = .pact/<slug>；只有一份物料时可省略参数）:"
echo "  bash $SKILL_DIR/scripts/pact-list.sh                # 全部物料总览"
echo "  bash $SKILL_DIR/scripts/pact-check.sh  <物料目录>   # 物料质量体检"
echo "  bash $SKILL_DIR/scripts/pact-review.sh <物料目录>   # 完成度审查（100% 才 exit 0）"
echo "  bash $SKILL_DIR/scripts/pact-status.sh <物料目录>   # 工序进度 + 下一道"
echo "  bash $SKILL_DIR/scripts/pact-graph.sh  <物料目录>   # 执行图谱进度（--next 取活）"
echo "  bash $SKILL_DIR/scripts/pact-trace.sh  <物料目录>   # 规格↔代码↔图谱对账"
echo ""
echo "工期估算（S7 · 要报价/排期时）:"
echo "  bash $SKILL_DIR/scripts/pact-estimate.sh <物料目录>/PACT.md          # 可持续卡"
echo "  bash $SKILL_DIR/scripts/pact-estimate.sh <物料目录>/PACT.md --card=peak  # 峰值卡，禁止承诺"
