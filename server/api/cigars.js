import { Router, sendJson, notFound, badRequest } from '../lib/http.js'
import { query, queryOne } from '../db/index.js'
import {
  buildCigarQuery, countCigars, flavorsByCigar, shapeCigar,
  shapeReview, CATEGORY_LABELS,
} from './shape.js'

export const cigarRouter = new Router()

const MAX_PAGE_SIZE = 60

/** 逗号分隔的多值参数解析：?origin=cuba,nicaragua */
function list(param) {
  if (param === undefined || param === null || param === '') return []
  const raw = Array.isArray(param) ? param : String(param).split(',')
  return raw.map((s) => String(s).trim()).filter(Boolean)
}

function intList(param) {
  return list(param).map((s) => Number(s)).filter((n) => Number.isFinite(n))
}

function paginate(q) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 24))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function parseFilters(q) {
  return {
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '',
    origins: list(q.origin),
    sizes: list(q.size),
    strengths: intList(q.strength).filter((n) => n >= 1 && n <= 5),
    flavorIds: intList(q.flavor),
    brandIds: intList(q.brand),
    sort: typeof q.sort === 'string' ? q.sort : 'rating',
    minRating: q.minRating,
  }
}

// ---------------------------------------------------------------- 列表
cigarRouter.get('/cigars', async (req, res) => {
  const filters = parseFilters(req.query)
  const { page, pageSize, offset } = paginate(req.query)

  const total = countCigars(filters)
  const { sql, params } = buildCigarQuery(filters)
  const rows = query(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset])
  const flavorMap = flavorsByCigar(rows.map((r) => r.id))

  sendJson(res, 200, {
    items: rows.map((r) => shapeCigar(r, flavorMap.get(r.id) || [])),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
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
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('雪茄 ID 不合法')

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
