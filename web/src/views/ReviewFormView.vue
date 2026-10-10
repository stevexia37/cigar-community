<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
    <header class="mb-6">
      <h1 class="font-display text-2xl text-cigar-gold sm:text-3xl">写品吸笔记</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-cigar-mute">
        记录这一支的味道与状态，帮后来的人少走弯路。
      </p>
    </header>

    <!-- 会话未就绪 -->
    <div v-if="!auth.state.loaded" class="space-y-3">
      <div class="cc-skeleton h-11 w-full" />
      <div class="cc-skeleton h-32 w-full" />
    </div>

    <!-- 未登录 -->
    <div v-else-if="!auth.user" class="cc-card p-6 text-center">
      <div class="text-4xl">🔒</div>
      <h2 class="mt-3 font-display text-lg text-cigar-cream">写笔记需要先登录</h2>
      <p class="mt-1.5 text-sm text-cigar-mute">登录后即可发表你的品吸记录。</p>
      <router-link class="cc-btn-primary mt-4" :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</router-link>
    </div>

    <template v-else>
      <form class="space-y-4" @submit.prevent="submit">
        <!-- 选雪茄 -->
        <div class="cc-card p-5">
          <label class="cc-label" for="cigar-search">选择雪茄 <span class="text-red-400">*</span></label>

          <div v-if="selectedCigar" class="flex flex-wrap items-center gap-2">
            <span class="cc-chip cc-chip-active">
              {{ selectedCigar.brand }} {{ selectedCigar.series ? selectedCigar.series + ' ' : '' }}{{ selectedCigar.vitola }}
            </span>
            <button type="button" class="text-[11px] text-cigar-mute hover:text-cigar-gold" @click="clearCigar">重新选择</button>
          </div>

          <template v-else>
            <input
              id="cigar-search"
              v-model="cigarQuery"
              class="cc-input"
              type="text"
              autocomplete="off"
              placeholder="搜索品牌 / 系列 / 型号，例如 Cohiba Robustos"
              @input="onSearchInput"
            >
            <div v-if="searching" class="mt-2 space-y-2">
              <div class="cc-skeleton h-11 w-full" />
              <div class="cc-skeleton h-11 w-full" />
            </div>
            <p v-else-if="searchError" class="mt-2 text-xs text-red-400">{{ searchError }}</p>
            <div v-else-if="searchResults.length" class="mt-2 max-h-60 overflow-y-auto rounded-xl border border-cigar-light bg-cigar-dark">
              <button
                v-for="c in searchResults"
                :key="c.id"
                type="button"
                class="block min-h-[44px] w-full border-b border-cigar-light/40 px-3.5 py-2.5 text-left text-sm text-cigar-cream last:border-b-0 hover:bg-cigar-light/40"
                @click="selectCigar(c)"
              >
                <span class="block truncate">{{ c.brand }} {{ c.series || '' }} {{ c.vitola }}</span>
                <span class="block truncate text-[11px] text-cigar-smoke">{{ c.originLabel }} · {{ c.strengthLabel }}</span>
              </button>
            </div>
            <p v-else-if="cigarQuery.trim()" class="mt-2 text-xs text-cigar-smoke">没有匹配的雪茄，换个关键词试试。</p>
          </template>

          <p v-if="errors.cigarId" class="mt-2 text-xs text-red-400">{{ errors.cigarId }}</p>
        </div>

        <!-- 正文 -->
        <div class="cc-card space-y-4 p-5">
          <div>
            <label class="cc-label" for="title">标题</label>
            <input id="title" v-model="form.title" class="cc-input" type="text" maxlength="80" placeholder="例如：三年陈的经典罗布图">
          </div>

          <div>
            <label class="cc-label" for="content">品吸内容</label>
            <textarea
              id="content"
              v-model="form.content"
              class="cc-input min-h-[160px] resize-y leading-relaxed"
              placeholder="前段、中段、后段的风味变化，燃烧与吸阻表现……"
            />
            <p class="mt-1 text-right text-[11px] text-cigar-smoke">{{ form.content.length }} 字</p>

            <!-- 敏感词预检提示条 -->
            <div
              v-if="sensitivityTip"
              class="mt-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed"
              :class="sensitivityTip.class"
            >
              {{ sensitivityTip.text }}
              <span v-if="sensitivityTip.matched.length">（{{ sensitivityTip.matched.join('、') }}）</span>
            </div>
            <p v-if="sensitivityChecking" class="mt-1.5 text-[11px] text-cigar-smoke">正在检查内容…</p>
          </div>

          <div>
            <span class="cc-label">整体评分 <span class="text-red-400">*</span></span>
            <ScoreInput v-model="form.overallRating" :max="10" hint="1 – 10 分，整数" />
            <p v-if="errors.overallRating" class="mt-1.5 text-xs text-red-400">{{ errors.overallRating }}</p>
          </div>
        </div>

        <!-- 分段评分 -->
        <div class="cc-card space-y-5 p-5">
          <h2 class="font-display text-base text-cigar-gold">分段与燃烧</h2>
          <ScoreInput v-model="form.preScore" label="前段" />
          <ScoreInput v-model="form.midScore" label="中段" />
          <ScoreInput v-model="form.postScore" label="后段" />
          <ScoreInput v-model="form.burnEvenness" label="燃烧均匀度" />
          <ScoreInput v-model="form.drawResistance" label="吸阻" />

          <!-- 配图：雪茄笔记的价值一半在图 -->
          <div class="mt-6">
            <ImageUploader
              :images="uploader.images.value"
              label="配图"
              hint="可选，最多 6 张"
              tip="图片只用于展示养护环境与茄身细节。请勿上传任何联系方式、二维码或交易信息截图。"
              :notice="uploadNotice"
              :max-count="uploader.maxCount"
              @pick="onPickImages"
              @remove="uploader.remove"
            />
          </div>
        </div>

        <!-- 品吸条件 -->
        <div class="cc-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <label class="cc-label" for="smokingTime">品吸时长（分钟）</label>
            <input id="smokingTime" v-model.number="form.smokingTime" class="cc-input" type="number" min="1" max="600" inputmode="numeric" placeholder="65">
          </div>
          <div>
            <label class="cc-label" for="pairing">搭配饮品</label>
            <input id="pairing" v-model="form.pairing" class="cc-input" type="text" maxlength="60" placeholder="单一麦芽威士忌">
          </div>
          <div>
            <label class="cc-label" for="humidityAtSmoke">品吸时湿度（%）</label>
            <input id="humidityAtSmoke" v-model.number="form.humidityAtSmoke" class="cc-input" type="number" min="40" max="90" step="0.5" inputmode="decimal" placeholder="68">
          </div>
          <div>
            <label class="cc-label" for="restTimeDays">醒茄天数</label>
            <input id="restTimeDays" v-model.number="form.restTimeDays" class="cc-input" type="number" min="0" max="3650" inputmode="numeric" placeholder="30">
          </div>
        </div>

        <!-- 结果提示 -->
        <div v-if="queued" class="rounded-xl border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          已提交，待人工审核。通过后会公开显示，请勿重复提交。
        </div>

        <div v-if="rejectedWords.length" class="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <p class="font-medium">内容未通过合规校验，命中禁止交易的词：{{ rejectedWords.join('、') }}</p>
          <p class="mt-1.5 text-xs leading-relaxed">
            本站明确禁止代购、报价、售卖、私聊交易等行为。请删除相关词句后重试。
          </p>
        </div>

        <p v-if="submitError && !rejectedWords.length" class="cc-card border-red-500/50 p-4 text-sm text-red-400">{{ submitError }}</p>

        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            class="cc-btn-primary"
            :disabled="submitting || blockedBySensitivity"
          >{{ submitting ? '提交中…' : '发布品吸笔记' }}</button>
          <router-link to="/reviews" class="cc-btn-ghost">取消</router-link>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api/client.js'
import { useAuth } from '@/composables/useAuth.js'
import ScoreInput from '@/components/ScoreInput.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import { useImageUpload } from '@/composables/useImageUpload.js'

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const selectedCigar = ref(null)
const cigarQuery = ref('')
const searchResults = ref([])
const searching = ref(false)
const searchError = ref('')
let searchTimer = null

const uploader = useImageUpload({ maxCount: 6 })
const uploadNotice = ref('')

async function onPickImages(files) {
  uploadNotice.value = ''
  const notice = await uploader.addFiles(files)
  if (notice) uploadNotice.value = notice
}

const form = reactive({
  title: '',
  content: '',
  overallRating: null,
  preScore: null,
  midScore: null,
  postScore: null,
  burnEvenness: null,
  drawResistance: null,
  smokingTime: null,
  pairing: '',
  humidityAtSmoke: null,
  restTimeDays: null,
})

const submitting = ref(false)
const submitError = ref('')
const rejectedWords = ref([])
const queued = ref(false)

// 敏感词预检状态
const sensitivity = ref(null)          // { action, matched, message }
const sensitivityChecking = ref(false)
let checkTimer = null

const errors = computed(() => {
  const e = {}
  if (!selectedCigar.value) e.cigarId = '请先选择一支雪茄'
  const r = Number(form.overallRating)
  if (form.overallRating === null || !Number.isFinite(r) || r < 1 || r > 10) {
    e.overallRating = '整体评分为必填，1 – 10 分'
  }
  return e
})

const blockedBySensitivity = computed(() => sensitivity.value?.action === 'blocked')

const sensitivityTip = computed(() => {
  const s = sensitivity.value
  if (!s || s.action === 'clean') return null
  const matched = Array.isArray(s.matched) ? s.matched : []
  if (s.action === 'warned') {
    return {
      class: 'border-amber-500/60 bg-amber-500/10 text-amber-400',
      text: s.message || '内容可能含有不适宜表述，请注意措辞。',
      matched,
    }
  }
  if (s.action === 'queued') {
    return {
      class: 'border-orange-500/60 bg-orange-500/10 text-orange-400',
      text: '发布后需人工审核，通过后才会公开显示。',
      matched,
    }
  }
  return {
    class: 'border-red-500/60 bg-red-500/10 text-red-400',
    text: '含禁止交易的词，无法发布。',
    matched,
  }
})

// ---- 预选雪茄 ----
async function preselect(id) {
  try {
    const res = await api.cigar(id)
    selectedCigar.value = res?.cigar || null
  } catch (err) {
    submitError.value = err?.humanMessage || err?.message || '雪茄信息加载失败'
  }
}

// ---- 搜索 ----
function onSearchInput() {
  searchError.value = ''
  clearTimeout(searchTimer)
  const q = cigarQuery.value.trim()
  if (!q) {
    searchResults.value = []
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.cigars({ q, pageSize: 8 })
      searchResults.value = Array.isArray(res?.items) ? res.items : []
    } catch (err) {
      searchError.value = err?.humanMessage || err?.message || '搜索失败'
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 300)
}

function selectCigar(c) {
  selectedCigar.value = c
  searchResults.value = []
  cigarQuery.value = ''
}

function clearCigar() {
  selectedCigar.value = null
  searchResults.value = []
}

// ---- 内容预检（debounce 600ms）----
function scheduleCheck() {
  clearTimeout(checkTimer)
  const text = form.content.trim()
  if (text.length < 2) {
    sensitivity.value = null
    return
  }
  checkTimer = setTimeout(async () => {
    sensitivityChecking.value = true
    try {
      const res = await api.checkText(text)
      sensitivity.value = res || null
    } catch {
      // 预检失败不阻塞写作，提交时后端还会再校验一次
      sensitivity.value = null
    } finally {
      sensitivityChecking.value = false
    }
  }, 600)
}

// 正文变化触发实时预检
watch(() => form.content, scheduleCheck)

function buildPayload() {
  // 图片随创建请求一起提交（后端同时接受 data: 与 /uploads/ 两种形式），省一次往返
  const images = uploader.toPayload()

  const payload = {
    cigarId: selectedCigar.value.id,
    overallRating: Number(form.overallRating),
  }
  const text = (v) => (typeof v === 'string' ? v.trim() : v)
  const num = (v) => (v === null || v === '' || v === undefined ? undefined : Number(v))

  if (text(form.title)) payload.title = text(form.title)
  if (text(form.content)) payload.content = text(form.content)
  if (text(form.pairing)) payload.pairing = text(form.pairing)

  for (const key of ['preScore', 'midScore', 'postScore', 'burnEvenness', 'drawResistance', 'smokingTime', 'humidityAtSmoke', 'restTimeDays']) {
    const v = num(form[key])
    if (v !== undefined && Number.isFinite(v)) payload[key] = v
  }
  if (images.length) payload.images = images
  return payload
}

// 202 可能以 2xx 正常返回，也可能是抛出的 ApiError，两条路径统一处理
function isQueuedPayload(payload) {
  return payload?.code === 'CONTENT_QUEUED'
    || payload?.sensitivity?.action === 'queued'
    || payload?.review?.status === -1
}

async function submit() {
  // 图片仍在压缩时不能提交：否则会静默丢掉用户刚选的图
  if (uploader.hasUploading()) {
    uploadNotice.value = '图片还在处理中，请稍候再提交'
    return
  }
  const broken = uploader.images.value.find((i) => i.error)
  if (broken) {
    uploadNotice.value = `有一张图片处理失败（${broken.error}），请移除后重试`
    return
  }

  if (submitting.value) return
  submitError.value = ''
  rejectedWords.value = []
  queued.value = false

  if (Object.keys(errors.value).length) {
    submitError.value = Object.values(errors.value)[0]
    return
  }
  if (blockedBySensitivity.value) {
    submitError.value = '内容含禁止交易的词，请修改后再发布'
    return
  }

  submitting.value = true
  try {
    const res = await api.createReview(buildPayload())
    uploader.clear()
    if (isQueuedPayload(res)) {
      queued.value = true
      return
    }
    router.push(`/cigars/${selectedCigar.value.id}`)
  } catch (err) {
    if (err.code === 'CONTENT_REJECTED') {
      rejectedWords.value = Array.isArray(err.matched) && err.matched.length ? err.matched : ['（未返回命中词）']
    } else if (err.code === 'CONTENT_QUEUED') {
      queued.value = true
    } else if (err.code === 'UNAUTHORIZED') {
      submitError.value = '登录状态已过期，请重新登录后再提交'
    } else {
      submitError.value = err?.humanMessage || err?.message || '提交失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await auth.refresh()
  const id = Number(route.query.cigarId)
  if (Number.isFinite(id) && id > 0) preselect(id)
})

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearTimeout(checkTimer)
})
</script>
