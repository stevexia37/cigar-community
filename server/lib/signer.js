import { createHmac, timingSafeEqual, createHash, randomBytes } from 'node:crypto'
import { config } from '../config.js'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

/**
 * 无状态签名器：payload 为 JSON 对象，输出 "<base64url(json)>.<base64url(hmac)>"。
 * 用于年龄门（age gate）这类「只需防篡改、不需要服务端撤销」的场景。
 * 登录会话走 sessions 表（可撤销），见 middleware/auth.js。
 */
export function sign(payload, ttlSeconds = 86400) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const data = b64url(JSON.stringify(body))
  const mac = b64url(createHmac('sha256', config.secret).update(data).digest())
  return `${data}.${mac}`
}

export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const idx = token.lastIndexOf('.')
  const data = token.slice(0, idx)
  const mac = token.slice(idx + 1)
  const expected = b64url(createHmac('sha256', config.secret).update(data).digest())
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let body
  try {
    body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null
  return body
}

/** 会话令牌：返回给客户端的明文 + 落库用的 sha256 */
export function newSessionToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, id: sha256(token) }
}

export function sha256(input) {
  return createHash('sha256').update(String(input)).digest('hex')
}
