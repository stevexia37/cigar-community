<template>
  <div>
    <p class="mb-4 text-[11px] text-cigar-mute">
      停用账号会立即清除该用户的所有会话（正在浏览的页面下次请求即失效）。
      管理员账号不可被停用，也不能停用自己。
    </p>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="cc-skeleton h-14" />
    </div>

    <div v-else-if="error" class="cc-card p-6 text-center">
      <p class="text-sm text-red-300">{{ error }}</p>
      <button class="cc-btn-ghost mt-3" @click="load">重试</button>
    </div>

    <EmptyState v-else-if="items.length === 0" icon="👤" title="暂无用户" description="注册用户会出现在这里。" />

    <div v-else class="cc-card overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-cigar-light/60 text-cigar-mute">
          <tr>
            <th class="px-4 py-2.5 font-medium">用户名</th>
            <th class="px-4 py-2.5 font-medium">角色</th>
            <th class="px-4 py-2.5 font-medium">笔记</th>
            <th class="px-4 py-2.5 font-medium">投稿</th>
            <th class="px-4 py-2.5 font-medium">注册时间</th>
            <th class="px-4 py-2.5 font-medium">状态</th>
            <th class="px-4 py-2.5 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in items" :key="u.id" class="border-b border-cigar-light/30 last:border-0">
            <td class="px-4 py-2.5">
              <router-link :to="`/users/${u.id}`" class="text-cigar-cream hover:text-cigar-gold" target="_blank">
                {{ u.username }}
              </router-link>
            </td>
            <td class="px-4 py-2.5">
              <span class="rounded-md px-1.5 py-0.5" :class="roleBadge(u.role).cls">{{ roleBadge(u.role).label }}</span>
            </td>
            <td class="px-4 py-2.5 text-cigar-mute">{{ u.reviewCount }}</td>
            <td class="px-4 py-2.5 text-cigar-mute">{{ u.submissionCount }}</td>
            <td class="px-4 py-2.5 text-cigar-mute">{{ formatTime(u.createdAt) }}</td>
            <td class="px-4 py-2.5">
              <span :class="u.status === 1 ? 'text-emerald-300' : 'text-red-300'">
                {{ u.status === 1 ? '正常' : '已停用' }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-right">
              <button
                v-if="canToggle(u)"
                class="cc-btn-ghost !px-2.5 !py-1 text-[11px]"
                :disabled="busyId === u.id"
                @click="toggle(u)"
              >{{ busyId === u.id ? '…' : (u.status === 1 ? '停用' : '启用') }}</button>
              <span v-else class="text-cigar-smoke">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="mt-5 flex items-center justify-center gap-3 text-sm">
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40" :disabled="page <= 1" @click="setPage(page - 1)">上一页</button>
      <span class="text-cigar-mute">{{ page }} / {{ totalPages }}</span>
      <button class="cc-btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40" :disabled="page >= totalPages" @click="setPage(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/client.js'
import EmptyState from '@/components/EmptyState.vue'
import { useAuth } from '@/composables/useAuth.js'

const auth = useAuth()

const items = ref([])
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')
const busyId = ref(null)

function roleBadge(role) {
  const map = {
    admin: { label: '管理员', cls: 'bg-cigar-gold/20 text-cigar-gold' },
    editor: { label: '编辑', cls: 'bg-emerald-500/15 text-emerald-300' },
    user: { label: '用户', cls: 'bg-cigar-light/50 text-cigar-mute' },
  }
  return map[role] ?? { label: role, cls: 'bg-cigar-light/50 text-cigar-mute' }
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('zh-CN')
}

/** 管理员账号与自己不可操作 —— 与后端约束保持一致，避免按钮点了才报错 */
function canToggle(u) {
  return u.role !== 'admin' && u.id !== auth.user?.id
}

async function toggle(u) {
  const next = u.status === 1 ? 0 : 1
  const verb = next === 0 ? '停用' : '启用'
  if (next === 0 && !window.confirm(`确定停用「${u.username}」？其所有会话会立即失效。`)) return

  busyId.value = u.id
  try {
    await api.adminSetUserStatus(u.id, next)
    u.status = next
  } catch (err) {
    window.alert(err?.humanMessage || `${verb}失败`)
  } finally {
    busyId.value = null
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.adminUsers({ page: page.value, pageSize: 30 })
    items.value = res.items ?? []
    totalPages.value = Math.max(1, res.totalPages ?? 1)
  } catch (err) {
    error.value = err?.humanMessage || '加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

function setPage(p) { page.value = p; load() }

onMounted(load)
</script>
