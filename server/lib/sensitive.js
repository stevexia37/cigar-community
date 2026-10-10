/**
 * 合规熔断：敏感词扫描
 *
 * 设计要点（对着 config/sensitive-words.json 的 implementation_notes 实现）：
 *   1. 标准化后再匹配 —— 大小写、全角/半角、零宽字符、分隔符插入（"加-微-信"）都要能识破
 *   2. 优先级 immediate_ban > audit_required > flag_and_warn
 *   3. 白名单必须优先于匹配 —— 否则「本站不卖雪茄」会被自己的红线词误杀
 *   4. 命中位置回填到原文，便于运营在审核队列里看到上下文
 *
 * 一个真实的误杀场景（已在白名单里处理）：
 *   「本站不售卖烟草制品，不提供购买渠道」含 "微信" 不含，但含 "出茄" 不含；
 *   「不卖」「不出」「没有」「禁止」等否定语境会包住 "出茄/现货/代购" 等词，需豁免。
 */
import { readFileSync, existsSync } from 'node:fs'
import { config } from '../config.js'

const FULLWIDTH_OFFSET = 0xfee0

/**
 * 归一化：保留与原文的下标映射，便于回填命中位置。
 * 折叠的字符（空白、零宽、连接符）映射到 -1，不单独起作用。
 */
export function normalize(text) {
  const chars = []
  const map = []
  const src = String(text ?? '')
  let lastFold = -1   // 最近一个被折叠掉的槽位，待其后的真实字符到来时补上原下标

  for (let i = 0; i < src.length; i++) {
    let ch = src[i]

    // 零宽字符与控制字符：直接丢弃
    const code = ch.charCodeAt(0)
    if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) continue
    if (code < 0x20 && ch !== '\n' && ch !== '\t') continue

    // 全角 → 半角（ASCII 可见区）
    if (code >= 0xff01 && code <= 0xff5e) ch = String.fromCharCode(code - FULLWIDTH_OFFSET)
    // 全角空格
    if (code === 0x3000) ch = ' '

    // 空白与常见连接符一律折叠掉：让 "加 微 信" / "加-微-信" / "加_微_信" 等价于 "加微信"
    if (/\s/.test(ch) || '·・•‧∙⋅—–-_*~^|/\\.'.includes(ch)) {
      map.push(-1)
      lastFold = map.length - 1
      continue
    }

    const lower = ch.toLowerCase()
    // 只保留单码元字符，代理对（emoji）跳过
    for (let k = 0; k < lower.length; k++) {
      chars.push(lower[k])
      map.push(i)
    }
    // 折叠槽位解析到紧随其后的真实字符，这样命中下标不会落在空洞上
    if (lastFold >= 0 && lastFold < map.length) {
      map[lastFold] = i
      lastFold = -1
    }
  }
  return { text: chars.join(''), map }
}

/** 递归收集规则里的关键词，带优先级 */
function collectRules(rules) {
  const buckets = [
    { action: 'blocked', list: rules?.immediate_ban?.keywords || [] },
    { action: 'queued', list: rules?.audit_required?.keywords || [] },
    { action: 'warned', list: rules?.flag_and_warn?.keywords || [] },
  ]
  const seen = new Map()
  for (const { action, list } of buckets) {
    for (const raw of list) {
      if (typeof raw !== 'string' || !raw.trim()) continue
      const key = raw.trim()
      if (seen.has(key)) continue
      const { text } = normalize(key)
      if (!text) continue
      seen.set(key, { keyword: key, needle: text, action })
    }
  }
  return [...seen.values()]
}

let cached = null

export function loadSensitiveConfig({ reload = false } = {}) {
  if (cached && !reload) return cached
  const path = config.paths.sensitiveWords
  if (!existsSync(path)) {
    console.warn(`[compliance] 未找到敏感词配置 ${path}，合规熔断将放行所有内容`)
    cached = {
      rules: [], whitelistPatterns: [], safeContext: [], negations: [], warning: '敏感词配置缺失',
    }
    return cached
  }

  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const wl = raw.whitelist || {}
  const patterns = Array.isArray(wl.patterns) ? wl.patterns : []
  const safeContext = Array.isArray(wl.safe_context_regex) ? wl.safe_context_regex : []
  const negations = Array.isArray(wl.negation_context) ? wl.negation_context : []

  cached = {
    version: raw._version || 'unknown',
    updated: raw._updated || null,
    rules: collectRules(raw.rules),
    whitelistPatterns: patterns
      .map((p) => normalize(p).text)
      .filter(Boolean),
    safeContext,
    negations,
  }
  return cached
}

const SENTENCE_ENDS = '。！？；!?;\n'

/**
 * 取命中处所在的句子范围。
 * 为什么是句子而不是固定窗口：正当讨论里「举报」常出现在命中词之后
 * （「遇到代购私聊请举报」），固定 ±4 字窗口抓不到；但整段扫描又会把
 * 「本站不卖茄。有货私聊我。」这种真违规一起豁免掉。句级是两者的平衡点。
 */
function sentenceScope(haystack, index, keywordLength) {
  let start = 0
  for (let i = index - 1; i >= 0; i--) {
    if (SENTENCE_ENDS.includes(haystack[i])) { start = i + 1; break }
  }
  let end = haystack.length
  for (let i = index + keywordLength; i < haystack.length; i++) {
    if (SENTENCE_ENDS.includes(haystack[i])) { end = i; break }
  }
  return { start, end, prefix: haystack.slice(start, index) }
}

/** 该命中位置是否处于白名单语境中 */
function isWhitelisted(haystack, index, keywordLength, cfg) {
  const { start, end, prefix } = sentenceScope(haystack, index, keywordLength)
  const scope = haystack.slice(start, end)

  for (const phrase of cfg.whitelistPatterns) {
    if (phrase && scope.includes(phrase)) return true
  }
  for (const pattern of cfg.safeContext) {
    try {
      if (new RegExp(pattern).test(scope)) return true
      // 否定性修饰只往前看，避免「请勿私聊。有货出茄」被整体豁免
      if (new RegExp(pattern).test(prefix)) return true
    } catch {
      // 配置里的正则写错了不该让整个请求失败，跳过
    }
  }
  return false
}

/** 命中位置是否处于否定语境（否定词必须紧邻或在本句命中之前） */
function isNegated(haystack, index, cfg) {
  const { prefix } = sentenceScope(haystack, index, 0)
  for (const neg of cfg.negations) {
    const n = normalize(neg).text
    if (!n) continue
    if (prefix.endsWith(n)) return true
    if (prefix.includes(n)) return true
    // 否定词紧随命中词之后：「出茄？不出的」——只看命中词后 3 字
    if (haystack.slice(index, index + 3).includes(n)) return true
  }
  return false
}

const RANK = { clean: 0, warned: 1, queued: 2, blocked: 3 }

/**
 * 扫描文本
 * @returns {{ action: 'clean'|'warned'|'queued'|'blocked', matched: string[],
 *             matches: Array<{keyword:string, action:string, index:number}>, message: string|null }}
 */
export function scan(text) {
  const cfg = loadSensitiveConfig()
  const hay = normalize(text)
  const result = { action: 'clean', matched: [], matches: [], message: null }

  if (!hay.text || cfg.rules.length === 0) {
    if (cfg.warning) result.message = cfg.warning
    return result
  }

  const taken = []

  for (const rule of cfg.rules) {
    let from = 0
    for (;;) {
      const idx = hay.text.indexOf(rule.needle, from)
      if (idx === -1) break
      from = idx + 1

      const end = idx + rule.needle.length
      // 已被优先级更高的词覆盖则跳过，避免 "多少钱" 与 "价格" 重复计数
      if (taken.some((t) => idx < t.end && end > t.start)) continue

      // 白名单是「语境」判定，必须对所有动作生效 —— 包括红线词。
      // 否则「遇到代购请举报」这类正当讨论会被自己的红线词误杀（踩过的坑）。
      if (isWhitelisted(hay.text, idx, rule.needle.length, cfg)) continue
      if (isNegated(hay.text, idx, cfg)) continue

      taken.push({ start: idx, end })
      const originalIndex = hay.map[idx] ?? -1
      result.matches.push({ keyword: rule.keyword, action: rule.action, index: originalIndex })
      if (!result.matched.includes(rule.keyword)) result.matched.push(rule.keyword)
      if (RANK[rule.action] > RANK[result.action]) result.action = rule.action
    }
  }

  if (result.action === 'blocked') {
    result.message = `内容命中禁止交易的词：${result.matched.join('、')}。本站不参与任何烟草交易。`
  } else if (result.action === 'queued') {
    result.message = '内容命中需审核的词，将进入人工审核队列，通过后才会公开显示。'
  } else if (result.action === 'warned') {
    result.message = '内容涉及敏感话题，请注意符合社区公约。'
  }

  // 按原文位置排序，便于展示上下文
  result.matches.sort((a, b) => a.index - b.index)
  return result
}

/** 仅供测试使用：清缓存 */
export function _resetCache() {
  cached = null
}

export const ACTIONS = RANK
