<template>
  <div class="flavor-wheel w-full select-none">
    <div class="text-center mb-4">
      <h3 class="text-cigar-gold font-display text-lg tracking-wider">风味轮</h3>
      <p class="text-cigar-mute text-xs mt-1">轻触风味扇区 · 滑动滑块打分</p>
    </div>

    <div class="flex flex-col items-center gap-5">
      <!-- SVG Wheel -->
      <div class="relative" :style="{ width: wheelSize + 'px', height: wheelSize + 'px' }">
        <svg
          :viewBox="`0 0 ${viewBox} ${viewBox}`"
          class="w-full h-full drop-shadow-2xl"
          @touchstart.prevent="onTouchStart"
          @mousedown.prevent="onMouseDown"
        >
          <defs>
            <filter id="wheelGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stop-color="#2a2218"/>
              <stop offset="100%" stop-color="#1a1410"/>
            </radialGradient>
            <filter id="innerShadow">
              <feGaussianBlur stdDeviation="6" result="blur"/>
              <feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>
          </defs>

          <!-- Outer ring -->
          <circle :cx="cx" :cy="cy" :r="outerR" fill="none" stroke="#4a3f30" stroke-width="2"/>

          <!-- Segments -->
          <g v-for="(seg, i) in segments" :key="seg.value">
            <path
              :d="segmentPath(i)"
              :fill="getSegmentColor(i, seg)"
              :stroke="selectedFlavor === seg.value ? '#c9a84c' : '#3d3428'"
              :stroke-width="selectedFlavor === seg.value ? 2 : 1"
              :opacity="getSegmentOpacity(i, seg)"
              class="cursor-pointer transition-all duration-300"
              @click="onSegmentClick(seg.value)"
            />
            <!-- Segment label -->
            <text
              :transform="`translate(${labelPos(i).x}, ${labelPos(i).y}) rotate(${labelAngle(i)})`"
              :fill="selectedFlavor === seg.value ? '#c9a84c' : '#a09080'"
              font-size="11"
              text-anchor="middle"
              dominant-baseline="central"
              class="pointer-events-none"
              font-family="'Inter', sans-serif"
            >
              {{ seg.label }}
            </text>
          </g>

          <!-- Center circle -->
          <circle :cx="cx" :cy="cy" :r="innerR" fill="url(#centerGrad)" stroke="#c9a84c" stroke-width="1.5" filter="url(#wheelGlow)"/>
          <text :x="cx" :y="cy - 6" fill="#c9a84c" font-size="14" text-anchor="middle" dominant-baseline="central" font-weight="600">风味</text>
          <text :x="cx" :y="cy + 14" fill="#a09080" font-size="11" text-anchor="middle" dominant-baseline="central">探索</text>

          <!-- Decorative dots on outer ring -->
          <circle v-for="n in 24" :key="'dot'+n"
            :cx="cx + (outerR - 2) * Math.cos(2 * Math.PI * n / 24 - Math.PI/2)"
            :cy="cy + (outerR - 2) * Math.sin(2 * Math.PI * n / 24 - Math.PI/2)"
            r="1.5" fill="#4a3f30"
          />
        </svg>

        <!-- Score badges on segments (outside SVG, positioned absolutely) -->
        <div
          v-for="(seg, i) in segments"
          :key="'badge'+seg.value"
          class="absolute pointer-events-none transition-all duration-500"
          :style="badgeStyle(i, seg)"
        >
          <div
            v-if="scores[seg.value]"
            class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
            :class="scoreBadgeClass(scores[seg.value])"
          >
            {{ scores[seg.value] }}
          </div>
        </div>
      </div>

      <!-- Slider Section -->
      <transition name="slide-up">
        <div v-if="selectedFlavor" class="w-full max-w-xs mx-auto bg-cigar-mid rounded-xl p-4 border border-cigar-light shadow-xl">
          <div class="flex items-center justify-between mb-2">
            <span class="text-cigar-cream font-medium text-sm">{{ selectedFlavorLabel }}</span>
            <span class="text-cigar-gold font-bold text-lg">{{ scores[selectedFlavor] || 0 }}</span>
          </div>
          <div class="relative">
            <input
              type="range"
              min="1"
              max="10"
              :value="scores[selectedFlavor] || 0"
              @input="onSliderInput($event)"
              class="flavor-slider w-full h-2 rounded-full appearance-none cursor-pointer"
              :style="sliderStyle"
            />
            <div class="flex justify-between text-[10px] text-cigar-mute mt-1 px-0.5">
              <span>淡</span>
              <span>2</span>
              <span>4</span>
              <span>6</span>
              <span>8</span>
              <span>浓</span>
            </div>
          </div>
          <div class="flex gap-1.5 mt-3 flex-wrap">
            <span
              v-for="tag in selectedFlavorTags"
              :key="tag"
              class="px-2 py-0.5 bg-cigar-dark rounded-full text-[10px] text-cigar-mute border border-cigar-light"
            >{{ tag }}</span>
          </div>
        </div>
      </transition>

      <!-- Rated flavors summary -->
      <div v-if="ratedCount > 0" class="w-full max-w-xs mx-auto">
        <div class="flex items-center justify-between mb-2">
          <span class="text-cigar-mute text-xs">已评 {{ ratedCount }}/{{ segments.length }} 项</span>
          <button @click="resetAll" class="text-[11px] text-cigar-gold hover:text-cigar-cream transition-colors">重置</button>
        </div>
        <div class="flex gap-1.5 flex-wrap justify-center">
          <div
            v-for="(seg, i) in segments"
            :key="'chip'+seg.value"
            @click="onSegmentClick(seg.value)"
            class="chip-flavor cursor-pointer transition-all duration-200"
            :class="chipClass(seg.value)"
          >
            <span class="w-2 h-2 rounded-full inline-block" :style="{ background: getColor(i) }"></span>
            <span class="text-xs">{{ seg.label }}</span>
            <span v-if="scores[seg.value]" class="text-[10px] font-bold" :class="scores[seg.value] >= 7 ? 'text-cigar-gold' : 'text-cigar-mute'">
              {{ scores[seg.value] }}
            </span>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="ratedCount === 0" class="text-center py-3">
        <p class="text-cigar-mute text-xs">点击风味轮上的扇区开始评分</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['update:scores'])
const props = defineProps({
  scores: { type: Object, default: () => ({}) },
})

const selectedFlavor = ref(null)
const wheelSize = ref(300)

const cx = 150, cy = 150, viewBox = 300
const outerR = 140, innerR = 50

const segments = [
  { value: 'woody',   label: '木香',   color: '#8b5e3c' },
  { value: 'spicy',   label: '辛香',   color: '#c0392b' },
  { value: 'sweet',   label: '甜香',   color: '#c9a84c' },
  { value: 'earthy',  label: '土香',   color: '#6b5b4b' },
  { value: 'nutty',   label: '坚果',   color: '#a08060' },
  { value: 'floral',  label: '花香',   color: '#5a7a5a' },
]

const flavorTags = {
  woody:  ['雪松木','橡木','檀香','松木'],
  spicy:  ['胡椒','肉桂','肉豆蔻','丁香'],
  sweet:  ['可可','咖啡','香草','蜂蜜','焦糖','奶油'],
  earthy: ['皮革','泥土','谷仓','苔藓'],
  nutty:  ['杏仁','核桃','花生'],
  floral: ['花香','柑橘','青草','薄荷'],
}

function getColor(i) {
  return segments[i].color
}

function getSegmentColor(i, seg) {
  const val = props.scores[seg.value] || 0
  if (!val) return seg.color + '40'
  const intensity = val / 10
  const r = parseInt(seg.color.slice(1,3), 16)
  const g = parseInt(seg.color.slice(3,5), 16)
  const b = parseInt(seg.color.slice(5,7), 16)
  const alpha = 0.4 + intensity * 0.6
  return `rgba(${r},${g},${b},${alpha})`
}

function getSegmentOpacity(i, seg) {
  if (selectedFlavor.value === seg.value) return 1
  if (props.scores[seg.value]) return 0.85
  return 0.6
}

function segmentPath(i) {
  const anglePer = 360 / segments.length
  const startAngle = -90 + i * anglePer - anglePer / 2
  const endAngle = startAngle + anglePer
  const r = outerR
  const x1 = cx + r * Math.cos(startAngle * Math.PI / 180)
  const y1 = cy + r * Math.sin(startAngle * Math.PI / 180)
  const x2 = cx + r * Math.cos(endAngle * Math.PI / 180)
  const y2 = cy + r * Math.sin(endAngle * Math.PI / 180)
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`
}

function labelPos(i) {
  const anglePer = 360 / segments.length
  const angle = -90 + i * anglePer
  const r = outerR * 0.68
  return {
    x: cx + r * Math.cos(angle * Math.PI / 180),
    y: cy + r * Math.sin(angle * Math.PI / 180),
  }
}

function labelAngle(i) {
  const anglePer = 360 / segments.length
  const angle = -90 + i * anglePer
  return angle > 90 || angle < -90 ? angle + 180 : angle
}

function badgeStyle(i, seg) {
  const anglePer = 360 / segments.length
  const angle = -90 + i * anglePer
  const r = outerR + 22
  const x = cx + r * Math.cos(angle * Math.PI / 180)
  const y = cy + r * Math.sin(angle * Math.PI / 180)
  return {
    left: `calc(50% + ${x - cx}px)`,
    top: `calc(50% + ${y - cy}px)`,
    transform: 'translate(-50%, -50%)',
  }
}

function scoreBadgeClass(score) {
  if (score >= 8) return 'bg-green-600 text-white'
  if (score >= 5) return 'bg-cigar-gold text-cigar-dark'
  return 'bg-cigar-mute text-cigar-cream'
}

const selectedFlavorLabel = computed(() => {
  const seg = segments.find(s => s.value === selectedFlavor.value)
  return seg ? seg.label : ''
})

const selectedFlavorTags = computed(() => {
  return flavorTags[selectedFlavor.value] || []
})

const ratedCount = computed(() => {
  return Object.values(props.scores).filter(v => v > 0).length
})

const sliderStyle = computed(() => {
  const val = props.scores[selectedFlavor.value] || 0
  const pct = ((val - 1) / 9) * 100
  return {
    background: `linear-gradient(to right, #c9a84c 0%, #c9a84c ${pct}%, #3d3428 ${pct}%, #3d3428 100%)`,
  }
})

function onSegmentClick(value) {
  selectedFlavor.value = selectedFlavor.value === value ? null : value
}

function onSliderInput(e) {
  const val = parseInt(e.target.value)
  const newScores = { ...props.scores, [selectedFlavor.value]: val }
  emit('update:scores', newScores)
}

function resetAll() {
  emit('update:scores', {})
  selectedFlavor.value = null
}

function chipClass(value) {
  if (selectedFlavor.value === value) return 'ring-2 ring-cigar-gold bg-cigar-gold/10'
  if (props.scores[value]) return 'bg-cigar-light/50'
  return 'bg-cigar-dark border border-cigar-light'
}

let touchStartY = 0
function onTouchStart(e) {
  touchStartY = e.touches[0].clientY
}

function onMouseDown(e) {
}

function updateSize() {
  const w = Math.min(window.innerWidth - 40, 360)
  wheelSize.value = Math.max(260, w)
}

onMounted(() => {
  updateSize()
  window.addEventListener('resize', updateSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSize)
})
</script>

<style scoped>
.flavor-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  border-radius: 999px;
  outline: none;
  transition: background 0.2s;
}
.flavor-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #c9a84c;
  cursor: pointer;
  border: 2px solid #1a1410;
  box-shadow: 0 0 8px rgba(201,168,76,0.3);
  transition: transform 0.15s;
}
.flavor-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}
.flavor-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #c9a84c;
  cursor: pointer;
  border: 2px solid #1a1410;
}

.chip-flavor {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  transition: all 0.2s;
}

.slide-up-enter-active { transition: all 0.3s ease-out; }
.slide-up-leave-active { transition: all 0.2s ease-in; }
.slide-up-enter-from { opacity: 0; transform: translateY(12px); }
.slide-up-leave-to   { opacity: 0; transform: translateY(-8px); }
</style>
