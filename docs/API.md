# 雪茄客 · API 契约 v1

> 前端与后端以此文件为唯一接口依据。改接口必须同时改这里。
> Base URL：开发环境 `/api`（Vite 代理到 `http://127.0.0.1:8787`）；生产环境同源 `/api`。

## 通用约定

| 项 | 约定 |
|---|---|
| 内容类型 | 请求与响应均为 `application/json; charset=utf-8` |
| 鉴权 | HttpOnly Cookie `cc_sid`（同源自动携带，前端 `fetch` 需 `credentials:'include'`） |
| 年龄门 | HttpOnly Cookie `cc_age`，不影响业务接口，仅记录合规状态 |
| 分页 | 查询参数 `page`（从 1 开始）、`pageSize`（默认 24，上限 60） |
| 错误 | 非 2xx 返回 `{ error: string, code: string, details?: any }` |
| 时间 | ISO8601 UTC，形如 `2026-06-08T10:00:00Z` |

### 错误码表

| code | HTTP | 含义 |
|---|---|---|
| `BAD_REQUEST` | 400 | 参数缺失或格式错误 |
| `INVALID_JSON` | 400 | 请求体不是合法 JSON |
| `UNAUTHORIZED` | 401 | 未登录或会话过期 |
| `FORBIDDEN` | 403 | 已登录但无权操作 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 用户名/邮箱已被占用 |
| `CONTENT_REJECTED` | 403 | 命中敏感词红线（`details.matched` 列出命中词） |
| `CONTENT_QUEUED` | 202 | 命中审核词，内容进审核队列，不公开显示 |
| `TOO_MANY_REQUESTS` | 429 | 触发限流 |
| `INTERNAL_ERROR` | 500 | 服务端异常 |

---

## 1. 元数据 `/api/meta`

前端筛选面板、风味轮的选项来源。**前端不得再硬编码任何选项。**

`GET /api/meta` → `200`

```jsonc
{
  "stats": { "cigars": 42, "brands": 22, "flavors": 31, "reviews": 0, "users": 1 },
  "origins": [                                   // 产地筛选
    { "value": "cuba", "label": "古巴", "code": "CU", "is_cuban": true, "count": 16 }
  ],
  "sizes": [                                     // 型号家族筛选
    { "value": "robusto", "label": "罗布图", "rg": [48, 54], "len": [4.5, 5.6], "count": 12 }
  ],
  "strengths": [                                 // 浓郁度筛选
    { "value": 1, "label": "清淡", "count": 0 },
    { "value": 4, "label": "浓郁", "count": 20 }
  ],
  "flavorCategories": [                          // 风味轮分组
    { "value": "woody", "label": "木香", "count": 12,
      "flavors": [ { "id": 1, "name": "Cedar", "label": "雪松木", "count": 12 } ] }
  ],
  "brands": [ { "id": 1, "name": "Cohiba", "count": 3 } ],
  "sortOptions": [
    { "value": "rating", "label": "评分优先" },
    { "value": "popular", "label": "热度优先" },
    { "value": "price_asc", "label": "价格从低到高" },
    { "value": "price_desc", "label": "价格从高到低" },
    { "value": "strength_desc", "label": "浓郁度从高到低" },
    { "value": "newest", "label": "最新入库" }
  ]
}
```

## 2. 雪茄列表 `/api/cigars`

`GET /api/cigars`

查询参数（全部可选，多个同类参数用逗号分隔表示 OR，不同类之间为 AND）：

| 参数 | 示例 | 说明 |
|---|---|---|
| `q` | `cohiba` 或 `雪松` | 关键词，匹配品牌/系列/型号/描述/风味 |
| `origin` | `cuba,nicaragua` | 产地 value |
| `size` | `robusto,gordo` | 型号家族 value |
| `strength` | `4,5` | 浓郁度 1-5 |
| `flavor` | `1,5` | 风味 id |
| `brand` | `1,3` | 品牌 id |
| `minRating` | `4.0` | 最低评分 |
| `sort` | `rating` | 见 `/api/meta` 的 `sortOptions` |
| `page` / `pageSize` | `1` / `24` | 分页 |

→ `200`

```jsonc
{
  "items": [
    {
      "id": 1,
      "brand": "Cohiba",
      "brandId": 1,
      "series": "Línea Clásica",
      "vitola": "Robustos",
      "vitolaFamily": "robusto",
      "vitolaFamilyLabel": "罗布图",
      "origin": "cuba",
      "originLabel": "古巴",
      "originType": "cuban",
      "countryCode": "CU",
      "lengthInch": 4.9,
      "lengthMm": 124,
      "ringGauge": 50,
      "strength": 4,
      "strengthLabel": "浓郁",
      "wrapperVariety": "Corojo",
      "binderVariety": "Cuba",
      "fillerVariety": "Cuba",
      "description": "高希霸经典罗布图…",
      "imageUrl": null,
      "priceCny": 35,
      "rating": 4.7,
      "reviewCount": 128,
      "flavors": [ { "id": 1, "name": "Bean", "label": "豆香" } ]
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 24,
  "totalPages": 2,
  "applied": { "q": "", "origin": ["cuba"], "size": [], "strength": [], "flavor": [], "brand": [], "sort": "rating" }
}
```

## 3. 雪茄详情 `/api/cigars/:id`

→ `200`，`{ "cigar": { …同上，额外字段见下 }, "reviews": [ …见 §6 ], "related": [ …同列表项 ] }`

额外字段：

```jsonc
{
  "cigar": {
    "recommendedHumidity": 70.0,
    "recommendedTemperature": 18.0,
    "wrapperColor": null,
    "dataSource": "seed-csv",
    "reviewSummary": { "count": 3, "avgOverall": 8.3, "avgPre": 8.0, "avgMid": 8.5, "avgPost": 8.0 }
  }
}
```

不存在 → `404 NOT_FOUND`

## 4. 风味字典 `/api/flavors`

→ `200` `{ "flavors": [ { "id": 1, "name": "Cedar", "label": "雪松木", "category": "woody", "categoryLabel": "木香", "count": 12 } ] }`

## 5. 鉴定与工具

### 5.1 病害诊断 `/api/tools/diagnostic`

诊断题目由服务端下发，前端不硬编码。

`GET /api/tools/diagnostic` → `200`

```jsonc
{
  "questions": [
    {
      "id": 1, "question": "你看到了什么？", "type": "grid",
      "options": [
        { "value": "mold", "icon": "🦠", "label": "白色/灰色毛状物", "desc": "可能是发霉" }
      ]
    },
    {
      "id": 2, "question": "霉菌分布在哪里？", "type": "list",
      "dependsOn": { "questionId": 1, "value": "mold" },
      "options": [ { "value": "mild", "icon": "🔍", "label": "零星小白点", "desc": "直径<2mm" } ]
    }
  ]
}
```

`POST /api/tools/diagnostic` body `{ "answers": { "1": "mold", "2": "mild" } }` → `200`

```jsonc
{
  "diagnosis": {
    "key": "mold:mild",
    "icon": "🔬",
    "title": "轻度霉菌",
    "subtitle": "发现得早，很容易挽救",
    "tone": "warning",                  // safe | warning | danger
    "survival": 95,                     // 预估存活率 %
    "severity": { "level": "mild", "label": "轻度", "percent": 25, "tone": "warning" },
    "steps": [ "用干净的超细纤维布轻轻擦拭霉点…" ],
    "notice": "以上为经验性建议，不构成专业鉴定意见。"
  }
}
```

无法判定 → `200` 且 `diagnosis.key = "unknown"`，`survival: 0`。

### 5.2 风味人格测试 `/api/tools/flavor-test`

`GET /api/tools/flavor-test` → `200` `{ "questions": [ { "id": 1, "question": "…", "options": [ { "value": 1, "label": "雪松木", "category": "woody" } ] } ] }`

`POST /api/tools/flavor-test` body `{ "answers": [1, 5, 9, 12, 15] }`（风味 id 数组）→ `200`

```jsonc
{
  "result": {
    "key": "woody", "title": "雪松木型鉴赏家", "icon": "🪵",
    "description": "…", "traits": ["沉稳", "注重细节", "偏好结构感"],
    "recommended": [ { "id": 1, "brand": "Cohiba", "vitola": "Robustos" } ],
    "scores": [ { "category": "woody", "label": "木香", "score": 60, "percent": 60 } ]
  }
}
```

### 5.3 醇化计算器 `/api/tools/aging-calc`

`GET /api/tools/aging-calc` → `200` `{ "cigars": [ { "id": 1, "label": "Cohiba Robustos", "strength": 4 } ] }`（供下拉选择）

`POST /api/tools/aging-calc` body

```jsonc
{
  "cigarId": 1,            // 与 strength 二选一
  "strength": 4,           // 1-5
  "currentAgeMonths": 6,   // 已醇化月数
  "humidity": 68,          // 当前湿度 %
  "temperature": 18        // 当前温度 ℃
}
```

→ `200`

```jsonc
{
  "result": {
    "peakFromMonths": 36, "peakToMonths": 60,
    "yearsToPeak": 2.5,
    "status": "aging",                      // fresh | aging | peak | past-peak
    "statusLabel": "醇化中",
    "advice": [ "…" ],
    "environment": { "humidity": { "ok": true, "target": "65-72%" }, "temperature": { "ok": true, "target": "16-20℃" } }
  }
}
```

### 5.4 敏感词预检 `/api/tools/check-text`

发帖前实时提示（无需登录）。

`POST /api/tools/check-text` body `{ "text": "…" }` → `200`

```jsonc
{ "action": "clean", "matched": [], "message": null }
```
`action` ∈ `clean | warned | queued | blocked`。

## 6. 品吸笔记

### 6.1 列表 `GET /api/reviews`

查询参数：`cigarId`、`userId`、`sort`（`helpful` 默认 / `newest` / `rating`）、`page`、`pageSize`。

→ `200` `{ "items": [ …review… ], "total": 0, "page": 1, "pageSize": 12, "totalPages": 0 }`

```jsonc
{
  "id": 1, "cigarId": 1, "cigarLabel": "Cohiba Robustos",
  "userId": 1, "username": "admin", "avatarUrl": null,
  "title": "…", "content": "…",
  "preScore": 8, "midScore": 9, "postScore": 8,
  "burnEvenness": 9, "drawResistance": 8,
  "overallRating": 8.5,
  "smokingTime": 65, "pairing": "单一麦芽威士忌",
  "humidityAtSmoke": 68.0, "restTimeDays": 30,
  "helpfulCount": 3, "helpfulByMe": false,
  "status": 1, "createdAt": "2026-06-08T10:00:00Z"
}
```

### 6.2 创建 `POST /api/reviews`（需登录）

```jsonc
{
  "cigarId": 1, "title": "…", "content": "…",
  "preScore": 8, "midScore": 9, "postScore": 8,
  "burnEvenness": 9, "drawResistance": 8,
  "overallRating": 8,             // 必填，1-10
  "smokingTime": 65, "pairing": "…",
  "humidityAtSmoke": 68, "restTimeDays": 30
}
```

- 命中红线 → `403 CONTENT_REJECTED`，`details.matched` 为命中词数组，内容不入库
- 命中审核词 → `202 CONTENT_QUEUED`，内容以 `status:-1` 入库，不公开
- 正常 → `201`，返回 `{ "review": { … }, "sensitivity": { "action": "clean", "matched": [] } }`

### 6.3 有用投票 `POST /api/reviews/:id/helpful`（需登录）

→ `200` `{ "helpfulCount": 4, "helpfulByMe": true }`；重复投票为幂等切换（取消投票）。

## 7. 内容投稿

### 7.1 提交 `POST /api/submissions`（需登录）

```jsonc
{
  "brand": "Cohiba", "series": "…", "vitola": "…",
  "originType": "cuban", "countryCode": "CU",
  "lengthInch": 4.9, "ringGauge": 50, "strength": 4,
  "wrapperVariety": "Corojo", "flavorIds": [1, 5],
  "description": "…", "note": "投稿说明"
}
```

→ `202` `{ "submission": { "id": 7, "status": "pending", "createdAt": "…" }, "sensitivity": { "action": "clean", "matched": [] } }`
命中红线 → `403 CONTENT_REJECTED`。

### 7.2 我的投稿 `GET /api/submissions/mine`（需登录）

→ `200` `{ "items": [ { "id": 7, "status": "pending", "rejectReason": null, "createdAt": "…", "payload": { … } } ] }`

## 8. 认证

| 方法 | 路径 | body | 返回 |
|---|---|---|---|
| POST | `/api/auth/register` | `{ username, password, email? }` | `201 { user }` |
| POST | `/api/auth/login` | `{ username, password }` | `200 { user }` |
| POST | `/api/auth/logout` | — | `200 { ok: true }` |
| GET | `/api/auth/me` | — | `200 { user }` 或 `200 { user: null }` |

`user` 结构：`{ "id": 1, "username": "admin", "role": "admin", "avatarUrl": null, "bio": "…", "createdAt": "…" }`

用户名规则：3-24 位，字母/数字/下划线/中文。口令：≥8 位且非纯数字。
注册重复 → `409 CONFLICT`。注册/登录限流：每 IP 每分钟 10 次 → `429 TOO_MANY_REQUESTS`。

## 9. 合规

### 9.1 年龄门 `POST /api/gate/verify` body `{ "adult": true }`

→ `200 { "ok": true }` 并下发 `cc_age` Cookie（30 天）。`adult:false` → `403 FORBIDDEN`，不下发。

### 9.2 健康检查 `GET /api/health`

→ `200 { "ok": true, "version": "1.1.0", "uptime": 123.4, "db": "ok", "env": "development" }`

### 9.3 静态内容

`GET /api/content/plume-vs-mold` → `200 { "title": "…", "html": "…" }`（读取 `content/plume-vs-mold-guide.html`）

---

## 前端实现约定

1. **必须**通过 `web/src/api/client.js` 的封装调用，不要散落裸 `fetch`。
2. **必须**处理 `403 CONTENT_REJECTED`（展示 `details.matched` 命中词）与 `202 CONTENT_QUEUED`（提示进审核队列）。
3. **不得**在前端硬编码产地/型号/风味/强度选项 —— 一律来自 `/api/meta`。
4. 金额字段 `priceCny` 为**人民币估算价**，页面上必须标注「参考价，非交易报价」。
5. 所有涉及内容的页面必须有免责声明组件 `<DisclaimerBar />`。
