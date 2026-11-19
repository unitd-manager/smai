ALTER TABLE `VideoRenderJob`
    ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `heartbeatAt` DATETIME(3) NULL,
    ADD COLUMN `timeoutAt` DATETIME(3) NULL,
    ADD COLUMN `nextAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD INDEX `VideoRenderJob_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    ADD INDEX `VideoRenderJob_status_heartbeatAt_idx`(`status`, `heartbeatAt`);
