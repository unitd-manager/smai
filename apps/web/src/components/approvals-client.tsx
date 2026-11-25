"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type Approval = {
  id: string;
  status: string;
  comment: string | null;
  createdAt: string;
  post: {
    id: string;
    title: string | null;
    caption: string;
    status: string;
    scheduledAt: string | null;
    timezone: string;
    brand: { name: string };
    targets: Array<{ id: string; platform: string; status: string }>;
  };
};

const reviewFilters = ["pending", "all", "approved", "changes_requested"] as const;

export function ApprovalsClient() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<(typeof reviewFilters)[number]>("pending");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadApprovals = useCallback(async (status: typeof filter) => {
    setLoading(true);
    try {
      const response = await apiRequest<{ approvals: Approval[] }>(`/api/posts/approvals?status=${status}&brandId=all`);
      setApprovals(response.approvals);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load approval requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadApprovals(filter), 0);
    return () => window.clearTimeout(timer);
  }, [filter, loadApprovals]);

  async function review(approval: Approval, status: "APPROVED" | "CHANGES_REQUESTED") {
    setBusyId(approval.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/posts/approvals/${encodeURIComponent(approval.id)}/review`, {
        method: "POST",
        body: JSON.stringify({ status, comment: comments[approval.id] ?? "" }),
      });
      setNotice(status === "APPROVED" ? "Post approved. It has not been published." : "Changes requested. The post remains a draft.");
      await loadApprovals(filter);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not review this post.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="dashboard-content approvals-page">
      <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
      <h1>Post Approvals</h1>
      <p className="dashboard-lead">Review posts, approve them, or request changes.</p>
      <div className="posts-toolbar approvals-toolbar">
        <label>Review status
          <CompactSelect aria-label="Review status" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            {reviewFilters.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </CompactSelect>
        </label>
        <Link className="button button-outline" href="/dashboard/posts">Open posts and queue</Link>
        <span>{approvals.length} requests</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p className="loading-label" role="status">Loading approval requests…</p> : approvals.length === 0 ? (
        <article className="section-empty-state">
          <h2>{filter === "pending" ? "No posts are waiting for approval" : "No approval requests in this view"}</h2>
          <p>Submit a draft from Posts and Queue when it is ready for review.</p>
          <Link className="button button-gold" href="/dashboard/posts">Review posts and queue</Link>
        </article>
      ) : (
        <div className="posts-list">
          {approvals.map((approval) => (
            <article className="post-queue-card approval-card" key={approval.id}>
              <div className="post-queue-heading">
                <div>
                  <span className={`post-status post-status-${approval.status.toLowerCase()}`}>{approval.status.replaceAll("_", " ").toLowerCase()}</span>
                  <h2>{approval.post.title ?? "Untitled post"}</h2>
                  <small>{approval.post.brand.name} · Submitted {new Date(approval.createdAt).toLocaleString()}</small>
                </div>
                <span className="demo-post-badge">Post: {approval.post.status.toLowerCase()}</span>
              </div>
              <p>{approval.post.caption}</p>
              <div className="created-platforms">{approval.post.targets.map((target) => <span key={target.id}>{target.platform}</span>)}</div>
              {approval.post.scheduledAt && <p className="approval-schedule">Scheduled for {new Date(approval.post.scheduledAt).toLocaleString(undefined, { timeZone: approval.post.timezone })} ({approval.post.timezone})</p>}
              {approval.comment && <p className="approval-existing-comment"><strong>Previous review:</strong> {approval.comment}</p>}
              {approval.status === "PENDING" && (
                <>
                  <label className="approval-comment">Review note
                    <textarea rows={2} value={comments[approval.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [approval.id]: event.target.value }))} placeholder="Optional feedback for the content owner" />
                  </label>
                  <div className="post-queue-actions">
                    <button type="button" disabled={busyId === approval.id} onClick={() => void review(approval, "APPROVED")}>Approve draft</button>
                    <button type="button" disabled={busyId === approval.id} onClick={() => void review(approval, "CHANGES_REQUESTED")}>Request changes</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="demo-banner" role="note">Approval records track review decisions only. Approving a draft does not publish or schedule it.</p>
    </section>
  );
}
