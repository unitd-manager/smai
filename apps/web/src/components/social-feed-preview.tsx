"use client";

import Image from "next/image";
import { platformSpecs } from "@united-technologies/shared/platform-specs";

export function SocialFeedPreview({
  platforms,
  title,
  imageSrc,
  captions,
}: {
  platforms: string[];
  title: string;
  imageSrc: string | null;
  captions: Record<string, string>;
}) {
  return (
    <details className="social-feed-preview">
      <summary>Preview platform feeds <small>Illustrative layout</small></summary>
      <div className="social-feed-grid">
        {platforms.map((platform) => {
          const spec = platformSpecs[platform as keyof typeof platformSpecs];
          const ratio = spec?.imageRatios[0] ?? "1:1";
          return (
            <article className="social-feed-card" key={platform} aria-label={`${platform} feed preview`}>
              <header><span aria-hidden="true">{platform.slice(0, 1)}</span><div><strong>Your account</strong><small>{platform}</small></div></header>
              <div className="social-feed-art" style={{ aspectRatio: ratio.replace(":", " / ") }}>
                {imageSrc
                  ? <Image src={imageSrc} alt={`${title} creative preview for ${platform}`} width={800} height={800} unoptimized />
                  : <span>{title}</span>}
              </div>
              <div className="social-feed-copy">
                <strong>{title}</strong>
                <p>{captions[platform] ?? "Caption preview unavailable."}</p>
                <small>{ratio} ratio guidance · review in the native platform before publishing</small>
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}
