"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ChevronLeft } from "lucide-react";
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
    <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.15em] text-fg-muted transition-colors hover:text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Markets
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto mt-10 max-w-md border border-rug/40 bg-card p-8 text-center"
      >
        <AlertTriangle
          className="mx-auto h-10 w-10 text-rug"
          strokeWidth={1.5}
          aria-hidden
        />
        <h1 className="mt-6 font-display text-xl font-bold text-white">
          This page hit a snag
        </h1>
        <p className="mt-3 font-mono text-sm text-fg-muted">
          {error.message || "We couldn't load this market view."}
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
