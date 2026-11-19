import { TeamClient } from "@/components/team-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";
import "./team-page.css";

export default function TeamPage() {
  return (
    <WorkspaceShell logo={<Logo markOnly />}>
      <TeamClient />
    </WorkspaceShell>
  );
}
