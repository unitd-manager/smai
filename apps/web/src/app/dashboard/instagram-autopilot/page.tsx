import { Logo } from "@/components/logo";
import { InstagramAutopilotClient } from "@/components/instagram-autopilot-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function InstagramAutopilotPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><InstagramAutopilotClient /></WorkspaceShell>;
}
