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

# 年龄门凭证：服务端强制年龄门后，未带 cc_age 的 /api/* 一律 403。
# 体检脚本必须先过门，否则「元数据接口」「雪茄列表」等检查全部失败 ——
# 那是脚本没带凭证，不是站点有问题（这个假失败真实发生过）。
AGE_COOKIE=""
AGE_HEADER=()
pass_age_gate() {
  local hdr
  hdr="$(curl -sS -D- -o /dev/null --max-time 10 -X POST "$BASE/api/gate/verify" \
    -H 'content-type: application/json' -d '{"adult":true}' 2>/dev/null \
    | tr -d '\r' | grep -i '^set-cookie: *cc_age=' | head -1)"
  AGE_COOKIE="$(printf '%s' "$hdr" | sed -n 's/.*cc_age=\([^;]*\).*/\1/p')"
  if [[ -n "$AGE_COOKIE" ]]; then AGE_HEADER=(-H "cookie: cc_age=$AGE_COOKIE"); fi
}

get() { # path -> sets STATUS / BODY_CONTENT
  STATUS="$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 10 "${AGE_HEADER[@]}" "$BASE$1" 2>/dev/null || echo 000)"
  BODY_CONTENT="$(cat "$BODY" 2>/dev/null)"
}
jqv() { printf '%s' "$BODY_CONTENT" | jq -r "$1" 2>/dev/null; }

command -v jq >/dev/null || { echo "需要 jq：brew install jq"; exit 1; }

# 先过年龄门，后续所有 /api/* 检查都要带凭证
pass_age_gate

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
  # 必须带年龄门凭证：/api/tools/* 在年龄门之内，不带会被 403 拦成空 action
  curl -sS --max-time 10 "${AGE_HEADER[@]}" -X POST "$BASE/api/tools/check-text" \
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

# ---------------------------------------------------------------- 部署物一致性
# 这一组是「不启动服务也能查」的静态核对，专门覆盖本地没有 Docker 时
# 最容易漏掉的问题：镜像构建出来的东西跑不起来。
grp "部署物（Docker / CI）"

if [[ -f "$ROOT_DIR/Dockerfile" ]]; then
  ok "Dockerfile 存在"

  # 运行期真正需要读取的文件必须被 COPY 覆盖，否则镜像起来就崩
  MISSING_COPY=()
  for need in server scripts database config content package.json; do
    grep -qE "^COPY +$need/?" "$ROOT_DIR/Dockerfile" || MISSING_COPY+=("$need")
  done
  if [[ ${#MISSING_COPY[@]} -eq 0 ]]; then
    ok "运行期所需目录都已 COPY 进镜像"
  else
    fail "镜像缺少运行期文件" "未 COPY：${MISSING_COPY[*]}"
  fi

  # 种子数据与 schema 是「首次启动自动建库」的前提，必须随镜像发布
  for f in database/schema.sqlite.sql database/seed/cigars.csv database/seed/mock-cigars.json; do
    if [[ -f "$ROOT_DIR/$f" ]]; then
      top="$(printf '%s' "$f" | cut -d/ -f1)"
      if grep -qE "^COPY +$top/" "$ROOT_DIR/Dockerfile"; then
        ok "种子依赖随镜像发布：$f"
      else
        fail "镜像缺少种子依赖" "$f 未被 COPY"
      fi
    else
      fail "种子文件缺失" "$f 不存在，首次启动无法建库"
    fi
  done

  # 本地开发库绝不能进镜像
  if grep -qE '^database/\*\.db' "$ROOT_DIR/.dockerignore" 2>/dev/null; then
    ok ".dockerignore 排除本地开发库（不会把数据烤进镜像）"
  else
    warn "未排除本地数据库" ".dockerignore 应含 database/*.db，否则本地数据会被打进镜像"
  fi

  # 数据必须落在可挂载的卷上，否则容器重建即丢库
  if grep -qE 'CC_DB_PATH=/data|CC_DB_PATH.*=/data' "$ROOT_DIR/Dockerfile"; then
    ok "数据库默认路径在 /data（可挂卷持久化）"
  else
    warn "数据库路径未指向卷" "容器重建会丢数据，建议 CC_DB_PATH=/data/cigar.db"
  fi

  # 健康检查要走应用接口，而不是只看端口
  if grep -q 'HEALTHCHECK' "$ROOT_DIR/Dockerfile"; then
    if grep -A3 'HEALTHCHECK' "$ROOT_DIR/Dockerfile" | grep -q '/api/health'; then
      ok "健康检查调用 /api/health（会真的查一次数据库）"
    else
      warn "健康检查未走应用接口" "建议探测 /api/health，端口可监听但不代表能服务"
    fi
  else
    fail "镜像缺少 HEALTHCHECK" "编排系统无法判断服务是否真的可用"
  fi

  # 非 root 运行
  if grep -qE '^USER +node' "$ROOT_DIR/Dockerfile"; then
    ok "容器以非 root 用户运行"
  else
    warn "容器以 root 运行" "建议加 USER node"
  fi
else
  warn "未发现 Dockerfile" "若不需要容器部署可忽略"
fi

if [[ -f "$ROOT_DIR/.github/workflows/ci.yml" ]]; then
  ok "CI 工作流存在"
  # CI 里引用的 npm 脚本必须真实存在，否则 CI 会在第一步就失败
  CI_MISSING=()
  for sc in $(grep -oE 'npm run [a-zA-Z0-9:_-]+' "$ROOT_DIR/.github/workflows/ci.yml" | awk '{print $3}' | sort -u); do
    grep -q "\"$sc\":" "$ROOT_DIR/package.json" || CI_MISSING+=("$sc")
  done
  if [[ ${#CI_MISSING[@]} -eq 0 ]]; then
    ok "CI 引用的 npm 脚本均存在"
  else
    fail "CI 引用了不存在的脚本" "${CI_MISSING[*]}"
  fi

  # CI 的 Node 版本必须 >= engines 下限，否则测的不是「最低支持版本」
  ENGINES_MIN="$(jq -r '.engines.node // ""' "$ROOT_DIR/package.json" 2>/dev/null | tr -d '>= ')"
  CI_NODE="$(grep -A3 'setup-node' "$ROOT_DIR/.github/workflows/ci.yml" | grep -oE "node-version: *'[^']+'" | head -1 | grep -oE "[0-9.]+")"
  if [[ -n "$ENGINES_MIN" && -n "$CI_NODE" ]]; then
    LOWEST="$(printf '%s\n%s\n' "$ENGINES_MIN" "$CI_NODE" | sort -V | head -1)"
    if [[ "$LOWEST" == "$CI_NODE" ]]; then
      ok "CI 的 Node 版本（$CI_NODE）不高于 engines 下限（$ENGINES_MIN）"
    else
      warn "CI Node 高于最低支持版本" "CI=$CI_NODE，engines=$ENGINES_MIN；跑在下限上才能验证最低版本可用"
    fi
  fi
else
  warn "未发现 CI 工作流" "建议配置 .github/workflows/ci.yml 自动跑测试"
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
