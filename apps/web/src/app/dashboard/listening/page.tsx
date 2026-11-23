import { Logo } from "@/components/logo";
import { ListeningClient } from "@/components/listening-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ListeningPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><ListeningClient /></WorkspaceShell>;
}
