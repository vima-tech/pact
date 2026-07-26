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
echo "本 skill 安装于: $SKILL_DIR"
echo "三道机检:"
echo "  bash $SKILL_DIR/scripts/pact-status.sh"
echo "  bash $SKILL_DIR/scripts/pact-lint.sh PACT.md --level=feature"
echo "  bash $SKILL_DIR/scripts/pact-trace.sh"
