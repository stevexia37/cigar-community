import { readFileSync, existsSync } from 'node:fs'
import { Router, sendJson, HttpError, notFound } from '../lib/http.js'
import { query, queryOne } from '../db/index.js'
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

// ---------------------------------------------------------------- 用户主页
/**
 * 公开的用户主页数据：资料 + 已发布笔记 + 投稿数。
 * 只暴露公开信息（用户名/简介/加入时间），不含邮箱等隐私字段。
 * 被停用的账号视为不存在，避免停用后仍可通过主页访问其内容。
 */
miscRouter.get('/users/:id', async (req, res) => {
  const { parseId } = await import('../lib/query.js')
  const parsed = parseId(req.params.id, { name: '用户 ID' })
  if (parsed === null || typeof parsed === 'object') throw new HttpError(400, '用户 ID 必须是正整数', 'INVALID_ID')

  const user = queryOne(
    'SELECT id, username, avatar_url, bio, role, created_at FROM users WHERE id = ? AND status = 1',
    [parsed],
  )
  if (!user) throw notFound('用户不存在')

  const { imagesByReview, shapeReview } = await import('./shape.js')
  const reviewRows = query(
    `SELECT r.*, u.username, u.avatar_url, b.name || ' ' || c.vitola AS cigar_label
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN cigars c ON c.id = r.cigar_id
     JOIN brands b ON b.id = c.brand_id
     WHERE r.user_id = ? AND r.status = 1
     ORDER BY r.created_at DESC LIMIT 20`,
    [parsed],
  )
  const imageMap = imagesByReview(reviewRows.map((r) => r.id))

  const stats = queryOne(
    `SELECT
       (SELECT COUNT(*) FROM reviews WHERE user_id = ? AND status = 1) AS reviews,
       (SELECT COUNT(*) FROM submissions WHERE user_id = ?) AS submissions,
       (SELECT COALESCE(SUM(helpful_count), 0) FROM reviews WHERE user_id = ? AND status = 1) AS helpful`,
    [parsed, parsed, parsed],
  )

  sendJson(res, 200, {
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      role: user.role,
      createdAt: user.created_at,
    },
    stats: {
      reviews: stats?.reviews ?? 0,
      submissions: stats?.submissions ?? 0,
      helpful: stats?.helpful ?? 0,
    },
    reviews: reviewRows.map((r) => shapeReview(r, req.user?.id ?? null, false, imageMap.get(r.id) || [])),
  })
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
