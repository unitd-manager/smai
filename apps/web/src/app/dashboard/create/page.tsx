import { CreateClient } from "@/components/create-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function CreatePage() {
  return <WorkspaceShell logo={<Logo markOnly />}><CreateClient /></WorkspaceShell>;
}
