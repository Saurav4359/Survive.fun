"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export default function BetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[bets error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <div className="card-cyber mx-auto max-w-md border-rug/30 p-8 text-center">
        <AlertTriangle
          className="mx-auto h-12 w-12 text-rug"
          strokeWidth={1.25}
          aria-hidden
        />
        <h1 className="mt-6 font-display text-xl font-bold text-foreground">
          Couldn’t load your bets
        </h1>
        <p className="mt-3 font-mono text-sm text-muted">
          {error.message || "Something broke while loading this page."}
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
