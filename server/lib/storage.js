/**
 * 图片存储
 *
 * 设计取舍：
 *   · **不引入 multipart 解析库**。前端把图转成 base64 放进 JSON 提交，
 *     后端自己解码 —— 省掉一个依赖，也避免 multipart 解析这类历史漏洞高发区。
 *   · **不做服务端缩放**（不引 sharp / 无原生依赖）。前端上传前已用 canvas 压到
 *     最长边 1600px、JPEG q0.82，通常 200-400KB，够展示用。真要缩略图再上 sharp。
 *   · **内容寻址**：文件名取 sha256 前 16 位，天然去重，也避免用户文件名带来的
 *     路径穿越与编码问题。
 *   · 存储后端可切换：目前是本地磁盘。部署到无状态平台（Fly/Railway 无持久卷）时，
 *     把 saveImage/readImage 换成对象存储实现即可，调用方不用改。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { badRequest, HttpError } from './http.js'

/** 允许的图片类型 → 扩展名 */
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** 单张图上限（解码后字节）。GIF 动图放宽一些。 */
const MAX_BYTES = 4 * 1024 * 1024
const MAX_BYTES_GIF = 8 * 1024 * 1024

/** 魔数校验：扩展名与 MIME 都可以伪造，最终按字节头判断真实类型 */
function sniffType(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  return null
}

function uploadDir() {
  const dir = config.paths.uploads
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 保存一张 base64 图片
 * @param {string} dataUrl 形如 "data:image/jpeg;base64,...." 或裸 base64
 * @returns {{ url: string, bytes: number, mime: string, width: number|null, height: number|null }}
 */
export function saveImage(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) throw badRequest('缺少图片数据')

  let b64 = dataUrl
  let declaredMime = null
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (m) {
    declaredMime = m[1].toLowerCase()
    b64 = m[2]
  }
  // 去掉 base64 里的换行（某些客户端会折行）
  b64 = b64.replace(/\s+/g, '')

  let buf
  try {
    buf = Buffer.from(b64, 'base64')
  } catch {
    throw badRequest('图片 base64 解码失败')
  }
  if (!buf.length) throw badRequest('图片内容为空')

  const realType = sniffType(buf)
  if (!realType) throw badRequest('无法识别的图片格式（支持 JPEG / PNG / WebP / GIF）')
  if (declaredMime && ALLOWED[declaredMime] && declaredMime !== realType
      && !(declaredMime === 'image/jpg' && realType === 'image/jpeg')) {
    // 声明与实际不符：以实际类型为准，但记一笔便于排查
    console.warn(`[upload] 声明类型 ${declaredMime} 与实际 ${realType} 不符，按实际类型存储`)
  }

  const limit = realType === 'image/gif' ? MAX_BYTES_GIF : MAX_BYTES
  if (buf.length > limit) {
    throw new HttpError(413, `图片过大（${(buf.length / 1024 / 1024).toFixed(1)}MB，上限 ${limit / 1024 / 1024}MB）`, 'PAYLOAD_TOO_LARGE')
  }

  const dims = readDimensions(buf, realType)
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  const filename = `${hash}.${ALLOWED[realType]}`
  const filePath = join(uploadDir(), filename)

  // 内容寻址：同图重复上传直接复用，不重复落盘
  if (!existsSync(filePath)) writeFileSync(filePath, buf)

  return {
    url: `/uploads/${filename}`,
    bytes: buf.length,
    mime: realType,
    width: dims.width,
    height: dims.height,
    deduplicated: existsSync(filePath),
  }
}

/** 从字节头读尺寸（不解码整图，避免为校验付解码代价） */
function readDimensions(buf, type) {
  try {
    if (type === 'image/png') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if (type === 'image/gif') {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    if (type === 'image/jpeg') {
      let i = 2
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        // SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        const len = buf.readUInt16BE(i + 2)
        i += 2 + len
      }
    }
  } catch {
    // 尺寸读取失败不影响存储，返回 null
  }
  return { width: null, height: null }
}

/** 读取一张已存储的图片（供静态托管使用） */
export function readImage(filename) {
  // 只允许 16 位十六进制 + 白名单扩展名，杜绝路径穿越
  if (!/^[a-f0-9]{8,64}\.(jpg|png|webp|gif)$/.test(filename)) return null
  const filePath = join(uploadDir(), filename)
  if (!existsSync(filePath)) return null
  return { path: filePath, size: statSync(filePath).size }
}

/**
 * 单条笔记最多几张配图。
 * 提到这里是为了让「服务端校验」与「前端压缩目标」共用一个来源：
 * 原本 6 硬编码在 reviews.js 的 slice(0,6) 与前端默认值里，改一处会漏另一处。
 */
export const MAX_IMAGES_PER_REVIEW = 6

export const IMAGE_LIMITS = {
  maxBytes: MAX_BYTES,
  maxBytesGif: MAX_BYTES_GIF,
  allowed: Object.keys(ALLOWED),
  maxPerReview: MAX_IMAGES_PER_REVIEW,
}

void readFileSync
