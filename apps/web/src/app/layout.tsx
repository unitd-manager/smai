import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { ThemePreferenceProvider } from "@/components/theme-preference-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.websiteUrl),
  icons: {
    icon: [{ url: brand.logo.favicon, type: "image/svg+xml" }],
    shortcut: brand.logo.favicon,
  },
  title: {
    default: `${brand.productName} | ${brand.tagline}`,
    template: `%s | ${brand.productName}`,
  },
  description: brand.tagline,
  openGraph: {
    title: brand.productName,
    description: brand.tagline,
    siteName: brand.productName,
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfairDisplay.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      data-theme-preset="midnight-blue-purple"
      data-theme-mode="dark"
      data-app-theme="dark"
      data-theme-sidebar="colored"
      data-theme-density="comfortable"
      data-theme-corners="rounded"
      data-theme-font="modern"
      data-theme-card-style="bordered"
    >
      <body className="min-h-full flex flex-col">
        <ThemePreferenceProvider>{children}</ThemePreferenceProvider>
      </body>
    </html>
  );
}
