#!/usr/bin/env bash
# ============================================================================
# 雪茄客 · 端到端测试编排
#
# 为什么要这个脚本：冒烟测试若跑在开发库上会有两个必然的假失败 ——
#   1. 跨轮次状态污染（上一轮插入的测试数据改变了排序/筛选结果）
#   2. 限流把测试自己拦截（认证接口 10 次/分钟）
# 所以这里给测试起一个「独立的临时库 + 关闭限流」的服务实例，跑完即销毁。
#
# 用法：bash scripts/test-e2e.sh
# 退出码：0 = 通过
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CC_TEST_PORT:-18789}"
TMPDIR_CC="$(mktemp -d -t cc-e2e.XXXXXX)"
DB_FILE="$TMPDIR_CC/test.db"
SERVER_LOG="$TMPDIR_CC/server.log"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -rf "$TMPDIR_CC"
}
trap cleanup EXIT

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
step() { printf '\n%s %s\n' "$(color '1;36' '▶')" "$1"; }

step "单元测试（规则引擎 / 合规熔断）"
if ! (cd "$ROOT" && node --test scripts/ 2>&1 | tail -12); then
  printf '%s\n' "$(color '31' '单元测试失败，终止')"
  exit 1
fi

step "准备隔离测试库（$DB_FILE）"
rm -f "$DB_FILE" "$DB_FILE"-*
if ! (cd "$ROOT" && CC_DB_PATH="$DB_FILE" CC_QUIET=1 node scripts/seed.mjs > "$SERVER_LOG" 2>&1); then
  echo "种子导入失败："
  cat "$SERVER_LOG"
  exit 1
fi
echo "  已导入：$(grep -o '{"cigars":[0-9]*[^}]*}' "$SERVER_LOG" | tail -1)"

step "启动测试服务实例 :$PORT（关闭限流）"
(
  cd "$ROOT"
  CC_DB_PATH="$DB_FILE" \
  CC_PORT="$PORT" \
  CC_RATE_LIMIT_DISABLED=1 \
  CC_QUIET=1 \
  CC_SECRET="e2e-test-secret-not-for-production" \
  exec node server/index.js
) > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# 等待端口就绪（最多 15 秒）
READY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then READY=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 0.25
done

if [[ "$READY" != "1" ]]; then
  printf '%s\n' "$(color '31' '  服务未能就绪，日志如下：')"
  cat "$SERVER_LOG"
  exit 1
fi
echo "  服务已就绪 (pid $SERVER_PID)"

step "API 契约冒烟测试"
SMOKE_OUT="$(bash "$ROOT/scripts/api-smoke.sh" "http://127.0.0.1:$PORT" 2>&1)"
SMOKE_CODE=$?
printf '%s\n' "$SMOKE_OUT" | sed 's/\x1b\[[0-9;]*m//g' | tail -22

if [[ $SMOKE_CODE -ne 0 ]]; then
  printf '\n%s\n' "$(color '31' '  ✗ 端到端测试未通过')"
  printf '  服务端错误日志（若有）：\n'
  grep -A6 '\[error\]' "$SERVER_LOG" | head -30 || echo '  （无 error 级日志）'
  exit 1
fi

printf '\n%s\n' "$(color '32' '  ✓ 端到端测试全部通过（隔离库 + 单元测试 + 契约冒烟）')"
exit 0
