/**
 * 「年龄门已放行」的信号。
 *
 * 为什么需要它：服务端强制年龄门后，未过门时 /api/* 返回 403。
 * 页面首次挂载时数据请求必然失败（弹窗还没确认），而各视图的加载逻辑
 * 只在 onMounted 跑一次 —— 结果是用户确认后，界面永远停在
 * 「请先确认已满 18 周岁」的错误提示上，数据再也不拉。真实踩过。
 *
 * 用一个模块级回调集合而不是 event bus 依赖：这里只需要「放行时喊一声」，
 * 引入一个发布订阅库对这个规模的项目不划算。
 */
const listeners = new Set()

/** 订阅「年龄门已放行」；返回取消订阅函数 */
export function onAgeGateOpen(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 年龄门放行时调用（AgeGate 确认成功后触发） */
export function emitAgeGateOpen() {
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch (err) {
      // 单个订阅者出错不应影响其它视图
      console.error('[ageGate] 放行回调失败：', err?.message || err)
    }
  }
}
