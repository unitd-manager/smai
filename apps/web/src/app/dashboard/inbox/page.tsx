import { InboxClient } from "@/components/inbox-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function InboxPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><InboxClient /></WorkspaceShell>;
}
