ALTER TABLE `SocialAccount`
  ADD COLUMN `providerUserId` VARCHAR(191) NULL,
  ADD INDEX `SocialAccount_providerUserId_idx` (`providerUserId`);

CREATE TABLE `MetaDataDeletionRequest` (
  `id` VARCHAR(191) NOT NULL,
  `confirmationCodeHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MetaDataDeletionRequest_confirmationCodeHash_key` (`confirmationCodeHash`),
  INDEX `MetaDataDeletionRequest_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
