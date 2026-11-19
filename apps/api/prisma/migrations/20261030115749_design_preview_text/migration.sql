SET @united_technologies_preview_sql = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE `Design` MODIFY `previewUrl` TEXT NULL',
    'SELECT 1'
  )
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'Design'
);
PREPARE united_technologies_preview_stmt FROM @united_technologies_preview_sql;
EXECUTE united_technologies_preview_stmt;
DEALLOCATE PREPARE united_technologies_preview_stmt;
