import { Logo } from "@/components/logo";
import { AnalyticsClient } from "@/components/analytics-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function AnalyticsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><AnalyticsClient /></WorkspaceShell>;
}
