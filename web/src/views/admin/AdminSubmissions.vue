<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="opt in statusOptions"
        :key="String(opt.value)"
        class="cc-chip"
        :class="{ 'cc-chip-active': status === opt.value }"
        @click="setStatus(opt.value)"
      >{{ opt.label }}</button>
      <div class="flex-1" />
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs" :disabled="loading" @click="load">刷新</button>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="cc-skeleton h-40" />
    </div>

    <div v-else-if="error" class="cc-card p-6 text-center">
      <p class="text-sm text-red-300">{{ error }}</p>
      <button class="cc-btn-ghost mt-3" @click="load">重试</button>
    </div>

    <EmptyState
      v-else-if="items.length === 0"
      icon="📥"
      :title="status === 'pending' ? '没有待审批的投稿' : '没有符合条件的投稿'"
      description="用户提报的雪茄数据会出现在这里。"
    />

    <div v-else class="space-y-3">
      <article v-for="item in items" :key="item.id" class="cc-card overflow-hidden">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-cigar-light/50 bg-cigar-dark/40 px-4 py-2.5 text-xs">
          <span class="text-cigar-cream">{{ item.username }}</span>
          <span class="text-cigar-smoke">·</span>
          <span class="text-cigar-mute">#{{ item.id }}</span>
          <span class="text-cigar-smoke">·</span>
          <span class="text-cigar-mute">{{ formatTime(item.createdAt) }}</span>
          <span class="ml-auto rounded-md px-2 py-0.5" :class="statusBadge(item.status).cls">
            {{ statusBadge(item.status).label }}
          </span>
        </div>

        <div class="px-4 py-3.5">
          <!-- 投稿内容结构化展示，避免运营去读 JSON -->
          <div class="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <div v-for="f in fields(item.payload)" :key="f.label" class="flex gap-2">
              <span class="w-16 shrink-0 text-cigar-mute">{{ f.label }}</span>
              <span class="text-cigar-cream">{{ f.value }}</span>
            </div>
          </div>

          <p v-if="item.payload?.note" class="mt-3 rounded-lg bg-cigar-dark/60 px-3 py-2 text-xs text-cigar-mute">
            投稿附言：{{ item.payload.note }}
          </p>
          <p v-if="item.rejectReason" class="mt-2 text-xs text-cigar-mute">
            驳回理由：<span class="text-red-300">{{ item.rejectReason }}</span>
          </p>

          <p v-if="actionError[item.id]" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {{ actionError[item.id] }}
          </p>

          <div v-if="rejectingId === item.id" class="mt-3">
            <label class="cc-label" :for="`sub-reason-${item.id}`">驳回理由</label>
            <input
              :id="`sub-reason-${item.id}`"
              v-model="rejectReason"
              class="cc-input"
              maxlength="500"
              placeholder="例如：数据有误，请核对环径后重报"
              @keyup.enter="doReject(item)"
            />
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <template v-if="item.status === 'pending'">
              <button class="cc-btn-primary !py-2 text-xs" :disabled="busyId === item.id" @click="doApprove(item)">
                {{ busyId === item.id ? '处理中…' : '通过并入库' }}
              </button>
              <template v-if="rejectingId === item.id">
                <button class="cc-btn-ghost !py-2 text-xs" :disabled="busyId === item.id" @click="doReject(item)">确认驳回</button>
                <button class="cc-btn-ghost !py-2 text-xs" @click="cancelReject">取消</button>
              </template>
              <button v-else class="cc-btn-ghost !py-2 text-xs" @click="startReject(item)">驳回</button>
            </template>
            <span v-else class="text-xs text-cigar-smoke">
              已于 {{ formatTime(item.reviewedAt) }} 处理
              <template v-if="item.status === 'approved'">（内容已进入雪茄库）</template>
            </span>
          </div>
        </div>
      </article>
    </div>

    <div v-if="totalPages > 1" class="mt-5 flex items-center justify-center gap-3 text-sm">
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40" :disabled="page <= 1" @click="setPage(page - 1)">上一页</button>
      <span class="text-cigar-mute">{{ page }} / {{ totalPages }}</span>
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40" :disabled="page >= totalPages" @click="setPage(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import api from '@/api/client.js'
import EmptyState from '@/components/EmptyState.vue'

const refreshPending = inject('refreshAdminPending', () => {})

const statusOptions = [
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: null, label: '全部' },
]

const STRENGTH_LABELS = { 1: '清淡', 2: '中淡', 3: '中等', 4: '浓郁', 5: '极浓郁' }

const items = ref([])
const page = ref(1)
const totalPages = ref(1)
const status = ref('pending')
const loading = ref(true)
const error = ref('')
const busyId = ref(null)
const rejectingId = ref(null)
const rejectReason = ref('')
const actionError = ref({})

function statusBadge(st) {
  if (st === 'pending') return { label: '待审批', cls: 'bg-amber-500/15 text-amber-300' }
  if (st === 'approved') return { label: '已通过', cls: 'bg-emerald-500/15 text-emerald-300' }
  return { label: '已驳回', cls: 'bg-cigar-light/60 text-cigar-mute' }
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false })
}

/** 把投稿 payload 转成可读字段行 */
function fields(p) {
  if (!p) return []
  const rows = [
    { label: '品牌', value: p.brand },
    { label: '系列', value: p.series || '—' },
    { label: '型号', value: p.vitola },
    { label: '产地', value: p.originType === 'cuban' ? '古巴' : '非古' },
    { label: '国家码', value: p.countryCode || '—' },
    { label: '长度', value: p.lengthInch ? `${p.lengthInch}"` : '—' },
    { label: '环径', value: p.ringGauge || '—' },
    { label: '浓郁度', value: p.strength ? `${STRENGTH_LABELS[p.strength] ?? p.strength}（${p.strength}）` : '—' },
    { label: '茄衣', value: p.wrapperVariety || '—' },
    { label: '风味', value: Array.isArray(p.flavorIds) && p.flavorIds.length ? `${p.flavorIds.length} 个标签` : '—' },
  ]
  return rows
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = { page: page.value, pageSize: 10 }
    if (status.value) query.status = status.value
    const res = await api.adminSubmissions(query)
    items.value = res.items ?? []
    totalPages.value = Math.max(1, res.totalPages ?? 1)
  } catch (err) {
    error.value = err?.humanMessage || '加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

function setStatus(v) { status.value = v; page.value = 1; load() }
function setPage(p) { page.value = p; load() }
function startReject(item) { rejectingId.value = item.id; rejectReason.value = ''; delete actionError.value[item.id] }
function cancelReject() { rejectingId.value = null; rejectReason.value = '' }

async function doApprove(item) {
  busyId.value = item.id
  delete actionError.value[item.id]
  try {
    const res = await api.adminApproveSubmission(item.id)
    await load()
    refreshPending()
    if (res?.cigarId) {
      // 让运营知道入库后的雪茄 id，便于核对
      window.alert(`已通过并入库为雪茄 #${res.cigarId}`)
    }
  } catch (err) {
    actionError.value[item.id] = err?.humanMessage || '操作失败'
  } finally {
    busyId.value = null
  }
}

async function doReject(item) {
  busyId.value = item.id
  delete actionError.value[item.id]
  try {
    await api.adminRejectSubmission(item.id, rejectReason.value.trim())
    cancelReject()
    await load()
    refreshPending()
  } catch (err) {
    actionError.value[item.id] = err?.humanMessage || '操作失败'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>
