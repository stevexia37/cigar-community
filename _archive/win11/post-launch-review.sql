-- ============================================================
-- 上线后第 7 天 · 数据复盘 SQL
-- 执行环境：MySQL 8.0+
-- 使用方式：复制到管理后台 SQL 查询面板 或 Metabase 运行
-- ============================================================

-- ──────────────────────────────────────────
-- 1. DAU 趋势（上线后连续 7 天）
-- ──────────────────────────────────────────
SELECT
  DATE(v.created_at)                                    AS `日期`,
  COUNT(DISTINCT v.visitor_id)                          AS `UV`,
  COUNT(*)                                              AS `PV`,
  ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT v.visitor_id),0), 2) AS `PV/UV`,
  COUNT(DISTINCT s.user_id)                             AS `DAU（已登录用户）`
FROM page_views v
LEFT JOIN user_sessions s ON v.visitor_id = s.session_id
WHERE v.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY DATE(v.created_at)
ORDER BY `日期`;

-- ──────────────────────────────────────────
-- 2. 新用户次日留存率
-- ──────────────────────────────────────────
WITH first_day AS (
  SELECT
    user_id,
    DATE(MIN(created_at)) AS first_visit_date
  FROM user_sessions
  WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)
    AND created_at < CURDATE()
  GROUP BY user_id
),
retention AS (
  SELECT
    f.first_visit_date,
    COUNT(DISTINCT f.user_id)                                                      AS `新用户数`,
    COUNT(DISTINCT s2.user_id)                                                     AS `次日回访数`,
    ROUND(COUNT(DISTINCT s2.user_id) / COUNT(DISTINCT f.user_id) * 100, 1)         AS `次日留存率%`,
    COUNT(DISTINCT s7.user_id)                                                     AS `7日回访数`,
    ROUND(COUNT(DISTINCT s7.user_id) / COUNT(DISTINCT f.user_id) * 100, 1)         AS `7日留存率%`
  FROM first_day f
  LEFT JOIN user_sessions s2 ON f.user_id = s2.user_id
    AND DATE(s2.created_at) = f.first_visit_date + INTERVAL 1 DAY
  LEFT JOIN user_sessions s7 ON f.user_id = s7.user_id
    AND DATE(s7.created_at) = f.first_visit_date + INTERVAL 6 DAY
  GROUP BY f.first_visit_date
)
SELECT * FROM retention ORDER BY first_visit_date;

-- ──────────────────────────────────────────
-- 3. UGC 产出率（注册用户中多少人写了笔记）
-- ──────────────────────────────────────────
SELECT
  '上线后数据' AS `周期`,
  COUNT(DISTINCT r.user_id)                                 AS `写过至少1篇笔记的用户数`,
  (SELECT COUNT(DISTINCT user_id) FROM user_sessions
   WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS `7日活跃用户数`,
  ROUND(
    COUNT(DISTINCT r.user_id) /
    NULLIF((SELECT COUNT(DISTINCT user_id) FROM user_sessions
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)), 0) * 100, 1
  )                                                         AS `UGC产出率%`
FROM cigar_reviews r
WHERE r.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY);

-- ──────────────────────────────────────────
-- 4. 搜索 TOP 10 关键词（指导内容运营方向）
-- ──────────────────────────────────────────
SELECT
  LOWER(TRIM(keyword)) AS `搜索词`,
  COUNT(*)             AS `搜索次数`
FROM search_logs
WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY LOWER(TRIM(keyword))
ORDER BY `搜索次数` DESC
LIMIT 10;

-- ──────────────────────────────────────────
-- 5. 热门雪茄 TOP 10（按 PV）
-- ──────────────────────────────────────────
SELECT
  p.brand                                                   AS `品牌`,
  p.vitola                                                  AS `型号`,
  COUNT(v.id)                                               AS `浏览量`,
  COUNT(DISTINCT v.visitor_id)                              AS `访客数`,
  ROUND(AVG(r.overall_rating), 1)                           AS `平均评分`,
  COUNT(r.id)                                               AS `笔记数`
FROM cigar_products p
LEFT JOIN page_views v ON v.page_type = 'cigar_detail' AND v.page_id = p.id
LEFT JOIN cigar_reviews r ON r.cigar_id = p.id
WHERE v.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY p.id, p.brand, p.vitola
ORDER BY `浏览量` DESC
LIMIT 10;

-- ──────────────────────────────────────────
-- 6. 注册来源分布
-- ──────────────────────────────────────────
SELECT
  COALESCE(utm_source, 'direct') AS `来源渠道`,
  COUNT(*)                       AS `注册数`,
  ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS `占比%`
FROM users
WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY utm_source
ORDER BY `注册数` DESC;

-- ──────────────────────────────────────────
-- 7. 服务器资源使用（需结合服务器监控，非 SQL）
-- ──────────────────────────────────────────
-- 以下为人工检查项：
-- CPU 峰值: ____% ／ 平均: ____%
-- 内存峰值: ____% ／ 平均: ____%
-- 磁盘使用率: ____%
-- 数据库连接数峰值: ____
-- CDN 命中率: ____%
