import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { brand } from "@/config/brand";

type LogoProps = {
  variant?: "light" | "dark";
  className?: string;
  markOnly?: boolean;
};

export function Logo({ variant = "light", className = "", markOnly = false }: LogoProps) {
  const src = variant === "light" ? brand.logo.light : brand.logo.dark;
  const assetPath = path.join(process.cwd(), "public", src.replace(/^\//, ""));

  if (!existsSync(assetPath)) {
    return (
      <span className={`logo-fallback ${className}`} aria-label={brand.companyName}>
        {brand.companyName}
      </span>
    );
  }

  return (
    <span className={`brand-lockup${markOnly ? " brand-lockup-mark-only" : ""} ${className}`}>
      <Image
        src={src}
        alt={markOnly ? brand.companyName : ""}
        aria-hidden={markOnly ? undefined : true}
        className="brand-logo"
        width={40}
        height={40}
      />
      {!markOnly && (
        <span className="brand-lockup-copy">
          <strong>{brand.companyName}</strong>
          {brand.productName !== brand.companyName && <small>{brand.productName}</small>}
        </span>
      )}
    </span>
  );
}
