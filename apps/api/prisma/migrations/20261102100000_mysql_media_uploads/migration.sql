ALTER TABLE `MediaAsset`
    ADD COLUMN `fileData` LONGBLOB NULL;

ALTER TABLE `PostTarget`
    ADD COLUMN `mediaAssetId` VARCHAR(191) NULL;

ALTER TABLE `PostTarget`
    ADD INDEX `PostTarget_mediaAssetId_idx`(`mediaAssetId`);

ALTER TABLE `PostTarget`
    ADD CONSTRAINT `PostTarget_mediaAssetId_fkey`
        FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
