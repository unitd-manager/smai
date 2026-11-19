import { Logo } from "@/components/logo";
import { TemplatesClient } from "@/components/templates-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function TemplatesPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><TemplatesClient /></WorkspaceShell>;
}
