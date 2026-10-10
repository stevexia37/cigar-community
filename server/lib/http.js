/**
 * 零依赖 HTTP 原语：路由匹配、请求体解析、响应封装、Cookie。
 * 不引入 express/fastify —— 全站只依赖 node: 内置模块，clone 即可跑。
 */

const JSON_LIMIT = 256 * 1024 // 256 KB，品吸笔记足够
const MAX_BODY = 4 * 1024 * 1024

export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message)
    this.status = status
    this.code = code || 'ERROR'
    this.details = details
  }
}

export const badRequest = (msg, code) => new HttpError(400, msg, code || 'BAD_REQUEST')
export const unauthorized = (msg = '请先登录') => new HttpError(401, msg, 'UNAUTHORIZED')
export const forbidden = (msg = '无权操作') => new HttpError(403, msg, 'FORBIDDEN')
export const notFound = (msg = '资源不存在') => new HttpError(404, msg, 'NOT_FOUND')
export const conflict = (msg) => new HttpError(409, msg, 'CONFLICT')
export const tooMany = (msg = '操作过于频繁，请稍后再试') => new HttpError(429, msg, 'TOO_MANY_REQUESTS')

/** 路线表：{ method, parts, handler }，支持 ':param' 段 */
export class Router {
  constructor() {
    this.routes = []
  }

  add(method, pattern, handler) {
    if (typeof handler !== 'function') throw new TypeError(`路由 ${method} ${pattern} 缺少处理函数`)
    const parts = pattern === '/' ? [] : pattern.replace(/^\/+|\/+$/g, '').split('/')
    this.routes.push({ method: method.toUpperCase(), parts, pattern, handler })
    return this
  }

  get(p, h) { return this.add('GET', p, h) }
  post(p, h) { return this.add('POST', p, h) }
  put(p, h) { return this.add('PUT', p, h) }
  patch(p, h) { return this.add('PATCH', p, h) }
  delete(p, h) { return this.add('DELETE', p, h) }

  /**
   * 把另一个 Router 挂到指定前缀下。
   * 子路由内部只写自己的相对路径（如 '/health'），前缀在这里统一加，
   * 避免「注册了 /health 却请求 /api/health」这类前缀错配。
   */
  mount(prefix, sub) {
    const base = prefix === '/' ? '' : prefix.replace(/\/+$/, '')
    for (const route of sub.routes) {
      const pattern = route.parts.length === 0 ? (base || '/') : `${base}/${route.parts.join('/')}`
      this.add(route.method, pattern, route.handler)
    }
    return this
  }

  /** 返回 { handler, params } 或 null */
  match(method, pathname) {
    const segs = pathname === '/' ? [] : pathname.replace(/^\/+|\/+$/g, '').split('/')
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue
      if (route.parts.length !== segs.length) continue
      const params = {}
      let ok = true
      for (let i = 0; i < route.parts.length; i++) {
        const p = route.parts[i]
        if (p.startsWith(':')) {
          const key = p.slice(1)
          const val = decodeSegment(segs[i])
          if (val === null) { ok = false; break }
          params[key] = val
        } else if (p !== segs[i]) {
          ok = false
          break
        }
      }
      if (ok) return { handler: route.handler, params }
    }
    return null
  }

  /**
   * 统一分发：把路径参数挂到 req.params 再调用 handler。
   * 这样每个 handler 只需 (req, res)，不必记住第三个参数 —— 之前正是因为
   * 匹配出了参数却没人传下去，导致所有 req.params.x 都是 undefined（踩过的坑）。
   */
  async dispatch(req, res) {
    const matched = this.match(req.method, new URL(req.url, 'http://localhost').pathname)
    if (!matched) return false
    req.params = matched.params
    await matched.handler(req, res)
    return true
  }
}

function decodeSegment(seg) {
  try {
    return decodeURIComponent(seg)
  } catch {
    return null
  }
}

/** 读取请求体，返回原文（超限抛 413） */
export function readRawBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        fail(new HttpError(413, '请求体过大', 'PAYLOAD_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', fail)
    req.on('aborted', () => fail(new HttpError(400, '请求中断', 'ABORTED')))
  })
}

/**
 * 解析请求体。
 *
 * 只接受 application/json（以及 form-urlencoded）。
 * 早期实现对未知 Content-Type 直接返回 `{ text: raw }`，于是 `text/plain` 携带 JSON
 * 时字段全都读不到 —— 合规预检会「静默放行」一段实际违规的内容（等于对调用方撒谎）。
 * 宁可明确 415，也不要返回一个看起来成功但没有字段的对象。
 */
export async function readBody(req) {
  const raw = await readRawBody(req)
  if (!raw) return {}
  const ct = String(req.headers['content-type'] || '').toLowerCase()

  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }

  if (!ct.includes('application/json')) {
    throw new HttpError(
      415,
      `不支持的 Content-Type：${ct || '(未提供)'}。请使用 application/json。`,
      'UNSUPPORTED_MEDIA_TYPE',
    )
  }

  if (raw.length > JSON_LIMIT) throw new HttpError(413, '内容过长', 'PAYLOAD_TOO_LARGE')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw badRequest('请求体不是合法 JSON', 'INVALID_JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw badRequest('请求体必须是 JSON 对象', 'INVALID_JSON')
  }
  return parsed
}

export function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(String(text), 'utf8')
  res.writeHead(status, { 'content-type': type, 'content-length': body.length })
  res.end(body)
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500
  const payload = {
    error: status >= 500 ? '服务器内部错误' : err.message,
    code: err instanceof HttpError ? err.code : 'INTERNAL_ERROR',
  }
  if (err instanceof HttpError && err.details !== undefined) payload.details = err.details
  if (status >= 500) console.error('[500]', err)
  sendJson(res, status, payload)
}

export function getCookie(req, name) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', secure = false, path = '/' } = {}) {
  const seg = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`]
  if (httpOnly) seg.push('HttpOnly')
  if (secure) seg.push('Secure')
  if (typeof maxAge === 'number') seg.push(`Max-Age=${maxAge}`)
  const prev = res.getHeader('set-cookie')
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : []
  list.push(seg.join('; '))
  res.setHeader('set-cookie', list)
}

export function clearCookie(res, name, opts = {}) {
  setCookie(res, name, '', { ...opts, maxAge: 0 })
}

export function clientIp(req, trustProxy = 0) {
  const fwd = req.headers['x-forwarded-for']
  if (trustProxy > 0 && typeof fwd === 'string' && fwd.length) {
    const parts = fwd.split(',').map((s) => s.trim()).filter(Boolean)
    const idx = Math.max(0, parts.length - trustProxy)
    return parts[idx] || req.socket.remoteAddress || ''
  }
  return req.socket.remoteAddress || ''
}

/** 简易内存限流（单机够用；多实例部署需换 Redis，见 docs/ROADMAP.md） */
export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map()
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, rec] of hits) if (rec.reset < now) hits.delete(key)
  }, windowMs).unref?.() ?? null

  return {
    check(key, cost = 1) {
      const now = Date.now()
      let rec = hits.get(key)
      if (!rec || rec.reset < now) {
        rec = { count: 0, reset: now + windowMs }
        hits.set(key, rec)
      }
      rec.count += cost
      return { ok: rec.count <= max, remaining: Math.max(0, max - rec.count), reset: rec.reset }
    },
    stop() { if (sweep) clearInterval(sweep) },
    _hits: hits,
  }
}
