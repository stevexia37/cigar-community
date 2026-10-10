#!/usr/bin/env node
/**
 * 前端 DOM 断言（轻量端到端）
 *
 * 定位：后端有 131 项契约断言，但「接口返回对了」不等于「页面把数据用对了」。
 * 本脚本用 Chrome DevTools Protocol 真正打开页面，断言关键 DOM 存在、
 * 数据被渲染出来、以及**没有控制台报错**。
 *
 * 刻意不引入 Playwright：CI 成本高、依赖体积大。这里零依赖（Node 26 全局 WebSocket
 * + 本机 Chrome headless），够覆盖「页面能不能用」这一层。
 *
 * 用法：
 *   node server/index.js &            # 先起服务
 *   node scripts/verify-ui.mjs        # 默认 http://127.0.0.1:8787
 *   CC_UI_BASE=https://host node scripts/verify-ui.mjs
 *
 * 退出码：0 = 全部通过
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.CC_UI_BASE || 'http://127.0.0.1:8787'
const PORT = Number(process.env.CC_CDP_PORT || 9224)
// 清理测试账号时需要管理员会话（口令可用环境变量覆盖）
const ADMIN_USER = process.env.CC_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.CC_ADMIN_PASSWORD || 'admin12345'
const TMP = join(ROOT, '_shots', '.verify-profile')
const TMPDIR = join(ROOT, '_shots', '.verify-tmp')

/**
 * 生成一张真实 PNG（纯色块）。
 * 手写而不是引依赖：IHDR + IDAT + IEND 三个块，crc32 用 node:zlib 现成的。
 */
function makeTestPng(width = 8, height = 8) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 2    // color type: truecolor
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3)
    raw[rowStart] = 0   // filter: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3
      // 做点渐变，避免整图纯色（顺带验证压缩不是空图）
      raw[p] = (x * 255 / width) | 0
      raw[p + 1] = (y * 255 / height) | 0
      raw[p + 2] = 0x4c
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0)
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

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

// ---------------------------------------------------------------- 断言框架
let PASS = 0
const FAILURES = []
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`

function ok(name) {
  PASS++
  console.log(`  ${c(32, '✓')} ${name}`)
}
function fail(name, detail) {
  FAILURES.push({ name, detail })
  console.log(`  ${c(31, '✗')} ${name}\n      ${String(detail).slice(0, 300)}`)
}
function assert(cond, name, detail = '') {
  if (cond) ok(name)
  else fail(name, detail || '断言为假')
}
function group(t) {
  console.log(`\n${c('1;33', `▌${t}`)}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- CDP
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

mkdirSync(join(ROOT, '_shots'), { recursive: true })
mkdirSync(TMPDIR, { recursive: true })
rmSync(TMP, { recursive: true, force: true })

const child = spawn(chromePath, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-crash-reporter', '--disable-breakpad',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${TMP}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' })

let exitCode = 0
let uname2 = ''

// 把服务端签发的年龄门 Cookie 换成"已通过"状态
async function ageCookieValue() {
  const res = await fetch(`${BASE}/api/gate/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adult: true }),
  })
  const list = res.headers.getSetCookie?.() || []
  const hit = list.find((x) => x.startsWith('cc_age='))
  return hit ? hit.split(';')[0].slice('cc_age='.length) : ''
}

async function main() {
  const version = await waitForCdp(`http://127.0.0.1:${PORT}/json/version`)
  console.log(`${c('1;36', `雪茄客 前端 DOM 断言 · ${BASE}`)}`)
  console.log(`${c(90, version.Browser)}\n`)

  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  const client = cdp(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Network.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false,
  })

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
      // 用 async IIFE：页面内求值允许 await（配合 awaitPromise 会等 Promise 结算）
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || '页面求值异常')
    return r.result.value
  }

  const goto = async (path, { gated = false } = {}) => {
    consoleErrors = []
    if (gated) {
      await client.send('Network.clearBrowserCookies')
      // 也要清 localStorage 的「本地已确认」标记：否则 AgeGate 会直接放行、
      // 不弹窗，而服务端仍按无 cookie 拒绝 —— 页面就卡在错误提示上。
      // 单清 cookie 清不出「真正的首次访问」，这个坑真实踩过。
      try {
        await evalJs('try { localStorage.removeItem("cc-age-ok") } catch (e) {} return true')
      } catch { /* 页面可能还没加载完，忽略 */ }
    } else {
      await client.send('Network.setCookie', {
        name: 'cc_age', value: await ageCookieValue(), domain: '127.0.0.1', path: '/',
      })
    }
    await client.send('Page.navigate', { url: BASE + path })
    await sleep(1500)
  }

  // 等待某个元素出现；返回是否出现
  const waitFor = async (selector, timeoutMs = 6000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const found = await evalJs(`return !!document.querySelector(${JSON.stringify(selector)})`)
      if (found) return true
      await sleep(150)
    }
    return false
  }

  const text = () => evalJs('return document.body.innerText')
  const count = (sel) => evalJs(`return document.querySelectorAll(${JSON.stringify(sel)}).length`)

  // ---------------------------------------------------------------- 年龄门
  group('年龄门（未通过时拦截全站）')
  await goto('/', { gated: true })
  assert(await waitFor('[role="dialog"]'), '首次访问弹出年龄门')
  const gateText = await text()
  assert(gateText.includes('18'), '年龄门注明 18+ 限制', gateText.slice(0, 120))
  assert(gateText.includes('我已年满 18 周岁'), '存在确认按钮')
  assert(gateText.includes('未满 18 周岁'), '存在拒绝入口')

  // 点「我已满 18 周岁」应放行
  await evalJs(`
    const btns = [...document.querySelectorAll('button')];
    const hit = btns.find(b => b.textContent.includes('我已年满 18 周岁'));
    if (hit) hit.click();
    return !!hit;
  `)
  await sleep(1200)
  const gateGone = !(await evalJs('return !!document.querySelector(\'[role="dialog"]\')'))
  assert(gateGone, '点击确认后年龄门关闭')
  assert((await text()).includes('不卖茄'), '放行后正常渲染首页内容')

  // ---------------------------------------------------------------- 首页
  group('首页')

  // 年龄门放行后必须自动重新拉数据。
  // 服务端强制年龄门后，首屏请求必然被 403 拦一次；若视图只在 onMounted 加载，
  // 用户确认年龄后界面会永远停在「请先确认已满 18 周岁」——这个回归真实发生过。
  await goto('/', { gated: true })
  // 未过门时用户看到的应当是年龄门弹窗本身。
  // 注意：api/client.js 对 AGE_GATE_REQUIRED 会静默自动重试（等用户确认后重发），
  // 所以此时页面上**不会**出现「请先确认已满」的错误文案 —— 那是内部实现细节，
  // 断言它就会锁死实现（这条断言曾因为重试机制上线而失效）。
  assert(await evalJs('return !!document.querySelector(\'[role="dialog"]\')'),
    '未过门时弹出年龄门（内容请求在静默重试）')
  await evalJs(`
    const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => x.textContent.includes('我已年满'))
    if (b) b.click()
    return !!b
  `)
  // 等自动重试把首屏数据补齐（重试间隔 1.5s × 最多 2 次）
  const recoveredText = await (async () => {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const t = await text()
      if (/在库雪茄|收录品牌/.test(t)) return t
      await sleep(400)
    }
    return text()
  })()
  assert(!/请先确认已满/.test(recoveredText), '确认年龄后不再提示年龄门')
  assert(/在库雪茄|收录品牌/.test(recoveredText), '确认年龄后首页自动重新加载出真实统计', recoveredText.slice(0, 160))

  await goto('/')
  assert(!(await evalJs('return !!document.querySelector(\'[role="dialog"]\')')), '已通过年龄门后不再弹出')
  const homeText = await text()
  assert(homeText.includes('不卖茄'), '渲染站点主张')
  // 不写死数字：从接口取真实总量再比对，否则每次扩充数据这条断言都会失效。
  // ⚠️ 必须带年龄门凭证：服务端现在会强制拦截未过门的 /api/* 请求（403 AGE_GATE_REQUIRED），
  // 用裸 fetch 会拿到 403 而不是数据（这个探针请求本身踩过）。
  const metaStats = await fetch(`${BASE}/api/meta`, {
    headers: { cookie: `cc_age=${await ageCookieValue()}` },
  }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.stats ?? null).catch(() => null)
  const expectCount = metaStats?.cigars
  assert(expectCount > 0 && homeText.includes(String(expectCount)),
    `首页展示雪茄总数（来自 /api/meta：${expectCount}）`, homeText.slice(0, 200))
  assert(homeText.includes('病害诊断') && homeText.includes('风味人格测试') && homeText.includes('醇化计算器'),
    '三个工具入口齐全')
  const homeCards = await count('a[href^="/cigars/"]')
  assert(homeCards > 0, `首页渲染雪茄卡片（${homeCards} 张）`)
  assert(consoleErrors.length === 0, '首页无控制台错误', consoleErrors.join(' | '))

  // ---------------------------------------------------------------- 数据库列表
  group('雪茄数据库（筛选 / 搜索 / URL 同步）')
  await goto('/cigars')
  const listCards = await count('a[href^="/cigars/"]')
  const TOTAL_BEFORE_SEARCH = Number((await text()).match(/共\s*(\d+)\s*支雪茄/)?.[1] ?? 0)
  assert(listCards >= 12, `列表渲染多张卡片（${listCards} 张）`)
  const listText = await text()
  const totalMatch = listText.match(/共\s*(\d+)\s*支雪茄/)
  assert(totalMatch && Number(totalMatch[1]) >= 35, `显示雪茄总数（${totalMatch?.[1] ?? '?'}）`, listText.slice(0, 160))
  assert(listText.includes('评分'), '渲染评分')
  assert(listText.includes('参考'), '笔记数标注为「参考」（种子数据诚实标注）')
  assert(consoleErrors.length === 0, '列表页无控制台错误', consoleErrors.join(' | '))

  // 搜索：输入关键词后结果应变化。
  // 注意：搜索框有 300ms 防抖 + 一次网络往返，固定 sleep 会 flaky，
  // 这里轮询等待结果集真正收窄（最多 8 秒）。
  await evalJs(`
    const input = document.querySelector('input[type="search"], input[placeholder*="搜"]');
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Cohiba');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  const narrowed = await (async () => {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const t = await text()
      const m = t.match(/共\s*(\d+)\s*支雪茄/)
      if (m && Number(m[1]) > 0 && Number(m[1]) < TOTAL_BEFORE_SEARCH) return m[0]
      await sleep(200)
    }
    return null
  })()
  assert(narrowed !== null, '搜索关键词后结果集收窄（等待防抖+请求完成）',
    (await text()).match(/共\s*\d+\s*支雪茄/)?.[0] || '(未匹配)' + narrowed)

  // 搜索词应同步到 URL
  const urlWithQuery = await evalJs('return location.search')
  assert(urlWithQuery.includes('q=Cohiba'), '搜索词同步到 URL（可分享/刷新保持）', urlWithQuery)

  // 直接带 query 打开应恢复筛选
  await goto('/cigars?q=Cohiba')
  const restored = await text()
  assert(/共\s*\d+\s*支雪茄/.test(restored), '带 query 打开可恢复筛选状态')
  assert(consoleErrors.length === 0, '筛选后无控制台错误', consoleErrors.join(' | '))

  // ---------------------------------------------------------------- 详情页
  group('雪茄详情')
  await goto('/cigars')
  const firstHref = await evalJs(`
    const a = document.querySelector('a[href^="/cigars/"]');
    return a ? a.getAttribute('href') : '';
  `)
  await goto(firstHref)
  const detailText = await text()
  assert(detailText.includes('参考估算价') || detailText.includes('非交易报价'),
    '详情页标注价格性质（参考价而非报价）')
  assert(/养护|湿度|湿度建议/.test(detailText), '渲染养护建议')
  assert(detailText.includes('风味'), '渲染风味标签')
  assert(consoleErrors.length === 0, '详情页无控制台错误', consoleErrors.join(' | '))

  // ---------------------------------------------------------------- 工具页
  group('工具页')
  await goto('/tools/diagnostic')
  let qButtons = await count('button')
  assert(qButtons >= 4, `诊断页渲染选项按钮（${qButtons} 个）`)
  assert((await text()).includes('你看到了什么'), '诊断第一题来自服务端')
  assert(consoleErrors.length === 0, '诊断页无控制台错误', consoleErrors.join(' | '))

  await goto('/tools/flavor-test')
  assert((await count('button')) >= 4, '风味测试渲染选项')
  assert(consoleErrors.length === 0, '风味测试页无控制台错误', consoleErrors.join(' | '))

  await goto('/tools/aging-calc')
  const agingText = await text()
  assert(/浓郁度|雪茄/.test(agingText), '醇化计算器渲染表单')
  const agingInputs = (await count('input')) + (await count('select'))
  assert(agingInputs > 0, `醇化计算器含输入控件（${agingInputs} 个）`)
  assert(consoleErrors.length === 0, '醇化计算器无控制台错误', consoleErrors.join(' | '))

  // ---------------------------------------------------------------- 空态与静态内容
  group('空态与静态内容')
  await goto('/reviews')
  const reviewsText = await text()
  assert(/暂无|还没有|第一篇|空空/.test(reviewsText), '笔记为空时显示引导空态', reviewsText.slice(0, 160))
  assert(consoleErrors.length === 0, '笔记页无控制台错误', consoleErrors.join(' | '))

  await goto('/guide/plume-vs-mold')
  assert((await text()).length > 800, '起灰vs发霉长文渲染成功')
  assert(consoleErrors.length === 0, '指南页无控制台错误', consoleErrors.join(' | '))

  await goto('/about')
  const aboutText = await text()
  assert(aboutText.includes('18'), '关于页含年龄限制')
  assert(/不售|不卖|不提供/.test(aboutText), '关于页含不售烟草声明')
  assert(consoleErrors.length === 0, '关于页无控制台错误', consoleErrors.join(' | '))

  await goto('/login')
  assert(await waitFor('input'), '登录页渲染表单')
  assert(consoleErrors.length === 0, '登录页无控制台错误', consoleErrors.join(' | '))

  group('图片上传（客户端压缩 → 上传 → 展示）')
  // 现场注册一个用户拿到会话，才能进「写品吸笔记」页
  const imgUser = `imgui${Date.now().toString().slice(-8)}`
  // 带年龄门凭证：服务端强制年龄门后，不带 cc_age 的注册会被 403 拦下
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `cc_age=${await ageCookieValue()}` },
    body: JSON.stringify({ username: imgUser, password: 'ImgUiPass12345' }),
  })
  const imgCookie = (regRes.headers.getSetCookie?.() || []).find((x) => x.startsWith('cc_sid='))
  assert(regRes.status === 201 && !!imgCookie, `注册测试用户（${imgUser}）`, `HTTP ${regRes.status}`)

  await client.send('Network.setCookie', {
    name: 'cc_sid', value: imgCookie.split(';')[0].slice('cc_sid='.length), domain: '127.0.0.1', path: '/',
  })

  await goto('/reviews/new?cigarId=1')
  assert(await waitFor('input[type="file"]'), '笔记表单渲染图片选择入口')

  // 造一张真实 PNG 写到磁盘，再用 CDP 的 DOM.setFileInputFiles 注入 file input。
  // 不能用 DataTransfer：Chrome 下程序化赋值会被丢弃（实测 input.files.length === 0），
  // 那是浏览器安全限制，不是代码问题。
  const pngPath = join(TMPDIR, 'verify-upload.png')
  writeFileSync(pngPath, makeTestPng(800, 600))

  await client.send('DOM.enable')
  const doc = await client.send('DOM.getDocument', { depth: -1 })
  const nodeRes = await client.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  })
  if (!nodeRes.nodeId) throw new Error('未找到文件选择输入框')
  await client.send('DOM.setFileInputFiles', { files: [pngPath], nodeId: nodeRes.nodeId })
  assert(true, `已注入测试图片（${(makeTestPng(800, 600).length / 1024).toFixed(1)}KB PNG）`)

  // 等 canvas 压缩完成（800px 图压缩很快，给 3 秒余量）
  const thumbAppeared = await (async () => {
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      const n = await evalJs('return document.querySelectorAll(\'img[src^="data:image"]\').length')
      if (n > 0) return n
      await sleep(200)
    }
    return 0
  })()
  assert(thumbAppeared > 0, '选择图片后生成压缩预览缩略图', `找到 ${thumbAppeared} 张`)

  const compressed = await evalJs(`
    const img = document.querySelector('img[src^="data:image"]');
    if (!img) return null;
    const b64 = img.getAttribute('src').split(',')[1] || '';
    return { dataUrlKb: Math.round(img.getAttribute('src').length / 1024), approxBytes: Math.round(b64.length * 0.75) };
  `)
  assert(compressed && compressed.approxBytes > 1000 && compressed.approxBytes < 2 * 1024 * 1024,
    '压缩结果落在合理区间（1KB – 2MB）', JSON.stringify(compressed))

  assert(consoleErrors.length === 0, '图片选择过程无控制台错误', consoleErrors.join(' | '))

  group('404 与 SPA 回退')
  await goto('/this-page-does-not-exist')
  const nfText = await text()
  assert(/不存在|找不到|404/.test(nfText), '未知路径显示 404 页面', nfText.slice(0, 120))
  assert(consoleErrors.length === 0, '404 页无控制台错误', consoleErrors.join(' | '))

  await goto('/cigars/999999')
  assert(/未找到|不存在/.test(await text()), '不存在的雪茄显示友好错误（非白屏）')

  // 收尾：停用本次注册的测试账号，避免长期跑测试污染开发库
  // （停用会连带清除其会话；管理员账号不可被停用，所以只处理 user 角色）
  await cleanupTestUsers([imgUser, uname2].filter(Boolean))

  client.close()
}

/** 用账号口令换会话 Cookie（本脚本内的清理需要管理员身份） */
async function loginCookie(username, password) {
  // 登录接口也在年龄门之内（只有已登录会话与少数状态接口豁免），
  // 所以这里必须带上 cc_age，否则拿到 403 而不是会话
  const ageCookie = await ageCookieValue()
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `cc_age=${ageCookie}` },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`登录失败：HTTP ${res.status}`)
  const list = res.headers.getSetCookie?.() || []
  const hit = list.find((x) => x.startsWith('cc_sid='))
  if (!hit) throw new Error('登录响应未下发会话 Cookie')
  return hit.split(';')[0].slice('cc_sid='.length)
}

/** 用管理员身份把测试账号停用 */
async function cleanupTestUsers(usernames) {
  if (!usernames.length) return
  try {
    const adminSid = await loginCookie(ADMIN_USER, ADMIN_PASS)
    const list = await fetch(`${BASE}/api/admin/users?pageSize=100`, {
      headers: { cookie: `cc_sid=${adminSid}` },
    }).then((r) => r.json())
    for (const u of list.items || []) {
      if (!usernames.includes(u.username)) continue
      const res = await fetch(`${BASE}/api/admin/users/${u.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `cc_sid=${adminSid}` },
        body: JSON.stringify({ status: 0 }),
      })
      if (res.ok) console.log(`  ${c(90, `· 已停用测试账号 ${u.username}`)}`)
    }
  } catch (err) {
    console.log(`  ${c(33, `· 清理测试账号失败（不影响结果）：${err.message}`)}`)
  }
}

try {
  await main()
} catch (err) {
  console.error(`\n${c(31, '断言执行中断：')} ${err.message}`)
  exitCode = 1
} finally {
  child.kill('SIGKILL')
  rmSync(TMP, { recursive: true, force: true })
  rmSync(TMPDIR, { recursive: true, force: true })
}

console.log(`\n${c('1;36', '────────────────────────────────────')}`)
console.log(`  通过 ${c(32, PASS)} · 失败 ${c(FAILURES.length ? 31 : 32, FAILURES.length)}`)
if (FAILURES.length) {
  console.log('\n  失败项：')
  for (const f of FAILURES) console.log(`    · ${f.name}`)
  console.log(`\n${c(31, '  ✗ 前端断言未通过')}`)
  process.exit(1)
}
if (exitCode === 0) console.log(`\n${c(32, '  ✓ 前端断言全部通过')}`)
process.exit(exitCode)
