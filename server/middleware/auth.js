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

/**
 * 读取当前登录用户；会话过期即失效并清理。返回 null 表示未登录。
 *
 * ⚠️ 列别名必须唯一：早期写成 `s.id AS sid, u.id, …`，而 node:sqlite 对重名列
 * 只保留最后一个，导致 `row.id` 拿到的是**会话 id**、`row.sid` 也可能串到用户 id。
 * 症状极其隐蔽：改口令时 `DELETE … AND id != user.sessionId` 删掉的是当前会话，
 * 真正该踢掉的会话反而留着。所以这里把两边都显式起名。
 */
export function readSession(req) {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token) return null
  const row = queryOne(
    `SELECT s.id AS session_id, s.expires_at,
            u.id AS user_id, u.username, u.email, u.role, u.avatar_url, u.bio, u.status, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [sha256(token)],
  )
  if (!row) return null
  if (row.expires_at < nowIso()) {
    run('DELETE FROM sessions WHERE id = ?', [row.session_id])
    return null
  }
  if (row.status !== 1) return null
  return {
    id: row.user_id,
    username: row.username,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    createdAt: row.created_at,
    sessionId: row.session_id,
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
/**
 * 年龄门强制校验 —— 这是合规红线，不能只靠前端弹窗。
 *
 * 为什么必须服务端强制：前端弹窗只遮挡了「界面」，接口内容照样返回。
 * 直接 GET /api/cigars 就能拿到全部雪茄资料，等于年龄门不存在。
 * 对一个 18+ 烟草站点，这是合规问题而非体验问题。
 *
 * 放行规则（三类，都是有意的）：
 *   1. 年龄门自身接口 —— 否则用户永远无法通过
 *   2. 健康检查 —— 编排系统与预检要能探活
 *   3. **爬虫放行**（isBot）—— 站点定位是「非交易向知识社区」，
 *      需要被搜索引擎收录；分享到微信/微博的卡片抓取同理。
 *      爬虫不是「人」，不构成向未成年人展示；这是 design 里明确的取舍。
 */
export function assertAgeGate(req) {
  if (config.ageGateDisabled) return
  if (req.ageVerified) return
  // 已登录用户豁免：要有账号必然已经走过年龄门；
  // 若在这里拦住，管理员/编辑会连自己的后台都进不去
  // （年龄门检查发生在业务鉴权之前，这个顺序问题真实发生过）
  if (req.user) return
  throw new HttpError(403, '请先确认已满 18 周岁', 'AGE_GATE_REQUIRED')
}

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
