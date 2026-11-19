import { Logo } from "@/components/logo";
import { ContentPlansClient } from "@/components/content-plans-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ContentPlansPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><ContentPlansClient /></WorkspaceShell>;
}
