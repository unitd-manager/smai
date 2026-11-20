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
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPosts = useCallback(async (selectedStatus = status) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ brandId: "all" });
      if (selectedStatus !== "all") query.set("status", selectedStatus);
      const response = await apiRequest<{ posts: Post[] }>(`/api/posts?${query}`);
      setPosts(response.posts);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load posts.");
    } finally {
      setLoading(false);
    }
  }, [status]);

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

  return (
    <section className="dashboard-content posts-page">
      <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
      <h1>{calendar ? "Calendar" : "Posts and Queue"}</h1>
      <p className="dashboard-lead">{calendar ? "Review scheduled content and publishing results for every brand." : "Track drafts, scheduled posts, and publishing results in one place."}</p>
      <div className="posts-toolbar">
        <label>Status<CompactSelect aria-label="Status filter" value={status} onChange={(event) => {
          setStatus(event.target.value);
        }}>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</CompactSelect></label>
        <Link className="button button-gold" href="/dashboard/create">Create a post</Link>
        <span>{posts.length} posts</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p role="status">Loading posts…</p> : posts.length === 0 ? (
        <article className="section-empty-state"><h2>No posts in this view yet.</h2><p>Create content, then publish it now or add it to the schedule.</p><Link className="button button-gold" href="/dashboard/create">Create content</Link></article>
      ) : (
        <div className="posts-list">
          {posts.map((post) => (
            <article className="post-queue-card" key={post.id}>
              <div className="post-queue-heading">
                <div className="post-queue-title">
                  <span className={`post-status post-status-${post.status.toLowerCase()}`}>{post.status.toLowerCase().replaceAll("_", " ")}</span>
                  <h2>{post.title ?? "Untitled post"}</h2>
                  <small>{post.brand.name}{post.scheduledAt ? ` · ${new Date(post.scheduledAt).toLocaleString(undefined, { timeZone: post.timezone })} (${post.timezone})` : ""}</small>
                </div>
                <span className={`demo-post-badge${post.demoMode ? "" : " post-live-badge"}`}>{post.demoMode ? "Demo publisher" : "Live publishing"}</span>
              </div>
              <details className="post-caption-details"><summary>View caption</summary><p>{post.caption}</p></details>
              <div className="post-target-list">
                {post.targets.map((target) => (
                  <div key={target.id}>
                    <strong className="post-target-platform"><PlatformIcon platform={target.platform} />{target.platform}</strong>
                    <span className={target.status === "DELETED_ON_PLATFORM" ? "post-target-deleted" : undefined}>
                      {target.status === "DELETED_ON_PLATFORM" ? "Deleted on Instagram" : target.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                    {target.publishingMode === "demo" && target.platformPostId && <small>Demo ID: {target.platformPostId}</small>}
                    {target.publishedUrl && <a href={target.publishedUrl} target="_blank" rel="noreferrer">View post</a>}
                    {target.error && <small className={target.status === "DELETED_ON_PLATFORM" ? "post-target-deleted-note" : "form-error"}>{target.error}</small>}
                  </div>
                ))}
              </div>
              <div className="post-queue-actions">
                {post.status === "DRAFT" && <button type="button" disabled={busyId === post.id} onClick={() => void postAction(post, "submit")}>Submit for approval</button>}
                {["DRAFT", "SCHEDULED", "FAILED"].includes(post.status) && <button type="button" disabled={busyId === post.id} onClick={() => void postAction(post, "cancel")}>Cancel</button>}
                {post.targets.some((target) => target.status === "FAILED") && <button type="button" disabled={busyId === post.id} onClick={() => void postAction(post, "retry")}>Retry failed</button>}
                {canDeletePost(post) && <button type="button" className="post-delete-action" disabled={busyId === post.id} onClick={() => void postAction(post, "delete")}>Delete post</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="demo-banner" role="note">Targets marked “Demo publisher” have simulated statuses and IDs and are not sent to social platforms. Instagram targets marked “Live publishing” are sent through the connected Instagram account. While the app is open, it checks Instagram every five minutes for removed posts; deleted Instagram targets are marked here while other channels and local history are kept.</p>
    </section>
  );
}
