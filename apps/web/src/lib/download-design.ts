import { renderDesignPageSvg, type DesignDocument } from "@united-technologies/shared/design-document";
import { brand } from "@/config/brand";

export type DesignDownloadFormat = "svg" | "png" | "jpg" | "pdf";

export async function downloadDesign(previewUrl: string, title: string, format: DesignDownloadFormat) {
  if (format === "pdf") {
    const printWindow = window.open("", "_blank");
    if (!printWindow) throw new Error("Allow pop-ups for this site to print or save a PDF.");
    printWindow.opener = null;
    printWindow.document.title = `${title} · ${brand.productName}`;
    const image = printWindow.document.createElement("img");
    image.alt = title;
    image.style.cssText = "display:block;width:min(100%,8.5in);height:auto;margin:0 auto";
    printWindow.document.body.replaceChildren(image);
    const printReady = new Promise<void>((resolve, reject) => {
      image.onload = () => {
        printWindow.print();
        resolve();
      };
      image.onerror = () => {
        printWindow.close();
        reject(new Error("Could not load this design for printing."));
      };
    });
    image.src = previewUrl;
    await printReady;
    return;
  }

  const link = document.createElement("a");
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${format}`;
  if (format === "svg") {
    link.href = previewUrl;
    link.click();
    return;
  }

  const image = new window.Image();
  image.src = previewUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load this design preview."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the image download.");
  context.drawImage(image, 0, 0);
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode this image.")), mimeType);
  });
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDesignPages(document: DesignDocument, title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups to export all pages as a PDF.");

  printWindow.opener = null;
  printWindow.document.title = `${title} · ${brand.productName}`;
  const style = printWindow.document.createElement("style");
  style.textContent = "@page{margin:0}body{margin:0}.design-page{display:grid;width:100%;height:100vh;place-items:center;break-after:page}.design-page:last-child{break-after:auto}.design-page img{display:block;width:100%;height:100%;object-fit:contain}";
  printWindow.document.head.append(style);

  const images = document.pages.map((page, index) => {
    const wrapper = printWindow.document.createElement("section");
    wrapper.className = "design-page";
    wrapper.style.aspectRatio = `${page.width}/${page.height}`;
    const image = printWindow.document.createElement("img");
    image.alt = `${title}, page ${index + 1}`;
    image.src = renderDesignPageSvg(document, index);
    wrapper.append(image);
    printWindow.document.body.append(wrapper);
    return image;
  });

  await Promise.all(images.map((image) => new Promise<void>((resolve, reject) => {
    if (image.complete) {
      if (image.naturalWidth > 0) resolve();
      else reject(new Error("Could not load a page for PDF export."));
      return;
    }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load a page for PDF export."));
  })));
  printWindow.focus();
  printWindow.print();
}
