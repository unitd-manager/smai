"use client";

import { useEffect, type ReactNode } from "react";
import { applyThemeSettings, upgradeLegacyThemeSettings } from "@/lib/theme-settings";

const settingsStorageKey = "united-technologies.theme-settings";

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const applySavedSettings = () => {
      const storedSettings = window.localStorage.getItem(settingsStorageKey);
      try {
        const settings = upgradeLegacyThemeSettings(storedSettings ? JSON.parse(storedSettings) : undefined);
        const mode = applyThemeSettings(settings);
        window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
        window.localStorage.setItem("united-technologies.theme", mode);
        window.dispatchEvent(new Event("united-technologies-theme-change"));
      } catch (error) {
        console.error("Could not apply saved appearance preferences.", error);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === settingsStorageKey) applySavedSettings();
    };
    const systemMode = window.matchMedia("(prefers-color-scheme: dark)");
    systemMode.addEventListener("change", applySavedSettings);
    window.addEventListener("storage", handleStorage);
    applySavedSettings();
    return () => {
      systemMode.removeEventListener("change", applySavedSettings);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return children;
}
