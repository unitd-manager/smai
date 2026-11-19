"use client";

import Link from "next/link";
import Image from "next/image";
import { Images, MoreHorizontal, Plus, Upload, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesignDocument } from "@united-technologies/shared/design-document";
import { apiBaseUrl, apiRequest } from "@/lib/api";
import { DesignDocumentPreview, DesignImagePreview } from "@/components/design-document-preview";

type DesignAsset = {
  id: string;
  title: string;
  previewUrl: string | null;
  designJson?: { document?: DesignDocument; generatedContentId?: string };
  status: string;
  createdAt: string;
  brand: { name: string };
};

type ContentAsset = {
  id: string;
  request: string | null;
  contentJson: { format?: string; title?: string; caption?: string; hashtags?: string[] };
  provider: string;
  status: string;
  createdAt: string;
  brand: { name: string };
};
type RenderedVideoAsset = {
  id: string;
  status: string;
  videoUrl: string | null;
  createdAt: string;
  inputJson: { title?: string; brandName?: string };
};
type UploadedFileAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  brandId: string | null;
  contentId: string | null;
  createdAt: string;
  url: string;
};
type LargeUploadResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  uploadToken: string;
};

type MediaAsset =
  | { kind: "design"; id: string; title: string; description: string; brand: string; createdAt: string; previewUrl: string | null; document?: DesignDocument; status: string; generatedContentId?: string; caption: string; hashtags: string[] }
  | { kind: "content"; id: string; title: string; description: string; brand: string; createdAt: string; previewUrl: null; status: string; caption: string; hashtags: string[] }
  | { kind: "video"; id: string; title: string; description: string; brand: string; createdAt: string; videoUrl: string; status: string }
  | { kind: "upload"; id: string; title: string; description: string; brand: string; createdAt: string; fileUrl: string; mimeType: string; contentId: string | null; status: string };

export function MediaLibraryClient({ importMode = false, galleryMode = false }: { importMode?: boolean; galleryMode?: boolean }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [filter, setFilter] = useState(importMode ? "upload" : "all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canRetryLoad, setCanRetryLoad] = useState(false);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [detailAsset, setDetailAsset] = useState<MediaAsset | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setCanRetryLoad(false);
    try {
      const library = galleryMode ? "gallery" : "media";
      const results = await Promise.allSettled([
        apiRequest<{ designs: DesignAsset[] }>(`/api/designs?brandId=all&library=${library}`),
        apiRequest<{ items: ContentAsset[] }>(`/api/content?brandId=all&library=${library}`),
        apiRequest<{ jobs: RenderedVideoAsset[] }>(`/api/videos/jobs?library=${library}`),
        apiRequest<{ assets: UploadedFileAsset[] }>(`/api/media/uploads?library=${library}`),
      ]);
      const failureLabels = ["designs", "content", "videos", "uploads"];
      const failures = results.flatMap((result, index) => result.status === "rejected"
        ? [`${failureLabels[index]}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`]
        : []);
      const designResponse = results[0].status === "fulfilled" ? results[0].value : { designs: [] };
      const contentResponse = results[1].status === "fulfilled" ? results[1].value : { items: [] };
      const videoResponse = results[2].status === "fulfilled" ? results[2].value : { jobs: [] };
      const uploadResponse = results[3].status === "fulfilled" ? results[3].value : { assets: [] };
      const contentById = new Map(contentResponse.items.map((item) => [item.id, item]));
      const designAssets: MediaAsset[] = designResponse.designs.map((design) => {
        const generatedContentId = design.designJson?.generatedContentId;
        const content = generatedContentId ? contentById.get(generatedContentId) : undefined;
        return {
          kind: "design",
          id: design.id,
          title: design.title,
          description: `${design.status.toLowerCase()} design`,
          brand: design.brand.name,
          createdAt: design.createdAt,
          previewUrl: design.previewUrl,
          ...(design.designJson?.document ? { document: design.designJson.document } : {}),
          ...(generatedContentId ? { generatedContentId } : {}),
          caption: content?.contentJson.caption ?? "",
          hashtags: content?.contentJson.hashtags ?? [],
          status: design.status,
        };
      });
      const contentAssets: MediaAsset[] = contentResponse.items.map((item) => ({
          kind: "content",
          id: item.id,
          title: item.contentJson.title ?? "Untitled content",
          description: `${item.contentJson.format ?? "content"}${item.request ? ` · ${item.request}` : ""}`,
          brand: item.brand.name,
          createdAt: item.createdAt,
          previewUrl: null,
          status: item.status,
          caption: item.contentJson.caption ?? "",
          hashtags: item.contentJson.hashtags ?? [],
        }));
      const videoAssets: MediaAsset[] = videoResponse.jobs.flatMap((job) => job.videoUrl && job.status === "SUCCEEDED" ? [{
          kind: "video" as const,
          id: job.id,
          title: job.inputJson.title ?? "Rendered video",
          description: "Rendered MP4 video",
          brand: job.inputJson.brandName ?? "Brand",
          createdAt: job.createdAt,
          videoUrl: job.videoUrl,
          status: job.status,
        }] : []);
      const uploadedAssets: MediaAsset[] = uploadResponse.assets.map((asset) => ({
        kind: "upload",
        id: asset.id,
        title: asset.fileName,
        description: `${asset.mimeType} · ${Math.max(0.1, Math.round(Number(asset.sizeBytes) / 1024 / 1024 * 10) / 10)} MB`,
        brand: "Workspace",
        createdAt: asset.createdAt,
        fileUrl: asset.url,
        mimeType: asset.mimeType,
        contentId: asset.contentId,
        status: "IMPORTED",
      }));
      setAssets([...uploadedAssets, ...videoAssets, ...designAssets, ...contentAssets].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      setCanRetryLoad(failures.length > 0);
      setError(failures.length ? `Some Gallery items could not be loaded (${failures.join("; ")}). Refresh to try again.` : "");
    } catch (requestError) {
      setCanRetryLoad(true);
      setError(requestError instanceof Error ? requestError.message : "Could not load your media library.");
    } finally {
      setLoading(false);
    }

  }, [galleryMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAssets(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

  const visibleAssets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return assets.filter((asset) =>
      (filter === "all" || asset.kind === filter || (filter === "video" && asset.description.toLowerCase().includes("video"))) &&
      (!query || `${asset.title} ${asset.description} ${asset.brand}`.toLocaleLowerCase().includes(query)),
    );
  }, [assets, filter, search]);

  useEffect(() => {
    if (!detailAsset) return;
    function handleDetailKeys(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailAsset(null);
    }
    window.addEventListener("keydown", handleDetailKeys);
    return () => window.removeEventListener("keydown", handleDetailKeys);
  }, [detailAsset]);

  async function importFile(file: File) {
    setError("");
    setCanRetryLoad(false);
    setNotice("");
    if (file.size === 0 || file.size > 500 * 1024 * 1024) {
      setError("Choose a non-empty file no larger than 500 MB.");
      return;
    }
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const extensionTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      mp4: "video/mp4",
      pdf: "application/pdf",
    };
    const mimeType = file.type || extensionTypes[extension] || "";
    if (!mimeType) {
      setError("Import JPEG, PNG, WebP, MP4, or PDF files.");
      return;
    }
    setUploading(true);
    try {
      let response: { contentId: string | null };
      if (file.size > 100 * 1024 * 1024) {
        setUploadProgress(0);
        const upload = await apiRequest<LargeUploadResponse>("/api/media/uploads/large/presign", {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
            inGallery: galleryMode,
          }),
        });
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("PUT", upload.uploadUrl);
          request.withCredentials = false;
          for (const [name, value] of Object.entries(upload.headers)) request.setRequestHeader(name, value);
          request.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
          });
          request.addEventListener("load", () => {
            if (request.status >= 200 && request.status < 300) resolve();
            else reject(new Error(`Large-file storage rejected the upload (HTTP ${request.status}). Check the bucket CORS and storage configuration.`));
          });
          request.addEventListener("error", () => reject(new Error("Could not reach large-file storage. Check its CORS settings and try again.")));
          request.addEventListener("abort", () => reject(new Error("The large-file upload was interrupted.")));
          request.send(file);
        });
        setUploadProgress(100);
        response = await apiRequest<{ contentId: string | null }>("/api/media/uploads/large/complete", {
          method: "POST",
          body: JSON.stringify({ uploadToken: upload.uploadToken }),
        });
      } else {
        response = await apiRequest<{ contentId: string | null }>("/api/media/uploads", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Mime-Type": mimeType,
            "X-In-Gallery": String(galleryMode),
          },
          body: file,
        });
      }
      await loadAssets();
      setNotice(response.contentId
        ? "File saved to your workspace. Choose Prepare post to add a caption and schedule it."
        : "PDF saved to your workspace for reference.");
    } catch (requestError) {
      setCanRetryLoad(false);
      setError(requestError instanceof Error ? requestError.message : "Could not import this file.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function duplicateAsset(asset: MediaAsset) {
    if (asset.kind === "video" || asset.kind === "upload") return;
    setError("");
    setCanRetryLoad(false);
    try {
      const path = asset.kind === "design" ? `/api/designs/${encodeURIComponent(asset.id)}/duplicate` : `/api/content/${encodeURIComponent(asset.id)}/duplicate`;
      await apiRequest(path, { method: "POST" });
      await loadAssets();
    } catch (requestError) {
      setCanRetryLoad(false);
      setError(requestError instanceof Error ? requestError.message : "Could not duplicate this asset.");
    }
  }

  async function moveAsset(asset: MediaAsset) {
    setError("");
    setCanRetryLoad(false);
    setNotice("");
    try {
      await apiRequest(`/api/gallery/${encodeURIComponent(asset.kind)}/${encodeURIComponent(asset.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ inGallery: !galleryMode }),
      });
      setDetailAsset(null);
      setMenuOpen(false);
      await loadAssets();
      setNotice(galleryMode ? "Item moved back to Media Library." : "Item moved to Gallery.");
    } catch (requestError) {
      setCanRetryLoad(false);
      setError(requestError instanceof Error ? requestError.message : "Could not move this item.");
    }
  }

  async function deleteAsset(asset: MediaAsset) {
    if (!window.confirm(`Delete “${asset.title}”? This cannot be undone.`)) return;
    setError("");
    setCanRetryLoad(false);
    try {
      const path = asset.kind === "video"
        ? `/api/videos/jobs/${encodeURIComponent(asset.id)}`
        : asset.kind === "upload"
          ? `/api/media/uploads/${encodeURIComponent(asset.id)}`
        : asset.kind === "design"
          ? `/api/designs/${encodeURIComponent(asset.id)}`
          : `/api/content/${encodeURIComponent(asset.id)}`;
      await apiRequest(path, { method: "DELETE" });
      setDetailAsset(null);
      setMenuOpen(false);
      await loadAssets();
      setError("");
    } catch (requestError) {
      setCanRetryLoad(false);
      setError(requestError instanceof Error ? requestError.message : "Could not delete this asset.");
    }
  }

  const uploadControl = (
      <label className="button button-primary media-upload-button">
      <Upload size={16} aria-hidden="true" />{uploading ? "Uploading…" : galleryMode ? "Upload media" : "Choose from device"}
      <input aria-label="Choose an image, MP4 video, or PDF from your device" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf,.jpg,.jpeg,.png,.webp,.mp4,.pdf" disabled={uploading} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void importFile(file);
      }} />
    </label>
  );

  return (
    <section className={`dashboard-content media-library-page${galleryMode ? " gallery-page" : ""}`}>
      <header className="media-page-heading">
        <div>
          <p className="eyebrow">{importMode ? "YOUR STUDIO · IMPORT" : galleryMode ? "YOUR STUDIO · GALLERY" : "YOUR STUDIO · LIBRARY"}</p>
          <h1>{importMode ? "Import files" : galleryMode ? "Gallery" : "Media Library"}</h1>
          <p className="dashboard-lead">{importMode
        ? "Bring images, MP4 videos, or PDFs from your device into your workspace, then prepare supported media for a post."
        : galleryMode
          ? "Keep designs, content, and finished videos together for review and publishing."
          : "Find saved designs, drafts, and videos for your brand."}</p>
        </div>
        <div className="media-page-actions">
          {galleryMode && <><Link className="button button-outline" href="/dashboard/media-library">Open Media Library</Link>{uploadControl}<Link className="button button-primary" href="/dashboard/create"><Plus size={17} aria-hidden="true" />Create content</Link></>}
          {importMode && <Link className="button button-outline" href="/dashboard/media-library">Open Media Library</Link>}
          {!galleryMode && !importMode && <Link className="button button-outline" href="/dashboard/gallery">Open Gallery</Link>}
        </div>
      </header>
      {galleryMode
          ? <p className="media-upload-note"><Images size={15} aria-hidden="true" /> Images, MP4 video, and PDFs · 500 MB per file</p>
           : <div className="media-upload-panel"><div><strong>Import from your device</strong><small>Images, MP4 videos, and PDFs up to 500 MB per file. Files over 100 MB use configured S3-compatible storage.</small></div>{uploadControl}</div>}
      {uploading && uploadProgress !== null && <div className="media-upload-progress" role="status" aria-live="polite">
           <span>Uploading large file… {uploadProgress}%</span>
           <progress value={uploadProgress} max={100} aria-label="Large-file upload progress" />
      </div>}
      <div className="media-toolbar">
        <label>Search assets<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, brief or brand" /></label>
        <label>Asset type
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All saved assets</option>
            <option value="design">Designs</option>
            <option value="content">Content and scripts</option>
            <option value="video">Rendered videos and scripts</option>
            <option value="upload">Imported files</option>
          </select>
        </label>
        <span>{visibleAssets.length} assets</span>
      </div>
      {error && <div className="media-library-error"><p className="form-error" role="alert">{error}</p>{canRetryLoad && <button type="button" className="button button-outline" disabled={loading || uploading} onClick={() => void loadAssets()}>{loading ? "Retrying…" : "Retry library load"}</button>}</div>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p className="loading-label" role="status">Loading saved assets…</p> : visibleAssets.length === 0 ? (
        <article className="section-empty-state">
          <h2>{assets.length ? "No assets match your search" : galleryMode ? "Your Gallery is ready" : "Your library is ready for its first assets"}</h2>
          <p>{assets.length ? "Try a different title, brief or asset type." : galleryMode ? "Add designs here or import files from your device." : "Create content to add saved drafts and designs to this workspace."}</p>
          <Link className="button button-gold" href="/dashboard/create">Create content</Link>
        </article>
      ) : (
        <div className="media-asset-grid">
          {visibleAssets.map((asset) => (
            <article className="media-asset-card" key={`${asset.kind}-${asset.id}`}>
              <div className={`media-asset-preview${asset.kind === "video" || asset.kind === "upload" || asset.previewUrl ? "" : " media-asset-preview-copy"}`}>
                {asset.kind === "video"
                  ? <button type="button" className="media-asset-open-trigger" onClick={() => setDetailAsset(asset)} aria-label={`Open ${asset.title}`}><video src={`${apiBaseUrl}${asset.videoUrl}`} crossOrigin="use-credentials" muted preload="metadata" /></button>
                  : asset.kind === "upload" && asset.mimeType.startsWith("video/")
                    ? <button type="button" className="media-asset-open-trigger" onClick={() => setDetailAsset(asset)} aria-label={`Open ${asset.title}`}><video src={`${apiBaseUrl}${asset.fileUrl}`} crossOrigin="use-credentials" muted preload="metadata" /></button>
                  : asset.kind === "upload" && asset.mimeType.startsWith("image/")
                    ? <button type="button" className="media-asset-open-trigger" onClick={() => setDetailAsset(asset)} aria-label={`Open ${asset.title}`}><Image src={`${apiBaseUrl}${asset.fileUrl}`} width={600} height={600} unoptimized crossOrigin="use-credentials" alt={asset.title} /></button>
                  : asset.kind === "upload"
                    ? <button type="button" className="media-asset-open-trigger media-asset-preview-copy" onClick={() => setDetailAsset(asset)} aria-label={`Open ${asset.title}`}><span className="media-asset-copy-preview"><strong>PDF document</strong><span>{asset.title}</span></span></button>
                  : asset.kind === "design" && asset.document
                    ? <DesignDocumentPreview
                        document={asset.document}
                        title={asset.title}
                        compact
                        subtitle={`${asset.brand} · ${new Date(asset.createdAt).toLocaleDateString()}`}
                        modalDetails={<>
                          {asset.caption ? <p className="design-post-caption">{asset.caption}</p> : <p className="design-post-caption">{asset.description}</p>}
                          {asset.hashtags.length > 0 && <p className="design-post-hashtags">{asset.hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p>}
                          {error && <p className="form-error" role="alert">{error}</p>}
                        </>}
                        modalActions={<>
                          <button type="button" role="menuitem" onClick={() => void moveAsset(asset)}>{galleryMode ? "Move to Media Library" : "Move to Gallery"}</button>
                          {asset.generatedContentId && <Link href={`/dashboard/create?importedContentId=${encodeURIComponent(asset.generatedContentId)}`} role="menuitem">Prepare post</Link>}
                          {asset.generatedContentId && <Link href={`/dashboard/content?edit=${encodeURIComponent(asset.generatedContentId)}`} role="menuitem">Edit content</Link>}
                          <button type="button" role="menuitem" onClick={() => void duplicateAsset(asset)}>Duplicate design</button>
                          <button type="button" role="menuitem" onClick={() => void deleteAsset(asset)}>Delete design</button>
                        </>}
                      />
                  : asset.kind === "design" && asset.previewUrl
                    ? <DesignImagePreview
                        previewUrl={asset.previewUrl}
                        title={asset.title}
                        subtitle={`${asset.brand} · ${new Date(asset.createdAt).toLocaleDateString()}`}
                        modalDetails={<>
                          {asset.caption ? <p className="design-post-caption">{asset.caption}</p> : <p className="design-post-caption">{asset.description}</p>}
                          {asset.hashtags.length > 0 && <p className="design-post-hashtags">{asset.hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p>}
                          {error && <p className="form-error" role="alert">{error}</p>}
                        </>}
                        modalActions={<>
                          <button type="button" role="menuitem" onClick={() => void moveAsset(asset)}>{galleryMode ? "Move to Media Library" : "Move to Gallery"}</button>
                          {asset.generatedContentId && <Link href={`/dashboard/create?importedContentId=${encodeURIComponent(asset.generatedContentId)}`} role="menuitem">Prepare post</Link>}
                          {asset.generatedContentId && <Link href={`/dashboard/content?edit=${encodeURIComponent(asset.generatedContentId)}`} role="menuitem">Edit content</Link>}
                          <button type="button" role="menuitem" onClick={() => void duplicateAsset(asset)}>Duplicate design</button>
                          <button type="button" role="menuitem" onClick={() => void deleteAsset(asset)}>Delete design</button>
                        </>}
                      />
                  : asset.kind === "content"
                    ? <button type="button" className="media-asset-open-trigger media-asset-preview-copy" onClick={() => setDetailAsset(asset)} aria-label={`Open ${asset.title}`}><span className="media-asset-copy-preview"><strong>{asset.title}</strong><span>{asset.description}</span></span></button>
                  : <div className="media-asset-copy-preview"><strong>{asset.title}</strong><span>{asset.description}</span></div>}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="demo-banner" role="note">Imported videos and images are stored in your workspace database and can be prepared for Instagram scheduling. PDFs are saved for reference only. Other platforms remain demo-only unless a live integration is configured.</p>
      {detailAsset && detailAsset.kind !== "design" && createPortal(
        <div className="design-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailAsset(null); }}>
          <section className="design-lightbox design-post-lightbox" role="dialog" aria-modal="true" aria-label={`${detailAsset.title} details`}>
            <div className="design-post-visual media-asset-detail-content">
              {detailAsset.kind === "video"
                ? <video src={`${apiBaseUrl}${detailAsset.videoUrl}`} controls autoPlay />
                : detailAsset.kind === "upload" && detailAsset.mimeType.startsWith("video/")
                  ? <video src={`${apiBaseUrl}${detailAsset.fileUrl}`} controls autoPlay crossOrigin="use-credentials" />
                  : detailAsset.kind === "upload" && detailAsset.mimeType.startsWith("image/")
                    ? <Image src={`${apiBaseUrl}${detailAsset.fileUrl}`} width={1200} height={900} unoptimized crossOrigin="use-credentials" alt={detailAsset.title} />
                    : detailAsset.kind === "upload" && detailAsset.mimeType === "application/pdf"
                      ? <iframe src={`${apiBaseUrl}${detailAsset.fileUrl}`} title={detailAsset.title} />
                      : <div className="media-asset-copy-preview"><strong>{detailAsset.title}</strong><span>{detailAsset.description}</span></div>}
            </div>
            <aside className="design-post-details">
              <header><div><h2>{detailAsset.title}</h2><p>{detailAsset.description} · {detailAsset.brand} · {new Date(detailAsset.createdAt).toLocaleDateString()}</p></div><button type="button" aria-label="Close details" onClick={() => setDetailAsset(null)}><X size={22} /></button></header>
              <div className="design-post-copy">
                {detailAsset.kind === "content"
                  ? <><p>{detailAsset.caption || detailAsset.description}</p>{detailAsset.hashtags.length > 0 && <p className="design-post-hashtags">{detailAsset.hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p>}</>
                  : <p>{detailAsset.description}</p>}
                {error && <p className="form-error" role="alert">{error}</p>}
              </div>
              <div className="design-post-menu-wrap">
                <button type="button" className="design-post-menu-trigger" aria-label="Post options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={22} /></button>
                {menuOpen && <div className="design-post-menu" role="menu" aria-label="Post options">
                  <strong>Actions</strong>
                  {detailAsset.kind === "video"
                    ? <>
                        <a role="menuitem" href={`${apiBaseUrl}${detailAsset.videoUrl}?download=true`}>Download MP4</a>
                          <button type="button" role="menuitem" onClick={() => void moveAsset(detailAsset)}>{galleryMode ? "Move to Media Library" : "Move to Gallery"}</button>
                          <button type="button" role="menuitem" onClick={() => void deleteAsset(detailAsset)}>Delete video</button>
                        </>
                    : detailAsset.kind === "upload"
                        ? <>
                            {detailAsset.contentId && <Link href={`/dashboard/create?importedContentId=${encodeURIComponent(detailAsset.contentId)}`} role="menuitem">Prepare post</Link>}
                            <a role="menuitem" href={`${apiBaseUrl}${detailAsset.fileUrl}`} download={detailAsset.title}>Download file</a>
                            <button type="button" role="menuitem" onClick={() => void moveAsset(detailAsset)}>{galleryMode ? "Move to Media Library" : "Move to Gallery"}</button>
                            <button type="button" role="menuitem" onClick={() => void deleteAsset(detailAsset)}>Delete file</button>
                        </>
                    : <>
                          <button type="button" role="menuitem" onClick={() => void moveAsset(detailAsset)}>{galleryMode ? "Move to Media Library" : "Move to Gallery"}</button>
                          {detailAsset.kind === "content" && <Link href={`/dashboard/create?importedContentId=${encodeURIComponent(detailAsset.id)}`} role="menuitem">Prepare post</Link>}
                          <Link href={`/dashboard/content?edit=${encodeURIComponent(detailAsset.id)}`} role="menuitem">Edit content</Link>
                        <button type="button" role="menuitem" onClick={() => void duplicateAsset(detailAsset)}>Duplicate content</button>
                        <button type="button" role="menuitem" onClick={() => void deleteAsset(detailAsset)}>Delete content</button>
                      </>}
                </div>}
              </div>
            </aside>
          </section>
        </div>,
        window.document.body,
      )}
    </section>
  );
}
