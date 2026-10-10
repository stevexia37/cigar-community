# 架构说明

> 这份文档解释**为什么这样设计**，而不是重复代码做了什么。接口细节见 [API.md](API.md)。

---

## 一、这个项目原本的问题

接手时的状态（第一次提交 `65c86b2`）：

| 层 | 实况 |
|---|---|
| 规划文档 | 约 70% 的仓库体积。上线检查单、商业化方案、运营日历、敏感词配置，写得相当完整 |
| 数据库 | 只有 `schema.sql` 设计稿（11 张表，MySQL），**没有任何代码读它** |
| 前端 | 两套互不引用的半截工程：`cigar-filter/`（有脚手架、能跑）和 `src/components/`（连 `index.html` 都没有，跑不起来） |
| 后端 | **不存在** |
| 数据 | 两套互相不知道对方存在的数据集（15 款 CSV + 34 款写在 JS 里的 MOCK） |

所以核心矛盾不是「功能不够」，而是**没有任何一条路径能从数据库走到浏览器**。所有设计都停在纸面上。

## 二、三条关键决策

### 决策 1：后端零依赖

选型对比：

| 方案 | 首次可运行时间 | 风险 | 结论 |
|---|---|---|---|
| Nest / Express + Prisma + MySQL | 小时~天级 | native module 编译、MySQL 安装、迁移管理 | 对一个还没有后端的项目太重 |
| Strapi（`schema.json` 本就是为它写的） | 小时级 | 需要 Node 版本兼容、管理界面定制成本高 | 与「最小可用」目标不符 |
| **`node:http` + `node:sqlite`** | **分钟级** | 自己写路由/会话/限流（约 300 行） | ✅ 采用 |

代价与收益是明确的：自己维护 `server/lib/http.js` 的路由与会话，换来 **`git clone && npm install && npm start` 在任意 Node 22.13+ 机器上必然跑通**。
对这个项目而言，「能跑起来」比「企业级分层」重要得多。

`node:sqlite` 是 Node 22.5+ 的内置模块（**22.13+ 起无需 `--experimental-sqlite` 标志**），
**不需要编译**，这正是避开 `better-sqlite3` 痛点的地方。

### 决策 2：不动 MySQL 设计稿，另写一份 SQLite 结构

`database/schema.sql` 是 MySQL 设计稿，字段定义、索引策略、注释都很完整，**保留为权威字段定义**。
运行时另建 `database/schema.sqlite.sql`，与之逐字段对齐。

两版差异（迁移时需注意）：

| MySQL | SQLite | 说明 |
|---|---|---|
| `ENUM(...)` | `TEXT` + `CHECK` | 语义等价 |
| `TINYINT(1)` | `INTEGER` 0/1 | 布尔 |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TEXT DEFAULT (strftime(...))` | ISO8601 UTC 字符串 |
| `ON UPDATE CURRENT_TIMESTAMP` | 应用层显式写入 | SQLite 无此语法 |
| `FULLTEXT KEY ... (a,b)` | FTS5 外部内容表 + 3 个触发器 | 见下方「踩坑」 |
| `AUTO_INCREMENT` | `AUTOINCREMENT` | |

**SQLite 版额外有 4 个展示字段**（MySQL 版没有，迁移时需补进设计稿）：
`price_cny` / `rating` / `review_count` / `vitola_family`。来源是原 `useCigarFilter.js` 的 MOCK 数据 —— 前端早已依赖它们，不补就没法渲染。

**踩坑记录**：FTS5 一开始写成 `content=''`（contentless），结果触发器里的 `DELETE` 直接报
`cannot DELETE from contentless fts5 table`。contentless 表不支持删除，必须改用**外部内容表**
（`content='cigars', content_rowid='id'`），且删除要走特殊命令
`INSERT INTO cigars_fts(cigars_fts, rowid, ...) VALUES('delete', ...)`。

### 决策 3：幂等键必须带 series

最初用 `UNIQUE(brand_id, vitola)` 做幂等键，导入后雪茄数只有 41 而不是 42。
原因：`Arturo Fuente Robusto` 是**两支不同的雪茄**（Don Carlos 与 Opus X），被误合并。
修正为 `UNIQUE(brand_id, COALESCE(series,''), vitola)`。

> 这个数字差异（41 vs 42）是最好的提醒：**数据导入的静默合并比报错更危险**。

## 三、请求生命周期

```
HTTP 请求
   │
   ├─ 安全响应头（nosniff / SAMEORIGIN / Referrer-Policy / Permissions-Policy / 生产 HSTS）
   ├─ attachAuth()          → 解析 cc_sid Cookie 查 sessions 表；判定爬虫；判定年龄门 Cookie
   ├─ query 解析
   │
   ├─ /api/* ?
   │    ├─ 写方法 → 限流（auth 10/min，tools 40/min，其它 60/min）
   │    ├─ 读 body（256KB JSON 上限）
   │    ├─ 路由匹配 → req.params
   │    └─ handler（抛 HttpError → 统一错误响应）
   │
   └─ 其它 → 静态托管（gzip + hash 长缓存）→ 无扩展名则 SPA 回退 index.html
```

错误处理是**单点**的：handler 只管 `throw new HttpError(status, msg, code, details)`，
`server/index.js` 的 catch 负责序列化。前端据此拿到稳定的 `{ error, code, details }`。

## 四、数据模型

```
countries ──┐
            ├──< brands ──< cigars ──< cigar_flavors >── flavors
            └────────────────┘
                              │
users ──< sessions            └──< reviews ──< review_images
  │                                    │
  ├──< submissions                     └──< review_votes >── users
  └──< audit_log
```

关键设计：

- **`reviews.status`**：`1` 已发布 / `0` 草稿 / `-1` **审核队列**。
  命中 `audit_required` 词的内容以 `-1` 入库，公开列表一律 `WHERE status = 1`，运营审核后改状态。
- **`review_votes` 复合主键** `(review_id, user_id)` 保证一人一票；
  `helpful_count` 在每次投票后**按实际票数重算**，而不是 `+1/-1` 增量，避免计数漂移。
- **`audit_log`**：记录每次内容命中的动作、命中词、内容摘要（截断 120 字）。
  刻意不存原文全量 —— 违规内容不应二次留存在审核日志里。
- **`sessions.id` 存的是 token 的 sha256**，明文只在客户端 Cookie 里。库被读走也无法直接复用会话。

## 五、安全设计

| 面 | 做法 |
|---|---|
| 口令 | `scrypt(N=16384, r=8, p=1)` + 16 字节随机盐，格式 `scrypt$N$r$p$salt$hash`，恒定时间比较 |
| 会话 | 32 字节随机 token（base64url），HttpOnly + SameSite=Lax，30 天；生产环境加 Secure |
| 会话撤销 | 登出即删 `sessions` 行（服务端可撤销，而非只依赖签名过期） |
| 年龄门 | HMAC 签名的独立 Cookie（`cc_age`），与登录会话解耦 —— 未登录也必须过年龄门 |
| 账号枚举 | 登录失败统一返回「用户名或口令不正确」 |
| 限流 | 内存滑动计数；auth 10/min、tools 40/min、写操作 60/min |
| 路径穿越 | 解析后必须仍在 `web/dist` 之内，越界直接 404 |
| 生产护栏 | `CC_ENV=production` 时若 `CC_SECRET` 仍是默认值或是 `CC_ADMIN_PASSWORD=admin12345`，**拒绝启动** |

> 生产护栏是刻意做成「拒绝启动」而不是「打警告」的：默认密钥上线等于没有会话安全，
> 警告会在日志里被忽略，启动失败不会。

## 六、合规熔断设计

`server/lib/sensitive.js` 是本项目最值得看的一段逻辑，因为它要同时避免两类错误：
**漏放违规内容** 与 **误杀正常发言**（后者对社区伤害更大）。

三步：

1. **归一化**（`normalize`）—— 保留原文字节到归一化下标的映射，用于回填命中位置
   - 转小写；全角转半角；丢弃零宽字符与控制字符
   - 折叠空白与常见连接符 → `加 微 信` / `加-微-信` / `加_微_信` 等价于 `加微信`
   - 折叠加的是「槽位」而非直接删除，折叠槽位解析到其后第一个真实字符，
     这样命中下标不会落在空洞上（曾经踩坑：映射到 `-1`，前端无法高亮）

2. **匹配与优先级** —— `blocked > queued > warned`；同一处命中只记优先级最高的词
   （`出茄` 与 `出雪茄` 位置重叠时只记一次）

3. **豁免判定**（两步都做，且对**所有级别**生效）
   - **否定语境**：命中词前必须是本句内的否定词（`不卖` / `没有` / `请勿` …）
     → 「本站**不卖**雪茄」放行
   - **安全语境**：**句级**窗口内出现豁免词（`举报` / `防骗` / `警惕` …）
     → 「遇到代购私聊请**举报**」放行

   > 为什么是句级而不是固定 ±4 字窗口：安全词常出现在命中词**之后**
   > （「遇到代购私聊请举报」里 `举报` 在后面），固定窗口抓不到。
   > 但放宽到全文又会把「本站不卖茄。**有货私聊我**。」一起豁免 —— 句级是两者的平衡点。
   > 这个边界有一条专门的回归断言。

   > **踩坑记录**：白名单判定最初写了 `if (rule.action !== 'blocked' && isWhitelisted(...))`，
   > 等于红线词永远无法被语境豁免，「遇到代购请举报」直接变成了违规。
   > 白名单是**语境**判定，必须对所有级别生效。

## 七、迁移到 MySQL 的路径

SQLite 适合单机。要上多实例 / 高并发时：

1. 按 §二 的差异表把 `schema.sqlite.sql` 里那 4 个扩展字段补进 `schema.sql`
2. 建立迁移脚本：逐表 `SELECT *` 导出 → 类型转换（ISO 字符串 → `DATETIME`，`COALESCE(series,'')` 唯一键 → MySQL 唯一索引）
3. 把 `server/db/index.js` 换成 `mysql2/promise` 实现（**只要保持 `query`/`queryOne`/`run`/`transaction` 四个导出签名不变，上层路由完全不用改**）
   —— 这是当初坚持把这四个函数做成数据库门面的原因
4. `LIKE` 搜索换成 MySQL `FULLTEXT`（中文需 `ngram` 解析器）
5. 限流从内存换成 Redis

`server/db/index.js` 的 `assertParams` 护栏值得保留：`node:sqlite` 对未绑定占位符
**静默填 NULL**，一旦调用方把参数写成位置形式，症状会是莫名其妙的 `NOT NULL constraint failed`。
护栏把这种情况变成明确的类型错误。

## 八、目录职责速查

| 路径 | 放什么 | 不放什么 |
|---|---|---|
| `server/api/` | 路由与响应整形 | 业务规则（放 `server/rules/`）、SQL 细节（放 `server/db/`） |
| `server/rules/` | 可被测试直接 import 的纯数据与纯函数 | 任何 I/O |
| `server/lib/` | 通用能力（http/口令/签名/敏感词/静态） | 业务概念 |
| `database/` | schema 与种子数据 | 运行库（`*.db` 已 gitignore） |
| `web/src/api/` | **唯一**发请求的地方 | 组件里直接 fetch |
| `web/src/views/` | 页面 | 可复用逻辑（放 `composables/`） |
| `_archive/` | 历史实现，只读 | 任何被引用中的代码 |
| `deployment/`、`monetization/`、`operations/`、`legal/`、`content/` | 策划与运营物料 | 代码 |
