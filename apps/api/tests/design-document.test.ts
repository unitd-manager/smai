import assert from "node:assert/strict";
import test from "node:test";
import { createDesignDocument, fitTextToBox, parseDesignDocument, renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { createVideoDesignDocument } from "../src/services/video-renderer.js";

test("design document preserves the selected layout and palette across generated variants", () => {
  const first = createDesignDocument({
    id: "design-one",
    title: "A thoughtful service",
    format: "post",
    colors: ["#253746", "#C6A477", "#F8F5F0"],
    variant: 0,
    templateId: "starter-post-1",
    template: { layout: "split" },
  });
  const second = createDesignDocument({
    id: "design-two",
    title: "A thoughtful service",
    format: "post",
    colors: ["#253746", "#C6A477", "#F8F5F0"],
    variant: 1,
    templateId: "starter-post-1",
    template: { layout: "split" },
  });
  assert.equal(first.templateId, "starter-post-1");
  assert.equal(first.pages[0]?.width, 1080);
  assert.equal(first.pages[0]?.height, 1080);
  assert.deepEqual(first.pages[0]?.background, second.pages[0]?.background);
  assert.equal(first.pages[0]?.layers[0]?.x, second.pages[0]?.layers[0]?.x);
});

test("saved brand typefaces are applied to generated design headings and body copy", () => {
  const document = createDesignDocument({
    id: "brand-font-design",
    title: "Seasonal update",
    format: "post",
    colors: ["#253746", "#C6A477", "#F8F5F0"],
    fonts: ["Brand Display", "Brand Text"],
    content: { brandName: "Juniper House", caption: "Seasonal dishes made with care." },
  });
  const layers = document.pages[0]?.layers ?? [];
  assert.equal(layers.find((layer) => layer.id === "headline")?.fontFamily, "Brand Display");
  assert.equal(layers.find((layer) => layer.id === "supporting-copy")?.fontFamily, "Brand Text");
});

test("shared SVG renderer escapes text and honors the document page dimensions", () => {
  const document = createDesignDocument({
    id: "safe-design",
    title: "<script>alert(1)</script>",
    format: "story",
    colors: ["#253746", "#C6A477", "#F8F5F0"],
  });
  const dataUrl = renderDesignPageSvg(document);
  const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
  assert.match(svg, /width="1080" height="1920"/);
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
});

test("SVG text auto-fits long headlines inside their design boxes without truncating copy", () => {
  const longCopy = "ExceptionallyLongBusinessName ".repeat(35);
  const fitted = fitTextToBox(longCopy, 56, 140, 42);
  assert.ok(fitted.lines.length > 1, "long unbroken words should wrap instead of overflowing");
  assert.ok(fitted.fontSize < 56, "the font should shrink to fit vertically");
  assert.ok(fitted.lines.length * fitted.lineHeight <= 42, "all wrapped lines should remain inside the text box");
  assert.equal(fitted.lines.join("").replaceAll(" ", ""), longCopy.replaceAll(/\s/g, ""), "fitting should preserve all text");
});

test("starter template layouts produce different page compositions, not just different palette labels", () => {
  const layouts = ["editorial", "split", "bold", "collage", "framed", "magazine", "type-led", "triptych", "spotlight", "grid", "sparkle", "radiant"];
  const compositions = layouts.map((layout, index) => {
    const document = createDesignDocument({
      id: `layout-${index}`,
      title: "A useful business idea",
      format: "post",
      colors: ["#123a70", "#2563eb", "#ffffff"],
      template: { layout },
    });
    const headline = document.pages[0]?.layers.find((layer) => layer.id === "headline");
    assert.ok(headline);
    return `${headline.x}:${headline.y}:${headline.width}:${headline.height}:${headline.type === "text" ? headline.fontSize : 0}:${headline.type === "text" ? headline.align : ""}`;
  });
  assert.equal(new Set(compositions).size, layouts.length);
});

test("carousel design documents contain navigable pages with the generated slide copy", () => {
  const slides = [
    { headline: "Open with a clear hook", subheading: "Earn the next swipe", body: "Start with a useful promise." },
    { headline: "Show the audience challenge", subheading: "Name the need", body: "Describe the real situation." },
    { headline: "Explain the useful insight", subheading: "Make it clear", body: "Share one practical idea." },
    { headline: "Share a practical step", subheading: "Make it actionable", body: "Give the reader a next step." },
    { headline: "Make the result clear", subheading: "Show the value", body: "Explain the expected benefit." },
    { headline: "Invite the next action", subheading: "Close with purpose", body: "Tell the reader what to do next." },
  ];
  const document = createDesignDocument({
    id: "carousel-test",
    title: "A useful six-step guide",
    format: "carousel",
    colors: ["#123a70", "#2563eb", "#ffffff"],
    templateId: "starter-carousel-1",
    template: { layout: "collage" },
    content: { brandName: "Example Studio", caption: "Useful ideas for growing teams.", slides },
  });
  assert.equal(document.pages.length, 6);
  assert.equal(document.templateId, "starter-carousel-1");
  assert.ok(document.pages.every((page) => page.width === 1080 && page.height === 1080));
  for (const [index, slide] of slides.entries()) {
    const renderedPage = decodeURIComponent(renderDesignPageSvg(document, index));
    const renderedText = [...renderedPage.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)]
      .map((match) => match[1])
      .join(" ");
    assert.ok(renderedText.includes(slide.headline), `page ${index + 1} should render its headline`);
    assert.ok(renderedText.includes(slide.subheading), `page ${index + 1} should render its subheading`);
    assert.ok(renderedText.includes(slide.body), `page ${index + 1} should render its body`);
    if (index > 0) assert.ok(!renderedPage.includes("Useful ideas for growing teams."));
    assert.ok(document.pages[index]?.layers.some((layer) => layer.id === "subheading"));
  }
  const finalSlideSvg = decodeURIComponent(renderDesignPageSvg(document, 5));
  assert.ok(finalSlideSvg.includes("Invite the"));
  assert.ok(finalSlideSvg.includes("next action"));
});

test("a selected template with no supported layout uses a stable editorial layout", () => {
  const document = createDesignDocument({
    id: "selected-template-test",
    title: "A selected template",
    format: "post",
    colors: ["#123a70", "#2563eb", "#ffffff"],
    variant: 8,
    template: { name: "Saved template", layout: "unknown-layout" },
  });
  assert.equal(document.metadata?.layout, "editorial");
});

test("flyer and brochure documents lay out the requested three and six panels", () => {
  const sections = ["Our story", "What we do", "Who we help", "How it works", "Why choose us", "Get in touch"];
  const flyer = createDesignDocument({
    id: "flyer-test",
    title: "A clear service guide",
    format: "flyer",
    colors: ["#123a70", "#2563eb", "#ffffff"],
    content: { brandName: "Example Studio", sections: sections.slice(0, 3) },
  });
  const brochure = createDesignDocument({
    id: "brochure-test",
    title: "A complete service guide",
    format: "brochure",
    colors: ["#123a70", "#2563eb", "#ffffff"],
    content: { brandName: "Example Studio", sections },
  });
  assert.equal(flyer.pages[0]?.width, 2550);
  assert.equal(flyer.pages[0]?.layers.filter((layer) => layer.type === "group").length, 3);
  assert.equal(brochure.pages[0]?.layers.filter((layer) => layer.type === "group").length, 6);
  const flyerSvg = decodeURIComponent(renderDesignPageSvg(flyer));
  const brochureSvg = decodeURIComponent(renderDesignPageSvg(brochure));
  for (const section of sections.slice(0, 3)) assert.ok(flyerSvg.includes(section));
  for (const section of sections) assert.ok(brochureSvg.includes(section));
});

test("design document validation rejects malformed page data and unknown layer types", () => {
  const document = createDesignDocument({
    id: "invalid-test",
    title: "Valid title",
    format: "post",
    colors: ["#253746", "#C6A477", "#F8F5F0"],
  });
  assert.throws(() => parseDesignDocument({ ...document, pages: [] }), /at least one page/);
  assert.throws(() => parseDesignDocument({
    ...document,
    pages: [{ ...document.pages[0]!, layers: [{ ...document.pages[0]!.layers[0]!, type: "unknown" }] }],
  }), /not supported/);
});

test("video scene and end-card pages use the same validated design document format", () => {
  const document = createVideoDesignDocument({
    id: "video-test",
    title: "A clear introduction",
    brandName: "Example Studio",
    colors: ["#253746", "#C6A477", "#F8F5F0"],
    fontFamily: "Inter",
    logoFile: "logo.png",
    scenes: [{ text: "Meet the service", caption: "Simple, clear and useful.", durationSeconds: 4 }],
    width: 1080,
    height: 1920,
  });
  assert.equal(parseDesignDocument(document).pages.length, 2);
  assert.equal(document.pages[0]?.width, 1080);
  assert.equal(document.pages[1]?.role, "closing");
  assert.match(decodeURIComponent(renderDesignPageSvg(document, 1)), /Example Studio/);
});
