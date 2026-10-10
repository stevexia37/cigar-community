import { Router, sendJson, notFound, badRequest } from '../lib/http.js'
import { query, queryOne } from '../db/index.js'
import { parsePagination, parseList, parseIntList, parseId, toFloat } from '../lib/query.js'
import {
  buildCigarQuery, countCigars, flavorsByCigar, shapeCigar,
  shapeReview, CATEGORY_LABELS, originKeyFromCode,
} from './shape.js'

export const cigarRouter = new Router()

// 合法产地集合（与 seed 的 COUNTRY_INFO 一致）。
// 早期实现把无法识别的 origin 静默丢弃，却仍在 applied 里回显原值，
// 于是 ?origin=mars 返回全部条目 —— 用户看到「筛选生效」实际没有。现在显式报错。
const VALID_ORIGINS = new Set([
  'cuba', 'nicaragua', 'dominican', 'davidoff', 'honduras', 'usa',
  'mexico', 'ecuador', 'brazil', 'cameroon', 'indonesia', 'philippines',
])

function parseFilters(q) {
  const origins = parseList(q.origin)
  const unknownOrigins = origins.filter((o) => !VALID_ORIGINS.has(o))
  if (unknownOrigins.length) {
    throw badRequest(
      `未知产地：${unknownOrigins.join('、')}。可用值见 /api/meta 的 origins。`,
      'UNKNOWN_ORIGIN',
      { unknown: unknownOrigins, allowed: [...VALID_ORIGINS] },
    )
  }

  let minRating = null
  if (q.minRating !== undefined && q.minRating !== null && q.minRating !== '') {
    minRating = toFloat(q.minRating)
    if (minRating === null || minRating < 0 || minRating > 5) {
      throw badRequest('minRating 必须是 0-5 之间的数字', 'INVALID_MIN_RATING')
    }
  }

  return {
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '',
    origins,
    sizes: parseList(q.size),
    strengths: parseIntList(q.strength).filter((n) => n >= 1 && n <= 5),
    flavorIds: parseIntList(q.flavor),
    brandIds: parseIntList(q.brand),
    sort: typeof q.sort === 'string' ? q.sort : 'rating',
    minRating,
  }
}

// ---------------------------------------------------------------- 列表
cigarRouter.get('/cigars', async (req, res) => {
  const filters = parseFilters(req.query)
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 24, maxPageSize: 60 })

  const total = countCigars(filters)
  const { sql, params } = buildCigarQuery(filters)
  const rows = query(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset])
  const flavorMap = flavorsByCigar(rows.map((r) => r.id))

  const totalPages = Math.ceil(total / pageSize)
  sendJson(res, 200, {
    items: rows.map((r) => shapeCigar(r, flavorMap.get(r.id) || [])),
    total,
    // 请求了超出范围的页时，回显真实最大页而不是那个不存在的页号
    page: Math.min(page, Math.max(1, totalPages)),
    pageSize,
    totalPages,
    applied: {
      q: filters.q,
      origin: filters.origins,
      size: filters.sizes,
      strength: filters.strengths,
      flavor: filters.flavorIds,
      brand: filters.brandIds,
      sort: filters.sort,
    },
  })
})

// ---------------------------------------------------------------- 风味字典
cigarRouter.get('/flavors', async (req, res) => {
  const rows = query(
    `SELECT f.id, f.name, f.name_cn, f.category, COUNT(cf.cigar_id) AS n
     FROM flavors f
     LEFT JOIN cigar_flavors cf ON cf.flavor_id = f.id
     GROUP BY f.id ORDER BY f.sort_order, f.id`,
  )
  sendJson(res, 200, {
    flavors: rows.map((r) => ({
      id: r.id,
      name: r.name,
      label: r.name_cn || r.name,
      category: r.category || 'complex',
      categoryLabel: CATEGORY_LABELS[r.category] || '复合',
      count: r.n || 0,
    })),
  })
})

// ---------------------------------------------------------------- 详情
cigarRouter.get('/cigars/:id', async (req, res) => {
  const parsed = parseId(req.params.id, { name: '雪茄 ID' })
  if (parsed === null || typeof parsed === 'object') throw badRequest('雪茄 ID 必须是正整数', 'INVALID_ID')
  const id = parsed

  const row = queryOne(
    `SELECT c.*, b.name AS brand_name, co.code AS country_code, co.name_cn AS country_name_cn
     FROM cigars c
     JOIN brands b ON b.id = c.brand_id
     JOIN countries co ON co.id = c.country_id
     WHERE c.id = ? AND c.status = 1`,
    [id],
  )
  if (!row) throw notFound('未找到这支雪茄')

  const flavorMap = flavorsByCigar([id])
  const cigar = shapeCigar(row, flavorMap.get(id) || [])

  const reviewRows = query(
    `SELECT r.*, u.username, u.avatar_url,
            b.name || ' ' || c.vitola AS cigar_label
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN cigars c ON c.id = r.cigar_id
     JOIN brands b ON b.id = c.brand_id
     WHERE r.cigar_id = ? AND r.status = 1
     ORDER BY r.helpful_count DESC, r.created_at DESC
     LIMIT 20`,
    [id],
  )

  const helpfulSet = new Set()
  if (req.user && reviewRows.length) {
    const ids = reviewRows.map((r) => r.id)
    const voted = query(
      `SELECT review_id FROM review_votes WHERE user_id = ? AND review_id IN (${ids.map(() => '?').join(',')})`,
      [req.user.id, ...ids],
    )
    for (const v of voted) helpfulSet.add(v.review_id)
  }

  const summary = queryOne(
    `SELECT COUNT(*) AS n,
            AVG(overall_rating) AS avg_overall,
            AVG(pre_score) AS avg_pre, AVG(mid_score) AS avg_mid, AVG(post_score) AS avg_post
     FROM reviews WHERE cigar_id = ? AND status = 1`,
    [id],
  )

  cigar.reviewSummary = {
    count: summary?.n ?? 0,
    avgOverall: summary?.avg_overall != null ? Math.round(summary.avg_overall * 10) / 10 : null,
    avgPre: summary?.avg_pre != null ? Math.round(summary.avg_pre * 10) / 10 : null,
    avgMid: summary?.avg_mid != null ? Math.round(summary.avg_mid * 10) / 10 : null,
    avgPost: summary?.avg_post != null ? Math.round(summary.avg_post * 10) / 10 : null,
  }

  // 相关推荐：优先同风味，其次同产地/同浓郁度，排除自己
  const relatedRows = query(
    `SELECT c.*, b.name AS brand_name, co.code AS country_code, co.name_cn AS country_name_cn
     FROM cigars c
     JOIN brands b ON b.id = c.brand_id
     JOIN countries co ON co.id = c.country_id
     WHERE c.status = 1 AND c.id != ?
       AND (
         c.vitola_family = ?
         OR EXISTS (SELECT 1 FROM cigar_flavors cf
                    WHERE cf.cigar_id = c.id
                      AND cf.flavor_id IN (SELECT flavor_id FROM cigar_flavors WHERE cigar_id = ?))
       )
     ORDER BY (c.vitola_family = ?) DESC, c.rating IS NULL, c.rating DESC
     LIMIT 6`,
    [id, row.vitola_family, id, row.vitola_family],
  )
  const relatedFlavors = flavorsByCigar(relatedRows.map((r) => r.id))

  sendJson(res, 200, {
    cigar,
    reviews: reviewRows.map((r) => shapeReview(r, req.user?.id ?? null, helpfulSet.has(r.id))),
    related: relatedRows.map((r) => shapeCigar(r, relatedFlavors.get(r.id) || [])),
  })
})
