<#
.SYNOPSIS
  雪茄社区数据库自动备份脚本
.DESCRIPTION
  备份 MySQL 数据库到本地目录，并上传至云端存储。
  适合 Windows 服务器 + 定时任务（Task Scheduler）调用。
.NOTES
  版本: 1.0
  作者: 雪茄客运维团队
  频率: 建议每日凌晨 3:00 执行
#>

param(
  [string]$DbHost     = "localhost",
  [int]$DbPort        = 3306,
  [string]$DbUser     = "cigar_admin",
  [string]$DbPassword = "",  # 通过环境变量 MYSQL_PWD 传入，勿硬编码
  [string]$DbName     = "cigar_community",
  [string]$BackupDir  = "D:\backups\cigar_community",
  [int]$RetentionDays = 30
)

# ---------- 初始化 ----------
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path -Path $BackupDir -ChildPath "${DbName}_${timestamp}.sql.gz"
$logFile    = Join-Path -Path $BackupDir -ChildPath "backup.log"

# 确保备份目录存在
if (-not (Test-Path -LiteralPath $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

Write-Log "=== 备份开始 ==="
Write-Log "目标数据库: ${DbHost}:${DbPort}/${DbName}"
Write-Log "备份路径: $backupFile"

# ---------- 执行 mysqldump ----------
$dumpArgs = @(
  "--host=$DbHost",
  "--port=$DbPort",
  "--user=$DbUser",
  "--databases", $DbName,
  "--single-transaction",
  "--routines",
  "--triggers",
  "--events",
  "--add-drop-table",
  "--complete-insert",
  "--set-charset",
  "--default-character-set=utf8mb4"
)

try {
  $process = Start-Process -FilePath "mysqldump" -ArgumentList $dumpArgs -NoNewWindow -RedirectStandardOutput "temp_${timestamp}.sql" -Wait -PassThru

  if ($process.ExitCode -ne 0) {
    throw "mysqldump 失败，退出码: $($process.ExitCode)"
  }

  # 压缩
  & gzip -f "temp_${timestamp}.sql"
  Move-Item -LiteralPath "temp_${timestamp}.sql.gz" -Destination $backupFile -Force

  # 验证
  $fileInfo = Get-Item -LiteralPath $backupFile
  if ($fileInfo.Length -eq 0) {
    throw "备份文件大小为 0"
  }

  Write-Log "备份成功！文件大小: $([math]::Round($fileInfo.Length / 1MB, 2)) MB"
}
catch {
  Write-Log "备份失败: $_"
  exit 1
}
finally {
  # 清理临时文件
  if (Test-Path -LiteralPath "temp_${timestamp}.sql") {
    Remove-Item -LiteralPath "temp_${timestamp}.sql" -Force
  }
  if (Test-Path -LiteralPath "temp_${timestamp}.sql.gz") {
    Remove-Item -LiteralPath "temp_${timestamp}.sql.gz" -Force
  }
}

# ---------- 清理过期备份 ----------
Write-Log "清理 ${RetentionDays} 天前的备份..."
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$deleted = 0

Get-ChildItem -LiteralPath $BackupDir -Filter "${DbName}_*.sql.gz" | ForEach-Object {
  if ($_.CreationTime -lt $cutoff) {
    Remove-Item -LiteralPath $_.FullName -Force
    $deleted++
    Write-Log "删除过期备份: $($_.Name)"
  }
}

Write-Log "已删除 $deleted 个过期备份"
Write-Log "=== 备份完成 ==="

# ---------- （可选）同步到云端 ----------
# 取消注释以下代码块以启用 S3/OSS 同步
<#
$ossBucket = "cigar-backup"
$ossPath   = "database/"

# 使用 AWS CLI / rclone / aliyun ossutil
& rclone copy $backupFile "s3://${ossBucket}/${ossPath}" --progress
Write-Log "已同步到云端 S3: ${ossBucket}/${ossPath}$(Split-Path -Leaf $backupFile)"
#>
