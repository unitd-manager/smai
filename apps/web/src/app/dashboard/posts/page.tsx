import { Logo } from "@/components/logo";
import { PostsQueueClient } from "@/components/posts-queue-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function PostsPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><PostsQueueClient /></WorkspaceShell>;
}
