"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

import { LiveFeed } from "@/components/LiveFeed";
import { MarketCard } from "@/components/MarketCard";
import { useFilteredOpenActiveMarkets } from "@/hooks/useFilteredOpenActiveMarkets";
import { fetchActiveMarkets, marketsQueryKey } from "@/hooks/useMarkets";
import { totalPoolLamports } from "@/utils/marketRisk";

export default function HotMarketsPage() {
  const { data: rawMarkets = [], isPending } = useQuery({
    queryKey: marketsQueryKey,
    queryFn: fetchActiveMarkets,
    staleTime: 15_000,
  });
  const markets = useFilteredOpenActiveMarkets(rawMarkets);

  const hot = [...markets].sort(
    (a, b) => totalPoolLamports(b) - totalPoolLamports(a),
  );

  return (
    <div className="mx-auto min-h-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-border pb-6"
      >
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-accent">
          <Flame className="h-3.5 w-3.5" />
          Hot markets
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Where the action is.
        </h1>
        <p className="mt-2 max-w-xl font-mono text-sm text-fg-muted">
          Sorted by total pool size. Bigger pools, sharper odds.
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
              {hot.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </motion.div>
          )}
        </section>
        <aside className="lg:col-span-3">
          <div className="sticky top-20">
            <LiveFeed />
          </div>
        </aside>
      </div>
    </div>
  );
}
