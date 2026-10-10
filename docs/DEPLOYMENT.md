# 部署与运维

> 当前实现是**单进程 Node + SQLite 文件库**，目标是单机部署。多实例与高并发见文末。

---

## 一、首次部署（单机，推荐）

```bash
# 1. 取代码
git clone <repo-url> cigar-community
cd cigar-community

# 2. 装依赖（后端零依赖，只装前端）
npm install

# 3. 配置（关键一步，别跳过）
cp .env.example .env
```

`.env` 至少改这两项：

```bash
# 生成密钥
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

```dotenv
CC_SECRET=<粘贴上面生成的 64 位十六进制串>
CC_ADMIN_PASSWORD=<一个强口令，别用 admin12345>
CC_ENV=production
CC_HOST=127.0.0.1        # 由 Nginx 反代时保持 127.0.0.1
```

```bash
chmod 600 .env            # 收紧权限

# 4. 建库 + 导入数据
npm run seed

# 5. 构建前端
npm run build

# 6. 启动
npm start
```

> **生产护栏**：`CC_ENV=production` 时，如果 `CC_SECRET` 仍是模板默认值、
> 或 `CC_ADMIN_PASSWORD` 仍是 `admin12345`，服务会**拒绝启动**并打印原因。
> 这是刻意设计 —— 默认密钥上线等于没有会话安全，启动失败比日志里一条被忽略的警告有效。

验证：

```bash
npm run preflight                    # 本地只读体检
npm run preflight -- https://你的域名  # 线上体检
```

## 二、常驻运行

### macOS（launchd）

```xml
<!-- ~/Library/LaunchAgents/com.example.cigar-community.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.cigar-community</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/绝对路径/cigar-community/server/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/绝对路径/cigar-community</string>
  <key>EnvironmentVariables</key>
  <dict><key>CC_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/>
  <!-- 重要：崩溃自动重启 -->
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/绝对路径/cigar-community/logs/server.log</string>
  <key>StandardErrorPath</key><string>/绝对路径/cigar-community/logs/server.err.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.example.cigar-community.plist
launchctl print gui/$(id -u)/com.example.cigar-community   # 查状态
```

> **两个必踩的坑（本工作区已有前车之鉴）**：
> 1. **必须写 `KeepAlive`**。只写 `RunAtLoad` 的话，进程干净退出一次后 launchd 永不拉起，
>    而且磁盘上不留任何痕迹 —— 服务安静地不干活。
> 2. **必须重定向日志**。没有 `StandardOutPath`/`StandardErrorPath` 时，崩溃原因无处可查。
>
> 排查原则：凡是「已加载但 `state=not running` 且最后一次 exit code=0」的作业都要警惕。

### Linux（systemd）

```ini
# /etc/systemd/system/cigar-community.service
[Unit]
Description=Cigar Community
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/cigar-community
Environment=CC_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
User=cigar
StandardOutput=append:/opt/cigar-community/logs/server.log
StandardError=append:/opt/cigar-community/logs/server.err.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now cigar-community
journalctl -u cigar-community -f
```

### pm2（最省事）

```bash
npm i -g pm2
pm2 start server/index.js --name cigar-community --time
pm2 save && pm2 startup
```

## 三、Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name cigar.example.com;

    ssl_certificate     /etc/letsencrypt/live/cigar.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cigar.example.com/privkey.pem;

    # 安全响应头（代码里也内置了一份，此处为边缘层加固）
    include /path/to/config/nginx-security-headers.conf;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # 反向代理层数，供服务端取真实 IP（限流依赖它）
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name cigar.example.com;
    return 301 https://$host$request_uri;
}
```

> 服务端已默认读取一层 `X-Forwarded-For`（`CC_TRUST_PROXY=1`）。
> 若前面还有 Cloudflare 等一层，改成 `CC_TRUST_PROXY=2`，否则限流会按 CDN 节点 IP 计数，
> 等于把所有人当成同一个人。

## 四、备份

```bash
npm run backup                                  # 备份到 backups/
CC_BACKUP_DIR=/Volumes/backup/cc npm run backup # 备份到外置盘
CC_BACKUP_KEEP=14 npm run backup                # 只保留 14 份
```

脚本用 SQLite 的 `VACUUM INTO` 做**一致性快照**，并执行 `PRAGMA integrity_check`，
然后重新打开副本读一次表来验证 —— 只校验文件大小是不够的。

> **不要用 `cp` 备份**。数据库开着 WAL 模式，`cp` 可能拿到「主库已更新但 WAL 未合并」的半截状态。

定时任务：

```cron
0 3 * * * cd /opt/cigar-community && bash scripts/backup-db.sh >> logs/backup.log 2>&1
```

恢复：

```bash
# 1. 停服务
systemctl stop cigar-community
# 2. 替换数据库（连同 WAL/SHM 一起清掉，否则会读到旧数据）
rm -f database/cigar.db database/cigar.db-wal database/cigar.db-shm
cp backups/cigar_20261010_030000.db database/cigar.db
# 3. 起服务并验证
systemctl start cigar-community
curl -s localhost:8787/api/health | jq
```

## 五、日常检查

```bash
# 服务与数据健康
curl -s localhost:8787/api/health | jq

# 完整只读体检
npm run preflight

# 待审核内容（管理后台未做前只能查库，见 ROADMAP P0）
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('database/cigar.db', { readOnly: true })
console.log('待审核笔记:', db.prepare('SELECT COUNT(*) n FROM reviews WHERE status = -1').get().n)
console.log('待审核投稿:', db.prepare(\"SELECT COUNT(*) n FROM submissions WHERE status='pending'\").get().n)
console.log('近 7 天拦截:', db.prepare(\"SELECT COUNT(*) n FROM audit_log WHERE action='blocked' AND created_at > datetime('now','-7 days')\").get().n)
db.close()
"

# 数据库体积与日志
du -sh database/cigar.db backups/ logs/ 2>/dev/null
tail -50 logs/server.log
```

## 六、故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| 启动即退出，日志说「配置错误」 | `CC_ENV=production` 但密钥/口令仍是默认值 | 按提示改 `.env` |
| `Cannot find module 'node:sqlite'` | Node 版本 < 22.5 | 升级 Node 到 22.13+ |
| 启动即提示「需要 Node 22.13 或更高版本」 | Node 22.5–22.12（缺少 `--experimental-sqlite` 的替代） | 升级 Node；这是本项目主动给的可读报错，不是崩溃 |
| 首页 404 或空白 | 前端未构建 | `npm run build` |
| 首页正常但接口全 404 | 请求打到了 Vite 开发服务器（5173）而非后端 | 生产访问 8787 或反代地址 |
| 登录后立刻掉线 | 生产环境用了 `Secure` Cookie 但走 HTTP | 上 HTTPS，或临时 `CC_ENV=development` |
| 大量 429 | 限流命中，或反代层数配置错误导致 IP 判定失败 | 调 `CC_TRUST_PROXY`；压测时用 `CC_RATE_LIMIT_DISABLED=1` |
| 数据库 locked | 多进程同时写 SQLite | 只跑一个实例；或迁 MySQL |
| 用户说「发帖成功了但看不到」 | 命中审核词，内容 `status=-1` 在队列里 | 查 `audit_log`；**这就是需要管理后台的原因** |
| 年龄门对搜索引擎也弹 | UA 识别未命中 | 检查 `server/middleware/auth.js` 的 `BOT_UA` |

## 七、扩容路径

当前架构的边界与对应动作：

| 瓶颈 | 触发信号 | 动作 |
|---|---|---|
| SQLite 单写入者 | 写 QPS > 50，或频繁 `database is locked` | 迁 MySQL（[ARCHITECTURE §七](ARCHITECTURE.md)） |
| 单进程 CPU | 单核打满 | 先上多进程 + SQLite 转 WAL 只读副本；写仍单点 |
| 内存限流失效 | 部署多实例后限流形同虚设 | 限流换 Redis |
| 搜索变慢 | 雪茄 > 5000 条或 P95 > 300ms | 中文分词或外部搜索引擎 |
| 图片带宽 | 接入上传后 | 对象存储 + CDN |

多实例前必须解决的两件事：**限流共享** 与 **数据库写入单点**。
只做前者会出现「同一账号在多实例上各自计数」的漏洞。

---

## 八、Docker 部署

镜像已就绪：多阶段构建、**非 root 运行**、零生产依赖（后端只用 `node:` 内置模块，
runtime 阶段没有 `node_modules`）、内置健康检查。

```bash
cp .env.example .env
# 必改两项，否则容器会拒绝启动（生产护栏）
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"   # → CC_SECRET
# CC_ADMIN_PASSWORD 设一个强口令

docker compose up -d
docker compose logs -f
```

**数据持久化是这里唯一的硬要求**：SQLite 库与上传图片都在 `/data`（`cigar-data` 卷）。
不挂卷的话，容器一重建就丢库丢图 —— 在无状态平台上这是最常见的翻车点。

```bash
docker compose exec app sh          # 进容器
docker compose down                 # 停止，卷保留
docker compose down -v              # ⚠️ 连数据卷一起删
```

首次启动会自动建库并导入种子（42 行 → 40 款去重后的雪茄）。想手动重建：

```bash
docker compose exec app node scripts/seed.mjs --reset
```

镜像内置健康检查，编排系统可直接依赖：

```bash
docker inspect --format='{{.State.Health.Status}}' cigar-community
```

## 九、云平台注意事项（选型时先读这段）

这个项目的运行期依赖是 **SQLite 文件 + 本地文件系统（上传图片）**。
这直接决定了哪些平台能直接用、哪些需要改造：

| 平台 | 能否直接跑 | 说明 |
|---|---|---|
| **Fly.io** | ✅ 可以 | 支持挂持久卷（`fly volumes create`），把卷挂到 `/data` 即可。**推荐** |
| **Railway** | ⚠️ 需挂卷 | 支持 Volume，挂到 `/data`。不挂卷则每次部署丢数据 |
| **Render** | ⚠️ 需付费盘 | 免费实例无持久盘，重启即丢 SQLite |
| **VPS / 自己的 Mac mini** | ✅ 最省事 | 见 §一、§二，无需容器 |
| **Cloudflare Workers** | ❌ 不能直接用 | Workers 没有文件系统，`node:sqlite` 与 `/data` 都不存在。要上 Cloudflare 得换 D1 + R2 并重写 `server/db/index.js` 与 `server/lib/storage.js` |
| **Vercel / Netlify** | ❌ 不适合 | 面向无状态函数，不适合常驻写 SQLite 的服务 |

**判断口径**：只要平台能给「一个常驻进程 + 一个可挂载的持久卷」，就能直接跑。
缺任一项，就要改造成托管数据库 + 对象存储。

### Fly.io 最小步骤

```bash
fly launch --no-deploy          # 生成 fly.toml
fly volumes create cigar_data --size 1   # 1GB 足够起步
```

`fly.toml` 关键片段：

```toml
[env]
  CC_ENV = "production"
  CC_DB_PATH = "/data/cigar.db"
  CC_UPLOAD_DIR = "/data/uploads"
  CC_TRUST_PROXY = "1"          # Fly 前面有代理层

[[mounts]]
  source = "cigar_data"
  destination = "/data"

[http_service]
  internal_port = 8787
  force_https = true
  # 单实例：SQLite 写入是单点，多实例会互相锁
  min_machines_running = 1
```

```bash
fly secrets set CC_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
fly secrets set CC_ADMIN_PASSWORD='你的强口令'
fly deploy
```

> **不要给这个服务配多个实例**。SQLite 是单写入者，多实例同时写会互相锁；
> 真要横向扩容，先按 [ARCHITECTURE §七](ARCHITECTURE.md) 迁到 MySQL。

### 关于对象存储

图片当前存在本地卷（`CC_UPLOAD_DIR`）。若要迁到 S3/R2，
只需替换 `server/lib/storage.js` 的 `saveImage` / `readImage` 两个函数 ——
调用方（`server/api/misc.js`、`server/api/reviews.js`）无需改动。
这是当初把存储单独成模块的原因。

## 十、CI

`.github/workflows/ci.yml` 在两个层面把关：

1. **测试任务**：`npm ci` → 构建 → 建库 → 单元测试 + 206 项契约断言 →
   启动服务 → 前端 DOM 断言（51 项）→ 管理后台断言（27 项）→ 上线预检
2. **镜像任务**：`docker build` → 起容器 → **等健康检查变 healthy** →
   验证接口与前端都可用 → 清理

镜像任务里特意「等健康检查」而不是「等端口」：端口开了不代表能服务，
健康检查走的是应用自己的 `/api/health`（会真的查一次数据库）。
