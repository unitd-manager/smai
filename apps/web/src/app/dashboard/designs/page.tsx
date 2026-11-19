import { DesignsClient } from "@/components/designs-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function DesignsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><DesignsClient /></WorkspaceShell>;
}
