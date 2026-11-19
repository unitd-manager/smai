CREATE TABLE `VideoRenderJob` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `brandId` VARCHAR(191) NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `inputJson` JSON NOT NULL,
    `outputKey` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `lockedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `VideoRenderJob_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `VideoRenderJob_workspaceId_status_createdAt_idx`(`workspaceId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoRenderJob` ADD CONSTRAINT `VideoRenderJob_workspaceId_fkey`
FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VideoRenderJob` ADD CONSTRAINT `VideoRenderJob_brandId_fkey`
FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
