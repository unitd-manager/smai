import { Logo } from "@/components/logo";
import { CampaignsClient } from "@/components/campaigns-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function CampaignsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><CampaignsClient /></WorkspaceShell>;
}
