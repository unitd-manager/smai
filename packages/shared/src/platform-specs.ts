export const platformSpecs = {
  Instagram: {
    captionCharacters: 2200,
    hashtags: 5,
    formats: ["image", "carousel", "Reel", "story"],
    imageRatios: ["1:1", "4:5", "1.91:1", "9:16"],
    videoMaxSeconds: 180,
    source: "https://help.instagram.com/",
  },
  Facebook: {
    captionCharacters: 63206,
    hashtags: 10,
    formats: ["image", "carousel", "video", "story", "text"],
    imageRatios: ["1:1", "4:5", "1.91:1", "9:16"],
    videoMaxSeconds: 3600,
    source: "https://www.facebook.com/business/help",
  },
  LinkedIn: {
    captionCharacters: 3000,
    hashtags: 5,
    formats: ["image", "carousel", "video", "document", "text"],
    imageRatios: ["1:1", "4:5", "1.91:1"],
    videoMaxSeconds: 600,
    source: "https://www.linkedin.com/help/linkedin/",
  },
  TikTok: {
    captionCharacters: 2200,
    hashtags: 5,
    formats: ["video", "story", "image"],
    imageRatios: ["9:16", "1:1", "16:9"],
    videoMaxSeconds: 600,
    source: "https://support.tiktok.com/en/using-tiktok/creating-videos/making-a-post",
  },
  YouTube: {
    titleCharacters: 100,
    captionCharacters: 5000,
    hashtags: 3,
    formats: ["Short", "video"],
    imageRatios: ["16:9", "9:16"],
    videoMaxSeconds: 180,
    source: "https://support.google.com/youtube/",
  },
  Pinterest: {
    titleCharacters: 100,
    captionCharacters: 500,
    hashtags: 5,
    formats: ["image", "video", "carousel"],
    imageRatios: ["2:3", "1:1", "9:16"],
    videoMaxSeconds: 900,
    source: "https://help.pinterest.com/",
  },
  X: {
    captionCharacters: 280,
    hashtags: 3,
    formats: ["image", "video", "text"],
    imageRatios: ["1:1", "16:9"],
    videoMaxSeconds: 140,
    source: "https://help.x.com/en/using-x",
  },
  "Google Business": {
    captionCharacters: 1500,
    hashtags: 3,
    formats: ["image", "video"],
    imageRatios: ["1:1", "4:5", "16:9"],
    videoMaxSeconds: 30,
    source: "https://support.google.com/business/",
  },
} as const;

export const platformRules = {
  lastReviewed: "2026-11-24",
  note: "These eight channels are selected for broad business-marketing utility and official publishing APIs. Selection does not imply an integration is enabled: Instagram is the only live social publisher currently implemented; other channels remain draft-only until their official API, OAuth review, and publishing adapters are completed.",
  platforms: platformSpecs,
} as const;

export const videoPlatformLimits = {
  lastReviewed: platformRules.lastReviewed,
  note: platformRules.note,
  platforms: {
    Instagram: { maxSeconds: platformSpecs.Instagram.videoMaxSeconds, source: platformSpecs.Instagram.source },
    "YouTube Shorts": { maxSeconds: platformSpecs.YouTube.videoMaxSeconds, source: platformSpecs.YouTube.source },
    TikTok: { maxSeconds: platformSpecs.TikTok.videoMaxSeconds, source: platformSpecs.TikTok.source },
  },
} as const;
