<template>
  <div class="mx-auto max-w-5xl px-4 py-6">
    <div class="mb-5">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="rounded-md bg-cigar-gold/15 px-2 py-0.5 text-[11px] text-cigar-gold">管理后台</span>
        <span class="rounded-md bg-cigar-light/60 px-2 py-0.5 text-[11px] text-cigar-mute">
          {{ auth.user?.role === 'admin' ? '管理员' : '编辑' }}
        </span>
      </div>
      <h1 class="mt-2 font-display text-2xl text-cigar-cream">{{ pageTitle }}</h1>
    </div>

    <!-- 待处理数量直接标在导航上，运营不必逐个点开才知道有没有活 -->
    <nav class="mb-6 flex flex-wrap gap-1.5 border-b border-cigar-light/60 pb-3">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="relative rounded-lg px-3 py-1.5 text-sm text-cigar-mute transition-colors hover:text-cigar-cream"
        active-class="!text-cigar-gold bg-cigar-gold/10"
      >
        {{ tab.label }}
        <span
          v-if="tab.name === 'admin-reviews' && pending.reviews"
          class="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300"
        >{{ pending.reviews }}</span>
        <span
          v-if="tab.name === 'admin-submissions' && pending.submissions"
          class="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300"
        >{{ pending.submissions }}</span>
      </router-link>
    </nav>

    <router-view :pending="pending" @refresh-pending="loadPending" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client.js'
import { useAuth } from '@/composables/useAuth.js'

const auth = useAuth()
const route = useRoute()

const pending = ref({ reviews: 0, submissions: 0, total: 0 })

const tabs = computed(() => {
  const list = [
    { name: 'admin-overview', label: '概览' },
    { name: 'admin-reviews', label: '笔记审核' },
    { name: 'admin-submissions', label: '投稿审批' },
    { name: 'admin-audit', label: '审核日志' },
  ]
  // 用户管理涉及封禁，仅管理员可见
  if (auth.user?.role === 'admin') list.push({ name: 'admin-users', label: '用户管理' })
  return list
})

const pageTitle = computed(() => route.meta?.title || '管理后台')

async function loadPending() {
  try {
    const res = await api.adminStats()
    pending.value = res.queue ?? { reviews: 0, submissions: 0, total: 0 }
  } catch {
    // 概览拉不到不影响子页面自身工作，静默即可
  }
}

// 子页面处理完一条后调用，让导航角标实时刷新
provide('refreshAdminPending', loadPending)
onMounted(loadPending)
</script>
