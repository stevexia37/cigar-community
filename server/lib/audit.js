/**
 * 审计日志的写入工具。
 *
 * 这里解决一个契约与运营需求之间的真实冲突：
 *   · 契约（docs/API.md §8）写的是「命中红线 → 内容不入库」
 *   · 但运营需要知道「为什么被拦」才能判断是误杀还是真违规
 *
 * 原实现两头都没顾好：它把被拒内容的 **120 字原文摘录**写进了 audit_log，
 * 等于把红线要拦的东西（交易话术、联系方式）原样存了一份 ——
 * 既违背「内容不入库」，又让违规文本二次留存。
 *
 * 现在的口径：
 *   · blocked（拒绝）→ **不留存原文**，只记命中词与内容指纹
 *   · queued / warned / clean（内容已入库或已发布）→ 留摘录，便于运营复核
 *     （这些内容本来就在库里，再存一份摘录不引入新的留存风险）
 */
import { createHash } from 'node:crypto'
import { run, nowIso } from '../db/index.js'

/** 内容指纹：用于在「不留存原文」的前提下，仍能识别同一段内容被反复提交 */
export function contentFingerprint(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 16)
}

/** 截断摘要（仅在允许留存原文时使用） */
export function excerpt(text, len = 120) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > len ? s.slice(0, len) + '…' : s
}

/** 被拒内容在审计日志里的占位说明（不含原文） */
export function redactedNote(result, text) {
  const words = Array.isArray(result?.matched) ? result.matched : []
  const size = String(text ?? '').length
  return `[已拒绝，未留存原文] 命中：${words.join('、') || '—'} · 指纹 ${contentFingerprint(text)} · ${size} 字`
}

/**
 * 写一条审计记录。
 *
 * @param {object} o
 * @param {number|null} o.userId 操作者
 * @param {string} o.kind 'review' | 'submission' | 其它
 * @param {number|null} o.refId
 * @param {string} o.action 'blocked' | 'queued' | 'warned' | 'clean' | 'approved' | 'rejected'
 * @param {Array} o.matched 命中词
 * @param {string} o.text 原始内容（是否留存由 action 决定）
 */
export function logAudit({ userId, kind, refId, action, matched, text }) {
  const note = action === 'blocked' ? redactedNote({ matched }, text) : excerpt(text)
  run(
    'INSERT INTO audit_log (user_id, kind, ref_id, action, matched, excerpt, created_at) VALUES (?,?,?,?,?,?,?)',
    [userId, kind, refId, action, JSON.stringify(matched ?? []), note, nowIso()],
  )
}
