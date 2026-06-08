-- ============================================================
-- 勋章/头衔体系 · 数据库结构 + 初始数据
-- ============================================================

CREATE TABLE `user_badge_categories` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100)    NOT NULL COMMENT '分类名称，如 创始元老、贡献者、专家',
  `name_cn`     VARCHAR(100)    NOT NULL COMMENT '中文名称',
  `icon_url`    VARCHAR(500)    DEFAULT NULL COMMENT '分类图标',
  `sort_order`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='勋章分类表';

CREATE TABLE `user_badges` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED    NOT NULL COMMENT '所属分类',
  `name`        VARCHAR(100)    NOT NULL COMMENT '勋章英文标识',
  `name_cn`     VARCHAR(100)    NOT NULL COMMENT '勋章中文名称',
  `description` VARCHAR(500)    DEFAULT NULL COMMENT '获得条件描述',
  `icon_url`    VARCHAR(500)    DEFAULT NULL COMMENT '勋章图标 URL（SVG/PNG）',
  `color`       VARCHAR(20)     DEFAULT NULL COMMENT '主题色，如 #c9a84c（金）、#e8dcc8（银）',
  `level`       TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '等级 1-5',
  `is_manual_award` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '是否仅由管理员手动授予',
  `achieve_condition` VARCHAR(200) DEFAULT NULL COMMENT '自动达成条件（JSON）',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_badge_category` (`category_id`),
  CONSTRAINT `fk_badge_category` FOREIGN KEY (`category_id`) REFERENCES `user_badge_categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='勋章定义表';

CREATE TABLE `user_badge_awards` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED    NOT NULL COMMENT '用户 ID',
  `badge_id`    INT UNSIGNED    NOT NULL COMMENT '勋章 ID',
  `granted_by`  INT UNSIGNED    DEFAULT NULL COMMENT '授予人（管理员用户 ID），NULL=系统自动',
  `grant_reason` VARCHAR(500)   DEFAULT NULL COMMENT '授予理由',
  `is_displayed` TINYINT(1)     NOT NULL DEFAULT 1 COMMENT '是否在个人主页展示',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_badge` (`user_id`, `badge_id`),
  KEY `idx_award_user` (`user_id`),
  KEY `idx_award_badge` (`badge_id`),
  CONSTRAINT `fk_award_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_award_badge` FOREIGN KEY (`badge_id`) REFERENCES `user_badges`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户勋章授予记录表';

-- 新增用户头衔字段（扩展 users 表）
ALTER TABLE `users`
  ADD COLUMN `title` VARCHAR(100) DEFAULT NULL COMMENT '自定义头衔，如"荣誉茄长"',
  ADD COLUMN `title_color` VARCHAR(20) DEFAULT NULL COMMENT '头衔颜色',
  ADD COLUMN `is_founder` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为创始元老';

-- ============================================================
-- 初始勋章数据
-- ============================================================

INSERT INTO `user_badge_categories` (`id`, `name`, `name_cn`, `sort_order`) VALUES
(1, 'founder',    '创始元老',   1),
(2, 'contributor','内容贡献者', 2),
(3, 'expert',     '品鉴专家',   3),
(4, 'social',     '社区活跃',   4),
(5, 'special',    '特殊成就',   5);

INSERT INTO `user_badges` (`id`, `category_id`, `name`, `name_cn`, `description`, `color`, `level`, `is_manual_award`, `achieve_condition`) VALUES
-- 创始元老（人工授予）
(1, 1, 'founding_member',    '创始元老',    '社区初创期加入并贡献核心内容的奠基者',         '#c9a84c', 1, 1, NULL),
(2, 1, 'honorary_president', '荣誉茄长',    '由社区委员会投票选出的年度荣誉领袖',           '#e8dcc8', 2, 1, NULL),

-- 内容贡献者（自动 + 人工）
(3, 2, 'first_blood',        '首发录入者',  '首位提报某款雪茄数据并审核通过的用户',         '#8b5e3c', 1, 0, '{"type":"first_submission"}'),
(4, 2, 'cigar_scribe',       '金牌品鉴师',  '累计发布 20 条以上精品品吸笔记',                '#5a7a5a', 3, 0, '{"type":"reviews_count","min":20}'),
(5, 2, 'data_contributor',   '数据库共建者','累计提交 10 款以上通过审核的雪茄数据',          '#a08060', 2, 0, '{"type":"submissions_count","min":10}'),

-- 品鉴专家（自动）
(6, 3, 'flavor_master',      '风味大师',    '累计评定风味轮评分超过 100 次',                 '#c9a84c', 2, 0, '{"type":"flavor_ratings","min":100}'),
(7, 3, 'aging_guardian',     '醇化守护者',  '在养护板块累计贡献 50 条以上高质量回答',          '#6b5b4b', 3, 0, '{"type":"helpful_answers","min":50}'),

-- 社区活跃
(8, 4, 'helpful_hand',       '热心茄友',    '获得 100 次以上有用点赞',                       '#a09080', 1, 0, '{"type":"helpful_votes","min":100}'),
(9, 4, 'weekly_regular',     '周赛常客',    '连续参与 8 次周五盲测夜活动',                   '#c0392b', 2, 0, '{"type":"weekly_attendance","min":8}'),

-- 特殊成就
(10, 5, 'plume_hunter',      '开花猎人',    '成功上传经认证的雪茄开花（Plume）实拍图',        '#c9a84c', 1, 1, NULL),
(11, 5, 'cellar_master',     '窖藏大师',    '公开分享的醇化柜方案获得 50 人以上收藏',          '#8b5e3c', 3, 0, '{"type":"cellar_saves","min":50}');
