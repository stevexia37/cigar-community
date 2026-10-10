import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

// scrypt 参数：N=16384, r=8, p=1 —— OWASP 推荐的最小可用档位
// 注意：Node 的 scrypt 受 maxmem 限制，2147483648 是安全上界
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 256 * 1024 * 1024 }

const PREFIX = 'scrypt'

/** 生成 "scrypt$N$r$p$salt$hash" 格式的口令散列 */
export function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new TypeError('hashPassword: 口令必须是非空字符串')
  }
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, PARAMS.keylen, PARAMS)
  return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

/** 恒定时间校验口令 */
export function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return false
  const [, n, r, p, saltB64, hashB64] = parts
  let expected
  try {
    expected = Buffer.from(hashB64, 'base64')
    const actual = scryptSync(plain, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** 口令强度下限：8 位以上，且不是纯数字 */
export function passwordProblem(plain) {
  if (typeof plain !== 'string' || plain.length < 8) return '口令至少 8 位'
  if (plain.length > 128) return '口令过长（上限 128 位）'
  if (/^\d+$/.test(plain)) return '口令不能是纯数字'
  return null
}
