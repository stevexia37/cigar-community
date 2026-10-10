<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
    <header class="mb-6">
      <h1 class="font-display text-2xl text-cigar-gold sm:text-3xl">风味人格测试</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-cigar-mute">
        凭直觉选出你偏好的味道，看看你的雪茄风味人格，以及适合你的茄。
      </p>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="space-y-3">
      <div class="cc-skeleton h-6 w-2/3" />
      <div class="cc-skeleton h-10 w-full" />
      <div class="cc-skeleton h-10 w-full" />
      <div class="cc-skeleton h-10 w-3/4" />
    </div>

    <!-- 题目加载失败 -->
    <div v-else-if="loadError" class="cc-card p-5">
      <p class="text-sm text-red-400">{{ loadError }}</p>
      <button class="cc-btn-ghost mt-4" @click="loadQuestions">重试</button>
    </div>

    <!-- 结果 -->
    <section v-else-if="result" class="anim-fade-in space-y-4">
      <div class="cc-card p-6 text-center">
        <div class="text-5xl">{{ result.icon }}</div>
        <h2 class="mt-3 font-display text-2xl text-cigar-gold">{{ result.title }}</h2>
        <p class="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-cigar-cream">{{ result.description }}</p>
      </div>

      <div v-if="result.traits?.length" class="cc-card p-5">
        <h3 class="cc-label">你的风味标签</h3>
        <div class="mt-2 flex flex-wrap gap-2">
          <span v-for="t in result.traits" :key="t" class="cc-chip cc-chip-active">{{ t }}</span>
        </div>
      </div>

      <div v-if="result.scores?.length" class="cc-card p-5">
        <h3 class="cc-label">风味维度分布</h3>
        <div class="mt-3 space-y-3">
          <div v-for="s in result.scores" :key="s.category || s.label">
            <div class="mb-1 flex items-baseline justify-between text-xs">
              <span class="text-cigar-cream">{{ s.label }}</span>
              <span class="text-cigar-smoke">{{ s.percent }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-cigar-dark">
              <div class="h-full rounded-full bg-cigar-gold transition-all duration-500" :style="{ width: barWidth(s.percent) }" />
            </div>
          </div>
        </div>
      </div>

      <div v-if="result.recommended?.length" class="space-y-3">
        <h3 class="cc-label !mb-0">推荐给你的雪茄</h3>
        <template v-for="item in result.recommended" :key="item.id">
          <CigarCard v-if="hasFullFields(item)" compact :cigar="item" />
          <!-- 后端可能只返回精简对象，用文本卡片兜底 -->
          <router-link
            v-else
            :to="`/cigars/${item.id}`"
            class="cc-card flex items-center gap-3 p-4 transition-colors hover:border-cigar-gold/60"
          >
            <span class="text-2xl">🚬</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-cigar-cream">{{ item.brand || '未知品牌' }}</span>
              <span class="block truncate text-xs text-cigar-mute">{{ item.vitola || '未知型号' }}</span>
            </span>
            <span class="shrink-0 text-xs text-cigar-smoke">查看 →</span>
          </router-link>
        </template>
      </div>

      <div v-if="submitError" class="cc-card border-red-500/50 p-4">
        <p class="text-sm text-red-400">{{ submitError }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="cc-btn-primary" :disabled="copied" @click="share">
          {{ copied ? '已复制结果' : '分享结果' }}
        </button>
        <button class="cc-btn-ghost" @click="reset">重新测一次</button>
      </div>
    </section>

    <!-- 问答 -->
    <section v-else class="space-y-4">
      <div class="flex items-center gap-3">
        <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-cigar-light/60">
          <div class="h-full rounded-full bg-cigar-gold transition-all duration-300" :style="{ width: progressWidth }" />
        </div>
        <span class="shrink-0 text-[11px] text-cigar-smoke">{{ answeredCount }} / {{ questions.length }}</span>
      </div>

      <div v-for="(q, qi) in questions" :key="q.id" class="cc-card p-5">
        <p class="text-[11px] text-cigar-smoke">第 {{ qi + 1 }} 题{{ isMultiple(q) ? ' · 可多选' : '' }}</p>
        <h2 class="mt-1 font-display text-base text-cigar-cream sm:text-lg">{{ q.question }}</h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="opt in q.options"
            :key="String(opt.value)"
            class="cc-chip min-h-[44px] !px-3.5 !text-sm"
            :class="{ 'cc-chip-active': isPicked(q.id, opt.value) }"
            @click="pick(q, opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div v-if="submitError" class="cc-card border-red-500/50 p-4">
        <p class="text-sm text-red-400">{{ submitError }}</p>
        <button class="cc-btn-ghost mt-3" @click="submit">重试</button>
      </div>

      <button
        v-if="questions.length"
        class="cc-btn-primary w-full sm:w-auto"
        :disabled="!allAnswered || submitting"
        @click="submit"
      >{{ submitting ? '正在分析…' : allAnswered ? '查看我的风味人格' : '请先答完所有题目' }}</button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import api from '@/api/client.js'
import CigarCard from '@/components/CigarCard.vue'

const loading = ref(true)
const loadError = ref('')
const questions = ref([])

const picks = reactive({})        // { [questionId]: [value, ...] }
const result = ref(null)
const submitting = ref(false)
const submitError = ref('')
const copied = ref(false)

async function loadQuestions() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await api.flavorTestQuestions()
    questions.value = Array.isArray(res?.questions) ? res.questions : []
    if (!questions.value.length) loadError.value = '服务端没有下发测试题目'
  } catch (err) {
    loadError.value = err?.humanMessage || err?.message || '题目加载失败'
  } finally {
    loading.value = false
  }
}

// 题目若声明多选则多选，否则单选
function isMultiple(q) {
  return q?.multiple === true || q?.type === 'multiple' || q?.type === 'multi'
}

function isPicked(questionId, value) {
  return (picks[questionId] || []).includes(value)
}

function pick(q, value) {
  const list = picks[q.id] || (picks[q.id] = [])
  const i = list.indexOf(value)
  if (i >= 0) {
    list.splice(i, 1)
  } else if (isMultiple(q)) {
    list.push(value)
  } else {
    picks[q.id] = [value]
  }
}

const allAnswered = computed(() =>
  questions.value.length > 0 && questions.value.every((q) => (picks[q.id] || []).length > 0),
)

const answeredCount = computed(() => questions.value.filter((q) => (picks[q.id] || []).length > 0).length)

const progressWidth = computed(() => {
  if (!questions.value.length) return '0%'
  return `${Math.round((answeredCount.value / questions.value.length) * 100)}%`
})

// 按题目顺序拍平所选风味 id
const answerIds = computed(() => questions.value.flatMap((q) => picks[q.id] || []))

async function submit() {
  if (submitting.value || !allAnswered.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const res = await api.flavorTest(answerIds.value)
    result.value = res?.result || null
    if (!result.value) submitError.value = '测试结果为空，请重试'
  } catch (err) {
    submitError.value = err?.humanMessage || err?.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

// 全部答完自动提交（多选题允许继续修改，这里仅在单选场景更友好：仍保留手动按钮）
watch(allAnswered, (ok) => {
  if (ok && !result.value && questions.value.every((q) => !isMultiple(q))) submit()
})

function barWidth(percent) {
  const n = Number(percent)
  return `${Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0))}%`
}

// /api/cigars 列表项才带这些字段，精简对象没有
function hasFullFields(item) {
  return !!(item && item.id && (item.originLabel || item.strengthLabel || item.vitolaFamilyLabel || item.rating !== undefined))
}

function reset() {
  Object.keys(picks).forEach((k) => delete picks[k])
  result.value = null
  submitError.value = ''
  copied.value = false
}

async function share() {
  const r = result.value
  if (!r) return
  const scores = (r.scores || []).map((s) => `${s.label} ${s.percent}%`).join('、')
  const text = `【雪茄客 · 风味人格测试】\n我的人格是：${r.icon} ${r.title}\n${r.description}\n风味标签：${(r.traits || []).join('、')}\n维度分布：${scores}\n来测测你是哪一种？`
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    window.alert(text)
  }
}

onMounted(loadQuestions)
</script>
