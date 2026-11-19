import { platformSpecs } from "@united-technologies/shared/platform-specs";

export type PostQualityIssue = {
  severity: "error" | "warning" | "tip";
  code: string;
  platform?: string;
  message: string;
};

export type PostQualityReport = {
  score: number;
  passed: boolean;
  issues: PostQualityIssue[];
};

export function checkPostQuality(
  platforms: string[],
  captions: Record<string, string>,
  bannedWords: string[] = [],
): PostQualityReport {
  const issues: PostQualityIssue[] = [];
  const normalizedCaptions = new Set<string>();

  if (platforms.length === 0) {
    issues.push({
      severity: "error",
      code: "missing-platform",
      message: "Choose at least one platform before scheduling, publishing, or requesting approval.",
    });
  }

  for (const platform of platforms) {
    const caption = captions[platform]?.trim() ?? "";
    if (!caption) {
      issues.push({
        severity: "error",
        code: "missing-caption",
        platform,
        message: `${platform} needs a caption before it can be scheduled or published.`,
      });
      continue;
    }
    for (const bannedWord of bannedWords) {
      if (bannedWord && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(bannedWord)}($|[^\\p{L}\\p{N}])`, "iu").test(caption)) {
        issues.push({
          severity: "error",
          code: "banned-word",
          platform,
          message: `This caption contains the brand-banned word or phrase "${bannedWord}".`,
        });
      }
    }

    if (/\b(?:guarantee(?:d|s)? results?|risk[- ]free|cure[ds]?|100%\s*(?:effective|guaranteed)|best in the world)\b/i.test(caption)) {
      issues.push({
        severity: "error",
        code: "unverified-claim",
        platform,
        message: "This caption may contain an absolute or unsupported claim. Verify the claim or rewrite it before publishing.",
      });
    }
    if (/\b(?:lorem ipsum|insert (?:text|link|name)|your company here|sample text|tbd)\b/i.test(caption)) {
      issues.push({
        severity: "error",
        code: "placeholder-copy",
        platform,
        message: "Replace placeholder text with approved, customer-facing copy.",
      });
    }

    const spec = Object.hasOwn(platformSpecs, platform)
      ? platformSpecs[platform as keyof typeof platformSpecs]
      : undefined;
    if (!spec) {
      issues.push({
        severity: "warning",
        code: "unverified-platform",
        platform,
        message: `No current platform guidance is configured for ${platform}; confirm its publishing requirements.`,
      });
    } else if ("captionCharacters" in spec && caption.length > spec.captionCharacters) {
      issues.push({
        severity: "error",
        code: "caption-too-long",
        platform,
        message: `${platform} captions are limited to ${spec.captionCharacters} characters in this editor; shorten this caption.`,
      });
    }

    const hashtagCount = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
    if (spec && hashtagCount > spec.hashtags) {
      issues.push({
        severity: "warning",
        code: "hashtag-count",
        platform,
        message: `${platform} has ${hashtagCount} hashtags; the configured recommendation is ${spec.hashtags}.`,
      });
    }
    if (!/(?:book|buy|call|contact|discover|download|explore|follow|learn|order|register|shop|sign up|visit|watch|write|try|dm|message|link in bio)\b/i.test(caption)) {
      issues.push({
        severity: "tip",
        code: "missing-call-to-action",
        platform,
        message: `Consider adding a clear next step to the ${platform} caption.`,
      });
    }
    const normalized = caption.toLocaleLowerCase().replace(/\s+/g, " ");
    if (normalizedCaptions.has(normalized)) {
      issues.push({
        severity: "warning",
        code: "duplicate-platform-copy",
        platform,
        message: `This caption matches another platform version; consider tailoring it for ${platform}.`,
      });
    }
    normalizedCaptions.add(normalized);
    if ((caption.match(/\p{Extended_Pictographic}/gu) ?? []).length > 8) {
      issues.push({
        severity: "warning",
        code: "emoji-overload",
        platform,
        message: `This caption uses many emoji. Review whether they support the brand voice.`,
      });
    }
  }

  const score = Math.max(0, 100 - issues.reduce((total, issue) =>
    total + (issue.severity === "error" ? 20 : issue.severity === "warning" ? 8 : 2), 0));
  return { score, passed: !issues.some((issue) => issue.severity === "error"), issues };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
