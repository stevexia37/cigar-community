<#
.SYNOPSIS
  上线前自动化预检脚本
.DESCRIPTION
  在割接前 48 小时全量执行，检测 4 个核心维度的健康状态。
  返回 PASS/FAIL 清单，FAIL 项必须 resolve 才能继续部署。
.NOTES
  使用: pwsh .\preflight-check.ps1
#>

$domain   = "cigaraficionado-china.com"
$apiUrl   = "https://api.$domain"
$testUser = "preflight_tester_$(Get-Random -Maximum 9999)"
$results  = @()

function Test-Step {
  param([string]$Name, [scriptblock]$Block)
  Write-Host -NoNewline "▸ $Name ... "
  try {
    $result = & $Block
    if ($result -eq $true) {
      Write-Host "✅ PASS" -ForegroundColor Green
      return "PASS"
    } else {
      Write-Host "❌ FAIL ($result)" -ForegroundColor Red
      return "FAIL"
    }
  } catch {
    Write-Host "❌ FAIL ($($_.Exception.Message))" -ForegroundColor Red
    return "FAIL"
  }
}

Write-Host "`n════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  雪茄客 · 上线前预检" -ForegroundColor Yellow
Write-Host "  域名: $domain" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════`n" -ForegroundColor Cyan

# ─── 1. 网络与 HTTPS ───
Write-Host "━━━ [1/4] 网络层 ━━━" -ForegroundColor Magenta
$results += Test-Step "域名解析" {
  $ip = (Resolve-DnsName -Name $domain -Type A -ErrorAction Stop).IPAddress
  return if ($ip) { $true } else { "无解析记录" }
}
$results += Test-Step "HTTPS 可达" {
  $r = Invoke-WebRequest -Uri "https://$domain" -TimeoutSec 10 -UseBasicParsing
  return if ($r.StatusCode -eq 200) { $true } else { "状态码: $($r.StatusCode)" }
}
$results += Test-Step "HTTP→HTTPS 重定向" {
  try {
    $r = Invoke-WebRequest -Uri "http://$domain" -TimeoutSec 10 -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
    return "未重定向"
  } catch {
    return if ($_.Exception.Response.StatusCode -eq 301) { $true } else { "状态码: $($_.Exception.Response.StatusCode)" }
  }
}
$results += Test-Step "HSTS 头是否存在" {
  $r = Invoke-WebRequest -Uri "https://$domain" -TimeoutSec 10 -UseBasicParsing
  $hsts = $r.Headers["Strict-Transport-Security"]
  return if ($hsts) { $true } else { "缺少 HSTS 头" }
}

# ─── 2. Age Gate ───
Write-Host "`n━━━ [2/4] Age Gate 检测 ━━━" -ForegroundColor Magenta
$results += Test-Step "弹窗 HTML 存在" {
  $html = Invoke-WebRequest -Uri "https://$domain" -TimeoutSec 10 -UseBasicParsing
  return if ($html.Content -match 'ageGateOverlay|age-gate|age_verification') { $true } else { "未检测到 Age Gate 容器" }
}
$results += Test-Step "爬虫不触发弹窗" {
  $html = Invoke-WebRequest -Uri "https://$domain" -TimeoutSec 10 -UseBasicParsing -UserAgent "Googlebot/2.1 (+http://www.google.com/bot.html)"
  return if ($html.Content -notmatch 'ageGateOverlay') { $true } else { "爬虫仍触发了 Age Gate" }
}

# ─── 3. API 可用性 ───
Write-Host "`n━━━ [3/4] API 层 ━━━" -ForegroundColor Magenta
$results += Test-Step "API 根可达" {
  $r = Invoke-WebRequest -Uri "$apiUrl/api/health" -TimeoutSec 10 -UseBasicParsing
  return if ($r.StatusCode -eq 200) { $true } else { "状态码: $($r.StatusCode)" }
}
$results += Test-Step "搜索接口返回正常" {
  $r = Invoke-WebRequest -Uri "$apiUrl/api/cigars?search=robusto&limit=1" -TimeoutSec 10 -UseBasicParsing
  return if ($r.StatusCode -eq 200) { $true } else { "状态码: $($r.StatusCode)" }
}

# ─── 4. 数据库备份 ───
Write-Host "`n━━━ [4/4] 备份验证 ━━━" -ForegroundColor Magenta
$backupDir = "D:\backups\cigar_community"
$results += Test-Step "备份目录存在" {
  return if (Test-Path -LiteralPath $backupDir) { $true } else { "目录 $backupDir 不存在" }
}
$results += Test-Step "最近 24h 内有备份" {
  $latest = Get-ChildItem -LiteralPath $backupDir -Filter "*.sql.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { return "无备份文件" }
  $age = (Get-Date) - $latest.LastWriteTime
  return if ($age.TotalHours -le 24) { $true } else { "最新备份在 $([math]::Round($age.TotalHours,1)) 小时前，超过 24h" }
}
$results += Test-Step "备份文件 > 50MB" {
  $latest = Get-ChildItem -LiteralPath $backupDir -Filter "*.sql.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  return if ($latest.Length -gt 50MB) { $true } else { "备份文件仅 $([math]::Round($latest.Length/1MB,1)) MB，疑似异常" }
}

# ─── 汇总 ───
$pass = ($results | Where-Object { $_ -eq "PASS" }).Count
$fail = ($results | Where-Object { $_ -eq "FAIL" }).Count
Write-Host "`n════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "结果: $pass PASS / $fail FAIL" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "════════════════════════════════════════`n" -ForegroundColor Cyan

if ($fail -gt 0) {
  exit 1
}
