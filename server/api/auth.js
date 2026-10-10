import { Router, sendJson, badRequest, conflict, HttpError } from '../lib/http.js'
import { queryOne, run, nowIso } from '../db/index.js'
import { hashPassword, verifyPassword, passwordProblem } from '../lib/password.js'
import { createSession, destroySession, requireAuth } from '../middleware/auth.js'

export const authRouter = new Router()

/** 用户名：3-24 位，字母/数字/下划线/中文 */
const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,24}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    role: row.role,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    createdAt: row.created_at,
  }
}

authRouter.post('/auth/register', async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().slice(0, 255) : null

  if (!USERNAME_RE.test(username)) {
    throw badRequest('用户名需为 3-24 位的字母、数字、下划线或中文')
  }
  const problem = passwordProblem(password)
  if (problem) throw badRequest(problem)
  if (email && !EMAIL_RE.test(email)) throw badRequest('邮箱格式不正确')

  if (queryOne('SELECT 1 AS x FROM users WHERE username = ?', [username])) {
    throw conflict('该用户名已被占用')
  }
  if (email && queryOne('SELECT 1 AS x FROM users WHERE email = ?', [email])) {
    throw conflict('该邮箱已被注册')
  }

  const ts = nowIso()
  const result = run(
    'INSERT INTO users (username, email, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    [username, email, hashPassword(password), 'user', ts, ts],
  )
  const id = Number(result.lastInsertRowid)
  const row = queryOne('SELECT * FROM users WHERE id = ?', [id])

  createSession(res, req, id)
  sendJson(res, 201, { user: publicUser(row) })
})

authRouter.post('/auth/login', async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) throw badRequest('请填写用户名与口令')

  const row = queryOne('SELECT * FROM users WHERE username = ?', [username])
  // 用户名不存在与口令错误返回同一提示，避免账号枚举
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new HttpError(401, '用户名或口令不正确', 'UNAUTHORIZED')
  }
  if (row.status !== 1) throw new HttpError(403, '该账号已被停用，请联系管理员', 'FORBIDDEN')

  run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso(), row.id])
  createSession(res, req, row.id)
  sendJson(res, 200, { user: publicUser(row) })
})

authRouter.post('/auth/logout', async (req, res) => {
  destroySession(req, res)
  sendJson(res, 200, { ok: true })
})

authRouter.get('/auth/me', async (req, res) => {
  sendJson(res, 200, {
    user: publicUser(req.user),
    ageVerified: !!req.ageVerified,
    isBot: !!req.isBot,
  })
})

/** 修改口令（已登录）——顺手补上，否则默认口令无法自行更换 */
authRouter.post('/auth/password', async (req, res) => {
  const user = requireAuth(req)
  const body = req.body || {}
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const next = typeof body.newPassword === 'string' ? body.newPassword : ''

  const row = queryOne('SELECT password_hash FROM users WHERE id = ?', [user.id])
  if (!row || !verifyPassword(current, row.password_hash)) {
    throw new HttpError(401, '当前口令不正确', 'UNAUTHORIZED')
  }
  const problem = passwordProblem(next)
  if (problem) throw badRequest(problem)

  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    [hashPassword(next), nowIso(), user.id])
  sendJson(res, 200, { ok: true })
})
