/**
 * 查询参数解析的公共工具。
 *
 * 为什么单独成文件：pagination 曾被复制到 cigars.js 与 reviews.js 两处，
 * 同一个 bug 也就复制了两份 —— `/api/cigars?pageSize=1.5` 与 `/api/reviews?pageSize=1.5`
 * 都会 500（SQLite 报 datatype mismatch：LIMIT/OFFSET 收到小数或超出 int64 的值）。
 * 现在只有一份实现，且带明确的取整与上界钳制。
 */

/** 解析为「安全整数」，非法值回落到 fallback */
export function toInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

/** 解析为浮点数，非法值返回 null */
export function toFloat(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * 分页参数解析。
 * ⚠️ 必须取整并钳制上界：
 *   · 不取整 → SQLite 的 LIMIT/OFFSET 收到 1.5，报 datatype mismatch（500）
 *   · 不钳制 → page=1e18 让 offset 超出 int64，同样 500
 * 任何输入都应得到一个合法分页，绝不能把解析失败暴露成 5xx。
 */
export function parsePagination(query = {}, { defaultPageSize = 20, maxPageSize = 60 } = {}) {
  const rawSize = toInt(query.pageSize, defaultPageSize)
  const pageSize = Math.min(maxPageSize, Math.max(1, rawSize))

  // 页号也要有上界：虽然 offset 会被钳制不会 500，但回显 1e18 页对调用方没有意义
  const MAX_PAGE = 1_000_000
  const rawPage = toInt(query.page, 1)
  const page = Math.min(MAX_PAGE, Math.max(1, rawPage))

  // offset 用它做乘法，必须确认不会越过安全整数范围
  const MAX_OFFSET = Number.MAX_SAFE_INTEGER - pageSize
  const offset = page > Math.floor(MAX_OFFSET / pageSize) ? MAX_OFFSET : (page - 1) * pageSize

  return { page, pageSize, offset }
}

/** 逗号分隔的多值参数：?origin=cuba,nicaragua（也兼容重复参数 ?origin=a&origin=b） */
export function parseList(value) {
  if (value === undefined || value === null || value === '') return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  return raw.map((s) => String(s).trim()).filter(Boolean)
}

/** 多值参数 → 整数数组（丢弃非法项） */
export function parseIntList(value) {
  return parseList(value)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * 校验正整数 ID。
 * 之前的实现把 Number('abc') = NaN 直接绑进 SQL，得到「静默 0 条」而不是报错，
 * 前端无法区分「没有结果」和「参数写错了」。
 */
export function parseId(value, { name = 'ID', max = 2147483647 } = {}) {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const s = String(raw).trim()
  if (!/^\d+$/.test(s)) return { invalid: true, name }
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < 1 || n > max) return { invalid: true, name }
  return n
}
