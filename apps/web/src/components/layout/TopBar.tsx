"use client";

import { Menu, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BrandWordmark } from "@/components/layout/BrandWordmark";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useMarketSearchStore } from "@/stores/marketSearchStore";
import { BRAND_LOGO_SRC } from "@/utils/constants";

const CONNECT_CLASS =
  "!rounded-md !border !border-accent !bg-transparent !px-4 !py-2 !font-mono !text-[11px] !font-bold !uppercase !tracking-[0.15em] !text-accent hover:!bg-accent hover:!text-ink transition-colors";

type Props = {
  onMenuClick: () => void;
};

export function TopBar({ onMenuClick }: Props) {
  const query = useMarketSearchStore((s) => s.query);
  const setQuery = useMarketSearchStore((s) => s.setQuery);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg px-3 sm:h-16 sm:gap-4 sm:px-5">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-white lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 lg:hidden"
        aria-label="Survive.fun home"
      >
        <Image
          src={BRAND_LOGO_SRC}
          alt=""
          width={32}
          height={32}
          className="brand-logo-match-accent h-8 w-8 shrink-0 object-contain"
        />
        <BrandWordmark className="text-sm leading-none sm:text-base" />
      </Link>

      <div className="relative min-w-0 flex-1 max-w-2xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tokens..."
          className="w-full rounded-md border border-border bg-bg py-2.5 pl-10 pr-3 font-mono text-sm text-white placeholder:text-fg-muted transition-shadow focus:border-accent focus:outline-none focus:shadow-glow-sm"
          autoComplete="off"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <WalletConnectButton className={CONNECT_CLASS} />
      </div>
    </header>
  );
}
