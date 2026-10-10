<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
    <!-- 标题 -->
    <header class="mb-6">
      <h1 class="font-display text-2xl text-cigar-gold sm:text-3xl">雪茄病害一键诊断</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-cigar-mute">
        逐步回答几个问题，帮你判断是发霉、开花还是虫害，并给出抢救步骤。
      </p>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="space-y-3">
      <div class="cc-skeleton h-6 w-2/3" />
      <div class="cc-skeleton h-24 w-full" />
      <div class="cc-skeleton h-24 w-full" />
    </div>

    <!-- 题目加载失败 -->
    <div v-else-if="loadError" class="cc-card p-5">
      <p class="text-sm text-red-400">{{ loadError }}</p>
      <button class="cc-btn-ghost mt-4" @click="loadQuestions">重试</button>
    </div>

    <!-- 诊断结果 -->
    <section v-else-if="diagnosis" class="anim-fade-in space-y-4">
      <!-- unknown：引导发帖求助 -->
      <div v-if="diagnosis.key === 'unknown'" class="cc-card p-6 text-center">
        <div class="text-5xl">🤔</div>
        <h2 class="mt-3 font-display text-xl text-cigar-cream">{{ diagnosis.title || '暂时无法判定' }}</h2>
        <p class="mt-2 text-sm leading-relaxed text-cigar-mute">
          {{ diagnosis.subtitle || '你的情况比较特殊，建议拍照后发帖求助，让有经验的老茄客帮你看一眼。' }}
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <router-link to="/reviews/new" class="cc-btn-primary">去发帖求助</router-link>
          <router-link to="/guide/plume-vs-mold" class="cc-btn-ghost">先看《起灰还是发霉》</router-link>
        </div>
        <button class="cc-btn-ghost mt-3" @click="reset">重新诊断</button>
      </div>

      <!-- 正常结果 -->
      <template v-else>
        <div class="cc-card overflow-hidden">
          <div class="flex items-start gap-4 p-5" :class="toneSoft[diagnosis.tone] || toneSoft.warning">
            <div class="text-4xl leading-none">{{ diagnosis.icon }}</div>
            <div class="min-w-0 flex-1">
              <h2 class="font-display text-xl text-cigar-cream">{{ diagnosis.title }}</h2>
              <p v-if="diagnosis.subtitle" class="mt-1 text-sm leading-relaxed text-cigar-mute">{{ diagnosis.subtitle }}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 border-t border-cigar-light/70 p-5">
            <div>
              <p class="cc-label">预估存活率</p>
              <p class="font-display text-4xl leading-none" :class="toneText[diagnosis.tone] || toneText.warning">
                {{ diagnosis.survival }}<span class="ml-0.5 text-lg">%</span>
              </p>
            </div>
            <div>
              <p class="cc-label">严重等级 · {{ diagnosis.severity?.label || '—' }}</p>
              <div class="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-cigar-dark">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="toneBar[diagnosis.severity?.tone] || toneBar.warning"
                  :style="{ width: barWidth(diagnosis.severity?.percent) }"
                />
              </div>
              <p class="mt-1.5 text-[11px] text-cigar-smoke">{{ diagnosis.severity?.percent ?? 0 }} / 100</p>
            </div>
          </div>
        </div>

        <!-- 抢救步骤 -->
        <div class="cc-card p-5">
          <h3 class="font-display text-lg text-cigar-gold">抢救步骤</h3>
          <ol class="mt-3 space-y-3">
            <li v-for="(step, i) in diagnosis.steps || []" :key="i" class="flex gap-3">
              <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cigar-gold/15 text-xs font-medium text-cigar-gold">
                {{ i + 1 }}
              </span>
              <span class="text-sm leading-relaxed text-cigar-cream">{{ step }}</span>
            </li>
          </ol>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="cc-btn-primary" @click="share" :disabled="copied">
            {{ copied ? '已复制结果' : '分享结果' }}
          </button>
          <button class="cc-btn-ghost" @click="reset">重新诊断</button>
        </div>

        <p v-if="diagnosis.notice" class="cc-card p-4 text-[11px] leading-relaxed text-cigar-mute">
          ⚠️ {{ diagnosis.notice }}
        </p>
      </template>
    </section>

    <!-- 问答流程 -->
    <section v-else class="space-y-4">
      <!-- 已答题目回显 -->
      <div v-for="(q, i) in answeredQuestions" :key="q.id" class="cc-card flex items-center gap-3 p-4">
        <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cigar-gold/15 text-[11px] text-cigar-gold">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs text-cigar-smoke">{{ q.question }}</p>
          <p class="truncate text-sm text-cigar-cream">{{ optionLabel(q, answers[q.id]) }}</p>
        </div>
        <button class="cc-btn-ghost shrink-0 !px-3 !py-1.5 text-xs" @click="goBackTo(q.id)">重新选择</button>
      </div>

      <!-- 当前题目 -->
      <transition name="cc-step" mode="out-in">
        <div v-if="activeQuestion" :key="activeQuestion.id" class="cc-card p-5">
          <p class="text-[11px] text-cigar-smoke">
            第 {{ activeIndex + 1 }} / {{ visibleQuestions.length }} 题
          </p>
          <h2 class="mt-1.5 font-display text-lg text-cigar-cream sm:text-xl">{{ activeQuestion.question }}</h2>

          <!-- grid：2 列大按钮 -->
          <div v-if="activeQuestion.type === 'grid'" class="mt-4 grid grid-cols-2 gap-3">
            <button
              v-for="opt in activeQuestion.options"
              :key="String(opt.value)"
              class="flex min-h-[92px] flex-col items-start gap-1 rounded-2xl border border-cigar-light bg-cigar-dark/40 p-3.5 text-left transition-all duration-150 hover:border-cigar-gold/60 active:scale-[0.98]"
              @click="answer(activeQuestion, opt.value)"
            >
              <span class="text-2xl leading-none">{{ opt.icon }}</span>
              <span class="text-sm font-medium leading-snug text-cigar-cream">{{ opt.label }}</span>
              <span v-if="opt.desc" class="text-[11px] leading-snug text-cigar-mute">{{ opt.desc }}</span>
            </button>
          </div>

          <!-- list：整行按钮 -->
          <div v-else class="mt-4 space-y-2">
            <button
              v-for="opt in activeQuestion.options"
              :key="String(opt.value)"
              class="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-cigar-light bg-cigar-dark/40 px-3.5 py-3 text-left transition-all duration-150 hover:border-cigar-gold/60 active:scale-[0.99]"
              @click="answer(activeQuestion, opt.value)"
            >
              <span v-if="opt.icon" class="text-xl leading-none">{{ opt.icon }}</span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-cigar-cream">{{ opt.label }}</span>
                <span v-if="opt.desc" class="block text-[11px] leading-snug text-cigar-mute">{{ opt.desc }}</span>
              </span>
            </button>
          </div>
        </div>

        <!-- 提交中 -->
        <div v-else key="submitting" class="cc-card p-5">
          <p class="text-sm text-cigar-mute">正在生成诊断结果…</p>
        </div>
      </transition>

      <!-- 提交失败 -->
      <div v-if="submitError" class="cc-card border-red-500/50 p-4">
        <p class="text-sm text-red-400">{{ submitError }}</p>
        <button class="cc-btn-ghost mt-3" @click="submit">重试</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import api from '@/api/client.js'

const loading = ref(true)
const loadError = ref('')
const questions = ref([])

const answers = reactive({})       // { [questionId]: value }
const diagnosis = ref(null)
const submitting = ref(false)
const submitError = ref('')
const copied = ref(false)

// 严重等级配色（tone → 进度条 / 文字 / 柔和底色）
const toneBar = { safe: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-red-500' }
const toneText = { safe: 'text-emerald-400', warning: 'text-amber-400', danger: 'text-red-400' }
const toneSoft = {
  safe: 'bg-emerald-500/10',
  warning: 'bg-amber-500/10',
  danger: 'bg-red-500/10',
}

async function loadQuestions() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await api.diagnosticQuestions()
    questions.value = Array.isArray(res?.questions) ? res.questions : []
    if (!questions.value.length) loadError.value = '服务端没有下发诊断题目'
  } catch (err) {
    loadError.value = err?.humanMessage || err?.message || '题目加载失败'
  } finally {
    loading.value = false
  }
}

// dependsOn 兼容 questionId / questionnaireId / id，以及数组形式
function depKeys(dep) {
  const list = Array.isArray(dep) ? dep : [dep]
  return list.map((d) => d?.questionId ?? d?.questionnaireId ?? d?.id)
}

function isVisible(q) {
  const dep = q?.dependsOn
  if (!dep) return true
  const list = Array.isArray(dep) ? dep : [dep]
  return list.every((d) => {
    const key = d?.questionId ?? d?.questionnaireId ?? d?.id
    return answers[key] === d?.value
  })
}

const visibleQuestions = computed(() => questions.value.filter(isVisible))

// 当前激活题 = 第一道未作答的可见题
const activeIndex = computed(() => {
  const list = visibleQuestions.value
  for (let i = 0; i < list.length; i += 1) {
    if (answers[list[i].id] === undefined) return i
  }
  return -1
})

const activeQuestion = computed(() =>
  activeIndex.value >= 0 ? visibleQuestions.value[activeIndex.value] : null,
)

const answeredQuestions = computed(() =>
  activeIndex.value > 0 ? visibleQuestions.value.slice(0, activeIndex.value) : [],
)

function optionLabel(q, value) {
  const hit = (q?.options || []).find((o) => o.value === value)
  return hit ? `${hit.icon ? hit.icon + ' ' : ''}${hit.label}` : String(value)
}

// 清掉因分支变化而不可见题的答案
function prune() {
  const ids = new Set(visibleQuestions.value.map((q) => q.id))
  for (const key of Object.keys(answers)) {
    if (!ids.has(Number(key)) && !ids.has(key)) delete answers[key]
  }
}

function answer(q, value) {
  submitError.value = ''
  // 改选时清掉其后的作答，保证分支干净
  const idx = visibleQuestions.value.findIndex((v) => v.id === q.id)
  if (idx >= 0) {
    for (const later of visibleQuestions.value.slice(idx + 1)) delete answers[later.id]
  }
  answers[q.id] = value
  prune()
}

function goBackTo(questionId) {
  const idx = visibleQuestions.value.findIndex((q) => q.id === questionId)
  if (idx < 0) return
  // 回退到该题并清空其后的作答
  for (const later of visibleQuestions.value.slice(idx)) delete answers[later.id]
  submitError.value = ''
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const res = await api.diagnostic({ ...answers })
    diagnosis.value = res?.diagnosis || null
    if (!diagnosis.value) submitError.value = '诊断结果为空，请重试'
  } catch (err) {
    submitError.value = err?.humanMessage || err?.message || '诊断请求失败'
  } finally {
    submitting.value = false
  }
}

// 全部答完自动提交
watch(
  () => activeIndex.value === -1 && visibleQuestions.value.length > 0 && !diagnosis.value,
  (ready) => { if (ready) submit() },
)

function barWidth(percent) {
  const n = Number(percent)
  return `${Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0))}%`
}

function reset() {
  Object.keys(answers).forEach((k) => delete answers[k])
  diagnosis.value = null
  submitError.value = ''
  copied.value = false
}

async function share() {
  const d = diagnosis.value
  if (!d) return
  const steps = (d.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')
  const text = `【雪茄病害诊断】${d.title}\n预估存活率：${d.survival}%\n严重等级：${d.severity?.label || '—'}\n\n抢救步骤：\n${steps}\n\n—— 雪茄客 · 病害诊断工具`
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // 兜底：非安全上下文 / 权限被拒时直接弹窗
    window.alert(text)
  }
}

onMounted(loadQuestions)
</script>

<style scoped>
/* 步骤切换过渡 */
.cc-step-enter-active,
.cc-step-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.cc-step-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.cc-step-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
