import { Router, sendJson, badRequest, notFound, HttpError } from '../lib/http.js'
import { query, queryOne, run, transaction, nowIso } from '../db/index.js'
import { parsePagination, parseId } from '../lib/query.js'
import { scan } from '../lib/sensitive.js'
import { requireAuth } from '../middleware/auth.js'
import { shapeReview, imagesByReview } from './shape.js'
import { saveImage, MAX_IMAGES_PER_REVIEW } from '../lib/storage.js'

export const reviewRouter = new Router()

const SELECT_REVIEW = `
  SELECT r.*, u.username, u.avatar_url,
         b.name || ' ' || c.vitola AS cigar_label
  FROM reviews r
  JOIN users u ON u.id = r.user_id
  JOIN cigars c ON c.id = r.cigar_id
  JOIN brands b ON b.id = c.brand_id
`

/** 1-10 分校验：允许 null，越界直接 400 */
function score(value, name) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 10 || !Number.isInteger(n)) {
    throw badRequest(`${name} 必须是 1-10 的整数`)
  }
  return n
}

function optionalInt(value, name, { min = 0, max = 100000 } = {}) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} 超出合理范围（${min}-${max}）`)
  return Math.round(n)
}

function optionalFloat(value, name, { min = 0, max = 100 } = {}) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} 超出合理范围（${min}-${max}）`)
  return Math.round(n * 10) / 10
}

function excerpt(text, len = 120) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > len ? s.slice(0, len) + '…' : s
}

function logSensitivity(userId, kind, refId, result, text) {
  run(
    'INSERT INTO audit_log (user_id, kind, ref_id, action, matched, excerpt, created_at) VALUES (?,?,?,?,?,?,?)',
    [userId, kind, refId, result.action, JSON.stringify(result.matched), excerpt(text), nowIso()],
  )
}

/**
 * 重新计算某支雪茄的展示评分。
 *
 * ⚠️ 量纲转换（踩过的坑）：用户笔记打的是 1-10 分，而雪茄的 `rating` 是 1-5 星。
 * 早期版本直接把 1-10 的均分写进 rating，导致出现「8.0 星」这种离谱数据。
 * 这里统一换算到 5 分制；没有已发布笔记时回落到种子基准分 `base_rating`。
 */
function recomputeCigarStats(cigarId) {
  const row = queryOne(
    `SELECT COUNT(*) AS n, AVG(overall_rating) AS avg_rating
     FROM reviews WHERE cigar_id = ? AND status = 1`,
    [cigarId],
  )
  const count = row?.n ?? 0

  let rating
  if (count > 0 && row.avg_rating != null) {
    // 1-10 → 1-5，保留一位小数
    rating = Math.round((row.avg_rating / 2) * 10) / 10
  } else {
    const current = queryOne('SELECT base_rating FROM cigars WHERE id = ?', [cigarId])
    rating = current?.base_rating ?? null
  }

  run(
    'UPDATE cigars SET review_count = ?, rating = ?, updated_at = ? WHERE id = ?',
    [count, rating, nowIso(), cigarId],
  )
}

// ---------------------------------------------------------------- 列表
reviewRouter.get('/reviews', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 12, maxPageSize: 60 })
  const where = ['r.status = 1']
  const params = []

  // 非法 ID 必须报错而不是静默返回空列表（否则前端分不清「没有数据」与「参数写错」）
  for (const [param, column] of [['cigarId', 'r.cigar_id'], ['userId', 'r.user_id']]) {
    if (req.query[param] === undefined || req.query[param] === '') continue
    const parsed = parseId(req.query[param], { name: param })
    if (parsed === null || typeof parsed === 'object') {
      throw badRequest(`${param} 必须是正整数`, 'INVALID_ID')
    }
    where.push(`${column} = ?`)
    params.push(parsed)
  }

  const ORDER = {
    helpful: 'r.helpful_count DESC, r.created_at DESC',
    newest: 'r.created_at DESC',
    rating: 'r.overall_rating DESC, r.created_at DESC',
  }
  const orderBy = ORDER[req.query.sort] || ORDER.helpful
  const whereSql = where.join(' AND ')

  const total = queryOne(`SELECT COUNT(*) AS n FROM reviews r WHERE ${whereSql}`, params)?.n ?? 0
  const rows = query(`${SELECT_REVIEW} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset])

  const helpfulSet = new Set()
  if (req.user && rows.length) {
    const ids = rows.map((r) => r.id)
    const voted = query(
      `SELECT review_id FROM review_votes WHERE user_id = ? AND review_id IN (${ids.map(() => '?').join(',')})`,
      [req.user.id, ...ids],
    )
    for (const v of voted) helpfulSet.add(v.review_id)
  }

  const totalPages = Math.ceil(total / pageSize)
  const imageMap = imagesByReview(rows.map((r) => r.id))
  sendJson(res, 200, {
    items: rows.map((r) => shapeReview(r, req.user?.id ?? null, helpfulSet.has(r.id), imageMap.get(r.id) || [])),
    total,
    page: Math.min(page, Math.max(1, totalPages)),
    pageSize,
    totalPages,
  })
})

// ---------------------------------------------------------------- 创建
reviewRouter.post('/reviews', async (req, res) => {
  const user = requireAuth(req)
  const body = req.body || {}

  const cigarId = Number(body.cigarId)
  if (!Number.isInteger(cigarId) || cigarId <= 0) throw badRequest('请选择要评价的雪茄')
  const cigar = queryOne('SELECT id FROM cigars WHERE id = ? AND status = 1', [cigarId])
  if (!cigar) throw badRequest('指定的雪茄不存在')

  if (body.overallRating === undefined || body.overallRating === null || body.overallRating === '') {
    throw badRequest('总体评分必填')
  }
  const overallRating = score(body.overallRating, '总体评分')

  const payload = {
    title: typeof body.title === 'string' ? body.title.trim().slice(0, 200) : null,
    content: typeof body.content === 'string' ? body.content.trim().slice(0, 20000) : null,
    preScore: score(body.preScore, '前段评分'),
    midScore: score(body.midScore, '中段评分'),
    postScore: score(body.postScore, '尾段评分'),
    burnEvenness: score(body.burnEvenness, '斜烧度评分'),
    drawResistance: score(body.drawResistance, '抽吸阻力评分'),
    smokingTime: optionalInt(body.smokingTime, '品吸时长', { min: 1, max: 1440 }),
    pairing: typeof body.pairing === 'string' ? body.pairing.trim().slice(0, 300) : null,
    humidityAtSmoke: optionalFloat(body.humidityAtSmoke, '品吸湿度', { min: 0, max: 100 }),
    restTimeDays: optionalInt(body.restTimeDays, '静养天数', { min: 0, max: 20000 }),
  }

  // 配图：最多 6 张。data: 开头的是新上传（需落盘），/uploads/ 开头的是已存 URL（复用）
  const rawImages = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES_PER_REVIEW) : []
  const images = []
  for (const item of rawImages) {
    // 允许直接传字符串，也允许传 { data, description }
    const source = typeof item === 'string' ? item : (item?.data ?? item?.url ?? null)
    const description = typeof item === 'object' && item ? (item.description ?? null) : null
    if (typeof source !== 'string' || !source) continue

    if (source.startsWith('data:')) {
      // 新上传：校验并落盘。格式非法会抛 400/413，让用户明确知道哪张图有问题
      const saved = saveImage(source)
      images.push({ url: saved.url, description: description ? String(description).slice(0, 200) : null })
    } else if (source.startsWith('/uploads/')) {
      // 复用已上传的图（例如用户先传后改文，避免重复落盘）
      const filename = source.slice('/uploads/'.length)
      const { readImage } = await import('../lib/storage.js')
      if (readImage(filename)) images.push({ url: source, description: description ? String(description).slice(0, 200) : null })
    }
  }

  // 合规熔断：标题 + 正文一起扫，避免把违规内容拆到两个字段绕过
  const sensitivity = scan(`${payload.title || ''}\n${payload.content || ''}\n${payload.pairing || ''}`)

  if (sensitivity.action === 'blocked') {
    logSensitivity(user.id, 'review', null, sensitivity, `${payload.title || ''} ${payload.content || ''}`)
    throw new HttpError(403, sensitivity.message, 'CONTENT_REJECTED', { matched: sensitivity.matched })
  }

  const status = sensitivity.action === 'queued' ? -1 : 1
  const ts = nowIso()

  const id = transaction((conn) => {
    const res2 = run(
      `INSERT INTO reviews (
         user_id, cigar_id, pre_score, mid_score, post_score, burn_evenness, draw_resistance,
         overall_rating, title, content, smoking_time, pairing, humidity_at_smoke, rest_time_days,
         status, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [user.id, cigarId, payload.preScore, payload.midScore, payload.postScore,
        payload.burnEvenness, payload.drawResistance, overallRating, payload.title, payload.content,
        payload.smokingTime, payload.pairing, payload.humidityAtSmoke, payload.restTimeDays,
        status, ts, ts],
    )
    const newId = Number(res2.lastInsertRowid)
    const insImage = conn.prepare(
      'INSERT INTO review_images (review_id, image_url, description, sort_order) VALUES (?,?,?,?)',
    )
    images.forEach((img, idx) => insImage.run(newId, img.url, img.description, idx))
    logSensitivity(user.id, 'review', newId, sensitivity, `${payload.title || ''} ${payload.content || ''}`)
    if (status === 1) recomputeCigarStats(cigarId)
    return newId
  })

  const row = queryOne(`${SELECT_REVIEW} WHERE r.id = ?`, [id])
  // 回带刚写入的配图：否则前端拿到 images: [] ，无法立刻预览用户刚上传的图
  const createdImages = imagesByReview([id]).get(id) || []

  if (status === -1) {
    // 命中审核词：内容已入库但不公开，返回 202
    sendJson(res, 202, {
      // 契约要求：非 2xx… 但 202 是成功语义，仍带上 code 以便客户端统一判断
      code: 'CONTENT_QUEUED',
      review: shapeReview(row, user.id, false, createdImages),
      sensitivity: { action: sensitivity.action, matched: sensitivity.matched, message: sensitivity.message },
    })
    return
  }

  sendJson(res, 201, {
    review: shapeReview(row, user.id, false, createdImages),
    sensitivity: { action: sensitivity.action, matched: sensitivity.matched, message: sensitivity.message },
  })
})

// ---------------------------------------------------------------- 有用投票
reviewRouter.post('/reviews/:id/helpful', async (req, res) => {
  const user = requireAuth(req)
  const parsedId = parseId(req.params.id, { name: '笔记 ID' })
  if (parsedId === null || typeof parsedId === 'object') throw badRequest('笔记 ID 必须是正整数', 'INVALID_ID')
  const id = parsedId

  const review = queryOne('SELECT id, user_id, status FROM reviews WHERE id = ?', [id])
  if (!review || review.status !== 1) throw notFound('笔记不存在')

  const existing = queryOne('SELECT 1 AS x FROM review_votes WHERE review_id = ? AND user_id = ?', [id, user.id])

  transaction(() => {
    if (existing) {
      run('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?', [id, user.id])
    } else {
      run('INSERT INTO review_votes (review_id, user_id, created_at) VALUES (?,?,?)', [id, user.id, nowIso()])
    }
    // 以实际投票数为准，避免计数漂移
    const n = queryOne('SELECT COUNT(*) AS n FROM review_votes WHERE review_id = ?', [id])?.n ?? 0
    run('UPDATE reviews SET helpful_count = ? WHERE id = ?', [n, id])
  })

  const count = queryOne('SELECT helpful_count FROM reviews WHERE id = ?', [id])?.helpful_count ?? 0
  sendJson(res, 200, { helpfulCount: count, helpfulByMe: !existing })
})
