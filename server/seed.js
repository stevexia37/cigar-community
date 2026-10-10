/**
 * 种子数据导入：把两套历史数据合并成单一数据源
 *
 *   来源 A  database/seed/cigars.csv       15 款，官方品鉴描述 + 中文风味（权威）
 *   来源 B  database/seed/mock-cigars.json 34 款，带 price/rating/reviews（原型演示）
 *
 * 合并规则：以 (brand, vitola) 为幂等键。CSV 行权威，若与 B 冲突则 CSV 胜出并记日志。
 * 结果：cigars 表 = CSV ∪ B，data_source 标明每条来源，不再有「两套数据」。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'
import { getDb, transaction, count, nowIso } from './db/index.js'

// ---------------------------------------------------------------- 字典
const COUNTRY_INFO = {
  cuba:       { name: 'Cuba',               name_cn: '古巴',        code: 'CU', is_cuban: 1 },
  nicaragua:  { name: 'Nicaragua',          name_cn: '尼加拉瓜',    code: 'NI', is_cuban: 0 },
  dominican:  { name: 'Dominican Republic', name_cn: '多米尼加',    code: 'DO', is_cuban: 0 },
  davidoff:   { name: 'Switzerland',        name_cn: '瑞士',        code: 'CH', is_cuban: 0 },
  honduras:   { name: 'Honduras',           name_cn: '洪都拉斯',    code: 'HN', is_cuban: 0 },
  usa:        { name: 'United States',      name_cn: '美国',        code: 'US', is_cuban: 0 },
  mexico:     { name: 'Mexico',             name_cn: '墨西哥',      code: 'MX', is_cuban: 0 },
  ecuador:    { name: 'Ecuador',            name_cn: '厄瓜多尔',    code: 'EC', is_cuban: 0 },
  brazil:     { name: 'Brazil',             name_cn: '巴西',        code: 'BR', is_cuban: 0 },
  cameroon:   { name: 'Cameroon',           name_cn: '喀麦隆',      code: 'CM', is_cuban: 0 },
  indonesia:  { name: 'Indonesia',          name_cn: '印度尼西亚',  code: 'ID', is_cuban: 0 },
  philippines:{ name: 'Philippines',        name_cn: '菲律宾',      code: 'PH', is_cuban: 0 },
}

/** CSV 的 Origin 列 → 上面的字典键 */
const ORIGIN_ALIAS = {
  'cuba': 'cuba', 'cuban': 'cuba',
  'nicaragua': 'nicaragua', 'nicaraguan': 'nicaragua',
  'dominican republic': 'dominican', 'dominican': 'dominican',
  'honduras': 'honduras', 'honduran': 'honduras',
  'united states': 'usa', 'usa': 'usa', 'us': 'usa',
  'mexico': 'mexico', 'mexican': 'mexico',
  'ecuador': 'ecuador', 'ecuadorian': 'ecuador',
  'brazil': 'brazil', 'brazilian': 'brazil',
  'cameroon': 'cameroon', 'indonesia': 'indonesia', 'philippines': 'philippines',
  'switzerland': 'davidoff', 'davidoff': 'davidoff',
}

/** 中文风味 → 风味字典英文名（覆盖 database/seed/cigars.csv 全部取值） */
const FLAVOR_CN2EN = {
  '雪松木': 'Cedar', '橡木': 'Oak', '檀香木': 'Sandalwood',
  '胡椒': 'Pepper', '肉桂': 'Cinnamon', '肉豆蔻': 'Nutmeg', '丁香': 'Clove',
  '可可': 'Cocoa', '咖啡': 'Coffee', '香草': 'Vanilla', '蜂蜜': 'Honey',
  '焦糖': 'Caramel', '巧克力': 'Chocolate', '奶油': 'Cream',
  '皮革': 'Leather', '泥土': 'Earth', '谷仓': 'Barnyard', '苔藓': 'Moss',
  '杏仁': 'Almond', '核桃': 'Walnut', '花生': 'Peanut',
  '花香': 'Floral', '柑橘': 'Citrus', '青草': 'Grass', '薄荷': 'Mint',
  '烤面包': 'Toast', '烟熏': 'Smoke',
  // 下面三个是导入 CSV 时发现的字典缺失项，已回写 database/schema.sql
  '豆香': 'Bean', '黑巧': 'DarkChocolate', '坚果': 'Nuts',
}

/**
 * Vitola 型号家族判定（与前端 useCigarFilter.js 的 SIZES 区间保持一致，
 * 并补上 CSV 里出现但 SIZES 未覆盖的长尺寸：Double Corona / Piramides / BHK 等）
 * 规则：先按环径区间，再看长度区间，命中即返回。
 */
// 顺序即优先级。先判「窄区间」再判「宽区间」，否则宽松档会吞掉本该属于具体档的型号。
// 实例：BHK 52 是 4.7" × 52 环（罗布图尺寸），若 belicoso [50-56]×[4.5-6.5] 排在前面
// 就会把它误判成贝利科索 —— 这个顺序是踩过坑之后定下来的，勿随意调整。
const VITOLA_FAMILIES = [
  { value: 'gordo',         label: '戈多',     rg: [56, 70], len: [4.5, 7.0] },
  { value: 'double_corona', label: '双科罗娜', rg: [45, 55], len: [6.8, 8.5] },
  { value: 'lancero',       label: '长矛',     rg: [34, 42], len: [6.8, 8.5] },
  { value: 'churchill',     label: '丘吉尔',   rg: [44, 52], len: [6.5, 7.5] },
  { value: 'panatela',      label: '巴纳特拉', rg: [34, 42], len: [5.5, 7.0] },
  { value: 'robusto',       label: '罗布图',   rg: [48, 54], len: [4.5, 5.6] },
  { value: 'petit_corona',  label: '小科罗娜', rg: [38, 46], len: [3.8, 5.0] },
  { value: 'corona',        label: '科罗娜',   rg: [40, 46], len: [5.0, 6.2] },
  { value: 'belicoso',      label: '贝利科索', rg: [50, 56], len: [4.5, 6.5] },
  { value: 'torpedo',       label: '鱼雷',     rg: [50, 58], len: [5.5, 7.0] },
]

/**
 * 品牌名归一化：NFKC → 去变音符号 → 去除多余空白 → 小写。
 * 用途：把 Padron / Padrón、Cohiba / COHIBA 这类写法差异归一到同一个键，
 * 避免同一品牌被拆成多条、进而让同一支雪茄在库里出现两次。
 */
export function normalizeBrandName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function detectVitolaFamily(vitola, ringGauge, lengthInch) {
  const text = String(vitola || '').toLowerCase()
  if (text.includes('robusto')) {
    if (text.includes('double')) return 'double_corona'
    return 'robusto'
  }
  if (text.includes('churchill')) return 'churchill'
  if (text.includes('torpedo') || text.includes('belicoso') || text.includes('piramide')) return 'belicoso'
  if (text.includes('lancero') || text.includes('longsdale')) return 'lancero'
  if (text.includes('corona')) {
    if (text.includes('double')) return 'double_corona'
    if (text.includes('petit')) return 'petit_corona'
    return 'corona'
  }
  if (text.includes('gordo') || text.includes('60') || text.includes('56')) return 'gordo'

  const rg = Number(ringGauge)
  const len = Number(lengthInch)
  if (Number.isFinite(rg) && Number.isFinite(len)) {
    for (const f of VITOLA_FAMILIES) {
      if (rg >= f.rg[0] && rg <= f.rg[1] && len >= f.len[0] && len <= f.len[1]) return f.value
    }
    for (const f of VITOLA_FAMILIES) if (rg >= f.rg[0] && rg <= f.rg[1]) return f.value
  }
  return 'other'
}

export const FILTER_OPTIONS = {
  origins: Object.entries(COUNTRY_INFO).map(([value, info]) => ({
    value, label: info.name_cn, code: info.code, is_cuban: !!info.is_cuban,
  })),
  sizes: VITOLA_FAMILIES.map((f) => ({ value: f.value, label: f.label, rg: f.rg, len: f.len })),
  strengths: [
    { value: 1, label: '清淡' }, { value: 2, label: '中淡' }, { value: 3, label: '中等' },
    { value: 4, label: '浓郁' }, { value: 5, label: '极浓郁' },
  ],
}

// ---------------------------------------------------------------- CSV 解析
/**
 * 手写 RFC4180 子集解析：支持引号包裹、内嵌逗号/换行、"" 转义。
 *
 * 额外容忍一种非规范写法：JSON 风格的 \" 转义。
 * 上游 database/seed/cigars.csv 写的是 `打破了\"顶级雪茄必须用古巴烟叶\"的魔咒`，
 * 而 RFC4180 规定字段内引号应写作 `""`。若不处理，反斜杠会作为可见字符进入描述文本
 * （页面上会显示「打破了\顶级雪茄…」）。这里从容错角度修掉，不改动上游数据。
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '\\' && src[i + 1] === '"') {
        field += '"'      // 非规范的 \" → 一个普通引号
        i++
      } else if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  const header = rows.shift().map((h) => h.trim())
  return rows
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

function splitFlavors(raw) {
  return String(raw || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean)
}

// ---------------------------------------------------------------- 导入
export function seedDatabase({ reset = false, log = console } = {}) {
  const db = getDb()
  const stats = { countries: 0, brands: 0, flavors: 0, cigarsCsv: 0, cigarsMock: 0, links: 0, skipped: [] }

  if (reset) {
    // 全量重置包含 users —— 明确只用于开发
    // 注意：cigars_fts 是 contentless FTS5 表，不可 DELETE，其内容由 cigars 触发器同步
    transaction((conn) => {
      conn.exec('PRAGMA foreign_keys = OFF')
      for (const t of ['cigar_flavors', 'reviews', 'review_images', 'review_votes',
        'submissions', 'audit_log', 'tool_events', 'app_meta', 'cigars', 'brands', 'countries',
        'flavors', 'sessions', 'users']) {
        conn.exec(`DELETE FROM ${t}`)
      }
      const seq = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").get()
      if (seq) conn.exec('DELETE FROM sqlite_sequence')
      conn.exec('PRAGMA foreign_keys = ON')
    })
  } else if (count('cigars') > 0) {
    log.log(`[seed] cigars 表已有 ${count('cigars')} 条数据，跳过导入（如需重建：npm run seed:reset）`)
    return { skipped: true, ...stats }
  }

  // ---- 1. 风味字典：从 MySQL 设计稿 schema.sql 解析，保持两版 schema 单一事实来源
  const dict = parseFlavorDictionary()
  const flavorIds = new Map()
  transaction((conn) => {
    const ins = conn.prepare('INSERT OR IGNORE INTO flavors (name, name_cn, category, sort_order) VALUES (?,?,?,?)')
    for (const f of dict) ins.run(f.name, f.name_cn, f.category, f.sort_order)
    for (const f of conn.prepare('SELECT id, name, name_cn FROM flavors').all()) {
      flavorIds.set(f.name, f.id)
      if (f.name_cn) flavorIds.set(f.name_cn, f.id)
    }
  })
  stats.flavors = flavorIds.size

  // ---- 2. 产地 + 品牌 + 雪茄
  const countryIds = new Map()
  const brandIds = new Map()

  transaction((conn) => {
    const insCountry = conn.prepare('INSERT OR IGNORE INTO countries (name, name_cn, code, is_cuban) VALUES (?,?,?,?)')
    const insBrand = conn.prepare('INSERT OR IGNORE INTO brands (name, name_norm, name_cn, country_id, description) VALUES (?,?,?,?,?)')
    const getCountry = conn.prepare('SELECT id FROM countries WHERE code = ?')
    const getBrand = conn.prepare('SELECT id FROM brands WHERE name_norm = ?')
    const insCigar = conn.prepare(`
      INSERT INTO cigars (
        brand_id, series, vitola, vitola_family, length_inch, length_mm, ring_gauge,
        origin_type, country_id, wrapper_origin, wrapper_variety, binder_variety, filler_variety,
        strength, description, price_cny, rating, base_rating, review_count, seed_review_count, data_source, status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      ON CONFLICT(brand_id, COALESCE(series,''), vitola) DO UPDATE SET
        description = CASE WHEN length(excluded.description) > length(COALESCE(cigars.description,''))
                           THEN excluded.description ELSE cigars.description END,
        -- 已有用户评分时不用种子值覆盖（两套量纲不同，见 base_rating 注释）
        rating = CASE WHEN cigars.review_count > 0 THEN cigars.rating
                      ELSE COALESCE(excluded.rating, cigars.rating) END,
        base_rating = COALESCE(excluded.base_rating, cigars.base_rating),
        price_cny = COALESCE(cigars.price_cny, excluded.price_cny),
        seed_review_count = excluded.seed_review_count,
        -- 没有真实用户笔记时，展示数回落为种子参考数（有真实笔记时由 recomputeCigarStats 接管）
        review_count = CASE WHEN EXISTS (SELECT 1 FROM reviews WHERE cigar_id = cigars.id AND status = 1)
                            THEN cigars.review_count ELSE excluded.seed_review_count END,
        data_source = CASE WHEN cigars.data_source = 'seed-csv' THEN 'seed-csv' ELSE excluded.data_source END,
        updated_at = ?
    `)
    const linkFlavor = conn.prepare('INSERT OR IGNORE INTO cigar_flavors (cigar_id, flavor_id, is_official) VALUES (?,?,1)')
    const findCigar = conn.prepare("SELECT id FROM cigars WHERE brand_id = ? AND COALESCE(series,'') = COALESCE(?,'') AND vitola = ?")

    const ensureCountry = (key) => {
      const info = COUNTRY_INFO[key] || COUNTRY_INFO.cuba
      if (countryIds.has(key)) return countryIds.get(key)
      insCountry.run(info.name, info.name_cn, info.code, info.is_cuban)
      const id = getCountry.get(info.code).id
      countryIds.set(key, id)
      stats.countries++
      return id
    }

    const ensureBrand = (name, countryKey) => {
      const key = normalizeBrandName(name)
      if (brandIds.has(key)) return brandIds.get(key)
      // 归一化名已存在则复用，不再插入 —— 这是 Padron / Padrón 合并的关键
      const existing = getBrand.get(key)
      if (existing) {
        brandIds.set(key, existing.id)
        return existing.id
      }
      insBrand.run(name, key, null, ensureCountry(countryKey), null)
      const id = getBrand.get(key).id
      brandIds.set(key, id)
      stats.brands++
      return id
    }

    const linkAll = (cigarId, flavorNames) => {
      for (const raw of flavorNames) {
        const fname = FLAVOR_CN2EN[raw] || raw
        const fid = flavorIds.get(fname) || flavorIds.get(raw)
        if (!fid) {
          stats.skipped.push(`风味未收录：${raw}（雪茄 #${cigarId}）`)
          continue
        }
        linkFlavor.run(cigarId, fid)
        stats.links++
      }
    }

    const put = (row) => {
      const countryId = ensureCountry(row.countryKey)
      const brandId = ensureBrand(row.brand, row.countryKey)
      const family = detectVitolaFamily(row.vitola, row.ringGauge, row.lengthInch)
      const lengthMm = row.lengthInch ? Math.round(row.lengthInch * 25.4) : null
      insCigar.run(
        brandId, row.series || null, row.vitola, family,
        row.lengthInch ?? null, lengthMm, row.ringGauge ?? null,
        row.countryKey === 'cuba' ? 'cuban' : 'non-cuban', countryId,
        row.wrapperOrigin ?? countryId, row.wrapper || null, row.binder || null, row.filler || null,
        row.strength ?? null, row.description || null,
        row.price ?? null,
        row.rating ?? null,          // rating：当前展示评分
        row.rating ?? null,          // base_rating：种子基准评分（用户评分出现后仍保留）
        row.reviews ?? 0,            // review_count 初值＝种子参考数
        row.reviews ?? 0,            // seed_review_count：种子参考数，不受用户笔记影响
        row.dataSource, nowIso(),
      )
      const cigarId = findCigar.get(brandId, row.series || null, row.vitola).id
      linkAll(cigarId, row.flavors)
      return cigarId
    }

    // ---- 来源 A：CSV（权威）
    const csvPath = config.paths.seedCsv
    if (existsSync(csvPath)) {
      for (const r of parseCsv(readFileSync(csvPath, 'utf8'))) {
        const originKey = ORIGIN_ALIAS[String(r.Origin || '').toLowerCase()] || 'cuba'
        put({
          brand: r.Brand,
          series: r.Line,
          vitola: r.Vitola,
          lengthInch: Number(r.Length_Inch) || null,
          ringGauge: Number(r.Ring_Gauge) || null,
          countryKey: originKey,
          wrapper: r.Wrapper, binder: r.Binder, filler: r.Filler,
          strength: Number(r.Strength_1_5) || null,
          flavors: splitFlavors(r.Main_Flavors),
          description: r.Description,
          dataSource: 'seed-csv',
        })
        stats.cigarsCsv++
      }
    } else {
      log.warn(`[seed] 未找到 ${csvPath}，跳过 CSV 导入`)
    }

    // ---- 来源 B：物化后的 MOCK_CIGARS（补充 + 展示字段）
    const mockPath = join(config.paths.seedDir, 'mock-cigars.json')
    if (existsSync(mockPath)) {
      const mock = JSON.parse(readFileSync(mockPath, 'utf8'))
      for (const c of mock.cigars) {
        put({
          brand: c.brand,
          series: c.series,
          vitola: c.vitola,
          lengthInch: c.length ?? null,
          ringGauge: c.rg ?? null,
          countryKey: ORIGIN_ALIAS[String(c.origin || '').toLowerCase()] || 'cuba',
          wrapper: c.wrapper, binder: c.binder, filler: c.filler,
          strength: c.strength ?? null,
          flavors: c.flavors || [],
          description: c.desc || null,
          price: c.price ?? null,
          rating: c.rating ?? null,
          reviews: c.reviews ?? 0,
          dataSource: 'mock',
        })
        stats.cigarsMock++
      }
    } else {
      log.warn(`[seed] 未找到 ${mockPath}，跳过 MOCK 数据导入`)
    }
  })

  log.log(`[seed] 完成：国家 ${stats.countries} · 品牌 ${stats.brands} · 风味 ${stats.flavors} · ` +
          `雪茄 CSV ${stats.cigarsCsv} + MOCK ${stats.cigarsMock} · 风味关联 ${stats.links}`)
  if (stats.skipped.length) {
    log.warn(`[seed] ${stats.skipped.length} 条风味未匹配：`)
    for (const s of stats.skipped.slice(0, 10)) log.warn('  -', s)
  }
  return stats
}

/** 从 MySQL 设计稿解析风味字典，避免两处硬编码 */
export function parseFlavorDictionary() {
  const schemaPath = join(config.paths.root, 'database', 'schema.sql')
  if (!existsSync(schemaPath)) return []
  const sql = readFileSync(schemaPath, 'utf8')
  const block = sql.split('INSERT INTO `cigar_flavors`')[1]
  if (!block) return []
  const body = block.split(';')[0]
  const out = []
  const re = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+)\)/g
  let m
  while ((m = re.exec(body))) {
    out.push({ name: m[1], name_cn: m[2], category: m[3], sort_order: Number(m[4]) })
  }
  return out
}
