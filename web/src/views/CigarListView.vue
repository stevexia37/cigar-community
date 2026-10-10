<template>
  <div class="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-8">
    <!-- ===== 标题 ===== -->
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl text-cigar-cream sm:text-3xl">雪茄数据库</h1>
        <p class="mt-1 text-xs text-cigar-mute">
          <template v-if="loading">正在检索…</template>
          <template v-else-if="loadError">数据加载失败</template>
          <template v-else>共 {{ total }} 支雪茄 · 筛选与页码会同步到地址栏</template>
        </p>
      </div>
      <router-link to="/submit" class="cc-btn-ghost !px-3 !py-1.5 text-xs">＋ 提报新雪茄</router-link>
    </header>

    <!-- ===== 搜索 ===== -->
    <div class="mt-5">
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-cigar-smoke" aria-hidden="true">🔍</span>
        <input
          v-model="q"
          type="search"
          class="cc-input !pl-9"
          placeholder="搜品牌 / 系列 / 型号 / 风味，如 Cohiba、雪松"
          aria-label="搜索雪茄"
        />
        <button
          v-if="q"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-cigar-smoke hover:text-cigar-cream"
          @click="q = ''"
        >清除</button>
      </div>
    </div>

    <!-- ===== 排序 + 筛选开关 ===== -->
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <label class="sr-only" for="cc-sort">排序</label>
      <select id="cc-sort" v-model="sort" class="cc-input !w-auto !py-2 text-xs">
        <option v-if="!sortOptions.length" value="rating">评分优先</option>
        <option v-for="opt in sortOptions" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
      </select>

      <button
        type="button"
        class="cc-chip"
        :class="{ 'cc-chip-active': panelOpen }"
        :aria-expanded="panelOpen"
        @click="panelOpen = !panelOpen"
      >⚙️ 筛选<span v-if="activeChips.length" class="text-cigar-gold">({{ activeChips.length }})</span></button>

      <span v-if="metaLoading" class="text-xs text-cigar-smoke">筛选项加载中…</span>
      <span v-else-if="metaError" class="text-xs text-cigar-smoke">{{ metaError }}</span>
    </div>

    <!-- ===== 已选条件 chips ===== -->
    <div v-if="activeChips.length" class="mt-3 flex flex-wrap items-center gap-2">
      <button
        v-for="chip in activeChips"
        :key="chip.key"
        type="button"
        class="cc-chip cc-chip-active"
        :title="'移除：' + chip.label"
        @click="removeFilter(chip)"
      >{{ chip.label }} <span class="text-cigar-gold/80">✕</span></button>
      <button type="button" class="text-xs text-cigar-mute underline hover:text-cigar-gold" @click="clearAll">清空全部</button>
    </div>

    <!-- ===== 筛选面板 ===== -->
    <section v-if="panelOpen" class="cc-card mt-3 p-4 anim-slide-down">
      <div v-if="metaLoading" class="space-y-3">
        <div v-for="n in 3" :key="n" class="cc-skeleton h-10 w-full"></div>
      </div>

      <div v-else class="space-y-4">
        <!-- 产地 -->
        <FilterGroup title="产地" :expanded="true">
          <button
            v-for="opt in origins"
            :key="opt.value"
            type="button"
            class="cc-chip"
            :class="{ 'cc-chip-active': draft.origin.includes(opt.value) }"
            @click="toggle('origin', opt.value)"
          >{{ originFlag(opt.value) }} {{ opt.label }}<span class="text-cigar-smoke">{{ opt.count ?? '' }}</span></button>
        </FilterGroup>

        <!-- 型号家族 -->
        <FilterGroup title="型号家族" :expanded="true">
          <button
            v-for="opt in sizes"
            :key="opt.value"
            type="button"
            class="cc-chip"
            :class="{ 'cc-chip-active': draft.size.includes(opt.value) }"
            @click="toggle('size', opt.value)"
          >{{ opt.label }}<span class="text-cigar-smoke">{{ opt.count ?? '' }}</span></button>
        </FilterGroup>

        <!-- 浓郁度 -->
        <FilterGroup title="浓郁度" :expanded="true">
          <button
            v-for="opt in strengths"
            :key="String(opt.value)"
            type="button"
            class="cc-chip"
            :class="{ 'cc-chip-active': draft.strength.includes(opt.value) }"
            @click="toggle('strength', opt.value)"
          ><span class="tracking-tight">
            <span v-for="n in 5" :key="n" :class="n <= opt.value ? 'text-cigar-gold' : 'text-cigar-light'">●</span>
          </span>{{ opt.label }}<span class="text-cigar-smoke">{{ opt.count ?? '' }}</span></button>
        </FilterGroup>

        <!-- 风味（按类别分组，可折叠） -->
        <FilterGroup title="风味" :expanded="true">
          <template v-if="flavorCategories.length">
            <div v-for="cat in flavorCategories" :key="cat.value" class="w-full">
              <button
                type="button"
                class="flex w-full items-center justify-between rounded-lg border border-cigar-light/60 px-3 py-2 text-left text-xs text-cigar-cream hover:border-cigar-gold/50"
                @click="toggleCat(cat.value)"
              >
                <span>
                  {{ expandedCats.includes(cat.value) ? '▾' : '▸' }} {{ cat.label }}
                  <span class="ml-1 text-cigar-smoke">{{ cat.flavors?.length || 0 }}</span>
                </span>
                <span v-if="selectedFlavorCountIn(cat)" class="text-cigar-gold">已选 {{ selectedFlavorCountIn(cat) }}</span>
              </button>
              <div v-if="expandedCats.includes(cat.value)" class="mt-2 flex flex-wrap gap-2 pl-2">
                <button
                  v-for="f in cat.flavors"
                  :key="f.id"
                  type="button"
                  class="cc-chip"
                  :class="{ 'cc-chip-active': draft.flavor.includes(f.id) }"
                  @click="toggle('flavor', f.id)"
                >{{ f.label }}<span class="text-cigar-smoke">{{ f.count ?? '' }}</span></button>
              </div>
            </div>
          </template>
          <p v-else class="text-xs text-cigar-smoke">暂无风味数据</p>
        </FilterGroup>

        <!-- 品牌（可折叠） -->
        <FilterGroup title="品牌" :expanded="true">
          <template v-if="brands.length">
            <div class="flex flex-wrap gap-2" :class="brandsExpanded ? '' : 'max-h-24 overflow-hidden'">
              <button
                v-for="b in brands"
                :key="b.id"
                type="button"
                class="cc-chip"
                :class="{ 'cc-chip-active': draft.brand.includes(b.id) }"
                @click="toggle('brand', b.id)"
              >{{ b.name }}<span class="text-cigar-smoke">{{ b.count ?? '' }}</span></button>
            </div>
            <button
              v-if="brands.length > 12"
              type="button"
              class="mt-1 text-xs text-cigar-mute hover:text-cigar-gold"
              @click="brandsExpanded = !brandsExpanded"
            >{{ brandsExpanded ? '收起品牌 ▲' : `展开全部 ${brands.length} 个品牌 ▼` }}</button>
          </template>
          <p v-else class="text-xs text-cigar-smoke">暂无品牌数据</p>
        </FilterGroup>

        <div class="flex justify-end gap-2 border-t border-cigar-light/50 pt-3">
          <button type="button" class="cc-btn-ghost !py-2 text-xs" @click="clearAll">清空全部</button>
          <button type="button" class="cc-btn-primary !py-2 text-xs" @click="panelOpen = false">收起筛选</button>
        </div>
      </div>
    </section>

    <!-- ===== 结果区 ===== -->
    <div v-if="loadError" class="cc-card mt-6 p-8 text-center">
      <div class="text-4xl" aria-hidden="true">⚠️</div>
      <p class="mt-3 text-sm text-cigar-cream">{{ loadError }}</p>
      <p class="mt-1 text-xs text-cigar-mute">检查网络或后端服务后重试，你的筛选条件不会丢失。</p>
      <button class="cc-btn-primary mt-4" @click="retry">重试</button>
    </div>

    <div v-else-if="loading" class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="n in 6" :key="n" class="cc-card p-3.5">
        <div class="cc-skeleton h-5 w-2/3"></div>
        <div class="cc-skeleton mt-2 h-3 w-1/2"></div>
        <div class="cc-skeleton mt-3 h-3 w-full"></div>
        <div class="cc-skeleton mt-2 h-3 w-4/5"></div>
      </div>
    </div>

    <div v-else-if="items.length" class="mt-6">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CigarCard v-for="c in items" :key="c.id" :cigar="c" />
      </div>

      <!-- 分页 -->
      <nav v-if="totalPages > 1" class="mt-8 flex items-center justify-center gap-2" aria-label="分页">
        <button
          type="button"
          class="cc-btn-ghost !px-3 !py-2 text-xs"
          :disabled="page <= 1"
          @click="goPage(page - 1)"
        >上一页</button>

        <template v-for="(p, i) in pageNumbers" :key="i">
          <span v-if="p === '…'" class="px-1 text-xs text-cigar-smoke">…</span>
          <button
            v-else
            type="button"
            class="h-9 min-w-9 rounded-xl border px-2 text-xs transition-colors"
            :class="p === page
              ? 'border-cigar-gold bg-cigar-gold/15 text-cigar-gold'
              : 'border-cigar-light text-cigar-mute hover:border-cigar-gold/60 hover:text-cigar-cream'"
            :aria-current="p === page ? 'page' : undefined"
            @click="goPage(p)"
          >{{ p }}</button>
        </template>

        <button
          type="button"
          class="cc-btn-ghost !px-3 !py-2 text-xs"
          :disabled="page >= totalPages"
          @click="goPage(page + 1)"
        >下一页</button>
      </nav>

      <p class="mt-4 text-center text-[11px] text-cigar-smoke">
        第 {{ page }} / {{ totalPages }} 页 · 共 {{ total }} 条
      </p>
    </div>

    <div v-else class="mt-6">
      <EmptyState
        icon="🔍"
        title="没有符合条件的雪茄"
        description="试试减少几个筛选条件，或者换个关键词。也可以提报一支我们还没收录的雪茄。"
        action-label="清空筛选"
        @action="clearAll"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api/client.js'
import CigarCard from '@/components/CigarCard.vue'
import EmptyState from '@/components/EmptyState.vue'

/**
 * 折叠分组的轻量包装（必须定义在模块作用域：
 * 写在 <script setup> 里会随父组件重渲染被重建，展开状态会丢失）
 */
const FilterGroup = defineComponent({
  name: 'FilterGroup',
  props: {
    title: { type: String, default: '' },
    expanded: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    const open = ref(props.expanded)
    return () =>
      h('div', { class: 'border-t border-cigar-light/40 pt-3 first:border-t-0 first:pt-0' }, [
        h(
          'button',
          {
            type: 'button',
            class: 'mb-2 flex w-full items-center gap-1 text-xs font-medium text-cigar-cream',
            onClick: () => { open.value = !open.value },
          },
          `${open.value ? '▾' : '▸'} ${props.title}`,
        ),
        open.value ? h('div', { class: 'flex flex-wrap gap-2' }, slots.default ? slots.default() : []) : null,
      ])
  },
})

const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 24
const FILTER_KEYS = ['origin', 'size', 'strength', 'flavor', 'brand']

// ---- 地址栏解析 ----
function parseQuery(query) {
  const raw = query ?? {}
  const state = { q: typeof raw.q === 'string' ? raw.q : '', sort: raw.sort ? String(raw.sort) : 'rating', page: 1 }
  for (const key of FILTER_KEYS) {
    state[key] = String(raw[key] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((v) => (key === 'strength' || key === 'flavor' || key === 'brand' ? Number(v) : v))
      .filter((v) => !(typeof v === 'number' && Number.isNaN(v)))
  }
  const p = Number(raw.page)
  state.page = Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
  return state
}

// 输入态（与地址栏双向同步）
const q = ref('')
const sort = ref('rating')
const page = ref(1)

// 结果态
const loading = ref(true)
const loadError = ref('')
const items = ref([])
const total = ref(0)
const totalPages = ref(1)
let reqSeq = 0

// 筛选面板
const panelOpen = ref(false)
const brandsExpanded = ref(false)
const expandedCats = ref([])

// 元数据（选项一律来自 /api/meta）
const metaLoading = ref(true)
const metaError = ref('')
const origins = ref([])
const sizes = ref([])
const strengths = ref([])
const flavorCategories = ref([])
const brands = ref([])
const sortOptions = ref([])

// 每个筛选字段各有一份「草稿」，确认后并入查询
const draft = reactive({ origin: [], size: [], strength: [], flavor: [], brand: [] })

const ORIGIN_FLAGS = {
  cuba: '🇨🇺', nicaragua: '🇳🇮', dominican: '🇩🇴',
  davidoff: '🇨🇭', honduras: '🇭🇳', usa: '🇺🇸',
}
const originFlag = (v) => ORIGIN_FLAGS[v] || '🌍'

// ---- 标签映射（把 value 翻译回中文，让 chip 可读） ----
const labelMaps = computed(() => ({
  origin: Object.fromEntries(origins.value.map((o) => [String(o.value), o.label])),
  size: Object.fromEntries(sizes.value.map((o) => [String(o.value), o.label])),
  strength: Object.fromEntries(strengths.value.map((o) => [String(o.value), o.label])),
  brand: Object.fromEntries(brands.value.map((b) => [String(b.id), b.name])),
  flavor: Object.fromEntries(
    flavorCategories.value.flatMap((c) => (c.flavors || []).map((f) => [String(f.id), f.label])),
  ),
}))

const activeChips = computed(() => {
  const out = []
  const prefix = { origin: '产地', size: '型号', strength: '浓郁度', flavor: '风味', brand: '品牌' }
  for (const key of FILTER_KEYS) {
    for (const v of draft[key]) {
      const label = labelMaps.value[key]?.[String(v)] ?? String(v)
      out.push({ key: `${key}:${v}`, field: key, value: v, label: `${prefix[key]} · ${label}` })
    }
  }
  return out
})

const selectedFlavorCountIn = (cat) =>
  (cat.flavors || []).filter((f) => draft.flavor.includes(f.id)).length

const pageNumbers = computed(() => {
  const last = totalPages.value
  const cur = page.value
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const set = new Set([1, last, cur, cur - 1, cur + 1])
  const list = [...set].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const n of list) {
    if (prev && n - prev > 1) out.push('…')
    out.push(n)
    prev = n
  }
  return out
})

// ---- 地址栏 → 组件状态 ----
function applyQuery() {
  const s = parseQuery(route.query)
  q.value = s.q
  sort.value = s.sort
  page.value = s.page
  for (const key of FILTER_KEYS) draft[key] = s[key]
}

// 把当前状态写回地址栏；返回是否真的发生了导航（值未变时不触发导航）
function writeQuery() {
  const query = {}
  if (q.value.trim()) query.q = q.value.trim()
  for (const key of FILTER_KEYS) if (draft[key].length) query[key] = draft[key].join(',')
  if (sort.value) query.sort = String(sort.value)
  if (page.value > 1) query.page = String(page.value)

  const cur = route.query
  const same =
    (cur.q ?? '') === (query.q ?? '') &&
    (cur.sort ?? '') === (query.sort ?? '') &&
    (cur.page ?? '') === (query.page ?? '') &&
    FILTER_KEYS.every((k) => (cur[k] ?? '') === (query[k] ?? ''))
  if (same) return false
  router.replace({ path: '/cigars', query })
  return true
}

// 地址栏变化（浏览器前进/后退、手改 URL、或本组件自己 replace）→ 恢复状态。
// 这里**不再**用 selfNavigating 标志判断「是不是自己触发的」：
// 那种做法把「要不要拉数据」的信号穿过 vue-router，一旦导航被去重（query 值相同）
// 标志就会残留，把下一次真正的变化吞掉 —— 表现为「URL 变了但列表不刷新」（踩过的坑）。
// 改为幂等做法：applyQuery 后比对「当前状态」与「已加载状态」，相同就跳过，天然不会重复请求。
watch(() => route.query, () => {
  if (route.path !== '/cigars') return
  applyQuery()
  loadIfChanged()
})

onMounted(() => {
  applyQuery()
  loadMeta()
  loadIfChanged()
})

async function loadMeta() {
  metaLoading.value = true
  metaError.value = ''
  try {
    const meta = await api.meta()
    origins.value = meta?.origins ?? []
    sizes.value = meta?.sizes ?? []
    strengths.value = meta?.strengths ?? []
    flavorCategories.value = meta?.flavorCategories ?? []
    brands.value = meta?.brands ?? []
    sortOptions.value = meta?.sortOptions ?? []
    // 默认排序取服务端下发的第一项，避免前端硬编码；此时 onMounted 的首次请求已在途，无需再触发
    if (!route.query.sort && sortOptions.value.length) sort.value = sortOptions.value[0].value
  } catch (err) {
    metaError.value = err?.humanMessage || '筛选项加载失败，可先用搜索框'
  } finally {
    metaLoading.value = false
  }
}

async function load() {
  const seq = ++reqSeq
  loading.value = true
  loadError.value = ''
  try {
    const res = await api.cigars({
      q: q.value.trim() || undefined,
      origin: draft.origin,
      size: draft.size,
      strength: draft.strength,
      flavor: draft.flavor,
      brand: draft.brand,
      sort: sort.value || undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    if (seq !== reqSeq) return
    items.value = Array.isArray(res?.items) ? res.items : []
    total.value = Number(res?.total) || 0
    totalPages.value = Math.max(1, Number(res?.totalPages) || 1)
  } catch (err) {
    if (seq !== reqSeq) return
    items.value = []
    total.value = 0
    totalPages.value = 1
    loadError.value = err?.humanMessage || '雪茄列表加载失败'
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}

// 统一入口：写地址栏 + 确保数据被拉取。
// 不再依赖 watcher 的副作用 —— 由 loadedKey 做幂等判定，避免「同一次操作拉两次」
// 和「导航被去重导致不拉」两种极端。
function commit() {
  writeQuery()
  loadIfChanged()
}

/**
 * 幂等加载：把「会影响结果的状态」序列化成 key，与上次已加载的 key 比对。
 * 相同则不重复请求（例如自己 replace 地址栏触发的 watcher 回环）；
 * 不同则拉取。key 覆盖所有查询维度，因此任何真实变化都不会被漏掉。
 */
let loadedKey = null
function stateKey() {
  return JSON.stringify({
    q: q.value.trim(),
    sort: sort.value,
    page: page.value,
    f: FILTER_KEYS.map((k) => [...draft[k]].sort()),
  })
}
function loadIfChanged() {
  const key = stateKey()
  if (key === loadedKey) return
  loadedKey = key
  load()
}

/** 强制重拉（失败重试用）：清掉幂等标记，否则同状态会被 loadIfChanged 跳过 */
function retry() {
  loadedKey = null
  loadIfChanged()
}

// ---- 搜索：输入即搜 + 300ms 防抖 ----
// 只做 URL 同步，过滤本身由后端 /api/cigars?q= 完成
let searchTimer = null
watch(q, (val) => {
  if (val !== val.trim()) q.value = val.trim()
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    commit()
  }, 300)
})

watch(sort, (val, old) => {
  if (val === old) return
  page.value = 1
  commit()
})

onBeforeUnmount(() => clearTimeout(searchTimer))

// ---- 筛选操作 ----
function toggle(field, value) {
  const arr = draft[field]
  const idx = arr.indexOf(value)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(value)
  page.value = 1
  commit()
}

function removeFilter(chip) {
  const arr = draft[chip.field]
  const idx = arr.indexOf(chip.value)
  if (idx >= 0) arr.splice(idx, 1)
  page.value = 1
  commit()
}

function clearAll() {
  for (const key of FILTER_KEYS) draft[key] = []
  page.value = 1
  if (q.value) {
    // 取消输入框防抖，避免清空后又被触发一次
    clearTimeout(searchTimer)
    q.value = ''
  }
  commit()
}

function toggleCat(value) {
  const idx = expandedCats.value.indexOf(value)
  if (idx >= 0) expandedCats.value.splice(idx, 1)
  else expandedCats.value.push(value)
}

function goPage(p) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  commit()
}
</script>
