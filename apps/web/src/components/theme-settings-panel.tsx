"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyThemeSettings,
  defaultThemeSettings,
  normalizeThemeSettings,
  themePresets,
  type ThemeSettings,
} from "@/lib/theme-settings";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type ThemeSettingsResponse = { userSettings: unknown; workspaceSettings: unknown };

type ThemeScope = "user" | "workspace";

const themeChangedEvent = "united-technologies-theme-change";
const settingsStorageKey = "united-technologies.theme-settings";
const pendingStorageKey = "united-technologies.theme-settings-pending";
const pendingScopeStorageKey = "united-technologies.theme-settings-pending-scope";

function updatePreview(settings: ThemeSettings) {
  const resolvedMode = applyThemeSettings(settings);
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  window.localStorage.setItem("united-technologies.theme", resolvedMode);
  window.dispatchEvent(new Event(themeChangedEvent));
}

function previewDraft(settings: ThemeSettings) {
  applyThemeSettings(settings);
  window.dispatchEvent(new Event(themeChangedEvent));
}

export function ThemeSettingsPanel() {
  const [settings, setSettings] = useState<ThemeSettings>(defaultThemeSettings);
  const [userSettings, setUserSettings] = useState<ThemeSettings | null>(null);
  const [workspaceSettings, setWorkspaceSettings] = useState<ThemeSettings | null>(null);
  const scope: ThemeScope = "user";
  const [hasUserOverride, setHasUserOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    apiRequest<ThemeSettingsResponse>("/api/theme-settings")
      .then((response) => {
        if (!active) return;
        const workspace = response.workspaceSettings
          ? normalizeThemeSettings(response.workspaceSettings)
          : null;
        const user = response.userSettings
          ? normalizeThemeSettings(response.userSettings)
          : null;
        const hasPendingChange = window.localStorage.getItem(pendingStorageKey) === "true";
        const cachedSettings = hasPendingChange
          ? normalizeThemeSettings(JSON.parse(window.localStorage.getItem(settingsStorageKey) ?? "null"))
          : null;
        const pendingScope = window.localStorage.getItem(pendingScopeStorageKey);
        const effective = cachedSettings ?? user ?? workspace ?? defaultThemeSettings;
        setWorkspaceSettings(pendingScope === "workspace" && cachedSettings ? cachedSettings : workspace);
        setUserSettings(pendingScope !== "workspace" && cachedSettings ? cachedSettings : user);
        setHasUserOverride(user !== null || (pendingScope === "user" && cachedSettings !== null));
        setSettings(effective);
        setDirty(hasPendingChange);
        updatePreview(effective);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load appearance settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function changeSettings(next: ThemeSettings) {
    revision.current += 1;
    setSettings(next);
    setDirty(true);
    setNotice("");
    previewDraft(next);
  }

  const persistSettings = useCallback(async (
    targetSettings: ThemeSettings,
    targetScope: ThemeScope,
    targetRevision: number,
  ) => {
    setError("");
    const request = saveQueue.current.then(() =>
      apiRequest<{ settings: unknown }>("/api/theme-settings", {
        method: "PUT",
        body: JSON.stringify({ scope: targetScope, settings: targetSettings }),
      }),
    );
    saveQueue.current = request.then(() => undefined, () => undefined);
    const response = await request;
    if (targetRevision !== revision.current) return;

    const normalized = normalizeThemeSettings(response.settings);
    if (targetScope === "workspace") setWorkspaceSettings(normalized);
    else {
      setHasUserOverride(true);
      setUserSettings(normalized);
    }
    const effective = targetScope === "workspace" && hasUserOverride
      ? userSettings ?? defaultThemeSettings
      : normalized;
    setSettings(effective);
    setDirty(false);
    window.localStorage.removeItem(pendingStorageKey);
    window.localStorage.removeItem(pendingScopeStorageKey);
    updatePreview(effective);
    setNotice(targetScope === "workspace"
      ? hasUserOverride
        ? "Workspace default saved. Your personal preference still takes precedence on this account."
        : "Workspace default saved."
      : "Your appearance preference is saved.");
  }, [hasUserOverride, userSettings]);

  async function saveSettings() {
    setSaving(true);
    window.localStorage.setItem(pendingStorageKey, "true");
    window.localStorage.setItem(pendingScopeStorageKey, scope);
    try {
      await persistSettings(settings, scope, revision.current);
    } catch (requestError) {
      window.localStorage.removeItem(pendingStorageKey);
      window.localStorage.removeItem(pendingScopeStorageKey);
      setError(requestError instanceof Error ? requestError.message : "Could not save appearance settings.");
    } finally {
      setSaving(false);
    }
  }

  async function useWorkspaceDefault() {
    const resetRevision = revision.current + 1;
    revision.current = resetRevision;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const request = saveQueue.current.then(() =>
        apiRequest<void>("/api/theme-settings/user", { method: "DELETE" }),
      );
      saveQueue.current = request.then(() => undefined, () => undefined);
      await request;
      if (resetRevision !== revision.current) return;
      const effective = workspaceSettings ?? defaultThemeSettings;
      setHasUserOverride(false);
      setUserSettings(null);
      setSettings(effective);
      setDirty(false);
      window.localStorage.removeItem(pendingStorageKey);
      window.localStorage.removeItem(pendingScopeStorageKey);
      updatePreview(effective);
      setNotice("Your appearance now follows the workspace default.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not reset your appearance preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-settings-page">
      <header className="theme-settings-header">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>Appearance</h1>
          <p className="dashboard-lead">Choose a color palette, preview it across your workspace, then save it.</p>
        </div>
        <div className="theme-settings-header-actions">
          {hasUserOverride && <button className="button button-outline" type="button" onClick={useWorkspaceDefault} disabled={loading || saving || dirty}>Use workspace default</button>}
          <button className="button button-gold" type="button" onClick={saveSettings} disabled={loading || saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {error && <p className="theme-settings-message error" role="alert">{error}</p>}
      {notice && <p className="theme-settings-message success" role="status">{notice}</p>}
      {loading ? <p className="loading-label">Loading appearance settings…</p> : (
        <>
          <section className="theme-settings-section">
            <div className="theme-settings-section-heading">
              <div><h2>Color theme</h2><p>Select a preset or define your own brand colors.</p></div>
              <label className="theme-setting-field">
                <span>Color mode</span>
                <CompactSelect aria-label="Color mode" value={settings.mode} onChange={(event) => changeSettings({ ...settings, mode: event.target.value as ThemeSettings["mode"] })}>
                  <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
                </CompactSelect>
              </label>
            </div>
            <div className="theme-preset-grid">
              {themePresets.map((preset) => (
                <button
                  type="button"
                  className={`theme-preset${settings.preset === preset.id ? " selected" : ""}`}
                  key={preset.id}
                  aria-pressed={settings.preset === preset.id}
                  onClick={() => changeSettings({ ...settings, preset: preset.id })}
                >
                  <span className="theme-preset-copy">
                    <strong>{preset.name}</strong>
                    <small><i style={{ backgroundColor: preset.primary }} /><span>{preset.primaryName}</span><code>{preset.primary}</code></small>
                    <small><i style={{ backgroundColor: preset.accent }} /><span>{preset.accentName}</span><code>{preset.accent}</code></small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
