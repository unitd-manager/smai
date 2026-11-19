import { Logo } from "@/components/logo";
import { MediaLibraryClient } from "@/components/media-library-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ImportFilesPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><MediaLibraryClient importMode /></WorkspaceShell>;
}
