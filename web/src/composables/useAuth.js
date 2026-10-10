import { reactive, readonly } from 'vue'
import api from '@/api/client.js'

/**
 * 全局会话状态（单例）。
 * 刻意不引入 Pinia —— 全站只有一个共享状态，reactive 足够，少一个依赖。
 */
const state = reactive({
  user: null,
  loaded: false,
  loading: false,
})

let inflight = null

async function refresh(force = false) {
  if (state.loading) return inflight
  if (state.loaded && !force) return state.user
  state.loading = true
  inflight = api.me()
    .then((res) => {
      state.user = res?.user ?? null
      state.loaded = true
      return state.user
    })
    .catch(() => {
      state.user = null
      state.loaded = true
      return null
    })
    .finally(() => {
      state.loading = false
      inflight = null
    })
  return inflight
}

async function login(payload) {
  const res = await api.login(payload)
  state.user = res.user
  state.loaded = true
  return res.user
}

async function register(payload) {
  const res = await api.register(payload)
  state.user = res.user
  state.loaded = true
  return res.user
}

async function logout() {
  try {
    await api.logout()
  } finally {
    state.user = null
    state.loaded = true
  }
}

const auth = {
  state: readonly(state),
  get user() { return state.user },
  get isLoggedIn() { return !!state.user },
  get isAdmin() { return state.user?.role === 'admin' },
  refresh,
  login,
  register,
  logout,
}

export function useAuth() {
  return auth
}
