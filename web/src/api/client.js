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

/**
 * 命中年龄门时的自动重试。
 *
 * 服务端强制年龄门后，未过门时 /api/* 返回 403 AGE_GATE_REQUIRED。
 * 页面首屏的请求必然撞上它一次（弹窗还没确认），而各视图只在 onMounted 加载 ——
 * 若不重试，用户确认年龄后界面会永远停在错误提示上。
 *
 * 为什么放在客户端层而不是逐视图处理：这是**每个依赖 API 的视图都会遇到**的
 * 共性问题。起初只在首页加了重试，结果 /cigars、/reviews、/cigars/:id、工具页
 * 全部仍卡在错误状态 —— 打补丁不如修根因。
 *
 * 等待时长取「用户看一眼弹窗并点确认」的典型耗时；确认成功后服务端会下发
 * cc_age，重试即通过。若用户迟迟不确认，重试仍失败，视图正常显示错误提示。
 */
const AGE_GATE_RETRY_DELAY_MS = 1500
const AGE_GATE_MAX_RETRY = 2

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

  const attempt = async () => {
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

  for (let i = 0; ; i++) {
    try {
      return await attempt()
    } catch (err) {
      const ageBlocked = err instanceof ApiError && err.code === 'AGE_GATE_REQUIRED'
      // 只在「等用户确认年龄」这件事上重试，其它错误立即抛出（包括内容违规）
      if (!ageBlocked || i >= AGE_GATE_MAX_RETRY || signal?.aborted) {
        if (ageBlocked) err.humanMessage = '请先确认已满 18 周岁'
        throw err
      }
      await new Promise((r) => setTimeout(r, AGE_GATE_RETRY_DELAY_MS))
    }
  }
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

  // ---- 用户 ----
  userProfile: (id) => get(`/users/${id}`),

  // ---- 图片 ----
  uploadImage: (data) => post('/uploads', { data }),
  uploadLimits: () => get('/uploads/limits'),

  // ---- 投稿 ----
  submitCigar: (payload) => post('/submissions', payload),
  mySubmissions: () => get('/submissions/mine'),

  // ---- 认证 ----
  register: (payload) => post('/auth/register', payload),
  login: (payload) => post('/auth/login', payload),
  logout: () => post('/auth/logout'),
  me: () => get('/auth/me'),

  // ---- 管理端（需 admin / editor 角色）----
  adminStats: () => get('/admin/stats'),
  adminReviews: (query) => get('/admin/reviews', query),
  adminReview: (id) => get(`/admin/reviews/${id}`),
  adminApproveReview: (id) => post(`/admin/reviews/${id}/approve`),
  adminRejectReview: (id, reason) => post(`/admin/reviews/${id}/reject`, { reason }),
  adminDeleteReview: (id) => request(`/admin/reviews/${id}`, { method: 'DELETE' }),
  adminSubmissions: (query) => get('/admin/submissions', query),
  adminApproveSubmission: (id) => post(`/admin/submissions/${id}/approve`),
  adminRejectSubmission: (id, reason) => post(`/admin/submissions/${id}/reject`, { reason }),
  adminAuditLog: (query) => get('/admin/audit-log', query),
  adminUsers: (query) => get('/admin/users', query),
  adminSetUserStatus: (id, status) => post(`/admin/users/${id}/status`, { status }),

  // ---- 合规 ----
  verifyAge: (adult) => post('/gate/verify', { adult }),
  content: (slug) => get(`/content/${slug}`),
}

export default api
