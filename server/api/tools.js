import { Router, sendJson, badRequest } from '../lib/http.js'
import { query, queryOne, run, nowIso } from '../db/index.js'
import { scan } from '../lib/sensitive.js'
import {
  QUESTIONS as DIAG_QUESTIONS, answerQuestionnaire,
} from '../rules/diagnostic.js'
import {
  QUESTIONS as FLAVOR_QUESTIONS, scoreCategories, resolvePersonality, CATEGORY_LABELS,
} from '../rules/flavor.js'
import { calcAging, STRENGTH_LABELS } from '../rules/aging.js'

export const toolRouter = new Router()

function recordEvent(tool, key) {
  try {
    run('INSERT INTO tool_events (tool, result_key, created_at) VALUES (?,?,?)', [tool, key, nowIso()])
  } catch {
    // 埋点失败不能影响主流程
  }
}

// ---------------------------------------------------------------- 病害诊断
toolRouter.get('/tools/diagnostic', async (req, res) => {
  sendJson(res, 200, { questions: DIAG_QUESTIONS })
})

toolRouter.post('/tools/diagnostic', async (req, res) => {
  const answers = req.body?.answers
  if (answers === undefined || answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    throw badRequest('answers 必须是对象，形如 { "1": "mold", "2": "mild" }')
  }
  const diagnosis = answerQuestionnaire(answers)
  recordEvent('diagnostic', diagnosis.key)
  sendJson(res, 200, { diagnosis })
})

// ---------------------------------------------------------------- 风味人格测试
toolRouter.get('/tools/flavor-test', async (req, res) => {
  // 把规则里的风味名解析成数据库 id，前端回传 id 数组
  const rows = query('SELECT id, name, name_cn FROM flavors')
  const byName = new Map(rows.map((r) => [r.name, r]))
  const byCn = new Map(rows.map((r) => [r.name_cn, r]))

  const questions = FLAVOR_QUESTIONS.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options.map((o) => {
      const hit = byCn.get(o.label) || byName.get(o.value)
      return {
        value: hit ? hit.id : null,
        name: hit ? hit.name : o.value,
        label: o.label,
        category: o.category,
      }
    }).filter((o) => o.value !== null),
  }))

  sendJson(res, 200, { questions })
})

toolRouter.post('/tools/flavor-test', async (req, res) => {
  const answers = req.body?.answers
  if (!Array.isArray(answers)) throw badRequest('answers 必须是风味 id 数组')

  const ids = answers.map((n) => Number(n)).filter((n) => Number.isFinite(n)).slice(0, 100)
  if (!ids.length) throw badRequest('至少选择一个风味')

  const rows = ids.length
    ? query(`SELECT id, name, name_cn, category FROM flavors WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    : []

  const selections = rows.map((r) => ({ id: r.id, name: r.name, label: r.name_cn || r.name, category: r.category }))
  const scores = scoreCategories(selections)
  const personality = resolvePersonality(scores)

  // 推荐：按人格对应的风味大类找雪茄
  let recommended = []
  if (personality.key && personality.key !== 'balanced') {
    recommended = query(
      `SELECT c.id, b.name AS brand, c.vitola, c.strength, c.rating
       FROM cigars c
       JOIN brands b ON b.id = c.brand_id
       JOIN cigar_flavors cf ON cf.cigar_id = c.id
       JOIN flavors f ON f.id = cf.flavor_id
       WHERE c.status = 1 AND f.category = ?
       GROUP BY c.id
       ORDER BY c.rating IS NULL, c.rating DESC
       LIMIT 4`,
      [personality.key],
    )
  } else {
    recommended = query(
      `SELECT c.id, b.name AS brand, c.vitola, c.strength, c.rating
       FROM cigars c JOIN brands b ON b.id = c.brand_id
       WHERE c.status = 1 ORDER BY c.rating IS NULL, c.rating DESC LIMIT 4`,
    )
  }

  recordEvent('flavor-test', personality.key)
  sendJson(res, 200, {
    result: {
      key: personality.key,
      title: personality.title,
      icon: personality.icon,
      description: personality.description,
      traits: personality.traits || [],
      scores: scores.map((s) => ({ ...s, categoryLabel: CATEGORY_LABELS[s.category] || s.label })),
      recommended: recommended.map((r) => ({
        id: r.id, brand: r.brand, vitola: r.vitola,
        strength: r.strength, strengthLabel: STRENGTH_LABELS[r.strength] || null,
        rating: r.rating,
      })),
      disclaimer: '测试结果基于你选择的风味偏好计算，仅用于趣味探索与选茄参考。',
    },
  })
})

// ---------------------------------------------------------------- 醇化计算器
toolRouter.get('/tools/aging-calc', async (req, res) => {
  const rows = query(
    `SELECT c.id, b.name AS brand, c.vitola, c.strength
     FROM cigars c JOIN brands b ON b.id = c.brand_id
     WHERE c.status = 1 ORDER BY b.name COLLATE NOCASE, c.vitola COLLATE NOCASE`,
  )
  sendJson(res, 200, {
    cigars: rows.map((r) => ({
      id: r.id,
      label: `${r.brand} ${r.vitola}`,
      strength: r.strength,
      strengthLabel: STRENGTH_LABELS[r.strength] || null,
    })),
    strengths: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: STRENGTH_LABELS[v] })),
  })
})

toolRouter.post('/tools/aging-calc', async (req, res) => {
  const body = req.body || {}
  let strength = Number(body.strength)

  // 允许只给 cigarId，由服务端取它的浓郁度
  if ((!Number.isFinite(strength) || strength < 1) && body.cigarId) {
    const row = queryOne('SELECT strength FROM cigars WHERE id = ? AND status = 1', [Number(body.cigarId)])
    if (!row) throw badRequest('指定的雪茄不存在')
    strength = row.strength
  }
  if (!Number.isFinite(strength) || strength < 1 || strength > 5) {
    throw badRequest('请提供 strength（1-5）或有效的 cigarId')
  }

  const result = calcAging({ ...body, strength })
  recordEvent('aging-calc', String(result.status))
  sendJson(res, 200, { result })
})

// ---------------------------------------------------------------- 敏感词预检
toolRouter.post('/tools/check-text', async (req, res) => {
  const text = req.body?.text
  if (typeof text !== 'string') throw badRequest('text 必须是字符串')
  if (text.length > 20000) throw badRequest('文本过长')

  const result = scan(text)
  sendJson(res, 200, {
    action: result.action,
    matched: result.matched,
    message: result.message,
    matches: result.matches,
  })
})
