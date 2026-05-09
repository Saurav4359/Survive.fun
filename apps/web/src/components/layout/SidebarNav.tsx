"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import {
  Flame,
  Home,
  Plus,
  Skull,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { useWalletBalances } from "@/hooks/useWalletBalances";
import { formatSolBetLine, formatWallet } from "@/utils/format";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV: NavItem[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/live-rugs", label: "Live Rugs", Icon: Skull },
  { href: "/live", label: "Hot Markets", Icon: Flame },
  { href: "/profile", label: "Profile", Icon: User },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/bets", label: "My Bets", Icon: Zap },
];

type Props = {
  onNavigate?: () => void;
};

export function SidebarNav({ onNavigate }: Props) {
  const pathname = usePathname();
  const { connected, publicKey } = useWallet();
  const balances = useWalletBalances();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo */}
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-7 flex shrink-0 items-center gap-2 px-1"
      >
        <Skull className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
        <div className="leading-tight">
          <p className="font-display text-base font-bold tracking-tight text-white">
            survive<span className="text-accent">.fun</span>
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-fg-soft">
            Survival markets
          </p>
        </div>
      </Link>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-4 hide-scrollbar">
        {NAV.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="group relative block"
            >
              <motion.div
                initial={false}
                animate={{
                  backgroundColor: active ? "#0a0a0a" : "rgba(0,0,0,0)",
                }}
                whileHover={!active ? { backgroundColor: "#0a0a0a" } : undefined}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2.5"
              >
                {/* Sliding lime bg from left on hover */}
                {!active ? (
                  <motion.span
                    aria-hidden
                    initial={{ x: "-100%" }}
                    whileHover={{ x: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-accent"
                  />
                ) : null}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] bg-accent"
                  />
                ) : null}
                <Icon
                  className={
                    active
                      ? "h-4 w-4 shrink-0 text-accent"
                      : "h-4 w-4 shrink-0 text-fg-soft transition-colors group-hover:text-accent"
                  }
                  aria-hidden
                />
                <span
                  className={
                    active
                      ? "font-display text-sm font-medium text-accent"
                      : "font-display text-sm font-medium text-fg-soft transition-colors group-hover:text-white"
                  }
                >
                  {label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-border pt-4">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link
            href="/#create-market"
            onClick={onNavigate}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2.5 font-display text-xs font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Create Market
          </Link>
        </motion.div>

        <div className="rounded-md border border-border bg-surface px-3 py-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            Holdings
          </p>
          {!connected || !publicKey ? (
            <p className="mt-2 font-mono text-xs text-fg-muted">
              Not connected
            </p>
          ) : (
            <div className="mt-2 space-y-0.5">
              <p className="font-mono text-sm font-semibold tabular-nums text-white">
                {balances.isPending
                  ? "—"
                  : formatSolBetLine(balances.data?.sol ?? 0)}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-fg-soft">
                Wallet balance
              </p>
              <p className="truncate font-mono text-[10px] text-fg-muted">
                {formatWallet(publicKey.toBase58())}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
