<template>
  <!-- 年龄门：服务端用 Cookie cc_age 判定，爬虫 UA 由服务端直接放行（不渲染本组件） -->
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-cigar-dark/97 px-5 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="age-gate-title"
  >
    <div class="w-full max-w-sm cc-card p-7 text-center anim-slide-up">
      <div class="mb-3 text-4xl">🚬</div>
      <h2 id="age-gate-title" class="font-display text-xl text-cigar-gold">雪茄客</h2>
      <p class="mt-1.5 text-xs text-cigar-mute">纯粹交流地 · 非交易向雪茄社区</p>

      <p class="mt-6 text-sm leading-relaxed text-cigar-cream">
        本网站含烟草相关知识与品鉴内容，<br />
        仅限<strong class="text-cigar-gold">年满 18 周岁</strong>的成年人访问。
      </p>

      <p v-if="error" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{{ error }}</p>

      <div class="mt-6 space-y-2.5">
        <button class="cc-btn-primary w-full" :disabled="submitting" @click="confirm">
          {{ submitting ? '正在确认…' : '我已年满 18 周岁' }}
        </button>
        <button class="cc-btn-ghost w-full" @click="decline">未满 18 周岁，离开</button>
      </div>

      <p class="mt-5 text-[10px] leading-relaxed text-cigar-smoke">
        继续访问即表示你同意本站
        <router-link to="/about" class="underline hover:text-cigar-mute">免责声明与社区公约</router-link>。
        本站不售卖烟草制品，不提供任何购买渠道。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/client.js'

const STORAGE_KEY = 'cc-age-ok'
const visible = ref(false)
const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  // 先用本地标记避免闪烁，但**仍要向服务端确认**。
  //
  // 为什么不能只信本地标记：标记在 localStorage 里，而年龄凭证是 30 天过期的
  // HttpOnly Cookie。用户清了 cookie、cookie 过期、或换到隐私窗口时，
  // 本地标记说「已确认」而服务端说没有 —— 于是弹窗不出现，
  // 内容请求全被 403 拦下，页面卡在错误提示上且用户无从自救。真实踩过。
  let locallyConfirmed = false
  try {
    locallyConfirmed = localStorage.getItem(STORAGE_KEY) === '1'
  } catch { /* 隐私模式禁用 localStorage，继续走服务端校验 */ }

  try {
    const me = await api.me()
    // 服务端把「已通过年龄门」或「爬虫」都标记为 ageVerified
    if (me?.ageVerified) {
      remember()
      return
    }
    // 服务端说没过 → 本地标记已失效，清掉并弹窗
    if (locallyConfirmed) {
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* 忽略 */ }
    }
  } catch {
    // 后端探测失败：若本地确认过就先放行（后端未起的场景不阻塞页面），
    // 否则展示年龄门
    if (locallyConfirmed) return
  }

  visible.value = true
})

function remember() {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* 忽略 */ }
}

async function confirm() {
  submitting.value = true
  error.value = ''
  try {
    await api.verifyAge(true)
    remember()
    visible.value = false
    // 不需要在这里通知各视图重试：api/client.js 对 AGE_GATE_REQUIRED 有统一
    // 自动重试（等用户确认后重发），所以视图无需各自处理（这个通用机制取代了
    // 最初只在首页加的那套局部回调 —— 局部补丁漏掉了其余所有视图）
  } catch (err) {
    error.value = err.humanMessage || '确认失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function decline() {
  window.location.replace('https://www.baidu.com/s?wd=%E5%90%B8%E7%83%9F%E6%9C%89%E5%AE%B3%E5%81%A5%E5%BA%B7')
}
</script>

<style scoped>
.anim-slide-up {
  animation: gateIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes gateIn {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
