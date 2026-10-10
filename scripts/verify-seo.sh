#!/usr/bin/env bash
# ============================================================================
# SEO / 社交分享卡片断言
#
# 为什么单独一个脚本：普通前端断言是「用浏览器打开页面看渲染」，
# 而 SEO 要验证的是**爬虫视角** —— 不执行 JS、只发一个普通 HTTP 请求，
# 拿到的 HTML 里就必须有正确的 title / description / OG 标签。
# 这两件事的验证方式完全不同，混在一起容易漏。
#
# 用法：bash scripts/verify-seo.sh [base_url]
# 退出码：0 = 全部通过
# ============================================================================
set -uo pipefail

BASE="${1:-http://127.0.0.1:8787}"
BODY="$(mktemp -t cc-seo.XXXXXX)"
PASS=0; FAIL=0; WARN=0
FAILED=()

cleanup() { rm -f "$BODY"; }
trap cleanup EXIT

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()   { PASS=$((PASS+1)); printf '  %s %s\n' "$(c 32 '✓')" "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  %s %s\n      %s\n' "$(c 31 '✗')" "$1" "$2"; }
grp()  { printf '\n%s\n' "$(c '1;33' "▌$1")"; }
warn() { WARN=$((WARN+1)); printf '  %s %s\n      %s\n' "$(c 33 '!')" "$1" "$2"; }

# 取页面并抽取某个 meta/title 的内容
fetch() { curl -sS --max-time 10 "$BASE$1" -o "$BODY" 2>/dev/null; }
title_of() { grep -o '<title>[^<]*</title>' "$BODY" 2>/dev/null | head -1 | sed 's/<[^>]*>//g'; }
meta_content() { # property-or-name
  grep -o "<meta[^>]*$1[^>]*>" "$BODY" 2>/dev/null | head -1 | sed -n 's/.*content="\([^"]*\)".*/\1/p'
}
assert_contains() { # name haystack needle
  if printf '%s' "$2" | grep -q "$3"; then ok "$1"
  else bad "$1" "未找到 [$3]，实际：$(printf '%s' "$2" | head -c 120)"; fi
}
assert_nonempty() { # name value
  if [[ -n "$2" ]]; then ok "$1"
  else bad "$1" "为空"; fi
}
# HTML 转义后的 < 应为 &lt;（防止标签注入）
assert_no_raw_tag() { # name value
  if printf '%s' "$2" | grep -q '<'; then bad "$1" "出现未转义的 < ：$2"
  else ok "$1"; fi
}

# 先过年龄门：脚本里有几处直接查 API（用户主页探测、sitemap 数量比对），
# 服务端强制年龄门后不带凭证会拿到 403（这个假失败真实发生过）
AGE_COOKIE="$(curl -sS -D- -o /dev/null --max-time 10 -X POST "$BASE/api/gate/verify" \
  -H 'content-type: application/json' -d '{"adult":true}' 2>/dev/null \
  | tr -d '\r' | grep -i '^set-cookie: *cc_age=' | head -1 | sed -n 's/.*cc_age=\([^;]*\).*/\1/p')"
if [[ -n "$AGE_COOKIE" ]]; then
  ok "已通过年龄门（后续 API 检查需要凭证）"
else
  warn "未取得年龄门凭证" "涉及 /api 的检查可能被 403 拦下"
fi
AGE=(-H "cookie: cc_age=$AGE_COOKIE")

printf '%s\n' "$(c '1;36' "雪茄客 SEO 断言 · $BASE")"

# ---------------------------------------------------------------- 首页
grp "首页"
fetch /
CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/")"
[[ "$CODE" == "200" ]] && ok "首页可达" || bad "首页" "HTTP $CODE"
T="$(title_of)"; assert_nonempty "有 title" "$T"
D="$(meta_content 'name="description"')"; assert_nonempty "有 description" "$D"
assert_nonempty "有 og:title" "$(meta_content 'property="og:title"')"
assert_nonempty "有 og:description" "$(meta_content 'property="og:description"')"
assert_nonempty "有 og:site_name" "$(meta_content 'property="og:site_name"')"
assert_nonempty "有 twitter:card" "$(meta_content 'name="twitter:card"')"

# ---------------------------------------------------------------- 雪茄详情
grp "雪茄详情页（爬虫必须看到单页专属内容）"
fetch /cigars/1
T="$(title_of)"
assert_contains "标题含品牌" "$T" "Cohiba"
assert_contains "标题含站名" "$T" "雪茄客"
D="$(meta_content 'property="og:description"')"
assert_nonempty "有 og:description" "$D"
assert_contains "描述含产地或风味信息" "$D" "古巴\|环径\|雪松\|浓郁"
U="$(meta_content 'property="og:url"')"
assert_contains "og:url 是绝对地址" "$U" "^http"
assert_contains "og:type 为 article" "$(meta_content 'property="og:type"')" "article"

# 不存在的雪茄应 noindex
fetch /cigars/999999
assert_contains "不存在的雪茄标 noindex" "$(meta_content 'name="robots"')" "noindex"

# ---------------------------------------------------------------- 工具页
grp "工具页"
for pair in "/tools/diagnostic:诊断" "/tools/flavor-test:风味" "/tools/aging-calc:醇化" "/guide/plume-vs-mold:起灰"; do
  path="${pair%%:*}"; kw="${pair##*:}"
  fetch "$path"
  T="$(title_of)"
  assert_contains "$path 标题含关键词" "$T" "$kw"
  assert_nonempty "$path 有 og:description" "$(meta_content 'property="og:description"')"
done

# ---------------------------------------------------------------- 用户主页
grp "用户主页"
fetch /api/users/1 >/dev/null 2>&1
UID_OK="$(curl -sS --max-time 5 "${AGE[@]}" "$BASE/api/users/1" | jq -r '.user.id // empty' 2>/dev/null)"
if [[ -n "$UID_OK" ]]; then
  fetch "/users/$UID_OK"
  assert_contains "标题含用户名" "$(title_of)" "admin"
  assert_nonempty "有 og:description" "$(meta_content 'property="og:description"')"
else
  bad "用户主页" "拿不到可用用户（先登录一次或跑过 seed）"
fi

# ---------------------------------------------------------------- 不索引页
grp "不应被索引的页面"
fetch /login
assert_contains "登录页 noindex" "$(meta_content 'name="robots"')" "noindex"
fetch /this-does-not-exist
assert_contains "未知路径 noindex" "$(meta_content 'name="robots"')" "noindex"

# ---------------------------------------------------------------- 单一来源
grp "meta 不得重复注入"
fetch /cigars/1
TC="$(grep -c '<title>' "$BODY" 2>/dev/null || echo 0)"
if [[ "$TC" == "1" ]]; then ok "只有一个 <title>"
else bad "title 重复" "找到 $TC 个"; fi
DC="$(grep -c 'name="description"' "$BODY" 2>/dev/null || echo 0)"
if [[ "$DC" == "1" ]]; then ok "只有一个 description"
else bad "description 重复" "找到 $DC 个"; fi

# ---------------------------------------------------------------- sitemap / robots
grp "sitemap 与 robots"
fetch /sitemap.xml
SITEMAP_CODE="$(curl -sS -o "$BODY" -w '%{http_code}' "$BASE/sitemap.xml")"
[[ "$SITEMAP_CODE" == "200" ]] && ok "sitemap.xml 可达" || bad "sitemap" "HTTP $SITEMAP_CODE"
assert_contains "sitemap 是合法 XML 声明" "$(head -1 "$BODY")" "<?xml"
LOCS="$(grep -c '<loc>' "$BODY" 2>/dev/null || echo 0)"
if [[ "${LOCS:-0}" -ge 40 ]]; then ok "sitemap 包含全部雪茄（$LOCS 条 URL）"
else bad "sitemap URL 数不足" "只有 $LOCS 条"; fi
assert_contains "sitemap 含雪茄详情链接" "$(grep -o '/cigars/[0-9]*' "$BODY" | head -1)" "/cigars/"

fetch /robots.txt
assert_contains "robots.txt 可达" "$(cat "$BODY")" "Sitemap"
assert_contains "robots 禁止抓取接口" "$(cat "$BODY")" "Disallow: /api/"
assert_contains "robots 禁止抓取管理后台" "$(cat "$BODY")" "Disallow: /admin/"
# Sitemap 指令必须是绝对 URL —— 规范如此，搜索引擎不解析相对路径。
# 这里曾是一份静态文件写成 `Sitemap: /sitemap.xml`，等于没写（已改为服务端生成）。
assert_contains "robots 的 Sitemap 是绝对地址" "$(cat "$BODY")" "Sitemap: http"
# 反向验证：静态文件不应再存在，否则会静默顶替动态版本
if [[ ! -f web/public/sitemap.xml && ! -f web/public/robots.txt ]]; then
  ok "未残留静态 sitemap/robots（避免静默顶替动态版本）"
else
  bad "静态文件残留" "web/public 下仍有 sitemap.xml 或 robots.txt"
fi

# 换域名后绝对地址必须跟着变（否则线上会写死成 127.0.0.1）
FAKE_HOST="cigar.example.com"
HOSTED_ROBOTS="$(curl -sS --max-time 5 -H "Host: $FAKE_HOST" -H 'X-Forwarded-Proto: https' "$BASE/robots.txt" 2>/dev/null)"
assert_contains "robots 的 Sitemap 随域名变化" "$HOSTED_ROBOTS" "https://$FAKE_HOST/sitemap.xml"
HOSTED_MAP="$(curl -sS --max-time 5 -H "Host: $FAKE_HOST" -H 'X-Forwarded-Proto: https' "$BASE/sitemap.xml" 2>/dev/null)"
assert_contains "sitemap 的 loc 随域名变化" "$HOSTED_MAP" "https://$FAKE_HOST/"
if printf '%s' "$HOSTED_MAP" | grep -q '<loc>/'; then
  bad "sitemap 出现相对地址" "<loc>/ 形式会让爬虫无法定位"
else
  ok "sitemap 全部为绝对地址"
fi

# sitemap 条数应随雪茄数变化，而不是一份写死的清单
EXPECT_URLS="$(curl -sS --max-time 5 "${AGE[@]}" "$BASE/api/meta" | jq -r '.stats.cigars')"
if [[ "${LOCS:-0}" -ge "${EXPECT_URLS:-0}" ]]; then
  ok "sitemap 条数不少于雪茄数（URL $LOCS ≥ 雪茄 $EXPECT_URLS）"
else
  bad "sitemap 覆盖不足" "URL $LOCS < 雪茄 $EXPECT_URLS"
fi

# ---------------------------------------------------------------- 转义安全
grp "HTML 转义（防止 meta 注入）"
fetch /cigars/1
D="$(meta_content 'property="og:description"')"
assert_no_raw_tag "描述中无未转义标签" "$D"

# ---------------------------------------------------------------- 汇总
printf '\n%s\n' "$(c '1;36' '────────────────────────────────────')"
printf '  通过 %s · 失败 %s\n' "$(c 32 "$PASS")" "$(c $([[ $FAIL -gt 0 ]] && echo 31 || echo 32) "$FAIL")"
if [[ $FAIL -gt 0 ]]; then
  printf '\n  失败项：\n'
  for n in "${FAILED[@]}"; do printf '    · %s\n' "$n"; done
  printf '\n%s\n' "$(c 31 '  ✗ SEO 断言未通过')"
  exit 1
fi
printf '\n%s\n' "$(c 32 '  ✓ SEO 断言全部通过')"
exit 0
