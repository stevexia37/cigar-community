import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { injectMeta } from './meta.js'

/**
 * 静态资源托管（生产模式：托管 web/dist）
 *   · 路径穿越防护：解析后必须仍在 root 之内
 *   · SPA 回退：无扩展名的未知路径回退到 index.html
 *   · 带 hash 的资源长缓存，index.html 不缓存
 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
}

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest', '.map'])
const GZIP_MIN_BYTES = 1024

// 内存缓存：dist 体积小，直接缓存 gzip 结果，省掉重复压缩
const gzipCache = new Map()

/** 从请求头还原对外访问来源（OG 标签必须是绝对地址） */
function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (req.socket.encrypted ? 'https' : 'http')
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  return host ? `${proto}://${host}` : ''
}

/** 发送一段内存中的 HTML（带 gzip 与正确的缓存策略：HTML 绝不长缓存） */
function sendHtml(req, res, html) {
  const buf = Buffer.from(html, 'utf8')
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  }
  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))
  if (acceptsGzip && buf.length >= GZIP_MIN_BYTES) {
    const gz = gzipSync(buf)
    headers['content-encoding'] = 'gzip'
    headers['content-length'] = gz.length
    headers.vary = 'Accept-Encoding'
    res.writeHead(200, headers)
    res.end(gz)
    return true
  }
  headers['content-length'] = buf.length
  res.writeHead(200, headers)
  res.end(buf)
  return true
}

function contentType(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

function cacheControl(pathname) {
  if (pathname.endsWith('.html') || pathname === '/') return 'no-cache'
  // Vite 产出形如 /assets/index-a1b2c3.js，带内容 hash，可长缓存
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

/**
 * 把 URL 路径变成文件系统路径，拒绝一切越界尝试。
 *
 * 关键：**先解码再判定**。早期实现只对解码后的路径做前缀校验，
 * 于是 `/../../etc/passwd` 会被判为「不是静态文件」而掉进 SPA 回退，
 * 返回 200 + index.html —— 没有泄露文件，但把一次明确的攻击伪装成了正常页面，
 * 断言与日志都看不出问题，也掩盖了真实的失败信号。
 *
 * 返回 null 表示「这个路径不应被当作静态请求处理」（由调用方返回 404）。
 */
function resolveSafe(root, urlPath) {
  const rawPath = String(urlPath).split('?')[0]
  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return null
  }

  // 双重编码（%252e）要再解一次才暴露 ..
  let twice = decoded
  try {
    twice = decodeURIComponent(decoded)
  } catch { /* 只需一次解码即可，忽略 */ }

  for (const candidate of [decoded, twice]) {
    const normalized = normalize(candidate).replace(/\\/g, '/')
    if (normalized.split('/').includes('..')) return null
  }

  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const target = join(root, normalized)
  const rootWithSep = root.endsWith(sep) ? root : root + sep
  if (target !== root && !target.startsWith(rootWithSep)) return null
  return target
}

function sendFile(req, res, file, { status = 200, pathname = '' } = {}) {
  const ext = extname(file).toLowerCase()
  const headers = {
    'content-type': contentType(file),
    'cache-control': cacheControl(pathname || file),
    'x-content-type-options': 'nosniff',
  }

  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))
  if (acceptsGzip && COMPRESSIBLE.has(ext)) {
    try {
      const size = statSync(file).size
      if (size >= GZIP_MIN_BYTES) {
        let buf = gzipCache.get(file)
        if (!buf) {
          buf = gzipSync(readFileSync(file))
          gzipCache.set(file, buf)
        }
        headers['content-encoding'] = 'gzip'
        headers['content-length'] = buf.length
        headers.vary = 'Accept-Encoding'
        res.writeHead(status, headers)
        res.end(buf)
        return
      }
    } catch {
      // 压缩失败则退回明文发送
    }
  }

  headers['content-length'] = statSync(file).size
  res.writeHead(status, headers)
  createReadStream(file).pipe(res)
}

/**
 * 返回 true 表示已处理该请求。
 * 注意：/api 前缀不会被本函数处理（由 API 路由先接管）。
 */
/**
 * @param {string} root 静态根目录
 * @param {(pathname: string, origin: string) => object} [resolveMeta]
 *        SPA 回退时用来解析该路由的 SEO meta。不传则原样返回 index.html。
 */
export function createStaticHandler(root, resolveMeta = null) {
  const indexFile = join(root, 'index.html')
  // ⚠️ 不要在这里把 index.html「是否存在」缓存成常量。
  // 前端重新构建会替换 index.html 与其引用的 hash 资源名，而本进程若缓存了旧的
  // index.html（或旧的判断结果），浏览器就会去请求已不存在的旧资源 → 全站空白。
  // 这个坑在开发期踩过不止一次，因此改为每次请求现判。
  const hasIndex = () => existsSync(indexFile)

  return function handleStatic(req, res, pathname) {
    if (!existsSync(root)) return false

    const target = resolveSafe(root, pathname)
    if (!target) return false

    try {
      if (existsSync(target) && statSync(target).isFile()) {
        sendFile(req, res, target, { pathname })
        return true
      }
    } catch {
      // 落到下面的 SPA 回退
    }

    // 浏览器会自动请求 /favicon.ico。我们没有 .ico 文件（用的是 SVG 图标），
    // 若让它掉进 SPA 回退会返回 HTML，反而在控制台留下解析错误。
    // 按 RFC 9110 返回 204 No Content 更干净，也避免为一个小图标提交二进制文件。
    if (pathname === '/favicon.ico') {
      res.writeHead(204, { 'cache-control': 'public, max-age=86400' })
      res.end()
      return true
    }

    // SPA 回退：只要不是带扩展名的静态请求，就交给前端路由。
    // 这里顺带做服务端 meta 注入 —— 爬虫不执行 JS，拿到带正确
    // title/description/OG 的 HTML 才能被收录、分享出去才有卡片。
    if (hasIndex() && !extname(pathname)) {
      if (resolveMeta) {
        try {
          const origin = originOf(req)
          const meta = resolveMeta(pathname, origin)
          const html = injectMeta(readFileSync(indexFile, 'utf8'), meta)
          return sendHtml(req, res, html)
        } catch (err) {
          // meta 解析失败不能影响页面可访问性，降级为原样返回
          console.error('[meta] 注入失败，降级返回原始 index.html：', err.message)
        }
      }
      sendFile(req, res, indexFile, { status: 200, pathname: '/index.html' })
      return true
    }
    return false
  }
}
