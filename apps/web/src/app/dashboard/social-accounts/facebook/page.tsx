import { Logo } from "@/components/logo";
import { SocialAccountsClient } from "@/components/social-accounts-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function FacebookPagesPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><SocialAccountsClient detailPlatform="Facebook Pages" /></WorkspaceShell>;
}
