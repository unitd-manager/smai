import { Logo } from "@/components/logo";
import { ContentSetsClient } from "@/components/content-sets-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ContentSetsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><ContentSetsClient /></WorkspaceShell>;
}
