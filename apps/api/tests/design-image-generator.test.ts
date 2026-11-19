import assert from "node:assert/strict";
import test from "node:test";
import { renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { buildImageDesignPrompt, createAiDesignDocument, imageAspectRatio, sanitizeGroqArtworkSvg, type DesignCopy } from "../src/services/design-image-generator.js";

const copy: DesignCopy = {
  headline: "Ideas that take off",
  supportingLine: "Creative campaigns for growing brands.",
  callToAction: "LET’S BUILD SOMETHING",
  sections: Array.from({ length: 6 }, (_, index) => ({ title: `Section ${index + 1}`, body: "A clear, thoughtful way to help your customers move forward." })),
};

test("image-art prompts preserve user direction and include explicit platform icon requests", () => {
  const prompt = buildImageDesignPrompt({
    prompt: "A sculpted rocket with a glowing Instagram icon and violet sparks.",
    format: "flyer",
    brandName: "North Studio",
    brandContext: ["creative services"],
    colors: ["#243B72", "#20A4F3"],
  });
  assert.match(prompt, /sculpted rocket with a glowing Instagram icon/);
  assert.match(prompt, /Include recognizable logos, social platform marks, or specific symbols only when the user explicitly asks/);
  assert.match(prompt, /creative services/);
});

test("AI flyer artwork is saved as an editable image-backed design document", () => {
  const document = createAiDesignDocument({
    id: "ai-flyer-1", title: copy.headline, format: "flyer", brandName: "North Studio",
    colors: ["#243B72", "#20A4F3", "#F7F6F0"], fonts: ["Display Face", "Body Face"],
    imageData: Buffer.from("compressed-art-fixture"), copy, prompt: "A 3D rocket for a launch campaign", model: "test-image-model",
  });
  assert.equal(document.pages.length, 1);
  assert.equal(document.pages[0]?.width, 2550);
  assert.equal(document.pages[0]?.layers.find((layer) => layer.id === "ai-artwork")?.type, "image");
  assert.equal(document.pages[0]?.layers.find((layer) => layer.id === "headline")?.type, "text");
  assert.match(renderDesignPageSvg(document), /^data:image\/svg\+xml/);
});

test("AI brochure generation creates two landscape print sides", () => {
  const document = createAiDesignDocument({
    id: "ai-brochure-1", title: copy.headline, format: "brochure", brandName: "North Studio",
    colors: ["#243B72", "#20A4F3", "#F7F6F0"], fonts: [],
    imageData: Buffer.from("compressed-art-fixture"), copy, prompt: "A brochure for a creative agency", model: "test-image-model",
  });
  assert.equal(document.pages.length, 2);
  assert.equal(document.pages[0]?.width, 3300);
  assert.equal(document.pages[0]?.height, 2550);
  assert.equal(document.pages[1]?.layers.filter((layer) => layer.id.startsWith("inside-heading-")).length, 6);
});

test("image generation chooses a matching composition ratio for each output format", () => {
  assert.equal(imageAspectRatio("flyer"), "3:4");
  assert.equal(imageAspectRatio("brochure"), "16:9");
  assert.equal(imageAspectRatio("story"), "9:16");
  assert.equal(imageAspectRatio("brochure"), "4:3");
  assert.equal(imageAspectRatio("pinterest-pin"), "2:3");
});

test("Groq SVG artwork is restricted to local vector markup and gets the selected canvas size", () => {
  const svg = sanitizeGroqArtworkSvg('<svg><defs><linearGradient id="sky"><stop offset="0" stop-color="#3024b8"/></linearGradient></defs><rect width="1024" height="1365" fill="url(#sky)"/><path d="M 100 900 L 500 200 L 900 900 Z" fill="#fff"/></svg>', "flyer").toString();
  assert.match(svg, /width="1024" height="1365" viewBox="0 0 1024 1365"/);
  assert.match(svg, /linearGradient/);
  assert.throws(() => sanitizeGroqArtworkSvg('<svg><script>alert(1)</script></svg>', "flyer"), /unsupported SVG/);
  assert.throws(() => sanitizeGroqArtworkSvg('<svg><image href="https:\/\/example.com\/image.png"/></svg>', "flyer"), /unsupported SVG/);
});
