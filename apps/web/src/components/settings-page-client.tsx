"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, Building2, CalendarClock, KeyRound, Palette, Settings2, UsersRound } from "lucide-react";
import { AccountSettingsPanel } from "@/components/account-settings-panel";
import { PublishingSettingsPanel } from "@/components/publishing-settings-panel";
import { ThemeSettingsPanel } from "@/components/theme-settings-panel";
import { WorkspaceShell } from "@/components/workspace-shell";

const settingsSections = [
  { id: "general", label: "General", description: "Workspace details and brand profile", href: "/dashboard/settings", icon: Settings2 },
  { id: "publishing", label: "Publishing", description: "Schedule and approval email", href: "/dashboard/settings/publishing", icon: CalendarClock },
  { id: "appearance", label: "Appearance", description: "Color, layout and typography", href: "/dashboard/settings/appearance", icon: Palette },
  { id: "account", label: "Account", description: "Your details and sign-in security", href: "/dashboard/settings/account", icon: KeyRound },
] as const;

function SettingsOverview() {
  return (
    <div className="settings-overview">
      <div className="settings-overview-intro">
        <span className="settings-overview-icon"><Building2 size={20} aria-hidden="true" /></span>
        <div>
          <h2>Make this workspace yours</h2>
          <p>Manage your brand foundation, publishing schedule, appearance, and account from one place.</p>
        </div>
      </div>
      <div className="settings-overview-grid">
        {settingsSections.slice(1).map((section) => (
          <Link className="settings-overview-card" href={section.href} key={section.id}>
            <span className="settings-overview-card-icon"><section.icon size={19} aria-hidden="true" /></span>
            <span><strong>{section.label}</strong><small>{section.description}</small></span>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ))}
        <Link className="settings-overview-card" href="/onboarding">
          <span className="settings-overview-card-icon"><Building2 size={19} aria-hidden="true" /></span>
          <span><strong>Brand profile</strong><small>Update your audience, voice, palette, and logo</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <Link className="settings-overview-card" href="/dashboard/team">
          <span className="settings-overview-card-icon"><UsersRound size={19} aria-hidden="true" /></span>
          <span><strong>Team and access</strong><small>Invite teammates and manage workspace roles</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
      <p className="settings-footnote">Choose an approval email recipient and configure the delivery account under Publishing.</p>
    </div>
  );
}

export function SettingsPageClient({ section = "general", logo }: { section?: string; logo: ReactNode }) {
  const pathname = usePathname();
  const activeSection = settingsSections.find((item) => item.id === section) ?? settingsSections[0];

  return (
    <WorkspaceShell logo={logo}>
      <section className="dashboard-content settings-page">
        <header className="settings-page-heading">
          <div>
            <p className="eyebrow">WORKSPACE PREFERENCES</p>
            <h1>Settings</h1>
            <p className="dashboard-lead">The controls you need to run your workspace, organized in one place.</p>
          </div>
        </header>
        <div className="settings-layout">
          <nav className="settings-navigation" aria-label="Settings sections">
            <p>Settings</p>
            {settingsSections.map((item) => {
              const active = activeSection.id === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`settings-navigation-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (pathname === item.href) window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <item.icon size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </Link>
              );
            })}
          </nav>
          <div className="settings-main-content" key={activeSection.id}>
            {activeSection.id === "general" && <SettingsOverview />}
            {activeSection.id === "publishing" && <PublishingSettingsPanel />}
            {activeSection.id === "appearance" && <ThemeSettingsPanel />}
            {activeSection.id === "account" && <AccountSettingsPanel />}
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
