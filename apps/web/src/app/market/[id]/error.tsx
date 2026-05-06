"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function MarketError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[market error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6">
      <Link
        href="/"
        className="inline-flex font-mono text-sm text-accent-bright hover:underline"
      >
        ← Markets
      </Link>
      <div className="card-cyber mx-auto mt-10 max-w-md border-rug/30 p-8 text-center">
        <AlertTriangle
          className="mx-auto h-12 w-12 text-rug"
          strokeWidth={1.25}
          aria-hidden
        />
        <h1 className="mt-6 font-display text-xl font-bold text-foreground">
          This page hit a snag
        </h1>
        <p className="mt-3 font-mono text-sm text-muted">
          {error.message || "We couldn’t load this market view."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-8 w-full rounded-lg border border-accent bg-accent py-3 font-mono text-xs font-bold uppercase tracking-widest text-ink transition-colors hover:bg-transparent hover:text-accent-bright"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
