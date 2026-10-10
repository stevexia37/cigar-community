/**
 * 统一 API 客户端（依据 docs/API.md v1）
 *
 * 约定：
 *   · 所有请求同源 /api，自带 Cookie
 *   · 非 2xx 抛 ApiError，调用方可读 code / details
 *   · CONTENT_REJECTED(403) 与 CONTENT_QUEUED(202) 是「业务性拒绝」，
 *     由调用方决定如何提示，不做全局兜底吞掉
 */

const BASE = '/api'

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error || `请求失败（HTTP ${status}）`)
    this.name = 'ApiError'
    this.status = status
    this.code = payload?.code || 'ERROR'
    this.details = payload?.details

    // 敏感词拦截：把命中词暴露成可读文案
    if (this.code === 'CONTENT_REJECTED') {
      const words = this.details?.matched
      this.matched = Array.isArray(words) ? words : []
      this.humanMessage = this.matched.length
        ? `内容包含禁止交易的词：${this.matched.join('、')}`
        : '内容未通过合规校验'
    } else if (this.code === 'CONTENT_QUEUED') {
      this.humanMessage = '内容已提交，正在人工审核，通过后才会公开显示'
    } else {
      this.humanMessage = this.message
    }
  }
}

async function request(path, { method = 'GET', body, query, signal } = {}) {
  let url = path.startsWith('http') ? path : BASE + path
  if (query && typeof query === 'object') {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        if (value.length === 0) continue
        params.set(key, value.join(','))
      } else {
        params.set(key, String(value))
      }
    }
    const qs = params.toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }

  const init = {
    method,
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal,
  }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, { error: '网络连接失败，请检查后端服务是否已启动', code: 'NETWORK_ERROR' })
  }

  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text.slice(0, 200), code: 'INVALID_RESPONSE' }
    }
  }

  if (!res.ok) throw new ApiError(res.status, payload)
  return payload
}

const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body })
const get = (path, query, opts) => request(path, { ...opts, method: 'GET', query })

export const api = {
  request,
  get,
  post,

  // ---- 元数据 ----
  meta: () => get('/meta'),
  health: () => get('/health'),

  // ---- 雪茄 ----
  cigars: (query) => get('/cigars', query),
  cigar: (id) => get(`/cigars/${id}`),
  flavors: () => get('/flavors'),

  // ---- 工具 ----
  diagnosticQuestions: () => get('/tools/diagnostic'),
  diagnostic: (answers) => post('/tools/diagnostic', { answers }),
  flavorTestQuestions: () => get('/tools/flavor-test'),
  flavorTest: (answers) => post('/tools/flavor-test', { answers }),
  agingOptions: () => get('/tools/aging-calc'),
  agingCalc: (payload) => post('/tools/aging-calc', payload),
  checkText: (text) => post('/tools/check-text', { text }),

  // ---- 品吸笔记 ----
  reviews: (query) => get('/reviews', query),
  createReview: (payload) => post('/reviews', payload),
  toggleHelpful: (id) => post(`/reviews/${id}/helpful`),

  // ---- 投稿 ----
  submitCigar: (payload) => post('/submissions', payload),
  mySubmissions: () => get('/submissions/mine'),

  // ---- 认证 ----
  register: (payload) => post('/auth/register', payload),
  login: (payload) => post('/auth/login', payload),
  logout: () => post('/auth/logout'),
  me: () => get('/auth/me'),

  // ---- 合规 ----
  verifyAge: (adult) => post('/gate/verify', { adult }),
  content: (slug) => get(`/content/${slug}`),
}

export default api
