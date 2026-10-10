# 贡献指南

> 面向要改这个项目的人（包括三个月后的自己）。先读 [ARCHITECTURE.md](ARCHITECTURE.md) 了解设计意图。

---

## 环境要求

- **Node ≥ 22.5**（`node:sqlite` 是内置模块，低于此版本无法启动）
- 无需 MySQL、无需 Docker、无需全局工具
- 测试需要 `jq`（`brew install jq`）

```bash
npm install       # 只装前端依赖，后端零依赖
npm run seed      # 建库 + 导入种子
npm run test:e2e  # 确认起点是绿的
```

> **已知环境坑**：如果 `~/.npm` 缓存被 root 占用，`npm install` 会报
> `EPERM ... _cacache/tmp`。绕过：`NPM_CONFIG_CACHE=/tmp/npm-cc-cache npm install`，
> 或修复属主：`sudo chown -R $(id -u):$(id -g) ~/.npm`。

## 开发循环

```bash
# 终端 1：后端（--watch 自动重启）
npm run dev
# 终端 2：前端（5173，/api 已代理到 8787，改代码热更新）
npm run dev:web
```

浏览器开 `http://127.0.0.1:5173`。**不要**去开 8787 —— 那个端口在开发模式下只提供 API，
前端页面来自 `web/dist`（可能是旧的构建产物）。

## 十条约定

1. **改接口必须同步改 `docs/API.md`**。契约是前后端唯一依据。
2. **前端不得硬编码任何选项**。产地/型号/浓郁度/风味/品牌一律来自 `/api/meta`。
   这是本次重构的核心成果，退回去就等于重新制造「两套事实来源」。
3. **所有请求走 `web/src/api/client.js`**。组件里不要出现裸 `fetch`。
4. **`server/rules/` 里只能放纯数据与纯函数**，不许有 I/O —— 这样它们可以被单元测试直接 import。
5. **数据库访问只走 `server/db/index.js` 的 `query` / `queryOne` / `run` / `transaction`**。
   这层门面是将来换 MySQL 的唯一改动点。
   ⚠️ 第二参数**必须是数组**：`run(sql, [a, b])`，不是 `run(sql, a, b)`。
   `node:sqlite` 对未绑定占位符会**静默填 NULL**，写成位置参数会得到一个莫名其妙的
   `NOT NULL constraint failed`。代码里有护栏会把这种写法变成明确的类型错误。
6. **新增敏感词后必须跑 `npm test`**。配置是数据不是代码，只有那 40 项断言能拦住误杀与自我豁免。
7. **颜色只用 `cigar-*` token**（定义在 `web/tailwind.config.js`）。不要引入裸十六进制色值。
8. **每个 fetch 都要处理失败态**。禁止白屏：要有骨架屏、错误文案、重试入口。
9. **注释写「为什么」，不写「做了什么」**。代码能说明做什么，注释要留住当时的权衡与踩过的坑。
10. **归档而不是删除**。被取代的实现移到 `_archive/<原因>/`，并在 README 里说明它被什么取代。

---

## 常见任务

### 加一个 API 接口

1. 在 `docs/API.md` 写清路径、方法、请求体、响应体、错误码
2. 在 `server/api/` 对应模块里注册路由（模块内部只写相对路径，如 `/cigars`；`/api` 前缀由 `server/index.js` 统一 `mount`）
3. 需要新字段时，在 `server/api/shape.js` 里加整形函数 —— **不要把 `snake_case` 直接吐给前端**
4. 在 `web/src/api/client.js` 加一个方法
5. 在 `scripts/api-smoke.sh` 加断言（成功路径 + 至少一个失败路径）
6. `npm run test:e2e` 确认全绿

### 改诊断 / 风味测试 / 醇化规则

规则都在 `server/rules/*.js`，是纯数据：

- `diagnostic.js`：`QUESTIONS` 决定题面与分支（`dependsOn`），`DIAGNOSES[类型][严重度]` 决定结论与抢救步骤
- `flavor.js`：`QUESTIONS` 的每个选项必须带 `category`（用于计分），`PERSONALITIES` 按大类定人格
- `aging.js`：`BASE_WINDOW` 按浓郁度 1-5 给最佳窗口（月），环境偏差计入 `penalty`

改完要 `npm test`，并确认前端无需改动（题目是服务端下发的，前端不该知道任何题目内容）。

### 改敏感词配置

编辑 `config/sensitive-words.json`：

| 桶 | 处置 |
|---|---|
| `rules.immediate_ban.keywords` | 拒绝入库，返回 `403 CONTENT_REJECTED` + 命中词 |
| `rules.audit_required.keywords` | 入库但 `status=-1`，公开列表不可见，返回 `202 CONTENT_QUEUED` |
| `rules.flag_and_warn.keywords` | 允许发布，返回提示 |
| `whitelist.negation_context` | 否定词，命中词紧跟其后则豁免 |
| `whitelist.safe_context_regex` | 安全语境词，**句内**出现则豁免 |
| `whitelist.patterns` | 完全放行的短语（如「参考市场价」） |

判级原则：**询价类进审核队列，交易意图明确的进红线**。
（`多少钱一支` → `queued`；`出茄` / `代购` / `加微信` → `blocked`）

改完必须跑 `npm test`。要加断言就改 `scripts/sensitive.test.mjs`，
**正反两个方向都要有**：证明能拦住违规，也证明没误杀正常发言。

### 加一支雪茄

优先走数据文件而不是手工插库：

- 有完整品鉴描述的 → 追加到 `database/seed/cigars.csv`（这是权威来源）
- 只有基本信息的 → 追加到 `database/seed/mock-cigars.json`

然后 `npm run seed:reset`（会清空业务数据重建）。注意唯一键是 `(品牌, 系列, 型号)`。

### 换数据库（SQLite → MySQL）

见 [ARCHITECTURE.md §七](ARCHITECTURE.md)。核心：只需重写 `server/db/index.js`，
保持 `query` / `queryOne` / `run` / `transaction` 四个导出签名不变，上层路由一行都不用改。

---

## 测试

| 命令 | 覆盖范围 | 用在哪 |
|---|---|---|
| `npm test` | 敏感词归一化与熔断（40 项）+ CSV/规则库（12 项） | 每次改合规逻辑或种子数据 |
| `npm run test:e2e` | 隔离库 + 单测 + 162 项契约断言 | **提交前必跑** |
| `npm run verify:ui` | 真实浏览器 DOM 断言（45 项） | 改前端后 |
| `npm run preflight` | 只读体检（含安全头、备份、凭证泄露） | 上线前 / 对线上域名 |
| `npm run backup` | 备份脚本自身 | 改备份逻辑后 |

`test-e2e.sh` 的关键设计：**给测试起一个独立的临时库并关闭限流**。
不要改成对开发库跑 —— 那会产生两类必然的假失败：

1. 跨轮次状态污染（上一轮插入的数据改变排序/筛选结果）
2. 限流把测试自己拦掉（认证接口 10 次/分钟）
3. **端口被别的进程占用**：`test-e2e.sh` 会先探测端口，若响应来自「不是本应用」的服务会直接报错退出。
   这不是多余防护 —— 曾经测试端口被一个无关的常驻服务占用，请求静默打到那个服务上，
   导致回归断言时对时错，排查成本极高。换端口用 `CC_TEST_PORT=18888`。

调试冒烟脚本时注意两个已踩过的坑：

- **URL 里的中文必须百分号编码**。curl 会把原始 UTF-8 字节写进请求行，Node 的 HTTP 解析器直接拒收
  （症状：响应体为空、状态码异常）。脚本里的 `urlencode_nonascii` 只编码非 ASCII 字节 ——
  **不要**整串编码，否则 `/` `?` `&` 也会被转义，URL 直接失效。
- **shell 里变量名后面不要紧跟全角字符**。`"$VAR）"` 会让 bash 把全角字节并进变量名，
  报 `unbound variable`。脚本里的中文提示一律用半角括号。

## 提交前检查单

```bash
npm run test:e2e        # 必须 exit 0
npm run build           # 前端必须构建成功
npm run preflight       # 期望 0 失败（警告可接受）
```

- [ ] 改了接口 → `docs/API.md` 同步更新
- [ ] 加了敏感词 → 单元测试通过，且覆盖正反两个方向
- [ ] 新增文件放在了正确的目录（见 [ARCHITECTURE.md §八](ARCHITECTURE.md)）
- [ ] 没有把运行库、日志、备份、`.env` 提交进版本库
- [ ] 归档而非删除被取代的实现
