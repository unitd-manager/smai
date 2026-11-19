-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reseller` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `plan` VARCHAR(191) NOT NULL DEFAULT 'white-label-starter',
    `limits` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Reseller_ownerUserId_key`(`ownerUserId`),
    INDEX `Reseller_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Workspace` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `resellerId` VARCHAR(191) NULL,
    `trialStartsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `trialEndsAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Workspace_resellerId_idx`(`resellerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Membership` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER') NOT NULL DEFAULT 'OWNER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Membership_workspaceId_idx`(`workspaceId`),
    UNIQUE INDEX `Membership_userId_workspaceId_key`(`userId`, `workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Brand_workspaceId_resellerId_idx`(`workspaceId`, `resellerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyProfile` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `companyWebsite` VARCHAR(191) NULL,
    `websiteVerified` BOOLEAN NOT NULL DEFAULT false,
    `accountType` ENUM('BUSINESS', 'AGENCY', 'CREATOR', 'PERSONAL') NOT NULL DEFAULT 'BUSINESS',
    `emailType` ENUM('WORK', 'FREE') NOT NULL DEFAULT 'WORK',
    `segment` VARCHAR(191) NOT NULL,
    `industry` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `products` VARCHAR(191) NULL,
    `audience` VARCHAR(191) NULL,
    `offers` VARCHAR(191) NULL,
    `tone` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `languages` JSON NULL,
    `competitors` JSON NULL,
    `goals` JSON NULL,
    `preferredPlatforms` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CompanyProfile_brandId_key`(`brandId`),
    INDEX `CompanyProfile_workspaceId_resellerId_idx`(`workspaceId`, `resellerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrandKit` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `colors` JSON NULL,
    `fonts` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BrandKit_brandId_key`(`brandId`),
    INDEX `BrandKit_workspaceId_resellerId_idx`(`workspaceId`, `resellerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `plan` VARCHAR(191) NOT NULL DEFAULT 'trial',
    `status` VARCHAR(191) NOT NULL DEFAULT 'trialing',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Subscription_workspaceId_key`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Plan` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `limits` JSON NOT NULL,
    `features` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Plan_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    INDEX `RefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamInvite` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER') NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TeamInvite_tokenHash_key`(`tokenHash`),
    INDEX `TeamInvite_workspaceId_expiresAt_idx`(`workspaceId`, `expiresAt`),
    UNIQUE INDEX `TeamInvite_workspaceId_email_key`(`workspaceId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialAccount` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `encryptedTokens` TEXT NOT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CONNECTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialAccount_workspaceId_resellerId_idx`(`workspaceId`, `resellerId`),
    UNIQUE INDEX `SocialAccount_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` BIGINT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MediaAsset_workspaceId_resellerId_createdAt_idx`(`workspaceId`, `resellerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Template` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `resellerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `templateJson` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Template_workspaceId_resellerId_format_idx`(`workspaceId`, `resellerId`, `format`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Design` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `designJson` JSON NOT NULL,
    `previewUrl` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Design_workspaceId_resellerId_createdAt_idx`(`workspaceId`, `resellerId`, `createdAt`),
    INDEX `Design_brandId_status_idx`(`brandId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratedContent` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `request` TEXT NULL,
    `contentJson` JSON NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GeneratedContent_workspaceId_resellerId_createdAt_idx`(`workspaceId`, `resellerId`, `createdAt`),
    INDEX `GeneratedContent_brandId_createdAt_idx`(`brandId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentPlan` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `planJson` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContentPlan_workspaceId_resellerId_startsAt_idx`(`workspaceId`, `resellerId`, `startsAt`),
    INDEX `ContentPlan_brandId_startsAt_idx`(`brandId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Post` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `designId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `caption` TEXT NOT NULL,
    `hashtags` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `scheduledAt` DATETIME(3) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Post_workspaceId_resellerId_status_scheduledAt_idx`(`workspaceId`, `resellerId`, `status`, `scheduledAt`),
    INDEX `Post_brandId_scheduledAt_idx`(`brandId`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostTarget` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `socialAccountId` VARCHAR(191) NULL,
    `captionOverride` TEXT NULL,
    `media` JSON NULL,
    `platformPostId` VARCHAR(191) NULL,
    `publishedUrl` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `publishedAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PostTarget_workspaceId_resellerId_status_idx`(`workspaceId`, `resellerId`, `status`),
    INDEX `PostTarget_postId_platform_idx`(`postId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishJob` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `runAt` DATETIME(3) NOT NULL,
    `lockedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PublishJob_status_runAt_lockedAt_idx`(`status`, `runAt`, `lockedAt`),
    INDEX `PublishJob_workspaceId_resellerId_status_idx`(`workspaceId`, `resellerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Approval` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Approval_workspaceId_resellerId_status_idx`(`workspaceId`, `resellerId`, `status`),
    INDEX `Approval_postId_status_idx`(`postId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Comment_workspaceId_resellerId_createdAt_idx`(`workspaceId`, `resellerId`, `createdAt`),
    INDEX `Comment_postId_createdAt_idx`(`postId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metrics` JSON NOT NULL,

    INDEX `AnalyticsSnapshot_workspaceId_resellerId_capturedAt_idx`(`workspaceId`, `resellerId`, `capturedAt`),
    INDEX `AnalyticsSnapshot_postId_capturedAt_idx`(`postId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InboxItem` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `itemType` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `assignedTo` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InboxItem_workspaceId_resellerId_status_receivedAt_idx`(`workspaceId`, `resellerId`, `status`, `receivedAt`),
    UNIQUE INDEX `InboxItem_platform_externalId_key`(`platform`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_workspaceId_userId_readAt_createdAt_idx`(`workspaceId`, `userId`, `readAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_workspaceId_createdAt_idx`(`workspaceId`, `createdAt`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactMessage` (
    `id` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContactMessage_resellerId_status_createdAt_idx`(`resellerId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DemoRequest` (
    `id` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NOT NULL,
    `teamSize` VARCHAR(191) NULL,
    `platforms` JSON NULL,
    `preferredTime` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DemoRequest_resellerId_status_createdAt_idx`(`resellerId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerApplication` (
    `id` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NOT NULL,
    `details` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerApplication_resellerId_status_createdAt_idx`(`resellerId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NewsletterSubscriber` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'website',
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NewsletterSubscriber_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Reseller` ADD CONSTRAINT `Reseller_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Workspace` ADD CONSTRAINT `Workspace_resellerId_fkey` FOREIGN KEY (`resellerId`) REFERENCES `Reseller`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Brand` ADD CONSTRAINT `Brand_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompanyProfile` ADD CONSTRAINT `CompanyProfile_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BrandKit` ADD CONSTRAINT `BrandKit_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamInvite` ADD CONSTRAINT `TeamInvite_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamInvite` ADD CONSTRAINT `TeamInvite_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAccount` ADD CONSTRAINT `SocialAccount_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Design` ADD CONSTRAINT `Design_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Design` ADD CONSTRAINT `Design_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedContent` ADD CONSTRAINT `GeneratedContent_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedContent` ADD CONSTRAINT `GeneratedContent_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentPlan` ADD CONSTRAINT `ContentPlan_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentPlan` ADD CONSTRAINT `ContentPlan_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostTarget` ADD CONSTRAINT `PostTarget_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostTarget` ADD CONSTRAINT `PostTarget_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishJob` ADD CONSTRAINT `PublishJob_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishJob` ADD CONSTRAINT `PublishJob_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishJob` ADD CONSTRAINT `PublishJob_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `PostTarget`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Approval` ADD CONSTRAINT `Approval_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Approval` ADD CONSTRAINT `Approval_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalyticsSnapshot` ADD CONSTRAINT `AnalyticsSnapshot_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalyticsSnapshot` ADD CONSTRAINT `AnalyticsSnapshot_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InboxItem` ADD CONSTRAINT `InboxItem_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactMessage` ADD CONSTRAINT `ContactMessage_resellerId_fkey` FOREIGN KEY (`resellerId`) REFERENCES `Reseller`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoRequest` ADD CONSTRAINT `DemoRequest_resellerId_fkey` FOREIGN KEY (`resellerId`) REFERENCES `Reseller`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerApplication` ADD CONSTRAINT `PartnerApplication_resellerId_fkey` FOREIGN KEY (`resellerId`) REFERENCES `Reseller`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
