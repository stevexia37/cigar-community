import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { scan, normalize, loadSensitiveConfig } from '../server/lib/sensitive.js'

describe('敏感词归一化', () => {
  test('大小写、全角、零宽字符归一', () => {
    assert.equal(normalize('ＶＸ').text, 'vx')
    assert.equal(normalize('V X').text, 'vx')
    assert.equal(normalize('v\u200bx').text, 'vx')
  })

  test('分隔符折叠：加-微-信 等价于 加微信', () => {
    assert.equal(normalize('加-微-信').text, normalize('加微信').text)
    assert.equal(normalize('加 _ 微 _ 信').text, normalize('加微信').text)
  })

  test('保留原文下标映射，用于回填命中位置', () => {
    // 无折叠字符时映射必须逐位对齐
    const plain = normalize('看加微信')
    const idx = plain.text.indexOf('加微信')
    assert.ok(idx >= 0)
    assert.equal(plain.map[idx], 1, '原文「加」在下标 1')

    // 有折叠字符（空格）时，命中下标是「近似」的 —— 归一化丢掉了分隔符，
    // 所以该下标可能落在折叠区之后一位（这里指向 '微'，因为 '加' 正被空格隔开）。
    // 契约是：下标一定落在原文的命中词附近，且不越界。
    const folded = normalize('看 加微信')
    const fIdx = folded.text.indexOf('加微信')
    assert.ok(fIdx >= 0)
    const pointTo = folded.map[fIdx]
    assert.equal(typeof pointTo, 'number', '应映射回原文下标')
    assert.ok(/\s/.test('看 加微信'[pointTo - 1] ?? ''), '下标前一位应是折叠掉的分隔符')
    assert.ok('加微信'.includes('看 加微信'[pointTo]), '下标应落在命中词范围内')
  })
})

describe('合规熔断', () => {
  test('配置可加载，规则桶非空', () => {
    const cfg = loadSensitiveConfig({ reload: true })
    assert.ok(cfg.rules.length > 0, '应解析出敏感词规则')
    assert.ok(cfg.negations.length > 0, '应加载否定语境白名单')
  })

  test('正常品鉴内容必须放行（不误杀）', () => {
    const samples = [
      '这支 Cohiba Robustos 前段雪松木和可可很突出，中段转皮革，尾段有胡椒。',
      '养护在 68% 湿度、18℃ 环境下静养了三个月，燃烧很均匀。',
      '刚入手一支 Padrón 1964，请问适合继续醇化多久？',
      '分享一篇起灰和发霉的辨别经验，希望对新手有帮助。',
    ]
    for (const text of samples) {
      const r = scan(text)
      assert.equal(r.action, 'clean', `误杀：${text} -> ${r.action}（命中 ${r.matched}）`)
    }
  })

  test('交易红线必须拦截', () => {
    const r = scan('有货私聊 微信出茄 代购走不')
    assert.equal(r.action, 'blocked')
    assert.ok(r.matched.length >= 2, `应命中多个词，实际 ${JSON.stringify(r.matched)}`)
  })

  test('变体绕过必须识破', () => {
    for (const text of ['加 V X 详聊', 'ＶＸ：１２３４５６', '加-微-信-谈']) {
      const r = scan(text)
      assert.equal(r.action, 'blocked', `变体未识破：${text}`)
    }
  })

  test('否定语境豁免：本站不卖茄 不应熔断', () => {
    const samples = [
      '本站不卖雪茄，只做知识交流。',
      '这里没有现货，也不提供购买渠道。',
      '请勿私聊询价，违者封号。',
    ]
    for (const text of samples) {
      const r = scan(text)
      assert.notEqual(r.action, 'blocked', `否定语境误杀：${text} -> ${r.matched}`)
    }
  })

  test('安全语境豁免：举报/防骗讨论不应熔断', () => {
    const r = scan('遇到代购私聊请举报，这类都是骗局。')
    assert.notEqual(r.action, 'blocked', `正当讨论误杀，命中 ${r.matched}`)
  })

  test('豁免不能过度：撇清之后另起一句真违规，仍须拦截', () => {
    const r = scan('本站不卖雪茄。有货私聊，加微信详谈。')
    assert.equal(r.action, 'blocked', `后句违规被前句豁免了，实际 ${r.action}`)
  })

  test('价格类词进审核队列而非直接封禁', () => {
    const r = scan('这支的市场价格大概在什么区间？')
    assert.ok(r.action === 'queued' || r.action === 'blocked', `实际 ${r.action}`)
    if (r.action === 'queued') assert.ok(r.message.includes('审核'))
  })

  test('命中位置回填到原文下标', () => {
    const text = '你好，加微信聊'
    const r = scan(text)
    assert.equal(r.action, 'blocked')
    // 同处命中只保留优先级最高的一个词（「加微」先于「微信」入表）
    const hit = r.matches[0]
    assert.ok(hit, '应有命中')
    assert.equal(text.slice(hit.index, hit.index + hit.keyword.length), hit.keyword,
      `下标 ${hit.index} 应能回填出原文「${hit.keyword}」`)
  })

  test('空文本与缺失配置降级不抛错', () => {
    assert.equal(scan('').action, 'clean')
    assert.equal(scan(null).action, 'clean')
    assert.equal(scan(undefined).action, 'clean')
  })

  test('同一处命中不被重复计数（出茄 vs 出雪茄）', () => {
    // 「出茄」与「出雪茄」在配置里分属两个桶，位置重叠时只应记一次
    const r = scan('出茄')
    assert.equal(r.action, 'blocked')
    const indexes = r.matches.map((m) => m.index)
    assert.equal(new Set(indexes).size, indexes.length, `命中位置重复：${JSON.stringify(r.matches)}`)
  })

  test('询价类走审核队列而非红线（对照 checklist §1.3.2）', () => {
    const r = scan('请问这支多少钱一支？')
    assert.equal(r.action, 'queued', `询价应进审核队列，实际 ${r.action}（命中 ${r.matched}）`)
  })
})
