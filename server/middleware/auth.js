import { getCookie, setCookie, clearCookie, clientIp, HttpError } from '../lib/http.js'
import { newSessionToken, sha256, sign, verify } from '../lib/signer.js'
import { queryOne, run, nowIso } from '../db/index.js'
import { config } from '../config.js'

export const SESSION_COOKIE = 'cc_sid'
export const AGE_COOKIE = 'cc_age'

const SESSION_TTL_DAYS = 30
const AGE_TTL_DAYS = 30

/** 常见爬虫 UA：这些请求不弹年龄门（验收标准 1.2.2），也不建立会话 */
const BOT_UA = /(googlebot|bingbot|baiduspider|yandexbot|duckduckbot|slurp|sogou|360spider|bytespider|petalbot|applebot|facebookexternalhit|twitterbot|telegrambot|semrushbot|ahrefsbot|mj12bot|dotbot)/i

export function isBot(req) {
  return BOT_UA.test(String(req.headers['user-agent'] || ''))
}

function isoInDays(days) {
  return new Date(Date.now() + days * 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const cookieOpts = () => ({ httpOnly: true, sameSite: 'Lax', secure: config.env === 'production' })

// ------------------------------------------------------------------ 登录会话

export function createSession(res, req, userId) {
  const { token, id } = newSessionToken()
  run(
    'INSERT INTO sessions (id, user_id, user_agent, ip, expires_at, created_at) VALUES (?,?,?,?,?,?)',
    [id, userId, String(req.headers['user-agent'] || '').slice(0, 255),
      clientIp(req, config.trustProxy).slice(0, 64), isoInDays(SESSION_TTL_DAYS), nowIso()],
  )
  setCookie(res, SESSION_COOKIE, token, { ...cookieOpts(), maxAge: SESSION_TTL_DAYS * 86400 })
  return token
}

export function destroySession(req, res) {
  const token = getCookie(req, SESSION_COOKIE)
  if (token) run('DELETE FROM sessions WHERE id = ?', [sha256(token)])
  clearCookie(res, SESSION_COOKIE, cookieOpts())
}

/** 读取当前登录用户；会话过期即失效并清理。返回 null 表示未登录。 */
export function readSession(req) {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token) return null
  const row = queryOne(
    `SELECT s.id AS sid, s.expires_at,
            u.id, u.username, u.email, u.role, u.avatar_url, u.bio, u.status, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [sha256(token)],
  )
  if (!row) return null
  if (row.expires_at < nowIso()) {
    run('DELETE FROM sessions WHERE id = ?', [row.sid])
    return null
  }
  if (row.status !== 1) return null
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    createdAt: row.created_at,
    sessionId: row.sid,
  }
}

// ------------------------------------------------------------------ 年龄门

/** 年龄门状态由签名 Cookie 决定，爬虫直接视为已通过 */
export function readAgeGate(req) {
  if (isBot(req)) return true
  const raw = getCookie(req, AGE_COOKIE)
  if (!raw) return false
  const body = verify(raw)
  return !!body && body.gate === 'age'
}

export function grantAgeGate(res) {
  setCookie(res, AGE_COOKIE, sign({ gate: 'age' }, AGE_TTL_DAYS * 86400), {
    ...cookieOpts(),
    maxAge: AGE_TTL_DAYS * 86400,
  })
}

// ------------------------------------------------------------------ 请求装配

/** 把会话与合规状态挂到 req 上，供路由取用 */
export function attachAuth(req) {
  req.user = readSession(req)
  req.isBot = isBot(req)
  req.ageVerified = readAgeGate(req)
  return req
}

export function requireAuth(req) {
  if (!req.user) throw new HttpError(401, '请先登录', 'UNAUTHORIZED')
  return req.user
}

export function requireAdmin(req) {
  const user = requireAuth(req)
  if (user.role !== 'admin') throw new HttpError(403, '需要管理员权限', 'FORBIDDEN')
  return user
}

/** 清理过期会话（启动时与定时调用） */
export function purgeExpiredSessions() {
  return run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]).changes
}
