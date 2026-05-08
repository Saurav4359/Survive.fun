"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="mx-auto min-h-full max-w-[900px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-border pb-6"
      >
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-accent">
          <MessageCircle className="h-3.5 w-3.5" />
          Chat
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Trade talk.
        </h1>
        <p className="mt-2 max-w-xl font-mono text-sm text-fg-muted">
          Global degen chat. Coming soon.
        </p>
      </motion.header>

      <div className="mt-8 flex h-[420px] flex-col items-center justify-center border border-border bg-card text-center">
        <MessageCircle
          className="mb-4 h-10 w-10 text-fg-muted"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="font-display text-base font-semibold text-white">
          Channels are not live yet.
        </p>
        <p className="mt-2 max-w-md px-6 font-mono text-sm text-fg-muted">
          Hop into the live feed for real-time bets, or check the leaderboard
          for top traders.
        </p>
      </div>
    </div>
  );
}
