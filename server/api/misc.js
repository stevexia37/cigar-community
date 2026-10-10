import { readFileSync, existsSync } from 'node:fs'
import { Router, sendJson, HttpError, notFound } from '../lib/http.js'
import { queryOne } from '../db/index.js'
import { config } from '../config.js'
import { grantAgeGate, requireAuth } from '../middleware/auth.js'
import { saveImage, readImage, IMAGE_LIMITS } from '../lib/storage.js'

export const miscRouter = new Router()

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version

// ---------------------------------------------------------------- 健康检查
miscRouter.get('/health', async (req, res) => {
  let dbState = 'ok'
  let cigars = null
  try {
    cigars = queryOne('SELECT COUNT(*) AS n FROM cigars')?.n ?? 0
  } catch (err) {
    dbState = `error: ${err.message}`
  }
  sendJson(res, 200, {
    ok: dbState === 'ok',
    version: VERSION,
    uptime: Math.round(process.uptime() * 10) / 10,
    db: dbState,
    env: config.env,
    cigars,
  })
})

// ---------------------------------------------------------------- 年龄门
// 验收标准 1.2.3/1.2.4：拒绝则不下发 Cookie；通过则 30 天内不再弹窗
miscRouter.post('/gate/verify', async (req, res) => {
  const body = req.body || {}
  if (body.adult !== true) {
    throw new HttpError(403, '未确认年龄，无法继续访问', 'FORBIDDEN')
  }
  grantAgeGate(res)
  sendJson(res, 200, { ok: true })
})

// ---------------------------------------------------------------- 静态内容
const CONTENT_SLUGS = {
  'plume-vs-mold': { file: 'content/plume-vs-mold-guide.html', title: '起灰还是发霉？一文说清' },
}

miscRouter.get('/content/:slug', async (req, res) => {
  const meta = CONTENT_SLUGS[req.params.slug]
  if (!meta) throw notFound('内容不存在')

  const file = `${config.paths.root}/${meta.file}`
  if (!existsSync(file)) throw notFound('内容文件缺失')

  const html = readFileSync(file, 'utf8')
  // 只取 <body> 内部，避免把原文档的 <head>/<style> 塞进页面
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  sendJson(res, 200, { title: meta.title, html: body ? body[1] : html })
})

// ---------------------------------------------------------------- 图片上传
/**
 * 用 JSON + base64 而不是 multipart：省掉一个依赖，也避开 multipart 解析这类
 * 历史漏洞高发区。前端在上传前已用 canvas 压到最长边 1600px。
 */
miscRouter.post('/uploads', async (req, res) => {
  const user = requireAuth(req)

  const body = req.body || {}
  const data = body.data ?? body.image ?? null
  if (!data) throw new HttpError(400, '请求体需包含 data 字段（base64 或 dataURL）', 'BAD_REQUEST')

  const saved = saveImage(data)

  const payload = {
    url: saved.url,
    bytes: saved.bytes,
    mime: saved.mime,
    width: saved.width,
    height: saved.height,
  }
  sendJson(res, 201, { image: payload, uploadedBy: user.id })
})

/** 告诉前端当前的图片限制，避免前端硬编码上限 */
miscRouter.get('/uploads/limits', async (req, res) => {
  sendJson(res, 200, {
    maxBytes: IMAGE_LIMITS.maxBytes,
    maxBytesGif: IMAGE_LIMITS.maxBytesGif,
    allowed: IMAGE_LIMITS.allowed,
    // 前端压缩目标，服务端与前端保持一致
    targetMaxEdge: 1600,
    targetQuality: 0.82,
  })
})
