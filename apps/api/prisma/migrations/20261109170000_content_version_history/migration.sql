CREATE TABLE `ContentVersion` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `generatedContentId` VARCHAR(191) NULL,
    `designId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ContentVersion_generatedContentId_version_key`(`generatedContentId`, `version`),
    UNIQUE INDEX `ContentVersion_designId_version_key`(`designId`, `version`),
    INDEX `ContentVersion_workspaceId_createdAt_idx`(`workspaceId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ContentVersion_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ContentVersion_generatedContentId_fkey` FOREIGN KEY (`generatedContentId`) REFERENCES `GeneratedContent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ContentVersion_designId_fkey` FOREIGN KEY (`designId`) REFERENCES `Design`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ContentVersion` (
    `id`, `workspaceId`, `generatedContentId`, `designId`, `version`,
    `snapshot`, `createdById`, `note`, `createdAt`
)
SELECT
    UUID(), `workspaceId`, `id`, NULL, 1,
    `contentJson`, NULL, 'Initial snapshot', `createdAt`
FROM `GeneratedContent`;

INSERT INTO `ContentVersion` (
    `id`, `workspaceId`, `generatedContentId`, `designId`, `version`,
    `snapshot`, `createdById`, `note`, `createdAt`
)
SELECT
    UUID(), `workspaceId`, NULL, `id`, 1,
    JSON_OBJECT(
        'title', `title`,
        'designJson', `designJson`,
        'previewUrl', `previewUrl`,
        'status', `status`
    ),
    NULL, 'Initial snapshot', `createdAt`
FROM `Design`;
