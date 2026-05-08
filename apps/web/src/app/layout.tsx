import type { Metadata } from "next";
import { IBM_Plex_Mono, Syne } from "next/font/google";

import { Providers } from "./providers";

import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Survive.fun",
  description: "Bet on whether Pump.fun memecoins survive or rug.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${syne.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="terminal-bg relative min-h-screen overflow-x-hidden text-foreground antialiased">
        <div className="atmosphere-mesh pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <div className="atmosphere-grain pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
