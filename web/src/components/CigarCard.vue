<template>
  <router-link
    :to="'/cigars/' + cigar.id"
    class="cc-card group flex flex-col p-3.5 transition-all duration-200 hover:border-cigar-gold/60 hover:bg-cigar-mid/80 active:scale-[0.99]"
    :class="compact ? 'gap-2' : 'gap-2.5'"
  >
    <!-- 品牌 + 系列 / 型号 -->
    <div class="min-w-0">
      <div class="flex items-start gap-2">
        <h3
          class="min-w-0 flex-1 truncate font-display text-cigar-gold"
          :class="compact ? 'text-sm' : 'text-base'"
        >{{ cigar.brand }}</h3>
        <span
          v-if="cigar.rating !== null && cigar.rating !== undefined"
          class="shrink-0 rounded-lg bg-cigar-gold/15 px-2 py-0.5 text-xs font-medium text-cigar-gold"
        >★ {{ Number(cigar.rating).toFixed(1) }}</span>
        <span v-else class="shrink-0 rounded-lg bg-cigar-light/40 px-2 py-0.5 text-xs text-cigar-smoke">暂无评分</span>
      </div>
      <p class="mt-0.5 truncate text-xs text-cigar-mute">
        <span v-if="cigar.series">{{ cigar.series }}</span>
        <span v-if="cigar.series && vitolaText" class="text-cigar-smoke"> · </span>
        <span v-if="vitolaText">{{ vitolaText }}</span>
      </p>
    </div>

    <!-- 产地、浓郁度、尺寸、参考价 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-cigar-mute">
      <span class="inline-flex items-center gap-1">
        <span aria-hidden="true">{{ originFlag }}</span>
        <span>{{ cigar.originLabel || originLabelFallback }}</span>
      </span>

      <span class="inline-flex items-center gap-1" :title="cigar.strengthLabel || ''">
        <span aria-hidden="true" class="tracking-tight">
          <span v-for="n in 5" :key="n" :class="n <= strengthValue ? 'text-cigar-gold' : 'text-cigar-light'">●</span>
        </span>
        <span>{{ cigar.strengthLabel || '—' }}</span>
      </span>

      <span v-if="sizeText" class="inline-flex items-center gap-1">📏 {{ sizeText }}</span>
    </div>

    <!-- 风味标签（最多 4 个） -->
    <div v-if="visibleFlavors.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="f in visibleFlavors"
        :key="f.id ?? f.label"
        class="rounded-full border border-cigar-light bg-cigar-dark/60 px-2 py-0.5 text-[11px] text-cigar-cream"
      >{{ f.label }}</span>
      <span
        v-if="extraFlavorCount > 0"
        class="rounded-full border border-cigar-light/60 px-2 py-0.5 text-[11px] text-cigar-smoke"
      >+{{ extraFlavorCount }}</span>
    </div>

    <!-- 描述（紧凑模式隐藏） -->
    <p v-if="!compact && cigar.description" class="line-clamp-2 text-xs leading-relaxed text-cigar-mute">
      {{ cigar.description }}
    </p>

    <!-- 参考价 -->
    <div v-if="hasPrice" class="flex items-center justify-between border-t border-cigar-light/40 pt-2">
      <span
        class="text-sm font-medium text-cigar-gold"
        title="参考估算价，非交易报价"
      >¥{{ priceText }}</span>
      <span
        v-if="cigar.reviewCount"
        class="text-[11px] text-cigar-smoke"
      >{{ cigar.reviewCount }} 篇笔记</span>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** /api/cigars 列表项结构（见 docs/API.md §2） */
  cigar: { type: Object, required: true },
  /** 紧凑模式：小一号、隐藏描述 */
  compact: { type: Boolean, default: false },
})

// 产地 → 国旗 emoji
const ORIGIN_FLAGS = {
  cuba: '🇨🇺',
  nicaragua: '🇳🇮',
  dominican: '🇩🇴',
  davidoff: '🇨🇭',
  honduras: '🇭🇳',
  usa: '🇺🇸',
}

// 两个产地字段都缺失时的兜底文案（正常情况下 originLabel 由后端下发）
const ORIGIN_LABELS = {
  cuba: '古巴',
  nicaragua: '尼加拉瓜',
  dominican: '多米尼加',
  davidoff: '大卫杜夫',
  honduras: '洪都拉斯',
  usa: '美国',
}

const originFlag = computed(() => ORIGIN_FLAGS[props.cigar.origin] || '🌍')
const originLabelFallback = computed(() => ORIGIN_LABELS[props.cigar.origin] || '其它产地')

const strengthValue = computed(() => {
  const n = Number(props.cigar.strength)
  return Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 0
})

const vitolaText = computed(() => {
  const family = props.cigar.vitolaFamilyLabel || ''
  const vitola = props.cigar.vitola || ''
  if (family && vitola && family !== vitola) return `${family} · ${vitola}`
  return family || vitola || ''
})

const sizeText = computed(() => {
  const parts = []
  if (props.cigar.ringGauge) parts.push(`环径 ${props.cigar.ringGauge}`)
  if (props.cigar.lengthInch) parts.push(`${props.cigar.lengthInch}"`)
  return parts.join(' / ')
})

const flavors = computed(() => (Array.isArray(props.cigar.flavors) ? props.cigar.flavors : []))
const visibleFlavors = computed(() => flavors.value.slice(0, 4))
const extraFlavorCount = computed(() => Math.max(0, flavors.value.length - 4))

const hasPrice = computed(() => props.cigar.priceCny !== null && props.cigar.priceCny !== undefined)
const priceText = computed(() => {
  const n = Number(props.cigar.priceCny)
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
})
</script>
