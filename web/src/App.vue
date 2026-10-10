<template>
  <div class="min-h-screen flex flex-col bg-cigar-dark text-cigar-cream">
    <SiteHeader />

    <main class="flex-1 w-full">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <SiteFooter />
    <DisclaimerBar />
    <AgeGate />
  </div>
</template>

<script setup>
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import DisclaimerBar from '@/components/DisclaimerBar.vue'
import AgeGate from '@/components/AgeGate.vue'
</script>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
