#!/usr/bin/env bash
# ============================================================================
# 雪茄客 · 数据库备份（SQLite）
#
# 与归档的 _archive/win11/backup-db.ps1 的区别：那份针对 Windows + MySQL + 上传云存储，
# 本项目实际运行在 Node + SQLite 上，所以重写为 SQLite 在线备份。
#
# 关键点：用 SQLite 的 VACUUM INTO 做一致性快照，而不是 cp。
#   数据库开着 WAL 模式，直接 cp 可能拿到「主库已更新但 WAL 未合并」的半截状态。
#   VACUUM INTO 会写出一份完整、一致、已整理碎片的副本，且不阻塞读写。
#
# 用法：
#   bash scripts/backup-db.sh                    # 备份到 backups/
#   CC_DB_PATH=/path/to.db bash scripts/backup-db.sh
#   CC_BACKUP_DIR=/Volumes/disk/cc bash scripts/backup-db.sh
#   CC_BACKUP_KEEP=14 bash scripts/backup-db.sh  # 保留 14 份（默认 30）
#
# 建议加入 crontab（每日 03:00）：
#   0 3 * * * cd /path/to/cigar-community && bash scripts/backup-db.sh >> logs/backup.log 2>&1
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${CC_DB_PATH:-$ROOT/database/cigar.db}"
BACKUP_DIR="${CC_BACKUP_DIR:-$ROOT/backups}"
KEEP="${CC_BACKUP_KEEP:-30}"

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }

if [[ ! -f "$DB_PATH" ]]; then
  printf '%s 数据库不存在：%s\n' "$(c 31 '✗')" "$DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET="$BACKUP_DIR/cigar_${STAMP}.db"

printf '▸ 源库  %s (%s)\n' "$DB_PATH" "$(du -h "$DB_PATH" | awk '{print $1}')"
printf '▸ 目标  %s\n' "$TARGET"

# VACUUM INTO 要求目标文件不存在
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync(process.argv[1], { readOnly: true })
db.exec('PRAGMA busy_timeout = 10000')
db.exec(\`VACUUM INTO '\${process.argv[2]}'\`)
const t = db.prepare('PRAGMA integrity_check').get()
console.log('  integrity_check:', Object.values(t)[0])
db.close()
" "$DB_PATH" "$TARGET"

if [[ ! -s "$TARGET" ]]; then
  printf '%s 备份文件为空，备份失败\n' "$(c 31 '✗')"
  rm -f "$TARGET"
  exit 1
fi

# 备份也要能真的读出来 —— 只校验大小不够
VERIFY="$(node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite'
try {
  const db = new DatabaseSync(process.argv[1], { readOnly: true })
  const c = db.prepare('SELECT COUNT(*) AS n FROM cigars').get().n
  const r = db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n
  db.close()
  console.log(c + ':' + r)
} catch (e) { console.log('ERR:' + e.message) }
" "$TARGET")"

if [[ "$VERIFY" == ERR:* ]]; then
  printf '%s 备份校验失败：%s\n' "$(c 31 '✗')" "${VERIFY#ERR:}"
  exit 1
fi

printf '%s 备份完成 %s · 雪茄 %s 条 · 笔记 %s 条\n' \
  "$(c 32 '✓')" "$(du -h "$TARGET" | awk '{print $1}')" "${VERIFY%%:*}" "${VERIFY##*:}"

# 轮转：只保留最近 KEEP 份
COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'cigar_*.db' | wc -l | tr -d ' ')"
if [[ "$COUNT" -gt "$KEEP" ]]; then
  REMOVE=$((COUNT - KEEP))
  find "$BACKUP_DIR" -maxdepth 1 -name 'cigar_*.db' -print0 \
    | xargs -0 ls -t \
    | tail -n "$REMOVE" \
    | while IFS= read -r old; do
        rm -f "$old"
        printf '  %s 轮转删除 %s\n' "$(c 33 '·')" "$(basename "$old")"
      done
  printf '  保留最近 %s 份（原有 %s 份）\n' "$KEEP" "$COUNT"
fi
