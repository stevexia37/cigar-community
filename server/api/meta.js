import { Router, sendJson } from '../lib/http.js'
import { query, queryOne } from '../db/index.js'
import { originKeyFromCode, CATEGORY_LABELS, STRENGTH_LABELS, FAMILY_LABELS } from './shape.js'

export const metaRouter = new Router()

const FAMILY_ORDER = ['robusto', 'churchill', 'corona', 'torpedo', 'double_corona',
  'panatela', 'lancero', 'petit_corona', 'gordo', 'belicoso', 'other']

const FAMILY_RANGES = {
  robusto:       { rg: [48, 54], len: [4.5, 5.6] },
  churchill:     { rg: [44, 52], len: [6.5, 7.5] },
  corona:        { rg: [40, 46], len: [5.0, 6.2] },
  torpedo:       { rg: [50, 58], len: [5.5, 7.0] },
  double_corona: { rg: [45, 55], len: [6.8, 8.5] },
  panatela:      { rg: [34, 42], len: [5.5, 7.0] },
  lancero:       { rg: [34, 42], len: [6.8, 8.5] },
  petit_corona:  { rg: [38, 46], len: [3.8, 5.0] },
  gordo:         { rg: [56, 70], len: [4.5, 7.0] },
  belicoso:      { rg: [50, 56], len: [4.5, 6.5] },
}

metaRouter.get('/meta', async (req, res) => {
  const stats = {
    cigars: queryOne('SELECT COUNT(*) AS n FROM cigars WHERE status = 1')?.n ?? 0,
    brands: queryOne('SELECT COUNT(*) AS n FROM brands WHERE status = 1')?.n ?? 0,
    flavors: queryOne('SELECT COUNT(*) AS n FROM flavors')?.n ?? 0,
    reviews: queryOne('SELECT COUNT(*) AS n FROM reviews WHERE status = 1')?.n ?? 0,
    users: queryOne('SELECT COUNT(*) AS n FROM users WHERE status = 1')?.n ?? 0,
  }

  const countryRows = query(
    `SELECT co.code, co.name_cn, co.is_cuban, COUNT(c.id) AS n
     FROM countries co
     LEFT JOIN cigars c ON c.country_id = co.id AND c.status = 1
     GROUP BY co.id
     ORDER BY n DESC, co.name_cn`,
  )
  const origins = countryRows.map((r) => ({
    value: originKeyFromCode(r.code),
    label: r.name_cn || r.code,
    code: r.code,
    is_cuban: !!r.is_cuban,
    count: r.n,
  }))

  const familyRows = query(
    `SELECT vitola_family, COUNT(*) AS n FROM cigars WHERE status = 1 GROUP BY vitola_family`,
  )
  const familyCount = new Map(familyRows.map((r) => [r.vitola_family, r.n]))
  const sizes = FAMILY_ORDER
    .map((value) => ({
      value,
      label: FAMILY_LABELS[value] || value,
      rg: FAMILY_RANGES[value]?.rg ?? null,
      len: FAMILY_RANGES[value]?.len ?? null,
      count: familyCount.get(value) || 0,
    }))
    .filter((s) => s.count > 0)

  const strengthRows = query(
    `SELECT strength, COUNT(*) AS n FROM cigars WHERE status = 1 AND strength IS NOT NULL GROUP BY strength`,
  )
  const strengthCount = new Map(strengthRows.map((r) => [r.strength, r.n]))
  const strengths = [1, 2, 3, 4, 5].map((value) => ({
    value,
    label: STRENGTH_LABELS[value],
    count: strengthCount.get(value) || 0,
  }))

  // 风味按大类分组（风味轮用）
  const flavorRows = query(
    `SELECT f.id, f.name, f.name_cn, f.category,
            COUNT(cf.cigar_id) AS n
     FROM flavors f
     LEFT JOIN cigar_flavors cf ON cf.flavor_id = f.id
     LEFT JOIN cigars c ON c.id = cf.cigar_id AND c.status = 1
     GROUP BY f.id
     ORDER BY f.sort_order, f.id`,
  )
  const categoryOrder = Object.keys(CATEGORY_LABELS)
  const grouped = new Map()
  for (const f of flavorRows) {
    const cat = f.category && CATEGORY_LABELS[f.category] ? f.category : 'complex'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat).push({
      id: f.id,
      name: f.name,
      label: f.name_cn || f.name,
      category: cat,
      count: f.n || 0,
    })
  }
  const flavorCategories = [...grouped.entries()]
    .sort((a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]))
    .map(([value, flavors]) => ({
      value,
      label: CATEGORY_LABELS[value] || value,
      count: flavors.reduce((sum, f) => sum + f.count, 0),
      flavors,
    }))

  const brands = query(
    `SELECT b.id, b.name, COUNT(c.id) AS n
     FROM brands b LEFT JOIN cigars c ON c.brand_id = b.id AND c.status = 1
     GROUP BY b.id HAVING n > 0 ORDER BY n DESC, b.name COLLATE NOCASE`,
  ).map((r) => ({ id: r.id, name: r.name, count: r.n }))

  sendJson(res, 200, {
    stats,
    origins,
    sizes,
    strengths,
    flavorCategories,
    brands,
    sortOptions: [
      { value: 'rating', label: '评分优先' },
      { value: 'popular', label: '热度优先' },
      { value: 'price_asc', label: '价格从低到高' },
      { value: 'price_desc', label: '价格从高到低' },
      { value: 'strength_desc', label: '浓郁度从高到低' },
      { value: 'newest', label: '最新入库' },
      { value: 'name', label: '按品牌字母' },
    ],
  })
})
