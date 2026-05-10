import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { Providers } from "./providers";

import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { BRAND_LOGO_SRC } from "@/utils/constants";

function siteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Survive.fun — rug or survive",
  description:
    "Prediction market for Pump.fun memecoin survival. Bet SURVIVE or RUG.",
  icons: {
    icon: [{ url: BRAND_LOGO_SRC, type: "image/png" }],
    apple: [{ url: BRAND_LOGO_SRC, type: "image/png" }],
  },
  openGraph: {
    title: "Survive.fun — rug or survive",
    description:
      "Prediction market for Pump.fun memecoin survival. Bet SURVIVE or RUG.",
    siteName: "Survive.fun",
    images: [{ url: BRAND_LOGO_SRC, alt: "Survive.fun" }],
  },
  twitter: {
    card: "summary",
    title: "Survive.fun — rug or survive",
    description:
      "Prediction market for Pump.fun memecoin survival. Bet SURVIVE or RUG.",
    images: [BRAND_LOGO_SRC],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        spaceGrotesk.variable,
        jetbrainsMono.variable,
        "font-sans",
      )}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
