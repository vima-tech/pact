#!/usr/bin/env bash
# pact-graph.sh — action-graph.json 执行图谱机检（pact-graph.mjs 的入口）
#
#   用法: bash pact-graph.sh [物料目录] [--next] [--done-rids] [--require-complete] [--json] [--quiet]
#
#   未给目录时自动扫描 ./.pact/*/PACT.md：恰一份 → 直接用；多份 → 列出候选退出，
#   由调用方（/pact-run、/pact-review）让用户选择后带路径重跑。
#
# 退出码：0=通过 1=FAIL 2=用法错误 3=发现多份物料需指定
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/pact-resolve.sh"

DIR=""; PASSTHRU=()
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \?//'; exit 0 ;;
    -*) PASSTHRU+=("$a") ;;
    *)  DIR="$a" ;;
  esac
done

command -v node >/dev/null 2>&1 || { echo "[FAIL] 需要 node（图谱是 JSON + DAG 校验，bash 做不动）" >&2; exit 1; }

DIR="$(resolve_pact_dir "$DIR")" || exit $?
exec node "$SKILL_DIR/scripts/pact-graph.mjs" "$DIR" ${PASSTHRU[@]+"${PASSTHRU[@]}"}
