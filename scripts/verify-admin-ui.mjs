#!/usr/bin/env node
/**
 * 管理后台前端断言（真实浏览器）
 *
 * 为什么单独成文件：管理后台是权限敏感区域，「接口对了」不等于「界面能用」，
 * 更不等于「普通人进不去」。这里同时验证三件事：
 *   1. 管理员能进、页面渲染出真实的队列数据
 *   2. 未登录访问被重定向到登录页（而不是白屏或 500）
 *   3. 普通用户访问被挡（不显示管理界面）
 *
 * 用法：
 *   node server/index.js &
 *   node scripts/verify-admin-ui.mjs
 * 退出码：0 = 全部通过
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.CC_UI_BASE || 'http://127.0.0.1:8787'
const PORT = Number(process.env.CC_CDP_PORT || 9225)
const TMP = join(ROOT, '_shots', '.verify-admin-profile')

const ADMIN_USER = process.env.CC_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.CC_ADMIN_PASSWORD || 'admin12345'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('未找到 Chrome/Chromium，无法执行前端断言')
  process.exit(1)
}

let PASS = 0
const FAILURES = []
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`

const ok = (name) => { PASS++; console.log(`  ${c(32, '✓')} ${name}`) }
const fail = (name, detail) => {
  FAILURES.push({ name, detail })
  console.log(`  ${c(31, '✗')} ${name}\n      ${String(detail).slice(0, 300)}`)
}
const assert = (cond, name, detail = '') => (cond ? ok(name) : fail(name, detail || '断言为假'))
const group = (t) => console.log(`\n${c('1;33', `▌${t}`)}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function waitForCdp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch { /* 未就绪 */ }
    await sleep(250)
  }
  throw new Error(`CDP 未在 ${timeoutMs}ms 内就绪`)
}

/** 用真实接口登录，把返回的会话 Cookie 灌进浏览器 */
async function loginCookie(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`登录失败：HTTP ${res.status}`)
  const list = res.headers.getSetCookie?.() || []
  const sid = list.find((x) => x.startsWith('cc_sid='))
  if (!sid) throw new Error('登录响应未下发会话 Cookie')
  return sid.split(';')[0].slice('cc_sid='.length)
}

const ageCookie = async () => {
  const res = await fetch(`${BASE}/api/gate/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adult: true }),
  })
  const list = res.headers.getSetCookie?.() || []
  const hit = list.find((x) => x.startsWith('cc_age='))
  return hit ? hit.split(';')[0].slice('cc_age='.length) : ''
}

mkdirSync(join(ROOT, '_shots'), { recursive: true })
rmSync(TMP, { recursive: true, force: true })

const child = spawn(chromePath, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-crash-reporter', '--disable-breakpad',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${TMP}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' })

let exitCode = 0

async function main() {
  const version = await waitForCdp(`http://127.0.0.1:${PORT}/json/version`)
  console.log(`${c('1;36', `管理后台前端断言 · ${BASE}`)}`)
  console.log(`${c(90, version.Browser)}\n`)

  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  const client = cdp(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Network.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })

  let consoleErrors = []
  client.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      consoleErrors.push(d.exception?.description || d.text || '未知异常')
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text)
    }
  })

  const evalJs = async (expression) => {
    const r = await client.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || '页面求值异常')
    return r.result.value
  }

  const setCookie = async (name, value) => {
    await client.send('Network.setCookie', { name, value, domain: '127.0.0.1', path: '/' })
  }

  const clearCookies = () => client.send('Network.clearBrowserCookies')

  const goto = async (path) => {
    consoleErrors = []
    await client.send('Page.navigate', { url: BASE + path })
    await sleep(1600)
  }

  const bodyText = () => evalJs('return document.body.innerText')

  // ---------------------------------------------------------------- 未登录
  group('未登录访问管理后台')
  await clearCookies()
  await setCookie('cc_age', await ageCookie())
  await goto('/admin/overview')
  const anonText = await bodyText()
  assert(await evalJs('return location.pathname'), '被重定向到登录页', `实际路径 ${await evalJs('return location.pathname')}`)
  assert(!anonText.includes('运营概览') && !anonText.includes('待处理'), '未登录看不到管理界面内容')
  assert(consoleErrors.length === 0, '未登录重定向无控制台错误', consoleErrors.join(' | '))

  // ---------------------------------------------------------------- 管理员
  group('管理员访问')
  const adminSid = await loginCookie(ADMIN_USER, ADMIN_PASS)
  await clearCookies()
  await setCookie('cc_age', await ageCookie())
  await setCookie('cc_sid', adminSid)

  await goto('/admin/overview')
  const pathAfterLogin = await evalJs('return location.pathname')
  assert(pathAfterLogin.includes('/admin'), '管理员可进入管理后台（未被重定向）', pathAfterLogin)

  const overview = await bodyText()
  assert(overview.includes('待处理'), '概览渲染「待处理」区块')
  assert(overview.includes('待审核笔记'), '概览显示笔记待审项')
  assert(overview.includes('待审批投稿'), '概览显示投稿待审项')
  assert(overview.includes('站点数据'), '概览渲染站点总量')
  assert(overview.includes('内容缺口'), '概览渲染内容缺口（可执行的运营待办）')
  assert(/管理员/.test(overview), '标识当前角色')
  assert(consoleErrors.length === 0, '概览页无控制台错误', consoleErrors.join(' | '))

  await goto('/admin/reviews')
  const reviewsText = await bodyText()
  assert(await evalJs('return document.body.innerText.length') > 100, '笔记审核页有内容')
  assert(/待审核|已发布|已驳回/.test(reviewsText), '笔记审核页有状态筛选')
  assert(consoleErrors.length === 0, '笔记审核页无控制台错误', consoleErrors.join(' | '))

  await goto('/admin/submissions')
  const subsText = await bodyText()
  assert(/待审批|已通过|已驳回/.test(subsText), '投稿审批页有状态筛选')
  assert(consoleErrors.length === 0, '投稿审批页无控制台错误', consoleErrors.join(' | '))

  await goto('/admin/audit-log')
  assert((await bodyText()).includes('摘要会截断'), '审核日志页有说明文案')
  assert(consoleErrors.length === 0, '审核日志页无控制台错误', consoleErrors.join(' | '))

  await goto('/admin/users')
  const usersText = await bodyText()
  assert(usersText.length > 50, '用户管理页渲染')
  assert(/用户名/.test(usersText) && /角色/.test(usersText), '用户管理页有表头')
  assert(usersText.includes('停用') || usersText.includes('启用'), '用户管理页有启停操作')
  assert(consoleErrors.length === 0, '用户管理页无控制台错误', consoleErrors.join(' | '))

  // ---------------------------------------------------------------- 普通用户
  group('普通用户访问管理后台（必须被挡）')
  // 现场注册一个普通用户
  const uname = `vadmin${Date.now().toString().slice(-8)}`
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: uname, password: 'VerifyPass12345' }),
  })
  assert(reg.status === 201, `注册测试用户（${uname}）`, `HTTP ${reg.status}`)
  const regCookie = (reg.headers.getSetCookie?.() || []).find((x) => x.startsWith('cc_sid='))

  await clearCookies()
  await setCookie('cc_age', await ageCookie())
  await setCookie('cc_sid', regCookie.split(';')[0].slice('cc_sid='.length))

  await goto('/admin/overview')
  const normalPath = await evalJs('return location.pathname')
  const normalText = await bodyText()
  assert(!normalPath.includes('/admin'), '普通用户无法停留在管理后台', `实际路径 ${normalPath}`)
  assert(!normalText.includes('待审批投稿'), '普通用户看不到管理数据')

  // ---------------------------------------------------------------- 头部入口
  group('导航入口可见性')
  await clearCookies()
  await setCookie('cc_age', await ageCookie())
  await setCookie('cc_sid', adminSid)
  await goto('/')
  assert((await bodyText()).includes('管理后台'), '管理员在站点导航看到「管理后台」入口')

  await clearCookies()
  await setCookie('cc_age', await ageCookie())
  await setCookie('cc_sid', regCookie.split(';')[0].slice('cc_sid='.length))
  await goto('/')
  assert(!(await bodyText()).includes('管理后台'), '普通用户看不到「管理后台」入口')

  client.close()
}

try {
  await main()
} catch (err) {
  console.error(`\n${c(31, '断言执行中断：')} ${err.message}`)
  exitCode = 1
} finally {
  child.kill('SIGKILL')
  rmSync(TMP, { recursive: true, force: true })
}

console.log(`\n${c('1;36', '────────────────────────────────────')}`)
console.log(`  通过 ${c(32, PASS)} · 失败 ${c(FAILURES.length ? 31 : 32, FAILURES.length)}`)
if (FAILURES.length) {
  console.log('\n  失败项：')
  for (const f of FAILURES) console.log(`    · ${f.name}`)
  console.log(`\n${c(31, '  ✗ 管理后台断言未通过')}`)
  process.exit(1)
}
if (exitCode === 0) console.log(`\n${c(32, '  ✓ 管理后台断言全部通过')}`)
process.exit(exitCode)
