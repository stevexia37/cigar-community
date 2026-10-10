import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from '../config.js'

let db = null

/** 幂等增量迁移：为已存在的旧库补列（schema.sqlite.sql 只负责新建） */
function migrate(conn) {
  const cols = (table) => new Set(conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name))
  const addIfMissing = (table, col, ddl) => {
    if (!cols(table).has(col)) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`)
      return true
    }
    return false
  }

  let changed = 0
  if (addIfMissing('cigars', 'price_cny', 'REAL')) changed++
  if (addIfMissing('cigars', 'rating', 'REAL')) changed++
  if (addIfMissing('cigars', 'review_count', 'INTEGER NOT NULL DEFAULT 0')) changed++
  if (addIfMissing('cigars', 'vitola_family', 'TEXT')) changed++
  if (addIfMissing('cigars', 'data_source', "TEXT NOT NULL DEFAULT 'manual'")) changed++
  if (addIfMissing('cigars', 'base_rating', 'REAL')) changed++
  if (addIfMissing('cigars', 'seed_review_count', 'INTEGER NOT NULL DEFAULT 0')) changed++
  if (addIfMissing('brands', 'name_norm', 'TEXT')) changed++
  // 旧库若已把 1-10 分的笔记均分写进了 1-5 星的 rating，这里一次性清理：
  // 超界值说明量纲被污染，回落到 base_rating（没有则置空由下次 recompute 修正）
  const polluted = conn.prepare('SELECT COUNT(*) AS n FROM cigars WHERE rating > 5 OR rating < 1').get().n
  if (polluted > 0) {
    conn.exec('UPDATE cigars SET rating = base_rating, review_count = seed_review_count WHERE rating > 5 OR rating < 1')
    console.log(`[db] 修正 ${polluted} 条被污染的评分（1-10 量纲误写入 1-5 星级）`)
    changed++
  }
  if (changed) console.log(`[db] 已迁移旧库，补充 ${changed} 项`)
}

/** 打开（并在首次调用时初始化）数据库 */
export function getDb() {
  if (db) return db
  const dir = dirname(config.dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  db = new DatabaseSync(config.dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(readFileSync(config.paths.schema, 'utf8'))
  migrate(db)
  return db
}

export function closeDb() {
  if (db) {
    try { db.close() } catch { /* 已关闭 */ }
    db = null
  }
}

/**
 * 参数护栏：node:sqlite 对未绑定的占位符会静默填充 NULL，
 * 一旦调用方把参数展开成位置参数（而不是数组），症状会是莫名其妙的 NOT NULL 失败。
 * 这里显式拦截，把错误暴露在最早的位置。
 */
function assertParams(params, sql) {
  if (!Array.isArray(params)) {
    throw new TypeError(
      `SQL 参数必须是数组，收到 ${typeof params}。` +
      `调用方式应为 run(sql, [a, b])，而不是 run(sql, a, b)。SQL: ${String(sql).slice(0, 60)}…`,
    )
  }
  return params
}

export function query(sql, params = []) {
  return getDb().prepare(sql).all(...assertParams(params, sql))
}

export function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(...assertParams(params, sql)) ?? null
}

export function run(sql, params = []) {
  return getDb().prepare(sql).run(...assertParams(params, sql))
}

/** 事务包装：回调抛错则回滚 */
export function transaction(fn) {
  const conn = getDb()
  conn.exec('BEGIN')
  try {
    const result = fn(conn)
    conn.exec('COMMIT')
    return result
  } catch (err) {
    try { conn.exec('ROLLBACK') } catch { /* 回滚失败时保留原始错误 */ }
    throw err
  }
}

/** 计数快捷方式 */
export function count(table) {
  return queryOne(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0
}

const TABLES = [
  'cigars', 'brands', 'countries', 'flavors', 'cigar_flavors',
  'users', 'sessions', 'reviews', 'review_images', 'review_votes',
  'submissions', 'audit_log', 'tool_events', 'app_meta',
]

/** 清空业务表（保留 users，避免每次重置都要重建管理员） */
export function resetContent() {
  transaction((conn) => {
    conn.exec('PRAGMA foreign_keys = OFF')
    for (const t of TABLES) {
      if (t === 'users') continue
      if (t === 'cigars_fts') continue   // contentless FTS5 不可 DELETE，由 cigars 触发器同步
      conn.exec(`DELETE FROM ${t}`)
    }
    conn.exec("DELETE FROM sqlite_sequence WHERE name IN ('cigars','brands','countries','flavors','reviews')")
    conn.exec('PRAGMA foreign_keys = ON')
  })
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}
