-- ============================================================
-- 雪茄知识交流网站 · 数据库结构设计
-- 引擎：InnoDB  |  字符集：utf8mb4  |  排序：utf8mb4_unicode_ci
-- 适用：Strapi / WordPress 风格开源 CMS
-- ============================================================

-- -----------------------------------------------------------
-- 0. 创建数据库
-- -----------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `cigar_community`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `cigar_community`;

-- -----------------------------------------------------------
-- 1. 国家 / 产地字典表
-- -----------------------------------------------------------
CREATE TABLE `cigar_countries` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100)    NOT NULL COMMENT '国家名称，如古巴、多米尼加、尼加拉瓜',
  `code`       CHAR(2)         NOT NULL COMMENT 'ISO 3166-1 二位字母代码，如 CU、DO、NI',
  `is_cuban`   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否古巴产区，1=是 0=否',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_country_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='国家/产地字典表';

-- -----------------------------------------------------------
-- 2. 品牌表
-- -----------------------------------------------------------
CREATE TABLE `cigar_brands` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(200)    NOT NULL COMMENT '品牌名称，如 Cohiba、Montecristo',
  `name_cn`     VARCHAR(200)    DEFAULT NULL COMMENT '中文译名',
  `description` TEXT            COMMENT '品牌简介',
  `country_id`  INT UNSIGNED    DEFAULT NULL COMMENT '所属国家',
  `logo_url`    VARCHAR(500)    DEFAULT NULL COMMENT '品牌 Logo URL',
  `status`      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：1=启用 0=停用',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_brand_country` (`country_id`),
  KEY `idx_brand_status` (`status`),
  CONSTRAINT `fk_brand_country` FOREIGN KEY (`country_id`) REFERENCES `cigar_countries`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='雪茄品牌表';

-- -----------------------------------------------------------
-- 3. 风味标签字典表
-- -----------------------------------------------------------
CREATE TABLE `cigar_flavors` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100)    NOT NULL COMMENT '风味名称，如雪松木、可可、胡椒、咖啡、皮革',
  `name_cn`    VARCHAR(100)    DEFAULT NULL COMMENT '中文名称',
  `category`   VARCHAR(50)     DEFAULT NULL COMMENT '风味大类：木香、辛香、甜香、土香等',
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序权重',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_flavor_name` (`name`),
  KEY `idx_flavor_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='风味标签字典表';

-- -----------------------------------------------------------
-- 4. 雪茄产品主表（cigar_products）
-- -----------------------------------------------------------
CREATE TABLE `cigar_products` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,

  -- ========== 基本信息 ==========
  `brand_id`     INT UNSIGNED    NOT NULL           COMMENT '所属品牌 ID',
  `series`       VARCHAR(200)    DEFAULT NULL       COMMENT '系列，如 Línea Clásica、Línea 1492',
  `vitola`       VARCHAR(200)    NOT NULL           COMMENT '商业型号 / Vitola，如 Robusto、Corona、Double Corona',
  `length_inch`  DECIMAL(5,2)    DEFAULT NULL       COMMENT '长度（英寸），如 6.12',
  `length_mm`    SMALLINT UNSIGNED DEFAULT NULL     COMMENT '长度（毫米），如 156',
  `ring_gauge`   TINYINT UNSIGNED DEFAULT NULL      COMMENT '环径（64 分之 1 英寸），如 52',

  -- ========== 产地 ==========
  `origin_type`  ENUM('cuban','non-cuban') NOT NULL COMMENT '产地大类：古巴 / 非古',
  `country_id`   INT UNSIGNED    NOT NULL           COMMENT '具体生产国家',

  -- ========== 烟叶配方 ==========
  -- 茄衣
  `wrapper_origin`   INT UNSIGNED DEFAULT NULL     COMMENT '茄衣产地（cigar_countries.id）',
  `wrapper_variety`  VARCHAR(100) DEFAULT NULL     COMMENT '茄衣烟叶品种，如 Connecticut Shade、Habano、Corojo',

  -- 茄套
  `binder_origin`    INT UNSIGNED DEFAULT NULL     COMMENT '茄套产地（cigar_countries.id）',
  `binder_variety`   VARCHAR(100) DEFAULT NULL     COMMENT '茄套烟叶品种',

  -- 茄芯
  `filler_origin`    INT UNSIGNED DEFAULT NULL     COMMENT '茄芯产地（cigar_countries.id）',
  `filler_variety`   VARCHAR(200) DEFAULT NULL     COMMENT '茄芯烟叶品种（允许多品种混合描述）',

  -- ========== 量化与品鉴 ==========
  `strength`         TINYINT UNSIGNED DEFAULT NULL COMMENT '浓郁度，1-5 星（1=清淡 5=极浓郁）',
  `wrapper_color`    VARCHAR(50)  DEFAULT NULL     COMMENT '茄衣颜色分类，如 Claro、Colorado、Maduro、Oscuro',

  -- ========== 养护建议 ==========
  `recommended_humidity`   DECIMAL(4,1) DEFAULT 70.0 COMMENT '建议养护湿度（%），推荐 65-72%',
  `recommended_temperature` DECIMAL(3,1) DEFAULT 18.0 COMMENT '建议养护温度（℃），推荐 16-20℃',

  -- ========== 元信息 ==========
  `description`      TEXT                           COMMENT '雪茄简介 / 品鉴描述',
  `image_url`        VARCHAR(500) DEFAULT NULL      COMMENT '主图 URL',
  `status`           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '状态：1=发布 0=草稿',
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  -- ========== 索引设计 ==========
  KEY `idx_cp_brand`        (`brand_id`),
  KEY `idx_cp_origin_type`  (`origin_type`),
  KEY `idx_cp_country`      (`country_id`),
  KEY `idx_cp_strength`     (`strength`),
  KEY `idx_cp_series`       (`series`(100)),
  KEY `idx_cp_vitola`       (`vitola`(100)),
  KEY `idx_cp_status`       (`status`),
  KEY `idx_cp_created`      (`created_at`),
  KEY `idx_cp_wrapper`      (`wrapper_variety`(50)),
  KEY `idx_cp_brand_origin` (`brand_id`, `origin_type`),
  KEY `idx_cp_ring_gauge`   (`ring_gauge`),

  -- 全文索引：支持品牌、型号、描述搜索
  FULLTEXT KEY `ft_cp_search` (`vitola`, `series`, `description`),

  CONSTRAINT `fk_cp_brand`  FOREIGN KEY (`brand_id`)  REFERENCES `cigar_brands`(`id`)    ON DELETE CASCADE,
  CONSTRAINT `fk_cp_country` FOREIGN KEY (`country_id`) REFERENCES `cigar_countries`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_cp_strength` CHECK (`strength` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='雪茄产品主表（核心表）';

-- -----------------------------------------------------------
-- 5. 雪茄 × 风味 多对多关联表
-- -----------------------------------------------------------
CREATE TABLE `cigar_product_flavors` (
  `cigar_id`  INT UNSIGNED NOT NULL COMMENT '雪茄 ID',
  `flavor_id` INT UNSIGNED NOT NULL COMMENT '风味标签 ID',
  `is_official` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否为官方核心风味，1=是 0=用户补充',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cigar_id`, `flavor_id`),
  KEY `idx_cpf_flavor` (`flavor_id`),
  CONSTRAINT `fk_cpf_cigar`  FOREIGN KEY (`cigar_id`)  REFERENCES `cigar_products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cpf_flavor` FOREIGN KEY (`flavor_id`) REFERENCES `cigar_flavors`(`id`)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='雪茄与风味多对多关联表';

-- -----------------------------------------------------------
-- 6. 用户表（基础）
-- -----------------------------------------------------------
CREATE TABLE `users` (
  `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(100)    NOT NULL COMMENT '用户名',
  `email`         VARCHAR(255)    DEFAULT NULL COMMENT '邮箱',
  `password_hash` VARCHAR(255)    NOT NULL COMMENT '密码哈希',
  `avatar_url`    VARCHAR(500)    DEFAULT NULL COMMENT '头像 URL',
  `bio`           VARCHAR(500)    DEFAULT NULL COMMENT '个人简介 / 雪茄偏好',
  `role`          ENUM('admin','editor','user') NOT NULL DEFAULT 'user' COMMENT '角色',
  `status`        TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：1=正常 0=禁用',
  `last_login_at` DATETIME        DEFAULT NULL COMMENT '最后登录时间',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_user_role` (`role`),
  KEY `idx_user_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户基础表';

-- -----------------------------------------------------------
-- 7. 品吸笔记表（cigar_reviews）
-- -----------------------------------------------------------
CREATE TABLE `cigar_reviews` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED    NOT NULL              COMMENT '用户 ID',
  `cigar_id`       INT UNSIGNED    NOT NULL              COMMENT '雪茄 ID',

  -- ========== 三段风味打分（1-10分） ==========
  `pre_score`      TINYINT UNSIGNED DEFAULT NULL         COMMENT '前段风味打分（1-10）',
  `mid_score`      TINYINT UNSIGNED DEFAULT NULL         COMMENT '中段风味打分（1-10）',
  `post_score`     TINYINT UNSIGNED DEFAULT NULL         COMMENT '尾段风味打分（1-10）',

  -- ========== 燃烧与抽吸 ==========
  `burn_evenness`  TINYINT UNSIGNED DEFAULT NULL         COMMENT '斜烧度评分（1-10，10=燃烧完美）',
  `draw_resistance` TINYINT UNSIGNED DEFAULT NULL        COMMENT '抽吸阻力评分（1-10，10=阻力最佳）',

  -- ========== 综合评价 ==========
  `overall_rating` TINYINT UNSIGNED NOT NULL             COMMENT '总体评分（1-10）',
  `title`          VARCHAR(200)     DEFAULT NULL         COMMENT '品吸笔记标题',
  `content`        TEXT                                  COMMENT '品吸笔记正文（支持 Markdown）',
  `smoking_time`   SMALLINT UNSIGNED DEFAULT NULL        COMMENT '品吸时长（分钟）',
  `pairing`        VARCHAR(300)     DEFAULT NULL         COMMENT '搭配饮品/食物',

  -- ========== 养护状态 ==========
  `humidity_at_smoke`  DECIMAL(4,1) DEFAULT NULL        COMMENT '品吸时湿度（%）',
  `rest_time_days`     SMALLINT UNSIGNED DEFAULT NULL    COMMENT '到手后静养天数',

  -- ========== 元信息 ==========
  `status`         TINYINT(1)       NOT NULL DEFAULT 1   COMMENT '状态：1=已发布 0=草稿',
  `helpful_count`  INT UNSIGNED     NOT NULL DEFAULT 0   COMMENT '有用点赞数',
  `created_at`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  -- ========== 索引设计 ==========
  KEY `idx_review_user`  (`user_id`),
  KEY `idx_review_cigar` (`cigar_id`),
  KEY `idx_review_rating` (`overall_rating`),
  KEY `idx_review_status` (`status`),
  KEY `idx_review_created` (`created_at`),
  KEY `idx_review_cigar_rating` (`cigar_id`, `overall_rating`),
  KEY `idx_review_user_cigar` (`user_id`, `cigar_id`),

  -- 全文索引：搜索笔记标题和正文
  FULLTEXT KEY `ft_review_search` (`title`, `content`),

  CONSTRAINT `fk_review_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`)         ON DELETE CASCADE,
  CONSTRAINT `fk_review_cigar` FOREIGN KEY (`cigar_id`) REFERENCES `cigar_products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_review_pre`   CHECK (`pre_score`      BETWEEN 1 AND 10),
  CONSTRAINT `chk_review_mid`   CHECK (`mid_score`      BETWEEN 1 AND 10),
  CONSTRAINT `chk_review_post`  CHECK (`post_score`     BETWEEN 1 AND 10),
  CONSTRAINT `chk_review_burn`  CHECK (`burn_evenness`  BETWEEN 1 AND 10),
  CONSTRAINT `chk_review_draw`  CHECK (`draw_resistance` BETWEEN 1 AND 10),
  CONSTRAINT `chk_review_overall` CHECK (`overall_rating` BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='品吸笔记表（核心关联表）';

-- -----------------------------------------------------------
-- 8. 品吸笔记配图表
-- -----------------------------------------------------------
CREATE TABLE `cigar_review_images` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `review_id`  INT UNSIGNED    NOT NULL           COMMENT '品吸笔记 ID',
  `image_url`  VARCHAR(500)    NOT NULL           COMMENT '图片 URL',
  `description` VARCHAR(200)   DEFAULT NULL       COMMENT '图片描述',
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_review_img_review` (`review_id`),
  CONSTRAINT `fk_review_img_review` FOREIGN KEY (`review_id`) REFERENCES `cigar_reviews`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='品吸笔记配图表';

-- -----------------------------------------------------------
-- 9. 初始数据：风味标签字典
-- -----------------------------------------------------------
INSERT INTO `cigar_flavors` (`name`, `name_cn`, `category`, `sort_order`) VALUES
-- 木香类
('Cedar',        '雪松木',  'woody',    1),
('Oak',          '橡木',    'woody',    2),
('Sandalwood',   '檀香木',  'woody',    3),
-- 辛香类
('Pepper',       '胡椒',    'spicy',    4),
('Cinnamon',     '肉桂',    'spicy',    5),
('Nutmeg',       '肉豆蔻',  'spicy',    6),
('Clove',        '丁香',    'spicy',    7),
-- 甜香/美食类
('Cocoa',        '可可',    'sweet',    8),
('Coffee',       '咖啡',    'sweet',    9),
('Vanilla',      '香草',    'sweet',   10),
('Honey',        '蜂蜜',    'sweet',   11),
('Caramel',      '焦糖',    'sweet',   12),
('Chocolate',    '巧克力',  'sweet',   13),
('Cream',        '奶油',    'sweet',   14),
-- 土香/皮革类
('Leather',      '皮革',    'earthy',  15),
('Earth',        '泥土',    'earthy',  16),
('Barnyard',     '谷仓',    'earthy',  17),
('Moss',         '苔藓',    'earthy',  18),
-- 坚果类
('Almond',       '杏仁',    'nutty',   19),
('Walnut',       '核桃',    'nutty',   20),
('Peanut',       '花生',    'nutty',   21),
-- 花香/清新类
('Floral',       '花香',    'floral',  22),
('Citrus',       '柑橘',    'fresh',   23),
('Grass',        '青草',    'fresh',   24),
('Mint',         '薄荷',    'fresh',   25),
-- 其他
('Toast',        '烤面包',  'toasty',  26),
('Smoke',        '烟熏',    'smoky',   27),
('Cedar/Mint',   '雪松/薄荷混合','complex', 28),-- 补充：由 content/seed_cigars_15.csv 导入时发现字典缺失
('Bean',         '豆香',    'sweet',   29),
('DarkChocolate','黑巧',    'sweet',   30),
('Nuts',         '坚果',    'nutty',   31);
