<template>
  <div class="mx-auto max-w-3xl px-4 py-6">
    <div v-if="loading" class="space-y-4">
      <div class="cc-skeleton h-28" />
      <div v-for="i in 3" :key="i" class="cc-skeleton h-32" />
    </div>

    <div v-else-if="error" class="cc-card p-8 text-center">
      <div class="text-3xl">👤</div>
      <p class="mt-3 text-sm text-cigar-cream">{{ error }}</p>
      <router-link to="/reviews" class="cc-btn-ghost mt-4 inline-flex">去看看其他品吸笔记</router-link>
    </div>

    <template v-else-if="profile">
      <!-- 资料卡 -->
      <header class="cc-card p-5">
        <div class="flex items-start gap-4">
          <span class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-cigar-gold/20 font-display text-xl text-cigar-gold">
            {{ profile.user.username.slice(0, 1).toUpperCase() }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-display text-xl text-cigar-cream">{{ profile.user.username }}</h1>
              <span
                v-if="profile.user.role !== 'user'"
                class="rounded-md bg-cigar-gold/15 px-2 py-0.5 text-[11px] text-cigar-gold"
              >{{ profile.user.role === 'admin' ? '管理员' : '编辑' }}</span>
            </div>
            <p v-if="profile.user.bio" class="mt-1.5 text-sm text-cigar-mute">{{ profile.user.bio }}</p>
            <p class="mt-1.5 text-[11px] text-cigar-smoke">
              {{ formatJoin(profile.user.createdAt) }}加入
            </p>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-3 border-t border-cigar-light/50 pt-4 text-center">
          <div>
            <p class="font-display text-lg text-cigar-gold">{{ profile.stats.reviews }}</p>
            <p class="text-[11px] text-cigar-mute">已发布笔记</p>
          </div>
          <div>
            <p class="font-display text-lg text-cigar-gold">{{ profile.stats.submissions }}</p>
            <p class="text-[11px] text-cigar-mute">数据投稿</p>
          </div>
          <div>
            <p class="font-display text-lg text-cigar-gold">{{ profile.stats.helpful }}</p>
            <p class="text-[11px] text-cigar-mute">获得「有用」</p>
          </div>
        </div>
      </header>

      <!-- 笔记列表 -->
      <h2 class="mb-2 mt-7 text-xs font-medium uppercase tracking-wide text-cigar-mute">
        品吸笔记{{ profile.stats.reviews > profile.reviews.length ? `（显示最近 ${profile.reviews.length} 篇）` : '' }}
      </h2>

      <EmptyState
        v-if="profile.reviews.length === 0"
        icon="✍️"
        title="还没有发布过品吸笔记"
        :description="isMe ? '写下第一篇，记录你的品吸体验。' : '这位茄友还没有公开的品吸记录。'"
        :action-label="isMe ? '写品吸笔记' : ''"
        action-to="/reviews/new"
      />

      <div v-else class="space-y-3">
        <article v-for="r in profile.reviews" :key="r.id" class="cc-card p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <router-link :to="`/cigars/${r.cigarId}`" class="text-sm text-cigar-gold hover:underline">
                {{ r.cigarLabel }}
              </router-link>
              <p v-if="r.title" class="mt-1 text-sm font-medium text-cigar-cream">{{ r.title }}</p>
            </div>
            <span class="shrink-0 rounded-lg bg-cigar-gold/15 px-2.5 py-1 font-display text-sm text-cigar-gold">
              {{ fmt(r.overallRating) }}
            </span>
          </div>

          <p v-if="r.content" class="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-cigar-mute">
            {{ r.content }}
          </p>

          <ReviewImages :images="r.images || []" :max-thumb="4" />

          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-cigar-smoke">
            <span>{{ formatDate(r.createdAt) }}</span>
            <span v-if="r.smokingTime">时长 {{ r.smokingTime }} 分钟</span>
            <span v-if="r.pairing">🥃 {{ r.pairing }}</span>
            <span v-if="r.helpfulCount">👍 {{ r.helpfulCount }} 人觉得有用</span>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client.js'
import EmptyState from '@/components/EmptyState.vue'
import ReviewImages from '@/components/ReviewImages.vue'
import { useAuth } from '@/composables/useAuth.js'

const route = useRoute()
const auth = useAuth()

const profile = ref(null)
const loading = ref(true)
const error = ref('')

const isMe = computed(() => auth.user && profile.value && auth.user.id === profile.value.user.id)

function fmt(n) {
  return n === null || n === undefined ? '—' : Number(n).toFixed(1).replace(/\.0$/, '')
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('zh-CN')
}

function formatJoin(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    profile.value = await api.userProfile(route.params.id)
    document.title = `${profile.value.user.username} 的品吸笔记 · 雪茄客`
  } catch (err) {
    error.value = err?.status === 404 ? '这个用户不存在或已停用' : (err?.humanMessage || '加载失败')
    profile.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)
</script>
