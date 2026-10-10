#!/usr/bin/env node
/**
 * 命令行种子导入
 *   node scripts/seed.mjs          增量：库里已有雪茄则跳过
 *   node scripts/seed.mjs --reset  重建：清空业务表 + 用户后重新导入
 */
import { bootstrap } from '../server/db/bootstrap.js'
import { closeDb } from '../server/db/index.js'
import { config } from '../server/config.js'

const reset = process.argv.includes('--reset')

console.log(`[seed] 目标库：${config.dbPath}`)
console.log(`[seed] 模式：${reset ? '--reset 全量重建' : '增量（已有数据则跳过）'}`)

try {
  const stats = bootstrap({ reset })
  console.log('[seed] 统计：', JSON.stringify(stats.total))
  console.log('[seed] ✓ 导入完成')
} catch (err) {
  console.error('[seed] ✗ 导入失败：', err.message)
  if (process.env.CC_DEBUG) console.error(err.stack)
  process.exitCode = 1
} finally {
  closeDb()
}
