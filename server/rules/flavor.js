/**
 * 风味人格测试规则库（新增能力）
 *
 * 说明：原项目 monetization/plan.md 提到「风味性格测试」是拉新工具，但没有任何实现。
 * 这里落地为服务端规则：题目 → 加权 → 人格结果。
 * 输入是风味 id 数组，由 POST /api/tools/flavor-test 传入。
 */

/** 题目：每题给若干风味选项（value = flavors.id 或风味英文名，两种都支持） */
export const QUESTIONS = [
  {
    id: 1,
    question: '作为开胃酒，你会先被哪种气息吸引？',
    options: [
      { value: 'Cedar',      label: '雪松木',   category: 'woody' },
      { value: 'Pepper',     label: '胡椒',     category: 'spicy' },
      { value: 'Cocoa',      label: '可可',     category: 'sweet' },
      { value: 'Leather',    label: '皮革',     category: 'earthy' },
      { value: 'Almond',     label: '杏仁',     category: 'nutty' },
      { value: 'Floral',     label: '花香',     category: 'floral' },
    ],
  },
  {
    id: 2,
    question: '中段你最希望出现哪种转折？',
    options: [
      { value: 'Oak',        label: '橡木',     category: 'woody' },
      { value: 'Cinnamon',   label: '肉桂',     category: 'spicy' },
      { value: 'Caramel',    label: '焦糖',     category: 'sweet' },
      { value: 'Earth',      label: '泥土',     category: 'earthy' },
      { value: 'Walnut',     label: '核桃',     category: 'nutty' },
      { value: 'Citrus',     label: '柑橘',     category: 'fresh' },
    ],
  },
  {
    id: 3,
    question: '尾段的余韵你更偏爱？',
    options: [
      { value: 'Sandalwood', label: '檀香木',   category: 'woody' },
      { value: 'Clove',      label: '丁香',     category: 'spicy' },
      { value: 'DarkChocolate', label: '黑巧',  category: 'sweet' },
      { value: 'Moss',       label: '苔藓',     category: 'earthy' },
      { value: 'Peanut',     label: '花生',     category: 'nutty' },
      { value: 'Mint',       label: '薄荷',     category: 'fresh' },
    ],
  },
  {
    id: 4,
    question: '搭配什么饮品时你状态最好？',
    options: [
      { value: 'Toast',      label: '烤面包（配清茶）', category: 'toasty' },
      { value: 'Coffee',     label: '咖啡（配浓缩）',   category: 'sweet' },
      { value: 'Smoke',      label: '烟熏（配泥煤威士忌）', category: 'smoky' },
      { value: 'Cream',      label: '奶油（配拿铁）',   category: 'sweet' },
      { value: 'Grass',      label: '青草（配气泡水）', category: 'fresh' },
      { value: 'Honey',      label: '蜂蜜（配红茶）',   category: 'sweet' },
    ],
  },
  {
    id: 5,
    question: '面对一整柜雪茄，你先拿起哪一支？',
    options: [
      { value: 'Cedar',      label: '结构清晰的经典款', category: 'woody' },
      { value: 'Pepper',     label: '冲击力强的浓郁款', category: 'spicy' },
      { value: 'Vanilla',    label: '顺滑温和的入门款', category: 'sweet' },
      { value: 'Barnyard',   label: '泥土感厚重的陈年款', category: 'earthy' },
      { value: 'Nuts',       label: '坚果调均衡款',     category: 'nutty' },
      { value: 'Mint',       label: '清凉调特殊款',     category: 'fresh' },
    ],
  },
  {
    id: 6,
    question: '你更认可哪种品鉴风格？',
    options: [
      { value: 'Cedar',      label: '严谨记录每一段变化', category: 'woody' },
      { value: 'Cinnamon',   label: '追求强烈记忆点',     category: 'spicy' },
      { value: 'Chocolate',  label: '享受舒适愉悦感',     category: 'sweet' },
      { value: 'Leather',    label: '偏爱沉稳老派风格',   category: 'earthy' },
      { value: 'Almond',     label: '讲究平衡与细节',     category: 'nutty' },
      { value: 'Floral',     label: '喜欢轻盈优雅路线',   category: 'floral' },
    ],
  },
]

export const CATEGORY_LABELS = {
  woody:   '木香',
  spicy:   '辛香',
  sweet:   '甜香',
  earthy:  '土香',
  nutty:   '坚果',
  floral:  '花香',
  fresh:   '清新',
  toasty:  '烘焙',
  smoky:   '烟熏',
  complex: '复合',
}

/** 人格结果：key 为风味大类 */
export const PERSONALITIES = {
  woody: {
    key: 'woody', icon: '🪵', title: '雪松木型鉴赏家',
    description: '你偏好结构清晰、层次分明的雪茄。木香与雪松的骨架让你感到踏实，你不太追求刺激，而是在意一支茄从点燃到尾段是否「讲得通」。',
    traits: ['沉稳', '注重结构', '喜欢记录', '偏爱经典款'],
  },
  spicy: {
    key: 'spicy', icon: '🌶️', title: '胡椒型猎奇者',
    description: '你需要记忆点。胡椒、肉桂、丁香的辛香冲击让你确认「这支茄有性格」。你愿意为一次强烈的风味体验承担风险，也很可能已经抽过不少重口味。',
    traits: ['追求强度', '敢于尝试', '重口味', '偏爱浓郁款'],
  },
  sweet: {
    key: 'sweet', icon: '🍯', title: '蜂蜜型享受派',
    description: '你抽雪茄是为了愉悦，不是为了挑战。可可、焦糖、奶油、蜂蜜的甜香让你放松，也更愿意把雪茄分享给刚入门的朋友。',
    traits: ['享受当下', '友好分享', '偏爱甜香', '入门友好'],
  },
  earthy: {
    key: 'earthy', icon: '🌍', title: '皮革型老派绅士',
    description: '你欣赏时间带来的味道。皮革、泥土、苔藓这类厚重的底层风味让你安心，你大概率对陈年、老批次、老派做工有特别的兴趣。',
    traits: ['沉稳老派', '信任时间', '偏爱陈年', '口味厚重'],
  },
  nutty: {
    key: 'nutty', icon: '🥜', title: '坚果型平衡主义者',
    description: '你在两个极端之间寻找平衡点。杏仁、核桃、烤面包这类坚果与烘焙调让你觉得「刚刚好」，你不喜欢任何单一味道过分突出。',
    traits: ['讲究平衡', '克制', '注重细节', '万金油口味'],
  },
  floral: {
    key: 'floral', icon: '🌸', title: '花香型优雅派',
    description: '你偏爱轻盈、细腻、有留白的风味。花香与淡淡甜感让你觉得高级，你通常不喜欢过于浓重的雪茄，更在意尾韵是否干净。',
    traits: ['偏爱轻盈', '在意尾韵', '优雅路线', '不喜浓重'],
  },
  fresh: {
    key: 'fresh', icon: '🍃', title: '青草型清爽派',
    description: '你喜欢干净利落的风味。柑橘、青草、薄荷的清新调让你感到舒适，你倾向在午后或户外来一支，而不是在深夜的重口味局里。',
    traits: ['清爽干净', '午后派', '偏爱清淡', '在意环境'],
  },
}

export const FALLBACK_PERSONALITY = {
  key: 'balanced', icon: '⚖️', title: '均衡型探索者',
  description: '你的口味分布得很均匀，没有明显偏好的单一大类。这通常意味着你还处在广泛探索阶段，或者你确实对每一种风格都能欣赏。',
  traits: ['口味广泛', '不设限', '仍在探索', '适应力强'],
}

/** 权重：每题等权。返回 0-100 的百分比分数，最大的即为结果 */
export function scoreCategories(selections = []) {
  // selections: [{ category }] 已由调用方解析出 category
  const raw = {}
  let total = 0
  for (const s of selections) {
    const cat = s?.category
    if (!cat || !CATEGORY_LABELS[cat]) continue
    raw[cat] = (raw[cat] || 0) + 1
    total++
  }
  if (total === 0) return []

  return Object.entries(raw)
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABELS[category],
      score: count,
      percent: Math.round((count / total) * 100),
    }))
    // 并列时按分数降序，再按类别名升序，保证结果可复现
    .sort((a, b) => (b.score - a.score) || a.category.localeCompare(b.category))
}

export function resolvePersonality(scores) {
  if (!scores.length) return { ...FALLBACK_PERSONALITY }
  const top = scores[0]
  const byCategory = PERSONALITIES[top.category]
  if (byCategory) return { ...byCategory }
  // 命中 toasty/smoky/complex 等没有专属人格的大类时，用次高分的大类兜底
  for (const s of scores.slice(1)) {
    if (PERSONALITIES[s.category]) return { ...PERSONALITIES[s.category] }
  }
  return { ...FALLBACK_PERSONALITY }
}
