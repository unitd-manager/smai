"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PlatformIcon } from "@/components/platform-icon";
import { apiRequest, postsUpdatedEvent } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type Post = {
  id: string;
  title: string | null;
  caption: string;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  demoMode: boolean;
  brand: { name: string };
  targets: Array<{
    id: string;
    platform: string;
    status: string;
    platformPostId: string | null;
    publishedUrl: string | null;
    error: string | null;
    publishingMode: "live" | "demo";
  }>;
};

function canDeletePost(post: Post) {
  return post.status !== "PUBLISHING" &&
    !post.targets.some((target) => target.status === "PROCESSING");
}

const statuses = ["all", "draft", "scheduled", "publishing", "published", "failed", "needs_attention", "blocked", "cancelled"];

export function PostsQueueClient({ calendar = false }: { calendar?: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ brandId: "all" });
      const response = await apiRequest<{ posts: Post[] }>(`/api/posts?${query}`);
      setPosts(response.posts);
      setSelectedIds([]);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPosts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  useEffect(() => {
    const refreshPosts = () => void loadPosts();
    window.addEventListener(postsUpdatedEvent, refreshPosts);
    return () => window.removeEventListener(postsUpdatedEvent, refreshPosts);
  }, [loadPosts]);

  async function postAction(post: Post, action: "cancel" | "delete" | "retry" | "submit") {
    if (action === "cancel" && !window.confirm(`Cancel “${post.title ?? "this post"}”? It will remain in the queue as cancelled.`)) return;
    if (action === "delete" && !window.confirm(
      post.targets.some((target) => target.status === "PUBLISHED")
        ? `Remove “${post.title ?? "this post"}” from this app? This does not remove the already-published post from the social platform. This cannot be undone.`
        : `Permanently delete “${post.title ?? "this post"}” from this workspace? This cannot be undone.`,
    )) return;
    setBusyId(post.id);
    setError("");
    setNotice("");
    try {
      if (action === "cancel") {
        await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/cancel`, { method: "POST" });
        setNotice("The post was cancelled.");
      } else if (action === "delete") {
        const result = await apiRequest<{ publishedPostsRemainOnPlatforms?: boolean }>(
          `/api/posts/${encodeURIComponent(post.id)}`,
          { method: "DELETE" },
        );
        setNotice(result.publishedPostsRemainOnPlatforms
          ? "Post history removed from this app. The published post remains on the social platform; remove it there if you want it taken down."
          : "The post was permanently deleted from this workspace.");
      } else if (action === "retry") {
        await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/retry`, { method: "POST" });
        setNotice("The failed targets were queued for retry.");
      } else {
        await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/submit-for-approval`, { method: "POST" });
        setNotice("The post was sent to Post Approvals for review.");
      }
      await loadPosts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Could not ${action === "submit" ? "submit this post for approval" : action === "delete" ? "delete this post" : `${action} this post`}.`);
    } finally {
      setBusyId("");
    }
  }

  async function bulkAction(action: "cancel" | "retry" | "submit") {
    const chosen = posts.filter((post) => selectedIds.includes(post.id));
    const eligible = chosen.filter((post) => action === "submit"
      ? post.status === "DRAFT"
      : action === "cancel"
        ? ["DRAFT", "SCHEDULED", "FAILED"].includes(post.status)
        : post.targets.some((target) => target.status === "FAILED"));
    if (!eligible.length) return;
    const label = action === "submit" ? "submit for approval" : action === "retry" ? "retry failed targets" : "cancel";
    if (!window.confirm(`${label[0]!.toUpperCase()}${label.slice(1)} for ${eligible.length} selected ${eligible.length === 1 ? "post" : "posts"}?`)) return;
    setBusyId("bulk");
    setError("");
    setNotice("");
    const results = await Promise.allSettled(eligible.map((post) => apiRequest(
      action === "cancel"
        ? `/api/posts/${encodeURIComponent(post.id)}/cancel`
        : action === "retry"
          ? `/api/posts/${encodeURIComponent(post.id)}/retry`
          : `/api/posts/${encodeURIComponent(post.id)}/submit-for-approval`,
      { method: "POST" },
    )));
    const completed = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - completed;
    setNotice(`${completed} ${completed === 1 ? "post" : "posts"} ${action === "submit" ? "submitted for approval" : action === "retry" ? "queued for retry" : "cancelled"}${failed ? ` · ${failed} could not be updated` : ""}.`);
    setBusyId("");
    await loadPosts();
    const firstFailure = results.find((result) => result.status === "rejected");
    if (firstFailure?.status === "rejected") setError(firstFailure.reason instanceof Error ? firstFailure.reason.message : "Some selected posts could not be updated.");
  }

  const queryText = search.trim().toLocaleLowerCase();
  const visiblePosts = posts.filter((post) => {
    if (status !== "all" && post.status.toLowerCase() !== status) return false;
    if (queryText && ![post.title ?? "", post.caption, post.brand.name, ...post.targets.map((target) => target.platform)]
      .join(" ").toLocaleLowerCase().includes(queryText)) return false;
    if (fromDate || toDate) {
      if (!post.scheduledAt) return false;
      const dateParts = new Intl.DateTimeFormat("en", { timeZone: post.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(post.scheduledAt));
      const part = (type: "year" | "month" | "day") => dateParts.find((item) => item.type === type)?.value ?? "";
      const scheduledDay = `${part("year")}-${part("month")}-${part("day")}`;
      if (fromDate && scheduledDay < fromDate) return false;
      if (toDate && scheduledDay > toDate) return false;
    }
    return true;
  });
  const selectedPosts = visiblePosts.filter((post) => selectedIds.includes(post.id));
  const selectedDraftCount = selectedPosts.filter((post) => post.status === "DRAFT").length;
  const selectedCancelableCount = selectedPosts.filter((post) => ["DRAFT", "SCHEDULED", "FAILED"].includes(post.status)).length;
  const selectedFailedCount = selectedPosts.filter((post) => post.targets.some((target) => target.status === "FAILED")).length;
  const statusCounts = {
    all: posts.length,
    scheduled: posts.filter((post) => post.status === "SCHEDULED").length,
    draft: posts.filter((post) => post.status === "DRAFT").length,
    attention: posts.filter((post) => ["FAILED", "NEEDS_ATTENTION", "BLOCKED"].includes(post.status) || post.targets.some((target) => target.status === "FAILED")).length,
  };

  return (
    <section className="dashboard-content posts-page">
      <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
      <h1>{calendar ? "Calendar" : "Posts and Queue"}</h1>
      <p className="dashboard-lead">{calendar ? "Review scheduled content and publishing results for every brand." : "Track drafts, scheduled posts, and publishing results in one place."}</p>
      <div className="publishing-status-overview" aria-label="Post status totals">
        <div><span>All posts</span><strong>{statusCounts.all}</strong></div>
        <div><span>Scheduled</span><strong>{statusCounts.scheduled}</strong></div>
        <div><span>Drafts</span><strong>{statusCounts.draft}</strong></div>
        <div className={statusCounts.attention ? "has-attention" : ""}><span>Needs attention</span><strong>{statusCounts.attention}</strong></div>
      </div>
      <div className="posts-toolbar publishing-toolbar">
        <label className="publishing-search">Search posts<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedIds([]); }} placeholder="Title, caption, brand or platform" /></label>
        <label>Status<CompactSelect aria-label="Status filter" value={status} onChange={(event) => { setStatus(event.target.value); setSelectedIds([]); }}>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</CompactSelect></label>
        <label>From<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => { setFromDate(event.target.value); setSelectedIds([]); }} /></label>
        <label>To<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => { setToDate(event.target.value); setSelectedIds([]); }} /></label>
        <Link className="button button-gold" href="/dashboard/create">Create a post</Link>
        <span>{visiblePosts.length} of {posts.length} posts</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p role="status">Loading posts…</p> : posts.length === 0 ? (
        <article className="section-empty-state"><h2>No posts in this view yet.</h2><p>Create content, then publish it now or add it to the schedule.</p><Link className="button button-gold" href="/dashboard/create">Create content</Link></article>
      ) : (
        <>
        <div className="publishing-bulk-bar">
          <label><input type="checkbox" checked={visiblePosts.length > 0 && visiblePosts.every((post) => selectedIds.includes(post.id))} onChange={(event) => setSelectedIds(event.target.checked ? Array.from(new Set([...selectedIds, ...visiblePosts.map((post) => post.id)])) : selectedIds.filter((id) => !visiblePosts.some((post) => post.id === id)))} /> Select visible</label>
          <span>{selectedIds.length ? `${selectedIds.length} selected` : "Select posts to manage them together"}</span>
          {selectedDraftCount > 0 && <button type="button" disabled={busyId === "bulk"} onClick={() => void bulkAction("submit")}>Submit drafts ({selectedDraftCount})</button>}
          {selectedCancelableCount > 0 && <button type="button" disabled={busyId === "bulk"} onClick={() => void bulkAction("cancel")}>Cancel ({selectedCancelableCount})</button>}
          {selectedFailedCount > 0 && <button type="button" disabled={busyId === "bulk"} onClick={() => void bulkAction("retry")}>Retry failed ({selectedFailedCount})</button>}
        </div>
        {visiblePosts.length === 0 ? <article className="section-empty-state publishing-filter-empty"><h2>No posts match these filters</h2><p>Adjust the status, search, or scheduled date range.</p></article> : <div className="posts-list">
          {visiblePosts.map((post) => (
            <article className={`post-queue-card publishing-post-card publishing-post-${post.status.toLowerCase()}`} key={post.id}>
              <div className="post-queue-heading">
                <label className="publishing-post-select" aria-label={`Select ${post.title ?? "Untitled post"}`}><input type="checkbox" checked={selectedIds.includes(post.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, post.id] : current.filter((id) => id !== post.id))} /></label>
                <div className="post-queue-title">
                  <span className={`post-status post-status-${post.status.toLowerCase()}`}>{post.status.toLowerCase().replaceAll("_", " ")}</span>
                  <h2>{post.title ?? "Untitled post"}</h2>
                  <small>{post.brand.name}{post.scheduledAt ? ` · ${new Date(post.scheduledAt).toLocaleString(undefined, { timeZone: post.timezone })} (${post.timezone})` : ""}</small>
                </div>
                <span className={`demo-post-badge${post.demoMode ? "" : " post-live-badge"}`}>{post.demoMode ? "Demo publisher" : "Live publishing"}</span>
              </div>
              <div className="publishing-post-preview"><span>Post copy</span><p>{post.caption || "No caption added"}</p>{post.caption.length > 240 && <details className="post-caption-details"><summary>Read full caption</summary><p>{post.caption}</p></details>}</div>
              <div className="post-target-list">
                {post.targets.map((target) => (
                  <div className={`publishing-target-card publishing-target-${target.status.toLowerCase()}`} key={target.id}>
                    <strong className="post-target-platform"><PlatformIcon platform={target.platform} />{target.platform}</strong>
                    <span className={target.status === "DELETED_ON_PLATFORM" ? "post-target-deleted" : undefined}>
                      {target.status === "DELETED_ON_PLATFORM" ? "Deleted on Instagram" : target.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                    {target.publishingMode === "demo" && target.platformPostId && <small>Demo ID: {target.platformPostId}</small>}
                    {target.publishedUrl && <a href={target.publishedUrl} target="_blank" rel="noreferrer">View post</a>}
                    {target.error && <small className={target.status === "DELETED_ON_PLATFORM" ? "post-target-deleted-note" : "form-error"}>{target.error}</small>}
                  </div>
                ))}
                {post.targets.length === 0 && <p className="publishing-no-targets">No social destinations are attached to this post.</p>}
              </div>
              <div className="post-queue-actions">
                {post.status === "DRAFT" && <button type="button" disabled={busyId === post.id} onClick={() => void postAction(post, "submit")}>Submit for approval</button>}
                {["DRAFT", "SCHEDULED", "FAILED"].includes(post.status) && <button type="button" disabled={busyId === post.id} onClick={() => void postAction(post, "cancel")}>Cancel</button>}
                {post.targets.some((target) => target.status === "FAILED") && <button type="button" disabled={busyId === post.id} onClick={() => void postAction(post, "retry")}>Retry failed</button>}
                {canDeletePost(post) && <button type="button" className="post-delete-action" disabled={busyId === post.id} onClick={() => void postAction(post, "delete")}>Delete post</button>}
              </div>
            </article>
          ))}
        </div>}
        </>
      )}
      <p className="demo-banner" role="note">Targets marked “Demo publisher” have simulated statuses and IDs and are not sent to social platforms. Instagram targets marked “Live publishing” are sent through the connected Instagram account. While the app is open, it checks Instagram every five minutes for removed posts; deleted Instagram targets are marked here while other channels and local history are kept.</p>
    </section>
  );
}
