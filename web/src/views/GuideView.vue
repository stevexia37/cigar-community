<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
    <header class="mb-5">
      <p class="text-[11px] uppercase tracking-widest text-cigar-smoke">雪茄养护指南</p>
      <h1 class="font-display text-2xl text-cigar-gold sm:text-3xl">{{ title || '起灰还是发霉' }}</h1>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="space-y-3">
      <div class="cc-skeleton h-7 w-1/2" />
      <div class="cc-skeleton h-40 w-full" />
      <div class="cc-skeleton h-24 w-full" />
    </div>

    <!-- 加载失败 / 内容为空：降级文案 + 重试 -->
    <div v-else-if="error" class="cc-card p-6 text-center">
      <div class="text-4xl">📖</div>
      <h2 class="mt-3 font-display text-lg text-cigar-cream">图文内容暂时打不开</h2>
      <p class="mt-2 text-sm leading-relaxed text-cigar-mute">{{ error }}</p>
      <p class="mt-2 text-xs leading-relaxed text-cigar-smoke">
        简单判断：结晶体（起灰）通常是白色粉末状、能擦掉且不再长；发霉是毛绒状、可能带蓝绿或黑点、擦掉后茄衣留痕还会复发。
      </p>
      <button class="cc-btn-primary mt-4" @click="load">重试</button>
    </div>

    <!-- 正文 -->
    <template v-else>
      <article class="cc-card cc-guide overflow-hidden p-5 sm:p-7" v-html="bodyHtml" />

      <div class="mt-5 flex flex-wrap gap-2">
        <router-link to="/tools/diagnostic" class="cc-btn-primary">不确定？做个病害诊断</router-link>
        <router-link to="/cigars" class="cc-btn-ghost">回到雪茄数据库</router-link>
      </div>

      <p class="mt-5 text-[11px] leading-relaxed text-cigar-smoke">
        ⚠️ 本文为经验性养护参考，不构成专业鉴定意见。严重霉变（深入茄芯、有异味）的雪茄不建议继续抽吸。
      </p>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '@/api/client.js'

const loading = ref(true)
const error = ref('')
const title = ref('')
const bodyHtml = ref('')

// 静态文件是一整份 HTML 文档，只取 <body> 内部；拿不到 body 时去掉外壳整体渲染
function extractBody(html) {
  if (typeof html !== 'string') return ''
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  if (m && m[1].trim()) return stripDangerous(m[1])
  return stripDangerous(
    html
      .replace(/<!doctype[^>]*>/gi, '')
      // 去掉 head：整份文档的 <style> 会污染全站暗色主题，这里改用 scoped 覆盖
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?body[^>]*>/gi, ''),
  )
}

// 静态内容虽可信，仍剥掉脚本与内联事件，避免意外执行
function stripDangerous(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.content('plume-vs-mold')
    title.value = res?.title || ''
    const body = extractBody(res?.html)
    if (!body.trim()) {
      error.value = '服务端返回的内容为空。'
      bodyHtml.value = ''
      return
    }
    bodyHtml.value = body
  } catch (err) {
    error.value = err?.humanMessage || err?.message || '内容加载失败'
    bodyHtml.value = ''
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* 用 :deep 覆盖 v-html 插入的节点（scoped 属性不会加到它们身上）。
   颜色一律走 cigar-* token，不用裸色值；背景强制透明以适配暗色主题。 */
.cc-guide {
  /* 源文档内联 style 里引用了这些变量，这里映射到 cigar-* token 让它们继续生效 */
  --bg: theme('colors.cigar.dark');
  --card: theme('colors.cigar.mid');
  --border: theme('colors.cigar.light');
  --gold: theme('colors.cigar.gold');
  --cream: theme('colors.cigar.cream');
  --mute: theme('colors.cigar.mute');
}

.cc-guide :deep(html),
.cc-guide :deep(body),
.cc-guide :deep(main),
.cc-guide :deep(section),
.cc-guide :deep(article),
.cc-guide :deep(header),
.cc-guide :deep(footer),
.cc-guide :deep(table),
.cc-guide :deep(thead),
.cc-guide :deep(tbody),
.cc-guide :deep(tr),
.cc-guide :deep(td),
.cc-guide :deep(th),
.cc-guide :deep(pre),
.cc-guide :deep(code),
.cc-guide :deep(blockquote) {
  background-color: transparent !important;
}

.cc-guide :deep(h1),
.cc-guide :deep(h2),
.cc-guide :deep(h3),
.cc-guide :deep(h4) {
  @apply font-display text-cigar-gold;
  line-height: 1.35;
  margin: 1.4em 0 0.6em;
}
.cc-guide :deep(h1) { @apply text-2xl; margin-top: 0; }
.cc-guide :deep(h2) { @apply text-xl; }
.cc-guide :deep(h3) { @apply text-base; }

.cc-guide :deep(p),
.cc-guide :deep(li),
.cc-guide :deep(td),
.cc-guide :deep(th),
.cc-guide :deep(dd),
.cc-guide :deep(dt) {
  @apply text-cigar-cream text-sm;
  line-height: 1.75;
}
.cc-guide :deep(p) { margin: 0.85em 0; }
.cc-guide :deep(a) { @apply text-cigar-gold underline; }
.cc-guide :deep(strong),
.cc-guide :deep(b) { @apply text-cigar-gold font-semibold; }
.cc-guide :deep(em),
.cc-guide :deep(i) { @apply text-cigar-mute; }
.cc-guide :deep(ul),
.cc-guide :deep(ol) { margin: 0.85em 0; padding-left: 1.4em; }
.cc-guide :deep(ul) { list-style: disc; }
.cc-guide :deep(ol) { list-style: decimal; }
.cc-guide :deep(li) { margin: 0.35em 0; }
.cc-guide :deep(hr) {
  border: 0;
  @apply border-t border-cigar-light;
  margin: 1.5em 0;
}
.cc-guide :deep(blockquote) {
  margin: 1em 0;
  @apply border-l-2 border-cigar-gold;
  padding: 0.2em 0 0.2em 1em;
}
.cc-guide :deep(blockquote p) { @apply text-cigar-mute; }
.cc-guide :deep(code),
.cc-guide :deep(pre) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  @apply text-cigar-cream text-xs;
}
.cc-guide :deep(pre) {
  overflow-x: auto;
  @apply border border-cigar-light rounded-xl;
  padding: 0.85rem 1rem;
}
.cc-guide :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
  display: block;
  overflow-x: auto;
  @apply text-sm;
}
.cc-guide :deep(th),
.cc-guide :deep(td) {
  @apply border border-cigar-light;
  padding: 0.6rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
.cc-guide :deep(th) { @apply text-cigar-gold font-semibold; }
.cc-guide :deep(img) {
  max-width: 100%;
  height: auto;
  @apply rounded-xl;
  margin: 1em 0;
}
.cc-guide :deep(figure),
.cc-guide :deep(figcaption) { margin: 1em 0; }
.cc-guide :deep(figcaption) { @apply text-cigar-mute text-xs; }
.cc-guide :deep(.note),
.cc-guide :deep(.warning),
.cc-guide :deep(.callout) {
  @apply border border-cigar-light rounded-xl;
  padding: 0.85rem 1rem;
  margin: 1em 0;
}

/* 源文档的语义 class（head 里的 <style> 已按需丢弃，这里用 cigar-* token 复刻外观） */
.cc-guide :deep(h2) {
  @apply border-l-2 border-cigar-gold;
  padding-left: 0.5rem;
}
.cc-guide :deep(.subtitle) {
  @apply text-cigar-mute text-sm border-b border-cigar-light;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}
.cc-guide :deep(.highlight) {
  @apply text-cigar-gold bg-cigar-gold/10 rounded-sm;
  padding: 0 4px;
}
.cc-guide :deep(.danger) { @apply text-red-400 font-semibold; }
.cc-guide :deep(.success) { @apply text-emerald-400 font-semibold; }
.cc-guide :deep(.tip-box) {
  @apply border border-cigar-light rounded-xl;
  padding: 1rem 1.2rem;
  margin: 1rem 0;
}
.cc-guide :deep(.tip-box.danger) { @apply border-red-500/50 bg-red-500/10; }
.cc-guide :deep(.tip-box strong) { @apply text-cigar-gold; }
.cc-guide :deep(.tag) {
  display: inline-block;
  @apply bg-cigar-mid border border-cigar-light rounded text-cigar-mute text-xs;
  padding: 0.1rem 0.6rem;
  margin: 0.15rem;
}
.cc-guide :deep(.conclusion) {
  @apply bg-cigar-mid border border-cigar-gold rounded-xl;
  padding: 1.2rem;
  margin: 1.5rem 0;
}
.cc-guide :deep(.steps) { counter-reset: step; }
.cc-guide :deep(.step) {
  position: relative;
  @apply border-l-2 border-cigar-gold;
  padding: 0.8rem 0 0.8rem 2.5rem;
  margin-left: 0.5rem;
}
.cc-guide :deep(.step)::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: -0.85rem;
  top: 0.8rem;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
  @apply bg-cigar-gold text-cigar-dark;
}
.cc-guide :deep(.container) { max-width: 780px; margin: 0 auto; }
</style>
