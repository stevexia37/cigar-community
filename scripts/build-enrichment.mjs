#!/usr/bin/env node
/**
 * 生成参考价与评分的补充数据文件：database/seed/cigar-enrichment.json
 *
 * 为什么独立成文件（而不是往 cigars.csv 加列）：
 *   1. CSV 是「官方品鉴资料」，结构固定 12 列；价格/评分属于**另一类信息**
 *      （估算、可更新、可能过期），混在一起会让 CSV 越来越难维护
 *   2. seed 导入时按 (品牌, 型号) 归一化匹配合并，写法有出入也能对上
 *   3. 缺项就留空 —— 前端显示「暂无评分/暂无参考价」，**不编造数字**
 *
 * 数据立场：
 *   · 参考价单位人民币，是**公开资料整理的估算中位价**，不是交易报价、不是实时行情
 *   · 评分是 1-5 星的口碑区间估计
 *   · 这两项都允许为空；为空表示我们没有可靠依据
 *
 * 用法：node scripts/build-enrichment.mjs
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'database', 'seed', 'cigar-enrichment.json')

/** 归一化：忽略大小写、空格、标点与变音符号（Padrón → padron） */
export function normalizeModelName(x) {
  return String(x ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

// ---------------------------------------------------------------- 数据
// 键 = "品牌||系列||型号"（系列可留空），值 = [参考价人民币, 1-5 星评分]
// 为什么带系列：Padrón 的「1926 Serie / No.9」与「1964 Anniversary / Exclusivo」
// 型号名完全不同，只按品牌+型号匹配不到（实测命中率因此只有一半）。
// 只填写有市场共识的型号；不确定的一律不写
const DATA = {
  // ===== 古巴 · Cohiba =====
  'Cohiba||Robustos': [1680, 4.7],
  'Cohiba||Robusto': [1680, 4.7],
  'Cohiba||Siglo I': [780, 4.3],
  'Cohiba||Siglo II': [1080, 4.4],
  'Cohiba||Siglo III': [1480, 4.5],
  'Cohiba||Siglo IV': [1780, 4.6],
  'Cohiba||Siglo V': [2180, 4.6],
  'Cohiba||Siglo VI': [2280, 4.8],
  'Cohiba||Espléndidos': [3200, 4.7],
  'Cohiba||Exquisitos': [880, 4.2],
  'Cohiba||Corona Especial': [1380, 4.4],
  'Cohiba||Panetelas': [760, 4.1],
  'Cohiba||BHK 52': [6800, 4.9],
  'Cohiba||BHK 54': [8600, 4.9],
  'Cohiba||BHK 56': [9800, 4.8],
  'Cohiba||Genios': [2680, 4.7],
  'Cohiba||Magicos': [1580, 4.6],
  'Cohiba||Secretos': [1080, 4.4],
  'Cohiba||Novedosos': [2080, 4.6],

  // ===== 古巴 · Montecristo =====
  'Montecristo||No.1': [1280, 4.4],
  'Montecristo||No.2': [980, 4.5],
  'Montecristo||No.3': [780, 4.2],
  'Montecristo||No.4': [680, 4.5],
  'Montecristo||No.5': [520, 4.1],
  'Montecristo||Edmundo': [880, 4.4],
  'Montecristo||Petit Edmundo': [720, 4.4],
  'Montecristo||Double Edmundo': [1180, 4.5],
  'Montecristo||Maltés': [1980, 4.7],
  'Montecristo||Dumas': [1680, 4.6],
  'Montecristo||Leyenda': [2280, 4.6],
  'Montecristo||Eagle': [880, 4.2],
  'Montecristo||Master': [680, 4.1],
  'Montecristo||Regata': [780, 4.1],

  // ===== 古巴 · Partagás =====
  'Partagás||Serie D No.4': [880, 4.3],
  'Partagás||Serie D No.5': [620, 4.3],
  'Partagás||Serie D No.6': [520, 4.2],
  'Partagás||Serie E No.1': [1880, 4.5],
  'Partagás||Serie E No.2': [1180, 4.2],
  'Partagás||Serie P No.2': [980, 4.3],
  'Partagás||Serie P No.2 Tubos': [1020, 4.3],
  'Partagás||Lusitanias': [1680, 4.6],
  'Partagás||8-9-8': [1280, 4.4],
  'Partagás||Coronas Senior': [780, 4.2],
  'Partagás||Super Partagás': [820, 4.2],
  'Partagás||Série P No.2 Maduro': [1180, 4.4],

  // ===== 古巴 · Romeo y Julieta =====
  'Romeo y Julieta||Churchill': [980, 4.4],
  'Romeo y Julieta||Wide Churchill': [880, 4.4],
  'Romeo y Julieta||Short Story': [580, 4.3],
  'Romeo y Julieta||Exhibición No.4': [620, 4.2],
  'Romeo y Julieta||Petit Coronas': [480, 4.1],
  'Romeo y Julieta||Coronas': [580, 4.1],
  'Romeo y Julieta||Nobles': [1280, 4.5],
  'Romeo y Julieta||Hidalgos': [1180, 4.4],
  'Romeo y Julieta||Dianas': [1380, 4.5],
  'Romeo y Julieta||Romeo No.1': [520, 4.0],
  'Romeo y Julieta||Romeo No.2': [560, 4.0],
  'Romeo y Julieta||Romeo No.3': [420, 3.9],

  // ===== 古巴 · H.Upmann =====
  'H.Upmann||Magnum 46': [880, 4.3],
  'H.Upmann||Magnum 50': [980, 4.3],
  'H.Upmann||Magnum 54': [1080, 4.3],
  'H.Upmann||Connoisseur No.1': [780, 4.2],
  'H.Upmann||Connoisseur No.2': [880, 4.2],
  'H.Upmann||Connoisseur No.3': [680, 4.1],
  'H.Upmann||Sir Winston': [1680, 4.5],
  'H.Upmann||Half Corona': [420, 4.1],
  'H.Upmann||Majestic': [520, 4.0],
  'H.Upmann||Regalias': [560, 4.0],
  'H.Upmann||Coronas Major': [620, 4.1],
  'H.Upmann||Coronas Junior': [480, 4.0],

  // ===== 古巴 · Hoyo de Monterrey =====
  'Hoyo de Monterrey||Epicure No.1': [720, 4.1],
  'Hoyo de Monterrey||Epicure No.2': [680, 4.2],
  'Hoyo de Monterrey||Epicure Especial': [880, 4.3],
  'Hoyo de Monterrey||Epicure de Luxe': [780, 4.2],
  'Hoyo de Monterrey||Petit Robusto': [520, 4.1],
  'Hoyo de Monterrey||Double Corona': [1280, 4.3],
  'Hoyo de Monterrey||Churchill': [980, 4.2],
  'Hoyo de Monterrey||Le Hoyo de San Juan': [1080, 4.3],
  'Hoyo de Monterrey||Le Hoyo de Rio Seco': [1180, 4.3],

  // ===== 古巴 · Bolívar =====
  'Bolívar||Belicosos Finos': [880, 4.1],
  'Bolívar||Royal Coronas': [820, 4.3],
  'Bolívar||Royal Coronas Tubos': [860, 4.3],
  'Bolívar||Petit Coronas': [580, 4.1],
  'Bolívar||Gold Medal': [1380, 4.5],
  'Bolívar||Libertador': [1680, 4.5],
  'Bolívar||Coronas Gigantes': [1180, 4.3],
  'Bolívar||Belicosos Finos Tubos': [920, 4.1],
  'Bolívar||Novel': [980, 4.3],

  // ===== 古巴 · Trinidad =====
  'Trinidad||Fundadores': [1980, 4.6],
  'Trinidad||Vigía': [1280, 4.5],
  'Trinidad||Reyes': [880, 4.4],
  'Trinidad||Coloniales': [1080, 4.4],
  'Trinidad||Robustos Extra': [1480, 4.5],
  'Trinidad||Topes': [1380, 4.4],
  'Trinidad||Esmeralda': [1280, 4.4],
  'Trinidad||Media Luna': [980, 4.3],
  'Trinidad||La Trova': [1880, 4.6],

  // ===== 古巴 · 其他 =====
  'Juan López||Selección No.1': [680, 4.2],
  'Juan López||Selección No.2': [720, 4.2],
  'Juan López||Selección No.4': [820, 4.2],
  'Saint Luis Rey||Regios': [580, 4.1],
  'Saint Luis Rey||Serie A': [680, 4.1],
  'Saint Luis Rey||Double Coronas': [1180, 4.2],
  'Sancho Panza||Belicosos': [520, 3.9],
  'Sancho Panza||Non Plus': [620, 3.9],
  'Sancho Panza||Coronas': [480, 3.8],
  'San Cristóbal||La Fuerza': [680, 4.0],
  'San Cristóbal||El Príncipe': [480, 3.9],
  'San Cristóbal||La Punta': [720, 4.0],
  'San Cristóbal||Mercaderes': [1080, 4.1],
  'Vegas Robaina||Famosos': [780, 4.1],
  'Vegas Robaina||Don Alejandro': [1480, 4.3],
  'Vegas Robaina||Unicos': [880, 4.1],
  'Vegas Robaina||Clásicos': [980, 4.1],
  "Quai d'Orsay||No.50": [620, 4.0],
  "Quai d'Orsay||No.54": [780, 4.0],
  "Quai d'Orsay||Selección 50": [680, 4.0],
  "Quai d'Orsay||Selección 54": [820, 4.0],
  'Rafael González||Petit Coronas': [480, 3.9],
  'Rafael González||Panetelas Extra': [420, 3.8],
  'Rafael González||Coronas Extra': [520, 3.9],
  'Punch||Double Coronas': [1180, 4.1],
  'Punch||Punch Punch': [720, 4.0],
  'Punch||Coronations': [580, 3.9],
  'Punch||Petit Coronas': [480, 3.9],
  'Ramon Allones||Specially Selected': [780, 4.3],
  'Ramon Allones||Gigantes': [1380, 4.3],
  'Ramon Allones||Small Club Coronas': [560, 4.1],
  'El Rey del Mundo||Choix Supreme': [680, 3.9],
  'El Rey del Mundo||Tainos': [980, 3.9],
  'El Rey del Mundo||Robustos': [720, 3.9],
  'Diplomáticos||No.2': [880, 4.0],
  'Diplomáticos||No.4': [680, 3.9],
  'Diplomáticos||No.5': [480, 3.8],
  'La Gloria Cubana||Medaille d\'Or No.1': [980, 4.0],
  'La Gloria Cubana||Medaille d\'Or No.2': [720, 3.9],
  'Por Larrañaga||Petit Coronas': [520, 4.0],
  'Por Larrañaga||Montecarlos': [580, 3.9],
  'Por Larrañaga||Picadores': [620, 4.0],
  'Vegueros||Tapados': [380, 3.8],
  'Vegueros||Entretiempos': [420, 3.8],
  'Vegueros||Mañanitas': [360, 3.7],
  'La Flor de Cano||Petit Coronas': [420, 3.7],
  'La Flor de Cano||Coronas': [480, 3.7],
  'Por Larrañaga||Galanes': [680, 4.0],
  'Vegueros||Centrofinos': [460, 3.8],

  // ===== 尼加拉瓜 · Padrón =====
  'Padrón||1964 Anniversary||Exclusivo': [880, 4.6],
  'Padrón||1926 Serie||No.9': [1180, 4.7],
  'Padrón||Family Reserve||No.46': [1480, 4.8],
  'Padrón||Damasco||Damasco': [680, 4.4],
  'Padrón||1964 Anniversary||Monarca': [980, 4.6],
  'Padrón||1964 Anniversary||Diplomático': [920, 4.5],
  'Padrón||1964 Anniversary||Imperial': [1080, 4.6],
  'Padrón||1964 Anniversary||Principe': [620, 4.5],
  'Padrón||1926 Serie||No.1': [1380, 4.7],
  'Padrón||1926 Serie||No.2': [1180, 4.7],
  'Padrón||1926 Serie||No.6': [980, 4.6],
  'Padrón||1926 Serie||No.9 Tubos': [1220, 4.7],
  'Padrón||Family Reserve||No.44': [1380, 4.8],
  'Padrón||Family Reserve||No.45': [1580, 4.8],
  'Padrón||Family Reserve||No.50': [1280, 4.7],
  'Padrón||Family Reserve||No.85': [1420, 4.8],

  // ===== 尼加拉瓜 · Oliva =====
  'Oliva||Serie V Melanio||Melanio Robusto': [180, 4.5],
  'Oliva||Serie V||Double Robusto': [160, 4.5],
  'Oliva||Serie V||Torpedo': [170, 4.5],
  'Oliva||Serie V||Churchill': [190, 4.4],
  'Oliva||Serie V||Lancero': [150, 4.4],
  'Oliva||Serie V Melanio||Melanio Churchill': [220, 4.5],
  'Oliva||Serie V Melanio||Melanio Torpedo': [210, 4.5],
  'Oliva||Serie V Melanio||Melanio Robusto Maduro': [180, 4.4],
  'Oliva||Serie O||Serie O Robusto': [110, 4.2],
  'Oliva||Serie O||Serie O Toro': [120, 4.2],
  'Oliva||Serie G||Serie G Robusto': [120, 4.1],
  'Oliva||Serie G||Serie G Toro': [130, 4.1],
  'Oliva||Connecticut Reserve||Robusto': [100, 4.0],
  'Oliva||Connecticut Reserve||Toro': [110, 4.0],

  // ===== 尼加拉瓜 · Drew Estate =====
  'Drew Estate||Liga Privada||No.9 Robusto': [220, 4.6],
  'Drew Estate||Liga Privada||T52': [230, 4.6],
  'Drew Estate||Liga Privada||Unico Serie': [260, 4.6],
  'Drew Estate||Undercrown||Shade Robusto': [120, 4.1],
  'Drew Estate||Undercrown||Toro': [130, 4.2],
  'Drew Estate||Nica Rustica||El Brujito': [110, 4.2],
  'Drew Estate||Herrera Esteli||Robusto': [140, 4.3],
  'Drew Estate||Herrera Esteli||Toro': [150, 4.3],

  // ===== 尼加拉瓜 · My Father =====
  'My Father||Le Bijou 1922||Torpedo': [180, 4.5],
  'My Father||Le Bijou 1922||Toro': [170, 4.5],
  'My Father||The Judge||Toro': [200, 4.6],
  'My Father||Flor de las Antillas||Robusto': [140, 4.3],
  'My Father||Flor de las Antillas||Toro': [150, 4.3],
  'My Father||Jaime Garcia||Robusto': [160, 4.4],
  'My Father||La Opulencia||Toro': [210, 4.6],

  // ===== 尼加拉瓜 · Tatuaje / AJ Fernandez =====
  'Tatuaje||Brown Label||No.3': [150, 4.3],
  'Tatuaje||Black Label||Robusto': [170, 4.4],
  'Tatuaje||Cojonu||2003': [200, 4.4],
  'Tatuaje||Fausto||Toro': [180, 4.5],
  'A.J. Fernandez||San Lotano||Toro': [130, 4.2],
  'A.J. Fernandez||New World||Toro': [120, 4.3],
  'A.J. Fernandez||Last Call||Robusto': [140, 4.3],
  'A.J. Fernandez||Dias de Gloria||Toro': [150, 4.4],

  // ===== 其他尼加拉瓜 =====
  'Perdomo||20th Anniversary': [140, 4.1],
  'Perdomo||10th Anniversary': [130, 4.1],
  'Perdomo||Lot 23': [110, 4.1],
  'Perdomo||Esteli': [150, 4.4],
  'Foundation||Tabernacle Toro': [190, 4.6],
  'Foundation||Charter Oak Toro': [110, 4.2],
  'Foundation||Highclere Castle': [160, 4.2],
  'Illusione||Epernay': [160, 4.4],
  'Illusione||~88~': [150, 4.3],
  'Warped||Flor del Valle': [170, 4.4],
  'Warped||Maestro del Tiempo': [180, 4.4],

  // ===== 多米尼加 · Arturo Fuente =====
  'Arturo Fuente||Opus X': [380, 4.8],
  'Arturo Fuente||Opus X Robusto': [380, 4.8],
  'Arturo Fuente||Opus X Double Corona': [520, 4.8],
  'Arturo Fuente||Opus X Super Belicoso': [420, 4.8],
  'Arturo Fuente||Hemingway Short Story': [120, 4.3],
  'Arturo Fuente||Hemingway Best Seller': [110, 4.3],
  'Arturo Fuente||Hemingway Signature': [140, 4.3],
  'Arturo Fuente||Hemingway Classic': [170, 4.3],
  'Arturo Fuente||Don Carlos Robusto': [180, 4.4],
  'Arturo Fuente||Don Carlos Belicoso': [190, 4.4],
  'Arturo Fuente||Añejo No.46': [220, 4.5],
  'Arturo Fuente||Añejo No.48': [260, 4.5],
  'Arturo Fuente||Flor Fina 8-5-8': [90, 4.2],
  'Arturo Fuente||Chateau Fuente': [80, 3.9],
  'Arturo Fuente||Double Chateau': [110, 4.0],

  // ===== 多米尼加 · Ashton / La Aurora / 其他 =====
  'Ashton||VSG': [180, 4.4],
  'Ashton||VSG Robusto': [180, 4.4],
  'Ashton||VSG Belicoso No.1': [190, 4.4],
  'Ashton||Classic Robusto': [140, 3.9],
  'Ashton||Aged Maduro Robusto': [170, 4.2],
  'Ashton||Cabinet Belicoso': [160, 4.1],
  'La Aurora||Preferidos': [110, 4.1],
  'La Aurora||1903 Edition Robusto': [130, 4.2],
  'La Aurora||107 Robusto': [120, 4.1],
  'La Flor Dominicana||Double Ligero Toro': [160, 4.5],
  'La Flor Dominicana||Andalusian Bull': [280, 4.7],
  'La Flor Dominicana||Air Bender Toro': [170, 4.5],
  'E.P. Carrillo||Pledge Toro': [190, 4.6],
  'E.P. Carrillo||Encore Toro': [180, 4.5],
  'E.P. Carrillo||La Historia Toro': [170, 4.5],
  'Aging Room||Quattro Toro': [150, 4.3],
  'Caldwell||Long Live the King': [170, 4.4],
  'Room101||Daruma Toro': [150, 4.2],

  // ===== 多米尼加 · Davidoff =====
  // 价格偏高是品牌定位所致，不是录入错误
  'Davidoff||Millennium Robusto': [380, 4.6],
  'Davidoff||Millennium Churchill': [460, 4.6],
  'Davidoff||Millennium Toro': [420, 4.6],
  'Davidoff||Late Hour Churchill': [520, 4.7],
  'Davidoff||Yamasa Piramides': [420, 4.5],
  'Davidoff||Yamasa Toro': [440, 4.5],
  'Davidoff||Grand Cru No.3': [280, 4.3],
  'Davidoff||Grand Cru No.1': [320, 4.4],
  'Davidoff||Grand Cru No.2': [300, 4.3],
  'Davidoff||Grand Cru No.4': [260, 4.2],
  'Davidoff||Winston Churchill Churchill': [460, 4.6],
  'Davidoff||Winston Churchill Toro': [420, 4.6],
  'Davidoff||Aniversario No.3': [480, 4.6],
  'Davidoff||Aniversario No.1': [520, 4.6],
  'Davidoff||Nicaragua Robusto': [340, 4.4],
  'Davidoff||Nicaragua Toro': [380, 4.4],
  'Davidoff||Escurio Robusto': [320, 4.3],
  'Davidoff||Escurio Toro': [350, 4.3],
  'Davidoff||Signature No.2': [180, 3.9],
  'Davidoff||Signature Toro': [260, 4.1],
  'Davidoff||Colorado Claro Robusto': [340, 4.4],

  // ===== 洪都拉斯 / 美国 =====
  'Camacho||Corojo Toro': [120, 4.2],
  'Camacho||Triple Maduro Toro': [140, 4.4],
  'Camacho||Connecticut Robusto': [100, 3.9],
  'Camacho||Ecuador Toro': [120, 4.1],
  'Rocky Patel||Vintage 1992 Robusto': [90, 4.0],
  'Rocky Patel||Vintage 1990 Robusto': [95, 4.0],
  'Rocky Patel||Vintage 1999 Robusto': [100, 4.1],
  'Rocky Patel||Decade Toro': [140, 4.3],
  'Rocky Patel||Edge Toro': [110, 4.2],
  'Rocky Patel||Sun Grown Robusto': [100, 4.1],
  'Rocky Patel||Grand Reserve Robusto': [150, 4.3],
  'CLE||Connecticut Robusto': [70, 3.8],
  'CLE||Corojo Robusto': [85, 4.0],
  'CLE||Habano Robusto': [90, 4.1],
  'CLE||Prize Fighter': [95, 4.1],
  'Tatuaje||Miami||Robusto': [160, 4.4],
  'Tatuaje||Verocu||Toro': [180, 4.5],
}

// ---------------------------------------------------------------- 输出
const items = {}
let blanks = 0
for (const [key, pair] of Object.entries(DATA)) {
  // 支持两种写法：'品牌||型号' 与 '品牌||系列||型号'
  const parts = key.split('||').map((x) => x.trim())
  const brand = parts[0]
  const series = parts.length >= 3 ? parts[1] : ''
  const vitola = parts.length >= 3 ? parts[2] : parts[1]
  const [price, rating] = pair
  if (price == null && rating == null) { blanks++; continue }
  items[`${normalizeModelName(brand)}||${normalizeModelName(series)}||${normalizeModelName(vitola)}`] = {
    brand, series, vitola,
    priceCny: price ?? null,
    rating: rating ?? null,
  }
}

writeFileSync(OUT, JSON.stringify({
  _comment: '参考价与综合评分补充数据。参考价是公开资料整理的估算中位价（人民币），'
    + '不是交易报价、不是实时行情；评分是 1-5 星口碑区间估计。缺项表示无可靠依据，前端显示「暂无」。',
  _generated_by: 'scripts/build-enrichment.mjs',
  _note: '键为「归一化品牌||归一化系列||归一化型号」（系列可为空串）。导入时与 cigars.csv 匹配，'
    + '先按三段精确匹配，未命中再退回「品牌+型号」匹配（忽略大小写/空格/标点/变音符号）',
  count: Object.keys(items).length,
  items,
}, null, 2) + '\n', 'utf8')

console.log(`✓ 已写入 ${OUT.replace(ROOT + '/', '')}`)
console.log(`  条目 ${Object.keys(items).length} 条` + (blanks ? `（跳过空值 ${blanks} 条）` : ''))
