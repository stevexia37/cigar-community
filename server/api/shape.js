/**
 * 响应整形：数据库行 → docs/API.md 定义的 JSON 结构。
 * 前端不应该看到任何 snake_case 或内部字段名。
 */
import { query } from '../db/index.js'
import { queryOne } from '../db/index.js'

export const STRENGTH_LABELS = { 1: '清淡', 2: '中淡', 3: '中等', 4: '浓郁', 5: '极浓郁' }

export const CATEGORY_LABELS = {
  woody: '木香', spicy: '辛香', sweet: '甜香', earthy: '土香', nutty: '坚果',
  floral: '花香', fresh: '清新', toasty: '烘焙', smoky: '烟熏', complex: '复合',
}

export const FAMILY_LABELS = {
  robusto: '罗布图', churchill: '丘吉尔', corona: '科罗娜', torpedo: '鱼雷',
  double_corona: '双科罗娜', panatela: '巴纳特拉', lancero: '长矛',
  petit_corona: '小科罗娜', gordo: '戈多', belicoso: '贝利科索', other: '其它',
}

export const ORIGIN_LABELS = {
  cuba: '古巴', nicaragua: '尼加拉瓜', dominican: '多米尼加',
  davidoff: '瑞士', honduras: '洪都拉斯', usa: '美国', mexico: '墨西哥',
  ecuador: '厄瓜多尔', brazil: '巴西', cameroon: '喀麦隆',
  indonesia: '印度尼西亚', philippines: '菲律宾',
}

/** 国家 code → 前端 origin key（与 database/seed 的 COUNTRY_INFO 一致） */
const CODE_TO_ORIGIN = {
  CU: 'cuba', NI: 'nicaragua', DO: 'dominican', CH: 'davidoff', HN: 'honduras',
  US: 'usa', MX: 'mexico', EC: 'ecuador', BR: 'brazil', CM: 'cameroon',
  ID: 'indonesia', PH: 'philippines',
}

export function originKeyFromCode(code) {
  return CODE_TO_ORIGIN[code] || String(code || '').toLowerCase()
}

const SELECT_CIGAR = `
  SELECT c.id, c.brand_id, c.series, c.vitola, c.vitola_family,
         c.length_inch, c.length_mm, c.ring_gauge, c.origin_type, c.country_id,
         c.wrapper_variety, c.wrapper_origin, c.binder_variety, c.filler_variety,
         c.strength, c.recommended_humidity, c.recommended_temperature, c.wrapper_color,
         c.description, c.image_url, c.price_cny, c.rating, c.review_count, c.seed_review_count,
         c.data_source, c.created_at,
         b.name AS brand_name, co.code AS country_code, co.name_cn AS country_name_cn
  FROM cigars c
  JOIN brands b ON b.id = c.brand_id
  JOIN countries co ON co.id = c.country_id
`

/** 批量取风味（避免 N+1） */
export function flavorsByCigar(cigarIds) {
  if (!cigarIds.length) return new Map()
  const placeholders = cigarIds.map(() => '?').join(',')
  const rows = query(
    `SELECT cf.cigar_id, f.id, f.name, f.name_cn, f.category
     FROM cigar_flavors cf JOIN flavors f ON f.id = cf.flavor_id
     WHERE cf.cigar_id IN (${placeholders})
     ORDER BY f.sort_order, f.id`,
    cigarIds,
  )
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.cigar_id)) map.set(r.cigar_id, [])
    map.get(r.cigar_id).push({ id: r.id, name: r.name, label: r.name_cn || r.name, category: r.category })
  }
  return map
}

export function shapeCigar(row, flavors = []) {
  const origin = originKeyFromCode(row.country_code)
  return {
    id: row.id,
    brandId: row.brand_id,
    brand: row.brand_name,
    series: row.series || null,
    vitola: row.vitola,
    vitolaFamily: row.vitola_family || 'other',
    vitolaFamilyLabel: FAMILY_LABELS[row.vitola_family] || '其它',
    origin,
    originLabel: ORIGIN_LABELS[origin] || row.country_name_cn || origin,
    originType: row.origin_type,
    countryCode: row.country_code,
    lengthInch: row.length_inch,
    lengthMm: row.length_mm,
    ringGauge: row.ring_gauge,
    strength: row.strength,
    strengthLabel: STRENGTH_LABELS[row.strength] || null,
    wrapperVariety: row.wrapper_variety || null,
    binderVariety: row.binder_variety || null,
    fillerVariety: row.filler_variety || null,
    wrapperColor: row.wrapper_color || null,
    recommendedHumidity: row.recommended_humidity,
    recommendedTemperature: row.recommended_temperature,
    description: row.description || null,
    imageUrl: row.image_url || null,
    priceCny: row.price_cny,
    rating: row.rating,
    reviewCount: row.review_count ?? 0,
    // 其中有多少来自种子参考数据（前端据此标注「含参考数据」）
    seedReviewCount: row.seed_review_count ?? 0,
    dataSource: row.data_source || null,
    flavors,
  }
}

/**
 * 构造列表查询。
 * 说明：风味/品牌用 EXISTS 子查询而不是 JOIN，避免多风味雪茄在结果里被放大重复。
 */
export function buildCigarQuery(filters = {}) {
  const where = ['c.status = 1']
  const params = []

  const { q, origins = [], sizes = [], strengths = [], flavorIds = [], brandIds = [], minRating } = filters

  if (q) {
    const like = `%${q}%`
    where.push(`(
      b.name LIKE ? OR c.vitola LIKE ? OR COALESCE(c.series,'') LIKE ? OR COALESCE(c.description,'') LIKE ?
      OR EXISTS (SELECT 1 FROM cigar_flavors cf2 JOIN flavors f2 ON f2.id = cf2.flavor_id
                 WHERE cf2.cigar_id = c.id AND (f2.name LIKE ? OR f2.name_cn LIKE ?))
    )`)
    params.push(like, like, like, like, like, like)
  }

  if (origins.length) {
    // 前端传的是 origin key（cuba/davidoff…），用国家 code 反查
    const codes = origins.map((o) => Object.entries(CODE_TO_ORIGIN).find(([, v]) => v === o)?.[0]).filter(Boolean)
    if (codes.length) {
      where.push(`co.code IN (${codes.map(() => '?').join(',')})`)
      params.push(...codes)
    }
  }

  if (sizes.length) {
    where.push(`c.vitola_family IN (${sizes.map(() => '?').join(',')})`)
    params.push(...sizes)
  }

  if (strengths.length) {
    where.push(`c.strength IN (${strengths.map(() => '?').join(',')})`)
    params.push(...strengths)
  }

  if (flavorIds.length) {
    where.push(`EXISTS (SELECT 1 FROM cigar_flavors cf WHERE cf.cigar_id = c.id
                        AND cf.flavor_id IN (${flavorIds.map(() => '?').join(',')}))`)
    params.push(...flavorIds)
  }

  if (brandIds.length) {
    where.push(`c.brand_id IN (${brandIds.map(() => '?').join(',')})`)
    params.push(...brandIds)
  }

  if (minRating !== undefined && minRating !== null && minRating !== '') {
    where.push('c.rating IS NOT NULL AND c.rating >= ?')
    params.push(Number(minRating))
  }

  const ORDER = {
    rating:        'c.rating IS NULL, c.rating DESC, c.review_count DESC',
    popular:       'c.review_count DESC, c.rating DESC',
    price_asc:     'c.price_cny IS NULL, c.price_cny ASC',
    price_desc:    'c.price_cny IS NULL, c.price_cny DESC',
    strength_desc: 'c.strength DESC, c.rating DESC',
    newest:        'c.created_at DESC, c.id DESC',
    name:          'b.name COLLATE NOCASE ASC, c.vitola COLLATE NOCASE ASC',
  }
  const orderBy = ORDER[filters.sort] || ORDER.rating

  return { sql: `${SELECT_CIGAR} WHERE ${where.join(' AND ')} ORDER BY ${orderBy}`, params }
}

export function countCigars(filters = {}) {
  const { sql, params } = buildCigarQuery(filters)
  // 去掉 ORDER BY 再套一层 COUNT，避免为排序付出代价
  const bare = sql.split(' ORDER BY ')[0]
  const row = queryOne(`SELECT COUNT(*) AS n FROM (${bare})`, params)
  return row?.n ?? 0
}

export function shapeReview(row, currentUserId = null, helpfulByMe = false) {
  return {
    id: row.id,
    cigarId: row.cigar_id,
    cigarLabel: row.cigar_label || null,
    userId: row.user_id,
    username: row.username || '已注销用户',
    avatarUrl: row.avatar_url || null,
    title: row.title || null,
    content: row.content || null,
    preScore: row.pre_score,
    midScore: row.mid_score,
    postScore: row.post_score,
    burnEvenness: row.burn_evenness,
    drawResistance: row.draw_resistance,
    overallRating: row.overall_rating,
    smokingTime: row.smoking_time,
    pairing: row.pairing,
    humidityAtSmoke: row.humidity_at_smoke,
    restTimeDays: row.rest_time_days,
    helpfulCount: row.helpful_count ?? 0,
    helpfulByMe: !!helpfulByMe,
    isMine: currentUserId != null && row.user_id === currentUserId,
    status: row.status,
    createdAt: row.created_at,
  }
}
