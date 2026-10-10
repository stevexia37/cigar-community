<template>
  <div class="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-12">
    <!-- ===== Hero ===== -->
    <section class="anim-slide-up">
      <p class="inline-flex items-center gap-1.5 rounded-full border border-cigar-light px-3 py-1 text-[11px] text-cigar-mute">
        <span class="h-1.5 w-1.5 rounded-full bg-cigar-gold" aria-hidden="true"></span>
        非交易向 · 18+ 知识社区
      </p>

      <h1 class="mt-4 font-display text-3xl leading-tight text-cigar-cream sm:text-4xl">
        不卖茄，<span class="text-cigar-gold">只聊干货</span>
      </h1>
      <p class="mt-3 max-w-xl text-sm leading-relaxed text-cigar-mute">
        雪茄数据库、病害诊断、醇化计算与真实品吸笔记。<br class="hidden sm:block" />
        没有购买链接，没有代购私聊，只有一群认真抽茄的人。
      </p>

      <!-- 数据库条数 -->
      <div class="mt-6 flex flex-wrap gap-2.5">
        <template v-if="metaLoading">
          <div v-for="n in 4" :key="n" class="cc-skeleton h-14 w-24"></div>
        </template>
        <template v-else>
          <div v-for="stat in statItems" :key="stat.label" class="cc-card px-4 py-2.5">
            <div class="font-display text-xl text-cigar-gold">{{ stat.value }}</div>
            <div class="text-[11px] text-cigar-mute">{{ stat.label }}</div>
          </div>
        </template>
      </div>
      <p v-if="metaError" class="mt-2 text-xs text-cigar-smoke">{{ metaError }}</p>

      <div class="mt-7 flex flex-wrap gap-3">
        <router-link to="/cigars" class="cc-btn-primary px-5">📚 进雪茄数据库</router-link>
        <router-link to="/tools/diagnostic" class="cc-btn-ghost px-5">🩺 病害一键诊断</router-link>
      </div>
    </section>

    <!-- ===== 工具入口 ===== -->
    <section class="mt-12">
      <h2 class="mb-4 font-display text-lg text-cigar-cream">工具台</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <router-link
          v-for="tool in tools"
          :key="tool.to"
          :to="tool.to"
          class="cc-card p-4 transition-all duration-200 hover:border-cigar-gold/60 hover:bg-cigar-mid/80 active:scale-[0.99]"
        >
          <div class="text-2xl" aria-hidden="true">{{ tool.icon }}</div>
          <h3 class="mt-2.5 text-sm font-medium text-cigar-cream">{{ tool.title }}</h3>
          <p class="mt-1 text-xs leading-relaxed text-cigar-mute">{{ tool.desc }}</p>
          <span class="mt-3 inline-block text-xs text-cigar-gold">进入 →</span>
        </router-link>
      </div>
    </section>

    <!-- ===== 热门雪茄 ===== -->
    <section class="mt-12">
      <div class="mb-4 flex items-end justify-between gap-3">
        <h2 class="font-display text-lg text-cigar-cream">热门雪茄</h2>
        <router-link to="/cigars?sort=rating" class="text-xs text-cigar-mute hover:text-cigar-gold">全部 →</router-link>
      </div>

      <div v-if="cigarsLoading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="cc-card p-3.5">
          <div class="cc-skeleton h-5 w-2/3"></div>
          <div class="cc-skeleton mt-2 h-3 w-1/2"></div>
          <div class="cc-skeleton mt-3 h-3 w-full"></div>
          <div class="cc-skeleton mt-2 h-8 w-full"></div>
        </div>
      </div>

      <div v-else-if="cigarsError" class="cc-card p-6 text-center">
        <p class="text-sm text-cigar-mute">{{ cigarsError }}</p>
        <button class="cc-btn-ghost mt-3" @click="loadCigars">重试</button>
      </div>

      <div v-else-if="cigars.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CigarCard v-for="c in cigars" :key="c.id" :cigar="c" compact />
      </div>

      <EmptyState
        v-else
        icon="📚"
        title="数据库还是空的"
        description="后端已就绪但还没有雪茄数据，先跑一次 seed 或提报第一支吧。"
        action-label="去提报数据"
        action-to="/submit"
      />
    </section>

    <!-- ===== 最新品吸笔记 ===== -->
    <section class="mt-12">
      <div class="mb-4 flex items-end justify-between gap-3">
        <h2 class="font-display text-lg text-cigar-cream">最新品吸笔记</h2>
        <router-link to="/reviews" class="text-xs text-cigar-mute hover:text-cigar-gold">全部 →</router-link>
      </div>

      <div v-if="reviewsLoading" class="space-y-3">
        <div v-for="n in 3" :key="n" class="cc-card p-4">
          <div class="cc-skeleton h-4 w-1/3"></div>
          <div class="cc-skeleton mt-2.5 h-3 w-full"></div>
          <div class="cc-skeleton mt-2 h-3 w-4/5"></div>
        </div>
      </div>

      <div v-else-if="reviewsError" class="cc-card p-6 text-center">
        <p class="text-sm text-cigar-mute">{{ reviewsError }}</p>
        <button class="cc-btn-ghost mt-3" @click="loadReviews">重试</button>
      </div>

      <div v-else-if="reviews.length" class="space-y-3">
        <router-link
          v-for="r in reviews"
          :key="r.id"
          :to="'/reviews?cigarId=' + r.cigarId"
          class="cc-card block p-4 transition-colors hover:border-cigar-gold/50"
        >
          <div class="flex items-start justify-between gap-3">
            <h3 class="min-w-0 flex-1 truncate text-sm font-medium text-cigar-cream">{{ r.title || '无标题笔记' }}</h3>
            <span class="shrink-0 text-sm text-cigar-gold">{{ fmtScore(r.overallRating) }}</span>
          </div>
          <p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-cigar-mute">{{ r.content }}</p>
          <div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cigar-smoke">
            <span>{{ r.username || '匿名' }}</span>
            <span v-if="r.cigarLabel" class="text-cigar-mute">🚬 {{ r.cigarLabel }}</span>
            <span>{{ fmtDate(r.createdAt) }}</span>
            <span>有用 {{ r.helpfulCount || 0 }}</span>
          </div>
        </router-link>
      </div>

      <EmptyState
        v-else
        icon="✍️"
        title="还没有人写笔记"
        description="第一支雪茄的味道最值得记下来。登录后写下你的第一篇品吸笔记吧。"
        action-label="去写第一篇"
        action-to="/reviews/new"
      />
    </section>

    <!-- ===== 合规声明 ===== -->
    <section class="mt-12 cc-card border-cigar-gold/30 p-5">
      <h2 class="font-display text-base text-cigar-gold">合规声明</h2>
      <ul class="mt-3 space-y-2 text-xs leading-relaxed text-cigar-mute">
        <li>· 本站<span class="text-cigar-cream">不售卖任何烟草制品</span>，不提供购买渠道、代购、拼单或价格报价。</li>
        <li>· 站内所有价格均为公开资料整理的<span class="text-cigar-cream">参考估算价</span>，非交易报价，不构成任何邀约。</li>
        <li>· 全部内容仅面向<span class="text-cigar-cream">年满 18 周岁</span>的成年人，仅供知识交流与个人品鉴记录。</li>
        <li>· 吸烟有害健康，请遵守所在地法律法规，勿在禁烟场所吸烟。</li>
      </ul>
      <router-link to="/about" class="mt-4 inline-block text-xs text-cigar-gold hover:underline">查看完整免责声明与社区公约 →</router-link>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '@/api/client.js'
import CigarCard from '@/components/CigarCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const tools = [
  { to: '/tools/diagnostic', icon: '🩺', title: '病害诊断', desc: '发霉还是开花？几步判断，给出挽救方案。' },
  { to: '/tools/flavor-test', icon: '🧭', title: '风味人格测试', desc: '回答几道题，找出你的风味偏好与推荐方向。' },
  { to: '/tools/aging-calc', icon: '⏳', title: '醇化计算器', desc: '按浓郁度与养护环境，估算到达巅峰的时间。' },
]

// ---- 元数据 ----
const metaLoading = ref(true)
const metaError = ref('')
const stats = ref(null)

const statItems = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '在库雪茄', value: s.cigars ?? 0 },
    { label: '收录品牌', value: s.brands ?? 0 },
    { label: '风味条目', value: s.flavors ?? 0 },
    { label: '品吸笔记', value: s.reviews ?? 0 },
  ]
})

// ---- 热门雪茄 ----
const cigarsLoading = ref(true)
const cigarsError = ref('')
const cigars = ref([])

// ---- 最新笔记 ----
const reviewsLoading = ref(true)
const reviewsError = ref('')
const reviews = ref([])

onMounted(() => {
  loadMeta()
  loadCigars()
  loadReviews()
})


async function loadMeta() {
  metaLoading.value = true
  metaError.value = ''
  try {
    const res = await api.meta()
    stats.value = res?.stats ?? null
  } catch (err) {
    metaError.value = err?.humanMessage || '统计信息暂时取不到'
  } finally {
    metaLoading.value = false
  }
}

async function loadCigars() {
  cigarsLoading.value = true
  cigarsError.value = ''
  try {
    const res = await api.cigars({ sort: 'rating', pageSize: 6 })
    cigars.value = Array.isArray(res?.items) ? res.items : []
  } catch (err) {
    cigarsError.value = err?.humanMessage || '热门雪茄加载失败'
  } finally {
    cigarsLoading.value = false
  }
}

async function loadReviews() {
  reviewsLoading.value = true
  reviewsError.value = ''
  try {
    const res = await api.reviews({ sort: 'newest', pageSize: 3 })
    reviews.value = Array.isArray(res?.items) ? res.items : []
  } catch (err) {
    reviewsError.value = err?.humanMessage || '笔记加载失败'
  } finally {
    reviewsLoading.value = false
  }
}

function fmtScore(v) {
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
