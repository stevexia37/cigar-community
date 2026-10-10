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

// 标题 + 登录守卫（具体会话状态由使用方组件查询，避免每次路由都打接口）
router.beforeEach((to) => {
  if (to.meta?.title) document.title = `${to.meta.title} · 雪茄客`
  return true
})

export default router
