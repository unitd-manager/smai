import { Logo } from "@/components/logo";
import { MediaLibraryClient } from "@/components/media-library-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function GalleryPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><MediaLibraryClient galleryMode /></WorkspaceShell>;
}
