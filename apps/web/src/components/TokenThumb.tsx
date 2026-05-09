"use client";

import { useState } from "react";

type Props = {
  mint: string;
  ticker: string;
  size?: number;
  /** Homepage cards use `md`; trending strip uses `full`. */
  rounded?: "md" | "full";
  className?: string;
};

/** DexScreener CDN token icon; falls back to ticker initial on error. */
export function TokenThumb({
  mint,
  ticker,
  size = 40,
  rounded = "md",
  className = "",
}: Props) {
  const [bad, setBad] = useState(false);
  const src = `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`;
  const letter = (ticker || "?").slice(0, 1).toUpperCase();
  const r = rounded === "full" ? "rounded-full" : "rounded-md";

  if (bad) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border border-border bg-bg font-mono text-base font-bold text-accent ${r} ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {letter}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-border bg-surface ${r} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote DexScreener PNG */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
        onError={() => setBad(true)}
      />
    </div>
  );
}
