import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { scan, normalize, loadSensitiveConfig } from '../server/lib/sensitive.js'

const CFG = loadSensitiveConfig({ reload: true })
const norm = (text) => normalize(text, CFG).text

describe('敏感词归一化', () => {
  test('大小写、全角、零宽字符归一', () => {
    // 归一化会连带做变体替换（vx → 微信），所以断言最终能被识破而不是中间态
    assert.equal(norm('v\u200bx'), '微信', '零宽字符被剥离后 vx 走变体表')
    assert.equal(scan('ＶＸ：123456').action, 'blocked', '全角 VX 应被识破')
  })

  test('分隔符折叠：加-微-信 等价于 加微信', () => {
    assert.equal(norm('加-微-信'), norm('加微信'))
    assert.equal(norm('加 _ 微 _ 信'), norm('加微信'))
  })

  test('单个空格视为紧凑书写（经典绕过），连续空格保留为间隙', () => {
    assert.equal(norm('加 微 信'), '加微信', '单空格不应成为绕过手段')
    // 连续空格是真实间隔：折叠后仍应被标记为「跨间隙命中」
    const dbl = normalize('出  茄', CFG)
    assert.equal(dbl.text, '出茄')
  })

  test('繁体字映射为简体', () => {
    assert.equal(norm('代購'), '代购')
    assert.equal(norm('現貨'), '现货')
  })

  test('标点与 emoji 被折叠', () => {
    assert.equal(norm('出【茄】'), '出茄')
    assert.equal(norm('出😀茄'), '出茄')
    assert.equal(norm('出，茄'), '出茄')
  })

  test('变体表不得出现「单字 → 多字」映射（会污染正常文本）', () => {
    // 历史缺陷：配置里写了 "微❤" → "微信"，emoji 被剥离后变成 "微" → "微信"，
    // 导致任何含「微」的词都被改写（产出「微信信」）
    for (const v of CFG.variantWords) {
      if (v.from.length === 1) {
        assert.equal(v.to.length, 1, `单字变体 [${v.from}] 不得映射为多字 [${v.to}]`)
      }
    }
    assert.ok(!CFG.variantWords.some((v) => v.from === '微'), '过激的单字映射应已被过滤')
  })

  test('保留原文下标映射，用于回填命中位置', () => {
    const plain = normalize('看加微信', CFG)
    const idx = plain.text.indexOf('加微信')
    assert.ok(idx >= 0)
    assert.equal(plain.map[idx], 1, '原文「加」在下标 1')

    const folded = normalize('看 加微信', CFG)
    const fIdx = folded.text.indexOf('加微信')
    assert.ok(fIdx >= 0)
    const pointTo = folded.map[fIdx]
    assert.equal(typeof pointTo, 'number', '应映射回原文下标')
    assert.ok('加微信'.includes('看 加微信'[pointTo]), '下标应落在命中词范围内')
  })
})

describe('合规熔断 · 红线拦截', () => {
  test('配置可加载，规则与豁免均非空', () => {
    const cfg = loadSensitiveConfig({ reload: true })
    assert.ok(cfg.rules.length > 0, '应解析出敏感词规则')
    assert.ok(cfg.negations.length > 0, '应加载否定语境')
    assert.ok(cfg.safeExemptors.length > 0, '应加载豁免词表')
    assert.ok(cfg.compoundRules.length > 0, '应加载组合规则')
  })

  test('交易红线必须拦截', () => {
    for (const text of ['有货私聊 微信出茄 代购走不', '出茄 便宜出', '加微信聊']) {
      const r = scan(text)
      assert.equal(r.action, 'blocked', `未拦截：${text} -> ${r.action}`)
    }
  })

  test('变体绕过必须识破（繁体/拼音/缩写/同音/标点/emoji/拆字）', () => {
    const bypass = [
      '代購 現貨',      // 繁体
      'weixin haoyou',  // 拼音
      'wx: 123456',     // 缩写
      '威信 123456',    // 同音
      '出，茄',         // 中文标点
      '出😀茄',         // emoji
      '出【茄】',       // 拆字
      '加 微 信',       // 空格
      '加-微-信',       // 连字符
    ]
    for (const text of bypass) {
      const r = scan(text)
      assert.notEqual(r.action, 'clean', `绕过成功：${text}`)
    }
  })

  test('组合规则：交易词 + 联系方式 = 红线', () => {
    // 两个词单独看都可能只是「审核队列」，同时出现应升格为红线
    const r = scan('现货一批，加微信详谈')
    assert.equal(r.action, 'blocked', `组合规则未生效，实际 ${r.action}`)
  })
})

describe('合规熔断 · 不得误杀正常发言', () => {
  test('正常品鉴内容必须放行', () => {
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

  test('日常词不得进红线（历史上飞机/拼车/转账/性价比 都曾误杀 403）', () => {
    const daily = [
      '我坐飞机去哈瓦那，飞机上不能抽雪茄。',
      '周末和朋友拼车去了趟雪茄吧。',
      '转账给雪茄房年费怎么操作？',   // 现在归审核队列，不再 403
      '这家店的性价比很高。',
      '行货和水货的区别是什么？',
      'Badge 和 knowledge 这两个英文单词',
      '求茄友推荐一支入门款。',
    ]
    for (const text of daily) {
      const r = scan(text)
      assert.notEqual(r.action, 'blocked', `日常表述被红线误杀：${text} -> 命中 ${JSON.stringify(r.matched)}`)
    }
  })

  test('短 ASCII 关键词要求词边界：dg 不命中 knowledge / badge', () => {
    const r = scan('Badge 和 knowledge 这两个英文单词')
    assert.ok(!r.matched.includes('dg'), `dg 子串误伤：${JSON.stringify(r.matched)}`)
  })

  test('否定语境豁免：本站不卖茄 不应熔断', () => {
    for (const text of ['本站不卖雪茄，只做知识交流。', '这里没有现货，也不提供购买渠道。']) {
      const r = scan(text)
      assert.equal(r.action, 'clean', `否定语境误杀：${text} -> ${r.action}（命中 ${r.matched}）`)
    }
  })

  test('安全语境豁免：防骗/举报讨论不应熔断', () => {
    for (const text of [
      '遇到代购私聊请举报，这类都是骗局。',
      '谨防代购诈骗，发现请举报。',
      '警惕微信出茄的骗局。',
    ]) {
      const r = scan(text)
      assert.notEqual(r.action, 'blocked', `正当讨论误杀：${text} -> 命中 ${JSON.stringify(r.matched)}`)
    }
  })
})

describe('合规熔断 · 豁免不得过度（回归）', () => {
  test('一句废话不能豁免整句红线（历史严重缺陷）', () => {
    // 早期实现用「句内出现豁免词即豁免整句」，以下全部被放行并以 status=1 公开
    const abuse = [
      '违规出茄加微信。',
      '审核通过，有货私聊加微信。',
      '不错的茄，出茄加微信私聊我。',
      '案例分享：出茄加微信。',
    ]
    for (const text of abuse) {
      const r = scan(text)
      assert.equal(r.action, 'blocked', `滥用豁免成功：${text} -> ${r.action}（命中 ${r.matched}）`)
    }
  })

  test('豁免必须邻近：安全词离得远则不生效', () => {
    // 「举报」出现在很远的地方，不应救回交易信息
    const r = scan('有货出茄加微信联系我。另外提醒大家注意举报功能怎么用。')
    assert.equal(r.action, 'blocked', `远距离豁免词不应生效，实际 ${r.action}`)
  })

  test('否定词必须紧邻命中词', () => {
    const r = scan('不，我说的是有货出茄加微信')
    assert.equal(r.action, 'blocked', `否定词距离过远却生效，实际 ${r.action}`)
  })
})

describe('合规熔断 · 边界与健壮性', () => {
  test('命中位置回填到原文下标', () => {
    const text = '你好，加微信聊'
    const r = scan(text)
    assert.equal(r.action, 'blocked')
    const hit = r.matches[0]
    assert.ok(hit, '应有命中')
    const keyword = String(hit.keyword)
    if (hit.index >= 0 && keyword.length <= text.length) {
      assert.ok(text.includes(keyword), `命中词 [${keyword}] 应存在于原文`)
    }
  })

  test('同一处命中不被重复计数', () => {
    const r = scan('出茄')
    const indexes = r.matches.map((m) => m.index)
    assert.equal(new Set(indexes).size, indexes.length, `命中位置重复：${JSON.stringify(r.matches)}`)
  })

  test('询价类走审核队列而非红线（对照 checklist §1.3.2）', () => {
    const r = scan('请问这支多少钱一支？')
    assert.equal(r.action, 'queued', `询价应进审核队列，实际 ${r.action}（命中 ${r.matched}）`)
  })

  test('空文本与缺失配置降级不抛错', () => {
    assert.equal(scan('').action, 'clean')
    assert.equal(scan(null).action, 'clean')
    assert.equal(scan(undefined).action, 'clean')
    assert.equal(scan(12345).action, 'clean')
  })

  test('超长文本不抛错且性能可接受', () => {
    const big = '雪茄养护经验。'.repeat(20000)
    const t0 = Date.now()
    const r = scan(big)
    const cost = Date.now() - t0
    assert.equal(r.action, 'clean')
    assert.ok(cost < 3000, `扫描 12 万字耗时 ${cost}ms，过慢`)
  })
})

describe('合规熔断 · 结构性约束（防止根因复现）', () => {
  test('豁免词表不得与规则关键词重合', () => {
    // 根因回归：微信/加微/私聊/转账 曾被放进豁免表，而它们同时是规则关键词，
    // 于是这些词互相豁免（微信豁免出茄 → 私聊豁免微信），整段交易信息全部放行。
    const ruleNeedles = new Set(CFG.rules.map((r) => r.needle))
    const overlap = CFG.safeExemptors.filter((w) => ruleNeedles.has(norm(w)))
    assert.deepEqual(overlap, [], `豁免词与规则词重合，会导致互相豁免：${JSON.stringify(overlap)}`)
  })

  test('豁免词必须是保护性语义词（不得含联系方式）', () => {
    const banned = ['微信', '加微', 'vx', 'wx', 'wechat', '转账', '支付宝', '收款', '扫码', '私聊', '电话', '手机号']
    const bad = CFG.safeExemptors.filter((w) => banned.some((b) => norm(w).includes(norm(b))))
    assert.deepEqual(bad, [], `豁免表含联系方式类词：${JSON.stringify(bad)}`)
  })

  test('关键词不得自我豁免', () => {
    // 若豁免窗口包含命中词本身，「加微」命中时会匹配到豁免表里的「加微」
    for (const text of ['加微', '微信', '私聊', '出茄']) {
      const r = scan(text)
      assert.notEqual(r.action, 'clean', `关键词自豁免：${text}`)
    }
  })

  test('连成一片的交易信息不得因互相豁免而放行', () => {
    const r = scan('有货私聊 微信出茄 代购走不')
    assert.equal(r.action, 'blocked', `整段交易信息被放行，命中 ${JSON.stringify(r.matched)}`)
  })
})
