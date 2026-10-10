import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, isAbsolute } from 'node:path'
import { randomBytes } from 'node:crypto'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 极简 .env 解析（不引入 dotenv，保持零依赖） */
function loadDotEnv() {
  const file = join(ROOT, '.env')
  if (!existsSync(file)) return {}
  const out = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const dotenv = loadDotEnv()
const env = (key, fallback) => process.env[key] ?? dotenv[key] ?? fallback

const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-production'

export const config = {
  port: Number(env('CC_PORT', 8787)),
  host: env('CC_HOST', '127.0.0.1'),
  env: env('CC_ENV', 'development'),
  secret: env('CC_SECRET', DEV_SECRET),
  dbPath: (() => {
    const p = env('CC_DB_PATH', join('database', 'cigar.db'))
    return isAbsolute(p) ? p : join(ROOT, p)
  })(),
  adminUser: env('CC_ADMIN_USER', 'admin'),
  adminPassword: env('CC_ADMIN_PASSWORD', 'admin12345'),
  /**
   * 信任的反向代理层数。
   * ⚠️ 默认 0（不信任）：若默认信任 1 层，攻击者直连时自带 X-Forwarded-For
   * 就能每次换一个 IP 绕过限流（实测：伪造 XFF 后 14/14 次注册全部成功）。
   * 只有确实部署在反代后面时才应设为 1（前面还有 Cloudflare 则设 2）。
   */
  trustProxy: Math.max(0, Number(env('CC_TRUST_PROXY', 0)) || 0),
  /** 关闭限流：仅供自动化测试使用（生产环境永远不应开启） */
  rateLimitDisabled: env('CC_RATE_LIMIT_DISABLED', '') === '1',
  /** 静默启动日志：仅供自动化测试使用 */
  quiet: env('CC_QUIET', '') === '1',
  paths: {
    root: ROOT,
    schema: join(ROOT, 'database', 'schema.sqlite.sql'),
    seedDir: join(ROOT, 'database', 'seed'),
    seedCsv: join(ROOT, 'database', 'seed', 'cigars.csv'),
    seedEnrichment: join(ROOT, 'database', 'seed', 'cigar-enrichment.json'),
    sensitiveWords: join(ROOT, 'config', 'sensitive-words.json'),
    rules: join(ROOT, 'server', 'rules'),
    webDist: join(ROOT, 'web', 'dist'),
    // 用户上传的图片。放在仓库根的 uploads/ 而不是 web/dist/ 内 ——
    // dist 是构建产物（会被 rm -rf 重建），丢图是不可接受的。
    // 部署时用 CC_UPLOAD_DIR 指向持久卷（Docker 下挂 /data/uploads）。
    uploads: (() => {
      const p = env('CC_UPLOAD_DIR', join('uploads'))
      return isAbsolute(p) ? p : join(ROOT, p)
    })(),
    logs: join(ROOT, 'logs'),
  },
}

export const isProd = config.env === 'production'

/** 生产环境用默认密钥属于严重配置错误，直接拒绝启动 */
export function assertProductionSafety(log = console) {
  if (!isProd) return
  const problems = []
  if (config.secret === DEV_SECRET || config.secret.length < 16) {
    problems.push('CC_SECRET 未设置或过短（生产环境必须设置 ≥32 字节随机串）')
  }
  if (config.adminPassword === 'admin12345') {
    problems.push('CC_ADMIN_PASSWORD 仍是默认值')
  }
  if (problems.length) {
    for (const p of problems) log.error(`[配置错误] ${p}`)
    log.error('生产环境拒绝启动。请修改 .env 后重试（参考 .env.example）。')
    process.exit(1)
  }
}

export function generateSecret() {
  return randomBytes(32).toString('hex')
}
