import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, detectVitolaFamily, FILTER_OPTIONS } from '../server/seed.js'

describe('CSV 解析', () => {
  test('基本字段与引号包裹', () => {
    const rows = parseCsv('A,B\n1,"含,逗号"\n')
    assert.deepEqual(rows, [{ A: '1', B: '含,逗号' }])
  })

  test('RFC4180 双引号转义 ""', () => {
    const rows = parseCsv('A\n"他说""你好"""\n')
    assert.equal(rows[0].A, '他说"你好"')
  })

  test('容忍非规范的 \\" 转义（上游 cigars.csv 的写法）', () => {
    const rows = parseCsv('A\n"打破了\\"必须用古巴烟叶\\"的魔咒"\n')
    assert.equal(rows[0].A, '打破了"必须用古巴烟叶"的魔咒',
      '反斜杠不应残留在文本里（页面上会显示成可见字符）')
    assert.ok(!rows[0].A.includes('\\'), '结果中不应出现反斜杠')
  })

  test('BOM 与 CRLF 处理', () => {
    const rows = parseCsv('\uFEFFA,B\r\n1,2\r\n')
    assert.deepEqual(rows, [{ A: '1', B: '2' }])
  })

  test('内嵌换行的字段', () => {
    const rows = parseCsv('A,B\n"第一行\n第二行",x\n')
    assert.equal(rows[0].A, '第一行\n第二行')
  })

  test('跳过空行，保留字段内空白以外的裁剪', () => {
    const rows = parseCsv('A,B\n\n1,2\n\n')
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0], { A: '1', B: '2' })
  })
})

describe('型号家族判定', () => {
  test('型号名优先于尺寸区间', () => {
    assert.equal(detectVitolaFamily('Robusto', 50, 5.0), 'robusto')
    assert.equal(detectVitolaFamily('Double Corona', 49, 7.6), 'double_corona')
    assert.equal(detectVitolaFamily('Wide Churchill', 55, 4.9), 'churchill')
    assert.equal(detectVitolaFamily('Petit Corona', 42, 4.5), 'petit_corona')
  })

  test('Piramides / Belicoso 归入贝利科索', () => {
    assert.equal(detectVitolaFamily('Piramides', 54, 6.3), 'belicoso')
    assert.equal(detectVitolaFamily('Belicoso', 52, 5.5), 'belicoso')
  })

  test('型号名无法识别时按环径与长度区间回退', () => {
    assert.equal(detectVitolaFamily('BHK 52', 52, 4.7), 'robusto')
    assert.equal(detectVitolaFamily('Fundadores', 40, 7.6), 'lancero')
  })

  test('完全无法判定时返回 other，不抛错', () => {
    assert.equal(detectVitolaFamily('', null, null), 'other')
    assert.equal(detectVitolaFamily(undefined, undefined, undefined), 'other')
  })
})

describe('筛选选项', () => {
  test('产地选项含古巴标记', () => {
    const cuba = FILTER_OPTIONS.origins.find((o) => o.value === 'cuba')
    assert.ok(cuba, '应包含古巴')
    assert.equal(cuba.is_cuban, true)
  })

  test('浓郁度选项为 1-5 五档', () => {
    assert.equal(FILTER_OPTIONS.strengths.length, 5)
    assert.deepEqual(FILTER_OPTIONS.strengths.map((s) => s.value), [1, 2, 3, 4, 5])
  })
})
