import { redirect } from "next/navigation";

export default function ApprovalsPage() {
  redirect("/dashboard/posts?view=approvals");
}
