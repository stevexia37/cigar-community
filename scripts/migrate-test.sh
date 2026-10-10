#!/usr/bin/env bash
# ============================================================================
# 旧库升级路径测试
#
# 为什么需要单独一个脚本：`server/db/index.js` 的 `migrate()` 会为旧库补列，
# 这个能力此前**完全没有自动化覆盖**。而它一旦坏掉，后果是灾难性的 ——
# 已有部署升级后要么起不来，要么丢了数据，而这两种情况在开发机上不会出现
# （开发机总是新建库，永远走不到迁移分支）。
#
# 做法：拿一个当前版本的库，**删掉后来新增的列**来模拟旧库，
# 再启动服务，断言补列成功、数据未丢、版本戳刷新。
#
# 用法：bash scripts/migrate-test.sh
# 退出码：0 = 通过
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
TMPD="$(mktemp -d -t cc-migrate.XXXXXX)"
PORT="${CC_MIGRATE_PORT:-18917}"
PASS=0; FAIL=0
FAILED=()

cleanup() {
  # 只杀我们启动的那个进程
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$TMPD"
}
trap cleanup EXIT

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()   { PASS=$((PASS+1)); printf '  %s %s\n' "$(c 32 '✓')" "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  %s %s\n      %s\n' "$(c 31 '✗')" "$1" "$2"; }

printf '%s\n' "$(c '1;36' "旧库升级路径测试")"

# ---------------------------------------------------------------- 造一个「旧库」
# 先建一份当前版本的库
CC_DB_PATH="$TMPD/old.db" CC_QUIET=1 "$NODE_BIN" "$ROOT/scripts/seed.mjs" >/dev/null 2>&1
if [[ ! -f "$TMPD/old.db" ]]; then
  bad "准备旧库" "种子脚本未能建库"
  printf '\n  通过 %s · 失败 %s\n' "$PASS" "$FAIL"; exit 1
fi

# 删掉「后来新增」的列，模拟旧版本建的库。
# 列清单必须与 server/db/index.js 的 migrate() 保持一致 ——
# 这里用 DROP COLUMN 而不是重建表，更贴近真实旧库的结构差异。
CC_DB_PATH="$TMPD/old.db" "$NODE_BIN" --input-type=module -e '
import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(process.env.CC_DB_PATH)
const dropped = []
for (const [t, col] of [
  ["cigars", "price_cny"], ["cigars", "base_rating"], ["cigars", "seed_review_count"],
  ["cigars", "data_source"], ["cigars", "vitola_family"], ["brands", "name_norm"],
]) {
  try { db.exec(`ALTER TABLE ${t} DROP COLUMN ${col}`); dropped.push(`${t}.${col}`) } catch {}
}
// 用 INSERT OR REPLACE 而不是 UPDATE：种子脚本只跑 seedDatabase()、
// 不跑 bootstrap()，所以 app_meta 此时是**空的**，没有 db_version 行可更新。
// 而本测试要验证的恰恰是「已存在的旧版本戳被刷新」，所以必须先显式写入一个旧值。
db.prepare("INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?,?,?)")
  .run("db_version", "0.9.0-legacy", new Date().toISOString())
console.log(JSON.stringify(dropped))
db.close()' > "$TMPD/dropped.json" 2>/dev/null

DROPPED_COUNT="$("$NODE_BIN" -e "console.log(JSON.parse(require('fs').readFileSync('$TMPD/dropped.json','utf8')).length)" 2>/dev/null || echo 0)"
if [[ "${DROPPED_COUNT:-0}" -ge 4 ]]; then
  ok "已构造旧库（删掉 $DROPPED_COUNT 个后加的列，版本戳改为 0.9.0-legacy）"
else
  bad "构造旧库" "只删掉 $DROPPED_COUNT 个列（DROP COLUMN 需要 SQLite 3.35+），测试前提不成立"
fi

STAMP_SEEDED="$(CC_DB_PATH="$TMPD/old.db" "$NODE_BIN" --input-type=module -e '
import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(process.env.CC_DB_PATH, { readOnly: true })
console.log(db.prepare("SELECT value FROM app_meta WHERE key = ?").get("db_version")?.value ?? "")
db.close()' 2>/dev/null)"
if [[ "$STAMP_SEEDED" == "0.9.0-legacy" ]]; then
  ok "已写入旧版本戳（0.9.0-legacy），测试前提成立"
else
  bad "旧版本戳未写入" "app_meta.db_version = '$STAMP_SEEDED'，无法验证「刷新已有版本戳」这条路径"
fi

BEFORE_CIGARS="$(CC_DB_PATH="$TMPD/old.db" "$NODE_BIN" --input-type=module -e '
import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(process.env.CC_DB_PATH, { readOnly: true })
console.log(db.prepare("SELECT COUNT(*) n FROM cigars").get().n)
db.close()' 2>/dev/null)"

# ---------------------------------------------------------------- 用当前代码启动
CC_DB_PATH="$TMPD/old.db" CC_PORT="$PORT" CC_QUIET=1 "$NODE_BIN" "$ROOT/server/index.js" \
  > "$TMPD/server.log" 2>&1 &
SERVER_PID=$!

READY=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.4
done

if [[ "$READY" == "1" ]]; then ok "旧库启动成功（未因缺列而崩溃）"
else bad "旧库启动" "服务未就绪，日志：$(tail -3 "$TMPD/server.log" | tr '\n' ' ')"; fi

if grep -q "已迁移旧库" "$TMPD/server.log"; then
  ok "迁移被触发（日志：$(grep -o '已迁移旧库，补充 [0-9]* 项' "$TMPD/server.log" | head -1)）"
else
  bad "迁移未触发" "日志里没有「已迁移旧库」，migrate() 可能没跑"
fi

if grep -q "版本戳更新 0.9.0-legacy" "$TMPD/server.log"; then
  ok "版本戳被刷新（0.9.0-legacy → 当前版本）"
else
  bad "版本戳未刷新" "stampVersion() 未更新旧版本戳"
fi

# ---------------------------------------------------------------- 断言数据与结构
VERIFY="$(CC_DB_PATH="$TMPD/old.db" "$NODE_BIN" --input-type=module -e '
import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(process.env.CC_DB_PATH, { readOnly: true })
const cols = (t) => new Set(db.prepare("PRAGMA table_info(" + t + ")").all().map((c) => c.name))
const need = [
  ["cigars", "price_cny"], ["cigars", "base_rating"], ["cigars", "seed_review_count"],
  ["cigars", "data_source"], ["cigars", "vitola_family"], ["brands", "name_norm"],
]
const missing = need.filter(([t, c]) => !cols(t).has(c)).map(([t, c]) => t + "." + c)
console.log(JSON.stringify({
  missing,
  cigars: db.prepare("SELECT COUNT(*) n FROM cigars").get().n,
  version: db.prepare("SELECT value FROM app_meta WHERE key = ?").get("db_version")?.value,
}))
db.close()' 2>/dev/null)"

MISSING="$(printf '%s' "$VERIFY" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).missing.join(','))}catch{console.log('parse-error')}})" 2>/dev/null)"
if [[ -z "$MISSING" ]]; then ok "全部缺失的列都已补回"
else bad "补列不完整" "仍缺：$MISSING"; fi

AFTER_CIGARS="$(printf '%s' "$VERIFY" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).cigars)}catch{console.log(0)}})" 2>/dev/null)"
if [[ "${AFTER_CIGARS:-0}" == "${BEFORE_CIGARS:-0}" && "${AFTER_CIGARS:-0}" != "0" ]]; then
  ok "数据未丢失（雪茄 $BEFORE_CIGARS → $AFTER_CIGARS 条）"
else
  bad "迁移影响了数据量" "雪茄 $BEFORE_CIGARS → $AFTER_CIGARS"
fi

VERSION_NOW="$(printf '%s' "$VERIFY" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('')}})" 2>/dev/null)"
if [[ -n "$VERSION_NOW" && "$VERSION_NOW" != "0.9.0-legacy" ]]; then
  ok "库内版本戳已是当前版本（$VERSION_NOW）"
else
  bad "库内版本戳未更新" "仍是 $VERSION_NOW"
fi

# 空库路径也要能走通（首次部署）
CC_DB_PATH="$TMPD/fresh.db" CC_QUIET=1 "$NODE_BIN" "$ROOT/scripts/seed.mjs" >/dev/null 2>&1
FRESH_OK="$(CC_DB_PATH="$TMPD/fresh.db" "$NODE_BIN" --input-type=module -e '
import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(process.env.CC_DB_PATH, { readOnly: true })
console.log(db.prepare("SELECT COUNT(*) n FROM cigars").get().n)
db.close()' 2>/dev/null)"
if [[ "${FRESH_OK:-0}" -gt 0 ]]; then ok "全新库仍能正常建库（$FRESH_OK 条）"
else bad "全新库建库失败" "雪茄数为 $FRESH_OK"; fi

# ---------------------------------------------------------------- 汇总
printf '\n%s\n' "$(c '1;36' '────────────────────────────────────')"
printf '  通过 %s · 失败 %s\n' "$(c 32 "$PASS")" "$(c $([[ $FAIL -gt 0 ]] && echo 31 || echo 32) "$FAIL")"
if [[ $FAIL -gt 0 ]]; then
  printf '\n  失败项：\n'
  for n in "${FAILED[@]}"; do printf '    · %s\n' "$n"; done
  printf '\n%s\n' "$(c 31 '  ✗ 升级路径测试未通过')"
  exit 1
fi
printf '\n%s\n' "$(c 32 '  ✓ 升级路径测试通过')"
exit 0
