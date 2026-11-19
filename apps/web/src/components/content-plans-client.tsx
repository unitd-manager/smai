"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { generateFirstWeekPlan } from "@/lib/first-week-plan";

type Plan = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
  planJson: {
    goal?: string;
    audience?: string;
    platforms?: string[];
    items?: Array<{ contentId: string; scheduledAt?: string; format: string; platforms: string[] }>;
  };
};

export function ContentPlansClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatingFirstWeek, setGeneratingFirstWeek] = useState(false);
  const [openMenuPlanId, setOpenMenuPlanId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ plans: Plan[] }>("/api/content-plans")
      .then(({ plans: loadedPlans }) => {
        if (active) setPlans(loadedPlans);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load content plans.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!openMenuPlanId) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest(`[data-plan-menu-id="${openMenuPlanId}"]`)) {
        setOpenMenuPlanId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuPlanId(null);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuPlanId]);

  async function updateStatus(plan: Plan, status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED") {
    setSavingId(plan.id);
    setError("");
    try {
      const response = await apiRequest<{ plan: Plan }>(`/api/content-plans/${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setPlans((current) => current.map((item) => item.id === plan.id ? response.plan : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update this plan.");
    } finally {
      setSavingId("");
    }
  }

  async function duplicatePlan(plan: Plan) {
    setSavingId(plan.id);
    setError("");
    try {
      const response = await apiRequest<{ plan: Plan }>(`/api/content-plans/${encodeURIComponent(plan.id)}/duplicate`, { method: "POST" });
      setPlans((current) => [response.plan, ...current]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not duplicate this plan.");
    } finally {
      setSavingId("");
    }
  }

  async function executePlan(plan: Plan, mode: "approval" | "autonomous") {
    setSavingId(plan.id);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ created: number }>(`/api/content-plans/${encodeURIComponent(plan.id)}/execute`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, status: mode === "approval" ? "IN_REVIEW" : "SCHEDULED" } : item));
      setNotice(mode === "approval"
        ? `${response.created} posts sent to the approval queue. Review them in Post Approvals before scheduling.`
        : `${response.created} posts added to the live Instagram publishing queue.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not execute this plan.");
    } finally {
      setSavingId("");
    }
  }

  async function createFirstWeek() {
    setGeneratingFirstWeek(true);
    setError("");
    setNotice("");
    try {
      const response = await generateFirstWeekPlan();
      setPlans((current) => [response.plan, ...current]);
      setNotice(`${response.scheduledPosts} posts have been added to the calendar in your brand time zone. Each post waits for approval before it can publish. Configure SMTP or Resend in apps/api/.env for approval email delivery.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate the first week of content.");
    } finally {
      setGeneratingFirstWeek(false);
    }
  }

  function exportPlan(plan: Plan) {
    const file = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "content-plan"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="dashboard-content content-plans-page">
      <p className="eyebrow">YOUR STUDIO · STRATEGY</p>
      <h1>Content plans</h1>
      <p className="dashboard-lead">Content is the individual post, caption, and design. A plan groups those posts with dates and approval status. Create coordinated batches in Campaigns, then manage each post in Posts and Queue.</p>
      <div className="content-plan-toolbar">
        <Link className="button button-gold" href="/dashboard/campaigns">Build a campaign</Link>
        <Link href="/dashboard/posts">Open posts and queue</Link>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p className="loading-label">Loading content plans…</p> : plans.length === 0 ? (
        <div className="empty-state content-plans-empty"><span className="content-plans-empty-icon" aria-hidden="true">🗓️</span><span className="card-kicker">YOUR WORKSPACE PLAN</span><h2>Your content calendar starts here</h2><p>Create a week of brand-aware drafts with suggested publishing times, then review and schedule them from your plan.</p><div className="content-plans-empty-actions"><button type="button" className="button button-primary" onClick={() => void createFirstWeek()} disabled={generatingFirstWeek}>{generatingFirstWeek ? "Creating your first week…" : "Generate my first week"}</button></div></div>
      ) : (
        <div className="content-plan-grid">
          {plans.map((plan) => (
            <article className={`content-plan-card${openMenuPlanId === plan.id ? " is-menu-open" : ""}`} key={plan.id}>
              <header className="content-plan-card-header">
                <div className="content-plan-card-title"><span>{plan.status === "SCHEDULED" ? "scheduled" : plan.status === "IN_REVIEW" ? "sent for approval" : plan.status.toLowerCase()}</span><h2>{plan.name}</h2></div>
                <div className="content-plan-actions-menu" data-plan-menu-id={plan.id}>
                  <button type="button" className="content-plan-actions-trigger" aria-label={`Actions for ${plan.name}`} aria-expanded={openMenuPlanId === plan.id} aria-controls={openMenuPlanId === plan.id ? `content-plan-actions-${plan.id}` : undefined} onClick={() => setOpenMenuPlanId((current) => current === plan.id ? null : plan.id)}><MoreHorizontal size={20} /></button>
                  {openMenuPlanId === plan.id && <div className="content-plan-actions-popover" id={`content-plan-actions-${plan.id}`} role="group" aria-label="Content plan actions">
                    <Link href="/dashboard/content" onClick={() => setOpenMenuPlanId(null)}>Review drafts</Link>
                    {plan.status !== "SCHEDULED" && plan.status !== "IN_REVIEW" && <label className="content-plan-actions-status">Status
                      <select value={plan.status} disabled={savingId === plan.id} onChange={(event) => { setOpenMenuPlanId(null); void updateStatus(plan, event.target.value as "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"); }}>
                        <option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option>
                      </select>
                    </label>}
                    {plan.status !== "SCHEDULED" && plan.status !== "IN_REVIEW" && plan.status !== "PAUSED" && plan.status !== "ARCHIVED" && <>
                      <button type="button" disabled={savingId === plan.id} onClick={() => { setOpenMenuPlanId(null); void executePlan(plan, "approval"); }}>Send to approvals</button>
                      <button type="button" disabled={savingId === plan.id} onClick={() => { setOpenMenuPlanId(null); void executePlan(plan, "autonomous"); }}>Schedule live Instagram</button>
                    </>}
                    <button type="button" disabled={savingId === plan.id} onClick={() => { setOpenMenuPlanId(null); void duplicatePlan(plan); }}>Duplicate</button>
                    <button type="button" onClick={() => { setOpenMenuPlanId(null); exportPlan(plan); }}>Export JSON</button>
                  </div>}
                </div>
              </header>
              <small className="content-plan-dates">{new Date(plan.startsAt).toLocaleDateString()} – {new Date(plan.endsAt).toLocaleDateString()}</small>
              <strong>{plan.planJson.items?.length ?? 0} linked {(plan.planJson.items?.length ?? 0) === 1 ? "draft" : "drafts"}</strong>
              <details className="content-plan-details">
                <summary>View campaign brief and daily schedule</summary>
                <p>{plan.planJson.goal ?? "Campaign goal not available."}</p>
                {plan.planJson.audience && <small>Audience: {plan.planJson.audience}</small>}
                <div className="created-platforms">{(plan.planJson.platforms ?? []).map((platform) => <span key={platform}>{platform}</span>)}</div>
                <ol>{(plan.planJson.items ?? []).map((item) => <li key={`${item.contentId}-${item.format}`}>{item.format} · {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : "date not set"}</li>)}</ol>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
