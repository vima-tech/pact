#!/usr/bin/env bash
# pact-migrate.sh — 旧版布局迁移：根 PACT.md + 扁平 .pact/ → .pact/<slug>/ 物料包
#
#   用法: bash pact-migrate.sh [项目根目录] --slug=<物料名> [--dry-run]
#
# 旧版布局：<root>/PACT.md + <root>/.pact/{board,interview,coverage,...}.md
# 新版布局：<root>/.pact/<slug>/{PACT.md, board.md, ..., action-graph.json, pact-book/}
#
# 它做什么：
#   1. 建 .pact/<slug>/，把根 PACT.md 与 .pact/ 下的扁平文件/目录移进去（git 仓库用 git mv）
#   2. 列出代码/文档里对旧路径（PACT.md、.pact/xxx）的全部引用，供逐一修正
#      ——移动物料必走四步「查引用 → 移动 → 改引用 → 验证」，本脚本做 1、2 两步，
#        改引用与跑测试验证由你（或 agent）完成
#   3. 提示后续动作：旧 coverage.md 保留为参考，需按 S9 工序卡生成 action-graph.json
#      （可参考 coverage.md 的既有状态回填 impl/test），再重生成 pact-book
#
# 退出码：0=成功 1=前置不满足 2=用法错误
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROOT="."; SLUG=""; DRY=0
for a in "$@"; do
  case "$a" in
    --slug=*)  SLUG="${a#--slug=}" ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    -*) echo "未知参数: $a" >&2; exit 2 ;;
    *)  ROOT="$a" ;;
  esac
done
[[ -d "$ROOT" ]] || { echo "[FAIL] 目录不存在: $ROOT" >&2; exit 2; }
[[ -n "$SLUG" ]] || { echo "[FAIL] 必须给 --slug=<物料名>（kebab-case 短名，如 --slug=core）" >&2; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "[FAIL] slug 只许小写字母/数字/连字符: $SLUG" >&2; exit 2; }

[[ -f "$ROOT/PACT.md" ]] || { echo "[FAIL] $ROOT/PACT.md 不存在——这不像旧版布局，无需迁移" >&2; exit 1; }
DEST="$ROOT/.pact/$SLUG"
[[ -e "$DEST" ]] && { echo "[FAIL] $DEST 已存在，换个 slug 或先处理它" >&2; exit 1; }

MV="mv"
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 && MV="git -C $ROOT mv"

run() { if [[ $DRY -eq 1 ]]; then echo "  [dry-run] $*"; else eval "$*"; fi }

echo "══ 旧版布局迁移 · $ROOT → .pact/$SLUG ══"
echo
echo "① 移动物料"
run "mkdir -p '$DEST'"
# git mv 需要目标目录已被感知；根 PACT.md 先走
rel_dest=".pact/$SLUG"
run "$MV 'PACT.md' '$rel_dest/PACT.md'" 2>/dev/null || run "mv '$ROOT/PACT.md' '$DEST/PACT.md'"
shopt -s nullglob
for f in "$ROOT"/.pact/*; do
  base="$(basename "$f")"
  [[ "$base" == "$SLUG" ]] && continue
  # 只搬旧版的扁平产物；其他新版物料目录（含 PACT.md 的目录）不动
  if [[ -d "$f" && -f "$f/PACT.md" ]]; then continue; fi
  run "$MV '.pact/$base' '$rel_dest/$base'" 2>/dev/null || run "mv '$f' '$DEST/$base'"
done

echo
echo "② 旧路径引用清单（改引用 → 跑构建/测试验证，这两步必须人工/agent 完成）"
grep -rn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.pact \
  --exclude-dir=dist --exclude-dir=build --exclude-dir=target \
  -E '(^|[^/[:alnum:]])(PACT\.md|\.pact/(board|coverage|interview|assessment|estimate|cold-read|changelog|source-merge|pact-book|baseline))' \
  "$ROOT" 2>/dev/null | head -40 || true
echo "  （空 = 未发现引用；有输出则逐条改为 .pact/$SLUG/... 后跑构建/测试确认）"

echo
echo "③ 后续动作（迁移脚本不代做）"
echo "  · 旧 coverage.md 已随迁保留为参考；新版执行态是 action-graph.json——"
echo "    按 S9 工序卡（$SKILL_DIR/references/agent-protocol.md）生成图谱，"
echo "    可参考 coverage.md 的既有状态回填各 step 的 impl/test。"
echo "  · 重生成知识库：bash $SKILL_DIR/scripts/pact-book.sh $rel_dest"
echo "  · 机检：bash $SKILL_DIR/scripts/pact-check.sh $rel_dest"
[[ $DRY -eq 1 ]] && echo && echo "（dry-run：以上未实际执行）"
exit 0
