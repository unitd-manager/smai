import { VideoStudioClient } from "@/components/video-studio-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function VideosPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><VideoStudioClient /></WorkspaceShell>;
}
