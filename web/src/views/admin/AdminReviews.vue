<template>
  <div>
    <!-- 状态筛选 -->
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
      <div v-for="i in 3" :key="i" class="cc-skeleton h-44" />
    </div>

    <div v-else-if="error" class="cc-card p-6 text-center">
      <p class="text-sm text-red-300">{{ error }}</p>
      <button class="cc-btn-ghost mt-3" @click="load">重试</button>
    </div>

    <EmptyState
      v-else-if="items.length === 0"
      icon="✅"
      :title="status === -1 ? '没有待审核的笔记' : '没有符合条件的笔记'"
      :description="status === -1 ? '命中审核词的内容会出现在这里，处理完即清空。' : '换个状态筛选看看。'"
    />

    <div v-else class="space-y-3">
      <article v-for="item in items" :key="item.id" class="cc-card overflow-hidden">
        <!-- 头部：谁、针对哪支茄、什么时候 -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-cigar-light/50 bg-cigar-dark/40 px-4 py-2.5 text-xs">
          <span class="text-cigar-cream">{{ item.username }}</span>
          <span class="text-cigar-smoke">·</span>
          <router-link :to="`/cigars/${item.cigarId}`" class="text-cigar-gold hover:underline" target="_blank">
            {{ item.cigarLabel }}
          </router-link>
          <span class="text-cigar-smoke">·</span>
          <span class="text-cigar-mute">{{ formatTime(item.createdAt) }}</span>
          <span
            class="ml-auto rounded-md px-2 py-0.5"
            :class="statusBadge(item.status).cls"
          >{{ statusBadge(item.status).label }}</span>
        </div>

        <div class="px-4 py-3.5">
          <h3 v-if="item.title" class="mb-1 text-sm font-medium text-cigar-cream">{{ item.title }}</h3>
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-cigar-cream/90">{{ item.contentFull || '（无正文）' }}</p>

          <!-- 运营必须看到图才能判断（涉烟广告图/二维码是审核重点） -->
          <ReviewImages :images="item.images || []" :max-thumb="6" />

          <!-- 评分概览 -->
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-cigar-mute">
            <span>总体 <strong class="text-cigar-gold">{{ item.overallRating }}</strong>/10</span>
            <span v-if="item.preScore">前段 {{ item.preScore }}</span>
            <span v-if="item.midScore">中段 {{ item.midScore }}</span>
            <span v-if="item.postScore">尾段 {{ item.postScore }}</span>
            <span v-if="item.smokingTime">时长 {{ item.smokingTime }} 分钟</span>
            <span v-if="item.pairing">搭配 {{ item.pairing }}</span>
          </div>

          <!-- 驳回理由输入：只在点「驳回」后出现，避免界面常驻一个输入框 -->
          <div v-if="rejectingId === item.id" class="mt-3">
            <label class="cc-label" :for="`reason-${item.id}`">驳回理由（会记入审核日志，用户可在自己的投稿记录看到）</label>
            <input
              :id="`reason-${item.id}`"
              v-model="rejectReason"
              class="cc-input"
              maxlength="500"
              placeholder="例如：含交易暗示，请修改后重发"
              @keyup.enter="doReject(item)"
            />
          </div>

          <p v-if="actionError[item.id]" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {{ actionError[item.id] }}
          </p>

          <!-- 操作 -->
          <div class="mt-4 flex flex-wrap gap-2">
            <template v-if="rejectingId === item.id">
              <button class="cc-btn-primary !py-2 text-xs" :disabled="busyId === item.id" @click="doReject(item)">
                {{ busyId === item.id ? '处理中…' : '确认驳回' }}
              </button>
              <button class="cc-btn-ghost !py-2 text-xs" @click="cancelReject">取消</button>
            </template>
            <template v-else>
              <button
                v-if="item.status !== 1"
                class="cc-btn-primary !py-2 text-xs"
                :disabled="busyId === item.id"
                @click="doApprove(item)"
              >{{ busyId === item.id ? '处理中…' : '通过并公开' }}</button>
              <button
                v-if="item.status !== 0"
                class="cc-btn-ghost !py-2 text-xs"
                :disabled="busyId === item.id"
                @click="startReject(item)"
              >驳回</button>
              <button
                class="cc-btn-ghost !py-2 text-xs !border-red-500/40 !text-red-300 hover:!border-red-400"
                :disabled="busyId === item.id"
                @click="doDelete(item)"
              >删除</button>
            </template>
          </div>
        </div>
      </article>
    </div>

    <Pager v-if="totalPages > 1" :page="page" :total-pages="totalPages" @change="setPage" />
  </div>
</template>

<script setup>
import { ref, onMounted, inject, defineComponent, h } from 'vue'
import api from '@/api/client.js'
import EmptyState from '@/components/EmptyState.vue'
import ReviewImages from '@/components/ReviewImages.vue'

/** 复用性很低的极简分页条，就近定义避免再拆一个文件 */
const Pager = defineComponent({
  name: 'AdminPager',
  props: { page: Number, totalPages: Number },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'mt-5 flex items-center justify-center gap-3 text-sm' }, [
      h('button', {
        class: 'cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40',
        disabled: props.page <= 1,
        onClick: () => emit('change', props.page - 1),
      }, '上一页'),
      h('span', { class: 'text-cigar-mute' }, `${props.page} / ${props.totalPages}`),
      h('button', {
        class: 'cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40',
        disabled: props.page >= props.totalPages,
        onClick: () => emit('change', props.page + 1),
      }, '下一页'),
    ])
  },
})

const refreshPending = inject('refreshAdminPending', () => {})

const statusOptions = [
  { value: -1, label: '待审核' },
  { value: 1, label: '已发布' },
  { value: 0, label: '已驳回' },
  { value: null, label: '全部' },
]

const items = ref([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const status = ref(-1)
const loading = ref(true)
const error = ref('')
const busyId = ref(null)
const rejectingId = ref(null)
const rejectReason = ref('')
const actionError = ref({})

function statusBadge(st) {
  if (st === -1) return { label: '待审核', cls: 'bg-amber-500/15 text-amber-300' }
  if (st === 1) return { label: '已发布', cls: 'bg-emerald-500/15 text-emerald-300' }
  return { label: '已驳回', cls: 'bg-cigar-light/60 text-cigar-mute' }
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
    const query = { page: page.value, pageSize: 10 }
    if (status.value !== null) query.status = status.value
    const res = await api.adminReviews(query)
    items.value = res.items ?? []
    total.value = res.total ?? 0
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

function startReject(item) {
  rejectingId.value = item.id
  rejectReason.value = ''
  delete actionError.value[item.id]
}
function cancelReject() { rejectingId.value = null; rejectReason.value = '' }

async function doApprove(item) {
  busyId.value = item.id
  delete actionError.value[item.id]
  try {
    await api.adminApproveReview(item.id)
    await load()
    refreshPending()
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
    await api.adminRejectReview(item.id, rejectReason.value.trim())
    cancelReject()
    await load()
    refreshPending()
  } catch (err) {
    actionError.value[item.id] = err?.humanMessage || '操作失败'
  } finally {
    busyId.value = null
  }
}

async function doDelete(item) {
  if (!window.confirm(`确定删除「${item.username}」的这条笔记？此操作不可恢复。`)) return
  busyId.value = item.id
  delete actionError.value[item.id]
  try {
    await api.adminDeleteReview(item.id)
    await load()
    refreshPending()
  } catch (err) {
    actionError.value[item.id] = err?.humanMessage || '删除失败'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>
