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
    assert.equal(detectVitolaFamily('Panetelas', 36, 5.0), 'panatela')
  })

  test('锥形型号靠名字判定（尺寸区间会误判）', () => {
    // 锥形的尺寸与罗布图/科罗娜重叠，只能靠名字：
    // Piramides 54×6.3 若靠区间会落进罗布图，实测曾把 107 款误判成贝利科索
    assert.equal(detectVitolaFamily('Piramides', 54, 6.3), 'belicoso')
    assert.equal(detectVitolaFamily('Belicoso', 52, 5.5), 'belicoso')
    assert.equal(detectVitolaFamily('Torpedo', 56, 6.0), 'belicoso')
    assert.equal(detectVitolaFamily('Chisel', 54, 6.0), 'belicoso')
  })

  test('长矛必须先于双科罗娜判定（Fundadores 40×7.6）', () => {
    // 40 环 × 7.6 同时满足双科罗娜的长度条件，顺序错了就会误判
    assert.equal(detectVitolaFamily('Fundadores', 40, 7.6), 'lancero')
    assert.equal(detectVitolaFamily('Lancero', 38, 7.5), 'lancero')
  })

  test('名字不含家族词但分类明确的特例', () => {
    assert.equal(detectVitolaFamily('Siglo VI', 52, 5.9), 'robusto')   // Cannazo，业界归罗布图
    assert.equal(detectVitolaFamily('BHK 52', 52, 4.7), 'robusto')
    assert.equal(detectVitolaFamily('Exclusivo', 50, 5.5), 'robusto')
  })

  test('Toro 等通称按尺寸落位', () => {
    assert.equal(detectVitolaFamily('Toro', 52, 6.0), 'robusto')
    assert.equal(detectVitolaFamily('Toro Gordo', 56, 6.5), 'gordo')
    assert.equal(detectVitolaFamily('Gordo', 60, 6.0), 'gordo')
  })

  test('No.2（52×6.1）落在罗布图/科罗娜边界，接受按长度归类', () => {
    // 这个尺寸确实两可：Cuban No.2 的鱼雷版是 Piramides（靠名字走 belicoso），
    // 而纯数字型号只能按尺寸落位，本实现按长度归入 robusto。记录此模糊性，
    // 避免日后有人「修复」成另一种又把它改回去。
    assert.ok(['robusto', 'corona'].includes(detectVitolaFamily('No.2', 52, 6.1)))
  })

  test('尺寸缺失或不合法时返回 other，不得落进最短档', () => {
    assert.equal(detectVitolaFamily('', null, null), 'other')
    assert.equal(detectVitolaFamily(undefined, undefined, undefined), 'other')
    assert.equal(detectVitolaFamily('X', 0, 0), 'other')
    assert.equal(detectVitolaFamily('X', 'abc', 5), 'other')
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
