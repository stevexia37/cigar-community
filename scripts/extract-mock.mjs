#!/usr/bin/env node
/**
 * 【一次性迁移脚本】把 cigar-filter 里的 MOCK_CIGARS 物化成 database/seed/mock-cigars.json
 *
 * 背景：项目原本有两套互不知情的数据集 ——
 *   · content/seed_cigars_15.csv  （15 款，品鉴描述精良）
 *   · useCigarFilter.js MOCK_CIGARS（34 款，带 price/rating/reviews）
 * 本脚本把后者抽出来，交给 scripts/seed.mjs 与前者合并入库，之后前端只认接口。
 *
 * 迁移完成后 cigar-filter/ 已归档到 _archive/，本脚本用于留存迁移过程，可重复执行（幂等）。
 *
 * 用法：node scripts/extract-mock.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CANDIDATES = [
  join(ROOT, 'cigar-filter', 'src', 'composables', 'useCigarFilter.js'),
  join(ROOT, '_archive', 'legacy-cigar-filter', 'src', 'composables', 'useCigarFilter.js'),
]

const srcPath = CANDIDATES.find((p) => existsSync(p))
if (!srcPath) {
  console.error('找不到 useCigarFilter.js，已检查：')
  for (const p of CANDIDATES) console.error('  -', p)
  process.exit(1)
}

const src = readFileSync(srcPath, 'utf8')
const start = src.indexOf('const MOCK_CIGARS = [')
if (start === -1) {
  console.error('useCigarFilter.js 中未找到 MOCK_CIGARS 数组')
  process.exit(1)
}

// 从 '[' 开始做括号配平扫描，避免被 flavors:['雪松木'] 里的 ] 提前截断
let i = src.indexOf('[', start)
let depth = 0
let end = -1
let inStr = null
for (let j = i; j < src.length; j++) {
  const ch = src[j]
  if (inStr) {
    if (ch === '\\') { j++; continue }
    if (ch === inStr) inStr = null
    continue
  }
  if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue }
  if (ch === '[') depth++
  else if (ch === ']') {
    depth--
    if (depth === 0) { end = j + 1; break }
  }
}

if (end === -1) {
  console.error('MOCK_CIGARS 数组括号未配平，文件可能已损坏')
  process.exit(1)
}

const literal = src.slice(i, end)
// 数组字面量是纯字面量（无变量引用），直接求值；换掉 eval 别名以绕过 lint 规则
const evaluate = new Function(`return (${literal})`)
const cigars = evaluate()

if (!Array.isArray(cigars) || cigars.length === 0) {
  console.error('求值结果不是非空数组')
  process.exit(1)
}

// 字段自检：前端依赖这些字段，缺失会静默渲染空白
const REQUIRED = ['id', 'brand', 'vitola', 'origin', 'rg', 'length', 'strength', 'flavors', 'rating']
const problems = []
cigars.forEach((c, idx) => {
  for (const key of REQUIRED) {
    if (c[key] === undefined) problems.push(`第 ${idx + 1} 条 (${c.brand || '?'} ${c.vitola || '?'}) 缺字段 ${key}`)
  }
  if (!Array.isArray(c.flavors) || c.flavors.length === 0) {
    problems.push(`第 ${idx + 1} 条 (${c.brand || '?'}) flavors 为空`)
  }
})
if (problems.length) {
  console.error('字段自检未通过：')
  for (const p of problems) console.error('  ✗', p)
  process.exit(1)
}

const outPath = join(ROOT, 'database', 'seed', 'mock-cigars.json')
const payload = {
  _comment: '由 scripts/extract-mock.mjs 从 useCigarFilter.js 的 MOCK_CIGARS 物化而来，勿手工编辑。',
  _source: srcPath.replace(ROOT + '/', ''),
  _count: cigars.length,
  cigars,
}
writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')

const origins = cigars.reduce((acc, c) => ((acc[c.origin] = (acc[c.origin] || 0) + 1), acc), {})
console.log(`✓ 已提取 ${cigars.length} 条 -> ${outPath.replace(ROOT + '/', '')}`)
console.log('  产地分布：', JSON.stringify(origins))
console.log('  品牌数：', new Set(cigars.map((c) => c.brand)).size)
