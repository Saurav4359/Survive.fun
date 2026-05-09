"use client";

import type { Outcome } from "@survivefun/types";
import { useRef } from "react";

import { gsap, useGSAP } from "@/lib/gsap/register";

export type MarketResultBannerProps = {
  outcome: Outcome;
  /** Human-readable rug reason or survive subtitle. */
  subtitle: string;
  /** When this string changes (e.g. socket timestamp), border flashes 3× then settles. */
  flashKey: string | null;
};

export function MarketResultBanner({
  outcome,
  subtitle,
  flashKey,
}: MarketResultBannerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastFlashRef = useRef<string | null>(null);

  const isRug = outcome === "rug";
  const accent = isRug ? "#f87171" : "#8aff8e";

  useGSAP(
    () => {
      const el = rootRef.current;
      if (!el || flashKey == null || flashKey === "") return;
      if (lastFlashRef.current === flashKey) return;
      lastFlashRef.current = flashKey;

      gsap.fromTo(
        el,
        {
          boxShadow: `inset 0 0 0 1px ${accent}40`,
        },
        {
          boxShadow: `inset 0 0 0 2px ${accent}, 0 0 28px ${accent}99`,
          duration: 0.16,
          repeat: 2,
          yoyo: true,
          ease: "power2.inOut",
          onComplete: () => {
            gsap.set(el, { clearProps: "boxShadow" });
          },
        },
      );
    },
    { dependencies: [flashKey, accent] },
  );

  return (
    <div
      ref={rootRef}
      role="status"
      className={
        isRug
          ? "mb-6 w-full border-2 border-rug bg-black px-4 py-6 sm:px-8 sm:py-8"
          : "mb-6 w-full border-2 border-accent bg-black px-4 py-6 sm:px-8 sm:py-8"
      }
    >
      <div className="mx-auto max-w-[1440px] text-center">
        {isRug ? (
          <>
            <p className="font-display text-4xl font-black tracking-tight text-rug sm:text-6xl md:text-7xl">
              <span aria-hidden className="mr-2 inline-block">
                💀
              </span>
              RUGGED
            </p>
            <p className="mt-4 max-w-2xl mx-auto font-mono text-xs leading-relaxed text-fg-muted sm:text-sm">
              {subtitle}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-black tracking-tight text-accent sm:text-6xl md:text-7xl">
              <span aria-hidden className="mr-2 inline-block">
                ✅
              </span>
              SURVIVED
            </p>
            <p className="mt-4 max-w-2xl mx-auto font-mono text-xs leading-relaxed text-fg-muted sm:text-sm">
              {subtitle}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
