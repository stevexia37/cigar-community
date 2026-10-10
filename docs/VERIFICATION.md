# 独立验收报告 · cigar-community v1.1.0

> ⚠️ **本报告是修复前的历史记录，保留作为证据。修复状态见下方《修复记录》。**

---

## 修复记录（验收后处理）

验收报告的 5 项严重缺陷与主要中等缺陷**已全部修复**，并补充了防回归断言。
每条都附「修复方式」与「对应的回归断言」，便于日后核查。

| 编号 | 问题 | 修复方式 | 回归断言 |
|---|---|---|---|
| **S1** | 一句废话即可豁免整句红线（实测违规内容 `status=1` 公开） | 豁免改为**邻近性判定**：否定词须紧邻命中词；安全词须落在命中词附近窗口。并**排除命中词本身** | `sensitive.test.mjs` 的「一句废话不能豁免整句红线」「豁免必须邻近」 |
| **S2** | 6 类绕过有效（繁体/拼音/缩写/同音/标点/emoji/拆字） | 归一化补齐：繁体映射、变体词表（拼音/缩写/同音）、全标点与 emoji 折叠；改为**单遍最长匹配**替换 | 「变体绕过必须识破」9 例 |
| **S3** | 伪造 `X-Forwarded-For` 绕过限流（14/14 注册成功） | `CC_TRUST_PROXY` 默认改为 **0**（不信任），启动时打印告警 | 冒烟 §11「伪造 XFF 无法绕过限流」 |
| **S4** | 正常表述被 403 硬拦（飞机/dg/拼车/转账/性价比…） | 日常词降级到**审核队列**；红线词表收缩到「交易意图明确」；新增**组合规则**（交易词+联系方式=红线）补回强度 | 「日常词不得进红线」7 例 + 「短 ASCII 要求词边界」 |
| **S5** | 分页参数稳定 500（`pageSize=1.5`、`page=1e18`…） | 抽出 `server/lib/query.js`，统一取整与上界钳制（原先 `paginate` 在两处重复，bug 也重复了两份） | 冒烟 §11 分页 8 例 |
| **M1** | `Padron` / `Padrón` 被拆成两个品牌，同一支雪茄重复计数（42→实为 40） | 品牌名 Unicode 归一化（NFKC + 去变音符号）后匹配 | 「品牌已按 Unicode 归一化去重」 |
| **M3** | 改口令不失效既有会话 | 改口令后删除该用户其它会话，保留当前会话。**根因是 `readSession` 的 SQL 重名列**（`s.id AS sid, u.id` —— node:sqlite 只保留最后一个同名列，导致 `sessionId` 串成用户 id） | 「改口令踢掉其它会话」+「旧口令失效、新口令可用」 |
| **M4** | `Content-Type: text/plain` 时预检静默返回 `clean` | API 写接口只接受 JSON，否则明确 **415**（不再返回字段全空的对象） | 「非 JSON 内容类型返回 415」 |
| **M5** | `202 CONTENT_QUEUED` 响应体缺 `code` 字段 | 补齐 `code: "CONTENT_QUEUED"` | 冒烟 §7 审核队列断言 |
| **M6** | 冒烟测试两条**空洞断言**（穿越与凭证泄漏检查实际无效） | 穿越改用 `curl --path-as-is` 并断言「未读到目标文件内容」；凭证检查改为遍历真实认证接口 | 冒烟 §10 |
| **M7/M8** | `origin=mars` 静默返回全部；`minRating=abc` 静默 0 条 | 显式校验并返回 `400 UNKNOWN_ORIGIN` / `INVALID_MIN_RATING` / `INVALID_ID` | 冒烟 §11 |

### 修复过程中新发现并一并修掉的问题

| 问题 | 说明 |
|---|---|
| **关键词自我豁免** | 豁免表与规则词表耦合时，`加微` 会命中豁免表里的 `加微` 从而豁免自己 → 交易信息整段放行。现已把豁免表限定为**保护性语义词**，并加结构性断言禁止两表重合 |
| **变体替换级联** | 配置里 `"微❤" → "微信"` 在归一化剥离 emoji 后变成单字→多字映射，导致任何含「微」的词被改写成「微信信」 |
| **评分量纲混用** | 笔记是 1-10 分、雪茄是 1-5 星，早期把笔记均分直接写进 `rating`，出现「8.0 星」。现分离 `base_rating` 并做折算 |
| **种子笔记数冒充用户产出** | 原型数据的「167 篇笔记」不是本站用户产出，现已分离 `seed_review_count`，前端标注为「参考」 |
| **CSV 非规范转义** | 上游用 JSON 式 `\"` 转义，导致描述里出现可见反斜杠 |
| **型号家族误判** | `Double Corona` 被判成 `corona`；`BHK 52` 被判成贝利科索（区间表顺序导致）。修正后 belicoso 从 18 款降到 7 款，罗布图筛选才准确 |
| **测试端口冲突** | `test-e2e.sh` 原用 18789 作测试端口，而该端口被本机一个无关常驻服务占用 → 测试静默打到那个服务上，断言时对时错。现探测端口时校验「响应是否来自本应用」 |

### 修复后的验证结果

```
npm test              → 40/40 通过（含防回归断言）
npm run test:e2e      → 162/162 契约断言 + 隔离库 + 单测，exit 0
npm run verify:ui     → 45/45 前端 DOM 断言，exit 0
npm run preflight     → 35 通过 / 0 失败 / 1 警告（仅「未找到 .env」，属新克隆正常状态）
```

---

# 原始验收报告（修复前基线，保留作为证据）

> 验收人：独立验收测试员（未参与开发，只读验收）
> 验收时间：2026-10-10
> 方法：全部结论均以**独立临时库 + 独立端口**实测得到，未使用开发库 `database/cigar.db`，未修改任何项目文件。
> 环境：Node v26.8.1、npm 11.19.0、无 pnpm、未安装任何新依赖。
>
> ## ⚠️ 验收基准与版本漂移说明（必读）
>
> 验收期间检测到**另一个 agent 正在并发修改同一仓库**。本报告全部结论基于基线
> `git 65c86b2`（初始提交）+ 验收开始时的脏工作树；我在**报告定稿前又对最终工作树逐条复验了一次**，
> 结论如下（避免把已修的问题当成未修）：
>
> | 编号 | 最终工作树复验结果 |
> |---|---|
> | S1 豁免滥用 | **仍复现**：`违规出茄加微信。`、`不错的茄，出茄加微信私聊我。` 复验仍为 `clean` |
> | S2 绕过矩阵 | **仍复现**：`代購一批，联系我`、`weixin 联系我详聊`、`出😀茄`、`出，茄` 复验仍为 `clean` |
> | S3 XFF 限流绕过 | **仍复现**（`server/config.js`、`server/lib/http.js` 未被改动） |
> | S4 误杀 | **仍复现**：`飞机`/`dg`/`拼车` 仍 `blocked` |
> | S5 分页 500 | **仍复现**：`pageSize=1.5`/`page=1.1`/`page=1e18`/`page=999999999999999999` 在 `/api/cigars` 与 `/api/reviews` 上仍全部 500（该轮服务端日志 6 条 `[500]`） |
> | M1 品牌未去重 | **仍复现**：`Padron` 与 `Padrón` 并存，`stats.brands=22` |
> | M2 型号家族错判 | **并发方在我验收期间做了部分修复** → 已在下方 M2 改写为修复后的实测数据与残留问题 |
> | M7 `origin` 未知值 | **仍复现**：`origin=mars` → `total=42` 且 `applied.origin=['mars']` |
> | 测试数量 | 首次实测为「单元 15 / 冒烟 **131**」；最终工作树因并发方新增断言变为「单元 **27** / 冒烟 **137**」 |
>
> 另：并发方执行的 `pkill -f "node server/index.js"` 会连带杀掉我的隔离实例（日志里的 `[SIGTERM]` 即来自此），
> 故下表所有需要服务的用例均为「同一 shell 内起服 → 测 → 杀」。
> 并发修改对本报告的影响已逐项核对：`docs/API.md` 已同步补上新增字段 `seedReviewCount`（因此**不**计入文档不符），
> `server/lib/static.js`/`web/index.html` 的改动仅为 favicon 逻辑，与本次结论无关。

---

## 结论

**不可上线。** 契约层与鉴权层做得相当扎实（冒烟断言数量属实——我首次实测 **131/131** 全绿，验收结束时因并发方补测变为 137/137；未登录一律 401、登出即失效、篡改 Cookie 无效、
投票幂等、无用户名枚举、口令散列不外泄、路径穿越实际被挡住、无 SQL 注入），但**这个项目的核心卖点是
「合规熔断 + 不卖茄」，而这套熔断在实测中同时失效于两个方向**：一边是可被一行字（`违规`/`不`/`审核`/`案例`）
彻底豁免、并被繁体字/拼音/emoji/中文标点等至少 6 类手法绕过，实测**违规交易内容以 `status=1` 公开发布**；
另一边是**正常表述被 403 硬拦**（「我坐飞机去哈瓦那，飞机上不能抽雪茄」发不出去）。再叠加**限流可被
`X-Forwarded-For` 伪造绕过（14/14 批量注册成功、0 次 429）**与**分页参数直接 500**，合规与抗滥用两条底线都不成立。
数据库层面还有品牌未去重导致的重复雪茄、以及型号家族仍存在的错判（`Oliva Double Robusto`、`Petit Royale`
被判为「双科罗娜」）。建议修完严重项再复验。

---

## 严重缺陷（必须修）

### S1. 合规豁免逻辑可被一句废话完全豁免，违规交易内容实测公开发布

- **现象**：`sensitive.js` 的 `isWhitelisted()` / `isNegated()` 把「安全语境」和「否定词」判定为**整句 + 前缀子串包含**，
  且 `safe_context_regex` 生效于整句。结果是只要句子里出现 `违规 / 审核 / 案例 / 警惕 / 避免 / 不要 / 不` 中任意一个，
  **该句内所有红线词一律豁免**。8 种滥用写法 8/8 返回 `clean`。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  node --input-type=module -e "
  import {scan} from './server/lib/sensitive.js';
  for (const t of ['违规出茄加微信。','审核通过，有货私聊加微信。','这是一个案例：出茄加微信私聊。',
                   '警惕假货，有货私聊加微信。','避免踩坑，有货私聊加微信。','不要太贵，出茄加微信。',
                   '不知道还有没有，出茄找我。','不错的茄，出茄加微信私聊我。'])
    console.log(scan(t).action.padEnd(8), t);"
  ```
- **实际输出**
  ```
  clean    违规出茄加微信。
  clean    审核通过，有货私聊加微信。
  clean    这是一个案例：出茄加微信私聊。
  clean    警惕假货，有货私聊加微信。
  clean    避免踩坑，有货私聊加微信。
  clean    不要太贵，出茄加微信。
  clean    不知道还有没有，出茄找我。
  clean    不错的茄，出茄加微信私聊我。
  ```
- **端到端确认（POST /api/reviews，登录用户）**：上述 8 条全部 `HTTP 201` + `action=clean` + `status=1`。
  直接查库确认它们已成为**公开笔记**：
  ```
  # 隔离库 reviews 表（节选）
  #13 u5 status=1 content="不错的茄，出茄加微信私聊我。"
  #15 u5 status=1 content="审核通过，有货私聊加微信。"
  #17 u5 status=1 content="警惕假货，有货私聊加微信。"
  #18 u5 status=1 content="避免踩坑，有货私聊加微信。"
  ...（#13–#20 八条全部 status=1）
  ```
- **影响**：红线的存在意义被归零。任何人写「违规出茄加微信」即可公开贴出交易信息。
  这是整个项目立项的前提（`config/sensitive-words.json` 的 `immediate_ban._action`），属致命级。
- **建议修法**：① 安全语境改为**命中词 ±N 字窗口**（配置注释本来写的就是「前后 4 字窗口」），不要整句；
  ② 否定词只允许**紧邻命中词之前 ≤3 字**，且排除「不」这类单字（否则「不错/不知道/不要太贵」全部误豁免）；
  ③ 豁免只对 `flag_and_warn` 生效，对 `immediate_ban` 绝不豁免——「举报代购」这类正当讨论应由人工审核兜底，
  而不是让红线词直接放行；④ 补上「逗号不断句」的用例（现在 `，` 不在 `SENTENCE_ENDS` 里）。

### S2. 敏感词抗绕过存在至少 6 类有效手法，实测违规内容公开发布

- **现象**：归一化只处理了「全角/大小写/零宽/空白与 `·-_*~^|/\.`」，未处理**繁体字、拼音、英文缩写、同音字、
  中文标点、emoji/假名插字、base64、拆字加括号**。11 种绕过 11/11 成功。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  node --input-type=module -e "
  import {scan} from './server/lib/sensitive.js';
  const cases=[['繁体 代購','代購一批，联系我'],['繁体 現貨','現貨充足，欢迎咨询'],
   ['拼音 weixin','weixin 联系我详聊'],['缩写 wx','加 wx 详聊'],['拼音 daigou','daigou 拼一批'],
   ['同音 威信','加威信详聊'],['中文逗号 出，茄','出，茄，价格好谈'],['顿号 私、聊','私、聊我'],
   ['emoji 出😀茄','出😀茄'],['base64','5Ye66IyE6IGU57O75oiR'],['拆字 出【茄】','出【茄】甩']];
  for (const [n,t] of cases) console.log(scan(t).action.padEnd(8), n.padEnd(18), JSON.stringify(scan(t).matched));"
  ```
- **实际输出**（全部 `clean`，`matched=[]`）
  ```
  clean    繁体 代購            []
  clean    繁体 現貨            []
  clean    拼音 weixin          []
  clean    缩写 wx              []
  clean    拼音 daigou          []
  clean    同音 威信            []
  clean    中文逗号 出，茄        []
  clean    顿号 私、聊           []
  clean    emoji 出😀茄          []
  clean    base64              []
  clean    拆字 出【茄】          []
  ```
- **端到端确认**：以上 11 条经 `POST /api/reviews` 全部 `HTTP 201` + `status=1`（仅「出，茄，价格好谈」因
  额外命中 `价格` 变为 202 入队）。库内确认为公开笔记 `#2 代購一批，联系我` / `#3 現貨充足，欢迎咨询` /
  `#4 weixin 联系我详聊` / `#9 私、聊我` / `#10 出😀茄` / `#12 出【茄】甩` 等。
- **影响**：与 S1 同级。**繁体字与拼音/缩写是最现实的绕过路径**——港澳台及国内茄友本就用「代購/現貨/weixin/wx」。
- **建议修法**：① 补一份「繁→简」映射表（或用 OpenCC 数据表离线内联，仍零依赖）；② 关键红线词补
  `拼音 / 拼音首字母 / 常见同音字` 变体表（`weixin|wx|weixinhao|威信|薇信|v信|徵信` 等）；
  ③ 归一化阶段把**全部标点、emoji、代理对、非中日韩/非 ASCII 字母**折叠掉（现在 emoji 会被原样保留成两个代理码元，
  反而成了分隔符）；④ 红线词做**跳过 N 个任意字符的宽松匹配**（如「出.{0,3}茄」）以覆盖插字；
  ⑤ 在 `check-text` 上明确声明「本预检不是安全边界」，同时后端以审核队列兜底而非依赖同步拦截。

### S3. 限流可被 `X-Forwarded-For` 伪造绕过 —— 批量注册与口令爆破无阻碍

- **现象**：`clientIp()` 在 `trustProxy > 0` 时直接采信请求头 `X-Forwarded-For`；而 `CC_TRUST_PROXY` 默认就是 `1`
  （`server/config.js:44`，`.env.example:30`）。**在没有反向代理的默认部署下，攻击者自带 XFF 即可每次换一个桶。**
- **复现命令**（同一 shell 起服，故意不设 `CC_RATE_LIMIT_DISABLED`）
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  D=$(mktemp -d); export CC_DB_PATH="$D/rl.db" CC_QUIET=1; node scripts/seed.mjs >/dev/null
  export CC_DB_PATH="$D/rl.db" CC_PORT=18992 CC_SECRET=verify-secret-1234567890
  node server/index.js >/dev/null 2>&1 & SRV=$!
  for i in $(seq 1 40); do curl -fsS http://127.0.0.1:18992/api/health >/dev/null 2>&1 && break; sleep 0.25; done
  B=http://127.0.0.1:18992
  echo "A) 同一来源 IP 连续登录："
  for i in $(seq 1 14); do curl -sS -o /dev/null -w '%{http_code} ' -X POST $B/api/auth/login \
    -H 'content-type: application/json' -d '{"username":"admin","password":"wrongpass"}'; done; echo
  echo "B) 轮换伪造 XFF 连续登录："
  for i in $(seq 1 15); do curl -sS -o /dev/null -w '%{http_code} ' -X POST $B/api/auth/login \
    -H 'content-type: application/json' -H "X-Forwarded-For: 10.9.9.$i" -d '{"username":"admin","password":"wrongpass"}'; done; echo
  echo "C) 轮换伪造 XFF 批量注册："
  ok=0; lim=0
  for i in $(seq 1 14); do st=$(curl -sS -o /dev/null -w '%{http_code}' -X POST $B/api/auth/register \
    -H 'content-type: application/json' -H "X-Forwarded-For: 172.16.0.$i" -d "{\"username\":\"batchrl$i\",\"password\":\"Passw0rd123\"}")
    [ "$st" = 201 ] && ok=$((ok+1)); [ "$st" = 429 ] && lim=$((lim+1)); done
  echo "  注册成功=$ok/14 被限流=$lim"; kill $SRV
  ```
- **实际输出**
  ```
  A) 同一来源 IP 连续登录：
  401 401 401 401 401 401 401 401 401 401 429 429 429 429       ← 限流确实生效（第 11 次起 429）
  B) 轮换伪造 XFF 连续登录：
  401 401 401 401 401 401 401 401 401 401 401 401 401 401 401   ← 15 次全部放行
  C) 轮换伪造 XFF 批量注册：
    注册成功=14/14 被限流=0
  ```
- **影响**：直接违背 `docs/API.md §8`（「每 IP 每分钟 10 次 → 429」）与 `deployment/checklist.md §1.1.5`
  （「脚本无法批量注册」）。登录没有验证码、没有锁定，限流是**唯一**的爆破防线，绕过即等于无防线。
- **建议修法**：① 默认 `CC_TRUST_PROXY=0`（不信任任何 XFF）——直连部署本来就该取 `socket.remoteAddress`；
  ② 或在生产模式强制要求显式配置信任层数，并在 `assertProductionSafety()` 里对「未配置反代却 trustProxy>0」告警；
  ③ 反代层用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` 时确保边缘会**覆盖**客户端传入值
  （`config/nginx-security-headers.conf:80` 与 `docs/DEPLOYMENT.md:150` 已有该指令，但缺「边缘必须剥离客户端伪造值」的说明）；
  ④ 补一条冒烟断言：带随机 XFF 的连续登录必须仍然 429。

### S4. 正常表述被硬拦（403），用户发不出帖

- **现象**：`immediate_ban` 词表过于宽泛且是**子串匹配**，大量日常词汇被当成交易红线直接 403。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  node --input-type=module -e "
  import {scan} from './server/lib/sensitive.js';
  for (const t of ['我坐飞机去哈瓦那，飞机上不能抽雪茄。','This improved my knowledge of cigar aging.',
                   '和茄友拼车去看雪茄展。','求茄友推荐一支入门茄。','朋友转账给我让我帮他带一支。',
                   '这款暂时没货，有货了通知你。','有事可以私聊我。','他把闲置的茄便宜出售了。',
                   '这支茄性价比很高，值得回购。','请问行货和水货在养护上有区别吗？'])
    { const r=scan(t); console.log(r.action.padEnd(8), JSON.stringify(r.matched), t); }"
  ```
- **实际输出**
  ```
  blocked  ["飞机"]        我坐飞机去哈瓦那，飞机上不能抽雪茄。
  blocked  ["dg"]          This improved my knowledge of cigar aging.
  blocked  ["拼车"]        和茄友拼车去看雪茄展。
  blocked  ["求茄"]        求茄友推荐一支入门茄。
  blocked  ["转账"]        朋友转账给我让我帮他带一支。
  blocked  ["有货"]        这款暂时没货，有货了通知你。
  blocked  ["私聊"]        有事可以私聊我。
  blocked  ["便宜出","闲置"] 他把闲置的茄便宜出售了。
  queued   ["性价比"]      这支茄性价比很高，值得回购。
  queued   ["行货","水货"]  请问行货和水货在养护上有区别吗？
  ```
  端到端一致：以上前 8 条经 `POST /api/reviews` 返回 **403 `CONTENT_REJECTED`**（不是 202），
  后 2 条返回 **202（status=-1 不公开）**——即「性价比很高」这种最普通的评价也不会公开显示。
- **影响**：对一个 UGC 社区，误杀比漏放更致命——用户第一次发帖就被「本站不参与任何烟草交易」的提示挡住，
  直接流失。`飞机`（坐飞机）、`dg`（knowledge/badge 等英文词的子串）、`拼车`（拼车）、`求茄`（求茄友推荐）
  都是几乎必然会被正常用户写出来的词。
- **建议修法**：① `dg` 必须改成**词边界匹配**（`\bdg\b`），否则任何含 `dg` 的英文单词全中；② `飞机`/`拼车`/`转账`/
  `清仓`/`跨境`/`收款` 从红线降级为 `audit_required`（或加领域限定，如 `飞机` 仅在与 `带/寄/走` 同现时命中）；
  ③ 引入 **命中词组合规则**（单命中入队、双命中才拦），避免单词误杀；④ 给 `immediate_ban` 加「不得为常用词」的
  运维校验（可写成一个单测：把常用词表过一遍，命中即测试失败）。

### S5. 分页参数触发 500（INTERNAL_ERROR），且冒烟测试覆盖不到

- **现象**：`paginate()` 用 `Math.max/Math.min` 钳制但**从不取整**，也**不校验上界**，导致
  `LIMIT/OFFSET` 收到小数或超出 int64 的值，`node:sqlite` 抛 `ERR_SQLITE_ERROR: datatype mismatch` → 500。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  D=$(mktemp -d); export CC_DB_PATH="$D/v.db" CC_PORT=18991 CC_RATE_LIMIT_DISABLED=1 CC_QUIET=1
  node scripts/seed.mjs >/dev/null; node server/index.js > "$D/s.log" 2>&1 & SRV=$!
  for i in $(seq 1 40); do curl -fsS http://127.0.0.1:18991/api/health >/dev/null 2>&1 && break; sleep 0.25; done
  for q in "pageSize=1.5" "page=1.1" "page=1e18" "page=999999999999999999"; do
    printf '%-26s -> %s\n' "$q" "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:18991/api/cigars?$q")"; done
  for q in "pageSize=1.5" "page=999999999999999999" "page=1e18"; do
    printf 'reviews %-18s -> %s\n' "$q" "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:18991/api/reviews?$q")"; done
  grep -m2 -A3 'datatype mismatch' "$D/s.log"; kill $SRV
  ```
- **实际输出**
  ```
  pageSize=1.5               -> 500
  page=1.1                   -> 500
  page=1e18                  -> 500
  page=999999999999999999    -> 500
  reviews pageSize=1.5             -> 500
  reviews page=999999999999999999  -> 500
  reviews page=1e18                -> 500

  [500] Error: datatype mismatch
      at query (.../server/db/index.js:66:31)
      at Object.handler (.../server/api/cigars.js:49:16)
    code: 'ERR_SQLITE_ERROR', errcode: 20
  ```
  三连复现确认稳定 500（非偶发）。另外 `page=1.5` 会以 `200` 返回**小数 `page`**（违反契约「page 从 1 开始」的整数语义）。
- **影响**：任何前端/爬虫/压测工具传小数或超大页码即得 500；`/api/cigars` 是最热的接口。
  更严重的是 **`scripts/api-smoke.sh` 只测了 `pageSize=99999`（会被钳到 60，正常）**，
  完全没覆盖小数与 int64 溢出，所以这个 500 能带着「冒烟全绿」（131/131，并发补测后 137/137）上线。
- **建议修法**：`const toInt=(v,d)=>{const n=Number(v); return Number.isInteger(n)&&n>=1?n:d}`，
  `page` 上限钳到 `Math.max(1, Math.ceil(maxRows/pageSize))`；`pageSize` 统一 `Math.floor` 并钳 1..60；
  溢出（`offset > 2**53`）时直接返回空列表而非下传数据库。`api-smoke.sh` 补 `pageSize=1.5`、`page=1e18` 断言。

---

## 中等缺陷

### M1. 品牌未按归一化去重：`Padron` 与 `Padrón` 被拆成两个品牌，产生重复雪茄

- **现象**：`server/seed.js` 的合并键是 `(brand.name, series, vitola)` 的**字符串精确匹配**，未做 Unicode 归一化。
  CSV 用 `Padron`、`mock-cigars.json` 用 `Padrón`，于是同品牌被创建两次，同型号雪茄入库两条。
- **复现命令**（隔离库 seed 后查库）
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  D=$(mktemp -d); CC_DB_PATH="$D/d.db" node scripts/seed.mjs >/dev/null
  CC_DB_PATH="$D/d.db" node --input-type=module -e "
  import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.env.CC_DB_PATH);
  console.log(db.prepare(\"SELECT id,name FROM brands WHERE name LIKE 'Padr%'\").all());
  console.log(db.prepare(\"SELECT c.id,c.brand_id,c.series,c.vitola,c.data_source FROM cigars c WHERE c.vitola IN ('Exclusivo','No.9')\").all());"
  ```
- **实际输出**
  ```
  [ { id: 5, name: 'Padron' }, { id: 12, name: 'Padrón' } ]
  [ { id: 13, brand_id: 5,  series: '1964 Anniversary', vitola: 'Exclusivo', data_source: 'seed-csv' },
    { id: 28, brand_id: 12, series: '1964 Anniversary', vitola: 'Exclusivo', data_source: 'mock' },
    { id: 14, brand_id: 5,  series: '1926 Serie',        vitola: 'No.9',      data_source: 'seed-csv' },
    { id: 29, brand_id: 12, series: '1926 Serie',        vitola: 'No.9',      data_source: 'mock' } ]
  ```
- **影响**：`ROADMAP.md` 写「42 款」，实际去重后应为 40 款；`/api/meta` 的 `stats.brands` = 22（应为 21），
  品牌筛选里同时出现 `Padron` 和 `Padrón`；`/api/cigars` 列表出现同一支茄两次。
- **建议修法**：合并键改为 `normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()` 后的品牌名；
  或在 seed 阶段建立 brand 别名表（`Padrón→Padron`）。补一条断言：品牌名归一化后必须唯一。

### M2. 型号家族（`vitolaFamily`）仍然错判：根因是「只按环径」的兜底循环 + 表顺序敏感

> **本条已按最终工作树改写。** 并发方在我验收期间把 `VITOLA_FAMILIES` 重新排序并补了
> `Double Corona` 的文本判断，因此我首次实测的「`belicoso` 占 18/42、`Double Corona → corona`」
> **已被修掉**（现为 `belicoso=7`、`Montecristo Double Corona → double_corona` ✓）。
> 但错判没有消失，只是**被挪到了另一个家族**，且根因未除。

- **现象**：`detectVitolaFamily()` 的区间匹配有两轮——第一轮同时看环径+长度，第二轮**只看环径**：
  ```js
  for (const f of VITOLA_FAMILIES) if (rg >= f.rg[0] && rg <= f.rg[1]) return f.value;   // ← 只看 rg
  ```
  第二轮的结果**完全取决于 `VITOLA_FAMILIES` 的书写顺序**，而该表的 `rg` 区间大量重叠
  （`double_corona` 45–55、`robusto` 48–54、`belicoso` 50–56、`torpedo` 50–58、`churchill` 44–52）。
  重排只是把「谁先被兜底吞掉」从一个家族换到另一个家族：修好 `belicoso` 泛滥，就制造出 `double_corona` 泛滥。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  D=$(mktemp -d); CC_DB_PATH="$D/d.db" node scripts/seed.mjs >/dev/null
  CC_DB_PATH="$D/d.db" node --input-type=module -e "
  import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.env.CC_DB_PATH);
  console.log('分布:',JSON.stringify(db.prepare('SELECT vitola_family f,COUNT(*) n FROM cigars GROUP BY f ORDER BY n DESC').all()));
  for(const r of db.prepare(\"SELECT c.id,b.name,c.vitola,c.vitola_family,c.ring_gauge rg,c.length_inch len FROM cigars c JOIN brands b ON b.id=c.brand_id WHERE c.vitola LIKE '%Double%' OR c.vitola LIKE '%Petit%' OR c.vitola LIKE '%Wide%'\").all())
    console.log(' #'+r.id, r.name, r.vitola, 'rg='+r.rg, 'len='+r.len, '->', r.vitola_family);"
  ```
- **实际输出（最终工作树）**
  ```
  分布: [{"f":"robusto","n":22},{"f":"belicoso","n":7},{"f":"gordo","n":4},{"f":"double_corona","n":3},
         {"f":"churchill","n":2},{"f":"corona","n":2},{"f":"lancero","n":1},{"f":"petit_corona","n":1}]

   #6  Montecristo Double Corona      rg=49 len=7.5 -> double_corona   ✓（本轮已修好）
   #23 Romeo y Julieta Petit Royale   rg=50 len=4.0 -> double_corona   ✗（"Petit Royale" 尺寸上是 petit 系/罗布图，被 rg-only 兜底吞成双科罗娜）
   #33 Oliva Double Robusto           rg=54 len=5.0 -> double_corona   ✗（"Double Robusto" 是罗布图，被 `robusto`+`double` 规则判成双科罗娜）
   #22 Romeo y Julieta Wide Churchill rg=55 len=4.9 -> churchill       △（区间表只允许 belicoso，文本命中 churchill 优先于区间）
  ```
  与 `server/seed.js` 自带区间表逐条对照，仍有 3 条判定落在「区间表不允许的家族」上（上表后三条）。
- **影响**：`/api/meta` 的 `sizes` 是前端唯一的筛选来源（契约明确「前端不得硬编码」）。
  按「双科罗娜」筛会筛出 `Oliva Double Robusto`、`Petit Royale` 这两支明显不属于该型号的茄；
  `belicoso=7` 里也仍有 `Partagás No.4`（实为罗布图）等。
  同时 `server/api/meta.js` 的 `FAMILY_RANGES` 与 `server/seed.js` 的 `VITOLA_FAMILIES` 是**两份区间表**，
  必然继续漂移（这也是本次重排后判定结果与 meta 展示区间不一致的原因）。
- **建议修法**：① **删掉「只看 rg」的第二轮兜底**，或改为「第一轮无命中时返回 `other`」——
  宁可 `other` 也不要猜错；② 若必须保留兜底，应在多命中时选**长度区间也最接近**的那个，而不是「表里最先出现的」；
  ③ 把 `Double Robusto` 从 `double_corona` 规则里排除（`double` 只在 `corona` 语境下才成立）；
  ④ 让 `server/seed.js` 与 `server/api/meta.js` **共用同一份家族区间表**（现在两份，且注释都写着「勿随意调整」，属高危）；
  ⑤ 补断言：每支茄的 `vitolaFamily` 必须落在其自身环径/长度区间允许的集合内（本次 3 条失败即会被抓出）。

### M3. 修改口令不会失效既有会话

- **现象**：`POST /api/auth/password` 只更新 `users.password_hash`，不清理 `sessions`。
- **复现命令**
  ```bash
  B=http://127.0.0.1:18991   # 起一个隔离实例后执行
  curl -sS -o /dev/null -X POST $B/api/auth/login -H 'content-type: application/json' -c /tmp/jA -d '{"username":"admin","password":"admin12345"}'
  curl -sS -o /dev/null -X POST $B/api/auth/login -H 'content-type: application/json' -c /tmp/jB -d '{"username":"admin","password":"admin12345"}'
  curl -sS -o /dev/null -X POST $B/api/auth/password -b /tmp/jA -H 'content-type: application/json' \
    -d '{"currentPassword":"admin12345","newPassword":"NewAdminPass1"}'
  echo "改口令后用旧会话 B 访问："; curl -sS $B/api/auth/me -b /tmp/jB | head -c 60
  ```
- **实际输出**
  ```
  改口令后用旧会话 B 访问：
  {"user":{"id":1,"username":"admin","email":null,"role":"admi     ← 旧会话依然有效
  ```
- **影响**：账号疑似泄露时的标准处置「改口令踢下线」在本实现中无效，攻击者的 Cookie 继续可用（TTL 30 天）。
- **建议修法**：改口令成功后 `DELETE FROM sessions WHERE user_id = ?`（保留当前会话则排除 `req.user.sessionId`），
  并顺带视为口令重置入口。补断言：改口令后旧会话必须 401。

### M4. `Content-Type` 不对时 `check-text` 静默返回 `clean`（预检撒谎）

- **现象**：`readBody()` 在非 JSON/非 form 类型时把原始报文包成 `{text: raw}`。于是发
  `Content-Type: text/plain` + JSON 报文，`text` 变成整段 JSON 字符串，扫描结果为 `clean`。
- **复现命令**
  ```bash
  curl -sS -X POST http://127.0.0.1:18991/api/tools/check-text \
    -H 'content-type: text/plain' --data-binary '{"text":"有货私聊加微信"}'; echo
  curl -sS -X POST http://127.0.0.1:18991/api/tools/check-text \
    -H 'content-type: application/json' --data-binary '{"text":"有货私聊加微信"}'; echo
  ```
- **实际输出**
  ```
  {"action":"clean","matched":[],"message":null,"matches":[]}          ← 撒谎
  {"action":"blocked","matched":["私聊","有货"],...}                    ← 正确
  ```
- **影响**：前端实时提示会告诉用户「合规通过」，实际提交时才被 403，体验割裂；
  第三方集成若漏设 header 会得到**虚假的合规结论**。
- **建议修法**：`readBody()` 对未识别的 Content-Type 直接返回 `415 UNSUPPORTED_MEDIA_TYPE`，
  而不是猜测；`check-text` 额外校验 `typeof body.text === 'string'`（已做）并要求解析成功的 JSON。

### M5. `202 CONTENT_QUEUED` 不符合 `docs/API.md` 的错误码约定，前端相应分支是死代码

- **现象**：契约错误码表声明命中审核词返回 `code = CONTENT_QUEUED`；实际 202 响应体是 `{review, sensitivity}`，
  **顶层没有 `error`/`code`**。同时 `web/src/api/client.js` 只在 `!res.ok` 时抛 `ApiError`，而 **202 属 `res.ok`**，
  因此 `ApiError` 里的 `CONTENT_QUEUED` 分支永远不会执行。
- **复现命令**
  ```bash
  curl -sS -X POST http://127.0.0.1:18991/api/reviews -b /tmp/jar -H 'content-type: application/json' \
    -d '{"cigarId":1,"content":"请问这支多少钱一支？","overallRating":6}' -w '\n[HTTP %{http_code}]\n'
  ```
- **实际输出**
  ```
  {"review":{"id":24,...,"status":-1,...},"sensitivity":{"action":"queued","matched":["多少钱"],"message":"..."}}
  [HTTP 202]
  ```
- **影响**：契约与实现不一致（前端必须靠 `sensitivity.action` 或 `status:-1` 判断，而非契约写的 `code`）。
  实际前端 `ReviewFormView.isQueuedPayload()` **两条路都判了**，所以功能没坏——但 `client.js:28` 的分支是死代码，
  且契约错误码表在这一行是错的。属于「踩坑级」不一致。
- **建议修法**：二选一并同步契约——① 202 响应体加 `code:'CONTENT_QUEUED'`；② 或把错误码表里
  `CONTENT_QUEUED` 那行改为「非错误响应，见 §6.2 响应体 `sensitivity.action`」。

### M6. `scripts/api-smoke.sh` 有两处**空洞断言**，且在关键路径上没有断言

- **现象 A（路径穿越断言恒真，且我实测它其实是 `HTTP 200` 却在报「通过」）**
  `api-smoke.sh:393` 用 `curl "$BASE/../../etc/passwd"`；**curl 会在客户端先把 `..` 规范化掉**，服务端收到的
  其实是 `/etc/passwd`。实测：
  ```
  $ curl -sS -o /dev/null -w 'status=%{http_code} url=%{url_effective}\n' "$B/../../etc/passwd"
  status=200 url=http://127.0.0.1:18991/etc/passwd          ← 请求根本没带 '..'
  ```
  而 `200` 是 SPA 回退返回的 `index.html`。该断言的 `else` 分支只要响应里没有 `root:` 就算通过，
  于是它**以 HTTP 200 判为通过**（本次 e2e 输出正是「✓ 路径穿越未读到系统文件(HTTP 200)」）。
  真正的穿越防护是有效的（我用 `--path-as-is` 与多种编码实测均未读到仓库文件，见「我认为没问题的地方」），
  但这条断言**证明不了任何事**。
- **现象 B（口令散列泄漏断言检查错了响应体）**
  `api-smoke.sh:382` 先请求 `POST /api/tools/check-text '{"text":123}'`（得到 400 错误体），
  紧接着 `:386` 检查 `LAST_BODY` 是否含 `password_hash`/`scrypt$`。也就是说它检查的是
  **check-text 的报错文案**，而不是任何 `/api/auth/*` 响应。若能改成检查 `login`/`me` 的响应体才有意义。
- **现象 C（未覆盖已确认的 500）**：脚本测了 `pageSize=99999`（被正常钳制），但没测
  `pageSize=1.5` / `page=1e18`（实测 500，见 S5）。**「冒烟全绿」与「存在稳定 500」同时成立**，
  说明这套断言给人的信心高于其真实覆盖。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  export LC_ALL=C; bash scripts/test-e2e.sh 2>&1 | tail -20        # 见输出里的 HTTP 200 那行
  sed -n '378,402p' scripts/api-smoke.sh
  ```
- **建议修法**：① 穿越测试改用 `curl --path-as-is` 或 `%2e%2e%2f` 编码，并断言 `404/400`（当前实现确实返回 404，
  见实测）；② 口令泄漏断言移到 `login` 之后并检查该响应体；③ 补 `pageSize=1.5`、`page=1e18`、
  `origin=<未知值>`、`minRating=abc` 四类断言；④ 断言计数不应作为「覆盖充分」的证据公布。

### M7. `origin` 传未知值时筛选被静默忽略，但 `applied` 声称已应用

- **现象**：`buildCigarQuery()` 里 `origins` 先映射成国家 code，`if (codes.length)` 才加 WHERE。
  传入无法映射的值（如 `mars`）时 `codes` 为空 → **不加任何条件 → 返回全部**，而 `applied.origin` 仍回显 `["mars"]`。
- **复现命令**
  ```bash
  curl -sS 'http://127.0.0.1:18991/api/cigars?origin=mars' | python3 -c \
    'import sys,json;d=json.load(sys.stdin);print("total=",d["total"],"applied=",d["applied"])'
  ```
- **实际输出**
  ```
  total= 42 applied= {'q': '', 'origin': ['mars'], 'size': [], 'strength': [], 'flavor': [], 'brand': [], 'sort': 'rating'}
  ```
  （42 = 全部雪茄；`origin=cuba,mars` 则静默退化成只按 cuba 过滤，`total=16`。）
- **影响**：前端回显与结果不一致；用户以为在筛选却看到全量；做数据对接时会被静默误导。
- **建议修法**：未知 origin 值不要丢弃——要么返回 `400 BAD_REQUEST`，要么加入 `1=0` 使其返回空集，
  并把无法识别的值在 `applied` 中标出（例如 `applied.unknownOrigins`）。

### M8. `minRating` 非法值静默返回 0 条

- **现象**：`Number('abc')` → `NaN` 被直接绑进 SQL，`rating >= NaN` 恒假 → 空列表且 200。
- **复现命令**
  ```bash
  for v in abc NaN 1e999 1e309; do printf '%-8s -> ' "$v"
    curl -sS "http://127.0.0.1:18991/api/cigars?minRating=$v" | python3 -c \
      'import sys,json;d=json.load(sys.stdin);print("total=",d["total"])'; done
  ```
- **实际输出**：`abc -> total=0`、`NaN -> 0`、`1e999 -> 0`、`1e309 -> 0`
- **影响**：非法参数被当成「筛选出 0 条」而不是报错，难以排查；虽无 5xx，但语义错误。
- **建议修法**：`minRating` 非有限数时抛 `400 BAD_REQUEST`；并在拼 SQL 前 `Number.isFinite` 校验。

### M9. seed 统计口径错误，误导运维判断

- **现象**：`stats.flavors` 用的是 `flavorIds.size`（同时塞了 `name` 和 `name_cn` 两个键，被重复计数）；
  `stats.links` 是**尝试插入次数**，而 `INSERT OR IGNORE` 会忽略重复，所以与库里真实关联数不符。
- **复现命令**
  ```bash
  cd /Users/steve/Downloads/DeepSeek/cigar-community
  D=$(mktemp -d); CC_DB_PATH="$D/d.db" node scripts/seed.mjs 2>&1 | grep 完成
  CC_DB_PATH="$D/d.db" node --input-type=module -e "
  import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.env.CC_DB_PATH);
  console.log('实际 flavors =', db.prepare('SELECT COUNT(*) n FROM flavors').get().n,
              '| 实际 cigar_flavors =', db.prepare('SELECT COUNT(*) n FROM cigar_flavors').get().n);"
  ```
- **实际输出**
  ```
  [seed] 完成：国家 6 · 品牌 22 · 风味 62 · 雪茄 CSV 15 + MOCK 34 · 风味关联 244
  实际 flavors = 31 | 实际 cigar_flavors = 209
  ```
- **影响**：日志报「风味 62 / 关联 244」，真实是「31 / 209」。运维按日志核对数据会得出错误结论；
  也会掩盖「大量风味从未被引用」的事实（31 个字典项里 **14 个 `count=0`**）。
- **建议修法**：`stats.flavors` 改为 `SELECT COUNT(*) FROM flavors`；`stats.links` 用 `run().changes` 累加。

---

## 轻微问题 / 建议

1. **`POST /api/auth/password` 已实现但未进契约**（`server/api/auth.js:89`）：`docs/API.md §8` 的表格只有
   register/login/logout/me 四行，没有它。契约是「前后端唯一依据」，实现有而文档无属违规。
   另外该接口返回 `{ok:true}` 与 `401 UNAUTHORIZED`（当前口令错误用 401，语义上更像 403/400）。
2. **`user` 结构多出 `email`**：契约给的 user 结构是 `{id,username,role,avatarUrl,bio,createdAt}`，
   实现（`publicUser()`）额外返回 `email`。前端未使用，但契约应对齐。
3. **大量未文档化的额外响应字段**（详见「文档与实现不符」章节）。
4. **作者可以给自己的品吸笔记投「有用」票**：实测作者投票后 `helpfulCount` 正常 +1。无越权（不能刷他人票、
   计数由真实票数推导、重复投票幂等），但自刷排行不干净。建议 `if (review.user_id === user.id) throw forbidden()`。
5. **`q` 的 LIKE 通配符未转义**：`?q=%` 与 `?q=_` 均返回 `total=42`（匹配全部）。搜索 `_` 应无结果。
   建议 `LIKE ? ESCAPE '\'` 并转义 `%_\`。
6. **路由 `meta.requiresAuth` 是死配置**：`web/src/router/index.js:95` 的守卫只设 `document.title` 就 `return true`，
   从不校验登录；`/reviews/new`、`/submit` 上的 `requiresAuth: true` 无人读取。目前靠视图自身
   `auth.state.loaded / auth.user` 兜住（ReviewFormView 有骨架屏 + 未登录卡片，做对了），
   服务端也一律 401，所以**不构成漏洞**，但该 meta 会误导后续开发。建议要么删掉，要么真正实现守卫。
7. **被拦截内容仍以 120 字摘录写入 `audit_log`**：契约说命中红线「内容不入库」，实测 `audit_log.excerpt`
   存了 `"有货私聊"` 等原文片段（`ref_id=null`）。作为审核留痕是合理的，但契约措辞应改为
   「不入业务表，仅 120 字摘录进 audit_log」。
8. **`server/seed.js:86` 有重复条件**：`text.includes('petit') || text.includes('petit')`（左右完全相同），
   应是复制粘贴残留，右侧原意大概是 `petit corona`/`petit robusto`。
9. **`database/schema.sql` 里 `('Cedar/Mint','雪松/薄荷混合','complex',28)` 是垃圾字典项**：
   名称由两个风味拼成，`content/seed_cigars_15.csv` 与 `database/seed/cigars.csv` 都没有它，`count=0`。
   连同另外 13 个 `count=0` 的项，风味轮会出现 14 个筛不出任何结果的标签。
10. **`app_meta.db_version` 只在缺失时写入**（`stampVersion()` 不做 UPDATE），升级后版本戳不会刷新；
    且 `node scripts/seed.mjs --reset` 后 `app_meta` 为空（只有启动服务器才补写）。
11. ~~**年龄门只在客户端 + 可选 Cookie 层**：`readAgeGate()` 的结果不被任何业务接口强制~~
    **已修**：`assertAgeGate()` 已在 `/api/*` 入口强制，未过门返回 `403 AGE_GATE_REQUIRED`。
    豁免路径（爬虫、`/api/health`、`/api/auth/me`、`/api/gate/verify`、已登录用户）写在
    `server/index.js` 的 `AGE_GATE_EXEMPT` 与 `server/middleware/auth.js` 里，各有注释说明理由。
    配套断言：`scripts/api-smoke.sh` §0（匿名被拒 / 爬虫放行 / 豁免路径可达）。
    （契约明确「不影响业务接口」），因此 `cc_age` 无法阻止直接调 API 的用户；`localStorage['cc-age-ok']`
    也可被用户自行写入。符合当前契约，但作为「烟草内容合规门槛」建议在 Nginx/边缘层再兜一道。
12. **`deployment/checklist.md §1.3` 与本实现完全对不上**（详见下节），而 README 称其为「验收标准仍有效」。
13. **`config/sensitive-words.json` 的 `image_moderation` 只有建议文本**，无任何实现（ROADMAP 已坦诚列为 P1）。
14. **`docker`/CI 缺失、`web/dist` 需手工构建**——ROADMAP 已自述，不重复计缺陷。
15. **`/api/reviews` 与 `/api/cigars` 的 `paginate()` 是两份复制代码**（一处 12 一处 24 的默认值），
    S5 的 bug 也因此复制了两份。建议抽到 `server/lib/http.js` 统一。

---

## 文档与实现不符之处

| # | 文档位置 | 文档写的 | 实际 | 证据 |
|---|---|---|---|---|
| 1 | `docs/API.md` §8 认证表 | register/login/logout/me 四个接口 | 另有 `POST /api/auth/password` 已实现 | 实测 `401 请先登录` / 未登录拦截；`server/api/auth.js:89` |
| 2 | `docs/API.md` §8 user 结构 | `{id,username,role,avatarUrl,bio,createdAt}` | 多 `email` | `curl /api/auth/me` 返回含 `"email":null` |
| 3 | `docs/API.md` 错误码表 | `CONTENT_QUEUED` \| 202 \| 命中审核词 | 202 响应体无 `code` 字段 | 见 M5 的原始响应体 |
| 4 | `docs/API.md` §1 sortOptions | 6 个选项 | 实际 7 个（多 `{"value":"name","label":"按品牌字母"}`） | 实测 `/api/meta` |
| 5 | `docs/API.md` §1 flavorCategories[].flavors[] | `{id,name,label,count}` | 多 `category` | 实测 `/api/meta` |
| 6 | `docs/API.md` §9.2 health | `{ok,version,uptime,db,env}` | 多 `cigars` | 实测 `/api/health` |
| 7 | `docs/API.md` §2 列表项 | 未列 `wrapperColor/recommendedHumidity/recommendedTemperature/dataSource` | `shapeCigar()` 对**列表项**也返回这四个（§3 说它们是详情「额外字段」） | 实测 `/api/cigars?pageSize=1` 的 items[0] keys |
| 8 | `docs/API.md` §5.1 诊断结果 | 无 `hint` | 实际返回 `hint` | 实测 `POST /api/tools/diagnostic` |
| 9 | `docs/API.md` §5.2 题目 options | `{value,label,category}` | 多 `name` | 实测 `GET /api/tools/flavor-test` |
| 10 | `docs/API.md` §5.2 测试结果 | `recommended:[{id,brand,vitola}]`、`scores:[{category,label,score,percent}]` | 另返回 `recommended[].strength/strengthLabel/rating`、`scores[].categoryLabel`、`disclaimer` | 实测 |
| 11 | `docs/API.md` §5.3 醇化 GET | `{cigars:[{id,label,strength}]}` | 多 `strengthLabel`，且多一个顶层 `strengths` 数组 | 实测 |
| 12 | `docs/API.md` §5.3 醇化 POST 结果 | 8 个字段 | 另返回 `strength,currentAgeMonths,baseWindowMonths,penaltyMonths,monthsToPeak,statusTone,environment.*.message,disclaimer` | 实测 |
| 13 | `docs/API.md` §5.4 check-text | `{action,matched,message}` | 多 `matches` | 实测 |
| 14 | `docs/API.md` §6.1 review 项 | 22 个字段 | 多 `isMine` | 实测 `/api/reviews` |
| 15 | `docs/API.md` §7.2 我的投稿 | `{id,status,rejectReason,createdAt,payload}` | 多 `reviewedAt` | `server/api/submissions.js:101` |
| 16 | `config/sensitive-words.json` `_safe_context_note` | 「命中词**前后 4 字窗口**内出现下列正则时不熔断」 | 实现是**整句** `scope.includes()`，且否定词用 `prefix.includes()`（任意位置） | `server/lib/sensitive.js:138-155`；S1 实测 |
| 17 | `docs/API.md` §8 | 「注册/登录限流：每 IP 每分钟 10 次 → 429」 | 伪造 XFF 即可无限绕过 | S3 实测 |
| 18 | `deployment/checklist.md` §1.3 示例 | `POST /api/posts` + `Authorization: Bearer $TEST_TOKEN` | 无 `/api/posts`；鉴权是 HttpOnly Cookie | 路由表无该路径；`attachAuth` 用 Cookie |
| 19 | `deployment/checklist.md` §1.3 期望体 | `{"error":"CONTENT_REJECTED","code":"SENSITIVE_WORD_BLOCKED"}` | `{"error":"内容命中禁止交易的词：…","code":"CONTENT_REJECTED","details":{"matched":[…]}}` | S2 实测原始体 |
| 20 | `deployment/checklist.md` §1.3.2 | 「多少钱一支 出茄」→ **拦截进审核队列** | `403 CONTENT_REJECTED`（因为 `出茄` 是红线，不是审核词） | 实测 `403 内容命中禁止交易的词：出茄、多少钱` |
| 21 | `deployment/checklist.md` §1.3.1 | 「自动封号（内容删除 + 账号禁言）」 | 无任何封号/禁言实现，仅拒绝本次请求 | `grep -rn "ban\|封号\|禁言" server/` 无实现 |
| 22 | `deployment/checklist.md` §1.1.5 | 「脚本无法批量注册」为验收标准 | 轮换 XFF 后 14/14 注册成功 | S3 实测 |
| 23 | `README.md` 文档索引 | 称 checklist「历史文档，验收标准仍有效」 | §1.3 全部四条标准均与实现不符（#18–#21） | 同上 |
| 24 | `docs/ROADMAP.md` §一 | 「[x] 抗绕过：全角、大小写、零宽字符、分隔符插入」 | 这四项**确实有效**，但未披露繁体/拼音/缩写/中文标点/emoji/base64 六类失效 | S2 实测 |
| 25 | `docs/ROADMAP.md` §一 | 「[x] 防误杀：否定语境 + 安全语境豁免」 | 豁免确实存在，但既过度（S1）又不足（S4 八类正常表述被 403） | S1/S4 实测 |
| 26 | `docs/ROADMAP.md` §一 | 「[x] 登录限流」 | 默认配置下可被 XFF 绕过 | S3 实测 |
| 27 | `docs/ROADMAP.md` §一 | 「合并数据…42 款，幂等可重复导入」 | 幂等属实，但 42 款含 2 支重复（Padron/Padrón），去重后 40 | M1 实测 |
| 28 | `.env.example:18` | 「见 docs/ROADMAP.md」 | 该文件现已存在（并发补齐），不再是悬空引用 | `ls docs/` |

---

## 我实际执行的验证（附证据）

全部在隔离临时库 + 独立端口（18991/18992）执行，未触碰 `database/cigar.db`，未安装任何依赖。

| # | 命令 | 关键输出 |
|---|---|---|
| 1 | `node --test scripts/` | 首次实测 `pass 15 / fail 0`，退出码 0；**最终工作树**（并发方新增 `scripts/seed.test.mjs` 等）为 `pass 27 / fail 0` |
| 2 | `LC_ALL=C bash scripts/test-e2e.sh` | 首次实测 **`通过 131 / 失败 0`**，`✓ 端到端测试全部通过`，退出码 0（**131 这个数字属实**）；**最终工作树**为 `通过 137 / 失败 0`（并发方补了评分量纲断言） |
| 3 | `CC_DB_PATH=$TMP/v.db node scripts/seed.mjs` | `雪茄 CSV 15 + MOCK 34`，`{"cigars":42,"brands":22,"flavors":31,"users":1}` |
| 4 | seed 三次（增量 / 增量 / `--reset` / `--reset`） | 计数恒为 `42/22/31/1`（**幂等属真**） |
| 5 | 查库核对 CSV 15 行 | `✓ CSV 15 行全部入库（含 series 精确匹配）`（初版脚本我漏传 SQL 参数，已修正后复核） |
| 6 | 分页边界 19 组 | `pageSize=1.5→500`、`page=1.1→500`、`page=1e18→500`、`page=999999999999999999→500`（3 连复现），日志 `ERR_SQLITE_ERROR: datatype mismatch` |
| 7 | `:id` 边界 14 组 | `abc/0/-1/1.5/null/undefined/%00` 全 `400 BAD_REQUEST`；`1e9/超大整数` `404`；**无 5xx** |
| 8 | JSON body 形状 9 组 | 数组/字符串/null/数字/bool/无 CT/错 CT/form CT → 无 5xx；超深嵌套 200 层、2000 层、**10 万层** → `400`（在 `try/catch` 内，安全） |
| 9 | 10 万字 title+content | 未登录先 401；登录后 `slice` 截断，无 5xx；`check-text` 20000 字 → 400，400KB → 413 |
| 10 | 重复 JSON key | `{"text":"clean","text":"有货私聊"}` → `blocked ["私聊","有货"]`（取后者，无异常） |
| 11 | 未登录写接口 5 个 | `POST /api/reviews|submissions|reviews/:id/helpful|auth/password`、`GET /submissions/mine` 全部 `401 UNAUTHORIZED` |
| 12 | 登出 / 重放 / 篡改 Cookie | 登出后 `me → user:null`；重放旧 `cc_sid` → 401；篡改 1 字符 / 空值 / `' OR 1=1--` → 均非登录态 |
| 13 | helpful 投票 7 次（2 用户 + 作者） | `1→0→1` 幂等切换；user2 投票 `2→1`；不存在笔记 404、负数 400（**计数无法刷**） |
| 14 | 用户名枚举 | 不存在用户与错误口令**同文案同状态** `401 用户名或口令不正确`；重名 409、重邮箱 409 |
| 15 | 改口令 vs 会话 | 改口令后**旧会话仍 200**（M3） |
| 16 | 限流（默认配置，未禁用） | 同源 11 次起 `429`；**轮换 XFF 15 次全放行**；**轮换 XFF 注册 14/14 成功、0 次 429** |
| 17 | 绕过矩阵 11 例（`scan()` + HTTP） | 11/11 `clean`，HTTP 全部 `201 status=1`（S2） |
| 18 | 豁免滥用 8 例（`scan()` + HTTP） | 8/8 `clean`，HTTP 全部 `201 status=1`，**库内确认为公开笔记 #13–#20**（S1） |
| 19 | 误杀矩阵 10 例（`scan()` + HTTP） | 8 例 `403 blocked`（飞机/dg/拼车/求茄/转账/有货/私聊/便宜出），2 例 `202`（性价比/行货水货）（S4） |
| 20 | 契约字段实测 11 个 GET + 4 个 POST | 逐字段 keys 对比，得「文档与实现不符」表 28 条 |
| 21 | `origin/size/strength/flavor/brand/q/sort` 边界 13 组 | `origin=mars → total=42`（M7）；`minRating=abc → 0`（M8）；`q=%`/`q=_ → 42`；`q=' OR 1=1-- → 0`（**无注入**） |
| 22 | 原型污染 5 组 | `__proto__`/`constructor.prototype` → 无污染、无 5xx |
| 23 | 方法/路径边界 16 组 | `PUT/DELETE/PATCH → 404`、`OPTIONS → 204`、`//api/cigars`/`/API/cigars` → SPA `200`、`/favicon.ico → 204` |
| 24 | 路径穿越（`--path-as-is` + 编码 + 默认） | 尝试读 `package.json`/`cigar.db`/`sensitive-words.json`/`.env`/`/etc/passwd` → **全部 404 或 SPA，未泄漏任何仓库文件**；同时证实 `curl` 默认会把 `..` 规范化（M6-A） |
| 25 | `cd web && LC_ALL=C npx --no-install vite build` | `✓ 55 modules transformed` / `✓ built in 651ms`，退出码 0 |
| 26 | 前端字段核对 | `web/src` 中 **0 处** snake_case 泄漏；`res.stats/.items/.flavors/.strengths` 均与 `shape.js` 实际输出一致 |
| 27 | `compliance` 端到端 | 库内 `reviews` 24 条：`status=1` 20 条（含全部绕过/豁免内容）、`status=-1` 4 条；`audit_log` 35 条含 blocked 摘录 |
| 28 | 数据完整性查库 | 品牌归一化后 `padron` 对应 2 个 id（M1）；家族错判：首次实测 `belicoso=18/42`，最终工作树为 `belicoso=7` 但 `double_corona` 承接了错判（`Petit Royale`/`Double Robusto`，M2）；`flavors=31` 其中 **14 个 `count=0`**、`cigar_flavors=209`（M9） |
| 29 | 环境收尾 | `database/cigar.db` 未被我写入（所有 `node server/index.js` / `seed.mjs` 均显式设置 `CC_DB_PATH` 指向 `mktemp -d`）；我起的实例已全部 `kill`，`18991` 已释放；`8787` 开发实例在我验收期间由**并发方**关闭 |

---

## 我认为没问题的地方（用于交叉确认）

以下均经实测确认**做对了**，不要在返工时误改：

1. **冒烟断言数量属实**：首次实测 `56 expect_status + 70 expect_json + 5 个条件断言 = 131`，全绿，
   与脚本计数逻辑吻合，不是编造的数字（并发方随后补测到 137，同样全绿）。单元测试首次 15/15、最终 27/27 通过。
2. **种子幂等**：增量/`--reset`/重复 `--reset` 四种情形计数恒为 `42/22/31/1`，无重复插入。
3. **CSV 15 行全部入库**（含 `Línea Clásica` 这类带重音的 `series` 精确匹配）。
4. **鉴权边界干净**：5 个需登录的写接口未登录一律 401；`GET /api/auth/me` 匿名返回 `{user:null}` 符合契约。
5. **会话可撤销**：登出后旧 Cookie **立即**失效（重放旧 `cc_sid` → 401），不是只清浏览器端。
6. **Cookie 不可篡改**：改一个字符 / 空值 / SQL 注入式字符串都不会被当成有效会话（`sessions.id = sha256(token)` + 参数化）。
7. **投票不可刷**：`helpfulCount` 由 `SELECT COUNT(*) FROM review_votes` 反推而非 `+1`，
   同用户重复投票是幂等取消，无法通过重复请求抬高计数。
8. **无用户名枚举**：不存在的用户与错误口令返回完全相同的状态码与文案。
9. **口令安全**：scrypt(N=16384,r=8,p=1) + 随机盐 + `timingSafeEqual`；所有响应均不含 `password_hash`/`scrypt$`。
10. **无 SQL 注入**：所有查询参数化（`assertParams()` 还额外拦截「参数忘记包数组」这类低级错误）；
    `q=' OR 1=1--` 返回 0 条而非全量。
11. **路径穿越确实被挡住**：`resolveSafe()` 在 `decodeURIComponent` + `normalize` 后校验前缀；
    我用 `--path-as-is` 与 `%2e%2e%2f` 双重编码尝试读 `package.json`/`cigar.db`/`sensitive-words.json`/`.env`
    全部 404 或落到 SPA，**未读到任何仓库/系统文件**（只有 M6-A 那条测试断言本身是空洞的）。
12. **畸形输入不产生 5xx**：数组/字符串/null/数字/bool body、10 万层嵌套、10 万字文本、原型污染 payload、
   超长 query、非整数 id —— 全部被 400/401/404/413 正确接住（唯一的 5xx 来自 S5 的分页参数）。
13. **`check-text` 是真正免登录的**，且 20000 字上限、413 上限都生效。
14. **`web/dist` 与 `web/src` 一致，无契约外字段访问**：`0` 处 snake_case 泄漏，
   前端消费的 `stats/items/flavors/strengths/cigar/reviewSummary` 都与 `server/api/shape.js` 实际输出对得上；
   `ReviewFormView` 对 202 的处理**两条路径都判了**（`sensitivity.action==='queued'` 与 `review.status===-1`），
   所以 M5 只是死代码与文档不一致，**功能本身没坏**。
15. **前端视图自身做了登录门**：`ReviewFormView` / `SubmissionView` 有 `auth.state.loaded` 骨架屏 +
   未登录卡片 + `onMounted` 里 `auth.refresh()`，所以路由守卫缺失（轻微 #6）不构成越权。
16. **构建可复现**：`vite build` 零警告通过（651ms，55 modules）。
17. **ROADMAP 对「未做」的部分相当诚实**（承认无管理后台、审核队列等于内容黑洞、限流多实例失效、
   图片上传未做、`LIKE` 搜索），这一点值得肯定——问题在于「已做」那几项（抗绕过/防误杀/登录限流）的结论过强。
