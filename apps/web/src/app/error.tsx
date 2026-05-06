"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
      <div className="card-cyber max-w-md border-rug/30 p-8 text-center">
        <AlertTriangle
          className="mx-auto h-12 w-12 text-rug"
          strokeWidth={1.25}
          aria-hidden
        />
        <h1 className="mt-6 font-display text-xl font-bold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3 font-mono text-sm text-muted">
          {error.message || "An unexpected error occurred. You can try again."}
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
