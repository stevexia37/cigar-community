import { Router, sendJson, badRequest, HttpError } from '../lib/http.js'
import { logAudit } from '../lib/audit.js'
import { query, queryOne, run, nowIso } from '../db/index.js'
import { scan } from '../lib/sensitive.js'
import { requireAuth } from '../middleware/auth.js'

export const submissionRouter = new Router()

function str(value, max) {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s ? s.slice(0, max) : null
}

function num(value, name, { min, max, integer = false } = {}) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} 超出合理范围（${min}-${max}）`)
  return integer ? Math.round(n) : Math.round(n * 100) / 100
}

submissionRouter.post('/submissions', async (req, res) => {
  const user = requireAuth(req)
  const body = req.body || {}

  const brand = str(body.brand, 200)
  const vitola = str(body.vitola, 200)
  if (!brand) throw badRequest('品牌必填')
  if (!vitola) throw badRequest('型号必填')

  const originType = body.originType === 'cuban' || body.originType === 'non-cuban' ? body.originType : null
  if (!originType) throw badRequest('请选择产地大类（cuban / non-cuban）')

  const countryCode = str(body.countryCode, 2)?.toUpperCase() || null
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw badRequest('countryCode 必须是 2 位 ISO 字母代码')

  const flavorIds = Array.isArray(body.flavorIds)
    ? body.flavorIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30)
    : []

  const payload = {
    brand,
    series: str(body.series, 200),
    vitola,
    originType,
    countryCode,
    lengthInch: num(body.lengthInch, '长度（英寸）', { min: 2, max: 15 }),
    ringGauge: num(body.ringGauge, '环径', { min: 20, max: 80, integer: true }),
    strength: num(body.strength, '浓郁度', { min: 1, max: 5, integer: true }),
    wrapperVariety: str(body.wrapperVariety, 100),
    flavorIds,
    description: str(body.description, 4000),
    note: str(body.note, 500),
  }

  const sensitivity = scan(`${payload.brand} ${payload.series || ''} ${payload.vitola} ${payload.description || ''} ${payload.note || ''}`)
  if (sensitivity.action === 'blocked') {
    // blocked 不留存原文，只记命中词与指纹
    logAudit({
      userId: user.id, kind: 'submission', refId: null,
      action: sensitivity.action, matched: sensitivity.matched,
      text: `${payload.brand} ${payload.vitola} ${payload.note || ''}`,
    })
    throw new HttpError(403, sensitivity.message, 'CONTENT_REJECTED', { matched: sensitivity.matched })
  }

  const ts = nowIso()
  const result = run(
    'INSERT INTO submissions (user_id, payload, status, created_at) VALUES (?,?,?,?)',
    [user.id, JSON.stringify(payload), 'pending', ts],
  )
  const id = Number(result.lastInsertRowid)

  logAudit({
    userId: user.id, kind: 'submission', refId: id,
    action: sensitivity.action, matched: sensitivity.matched,
    text: `${payload.brand} ${payload.vitola}`,
  })

  sendJson(res, 202, {
    code: 'CONTENT_QUEUED',
    submission: { id, status: 'pending', createdAt: ts },
    sensitivity: { action: sensitivity.action, matched: sensitivity.matched, message: sensitivity.message },
  })
})

submissionRouter.get('/submissions/mine', async (req, res) => {
  const user = requireAuth(req)
  const rows = query(
    `SELECT id, payload, status, reject_reason, reviewed_at, created_at
     FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [user.id],
  )
  sendJson(res, 200, {
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      rejectReason: r.reject_reason,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      payload: safeParse(r.payload),
    })),
  })
})

function safeParse(json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
