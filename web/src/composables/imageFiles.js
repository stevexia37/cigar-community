/**
 * 图片选择的纯逻辑（无任何 Vue / 网络依赖）。
 *
 * 单独成文件的原因有两个：
 *   1. 能被 Node 直接单元测试 —— composable 里有 `@/` 别名与 Vue 导入，
 *      在 node --test 下无法解析
 *   2. 这里承载一个**真实踩过的陷阱**：input.files 是活的 FileList
 */

/**
 * 把类 FileList 快照成数组。
 *
 * ⚠️ 为什么必须有这一步：`input.files` / `dataTransfer.files` 是**活的 FileList**。
 * 为了让用户能连续两次选同一张图，组件会在 emit 之后执行 `input.value = ''`，
 * 这会**就地清空**那个 FileList。
 * 只要消费者在读取前 await 过任何东西（例如等 /api/uploads/limits 返回），
 * 拿到的就是空列表 —— 表现为「选图毫无反应、且控制台没有任何报错」。
 *
 * 这个 bug 真实发生过，所以快照必须发生在 emit 之前、且是所有消费者的入口。
 */
export function toFileArray(fileListLike) {
  return Array.from(fileListLike ?? [])
}

/** 从（可能是活的）FileList 中筛出图片文件 */
export function pickImageFiles(fileListLike) {
  return toFileArray(fileListLike).filter(
    (f) => f && typeof f.type === 'string' && f.type.startsWith('image/'),
  )
}
