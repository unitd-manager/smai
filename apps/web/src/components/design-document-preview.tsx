"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, MoreHorizontal, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { renderDesignPageSvg, type DesignDocument } from "@united-technologies/shared/design-document";
import { downloadDesign, downloadDesignPages, type DesignDownloadFormat } from "@/lib/download-design";

export function DesignImagePreview({
  previewUrl,
  title,
  subtitle,
  modalDetails,
  modalActions,
}: {
  previewUrl: string;
  title: string;
  subtitle: string;
  modalDetails?: ReactNode;
  modalActions?: ReactNode;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) return;
    function handleViewerKeys(event: KeyboardEvent) {
      if (event.key === "Escape") setViewerOpen(false);
    }
    window.addEventListener("keydown", handleViewerKeys);
    return () => window.removeEventListener("keydown", handleViewerKeys);
  }, [viewerOpen]);

  async function download(format: DesignDownloadFormat) {
    try {
      await downloadDesign(previewUrl, title, format);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not download this image.");
    }
  }

  return (
    <>
      <button type="button" className="design-image-preview-trigger" onClick={() => setViewerOpen(true)} aria-label={`Open ${title} preview`}>
        <Image src={previewUrl} alt={title} fill unoptimized sizes="(max-width: 700px) 100vw, 600px" />
      </button>
      {viewerOpen && createPortal(
        <div className="design-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerOpen(false); }}>
          <section className="design-lightbox design-post-lightbox" role="dialog" aria-modal="true" aria-label={`${title} preview`}>
            <div className="design-post-visual"><div className="design-image-lightbox-frame"><Image className="design-image-lightbox-image" src={previewUrl} alt={title} fill unoptimized sizes="(max-width: 700px) 100vw, 700px" /></div></div>
            <aside className="design-post-details">
              <header><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" aria-label="Close preview" onClick={() => setViewerOpen(false)}><X size={22} /></button></header>
              <div className="design-post-copy">{modalDetails ?? <p>Saved design preview</p>}</div>
              <div className="design-post-menu-wrap">
                <button type="button" className="design-post-menu-trigger" aria-label="Post options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={22} /></button>
                {menuOpen && <div className="design-post-menu" role="menu" aria-label="Post options">
                  <strong>Download</strong>
                  <button type="button" role="menuitem" onClick={() => void download("png")}>PNG</button>
                  <button type="button" role="menuitem" onClick={() => void download("jpg")}>JPEG</button>
                  <button type="button" role="menuitem" onClick={() => void download("pdf")}>PDF</button>
                  {modalActions}
                </div>}
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </aside>
          </section>
        </div>,
        window.document.body,
      )}
    </>
  );
}

export function DesignDocumentPreview({
  document,
  title,
  compact = false,
  subtitle,
  modalDetails,
  modalActions,
}: {
  document: DesignDocument;
  title: string;
  compact?: boolean;
  subtitle?: string;
  modalDetails?: ReactNode;
  modalActions?: ReactNode;
}) {
  const [activePage, setActivePage] = useState(0);
  const [error, setError] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pageIndex = Math.min(activePage, document.pages.length - 1);
  const page = document.pages[pageIndex];

  useEffect(() => {
    if (!viewerOpen) return;
    function handleViewerKeys(event: KeyboardEvent) {
      if (event.key === "Escape") setViewerOpen(false);
      if (event.key === "ArrowLeft") setActivePage((current) => Math.max(0, current - 1));
      if (event.key === "ArrowRight") setActivePage((current) => Math.min(document.pages.length - 1, current + 1));
    }
    window.addEventListener("keydown", handleViewerKeys);
    return () => window.removeEventListener("keydown", handleViewerKeys);
  }, [document.pages.length, viewerOpen]);
  if (!page) return null;

  async function downloadPage(format: DesignDownloadFormat) {
    try {
      await downloadDesign(renderDesignPageSvg(document, pageIndex), `${title}-page-${pageIndex + 1}`, format);
      setError("");
      setDownloadOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not download this design page.");
    }
  }

  async function downloadAllPages() {
    try {
      await downloadDesignPages(document, title);
      setError("");
      setDownloadOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not export all design pages.");
    }
  }

  return (
    <div className="design-document-preview">
      <button type="button" className="design-document-page-trigger" onClick={() => setViewerOpen(true)} aria-label={`Open ${title} preview`}>
        <span className="design-document-page" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
          <Image
            src={renderDesignPageSvg(document, pageIndex)}
            alt={`${title}, page ${pageIndex + 1} of ${document.pages.length}`}
            width={page.width}
            height={page.height}
            unoptimized
          />
          {document.pages.length > 1 && <span className="design-document-page-count">Page {pageIndex + 1} of {document.pages.length}</span>}
        </span>
      </button>
      {!compact && document.pages.length > 1 && (
        <div className="design-document-pager" aria-label="Carousel page navigation">
          <button type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setActivePage((current) => Math.max(0, current - 1))}><ChevronLeft size={17} /></button>
          <span>Page {pageIndex + 1} of {document.pages.length}</span>
          <button type="button" aria-label="Next page" disabled={pageIndex === document.pages.length - 1} onClick={() => setActivePage((current) => Math.min(document.pages.length - 1, current + 1))}><ChevronRight size={17} /></button>
        </div>
      )}
      {!compact && <div className="design-document-download">
        <button type="button" className="design-document-download-trigger" aria-expanded={downloadOpen} onClick={() => setDownloadOpen((open) => !open)}><Download size={15} /> Download</button>
        {downloadOpen && (
          <div className="design-document-download-menu" role="group" aria-label="Choose download format">
            <button type="button" onClick={() => void downloadPage("png")}>PNG image</button>
            <button type="button" onClick={() => void downloadPage("jpg")}>JPEG image</button>
            <button type="button" onClick={() => void downloadPage("svg")}>SVG file</button>
            <button type="button" onClick={() => void downloadPage("pdf")}>Print / save current page as PDF</button>
            {document.pages.length > 1 && <button type="button" onClick={() => void downloadAllPages()}>Print / save all pages as PDF</button>}
          </div>
        )}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {viewerOpen && createPortal(
        <div className="design-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerOpen(false); }}>
          <section className="design-lightbox design-post-lightbox" role="dialog" aria-modal="true" aria-label={`${title} preview`}>
            <div className="design-post-visual">
              <div className="design-lightbox-stage">
                {document.pages.length > 1 && <button type="button" className="design-lightbox-arrow is-previous" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setActivePage((current) => Math.max(0, current - 1))}><ChevronLeft size={28} /></button>}
                <div className="design-lightbox-image" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                  <Image src={renderDesignPageSvg(document, pageIndex)} alt={`${title}, page ${pageIndex + 1}`} width={page.width} height={page.height} unoptimized />
                </div>
                {document.pages.length > 1 && <button type="button" className="design-lightbox-arrow is-next" aria-label="Next page" disabled={pageIndex === document.pages.length - 1} onClick={() => setActivePage((current) => Math.min(document.pages.length - 1, current + 1))}><ChevronRight size={28} /></button>}
              </div>
              {document.pages.length > 1 && <nav className="design-lightbox-pages" aria-label="Carousel pages">{document.pages.map((item, index) => <button type="button" key={item.id} aria-current={index === pageIndex ? "page" : undefined} onClick={() => setActivePage(index)}>{index + 1}</button>)}</nav>}
            </div>
            <aside className="design-post-details">
              <header><div><h2>{title}</h2><p>{subtitle ? `${subtitle} · ` : ""}{document.pages.length > 1 ? `Page ${pageIndex + 1} of ${document.pages.length}` : "Design preview"}</p></div><button type="button" aria-label="Close preview" onClick={() => setViewerOpen(false)}><X size={22} /></button></header>
              {modalDetails && <div className="design-post-copy">{modalDetails}</div>}
              <div className="design-post-menu-wrap">
                <button type="button" className="design-post-menu-trigger" aria-label="Post options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={22} /></button>
                {menuOpen && <div className="design-post-menu" role="menu" aria-label="Post options">
                  <strong>Download current page</strong>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void downloadPage("png"); }}>PNG</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void downloadPage("jpg"); }}>JPEG</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void downloadPage("svg"); }}>SVG</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void downloadPage("pdf"); }}>PDF</button>
                  {document.pages.length > 1 && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void downloadAllPages(); }}>Download carousel · PDF</button>}
                  {modalActions}
                </div>}
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </aside>
          </section>
        </div>,
        window.document.body,
      )}
    </div>
  );
}
