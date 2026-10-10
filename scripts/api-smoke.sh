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

request POST /api/submissions '{"brand":"BadBrand","vitola":"X","originType":"cuban","note":"有货私聊"}'
expect_status "违规投稿被拦截" 403

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

# 口令不得出现在任何响应里
if [[ "$LAST_BODY" == *"password_hash"* ]] || [[ "$LAST_BODY" == *'scrypt$'* ]]; then
  bad "响应不含口令散列" "检测到散列泄漏"
else
  ok "响应不含口令散列"
fi

# 路径穿越防护
TRAVERSAL_CODE="$(curl -sS -o "$BODY" -w '%{http_code}' "$BASE/../../etc/passwd")"
if [[ "$TRAVERSAL_CODE" == "404" || "$TRAVERSAL_CODE" == "400" ]]; then
  ok "路径穿越被拒(HTTP $TRAVERSAL_CODE)"
else
  if grep -q 'root:' "$BODY" 2>/dev/null; then
    bad "路径穿越防护" "疑似读到系统文件！"
  else
    ok "路径穿越未读到系统文件(HTTP $TRAVERSAL_CODE)"
  fi
fi

request POST /api/auth/logout
expect_status "登出成功" 200
request GET /api/auth/me
expect_json   "登出后会话失效" '.user' 'null'

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
