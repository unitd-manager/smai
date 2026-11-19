import { Logo } from "@/components/logo";
import { SystemStatusClient } from "@/components/system-status-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function SystemStatusPage() {
  return (
    <WorkspaceShell logo={<Logo markOnly />}>
      <SystemStatusClient />
    </WorkspaceShell>
  );
}
