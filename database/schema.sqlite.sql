-- ============================================================================
-- 雪茄客社区 · SQLite 运行库结构
-- ============================================================================
-- 与 database/schema.sql（MySQL 设计稿）字段一一对应，差异如下：
--   1. ENUM  → TEXT + CHECK 约束
--   2. TINYINT(1) → INTEGER（0/1）
--   3. DATETIME  → TEXT（ISO8601，UTC）
--   4. FULLTEXT  → FTS5 虚拟表 + 触发器同步（MySQL 版用 FULLTEXT KEY）
--   5. AUTO_INCREMENT → INTEGER PRIMARY KEY AUTOINCREMENT
--   6. ON UPDATE CURRENT_TIMESTAMP → 由应用层显式写入
--
-- 额外扩展字段（MySQL 设计稿没有、但前端已经依赖的展示字段）：
--   cigars.price_cny / rating / base_rating / review_count / seed_review_count / vitola_family
--   来源：cigar-filter/src/composables/useCigarFilter.js 的 MOCK_CIGARS
--   这些是「演示必需字段」，在迁移到 MySQL 时需同步补进 schema.sql
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- 产地字典
CREATE TABLE IF NOT EXISTS countries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  name_cn     TEXT,
  code        TEXT    NOT NULL UNIQUE,
  is_cuban    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------- 品牌
CREATE TABLE IF NOT EXISTS brands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  -- 归一化名（NFKC + 去变音符号 + 小写）。Padron 与 Padrón 必须视为同一品牌，
  -- 否则会被拆成两条，同一支雪茄出现两次（实测：实际 41 款却报 42，品牌数 22 应为 21）
  name_norm   TEXT,
  name_cn     TEXT,
  description TEXT,
  country_id  INTEGER REFERENCES countries(id) ON DELETE SET NULL,
  logo_url    TEXT,
  status      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
-- 归一化名（NFKC + 去变音符号 + 小写）：用于合并 Padron / Padrón 这类同一品牌的写法差异

CREATE INDEX IF NOT EXISTS idx_brand_country ON brands(country_id);
CREATE INDEX IF NOT EXISTS idx_brand_status  ON brands(status);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brand_name ON brands(name);

-- ---------------------------------------------------------------- 风味字典
CREATE TABLE IF NOT EXISTS flavors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  name_cn     TEXT,
  category    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_flavor_category ON flavors(category);

-- ---------------------------------------------------------------- 雪茄主表
CREATE TABLE IF NOT EXISTS cigars (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id      INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  series        TEXT,
  vitola        TEXT    NOT NULL,
  vitola_family TEXT,
  length_inch   REAL,
  length_mm     INTEGER,
  ring_gauge    INTEGER,

  origin_type   TEXT    NOT NULL CHECK (origin_type IN ('cuban','non-cuban')),
  country_id    INTEGER NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,

  wrapper_origin  TEXT,
  wrapper_variety TEXT,
  binder_variety  TEXT,
  filler_variety  TEXT,

  strength        INTEGER CHECK (strength IS NULL OR strength BETWEEN 1 AND 5),
  wrapper_color   TEXT,

  recommended_humidity    REAL DEFAULT 70.0,
  recommended_temperature REAL DEFAULT 18.0,

  description   TEXT,
  image_url     TEXT,

  -- 展示扩展字段（见文件头说明）
  price_cny     REAL,
  rating        REAL,
  review_count  INTEGER NOT NULL DEFAULT 0,
  -- 种子自带的「参考笔记数」（原型演示数据，并非真实用户产出）。
  -- 真实用户笔记数单独存在 reviews 表；二者分开是为了：
  --   · 让页面能诚实标注哪些数字来自种子数据
  --   · 避免重跑 seed 把真实 notes 数覆盖成种子数字
  seed_review_count INTEGER NOT NULL DEFAULT 0,
  -- 种子/官方基准评分（1-5 星）。与用户评分分开存放：
  -- 用户笔记打的是 1-10 分，两种量纲不能直接互相覆盖。
  -- （踩过的坑：曾把 8 分的笔记均分直接写进 1-5 星的 rating，导致出现 8.0 星）
  base_rating   REAL,

  -- 数据来源：'seed-csv' 官方品鉴库 / 'mock' 原型演示数据 / 'user' 用户投稿
  data_source   TEXT NOT NULL DEFAULT 'manual',
  status        INTEGER NOT NULL DEFAULT 1,

  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cigar_brand       ON cigars(brand_id);
CREATE INDEX IF NOT EXISTS idx_cigar_origin      ON cigars(origin_type);
CREATE INDEX IF NOT EXISTS idx_cigar_country     ON cigars(country_id);
CREATE INDEX IF NOT EXISTS idx_cigar_strength    ON cigars(strength);
CREATE INDEX IF NOT EXISTS idx_cigar_status      ON cigars(status);
CREATE INDEX IF NOT EXISTS idx_cigar_rating      ON cigars(rating DESC);
CREATE INDEX IF NOT EXISTS idx_cigar_family      ON cigars(vitola_family);
CREATE INDEX IF NOT EXISTS idx_cigar_brand_origin ON cigars(brand_id, origin_type);
-- 幂等键必须带 series：同一品牌下同一 vitola 可能是不同系列的不同雪茄
-- （实例：Arturo Fuente 既有 Don Carlos Robusto 也有 Opus X Robusto）
CREATE UNIQUE INDEX IF NOT EXISTS uk_cigar_identity ON cigars(brand_id, COALESCE(series,''), vitola);

-- ---------------------------------------------------------------- 雪茄×风味
CREATE TABLE IF NOT EXISTS cigar_flavors (
  cigar_id    INTEGER NOT NULL REFERENCES cigars(id)  ON DELETE CASCADE,
  flavor_id   INTEGER NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
  is_official INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (cigar_id, flavor_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_flavor ON cigar_flavors(flavor_id);

-- ---------------------------------------------------------------- 用户
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  email         TEXT    UNIQUE,
  password_hash TEXT    NOT NULL,
  avatar_url    TEXT,
  bio           TEXT,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin','editor','user')),
  status        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_user_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_status ON users(status);

-- ---------------------------------------------------------------- 会话
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,          -- token 的 sha256，明文不落库
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent   TEXT,
  ip           TEXT,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_session_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires ON sessions(expires_at);

-- ---------------------------------------------------------------- 品吸笔记
CREATE TABLE IF NOT EXISTS reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  cigar_id       INTEGER NOT NULL REFERENCES cigars(id) ON DELETE CASCADE,

  pre_score      INTEGER CHECK (pre_score  IS NULL OR pre_score  BETWEEN 1 AND 10),
  mid_score      INTEGER CHECK (mid_score  IS NULL OR mid_score  BETWEEN 1 AND 10),
  post_score     INTEGER CHECK (post_score IS NULL OR post_score BETWEEN 1 AND 10),
  burn_evenness  INTEGER CHECK (burn_evenness   IS NULL OR burn_evenness   BETWEEN 1 AND 10),
  draw_resistance INTEGER CHECK (draw_resistance IS NULL OR draw_resistance BETWEEN 1 AND 10),
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 10),

  title          TEXT,
  content        TEXT,
  smoking_time   INTEGER,
  pairing        TEXT,
  humidity_at_smoke REAL,
  rest_time_days    INTEGER,

  status         INTEGER NOT NULL DEFAULT 1,   -- 1=已发布 0=草稿 -1=审核队列
  helpful_count  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_review_user    ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_review_cigar   ON reviews(cigar_id);
CREATE INDEX IF NOT EXISTS idx_review_rating  ON reviews(overall_rating);
CREATE INDEX IF NOT EXISTS idx_review_status  ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_review_created ON reviews(created_at);

-- ---------------------------------------------------------------- 笔记配图
CREATE TABLE IF NOT EXISTS review_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id   INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  image_url   TEXT    NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ri_review ON review_images(review_id);

-- ---------------------------------------------------------------- 有用投票
CREATE TABLE IF NOT EXISTS review_votes (
  review_id  INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (review_id, user_id)
);

-- ---------------------------------------------------------------- 用户投稿
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payload       TEXT    NOT NULL,            -- 原始投稿 JSON
  reject_reason TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_submission_status ON submissions(status);

-- ---------------------------------------------------------------- 内容审核队列
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,     -- 'review' | 'submission'
  ref_id      INTEGER,
  action      TEXT NOT NULL,     -- 'blocked' | 'queued' | 'warned' | 'clean'
  matched     TEXT,              -- 命中的敏感词（JSON 数组）
  excerpt     TEXT,              -- 内容摘要（截断，避免二次存储违规原文）
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ---------------------------------------------------------------- 工具结果埋点
CREATE TABLE IF NOT EXISTS tool_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tool       TEXT NOT NULL,      -- diagnostic | flavor-test | aging-calc
  result_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_events ON tool_events(tool, created_at);

-- ---------------------------------------------------------------- 键值元数据
CREATE TABLE IF NOT EXISTS app_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------- 全文检索
-- 采用 FTS5「外部内容表」模式：索引不重复存储正文，只引用 cigars 表。
-- 注意（踩过的坑）：
--   · 不能用 content=''（contentless）—— 那种表连 DELETE 都不允许，触发器会直接报错
--   · 外部内容表的删除必须走特殊命令 INSERT INTO fts(fts, rowid, ...) VALUES('delete', ...)
--   · CJK 分词：unicode61 不切中文词，中文检索由 routes 里的 LIKE 兜底
CREATE VIRTUAL TABLE IF NOT EXISTS cigars_fts USING fts5(
  vitola, series, description, brand_name, extra,
  content='cigars', content_rowid='id', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_cigars_ai AFTER INSERT ON cigars BEGIN
  INSERT INTO cigars_fts(rowid, vitola, series, description, brand_name, extra)
  VALUES (new.id, new.vitola, COALESCE(new.series,''), COALESCE(new.description,''),
          COALESCE((SELECT name FROM brands WHERE id = new.brand_id), ''), '');
END;

CREATE TRIGGER IF NOT EXISTS trg_cigars_ad AFTER DELETE ON cigars BEGIN
  INSERT INTO cigars_fts(cigars_fts, rowid, vitola, series, description, brand_name, extra)
  VALUES ('delete', old.id, old.vitola, COALESCE(old.series,''), COALESCE(old.description,''),
          COALESCE((SELECT name FROM brands WHERE id = old.brand_id), ''), '');
END;

CREATE TRIGGER IF NOT EXISTS trg_cigars_au AFTER UPDATE ON cigars BEGIN
  INSERT INTO cigars_fts(cigars_fts, rowid, vitola, series, description, brand_name, extra)
  VALUES ('delete', old.id, old.vitola, COALESCE(old.series,''), COALESCE(old.description,''),
          COALESCE((SELECT name FROM brands WHERE id = old.brand_id), ''), '');
  INSERT INTO cigars_fts(rowid, vitola, series, description, brand_name, extra)
  VALUES (new.id, new.vitola, COALESCE(new.series,''), COALESCE(new.description,''),
          COALESCE((SELECT name FROM brands WHERE id = new.brand_id), ''), '');
END;
