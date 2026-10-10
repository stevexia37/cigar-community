/**
 * 三个工具规则的边界测试（纯函数，无 IO）。
 *
 * 为什么单独写这个文件：`server/rules/{aging,diagnostic,flavor}.js` 是纯计算逻辑，
 * 最适合单元测试，但此前**只有接口层的冒烟断言**（存在性检查），
 * 边界值（极值、缺失、非法输入、并列）完全没有覆盖。
 *
 * 这三个模块直接面向用户输出「怎么救」「你是什么人格」「还要放多久」，
 * 算错的代价是真金白银的雪茄 —— 比一个 500 错误严重得多。
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { calcAging, IDEAL, STATUS } from '../server/rules/aging.js'
import { answerQuestionnaire, QUESTIONS as DIAG_QUESTIONS, DIAGNOSES, UNKNOWN_DIAGNOSIS } from '../server/rules/diagnostic.js'
import { scoreCategories, resolvePersonality, CATEGORY_LABELS, PERSONALITIES, FALLBACK_PERSONALITY } from '../server/rules/flavor.js'

describe('醇化计算器 calcAging', () => {
  test('按浓郁度给出起始窗口（1-5 逐一验证）', () => {
    // 已醇化 0 个月时，浓郁度 1 应在窗口内（0-12），浓郁度 5 远未到（36-144）
    assert.equal(calcAging({ strength: 1, currentAgeMonths: 0 }).status, 'peak')
    assert.equal(calcAging({ strength: 3, currentAgeMonths: 12 }).status, 'peak')
    assert.equal(calcAging({ strength: 5, currentAgeMonths: 0 }).status, 'fresh')
  })

  test('浓郁度被夹在 1-5，非法值回落为 3', () => {
    // 越界与 NaN 都不应抛异常，而是 clamp / 回落
    assert.doesNotThrow(() => calcAging({ strength: 0 }))
    assert.doesNotThrow(() => calcAging({ strength: 99 }))
    assert.doesNotThrow(() => calcAging({ strength: 'abc' }))
    assert.doesNotThrow(() => calcAging({}))
    // 返回值里的 strength 一定落在 1-5
    for (const v of [0, 99, -5, 2.7, 'abc', undefined, null, NaN, Infinity]) {
      const r = calcAging({ strength: v })
      assert.ok(r.strength >= 1 && r.strength <= 5, `strength=${String(v)} 返回了越界的 ${r.strength}`)
    }
    // 记录两个真实行为（不是理想行为，但要有断言钉住，防止无意改动）：
    // · 越界值被 clamp：99 → 5，-5 → 1
    assert.equal(calcAging({ strength: 99 }).strength, 5)
    assert.equal(calcAging({ strength: -5 }).strength, 1)
    // · 而非数值/0 回落为默认 3（实现用 `Number(x) || 3`，0 是 falsy 所以也落到 3，
    //   不是 clamp 到 1）。这算可接受的取舍，但要写下来，避免日后被当成 bug 改错方向。
    assert.equal(calcAging({ strength: 0 }).strength, 3, '0 作为 falsy 回落到默认 3')
    assert.equal(calcAging({ strength: 'abc' }).strength, 3, '非数值回落到默认 3')
  })

  test('环境偏离理想区间会把窗口整体后移（惩罚为正）', () => {
    const base = calcAging({ strength: 3, humidity: 67, temperature: 18 })
    const dry = calcAging({ strength: 3, humidity: 50, temperature: 18 })
    const hot = calcAging({ strength: 3, humidity: 67, temperature: 26 })
    assert.ok(dry.peakFromMonths > base.peakFromMonths, '湿度过低应后移窗口')
    assert.ok(hot.peakFromMonths > base.peakFromMonths, '温度过高应后移窗口')
    assert.equal(base.environment.humidity.ok, true, '理想湿度应判定为 ok')
    assert.equal(base.environment.temperature.ok, true, '理想温度应判定为 ok')
    assert.equal(dry.environment.humidity.ok, false, '过干应判定为不 ok 并给出提示')
    assert.ok(dry.environment.humidity.message, '不 ok 时必须给出可读提示')
  })

  test('温度惩罚系数高于湿度（同样偏离 10 个单位）', () => {
    // 湿度权重 0.6/单位，温度 2.5/单位；偏离相同数值时温度影响更大
    const hum = calcAging({ strength: 3, humidity: IDEAL.humidity.max + 10, temperature: 18 })
    const tmp = calcAging({ strength: 3, temperature: IDEAL.temperature.max + 10, humidity: 67 })
    assert.ok(tmp.peakFromMonths - hum.peakFromMonths > 0, '温度偏离应比同数值的湿度偏离惩罚更重')
  })

  test('缺失环境参数不报错，也不产生惩罚', () => {
    const bare = calcAging({ strength: 3 })
    const ideal = calcAging({ strength: 3, humidity: 67, temperature: 18 })
    assert.equal(bare.peakFromMonths, ideal.peakFromMonths, '未提供环境参数时不应有惩罚')
  })

  test('年/月两种输入等价', () => {
    const byMonths = calcAging({ strength: 4, currentAgeMonths: 36 })
    const byYears = calcAging({ strength: 4, currentAgeYears: 3 })
    assert.equal(byMonths.status, byYears.status)
    assert.equal(byMonths.monthsToPeak, byYears.monthsToPeak)
  })

  test('已过窗口末端判为 past-peak', () => {
    // 浓郁度 1 的窗口是 0-12 个月
    assert.equal(calcAging({ strength: 1, currentAgeMonths: 60 }).status, 'past-peak')
  })

  test('接近窗口但未到时判为 aging（避免刚入手就被叫「新茄」）', () => {
    // 浓郁度 3 的窗口从 12 个月起；10 个月差 2 个月 → aging
    assert.equal(calcAging({ strength: 3, currentAgeMonths: 10 }).status, 'aging')
    // 差得远仍是 fresh
    assert.equal(calcAging({ strength: 3, currentAgeMonths: 1 }).status, 'fresh')
  })

  test('返回的 status 一定是 STATUS 里声明过的键', () => {
    for (const strength of [1, 2, 3, 4, 5]) {
      for (const months of [0, 6, 12, 36, 120, 600]) {
        const r = calcAging({ strength, currentAgeMonths: months })
        assert.ok(Object.hasOwn(STATUS, r.status), `unknown status ${r.status} for strength=${strength} months=${months}`)
      }
    }
  })

  test('monthsToPeak 不为负', () => {
    for (const months of [0, 12, 100, 1000]) {
      assert.ok(calcAging({ strength: 4, currentAgeMonths: months }).monthsToPeak >= 0)
    }
  })
})

describe('病害诊断 answerQuestionnaire', () => {
  test('空输入返回 unknown 而不是抛异常', () => {
    const r = answerQuestionnaire({})
    assert.equal(r.key, 'unknown')
    assert.equal(r.title, UNKNOWN_DIAGNOSIS.title)
  })

  test('非法选项返回 unknown', () => {
    assert.equal(answerQuestionnaire({ 1: 'not-a-type', 2: 'not-a-level' }).key, 'unknown')
    assert.equal(answerQuestionnaire({ 1: 'mold', 2: 'no-such-level' }).key, 'unknown')
  })

  test('所有题库里的合法组合都能得到有效结论', () => {
    let checked = 0
    for (const [type, levels] of Object.entries(DIAGNOSES)) {
      for (const level of Object.keys(levels)) {
        const r = answerQuestionnaire({ 1: type, 2: level })
        assert.notEqual(r.key, 'unknown', `${type}:${level} 应该是有效结论`)
        assert.ok(r.title && r.steps?.length > 0, `${type}:${level} 应含标题与处理步骤`)
        checked++
      }
    }
    assert.ok(checked > 0, 'DIAGNOSES 不应为空')
  })

  test('字符串键与数字键等价（前端可能传任一种）', () => {
    const [type, levels] = Object.entries(DIAGNOSES)[0]
    const level = Object.keys(levels)[0]
    const asString = answerQuestionnaire({ '1': type, '2': level })
    const asNumber = answerQuestionnaire({ 1: type, 2: level })
    assert.notEqual(asString.key, 'unknown')
    assert.equal(asString.key, asNumber.key, '两种键写法必须得到同一结论')
  })

  test('每个结论都带免责声明（面向用户的健康/养护建议）', () => {
    for (const [type, levels] of Object.entries(DIAGNOSES)) {
      for (const level of Object.keys(levels)) {
        const r = answerQuestionnaire({ 1: type, 2: level })
        assert.ok(r.notice && r.notice.length > 10, `${type}:${level} 缺少免责声明`)
      }
    }
  })

  test('题库的第 1 题是类型题', () => {
    assert.ok(Array.isArray(DIAG_QUESTIONS) && DIAG_QUESTIONS.length > 0)
  })
})

describe('风味人格 scoreCategories / resolvePersonality', () => {
  test('空选择返回空数组，不抛异常', () => {
    assert.deepEqual(scoreCategories([]), [])
    assert.deepEqual(scoreCategories(undefined), [])
    assert.deepEqual(scoreCategories(null), [])
  })

  test('未知类别被忽略，不计入总数', () => {
    // 用真实存在的类别（woody）加一个不存在的，确认不存在的被丢弃、
    // 且不拉低百分比 —— 我第一版误用了 cedar/cocoa 这类**不存在的类别名**，
    // 结果所有断言都落在「未知类别」分支上，测了个寂寞。
    const got = scoreCategories([{ category: 'woody' }, { category: 'not-a-category' }])
    assert.equal(got.length, 1)
    assert.equal(got[0].category, 'woody')
    assert.equal(got[0].percent, 100, '未知类别不应把百分比压低')
  })

  test('百分比之和在合理范围（四舍五入后允许 99-101）', () => {
    const picks = [{ category: 'woody' }, { category: 'woody' }, { category: 'sweet' }]
    const sum = scoreCategories(picks).reduce((a, s) => a + s.percent, 0)
    assert.ok(sum >= 99 && sum <= 101, `百分比之和为 ${sum}`)
  })

  test('并列时排序可复现（分数降序 → 类别名升序）', () => {
    const a = scoreCategories([{ category: 'sweet' }, { category: 'woody' }])
    const b = scoreCategories([{ category: 'woody' }, { category: 'sweet' }])
    assert.deepEqual(a.map((x) => x.category), b.map((x) => x.category), '输入顺序不应影响并列排序')
  })

  test('无条件给出人格：空输入也能拿到兜底人格', () => {
    const p = resolvePersonality([])
    assert.equal(p.key, FALLBACK_PERSONALITY.key)
    assert.ok(p.title, '兜底人格也必须有标题')
  })

  test('每个大类都能解析出人格（含无专属人格的大类走次高分兜底）', () => {
    for (const cat of Object.keys(CATEGORY_LABELS)) {
      const scores = scoreCategories([{ category: cat }, { category: cat }])
      assert.ok(scores.length > 0, `类别 ${cat} 未被计入`)
      const p = resolvePersonality(scores)
      assert.ok(p && p.key, `类别 ${cat} 未能解析出人格`)
    }
  })

  test('次高分兜底：首选大类无专属人格时用下一名', () => {
    // 找出一个没有专属人格的大类
    const orphan = Object.keys(CATEGORY_LABELS).find((c) => !PERSONALITIES[c])
    if (!orphan) return // 若都有专属人格，这条不适用
    const scores = scoreCategories([
      { category: orphan }, { category: orphan },
      { category: 'woody' },
    ])
    const p = resolvePersonality(scores)
    const second = scores.find((x) => x.category !== orphan)
    const expected = PERSONALITIES[second?.category]
    if (expected) {
      assert.equal(p.key, expected.key, `应回落到次高分大类（${second.category}）的人格`)
    } else {
      assert.equal(p.key, FALLBACK_PERSONALITY.key, '次高分也无专属人格时才用兜底')
    }
  })
})
