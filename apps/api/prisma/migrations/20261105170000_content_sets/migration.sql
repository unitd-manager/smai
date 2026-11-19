CREATE TABLE `ContentSet` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `brief` TEXT NOT NULL,
    `platforms` JSON NOT NULL,
    `contentIds` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `ContentSet_workspace_created_idx`(`workspaceId`, `resellerId`, `createdAt`),
    INDEX `ContentSet_brand_created_idx`(`brandId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ContentSet_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ContentSet_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
