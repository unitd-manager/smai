"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { getTimezoneLabel, getTimezones } from "@/lib/timezone";
import { ApprovalEmailSettingsPanel } from "@/components/approval-email-settings-panel";

type BrandResponse = { brand: { timezone: string } };
type AutopilotStatus = {
  brand: { instagramAutopilotEnabled: boolean; instagramAutopilotNextRunAt: string | null; connectedPlatforms: string[] };
  blockers: string[];
  ready: boolean;
};

const timezoneOptions = getTimezones();

function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (timezone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? timezoneOptions.filter((timezone) => timezone.toLocaleLowerCase().includes(query))
      : timezoneOptions;
  }, [search]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function closePicker(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setSearch("");
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    window.addEventListener("pointerdown", closePicker);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", closePicker);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="timezone-picker" ref={rootRef}>
      <button
        className="timezone-picker-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{getTimezoneLabel(value)}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className="timezone-picker-popover">
          <label className="timezone-picker-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a city or time zone"
              aria-label="Search time zones"
            />
          </label>
          <div className="timezone-picker-options" role="listbox" aria-label="Time zones">
            {filteredOptions.length ? filteredOptions.map((timezone) => (
              <button
                type="button"
                role="option"
                aria-selected={value === timezone}
                key={timezone}
                onClick={() => {
                  onChange(timezone);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span>{getTimezoneLabel(timezone)}</span>
                {value === timezone && <Check size={16} aria-hidden="true" />}
              </button>
            )) : <p>No matching time zones.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function PublishingSettingsPanel() {
  const [timezone, setTimezone] = useState("UTC");
  const [savedTimezone, setSavedTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autopilot, setAutopilot] = useState<AutopilotStatus | null>(null);
  const [autopilotSaving, setAutopilotSaving] = useState(false);
  const [autopilotError, setAutopilotError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<BrandResponse>("/api/brand-profile")
      .then(({ brand }) => {
        if (!active) return;
        const selected = timezoneOptions.includes(brand.timezone) ? brand.timezone : "UTC";
        setTimezone(selected);
        setSavedTimezone(selected);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load publishing settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<AutopilotStatus>("/api/brand-profile/instagram-autopilot/status")
      .then((value) => { if (active) setAutopilot(value); })
      .catch((requestError: unknown) => { if (active) setAutopilotError(requestError instanceof Error ? requestError.message : "Could not load Autopilot settings."); });
    return () => { active = false; };
  }, []);

  async function saveAutopilot(enabled: boolean) {
    if (!autopilot || enabled && !autopilot.ready) return;
    setAutopilotSaving(true);
    setAutopilotError("");
    try {
      await apiRequest("/api/brand-profile", { method: "PUT", body: JSON.stringify({ instagramAutopilotEnabled: enabled }) });
      const refreshed = await apiRequest<AutopilotStatus>("/api/brand-profile/instagram-autopilot/status");
      setAutopilot(refreshed);
    } catch (requestError) {
      setAutopilotError(requestError instanceof Error ? requestError.message : "Could not update Autopilot.");
    } finally {
      setAutopilotSaving(false);
    }
  }

  async function saveTimezone() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/brand-profile", {
        method: "PUT",
        body: JSON.stringify({ timezone }),
      });
      setSavedTimezone(timezone);
      setNotice("Publishing time zone saved. Future scheduled posts will use this time zone.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your publishing time zone.");
    } finally {
      setSaving(false);
    }
  }

  const currentTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date());

  return (
    <section className="settings-section-content publishing-settings-panel">
      <header className="settings-section-heading">
        <p className="eyebrow">PUBLISHING</p>
        <h2>Schedule and email settings</h2>
        <p>Set the time zone for scheduled posts and choose where post approval emails should be delivered.</p>
      </header>
      {error && <p className="theme-settings-message error" role="alert">{error}</p>}
      {notice && <p className="theme-settings-message success" role="status">{notice}</p>}
      <section className="publishing-timezone-card autopilot-settings-card" aria-labelledby="autopilot-settings-title">
        <div className="autopilot-settings-details">
          <strong id="autopilot-settings-title">Weekly Autopilot</strong>
          <p>Creates a brand-aware weekly batch and emails it for approval.</p>
          <div className="autopilot-settings-meta">
            <p><span>Connected channel</span><strong>{autopilot?.brand.connectedPlatforms.join(", ") || "None"}</strong></p>
            {autopilot?.brand.instagramAutopilotNextRunAt && <p><span>Next weekly batch</span><strong>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(autopilot.brand.instagramAutopilotNextRunAt))} ({timezone})</strong></p>}
          </div>
        </div>
        <label className="autopilot-settings-toggle">
          <input type="checkbox" checked={autopilot?.brand.instagramAutopilotEnabled ?? false} disabled={!autopilot || autopilotSaving || !autopilot.ready && !autopilot.brand.instagramAutopilotEnabled} onChange={(event) => void saveAutopilot(event.target.checked)} />
          <span>{autopilotSaving ? "Saving…" : autopilot?.brand.instagramAutopilotEnabled ? "On" : "Off"}</span>
        </label>
      </section>
      {autopilotError && <p className="theme-settings-message error" role="alert">{autopilotError}</p>}
      {autopilot && !autopilot.ready && <ul className="autopilot-settings-blockers">{autopilot.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
      <div className="publishing-timezone-card">
        <div>
          <strong>Brand publishing time zone</strong>
          <p>Choose the location your audience follows. This applies to newly scheduled posts and videos.</p>
        </div>
        <TimezonePicker value={timezone} onChange={(next) => {
          setTimezone(next);
          setNotice("");
        }} />
        <div className="publishing-time-preview">
          <span>Current time in this zone</span>
          <strong>{currentTime}</strong>
        </div>
        <button
          type="button"
          className="button button-gold"
          disabled={loading || saving || timezone === savedTimezone}
          onClick={() => void saveTimezone()}
        >
          {saving ? "Saving…" : "Save time zone"}
        </button>
      </div>
      <p className="settings-footnote">Changing the time zone does not change posts that are already scheduled.</p>
      <ApprovalEmailSettingsPanel />
    </section>
  );
}
