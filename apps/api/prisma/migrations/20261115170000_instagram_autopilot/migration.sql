ALTER TABLE `CompanyProfile`
  ADD COLUMN `instagramAutopilotEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `instagramAutopilotNextRunAt` DATETIME(3) NULL;

ALTER TABLE `GeneratedContent`
  ADD COLUMN `automationKey` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `GeneratedContent_automationKey_key` (`automationKey`);

CREATE TABLE `InstagramAutopilotRun` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `brandId` VARCHAR(191) NOT NULL,
  `weekStart` DATETIME(3) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `contentPlanId` VARCHAR(191) NULL,
  `contentIds` JSON NULL,
  `videoJobIds` JSON NULL,
  `error` TEXT NULL,
  `lockedAt` DATETIME(3) NULL,
  `nextAttemptAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `InstagramAutopilotRun_brandId_weekStart_key` (`brandId`, `weekStart`),
  INDEX `InstagramAutopilotRun_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`),
  INDEX `InstagramAutopilotRun_workspaceId_brandId_createdAt_idx` (`workspaceId`, `brandId`, `createdAt`),
  CONSTRAINT `InstagramAutopilotRun_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `InstagramAutopilotRun_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
