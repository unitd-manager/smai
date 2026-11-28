"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon, MoreHorizontal, Play, X } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { apiRequest, postsUpdatedEvent } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type Post = {
  id: string;
  title: string | null;
  caption: string;
  hashtags: string[] | null;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  demoMode: boolean;
  designPreviewUrl: string | null;
  brand: { name: string };
  targets: Array<{
    id: string;
    platform: string;
    status: string;
    platformPostId: string | null;
    publishedUrl: string | null;
    publishedAt: string | null;
    error: string | null;
    publishingMode: "live" | "demo";
    account: { displayName: string; provider: string } | null;
    media: Array<{ type: "image" | "video"; url: string; index: number }>;
  }>;
};

type PostMedia = { type: "image" | "video"; url: string; index: number };

function getPostMedia(post: Post): PostMedia[] {
  const seen = new Set<string>();
  const media = post.targets.flatMap((target) => target.media ?? []).filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  if (media.length) return media;
  return post.designPreviewUrl ? [{ type: "image", url: post.designPreviewUrl, index: 0 }] : [];
}

function formatSchedule(post: Post, options: Intl.DateTimeFormatOptions) {
  if (!post.scheduledAt) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: post.timezone }).format(new Date(post.scheduledAt));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(post.scheduledAt));
  }
}

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
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);


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

  useEffect(() => {
    if (!detailPostId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailPostId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailPostId]);

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
  const detailPost = detailPostId ? posts.find((post) => post.id === detailPostId) ?? null : null;
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
        {visiblePosts.length === 0 ? <article className="section-empty-state publishing-filter-empty"><h2>No posts match these filters</h2><p>Adjust the status, search, or scheduled date range.</p></article> : <div className="posts-list publishing-visual-grid">
          {visiblePosts.map((post) => (
            <article className={`post-queue-card publishing-post-card publishing-post-${post.status.toLowerCase()}`} key={post.id}>
              <label className="publishing-post-select" aria-label={`Select ${post.title ?? "Untitled post"}`}><input type="checkbox" checked={selectedIds.includes(post.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, post.id] : current.filter((id) => id !== post.id))} /></label>
              <button className="publishing-post-open" type="button" onClick={() => { setDetailMenuOpen(false); setDetailPostId(post.id); }} aria-label={`View details for ${post.title ?? "Untitled post"}`}>
                <span className="publishing-post-thumb">
                  {(() => {
                    const media = getPostMedia(post)[0];
                    if (!media) return <span className="publishing-post-no-media"><ImageIcon size={22} aria-hidden="true" /><small>No media</small></span>;
                    return <>
                      {media.type === "video"
                        ? <video src={media.url} muted playsInline preload="metadata" aria-label={`${post.title ?? "Post"} video preview`} />
                        : <Image src={media.url} width={240} height={160} unoptimized alt={`${post.title ?? "Post"} preview`} />}
                      {media.type === "video" && <span className="publishing-video-play"><Play size={16} fill="currentColor" aria-hidden="true" /></span>}
                      {getPostMedia(post).length > 1 && <span className="publishing-media-count">+{getPostMedia(post).length - 1}</span>}
                    </>;
                  })()}
                </span>
                <span className="publishing-post-summary"><strong className="publishing-post-title">{post.title ?? "Untitled post"}</strong></span>
              </button>
            </article>
          ))}
        </div>}
        </>
      )}
      {detailPost && <div className="design-lightbox-backdrop media-post-preview-backdrop publishing-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailPostId(null); }}>
        <button type="button" className="media-post-preview-close" aria-label="Close post details" onClick={() => setDetailPostId(null)}><X size={24} /></button>
        <section className="media-post-preview-dialog media-design-preview-dialog publishing-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="publishing-detail-title">
          <div className="media-post-preview-media media-design-preview-media publishing-detail-preview">
              {getPostMedia(detailPost).length ? getPostMedia(detailPost).map((media, index) => <div className="publishing-detail-media-item" key={`${media.url}-${index}`}>
                {media.type === "video"
                  ? <video src={media.url} controls playsInline preload="metadata" aria-label={`${detailPost.title ?? "Post"} video ${index + 1}`} />
                  : <Image src={media.url} width={720} height={540} unoptimized alt={`${detailPost.title ?? "Post"} media ${index + 1}`} />}
                {getPostMedia(detailPost).length > 1 && <span>Media {index + 1} of {getPostMedia(detailPost).length}</span>}
              </div>) : <div className="publishing-detail-no-media"><ImageIcon size={28} aria-hidden="true" /><span>No media attached to this post</span></div>}
          </div>
          <aside className="media-post-preview-panel publishing-detail-information">
            <header className="media-post-preview-header publishing-detail-header">
              <span className="media-post-preview-avatar" aria-hidden="true">{detailPost.brand.name.trim().charAt(0).toUpperCase()}</span>
              <div className="media-post-preview-identity"><h2 id="publishing-detail-title">{detailPost.brand.name}</h2><p>Post details · {detailPost.status.toLowerCase().replaceAll("_", " ")}</p></div>
              <div className="media-post-preview-menu-wrap publishing-detail-menu-wrap">
                <button type="button" className="media-post-preview-menu-trigger" aria-label="Post actions" aria-expanded={detailMenuOpen} onClick={() => setDetailMenuOpen((open) => !open)}><MoreHorizontal size={22} /></button>
                {detailMenuOpen && <div className="media-post-preview-menu" role="menu" aria-label="Post actions" onClick={(event) => { if (event.target instanceof Element && event.target.closest('[role="menuitem"]')) setDetailMenuOpen(false); }}>
                  <strong>Post actions</strong>
                  {detailPost.status === "DRAFT" && <button type="button" role="menuitem" disabled={busyId === detailPost.id} onClick={() => void postAction(detailPost, "submit")}>Submit for approval</button>}
                  {["DRAFT", "SCHEDULED", "FAILED"].includes(detailPost.status) && <button type="button" role="menuitem" disabled={busyId === detailPost.id} onClick={() => void postAction(detailPost, "cancel")}>Cancel post</button>}
                  {detailPost.targets.some((target) => target.status === "FAILED") && <button type="button" role="menuitem" disabled={busyId === detailPost.id} onClick={() => void postAction(detailPost, "retry")}>Retry failed targets</button>}
                  {canDeletePost(detailPost) && <button type="button" role="menuitem" disabled={busyId === detailPost.id} onClick={() => void postAction(detailPost, "delete")}>Delete post</button>}
                </div>}
              </div>
            </header>
            <div className="publishing-detail-content">
              <section className="publishing-detail-overview">
                <p><strong>{detailPost.brand.name}</strong> {detailPost.title ?? "Untitled post"}</p>
                <p>{formatSchedule(detailPost, { dateStyle: "short" }) ?? "Not scheduled"} · {formatSchedule(detailPost, { timeStyle: "short" }) ?? "No time set"} · {detailPost.timezone}</p>
                <p className="publishing-detail-platform-line">{detailPost.targets.length ? detailPost.targets.map((target) => <span key={target.id}><PlatformIcon platform={target.platform} /> {target.platform}</span>) : "No platform selected"}</p>
              </section>
              <section className="publishing-detail-section">
                <h3>Caption</h3>
                <p className="publishing-detail-copy">{detailPost.caption || "No caption added"}{detailPost.hashtags?.length ? `\n\n${detailPost.hashtags.join(" ")}` : ""}</p>
              </section>
              <details className="publishing-detail-disclosure"><summary>Schedule and post details</summary><div className="publishing-detail-inline-facts">
                <p><span>Status</span><strong>{detailPost.status.toLowerCase().replaceAll("_", " ")}</strong></p>
                <p><span>Date</span><strong>{formatSchedule(detailPost, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) ?? "Not scheduled"}</strong></p>
                <p><span>Time</span><strong>{formatSchedule(detailPost, { hour: "numeric", minute: "2-digit" }) ?? "Not scheduled"}</strong></p>
                <p><span>Timezone</span><strong>{detailPost.timezone}</strong></p>
                <p><span>Post reference</span><strong>{detailPost.id}</strong></p>
              </div></details>
              <details className="publishing-detail-disclosure"><summary>Publishing destinations · {detailPost.targets.length}</summary><div className="publishing-detail-targets">
                {detailPost.targets.map((target) => <article className="publishing-detail-target" key={target.id}>
                  <div className="publishing-detail-target-heading"><strong><PlatformIcon platform={target.platform} />{target.platform}</strong><span className={`post-status post-status-${target.status.toLowerCase()}`}>{target.status === "DELETED_ON_PLATFORM" ? "Deleted on platform" : target.status.toLowerCase().replaceAll("_", " ")}</span></div>
                  <p>{target.account?.displayName ?? "Account not recorded"}</p>
                  {target.platformPostId && <small>Post ID: {target.platformPostId}</small>}
                  {target.publishedAt && <small>Published {formatSchedule({ ...detailPost, scheduledAt: target.publishedAt }, { dateStyle: "medium", timeStyle: "short" })} ({detailPost.timezone})</small>}
                  {target.publishedUrl && <a href={target.publishedUrl} target="_blank" rel="noreferrer">View published post</a>}
                  {target.error && <p className="publishing-detail-error">{target.error}</p>}
                </article>)}
                {!detailPost.targets.length && <p className="publishing-no-targets">No social destinations are attached to this post.</p>}
              </div></details>
            </div>
            <footer className="media-post-preview-footer publishing-detail-footer"><span className={`post-status post-status-${detailPost.status.toLowerCase()}`}>{detailPost.status.toLowerCase().replaceAll("_", " ")}</span><span>{detailPost.scheduledAt ? `${formatSchedule(detailPost, { month: "short", day: "numeric", year: "numeric" })} · ${formatSchedule(detailPost, { hour: "numeric", minute: "2-digit" })} · ${detailPost.timezone}` : "Not scheduled"}</span></footer>
          </aside>
        </section>
      </div>}
      <p className="demo-banner" role="note">Targets marked “Demo publisher” have simulated statuses and IDs and are not sent to social platforms. Instagram targets marked “Live publishing” are sent through the connected Instagram account. While the app is open, it checks Instagram every five minutes for removed posts; deleted Instagram targets are marked here while other channels and local history are kept.</p>
    </section>
  );
}
