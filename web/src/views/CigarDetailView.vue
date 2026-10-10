<template>
  <div class="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-8">
    <!-- ===== 加载骨架 ===== -->
    <template v-if="loading">
      <div class="cc-card p-5">
        <div class="cc-skeleton h-7 w-1/2"></div>
        <div class="cc-skeleton mt-3 h-4 w-1/3"></div>
        <div class="cc-skeleton mt-5 h-16 w-full"></div>
      </div>
      <div class="cc-card mt-4 p-5">
        <div class="cc-skeleton h-4 w-1/4"></div>
        <div class="cc-skeleton mt-3 h-20 w-full"></div>
      </div>
    </template>

    <!-- ===== 404 ===== -->
    <template v-else-if="notFound">
      <EmptyState
        icon="🚬"
        title="未找到这支雪茄"
        description="它可能已被下架，或者链接里的编号不对。回数据库看看其它雪茄吧。"
        action-label="返回雪茄数据库"
        action-to="/cigars"
      />
    </template>

    <!-- ===== 加载失败 ===== -->
    <template v-else-if="loadError">
      <div class="cc-card p-8 text-center">
        <div class="text-4xl" aria-hidden="true">⚠️</div>
        <p class="mt-3 text-sm text-cigar-cream">{{ loadError }}</p>
        <button class="cc-btn-primary mt-4" @click="load">重试</button>
      </div>
    </template>

    <!-- ===== 正文 ===== -->
    <template v-else-if="cigar">
      <!-- 头部 -->
      <header class="cc-card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-cigar-mute">{{ cigar.brand }}</p>
            <h1 class="mt-1 font-display text-2xl leading-tight text-cigar-cream">
              {{ cigar.vitola || cigar.series || '雪茄详情' }}
            </h1>
            <p v-if="cigar.series" class="mt-1 text-sm text-cigar-mute">{{ cigar.series }}</p>
          </div>
          <div class="text-right">
            <div v-if="hasRating" class="font-display text-2xl text-cigar-gold">★ {{ Number(cigar.rating).toFixed(1) }}</div>
            <div v-else class="text-xs text-cigar-smoke">暂无评分</div>
            <div v-if="cigar.reviewCount" class="mt-0.5 text-[11px] text-cigar-smoke">{{ cigar.reviewCount }} 篇笔记</div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 text-xs">
          <span class="rounded-full border border-cigar-light px-2.5 py-1 text-cigar-cream">
            {{ originFlag }} {{ cigar.originLabel || '其它产地' }}
          </span>
          <span v-if="cigar.vitolaFamilyLabel" class="rounded-full border border-cigar-light px-2.5 py-1 text-cigar-cream">
            {{ cigar.vitolaFamilyLabel }}
          </span>
          <span class="inline-flex items-center gap-1 rounded-full border border-cigar-light px-2.5 py-1 text-cigar-cream">
            <span class="tracking-tight">
              <span v-for="n in 5" :key="n" :class="n <= strengthValue ? 'text-cigar-gold' : 'text-cigar-light'">●</span>
            </span>
            {{ cigar.strengthLabel || '—' }}
          </span>
        </div>

        <!-- 尺寸 -->
        <dl class="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div class="rounded-xl bg-cigar-dark/50 px-3 py-2.5">
            <dt class="text-cigar-smoke">长度</dt>
            <dd class="mt-0.5 text-cigar-cream">
              {{ cigar.lengthInch ? `${cigar.lengthInch}"` : '—' }}
              <span v-if="cigar.lengthMm" class="text-cigar-mute">/ {{ cigar.lengthMm }} mm</span>
            </dd>
          </div>
          <div class="rounded-xl bg-cigar-dark/50 px-3 py-2.5">
            <dt class="text-cigar-smoke">环径</dt>
            <dd class="mt-0.5 text-cigar-cream">{{ cigar.ringGauge || '—' }}</dd>
          </div>
          <div class="rounded-xl bg-cigar-dark/50 px-3 py-2.5">
            <dt class="text-cigar-smoke">参考价</dt>
            <dd class="mt-0.5 text-cigar-gold">
              <span v-if="hasPrice" title="参考估算价，非交易报价">¥{{ priceText }}</span>
              <span v-else class="text-cigar-smoke">暂无</span>
            </dd>
          </div>
        </dl>
        <p v-if="hasPrice" class="mt-2 text-[11px] leading-relaxed text-cigar-smoke">
          ⓘ 参考估算价，非交易报价。本站不售烟草、不提供任何购买渠道。
        </p>
      </header>

      <!-- 结构：茄衣 / 茄套 / 茄芯 -->
      <section v-if="varietyItems.length" class="cc-card mt-4 p-5">
        <h2 class="font-display text-base text-cigar-cream">烟叶结构</h2>
        <dl class="mt-3 grid gap-2.5 sm:grid-cols-3">
          <div v-for="item in varietyItems" :key="item.label" class="rounded-xl bg-cigar-dark/50 px-3 py-2.5">
            <dt class="text-xs text-cigar-smoke">{{ item.label }}</dt>
            <dd class="mt-0.5 text-sm text-cigar-cream">{{ item.value }}</dd>
          </div>
        </dl>
      </section>

      <!-- 风味标签（全量展示） -->
      <section v-if="flavors.length" class="cc-card mt-4 p-5">
        <h2 class="font-display text-base text-cigar-cream">风味标签</h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="f in flavors"
            :key="f.id ?? f.label"
            class="rounded-full border border-cigar-light bg-cigar-dark/60 px-3 py-1 text-xs text-cigar-cream"
          >{{ f.label }}</span>
        </div>
      </section>

      <!-- 养护建议 -->
      <section v-if="cigar.recommendedHumidity || cigar.recommendedTemperature" class="cc-card mt-4 p-5">
        <h2 class="font-display text-base text-cigar-cream">养护建议</h2>
        <div class="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div v-if="cigar.recommendedHumidity" class="rounded-xl bg-cigar-dark/50 px-3 py-2.5">
            <div class="text-xs text-cigar-smoke">推荐湿度</div>
            <div class="mt-0.5 text-sm text-cigar-cream">{{ cigar.recommendedHumidity }}% RH</div>
          </div>
          <div v-if="cigar.recommendedTemperature" class="rounded-xl bg-cigar-dark/50 px-3 py-2.5">
            <div class="text-xs text-cigar-smoke">推荐温度</div>
            <div class="mt-0.5 text-sm text-cigar-cream">{{ cigar.recommendedTemperature }} ℃</div>
          </div>
        </div>
        <p class="mt-3 text-[11px] leading-relaxed text-cigar-smoke">
          ⓘ 经验性建议，实际请结合茄房状态与个人口味微调。
        </p>
      </section>

      <!-- 描述 -->
      <section v-if="cigar.description" class="cc-card mt-4 p-5">
        <h2 class="font-display text-base text-cigar-cream">简介</h2>
        <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-cigar-mute">{{ cigar.description }}</p>
      </section>

      <!-- ===== 品吸笔记 ===== -->
      <section class="mt-8">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h2 class="font-display text-lg text-cigar-cream">
            品吸笔记
            <span class="ml-1 text-xs text-cigar-smoke">{{ reviewSummary.count ?? reviews.length }} 篇</span>
          </h2>
          <router-link :to="'/reviews/new?cigarId=' + cigar.id" class="cc-btn-primary !px-3.5 !py-2 text-xs">✍️ 写品吸笔记</router-link>
        </div>

        <!-- 三段评分概览 -->
        <div v-if="reviewSummary.count" class="mt-3 flex flex-wrap gap-2 text-xs text-cigar-mute">
          <span class="rounded-full border border-cigar-light px-3 py-1">总体 {{ fmt(reviewSummary.avgOverall) }}</span>
          <span class="rounded-full border border-cigar-light px-3 py-1">前段 {{ fmt(reviewSummary.avgPre) }}</span>
          <span class="rounded-full border border-cigar-light px-3 py-1">中段 {{ fmt(reviewSummary.avgMid) }}</span>
          <span class="rounded-full border border-cigar-light px-3 py-1">后段 {{ fmt(reviewSummary.avgPost) }}</span>
        </div>

        <p v-if="actionTip" class="mt-3 rounded-xl border border-cigar-gold/40 bg-cigar-gold/10 px-3 py-2 text-xs text-cigar-gold">
          {{ actionTip }}
        </p>

        <div v-if="reviews.length" class="mt-4 space-y-3">
          <article v-for="r in reviews" :key="r.id" class="cc-card p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="truncate text-sm font-medium text-cigar-cream">{{ r.title || '无标题笔记' }}</h3>
                <p class="mt-0.5 text-[11px] text-cigar-smoke">
                  {{ r.username || '匿名' }} · {{ fmtDate(r.createdAt) }}
                </p>
              </div>
              <span class="shrink-0 rounded-lg bg-cigar-gold/15 px-2 py-0.5 text-xs text-cigar-gold">
                {{ fmt(r.overallRating) }} / 10
              </span>
            </div>

            <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-cigar-mute">{{ r.content }}</p>

            <div class="mt-3 flex flex-wrap gap-2 text-[11px] text-cigar-smoke">
              <span class="rounded-full border border-cigar-light/70 px-2.5 py-0.5">前段 {{ fmt(r.preScore) }}</span>
              <span class="rounded-full border border-cigar-light/70 px-2.5 py-0.5">中段 {{ fmt(r.midScore) }}</span>
              <span class="rounded-full border border-cigar-light/70 px-2.5 py-0.5">后段 {{ fmt(r.postScore) }}</span>
              <span v-if="r.smokingTime" class="rounded-full border border-cigar-light/70 px-2.5 py-0.5">⏱ {{ r.smokingTime }} 分钟</span>
              <span v-if="r.pairing" class="rounded-full border border-cigar-light/70 px-2.5 py-0.5">🥃 {{ r.pairing }}</span>
            </div>

            <div class="mt-3 border-t border-cigar-light/40 pt-3">
              <button
                type="button"
                class="cc-chip"
                :class="{ 'cc-chip-active': r.helpfulByMe }"
                :disabled="pending.has(r.id)"
                @click="onHelpful(r)"
              >👍 有用 {{ r.helpfulCount || 0 }}</button>
            </div>
          </article>
        </div>

        <EmptyState
          v-else
          icon="✍️"
          title="还没有品吸笔记"
          description="成为第一个记录这支雪茄的人，你的三段评分对后来者很有参考价值。"
          action-label="写第一篇"
          :action-to="'/reviews/new?cigarId=' + cigar.id"
        />
      </section>

      <!-- ===== 相关推荐 ===== -->
      <section v-if="related.length" class="mt-10">
        <h2 class="mb-4 font-display text-lg text-cigar-cream">相关推荐</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CigarCard v-for="c in related" :key="c.id" :cigar="c" compact />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client.js'
import { useAuth } from '@/composables/useAuth.js'
import CigarCard from '@/components/CigarCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const auth = useAuth()

const loading = ref(true)
const loadError = ref('')
const notFound = ref(false)
const cigar = ref(null)
const reviews = ref([])
const related = ref([])
const reviewSummary = ref({})
const actionTip = ref('')
const pending = ref(new Set())

const ORIGIN_FLAGS = {
  cuba: '🇨🇺', nicaragua: '🇳🇮', dominican: '🇩🇴',
  davidoff: '🇨🇭', honduras: '🇭🇳', usa: '🇺🇸',
}
const originFlag = computed(() => ORIGIN_FLAGS[cigar.value?.origin] || '🌍')

const strengthValue = computed(() => {
  const n = Number(cigar.value?.strength)
  return Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 0
})

const hasRating = computed(() => cigar.value?.rating !== null && cigar.value?.rating !== undefined)
const hasPrice = computed(() => cigar.value?.priceCny !== null && cigar.value?.priceCny !== undefined)
const priceText = computed(() => {
  const n = Number(cigar.value?.priceCny)
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
})

const flavors = computed(() => (Array.isArray(cigar.value?.flavors) ? cigar.value.flavors : []))

// 茄衣 / 茄套 / 茄芯：值为 null 的项直接不渲染
const varietyItems = computed(() => {
  const c = cigar.value
  if (!c) return []
  return [
    { label: '茄衣 Wrapper', value: c.wrapperVariety },
    { label: '茄套 Binder', value: c.binderVariety },
    { label: '茄芯 Filler', value: c.fillerVariety },
  ].filter((i) => i.value)
})

onMounted(load)
watch(() => route.params.id, () => {
  if (route.name === 'cigar-detail') load()
})

async function load() {
  loading.value = true
  loadError.value = ''
  notFound.value = false
  actionTip.value = ''
  try {
    const res = await api.cigar(route.params.id)
    cigar.value = res?.cigar ?? null
    reviews.value = Array.isArray(res?.reviews) ? res.reviews : []
    related.value = Array.isArray(res?.related) ? res.related : []
    reviewSummary.value = res?.cigar?.reviewSummary ?? {}
    if (!cigar.value) notFound.value = true
  } catch (err) {
    cigar.value = null
    if (err?.status === 404) notFound.value = true
    else loadError.value = err?.humanMessage || '详情加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function onHelpful(review) {
  actionTip.value = ''
  if (!auth.isLoggedIn) {
    actionTip.value = '登录后才能标记「有用」，点右上角登录即可。'
    return
  }
  if (pending.value.has(review.id)) return
  pending.value = new Set(pending.value).add(review.id)
  try {
    // 幂等切换：服务端返回权威计数
    const res = await api.toggleHelpful(review.id)
    if (typeof res?.helpfulCount === 'number') review.helpfulCount = res.helpfulCount
    if (typeof res?.helpfulByMe === 'boolean') review.helpfulByMe = res.helpfulByMe
  } catch (err) {
    if (err?.status === 401) actionTip.value = '登录状态已过期，请重新登录。'
    else actionTip.value = err?.humanMessage || '操作失败，请稍后重试'
  } finally {
    const next = new Set(pending.value)
    next.delete(review.id)
    pending.value = next
  }
}

function fmt(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>
