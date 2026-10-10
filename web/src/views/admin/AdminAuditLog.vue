<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="opt in actionOptions"
        :key="String(opt.value)"
        class="cc-chip"
        :class="{ 'cc-chip-active': action === opt.value }"
        @click="setAction(opt.value)"
      >{{ opt.label }}</button>
      <div class="flex-1" />
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs" :disabled="loading" @click="load">刷新</button>
    </div>

    <p class="mb-3 text-[11px] text-cigar-mute">
      记录每一次内容处置与运营操作，用于合规追溯。摘要会截断保存，不重复存储违规原文。
    </p>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="cc-skeleton h-14" />
    </div>

    <div v-else-if="error" class="cc-card p-6 text-center">
      <p class="text-sm text-red-300">{{ error }}</p>
      <button class="cc-btn-ghost mt-3" @click="load">重试</button>
    </div>

    <EmptyState
      v-else-if="items.length === 0"
      icon="📋"
      title="暂无日志"
      description="内容命中规则或运营处置后，记录会出现在这里。"
    />

    <div v-else class="cc-card divide-y divide-cigar-light/40">
      <div v-for="log in items" :key="log.id" class="px-4 py-3">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span class="rounded-md px-2 py-0.5" :class="actionBadge(log.action).cls">{{ actionBadge(log.action).label }}</span>
          <span class="text-cigar-mute">{{ kindLabel(log.kind) }}</span>
          <span v-if="log.refId" class="text-cigar-smoke">#{{ log.refId }}</span>
          <span class="text-cigar-cream">{{ log.username }}</span>
          <span class="ml-auto text-cigar-smoke">{{ formatTime(log.createdAt) }}</span>
        </div>
        <!-- blocked 记录不留存原文（契约要求「命中红线内容不入库」），
             这里给出可读说明，避免运营误以为「漏记了内容」 -->
        <p
          v-if="log.excerpt"
          class="mt-1.5 text-xs leading-relaxed"
          :class="log.action === 'blocked' ? 'text-cigar-smoke' : 'text-cigar-cream/80'"
        >{{ log.excerpt }}</p>
        <p v-if="log.action === 'blocked'" class="mt-1 text-[11px] text-cigar-smoke">
          出于合规，被拒内容不留存原文；上面的指纹可用于识别同一段内容被反复提交。
        </p>
        <p v-if="log.matched && log.matched.length" class="mt-1.5 flex flex-wrap gap-1">
          <span v-for="m in log.matched" :key="m" class="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">{{ m }}</span>
        </p>
      </div>
    </div>

    <div v-if="totalPages > 1" class="mt-5 flex items-center justify-center gap-3 text-sm">
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40" :disabled="page <= 1" @click="setPage(page - 1)">上一页</button>
      <span class="text-cigar-mute">{{ page }} / {{ totalPages }}</span>
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40" :disabled="page >= totalPages" @click="setPage(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/client.js'
import EmptyState from '@/components/EmptyState.vue'

const actionOptions = [
  { value: null, label: '全部' },
  { value: 'blocked', label: '红线拦截' },
  { value: 'queued', label: '进入审核' },
  { value: 'approved', label: '审核通过' },
  { value: 'rejected', label: '驳回' },
  { value: 'deleted', label: '删除' },
  { value: 'clean', label: '正常放行' },
]

const items = ref([])
const page = ref(1)
const totalPages = ref(1)
const action = ref(null)
const loading = ref(true)
const error = ref('')

function actionBadge(a) {
  const map = {
    blocked: { label: '红线拦截', cls: 'bg-red-500/15 text-red-300' },
    queued: { label: '进入审核', cls: 'bg-amber-500/15 text-amber-300' },
    approved: { label: '审核通过', cls: 'bg-emerald-500/15 text-emerald-300' },
    rejected: { label: '驳回', cls: 'bg-cigar-light/60 text-cigar-mute' },
    deleted: { label: '删除', cls: 'bg-red-500/15 text-red-300' },
    clean: { label: '正常', cls: 'bg-cigar-light/50 text-cigar-mute' },
    warned: { label: '提示', cls: 'bg-cigar-light/50 text-cigar-mute' },
    disabled: { label: '停用账号', cls: 'bg-red-500/15 text-red-300' },
    enabled: { label: '启用账号', cls: 'bg-emerald-500/15 text-emerald-300' },
  }
  return map[a] ?? { label: a, cls: 'bg-cigar-light/50 text-cigar-mute' }
}

function kindLabel(k) {
  return { review: '品吸笔记', submission: '数据投稿', user: '用户' }[k] ?? k
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = { page: page.value, pageSize: 30 }
    if (action.value) query.action = action.value
    const res = await api.adminAuditLog(query)
    items.value = res.items ?? []
    totalPages.value = Math.max(1, res.totalPages ?? 1)
  } catch (err) {
    error.value = err?.humanMessage || '加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

function setAction(v) { action.value = v; page.value = 1; load() }
function setPage(p) { page.value = p; load() }

onMounted(load)
</script>
