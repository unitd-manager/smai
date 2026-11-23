import { Logo } from "@/components/logo";
import { AgencyWorkspacesClient } from "@/components/agency-workspaces-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function AgencyPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><AgencyWorkspacesClient /></WorkspaceShell>;
}
