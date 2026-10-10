<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
    <header class="mb-6">
      <h1 class="font-display text-2xl text-cigar-gold sm:text-3xl">醇化计算器</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-cigar-mute">
        按当前存放环境和已醇化时长，估算这支茄的最佳品吸窗口。
      </p>
    </header>

    <form class="space-y-4" @submit.prevent="submit">
      <!-- 雪茄选择 -->
      <div class="cc-card p-5">
        <label class="cc-label" for="aging-cigar">选择雪茄（可选）</label>
        <div v-if="loadingOptions" class="cc-skeleton h-11 w-full" />
        <template v-else>
          <input
            id="aging-cigar"
            v-model="cigarQuery"
            class="cc-input"
            type="text"
            autocomplete="off"
            placeholder="搜索品牌或型号，例如 Cohiba"
            @focus="dropdownOpen = true"
            @input="dropdownOpen = true"
          >
          <p v-if="optionsError" class="mt-2 text-xs text-amber-400">
            {{ optionsError }}（可直接按浓郁度估算）
          </p>
          <div v-if="dropdownOpen && filteredCigars.length" class="mt-2 max-h-56 overflow-y-auto rounded-xl border border-cigar-light bg-cigar-dark">
            <button
              v-for="c in filteredCigars"
              :key="c.id"
              type="button"
              class="flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-cigar-light/40 px-3.5 py-2.5 text-left text-sm text-cigar-cream last:border-b-0 hover:bg-cigar-light/40"
              @click="selectCigar(c)"
            >
              <span class="min-w-0 flex-1 truncate">{{ c.label }}</span>
              <span class="shrink-0 text-[11px] text-cigar-smoke">浓郁度 {{ c.strength }}</span>
            </button>
          </div>
          <div v-if="selectedCigar" class="mt-2 flex items-center gap-2">
            <span class="cc-chip cc-chip-active">{{ selectedCigar.label }}</span>
            <button type="button" class="text-[11px] text-cigar-mute hover:text-cigar-gold" @click="clearCigar">取消选择</button>
          </div>
        </template>

        <!-- 未选雪茄时按浓郁度估算 -->
        <div v-if="!selectedCigar" class="mt-4">
          <span class="cc-label">或直接按浓郁度估算（1 清淡 – 5 浓郁）</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="n in [1, 2, 3, 4, 5]"
              :key="n"
              type="button"
              class="grid h-11 w-11 place-items-center rounded-xl border text-sm font-medium transition-all duration-150 active:scale-95"
              :class="form.strength === n
                ? 'border-cigar-gold bg-cigar-gold text-cigar-dark'
                : 'border-cigar-light text-cigar-cream hover:border-cigar-gold/60'"
              @click="form.strength = n"
            >{{ n }}</button>
          </div>
        </div>
      </div>

      <!-- 环境与时长 -->
      <div class="cc-card space-y-5 p-5">
        <div>
          <div class="flex items-baseline justify-between">
            <label class="cc-label !mb-0" for="age">已醇化月数</label>
            <span class="text-sm text-cigar-gold">{{ form.currentAgeMonths }} 个月</span>
          </div>
          <input
            id="age"
            v-model.number="form.currentAgeMonths"
            class="cc-input mt-2"
            type="number"
            min="0"
            max="600"
            step="1"
            inputmode="numeric"
          >
          <input
            v-model.number="form.currentAgeMonths"
            class="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-cigar-light accent-cigar-gold"
            type="range"
            min="0"
            max="240"
            step="1"
          >
        </div>

        <div>
          <div class="flex items-baseline justify-between">
            <label class="cc-label !mb-0" for="humidity">湿度</label>
            <span class="text-sm text-cigar-gold">{{ form.humidity }}%</span>
          </div>
          <input
            id="humidity"
            v-model.number="form.humidity"
            class="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-cigar-light accent-cigar-gold"
            type="range"
            min="55"
            max="80"
            step="1"
          >
          <div class="mt-1 flex justify-between text-[11px] text-cigar-smoke"><span>55%</span><span>80%</span></div>
        </div>

        <div>
          <div class="flex items-baseline justify-between">
            <label class="cc-label !mb-0" for="temperature">温度</label>
            <span class="text-sm text-cigar-gold">{{ form.temperature }} ℃</span>
          </div>
          <input
            id="temperature"
            v-model.number="form.temperature"
            class="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-cigar-light accent-cigar-gold"
            type="range"
            min="10"
            max="26"
            step="1"
          >
          <div class="mt-1 flex justify-between text-[11px] text-cigar-smoke"><span>10℃</span><span>26℃</span></div>
        </div>

        <p v-if="validationError" class="rounded-xl border border-red-500/50 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
          {{ validationError }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="submit" class="cc-btn-primary" :disabled="!!validationError || loading">
          {{ loading ? '计算中…' : '开始计算' }}
        </button>
        <button type="button" class="cc-btn-ghost" @click="resetAll">重置</button>
      </div>

      <p v-if="submitError" class="cc-card border-red-500/50 p-4 text-sm text-red-400">{{ submitError }}</p>
    </form>

    <!-- 结果 -->
    <section v-if="result" class="anim-fade-in mt-6 space-y-4">
      <div class="cc-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-lg text-cigar-gold">最佳品吸窗口</h2>
          <span class="cc-chip" :class="statusClass(result.status)">{{ result.statusLabel || result.status }}</span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p class="cc-label">窗口区间</p>
            <p class="font-display text-xl text-cigar-cream">
              {{ result.peakFromMonths }} – {{ result.peakToMonths }} 个月
            </p>
            <p class="mt-1 text-[11px] text-cigar-smoke">{{ yearsLabel(result.peakFromMonths) }} ~ {{ yearsLabel(result.peakToMonths) }}</p>
          </div>
          <div>
            <p class="cc-label">距巅峰还需</p>
            <p class="font-display text-xl text-cigar-cream">
              {{ result.yearsToPeak }} <span class="text-sm">年</span>
            </p>
            <p class="mt-1 text-[11px] text-cigar-smoke">约 {{ Math.round(result.yearsToPeak * 12) }} 个月</p>
          </div>
        </div>
      </div>

      <!-- 环境检查 -->
      <div v-if="result.environment" class="cc-card p-5">
        <h3 class="cc-label">存放环境检查</h3>
        <div class="mt-3 space-y-2">
          <div
            v-for="env in envRows"
            :key="env.key"
            class="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-sm"
            :class="env.ok
              ? 'border-cigar-light bg-cigar-dark/40 text-cigar-cream'
              : 'border-red-500/60 bg-red-500/10 text-red-400'"
          >
            <span class="font-medium">{{ env.label }}</span>
            <span class="text-xs">
              目标 {{ env.target || '—' }}
              <span v-if="!env.ok" class="ml-1 font-medium">· 当前不在目标区间</span>
              <span v-else class="ml-1">· 正常</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 建议 -->
      <div v-if="result.advice?.length" class="cc-card p-5">
        <h3 class="cc-label">醇化建议</h3>
        <ul class="mt-3 space-y-2.5">
          <li v-for="(a, i) in result.advice" :key="i" class="flex gap-3 text-sm leading-relaxed text-cigar-cream">
            <span class="mt-0.5 shrink-0 text-cigar-gold">·</span>
            <span>{{ a }}</span>
          </li>
        </ul>
      </div>

      <button class="cc-btn-ghost" @click="result = null">重新计算</button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '@/api/client.js'

const loadingOptions = ref(true)
const optionsError = ref('')
const cigars = ref([])

const cigarQuery = ref('')
const dropdownOpen = ref(false)
const selectedCigar = ref(null)

const form = reactive({
  strength: 3,
  currentAgeMonths: 6,
  humidity: 68,
  temperature: 18,
})

const loading = ref(false)
const submitError = ref('')
const result = ref(null)

// 状态徽章配色：fresh→蓝 / aging→金 / peak→绿 / past-peak→红
const statusMap = {
  fresh: 'border-sky-500/60 bg-sky-500/10 text-sky-400',
  aging: 'border-cigar-gold bg-cigar-gold/15 text-cigar-gold',
  peak: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400',
  'past-peak': 'border-red-500/60 bg-red-500/10 text-red-400',
}

function statusClass(status) {
  return statusMap[status] || 'border-cigar-light text-cigar-mute'
}

async function loadOptions() {
  loadingOptions.value = true
  optionsError.value = ''
  try {
    const res = await api.agingOptions()
    cigars.value = Array.isArray(res?.cigars) ? res.cigars : []
  } catch (err) {
    optionsError.value = err?.humanMessage || err?.message || '雪茄列表加载失败'
  } finally {
    loadingOptions.value = false
  }
}

const filteredCigars = computed(() => {
  const q = cigarQuery.value.trim().toLowerCase()
  const list = q
    ? cigars.value.filter((c) => String(c.label || '').toLowerCase().includes(q))
    : cigars.value
  return list.slice(0, 40)
})

function selectCigar(c) {
  selectedCigar.value = c
  cigarQuery.value = c.label
  dropdownOpen.value = false
  if (Number.isFinite(Number(c.strength))) form.strength = Number(c.strength)
}

function clearCigar() {
  selectedCigar.value = null
  cigarQuery.value = ''
  dropdownOpen.value = false
}

// ---- 校验：范围非法则禁止提交 ----
const validationError = computed(() => {
  const age = Number(form.currentAgeMonths)
  if (!Number.isFinite(age) || age < 0 || age > 600) return '已醇化月数需为 0 – 600 之间的数字'
  const h = Number(form.humidity)
  if (!Number.isFinite(h) || h < 55 || h > 80) return '湿度需在 55% – 80% 之间'
  const t = Number(form.temperature)
  if (!Number.isFinite(t) || t < 10 || t > 26) return '温度需在 10℃ – 26℃ 之间'
  if (!selectedCigar.value) {
    const s = Number(form.strength)
    if (!Number.isFinite(s) || s < 1 || s > 5) return '浓郁度需在 1 – 5 之间'
  }
  return ''
})

async function submit() {
  if (validationError.value || loading.value) return
  loading.value = true
  submitError.value = ''
  result.value = null
  try {
    const payload = {
      currentAgeMonths: Number(form.currentAgeMonths),
      humidity: Number(form.humidity),
      temperature: Number(form.temperature),
    }
    // cigarId 与 strength 二选一
    if (selectedCigar.value) payload.cigarId = selectedCigar.value.id
    else payload.strength = Number(form.strength)

    const res = await api.agingCalc(payload)
    result.value = res?.result || null
    if (!result.value) submitError.value = '计算结果为空，请重试'
  } catch (err) {
    submitError.value = err?.humanMessage || err?.message || '计算失败'
  } finally {
    loading.value = false
  }
}

const envRows = computed(() => {
  const env = result.value?.environment
  if (!env) return []
  return [
    { key: 'humidity', label: '湿度', ok: !!env.humidity?.ok, target: env.humidity?.target },
    { key: 'temperature', label: '温度', ok: !!env.temperature?.ok, target: env.temperature?.target },
  ]
})

function yearsLabel(months) {
  const n = Number(months)
  if (!Number.isFinite(n)) return '—'
  return `约 ${(n / 12).toFixed(1)} 年`
}

function resetAll() {
  clearCigar()
  form.strength = 3
  form.currentAgeMonths = 6
  form.humidity = 68
  form.temperature = 18
  result.value = null
  submitError.value = ''
}

onMounted(loadOptions)
</script>
