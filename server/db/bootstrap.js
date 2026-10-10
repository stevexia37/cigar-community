/**
 * 启动引导：建库 → 导入种子 → 确保管理员存在。
 * 幂等，可反复调用；服务器每次启动都会跑一遍。
 */
import { count, queryOne, run, nowIso } from '../db/index.js'
import { seedDatabase } from '../seed.js'
import { hashPassword, passwordProblem } from '../lib/password.js'
import { config, isProd } from '../config.js'

const DEFAULT_PASSWORD = 'admin12345'

export function ensureAdmin(log = console) {
  if (count('users') > 0) return { created: false }

  const { adminUser, adminPassword } = config
  const problem = passwordProblem(adminPassword)
  if (problem) {
    log.error(`[bootstrap] CC_ADMIN_PASSWORD 不合法：${problem}`)
    log.error('[bootstrap] 拒绝创建管理员。请在 .env 中设置合规口令后重启。')
    throw new Error('管理员口令不符合强度要求')
  }

  const ts = nowIso()
  // 注意：db/index.js 的 run(sql, params) 第二参数是数组，不能展开成位置参数
  run(
    'INSERT INTO users (username, password_hash, role, bio, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    [adminUser, hashPassword(adminPassword), 'admin', '站点管理员', ts, ts],
  )
  log.log(`[bootstrap] 已创建管理员账号：${adminUser}`)
  if (adminPassword === DEFAULT_PASSWORD) {
    const level = isProd ? 'error' : 'warn'
    log[level]('[bootstrap] ⚠ 正在使用默认口令 admin12345，请立即修改（CC_ADMIN_PASSWORD）')
  }
  return { created: true }
}

export function bootstrap({ reset = false, log = console } = {}) {
  const stats = seedDatabase({ reset, log })
  ensureAdmin(log)
  return {
    ...stats,
    total: {
      cigars: count('cigars'),
      brands: count('brands'),
      flavors: count('flavors'),
      users: count('users'),
    },
  }
}

/**
 * 记录数据库版本，便于日后迁移判断。
 *
 * ⚠️ 必须是「写入或更新」而不是「仅首次写入」：
 * 原实现只在 key 缺失时 INSERT，于是升级后版本戳永远停在首次安装那个版本 ——
 * 而这段代码的用途恰恰是判断「这个库是哪个版本建的」，版本戳过期就失去意义，
 * 未来做数据迁移时会按错误的前提决策。
 */
export function stampVersion(version, log = console) {
  const row = queryOne('SELECT value FROM app_meta WHERE key = ?', ['db_version'])
  if (!row) {
    run('INSERT INTO app_meta (key, value, updated_at) VALUES (?,?,?)', ['db_version', version, nowIso()])
    log.log(`[bootstrap] 标记数据库版本 ${version}`)
    return
  }
  if (row.value !== version) {
    run('UPDATE app_meta SET value = ?, updated_at = ? WHERE key = ?', [version, nowIso(), 'db_version'])
    log.log(`[bootstrap] 数据库版本戳更新 ${row.value} → ${version}`)
  }
}
