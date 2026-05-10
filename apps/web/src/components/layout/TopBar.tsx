"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HotMarketsStrip } from "@/components/HotMarketsStrip";
import { BrandWordmark } from "@/components/layout/BrandWordmark";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { BRAND_LOGO_SRC } from "@/utils/constants";

const CONNECT_CLASS =
  "!rounded-md !border !border-accent !bg-transparent !px-4 !py-2 !font-mono !text-[11px] !font-bold !uppercase !tracking-[0.15em] !text-accent hover:!bg-accent hover:!text-ink transition-colors";

type Props = {
  onMenuClick: () => void;
};

export function TopBar({ onMenuClick }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center gap-3 border-b border-border bg-bg px-3 sm:h-16 sm:gap-4 sm:px-5">
      {/* Left: menu + brand (mobile / tablet only) */}
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
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
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden">
        <HotMarketsStrip compact />
      </div>

      <div className="flex shrink-0 items-center">
        <WalletConnectButton className={CONNECT_CLASS} />
      </div>
    </header>
  );
}
