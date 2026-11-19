"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";

type ApprovalEmail = {
  id: string;
  title: string | null;
  caption: string;
  designId: string | null;
  previewUrl: string | null;
  previewPages?: Array<{ index: number; url: string }>;
  videoPreviewUrl?: string | null;
  scheduledAt: string | null;
  timezone: string;
  brand: { name: string };
  targets: Array<{ platform: string }>;
};

type ApprovalBatchItem = Omit<ApprovalEmail, "id"> & { id: string };

export function ApprovalReviewClient() {
  const tokenRef = useRef("");
  const batchTokenRef = useRef("");
  const [approval, setApproval] = useState<ApprovalEmail | null>(null);
  const [approvals, setApprovals] = useState<ApprovalBatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState("");
  const [comment, setComment] = useState("");
  const [itemBusyId, setItemBusyId] = useState("");
  const [pageByApprovalId, setPageByApprovalId] = useState<Record<string, number>>({});
  const [commentByApprovalId, setCommentByApprovalId] = useState<Record<string, string>>({});

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    const batchValue = new URLSearchParams(window.location.search).get("batchToken") ?? "";
    tokenRef.current = value;
    batchTokenRef.current = batchValue;
    if (batchValue) {
      void apiRequest<{ approvals: ApprovalBatchItem[] }>(`/api/approval-email/batch/${encodeURIComponent(batchValue)}`)
        .then((response) => setApprovals(response.approvals))
        .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "This review link could not be opened."))
        .finally(() => setLoading(false));
      return;
    }
    if (!value) {
      window.setTimeout(() => {
        setError("This review link is missing its secure token.");
        setLoading(false);
      }, 0);
      return;
    }
    void apiRequest<{ approval: ApprovalEmail }>(`/api/approval-email/${encodeURIComponent(value)}`)
      .then((response) => setApproval(response.approval))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "This review link could not be opened."))
      .finally(() => setLoading(false));
  }, []);

  async function respond(status: "APPROVED" | "CHANGES_REQUESTED") {
    setBusy(true);
    setError("");
    try {
      const path = batchTokenRef.current
        ? `/api/approval-email/batch/${encodeURIComponent(batchTokenRef.current)}`
        : `/api/approval-email/${encodeURIComponent(tokenRef.current)}`;
      const response = await apiRequest<{ count?: number; queuedForInstagram?: number; draftOnly?: number }>(path, {
        method: "POST",
        body: JSON.stringify({ status, comment }),
      });
      setApproval(null);
      setApprovals([]);
      const count = response.count ?? 1;
      setComplete(status === "APPROVED"
        ? `${response.queuedForInstagram ?? count} Instagram ${response.queuedForInstagram === 1 ? "post was" : "posts were"} queued for the scheduled time.${response.draftOnly ? ` ${response.draftOnly} LinkedIn/Facebook ${response.draftOnly === 1 ? "draft remains" : "drafts remain"} saved for download because live publishing is not connected.` : ""}`
        : `Changes requested for ${count === 1 ? "the post" : `all ${count} posts`}. They will not publish until revised and approved.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Your response could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function respondToItem(item: ApprovalBatchItem, status: "APPROVED" | "CHANGES_REQUESTED") {
    setItemBusyId(item.id);
    setError("");
    try {
      const response = await apiRequest<{ queuedForInstagram?: number; draftOnly?: number }>(`/api/approval-email/batch/${encodeURIComponent(batchTokenRef.current)}/item/${encodeURIComponent(item.id)}`, {
        method: "POST",
        body: JSON.stringify({ status, comment: commentByApprovalId[item.id] ?? "" }),
      });
      setApprovals((current) => current.filter((approvalItem) => approvalItem.id !== item.id));
      setCommentByApprovalId((current) => { const next = { ...current }; delete next[item.id]; return next; });
      if (approvals.length === 1) setComplete(status === "APPROVED"
        ? response.draftOnly ? "Draft approved and saved. Live publishing is not connected for this channel, so download it from the library when ready." : "Post approved and queued for its scheduled time."
        : "Changes requested. This post will not publish until revised and approved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "This post decision could not be saved.");
    } finally {
      setItemBusyId("");
    }
  }

  return (
    <main className="approval-email-page">
      <article className="approval-email-card">
        <p className="eyebrow">PUBLISHING REVIEW</p>
        {loading ? <h1>Loading your review…</h1> : complete ? <><h1>Review recorded</h1><p>{complete}</p></> : error && !approval && approvals.length === 0 ? <><h1>Review link unavailable</h1><p>{error}</p></> : approvals.length > 0 ? <>
          <h1>Review this post batch</h1>
          <p>{approvals.length} scheduled {approvals.length === 1 ? "post is" : "posts are"} waiting for your decision. Approved Instagram posts queue for their scheduled times; LinkedIn and Facebook items stay downloadable drafts until those channels are connected.</p>
          <div className="approval-email-batch">
            {approvals.map((item) => (
              <article className="approval-email-batch-item" key={item.id}>
                <p className="approval-email-brand">{item.brand.name} · {item.targets.map((target) => target.platform).join(", ")}</p>
                {item.previewUrl && (item.previewPages?.length ?? 0) <= 1 && <Image className="approval-email-preview" src={item.previewUrl} alt={`Preview for ${item.title ?? "scheduled post"}`} width={420} height={560} unoptimized referrerPolicy="no-referrer" />}
                {(item.previewPages?.length ?? 0) > 1 && <div className="approval-email-carousel-controls"><button type="button" disabled={(pageByApprovalId[item.id] ?? 0) === 0} onClick={() => setPageByApprovalId((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] ?? 0) - 1) }))}>Previous</button><span>Page {(pageByApprovalId[item.id] ?? 0) + 1} of {item.previewPages!.length}</span><button type="button" disabled={(pageByApprovalId[item.id] ?? 0) >= item.previewPages!.length - 1} onClick={() => setPageByApprovalId((current) => ({ ...current, [item.id]: Math.min(item.previewPages!.length - 1, (current[item.id] ?? 0) + 1) }))}>Next</button></div>}
                {(item.previewPages?.length ?? 0) > 1 && <Image className="approval-email-preview" src={item.previewPages![pageByApprovalId[item.id] ?? 0]!.url} alt={`Page ${(pageByApprovalId[item.id] ?? 0) + 1} preview for ${item.title ?? "scheduled post"}`} width={420} height={560} unoptimized referrerPolicy="no-referrer" />}
                {item.videoPreviewUrl && <video className="approval-email-preview" controls playsInline preload="metadata" src={item.videoPreviewUrl} aria-label={`Video preview for ${item.title ?? "scheduled post"}`} />}
                <h2>{item.title ?? "Scheduled social post"}</h2>
                <p className="approval-email-caption">{item.caption}</p>
                {item.scheduledAt && <p className="approval-email-time">Scheduled {new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: item.timezone }).format(new Date(item.scheduledAt))} ({item.timezone})</p>}
                <label className="approval-email-comment">Review note<textarea rows={2} maxLength={1000} value={commentByApprovalId[item.id] ?? ""} onChange={(event) => setCommentByApprovalId((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Optional note for this post" /></label>
                <div className="approval-email-actions approval-email-item-actions"><button className="button button-primary" type="button" disabled={busy || Boolean(itemBusyId)} onClick={() => void respondToItem(item, "APPROVED")}>{itemBusyId === item.id ? "Saving…" : "Approve post"}</button><button className="button button-secondary" type="button" disabled={busy || Boolean(itemBusyId)} onClick={() => void respondToItem(item, "CHANGES_REQUESTED")}>Request changes</button></div>
              </article>
            ))}
          </div>
          <label className="approval-email-comment">Review note (optional)<textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a note if you request changes" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="approval-email-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => void respond("APPROVED")}>{busy ? "Saving…" : "Approve this batch"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void respond("CHANGES_REQUESTED")}>Request changes for this batch</button></div>
        </> : approval ? <>
          <h1>Review this post</h1>
          <p className="approval-email-brand">{approval.brand.name} · {approval.targets.map((target) => target.platform).join(", ")}</p>
          {approval.previewUrl && <Image className="approval-email-preview" src={approval.previewUrl} alt={`Preview for ${approval.title ?? "scheduled post"}`} width={420} height={560} unoptimized referrerPolicy="no-referrer" />}
          {approval.videoPreviewUrl && <video className="approval-email-preview" controls playsInline preload="metadata" src={approval.videoPreviewUrl} aria-label={`Video preview for ${approval.title ?? "scheduled post"}`} />}
          <h2>{approval.title ?? "Scheduled social post"}</h2>
          <p className="approval-email-caption">{approval.caption}</p>
          {approval.scheduledAt && <p className="approval-email-time">Scheduled {new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: approval.timezone }).format(new Date(approval.scheduledAt))} ({approval.timezone})</p>}
          <label className="approval-email-comment">Review note (optional)<textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a note if you request changes" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="approval-email-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => void respond("APPROVED")}>{busy ? "Saving…" : "Approve post"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void respond("CHANGES_REQUESTED")}>Request changes</button></div>
        </> : null}
      </article>
    </main>
  );
}
