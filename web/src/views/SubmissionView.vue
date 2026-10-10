<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
    <header class="mb-6">
      <h1 class="font-display text-2xl text-cigar-gold sm:text-3xl">提报雪茄数据</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-cigar-mute">
        补全数据库里缺失的型号。提报后由管理员审核，通过后才会公开显示。
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
      <h2 class="mt-3 font-display text-lg text-cigar-cream">提报数据需要先登录</h2>
      <p class="mt-1.5 text-sm text-cigar-mute">登录后才能提交并查看自己的提报记录。</p>
      <router-link class="cc-btn-primary mt-4" :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</router-link>
    </div>

    <template v-else>
      <form class="space-y-4" @submit.prevent="submit">
        <!-- 基本信息 -->
        <div class="cc-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <label class="cc-label" for="brand">品牌 <span class="text-red-400">*</span></label>
            <input id="brand" v-model="form.brand" class="cc-input" type="text" maxlength="60" placeholder="Cohiba">
          </div>
          <div>
            <label class="cc-label" for="series">系列</label>
            <input id="series" v-model="form.series" class="cc-input" type="text" maxlength="60" placeholder="Línea Clásica">
          </div>
          <div>
            <label class="cc-label" for="vitola">型号 <span class="text-red-400">*</span></label>
            <input id="vitola" v-model="form.vitola" class="cc-input" type="text" maxlength="60" placeholder="Robustos">
          </div>
          <div>
            <label class="cc-label" for="wrapperVariety">茄衣品种</label>
            <input id="wrapperVariety" v-model="form.wrapperVariety" class="cc-input" type="text" maxlength="60" placeholder="Corojo">
          </div>
          <div>
            <label class="cc-label" for="lengthInch">长度（英寸）</label>
            <input id="lengthInch" v-model.number="form.lengthInch" class="cc-input" type="number" min="3" max="10" step="0.1" inputmode="decimal" placeholder="4.9">
          </div>
          <div>
            <label class="cc-label" for="ringGauge">环径</label>
            <input id="ringGauge" v-model.number="form.ringGauge" class="cc-input" type="number" min="20" max="70" step="1" inputmode="numeric" placeholder="50">
          </div>
        </div>

        <!-- 产地与浓郁度 -->
        <div class="cc-card space-y-4 p-5">
          <div>
            <span class="cc-label">产地类型 <span class="text-red-400">*</span></span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in originTypes"
                :key="opt.value"
                type="button"
                class="cc-chip min-h-[44px] !px-4 !text-sm"
                :class="{ 'cc-chip-active': form.originType === opt.value }"
                @click="form.originType = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>

          <div>
            <label class="cc-label" for="countryCode">产地国家代码（2 位）</label>
            <select id="countryCode" v-model="form.countryCode" class="cc-input min-h-[44px]">
              <option value="">请选择</option>
              <option v-for="c in countryCodes" :key="c.code" :value="c.code">{{ c.code }} · {{ c.label }}</option>
            </select>
          </div>

          <div>
            <span class="cc-label">浓郁度（1 – 5）</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="s in strengthOptions"
                :key="s.value"
                type="button"
                class="grid h-11 min-w-[44px] place-items-center rounded-xl border px-3 text-sm font-medium transition-all duration-150 active:scale-95"
                :class="form.strength === s.value
                  ? 'border-cigar-gold bg-cigar-gold text-cigar-dark'
                  : 'border-cigar-light text-cigar-cream hover:border-cigar-gold/60'"
                @click="form.strength = s.value"
              >{{ s.label }}</button>
            </div>
          </div>
        </div>

        <!-- 风味 -->
        <div class="cc-card p-5">
          <div class="flex items-baseline justify-between gap-3">
            <span class="cc-label !mb-0">风味标签（可多选）</span>
            <span v-if="form.flavorIds.length" class="text-[11px] text-cigar-gold">已选 {{ form.flavorIds.length }}</span>
          </div>

          <div v-if="flavorsLoading" class="mt-3 space-y-2">
            <div class="cc-skeleton h-9 w-full" />
            <div class="cc-skeleton h-9 w-3/4" />
          </div>
          <p v-else-if="flavorsError" class="mt-2 text-xs text-amber-400">
            {{ flavorsError }}
            <button type="button" class="ml-1 underline hover:text-cigar-gold" @click="loadFlavors">重试</button>
          </p>

          <template v-else>
            <input v-model="flavorQuery" class="cc-input mt-3" type="text" placeholder="筛选风味，例如 雪松 / 可可">
            <div v-for="group in groupedFlavors" :key="group.key" class="mt-4">
              <p class="mb-2 text-[11px] text-cigar-smoke">{{ group.label }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="f in group.items"
                  :key="f.id"
                  type="button"
                  class="cc-chip min-h-[44px]"
                  :class="{ 'cc-chip-active': form.flavorIds.includes(f.id) }"
                  @click="toggleFlavor(f.id)"
                >{{ f.label || f.name }}</button>
              </div>
            </div>
            <p v-if="!groupedFlavors.length" class="mt-3 text-xs text-cigar-smoke">没有匹配的风味。</p>
          </template>
        </div>

        <!-- 描述 -->
        <div class="cc-card space-y-4 p-5">
          <div>
            <label class="cc-label" for="description">雪茄描述</label>
            <textarea id="description" v-model="form.description" class="cc-input min-h-[120px] resize-y leading-relaxed" placeholder="外观、卷制、前中后段风味的描述…" />
          </div>
          <div>
            <label class="cc-label" for="note">投稿说明</label>
            <textarea id="note" v-model="form.note" class="cc-input min-h-[80px] resize-y leading-relaxed" placeholder="数据来源、参考链接或需要审核员注意的地方…" />
          </div>
        </div>

        <!-- 提示 -->
        <div v-if="successMsg" class="rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {{ successMsg }}
        </div>

        <div v-if="rejectedWords.length" class="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <p class="font-medium">内容未通过合规校验，命中禁止交易的词：{{ rejectedWords.join('、') }}</p>
          <p class="mt-1.5 text-xs leading-relaxed">请删除代购、报价、售卖、私聊等词句后重试。</p>
        </div>

        <p v-if="validationError" class="cc-card border-red-500/50 p-4 text-sm text-red-400">{{ validationError }}</p>
        <p v-else-if="submitError && !rejectedWords.length" class="cc-card border-red-500/50 p-4 text-sm text-red-400">{{ submitError }}</p>

        <div class="flex flex-wrap gap-2">
          <button type="submit" class="cc-btn-primary" :disabled="submitting">
            {{ submitting ? '提交中…' : '提交提报' }}
          </button>
          <button type="button" class="cc-btn-ghost" @click="resetForm">清空</button>
        </div>
      </form>

      <!-- 我的提报记录 -->
      <section class="mt-8">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="font-display text-lg text-cigar-gold">我的提报记录</h2>
          <button class="cc-btn-ghost !px-3 !py-1.5 text-xs" :disabled="mineLoading" @click="loadMine">
            {{ mineLoading ? '加载中…' : '刷新' }}
          </button>
        </div>

        <div v-if="mineLoading && !mine.length" class="space-y-2">
          <div class="cc-skeleton h-16 w-full" />
          <div class="cc-skeleton h-16 w-full" />
        </div>
        <div v-else-if="mineError" class="cc-card p-4">
          <p class="text-sm text-red-400">{{ mineError }}</p>
          <button class="cc-btn-ghost mt-3" @click="loadMine">重试</button>
        </div>
        <p v-else-if="!mine.length" class="cc-card p-5 text-sm text-cigar-mute">还没有提报记录。</p>
        <div v-else class="space-y-2">
          <div v-for="item in mine" :key="item.id" class="cc-card p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="min-w-0 truncate text-sm text-cigar-cream">
                {{ item.payload?.brand || '—' }} {{ item.payload?.series || '' }} {{ item.payload?.vitola || '' }}
              </p>
              <span class="cc-chip shrink-0" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            </div>
            <p class="mt-1 text-[11px] text-cigar-smoke">{{ formatTime(item.createdAt) }}</p>
            <p v-if="item.status === 'rejected' && item.rejectReason" class="mt-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              驳回原因：{{ item.rejectReason }}
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client.js'
import { useAuth } from '@/composables/useAuth.js'

const auth = useAuth()
const route = useRoute()

// 产地类型由接口契约固定为二选一（API.md §7.1）
const originTypes = [
  { value: 'cuban', label: '古巴雪茄' },
  { value: 'non-cuban', label: '非古雪茄' },
]

// 常见产地国家代码（仅作输入便利，非 /api/meta 管辖的筛选选项）
const countryCodes = [
  { code: 'CU', label: '古巴' },
  { code: 'NI', label: '尼加拉瓜' },
  { code: 'DO', label: '多米尼加' },
  { code: 'HN', label: '洪都拉斯' },
  { code: 'MX', label: '墨西哥' },
  { code: 'EC', label: '厄瓜多尔' },
  { code: 'BR', label: '巴西' },
  { code: 'CM', label: '喀麦隆' },
  { code: 'ID', label: '印度尼西亚' },
  { code: 'PH', label: '菲律宾' },
  { code: 'CR', label: '哥斯达黎加' },
  { code: 'CO', label: '哥伦比亚' },
  { code: 'US', label: '美国' },
]

const form = reactive({
  brand: '',
  series: '',
  vitola: '',
  originType: 'cuban',
  countryCode: '',
  lengthInch: null,
  ringGauge: null,
  strength: null,
  wrapperVariety: '',
  flavorIds: [],
  description: '',
  note: '',
})

// 浓郁度：优先用 /api/meta 的标签，拿不到就退回纯数字
const metaStrengths = ref([])
const strengthOptions = computed(() => {
  if (metaStrengths.value.length) {
    return metaStrengths.value.map((s) => ({ value: Number(s.value), label: s.label || String(s.value) }))
  }
  return [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))
})

const submitting = ref(false)
const submitError = ref('')
const successMsg = ref('')
const rejectedWords = ref([])

// ---- 风味字典 ----
const flavors = ref([])
const flavorsLoading = ref(true)
const flavorsError = ref('')
const flavorQuery = ref('')

async function loadFlavors() {
  flavorsLoading.value = true
  flavorsError.value = ''
  try {
    const res = await api.flavors()
    flavors.value = Array.isArray(res?.flavors) ? res.flavors : []
  } catch (err) {
    flavorsError.value = err?.humanMessage || err?.message || '风味字典加载失败'
  } finally {
    flavorsLoading.value = false
  }
}

const groupedFlavors = computed(() => {
  const q = flavorQuery.value.trim().toLowerCase()
  const list = q
    ? flavors.value.filter((f) => `${f.label || ''}${f.name || ''}`.toLowerCase().includes(q))
    : flavors.value
  const map = new Map()
  for (const f of list) {
    const key = f.category || 'other'
    if (!map.has(key)) map.set(key, { key, label: f.categoryLabel || key, items: [] })
    map.get(key).items.push(f)
  }
  return [...map.values()]
})

function toggleFlavor(id) {
  const i = form.flavorIds.indexOf(id)
  if (i >= 0) form.flavorIds.splice(i, 1)
  else form.flavorIds.push(id)
}

// ---- 校验 ----
const validationError = computed(() => {
  if (!form.brand.trim()) return '品牌为必填项'
  if (!form.vitola.trim()) return '型号为必填项'
  if (form.countryCode && !/^[A-Za-z]{2}$/.test(form.countryCode.trim())) return '产地国家代码须为 2 位字母'
  if (form.lengthInch !== null && form.lengthInch !== '') {
    const v = Number(form.lengthInch)
    if (!Number.isFinite(v) || v < 3 || v > 10) return '长度需在 3 – 10 英寸之间'
  }
  if (form.ringGauge !== null && form.ringGauge !== '') {
    const v = Number(form.ringGauge)
    if (!Number.isFinite(v) || v < 20 || v > 70) return '环径需在 20 – 70 之间'
  }
  if (form.strength !== null && (form.strength < 1 || form.strength > 5)) return '浓郁度需在 1 – 5 之间'
  return ''
})

async function submit() {
  if (submitting.value || validationError.value) return
  submitting.value = true
  submitError.value = ''
  successMsg.value = ''
  rejectedWords.value = []

  try {
    const payload = {
      brand: form.brand.trim(),
      vitola: form.vitola.trim(),
      originType: form.originType,
    }
    if (form.series.trim()) payload.series = form.series.trim()
    if (form.countryCode.trim()) payload.countryCode = form.countryCode.trim().toUpperCase()
    if (form.wrapperVariety.trim()) payload.wrapperVariety = form.wrapperVariety.trim()
    if (form.description.trim()) payload.description = form.description.trim()
    if (form.note.trim()) payload.note = form.note.trim()
    if (form.flavorIds.length) payload.flavorIds = [...form.flavorIds]
    for (const key of ['lengthInch', 'ringGauge', 'strength']) {
      const v = Number(form[key])
      if (form[key] !== null && form[key] !== '' && Number.isFinite(v)) payload[key] = v
    }

    await api.submitCigar(payload)
    successMsg.value = '已提交，待审核。通过后会出现在雪茄数据库中。'
    resetForm()
    loadMine()
  } catch (err) {
    if (err.code === 'CONTENT_REJECTED') {
      rejectedWords.value = Array.isArray(err.matched) && err.matched.length ? err.matched : ['（未返回命中词）']
    } else if (err.code === 'CONTENT_QUEUED') {
      successMsg.value = '已提交，待人工审核。'
      resetForm()
      loadMine()
    } else if (err.code === 'UNAUTHORIZED') {
      submitError.value = '登录状态已过期，请重新登录后再提交'
    } else {
      submitError.value = err?.humanMessage || err?.message || '提交失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.brand = ''
  form.series = ''
  form.vitola = ''
  form.originType = 'cuban'
  form.countryCode = ''
  form.lengthInch = null
  form.ringGauge = null
  form.strength = null
  form.wrapperVariety = ''
  form.flavorIds = []
  form.description = ''
  form.note = ''
  rejectedWords.value = []
}

// ---- 我的提报 ----
const mine = ref([])
const mineLoading = ref(false)
const mineError = ref('')

async function loadMine() {
  mineLoading.value = true
  mineError.value = ''
  try {
    const res = await api.mySubmissions()
    mine.value = Array.isArray(res?.items) ? res.items : []
  } catch (err) {
    mineError.value = err?.humanMessage || err?.message || '提报记录加载失败'
  } finally {
    mineLoading.value = false
  }
}

const statusMap = {
  pending: { label: '待审核', class: 'border-amber-500/60 bg-amber-500/10 text-amber-400' },
  approved: { label: '已通过', class: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400' },
  rejected: { label: '已驳回', class: 'border-red-500/60 bg-red-500/10 text-red-400' },
}

function statusLabel(status) {
  return statusMap[status]?.label || status || '未知'
}

function statusClass(status) {
  return statusMap[status]?.class || 'border-cigar-light text-cigar-mute'
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  await auth.refresh()
  if (!auth.user) return
  loadFlavors()
  loadMine()
  // 浓郁度标签尽力而为，失败就退回数字
  api.meta()
    .then((res) => { metaStrengths.value = Array.isArray(res?.strengths) ? res.strengths : [] })
    .catch(() => { metaStrengths.value = [] })
})
</script>
