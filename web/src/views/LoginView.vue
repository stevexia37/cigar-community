<template>
  <div class="mx-auto max-w-md px-4 pb-16 pt-10 sm:pt-14">
    <div class="text-center">
      <div class="text-3xl" aria-hidden="true">🚬</div>
      <h1 class="mt-2 font-display text-2xl text-cigar-gold">
        {{ mode === 'login' ? '欢迎回来' : '加入雪茄客' }}
      </h1>
      <p class="mt-1.5 text-xs leading-relaxed text-cigar-mute">
        非交易向的雪茄知识社区<br />
        本站不售烟草，也不提供任何购买渠道
      </p>
    </div>

    <!-- Tab 切换 -->
    <div class="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-cigar-light bg-cigar-mid/60 p-1">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="rounded-lg px-3 py-2 text-sm transition-colors"
        :class="mode === tab.value ? 'bg-cigar-gold text-cigar-dark font-medium' : 'text-cigar-mute hover:text-cigar-cream'"
        @click="switchMode(tab.value)"
      >{{ tab.label }}</button>
    </div>

    <form class="cc-card mt-4 space-y-4 p-5" novalidate @submit.prevent="submit">
      <!-- 用户名 -->
      <div>
        <label class="cc-label" for="cc-username">
          用户名 <span class="text-cigar-smoke">{{ mode === 'register' ? '（3-24 位，字母/数字/下划线/中文）' : '' }}</span>
        </label>
        <input
          id="cc-username"
          v-model.trim="form.username"
          class="cc-input"
          type="text"
          autocomplete="username"
          placeholder="你的用户名"
          maxlength="24"
        />
        <p v-if="errors.username" class="mt-1.5 text-xs text-red-300">{{ errors.username }}</p>
      </div>

      <!-- 口令 -->
      <div>
        <label class="cc-label" for="cc-password">
          口令 <span class="text-cigar-smoke">{{ mode === 'register' ? '（至少 8 位，且不能是纯数字）' : '' }}</span>
        </label>
        <input
          id="cc-password"
          v-model="form.password"
          class="cc-input"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          placeholder="请输入口令"
        />
        <p v-if="errors.password" class="mt-1.5 text-xs text-red-300">{{ errors.password }}</p>
      </div>

      <!-- 确认口令（仅注册） -->
      <div v-if="mode === 'register'">
        <label class="cc-label" for="cc-password2">确认口令</label>
        <input
          id="cc-password2"
          v-model="form.password2"
          class="cc-input"
          type="password"
          autocomplete="new-password"
          placeholder="再输一遍"
        />
        <p v-if="errors.password2" class="mt-1.5 text-xs text-red-300">{{ errors.password2 }}</p>
      </div>

      <!-- 邮箱（可选，仅注册） -->
      <div v-if="mode === 'register'">
        <label class="cc-label" for="cc-email">邮箱 <span class="text-cigar-smoke">（可选，仅用于找回账号）</span></label>
        <input
          id="cc-email"
          v-model.trim="form.email"
          class="cc-input"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
        />
        <p v-if="errors.email" class="mt-1.5 text-xs text-red-300">{{ errors.email }}</p>
      </div>

      <!-- 服务端错误 -->
      <p v-if="formError" class="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
        {{ formError }}
      </p>

      <button type="submit" class="cc-btn-primary w-full" :disabled="submitting">
        {{ submitting ? '处理中…' : (mode === 'login' ? '登录' : '注册并登录') }}
      </button>

      <p v-if="mode === 'login'" class="text-center text-xs text-cigar-smoke">
        还没有账号？<button type="button" class="text-cigar-gold hover:underline" @click="switchMode('register')">去注册</button>
      </p>
      <p v-else class="text-center text-xs text-cigar-smoke">
        已有账号？<button type="button" class="text-cigar-gold hover:underline" @click="switchMode('login')">去登录</button>
      </p>

      <p class="border-t border-cigar-light/50 pt-3 text-center text-[11px] leading-relaxed text-cigar-smoke">
        注册即表示你已年满 18 周岁，并同意本站
        <router-link to="/about" class="text-cigar-mute underline hover:text-cigar-gold">免责声明与社区公约</router-link>。
        禁止发布任何代购、拼单、报价或私聊交易信息。
      </p>
    </form>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const tabs = [
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' },
]

const mode = ref('login')
const submitting = ref(false)
const formError = ref('')
const errors = reactive({ username: '', password: '', password2: '', email: '' })
const form = reactive({ username: '', password: '', password2: '', email: '' })

function clearErrors() {
  errors.username = ''
  errors.password = ''
  errors.password2 = ''
  errors.email = ''
  formError.value = ''
}

function switchMode(next) {
  if (mode.value === next) return
  mode.value = next
  form.password = ''
  form.password2 = ''
  clearErrors()
}

// 与后端规则保持一致：用户名 3-24 位字母/数字/下划线/中文；口令 ≥8 位且非纯数字
const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,24}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate() {
  clearErrors()
  let ok = true
  const username = form.username.trim()

  if (!username) {
    errors.username = '请输入用户名'
    ok = false
  } else if (mode.value === 'register' && !USERNAME_RE.test(username)) {
    errors.username = '用户名需为 3-24 位的字母、数字、下划线或中文'
    ok = false
  }

  if (!form.password) {
    errors.password = '请输入口令'
    ok = false
  } else if (mode.value === 'register') {
    if (form.password.length < 8) {
      errors.password = '口令至少 8 位'
      ok = false
    } else if (/^\d+$/.test(form.password)) {
      errors.password = '口令不能是纯数字，请混合字母或符号'
      ok = false
    }
  }

  if (mode.value === 'register') {
    if (!form.password2) {
      errors.password2 = '请再输入一遍口令'
      ok = false
    } else if (form.password !== form.password2) {
      errors.password2 = '两次输入的口令不一致'
      ok = false
    }
    const email = form.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      errors.email = '邮箱格式看起来不对'
      ok = false
    }
  }

  return ok
}

function serverMessage(err) {
  if (err?.status === 409 || err?.code === 'CONFLICT') return '用户名已被占用，换一个试试'
  if (err?.status === 429 || err?.code === 'TOO_MANY_REQUESTS') return '操作过于频繁，请稍后再试'
  if (err?.status === 401 || err?.code === 'UNAUTHORIZED') return '用户名或口令不正确'
  return err?.humanMessage || '请求失败，请稍后重试'
}

async function submit() {
  if (submitting.value) return
  if (!validate()) return

  submitting.value = true
  formError.value = ''
  const username = form.username.trim()
  try {
    if (mode.value === 'login') {
      await auth.login({ username, password: form.password })
    } else {
      const payload = { username, password: form.password }
      const email = form.email.trim()
      if (email) payload.email = email
      await auth.register(payload)
    }
    form.password = ''
    form.password2 = ''
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    // 只接受站内相对路径，避免开放重定向
    const target = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
    router.push(target)
  } catch (err) {
    formError.value = serverMessage(err)
  } finally {
    submitting.value = false
  }
}
</script>
