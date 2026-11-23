ALTER TABLE `Workspace`
    ADD COLUMN `billingWorkspaceId` VARCHAR(191) NULL,
    ADD INDEX `Workspace_billingWorkspaceId_idx`(`billingWorkspaceId`);

ALTER TABLE `Workspace`
    ADD CONSTRAINT `Workspace_billingWorkspaceId_fkey`
    FOREIGN KEY (`billingWorkspaceId`) REFERENCES `Workspace`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
