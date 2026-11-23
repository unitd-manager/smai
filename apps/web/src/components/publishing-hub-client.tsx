"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { PostsQueueClient } from "@/components/posts-queue-client";
import { ApprovalsClient } from "@/components/approvals-client";

export function PublishingHubClient() {
  const [view, setView] = useState<"queue" | "approvals">("queue");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "approvals") setView("approvals");
  }, []);

  return (
    <section className="dashboard-content publishing-hub">
      <header className="publishing-hub-heading">
        <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
        <h1>Publishing</h1>
        <p className="dashboard-lead">Manage drafts, scheduled posts, publishing results, and team reviews in one place.</p>
      </header>
      <nav className="publishing-hub-tabs" aria-label="Publishing views">
        <button type="button" aria-pressed={view === "queue"} className={view === "queue" ? "is-active" : ""} onClick={() => setView("queue")}><Send size={16} /> Posts &amp; schedule</button>
        <button type="button" aria-pressed={view === "approvals"} className={view === "approvals" ? "is-active" : ""} onClick={() => setView("approvals")}><CheckCircle2 size={16} /> Team approvals</button>
      </nav>
      <div className="publishing-hub-content" key={view}>
        {view === "queue" ? <PostsQueueClient /> : <ApprovalsClient />}
      </div>
    </section>
  );
}
