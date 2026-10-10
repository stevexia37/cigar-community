/**
 * 最低 Node 版本校验。
 *
 * 为什么必须在 import 之前做：`import { DatabaseSync } from 'node:sqlite'` 是静态
 * 导入，会在任何业务代码之前执行。若版本过低，用户看到的是
 * `Cannot find module 'node:sqlite'`，完全看不出「应该升级 Node」。
 *
 * 为什么是 22.13.0：node:sqlite 自 v22.5.0 引入，但**到 v22.13.0 才去掉
 * `--experimental-sqlite` 标志**；22.5–22.12 上不加标志直接 import 会失败。
 * 这个边界实测过（22.23.3 通过、22.5 不加标志不可用）。
 */
const MIN_NODE = [22, 13, 0]
const current = process.versions.node.split('.').map(Number)
const tooOld =
  current[0] < MIN_NODE[0] ||
  (current[0] === MIN_NODE[0] && current[1] < MIN_NODE[1])

if (tooOld) {
  const need = MIN_NODE.join('.')
  console.error(
    `\n  ✗ 需要 Node ${need} 或更高版本（当前 ${process.versions.node}）\n\n` +
    `    原因：本项目用 Node 内置的 node:sqlite 做数据库，\n` +
    `    它从 Node ${need} 起才无需 --experimental-sqlite 标志即可直接使用。\n\n` +
    `    升级方式：\n` +
    `      · nvm:  nvm install ${MIN_NODE[0]} && nvm use ${MIN_NODE[0]}\n` +
    `      · 官网: https://nodejs.org/\n` +
    `      · Docker: 本项目自带 Dockerfile，可直接 docker compose up -d\n`,
  )
  process.exit(1)
}

import { createServer } from 'node:http'
import { existsSync, readFileSync, createReadStream } from 'node:fs'
import { config, isProd, assertProductionSafety } from './config.js'
import { queryOne, closeDb } from './db/index.js'
import { bootstrap, stampVersion } from './db/bootstrap.js'
import {
  Router, readBody, sendError, createRateLimiter, clientIp, HttpError, notFound,
} from './lib/http.js'
import { createStaticHandler } from './lib/static.js'
import { resolveMeta, buildSitemap, buildRobots } from './lib/seo.js'
import { readImage } from './lib/storage.js'
import { attachAuth, assertAgeGate, purgeExpiredSessions } from './middleware/auth.js'
import { metaRouter } from './api/meta.js'
import { cigarRouter } from './api/cigars.js'
import { toolRouter } from './api/tools.js'
import { reviewRouter } from './api/reviews.js'
import { submissionRouter } from './api/submissions.js'
import { authRouter } from './api/auth.js'
import { miscRouter } from './api/misc.js'
import { adminRouter } from './api/admin.js'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

/** /uploads 下的扩展名 → MIME（文件名由 storage.js 生成，已是白名单） */
function MIME_BY_EXT(name) {
  const ext = String(name).slice(String(name).lastIndexOf('.') + 1).toLowerCase()
  return { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'application/octet-stream'
}

assertProductionSafety()

// ---------------------------------------------------------------- 启动引导
// 信任代理层数是个安全开关，配错等于限流失效，启动时必须可见
if (config.trustProxy > 0) {
  console.log(`[security] CC_TRUST_PROXY=${config.trustProxy}：将信任 X-Forwarded-For 的前 ${config.trustProxy} 跳。`)
  console.log('[security] 若前面并没有这么多层反向代理，攻击者可伪造该头绕过限流。')
}

const bootStats = bootstrap()
stampVersion('1.1.0')
purgeExpiredSessions()

// ---------------------------------------------------------------- 路由装配
// 每个子路由内部只写相对路径（'/cigars'），前缀 '/api' 在这里统一挂
const router = new Router()
for (const sub of [miscRouter, metaRouter, cigarRouter, toolRouter, reviewRouter, submissionRouter, authRouter, adminRouter]) {
  router.mount('/api', sub)
}

// 通用写接口限流：每 IP 每分钟 60 次
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })
// 认证接口更严：每 IP 每分钟 10 次（验收标准：脚本无法批量注册）
const authLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })
// 工具接口（诊断/风味测试/醇化）：每 IP 每分钟 40 次
const toolLimiter = createRateLimiter({ windowMs: 60_000, max: 40 })

function limiterFor(pathname) {
  if (pathname.startsWith('/api/auth/')) return authLimiter
  if (pathname.startsWith('/api/tools/')) return toolLimiter
  return writeLimiter
}

function checkLimit(limiter, req, res) {
  if (config.rateLimitDisabled) return
  const { ok, remaining } = limiter.check(clientIp(req, config.trustProxy))
  res.setHeader('x-ratelimit-remaining', String(remaining))
  if (!ok) throw new HttpError(429, '操作过于频繁，请稍后再试', 'TOO_MANY_REQUESTS')
}

const searchParamsToObject = (params) => {
  const out = {}
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key)
    out[key] = all.length > 1 ? all : all[0]
  }
  return out
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// ---------------------------------------------------------------- 请求处理
const handleStatic = createStaticHandler(config.paths.webDist, resolveMeta)
const distReady = existsSync(config.paths.webDist)

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  // 安全响应头：即使不经 Nginx 反代也生效（与 config/nginx-security-headers.conf 对齐）
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'SAMEORIGIN')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  if (isProd) {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains')
  }

  attachAuth(req)
  req.query = searchParamsToObject(url.searchParams)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    })
    res.end()
    return
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    // 年龄门：在业务处理之前拦截。这三类路径是有意放行的 ——
    // 门自身（否则无法通过）、健康检查（探活）、以及爬虫（由 req.ageVerified 里的 isBot 放行，用于 SEO 与分享卡片）
    // /api/auth/me 也在放行之列：它只返回「我是谁 + 是否已过门」这种状态，
    // 不含任何内容。若把它也拦掉，前端就无法判断该弹年龄门还是登录框 —— 自相矛盾。
    const AGE_GATE_EXEMPT = ['/api/gate/verify', '/api/health', '/api/auth/me']
    if (!AGE_GATE_EXEMPT.includes(pathname)) assertAgeGate(req)

    if (WRITE_METHODS.has(req.method)) {
      checkLimit(limiterFor(pathname), req, res)
      req.body = await readBody(req)
    }
    const matched = router.match(req.method, pathname)
    if (!matched) throw notFound(`接口不存在：${req.method} ${pathname}`)
    req.params = matched.params
    await matched.handler(req, res)
    return
  }

  // ---------- 爬虫设施：容器域名只能从请求头推断，因此必须服务端生成 ----------
  // 这两条路径都**不使用静态文件**：静态版会把域名写死或写成相对路径，
  // 而 OG/sitemap 的地址必须是绝对 URL（爬虫不解析相对路径）。
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
    const origin = (() => {
      const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (req.socket.encrypted ? 'https' : 'http')
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
      return host ? `${proto}://${host}` : ''
    })()
    const isSitemap = pathname === '/sitemap.xml'
    const text = isSitemap ? buildSitemap(origin) : buildRobots(origin)
    const body = Buffer.from(text, 'utf8')
    res.writeHead(200, {
      'content-type': isSitemap
        ? 'application/xml; charset=utf-8'
        : 'text/plain; charset=utf-8',
      'content-length': body.length,
      // robots/sitemap 变更不频繁，但也不能长缓存：换域名后要能及时生效
      'cache-control': 'public, max-age=600',
    })
    res.end(body)
    return
  }

  // 上传图片：单独一段，带长缓存（文件名是内容哈希，内容永不变）
  if (pathname.startsWith('/uploads/')) {
    const filename = pathname.slice('/uploads/'.length)
    const file = readImage(filename)
    if (!file) throw notFound('图片不存在')
    res.writeHead(200, {
      'content-type': MIME_BY_EXT(filename),
      'content-length': file.size,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    })
    createReadStream(file.path).pipe(res)
    return
  }

  // 静态资源与 SPA 回退（仅 GET/HEAD；/api 已在上方处理）
  if ((req.method === 'GET' || req.method === 'HEAD') && handleStatic(req, res, pathname)) return
  throw notFound('资源不存在')
}

// ---------------------------------------------------------------- 服务器
const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    if (!(err instanceof HttpError)) console.error(`[error] ${req.method} ${req.url}`, err)
    sendError(res, err)
  })
})

// 定时清理过期会话
const sessionTimer = setInterval(() => {
  try {
    const n = purgeExpiredSessions()
    if (n) console.log(`[session] 清理过期会话 ${n} 条`)
  } catch (err) {
    console.error('[session] 清理失败', err.message)
  }
}, 6 * 3600_000)
sessionTimer.unref?.()

server.listen(config.port, config.host, () => {
  if (config.quiet) return
  const base = `http://${config.host}:${config.port}`
  console.log('')
  console.log(`  🚬  雪茄客 Cigar Community  v${VERSION}`)
  console.log(`  环境    ${config.env}${isProd ? '' : '（开发）'}`)
  console.log(`  数据    ${config.dbPath}`)
  console.log(`  数据量  ${bootStats.total?.cigars ?? 0} 款雪茄 · ${bootStats.total?.brands ?? 0} 品牌 · ${bootStats.total?.flavors ?? 0} 风味标签`)
  console.log(`  接口    ${base}/api/health`)
  if (distReady) {
    console.log(`  站点    ${base}`)
  } else {
    console.log('  站点    前端未构建。开发：cd web && npx vite ｜ 生产：npm run build')
  }
  console.log('')
})

function shutdown(signal) {
  console.log(`\n[${signal}] 正在关闭…`)
  server.close(() => {
    closeDb()
    console.log('[shutdown] 已安全退出')
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
