"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWalletBalances } from "@/hooks/useWalletBalances";
import { formatSolAmount, formatUSDC, formatWallet } from "@/utils/format";

const NAV: { href: string; label: string; emoji: string }[] = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/live-rugs", label: "Live Rugs", emoji: "📢" },
  { href: "/live", label: "Live", emoji: "⚡" },
  { href: "/profile", label: "Profile", emoji: "👤" },
  { href: "/leaderboard", label: "Leaderboard", emoji: "🏆" },
  { href: "/chat", label: "Chat", emoji: "💬" },
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
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-8 block shrink-0 px-1"
      >
        <p className="font-mono text-lg font-bold tracking-tight text-accent-bright">
          survive.fun
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted">
          Survival markets
        </p>
      </Link>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto hide-scrollbar">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={
                active
                  ? "flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 font-mono text-sm font-medium text-accent-bright"
                  : "flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-fg-soft transition-colors hover:border-border hover:bg-surface/60 hover:text-foreground"
              }
            >
              <span className="text-base" aria-hidden>
                {item.emoji}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 shrink-0 space-y-3 border-t border-border pt-5">
        <Link
          href="/#create-market"
          onClick={onNavigate}
          className="flex w-full items-center justify-center rounded-lg border border-survive bg-survive px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-[#020b18] shadow-[0_0_20px_rgba(6,214,160,0.25)] transition hover:bg-survive/90"
        >
          Create Market
        </Link>

        <div className="rounded-lg border border-border bg-surface/80 px-3 py-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
            Holdings
          </p>
          {!connected || !publicKey ? (
            <p className="mt-2 font-mono text-xs text-muted">Connect wallet</p>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {balances.isPending
                  ? "…"
                  : formatUSDC(balances.data?.usdc ?? 0)}{" "}
                <span className="text-[10px] font-normal text-muted">USDC</span>
              </p>
              <p className="font-mono text-xs tabular-nums text-fg-soft">
                {balances.isPending
                  ? "…"
                  : `${formatSolAmount(balances.data?.sol ?? 0)} SOL`}
              </p>
              <p className="truncate font-mono text-[10px] text-muted">
                {formatWallet(publicKey.toBase58())}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
