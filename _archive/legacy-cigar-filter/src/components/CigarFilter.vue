<template>
  <div class="min-h-screen bg-cigar-dark text-cigar-cream font-body">
    <!-- Header -->
    <header class="sticky top-0 z-40 bg-cigar-dark/95 backdrop-blur-md border-b border-cigar-light">
      <div class="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <h1 class="font-display text-xl tracking-wider text-cigar-cream">
            <span class="text-cigar-gold">雪茄</span>客
          </h1>
          <p class="text-[10px] text-cigar-mute tracking-widest uppercase">Cigar Aficionado</p>
        </div>
        <button
          @click="showFilter = !showFilter"
          class="relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300"
          :class="showFilter ? 'bg-cigar-gold/15 border border-cigar-gold' : 'bg-cigar-mid border border-cigar-light'"
        >
          <svg class="w-4 h-4" :class="showFilter ? 'text-cigar-gold' : 'text-cigar-mute'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
          </svg>
          <span class="text-sm">筛选</span>
          <span v-if="activeFilterCount" class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-cigar-gold text-cigar-dark text-[10px] font-bold shadow-lg">
            {{ activeFilterCount }}
          </span>
        </button>
      </div>

      <!-- Search bar -->
      <div class="max-w-2xl mx-auto px-4 pb-3">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cigar-mute" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            v-model="searchQ"
            @input="debouncedFilter"
            placeholder="搜索品牌、型号或风味…"
            class="w-full pl-10 pr-4 py-2.5 bg-cigar-mid border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors"
          />
          <button
            v-if="searchQ"
            @click="searchQ=''; applyFilters()"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-cigar-mute hover:text-cigar-cream"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Filter Panel -->
    <transition name="slide-down">
      <div v-if="showFilter" class="border-b border-cigar-light bg-cigar-mid/50">
        <div class="max-w-2xl mx-auto px-4 py-4 space-y-5">

          <!-- 产地 -->
          <FilterSection title="产地" icon="🌍">
            <div class="flex flex-wrap gap-2">
              <button
                v-for="item in ORIGINS"
                :key="item.value"
                @click="toggleOrigin(item.value)"
                class="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95"
                :class="filters.origins.includes(item.value)
                  ? 'bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50 shadow-sm'
                  : 'bg-cigar-dark text-cigar-mute border border-cigar-light hover:border-cigar-mute'"
              >
                <span class="mr-1">{{ item.flag }}</span>{{ item.label }}
              </button>
            </div>
          </FilterSection>

          <!-- 尺寸/环径 -->
          <FilterSection title="尺寸 / 环径" icon="📏">
            <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-thin snap-x snap-mandatory -mx-1 px-1">
              <button
                v-for="item in SIZES"
                :key="item.value"
                @click="toggleSize(item.value)"
                class="flex-shrink-0 snap-start px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 active:scale-95 min-w-[4.5rem]"
                :class="filters.sizes.includes(item.value)
                  ? 'bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50'
                  : 'bg-cigar-dark text-cigar-mute border border-cigar-light hover:border-cigar-mute'"
              >
                <div class="font-semibold">{{ item.label }}</div>
                <div class="text-[10px] opacity-60 mt-0.5">{{ item.rg[0] }}-{{ item.rg[1] }}RG</div>
              </button>
            </div>
          </FilterSection>

          <!-- 浓郁度 -->
          <FilterSection title="浓郁度" icon="🔥">
            <div class="flex gap-2">
              <button
                v-for="item in STRENGTHS"
                :key="item.value"
                @click="toggleStrength(item.value)"
                class="flex-1 px-2 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-95"
                :class="filters.strengths.includes(item.value)
                  ? 'bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50'
                  : 'bg-cigar-dark text-cigar-mute border border-cigar-light hover:border-cigar-mute'"
              >
                <div class="text-sm mb-0.5">{{ item.icon }}</div>
                <div>{{ item.label }}</div>
              </button>
            </div>
          </FilterSection>

          <!-- 风味倾向 -->
          <FilterSection title="风味倾向" icon="🌿">
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cat in FLAVOR_CATEGORIES"
                :key="cat.value"
                @click="toggleFlavorCategory(cat.value)"
                class="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95"
                :class="isFlavorActive(cat.value)
                  ? 'bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50'
                  : 'bg-cigar-dark text-cigar-mute border border-cigar-light hover:border-cigar-mute'"
              >
                {{ cat.icon }} {{ cat.label }}
              </button>
            </div>
            <!-- Flavor sub-tags -->
            <transition name="fade">
              <div v-if="expandedFlavor" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="tag in expandedFlavorTags"
                  :key="tag"
                  @click="toggleFlavorTag(tag)"
                  class="px-2.5 py-1 rounded-full text-[11px] cursor-pointer transition-all duration-200 border"
                  :class="filters.flavors.includes(tag)
                    ? 'bg-cigar-gold/15 text-cigar-gold border-cigar-gold/30'
                    : 'bg-cigar-dark text-cigar-mute border-cigar-light hover:text-cigar-cream'"
                >
                  {{ tag }}
                </span>
              </div>
            </transition>
          </FilterSection>

          <!-- 操作 -->
          <div class="flex gap-3 pt-2">
            <button
              @click="clearFilters"
              class="flex-1 py-2.5 rounded-xl border border-cigar-light text-sm text-cigar-mute hover:text-cigar-cream hover:border-cigar-mute transition-all active:scale-95"
            >
              清除全部
            </button>
            <button
              @click="showFilter = false"
              class="flex-1 py-2.5 rounded-xl bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50 text-sm font-semibold hover:bg-cigar-gold/30 transition-all active:scale-95"
            >
              查看结果 ({{ totalCount }})
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Sort bar -->
    <div class="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
      <span class="text-xs text-cigar-mute">
        <span class="text-cigar-cream font-semibold">{{ totalCount }}</span> 支雪茄
        <span v-if="activeFilterCount" class="ml-1 text-cigar-gold">· 已筛选</span>
      </span>
      <select
        v-model="sortBy"
        @change="applyFilters"
        class="bg-cigar-mid border border-cigar-light text-sm text-cigar-cream rounded-lg px-3 py-1.5 focus:outline-none focus:border-cigar-gold/50 appearance-none cursor-pointer"
      >
        <option value="rating">评分最高</option>
        <option value="price_asc">价格从低</option>
        <option value="price_desc">价格从高</option>
        <option value="strength">浓郁优先</option>
      </select>
    </div>

    <!-- Active filter pills -->
    <div v-if="activeFilterCount" class="max-w-2xl mx-auto px-4 pb-2">
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="(origin, i) in filters.origins" :key="'o'+i"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cigar-gold/10 text-cigar-gold text-[10px] border border-cigar-gold/20"
        >
          {{ ORIGINS.find(o => o.value === origin)?.label }}
          <button @click="removeOrigin(origin)" class="hover:text-cigar-cream">✕</button>
        </span>
        <span
          v-for="(size, i) in filters.sizes" :key="'s'+i"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cigar-gold/10 text-cigar-gold text-[10px] border border-cigar-gold/20"
        >
          {{ SIZES.find(s => s.value === size)?.label }}
          <button @click="removeSize(size)" class="hover:text-cigar-cream">✕</button>
        </span>
        <span
          v-for="(str, i) in filters.strengths" :key="'str'+i"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cigar-gold/10 text-cigar-gold text-[10px] border border-cigar-gold/20"
        >
          {{ STRENGTHS.find(s => s.value === str)?.label }}
          <button @click="removeStrength(str)" class="hover:text-cigar-cream">✕</button>
        </span>
        <span
          v-for="(fl, i) in filters.flavors" :key="'fl'+i"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cigar-gold/10 text-cigar-gold text-[10px] border border-cigar-gold/20"
        >
          {{ fl }}
          <button @click="removeFlavor(fl)" class="hover:text-cigar-cream">✕</button>
        </span>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
      <div class="w-10 h-10 border-2 border-cigar-gold/30 border-t-cigar-gold rounded-full animate-spin"></div>
      <p class="text-cigar-mute text-sm mt-4">正在探索雪茄世界…</p>
    </div>

    <!-- Results grid -->
    <div v-else class="max-w-2xl mx-auto px-4 pb-8">
      <transition-group name="result-list" tag="div" class="space-y-3">
        <div
          v-for="cigar in filtered"
          :key="cigar.id"
          class="cigar-card bg-cigar-mid rounded-2xl border border-cigar-light p-4 transition-all duration-300 hover:border-cigar-gold/30 hover:shadow-lg hover:shadow-cigar-gold/5"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-cigar-gold font-display font-semibold text-sm truncate">{{ cigar.brand }}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  :class="cigar.origin === 'cuba' ? 'bg-red-900/40 text-red-300' : 'bg-cigar-light text-cigar-mute'"
                >{{ ORIGINS.find(o => o.value === cigar.origin)?.label }}</span>
              </div>
              <h3 class="text-cigar-cream font-semibold text-base leading-tight">{{ cigar.vitola }}</h3>
              <p class="text-cigar-mute text-xs mt-0.5 truncate">{{ cigar.series }}</p>
            </div>
            <div class="text-right flex-shrink-0 ml-3">
              <div class="text-cigar-gold font-display font-bold text-lg">${{ cigar.price }}</div>
              <div class="flex items-center gap-1 justify-end mt-0.5">
                <span class="text-yellow-500 text-xs">★</span>
                <span class="text-cigar-cream text-xs font-semibold">{{ cigar.rating }}</span>
              </div>
            </div>
          </div>

          <!-- Specs row -->
          <div class="flex items-center gap-3 mt-2.5 text-[11px] text-cigar-mute">
            <span class="flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>
              {{ cigar.rg }} RG
            </span>
            <span>{{ cigar.length }}"</span>
            <span v-if="cigar.strength" class="flex items-center gap-0.5">
              <span v-for="n in 5" :key="n" class="w-1.5 h-1.5 rounded-full" :class="n <= cigar.strength ? 'bg-cigar-gold' : 'bg-cigar-light'"></span>
            </span>
            <span class="ml-auto text-[10px]">{{ cigar.reviews }} 条品吸</span>
          </div>

          <!-- Flavor tags -->
          <div class="flex flex-wrap gap-1 mt-2.5">
            <span
              v-for="fl in cigar.flavors.slice(0, 4)"
              :key="fl"
              class="px-2 py-0.5 bg-cigar-dark rounded-full text-[10px] text-cigar-mute border border-cigar-light"
            >{{ fl }}</span>
            <span v-if="cigar.flavors.length > 4" class="text-[10px] text-cigar-mute self-center">+{{ cigar.flavors.length - 4 }}</span>
          </div>

          <!-- Desc -->
          <p class="text-cigar-mute text-xs mt-2 leading-relaxed line-clamp-2">{{ cigar.desc }}</p>
        </div>
      </transition-group>

      <!-- Empty state -->
      <div v-if="!filtered.length && !loading" class="text-center py-20">
        <div class="text-5xl mb-4">🔍</div>
        <p class="text-cigar-mute text-sm">没有找到匹配的雪茄</p>
        <button @click="clearFilters" class="mt-4 text-cigar-gold text-sm underline underline-offset-4 hover:text-cigar-cream transition-colors">
          清除筛选条件
        </button>
      </div>
    </div>

    <!-- Flavor Wheel Modal Trigger -->
    <div class="fixed bottom-6 right-4 z-30">
      <button
        @click="showWheel = !showWheel"
        class="w-14 h-14 rounded-full bg-cigar-gold/90 shadow-xl flex items-center justify-center text-cigar-dark text-xl font-bold transition-all duration-300 hover:bg-cigar-gold active:scale-90"
        :class="{ 'ring-4 ring-cigar-gold/30': showWheel }"
        title="风味轮"
      >
        🎯
      </button>
    </div>

    <!-- Flavor Wheel Drawer -->
    <transition name="drawer">
      <div v-if="showWheel" class="fixed inset-0 z-50 flex items-end justify-center">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showWheel = false"></div>
        <div class="relative w-full max-w-md bg-cigar-mid rounded-t-3xl border-t border-cigar-light shadow-2xl px-5 pt-6 pb-10 max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="font-display text-cigar-cream text-xl">风味轮</h2>
              <p class="text-cigar-mute text-xs mt-0.5">为风味偏好打分，发现你的雪茄风格</p>
            </div>
            <button @click="showWheel = false" class="w-8 h-8 flex items-center justify-center rounded-full bg-cigar-dark text-cigar-mute hover:text-cigar-cream">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18 18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <FlavorWheel :scores="flavorScores" @update:scores="onFlavorScoresUpdate" />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useCigarFilter } from '../composables/useCigarFilter.js'
import FilterSection from './FilterSection.vue'
import FlavorWheel from './FlavorWheel.vue'

const {
  filters, loading, sortBy, searchQ,
  filtered, totalCount, activeFilterCount,
  applyFilters, clearFilters,
  ORIGINS, SIZES, STRENGTHS, FLAVOR_CATEGORIES,
} = useCigarFilter()

const showFilter  = ref(false)
const showWheel   = ref(false)
const expandedFlavor = ref(null)
const flavorScores = ref({})

let debounceTimer = null
function debouncedFilter() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => applyFilters(), 300)
}

function toggleOrigin(val) {
  const idx = filters.origins.indexOf(val)
  idx === -1 ? filters.origins.push(val) : filters.origins.splice(idx, 1)
  applyFilters()
}

function toggleSize(val) {
  const idx = filters.sizes.indexOf(val)
  idx === -1 ? filters.sizes.push(val) : filters.sizes.splice(idx, 1)
  applyFilters()
}

function toggleStrength(val) {
  const idx = filters.strengths.indexOf(val)
  idx === -1 ? filters.strengths.push(val) : filters.strengths.splice(idx, 1)
  applyFilters()
}

function toggleFlavorCategory(val) {
  const cat = FLAVOR_CATEGORIES.find(c => c.value === val)
  if (!cat) return
  if (expandedFlavor.value === val) {
    expandedFlavor.value = null
    return
  }
  expandedFlavor.value = val
}

const expandedFlavorTags = ref([])
watch(expandedFlavor, (val) => {
  const cat = FLAVOR_CATEGORIES.find(c => c.value === val)
  expandedFlavorTags.value = cat ? cat.tags : []
})

function isFlavorActive(val) {
  const cat = FLAVOR_CATEGORIES.find(c => c.value === val)
  if (!cat) return false
  return cat.tags.some(t => filters.flavors.includes(t))
}

function toggleFlavorTag(tag) {
  const idx = filters.flavors.indexOf(tag)
  idx === -1 ? filters.flavors.push(tag) : filters.flavors.splice(idx, 1)
  applyFilters()
}

function removeOrigin(val)  { toggleOrigin(val) }
function removeSize(val)    { toggleSize(val) }
function removeStrength(val){ toggleStrength(val) }
function removeFlavor(val)  { toggleFlavorTag(val) }

function onFlavorScoresUpdate(scores) {
  flavorScores.value = scores
}

onMounted(() => {
  applyFilters()
})
</script>

<style scoped>
.cigar-card {
  -webkit-tap-highlight-color: transparent;
}
.cigar-card:active {
  transform: scale(0.985);
}

.result-list-enter-active {
  transition: all 0.4s ease-out;
}
.result-list-leave-active {
  transition: all 0.3s ease-in;
}
.result-list-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
}
.result-list-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.result-list-move {
  transition: transform 0.35s ease;
}

.slide-down-enter-active { transition: all 0.3s ease-out; }
.slide-down-leave-active { transition: all 0.2s ease-in; }
.slide-down-enter-from,
.slide-down-leave-to { opacity: 0; transform: translateY(-12px); }

.fade-enter-active { transition: all 0.2s ease-out; }
.fade-leave-active { transition: all 0.15s ease-in; }
.fade-enter-from,
.fade-leave-to { opacity: 0; transform: translateY(-6px); }

.drawer-enter-active { transition: all 0.35s cubic-bezier(0.32, 0.72, 0, 1); }
.drawer-leave-active { transition: all 0.25s ease-in; }
.drawer-enter-from,
.drawer-leave-to { transform: translateY(100%); }

.scrollbar-thin::-webkit-scrollbar { height: 3px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: #4a3f30; border-radius: 999px; }
</style>
