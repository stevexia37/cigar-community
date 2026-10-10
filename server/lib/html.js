/**
 * HTML 转义
 *
 * 单独成文件而不是塞进 meta.js：任何把变量写进 HTML 的地方都应该用它，
 * 放在一个语义清楚的位置更容易被记住使用。
 */

const MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 转义 HTML 特殊字符。
 * 注意：用于 HTML 文本与属性值；不要用它去处理已经是 HTML 的字符串（那会双重转义）。
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (ch) => MAP[ch])
}

/** 把 JSON 安全地内联进 <script>（防止 </script> 提前闭合） */
export function escapeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}
