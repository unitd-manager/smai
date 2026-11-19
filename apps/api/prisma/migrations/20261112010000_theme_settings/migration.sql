ALTER TABLE `Workspace`
    ADD COLUMN `themeDefaults` JSON NULL;

ALTER TABLE `User`
    ADD COLUMN `themePreference` JSON NULL;
