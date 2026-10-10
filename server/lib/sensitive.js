/**
 * 合规熔断：内容扫描
 *
 * ── 设计原则（这三条是踩坑之后定下来的，改动前请先读懂）────────────────────
 *
 * 1. 豁免必须基于「命中词邻近的上下文」，不能因为整句出现过某词就豁免。
 *    早期实现用 `sentence.includes(豁免词)` 判豁免，结果「违规出茄加微信」整句被豁免、
 *    以 status=1 公开发布（实测缺陷）。现在否定词必须紧邻命中词之前，
 *    安全语境词必须落在命中词前后若干字符的窗口内。
 *
 * 2. 精度靠「组合规则」，不靠「堆单词表」。
 *    早期把 飞机/拼车/转账/有货/私聊/性价比 等日常词塞进红线，导致
 *    「我坐飞机去哈瓦那」「周末拼车去雪茄吧」全部 403（实测误杀）。
 *    现在这些词只进审核队列，靠 compound_rules（交易词 + 联系方式）补回强度。
 *
 * 3. 归一化要覆盖真实绕过手法，但**跨间隙命中要谨慎接纳**。
 *    「出【茄】」「出😀茄」需要折叠标点/emoji 才能识破；但折叠会让正常句子里
 *    相隔较远的两个字连在一起造成误判。因此：跨间隙命中只对红线级别接纳。
 *
 * ── 已知不做的事 ────────────────────────────────────────────────────────
 * · 不做拼音全文转换（会把「是」变成 shi 之类，破坏中文匹配）。只做变体词替换，
 *   覆盖高频高危写法（weixin/wx/daigou…），见 config 的 variants。
 * · 不做语义判断。这是关键词系统，不是分类模型；它的价值是「零延迟、可解释、
 *   可审计」，边界情形交给审核队列由人处理。
 */
import { readFileSync, existsSync } from 'node:fs'
import { config } from '../config.js'

const FULLWIDTH_OFFSET = 0xfee0

/** 折叠：空白、标点、括号、emoji、符号 —— 全部丢弃，只保留字母/数字/汉字 */
function isFoldable(code) {
  if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) return true
  if (code < 0x20 && code !== 0x0a && code !== 0x09) return true
  if (code === 0x0a || code === 0x09) return true
  if (code === 0x20) return true          // 半角空格
  if (code === 0x3000) return true        // 全角空格
  // ASCII 标点与符号
  if (code >= 0x21 && code <= 0x2f) return true
  if (code >= 0x3a && code <= 0x40) return true
  if (code >= 0x5b && code <= 0x60) return true
  if (code >= 0x7b && code <= 0x7e) return true
  // CJK 标点与全角符号
  if (code >= 0x3000 && code <= 0x303f) return true
  if (code >= 0xff01 && code <= 0xff0f) return true
  if (code >= 0xff1a && code <= 0xff20) return true
  if (code >= 0xff3b && code <= 0xff40) return true
  if (code >= 0xff5b && code <= 0xff65) return true
  // Emoji 与其它符号区（含代理对区间）
  if (code >= 0x2000 && code <= 0x2bff) return true
  if (code >= 0xd800 && code <= 0xdfff) return true
  if (code >= 0xfe00 && code <= 0xfe0f) return true
  return false
}

let cached = null

export function loadSensitiveConfig({ reload = false } = {}) {
  if (cached && !reload) return cached
  const path = config.paths.sensitiveWords
  if (!existsSync(path)) {
    console.warn(`[compliance] 未找到敏感词配置 ${path}，合规熔断将放行所有内容`)
    cached = emptyConfig('敏感词配置缺失')
    return cached
  }

  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.error(`[compliance] 敏感词配置解析失败：${err.message}`)
    cached = emptyConfig('敏感词配置解析失败')
    return cached
  }

  const rules = collectRules(raw.rules)
  const vocab = new Set(rules.map((r) => r.needle))

  // 变体词替换表：把拼音/缩写/同音写法映射回规范词
  const seenVariant = new Set()
  const variantWords = Object.entries(raw?.variants?.word_map || [])
    .map(([from, to]) => ({ raw: from, from: normalizeRaw(from), to: normalizeRaw(to) }))
    // 关键校验：归一化会剥离 emoji / 标点。若源词被剥短了，映射语义已经失真。
    // 实例：配置里写了 "微❤" → "微信"，归一化后变成单字 "微" → "微信"，
    // 而单字映射会把所有含「微」的词都改写成「微信」（实测产出「微信信」）。
    // 因此源词归一化后长度必须与原文一致（忽略大小写），否则丢弃。
    .filter((v) => v.from && v.to && v.from !== v.to && v.from.length === [...v.raw.toLowerCase()].length)
    .filter((v) => {
      if (seenVariant.has(v.from)) return false
      seenVariant.add(v.from)
      return true
    })
    // 长的先替换，避免 "weixin" 被 "wx" 之类短词先吃掉
    .sort((a, b) => b.from.length - a.from.length)

  if (variantWords.some((v) => v.from.length === 1 && v.to.length > 1)) {
    console.warn('[compliance] 变体表存在「单字→多字」映射，会污染正常文本，已忽略。请检查 variants.word_map。')
  }

  const charMap = { ...(raw?.variants?.char_map || {}) }

  const wl = raw.whitelist || {}
  cached = {
    version: raw._version || 'unknown',
    rules,
    vocab,
    variantWords,
    charMapKeys: new Set(Object.keys(charMap)),
    charMap,
    whitelistPatterns: (wl.patterns?.list || wl.patterns || []).map(normalizeRaw).filter(Boolean),
    negations: (wl.negation?.list || wl.negation_context || []).map(normalizeRaw).filter(Boolean),
    negationPhrases: ['不提供', '不卖', '不出', '不做', '从不', '没有'].map(normalizeRaw),
    // 豁免词表：**只含保护性语义词**（举报/防骗/切勿…）。
    // 绝不能包含联系方式或交易词：它们与规则关键词重合，会造成「关键词互相豁免」
    // （微信豁免出茄 → 私聊豁免微信 → 全段放行）。实测这是最严重的一次漏放。
    safeExemptors: (wl.safe_context?.exemptors || []).map(String),
    safeWindow: Number(wl.safe_context?._exempt_window ?? 12),
    compoundRules: (raw.compound_rules?.rules || []).map((r) => ({
      name: r.name || '未命名组合规则',
      a: (r.any_of_a || []).map(normalizeRaw).filter(Boolean),
      b: (r.any_of_b || []).map(normalizeRaw).filter(Boolean),
      window: Number(r.window ?? 30),
      exemptInSafeContext: r.exempt_in_safe_context !== false,
      // 升格级别：可配置。询价+数量的组合只应进审核队列，不能一律判红线。
      escalateTo: ['blocked', 'queued', 'warned'].includes(r.escalate_to) ? r.escalate_to : 'blocked',
    })),
    warning: null,
  }
  return cached
}

function emptyConfig(warning) {
  return {
    version: 'unknown', rules: [], vocab: new Set(), variantWords: [], charMapKeys: new Set(),
    charMap: {}, whitelistPatterns: [], negations: [], negationPhrases: [],
    safeExemptors: [], safeWindow: 12, compoundRules: [], warning,
  }
}

/** 递归收集三个动作桶里的关键词，并做优先级去重（先出现的级别更高） */
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
      const keyword = raw.trim()
      const key = keyword.toLowerCase()
      if (seen.has(key)) continue
      const needle = normalizeRaw(keyword)
      if (!needle) continue
      seen.set(key, { keyword, needle, action })
    }
  }
  return [...seen.values()]
}

/** 不做变体替换的归一化（用于配置项自身，避免自指替换） */
function normalizeRaw(text) {
  return normalize(text, { variantWords: [], charMap: {} }).text
}

/**
 * 归一化：返回
 *   text  —— 用于匹配的紧凑文本（已折叠标点/空白/emoji）
 *   map   —— text[i] 在原文中的起始下标，用于回填命中位置
 *   end   —— 对应末位之后的下标（-1 表示折叠槽位）
 */
export function normalize(text, { variantWords, charMap } = {}) {
  const src = String(text ?? '')
  const chars = []
  const map = []
  const ends = []
  const allFold = []      // allFold[k] = true 表示折叠槽位（非真实字符）
  let lastFold = -1
  let prevWasFold = true  // 开头视为折叠边界，便于 ASCII 词边界判定

  for (let i = 0; i < src.length; i++) {
    let ch = src[i]
    const code = ch.charCodeAt(0)

    if (isFoldable(code)) {
      // 空白单独处理：单个空格代表「紧凑书写」（加 微 信），连续空格代表真实间隔。
      // 若不折叠单空格，「加 微 信」这类经典绕过会直接失效（实测漏放）。
      if (code === 0x20 || code === 0x3000) {
        const next = src[i + 1]
        const isDouble = next === ' ' || next === '\u3000'
        if (isDouble) {
          allFold.push(true)
          map.push(i)
          ends.push(i + 1)
          lastFold = allFold.length - 1
          prevWasFold = true
        } else if (chars.length && lastFold < 0) {
          lastFold = chars.length       // 紧凑折叠：落到下一个真实字符上
        }
        continue
      }
      allFold.push(true)
      map.push(i)
      // 记录折叠区间在原文本中的结束位置（不能用 -1：句尾标点也会走这里，
      // 若为 -1 会让每个句子末尾都被误判成「跨间隙命中」，豁免随之失效 —— 踩过的坑）
      ends.push(i + 1)
      lastFold = allFold.length - 1
      prevWasFold = true
      continue
    }

    // 全角 → 半角
    if (code >= 0xff01 && code <= 0xff5e) ch = String.fromCharCode(code - FULLWIDTH_OFFSET)
    // 繁体/异体字 → 简体
    if (charMap && charMap[ch]) ch = charMap[ch]

    const lower = ch.toLowerCase()
    for (let k = 0; k < lower.length; k++) {
      chars.push(lower[k])
      map.push(i)
      ends.push(i + 1)
      allFold.push(false)
      if (lastFold >= 0) {
        // 折叠槽位记录「其后第一个真实字符的起始位置」，作为间隙边界
        map[lastFold] = i
        prevWasFold = true
      }
    }
    lastFold = -1
    prevWasFold = false
  }

  let out = chars.join('')
  let outMap = map
  let outEnds = ends

  // 变体词替换 —— 必须单遍完成。
  // 早期用「逐个词 indexOf + 循环替换」，当替换结果本身又是某个 from 时（wx → 微信，
  // 而 微信 也在表里）就会反复替换，产出「微信信」这种污染文本，进而破坏后续匹配。
  // 单遍替换天然不会命中自己刚产出的内容。
  if (variantWords && variantWords.length) {
    // 单遍最长匹配替换。
    // 为什么不用「先替换 ASCII 再替换汉字」的两阶段做法：后一阶段会再次处理前一阶段的
    // 产出，一旦表里存在互相包含的条目（微 → 微信，而 微信 又在表里）就会级联膨胀，
    // 实测产出「微信信」这种被污染的文本，进而破坏后续匹配。单遍扫描不存在这个问题。
    const sorted = [...variantWords].sort((a, b) => b.from.length - a.from.length)
    const outChars = []
    const oMap = []
    const oEnds = []
    let i = 0
    while (i < out.length) {
      let matched = null
      for (const v of sorted) {
        if (v.from && out.startsWith(v.from, i)) { matched = v; break }
      }
      if (matched) {
        const startOrig = outMap[i] ?? 0
        const endOrig = outEnds[i + matched.from.length - 1] ?? startOrig + 1
        for (const ch of matched.to) {
          outChars.push(ch)
          oMap.push(startOrig)
          oEnds.push(endOrig)
        }
        i += matched.from.length
      } else {
        outChars.push(out[i])
        oMap.push(outMap[i])
        oEnds.push(outEnds[i])
        i++
      }
    }
    out = outChars.join('')
    outMap = oMap
    outEnds = oEnds
  }

  void prevWasFold
  return { text: out, map: outMap, end: outEnds, fold: allFold }
}

const RANK = { clean: 0, warned: 1, queued: 2, blocked: 3 }

/** 短 ASCII 关键词要求词边界，避免子串误伤 */
function asciiBoundaryOk(text, idx, len) {
  const before = idx === 0 ? '' : text[idx - 1]
  const after = text[idx + len] || ''
  if (/[a-z0-9]/.test(before)) return false
  if (/[a-z0-9]/.test(after)) return false
  return true
}

/** 收集该 needle 在 text 中的所有命中（不重叠） */
function findHits(text, needle) {
  const hits = []
  if (!needle) return hits
  let from = 0
  for (;;) {
    const idx = text.indexOf(needle, from)
    if (idx === -1) break
    from = idx + Math.max(1, needle.length)
    hits.push({ start: idx, end: idx + needle.length })
  }
  return hits
}

/** 命中区间内原文是否存在折叠间隙（即匹配跨越了标点/emoji） */
function hasFoldGap(hay, hit) {
  // 归一化后某字符的 end 与下一字符的 map 不一致，说明两者在原文里有东西被折叠掉了。
  // 注意不要用 fold 标记本身来判断：命中区间内不会包含折叠槽位，
  // 但句子末尾的标点槽位曾经导致整句被误判（见 normalize 里的注释）。
  for (let i = hit.start; i < hit.end - 1; i++) {
    if (hay.end[i] !== hay.map[i + 1]) return true
  }
  return false
}

/** 命中处是否处于白名单短语内部（完全放行） */
function inWhitelistPhrase(hay, hit, cfg) {
  for (const phrase of cfg.whitelistPatterns) {
    const from = Math.max(0, hit.start - phrase.length + 1)
    const to = Math.min(hay.text.length, hit.end + phrase.length - 1)
    if (hay.text.slice(from, to).includes(phrase)) return true
  }
  return false
}

const SENTENCE_ENDS = '。！？；!?;\n'

/** 命中处所在句子的范围（归一化文本上的下标） */
function sentenceScope(text, hit) {
  let start = 0
  for (let i = hit.start - 1; i >= 0; i--) {
    if (SENTENCE_ENDS.includes(text[i])) { start = i + 1; break }
  }
  let end = text.length
  for (let i = hit.end; i < text.length; i++) {
    if (SENTENCE_ENDS.includes(text[i])) { end = i; break }
  }
  return { start, end }
}

/**
 * 安全语境判定。
 * 分两类是因为它们的语义作用域不同（见 loadSensitiveConfig 的注释）：
 *   discourse —— 句级：「遇到代购私聊请举报」应该被豁免
 *   format    —— 邻近：只有「微信就在附近」才算交易信息，否则「违规出茄加微信」会被误豁免
 */
function inSafeContext(hay, hit, cfg) {
  if (!cfg.safeExemptors.length) return false

  const { start, end } = sentenceScope(hay.text, hit)
  // 两条约束缺一不可：
  //   1. 排除命中词本身 —— 否则关键词「自己豁免自己」
  //      （曾把 微信/加微 放进豁免表，规则命中时窗口里当然有它自己，全部漏放）
  //   2. 子句级 + 限距 —— 不跨句，豁免词必须落在命中词附近
  //      （退化成「整句出现即豁免」时，一句「审核通过」就能豁免整句交易信息）
  const from = Math.max(start, hit.start - cfg.safeWindow)
  const to = Math.min(end, hit.end + cfg.safeWindow)
  const scope = hay.text.slice(from, hit.start) + '\u0000' + hay.text.slice(hit.end, to)

  for (const word of cfg.safeExemptors) {
    if (word && scope.includes(word)) return true
  }
  return false
}

/** 否定词是否紧邻命中词之前（中间不能有别的字） */
function isNegated(hay, hit, cfg) {
  const prefix = hay.text.slice(0, hit.start)
  for (const neg of cfg.negations) {
    if (neg && prefix.endsWith(neg)) return true
  }
  // 短语形态（不提供/没有/不出…）允许出现在命中词前的短窗口内
  const from = Math.max(0, hit.start - 6)
  const window = hay.text.slice(from, hit.start)
  for (const phrase of cfg.negationPhrases) {
    if (phrase && window.includes(phrase)) return true
  }
  return false
}

/**
 * 组合规则：A 组任一命中 + B 组任一命中，且两者在 window 字符内 → 判 blocked
 *
 * 关键约束：参与组合的 A 词命中处若处于安全语境（举报/防骗…），
 * 该组合不成立。否则「遇到代购私聊请举报」会被自己的组合规则误判 ——
 * 这正是「豁免必须邻近于命中词」这条原则在组合规则上的延伸。
 *
 * @returns 命中的规则或 null
 */
function matchCompoundRule(hay, cfg) {
  for (const rule of cfg.compoundRules) {
    const aHits = []
    for (const w of rule.a) {
      for (const h of findHits(hay.text, w)) {
        if (rule.exemptInSafeContext && inSafeContext(hay, h, cfg)) continue
        aHits.push(h)
      }
    }
    if (!aHits.length) continue

    const bHits = []
    for (const w of rule.b) bHits.push(...findHits(hay.text, w))
    if (!bHits.length) continue

    const near = aHits.some((a) => bHits.some((b) => {
      const gap = a.start < b.start ? b.start - a.end : a.start - b.end
      return Math.abs(gap) <= rule.window
    }))
    if (near) return rule
  }
  return null
}

/**
 * 扫描文本
 * @returns {{ action, matched: string[], matches: Array<{keyword,action,index}>, message, blockedByCompound?: string }}
 */
export function scan(text) {
  const cfg = loadSensitiveConfig()
  const hay = normalize(text, cfg)
  const result = { action: 'clean', matched: [], matches: [], message: null }

  if (!hay.text) {
    if (cfg.warning) result.message = cfg.warning
    return result
  }

  const taken = []
  const overlaps = (s, e) => taken.some((t) => s < t.end && e > t.start)

  const record = (keyword, action, index) => {
    result.matches.push({ keyword, action, index })
    if (!result.matched.includes(keyword)) result.matched.push(keyword)
    if (RANK[action] > RANK[result.action]) result.action = action
  }

  for (const rule of cfg.rules) {
    const boundaryNeeded = /^[a-z0-9]{1,4}$/.test(rule.needle)
    for (const hit of findHits(hay.text, rule.needle)) {
      if (overlaps(hit.start, hit.end)) continue
      if (boundaryNeeded && !asciiBoundaryOk(hay.text, hit.start, rule.needle.length)) continue

      // 跨标点/emoji 命中只对红线接纳：折叠后误连的风险比漏放更高
      const gapped = hasFoldGap(hay, hit)
      if (gapped && rule.action !== 'blocked') continue

      // 完全放行的固定短语
      if (inWhitelistPhrase(hay, hit, cfg)) continue

      // 邻近性豁免。
      // 红线词**也**允许豁免，但必须落在邻近安全窗口内：
      //   · 「遇到代购私聊请举报」→ 举报在代购前 2 字 → 豁免（正当防骗讨论）
      //   · 「违规出茄加微信」    → 微信距违规 11 字，超窗 → 不豁免（违规内容）
      // 若对红线一刀切不豁免，就会把前者也误杀；早期版本正是这么错的。
      if (!gapped) {
        if (isNegated(hay, hit, cfg)) continue
        if (inSafeContext(hay, hit, cfg)) continue
      }

      taken.push({ start: hit.start, end: hit.end })
      record(rule.keyword, rule.action, hay.map[hit.start] ?? -1)
    }
  }

  // 组合规则：把「分开看都无害」的词按配置升格
  const compound = matchCompoundRule(hay, cfg)
  if (compound && RANK[compound.escalateTo] > RANK[result.action]) {
    result.action = compound.escalateTo
  }
  if (compound) {
    result.blockedByCompound = compound.name
    // matched 里补上规则名，便于运营在审核队列里定位原因
    if (!result.matched.includes(`组合:${compound.name}`)) result.matched.push(`组合:${compound.name}`)
  }

  if (result.action === 'blocked') {
    result.message = compound
      ? `内容同时出现交易意图与联系方式（${compound.name}），本站不参与任何烟草交易。`
      : `内容命中禁止交易的词：${result.matched.join('、')}。本站不参与任何烟草交易。`
  } else if (result.action === 'queued') {
    result.message = '内容命中需审核的词，将进入人工审核队列，通过后才会公开显示。'
  } else if (result.action === 'warned') {
    result.message = '内容涉及敏感话题，请注意符合社区公约。'
  }

  result.matches.sort((a, b) => a.index - b.index)
  return result
}

/** 仅供测试：清缓存 */
export function _resetCache() {
  cached = null
}

export const ACTIONS = RANK
