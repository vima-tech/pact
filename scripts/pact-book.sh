#!/usr/bin/env bash
# pact-book.sh — 从单文件真源 PACT.md 生成 md 知识库（第四道机检：防生成物漂移）
#
#   用法: bash pact-book.sh [PACT.md] [--out=.pact/pact-book] [--check] [--quiet]
#
#   默认 --build：重新生成整个知识库（先清空 out 目录，保证不留孤儿文件）
#   --check     ：只比对不写盘，发现知识库与 PACT.md 不一致就 FAIL（S8/S11 门禁用）
#
# 产出四类视图：
#   ① 章节页    src/{p,a,c,t}/  按 30 个锚点切分 + SUMMARY.md 导航（mdbook 兼容）
#   ② R-ID 单页 src/r/R###.md   AI 施工素材：需求+验收+依赖+决策+契约位置聚合成一页
#   ③ 里程碑包  src/m/M#.md     一个里程碑的全部需求 + 出口条件 + 明确不含
#   ④ 反查索引  src/idx/*.md    R-ID / D-ID / 不变量 / 来源 / 依赖图谱 / 健康度
#
# **知识库是生成物，不是真源。** 手改 .pact/pact-book/ 下的文件会被 --check 抓出来，
# 并在下次 --build 时被覆盖——要改内容请改 PACT.md。
#
# 退出码：0=成功（--check 时表示无漂移） 1=失败或检测到漂移 2=用法错误
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MJS="$SKILL_DIR/scripts/pact-book.mjs"

for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \?//'; exit 0 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "[FAIL] 需要 node 才能生成知识库（解析 markdown 表格与交叉引用，bash 做不动）。" >&2
  echo "       装好 node 后重跑；或先跳过本步——它不阻塞 PACT.md 本身的写作与冻结。" >&2
  exit 1
fi
[[ -f "$MJS" ]] || { echo "[FAIL] 找不到生成器: $MJS" >&2; exit 1; }

exec node "$MJS" "$@"
