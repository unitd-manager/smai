import { ApprovalsClient } from "@/components/approvals-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ApprovalsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><ApprovalsClient /></WorkspaceShell>;
}
