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
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ComponentType, MouseEvent, SVGProps } from "react";

import { BrandWordmark } from "@/components/layout/BrandWordmark";
import { cn } from "@/lib/utils";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { BRAND_LOGO_SRC } from "@/utils/constants";
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

/** Primary-click full navigation — avoids stalled Next client transitions (e.g. on `/`). Modifiers keep native “new tab” etc. */
function onInAppAnchorClick(
  e: MouseEvent<HTMLAnchorElement>,
  href: string,
  onNavigate?: () => void,
) {
  if (
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey ||
    e.button !== 0 ||
    e.defaultPrevented
  ) {
    return;
  }
  e.preventDefault();
  onNavigate?.();
  window.location.assign(href);
}

export function SidebarNav({ onNavigate }: Props) {
  const pathname = usePathname();
  const { connected, publicKey } = useWallet();
  const balances = useWalletBalances();
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo — plain <a> + assign so primary click always navigates */}
      <a
        href="/"
        onClick={(e) => onInAppAnchorClick(e, "/", onNavigate)}
        className="mb-7 flex shrink-0 items-center gap-2.5 px-1"
      >
        <Image
          src={BRAND_LOGO_SRC}
          alt=""
          width={36}
          height={36}
          className="brand-logo-match-accent h-9 w-9 shrink-0 object-contain"
          priority
        />
        <div className="leading-tight">
          <p className="text-base leading-tight">
            <BrandWordmark />
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-fg-soft">
            Survival markets
          </p>
        </div>
      </a>

      <nav className="shrink-0 space-y-1 overflow-y-auto pb-4 hide-scrollbar">
        {NAV.map(({ href, label, Icon }) => {
          /** Exact path or nested segment — `startsWith("/live")` wrongly matches `/live-rugs`. */
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <a
              key={href}
              href={href}
              onClick={(e) => onInAppAnchorClick(e, href, onNavigate)}
              className="group block"
            >
              <div
                className={cn(
                  "relative flex items-center gap-3 rounded-md border px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-200",
                  active
                    ? "border-accent bg-[#0a0a0a]"
                    : "border-border bg-transparent hover:border-accent hover:bg-[#0a0a0a] hover:shadow-glow-sm",
                )}
              >
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
              </div>
            </a>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-border pt-4">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <a
            href="/#create-market"
            onClick={(e) =>
              onInAppAnchorClick(e, "/#create-market", onNavigate)
            }
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2.5 font-display text-xs font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Create Market
          </a>
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
