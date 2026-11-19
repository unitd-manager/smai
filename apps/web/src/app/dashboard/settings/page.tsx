import { SettingsPageClient } from "@/components/settings-page-client";
import { Logo } from "@/components/logo";

export default function SettingsPage() {
  return <SettingsPageClient logo={<Logo markOnly />} />;
}
