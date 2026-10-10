<template>
  <header class="sticky top-0 z-30 border-b border-cigar-light/70 bg-cigar-dark/95 backdrop-blur">
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
      <router-link to="/" class="flex items-center gap-2 shrink-0">
        <span class="text-xl">🚬</span>
        <span class="font-display text-lg text-cigar-gold tracking-wide">雪茄客</span>
      </router-link>

      <!-- 桌面导航 -->
      <nav class="hidden md:flex items-center gap-1 ml-4 text-sm">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-1.5 text-cigar-mute transition-colors hover:text-cigar-cream"
          active-class="!text-cigar-gold bg-cigar-gold/10"
        >{{ item.label }}</router-link>
      </nav>

      <div class="flex-1" />

      <router-link
        v-if="!auth.user"
        to="/login"
        class="cc-btn-ghost !px-3 !py-1.5 text-xs"
      >登录</router-link>

      <div v-else class="flex items-center gap-2">
        <router-link
          v-if="auth.canModerate"
          :to="{ name: 'admin-overview' }"
          class="cc-btn-ghost !px-3 !py-1.5 text-xs hidden sm:inline-flex !border-cigar-gold/50 !text-cigar-gold"
        >管理后台</router-link>
        <router-link to="/submit" class="cc-btn-ghost !px-3 !py-1.5 text-xs hidden sm:inline-flex">提报数据</router-link>
        <router-link
          :to="`/users/${auth.user.id}`"
          class="grid h-7 w-7 place-items-center rounded-full bg-cigar-gold/20 text-xs text-cigar-gold transition-colors hover:bg-cigar-gold/30"
          :title="`${auth.user.username} · 我的主页`"
        >
          {{ auth.user.username.slice(0, 1).toUpperCase() }}
        </router-link>
        <button
          class="rounded-lg px-1.5 py-1.5 text-xs text-cigar-mute hover:text-cigar-cream"
          title="菜单"
          @click="showMenu = !showMenu"
        >▾</button>
        <div v-if="showMenu" class="relative">
          <div class="absolute right-0 top-2 z-40 w-36 cc-card p-1.5 text-sm shadow-xl">
            <router-link
              :to="`/users/${auth.user.id}`"
              class="block rounded-lg px-3 py-2 hover:bg-cigar-light/50"
              @click="showMenu = false"
            >我的主页</router-link>
            <router-link
              v-if="auth.canModerate"
              :to="{ name: 'admin-overview' }"
              class="block rounded-lg px-3 py-2 text-cigar-gold hover:bg-cigar-light/50"
              @click="showMenu = false"
            >管理后台</router-link>
            <router-link to="/submit" class="block rounded-lg px-3 py-2 hover:bg-cigar-light/50" @click="showMenu = false">提报数据</router-link>
            <button class="block w-full rounded-lg px-3 py-2 text-left hover:bg-cigar-light/50" @click="onLogout">退出登录</button>
          </div>
        </div>
      </div>

      <!-- 移动端菜单按钮 -->
      <button class="md:hidden cc-btn-ghost !px-2.5 !py-1.5" @click="mobileOpen = !mobileOpen">☰</button>
    </div>

    <!-- 移动端导航 -->
    <nav v-if="mobileOpen" class="md:hidden border-t border-cigar-light/70 px-4 py-2 anim-fade-in">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="block rounded-lg px-3 py-2.5 text-sm text-cigar-mute hover:text-cigar-cream"
        active-class="!text-cigar-gold"
        @click="mobileOpen = false"
      >{{ item.label }}</router-link>
    </nav>
  </header>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const showMenu = ref(false)
const mobileOpen = ref(false)

const navItems = [
  { to: '/cigars', label: '数据库' },
  { to: '/reviews', label: '品吸笔记' },
  { to: '/tools/diagnostic', label: '病害诊断' },
  { to: '/tools/flavor-test', label: '风味测试' },
  { to: '/tools/aging-calc', label: '醇化计算' },
  { to: '/guide/plume-vs-mold', label: '起灰vs发霉' },
]

onMounted(() => auth.refresh())

watch(() => route.fullPath, () => {
  showMenu.value = false
  mobileOpen.value = false
})

async function onLogout() {
  showMenu.value = false
  await auth.logout()
  router.push('/')
}
</script>

<style scoped>
.anim-fade-in {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
