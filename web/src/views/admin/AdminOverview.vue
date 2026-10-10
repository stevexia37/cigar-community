<template>
  <div>
    <div v-if="loading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="i in 8" :key="i" class="cc-skeleton h-24" />
    </div>

    <div v-else-if="error" class="cc-card p-6 text-center">
      <p class="text-sm text-red-300">{{ error }}</p>
      <button class="cc-btn-ghost mt-3" @click="load">重试</button>
    </div>

    <template v-else>
      <!-- 待办：运营打开后台第一眼要看的东西 -->
      <section>
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-cigar-mute">待处理</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <router-link
            :to="{ name: 'admin-reviews' }"
            class="cc-card flex items-center justify-between p-4 transition-colors hover:border-cigar-gold/50"
            :class="stats.queue.reviews > 0 ? 'border-amber-500/40' : ''"
          >
            <div>
              <p class="text-sm text-cigar-cream">待审核笔记</p>
              <p class="mt-0.5 text-[11px] text-cigar-mute">命中审核词的内容，公开列表不可见</p>
            </div>
            <span
              class="font-display text-2xl"
              :class="stats.queue.reviews > 0 ? 'text-amber-300' : 'text-cigar-smoke'"
            >{{ stats.queue.reviews }}</span>
          </router-link>

          <router-link
            :to="{ name: 'admin-submissions' }"
            class="cc-card flex items-center justify-between p-4 transition-colors hover:border-cigar-gold/50"
            :class="stats.queue.submissions > 0 ? 'border-amber-500/40' : ''"
          >
            <div>
              <p class="text-sm text-cigar-cream">待审批投稿</p>
              <p class="mt-0.5 text-[11px] text-cigar-mute">用户提报的雪茄数据</p>
            </div>
            <span
              class="font-display text-2xl"
              :class="stats.queue.submissions > 0 ? 'text-amber-300' : 'text-cigar-smoke'"
            >{{ stats.queue.submissions }}</span>
          </router-link>
        </div>
        <p v-if="stats.queue.total === 0" class="mt-2 text-[11px] text-cigar-smoke">
          当前无待处理内容。有新内容时会在此显示，并同步到上方导航角标。
        </p>
      </section>

      <!-- 站点总量 -->
      <section class="mt-7">
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-cigar-mute">站点数据</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div v-for="t in totals" :key="t.label" class="cc-card p-3.5">
            <p class="font-display text-xl text-cigar-gold">{{ t.value }}</p>
            <p class="mt-0.5 text-[11px] text-cigar-mute">{{ t.label }}</p>
          </div>
        </div>
      </section>

      <!-- 内容缺口：可直接上手的运营待办 -->
      <section class="mt-7">
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-cigar-mute">内容缺口</h2>
        <div class="cc-card divide-y divide-cigar-light/50">
          <div v-for="g in gaps" :key="g.label" class="flex items-center justify-between px-4 py-3">
            <span class="text-sm text-cigar-cream">{{ g.label }}</span>
            <span class="text-sm" :class="g.value > 0 ? 'text-amber-300' : 'text-cigar-smoke'">{{ g.value }} 款</span>
          </div>
        </div>
        <p class="mt-2 text-[11px] text-cigar-smoke">
          缺口来自原始原型数据（无参考价/无评分），可用「投稿审批」逐条补齐。
        </p>
      </section>

      <!-- 近 14 天合规活动 -->
      <section class="mt-7">
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-cigar-mute">近 7 天合规处置</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div v-for="a in actionStats" :key="a.key" class="cc-card p-3.5">
            <p class="font-display text-xl" :class="a.color">{{ a.value }}</p>
            <p class="mt-0.5 text-[11px] text-cigar-mute">{{ a.label }}</p>
          </div>
        </div>

        <div v-if="stats.compliance.daily.length" class="mt-3 cc-card overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="border-b border-cigar-light/60 text-cigar-mute">
              <tr>
                <th class="px-4 py-2 font-medium">日期</th>
                <th class="px-4 py-2 font-medium">内容事件</th>
                <th class="px-4 py-2 font-medium">拦截</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in stats.compliance.daily" :key="d.day" class="border-b border-cigar-light/30 last:border-0">
                <td class="px-4 py-2 text-cigar-cream">{{ d.day }}</td>
                <td class="px-4 py-2 text-cigar-mute">{{ d.reviews }}</td>
                <td class="px-4 py-2" :class="d.blocked > 0 ? 'text-red-300' : 'text-cigar-mute'">{{ d.blocked }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="mt-2 text-[11px] text-cigar-smoke">近 14 天无合规处置记录。</p>
      </section>

      <p class="mt-6 text-[11px] text-cigar-smoke">数据生成时间 {{ formatTime(stats.generatedAt) }}</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import api from '@/api/client.js'

const stats = ref(null)
const loading = ref(true)
const error = ref('')

// 父布局通过 provide 暴露刷新入口，这里处理完队列后顺带刷新角标
const refreshPending = inject('refreshAdminPending', () => {})

const totals = computed(() => {
  const t = stats.value?.totals
  if (!t) return []
  return [
    { label: '雪茄', value: t.cigars },
    { label: '品牌', value: t.brands },
    { label: '风味标签', value: t.flavors },
    { label: '已发布笔记', value: t.reviews },
    { label: '用户', value: t.users },
    { label: '笔记配图', value: t.reviewImages },
  ]
})

const gaps = computed(() => {
  const g = stats.value?.contentGaps
  if (!g) return []
  return [
    { label: '缺少参考价', value: g.cigarsWithoutPrice },
    { label: '缺少评分', value: g.cigarsWithoutRating },
    { label: '缺少风味标签', value: g.cigarsWithoutFlavors },
  ]
})

const actionStats = computed(() => {
  const c = stats.value?.compliance?.last7Days ?? {}
  return [
    { key: 'blocked', label: '红线拦截', value: c.blocked ?? 0, color: 'text-red-300' },
    { key: 'queued', label: '进入审核', value: c.queued ?? 0, color: 'text-amber-300' },
    { key: 'approved', label: '审核通过', value: c.approved ?? 0, color: 'text-emerald-300' },
    { key: 'warned', label: '提示放行', value: c.warned ?? 0, color: 'text-cigar-mute' },
  ]
})

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    stats.value = await api.adminStats()
    refreshPending()
  } catch (err) {
    error.value = err?.humanMessage || '概览加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
