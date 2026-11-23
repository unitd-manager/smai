"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesignDocument, DesignLayer } from "@united-technologies/shared/design-document";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";
import { DesignDocumentPreview } from "@/components/design-document-preview";

type Design = {
  id: string;
  templateId: string | null;
  title: string;
  designJson: {
    format?: string;
    generatedContentId?: string;
    variant?: number;
    platforms?: string[];
    demo?: boolean;
    document?: DesignDocument;
  };
  previewUrl: string | null;
  status: string;
  createdAt: string;
  brand: { name: string };
};

type BrandOption = { id: string; name: string };
type GeneratedContent = {
  id: string;
  request: string | null;
  contentJson: { title?: string; caption?: string; hashtags?: string[] };
};
type DesignSet = { id: string; title: string; designs: Design[] };
type DesignVersion = {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  snapshot: { title?: string; status?: string };
};
const favoritesStorageKey = "united-technologies.design-favorites";

function textLayers(document: DesignDocument): Array<{ id: string; text: string; page: number; name: string }> {
  const layers: Array<{ id: string; text: string; page: number; name: string }> = [];
  const visit = (items: DesignLayer[], page: number) => items.forEach((layer) => {
    if (layer.type === "text") layers.push({ id: layer.id, text: layer.text, page, name: layer.name ?? layer.id.replaceAll("-", " ") });
    else if (layer.type === "group") visit(layer.children, page);
  });
  document.pages.forEach((page, index) => visit(page.layers, index));
  return layers;
}

function replaceDesignText(document: DesignDocument, layerId: string, text: string): DesignDocument {
  const replace = (layer: DesignLayer): DesignLayer => {
    if (layer.type === "text" && layer.id === layerId) return { ...layer, text };
    if (layer.type === "group") return { ...layer, children: layer.children.map(replace) };
    return layer;
  };
  return { ...document, pages: document.pages.map((page) => ({ ...page, layers: page.layers.map(replace) })) };
}

function groupDesigns(designs: Design[]): DesignSet[] {
  const grouped = new Map<string, Design[]>();
  for (const design of designs) {
    const generatedContentId = design.designJson.generatedContentId;
    const isCopy = design.title.endsWith(" · Copy");
    const groupId = generatedContentId && !isCopy ? `generated:${generatedContentId}` : `design:${design.id}`;
    grouped.set(groupId, [...(grouped.get(groupId) ?? []), design]);
  }
  return [...grouped].map(([id, items]) => ({
    id,
    title: items[0]!.title.replace(/ · .+ (?:layout|design)$/i, "").replace(/ · Copy$/, ""),
    designs: items.sort((left, right) => (left.designJson.variant ?? 0) - (right.designJson.variant ?? 0)),
  })).sort((left, right) => right.designs[0]!.createdAt.localeCompare(left.designs[0]!.createdAt));
}

export function DesignsClient() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [contentById, setContentById] = useState<Record<string, GeneratedContent>>({});
  const [format, setFormat] = useState("all");
  const [status, setStatus] = useState("all");
  const [brandFilter, setBrandFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyDesignId, setHistoryDesignId] = useState("");
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([]);
  const [editingDesignId, setEditingDesignId] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editingCopyId, setEditingCopyId] = useState("");
  const [editedDocument, setEditedDocument] = useState<DesignDocument | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(favoritesStorageKey);
        const parsed: unknown = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
          throw new Error("Saved design favorites are not in a valid format.");
        }
        setFavorites(parsed);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not load saved design favorites.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadDesigns = useCallback(async (selectedBrand = brandFilter) => {
    setLoading(true);
    try {
      const filter = selectedBrand === "active" ? "" : `?brandId=${encodeURIComponent(selectedBrand)}`;
      const [designResponse, contentResponse] = await Promise.all([
        apiRequest<{ designs: Design[] }>(`/api/designs${filter}`),
        apiRequest<{ items: GeneratedContent[] }>(`/api/content${filter}`),
      ]);
      setDesigns(designResponse.designs);
      setContentById(Object.fromEntries(contentResponse.items.map((item) => [item.id, item])));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load designs.");
    } finally {
      setLoading(false);
    }
  }, [brandFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDesigns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDesigns]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      apiRequest<{ workspaces: Array<{ id: string; brands: BrandOption[] }> }>("/api/workspaces")
        .then((response) => {
          const workspaceId = window.localStorage.getItem("united-technologies.workspaceId");
          setBrands(response.workspaces.find((workspace) => workspace.id === workspaceId)?.brands ?? []);
        })
        .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load brands."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const formats = useMemo(() => [...new Set(designs.map((design) => design.designJson.format ?? "Other"))].sort(), [designs]);
  const platforms = useMemo(() => [...new Set(designs.flatMap((design) => design.designJson.platforms ?? []))].sort(), [designs]);
  const designSets = useMemo(() => groupDesigns(designs), [designs]);
  const visibleSets = useMemo(() => designSets.filter((set) => {
    const design = set.designs[0]!;
    const designFormat = design.designJson.format ?? "Other";
    const searchText = `${set.title} ${design.brand.name} ${design.designJson.platforms?.join(" ") ?? ""}`.toLowerCase();
    return (format === "all" || designFormat === format)
      && (status === "all" || design.status.toLowerCase() === status)
      && (platform === "all" || set.designs.some((item) => item.designJson.platforms?.includes(platform)))
      && (!query.trim() || searchText.includes(query.trim().toLowerCase()))
      && (!favoritesOnly || favorites.includes(set.id));
  }), [designSets, format, status, platform, query, favoritesOnly, favorites]);

  function toggleFavorite(setId: string) {
    const next = favorites.includes(setId) ? favorites.filter((id) => id !== setId) : [...favorites, setId];
    try {
      window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
      setFavorites(next);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this favorite.");
    }
  }

  async function duplicate(design: Design) {
    setBusyId(design.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/designs/${encodeURIComponent(design.id)}/duplicate`, { method: "POST" });
      setNotice("A copy of the design was added to your library.");
      await loadDesigns();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not duplicate this design.");
    } finally {
      setBusyId("");
    }
  }

  async function loadHistory(design: Design) {
    setHistoryDesignId(design.id);
    setError("");
    try {
      const response = await apiRequest<{ versions: DesignVersion[] }>(`/api/designs/${encodeURIComponent(design.id)}/versions`);
      setDesignVersions(response.versions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load design version history.");
    }
  }

  async function saveDesignTitle(design: Design) {
    setBusyId(design.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/designs/${encodeURIComponent(design.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editedTitle }),
      });
      setEditingDesignId("");
      setNotice("Design title saved as a new version.");
      await loadDesigns();
      await loadHistory(design);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this design.");
    } finally {
      setBusyId("");
    }
  }

  async function restoreDesignVersion(design: Design, version: DesignVersion) {
    if (!window.confirm(`Restore design version ${version.version}? The current version will remain in history.`)) return;
    setBusyId(design.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/designs/${encodeURIComponent(design.id)}/versions/${version.version}/restore`, { method: "POST" });
      setNotice(`Design version ${version.version} restored.`);
      await loadDesigns();
      await loadHistory(design);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not restore this design version.");
    } finally {
      setBusyId("");
    }
  }

  async function saveArtworkText(design: Design) {
    if (!editedDocument || editingCopyId !== design.id) return;
    setBusyId(design.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/designs/${encodeURIComponent(design.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ document: editedDocument }),
      });
      setDesigns((current) => current.map((item) => item.id === design.id
        ? { ...item, designJson: { ...item.designJson, document: editedDocument }, previewUrl: null }
        : item));
      setEditingCopyId("");
      setEditedDocument(null);
      setNotice("Artwork copy saved as a new design version.");
      if (historyDesignId === design.id) await loadHistory(design);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the artwork copy.");
    } finally {
      setBusyId("");
    }
  }

  async function remove(set: DesignSet) {
    if (!window.confirm(`Delete “${set.title}” and its ${set.designs.length} layout${set.designs.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusyId(set.id);
    setError("");
    setNotice("");
    try {
      await Promise.all(set.designs.map((design) => apiRequest(`/api/designs/${encodeURIComponent(design.id)}`, { method: "DELETE" })));
      setDesigns((current) => current.filter((item) => !set.designs.some((design) => design.id === item.id)));
      const nextFavorites = favorites.filter((id) => id !== set.id);
      setFavorites(nextFavorites);
      setNotice("The design set was deleted.");
      try {
        window.localStorage.setItem(favoritesStorageKey, JSON.stringify(nextFavorites));
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "The set was deleted, but favorites could not be updated.");
      }
    } catch (requestError) {
      await loadDesigns();
      setError(requestError instanceof Error ? requestError.message : "Could not delete this design.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="dashboard-content designs-page">
      <p className="eyebrow">YOUR STUDIO · LIBRARY</p>
      <h1>Saved designs</h1>
      <p className="dashboard-lead">Each visual stays linked to the brief that created it. Open a design to review its source prompt, edit the artwork text, compare styles, or restore a saved version.</p>
      <div className="design-toolbar">
        <label className="design-search">Search designs<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, brand, or platform" /></label>
        <label>Format<CompactSelect aria-label="Format filter" value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{formats.map((item) => <option key={item} value={item}>{item}</option>)}</CompactSelect></label>
        <label>Status<CompactSelect aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option></CompactSelect></label>
        <label>Platform<CompactSelect aria-label="Platform filter" value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">All platforms</option>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</CompactSelect></label>
        <label>Brand<CompactSelect aria-label="Brand filter" value={brandFilter} onChange={(event) => {
          const value = event.target.value;
          setBrandFilter(value);
        }}><option value="active">Current brand</option><option value="all">All brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</CompactSelect></label>
        <label className="design-favorites-filter"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> Favorites</label>
        <span>{visibleSets.length} design sets · {designs.length} saved designs</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p role="status">Loading designs…</p> : designs.length === 0 ? (
        <article className="section-empty-state"><h2>No designs saved yet</h2><p>Create a post or campaign asset to save its design variations here.</p><Link className="button button-gold" href="/dashboard/create">Create content</Link></article>
      ) : visibleSets.length === 0 ? (
        <article className="section-empty-state"><h2>No designs match these filters.</h2><p>Choose another format or status.</p></article>
      ) : (
        <div className="design-grid">
          {visibleSets.map((set) => {
            const selectedDesign = set.designs.find((design) => design.id === selectedVariants[set.id]) ?? set.designs[0]!;
            const busy = busyId === set.id || busyId === selectedDesign.id;
            const generatedContentId = selectedDesign.designJson.generatedContentId;
            const content = generatedContentId ? contentById[generatedContentId] : undefined;
            const selectedDocument = selectedDesign.designJson.document;
            const editableText = selectedDocument ? textLayers(selectedDocument) : [];
            return <article className="design-card" key={set.id}>
              <div className="design-card-preview">
                {selectedDesign.designJson.document
                  ? <DesignDocumentPreview
                      document={selectedDesign.designJson.document}
                      title={set.title}
                      compact
                      subtitle={`${selectedDesign.brand.name} · ${selectedDesign.status.toLowerCase()}${selectedDesign.templateId ? " · Template applied" : ""}`}
                      modalDetails={<>
                        <p className="design-post-date">{new Date(selectedDesign.createdAt).toLocaleDateString()} · {set.designs.length} style option{set.designs.length === 1 ? "" : "s"}</p>
                        {selectedDocument && editableText.length > 0 && <section className="design-copy-editor">
                          {editingCopyId === selectedDesign.id && editedDocument ? <>
                            <h3>Edit artwork text</h3>
                            <p>Change the copy over the generated artwork. Each save creates a restorable design version.</p>
                            {textLayers(editedDocument).map((layer) => (
                              <label key={`${layer.page}-${layer.id}`}>Page {layer.page + 1} · {layer.name}
                                <textarea rows={layer.text.length > 70 ? 3 : 2} value={layer.text} onChange={(event) => setEditedDocument((current) => current ? replaceDesignText(current, layer.id, event.target.value) : current)} />
                              </label>
                            ))}
                            <div className="content-editor-actions"><button type="button" disabled={busy} onClick={() => void saveArtworkText(selectedDesign)}>Save artwork text</button><button type="button" onClick={() => { setEditingCopyId(""); setEditedDocument(null); }}>Cancel</button></div>
                          </> : <button type="button" onClick={() => { setEditingCopyId(selectedDesign.id); setEditedDocument(selectedDocument); }}>Edit artwork text</button>}
                        </section>}
                        {content?.contentJson.caption && <p className="design-post-caption">{content.contentJson.caption}</p>}
                        {content?.contentJson.hashtags && content.contentJson.hashtags.length > 0 && <p className="design-post-hashtags">{content.contentJson.hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p>}
                        {content?.request && <div className="design-source-brief"><strong>Original creation brief</strong><p>{content.request}</p></div>}
                        {editingDesignId === selectedDesign.id ? <div className="content-editor">
                          <label>Design title<input value={editedTitle} onChange={(event) => setEditedTitle(event.target.value)} /></label>
                          <div className="content-editor-actions"><button type="button" disabled={busy} onClick={() => void saveDesignTitle(selectedDesign)}>Save version</button><button type="button" onClick={() => setEditingDesignId("")}>Cancel</button></div>
                        </div> : <div className="design-history-actions">
                          <button type="button" onClick={() => { setEditingDesignId(selectedDesign.id); setEditedTitle(selectedDesign.title); }}>Rename design</button>
                          <button type="button" onClick={() => void loadHistory(selectedDesign)}>Version history</button>
                        </div>}
                        {historyDesignId === selectedDesign.id && <div className="design-version-list">
                          <h3>Saved versions</h3>
                          {designVersions.length === 0 ? <p>No saved versions yet.</p> : designVersions.map((version) => (
                            <article key={version.id}>
                              <div><strong>Version {version.version}: {version.snapshot.title ?? "Untitled design"}</strong><small>{version.note ?? "Saved"} · {new Date(version.createdAt).toLocaleString()}</small></div>
                              <button type="button" disabled={busy} onClick={() => void restoreDesignVersion(selectedDesign, version)}>Restore</button>
                            </article>
                          ))}
                        </div>}
                        {set.designs.length > 1 && <div className="design-variant-picker" role="group" aria-label="Choose a design style">{set.designs.map((design, index) => {
                          const style = design.title.match(/· (.+) design$/i)?.[1] ?? `Design ${index + 1}`;
                          return <button type="button" key={design.id} aria-pressed={selectedDesign.id === design.id} onClick={() => setSelectedVariants((current) => ({ ...current, [set.id]: design.id }))}>{style}</button>;
                        })}</div>}
                        {error && <p className="form-error" role="alert">{error}</p>}
                      </>}
                      modalActions={<>
                        {generatedContentId && <Link href={`/dashboard/content?edit=${encodeURIComponent(generatedContentId)}`} role="menuitem">Edit content</Link>}
                        <button type="button" role="menuitem" disabled={busy} onClick={() => void duplicate(selectedDesign)}>Duplicate design</button>
                        <button type="button" role="menuitem" onClick={() => toggleFavorite(set.id)}>{favorites.includes(set.id) ? "Remove favorite" : "Add favorite"}</button>
                        <button type="button" role="menuitem" disabled={busy} onClick={() => void remove(set)}>Delete design set</button>
                      </>}
                    />
                  : <p>No preview available for this saved design.</p>}
              </div>
              <div className="design-origin-summary">
                <span>Created from</span>
                <strong>{content?.contentJson.title || set.title}</strong>
                {content?.request
                  ? <p>{content.request.length > 180 ? `${content.request.slice(0, 180).trimEnd()}…` : content.request}</p>
                  : <p>Source prompt is not available for this saved design.</p>}
                {generatedContentId && <Link href={`/dashboard/content?edit=${encodeURIComponent(generatedContentId)}`}>View source post brief</Link>}
              </div>
            </article>;
          })}
        </div>
      )}
      {designs.length > 0 && designs.some((design) => design.designJson.demo) && <p className="demo-banner" role="note">Generated layouts and preview images are currently rendered by the built-in demo design provider.</p>}
    </section>
  );
}
