import { Logo } from "@/components/logo";
import { CalendarClient } from "@/components/calendar-client";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function CalendarPage() {
  return <WorkspaceShell logo={<Logo markOnly />}><CalendarClient /></WorkspaceShell>;
}
