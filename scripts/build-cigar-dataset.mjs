#!/usr/bin/env node
/**
 * 【一次性数据扩充脚本】把内置的雪茄资料库写进 database/seed/cigars.csv
 *
 * 为什么用脚本而不是手写 CSV：
 *   CSV 里描述含中文逗号与引号，手写极易错位。这里把「每款一行」的紧凑写法
 *   转成规范 CSV（引号包裹 + "" 转义），避免人工维护引号。
 *
 * 数据立场（重要）：
 *   · 这些是**公开资料整理的参考信息**，价格是估算区间，不是交易报价
 *   · 品鉴描述为站点自撰，用于展示字段，不复制任何商业文案
 *   · 风味标签使用 flavors 字典内的标准词（中文），导入时自动映射
 *
 * 用法：node scripts/build-cigar-dataset.mjs
 *      → 覆盖写 database/seed/cigars.csv（原有内容会并入，去重后输出）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV_PATH = join(ROOT, 'database', 'seed', 'cigars.csv')

// ---------------------------------------------------------------- 现有数据
/** 解析现有 CSV，保留其中每一行（避免扩充时丢掉原始资料） */
function parseExisting(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '\\' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const header = rows.shift().map((h) => h.trim())
  return rows
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

// ---------------------------------------------------------------- 扩充数据
// 格式：
//   品牌|系列|型号|长度(英寸)|环径|产地|茄衣|茄套|茄芯|浓郁度1-5|风味|描述
//
// 关于「参考价」与「综合评分」（重要，别误解）：
//   · 参考价是**公开资料整理的估算区间中位价**（人民币），只作为站内参考，
//     既不是交易报价也不是实时行情。留空表示我们没有可靠依据，**不编造数字**。
//   · 综合评分是 1-5 星的口碑区间估计，同样留空表示无依据。
//   · 宁可留空让前端显示「暂无评分」，也不要填一个看起来精确的假数字。
// 风味只使用字典内的词：雪松木 橡木 檀香木 胡椒 肉桂 肉豆蔻 丁香 可可 咖啡 香草 蜂蜜 焦糖
//   巧克力 奶油 皮革 泥土 谷仓 苔藓 杏仁 核桃 花生 花香 柑橘 青草 薄荷 烤面包 烟熏 豆香 黑巧 坚果
const EXTRA = `
# ── 古巴 · Cohiba（高希霸）
Cohiba|Línea Clásica|Corona Especial|5.6|38|Cuba|Habano|Cuba|Cuba|4|豆香,雪松木,奶油,蜂蜜|经典线的细长型号，豆香与奶油感集中，抽吸节奏偏快，适合有一定经验后细品。
Cohiba|Línea Clásica|Exquisitos|4.9|33|Cuba|Habano|Cuba|Cuba|3|豆香,青草,奶油,柑橘|小尺寸但风味密度不低，短休时段的古巴代表，青草与柑橘调明显。
Cohiba|Línea Clásica|Espléndidos|7.0|47|Cuba|Habano|Cuba|Cuba|4|豆香,雪松木,皮革,咖啡|丘吉尔尺寸的经典款，中后段皮革与咖啡渐强，需要 90 分钟以上的耐心。
Cohiba|Línea Clásica|Panetelas|4.5|38|Cuba|Habano|Cuba|Cuba|3|豆香,青草,蜂蜜|停产多年的型号，市面少见，风味以豆香与青草为主，清淡易抽。
Cohiba|Maduro 5|Genios|5.5|52|Cuba|Maduro|Cuba|Cuba|5|黑巧,咖啡,可可,泥土|马杜罗茄衣带来明显甜感与厚重感，中段黑巧与咖啡冲击力强。
Cohiba|Maduro 5|Magicos|4.5|52|Cuba|Maduro|Cuba|Cuba|5|可可,黑巧,皮革,胡椒|短粗尺寸，浓郁度在同品牌中偏高，适合饭后。
Cohiba|Maduro 5|Secretos|4.4|40|Cuba|Maduro|Cuba|Cuba|4|可可,咖啡,香草,泥土|马杜罗线里最小的一款，风味依旧饱满，时间紧时的选择。
Cohiba|Siglo|Siglo I|4.0|40|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,柑橘,青草|世纪系列入门尺寸，清淡顺滑，适合早晨第一支。
Cohiba|Siglo|Siglo II|5.1|42|Cuba|Habano|Cuba|Cuba|3|雪松木,香草,咖啡,柑橘|中等尺寸，香草与咖啡的过渡自然，公认的平衡款。
Cohiba|Siglo|Siglo III|6.1|42|Cuba|Habano|Cuba|Cuba|4|雪松木,咖啡,蜂蜜,花香|细长的世纪，花香在中段浮现，尾段蜂蜜收尾。
Cohiba|Siglo|Siglo IV|5.6|46|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,咖啡,奶油|世纪系列最受欢迎的尺寸之一，结构完整，层次清晰。
Cohiba|Siglo|Siglo V|6.7|43|Cuba|Habano|Cuba|Cuba|4|雪松木,蜂蜜,花香,柑橘|长尺寸带来更长的发展曲线，花香与柑橘贯穿中段。
Cohiba|Behike|BHK 54|5.7|54|Cuba|Habano|Cuba|Cuba|5|豆香,黑巧,皮革,泥土|Behike 中段尺寸，Medio Tiempo 烟叶带来极高浓度与陈年潜力。
Cohiba|Behike|BHK 56|6.5|56|Cuba|Habano|Cuba|Cuba|5|豆香,黑巧,胡椒,泥土|Behike 最大尺寸，抽吸时间长，风味随尺寸层层展开。
Cohiba|Novedosos|Novedosos|6.1|52|Cuba|Habano|Cuba|Cuba|4|豆香,雪松木,咖啡,蜂蜜|近年新款，延续豆香主线，中段咖啡感更明确。
Cohiba|Robustos|Robustos Especiales|4.9|50|Cuba|Habano|Cuba|Cuba|4|豆香,雪松木,可可,蜂蜜|罗布图特别版，与常规版相比更强调可可与甜感。

# ── 古巴 · Montecristo（蒙特克里斯托）
Montecristo|Clásica|No.1|6.5|42|Cuba|Habano|Cuba|Cuba|3|雪松木,可可,坚果,咖啡|长科罗娜，木香与可可的经典组合，节奏从容。
Montecristo|Clásica|No.3|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,可可,青草,坚果|中等科罗娜，清淡易抽，适合入门。
Montecristo|Clásica|No.4|5.1|42|Cuba|Habano|Cuba|Cuba|3|雪松木,可可,咖啡,青草|全球销量最高的古巴雪茄之一，平衡度是它的立身之本。
Montecristo|Clásica|No.5|4.0|40|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,坚果|小科罗娜，短时间内的经典风味体验。
Montecristo|Edmundo|Edmundo|5.3|52|Cuba|Habano|Cuba|Cuba|4|皮革,泥土,可可,胡椒|Edmundo 系列的标准尺寸，浓郁饱满。
Montecristo|Edmundo|Petit Edmundo|4.3|52|Cuba|Habano|Cuba|Cuba|4|皮革,泥土,咖啡,胡椒|短粗版本，风味密度高，适合时间有限时。
Montecristo|Open|Eagle|5.9|54|Cuba|Habano|Cuba|Cuba|4|雪松木,胡椒,泥土,咖啡|Open 系列主打户外场景，结构扎实。
Montecristo|Open|Master|4.9|50|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,坚果,柑橘|清爽路线，适合搭配气泡水或淡茶。
Montecristo|Open|Regata|5.3|46|Cuba|Habano|Cuba|Cuba|3|雪松木,柑橘,青草,蜂蜜|Regata 偏清新，柑橘调突出。
Montecristo|1935 Series|Maltés|6.0|53|Cuba|Habano|Cuba|Cuba|5|可可,黑巧,皮革,泥土|1935 系列的高端线，浓郁度与复杂度都上一个台阶。
Montecristo|1935 Series|Dumas|5.1|49|Cuba|Habano|Cuba|Cuba|4|可可,咖啡,雪松木,皮革|1935 系列的中号，层次分明。
Montecristo|1935 Series|Leyenda|6.5|55|Cuba|Habano|Cuba|Cuba|5|黑巧,皮革,泥土,胡椒|1935 系列的大尺寸，需要长时间慢抽。
Montecristo|Linea|Double Edmundo|6.1|50|Cuba|Habano|Cuba|Cuba|4|皮革,可可,泥土,咖啡|双埃德蒙多，纵向发展完整。

# ── 古巴 · Partagás（帕特加斯）
Partagás|Serie D|No.5|4.3|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,胡椒,咖啡|短粗的 Serie D，泥土与胡椒的底韵厚重。
Partagás|Serie D|No.6|3.5|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,可可,胡椒|极短尺寸，浓度不降，适合冬天短休。
Partagás|Serie E|No.1|6.7|54|Cuba|Habano|Cuba|Cuba|5|皮革,胡椒,泥土,黑巧|Serie E 的丘吉尔，浓郁度是帕特加斯的顶峰之一。
Partagás|Serie P|No.2|6.1|52|Cuba|Habano|Cuba|Cuba|5|皮革,泥土,胡椒,咖啡|鱼雷造型，抽吸集中，风味释放更猛烈。
Partagás|Serie P|No.2 Tubos|6.1|52|Cuba|Habano|Cuba|Cuba|5|皮革,泥土,胡椒,可可|铝管装，便于携带与短期存放。
Partagás|Clásica|Lusitanias|7.6|49|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,黑巧,胡椒|双科罗娜尺寸，帕特加斯最经典的浓郁代表作。
Partagás|Clásica|8-9-8|6.7|43|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|以盒内排列方式命名，优雅细长的浓郁型。
Partagás|Clásica|Coronas Senior|5.6|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|标准科罗娜，日常浓郁款。
Partagás|Clásica|Super Partagás|5.6|42|Cuba|Habano|Cuba|Cuba|4|泥土,胡椒,皮革,青草|近年新增型号，风味延续品牌主线。
Partagás|Maduro|Série P No.2 Maduro|6.1|52|Cuba|Maduro|Cuba|Cuba|5|黑巧,泥土,咖啡,皮革|马杜罗茄衣版本，甜感与厚度同时提升。
Partagás|Serie D|No.4 Reserva|4.9|50|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,黑巧,胡椒|珍藏版使用陈年烟叶，变化更缓慢。

# ── 古巴 · Romeo y Julieta（罗密欧与朱丽叶）
Romeo y Julieta|Clásica|Churchill|7.0|47|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,花香,蜂蜜|品牌代表作，奶油与花香是主要记忆点。
Romeo y Julieta|Clásica|Coronas|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,蜂蜜,坚果|标准科罗娜，温和顺滑。
Romeo y Julieta|Clásica|Petit Coronas|5.1|42|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,青草,蜂蜜|短科罗娜，适合午后。
Romeo y Julieta|Clásica|Exhibición No.4|5.0|50|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,柑橘,坚果|展览四号，古巴入门常青款。
Romeo y Julieta|Clásica|Cedros de Luxe No.1|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,青草,花香|雪松包裹，木香更突出。
Romeo y Julieta|Clásica|Cedros de Luxe No.2|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,蜂蜜,坚果,青草|同上，尺寸略有差异。
Romeo y Julieta|Clásica|Cedros de Luxe No.3|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,柑橘,花香|木香与柑橘的平衡。
Romeo y Julieta|Clásica|Romeo No.1|5.5|40|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,花香,坚果|细长优雅，花香明显。
Romeo y Julieta|Clásica|Romeo No.2|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,蜂蜜,柑橘|温和的日常款。
Romeo y Julieta|Clásica|Romeo No.3|4.6|40|Cuba|Habano|Cuba|Cuba|2|雪松木,青草,奶油,花香|小尺寸清淡款。
Romeo y Julieta|Linea de Oro|Nobles|6.1|56|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,蜂蜜,花香|高端线，做工与选叶更讲究，风味更集中。
Romeo y Julieta|Linea de Oro|Hidalgos|4.9|54|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,奶油,柑橘|高端线的短尺寸。
Romeo y Julieta|Linea de Oro|Dianas|5.7|52|Cuba|Habano|Cuba|Cuba|4|雪松木,蜂蜜,可可,花香|高端线的中等尺寸。
Romeo y Julieta|Wide Churchill|Wide Churchill|5.1|55|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,花香,蜂蜜|粗环径版本，抽吸更顺，风味更饱满。

# ── 古巴 · H.Upmann（乌普曼）
H.Upmann|Clásica|Connoisseur No.1|5.0|48|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,奶油,坚果|鉴赏家系列，优雅平衡，早餐雪茄的常客。
H.Upmann|Clásica|Connoisseur No.2|5.3|50|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,可可,奶油|同上，尺寸略粗。
H.Upmann|Clásica|Connoisseur No.3|4.4|46|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,坚果,青草|小尺寸的鉴赏家。
H.Upmann|Clásica|Magnum 46|5.6|46|Cuba|Habano|Cuba|Cuba|4|雪松木,咖啡,可可,杏仁|Magnum 线中号，杏仁调是其特色。
H.Upmann|Clásica|Magnum 50|5.9|50|Cuba|Habano|Cuba|Cuba|4|雪松木,咖啡,可可,奶油|2005 年后的新尺寸，结构完整。
H.Upmann|Clásica|Magnum 50 Tubos|5.9|50|Cuba|Habano|Cuba|Cuba|4|雪松木,咖啡,杏仁,可可|铝管装。
H.Upmann|Clásica|Sir Winston|7.0|47|Cuba|Habano|Cuba|Cuba|4|雪松木,咖啡,可可,坚果|以丘吉尔命名，长尺寸考验耐心。
H.Upmann|Clásica|Majestic|5.5|40|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,坚果,奶油|细长清淡款。
H.Upmann|Clásica|Regalias|5.1|42|Cuba|Habano|Cuba|Cuba|3|雪松木,奶油,青草,咖啡|日常尺寸。
H.Upmann|Clásica|Coronas Major|5.6|42|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,坚果,奶油|经典科罗娜。
H.Upmann|Clásica|Coronas Junior|4.6|38|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,奶油,坚果|小科罗娜。
H.Upmann|Clásica|Half Corona|3.5|44|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,青草,奶油|半科罗娜，15 分钟一支。

# ── 古巴 · Hoyo de Monterrey（好友）
Hoyo de Monterrey|Epicure|Epicure No.1|5.6|46|Cuba|Habano|Cuba|Cuba|2|青草,雪松木,奶油,香草|清淡路线的代表，青草与奶油调突出。
Hoyo de Monterrey|Epicure|Epicure No.2|4.9|50|Cuba|Habano|Cuba|Cuba|2|青草,雪松木,柑橘,香草|罗布图尺寸的清淡款。
Hoyo de Monterrey|Epicure|Epicure Especial|5.5|50|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,柑橘,蜂蜜|特别版，风味密度略高。
Hoyo de Monterrey|Epicure|Epicure de Luxe|4.9|50|Cuba|Habano|Cuba|Cuba|2|青草,奶油,香草,柑橘|奢华版，选叶更佳。
Hoyo de Monterrey|Epicure|Petit Robusto|4.0|50|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,奶油,坚果|短罗布图。
Hoyo de Monterrey|Le Hoyo|Le Hoyo de San Juan|5.9|54|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,柑橘,奶油|Le Hoyo 线，偏清爽。
Hoyo de Monterrey|Le Hoyo|Le Hoyo de Rio Seco|5.5|56|Cuba|Habano|Cuba|Cuba|3|青草,柑橘,雪松木,蜂蜜|粗环径版本。
Hoyo de Monterrey|Le Hoyo|Le Hoyo des Dieux|6.1|42|Cuba|Habano|Cuba|Cuba|2|青草,花香,奶油,柑橘|细长清淡，花香明显。
Hoyo de Monterrey|Clásica|Double Corona|7.6|49|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,奶油,蜂蜜|双科罗娜，清淡型里的长跑选手。
Hoyo de Monterrey|Clásica|Churchill|7.0|47|Cuba|Habano|Cuba|Cuba|2|青草,奶油,雪松木,香草|丘吉尔尺寸的清淡款。
Hoyo de Monterrey|Clásica|Coronas|5.6|42|Cuba|Habano|Cuba|Cuba|2|青草,奶油,柑橘,香草|经典清淡科罗娜。
Hoyo de Monterrey|Clásica|Palmas Extra|5.5|40|Cuba|Habano|Cuba|Cuba|2|青草,花香,奶油,柑橘|细长清淡。

# ── 古巴 · Bolívar（玻利瓦尔）
Bolívar|Clásica|Royal Coronas|4.9|50|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,黑巧,胡椒|浓郁度高，泥土与黑巧是主线。
Bolívar|Clásica|Petit Coronas|5.1|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,胡椒|经典浓郁科罗娜。
Bolívar|Clásica|Coronas Gigantes|7.0|47|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,雪松木,咖啡|大尺寸，浓度持久。
Bolívar|Clásica|Coronas Junior|4.6|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,胡椒,青草|小尺寸的浓郁款。
Bolívar|Clásica|Tubos No.1|5.6|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|铝管装。
Bolívar|Clásica|Lonsdales|6.5|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|长尺寸。
Bolívar|Clásica|Inmensas|7.6|49|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,黑巧,胡椒|双科罗娜尺寸。
Bolívar|Clásica|Gold Medal|6.5|42|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,黑巧,咖啡|金牌，浓郁路线的代表。
Bolívar|Clásica|Libertador|6.5|54|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,黑巧,胡椒|大环径浓郁款。
Bolívar|Clásica|Belicosos Finos Tubos|5.5|52|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,胡椒,可可|铝管鱼雷。
Bolívar|Clásica|Royal Coronas Tubos|4.9|50|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,黑巧,咖啡|铝管罗布图。
Bolívar|Novel|Novel|5.5|52|Cuba|Habano|Cuba|Cuba|5|泥土,皮革,胡椒,黑巧|近年新款，延续浓郁主线。

# ── 古巴 · Trinidad（特立尼达）
Trinidad|Fundadores|Fundadores|7.6|40|Cuba|Habano|Cuba|Cuba|3|雪松木,花香,柑橘,蜂蜜|细长辫子头，细腻优雅，是品牌的标志性造型。
Trinidad|Vigía|Vigía|4.3|50|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,咖啡,皮革|短粗，风味集中。
Trinidad|Reyes|Reyes|4.3|40|Cuba|Habano|Cuba|Cuba|3|雪松木,花香,青草,柑橘|小尺寸，细腻。
Trinidad|Coloniales|Coloniales|5.1|44|Cuba|Habano|Cuba|Cuba|3|雪松木,花香,蜂蜜,柑橘|中等尺寸，平衡优雅。
Trinidad|Robustos Extra|Robustos Extra|6.1|50|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,花香,咖啡|罗布图加大，层次更丰富。
Trinidad|Topes|Topes|4.9|56|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,蜂蜜,花香|粗环径新款。
Trinidad|La Trova|La Trova|6.9|52|Cuba|Habano|Cuba|Cuba|4|雪松木,咖啡,花香,可可|LCDH 特别款，长尺寸。
Trinidad|Esmeralda|Esmeralda|5.7|53|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,花香,咖啡|近年常规款。
Trinidad|Media Luna|Media Luna|4.5|50|Cuba|Habano|Cuba|Cuba|4|雪松木,可可,花香,泥土|小罗布图。

# ── 古巴 · 其他经典
Juan López|Selección No.1|Selección No.1|5.6|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|老牌浓郁科罗娜，被低估的选择。
Juan López|Selección No.2|Selección No.2|4.9|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,可可,咖啡|罗布图尺寸。
Juan López|Selección No.4|Selección No.4|5.9|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,胡椒,咖啡|大罗布图。
Juan López|Selección|Selección Suprema|5.5|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,雪松木,咖啡|近年新增。
Saint Luis Rey|Clásica|Regios|5.1|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|浓郁罗布图，性价比口碑好。
Saint Luis Rey|Clásica|Serie A|5.6|46|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|中等尺寸。
Saint Luis Rey|Clásica|Double Coronas|7.6|49|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,雪松木,咖啡|双科罗娜。
Saint Luis Rey|Clásica|Hermosos No.1|6.7|48|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,蜂蜜|长尺寸优雅版。
Sancho Panza|Clásica|Belicosos|5.5|52|Cuba|Habano|Cuba|Cuba|3|泥土,青草,雪松木,咖啡|被忽略的老牌，风味朴素好抽。
Sancho Panza|Clásica|Non Plus|6.5|42|Cuba|Habano|Cuba|Cuba|3|泥土,青草,雪松木,坚果|细长款。
Sancho Panza|Clásica|Molinos|7.6|50|Cuba|Habano|Cuba|Cuba|3|泥土,青草,雪松木,蜂蜜|大尺寸。
Sancho Panza|Clásica|Coronas|5.6|42|Cuba|Habano|Cuba|Cuba|3|泥土,青草,坚果,雪松木|经典科罗娜。
San Cristóbal|La Fuerza|La Fuerza|5.6|50|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,蜂蜜,青草|哈瓦那老牌，风味温和。
San Cristóbal|El Príncipe|El Príncipe|4.3|42|Cuba|Habano|Cuba|Cuba|3|雪松木,青草,咖啡,蜂蜜|小尺寸。
San Cristóbal|La Punta|La Punta|5.5|50|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,青草,坚果|鱼雷。
San Cristóbal|Mercaderes|Mercaderes|6.9|48|Cuba|Habano|Cuba|Cuba|3|雪松木,咖啡,蜂蜜,青草|长尺寸。
Vegas Robaina|Clásica|Famosos|5.0|48|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|以种植者命名，土壤感突出。
Vegas Robaina|Clásica|Don Alejandro|7.6|49|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,黑巧|双科罗娜。
Vegas Robaina|Clásica|Unicos|6.1|52|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|鱼雷。
Vegas Robaina|Clásica|Únicos Tubos|6.1|52|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,胡椒|铝管鱼雷。
Vegas Robaina|Clásica|Clásicos|6.5|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,雪松木,咖啡|细长款。
Quai d'Orsay|Clásica|No.50|4.3|50|Cuba|Habano|Cuba|Cuba|2|青草,奶油,柑橘,花香|法国市场定制出身，清淡优雅。
Quai d'Orsay|Clásica|No.54|5.6|54|Cuba|Habano|Cuba|Cuba|2|青草,奶油,花香,蜂蜜|粗环径清淡款。
Quai d'Orsay|Selección|Selección 50|4.3|50|Cuba|Habano|Cuba|Cuba|2|青草,柑橘,奶油,花香|近年新线。
Quai d'Orsay|Selección|Selección 54|5.6|54|Cuba|Habano|Cuba|Cuba|2|青草,奶油,蜂蜜,花香|同上。
Quai d'Orsay|Coronas|Coronas Claro|5.6|42|Cuba|Habano|Cuba|Cuba|2|青草,花香,奶油,柑橘|经典清淡。
Rafael González|Clásica|Petit Coronas|5.0|42|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,奶油|温和老牌。
Rafael González|Clásica|Panetelas Extra|5.0|36|Cuba|Habano|Cuba|Cuba|2|青草,蜂蜜,雪松木,花香|细长清淡。
Rafael González|Clásica|Coronas Extra|5.6|42|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,奶油,蜂蜜|经典科罗娜。
Rafael González|Clásica|Perlas|4.0|40|Cuba|Habano|Cuba|Cuba|2|青草,蜂蜜,花香,奶油|小尺寸。
Punch|Clásica|Double Coronas|7.6|49|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,雪松木,咖啡|双科罗娜，浓郁扎实。
Punch|Clásica|Punch Punch|5.6|46|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,胡椒|品牌同名款。
Punch|Clásica|Coronations|5.6|42|Cuba|Habano|Cuba|Cuba|3|泥土,雪松木,咖啡,青草|科罗娜。
Punch|Clásica|Petit Coronas|5.1|42|Cuba|Habano|Cuba|Cuba|3|泥土,青草,咖啡,雪松木|短科罗娜。
Punch|Clásica|Rare Corojo|5.6|46|Cuba|Corojo|Cuba|Cuba|4|泥土,皮革,胡椒,咖啡|Corojo 茄衣特别版。
Ramon Allones|Clásica|Specially Selected|4.9|50|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,黑巧|浓郁罗布图，老饕常选。
Ramon Allones|Clásica|Gigantes|7.6|49|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,雪松木,咖啡|双科罗娜。
Ramon Allones|Clásica|Small Club Coronas|4.3|42|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,胡椒|小尺寸浓郁。
Ramon Allones|Clásica|Allones Extra|5.6|44|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,青草|中等尺寸。
El Rey del Mundo|Clásica|Choix Supreme|5.6|48|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,花香|温和优雅。
El Rey del Mundo|Clásica|Tainos|7.0|47|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,奶油|丘吉尔尺寸。
El Rey del Mundo|Clásica|Robustos|4.9|50|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,坚果|罗布图。
El Rey del Mundo|Clásica|Demi Tasse|3.9|30|Cuba|Habano|Cuba|Cuba|2|青草,花香,蜂蜜|迷你尺寸。
Diplomáticos|Clásica|No.2|6.1|52|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,雪松木|鱼雷，被低估的浓郁款。
Diplomáticos|Clásica|No.4|5.1|46|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,青草|中等尺寸。
Diplomáticos|Clásica|No.5|4.0|40|Cuba|Habano|Cuba|Cuba|3|泥土,青草,咖啡,雪松木|小尺寸。
Diplomáticos|North Pole|North Pole|6.1|52|Cuba|Habano|Cuba|Cuba|4|泥土,皮革,咖啡,黑巧|限量款。
La Gloria Cubana|Clásica|Medaille d'Or No.1|7.0|42|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,花香|细长优雅。
La Gloria Cubana|Clásica|Medaille d'Or No.2|5.1|40|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,奶油|细长款。
La Gloria Cubana|Clásica|Medaille d'Or No.3|4.0|36|Cuba|Habano|Cuba|Cuba|2|青草,花香,蜂蜜,奶油|小尺寸。
La Gloria Cubana|Clásica|Medaille d'Or No.4|5.9|32|Cuba|Habano|Cuba|Cuba|3|青草,花香,雪松木,蜂蜜|极细长。
La Flor de Cano|Clásica|Petit Coronas|5.1|42|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,蜂蜜,坚果|平价老牌。
La Flor de Cano|Clásica|Coronas|5.6|42|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,坚果,蜂蜜|科罗娜。
La Flor de Cano|Clásica|Selectos|4.6|40|Cuba|Habano|Cuba|Cuba|3|青草,蜂蜜,坚果,雪松木|短尺寸。
Por Larrañaga|Clásica|Petit Coronas|5.0|42|Cuba|Habano|Cuba|Cuba|3|青草,蜂蜜,雪松木,花香|甜感明显的老牌。
Por Larrañaga|Clásica|Montecarlos|6.3|33|Cuba|Habano|Cuba|Cuba|2|青草,花香,蜂蜜,奶油|细长优雅。
Por Larrañaga|Clásica|Picadores|5.0|50|Cuba|Habano|Cuba|Cuba|3|青草,蜂蜜,雪松木,坚果|罗布图。
Por Larrañaga|Galanes|Galanes|5.1|50|Cuba|Habano|Cuba|Cuba|3|青草,蜂蜜,雪松木,咖啡|近年新线。
Vegueros|Clásica|Tapados|4.3|46|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,咖啡,蜂蜜|平价古巴代表。
Vegueros|Clásica|Entretiempos|4.3|52|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,咖啡,坚果|短粗。
Vegueros|Clásica|Mañanitas|4.0|42|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,坚果,蜂蜜|小尺寸。
Vegueros|Centrofinos|Centrofinos|5.1|50|Cuba|Habano|Cuba|Cuba|3|青草,雪松木,咖啡,蜂蜜|中间尺寸。

# ── 尼加拉瓜 · Padrón
Padrón|Damasco|Damasco|5.1|46|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,坚果|经典线的中等尺寸，可可与咖啡平衡。
Padrón|1964 Anniversary|Monarca|6.5|46|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,杏仁|1964 系列的长尺寸。
Padrón|1964 Anniversary|Diplomático|5.9|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,坚果,雪松木|鱼雷造型。
Padrón|1964 Anniversary|Imperial|6.0|54|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,皮革|大环径。
Padrón|1964 Anniversary|Principe|4.5|46|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,蜂蜜|小尺寸。
Padrón|1926 Serie|No.1|6.7|54|Nicaragua|Habano Maduro|Nicaragua|Nicaragua|5|黑巧,皮革,咖啡,胡椒|1926 最大尺寸，浓度高。
Padrón|1926 Serie|No.2|5.5|52|Nicaragua|Habano Maduro|Nicaragua|Nicaragua|5|黑巧,咖啡,皮革,雪松木|贝利科索。
Padrón|1926 Serie|No.6|4.7|50|Nicaragua|Habano Maduro|Nicaragua|Nicaragua|5|黑巧,咖啡,胡椒,皮革|短罗布图。
Padrón|1926 Serie|No.9 Tubos|5.5|56|Nicaragua|Habano Maduro|Nicaragua|Nicaragua|5|黑巧,皮革,咖啡,泥土|铝管装。
Padrón|Family Reserve|No.44|5.5|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,蜂蜜|家族珍藏，选叶更严。
Padrón|Family Reserve|No.45|6.0|56|Nicaragua|Habano|Nicaragua|Nicaragua|5|黑巧,可可,咖啡,皮革|家族珍藏大尺寸。
Padrón|Family Reserve|No.50|4.5|54|Nicaragua|Habano|Nicaragua|Nicaragua|5|黑巧,咖啡,皮革,胡椒|家族珍藏短尺寸。
Padrón|Family Reserve|No.85|5.5|50|Nicaragua|Habano|Nicaragua|Nicaragua|5|可可,黑巧,咖啡,雪松木|马杜罗版本。
Padrón|Damask|Damasco Maduro|5.1|46|Nicaragua|Habano Maduro|Nicaragua|Nicaragua|4|可可,咖啡,蜂蜜,雪松木|马杜罗茄衣版本。

# ── 尼加拉瓜 · Oliva
Oliva|Serie V|Torpedo|6.0|56|Nicaragua|Habano Sun Grown|Nicaragua|Nicaragua|5|雪松木,可可,胡椒,咖啡|Serie V 的鱼雷，浓度与结构都强。
Oliva|Serie V|Churchill|6.9|50|Nicaragua|Habano Sun Grown|Nicaragua|Nicaragua|5|雪松木,可可,咖啡,皮革|长尺寸，变化缓慢。
Oliva|Serie V|Lancero|7.5|38|Nicaragua|Habano Sun Grown|Nicaragua|Nicaragua|5|雪松木,胡椒,可可,咖啡|细长，风味集中。
Oliva|Serie V|Figurado|6.0|56|Nicaragua|Habano Sun Grown|Nicaragua|Nicaragua|5|雪松木,可可,胡椒,泥土|特殊造型。
Oliva|Serie V Melanio|Melanio Churchill|7.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,杏仁|Melanio 线，公认更优雅。
Oliva|Serie V Melanio|Melanio Torpedo|6.5|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|鱼雷。
Oliva|Serie V Melanio|Melanio Robusto|5.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,雪松木|罗布图。
Oliva|Serie O|Serie O Robusto|5.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,泥土|Serie O 比 V 温和一些。
Oliva|Serie O|Serie O Toro|6.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,杏仁|Toro 尺寸。
Oliva|Serie G|Serie G Robusto|5.0|50|Nicaragua|Cameroon|Nicaragua|Nicaragua|3|雪松木,奶油,蜂蜜,杏仁|喀麦隆茄衣，偏甜顺。
Oliva|Serie G|Serie G Toro|6.0|50|Nicaragua|Cameroon|Nicaragua|Nicaragua|3|雪松木,奶油,蜂蜜,咖啡|Toro。
Oliva|Connecticut Reserve|Robusto|5.0|50|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|2|青草,奶油,杏仁,雪松木|清淡路线。
Oliva|Connecticut Reserve|Toro|6.0|50|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|2|青草,奶油,坚果,蜂蜜|Toro。

# ── 尼加拉瓜 · Drew Estate
Drew Estate|Liga Privada|No.9 Robusto|5.0|54|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|4|巧克力,泥土,咖啡,皮革|私人联盟，泥土与黑巧的主场。
Drew Estate|Liga Privada|T52|5.0|52|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|黑巧,咖啡,胡椒,泥土|T52 比 No.9 更辛辣。
Drew Estate|Liga Privada|Unico Serie|6.0|52|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|巧克力,泥土,皮革,胡椒|Unico 系列，产量低。
Drew Estate|Liga Privada|Papas Fritas|4.5|44|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|4|巧克力,泥土,咖啡,雪松木|短小但风味浓。
Drew Estate|Undercrown|Toro|6.0|52|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|3|雪松木,奶油,杏仁,青草|Undercrown 主线，顺滑。
Drew Estate|Undercrown|Corona Viva|5.6|42|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|3|雪松木,奶油,青草,杏仁|小尺寸。
Drew Estate|Undercrown|Shade Robusto|5.5|50|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|3|雪松木,奶油,杏仁,青草|罗布图。
Drew Estate|Nica Rustica|El Brujito|6.0|52|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|泥土,胡椒,咖啡,皮革|粗犷直接。
Drew Estate|Nica Rustica|Short Robusto|4.5|54|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|泥土,胡椒,黑巧,咖啡|短粗。
Drew Estate|Herrera Esteli|Robusto|5.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,坚果|Willy Herrera 主导的线。
Drew Estate|Herrera Esteli|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|Toro。

# ── 尼加拉瓜 · My Father / Tatuaje / AJ Fernandez
My Father|Le Bijou 1922|Toro|6.0|52|Nicaragua|Habano Oscuro|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,咖啡|Le Bijou 的 Toro。
My Father|Le Bijou 1922|Petit Robusto|4.5|50|Nicaragua|Habano Oscuro|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,泥土|短罗布图。
My Father|The Judge|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|5|胡椒,皮革,咖啡,黑巧|The Judge，浓度高。
My Father|Flor de las Antillas|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|3|雪松木,坚果,奶油,蜂蜜|年度冠军款，甜香与坚果。
My Father|Flor de las Antillas|Toro Gordo|6.5|56|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,坚果,奶油,咖啡|粗环径。
My Father|Connecticut|Robusto|5.0|50|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|2|青草,奶油,杏仁,雪松木|清淡线。
My Father|Jaime Garcia|Robusto|5.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,可可,咖啡,雪松木|以创始人之子命名。
My Father|La Opulencia|Toro|6.0|52|Nicaragua|Mexican San Andrés|Nicaragua|Nicaragua|5|黑巧,咖啡,泥土,胡椒|圣安德烈斯茄衣，浓郁。
Tatuaje|Brown Label|No.3|5.6|44|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,泥土|布朗标，硬朗风格。
Tatuaje|Brown Label|Cabinetta|5.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,咖啡|罗布图。
Tatuaje|Black Label|Robusto|5.0|52|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|巧克力,泥土,咖啡,胡椒|黑标，极致浓郁。
Tatuaje|Black Label|Toro|6.0|54|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|巧克力,泥土,皮革,黑巧|Toro。
Tatuaje|Havana VI|Nobles|6.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|Havana 系列。
Tatuaje|Fausto|Toro|6.0|54|Nicaragua|Habano|Nicaragua|Nicaragua|5|胡椒,泥土,黑巧,咖啡|Fausto，强度高。
Tatuaje|Cojonu|2003|6.5|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|Cojonu 系列。
Tatuaje|Cojonu|2006|6.5|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|Cojonu 系列。
A.J. Fernandez|San Lotano|Toro|6.0|54|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,咖啡|San Lotano 主线。
A.J. Fernandez|San Lotano Oval|Robusto|5.5|54|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,泥土|椭圆压模。
A.J. Fernandez|New World|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,咖啡,可可,胡椒|New World 线。
A.J. Fernandez|New World|Connecticut|5.0|50|Nicaragua|Connecticut Shade|Nicaragua|Nicaragua|2|青草,奶油,杏仁,雪松木|清淡版。
A.J. Fernandez|Bellas Artes|Toro|6.0|54|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,蜂蜜|Bellas Artes。
A.J. Fernandez|Last Call|Robusto|5.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,咖啡,可可|Last Call。
A.J. Fernandez|Dias de Gloria|Toro|6.0|54|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|Dias de Gloria。
A.J. Fernandez|Enclave|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,咖啡|Enclave。

# ── 尼加拉瓜 · 其他
Perdomo|20th Anniversary|Toro|6.0|54|Nicaragua|Maduro|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,奶油|马杜罗茄衣的甜感。
Perdomo|20th Anniversary|Churchill|7.0|50|Nicaragua|Maduro|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,杏仁|长尺寸。
Perdomo|10th Anniversary|Robusto|5.0|52|Nicaragua|Maduro|Nicaragua|Nicaragua|4|可可,咖啡,雪松木,奶油|十周年纪念款。
Perdomo|Habano Bourbon Barrel-Aged|Robusto|5.0|54|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,蜂蜜|波本桶陈烟叶，带甜感。
Perdomo|Esteli|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|5|泥土,胡椒,咖啡,皮革|Esteli 产区风格，强烈。
Perdomo|Lot 23|Toro|6.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|Lot 23。
Camacho|Corojo|Toro|6.0|50|Honduras|Corojo|Honduras|Honduras|4|胡椒,泥土,咖啡,皮革|Corojo 茄衣，辛香明显。
Camacho|Connecticut|Robusto|5.0|50|Honduras|Connecticut Shade|Honduras|Honduras|2|青草,奶油,杏仁,雪松木|清淡线。
Camacho|Triple Maduro|Toro|6.0|52|Honduras|Triple Maduro|Honduras|Honduras|5|黑巧,咖啡,泥土,胡椒|三倍马杜罗，浓郁。
Camacho|Ecuador|Toro|6.0|50|Honduras|Ecuadorian Habano|Honduras|Honduras|4|胡椒,雪松木,咖啡,泥土|厄瓜多尔茄衣。
Camacho|Nicaragua|Toro|6.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|胡椒,泥土,咖啡,可可|尼加拉瓜版本。
Rocky Patel|Vintage 1990|Robusto|5.5|50|Honduras|Habano|Honduras|Honduras|3|雪松木,可可,咖啡,坚果|90 典藏。
Rocky Patel|Vintage 1999|Robusto|5.5|50|Honduras|Connecticut Broadleaf|Honduras|Honduras|4|可可,咖啡,雪松木,泥土|99 典藏。
Rocky Patel|Vintage 2003|Robusto|5.5|50|Honduras|Habano|Honduras|Honduras|4|雪松木,可可,咖啡,胡椒|2003 典藏。
Rocky Patel|Decade|Toro|6.5|52|Honduras|Habano|Honduras|Honduras|4|雪松木,可可,咖啡,皮革|Decade 系列。
Rocky Patel|Sun Grown|Robusto|5.5|50|Honduras|Habano Sun Grown|Honduras|Honduras|4|雪松木,可可,胡椒,咖啡|Sun Grown 茄衣。
Rocky Patel|Edge|Toro|6.0|52|Honduras|Corojo|Honduras|Honduras|5|胡椒,泥土,咖啡,皮革|Edge 系列，强度高。
Rocky Patel|Grand Reserve|Robusto|5.5|50|Honduras|Habano|Honduras|Honduras|4|雪松木,可可,咖啡,蜂蜜|Grand Reserve。
CLE|Connecticut|Toro|6.0|50|Honduras|Connecticut Shade|Honduras|Honduras|2|青草,奶油,杏仁,雪松木|CLE 康州线。
CLE|Corojo|Robusto|5.0|50|Honduras|Corojo|Honduras|Honduras|4|胡椒,泥土,咖啡,雪松木|Corojo 线。
CLE|Habano|Robusto|5.0|50|Honduras|Habano|Honduras|Honduras|4|雪松木,胡椒,咖啡,可可|Habano 线。
CLE|Prize Fighter|Robusto|5.0|52|Honduras|Habano|Honduras|Honduras|4|胡椒,雪松木,咖啡,泥土|Prize Fighter。
CLE|Twenty Twenty|Robusto|5.0|50|Honduras|Habano|Honduras|Honduras|4|雪松木,可可,咖啡,坚果|二十周年。

# ── 多米尼加 · Arturo Fuente
Arturo Fuente|Opus X|Double Corona|6.8|49|Dominican Republic|Dominican Corojo|Dominican Republic|Dominican Republic|5|雪松木,胡椒,可可,柑橘|Opus X 的长尺寸，层次更完整。
Arturo Fuente|Opus X|PerfecXion No.2|6.4|52|Dominican Republic|Dominican Corojo|Dominican Republic|Dominican Republic|5|雪松木,胡椒,可可,蜂蜜|鱼雷造型。
Arturo Fuente|Opus X|Petit Lancero|6.1|39|Dominican Republic|Dominican Corojo|Dominican Republic|Dominican Republic|5|雪松木,胡椒,柑橘,蜂蜜|细长款。
Arturo Fuente|Opus X|Robusto|5.3|50|Dominican Republic|Dominican Corojo|Dominican Republic|Dominican Republic|5|雪松木,胡椒,可可,柑橘|罗布图，Opus X 最受欢迎的尺寸。
Arturo Fuente|Opus X|Super Belicoso|5.7|52|Dominican Republic|Dominican Corojo|Dominican Republic|Dominican Republic|5|雪松木,胡椒,可可,泥土|贝利科索。
Arturo Fuente|Opus X|Reserva d'Chateau|5.5|50|Dominican Republic|Dominican Corojo|Dominican Republic|Dominican Republic|5|雪松木,胡椒,可可,蜂蜜|Reserva 系列。
Arturo Fuente|Hemingway|Best Seller|4.5|43|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,坚果,奶油,咖啡|海明威系列的短款。
Arturo Fuente|Hemingway|Signature|6.0|47|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,坚果,奶油,青草|中等尺寸。
Arturo Fuente|Hemingway|Classic|7.0|48|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,坚果,奶油,咖啡|长尺寸。
Arturo Fuente|Hemingway|Work of Art|4.9|56|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,坚果,奶油,蜂蜜|粗环径。
Arturo Fuente|Don Carlos|Robusto|5.0|50|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,蜂蜜|喀麦隆茄衣，以甜顺著称。
Arturo Fuente|Don Carlos|Belicoso|5.4|52|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,咖啡|贝利科索。
Arturo Fuente|Don Carlos|No.2|6.0|44|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,青草|长尺寸。
Arturo Fuente|Don Carlos|Eye of the Shark|5.5|52|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|4|雪松木,奶油,杏仁,蜂蜜|特别造型款。
Arturo Fuente|Añejo|No.46|5.6|46|Dominican Republic|Connecticut Broadleaf|Dominican Republic|Dominican Republic|4|可可,咖啡,泥土,雪松木|Añejo 系列，陈年烟叶。
Arturo Fuente|Añejo|No.48|7.0|48|Dominican Republic|Connecticut Broadleaf|Dominican Republic|Dominican Republic|4|可可,咖啡,泥土,皮革|长尺寸。
Arturo Fuente|Añejo|No.50|5.5|50|Dominican Republic|Connecticut Broadleaf|Dominican Republic|Dominican Republic|4|可可,咖啡,泥土,雪松木|罗布图。
Arturo Fuente|Añejo|No.60|6.0|60|Dominican Republic|Connecticut Broadleaf|Dominican Republic|Dominican Republic|5|黑巧,咖啡,泥土,皮革|粗环径。
Arturo Fuente|Chateau Fuente|Chateau Fuente|4.5|50|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,杏仁,雪松木|入门款。
Arturo Fuente|Chateau Fuente|Double Chateau|6.8|50|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|3|青草,奶油,杏仁,坚果|长尺寸。
Arturo Fuente|Chateau Fuente|Queen B|5.5|50|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,蜂蜜,雪松木|中等。
Arturo Fuente|Gran Reserva|Flor Fina 8-5-8|6.0|47|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,蜂蜜|经典 858，性价比口碑好。
Arturo Fuente|Gran Reserva|Flor Fina 8-5-8 Maduro|6.0|47|Dominican Republic|Maduro|Dominican Republic|Dominican Republic|4|可可,咖啡,雪松木,蜂蜜|马杜罗版本。
Arturo Fuente|Gran Reserva|Cuban Corona|5.5|44|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,青草|科罗娜。
Arturo Fuente|Gran Reserva|Petit Corona|5.0|42|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,蜂蜜,杏仁|小科罗娜。
Arturo Fuente|Gran Reserva|Rothschild|4.5|50|Dominican Republic|Cameroon|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,可可|短罗布图。

# ── 多米尼加 · Ashton / La Aurora / 其他
Ashton|VSG|Belicoso No.1|5.5|50|Dominican Republic|Ecuadorian Sun Grown|Dominican Republic|Dominican Republic|4|雪松木,胡椒,可可,咖啡|VSG 线，厄瓜多尔茄衣的浓郁表达。
Ashton|VSG|Corona Gorda|5.75|46|Dominican Republic|Ecuadorian Sun Grown|Dominican Republic|Dominican Republic|4|雪松木,胡椒,可可,泥土|中等尺寸。
Ashton|VSG|Enchantment|4.4|44|Dominican Republic|Ecuadorian Sun Grown|Dominican Republic|Dominican Republic|4|雪松木,胡椒,咖啡,可可|小尺寸。
Ashton|VSG|Robusto|5.5|50|Dominican Republic|Ecuadorian Sun Grown|Dominican Republic|Dominican Republic|4|雪松木,胡椒,可可,咖啡|罗布图。
Ashton|VSG|Sorcerer|6.0|50|Dominican Republic|Ecuadorian Sun Grown|Dominican Republic|Dominican Republic|4|雪松木,胡椒,可可,皮革|长尺寸。
Ashton|Classic|Robusto|5.5|50|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,杏仁,雪松木|经典康州线，清淡顺滑。
Ashton|Classic|Churchill|7.5|48|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,坚果,雪松木|丘吉尔。
Ashton|Classic|Magnum|5.0|50|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,杏仁,蜂蜜|中等。
Ashton|Classic|Corona|5.5|44|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,雪松木,杏仁|科罗娜。
Ashton|Aged Maduro|Robusto|5.5|50|Dominican Republic|Maduro|Dominican Republic|Dominican Republic|4|可可,咖啡,雪松木,蜂蜜|陈年马杜罗。
Ashton|Cabinet|Belicoso|5.5|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,可可,咖啡,杏仁|Cabinet 系列。
Ashton|Heritage Puro Sol|Robusto|5.5|50|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,可可,蜂蜜,杏仁|Heritage 系列。
La Aurora|Preferidos|Toro|5.7|54|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,咖啡|多米尼加历史最悠久的品牌。
La Aurora|Preferidos|Corona|5.5|44|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,奶油,杏仁,青草|科罗娜。
La Aurora|1903 Edition|Robusto|5.0|50|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,泥土|1903 纪念线。
La Aurora|107|Robusto|5.0|50|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,胡椒|107 系列。
La Aurora|Corojo|Robusto|5.0|50|Dominican Republic|Corojo|Dominican Republic|Dominican Republic|4|胡椒,泥土,咖啡,雪松木|Corojo 茄衣。
La Aurora|Connecticut|Robusto|5.0|50|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|青草,奶油,杏仁,雪松木|清淡线。
La Flor Dominicana|Double Ligero|Toro|6.0|54|Dominican Republic|Habano|Dominican Republic|Dominican Republic|5|胡椒,泥土,咖啡,皮革|双 Ligero，浓度极高。
La Flor Dominicana|Double Ligero|Chisel|6.0|54|Dominican Republic|Habano|Dominican Republic|Dominican Republic|5|胡椒,泥土,黑巧,咖啡|凿形头部。
La Flor Dominicana|Ligero|Robusto|5.0|50|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|胡椒,泥土,咖啡,雪松木|Ligero 线。
La Flor Dominicana|Air Bender|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|5|胡椒,泥土,咖啡,皮革|Air Bender。
La Flor Dominicana|Andalusian Bull|Toro|6.5|54|Dominican Republic|Habano|Dominican Republic|Dominican Republic|5|胡椒,泥土,黑巧,咖啡|年度冠军款。
La Flor Dominicana|La Nox|Toro|6.0|52|Dominican Republic|Mexican San Andrés|Dominican Republic|Dominican Republic|5|黑巧,咖啡,泥土,皮革|圣安德烈斯茄衣。
La Flor Dominicana|Colorado Oscuro|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|胡椒,泥土,咖啡,雪松木|Colorado Oscuro。
Davidoff|Winston Churchill|Churchill|6.9|48|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|4|雪松木,咖啡,皮革,泥土|以丘吉尔命名的高端线。
Davidoff|Winston Churchill|Churchill|7.0|48|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|4|雪松木,咖啡,皮革,泥土|丘吉尔尺寸，雪松木与咖啡为主线，皮革在中后段浮现。
Davidoff|Winston Churchill|Toro|6.0|52|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|4|雪松木,咖啡,可可,皮革|Toro 尺寸，风味浓度集中。
Davidoff|Grand Cru|No.1|6.2|42|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,杏仁,青草|Grand Cru 长尺寸。
Davidoff|Grand Cru|No.2|6.0|44|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,杏仁,蜂蜜|中等。
Davidoff|Grand Cru|No.4|5.0|44|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,杏仁,青草|小尺寸。
Davidoff|Grand Cru|No.5|4.0|42|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,青草,杏仁|极短。
Davidoff|Aniversario|No.1|6.6|42|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|3|雪松木,咖啡,可可,奶油|周年纪念线。
Davidoff|Aniversario|No.2|6.0|52|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|3|雪松木,咖啡,可可,杏仁|中等。
Davidoff|Aniversario|No.3|5.5|50|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|3|雪松木,咖啡,奶油,可可|罗布图。
Davidoff|Aniversario|Special R|4.9|50|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|3|雪松木,咖啡,可可,蜂蜜|特别版。
Davidoff|Millennium|Churchill|7.0|48|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|3|雪松木,可可,坚果,奶油|千禧线。
Davidoff|Millennium|Toro|6.0|52|Dominican Republic|Ecuadorian Habano|Dominican Republic|Dominican Republic|3|雪松木,可可,坚果,蜂蜜|Toro。
Davidoff|Yamasa|Toro|6.0|52|Dominican Republic|Dominican Habano|Dominican Republic|Dominican Republic|3|雪松木,胡椒,蜂蜜,柑橘|雅玛萨，柑橘与胡椒跳跃。
Davidoff|Yamasa|Petit Churchill|4.5|48|Dominican Republic|Dominican Habano|Dominican Republic|Dominican Republic|3|雪松木,胡椒,蜂蜜,花香|短丘吉尔。
Davidoff|Nicaragua|Robusto|5.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|大卫杜夫的尼加拉瓜版本。
Davidoff|Nicaragua|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|Toro。
Davidoff|Escurio|Robusto|5.0|50|Dominican Republic|Habano|Dominican Republic|Brazil|4|可可,咖啡,泥土,胡椒|加入巴西烟叶，风格独特。
Davidoff|Escurio|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Brazil|4|可可,咖啡,泥土,雪松木|Toro。
Davidoff|Colorado Claro|Robusto|5.0|50|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,咖啡,可可,坚果|Colorado Claro 茄衣。
Davidoff|Signature|No.1|5.0|40|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,青草,杏仁|Signature 线。
Davidoff|Signature|No.2|4.4|38|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,杏仁,青草|小尺寸。
Davidoff|Signature|Toro|6.0|52|Dominican Republic|Connecticut Shade|Dominican Republic|Dominican Republic|2|雪松木,奶油,杏仁,蜂蜜|Toro。
Davidoff|Special Series|Special 'T'|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,可可,咖啡,奶油|特别系列。
Davidoff|Special Series|Special 'R'|4.9|50|Dominican Republic|Habano|Dominican Republic|Dominican Republic|3|雪松木,可可,咖啡,杏仁|罗布图。

# ── 美国 / 其他产区
Tatuaje|Selección de Cazadores|Toro|6.0|50|United States|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,咖啡,可可|Cazadores 系列。
Tatuaje|Verocu|Toro|6.0|52|United States|Habano|Nicaragua|Nicaragua|5|胡椒,泥土,咖啡,皮革|Verocu 浓度高。
Tatuaje|Tattoo|Toro|6.0|50|United States|Habano|Nicaragua|Nicaragua|3|雪松木,可可,咖啡,青草|Tattoo 系列。
Tatuaje|Miami|Robusto|5.0|50|United States|Habano|Nicaragua|Nicaragua|4|胡椒,雪松木,可可,咖啡|迈阿密手工。
Tatuaje|Cabinet|Toro|6.0|50|United States|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|Cabinet 系列。
Caldwell|Long Live the King|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,胡椒|Caldwell 代表作。
Caldwell|Blind Man's Bluff|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,胡椒,咖啡,泥土|Blind Man's Bluff。
Caldwell|Anastasia|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,蜂蜜|Anastasia。
Warped|Flor del Valle|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|Warped 主线。
Warped|Guardian of the Farm|Toro|6.0|50|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,泥土,咖啡|GoTF。
Warped|Maestro del Tiempo|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,蜂蜜|Maestro del Tiempo。
Foundation|Charter Oak|Toro|6.0|52|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|3|雪松木,可可,咖啡,泥土|Charter Oak。
Foundation|Tabernacle|Toro|6.0|54|Nicaragua|Connecticut Broadleaf|Nicaragua|Nicaragua|5|黑巧,咖啡,泥土,胡椒|Tabernacle，浓郁。
Foundation|Highclere Castle|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|3|雪松木,奶油,杏仁,蜂蜜|Highclere Castle。
Foundation|Oliva V Melanio|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,杏仁|联名系列。
Illusione|Epernay|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|Epernay。
Illusione|~88~|Robusto|5.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|~88~ 系列。
Illusione|Fume d'Amour|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,蜂蜜|Fume d'Amour。
Room101|Daruma|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,胡椒|Daruma。
Room101|Big Payback|Toro|6.0|52|Nicaragua|Habano|Nicaragua|Nicaragua|4|雪松木,可可,咖啡,泥土|Big Payback。
E.P. Carrillo|Pledge|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Nicaragua|5|胡椒,泥土,黑巧,咖啡|年度冠军款，强度高。
E.P. Carrillo|Encore|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Nicaragua|4|雪松木,可可,咖啡,胡椒|Encore。
E.P. Carrillo|La Historia|Toro|6.0|52|Dominican Republic|Mexican San Andrés|Dominican Republic|Nicaragua|4|可可,咖啡,泥土,胡椒|La Historia。
E.P. Carrillo|New Wave|Toro|6.0|50|Dominican Republic|Connecticut Shade|Dominican Republic|Nicaragua|2|青草,奶油,杏仁,雪松木|清淡线。
Aging Room|Quattro|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,胡椒|Quattro。
Aging Room|F55|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,泥土|F55。
Aging Room|Bin No.2|Toro|6.0|52|Dominican Republic|Habano|Dominican Republic|Dominican Republic|4|雪松木,可可,咖啡,蜂蜜|Bin 系列。
`

/** 把「|」分隔的紧凑行转成 CSV 对象 */
function parseCompact(text) {
  const rows = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const p = line.split('|').map((x) => x.trim())
    if (p.length < 12) {
      throw new Error(`字段数不足（${p.length}）：${line.slice(0, 60)}`)
    }
    rows.push({
      Brand: p[0], Line: p[1], Vitola: p[2],
      Length_Inch: p[3], Ring_Gauge: p[4], Origin: p[5],
      Wrapper: p[6], Binder: p[7], Filler: p[8], Strength_1_5: p[9],
      Main_Flavors: p[10], Description: p[11],
      Price: p[12] ?? '', Rating: p[13] ?? '',
    })
  }
  return rows
}

/** 规范 CSV 输出：全部字段加引号，内部引号写成 "" */
function toCsv(rows) {
  const header = ['Brand', 'Line', 'Vitola', 'Length_Inch', 'Ring_Gauge', 'Origin', 'Wrapper', 'Binder', 'Filler', 'Strength_1_5', 'Main_Flavors', 'Description']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [header.map(esc).join(',')]
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(','))
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------- 执行
const existing = existsSync(CSV_PATH) ? parseExisting(readFileSync(CSV_PATH, 'utf8')) : []
const extra = parseCompact(EXTRA)

// 以 (Brand, Line, Vitola) 为幂等键合并；已存在的保留原描述（原始资料优先）
const map = new Map()
const key = (r) => `${String(r.Brand).toLowerCase()}|${String(r.Line).toLowerCase()}|${String(r.Vitola).toLowerCase()}`
for (const r of existing) map.set(key(r), r)

let added = 0
let skipped = 0
for (const r of extra) {
  const k = key(r)
  if (map.has(k)) { skipped++; continue }
  map.set(k, r)
  added++
}

const merged = [...map.values()]
writeFileSync(CSV_PATH, toCsv(merged), 'utf8')

// 参考价与评分单独成文件（原 CSV 的 12 列结构保持不变，向后兼容）。
// seed 导入时再按 (品牌, 系列, 型号) 合并进库。
const enrich = {}
for (const r of extra) {
  if (!r.Price && !r.Rating) continue
  enrich[key(r)] = {
    brand: r.Brand, line: r.Line, vitola: r.Vitola,
    priceCny: r.Price ? Number(r.Price) : null,
    rating: r.Rating ? Number(r.Rating) : null,
  }
}
const ENRICH_PATH = join(ROOT, 'database', 'seed', 'cigar-enrichment.json')
writeFileSync(ENRICH_PATH, JSON.stringify({
  _comment: '参考价与综合评分的估算值。仅作站内参考，非交易报价；缺项表示无可靠依据，前端显示「暂无」。',
  _generated_by: 'scripts/build-cigar-dataset.mjs',
  count: Object.keys(enrich).length,
  items: enrich,
}, null, 2) + '\n', 'utf8')
console.log(`  参考价/评分补充 ${Object.keys(enrich).length} 条 → ${ENRICH_PATH.replace(ROOT + '/', '')}`)

// 统计
const byOrigin = {}
for (const r of merged) byOrigin[r.Origin] = (byOrigin[r.Origin] || 0) + 1
console.log(`✓ 已写入 ${CSV_PATH.replace(ROOT + '/', '')}`)
console.log(`  原有 ${existing.length} 款 · 本次新增 ${added} 款 · 跳过重复 ${skipped} 款 · 合计 ${merged.length} 款`)
console.log('  产地分布：', JSON.stringify(byOrigin))
console.log('  品牌数：', new Set(merged.map((r) => r.Brand)).size)
