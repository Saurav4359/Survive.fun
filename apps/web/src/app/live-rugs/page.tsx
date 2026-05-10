"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Skull } from "lucide-react";

import { LiveFeed } from "@/components/LiveFeed";
import { MarketCard } from "@/components/MarketCard";
import { useFilteredOpenActiveMarkets } from "@/hooks/useFilteredOpenActiveMarkets";
import { fetchActiveMarkets, marketsQueryKey } from "@/hooks/useMarkets";

export default function LiveRugsPage() {
  const { data: rawMarkets = [], isPending } = useQuery({
    queryKey: marketsQueryKey,
    queryFn: fetchActiveMarkets,
    staleTime: 15_000,
  });
  const markets = useFilteredOpenActiveMarkets(rawMarkets);

  // Surface markets where rug pool > survive pool, sorted by skew
  const rugLeaning = [...markets]
    .map((m) => ({
      m,
      skew:
        Number.parseFloat(m.rugPool) -
        Number.parseFloat(m.survivePool),
    }))
    .filter((r) => Number.isFinite(r.skew) && r.skew > 0)
    .sort((a, b) => b.skew - a.skew)
    .map((r) => r.m);

  return (
    <div className="mx-auto min-h-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-border pb-6"
      >
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-rug">
          <Skull className="h-3.5 w-3.5" />
          Live rugs
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Markets the crowd thinks will <span className="text-rug">rug</span>
        </h1>
        <p className="mt-2 max-w-xl font-mono text-sm text-fg-muted">
          Sorted by RUG-side pool skew. Bet against consensus or pile on.
        </p>
      </motion.header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-6">
        <section className="min-w-0 lg:col-span-9">
          {isPending ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-7 xl:grid-cols-3 xl:gap-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[320px] animate-pulse border border-border bg-card"
                />
              ))}
            </div>
          ) : rugLeaning.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-border bg-card px-6 py-16 text-center">
              <Skull
                className="mb-4 h-10 w-10 text-fg-muted"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="font-display text-base font-semibold text-white">
                No rug-leaning markets yet.
              </p>
              <p className="mt-2 max-w-md font-mono text-sm text-fg-muted">
                Once a market gets more weight on the RUG side it shows up here.
              </p>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.06 } },
              }}
              className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-7 xl:grid-cols-3 xl:gap-8"
            >
              {rugLeaning.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </motion.div>
          )}
        </section>
        <aside className="lg:col-span-3">
          <div className="sticky top-20">
            <LiveFeed heading="Live RUG bets" />
          </div>
        </aside>
      </div>
    </div>
  );
}
