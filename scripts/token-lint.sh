#!/usr/bin/env bash
# token-lint: 组件文件里禁止出现裸颜色/裸像素，只许引用设计 token。
# 用法: token-lint.sh <目录> [--allow=globA,globB]
# 退出码 0 = 干净；1 = 发现裸值（打印命中）。
set -euo pipefail

DIR="${1:?用法: token-lint.sh <组件目录>}"
shift || true

# 允许出现裸值的白名单文件（如 token 定义本身）
ALLOW="tokens|theme|variables|design-system|\.test\.|\.spec\.|\.stories\."

# 裸十六进制颜色 (#abc / #aabbcc / #aabbccdd)
HEX='#[0-9a-fA-F]{3,8}\b'
# 裸像素：数字+px，但放过 0px、1px 边框这类可按需收紧
PX='\b[0-9]+px\b'
# 常见裸 rgb/rgba 字面量
RGB='rgba?\([0-9]'

PATTERN="$HEX|$RGB|$PX"

hits=$(grep -rEnI --include='*.css' --include='*.scss' --include='*.ts' \
  --include='*.tsx' --include='*.jsx' --include='*.vue' --include='*.svelte' \
  "$PATTERN" "$DIR" 2>/dev/null | grep -vE "$ALLOW" || true)

if [[ -n "$hits" ]]; then
  echo "FAIL token-lint: 发现裸样式值（应改为引用 token）:"
  echo "$hits"
  echo "----"
  echo "总计: $(echo "$hits" | wc -l) 处"
  exit 1
fi
echo "PASS token-lint: 未发现裸 hex/px/rgb（$DIR）"
