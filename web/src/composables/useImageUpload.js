import { ref } from 'vue'
import api from '@/api/client.js'

/**
 * 图片选择 → 浏览器端压缩 → 上传/或随笔记一起提交。
 *
 * 为什么在客户端压缩：
 *   · 手机直出照片 3-8MB，服务端没有 sharp（零依赖原则），不压会撑爆传输与存储
 *   · canvas 压缩不引入任何依赖，1600px / JPEG q0.82 通常降到 200-400KB
 *
 * 两种使用姿势：
 *   · upload()  先传后端拿 URL（适合「先传后写文」，失败可重试单张）
 *   · compress() 只压缩返回 dataURL，交给调用方随创建请求一起提交（少一次往返）
 *
 * 这里用后者为主：笔记创建接口同时接受 data: 与 /uploads/ 两种形式。
 */
export function useImageUpload({ maxEdge = 1600, quality = 0.82, maxCount = 6 } = {}) {
  const images = ref([])        // [{ id, dataUrl, url, name, size, uploading, error }]
  const limitsLoading = ref(false)

  /** 压缩单张 File → dataURL */
  function compress(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error(`${file.name || '该文件'} 不是图片`))
        return
      }
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('图片解码失败，可能已损坏'))
        img.onload = () => {
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))

          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          // 统一铺白底：PNG 透明区转 JPEG 后会变黑，影响观感
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)

          const out = canvas.toDataURL('image/jpeg', quality)
          resolve({ dataUrl: out, width: w, height: h, original: img.width + '×' + img.height })
        }
        img.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }

  /**
   * 选择文件（支持多选）：压缩完成后再一次性加入列表。
   *
   * ⚠️ 刻意「先算完再 push」，而不是 push 占位对象后异步改它的属性。
   * 后者在 Vue 里是常见陷阱：对象被 push 进 ref 数组后成为响应式代理，
   * 之后拿到的原始引用与代理不一致，异步回填属性可能看不到更新
   * （本项目在实现图片上传时正是踩了这个坑，表现为缩略图永不出现且无报错）。
   */
  async function addFiles(fileList) {
    const files = Array.from(fileList ?? []).filter((f) => f && f.type && f.type.startsWith('image/'))
    const room = Math.max(0, maxCount - images.value.length)
    const accepted = files.slice(0, room)
    const rejected = files.length - accepted.length

    const settled = await Promise.all(accepted.map(async (file) => {
      const base = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name || '未命名图片',
        size: file.size,
      }
      try {
        const r = await compress(file)
        return { ...base, dataUrl: r.dataUrl, preview: r.dataUrl, compressing: false, error: '' }
      } catch (err) {
        return { ...base, dataUrl: '', preview: '', compressing: false, error: err?.message || '图片处理失败' }
      }
    }))

    // 一次性推入：此时每个对象已是最终状态
    images.value = [...images.value, ...settled]

    return rejected > 0 ? `最多 ${maxCount} 张，已忽略 ${rejected} 张` : ''
  }

  /** 立即上传拿 URL（可选路径；不调用也能随笔记一起提交 dataURL） */
  async function uploadAll() {
    for (const item of images.value) {
      if (item.url || !item.dataUrl) continue
      item.uploading = true
      item.error = ''
      try {
        const res = await api.uploadImage(item.dataUrl)
        item.url = res?.image?.url || ''
        if (!item.url) throw new Error('服务端未返回图片地址')
      } catch (err) {
        item.error = err?.humanMessage || '上传失败'
      } finally {
        item.uploading = false
      }
    }
  }

  function remove(id) {
    images.value = images.value.filter((i) => i.id !== id)
  }

  function clear() {
    images.value = []
  }

  /** 生成提交给后端的 images 数组：优先已上传的 URL，否则带 dataURL */
  function toPayload() {
    return images.value
      .filter((i) => i.url || i.dataUrl)
      .map((i) => i.url || i.dataUrl)
  }

  const hasUploading = () => images.value.some((i) => i.compressing || i.uploading)
  const hasError = () => images.value.some((i) => i.error)

  void limitsLoading
  return { images, compress, addFiles, uploadAll, remove, clear, toPayload, hasUploading, hasError, maxCount }
}
