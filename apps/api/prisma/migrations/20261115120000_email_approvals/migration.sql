ALTER TABLE `Approval`
  ADD COLUMN `emailTokenHash` VARCHAR(64) NULL,
  ADD COLUMN `emailTokenExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `emailSentAt` DATETIME(3) NULL,
  ADD UNIQUE INDEX `Approval_emailTokenHash_key` (`emailTokenHash`);
