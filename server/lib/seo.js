/**
 * 按路由解析 SEO meta。
 *
 * 这是「SPA + 服务端 meta 注入」方案里的数据提供方：
 * server/lib/static.js 在返回 index.html 时回调这里，拿到该路由的标题与描述。
 */
import { query, queryOne } from '../db/index.js'
import { SITE, cigarDescription } from './meta.js'
import { STRENGTH_LABELS, originKeyFromCode, ORIGIN_LABELS } from '../api/shape.js'

/** 静态路由的固定 meta */
const STATIC_ROUTES = {
  '/': { title: SITE.defaultTitle, description: SITE.description },
  '/cigars': {
    title: '雪茄数据库 · 雪茄客',
    description: '按产地、型号、浓郁度、风味与品牌多维度筛选雪茄。含尺寸、烟叶配方与养护建议。',
  },
  '/reviews': {
    title: '品吸笔记 · 雪茄客',
    description: '雪茄客的真实品吸记录：三段评分、燃烧与抽吸评价、搭配建议。',
  },
  '/tools/diagnostic': {
    title: '雪茄病害一键诊断 · 雪茄客',
    description: '雪茄发霉、长虫、干裂还是起灰？三步判断并给出抢救步骤与预估存活率。',
  },
  '/tools/flavor-test': {
    title: '风味人格测试 · 雪茄客',
    description: '六道题测出你的雪茄风味人格，并给出适合你的雪茄方向。',
  },
  '/tools/aging-calc': {
    title: '醇化计算器 · 雪茄客',
    description: '按浓郁度与养护环境，估算雪茄的最佳品吸窗口与还需静养的时间。',
  },
  '/guide/plume-vs-mold': {
    title: '起灰还是发霉？一文说清 · 雪茄客',
    description: '从微观形态与分布位置分辨 Plume 与 Mold，附轻度/重度发霉与雪茄虫的物理抢救步骤。',
  },
  '/about': {
    title: '关于与免责声明 · 雪茄客',
    description: '雪茄客的社区公约、18+ 限制、内容审核机制与免责声明。本站不售烟草、不提供购买渠道。',
  },
  '/login': { title: '登录 / 注册 · 雪茄客', description: '登录后可以写品吸笔记、提报雪茄数据。', robots: 'noindex' },
}

/**
 * 解析某个路径的 meta。
 * @param {string} pathname 已解码的路径
 * @param {string} origin   形如 http://127.0.0.1:8787，用于生成绝对 URL（OG 必须是绝对地址）
 */
export function resolveMeta(pathname, origin = '') {
  const path = pathname.replace(/\/+$/, '') || '/'

  // 静态路由
  if (STATIC_ROUTES[path]) {
    return { ...STATIC_ROUTES[path], url: origin ? `${origin}${path}` : '' }
  }

  // 雪茄详情：/cigars/:id
  const cigarMatch = /^\/cigars\/(\d+)$/.exec(path)
  if (cigarMatch) {
    const id = Number(cigarMatch[1])
    const row = queryOne(
      `SELECT c.vitola, c.series, c.strength, c.ring_gauge, c.description, c.image_url, c.rating,
              b.name AS brand_name, co.code AS country_code, co.name_cn AS country_name_cn
       FROM cigars c
       JOIN brands b ON b.id = c.brand_id
       JOIN countries co ON co.id = c.country_id
       WHERE c.id = ? AND c.status = 1`,
      [id],
    )
    if (row) {
      const originKey = originKeyFromCode(row.country_code)
      const cigar = {
        brand: row.brand_name,
        vitola: row.vitola,
        originLabel: ORIGIN_LABELS[originKey] || row.country_name_cn || originKey,
        strengthLabel: STRENGTH_LABELS[row.strength] || null,
        ringGauge: row.ring_gauge,
        description: row.description,
      }
      const title = `${row.brand_name} ${row.vitola}${row.series ? `（${row.series}）` : ''} · 雪茄客`
      return {
        title,
        description: cigarDescription(cigar),
        url: origin ? `${origin}${path}` : '',
        image: row.image_url && origin ? new URL(row.image_url, origin).toString() : '',
        type: 'article',
      }
    }
    return { title: '未找到这支雪茄 · 雪茄客', description: '该雪茄不存在或已下架。', robots: 'noindex' }
  }

  // 用户主页：/users/:id（有公开笔记才有内容，先给通用描述）
  const userMatch = /^\/users\/(\d+)$/.exec(path)
  if (userMatch) {
    const u = queryOne('SELECT username FROM users WHERE id = ? AND status = 1', [Number(userMatch[1])])
    if (u) {
      return {
        title: `${u.username} 的品吸笔记 · 雪茄客`,
        description: `${u.username} 在雪茄客发布的品吸笔记与数据投稿。`,
        url: origin ? `${origin}${path}` : '',
      }
    }
    return { title: '用户不存在 · 雪茄客', description: '该用户不存在或已停用。', robots: 'noindex' }
  }

  // 其余（含 404）：不索引，但仍给一个像样的标题
  return { title: '页面不存在 · 雪茄客', description: SITE.description, robots: 'noindex' }
}

/**
 * 动态 robots.txt。
 *
 * ⚠️ `Sitemap:` 指令**必须是绝对 URL**（规范如此，搜索引擎不解析相对路径）。
 * 之前这里是一份静态文件，写的是 `Sitemap: /sitemap.xml` —— 等价于没写。
 * 域名只能从请求头推断，所以必须由服务端生成。
 */
export function buildRobots(origin) {
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    '# 接口与年龄门后台无需收录',
    'Disallow: /api/',
    'Disallow: /admin/',
    '',
    '# 用户可写页面对搜索引擎无价值，且内容随时变化',
    'Disallow: /reviews/new',
    'Disallow: /login',
    '',
  ]
  if (origin) lines.push(`Sitemap: ${origin}/sitemap.xml`, '')
  return lines.join('\n')
}

/** 动态 sitemap：把全部雪茄与用户主页也列进去 */
export function buildSitemap(origin) {
  const base = origin || ''
  const urls = Object.keys(STATIC_ROUTES)
    .filter((p) => !STATIC_ROUTES[p].robots)
    .map((p) => ({ loc: `${base}${p}`, changefreq: p === '/' ? 'daily' : 'weekly', priority: p === '/' ? '1.0' : '0.7' }))

  const cigars = query('SELECT id FROM cigars WHERE status = 1 ORDER BY id')
  for (const c of cigars) {
    urls.push({ loc: `${base}/cigars/${c.id}`, changefreq: 'monthly', priority: '0.8', lastmod: null })
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => [
      '  <url>',
      `    <loc>${u.loc.replace(/&/g, '&amp;')}</loc>`,
      u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
      u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
      u.priority ? `    <priority>${u.priority}</priority>` : null,
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
    '',
  ].join('\n')

  return xml
}
