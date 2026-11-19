import { Logo } from "@/components/logo";
import { MarketingBrainClient } from "@/components/marketing-brain-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function MarketingBrainPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><MarketingBrainClient /></WorkspaceShell>;
}
