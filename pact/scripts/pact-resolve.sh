#!/usr/bin/env bash
# pact-resolve.sh — 解析「pact 物料目录」（被其他脚本 source，不单独执行）
#
# 物料结构（多 pact）：<项目根>/.pact/<slug>/PACT.md
#
# resolve_pact_dir [显式路径]
#   显式路径：可给物料目录，也可直接给 PACT.md 路径 → echo 物料目录，return 0
#   未给路径：扫描 ./.pact/*/PACT.md
#     恰好 1 个 → echo 该目录，return 0
#     0 个      → stderr 报错（含旧版布局迁移提示），return 1
#     ≥2 个     → stderr 列出全部候选，return 3（调用方应让用户选择后带路径重跑）
resolve_pact_dir() {
  local arg="${1:-}"
  if [[ -n "$arg" ]]; then
    if [[ -f "$arg" && "$(basename "$arg")" == "PACT.md" ]]; then
      dirname "$arg"; return 0
    fi
    if [[ -d "$arg" && -f "$arg/PACT.md" ]]; then
      echo "${arg%/}"; return 0
    fi
    echo "[FAIL] 不是有效的 pact 物料：$arg（应为含 PACT.md 的目录，或 PACT.md 本身）" >&2
    return 1
  fi
  local candidates=()
  local f
  for f in .pact/*/PACT.md; do
    [[ -f "$f" ]] && candidates+=("$(dirname "$f")")
  done
  if [[ ${#candidates[@]} -eq 0 ]]; then
    if [[ -f "PACT.md" ]]; then
      echo "[FAIL] 检测到旧版布局（PACT.md 在项目根、.pact/ 扁平）。" >&2
      echo "       新版布局为 .pact/<slug>/PACT.md（支持一个项目多份 pact 物料）。" >&2
      local _skill_dir; _skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
      echo "       迁移：bash $_skill_dir/scripts/pact-migrate.sh . --slug=<名字>（--dry-run 先看动作）" >&2
    else
      echo "[FAIL] 未找到任何 pact 物料（.pact/*/PACT.md）。先用 /pact-new 创建。" >&2
    fi
    return 1
  fi
  if [[ ${#candidates[@]} -eq 1 ]]; then
    echo "${candidates[0]}"; return 0
  fi
  echo "[CHOOSE] 发现 ${#candidates[@]} 份 pact 物料，请指定其一后重跑：" >&2
  local c
  for c in "${candidates[@]}"; do echo "  $c" >&2; done
  return 3
}

# 由物料目录反推项目根：<root>/.pact/<slug> → <root>；其他情况回退当前目录
project_root_of() {
  local dir="${1%/}"
  case "$dir" in
    */.pact/*) echo "${dir%/.pact/*}" ;;
    *)         echo "." ;;
  esac
}
