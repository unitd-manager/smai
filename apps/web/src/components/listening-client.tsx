"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

type ListeningComment = {
  id: string;
  text: string;
  timestamp: string | null;
  username: string | null;
  likes: number | null;
};
type ListeningPost = {
  id: string;
  caption: string;
  mediaType: string;
  permalink: string | null;
  timestamp: string | null;
  likes: number | null;
  commentsCount: number | null;
  insights: Record<string, number | null>;
  comments: ListeningComment[];
  commentsAvailable: boolean;
  commentError?: string;
};
type ListeningResponse = {
  accounts: Array<{ id: string; displayName: string }>;
  selectedAccountId: string | null;
  posts: ListeningPost[];
  fetchedAt: string;
};

function count(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat().format(value);
}

function date(value: string | null) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleString();
}

export function ListeningClient() {
  const [data, setData] = useState<ListeningResponse | null>(null);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [filter, setFilter] = useState<"all" | "comments">("all");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      const response = await apiRequest<ListeningResponse>(`/api/listening${query}`);
      setData(response);
      setAccountId(response.selectedAccountId ?? "");
      setUpdatedAt(response.fetchedAt);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load Instagram activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visiblePosts = useMemo(() => (data?.posts ?? []).filter((post) =>
    filter === "all" || (post.commentsCount ?? post.comments.length) > 0,
  ), [data, filter]);
  const totals = useMemo(() => (data?.posts ?? []).reduce((sum, post) => ({
    likes: sum.likes + (post.likes ?? 0),
    comments: sum.comments + (post.commentsCount ?? 0),
  }), { likes: 0, comments: 0 }), [data]);

  return (
    <section className="dashboard-content listening-page">
      <div className="listening-heading">
        <div>
          <p className="eyebrow">GROW · INSTAGRAM ACTIVITY</p>
          <h1>Listening</h1>
          <p className="dashboard-lead">See recent post reach, engagement, and comments.</p>
        </div>
        <button className="button button-gold" type="button" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? "Refreshing…" : "Refresh activity"}
        </button>
      </div>

      {error && <div className="form-error" role="alert">{error} <Link href="/dashboard/social-accounts/instagram">Reconnect Instagram</Link></div>}

      {loading ? <p className="loading-label">Loading Instagram posts and comments…</p> : !data?.accounts.length ? (
        <article className="listening-empty">
          <h2>Connect an Instagram Professional account</h2>
          <p>Listening reads recent posts and engagement from an account you connect to this workspace.</p>
          <Link className="button button-gold" href="/dashboard/social-accounts/instagram">Connect Instagram</Link>
        </article>
      ) : (
        <>
          <div className="listening-toolbar">
            <label>Account
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {data.accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
              </select>
            </label>
          <div className="listening-updated">{updatedAt ? `Updated ${date(updatedAt)}` : "Waiting for first refresh"} · 5 min refresh</div>
          </div>
          <div className="listening-stats" aria-label="Recent Instagram activity totals">
            <article><span>Posts loaded</span><strong>{data.posts.length}</strong></article>
            <article><span>Likes on loaded posts</span><strong>{count(totals.likes)}</strong></article>
            <article><span>Comments on loaded posts</span><strong>{count(totals.comments)}</strong></article>
          </div>
          <div className="listening-posts-heading">
            <div><h2>Recent posts</h2><p>Up to 30 recent posts from this account.</p></div>
            <div className="listening-filters" aria-label="Filter posts">
              <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All posts</button>
              <button type="button" className={filter === "comments" ? "is-active" : ""} onClick={() => setFilter("comments")}>With comments</button>
            </div>
          </div>
          {!visiblePosts.length ? <article className="listening-empty"><h3>{data.posts.length ? "No posts match this filter" : "No Instagram posts returned"}</h3><p>{data.posts.length ? "Choose All posts to see the full recent feed." : "The connected account has no eligible posts available through the Instagram API."}</p></article> : (
            <div className="listening-post-list">
              {visiblePosts.map((post) => (
                <article className="listening-post-card" key={post.id}>
                  <header>
                    <div><span className="listening-type">{post.mediaType.replaceAll("_", " ")}</span><time>{date(post.timestamp)}</time></div>
                    {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer">Open post ↗</a>}
                  </header>
                  <p className="listening-caption">{post.caption || "No caption"}</p>
                  <div className="listening-post-metrics"><span><strong>{count(post.insights.views)}</strong> views</span><span><strong>{count(post.likes)}</strong> likes</span><span><strong>{count(post.commentsCount)}</strong> comments</span><span><strong>{count(post.insights.reach)}</strong> reach</span><span><strong>{count(post.insights.saved)}</strong> saves</span><span><strong>{count(post.insights.shares)}</strong> shares</span></div>
                  <details className="listening-comments" open={(post.comments.length > 0)}>
                    <summary>Comments {post.commentsCount === null ? "" : `(${post.commentsCount})`}</summary>
                    {post.commentError ? <p className="listening-permission-note">{post.commentError} <Link href="/dashboard/social-accounts/instagram">Reconnect account</Link></p> : post.comments.length ? (
                      <ul>{post.comments.map((comment) => <li key={comment.id}><div><strong>{comment.username ? `@${comment.username}` : "Instagram user"}</strong><time>{date(comment.timestamp)}</time></div><p>{comment.text || "(No text)"}</p></li>)}</ul>
                    ) : <p>{post.commentsAvailable ? "No comments on this post." : "Comments could not be loaded."}</p>}
                  </details>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
