<template>
  <div class="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-8">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl text-cigar-cream sm:text-3xl">品吸笔记</h1>
        <p class="mt-1 text-xs text-cigar-mute">
          <template v-if="loading">正在加载…</template>
          <template v-else-if="loadError">加载失败</template>
          <template v-else>共 {{ total }} 篇真实记录 · 不吹不黑</template>
        </p>
      </div>
      <router-link :to="newReviewTo" class="cc-btn-primary !px-3.5 !py-2 text-xs">✍️ 写品吸笔记</router-link>
    </header>

    <!-- 排序 -->
    <div class="mt-5 flex flex-wrap items-center gap-2">
      <button
        v-for="opt in sortOptions"
        :key="opt.value"
        type="button"
        class="cc-chip"
        :class="{ 'cc-chip-active': sort === opt.value }"
        @click="changeSort(opt.value)"
      >{{ opt.label }}</button>
    </div>

    <!-- 仅看某支雪茄的提示条 -->
    <div
      v-if="cigarFilter"
      class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cigar-gold/40 bg-cigar-gold/10 px-3.5 py-2.5 text-xs text-cigar-gold"
    >
      <span>仅显示这支雪茄的笔记<span v-if="cigarLabel" class="text-cigar-gold/90"> · {{ cigarLabel }}</span></span>
      <button type="button" class="underline hover:no-underline" @click="clearCigarFilter">清除筛选 ✕</button>
    </div>

    <!-- 错误 -->
    <div v-if="loadError" class="cc-card mt-6 p-8 text-center">
      <div class="text-4xl" aria-hidden="true">⚠️</div>
      <p class="mt-3 text-sm text-cigar-cream">{{ loadError }}</p>
      <button class="cc-btn-primary mt-4" @click="load">重试</button>
    </div>

    <!-- 骨架 -->
    <div v-else-if="loading" class="mt-6 space-y-3">
      <div v-for="n in 5" :key="n" class="cc-card p-4">
        <div class="cc-skeleton h-4 w-1/3"></div>
        <div class="cc-skeleton mt-3 h-3 w-full"></div>
        <div class="cc-skeleton mt-2 h-3 w-4/5"></div>
        <div class="cc-skeleton mt-3 h-4 w-1/4"></div>
      </div>
    </div>

    <!-- 列表 -->
    <div v-else-if="items.length" class="mt-6">
      <div class="space-y-3">
        <article v-for="r in items" :key="r.id" class="cc-card p-4 anim-fade-in">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="truncate text-sm font-medium text-cigar-cream">{{ r.title || '无标题笔记' }}</h2>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-cigar-smoke">
                <span>{{ r.username || '匿名' }}</span>
                <span>·</span>
                <span>{{ fmtDate(r.createdAt) }}</span>
                <template v-if="r.cigarLabel">
                  <span>·</span>
                  <router-link :to="'/cigars/' + r.cigarId" class="text-cigar-mute hover:text-cigar-gold">🚬 {{ r.cigarLabel }}</router-link>
                </template>
              </p>
            </div>
            <span class="shrink-0 rounded-lg bg-cigar-gold/15 px-2 py-0.5 text-xs text-cigar-gold">
              {{ fmt(r.overallRating) }}
            </span>
          </div>

          <p class="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-cigar-mute">{{ r.content }}</p>

          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-cigar-light/40 pt-3">
            <router-link :to="'/cigars/' + r.cigarId" class="cc-chip">查看雪茄</router-link>
            <button
              type="button"
              class="cc-chip"
              :class="{ 'cc-chip-active': r.helpfulByMe }"
              :disabled="pending.has(r.id)"
              @click="onHelpful(r)"
            >👍 有用 {{ r.helpfulCount || 0 }}</button>
            <span v-if="r.preScore || r.midScore || r.postScore" class="text-[11px] text-cigar-smoke">
              前 {{ fmt(r.preScore) }} · 中 {{ fmt(r.midScore) }} · 后 {{ fmt(r.postScore) }}
            </span>
          </div>
        </article>
      </div>

      <p v-if="actionTip" class="mt-3 text-center text-xs text-cigar-gold">{{ actionTip }}</p>

      <!-- 分页 -->
      <nav v-if="totalPages > 1" class="mt-8 flex items-center justify-center gap-3" aria-label="分页">
        <button type="button" class="cc-btn-ghost !px-3 !py-2 text-xs" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span class="text-xs text-cigar-mute">第 {{ page }} / {{ totalPages }} 页</span>
        <button type="button" class="cc-btn-ghost !px-3 !py-2 text-xs" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
      </nav>
    </div>

    <!-- 空态 -->
    <div v-else class="mt-6">
      <EmptyState
        icon="✍️"
        :title="cigarFilter ? '这支雪茄还没有笔记' : '还没有人写品吸笔记'"
        description="记录一支雪茄的前中后段变化，比记住它的名字更难，也更有价值。"
        :action-label="cigarFilter ? '写这支雪茄的笔记' : '去写第一篇'"
        :action-to="newReviewTo"
      />
      <div v-if="cigarFilter" class="mt-3 text-center">
        <button type="button" class="text-xs text-cigar-mute underline hover:text-cigar-gold" @click="clearCigarFilter">查看全部笔记</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api/client.js'
import { useAuth } from '@/composables/useAuth.js'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

// 排序项与 docs/API.md §6.1 的 sort 取值一致
const sortOptions = [
  { value: 'helpful', label: '有用最多' },
  { value: 'newest', label: '最新发布' },
  { value: 'rating', label: '评分最高' },
]

const loading = ref(true)
const loadError = ref('')
const items = ref([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const sort = ref('helpful')
const cigarFilter = ref(null)
const cigarLabel = ref('')
const actionTip = ref('')
const pending = ref(new Set())
let reqSeq = 0

const newReviewTo = computed(() =>
  cigarFilter.value ? `/reviews/new?cigarId=${cigarFilter.value}` : '/reviews/new')

function applyQuery(query) {
  const raw = query ?? {}
  // 兼容历史上可能出现的 cigarid 写法
  const cid = raw.cigarId ?? raw.cigarid
  cigarFilter.value = cid ? String(cid) : null
  cigarLabel.value = typeof raw.cigarLabel === 'string' ? raw.cigarLabel : ''
  sort.value = typeof raw.sort === 'string' && sortOptions.some((o) => o.value === raw.sort) ? raw.sort : 'helpful'
  const p = Number(raw.page)
  page.value = Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}

onMounted(() => {
  applyQuery(route.query)
  load()
})

// 避免「自己写地址栏 → 自己再解析一次 → 重复请求」的回环
let selfNavigating = false

watch(() => route.query, (query) => {
  if (route.path !== '/reviews') return
  if (selfNavigating) { selfNavigating = false; return }
  applyQuery(query)
  load()
})

async function load() {
  const seq = ++reqSeq
  loading.value = true
  loadError.value = ''
  actionTip.value = ''
  try {
    const res = await api.reviews({
      cigarId: cigarFilter.value || undefined,
      sort: sort.value,
      page: page.value,
      pageSize: 12,
    })
    if (seq !== reqSeq) return
    items.value = Array.isArray(res?.items) ? res.items : []
    total.value = Number(res?.total) || 0
    totalPages.value = Math.max(1, Number(res?.totalPages) || 1)
    // 后端如果回传了雪茄标签（例如详情页跳转过来），补上提示条文案
    if (!cigarLabel.value && items.value[0]?.cigarLabel) cigarLabel.value = items.value[0].cigarLabel
  } catch (err) {
    if (seq !== reqSeq) return
    items.value = []
    total.value = 0
    totalPages.value = 1
    loadError.value = err?.humanMessage || '笔记列表加载失败'
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}

function syncQuery() {
  const query = {}
  if (cigarFilter.value) query.cigarId = String(cigarFilter.value)
  if (sort.value !== 'helpful') query.sort = sort.value
  if (page.value > 1) query.page = String(page.value)
  selfNavigating = true
  router.replace({ path: '/reviews', query })
}

function changeSort(value) {
  if (value === sort.value) return
  sort.value = value
  page.value = 1
  syncQuery()
  load()
}

function goPage(p) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  syncQuery()
  load()
}

function clearCigarFilter() {
  cigarFilter.value = null
  cigarLabel.value = ''
  page.value = 1
  syncQuery()
  load()
}

async function onHelpful(review) {
  actionTip.value = ''
  if (!auth.isLoggedIn) {
    actionTip.value = '登录后才能标记「有用」'
    return
  }
  if (pending.value.has(review.id)) return
  pending.value = new Set(pending.value).add(review.id)
  try {
    const res = await api.toggleHelpful(review.id)
    if (typeof res?.helpfulCount === 'number') review.helpfulCount = res.helpfulCount
    if (typeof res?.helpfulByMe === 'boolean') review.helpfulByMe = res.helpfulByMe
  } catch (err) {
    actionTip.value = err?.humanMessage || '操作失败，请稍后重试'
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
