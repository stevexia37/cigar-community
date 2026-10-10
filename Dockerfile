# ============================================================================
# 雪茄客 · 生产镜像
#
# 设计要点：
#   · **多阶段构建**：前端在 builder 里构建，最终镜像只带运行时需要的东西
#   · **不装生产依赖**：后端零依赖（只用 node: 内置模块），所以 runtime 阶段
#     根本不需要 npm install —— 镜像里没有 node_modules，攻击面与体积都更小
#   · **非 root 运行**：容器内用 node 用户
#   · **数据落在卷上**：SQLite 库与上传图片都在 /data，必须挂持久卷，
#     否则容器重建即丢库丢图（无状态平台上这一点是踩坑重灾区）
#   · 由 Node 直接托管前端静态文件，单进程即可对外服务，不需要额外 Nginx
# ============================================================================

# ---------------------------------------------------------------- 构建前端
# ⚠️ 必须 >= 22.13.0：node:sqlite 自 v22.5.0 引入，但到 v22.13.0 才去掉
#    --experimental-sqlite 标志。node:22-alpine 会自动取 22 的最新补丁版，满足要求。
FROM node:22-alpine AS builder

WORKDIR /build

# 先只复制依赖清单，利用 Docker 层缓存：依赖没变就不会重装
COPY package.json package-lock.json ./
COPY web/package.json ./web/

# workspaces 会把前端依赖提升到根 node_modules，npm --prefix web run build 可直接用
RUN npm ci --no-audit --no-fund

COPY web/ ./web/
RUN npm --prefix web run build

# ---------------------------------------------------------------- 运行时
FROM node:22-alpine AS runtime

# tini 负责回收僵尸进程并正确转发 SIGTERM，让优雅关闭真正生效
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    CC_ENV=production \
    CC_HOST=0.0.0.0 \
    CC_PORT=8787 \
    CC_DB_PATH=/data/cigar.db \
    CC_UPLOAD_DIR=/data/uploads

WORKDIR /app

# 后端源码 + 数据与配置（零依赖，无需 node_modules）
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY database/ ./database/
COPY config/ ./config/
COPY content/ ./content/
COPY package.json ./

# 前端构建产物
COPY --from=builder /build/web/dist ./web/dist

# 数据目录：SQLite 库与上传图片。挂载卷时以卷为准
RUN mkdir -p /data/uploads /app/logs \
 && chown -R node:node /data /app

USER node

EXPOSE 8787

# 健康检查用应用自己的接口，而不是只看端口是否监听
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CC_PORT||8787)+'/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
