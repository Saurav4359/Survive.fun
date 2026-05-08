"use client";

import { motion } from "framer-motion";
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-md border border-rug/40 bg-card p-8 text-center"
      >
        <AlertTriangle
          className="mx-auto h-10 w-10 text-rug"
          strokeWidth={1.5}
          aria-hidden
        />
        <h1 className="mt-6 font-display text-xl font-bold text-white">
          Couldn&apos;t load your bets
        </h1>
        <p className="mt-3 font-mono text-sm text-fg-muted">
          {error.message || "Something broke while loading this page."}
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => reset()}
          className="mt-8 w-full rounded-md border border-accent bg-accent py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent"
        >
          Try again
        </motion.button>
      </motion.div>
    </div>
  );
}
