import { ContentLibraryClient } from "@/components/content-library-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ContentPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><ContentLibraryClient /></WorkspaceShell>;
}
