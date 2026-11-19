import { Suspense } from "react";
import { AppSectionPage } from "@/components/workspace-shell";
import { appNavItems } from "@/config/navigation";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export function generateStaticParams() {
  return appNavItems
    .filter((item) =>
      item.href.startsWith("/dashboard/") &&
      ![
        "/dashboard/create",
        "/dashboard/content-plans",
        "/dashboard/campaigns",
        "/dashboard/content",
        "/dashboard/content-sets",
        "/dashboard/designs",
        "/dashboard/templates",
        "/dashboard/posts",
        "/dashboard/analytics",
        "/dashboard/calendar",
        "/dashboard/social-accounts",
        "/dashboard/approvals",
        "/dashboard/import-files",
        "/dashboard/gallery",
        "/dashboard/media-library",
        "/dashboard/videos",
        "/dashboard/team",
        "/dashboard/settings",
        "/dashboard/system-status",
        "/dashboard/marketing-brain",
      ].includes(item.href),
    )
    .map((item) => ({ section: item.href.slice("/dashboard/".length) }));
}

export default function DashboardSectionPage() {
  return (
    <Suspense fallback={<section className="dashboard-content"><p className="loading-label">Opening your workspace…</p></section>}>
      <WorkspaceShell logo={<Logo markOnly />}><AppSectionPage /></WorkspaceShell>
    </Suspense>
  );
}
