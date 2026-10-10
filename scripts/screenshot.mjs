#!/usr/bin/env node
/**
 * 【开发辅助】用 Chrome DevTools Protocol 给正在运行的站点截图。
 *
 * 为什么需要：后端有 131 项接口断言，但「接口对了」不等于「页面能看」。
 * 这个脚本零依赖（Node 26 的全局 WebSocket + 本机 Chrome 的 --headless），
 * 用来做视觉回归检查。
 *
 * 用法：
 *   node server/index.js &                        # 先起服务
 *   node scripts/screenshot.mjs                   # 默认截首页
 *   node scripts/screenshot.mjs /cigars /tools/diagnostic
 *
 * 产物：_shots/<slug>.png
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.CC_SHOT_BASE || 'http://127.0.0.1:8787'
const OUT_DIR = join(ROOT, '_shots')
const PORT = Number(process.env.CC_CDP_PORT || 9223)

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('未找到 Chrome/Chromium，无法截图。已查找：')
  for (const p of CHROME_CANDIDATES) console.error('  -', p)
  process.exit(1)
}

const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// --gated：不注入年龄门 Cookie，用于验证年龄门拦截本身
const GATED = process.argv.includes('--gated')
// --as-admin：以管理员身份登录后再截图（管理后台需要会话）
const AS_ADMIN = process.argv.includes('--as-admin')
if (paths.length === 0) paths.push('/')

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[/?=&]+/g, '-').slice(0, 60))

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const listeners = new Set()

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method) {
      for (const fn of listeners) fn(msg)
    }
  })

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('CDP 连接失败')))
  })

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    on(fn) { listeners.add(fn) },
    close() { ws.close() },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForCdp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch { /* 还没起来 */ }
    await sleep(250)
  }
  throw new Error(`CDP 未在 ${timeoutMs}ms 内就绪：${url}`)
}

mkdirSync(OUT_DIR, { recursive: true })
const profile = join(OUT_DIR, '.chrome-profile')
rmSync(profile, { recursive: true, force: true })

const child = spawn(chromePath, [
  '--headless=new',
  // 在受限沙箱里 Chrome 会 Trace/BPT trap 崩溃，必须关掉它自己的沙箱
  '--no-sandbox',
  '--disable-dev-shm-usage',
  // 屏蔽 Crashpad 写 ~/Library 被拒的噪音日志
  '--disable-crash-reporter',
  '--disable-breakpad',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--disable-features=Translate,BackForwardCache',
  'about:blank',
], { stdio: 'ignore', detached: false })

let exitCode = 0
const report = []

try {
  const version = await waitForCdp(`http://127.0.0.1:${PORT}/json/version`)
  console.log(`Chrome ${version.Browser}`)

  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  const client = cdp(target.webSocketDebuggerUrl)
  await client.ready

  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Log.enable')

  // 收集控制台错误与未捕获异常 —— 这才是「页面能不能用」的关键信号
  const consoleErrors = []
  client.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      consoleErrors.push(d.exception?.description || d.text || '未知异常')
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text)
    }
  })

  // Cookie 必须在进入循环前准备好：
  //   · 管理员会话取一次复用（每轮重取既慢又容易出现「首轮还没拿到就导航」）
  //   · 年龄门 Cookie 同理
  // 踩过的坑：把 adminCookie() 放在循环内首次迭代之后，导致第一页 100% 截到登录页。
  const ageSid = GATED ? '' : await ageCookie()
  const adminSid = AS_ADMIN ? await adminCookie() : ''
  if (AS_ADMIN && !adminSid) console.warn('  ⚠ 未取得管理员会话，管理页截图会显示登录页')

  for (const viewport of VIEWPORTS) {
    for (const p of paths) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 2,
        mobile: viewport.mobile,
      })
      await client.send('Network.enable').catch(() => {})

      if (GATED) {
        // 验证年龄门本身：每次清空 Cookie，且不注入任何凭证
        await client.send('Network.clearBrowserCookies').catch(() => {})
      } else {
        await client.send('Network.setCookie', {
          name: 'cc_age', value: ageSid, domain: '127.0.0.1', path: '/',
        }).catch(() => {})
        if (adminSid) {
          await client.send('Network.setCookie', {
            name: 'cc_sid', value: adminSid, domain: '127.0.0.1', path: '/',
          }).catch(() => {})
        }
      }

      consoleErrors.length = 0
      await client.send('Page.navigate', { url: BASE + p })
      await sleep(1800)   // 等首屏请求与懒加载 chunk

      const title = await client.send('Runtime.evaluate', {
        expression: 'document.title', returnByValue: true,
      }).then((r) => r.result.value)

      const bodyLen = await client.send('Runtime.evaluate', {
        expression: 'document.body.innerText.trim().length', returnByValue: true,
      }).then((r) => r.result.value)

      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const file = join(OUT_DIR, `${slug(p)}.${viewport.name}.png`)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))

      const errCount = consoleErrors.length
      report.push({ path: p, viewport: viewport.name, title, bodyLen, errors: errCount, file: file.replace(ROOT + '/', '') })
      const flag = errCount > 0 ? '⚠' : '✓'
      console.log(`  ${flag} ${p} [${viewport.name}] ${bodyLen} 字 · ${title} · 控制台错误 ${errCount}`)
      for (const e of consoleErrors.slice(0, 3)) console.log(`      ${e.split('\n')[0].slice(0, 160)}`)
      if (errCount > 0) exitCode = 1
    }
  }
  client.close()
} catch (err) {
  console.error('截图失败：', err.message)
  exitCode = 1
} finally {
  child.kill('SIGKILL')
  rmSync(profile, { recursive: true, force: true })
}

// 用真实接口换一个合法的年龄门 Cookie（签名由服务端生成）
async function ageCookie() {
  const res = await fetch(`${BASE}/api/gate/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adult: true }),
  })
  const setCookie = res.headers.getSetCookie?.() || []
  const hit = setCookie.find((c) => c.startsWith('cc_age='))
  return hit ? hit.split(';')[0].slice('cc_age='.length) : ''
}

/** 以管理员身份登录，返回会话 Cookie 值（供管理后台截图使用） */
async function adminCookie() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: process.env.CC_ADMIN_USER || 'admin',
      password: process.env.CC_ADMIN_PASSWORD || 'admin12345',
    }),
  })
  if (!res.ok) {
    console.warn(`  ⚠ 管理员登录失败（HTTP ${res.status}），管理页截图将显示登录页`)
    return ''
  }
  const list = res.headers.getSetCookie?.() || []
  const hit = list.find((c) => c.startsWith('cc_sid='))
  return hit ? hit.split(';')[0].slice('cc_sid='.length) : ''
}

console.log(`\n产物目录：${OUT_DIR.replace(ROOT + '/', '')}/`)
writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
process.exit(exitCode)
