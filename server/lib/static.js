import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

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

function contentType(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

function cacheControl(pathname) {
  if (pathname.endsWith('.html') || pathname === '/') return 'no-cache'
  // Vite 产出形如 /assets/index-a1b2c3.js，带内容 hash，可长缓存
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

function resolveSafe(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
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
export function createStaticHandler(root) {
  const indexFile = join(root, 'index.html')
  const hasIndex = existsSync(indexFile)

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

    // SPA 回退：只要不是带扩展名的静态请求，就交给前端路由
    if (hasIndex && !extname(pathname)) {
      sendFile(req, res, indexFile, { status: 200, pathname: '/index.html' })
      return true
    }
    return false
  }
}
