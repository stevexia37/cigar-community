/**
 * 服务端 meta 注入（SEO / 社交分享卡片）
 *
 * 为什么必须由服务端做：这是个 SPA，所有路由返回同一份 index.html。
 * 结果就是每支雪茄的分享链接在微信/微博/Twitter 里都是**空白卡片**，
 * 搜索引擎也拿不到任何单页内容 —— 对一个「雪茄知识库」来说这是硬伤。
 *
 * 做法：不加 SSR（那会把项目拖进一个完全不同的复杂度），
 * 只在返回 index.html 时按 URL 注入 <title> / description / OG 标签。
 * 爬虫（不执行 JS）拿到的是带正确 meta 的 HTML；
 * 浏览器用户在 JS 加载后看到的是同一份内容 —— 两边都正确，且零额外依赖。
 */
import { escapeHtml } from './html.js'

/** 站点级兜底信息 */
export const SITE = {
  name: '雪茄客',
  tagline: '纯粹交流地 · 非交易向雪茄社区',
  description: '雪茄知识库与品吸交流社区。40 款雪茄数据库、病害诊断、醇化计算器与真实品吸笔记。不卖烟草，只聊干货。',
  defaultTitle: '雪茄客 · 纯粹交流地',
}

/**
 * 在 index.html 的 </head> 前插入/替换 meta 标签。
 * 采用「占位符替换」而不是字符串拼接，避免重复注入或破坏原有结构。
 */
export function injectMeta(html, meta = {}) {
  const title = meta.title || SITE.defaultTitle
  const description = (meta.description || SITE.description).slice(0, 200)
  const url = meta.url || ''
  const image = meta.image || ''
  const type = meta.type || 'website'

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${escapeHtml(type)}" />`,
  ]
  if (url) tags.push(`<meta property="og:url" content="${escapeHtml(url)}" />`)
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`)
    tags.push('<meta name="twitter:card" content="summary_large_image" />')
  } else {
    tags.push('<meta name="twitter:card" content="summary" />')
  }
  if (meta.robots) tags.push(`<meta name="robots" content="${escapeHtml(meta.robots)}" />`)

  const block = `\n    <!-- 以下 meta 由服务端按路由注入（SEO / 分享卡片），见 server/lib/meta.js -->\n    ${tags.join('\n    ')}\n`

  let out = html
  // 移除已有的 title / description / og:* / twitter:card，避免出现两套
  out = out.replace(/<title>[\s\S]*?<\/title>\s*/i, '')
  out = out.replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
  out = out.replace(/<meta\s+name="robots"[^>]*>\s*/gi, '')
  out = out.replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
  out = out.replace(/<meta\s+name="twitter:card"[^>]*>\s*/gi, '')

  // 插到 </head> 之前
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${block}  </head>`)
  } else {
    out = block + out
  }
  return out
}

/** 来源描述：把雪茄的一行资料变成适合搜索结果的摘要 */
export function cigarDescription(cigar) {
  const bits = []
  if (cigar.brand) bits.push(`${cigar.brand} ${cigar.vitola}`)
  if (cigar.originLabel) bits.push(cigar.originLabel)
  if (cigar.strengthLabel) bits.push(cigar.strengthLabel)
  if (cigar.ringGauge) bits.push(`环径 ${cigar.ringGauge}`)
  const head = bits.join(' · ')
  const body = cigar.description ? String(cigar.description).replace(/\s+/g, ' ').slice(0, 140) : ''
  return body ? `${head}。${body}` : `${head}。雪茄资料与品吸笔记。`
}

/** 把相对路径拼成绝对 URL（OG 标签必须是绝对地址，爬虫不解析相对路径） */
export function absoluteUrl(base, path) {
  if (!base) return ''
  try {
    return new URL(path, base).toString()
  } catch {
    return ''
  }
}
