<template>
  <div>
    <div class="flex items-center gap-2 mb-2.5">
      <span class="text-sm">{{ icon }}</span>
      <h4 class="text-cigar-cream text-sm font-medium tracking-wide">{{ title }}</h4>
    </div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  icon:  { type: String, default: '' },
})
</script>
