import { Logo } from "@/components/logo";
import { CompetitorIntelligenceClient } from "@/components/competitor-intelligence-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function CompetitorsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><CompetitorIntelligenceClient /></WorkspaceShell>;
}
