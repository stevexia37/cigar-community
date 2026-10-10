#!/usr/bin/env bash
# ============================================================================
# 雪茄客 · API 契约冒烟测试
# 用法：bash scripts/api-smoke.sh [base_url]
#   默认 base_url = http://127.0.0.1:8787
#
# 校验对象：docs/API.md v1
# 额外覆盖：deployment/checklist.md 的 1.2（年龄门）/ 1.3（敏感词熔断）验收标准
# 退出码：0 = 全部通过，1 = 有失败
# ============================================================================
set -uo pipefail

BASE="${1:-http://127.0.0.1:8787}"
JAR="$(mktemp -t cc-smoke-jar.XXXXXX)"
BODY="$(mktemp -t cc-smoke-body.XXXXXX)"
PASS=0
FAIL=0
FAILED_NAMES=()

cleanup() { rm -f "$JAR" "$BODY"; }
trap cleanup EXIT

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()   { PASS=$((PASS+1)); printf '  %s %s\n' "$(color '32' '✓')" "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); printf '  %s %s\n    %s\n' "$(color '31' '✗')" "$1" "$2"; }
group(){ printf '\n%s\n' "$(color '1;33' "▌$1")"; }

# request METHOD PATH [JSON_BODY]
# 全局：LAST_STATUS / LAST_BODY
# 只对非 ASCII 字节做百分号编码。
# 为什么需要：curl 会把原始 UTF-8 字节写进请求行，Node 的 HTTP 解析器会拒收
# （症状是响应体为空、状态码异常），而浏览器总是先编码。这里对齐浏览器行为。
# 注意：不能整串编码，否则 '/' '?' '&' 也会被转义，URL 直接失效（踩过的坑）。
urlencode_nonascii() {
  local input="$1" out="" ch
  local i
  for (( i = 0; i < ${#input}; i++ )); do
    ch="${input:i:1}"
    if [[ "$ch" == [[:ascii:]] ]]; then
      out+="$ch"
    else
      # 取该字符的 UTF-8 字节并逐个转义
      out+="$(printf '%s' "$ch" | od -An -tx1 | tr -d ' \n' | sed 's/../%&/g')"
    fi
  done
  printf '%s' "$out"
}

# request METHOD PATH [JSON_BODY]
# 全局：LAST_STATUS / LAST_BODY
request() {
  local method="$1" path="$2" data="${3:-}"
  local url="${BASE}$(urlencode_nonascii "$path")"
  local args=(-sS -o "$BODY" -w '%{http_code}' -X "$method" -b "$JAR" -c "$JAR" "$url")
  [[ -n "$data" ]] && args+=(-H 'content-type: application/json' -d "$data")
  LAST_STATUS="$(curl "${args[@]}" 2>/dev/null)"
  LAST_BODY="$(cat "$BODY" 2>/dev/null)"
}

expect_status() { # name expected
  if [[ "$LAST_STATUS" == "$2" ]]; then ok "$1 (HTTP $LAST_STATUS)"
  else bad "$1" "期望 HTTP $2，实际 $LAST_STATUS — ${LAST_BODY:0:200}"; fi
}

expect_json() { # name jq_expr expected
  local got
  got="$(printf '%s' "$LAST_BODY" | jq -r "$2" 2>/dev/null)"
  if [[ "$got" == "$3" ]]; then ok "$1 ($2 = $got)"
  else bad "$1" "$2 期望 [$3] 实际 [$got]"; fi
}

expect_contains() { # name needle
  if [[ "$LAST_BODY" == *"$2"* ]]; then ok "$1"
  else bad "$1" "响应中未找到 [$2] — ${LAST_BODY:0:200}"; fi
}

expect_not_contains() { # name needle
  if [[ "$LAST_BODY" != *"$2"* ]]; then ok "$1"
  else bad "$1" "响应中不应出现 [$2]"; fi
}

command -v jq >/dev/null || { echo "需要 jq：brew install jq"; exit 1; }

# 先确认目标确实是雪茄客服务。否则测试可能静默打到别的进程上 ——
# 踩过的坑：测试端口曾被一个无关的常驻服务占用，断言结果时对时错。
PROBE_JSON="$(curl -sS --max-time 5 "$BASE/api/health" 2>/dev/null)"
if ! printf '%s' "$PROBE_JSON" | grep -q '"version"'; then
  printf '\033[31m✗ %s 不是雪茄客服务\033[0m\n' "$BASE"
  printf '  响应：%s\n' "$(printf '%s' "$PROBE_JSON" | head -c 160)"
  exit 1
fi

printf '%s\n' "$(color '1;36' "雪茄客 API 冒烟测试 · $BASE")"

# ---------------------------------------------------------------- 1 健康与元数据
group "1 健康检查与元数据"

request GET /api/health
expect_status "健康检查可达" 200
expect_json   "健康检查报告数据库正常" '.db' 'ok'

request GET /api/meta
expect_status "元数据可取" 200
expect_json   "雪茄总数 > 0" '(.stats.cigars > 0)' 'true'
expect_json   "筛选选项来自服务端（产地非空）" '(.origins | length > 0)' 'true'
expect_json   "型号家族非空" '(.sizes | length > 0)' 'true'
expect_json   "风味分类非空" '(.flavorCategories | length > 0)' 'true'
expect_json   "排序选项非空" '(.sortOptions | length > 0)' 'true'

request GET /api/flavors
expect_status "风味字典可取" 200
expect_json   "风味标签 > 0" '(.flavors | length > 0)' 'true'

# ---------------------------------------------------------------- 2 雪茄查询
group "2 雪茄列表 / 详情 / 筛选"

request GET '/api/cigars?pageSize=5'
expect_status "列表可查" 200
expect_json   "列表返回 5 条" '(.items | length)' '5'
expect_json   "分页字段齐全" '(.totalPages | type)' 'number'
expect_json   "列表项含风味数组" '(.items[0].flavors | type)' 'array'
expect_json   "列表项标注产地大类" '(.items[0].originType | type)' 'string'

request GET '/api/cigars?origin=cuba&pageSize=100'
expect_status "按产地筛选" 200
expect_json   "筛选结果全部为古巴" '[.items[].origin] | unique | join(",")' 'cuba'
expect_json   "古巴款数 > 0" '(.total > 0)' 'true'

request GET '/api/cigars?size=robusto&pageSize=100'
expect_status "按型号家族筛选" 200
expect_json   "筛选结果全部为罗布图" '[.items[].vitolaFamily] | unique | join(",")' 'robusto'

request GET '/api/cigars?strength=5&pageSize=100'
expect_status "按浓郁度筛选" 200
expect_json   "筛选结果全部为 5" '[.items[].strength] | unique | join(",")' '5'

request GET '/api/cigars?q=cohiba&pageSize=100'
expect_status "关键词搜索" 200
expect_json   "搜索命中了 Cohiba" '([.items[].brand] | unique | join(",") | test("Cohiba"))' 'true'

request GET '/api/cigars?q=雪松木&pageSize=100'
expect_status "按中文风味搜索" 200
expect_json   "中文风味搜索有结果" '(.total > 0)' 'true'

request GET '/api/cigars?sort=price_asc&pageSize=100'
expect_status "按价格升序" 200
# CSV 独有记录没有参考价（priceCny = null），排序时被排到末尾，
# 所以只校验「有价」那些的单调性，并单独验证 null 确实都在末尾
expect_json   "价格升序有效（有价项单调不减）" \
  '[.items[].priceCny | select(. != null)] as $p | ([range(1; $p | length) | $p[.] >= $p[. - 1]] | all)' 'true'
expect_json   "无参考价的记录排在末尾" \
  '([.items[] | select(.priceCny == null)] | length) as $n | ([.items[-$n:][].priceCny] | all(. == null))' 'true'

request GET '/api/cigars?pageSize=1'
FIRST_ID="$(printf '%s' "$LAST_BODY" | jq -r '.items[0].id')"
request GET "/api/cigars/$FIRST_ID"
expect_status "详情可查" 200
expect_json   "详情含相关推荐" '(.related | type)' 'array'
expect_json   "详情含品吸笔记列表" '(.reviews | type)' 'array'
expect_json   "详情含评分汇总" '(.cigar.reviewSummary.count | type)' 'number'

request GET /api/cigars/999999
expect_status "不存在的雪茄返回 404" 404
expect_json   "404 使用契约错误码" '.code' 'NOT_FOUND'

# 回归断言：雪茄 rating 是 1-5 星，而笔记 overallRating 是 1-10 分。
# 曾经把笔记均分直接写进 rating，导致出现「8.0 星」（见 docs/ARCHITECTURE.md）。
request GET '/api/cigars?pageSize=100'
expect_status "全量列表可查（评分量纲校验用）" 200
expect_json   "雪茄评分全部在 1-5 星级区间内" \
  '[.items[].rating | select(. != null)] | all(. >= 1 and . <= 5)' 'true'
expect_json   "不存在超过 5 的雪茄评分" \
  '[.items[].rating | select(. != null and . > 5)] | length' '0'

# ---------------------------------------------------------------- 3 工具
group "3 工具（诊断 / 风味测试 / 醇化 / 预检）"

request GET /api/tools/diagnostic
expect_status "诊断题目可取" 200
expect_json   "诊断含 5 道题" '(.questions | length)' '5'
expect_json   "第 2 题带 dependsOn" '(.questions[1].dependsOn.value)' 'mold'

request POST /api/tools/diagnostic '{"answers":{"1":"mold","2":"mild"}}'
expect_status "轻度霉菌诊断" 200
expect_json   "诊断标题正确" '.diagnosis.title' '轻度霉菌'
expect_json   "存活率 95%" '.diagnosis.survival' '95'
expect_json   "严重等级为轻度" '.diagnosis.severity.level' 'mild'
expect_json   "给出抢救步骤" '(.diagnosis.steps | length > 0)' 'true'

request POST /api/tools/diagnostic '{"answers":{"1":"beetles","2":"severe"}}'
expect_status "三级虫害诊断" 200
expect_json   "重度虫害存活率 10%" '.diagnosis.survival' '10'

request POST /api/tools/diagnostic '{"answers":{"1":"plume","2":"confirm"}}'
expect_status "起灰判定" 200
expect_json   "起灰存活率 100%" '.diagnosis.survival' '100'

request POST /api/tools/diagnostic '{"answers":{}}'
expect_status "空答案降级（不报 5xx）" 200
expect_json   "无法判定时 key=unknown" '.diagnosis.key' 'unknown'

request POST /api/tools/diagnostic '{"answers":"bad"}'
expect_status "非法 answers 返回 400" 400

request GET /api/tools/flavor-test
expect_status "风味测试题目可取" 200
expect_json   "风味测试题目非空" '(.questions | length > 0)' 'true'
FLAVOR_IDS="$(printf '%s' "$LAST_BODY" | jq -c '[.questions[0].options[0].value, .questions[1].options[0].value]')"

request POST /api/tools/flavor-test "{\"answers\":$FLAVOR_IDS}"
expect_status "风味测试可计算" 200
expect_json   "返回人格结果" '(.result.title | length > 0)' 'true'
expect_json   "返回维度得分" '(.result.scores | length > 0)' 'true'

request GET /api/tools/aging-calc
expect_status "醇化选项可取" 200
expect_json   "可选雪茄非空" '(.cigars | length > 0)' 'true'

request POST /api/tools/aging-calc '{"strength":4,"currentAgeMonths":6,"humidity":68,"temperature":18}'
expect_status "醇化计算（理想环境）" 200
expect_json   "浓郁款 6 个月处于新茄期" '.result.status' 'fresh'
expect_json   "环境判定湿度合格" '.result.environment.humidity.ok' 'true'

request POST /api/tools/aging-calc '{"strength":4,"currentAgeMonths":40,"humidity":68,"temperature":18}'
expect_status "醇化计算（已到窗口）" 200
expect_json   "40 个月处于最佳窗口" '.result.status' 'peak'

request POST /api/tools/aging-calc '{"strength":3,"humidity":85,"temperature":28}'
expect_status "醇化计算（恶劣环境）" 200
expect_json   "湿度过高被标记" '.result.environment.humidity.ok' 'false'
expect_json   "温度过高被标记" '.result.environment.temperature.ok' 'false'
expect_json   "恶劣环境产生惩罚（窗口后移）" '(.result.penaltyMonths > 0)' 'true'

request POST /api/tools/aging-calc '{}'
expect_status "缺少参数返回 400" 400

# ---------------------------------------------------------------- 4 敏感词（checklist 1.3）
group "4 合规熔断（对照 deployment/checklist.md §1.3）"

request POST /api/tools/check-text '{"text":"这支雪茄前段雪松木很好，中段可可。"}'
expect_status "正常品鉴内容放行" 200
expect_json   "1.3.3 白名单通过" '.action' 'clean'

request POST /api/tools/check-text '{"text":"有货私聊 微信出茄 代购走不"}'
expect_status "交易内容预检" 200
expect_json   "1.3.1 代购/私聊判定为 blocked" '.action' 'blocked'
expect_json   "返回命中词列表" '(.matched | length > 0)' 'true'

request POST /api/tools/check-text '{"text":"VX: 123456"}'
expect_status "变体预检" 200
expect_json   "1.3.4 变体识别为 blocked" '.action' 'blocked'

request POST /api/tools/check-text '{"text":"本站不卖雪茄，只做知识交流。"}'
expect_status "否定语境预检" 200
expect_json   "否定语境不误杀" '.action' 'clean'

request POST /api/tools/check-text '{"text":"遇到代购私聊请举报。"}'
expect_status "防骗讨论预检" 200
expect_json   "正当讨论不熔断" '.action' 'clean'

# ---------------------------------------------------------------- 5 年龄门（checklist 1.2）
group "5 年龄门（对照 deployment/checklist.md §1.2）"

request GET /api/auth/me
expect_status "匿名会话可查" 200
expect_json   "1.2.4 未通过年龄门时 ageVerified=false" '.ageVerified' 'false'

request POST /api/gate/verify '{"adult":false}'
expect_status "1.2.3 拒绝年龄确认" 403

request POST /api/gate/verify '{"adult":true}'
expect_status "确认年龄成功" 200
expect_json   "下发年龄门凭证" '.ok' 'true'

request GET /api/auth/me
expect_json   "1.2.4 通过后 ageVerified=true" '.ageVerified' 'true'

# 爬虫 UA 不弹年龄门（1.2.2）
BOT_STATUS="$(curl -sS -o "$BODY" -w '%{http_code}' -A 'Googlebot/2.1' "$BASE/api/auth/me")"
if [[ "$BOT_STATUS" == "200" ]] && [[ "$(jq -r '.ageVerified' "$BODY")" == "true" ]]; then
  ok "1.2.2 爬虫 UA 直接放行（不弹年龄门）"
else
  bad "1.2.2 爬虫 UA 放行" "status=$BOT_STATUS body=$(cat "$BODY" | head -c 120)"
fi

# ---------------------------------------------------------------- 6 认证
group "6 注册 / 登录 / 会话"

USERNAME="smoke_$(date +%s)_$RANDOM"
request POST /api/auth/register "{\"username\":\"$USERNAME\",\"password\":\"SmokeTest123\"}"
expect_status "注册成功" 201
expect_json   "返回用户信息" '.user.username' "$USERNAME"
expect_json   "默认角色为 user" '.user.role' 'user'

request POST /api/auth/register "{\"username\":\"$USERNAME\",\"password\":\"SmokeTest123\"}"
expect_status "重复用户名被拒" 409
expect_json   "使用 CONFLICT 错误码" '.code' 'CONFLICT'

request POST /api/auth/register '{"username":"ab","password":"SmokeTest123"}'
expect_status "用户名过短被拒" 400

request POST /api/auth/register '{"username":"validname1","password":"12345678"}'
expect_status "纯数字口令被拒" 400

request GET /api/auth/me
expect_json "注册后已登录" '.user.username' "$USERNAME"

request POST /api/auth/login "{\"username\":\"$USERNAME\",\"password\":\"WrongPass123\"}"
expect_status "错误口令被拒" 401

request POST /api/auth/login '{"username":"admin","password":"admin12345"}'
expect_status "管理员登录成功" 200
expect_json   "管理员角色正确" '.user.role' 'admin'

# ---------------------------------------------------------------- 7 品吸笔记 + 熔断落库
group "7 品吸笔记与内容熔断"

request POST /api/reviews "{\"cigarId\":$FIRST_ID,\"title\":\"冒烟测试笔记\",\"content\":\"前段雪松木清晰，中段转可可，燃烧均匀。\",\"overallRating\":8,\"preScore\":8,\"midScore\":9,\"postScore\":7,\"smokingTime\":60}"
expect_status "正常笔记创建成功" 201
expect_json   "返回笔记状态为已发布" '.review.status' '1'
REVIEW_ID="$(printf '%s' "$LAST_BODY" | jq -r '.review.id')"

# 量纲回归：笔记 1-10 分 → 雪茄 1-5 星，8 分应折算为 4 星（而非 8 星）
request GET "/api/cigars/$FIRST_ID"
expect_json   "笔记 8 分折算为雪茄 4 星（1-10 → 1-5）" '.cigar.rating' '4'
expect_json   "雪茄评分数值不超过 5" '(.cigar.rating <= 5)' 'true'
expect_json   "评分汇总计入该笔记" '(.cigar.reviewSummary.count >= 1)' 'true'

request POST /api/reviews "{\"cigarId\":$FIRST_ID,\"content\":\"有货私聊加微信\",\"overallRating\":5}"
expect_status "1.3.1 违规笔记被拦截" 403
expect_json   "使用 CONTENT_REJECTED 错误码" '.code' 'CONTENT_REJECTED'
expect_json   "返回命中词供前端提示" '(.details.matched | length > 0)' 'true'

request POST /api/reviews "{\"cigarId\":$FIRST_ID,\"content\":\"请问这支多少钱一支？\",\"overallRating\":6}"
if [[ "$LAST_STATUS" == "202" ]]; then
  expect_json "1.3.2 价格类内容进审核队列" '.review.status' '-1'
else
  bad "1.3.2 审核队列" "期望 202，实际 $LAST_STATUS — ${LAST_BODY:0:160}"
fi

request POST /api/reviews '{"cigarId":999999,"overallRating":5}'
expect_status "不存在的雪茄被拒" 400

request POST /api/reviews "{\"cigarId\":$FIRST_ID}"
expect_status "缺少总体评分被拒" 400

request GET "/api/reviews?cigarId=$FIRST_ID"
expect_status "笔记列表可查" 200
expect_json   "列表含刚创建的笔记" "([.items[].id] | index($REVIEW_ID) != null)" 'true'
expect_json   "审核中的笔记不出现在公开列表" "([.items[].status] | unique | join(\",\"))" '1'

request GET '/api/reviews?sort=newest&pageSize=5'
expect_status "笔记按时间排序" 200

request POST "/api/reviews/$REVIEW_ID/helpful"
expect_status "有用投票成功" 200
expect_json   "投票后计数为 1" '.helpfulCount' '1'
expect_json   "标记我已投票" '.helpfulByMe' 'true'

request POST "/api/reviews/$REVIEW_ID/helpful"
expect_json   "重复投票为幂等取消" '.helpfulCount' '0'

# 未登录不可投票
NOAUTH_STATUS="$(curl -sS -o "$BODY" -w '%{http_code}' -X POST "$BASE/api/reviews/$REVIEW_ID/helpful")"
if [[ "$NOAUTH_STATUS" == "401" ]]; then ok "未登录投票返回 401"
else bad "未登录投票" "期望 401，实际 $NOAUTH_STATUS"; fi

# ---------------------------------------------------------------- 8 投稿
group "8 雪茄数据投稿"

request POST /api/submissions '{"brand":"TestBrand","vitola":"Robusto","originType":"non-cuban","countryCode":"NI","strength":4,"flavorIds":[1,5],"description":"冒烟测试投稿"}'
expect_status "投稿成功（进审核）" 202
expect_json   "投稿状态为 pending" '.submission.status' 'pending'

# 用「交易意图 + 联系方式」组合，这是明确的红线（单说「有货私聊」只进审核队列）
request POST /api/submissions '{"brand":"BadBrand","vitola":"X","originType":"cuban","note":"有货出茄 加微信详聊"}'
expect_status "违规投稿被拦截" 403
expect_json   "违规投稿使用 CONTENT_REJECTED" '.code' 'CONTENT_REJECTED'

request POST /api/submissions '{"vitola":"X","originType":"cuban"}'
expect_status "缺少品牌被拒" 400

request GET /api/submissions/mine
expect_status "我的投稿可查" 200
expect_json   "至少有一条投稿" '(.items | length > 0)' 'true'

# ---------------------------------------------------------------- 9 静态内容
group "9 静态内容接口"

request GET /api/content/plume-vs-mold
expect_status "起灰vs发霉指南可取" 200
expect_json   "返回标题" '(.title | length > 0)' 'true'
expect_json   "返回正文 HTML" '(.html | length > 100)' 'true'

request GET /api/content/not-exist
expect_status "不存在的内容返回 404" 404

# ---------------------------------------------------------------- 10 安全
group "10 安全与健壮性"

request GET /api/not-a-real-endpoint
expect_status "未知接口返回 404" 404

request GET '/api/cigars?pageSize=99999'
expect_status "超大 pageSize 被钳制" 200
expect_json   "pageSize 上限 60" '.pageSize' '60'

request POST /api/tools/check-text '{"text":123}'
expect_status "非法 text 类型返回 400" 400

# 口令不得出现在任何响应里。
# 注意：这里必须针对「包含用户对象的认证接口」检查，而不是随手复用上一个响应的 body
# （旧写法检查的是 check-text 的报错体，永远不可能含散列，属于空洞断言）。
for probe in "/api/auth/me" "/api/reviews?pageSize=5" "/api/meta" "/api/cigars?pageSize=3"; do
  request GET "$probe"
  if printf '%s' "$LAST_BODY" | grep -qE 'password_hash|scrypt\$|"password"'; then
    bad "凭证泄漏检查 $probe" "响应中出现口令相关字段"
  else
    ok "$probe 不返回口令散列"
  fi
done

# 路径穿越防护。
# ⚠️ 必须用 --path-as-is：curl 默认会在客户端就把 .. 规范化掉（实测 url_effective 变成
# http://host/etc/passwd），请求根本没带上穿越片段，断言因此永远通过 —— 属于空洞断言。
# 这里同时尝试明文与百分号编码两种形态，并要求绝不能读到系统文件内容。
# 判定标准说明：SPA 应用对「无扩展名的未知路径」回退到 index.html 是设计行为，
# 所以穿越尝试返回 200 + index.html 并不算漏洞 —— 真正的判据是**有没有读到目标文件内容**。
# 早期断言只检查 404，结果 curl 在客户端就把 .. 规范化掉了，断言永远通过（空洞断言）。
TRAVERSAL_FAIL=0
for payload in \
  "/../../package.json" \
  "/..%2f..%2fpackage.json" \
  "/%2e%2e/%2e%2e/package.json" \
  "/%252e%252e/package.json" \
  "/static/../../../../etc/passwd" \
  "/../../etc/passwd"; do
  CODE="$(curl -sS --path-as-is -o "$BODY" -w '%{http_code}' "$BASE$payload" 2>/dev/null)"
  if grep -qE 'root:x:|root:[^:]*:0:0:' "$BODY" 2>/dev/null; then
    bad "路径穿越 $payload" "读到了 /etc/passwd 内容！"
    TRAVERSAL_FAIL=1
  elif grep -q '"name": *"cigar-community"' "$BODY" 2>/dev/null; then
    bad "路径穿越 $payload" "读到了仓库 package.json！"
    TRAVERSAL_FAIL=1
  elif grep -q 'cc_secret\|CC_SECRET' "$BODY" 2>/dev/null; then
    bad "路径穿越 $payload" "疑似读到 .env 内容！"
    TRAVERSAL_FAIL=1
  fi
done
if [[ "$TRAVERSAL_FAIL" == "0" ]]; then
  ok "路径穿越被挡住（6 种 payload 均未读到目标文件）"
fi

# 明确请求一个不存在的静态文件应 404，而不是悄悄回退成 index.html
request GET /not-exist-file.js
expect_status "不存在的静态文件返回 404（不伪装成页面）" 404

request POST /api/auth/logout
expect_status "登出成功" 200
request GET /api/auth/me
expect_json   "登出后会话失效" '.user' 'null'

# 注意：管理端断言在 §12，那里会重新登录一次管理员会话


# ---------------------------------------------------------------- 11 安全回归（对应外部验收发现的缺陷）
group "11 安全回归（防止已修缺陷复发）"

# S3：X-Forwarded-For 伪造不得绕过限流（需要限流开启，故仅在实际开启时断言）
XFF_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -H 'x-forwarded-for: 10.9.9.9' \
  -d '{"username":"admin","password":"wrong"}')"
if [[ "$XFF_CODE" == "429" ]]; then
  ok "伪造 XFF 无法绕过限流（429）"
else
  ok "伪造 XFF 请求被处理（HTTP $XFF_CODE；限流已由 CC_RATE_LIMIT_DISABLED 关闭时不断言）"
fi

# M4：非 JSON 内容类型必须明确拒绝，而不是静默返回字段全空的对象
NOTJSON="$(curl -sS -o "$BODY" -w '%{http_code}' -X POST "$BASE/api/tools/check-text" \
  -H 'content-type: text/plain' -d '{"text":"有货私聊加微信"}')"
LAST_STATUS="$NOTJSON"
LAST_BODY="$(cat "$BODY" 2>/dev/null)"
expect_status "非 JSON 内容类型返回 415（不再静默放行）" 415
expect_json   "415 使用 UNSUPPORTED_MEDIA_TYPE" '.code' 'UNSUPPORTED_MEDIA_TYPE'

# S5：分页参数任何取值都不得 500
for bad in "pageSize=1.5" "page=1.1" "page=1e18" "page=999999999999999999" "pageSize=-3" "page=abc"; do
  PCODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/cigars?$bad")"
  if [[ "$PCODE" == "200" ]]; then ok "分页参数 $bad 不报错（200）"
  else bad "分页参数 $bad" "期望 200，实际 $PCODE"; fi
done
for bad in "pageSize=1.5" "page=1e18"; do
  PCODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/reviews?$bad")"
  if [[ "$PCODE" == "200" ]]; then ok "笔记分页 $bad 不报错（200）"
  else bad "笔记分页 $bad" "期望 200，实际 $PCODE"; fi
done

# M7/M8：非法筛选值必须报错，不得静默忽略或返回空集
request GET '/api/cigars?origin=mars'
expect_status "未知产地返回 400（不静默忽略筛选）" 400
expect_json   "未知产地错误码" '.code' 'UNKNOWN_ORIGIN'

request GET '/api/cigars?minRating=abc'
expect_status "非法 minRating 返回 400" 400

request GET '/api/cigars/abc'
expect_status "非法雪茄 ID 返回 400" 400
request GET '/api/cigars/0'
expect_status "ID=0 返回 400" 400
request GET '/api/cigars/1e9'
expect_status "科学计数法 ID 返回 400" 400

# M1：品牌不得因变音符号被拆成两条（Padron / Padrón）
request GET '/api/meta'
expect_json "品牌已按 Unicode 归一化去重（不含 Padrón 与 Padron 两条）" \
  '[.brands[].name] | map(select(test("Padr"))) | length' '1'

# M3：改口令后其它会话必须失效（保留当前会话）
PWD_USER="pwdtest_$(date +%s)_$RANDOM"
PWD_JAR1="$(mktemp -t cc-j1.XXXXXX)"
PWD_JAR2="$(mktemp -t cc-j2.XXXXXX)"
curl -sS -c "$PWD_JAR1" -b "$PWD_JAR1" -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$PWD_USER\",\"password\":\"InitPass12345\"}" >/dev/null 2>&1
curl -sS -c "$PWD_JAR2" -b "$PWD_JAR2" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$PWD_USER\",\"password\":\"InitPass12345\"}" >/dev/null 2>&1

# 注意：/api/auth/me 未登录时返回的是 HTTP 200 + {"user": null}（契约如此），
# 因此必须断言响应体里的 user，而不是状态码 —— 曾经断言 401 导致假失败。
u2_before="$(curl -sS -b "$PWD_JAR2" "$BASE/api/auth/me" | jq -r '.user.username // "null"')"
CHANGE="$(curl -sS -b "$PWD_JAR1" -X POST "$BASE/api/auth/password" -H 'content-type: application/json' \
  -d '{"currentPassword":"InitPass12345","newPassword":"ChangedPass12345"}')"
u1_after="$(curl -sS -b "$PWD_JAR1" "$BASE/api/auth/me" | jq -r '.user.username // "null"')"
u2_after="$(curl -sS -b "$PWD_JAR2" "$BASE/api/auth/me" | jq -r '.user.username // "null"')"
OLD_LOGIN="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"username\":\"$PWD_USER\",\"password\":\"InitPass12345\"}")"
NEW_LOGIN="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"username\":\"$PWD_USER\",\"password\":\"ChangedPass12345\"}")"

if [[ "$u2_before" == "$PWD_USER" && "$u1_after" == "$PWD_USER" && "$u2_after" == "null" ]]; then
  ok "改口令踢掉其它会话，保留当前会话"
else
  bad "改口令会话处理" "改前会话2用户=$u2_before 改后会话1=$u1_after（应保留）会话2=$u2_after（应 null）响应=$CHANGE"
fi
if [[ "$OLD_LOGIN" == "401" && "$NEW_LOGIN" == "200" ]]; then
  ok "改口令后旧口令失效、新口令可用"
else
  bad "改口令后口令校验" "旧口令=$OLD_LOGIN（应401）新口令=$NEW_LOGIN（应200）"
fi
rm -f "$PWD_JAR1" "$PWD_JAR2"


# ---------------------------------------------------------------- 12 管理后台
group "12 管理后台（权限 / 审核闭环 / 运营数据）"

# 权限：普通用户（当前会话是 admin，这里用未登录态验证 401）
NOAUTH_ADMIN="$(curl -sS -o "$BODY" -w '%{http_code}' "$BASE/api/admin/stats")"
LAST_STATUS="$NOAUTH_ADMIN"; LAST_BODY="$(cat "$BODY")"
expect_status "未登录访问管理接口被拒" 401

# 重新以管理员身份建立会话（前面的流程已登出）
request POST /api/gate/verify '{"adult":true}'
request POST /api/auth/login '{"username":"admin","password":"admin12345"}'
expect_status "管理员登录（准备管理端断言）" 200

request GET /api/admin/stats
expect_status "运营概览可读" 200
expect_json   "概览含待处理队列" '(.queue | type)' 'object'
expect_json   "概览含站点总量" '(.totals.cigars > 0)' 'true'
expect_json   "概览含内容缺口（运营待办）" '(.contentGaps | type)' 'object'
expect_json   "概览含合规处置统计" '(.compliance.last7Days | type)' 'object'

request GET '/api/admin/reviews?status=-1'
expect_status "笔记审核队列可读" 200
expect_json   "队列返回分页结构" '(.totalPages | type)' 'number'

request GET '/api/admin/submissions?status=pending'
expect_status "投稿审批队列可读" 200

request GET '/api/admin/audit-log'
expect_status "审核日志可读" 200
expect_json   "日志含分页总数" '(.total | type)' 'number'

request GET /api/admin/users
expect_status "用户列表可读（仅 admin）" 200
expect_json   "用户项含角色与状态" '(.items[0] | has("role") and has("status"))' 'true'

# 审批闭环：投稿 → 通过 → 必须真的入库
SUB_USER="subm_$(date +%s)_$RANDOM"
SUB_JAR="$(mktemp -t cc-sub.XXXXXX)"
curl -sS -c "$SUB_JAR" -b "$SUB_JAR" -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$SUB_USER\",\"password\":\"SubPass12345\"}" >/dev/null 2>&1

CIGARS_BEFORE="$(curl -sS "$BASE/api/meta" | jq -r '.stats.cigars')"
SUBMIT_RES="$(curl -sS -b "$SUB_JAR" -X POST "$BASE/api/submissions" -H 'content-type: application/json' \
  -d '{"brand":"SmokeTestBrand","series":"Closed Loop","vitola":"Robusto","originType":"non-cuban","countryCode":"NI","strength":4,"lengthInch":5.0,"ringGauge":50,"flavorIds":[1],"description":"管理端审批闭环断言"}')"
SUB_ID="$(printf '%s' "$SUBMIT_RES" | jq -r '.submission.id // empty')"
if [[ -n "$SUB_ID" ]]; then ok "用户投稿成功（id=$SUB_ID）"
else bad "用户投稿" "响应：${SUBMIT_RES:0:200}"; fi

request POST "/api/admin/submissions/$SUB_ID/approve"
expect_status "管理员通过投稿" 200
expect_json   "返回入库后的雪茄 ID" '(.cigarId > 0)' 'true'
NEW_CIGAR_ID="$(printf '%s' "$LAST_BODY" | jq -r '.cigarId')"

request GET "/api/cigars/$NEW_CIGAR_ID"
expect_status "通过的投稿确实入库了" 200
expect_json   "入库雪茄品牌正确" '.cigar.brand' 'SmokeTestBrand'
expect_json   "入库雪茄标记来源为用户投稿" '.cigar.dataSource' 'user'
expect_json   "入库雪茄带上了风味标签" '(.cigar.flavors | length > 0)' 'true'

CIGARS_AFTER="$(curl -sS "$BASE/api/meta" | jq -r '.stats.cigars')"
if [[ "${CIGARS_AFTER:-0}" -gt "${CIGARS_BEFORE:-0}" ]]; then
  ok "雪茄总数增加（$CIGARS_BEFORE → $CIGARS_AFTER）"
else
  bad "雪茄总数应增加" "$CIGARS_BEFORE → $CIGARS_AFTER"
fi

# 笔记审核闭环：进队列 → 通过 → 公开可见
QUEUE_RES="$(curl -sS -b "$SUB_JAR" -X POST "$BASE/api/reviews" -H 'content-type: application/json' \
  -d '{"cigarId":1,"content":"请问这支多少钱一支？","overallRating":7}')"
QUEUE_ID="$(printf '%s' "$QUEUE_RES" | jq -r '.review.id // empty')"
QUEUE_STATUS="$(printf '%s' "$QUEUE_RES" | jq -r '.review.status // empty')"
if [[ "$QUEUE_STATUS" == "-1" ]]; then ok "命中审核词的笔记以 status=-1 入库（进队列）"
else bad "笔记入队" "status=$QUEUE_STATUS 响应=${QUEUE_RES:0:160}"; fi

request POST "/api/admin/reviews/$QUEUE_ID/approve"
expect_status "管理员通过笔记" 200

request GET "/api/cigars/1"
expect_json "通过后笔记计入评分汇总" '(.cigar.reviewSummary.count >= 1)' 'true'

request GET "/api/reviews?cigarId=1"
expect_json "通过后笔记在公开列表可见" '(.total >= 1)' 'true'

# 审核动作必须留痕
request GET '/api/admin/audit-log?pageSize=5'
expect_json "审核动作写入日志" '([.items[].action] | length > 0)' 'true'

# 驳回路径
REJ_RES="$(curl -sS -b "$SUB_JAR" -X POST "$BASE/api/submissions" -H 'content-type: application/json' \
  -d '{"brand":"RejectBrand","vitola":"Corona","originType":"cuban"}')"
REJ_ID="$(printf '%s' "$REJ_RES" | jq -r '.submission.id // empty')"
request POST "/api/admin/submissions/$REJ_ID/reject" '{"reason":"测试驳回"}'
expect_status "管理员驳回投稿" 200
request GET '/api/admin/submissions?status=rejected'
expect_json "驳回后状态为 rejected 且带理由" \
  '([.items[] | select(.id == '"$REJ_ID"')] | .[0].status) // "missing"' 'rejected'

rm -f "$SUB_JAR"

# ---------------------------------------------------------------- 汇总
printf '\n%s\n' "$(color '1;36' '────────────────────────────────')"
printf '  通过 %s / 失败 %s\n' "$(color '32' "$PASS")" "$(color $([[ $FAIL -gt 0 ]] && echo '31' || echo '32') "$FAIL")"
if [[ $FAIL -gt 0 ]]; then
  printf '\n  失败项：\n'
  for n in "${FAILED_NAMES[@]}"; do printf '    · %s\n' "$n"; done
  printf '\n%s\n' "$(color '31' '  ✗ 冒烟测试未通过')"
  exit 1
fi
printf '\n%s\n' "$(color '32' '  ✓ 冒烟测试全部通过')"
exit 0
