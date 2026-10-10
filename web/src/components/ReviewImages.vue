<template>
  <div v-if="images.length" class="mt-3">
    <!-- 单图直接铺满；多图网格。点击放大 -->
    <div :class="images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'" class="grid gap-2">
      <button
        v-for="(img, i) in visible"
        :key="img.url"
        type="button"
        class="group relative overflow-hidden rounded-xl border border-cigar-light bg-cigar-dark"
        :class="images.length === 1 ? 'aspect-[16/10]' : 'aspect-square'"
        @click="open(i)"
      >
        <img
          :src="img.url"
          :alt="img.description || `配图 ${i + 1}`"
          class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <span
          v-if="images.length > maxThumb && i === visible.length - 1 && images.length > maxThumb"
          class="absolute inset-0 grid place-items-center bg-cigar-dark/70 text-sm text-cigar-cream"
        >+{{ images.length - maxThumb }}</span>
      </button>
    </div>

    <!-- 灯箱 -->
    <div
      v-if="lightbox !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <img :src="images[lightbox].url" :alt="images[lightbox].description || ''" class="max-h-[85vh] max-w-full rounded-lg object-contain" />
      <p v-if="images[lightbox].description" class="mt-3 text-center text-xs text-cigar-cream">
        {{ images[lightbox].description }}
      </p>
      <div class="absolute bottom-6 flex items-center gap-3 text-sm text-cigar-cream">
        <button class="cc-btn-ghost !px-3 !py-1.5" :disabled="lightbox === 0" @click="lightbox--">上一张</button>
        <span class="text-cigar-mute">{{ lightbox + 1 }} / {{ images.length }}</span>
        <button class="cc-btn-ghost !px-3 !py-1.5" :disabled="lightbox >= images.length - 1" @click="lightbox++">下一张</button>
      </div>
      <button class="absolute right-5 top-5 text-2xl text-cigar-cream" aria-label="关闭" @click="close">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** [{ url, description }] */
  images: { type: Array, default: () => [] },
  /** 列表页只展示前 N 张，多的折叠成 +N */
  maxThumb: { type: Number, default: 6 },
})

const lightbox = ref(null)

const visible = computed(() => props.images.slice(0, props.maxThumb))

function open(i) {
  lightbox.value = i
  window.addEventListener('keydown', onKey)
}
function close() {
  lightbox.value = null
  window.removeEventListener('keydown', onKey)
}
function onKey(e) {
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowLeft' && lightbox.value > 0) lightbox.value--
  if (e.key === 'ArrowRight' && lightbox.value < props.images.length - 1) lightbox.value++
}

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
