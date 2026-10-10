# 雪茄客 · Cigar Community

> 非交易向的雪茄知识库与品吸交流社区。**不售烟草，不提供购买渠道。**

一句话说明它现在是什么：**一个能真正跑起来、40 款雪茄入库、前后端与合规熔断全部打通的全栈应用**，
而不是一份写在 markdown 里的策划案。

```bash
npm install          # 装依赖（前端 Vue3+Vite+Tailwind；后端零依赖）
npm run seed         # 建库 + 导入种子数据（40 款雪茄 / 21 品牌 / 31 风味标签）
npm run build        # 构建前端
npm start            # 起服务 → http://127.0.0.1:8787
```

想边改边看前端：`npm run dev`（后端 8787）+ 另开一个终端 `npm run dev:web`（前端 5173，已配好 /api 代理）。

---

## 目录

- [它现在能做什么](#它现在能做什么)
- [技术栈与选型理由](#技术栈与选型理由)
- [项目结构](#项目结构)
- [全部命令](#全部命令)
- [⚠️ 关于仓库里的三套「上线方案」](#️-关于仓库里的三套上线方案)
- [数据从哪来](#数据从哪来)
- [合规设计](#合规设计)
- [部署](#部署)
- [文档索引](#文档索引)
- [已知限制](#已知限制)

---

## 它现在能做什么

| 模块 | 能力 | 状态 |
|---|---|---|
| **雪茄数据库** | 40 款雪茄，按产地/型号/浓郁度/风味/品牌多选筛选，关键词搜索（含中文风味），6 种排序，分页 | ✅ 可用 |
| **雪茄详情** | 尺寸（英寸/mm/环径）、茄衣/茄套/茄芯、养护建议、风味标签、评分汇总、相关推荐 | ✅ 可用 |
| **品吸笔记** | 三段评分（前/中/尾）+ 斜烧度 + 抽吸阻力 + 总体评分，写笔记、列表、排序、「有用」投票（幂等） | ✅ 可用 |
| **病害一键诊断** | 4 类异常 × 3 档严重度的决策树，输出存活率、严重等级、抢救步骤；题目由服务端下发 | ✅ 可用 |
| **风味人格测试** | 6 题 → 10 维风味得分 → 6 种人格 + 推荐选茄 | ✅ 可用 |
| **醇化计算器** | 按浓郁度与环境参数估算最佳品吸窗口、当前状态、环境合规提示 | ✅ 可用 |
| **用户数据投稿** | 提报雪茄资料 → 进人工审核队列 → 查看自己的提报状态 | ✅ 可用 |
| **合规熔断** | 敏感词三级处置（红线拦截 / 进审核队列 / 提示），含变体识破与否定语境豁免 | ✅ 可用 |
| **年龄门** | 服务端 Cookie 判定，爬虫 UA 直接放行（不影响 SEO） | ✅ 可用 |
| **账号体系** | scrypt 口令散列、可撤销会话、HttpOnly Cookie、登录限流、改口令 | ✅ 可用 |
| **管理后台** | 运营概览、笔记审核队列、投稿审批（通过即入库）、审核日志、用户启停 | ✅ 可用（admin / editor） |
| **MySQL 生产库** | 设计稿已就绪，运行库目前是 SQLite | ⚠️ 见 [ROADMAP](docs/ROADMAP.md) |

## 技术栈与选型理由

**前端**：Vue 3 + Vite + Tailwind CSS + vue-router。沿用项目原有的 Vue 与 Tailwind 色板（`cigar-*` token），
不引入 Pinia —— 全站只有一个共享状态（会话），`reactive` 足够，少一个依赖。

**后端**：**零依赖**。`node:http` 手写薄路由 + `node:sqlite`（Node ≥22.5 内置）。

> 为什么不直接上 Nest/Express/Strapi：这个项目此前**完全没有后端**，`database/schema.sql` 是纯设计稿。
> 上重框架会把「第一次能跑起来」的时间从分钟拉长到天，还会引入 native module 编译风险
> （`better-sqlite3`、`bcrypt` 在换机器时最容易炸）。零依赖的代价是自己写了约 300 行 HTTP 原语，
> 换来的是 `git clone && npm install && npm start` 在任何装了 Node 22+ 的机器上都能跑通。

**数据库**：运行库用 SQLite（`database/schema.sqlite.sql`），生产设计稿是 MySQL（`database/schema.sql`）。
两者字段一一对应，差异与迁移路径见 [ARCHITECTURE](docs/ARCHITECTURE.md)。

## 项目结构

```
cigar-community/
├── server/                    # 后端（零依赖，全 node: 内置模块）
│   ├── index.js               #   入口：路由装配、限流、静态托管、优雅关闭
│   ├── config.js              #   .env 加载、生产环境安全校验
│   ├── seed.js                #   种子导入：合并 CSV 与 MOCK 两套历史数据
│   ├── api/                   #   路由：meta / cigars / tools / reviews / submissions / auth / misc
│   ├── db/                    #   node:sqlite 封装、启动引导（建库+管理员）
│   ├── lib/                   #   http 原语 / 口令 / 签名 / 敏感词 / 静态托管
│   ├── middleware/auth.js     #   会话、年龄门、鉴权守卫
│   └── rules/                 #   诊断、风味人格、醇化计算的规则库
├── web/                       # 前端（Vue 3 + Vite + Tailwind）
│   ├── src/api/client.js      #   统一 API 客户端（唯一允许发请求的地方）
│   ├── src/views/             #   12 个页面
│   ├── src/components/        #   共享组件（含年龄门、免责条）
│   └── src/composables/       #   useAuth 等
├── database/
│   ├── schema.sql             #   MySQL 生产设计稿（权威字段定义）
│   ├── schema.sqlite.sql      #   SQLite 运行库结构（与上者字段对齐）
│   └── seed/                  #   cigars.csv（15 款权威品鉴）+ mock-cigars.json（34 款展示数据）
├── scripts/                   # 测试与运维脚本
│   ├── test-e2e.sh            #   端到端：隔离库 + 单测 + 契约冒烟
│   ├── api-smoke.sh           #   131 项 API 契约断言
│   ├── sensitive.test.mjs     #   敏感词单元测试
│   ├── preflight.sh           #   上线前只读体检
│   ├── backup-db.sh           #   SQLite 一致性备份 + 轮转
│   ├── seed.mjs               #   命令行种子导入
│   └── extract-mock.mjs       #   一次性迁移脚本（MOCK_CIGARS 物化）
├── docs/                      # 设计与运维文档（见下方索引）
├── config/sensitive-words.json # 敏感词规则（合规熔断的数据源）
├── content/ legal/ operations/ # 静态内容与运营物料
├── deployment/ monetization/   # 历史策划案（⚠️ 注意下方说明）
└── _archive/                  # 归档：旧前端、Windows+MySQL 时代的脚本
```

## 全部命令

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖（后端零依赖，只装前端） |
| `npm run seed` | 建库 + 导入种子（幂等：库里已有数据则跳过） |
| `npm run seed:reset` | **清空重建**（含用户表，仅开发用） |
| `npm run dev` | 后端开发模式（`--watch` 自动重启） |
| `npm run dev:web` | 前端开发服务器（5173，代理 /api 到 8787） |
| `npm run build` | 构建前端到 `web/dist/` |
| `npm start` | 启动生产服务（同时托管前端与 API） |
| `npm test` | 单元测试（敏感词熔断 40 项 + CSV/规则库 12 项） |
| `npm run test:e2e` | **端到端测试**：隔离临时库 + 单测 + 191 项契约冒烟 |
| `npm run smoke` | 只跑契约冒烟（对已在跑的服务） |
| `npm run verify:ui` | 前端 DOM 断言（真实浏览器，45 项） |
| `npm run verify:admin` | 管理后台断言（权限隔离 + 渲染，27 项） |
| `npm run screenshot` | 用 headless Chrome 给页面截图（视觉回归辅助） |
| `npm run preflight` | 上线前只读体检（可对线上域名执行） |
| `npm run backup` | SQLite 一致性备份 + 自动轮转 |

> **自动化测试与限流**：`test-e2e.sh` 会以 `CC_RATE_LIMIT_DISABLED=1` 启动独立实例。
> 手动压测接口时若连续打认证接口，会触发 10 次/分钟的限流（这是设计如此，不是 bug）。

## ⚠️ 关于仓库里的三套「上线方案」

这个仓库里有三套**互相假设不同架构**的历史方案。它们保留了原始设计思路，但**不代表现状**，请勿照着执行：

| 位置 | 它假设的架构 | 与现状的关系 |
|---|---|---|
| `deployment/checklist.md` | Nginx + MySQL + 云服务器 | ✅ 验收标准仍然有效（年龄门、敏感词口径已实现为自动化断言）；基础设施部分需按实际调整 |
| `deployment/serverless-deploy-guide.md` | Cloudflare Pages + Supabase | ⚠️ 与当前 Node+SQLite 实现**不兼容**，属于备选路线 |
| `_archive/win11/` | Windows Server + MySQL | ⚠️ 已归档，被 `scripts/preflight.sh` 与 `backup-db.sh` 取代 |

同理，`monetization/`、`operations/`、`legal/`、`content/` 是**运营策划物料**，不是代码。

## 数据从哪来

项目原本有**两套互不知情的雪茄数据**，这是「半成品」的根因之一：

| 来源 | 内容 | 权威性 |
|---|---|---|
| `database/seed/cigars.csv` | 15 款，官方品鉴描述详尽，中文风味标签 | **权威**（冲突时以它为准） |
| `database/seed/mock-cigars.json` | 34 款，带参考价/评分/笔记数 | 展示补充数据 |

两者以 `(品牌, 系列, 型号)` 为幂等键合并，去重后入库 **40 款**：CSV 的 15 款全部保留，
MOCK 中不重复的 27 款作为补充；6 处真正重复的（同一支雪茄）以 CSV 描述 + MOCK 价格评分合并。

- 导入时发现风味字典缺 3 个标签（豆香/黑巧/坚果），已回写补进 `database/schema.sql`
- `mock-cigars.json` 由 `scripts/extract-mock.mjs` 从组件里物化而来，可重复生成

> 价格字段 `priceCny` 是**公开资料整理的参考估算价，不是交易报价**。CSV 独有记录没有价格，接口返回 `null`。

## 合规设计

这是烟草相关社区，合规不是加分项而是**准入门槛**。已落地的机制：

1. **年龄门**（服务端判定，三层）
   - 未通过 → 前端全屏拦截，无法操作
   - 爬虫 UA 直接放行（`Googlebot` 等），否则 SEO 归零
   - 拒绝确认 → 跳转健康警示页

2. **敏感词三级处置**（`config/sensitive-words.json` 为唯一数据源）

   | 级别 | 处置 | 例子 |
   |---|---|---|
   | `blocked` | 拒绝入库并返回命中词 | 代购、出茄、私聊加微信、转账 |
   | `queued` | 入库但 `status=-1`，进人工审核，不公开 | 多少钱一支、求购、比价 |
   | `warned` | 允许发布但提示 | 吸烟、未成年人、酒后 |

3. **抗绕过**：归一化处理大小写、全角半角、零宽字符、分隔符插入（`加-微-信` / `加 微 信` 均可识破），
   命中位置回填原文下标供运营查看上下文。

4. **不误杀**（同样重要）：否定语境（「本站**不卖**雪茄」）与安全语境（「遇到代购请**举报**」）
   会被豁免。句级窗口而非全文豁免，避免「前言撇清 + 后句真违规」蒙混过关。
   单元测试对这两个方向都有断言。

5. **其余**：登录限流、口令强度校验、账号枚举防护、路径穿越防护、安全响应头、内容免责条。

## 部署

**单机部署（推荐，最简单）**：

```bash
git clone <repo> && cd cigar-community
npm install
cp .env.example .env    # 必须修改 CC_SECRET 与 CC_ADMIN_PASSWORD
npm run seed
npm run build
CC_ENV=production npm start   # 生产模式会强制校验密钥，用默认值直接拒绝启动
```

用 launchd / systemd / pm2 常驻即可，SQLite 无需额外运维。Nginx 反向代理：
安全响应头模板见 `config/nginx-security-headers.conf`（代码里也已内置一份，不经反代同样生效）。

**Serverless 部署**：见 `deployment/serverless-deploy-guide.md`，但需要自行改造后端（当前实现依赖本地文件系统）。

上线前务必执行：

```bash
npm run test:e2e                    # 本地全量验证
npm run backup                      # 先备份
npm run preflight -- https://你的域名  # 只读体检
```

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/API.md](docs/API.md) | **接口契约**（前后端唯一依据，改接口必须同步改它） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构决策、数据模型、MySQL 迁移路径、目录职责 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 已做 / 未做 / 刻意不做，以及为什么 |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | 开发约定、如何加接口、如何改规则库 |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | 独立验收报告 + 缺陷修复记录（含根因分析） |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署与运维细则 |
| [deployment/checklist.md](deployment/checklist.md) | 上线检查单（历史文档，验收标准仍有效） |

## 已知限制

诚实列出当前不完善的地方（详见 [ROADMAP](docs/ROADMAP.md)）：

1. **图片上传尚未实现**（表已建、接口未做），笔记目前只能发文字。
2. **限流是单进程内存实现**。多实例部署会失效，需要换 Redis。
3. **运行库是 SQLite**。适合单机与中小流量；高并发写入场景需迁到 MySQL（路径已规划）。
4. **搜索是 `LIKE` 而非真正的中文分词**。数据量小时够用，上万条后需要接分词或搜索引擎。
5. **`web/dist` 需要手动构建**。Docker 与 CI 在后续批次补上。
7. **管理后台缺失**（见下）。运营无法在界面上处理审核队列。
8. **前端测试为 DOM 断言，非完整 E2E**。`npm run verify:ui` 覆盖 45 项关键路径（年龄门、渲染、搜索、空态、404），但没有表单交互与跨浏览器覆盖。

---

**许可**：见 [LICENSE](LICENSE)。**吸烟有害健康**，本项目仅面向 18 周岁以上成年人，用于知识交流与品鉴记录。
