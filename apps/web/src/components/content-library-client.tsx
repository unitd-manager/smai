"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Files } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type LibraryItem = {
  id: string;
  request: string | null;
  contentJson: {
    format?: string;
    title?: string;
    caption?: string;
    hashtags?: string[];
    platforms?: string[];
  };
  provider: string;
  status: string;
  createdAt: string;
  brand: { name: string };
};
type ContentResponse = { items: LibraryItem[]; configured: boolean };
type BrandOption = { id: string; name: string };
type ContentVersion = {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  snapshot: { title?: string; caption?: string; hashtags?: string[] };
};

export function ContentLibraryClient() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [refinements, setRefinements] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const autoEditId = useRef("");
  const [search, setSearch] = useState("");
  const [historyItemId, setHistoryItemId] = useState("");
  const [historyVersions, setHistoryVersions] = useState<ContentVersion[]>([]);

  const visibleItems = items.filter((item) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || [item.request, item.contentJson.title, item.contentJson.caption, item.brand.name]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
  const formatCount = new Set(items.map((item) => item.contentJson.format ?? "content")).size;

  useEffect(() => {
    const query = new URLSearchParams({
      brandId: brandFilter,
      ...(formatFilter !== "all" ? { format: formatFilter } : {}),
      ...(platformFilter !== "all" ? { platform: platformFilter } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    });
    Promise.all([
      apiRequest<ContentResponse>(`/api/content?${query}`),
      apiRequest<{ workspaces: Array<{ brands: BrandOption[] }> }>("/api/workspaces"),
    ])
      .then(([response, workspaceData]) => {
        setItems(response.items);
        setGeminiConfigured(response.configured);
        setBrands([...new Map(workspaceData.workspaces.flatMap((workspace) => workspace.brands).map((item) => [item.id, item])).values()]);
        setError("");
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load your content."))
      .finally(() => setLoading(false));
  }, [brandFilter, formatFilter, platformFilter, refreshKey, statusFilter]);

  function beginEdit(item: LibraryItem) {
    setEditingId(item.id);
    setEditTitle(item.contentJson.title ?? "");
    setEditCaption(item.contentJson.caption ?? "");
    setEditHashtags(item.contentJson.hashtags?.join(", ") ?? "");
    setError("");
    setNotice("");
  }

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("edit");
    if (!requestedId || requestedId === autoEditId.current) return;
    const item = items.find((candidate) => candidate.id === requestedId);
    if (!item) return;
    autoEditId.current = requestedId;
    const timer = window.setTimeout(() => beginEdit(item), 0);
    return () => window.clearTimeout(timer);
  }, [items]);

  async function saveEdit(itemId: string) {
    setError("");
    try {
      await apiRequest(`/api/content/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle,
          caption: editCaption,
          hashtags: editHashtags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setEditingId("");
      setNotice("Your content changes have been saved.");
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your content.");
    }
  }

  async function loadHistory(itemId: string) {
    setHistoryItemId(itemId);
    setError("");
    try {
      const response = await apiRequest<{ versions: ContentVersion[] }>(`/api/content/${encodeURIComponent(itemId)}/versions`);
      setHistoryVersions(response.versions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load content version history.");
    }
  }

  async function restoreVersion(item: LibraryItem, version: ContentVersion) {
    if (!window.confirm(`Restore content version ${version.version}? The current content will remain in history.`)) return;
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/content/${encodeURIComponent(item.id)}/versions/${version.version}/restore`, { method: "POST" });
      setNotice(`Content version ${version.version} restored.`);
      setRefreshKey((key) => key + 1);
      await loadHistory(item.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not restore this content version.");
    }
  }

  async function duplicateItem(itemId: string) {
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/content/${itemId}/duplicate`, { method: "POST" });
      setNotice("A copy of this content was added to your library.");
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not duplicate this content.");
    }
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm("Delete this content and its saved design options?")) return;
    setError("");
    setNotice("");
    try {
      await apiRequest<void>(`/api/content/${itemId}`, { method: "DELETE" });
      setNotice("Content and its design options were deleted.");
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete this content.");
    }
  }

  async function regenerate(item: LibraryItem, refine = "") {
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/content/generate", {
        method: "POST",
        body: JSON.stringify({
          idea: [item.request, refine].filter(Boolean).join(" — "),
          formats: [item.contentJson.format ?? "post"],
          platforms: item.contentJson.platforms?.length ? item.contentJson.platforms : ["Instagram"],
          tone: "Warm and confident",
          language: "English",
        }),
      });
      setNotice(refine ? "A refined version was created." : "A new version was generated.");
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not regenerate this content.");
    }
  }

  return (
    <section className="dashboard-content library-page">
      <p className="eyebrow">YOUR STUDIO · LIBRARY</p>
      <div className="library-heading">
        <div><h1>Content library</h1><p className="dashboard-lead">Ideas, captions, scripts and creative briefs created for your brands.</p></div>
        <Link className="button button-gold library-create-button" href="/dashboard/create">Create content</Link>
      </div>
      {!loading && <div className="library-summary" aria-label="Content library totals">
        <div><span>Saved items</span><strong>{items.length}</strong></div>
        <div><span>Formats</span><strong>{formatCount}</strong></div>
        <div><span>Brands</span><strong>{new Set(items.map((item) => item.brand.name)).size}</strong></div>
      </div>}
      {!loading && !geminiConfigured && <div className="notice notice-error" role="alert">AI generation is unavailable. Add <code>GOOGLE_AI_STUDIO_API_KEY</code>, <code>GROQ_API_KEY</code>, or <code>OPENAI_API_KEY</code> to <code>apps/api/.env</code>, then restart the API.</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      <div className="library-toolbar">
        <label className="library-search">Search content<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, brief or brand" /></label>
        <label>Format<CompactSelect aria-label="Format filter" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}><option value="all">All formats</option>{["post", "carousel", "story", "poster", "brochure", "flyer", "thumbnail", "video"].map((format) => <option key={format}>{format}</option>)}</CompactSelect></label>
        <label>Platform<CompactSelect aria-label="Platform filter" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option>{["Instagram", "Facebook", "LinkedIn", "TikTok", "YouTube", "Pinterest", "X"].map((platform) => <option key={platform}>{platform}</option>)}</CompactSelect></label>
        <label>Status<CompactSelect aria-label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option></CompactSelect></label>
        <label>Brand<CompactSelect aria-label="Brand filter" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}><option value="all">All brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</CompactSelect></label>
      </div>
      {loading ? <p className="loading-label">Loading your content library…</p> : items.length === 0 ? (
        <article className="section-empty-state"><span className="section-empty-icon"><Files size={22} aria-hidden="true" /></span><h2>No content saved yet</h2><p>Create a caption, carousel, story or video script to add it to this library.</p><Link className="button button-gold" href="/dashboard/create">Create content</Link></article>
      ) : visibleItems.length === 0 ? (
        <article className="section-empty-state"><h2>No matching content</h2><p>Try a different search or update your filters.</p><button className="button button-outline" type="button" onClick={() => setSearch("")}>Clear search</button></article>
      ) : (
        <div className="library-card-grid">{visibleItems.map((item) => (
          <article className="library-item" key={item.id}>
            <div className="library-item-type">{(item.contentJson.format ?? "content").slice(0, 1).toUpperCase()}</div>
            <div className="library-item-copy">
              <div><span className="library-badge">{item.contentJson.format ?? "content"}</span><span className="library-badge">{item.provider === "google-ai-studio" ? "Gemini" : item.provider === "groq" ? "Groq" : item.provider === "openai" ? "OpenAI" : item.provider === "media-upload" ? "Imported" : "Legacy"}</span></div>
              {editingId === item.id ? (
                <div className="content-editor">
                  <label>Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
                  <label>Caption<textarea rows={5} value={editCaption} onChange={(event) => setEditCaption(event.target.value)} /></label>
                  <label>Hashtags<input value={editHashtags} onChange={(event) => setEditHashtags(event.target.value)} /></label>
                  <div className="content-editor-actions"><button type="button" onClick={() => saveEdit(item.id)}>Save changes</button><button type="button" onClick={() => setEditingId("")}>Cancel</button></div>
                </div>
              ) : (
                <>
                  <h2>{item.contentJson.title ?? "Untitled content"}</h2>
                  <p>{item.contentJson.caption ?? ""}</p>
                  <small>{item.brand.name} · {new Date(item.createdAt).toLocaleDateString()}</small>
                  <details className="content-detail"><summary>View full content</summary><p>Brief: {item.request || "No brief provided"}</p><p>Hashtags: {item.contentJson.hashtags?.join(" ") || "None"}</p><p>Platforms: {item.contentJson.platforms?.join(", ") || "Not set"}</p></details>
                  <div className="library-actions">
                    <button type="button" onClick={() => beginEdit(item)}>Edit</button>
                    <button type="button" onClick={() => void loadHistory(item.id)}>Version history</button>
                    <button type="button" onClick={() => void duplicateItem(item.id)}>Duplicate</button>
                    <button type="button" disabled={Boolean(refinements[item.id]?.trim()) === false} onClick={() => void regenerate(item, refinements[item.id])}>Refine</button>
                    <button type="button" onClick={() => void regenerate(item)}>Regenerate</button>
                    <button type="button" onClick={() => void deleteItem(item.id)}>Delete</button>
                  </div>
                  {historyItemId === item.id && <div className="content-version-list">
                    <h3>Saved versions</h3>
                    {historyVersions.length === 0 ? <p>No saved versions yet.</p> : historyVersions.map((version) => (
                      <article key={version.id}>
                        <div>
                          <strong>Version {version.version}: {version.snapshot.title ?? "Untitled content"}</strong>
                          <p>{version.snapshot.caption ?? ""}</p>
                          <small>{version.note ?? "Saved"} · {new Date(version.createdAt).toLocaleString()}</small>
                        </div>
                        <button type="button" onClick={() => void restoreVersion(item, version)}>Restore</button>
                      </article>
                    ))}
                  </div>}
                  <label className="library-refine">Refinement <input value={refinements[item.id] ?? ""} onChange={(event) => setRefinements((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="e.g. shorter, more premium" /></label>
                </>
              )}
            </div>
            {item.contentJson.hashtags && <div className="library-tags">{item.contentJson.hashtags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          </article>
        ))}</div>
      )}
    </section>
  );
}
