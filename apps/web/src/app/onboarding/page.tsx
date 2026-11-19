import { OnboardingClient } from "@/components/onboarding-client";
import { Logo } from "@/components/logo";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function OnboardingPage() {
  return (
    <WorkspaceShell logo={<Logo markOnly />}>
      <OnboardingClient />
    </WorkspaceShell>
  );
}
