#!/usr/bin/env bash
# pact-estimate.sh — 驱动因子分层法：从 PACT.md 算工期与成本（S7 估算门用）
#
#   用法: bash pact-estimate.sh [PACT.md] [--card=peak|sustain] [--rate=.pact/rate-card.json]
#                               [--persons=1,2,3,4] [--out=.pact/estimate-calc.md] [--json] [--quiet]
#
#   --card=sustain  可持续卡（默认）—— 排期与对外承诺用它
#   --card=peak     峰值卡 —— 只用于判断「最快能多快」，**禁止用于承诺**
#
# 它做什么：
#   把 P5 的每条 R-ID 按**机器可判的规则**分成 T1/T2/T3 三层（传递扇入 / 不变量 / 集成 /
#   权限 / 离线 / ★ / 依赖数），套费率表算出阶段3、开发工作量、交付周期、成本与并发天花板。
#
# 为什么要它：
#   模块当量法有三层主观性相乘（复杂度分级 × 折算倍数 × 天数），任一层偏 30% 结果偏 2 倍。
#   本工具把分层做成规则，只留一张费率表需要校准——估算从「拍脑袋」变成
#   **任何人跑一遍都得同一个数的算术**。方法见 references/effort-estimation.md §四点五。
#
# 硬规矩：
#   · 费率绑执行者，换人必须重标整张表
#   · 对外只承诺「交付周期」，不报净开发时间
#   · P5 里有条目缺 T1 验收 → 直接判「无法估算」并退出 1（给数字比说不知道更有害）
#
# 退出码：0=成功 1=失败或无法估算 2=用法错误
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MJS="$SKILL_DIR/scripts/pact-estimate.mjs"

for a in "$@"; do
  case "$a" in -h|--help) sed -n '2,28p' "$0" | sed 's/^# \?//'; exit 0 ;; esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "[FAIL] 需要 node（要跑传递闭包与分层判定，bash 做不动）。" >&2
  exit 1
fi
[[ -f "$MJS" ]] || { echo "[FAIL] 找不到 $MJS" >&2; exit 1; }

exec node "$MJS" "$@"
