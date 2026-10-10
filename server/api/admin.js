/**
 * 管理接口（admin / editor）
 *
 * 存在理由：命中审核词的内容会以 status=-1 入库、投稿以 pending 入库，
 * 但在此之前**没有任何界面能看到它们** —— 用户以为发出去了，运营完全看不见，
 * 审核队列实际是内容黑洞。这里提供运营所需的读与改能力。
 *
 * 权限：全部要求 admin 或 editor 角色。普通用户一律 403。
 */
import { Router, sendJson, badRequest, notFound, HttpError } from '../lib/http.js'
import { query, queryOne, run, transaction, nowIso, count } from '../db/index.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { parsePagination, parseId } from '../lib/query.js'
import { shapeReview } from './shape.js'
import { detectVitolaFamily, normalizeBrandName } from '../seed.js'

export const adminRouter = new Router()

/** admin 与 editor 都可以处理内容；纯管理操作（用户封禁等）另用 requireAdmin */
function requireModerator(req) {
  const user = requireAuth(req)
  if (user.role !== 'admin' && user.role !== 'editor') {
    throw new HttpError(403, '需要管理员或编辑权限', 'FORBIDDEN')
  }
  return user
}

function excerpt(text, len = 200) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > len ? s.slice(0, len) + '…' : s
}

/** 写一条运营操作日志，便于事后追责与回溯 */
function logAction(actorId, kind, refId, action, matched, text) {
  run(
    'INSERT INTO audit_log (user_id, kind, ref_id, action, matched, excerpt, created_at) VALUES (?,?,?,?,?,?,?)',
    [actorId, kind, refId, action, matched ?? null, excerpt(text), nowIso()],
  )
}

// ---------------------------------------------------------------- 概览
adminRouter.get('/admin/stats', async (req, res) => {
  requireModerator(req)

  const pendingReviews = queryOne("SELECT COUNT(*) AS n FROM reviews WHERE status = -1")?.n ?? 0
  const pendingSubmissions = queryOne("SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'")?.n ?? 0

  const recentBlocked = query(
    `SELECT action, COUNT(*) AS n FROM audit_log
     WHERE created_at >= datetime('now', '-7 days')
     GROUP BY action`,
  )

  const daily = query(
    `SELECT substr(created_at, 1, 10) AS day,
            SUM(CASE WHEN kind = 'review' THEN 1 ELSE 0 END) AS reviews,
            SUM(CASE WHEN action = 'blocked' THEN 1 ELSE 0 END) AS blocked
     FROM audit_log
     WHERE created_at >= datetime('now', '-14 days')
     GROUP BY day ORDER BY day DESC LIMIT 14`,
  )

  sendJson(res, 200, {
    queue: {
      reviews: pendingReviews,
      submissions: pendingSubmissions,
      total: pendingReviews + pendingSubmissions,
    },
    totals: {
      cigars: count('cigars'),
      brands: count('brands'),
      flavors: count('flavors'),
      reviews: queryOne('SELECT COUNT(*) AS n FROM reviews WHERE status = 1')?.n ?? 0,
      users: count('users'),
      reviewImages: count('review_images'),
    },
    compliance: {
      last7Days: Object.fromEntries(recentBlocked.map((r) => [r.action, r.n])),
      daily,
    },
    // 缺描述的雪茄 = 内容待补，这是运营可直接上手的待办
    contentGaps: {
      cigarsWithoutPrice: queryOne('SELECT COUNT(*) AS n FROM cigars WHERE price_cny IS NULL')?.n ?? 0,
      cigarsWithoutRating: queryOne('SELECT COUNT(*) AS n FROM cigars WHERE rating IS NULL')?.n ?? 0,
      cigarsWithoutFlavors: queryOne(
        `SELECT COUNT(*) AS n FROM cigars c
         WHERE NOT EXISTS (SELECT 1 FROM cigar_flavors cf WHERE cf.cigar_id = c.id)`,
      )?.n ?? 0,
    },
    generatedAt: nowIso(),
  })
})

// ---------------------------------------------------------------- 笔记审核
adminRouter.get('/admin/reviews', async (req, res) => {
  requireModerator(req)
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 })

  const where = []
  const params = []
  if (req.query.status !== undefined && req.query.status !== '') {
    const st = Number(req.query.status)
    if (!Number.isInteger(st)) throw badRequest('status 必须是整数（-1 待审 / 0 驳回 / 1 已发布）')
    where.push('r.status = ?')
    params.push(st)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = queryOne(`SELECT COUNT(*) AS n FROM reviews r ${whereSql}`, params)?.n ?? 0
  const rows = query(
    `SELECT r.*, u.username, u.avatar_url,
            b.name || ' ' || c.vitola AS cigar_label
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN cigars c ON c.id = r.cigar_id
     JOIN brands b ON b.id = c.brand_id
     ${whereSql}
     ORDER BY (r.status = -1) DESC, r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  const totalPages = Math.ceil(total / pageSize)

  sendJson(res, 200, {
    items: rows.map((r) => ({
      ...shapeReview(r, req.user.id, false),
      // 审核需要看完整正文与命中记录，列表接口的截断规则在这里不适用
      contentFull: r.content || '',
    })),
    total,
    page: Math.min(page, Math.max(1, totalPages)),
    pageSize,
    totalPages,
  })
})

/** 单条笔记的完整内容 + 相关审核日志（运营判断依据） */
adminRouter.get('/admin/reviews/:id', async (req, res) => {
  requireModerator(req)
  const parsed = parseId(req.params.id, { name: '笔记 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('笔记 ID 必须是正整数')

  const row = queryOne(
    `SELECT r.*, u.username, b.name || ' ' || c.vitola AS cigar_label
     FROM reviews r JOIN users u ON u.id = r.user_id
     JOIN cigars c ON c.id = r.cigar_id JOIN brands b ON b.id = c.brand_id
     WHERE r.id = ?`,
    [parsed],
  )
  if (!row) throw notFound('笔记不存在')

  const logs = query(
    `SELECT action, matched, excerpt, created_at FROM audit_log
     WHERE kind = 'review' AND ref_id = ? ORDER BY created_at DESC LIMIT 10`,
    [parsed],
  )

  sendJson(res, 200, {
    review: { ...shapeReview(row, req.user.id, false), contentFull: row.content || '' },
    auditLog: logs.map((l) => ({
      action: l.action,
      matched: safeParse(l.matched),
      excerpt: l.excerpt,
      createdAt: l.created_at,
    })),
  })
})

/** 重新计算某支雪茄的展示评分（1-10 分笔记 → 1-5 星，与 reviews.js 保持一致） */
function recomputeCigarStats(cigarId) {
  const row = queryOne(
    `SELECT COUNT(*) AS n, AVG(overall_rating) AS avg_rating
     FROM reviews WHERE cigar_id = ? AND status = 1`,
    [cigarId],
  )
  const n = row?.n ?? 0
  let rating
  if (n > 0 && row.avg_rating != null) rating = Math.round((row.avg_rating / 2) * 10) / 10
  else rating = queryOne('SELECT base_rating FROM cigars WHERE id = ?', [cigarId])?.base_rating ?? null
  run('UPDATE cigars SET review_count = ?, rating = ?, updated_at = ? WHERE id = ?', [n, rating, nowIso(), cigarId])
}

adminRouter.post('/admin/reviews/:id/approve', async (req, res) => {
  const moderator = requireModerator(req)
  const parsed = parseId(req.params.id, { name: '笔记 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('笔记 ID 必须是正整数')

  const row = queryOne('SELECT id, cigar_id, status FROM reviews WHERE id = ?', [parsed])
  if (!row) throw notFound('笔记不存在')
  if (row.status === 1) throw badRequest('该笔记已是发布状态')

  transaction(() => {
    run('UPDATE reviews SET status = 1, updated_at = ? WHERE id = ?', [nowIso(), parsed])
    recomputeCigarStats(row.cigar_id)
    logAction(moderator.id, 'review', parsed, 'approved', null, `审核通过笔记 #${parsed}`)
  })

  sendJson(res, 200, { ok: true, id: parsed, status: 1 })
})

adminRouter.post('/admin/reviews/:id/reject', async (req, res) => {
  const moderator = requireModerator(req)
  const parsed = parseId(req.params.id, { name: '笔记 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('笔记 ID 必须是正整数')

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : ''
  const row = queryOne('SELECT id, cigar_id FROM reviews WHERE id = ?', [parsed])
  if (!row) throw notFound('笔记不存在')

  transaction(() => {
    // 驳回后置为 0（不公开、也不再出现在待审队列）
    run('UPDATE reviews SET status = 0, updated_at = ? WHERE id = ?', [nowIso(), parsed])
    recomputeCigarStats(row.cigar_id)
    logAction(moderator.id, 'review', parsed, 'rejected', null, reason || `驳回笔记 #${parsed}`)
  })

  sendJson(res, 200, { ok: true, id: parsed, status: 0, reason: reason || null })
})

adminRouter.delete('/admin/reviews/:id', async (req, res) => {
  const moderator = requireModerator(req)
  const parsed = parseId(req.params.id, { name: '笔记 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('笔记 ID 必须是正整数')

  const row = queryOne('SELECT id, cigar_id FROM reviews WHERE id = ?', [parsed])
  if (!row) throw notFound('笔记不存在')

  transaction(() => {
    run('DELETE FROM reviews WHERE id = ?', [parsed])
    recomputeCigarStats(row.cigar_id)
    logAction(moderator.id, 'review', parsed, 'deleted', null, `删除笔记 #${parsed}`)
  })

  sendJson(res, 200, { ok: true, id: parsed, deleted: true })
})

// ---------------------------------------------------------------- 投稿审批
adminRouter.get('/admin/submissions', async (req, res) => {
  requireModerator(req)
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 })

  const where = []
  const params = []
  const status = req.query.status
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    where.push('s.status = ?')
    params.push(status)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = queryOne(`SELECT COUNT(*) AS n FROM submissions s ${whereSql}`, params)?.n ?? 0
  const rows = query(
    `SELECT s.*, u.username FROM submissions s
     LEFT JOIN users u ON u.id = s.user_id
     ${whereSql}
     ORDER BY (s.status = 'pending') DESC, s.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  const totalPages = Math.ceil(total / pageSize)

  sendJson(res, 200, {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username || '已注销用户',
      status: r.status,
      rejectReason: r.reject_reason,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      payload: safeParse(r.payload),
    })),
    total,
    page: Math.min(page, Math.max(1, totalPages)),
    pageSize,
    totalPages,
  })
})

adminRouter.post('/admin/submissions/:id/approve', async (req, res) => {
  const moderator = requireModerator(req)
  const parsed = parseId(req.params.id, { name: '投稿 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('投稿 ID 必须是正整数')

  const sub = queryOne('SELECT * FROM submissions WHERE id = ?', [parsed])
  if (!sub) throw notFound('投稿不存在')
  if (sub.status === 'approved') throw badRequest('该投稿已通过')

  const payload = safeParse(sub.payload)
  if (!payload || !payload.brand || !payload.vitola) {
    throw badRequest('投稿内容不完整，无法入库（缺少品牌或型号）')
  }

  const result = transaction((conn) => {
    const cigarId = insertCigarFromPayload(conn, payload)
    run(
      "UPDATE submissions SET status = 'approved', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL WHERE id = ?",
      [moderator.id, nowIso(), parsed],
    )
    logAction(moderator.id, 'submission', parsed, 'approved', null,
      `投稿通过并入库为雪茄 #${cigarId}：${payload.brand} ${payload.vitola}`)
    return cigarId
  })

  sendJson(res, 200, { ok: true, id: parsed, status: 'approved', cigarId: result })
})

adminRouter.post('/admin/submissions/:id/reject', async (req, res) => {
  const moderator = requireModerator(req)
  const parsed = parseId(req.params.id, { name: '投稿 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('投稿 ID 必须是正整数')

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : ''
  const sub = queryOne('SELECT id FROM submissions WHERE id = ?', [parsed])
  if (!sub) throw notFound('投稿不存在')

  run(
    "UPDATE submissions SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
    [reason || '未通过审核', moderator.id, nowIso(), parsed],
  )
  logAction(moderator.id, 'submission', parsed, 'rejected', null, reason || `驳回投稿 #${parsed}`)

  sendJson(res, 200, { ok: true, id: parsed, status: 'rejected', reason: reason || null })
})

// ---------------------------------------------------------------- 审核日志
adminRouter.get('/admin/audit-log', async (req, res) => {
  requireModerator(req)
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 30, maxPageSize: 100 })

  const where = []
  const params = []
  if (typeof req.query.action === 'string' && req.query.action) {
    where.push('a.action = ?')
    params.push(req.query.action)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = queryOne(`SELECT COUNT(*) AS n FROM audit_log a ${whereSql}`, params)?.n ?? 0
  const rows = query(
    `SELECT a.*, u.username FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  const totalPages = Math.ceil(total / pageSize)

  sendJson(res, 200, {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      refId: r.ref_id,
      action: r.action,
      matched: safeParse(r.matched),
      excerpt: r.excerpt,
      username: r.username || '系统',
      createdAt: r.created_at,
    })),
    total,
    page: Math.min(page, Math.max(1, totalPages)),
    pageSize,
    totalPages,
  })
})

// ---------------------------------------------------------------- 用户管理（仅 admin）
adminRouter.get('/admin/users', async (req, res) => {
  requireAdmin(req)
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 30, maxPageSize: 100 })
  const total = count('users')
  const rows = query(
    `SELECT u.id, u.username, u.email, u.role, u.status, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS review_count,
            (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id) AS submission_count
     FROM users u ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
  )
  const totalPages = Math.ceil(total / pageSize)
  sendJson(res, 200, {
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      status: r.status,
      reviewCount: r.review_count,
      submissionCount: r.submission_count,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
    })),
    total,
    page: Math.min(page, Math.max(1, totalPages)),
    pageSize,
    totalPages,
  })
})

/** 启用/停用账号。停用会同时清掉该用户所有会话，立即生效。 */
adminRouter.post('/admin/users/:id/status', async (req, res) => {
  const admin = requireAdmin(req)
  const parsed = parseId(req.params.id, { name: '用户 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('用户 ID 必须是正整数')

  if (parsed === admin.id) throw badRequest('不能停用自己的账号')

  const target = queryOne('SELECT id, role FROM users WHERE id = ?', [parsed])
  if (!target) throw notFound('用户不存在')
  if (target.role === 'admin') throw badRequest('不能停用管理员账号')

  const status = req.body?.status === 0 || req.body?.status === false ? 0 : 1

  transaction(() => {
    run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), parsed])
    // 停用必须立刻踢下线，否则已登录的会话仍能继续操作
    if (status === 0) run('DELETE FROM sessions WHERE user_id = ?', [parsed])
    logAction(admin.id, 'user', parsed, status === 1 ? 'enabled' : 'disabled', null, `用户 #${parsed}`)
  })

  sendJson(res, 200, { ok: true, id: parsed, status })
})

// ---------------------------------------------------------------- 工具
function safeParse(json) {
  if (json === null || json === undefined) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** 把一条通过的投稿写入 cigars 表（新建品牌/国家，关联风味） */
export function insertCigarFromPayload(conn, payload) {
  const brandName = String(payload.brand || '').trim()
  const vitola = String(payload.vitola || '').trim()
  const brandNorm = normalizeBrandName(brandName)

  // 国家：优先用投稿给的 ISO 代码，找不到则回落到古巴（非古内容通常都会给代码）
  let country = null
  if (payload.countryCode) {
    country = conn.prepare('SELECT id FROM countries WHERE code = ?').get(String(payload.countryCode).toUpperCase())
  }
  if (!country) country = conn.prepare('SELECT id FROM countries WHERE code = ?').get('CU')
  if (!country) throw badRequest('国家字典为空，请先执行种子导入')

  // 品牌：按归一化名复用已有品牌，避免 Padron / Padrón 这类拆分
  let brand = conn.prepare('SELECT id FROM brands WHERE name_norm = ?').get(brandNorm)
  if (!brand) {
    conn.prepare('INSERT INTO brands (name, name_norm, country_id) VALUES (?,?,?)')
      .run(brandName, brandNorm, country.id)
    brand = conn.prepare('SELECT id FROM brands WHERE name_norm = ?').get(brandNorm)
  }

  const series = payload.series ? String(payload.series).trim() : null
  const existing = conn.prepare(
    "SELECT id FROM cigars WHERE brand_id = ? AND COALESCE(series,'') = COALESCE(?,'') AND vitola = ?",
  ).get(brand.id, series, vitola)

  const family = detectVitolaFamily(vitola, payload.ringGauge, payload.lengthInch)
  const lengthMm = payload.lengthInch ? Math.round(Number(payload.lengthInch) * 25.4) : null
  const originType = payload.originType === 'cuban' ? 'cuban' : 'non-cuban'
  const ts = nowIso()

  let cigarId
  if (existing) {
    conn.prepare(
      `UPDATE cigars SET vitola_family = ?, length_inch = COALESCE(?, length_inch),
         length_mm = COALESCE(?, length_mm), ring_gauge = COALESCE(?, ring_gauge),
         strength = COALESCE(?, strength), wrapper_variety = COALESCE(?, wrapper_variety),
         description = COALESCE(?, description), updated_at = ?
       WHERE id = ?`,
    ).run(family, payload.lengthInch ?? null, lengthMm, payload.ringGauge ?? null,
      payload.strength ?? null, payload.wrapperVariety ?? null, payload.description ?? null,
      ts, existing.id)
    cigarId = existing.id
  } else {
    const r = conn.prepare(
      `INSERT INTO cigars (
         brand_id, series, vitola, vitola_family, length_inch, length_mm, ring_gauge,
         origin_type, country_id, wrapper_origin, wrapper_variety,
         strength, description, data_source, status, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    ).run(brand.id, series, vitola, family, payload.lengthInch ?? null, lengthMm,
      payload.ringGauge ?? null, originType, country.id, country.id,
      payload.wrapperVariety ?? null, payload.strength ?? null, payload.description ?? null,
      'user', ts, ts)
    cigarId = Number(r.lastInsertRowid)
  }

  // 风味关联：投稿给的是 flavor id 数组
  const flavorIds = Array.isArray(payload.flavorIds) ? payload.flavorIds : []
  const link = conn.prepare('INSERT OR IGNORE INTO cigar_flavors (cigar_id, flavor_id, is_official) VALUES (?,?,0)')
  for (const fid of flavorIds) {
    const n = Number(fid)
    if (Number.isInteger(n) && n > 0) link.run(cigarId, n)
  }

  return cigarId
}
