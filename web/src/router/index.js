import { createRouter, createWebHistory } from 'vue-router'

// 路由懒加载：首屏只加载首页壳，其余按需拉取
const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '雪茄客 · 纯粹交流地' },
  },
  {
    path: '/cigars',
    name: 'cigars',
    component: () => import('@/views/CigarListView.vue'),
    meta: { title: '雪茄数据库' },
  },
  {
    path: '/cigars/:id(\\d+)',
    name: 'cigar-detail',
    component: () => import('@/views/CigarDetailView.vue'),
    meta: { title: '雪茄详情' },
  },
  {
    path: '/reviews',
    name: 'reviews',
    component: () => import('@/views/ReviewsView.vue'),
    meta: { title: '品吸笔记' },
  },
  {
    path: '/reviews/new',
    name: 'review-new',
    component: () => import('@/views/ReviewFormView.vue'),
    meta: { title: '写品吸笔记', requiresAuth: true },
  },
  {
    path: '/tools/diagnostic',
    name: 'diagnostic',
    component: () => import('@/views/DiagnosticView.vue'),
    meta: { title: '雪茄病害一键诊断' },
  },
  {
    path: '/tools/flavor-test',
    name: 'flavor-test',
    component: () => import('@/views/FlavorTestView.vue'),
    meta: { title: '风味人格测试' },
  },
  {
    path: '/tools/aging-calc',
    name: 'aging-calc',
    component: () => import('@/views/AgingCalcView.vue'),
    meta: { title: '醇化计算器' },
  },
  {
    path: '/submit',
    name: 'submit',
    component: () => import('@/views/SubmissionView.vue'),
    meta: { title: '提报雪茄数据', requiresAuth: true },
  },
  {
    path: '/guide/plume-vs-mold',
    name: 'plume-guide',
    component: () => import('@/views/GuideView.vue'),
    meta: { title: '起灰还是发霉' },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { title: '管理后台', requiresAuth: true, requiresRole: ['admin', 'editor'] },
    children: [
      { path: '', redirect: { name: 'admin-overview' } },
      {
        path: 'overview',
        name: 'admin-overview',
        component: () => import('@/views/admin/AdminOverview.vue'),
        meta: { title: '运营概览' },
      },
      {
        path: 'reviews',
        name: 'admin-reviews',
        component: () => import('@/views/admin/AdminReviews.vue'),
        meta: { title: '笔记审核' },
      },
      {
        path: 'submissions',
        name: 'admin-submissions',
        component: () => import('@/views/admin/AdminSubmissions.vue'),
        meta: { title: '投稿审批' },
      },
      {
        path: 'audit-log',
        name: 'admin-audit',
        component: () => import('@/views/admin/AdminAuditLog.vue'),
        meta: { title: '审核日志' },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/AdminUsers.vue'),
        meta: { title: '用户管理' },
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录 / 注册' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于与免责声明' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    return { top: 0 }
  },
})

// 标题 + 路由守卫
// 说明：以前这里只设 document.title，meta.requiresAuth / requiresRole 是死配置，
// 全靠各视图自己兜住。现在统一在路由层拦截，视图不必重复判断。
router.beforeEach(async (to) => {
  if (to.meta?.title) document.title = `${to.meta.title} · 雪茄客`

  const needAuth = to.matched.some((r) => r.meta?.requiresAuth)
  const roles = to.matched.flatMap((r) => r.meta?.requiresRole ?? [])
  if (!needAuth && roles.length === 0) return true

  // 懒加载 useAuth 避免循环依赖（router ← useAuth ← client）
  const { useAuth } = await import('@/composables/useAuth.js')
  const auth = useAuth()
  const user = await auth.refresh()

  if (!user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (roles.length && !roles.includes(user.role)) {
    return { name: 'not-found' }
  }
  return true
})

export default router
