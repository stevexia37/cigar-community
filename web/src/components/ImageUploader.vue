<template>
  <div>
    <div class="mb-2 flex items-baseline justify-between">
      <label class="cc-label !mb-0">
        {{ label }}
        <span class="ml-1 text-cigar-smoke">（{{ images.length }}/{{ maxCount }}）</span>
      </label>
      <span v-if="hint" class="text-[11px] text-cigar-smoke">{{ hint }}</span>
    </div>

    <!-- 缩略图网格 -->
    <div v-if="images.length" class="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
      <div
        v-for="img in images"
        :key="img.id"
        class="group relative aspect-square overflow-hidden rounded-xl border border-cigar-light bg-cigar-dark"
      >
        <img
          v-if="img.preview || img.url"
          :src="img.preview || img.url"
          :alt="img.name"
          class="h-full w-full object-cover"
          loading="lazy"
        />
        <div v-if="img.compressing" class="absolute inset-0 grid place-items-center bg-cigar-dark/70 text-[11px] text-cigar-cream">
          压缩/上传中…
        </div>
        <div v-else-if="img.error" class="absolute inset-0 grid place-items-center bg-red-900/70 p-1 text-center text-[10px] text-red-100">
          {{ img.error }}
        </div>

        <button
          type="button"
          class="absolute right-1 top-1 rounded-md bg-cigar-dark/80 px-1.5 py-0.5 text-[11px] text-cigar-cream opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          :aria-label="`移除图片 ${img.name}`"
          @click="$emit('remove', img.id)"
        >✕</button>
      </div>
    </div>

    <!-- 选择区：点击或拖拽 -->
    <label
      class="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-cigar-light px-4 py-5 text-center transition-colors hover:border-cigar-gold/60"
      :class="full ? 'cursor-not-allowed opacity-50' : ''"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span class="text-lg">🖼️</span>
      <span class="mt-1 text-xs text-cigar-cream">{{ full ? '已达数量上限' : '点击选择图片，或拖拽到此处' }}</span>
      <span class="mt-0.5 text-[11px] text-cigar-smoke">
        自动压缩到最长边 {{ maxEdge }}px · 单张上限 {{ Math.round(maxBytes / 1024 / 1024) }}MB
      </span>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        class="hidden"
        :disabled="full"
        @change="onPick"
      />
    </label>

    <p v-if="notice" class="mt-2 text-[11px] text-amber-300">{{ notice }}</p>
    <p v-if="tip" class="mt-2 text-[11px] text-cigar-smoke">{{ tip }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  /** [{ id, preview, url, uploading, error, name }] —— 由 useImageUpload 提供 */
  images: { type: Array, default: () => [] },
  label: { type: String, default: '配图' },
  hint: { type: String, default: '' },
  tip: { type: String, default: '' },
  notice: { type: String, default: '' },
  maxCount: { type: Number, default: 6 },
  maxEdge: { type: Number, default: 1600 },
  maxBytes: { type: Number, default: 4 * 1024 * 1024 },
})

const emit = defineEmits(['pick', 'remove'])

const fileInput = ref(null)
const full = computed(() => props.images.length >= props.maxCount)

function onPick(e) {
  const files = e.target.files
  if (files?.length) emit('pick', files)
  // 清空 value，否则同一张图连续选两次不会触发 change
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(e) {
  if (full.value) return
  const files = e.dataTransfer?.files
  if (files?.length) emit('pick', files)
}
</script>
