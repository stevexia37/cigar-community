<template>
  <div class="w-full">
    <div v-if="label || hint || clearable" class="mb-1.5 flex items-baseline justify-between gap-2">
      <span class="cc-label !mb-0">{{ label }}</span>
      <button
        v-if="clearable"
        type="button"
        class="rounded-md px-2 py-0.5 text-[11px] text-cigar-mute transition-colors hover:text-cigar-gold"
        @click="clear"
      >清除</button>
    </div>

    <div class="flex flex-wrap gap-1.5" role="group" :aria-label="label || '评分'">
      <button
        v-for="n in range"
        :key="n"
        type="button"
        class="grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-sm font-medium transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cigar-gold/70"
        :class="n === modelValue
          ? 'border-cigar-gold bg-cigar-gold text-cigar-dark'
          : 'border-cigar-light text-cigar-cream hover:border-cigar-gold/60'"
        :aria-pressed="n === modelValue"
        @click="pick(n)"
      >{{ n }}</button>
    </div>

    <p v-if="hint" class="mt-1.5 text-[11px] leading-relaxed text-cigar-smoke">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: null },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 10 },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

// 1..max 的方块序列（min 仅用于文案/校验，方块始终从 min 起）
const range = computed(() => {
  const from = Number.isFinite(props.min) ? props.min : 1
  const to = Number.isFinite(props.max) ? props.max : 10
  const list = []
  for (let n = from; n <= to; n += 1) list.push(n)
  return list
})

const clearable = computed(() => props.modelValue !== null && props.modelValue !== undefined)

function pick(n) {
  // 再点一次选中项 = 取消（可选时）
  emit('update:modelValue', n === props.modelValue ? null : n)
}

function clear() {
  emit('update:modelValue', null)
}
</script>
