import { DashboardClient } from "@/components/dashboard-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function DashboardPage() {
  return (
    <WorkspaceShell logo={<Logo markOnly />}>
      <DashboardClient />
    </WorkspaceShell>
  );
}
