/**
 * 病害诊断规则库（从 src/components/CigarDiagnostic.vue 的硬编码迁移而来）
 * 迁移目的：把「前端写死的知识」变成「服务端可维护的数据」，前端不再硬编码题目与结论。
 */

export const SEVERITY = {
  mild:     { label: '轻度', percent: 25, tone: 'warning' },
  moderate: { label: '中度', percent: 55, tone: 'warning' },
  severe:   { label: '重度', percent: 90, tone: 'danger' },
  confirm:  { label: '安全', percent: 5,  tone: 'safe' },
}

export const TONE_BY_SEVERITY = {
  mild: 'warning',
  moderate: 'warning',
  severe: 'danger',
  confirm: 'safe',
}

export const QUESTIONS = [
  {
    id: 1,
    question: '你看到了什么？',
    type: 'grid',
    options: [
      { value: 'mold',    icon: '🦠', label: '白色/灰色毛状物',   desc: '可能是发霉' },
      { value: 'beetles', icon: '🐛', label: '小虫/粉末/虫眼',     desc: '可能是雪茄虫' },
      { value: 'dry',     icon: '🌵', label: '茄衣开裂/干硬',      desc: '可能是太干了' },
      { value: 'plume',   icon: '✨', label: '均匀结晶闪亮粉末',   desc: '可能是起灰' },
    ],
  },
  {
    id: 2,
    question: '霉菌分布在哪里？',
    type: 'list',
    dependsOn: { questionId: 1, value: 'mold' },
    options: [
      { value: 'mild',     icon: '🔍', label: '零星小白点',   desc: '直径<2mm，仅在表面1-2处' },
      { value: 'moderate', icon: '⚠️', label: '片状灰白斑',   desc: '覆盖面积<30%，未触及茄脚' },
      { value: 'severe',   icon: '🚨', label: '大面积覆盖',   desc: '菌丝已侵入茄脚切口，有霉味' },
    ],
  },
  {
    id: 3,
    question: '虫害严重程度？',
    type: 'list',
    dependsOn: { questionId: 1, value: 'beetles' },
    options: [
      { value: 'mild',     icon: '🔍', label: '发现1-2只虫',        desc: '雪茄表面无肉眼可见虫眼' },
      { value: 'moderate', icon: '⚠️', label: '3-5只虫+针孔虫眼',   desc: '个别雪茄有小洞' },
      { value: 'severe',   icon: '🚨', label: '大量虫+粉末碎屑',    desc: '严重蔓延' },
    ],
  },
  {
    id: 4,
    question: '干裂到什么程度？',
    type: 'list',
    dependsOn: { questionId: 1, value: 'dry' },
    options: [
      { value: 'mild',     icon: '🔍', label: '茄衣轻微起皱',      desc: '湿度可能低于60%' },
      { value: 'moderate', icon: '⚠️', label: '茄帽附近细微裂纹',   desc: '湿度低于55%已持续数周' },
      { value: 'severe',   icon: '🚨', label: '茄衣大范围开裂',    desc: '湿度低于50%，结构受损' },
    ],
  },
  {
    id: 5,
    question: '确认以下特征：',
    type: 'list',
    dependsOn: { questionId: 1, value: 'plume' },
    options: [
      { value: 'confirm', icon: '✅', label: '确认是结晶状不扩散', desc: '均匀分布、闪亮、无异味' },
    ],
  },
]

/** 第二题的行 id 与第一题选项的映射（前端按 dependsOn 过滤即可，此处保留兼容） */
export const SECOND_QUESTION_BY_TYPE = {
  mold: 2, beetles: 3, dry: 4, plume: 5,
}

export const DIAGNOSES = {
  mold: {
    mild: {
      icon: '🔬', title: '轻度霉菌', subtitle: '发现得早，很容易挽救', survival: 95,
      steps: [
        '用干净的超细纤维布轻轻擦拭霉点（一次性动作，不要来回摩擦）',
        '放入隔离密封袋（留 1cm 开口），湿度调至 65% RH',
        '隔离观察 2 周，如无复发即可恢复正常养护',
        '检查同盒其他雪茄，一并隔离观察',
      ],
    },
    moderate: {
      icon: '⚠️', title: '中度霉菌', subtitle: '需要药物干涉，但大概率能救', survival: 70,
      steps: [
        '准备食品级白兰地（40 度，勿用威士忌）和医用棉签',
        '棉签蘸白兰地后挤至半干，以霉点为中心由内向外打圈擦拭',
        '每擦一次换一根新棉签，切勿重复使用',
        '擦拭后在通风暗处风干 12-24 小时',
        '用雪松木片包裹，湿度 62-65% 养护 4 周再抽吸',
      ],
    },
    severe: {
      icon: '🚨', title: '重度霉菌', subtitle: '有一定希望，但要有心理准备', survival: 40,
      steps: [
        '按中度霉菌步骤进行白兰地擦拭（全茄面处理）',
        '风干 24 小时后，检查茄脚切面是否有菌丝渗入',
        '如已渗入茄芯 → 不建议抽吸，考虑拆解保留烟叶做散装醇化实验',
        '如仅在表面 → 湿度降至 62% 养护 8 周',
        '无论如何，立刻清洁整个醇化柜（白醋擦拭内壁，暴晒木架）',
      ],
    },
  },
  beetles: {
    mild: {
      icon: '🐛', title: '一级虫害', subtitle: '单个虫害，能控制', survival: 90,
      steps: [
        '将受影响雪茄放入双层真空密封袋，排尽空气',
        '-18℃ 冷冻 24 小时 → 4℃ 冷藏 24 小时 → 室温回温 24 小时',
        '开封后检查是否还有活虫，重复一次冷冻流程（杀灭虫卵）',
        '2 周后再抽吸，并隔离观察其余雪茄',
      ],
    },
    moderate: {
      icon: '⚠️', title: '二级虫害', subtitle: '蔓延风险高，尽快处理', survival: 60,
      steps: [
        '将有虫眼的雪茄单独挑出（虫眼意味着内部已有隧道）',
        '所有同盒雪茄按一级虫害方案冷冻（-18℃ 48h + 冷藏 24h + 回温 48h）',
        '清洁所有养护盒和白松木片（白醋 + 暴晒）',
        '一个月后重复一次冷冻流程',
        '严重虫眼的雪茄不建议抽吸',
      ],
    },
    severe: {
      icon: '🚨', title: '三级虫害', subtitle: '整盒报废风险极高', survival: 10,
      steps: [
        '将虫蛀严重的雪茄直接丢弃（用密封袋扎紧再扔，防止虫卵扩散）',
        '未被虫蛀的雪茄按二级虫害方案处理（双倍冷冻时间）',
        '彻底清洁所有养护设备，必要时更换雪松木内衬',
        '全柜降温至 16℃，降湿至 62%，持续观察 3 个月',
      ],
    },
  },
  dry: {
    mild: {
      icon: '🌵', title: '轻度干旱', subtitle: '补水即可恢复', survival: 95,
      steps: [
        '将湿度缓慢提升至 68% RH（用 Boveda 69% 包，切勿直接喷水）',
        '至少养护 2 周，让烟叶自然吸收水分',
        '如果茄衣依然有弹性，可以逐渐恢复正常吸食',
        '切勿直接将干雪茄放入高湿环境（茄衣会因吸水过快而爆裂）',
      ],
    },
    moderate: {
      icon: '⚠️', title: '中度干旱', subtitle: '需要长期恢复', survival: 75,
      steps: [
        '将雪茄放入密封袋，同时放入 Boveda 72% 包，封袋养护',
        '每周检查一次：如果茄衣恢复弹性，转回 68% 进一步养护',
        '整个过程需要 4-8 周，不要着急',
        '严重裂纹处可以用少量雪茄胶（Cigar Glue）修补',
      ],
    },
    severe: {
      icon: '🚨', title: '重度干旱', subtitle: '结构已受损', survival: 30,
      steps: [
        '采用湿度梯度提升法：先放 62% 包 × 1 周 → 65% 包 × 2 周 → 68% 包 × 4 周',
        '茄衣大范围开裂建议拆解后用于填充或做雪茄烟斗丝',
        '养护环境温度控制在 16-18℃，减缓水分蒸发速度',
        '已开裂的雪茄即使恢复也不建议长期陈化',
      ],
    },
  },
  plume: {
    confirm: {
      icon: '✨', title: '真正起灰（Plume）', subtitle: '恭喜！这是雪茄完美醇化的标志', survival: 100,
      steps: [
        'Plume 不需要任何处理，正常养护即可',
        '用软毛刷轻轻拂去表面结晶即可品吸',
        '这是烟叶油脂自然析出的结晶，是好雪茄的陈年证明',
        '请拍照上传到社区「开花猎人」板块，可申请特殊勋章',
      ],
    },
  },
}

/** 极少数情况：起灰被误判为发霉时给一条纠偏提示 */
export const CONFUSION_HINT = {
  mold: '真霉（Mold）呈毛状、成团、擦掉后茄衣会留下永久污渍；起灰（Plume）是均匀结晶粉末、轻拂即掉。若拿不准，可按发霉处理并隔离观察。',
  plume: '起灰（Plume）是烟叶油脂析出的结晶，闪亮、均匀、不扩散；霉斑呈毛状且会扩散。若发现毛状物请按发霉流程处理。',
}

export const UNKNOWN_DIAGNOSIS = {
  key: 'unknown',
  icon: '❓',
  title: '无法判断',
  subtitle: '请重试或咨询社区专家',
  tone: 'warning',
  survival: 0,
  severity: { level: 'unknown', label: '未知', percent: 0, tone: 'warning' },
  steps: ['建议在社区发帖求助，附上清晰照片（自然光下的茄身与茄脚各一张）'],
  notice: '以上为经验性建议，不构成专业鉴定意见。如涉及高价值雪茄，建议咨询专业人士。',
}

export function answerQuestionnaire(answers = {}) {
  const type = answers['1'] ?? answers[1]
  const level = answers['2'] ?? answers[2] ?? answers['3'] ?? answers[3] ?? answers['4'] ?? answers[4] ?? answers['5'] ?? answers[5]

  const diag = DIAGNOSES[type]?.[level]
  if (!diag) {
    return { key: 'unknown', ...UNKNOWN_DIAGNOSIS }
  }

  const severity = SEVERITY[level] || SEVERITY.mild
  const key = `${type}:${level}`

  return {
    key,
    icon: diag.icon,
    title: diag.title,
    subtitle: diag.subtitle,
    tone: TONE_BY_SEVERITY[level] || 'warning',
    survival: diag.survival,
    severity: { level, ...severity },
    steps: diag.steps,
    notice: '以上为经验性建议，不构成专业鉴定意见。养护数据仅供参考，请结合自身环境判断。',
    hint: CONFUSION_HINT[type] || null,
  }
}
