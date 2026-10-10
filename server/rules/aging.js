/**
 * 醇化（Aging）计算规则库（新增能力）
 *
 * 模型说明 —— 这是经验模型，不是精确科学，界面上必须如实标注：
 *   1. 基础窗口按浓郁度分档：越浓郁的雪茄，最佳品吸窗口越晚、越长
 *      （浓郁款需要更长时间让单宁与氨味平复）
 *   2. 环境修正：湿度/温度长期偏离理想区间会显著拖慢或损害醇化
 *   3. 输出「从今天算起还需要多久」而不是绝对年份，对用户更有用
 */

/** 各浓郁度档位的最佳醇化窗口（月），[起始, 结束] */
const BASE_WINDOW = {
  1: [0, 12],      // 清淡：出厂即可抽，越放越淡
  2: [3, 24],
  3: [12, 48],
  4: [24, 84],
  5: [36, 144],
}

export const IDEAL = {
  humidity: { min: 62, max: 72, target: '65-72%' },
  temperature: { min: 16, max: 20, target: '16-20℃' },
}

export const STATUS = {
  fresh:      { label: '新茄期',   tone: 'neutral' },
  aging:      { label: '醇化中',   tone: 'gold' },
  peak:       { label: '最佳窗口', tone: 'safe' },
  'past-peak': { label: '已过巅峰', tone: 'danger' },
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function toMonths(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return unit === 'years' ? Math.round(n * 12) : Math.round(n)
}

/**
 * @param {object} input
 * @param {number} input.strength            1-5 浓郁度
 * @param {number} [input.currentAgeMonths]  已醇化月数
 * @param {number} [input.currentAgeYears]   已醇化年数（与上者二选一）
 * @param {number} [input.humidity]          当前养护湿度 %
 * @param {number} [input.temperature]       当前养护温度 ℃
 */
export function calcAging(input = {}) {
  const strength = Math.min(5, Math.max(1, Math.round(Number(input.strength) || 3)))

  let ageMonths = null
  if (input.currentAgeMonths !== undefined && input.currentAgeMonths !== null && input.currentAgeMonths !== '') {
    ageMonths = toMonths(input.currentAgeMonths, 'months')
  } else if (input.currentAgeYears !== undefined && input.currentAgeYears !== null && input.currentAgeYears !== '') {
    ageMonths = toMonths(input.currentAgeYears, 'years')
  }
  if (ageMonths === null) ageMonths = 0

  const humidity = Number.isFinite(Number(input.humidity)) && input.humidity !== '' ? Number(input.humidity) : null
  const temperature = Number.isFinite(Number(input.temperature)) && input.temperature !== '' ? Number(input.temperature) : null

  const [baseFrom, baseTo] = BASE_WINDOW[strength]

  // 环境惩罚：越偏离理想区间，醇化越慢（表现为窗口整体后移）
  let penalty = 0
  const envHumidity = { ok: true, target: IDEAL.humidity.target, message: null }
  const envTemperature = { ok: true, target: IDEAL.temperature.target, message: null }

  if (humidity !== null) {
    if (humidity < IDEAL.humidity.min) {
      penalty += (IDEAL.humidity.min - humidity) * 0.6
      envHumidity.ok = false
      envHumidity.message = `湿度过低（${humidity}%），烟叶油脂难以充分转化，且茄衣有开裂风险`
    } else if (humidity > IDEAL.humidity.max) {
      penalty += (humidity - IDEAL.humidity.max) * 0.8
      envHumidity.ok = false
      envHumidity.message = `湿度过高（${humidity}%），易生霉与虫害，抽吸也会偏堵`
    }
  }

  if (temperature !== null) {
    if (temperature < IDEAL.temperature.min) {
      penalty += (IDEAL.temperature.min - temperature) * 1.5
      envTemperature.ok = false
      envTemperature.message = `温度过低（${temperature}℃），醇化几乎停滞`
    } else if (temperature > IDEAL.temperature.max) {
      penalty += (temperature - IDEAL.temperature.max) * 2.5
      envTemperature.ok = false
      envTemperature.message = `温度过高（${temperature}℃），加速老化并显著提升虫害风险`
    }
  }

  const penaltyMonths = Math.round(penalty)
  const peakFrom = baseFrom + penaltyMonths
  const peakTo = baseTo + penaltyMonths

  let status
  if (ageMonths < peakFrom) status = 'fresh'
  else if (ageMonths <= peakTo) status = 'peak'
  else status = 'past-peak'
  // 未到起始窗口但已接近（差 3 个月内）仍算「醇化中」，避免刚入手就被叫「新茄」
  if (status === 'fresh' && peakFrom - ageMonths <= 3 && ageMonths > 0) status = 'aging'

  // 距离最佳窗口起始还有多久
  let monthsToPeak = Math.max(0, peakFrom - ageMonths)
  const yearsToPeak = round1(monthsToPeak / 12)

  const advice = []
  if (status === 'fresh') {
    advice.push(`再静养约 ${monthsToPeak} 个月（约 ${yearsToPeak} 年）进入最佳窗口。`)
    advice.push('新茄期普遍偏「冲」：氨味与青涩感明显，耐心是唯一捷径。')
    if (strength >= 4) advice.push('这款属浓郁档，建议至少静养 2 年以上再评价，前期抽吸容易误判。')
    else advice.push('清淡档不建议久放，风味会随时间变淡，可先抽一支建立基准。')
  } else if (status === 'aging') {
    advice.push(`已接近最佳窗口，再过约 ${monthsToPeak} 个月达到起点。`)
    advice.push('每 3 个月抽一支做纵向记录，这比任何攻略都更能建立你自己的判断。')
  } else if (status === 'peak') {
    advice.push('已处于最佳品吸窗口，现在抽是最划算的。')
    advice.push('不必一次抽完：每季度复查一次，观察是否开始走弱。')
  } else {
    advice.push('已超过最佳窗口，风味可能开始衰减（木香变淡、余韵变短）。')
    advice.push('建议尽快品吸，或降低温度至 16℃ 延缓衰减。')
    if (strength <= 2) advice.push('清淡款过峰后衰减非常快，不建议继续陈放。')
  }

  if (!envHumidity.ok && envHumidity.message) advice.push(envHumidity.message + '。')
  if (!envTemperature.ok && envTemperature.message) advice.push(envTemperature.message + '。')
  if (envHumidity.ok && envTemperature.ok && humidity !== null && temperature !== null) {
    advice.push('当前温湿度都在理想区间，保持稳定比追求精确数值更重要。')
  }

  return {
    strength,
    currentAgeMonths: ageMonths,
    baseWindowMonths: [baseFrom, baseTo],
    penaltyMonths,
    peakFromMonths: peakFrom,
    peakToMonths: peakTo,
    monthsToPeak,
    yearsToPeak,
    status,
    statusLabel: STATUS[status].label,
    statusTone: STATUS[status].tone,
    advice,
    environment: { humidity: envHumidity, temperature: envTemperature },
    disclaimer: '本结果为基于浓郁度与环境参数的经验估算，实际醇化进程受烟叶批次、仓储历史等影响，仅供参考。',
  }
}

export const STRENGTH_LABELS = {
  1: '清淡', 2: '中淡', 3: '中等', 4: '浓郁', 5: '极浓郁',
}
