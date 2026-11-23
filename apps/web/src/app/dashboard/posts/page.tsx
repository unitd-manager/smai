import { Logo } from "@/components/logo";
import { PublishingHubClient } from "@/components/publishing-hub-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function PostsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><PublishingHubClient /></WorkspaceShell>;
}
