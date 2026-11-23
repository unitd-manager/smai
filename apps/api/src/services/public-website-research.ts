import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { request as httpsRequest } from "node:https";

const maximumHtmlBytes = 512_000;
const maximumExcerptLength = 6_000;
const maximumRedirects = 2;
const requestTimeoutMs = 7_000;

export type PublicWebsiteResearch = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  logoUrl: string | null;
  logoText: string | null;
  excerpt: string;
  socialProfiles: Partial<Record<"Instagram" | "Facebook" | "LinkedIn" | "TikTok" | "YouTube" | "X" | "Pinterest", string>>;
  collectedAt: string;
};

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second, third] = octets;
  if (first === undefined || second === undefined || third === undefined) return false;
  return !(
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 240
  );
}

function ipv4FromMappedIpv6(address: string) {
  const match = address.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (match?.[1]) return match[1];
  const hexMatch = address.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexMatch?.[1] || !hexMatch[2]) return null;
  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return false;
  return (normalized.startsWith("2") || normalized.startsWith("3")) &&
    !normalized.startsWith("2001:0:") &&
    !normalized.startsWith("2001:2:") &&
    !normalized.startsWith("2001:10:") &&
    !normalized.startsWith("2001:db8:");
}

function decodeHtml(value: string) {
  const decodeCodePoint = (value: string, radix: number) => {
    const codePoint = Number.parseInt(value, radix);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff &&
      !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? String.fromCodePoint(codePoint)
      : "";
  };
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, decimal: string) => decodeCodePoint(decimal, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => decodeCodePoint(hex, 16));
}

function attribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find(Boolean) ?? "";
}

function normalizeText(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumExcerptLength);
}

function extractSocialProfiles(html: string): PublicWebsiteResearch["socialProfiles"] {
  const platforms: PublicWebsiteResearch["socialProfiles"] = {};
  const platformHosts: Record<string, keyof PublicWebsiteResearch["socialProfiles"]> = {
    "instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "linkedin.com": "LinkedIn",
    "tiktok.com": "TikTok",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "x.com": "X",
    "twitter.com": "X",
    "pinterest.com": "Pinterest",
  };
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const rawHref = attribute(match[0], "href");
    if (!rawHref || rawHref.startsWith("//")) continue;
    try {
      const url = new URL(rawHref);
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) continue;
      const platform = platformHosts[url.hostname.toLowerCase().replace(/^www\./, "")];
      if (platform && !platforms[platform]) {
        url.search = "";
        url.hash = "";
        platforms[platform] = url.toString();
      }
    } catch {
      continue;
    }
  }
  return platforms;
}

export function extractPublicWebsite(html: string, url: string): Omit<PublicWebsiteResearch, "finalUrl" | "collectedAt"> {
  const withoutHidden = html.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const titleTag = withoutHidden.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "";
  const metaDescription = [...withoutHidden.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .find((tag) => /(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag));
  const title = normalizeText(titleTag) || null;
  const description = metaDescription ? normalizeText(attribute(metaDescription, "content")) || null : null;
  const baseUrl = new URL(url);
  const safeLogoUrl = (value: string) => {
    try {
      const logo = new URL(decodeHtml(value.trim()), baseUrl);
      if (logo.protocol !== "https:" || logo.username || logo.password || logo.pathname === "/") return null;
      return logo.toString();
    } catch { return null; }
  };
  const metaTags = [...withoutHidden.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
  const logoMeta = metaTags.find((tag) => /(?:property|itemprop|name)\s*=\s*["'](?:og:logo|logo|brand-logo)["']/i.test(tag));
  const linkTags = [...withoutHidden.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag);
  const logoLink = linkTags.find((tag) => /\brel\s*=\s*["'][^"']*\b(?:logo|apple-touch-icon)\b/i.test(tag));
  const iconLink = linkTags.find((tag) => /\brel\s*=\s*["'][^"']*\bicon\b/i.test(tag));
  const images = [...withoutHidden.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => tag);
  const imageSource = (tag: string) => attribute(tag, "src") || attribute(tag, "data-src") || attribute(tag, "data-lazy-src") || attribute(tag, "data-original") || attribute(tag, "srcset").split(/[\s,]/)[0] || "";
  const logoImage = images.find((tag) => /(?:alt|class|id|src|data-src|data-lazy-src)\s*=\s*["'][^"']*logo[^"']*["']/i.test(tag))
    || (withoutHidden.match(/<header\b[^>]*>([\s\S]*?)<\/header\s*>/i)?.[1] ?? "").match(/<img\b[^>]*>/i)?.[0]
    || "";
  const logoMarkMatch = withoutHidden.match(/<(?:span|div|b|strong)\b[^>]*class\s*=\s*["'][^"']*\bmark\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|b|strong)\s*>/i);
  const logoText = logoMarkMatch ? normalizeText(logoMarkMatch[1] ?? "").slice(0, 12) || null : null;
  const structuredLogo = [...withoutHidden.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .flatMap(([, raw]) => {
      try {
        const parsed: unknown = JSON.parse(raw ?? "");
        const pending: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
        const found: string[] = [];
        while (pending.length) {
          const item = pending.pop();
          if (!item || typeof item !== "object") continue;
          if (Array.isArray(item)) { pending.push(...item); continue; }
          const record = item as Record<string, unknown>;
          const logo = record.logo;
          if (typeof logo === "string") found.push(logo);
          else if (logo && typeof logo === "object") {
            const logoUrl = (logo as Record<string, unknown>).url;
            if (typeof logoUrl === "string") found.push(logoUrl);
          }
          pending.push(...Object.values(record).filter((value) => value && typeof value === "object"));
        }
        return found;
      } catch { return []; }
    })[0];
  const logoUrl = safeLogoUrl(logoMeta ? attribute(logoMeta, "content") : "")
    ?? safeLogoUrl(structuredLogo ?? "")
    ?? safeLogoUrl(logoLink ? attribute(logoLink, "href") : "")
    ?? safeLogoUrl(logoImage ? imageSource(logoImage) : "")
    ?? safeLogoUrl(attribute(metaTags.find((tag) => /(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(tag)) ?? "", "content"))
    ?? safeLogoUrl(iconLink ? attribute(iconLink, "href") : "");
  const body = withoutHidden.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? withoutHidden;
  return {
    url,
    title,
    description,
    logoUrl,
    logoText,
    excerpt: normalizeText(body),
    socialProfiles: extractSocialProfiles(withoutHidden),
  };
}

function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(hostname) || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Website research only supports public domain names.");
  }
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        reject(new Error("Could not resolve the public website host."));
        return;
      }
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        reject(new Error("Website host does not resolve exclusively to public IP addresses."));
        return;
      }
      const selected = addresses[0];
      if (!selected) {
        reject(new Error("Could not resolve the public website host."));
        return;
      }
      resolve({ address: selected.address, family: selected.family as 4 | 6 });
    });
  });
}

function requestHtml(url: URL, address: { address: string; family: 4 | 6 }): Promise<{ html: string; redirect?: string; truncated?: true }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (typeof options === "object" && options !== null && "all" in options && options.all) {
        callback(null, [{ address: address.address, family: address.family }]);
      } else {
        callback(null, address.address, address.family);
      }
    };
    const request = httpsRequest(url, {
      method: "GET",
      lookup: pinnedLookup,
      headers: {
        "User-Agent": "SMAI-Competitor-Research/1.0 (+public homepage metadata only)",
        Accept: "text/html,application/xhtml+xml;q=0.9",
        "Accept-Encoding": "identity",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = response.headers.location;
        response.resume();
        resolve({ html: "", ...(location ? { redirect: location } : {}) });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Website returned HTTP ${status}.`));
        return;
      }
      const contentType = response.headers["content-type"] ?? "";
      if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
        response.resume();
        reject(new Error("Website did not return an HTML page."));
        return;
      }
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const finish = (truncated = false) => {
        if (settled) return;
        settled = true;
        const html = Buffer.concat(chunks).toString("utf8");
        resolve({ html, ...(truncated ? { truncated: true } : {}) });
      };
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = maximumHtmlBytes - totalBytes;
        if (buffer.length > remaining) {
          if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
          totalBytes = maximumHtmlBytes;
          finish(true);
          response.destroy();
          return;
        }
        totalBytes += buffer.length;
        chunks.push(buffer);
      });
      response.on("end", () => finish());
      response.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    });
    request.setTimeout(requestTimeoutMs, () => request.destroy(new Error("Website request timed out.")));
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.end();
  });
}

function validateWebsiteUrl(value: string, homepageOnly = false) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Automatic website research requires a public HTTPS URL on the standard port.");
  }
  if (homepageOnly) url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export async function researchPublicWebsite(value: string): Promise<PublicWebsiteResearch> {
  let url = validateWebsiteUrl(value, true);
  const requestedUrl = url.toString();
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const address = await resolvePublicAddress(url.hostname);
    const response = await requestHtml(url, address);
    if (response.redirect) {
      if (redirects === maximumRedirects) throw new Error("Website redirected too many times.");
      url = validateWebsiteUrl(new URL(response.redirect, url).toString());
      continue;
    }
    const extracted = extractPublicWebsite(response.html, requestedUrl);
    return {
      ...extracted,
      excerpt: response.truncated ? `[Homepage scan capped at 512 KB.] ${extracted.excerpt}`.slice(0, maximumExcerptLength) : extracted.excerpt,
      finalUrl: url.toString(),
      collectedAt: new Date().toISOString(),
    };
  }
  throw new Error("Could not complete website research.");
}
