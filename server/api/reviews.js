import { Router, sendJson, badRequest, notFound, HttpError } from '../lib/http.js'
import { query, queryOne, run, transaction, nowIso } from '../db/index.js'
import { scan } from '../lib/sensitive.js'
import { requireAuth } from '../middleware/auth.js'
import { shapeReview } from './shape.js'

export const reviewRouter = new Router()

const SELECT_REVIEW = `
  SELECT r.*, u.username, u.avatar_url,
         b.name || ' ' || c.vitola AS cigar_label
  FROM reviews r
  JOIN users u ON u.id = r.user_id
  JOIN cigars c ON c.id = r.cigar_id
  JOIN brands b ON b.id = c.brand_id
`

function paginate(q) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(60, Math.max(1, Number(q.pageSize) || 12))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

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

/** 重新计算某支雪茄的已发布笔记数与平均分 */
function recomputeCigarStats(cigarId) {
  const row = queryOne(
    `SELECT COUNT(*) AS n, AVG(overall_rating) AS avg_rating
     FROM reviews WHERE cigar_id = ? AND status = 1`,
    [cigarId],
  )
  run(
    'UPDATE cigars SET review_count = ?, rating = COALESCE(?, rating), updated_at = ? WHERE id = ?',
    [row?.n ?? 0, row?.avg_rating != null ? Math.round(row.avg_rating * 10) / 10 : null, nowIso(), cigarId],
  )
}

// ---------------------------------------------------------------- 列表
reviewRouter.get('/reviews', async (req, res) => {
  const { page, pageSize, offset } = paginate(req.query)
  const where = ['r.status = 1']
  const params = []

  if (req.query.cigarId) {
    where.push('r.cigar_id = ?')
    params.push(Number(req.query.cigarId))
  }
  if (req.query.userId) {
    where.push('r.user_id = ?')
    params.push(Number(req.query.userId))
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

  sendJson(res, 200, {
    items: rows.map((r) => shapeReview(r, req.user?.id ?? null, helpfulSet.has(r.id))),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
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

  // 合规熔断：标题 + 正文一起扫，避免把违规内容拆到两个字段绕过
  const sensitivity = scan(`${payload.title || ''}\n${payload.content || ''}\n${payload.pairing || ''}`)

  if (sensitivity.action === 'blocked') {
    logSensitivity(user.id, 'review', null, sensitivity, `${payload.title || ''} ${payload.content || ''}`)
    throw new HttpError(403, sensitivity.message, 'CONTENT_REJECTED', { matched: sensitivity.matched })
  }

  const status = sensitivity.action === 'queued' ? -1 : 1
  const ts = nowIso()

  const id = transaction(() => {
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
    logSensitivity(user.id, 'review', newId, sensitivity, `${payload.title || ''} ${payload.content || ''}`)
    if (status === 1) recomputeCigarStats(cigarId)
    return newId
  })

  const row = queryOne(`${SELECT_REVIEW} WHERE r.id = ?`, [id])

  if (status === -1) {
    // 命中审核词：内容已入库但不公开，返回 202
    sendJson(res, 202, {
      review: shapeReview(row, user.id, false),
      sensitivity: { action: sensitivity.action, matched: sensitivity.matched, message: sensitivity.message },
    })
    return
  }

  sendJson(res, 201, {
    review: shapeReview(row, user.id, false),
    sensitivity: { action: sensitivity.action, matched: sensitivity.matched, message: sensitivity.message },
  })
})

// ---------------------------------------------------------------- 有用投票
reviewRouter.post('/reviews/:id/helpful', async (req, res) => {
  const user = requireAuth(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('笔记 ID 不合法')

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
