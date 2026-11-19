import { SettingsPageClient } from "@/components/settings-page-client";
import { Logo } from "@/components/logo";
import { notFound } from "next/navigation";

const sections = ["publishing", "appearance", "account"];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <SettingsPageClient section={section} logo={<Logo markOnly />} />;
}
