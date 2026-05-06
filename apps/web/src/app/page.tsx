"use client";

import type { Market } from "@survivefun/types";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { LiveFeed } from "@/components/LiveFeed";
import { MarketCard } from "@/components/MarketCard";
import { MARKET_DURATIONS } from "@/utils/constants";

const DURATION_TABS: { label: string; seconds: (typeof MARKET_DURATIONS)[number] }[] =
  [
    { label: "1H", seconds: MARKET_DURATIONS[0] },
    { label: "6H", seconds: MARKET_DURATIONS[1] },
    { label: "24H", seconds: MARKET_DURATIONS[2] },
  ];

const DEMO_MARKETS: Market[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    tokenMint: "So11111111111111111111111111111111111111112",
    tokenName: "Survive Sendit",
    tokenTicker: "SND",
    creatorWallet: "Creator1111111111111111111111111111111111",
    durationSeconds: 3600,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    survivePool: "12450.5",
    rugPool: "8320.25",
    openPrice: "0.00042",
    openLiquidity: "210000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 128,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    tokenName: "Only Up",
    tokenTicker: "UP",
    creatorWallet: "Creator2222222222222222222222222222222222",
    durationSeconds: 21600,
    expiresAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    survivePool: "50200",
    rugPool: "12800",
    openPrice: "0.0012",
    openLiquidity: "480000",
    devWallet: "Dev2222222222222222222222222222222222222",
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 342,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    tokenName: "Roundtrip Risk",
    tokenTicker: "RISK",
    creatorWallet: "Creator3333333333333333333333333333333333",
    durationSeconds: 86400,
    expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    survivePool: "980",
    rugPool: "4100",
    openPrice: "0.0000098",
    openLiquidity: "12000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 56,
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    tokenMint: "bonk111111111111111111111111111111111111111",
    tokenName: "Bonk Survivors",
    tokenTicker: "BNK",
    creatorWallet: "Creator4444444444444444444444444444444444",
    durationSeconds: 86400,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    survivePool: "8800",
    rugPool: "2100",
    openPrice: "0.000022",
    openLiquidity: "88000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 201,
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    tokenMint: "pumpSo111111111111111111111111111111111111112",
    tokenName: "Fresh Mint Mayhem",
    tokenTicker: "FMM",
    creatorWallet: "Creator5555555555555555555555555555555555",
    durationSeconds: 3600,
    expiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    survivePool: "1420",
    rugPool: "980",
    openPrice: "0.0000014",
    openLiquidity: "22000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 44,
  },
  {
    id: "66666666-6666-6666-6666-666666666666",
    tokenMint: "memeSo111111111111111111111111111111111111112",
    tokenName: "Normie Exit Liquidity",
    tokenTicker: "NEL",
    creatorWallet: "Creator6666666666666666666666666666666666",
    durationSeconds: 21600,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    survivePool: "32100",
    rugPool: "15400",
    openPrice: "0.00031",
    openLiquidity: "310000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 512,
  },
];

const STATS = [
  { label: "Active Markets", value: "12" },
  { label: "Total Volume", value: "$4,200 USDC" },
  { label: "Rugs Caught", value: "847" },
  { label: "Biggest Win", value: "$420 USDC" },
] as const;

const sectionEase = { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const };

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
};

const HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(134, 240, 173, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(134, 240, 173, 0.06) 1px, transparent 1px)
  `,
  backgroundSize: "28px 28px",
};

export default function HomePage() {
  const [tokenMint, setTokenMint] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number>(
    MARKET_DURATIONS[2],
  );

  return (
    <div className="min-h-screen pb-16 pt-6 sm:pb-24 sm:pt-10">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={sectionEase}
        className="border-b-2 border-accent"
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-12">
          <div>
            <p className="font-mono text-lg font-semibold tracking-tight text-accent-bright sm:text-xl">
              survive.fun
            </p>
            <p className="mt-1 max-w-md font-display text-sm text-fg-soft sm:text-base">
              Bet whether memecoins survive or rug
            </p>
          </div>
          <div className="flex shrink-0 justify-start sm:justify-end">
            <WalletMultiButton className="!rounded-lg !border !border-accent !bg-accent !font-mono !text-xs !font-bold !uppercase !tracking-widest !text-ink transition-colors hover:!border-accent-bright hover:!bg-transparent hover:!text-accent-bright" />
          </div>
        </div>
      </motion.header>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-12">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...sectionEase, delay: 0.05 }}
          aria-label="Platform statistics"
          className="mt-8 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4"
        >
          {STATS.map((row) => (
            <div
              key={row.label}
              className="bg-card px-4 py-4 sm:px-5 sm:py-5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {row.label}
              </p>
              <p className="mt-2 font-mono text-base font-semibold tabular-nums text-foreground sm:text-lg">
                {row.value}
              </p>
            </div>
          ))}
        </motion.section>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8 xl:gap-10">
          <div className="min-w-0 space-y-10 lg:col-span-8">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...sectionEase, delay: 0.1 }}
              aria-label="Create market"
              className="relative overflow-hidden rounded-lg border border-border bg-card"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-90"
                style={HERO_GRID_STYLE}
                aria-hidden
              />
              <div className="relative z-[1] space-y-5 p-6 sm:p-8">
                <label className="block">
                  <span className="sr-only">Pump.fun token address</span>
                  <input
                    type="text"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder="Paste Pump.fun token address..."
                    className="w-full rounded-lg border border-border bg-surface px-4 py-4 font-mono text-sm text-foreground placeholder:text-muted transition-all duration-200 focus:border-border-glow focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-glow-sm sm:text-base"
                  />
                </label>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Market duration"
                  >
                    {DURATION_TABS.map(({ label, seconds }) => {
                      const active = durationSeconds === seconds;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setDurationSeconds(seconds)}
                          className={
                            active
                              ? "rounded-lg border border-border-glow bg-accent/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent-bright shadow-glow-sm"
                              : "rounded-lg border border-border bg-surface px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-muted transition-colors duration-200 hover:border-accent/40 hover:text-fg-soft"
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-ink shadow-glow-sm transition-all duration-200 hover:border-accent-bright hover:bg-transparent hover:text-accent-bright hover:shadow-none"
                  >
                    Create Market
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...sectionEase, delay: 0.14 }}
              aria-label="Active markets"
            >
              <div className="mb-5 flex items-end justify-between gap-3 border-b border-border pb-3">
                <h2 className="font-display text-lg font-bold uppercase tracking-widest text-foreground">
                  Active markets
                </h2>
                <span className="font-mono text-xs text-muted">Demo</span>
              </div>

              <motion.div
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {DEMO_MARKETS.map((market) => (
                  <motion.div key={market.id} variants={staggerItem}>
                    <MarketCard market={market} />
                  </motion.div>
                ))}
              </motion.div>
            </motion.section>
          </div>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...sectionEase, delay: 0.18 }}
            className="lg:col-span-4"
            aria-label="Live bets"
          >
            <div className="lg:sticky lg:top-8">
              <LiveFeed />
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
