#!/usr/bin/env bash
# ============================================================================
# 雪茄客 · 上线前预检
#
# 定位：这是「部署前最后一次体检」，只读、不改数据、可对生产环境安全执行。
#       与 scripts/test-e2e.sh 的分工：
#         test-e2e.sh  在隔离临时库上跑完整契约（含写操作），用于开发自测
#         preflight.sh 对指定环境做只读体检（含外网/域名/证书），用于割接前
#
# 用法：
#   bash scripts/preflight.sh                          # 体检本地 http://127.0.0.1:8787
#   bash scripts/preflight.sh https://cigar.example.com # 体检线上环境
# 退出码：0 = 全部通过，1 = 有 FAIL 项
# ============================================================================
set -uo pipefail

BASE="${1:-http://127.0.0.1:8787}"
BODY="$(mktemp -t cc-preflight.XXXXXX)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${CC_BACKUP_DIR:-$ROOT_DIR/backups}"
PASS=0; FAIL=0; WARN=0
FAILED=()

cleanup() { rm -f "$BODY"; }
trap cleanup EXIT

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()   { PASS=$((PASS+1)); printf '  %s %s\n' "$(c 32 '✓')" "$1"; }
fail() { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  %s %s\n      %s\n' "$(c 31 '✗')" "$1" "$2"; }
warn() { WARN=$((WARN+1)); printf '  %s %s\n      %s\n' "$(c 33 '!')" "$1" "$2"; }
grp()  { printf '\n%s\n' "$(c '1;33' "▌$1")"; }

get() { # path -> sets STATUS / BODY_CONTENT
  STATUS="$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 10 "$BASE$1" 2>/dev/null || echo 000)"
  BODY_CONTENT="$(cat "$BODY" 2>/dev/null)"
}
jqv() { printf '%s' "$BODY_CONTENT" | jq -r "$1" 2>/dev/null; }

command -v jq >/dev/null || { echo "需要 jq：brew install jq"; exit 1; }

printf '%s\n' "$(c '1;36' "雪茄客 上线前预检 · $BASE")"
printf '%s\n' "$(c 90 "$(date '+%Y-%m-%d %H:%M:%S')")"

# ---------------------------------------------------------------- 1 连通与服务
grp "1 服务连通性与运行状态"
get /api/health
if [[ "$STATUS" == "200" ]]; then
  ok "健康检查可达"
  [[ "$(jqv '.db')" == "ok" ]] && ok "数据库连接正常" || fail "数据库连接" "$(jqv '.db')"
  VERSION="$(jqv '.version')"
  ok "服务版本 $VERSION"
  CIGARS="$(jqv '.cigars')"
  if [[ "${CIGARS:-0}" -ge 40 ]]; then ok "雪茄数据量 $CIGARS 条"
  elif [[ "${CIGARS:-0}" -gt 0 ]]; then warn "雪茄数据量偏少（$CIGARS 条）" "预期 ≥40，请确认种子数据已导入"
  else fail "雪茄数据量" "为 0，数据库未初始化"; fi
else
  fail "健康检查可达" "HTTP $STATUS（服务未启动或地址错误）"
fi

# 环境不得在生产环境泄露调试信息
if [[ "$BASE" == https://* ]]; then
  ENVV="$(jqv '.env')"
  if [[ "$ENVV" == "production" ]]; then ok "环境标记为 production"
  else warn "环境标记为 $ENVV" "线上应设 CC_ENV=production（会强制校验密钥与默认口令）"; fi
fi

# ---------------------------------------------------------------- 2 核心接口契约
grp "2 核心接口契约（只读）"
get /api/meta
if [[ "$STATUS" == "200" ]]; then
  ok "元数据接口可用"
  for field in origins sizes strengths flavorCategories sortOptions; do
    n="$(jqv ".$field | length")"
    if [[ "${n:-0}" -gt 0 ]]; then ok "  $field 下发 $n 项"
    else fail "  $field 为空" "前端筛选面板将无选项"; fi
  done
else
  fail "元数据接口" "HTTP $STATUS"
fi

get '/api/cigars?pageSize=3'
if [[ "$STATUS" == "200" ]] && [[ "$(jqv '.items | length')" == "3" ]]; then
  ok "雪茄列表返回正常"
  [[ "$(jqv '.items[0].flavors | type')" == "array" ]] && ok "列表项含风味数组" || fail "列表项结构" "缺少 flavors"
else
  fail "雪茄列表" "HTTP $STATUS / $(jqv '.items|length') 条"
fi

get /api/cigars/1
if [[ "$STATUS" == "200" ]]; then
  ok "雪茄详情可用"
  [[ "$(jqv '.cigar.reviewSummary | type')" == "object" ]] && ok "详情含评分汇总" || fail "详情结构" "缺少 reviewSummary"
else
  fail "雪茄详情" "HTTP $STATUS（id=1 不存在？）"
fi

get /api/cigars/999999
[[ "$STATUS" == "404" ]] && ok "不存在的资源正确返回 404" || fail "404 语义" "期望 404，实际 $STATUS"

# ---------------------------------------------------------------- 3 工具与合规
grp "3 工具接口与合规熔断"
get /api/tools/diagnostic
if [[ "$STATUS" == "200" ]] && [[ "$(jqv '.questions | length')" -gt 0 ]]; then ok "诊断题目可用"
else fail "诊断题目" "HTTP $STATUS"; fi

get /api/tools/flavor-test
[[ "$STATUS" == "200" ]] && ok "风味测试题目可用" || fail "风味测试" "HTTP $STATUS"

get /api/tools/aging-calc
[[ "$STATUS" == "200" ]] && ok "醇化计算器选项可用" || fail "醇化计算器" "HTTP $STATUS"

# 合规熔断必须在「无登录」状态下也能正确工作（预检不建账号）
check_text() { # text -> action
  curl -sS --max-time 10 -X POST "$BASE/api/tools/check-text" \
    -H 'content-type: application/json' \
    -d "$(jq -nc --arg t "$1" '{text:$t}')" 2>/dev/null | jq -r '.action' 2>/dev/null
}
A_BAD="$(check_text '有货私聊 微信出茄 代购')"
if [[ "$A_BAD" == "blocked" ]]; then ok "交易内容被正确拦截（blocked）"
else fail "敏感词熔断" "期望 blocked，实际 $A_BAD"; fi

A_GOOD="$(check_text '这支雪茄前段雪松木和可可很突出')"
if [[ "$A_GOOD" == "clean" ]]; then ok "正常品鉴内容正确放行（clean）"
else fail "误杀检查" "正常内容被判为 $A_GOOD"; fi

A_NEG="$(check_text '本站不卖雪茄，只做知识交流')"
if [[ "$A_NEG" == "clean" ]]; then ok "否定语境未误杀"
else warn "否定语境被误判" "实际 $A_NEG（检查 config/sensitive-words.json 的 negation_context）"; fi

# ---------------------------------------------------------------- 4 合规与安全
grp "4 合规（年龄门）与安全响应头"
get /api/auth/me
if [[ "$STATUS" == "200" ]]; then
  [[ "$(jqv '.ageVerified')" == "false" ]] && ok "匿名访问时年龄门未通过（应弹窗）" \
    || warn "年龄门状态" "匿名请求 ageVerified=$(jqv '.ageVerified')，预期 false"
else fail "会话接口" "HTTP $STATUS"; fi

# 爬虫 UA 应直接放行
BOT="$(curl -sS --max-time 10 -A 'Googlebot/2.1' "$BASE/api/auth/me" 2>/dev/null | jq -r '.ageVerified' 2>/dev/null)"
[[ "$BOT" == "true" ]] && ok "爬虫 UA 不弹年龄门（利于 SEO）" || warn "爬虫年龄门" "Googlebot 得到 ageVerified=$BOT"

HEADERS="$(curl -sS -D- -o /dev/null --max-time 10 "$BASE/" 2>/dev/null | tr -d '\r')"
check_header() { # name pattern
  if printf '%s' "$HEADERS" | grep -qi "^$2"; then ok "安全响应头 $1"; else fail "安全响应头 $1" "缺失 $2"; fi
}
check_header "X-Content-Type-Options" 'x-content-type-options: *nosniff'
check_header "X-Frame-Options" 'x-frame-options: *SAMEORIGIN'
check_header "Referrer-Policy" 'referrer-policy:'
check_header "Permissions-Policy" 'permissions-policy:'

if [[ "$BASE" == https://* ]]; then
  if printf '%s' "$HEADERS" | grep -qi '^strict-transport-security'; then ok "安全响应头 HSTS"
  else fail "安全响应头 HSTS" "HTTPS 环境缺失 Strict-Transport-Security"; fi
fi

# 明文 HTTP 应 301 跳转到 HTTPS（仅在提供 http 地址时检查）
if [[ "$BASE" == http://* ]] && [[ "$BASE" != *127.0.0.1* ]] && [[ "$BASE" != *localhost* ]]; then
  REDIR="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/" 2>/dev/null)"
  [[ "$REDIR" == "301" || "$REDIR" == "308" ]] && ok "HTTP 强跳 HTTPS（$REDIR）" \
    || warn "HTTP→HTTPS 跳转" "得到 $REDIR，建议在反代层加 301"
fi

# ---------------------------------------------------------------- 5 前端资源
grp "5 前端构建产物"
get /
if [[ "$STATUS" == "200" ]] && printf '%s' "$BODY_CONTENT" | grep -q '<div id="app">'; then
  ok "前端已构建并由后端托管"
  ASSET="$(printf '%s' "$BODY_CONTENT" | grep -o '/assets/[A-Za-z0-9._-]*\.js' | head -1)"
  if [[ -n "$ASSET" ]]; then
    ACODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$ASSET")"
    [[ "$ACODE" == "200" ]] && ok "静态资源可访问（$ASSET）" || fail "静态资源" "$ASSET 返回 $ACODE"
    ENC="$(curl -sS -D- -o /dev/null -H 'accept-encoding: gzip' --max-time 10 "$BASE$ASSET" | tr -d '\r' | grep -i '^content-encoding' || true)"
    [[ -n "$ENC" ]] && ok "静态资源启用 gzip 压缩" || warn "静态资源未压缩" "建议启用 gzip 以降低首屏体积"
  else fail "静态资源引用" "首页未找到 /assets/*.js 引用"; fi
else
  warn "前端未构建" "首页无 #app 容器。生产部署前需执行 npm run build"
fi

get /cigars/1
[[ "$STATUS" == "200" ]] && ok "SPA 深链接回退正常（/cigars/1）" || fail "SPA 回退" "HTTP $STATUS"

# ---------------------------------------------------------------- 6 敏感信息泄露
grp "6 敏感信息与凭证"
get /api/auth/me
if printf '%s' "$BODY_CONTENT" | grep -qE 'password_hash|scrypt\$'; then
  fail "凭证泄露检查" "响应中出现口令散列字段"
else ok "接口不返回口令散列"; fi

for f in /api/health; do
  get "$f"
  if printf '%s' "$BODY_CONTENT" | grep -qiE 'cc_secret|DB_PASSWORD|admin12345'; then
    fail "配置泄露检查" "$f 响应中出现配置敏感值"
  fi
done
ok "接口不返回服务端配置"

if [[ -f .env ]]; then
  if [[ "$(grep -c 'CC_SECRET=change-me' .env 2>/dev/null || echo 0)" != "0" ]]; then
    fail "生产密钥" ".env 中 CC_SECRET 仍是模板默认值"
  else ok "CC_SECRET 已修改（非模板值）"; fi
  # 关键：密钥文件权限只应属主可读
  PERM="$(ls -l .env | awk '{print $1}')"
  if [[ "$PERM" == *'-------'* || "$PERM" == '-rw-------' ]]; then ok ".env 权限收紧（$PERM）"
  else warn ".env 权限过宽" "$PERM，建议 chmod 600 .env"; fi
else
  warn "未找到 .env" "当前使用默认配置（仅适合本地开发）"
fi

# ---------------------------------------------------------------- 7 磁盘与备份
grp "7 数据与备份"
if [[ -d database ]]; then
  DBFILE="$(find database -maxdepth 1 -name '*.db' -print -quit 2>/dev/null)"
  if [[ -n "$DBFILE" ]]; then
    SIZE="$(du -h "$DBFILE" | awk '{print $1}')"
    ok "数据库文件存在（$DBFILE, $SIZE）"
  else
    fail "数据库文件" "database/ 下未找到 *.db"
  fi
fi

if [[ -d "$BACKUP_DIR" ]]; then
  BACKUP_COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'cigar_*.db' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${BACKUP_COUNT:-0}" -gt 0 ]]; then
    LATEST="$(find "$BACKUP_DIR" -maxdepth 1 -name 'cigar_*.db' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)"
    ok "数据库备份 $BACKUP_COUNT 份（最新 $(basename "${LATEST:-未知}")）"
  else
    warn "备份目录为空" "上线前请执行 bash scripts/backup-db.sh"
  fi
else
  warn "未发现备份目录" "上线前请执行 bash scripts/backup-db.sh"
fi

# ---------------------------------------------------------------- 汇总
printf '\n%s\n' "$(c '1;36' '────────────────────────────────────')"
printf '  通过 %s · 警告 %s · 失败 %s\n' "$(c 32 "$PASS")" "$(c 33 "$WARN")" "$(c $([[ $FAIL -gt 0 ]] && echo 31 || echo 32) "$FAIL")"
if [[ $FAIL -gt 0 ]]; then
  printf '\n  必须解决的问题：\n'
  for n in "${FAILED[@]}"; do printf '    · %s\n' "$n"; done
  printf '\n%s\n' "$(c 31 '  ✗ 预检未通过 —— 请勿上线')"
  exit 1
fi
if [[ $WARN -gt 0 ]]; then
  printf '\n%s\n' "$(c 33 '  ! 预检通过，但有警告项需确认')"
  exit 0
fi
printf '\n%s\n' "$(c 32 '  ✓ 预检全部通过 —— 可以上线')"
exit 0
