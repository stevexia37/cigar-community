<template>
  <div class="cc-card flex flex-col items-center px-5 py-12 text-center">
    <div class="text-5xl leading-none" aria-hidden="true">{{ icon }}</div>

    <h3 v-if="title" class="mt-4 font-display text-base text-cigar-cream">{{ title }}</h3>
    <p v-if="description" class="mt-2 max-w-md text-sm leading-relaxed text-cigar-mute">{{ description }}</p>

    <div v-if="actionLabel" class="mt-6">
      <router-link v-if="actionTo" :to="actionTo" class="cc-btn-primary">{{ actionLabel }}</router-link>
      <button v-else type="button" class="cc-btn-primary" @click="emit('action')">{{ actionLabel }}</button>
    </div>

    <!-- 附加操作（如「清空筛选」旁的次要按钮） -->
    <div v-if="$slots.default" class="mt-4 text-xs text-cigar-smoke">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: '🗒️' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  /** 有 actionTo → router-link；只有 actionLabel → emit('action') */
  actionTo: { type: String, default: '' },
})

const emit = defineEmits(['action'])
</script>
