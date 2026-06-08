# 雪茄客 · 零成本 Serverless 上线指南

> 域名：cigar.hair ｜ 预算：¥0 ｜ 架构：Cloudflare Pages + Supabase

---

## 目录

1. [架构总览](#一架构总览)
2. [第一部分：代码上云与 Serverless 数据库](#第一部分代码上云与-serverless-数据库)
3. [第二部分：域名绑定与免费 SSL](#第二部分域名绑定与免费-ssl)
4. [第三部分：Cloudflare 安全防线与 Age Gate](#第三部分cloudflare-安全防线与-age-gate)
5. [附录：故障排查与回滚](#附录故障排查与回滚)

---

## 一、架构总览

```
┌─ 用户 ─────────────────────────────┐
│ 浏览器输入 cigar.hair              │
└──────────┬─────────────────────────┘
           │ DNS 解析至 Cloudflare
           ▼
┌─ Cloudflare ────────────────────────┐
│  ✓ 五秒盾 (Under Attack Mode)      │
│  ✓ WAF 规则拦截恶意请求            │
│  ✓ Turnstile 验证码                 │
│  ✓ Edge Functions (Age Gate)        │
└──────────┬─────────────────────────┘
           │ 回源至 Cloudflare Pages
           ▼
┌─ Cloudflare Pages ──────────────────┐
│  ✓ Vue3 前端静态文件               │
│  ✓ Functions (API 路由)            │
│  ✓ 自动 HTTPS (Let's Encrypt)      │
│  ✓ 全球 CDN 边缘缓存               │
└──────────┬─────────────────────────┘
           │ 数据库查询
           ▼
┌─ Supabase (Free Tier) ─────────────┐
│  ✓ PostgreSQL 500MB                │
│  ✓ 自动备份                        │
│  ✓ Row Level Security              │
│  ✓ Edge Functions 可选              │
└────────────────────────────────────┘
```

**为什么选 Cloudflare Pages + Supabase？**

| 对比项 | Cloudflare Pages | Vercel | Netlify |
|---|---|---|---|
| 免费带宽 | **无限** | 100 GB/月 | 100 GB/月 |
| 免费构建 | **500 次/月** | 6000 分/月 | 300 分/月 |
| 全球节点 | **330+ 城市** | 100+ | 6 个 |
| 边缘函数 | 10 万次/天免费 | 100 GB-小时/月 | 125k 请求/月 |
| CF WAF 集成 | **原生（同一面板）** | 另配 | 另配 |
| **结论** | ✅ **最佳选择** | 次选 | 次选 |

---

## 第一部分：代码上云与 Serverless 数据库

### 1.1 本地代码 → GitHub 仓库（只需 3 分钟）

#### 步骤 1：安装 GitHub Desktop

1. 访问 https://desktop.github.com/ 下载并安装
2. 登录你的 GitHub 账号（如无账号，去 https://github.com 免费注册）

#### 步骤 2：创建仓库并推送代码

```bash
# 打开 PowerShell（在 D:\雪茄知识开发 目录下执行）

# 初始化 Git 仓库（如果尚未初始化）
git init

# 创建 .gitignore（排除 node_modules 等）
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.local
.DS_Store
EOF

# 添加所有文件到暂存区
git add -A

# 第一次提交
git commit -m "🎬 初始提交：雪茄客社区 v1.0"

# 在 GitHub 网页端创建一个新仓库（不要勾选 README）
# 命名为：cigar-community

# 关联远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/cigar-community.git

# 推送到 GitHub
git push -u origin main
```

> **可视化替代方案：** 打开 GitHub Desktop → File → Add Local Repository → 选择 `D:\雪茄知识开发` → 点击 "Publish repository" → 去掉 "Keep this code private"（需公开才能用免费计划）→ 点击 Publish。

#### 步骤 3：验证仓库

浏览器打开 `https://github.com/YOUR_USERNAME/cigar-community`，确认所有文件已上传。

---

### 1.2 连接 Cloudflare Pages（自动部署）

#### 步骤 1：注册 Cloudflare 账号

1. 访问 https://dash.cloudflare.com/sign-up 注册
2. 在右上角点击 **Add site** → 输入 `cigar.hair` → 选择 **Free plan**

#### 步骤 2：接入域名

Cloudflare 会扫描你当前的 DNS 记录。扫描完成后，会给出两个 Cloudflare 的 nameserver 地址（类似 `dora.ns.cloudflare.com` 和 `mateo.ns.cloudflare.com`）。

**去你的域名注册商后台（如 Namesilo / GoDaddy / 阿里云）：**
- 找到 DNS 管理 / Nameserver 设置
- 将当前 nameserver 替换为 Cloudflare 给出的那两条
- 保存后等待 1-24 小时生效（通常 10 分钟内）

#### 步骤 3：部署 Cloudflare Pages

```yaml
操作路径: Cloudflare 面板 → Workers 和 Pages → Pages → 连接到 Git

1. 点击 "连接到 Git" → 授权 GitHub 账号
2. 选择仓库: cigar-community
3. 构建配置:
   框架预设: Vue
   构建命令: npm run build
   构建输出目录: dist
   环境变量 (高级):
      VITE_SUPABASE_URL = https://xxxxxxxxx.supabase.co
      VITE_SUPABASE_ANON_KEY = xxxxxxxxxxxxxx
4. 点击 "保存并部署"
```

部署完成后，Cloudflare Pages 会生成一个 `xxxxx.pages.dev` 的临时域名。

#### 步骤 4：配置自动部署

每次你 `git push` 到 GitHub，Cloudflare Pages 会自动重新构建并部署——**从此不需要手动操作**。

```bash
# 日常更新流程（在本地修改代码后）
git add -A
git commit -m "更新内容"
git push

# Cloudflare Pages 检测到 push → 自动构建 → 自动部署（约 1-2 分钟）
```

---

### 1.3 Serverless 数据库：Supabase（免费 PostgreSQL）

#### 步骤 1：创建 Supabase 项目

1. 访问 https://supabase.com/ → 点击 **Start your project**
2. 用 GitHub 账号登录
3. 点击 **New project**
4. 填写：

| 字段 | 值 |
|---|---|
| Name | `cigar-community` |
| Database Password | **生成一个强密码并保存到密码管理器** |
| Region | `Singapore`（亚太地区，离中国最近） |
| Pricing Plan | **Free**（免费额度：500MB 数据库、5GB 带宽、5 万月活用户） |

点击 **Create new project**，等待 2-3 分钟创建完成。

#### 步骤 2：导入数据库表结构

项目创建完成后：

1. 左侧菜单 → **SQL Editor**
2. 点击 **New Query**
3. 复制粘贴 `database/schema.sql` 的完整内容
4. 点击 **Run** 执行

Supabase 的 PostgreSQL 完全兼容我们的 MySQL schema（需要做少量语法调整）。但我已经有兼容版本：

```sql
-- 在 Supabase SQL Editor 中执行 database/schema.sql 即可
-- Supabase 使用 pgSQL，需要将以下 MySQL 特有语法做转换：
--   `cigar_products` → "cigar_products"（或者直接用未引用的标识符）
--   AUTO_INCREMENT → GENERATED ALWAYS AS IDENTITY
--   ENGINE=InnoDB → 删除此行
--   CHARSET=utf8mb4 → 删除此行
--   TINYINT(1) → BOOLEAN
--   DATETIME → TIMESTAMPTZ
```

#### 步骤 3：获取连接凭据

1. 左侧菜单 → **Project Settings** → **API**
2. 记录两个值：

```
Supabase URL:     https://xxxxxxxxxxxxxx.supabase.co
Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
```

#### 步骤 4：配置前端环境变量

在 Cloudflare Pages 项目设置中，添加环境变量：

```
操作路径: Cloudflare 面板 → Workers 和 Pages → 你的项目 → 设置 → 环境变量

添加以下变量（生产环境）:
  VITE_SUPABASE_URL     = https://xxxxxxxxxxxxxx.supabase.co
  VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
```

然后点击 **保存并重新部署**。

#### 步骤 5：在前端代码中连接 Supabase

在 `cigar-filter` 项目中安装 Supabase 客户端：

```bash
cd "D:\雪茄知识开发\cigar-filter"
npm install @supabase/supabase-js
```

创建 `src/lib/supabase.js`：

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 示例：查询雪茄数据
export async function getCigars(filters = {}) {
  let query = supabase.from('cigar_products').select('*')

  if (filters.origin) {
    query = query.eq('origin_type', filters.origin)
  }
  if (filters.strength) {
    query = query.eq('strength', filters.strength)
  }

  const { data, error } = await query.limit(50)
  if (error) throw error
  return data
}
```

**Supabase Free Tier 额度（够用吗？）：**

| 资源 | Free 额度 | 雪茄社区预估用量 | 结论 |
|---|---|---|---|
| 数据库存储 | 500 MB | ~50 MB（200款雪茄+笔记） | ✅ 足够 |
| 月活跃用户 | 50,000 | 初期 < 2,000 | ✅ 足够 |
| 数据库请求 | 无限制 | — | ✅ 足够 |
| 带宽 | 5 GB/月 | ~2 GB（图片在 CF Pages） | ✅ 足够 |
| 备份 | 7 天 PITR | 7 天内可回滚 | ✅ 足够 |

---

## 第二部分：域名绑定与免费 SSL

### 2.1 在 Cloudflare Pages 绑定自定义域名

```yaml
操作路径: Cloudflare 面板 → Workers 和 Pages → 你的项目 → 自定义域

1. 点击 "设置自定义域"
2. 输入: cigar.hair
3. 点击 "继续"

Cloudflare 会自动检测该域名是否已在你的账号中。
如果是 → 自动添加 CNAME 记录
如果否 → 提示你需要先将域名添加到 Cloudflare（参见 1.2 节步骤 2）

CNAME 记录将自动创建（无需手动操作）:
  类型: CNAME
  名称: @
  目标: cigar-community.pages.dev
  代理状态: 橙色云朵（Proxied）= 已开启
```

### 2.2 DNS 记录一览

Cloudflare 会自动创建以下所有记录。万一需要手动核对：

| 类型 | 名称 | 值 | 代理 |
|---|---|---|---|
| **CNAME** | `@` | `cigar-community.pages.dev` | ☁️ Proxied |
| **CNAME** | `www` | `cigar-community.pages.dev` | ☁️ Proxied |
| **CNAME** | `api` | `cigar-community.pages.dev` | ☁️ Proxied |
| **TXT** | `@` | `v=spf1 include:_spf.cloudflare.com ~all` | — |
| **AAAA** | `@` | Cloudflare 自动优化（IPv6） | ☁️ Proxied |

### 2.3 免费 SSL 证书：完全自动化

**你不需要做任何操作。** Cloudflare 会自动：

1. **边缘证书（Edge Certificate）：** Cloudflare 为所有代理域名自动签发泛域名 SSL 证书，覆盖 `cigar.hair` 和 `*.cigar.hair`
2. **源服务器证书（Origin Certificate）：** Cloudflare Pages 内建自动 HTTPS，源站通信也走 TLS
3. **证书自动续期：** 永不过期，无需人工干预

```yaml
验证 SSL 状态:
  Cloudflare 面板 → SSL/TLS → 概述
  应显示:
    - SSL 状态: 完整（Full）
    - 证书类型: 通用（Universal）
    - 边缘证书: 有效

你也可以用浏览器访问 https://cigar.hair 并点击地址栏的锁图标查看证书。
```

### 2.4 强制 HTTPS

```yaml
操作路径: Cloudflare 面板 → SSL/TLS → 边缘证书

确保以下开关全部开启:
  ✅ 始终使用 HTTPS          （自动将 HTTP 请求重定向到 HTTPS）
  ✅ 自动 HTTPS 重写         （修正页面中 HTTP 资源链接为 HTTPS）
  ✅ HSTS 开启（设为以下值）:
     最大有效期: 12 个月
     包含子域名: 开启
     预加载: 暂不开启（观察一段时间后再开启）
```

---

## 第三部分：Cloudflare 安全防线与 Age Gate

### 3.1 五秒盾（Under Attack Mode）

> 只在网站被 DDoS 攻击或恶意刷流量时开启，平时关闭。

```yaml
开启方式:
  Cloudflare 面板 → 安全性 → 设置 → 安全级别

  正常情况:  安全级别设为 "中"
  攻击期间:  安全级别设为 "I'm Under Attack!"
    - 所有访客在访问前会看到 5 秒挑战页面
    - 通过挑战后 Cookie 有效 5 分钟——正常用户基本无感知
    - 自动化脚本会被完全拦截

启用自动触发（推荐）:
  同一页面 → 下拉找到 "高级" → 开启 "速率限制":
    规则 1: 匹配 /api/auth/register
            阈值: 每分钟 5 次
            操作: 阻止 1 小时
    规则 2: 匹配 /api/*
            阈值: 每分钟 100 次
            操作: 阻止 15 分钟
```

### 3.2 Web 应用防火墙（WAF 免费规则）

```yaml
操作路径: Cloudflare 面板 → 安全性 → WAF → 自定义规则

添加 5 条免费规则:

规则 1: 阻止恶意爬虫
  字段: User Agent
  运算符: 包含
  值: "python-requests|curl|wget|scrapy|Go-http"
  操作: 阻止
  描述: 封禁常见爬虫框架

规则 2: 阻止敏感路径
  字段: URI 路径
  运算符: 包含
  值: ".env|wp-admin|xmlrpc|wp-login|artisan"
  操作: 阻止
  描述: 扫描者常用路径

规则 3: 注册接口限速
  字段: URI 路径
  运算符: 等于
  值: "/api/auth/register"
  操作: 速率限制（5 次/分钟，阻止 60 分钟）
  描述: 防恶意注册

规则 4: 禁止第三方域名引用（防盗刷）
  字段: Referer
  运算符: 不包含
  值: "cigar.hair"
  操作: 阻止
  描述: 防止外部网站直接引用资源

规则 5: 国家白名单（可选，如仅限中国用户）
  字段: 国家/地区
  运算符: 不在
  值: "CN, HK, MO, TW, SG, JP"
  操作: 阻止
  描述: 阻止非目标地区流量
```

### 3.3 Turnstile 验证码（免费替代 reCAPTCHA）

> Cloudflare Turnstile 是完全免费的智能验证码，不收集用户隐私数据，比 Google reCAPTCHA 更适合中国用户。

```yaml
获取 Site Key:
  Cloudflare 面板 → Turnstile → 添加站点
  站点名称: 雪茄客注册
  域名: cigar.hair
  小部件类型: 非交互式（对用户无感）
  主题: 深色（匹配暗黑风）

  创建后获得:
    Site Key:  0x4AAAAAA...
    Secret Key: 0x4AAAAAA...
```

在前端注册页面集成 Turnstile：

```html
<!-- 在注册表单中添加 -->
<form id="register-form">
  <input type="email" name="email" placeholder="邮箱" required />
  <input type="password" name="password" placeholder="密码" required />

  <!-- Turnstile 容器（自动渲染） -->
  <div class="cf-turnstile" data-sitekey="0x4AAAAAA..." data-theme="dark"></div>

  <button type="submit">注册</button>
</form>

<!-- 在页面底部加载 Turnstile 脚本 -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### 3.4 Edge Functions 实现 Age Gate（免费额度内）

> Cloudflare Pages 内置 Functions 功能，可以在边缘节点执行 JavaScript，无需服务器。

#### 实现方案

在项目的 `functions/` 目录下创建 `_middleware.js`：

```javascript
// functions/_middleware.js
// 这个中间件在每个页面请求时执行

const AGE_GATE_COOKIE = 'age_gate_passed'
const AGE_GATE_COOKIE_MAX_AGE = 86400 * 30 // 30 天

export async function onRequest(context) {
  const { request, env, next } = context
  const url = new URL(request.url)

  // 跳过静态资源和 API 请求
  if (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/cdn-cgi/')) {
    return next()
  }

  // 检查是否通过了年龄验证
  const cookie = request.headers.get('Cookie') || ''
  if (cookie.includes(AGE_GATE_COOKIE + '=1')) {
    return next()
  }

  // 检查是否提交了年龄确认
  if (url.pathname === '/__age_gate_confirm') {
    const response = new Response(null, {
      status: 302,
      headers: { Location: url.searchParams.get('redirect') || '/' }
    })
    response.headers.append('Set-Cookie',
      `${AGE_GATE_COOKIE}=1; Max-Age=${AGE_GATE_COOKIE_MAX_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax`
    )
    return response
  }

  // 检查是否拒绝（未满 18 岁）
  if (url.pathname === '/__age_gate_deny') {
    return Response.redirect('https://www.baidu.com/s?wd=%E5%90%B8%E7%83%9F%E6%9C%89%E5%AE%B3%E5%81%A5%E5%BA%B7', 302)
  }

  // 返回 Age Gate 弹窗页面（HTML 直出，无额外请求）
  const ageGateHtml = `<!DOCTYPE html>
<html lang="zh-CN" style="background:#1a1410;">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>雪茄客 · 年龄验证</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1410;font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.modal{max-width:380px;width:100%;background:#2a2218;border:1px solid #4a3f30;border-radius:20px;padding:2rem 1.6rem;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.6)}
.icon{font-size:2.4rem;margin-bottom:0.5rem}
h2{font-family:'Playfair Display',Georgia,serif;color:#c9a84c;font-size:1.3rem;margin-bottom:0.3rem}
.sub{color:#a09080;font-size:0.85rem;margin-bottom:1.2rem}
.warning{background:#1a1410;border-radius:10px;padding:0.6rem;margin-bottom:1rem;font-size:0.75rem;color:#e57373;border:1px solid #3d3428}
.prompt{color:#e8dcc8;font-size:0.9rem;margin-bottom:1.2rem}
.prompt strong{color:#c9a84c}
.btns{display:flex;flex-direction:column;gap:0.6rem}
.btn-primary{width:100%;padding:0.75rem;border:none;border-radius:12px;background:#c9a84c;color:#1a1410;font-size:0.95rem;font-weight:600;cursor:pointer;transition:opacity 0.2s;text-decoration:none;display:block}
.btn-primary:hover{opacity:0.85}
.btn-secondary{display:block;width:100%;padding:0.75rem;border-radius:12px;background:transparent;color:#a09080;border:1px solid #4a3f30;text-decoration:none;font-size:0.9rem;transition:all 0.2s}
.btn-secondary:hover{color:#e8dcc8;border-color:#8b5e3c}
.footer{color:#6b5b4b;font-size:0.7rem;margin-top:1rem}
.footer a{color:#8b5e3c}
</style>
</head>
<body>
<div class="modal">
<div class="icon">🚬</div>
<h2>欢迎来到雪茄客</h2>
<p class="sub">本站内容仅供成年人参考与交流</p>
<div class="warning">⚠ 吸烟有害健康 · 未成年人禁止吸烟</div>
<p class="prompt">请确认您已满 <strong>18 周岁</strong>（中国大陆法定吸烟年龄）</p>
<div class="btns">
<a href="/__age_gate_confirm?redirect=${encodeURIComponent(url.pathname)}" class="btn-primary">我已满 18 岁，进入网站</a>
<a href="/__age_gate_deny" class="btn-secondary">我未满 18 岁，离开</a>
</div>
<p class="footer">点击进入即表示您同意我们的 <a href="/disclaimer">免责声明</a></p>
</div>
</body>
</html>`

  return new Response(ageGateHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    }
  })
}
```

**部署方式：**

```bash
# 在项目根目录创建 functions 目录
cd "D:\雪茄知识开发"
mkdir -p functions

# 创建上述 _middleware.js 文件
# 然后将整个项目推送到 GitHub
git add -A
git commit -m "Add Age Gate middleware"
git push

# Cloudflare Pages 自动检测 functions/ 目录并部署为 Edge Functions
# 无需任何额外配置
```

**工作原理：**

```
用户访问 https://cigar.hair
  │
  ▼
Cloudflare Edge 节点拦截请求
  │
  ├─ 有 age_gate_passed Cookie → 正常返回页面
  │
  └─ 无 Cookie → Edge Function 直接返回 Age Gate HTML
       │
       ├─ 点击"已满 18 岁" → 设置 Cookie + 重定向到原页面
       │
       └─ 点击"未满 18 岁" → 302 跳转到百度搜索"吸烟有害健康"
```

**Edge Functions 免费额度：**

| 资源 | 免费额度 | 雪茄社区预估 | 结论 |
|---|---|---|---|
| 每天请求数 | 100,000 次/天 | ~500 次/天 | ✅ 完全够用 |
| CPU 时间 | 50ms/请求 | ~3ms | ✅ 完全够用 |
| 内存 | 128MB | 极小 | ✅ 完全够用 |

---

### 3.5 敏感词过滤（前端 + Cloudflare Workers）

作为第二道防线，在 Cloudflare Workers（免费额度内）部署敏感词过滤：

```javascript
// functions/api/_middleware.js
// 拦截包含敏感词的 API 请求

const SENSITIVE_WORDS = [
  '代购', 'dg', '出茄', '转手', '私聊', '私我',
  '加v', '加微', 'vx', 'wechat', '微信',
  '多少钱', '求购', '现货', '有货',
  '支付宝', '转账', '收款',
  '代购', '拼单', '拼车', '渠道',
]

export async function onRequest(context) {
  const { request, next } = context

  // 只检查 POST/PUT/PATCH 请求
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return next()
  }

  // 读取请求体（克隆，因为只能读一次）
  const clonedRequest = request.clone()
  const body = await clonedRequest.text()

  // 检查是否包含敏感词
  const matchedWord = SENSITIVE_WORDS.find(word => body.includes(word))
  if (matchedWord) {
    return new Response(JSON.stringify({
      error: 'CONTENT_REJECTED',
      message: '内容包含违规词，已自动拦截',
      matched: matchedWord
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return next()
}
```

---

## 附录：故障排查与回滚

### 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 部署后页面空白 | 构建输出目录不对 | 检查 Cloudflare Pages 构建设置中的 `构建输出目录` 是否设为 `dist` |
| 域名未生效 | DNS 缓存未更新 | 执行 `nslookup cigar.hair` 确认解析到 Cloudflare IP；等待 1-24h |
| 数据库连接失败 | 环境变量未正确设置 | 在 Cloudflare Pages 项目设置 → 环境变量中检查 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` |
| Age Gate 不弹出 | Cookie 已存在 | 清除浏览器缓存或使用隐私模式测试 |
| 图片加载 404 | 上传路径不对 | 检查静态图片是否放在项目目录下并已提交到 Git |
| 表单提交 403 | WAF 规则过于严格 | 临时关闭 WAF 测试，确认后微调规则 |

### 一键回滚

```yaml
操作路径: Cloudflare 面板 → Workers 和 Pages → 你的项目 → 部署

每个部署版本都有一个 6 位数的 ID。
找到上一个正常版本 → 点击 "..." → 选择 "回滚到此版本"
——整个过程约 10 秒，不影响用户访问。
```

---

## 上线执行清单

```
□ 1. 安装 GitHub Desktop，将本地代码推送至 GitHub
□ 2. 注册 Cloudflare 账号，添加域名 cigar.hair
□ 3. 在域名注册商处将 Nameserver 改为 Cloudflare 的
□ 4. 注册 Supabase 账号，创建项目并导入数据库 schema
□ 5. 在 Cloudflare Pages 连接 GitHub 仓库并部署
□ 6. 配置环境变量（Supabase URL + Anon Key）
□ 7. 绑定自定义域名 cigar.hair
□ 8. 创建 functions/_middleware.js 部署 Age Gate
□ 9. 配置 WAF 规则（5 条）+ Turnstile 验证码
□ 10. 全链路测试：手机 4G 访问 cigar.hair
```

---

> 整个上线流程约 1-2 小时（含 DNS 传播等待时间），总成本 ¥0。
> 所有平台均在免费额度内运行，未来如果 DAU > 5,000 再考虑升级付费计划。
