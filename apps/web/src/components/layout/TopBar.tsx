"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BrandWordmark } from "@/components/layout/BrandWordmark";
import { MarketSearchBar } from "@/components/layout/MarketSearchBar";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { BRAND_LOGO_SRC } from "@/utils/constants";

/** ~110% of prior sizes (11px → 12.1px) */
const CONNECT_CLASS =
  "!rounded-md !border !border-accent !bg-transparent !px-4 !py-2 !font-mono !text-[12.1px] !font-bold !uppercase !tracking-[0.15em] !text-accent hover:!bg-accent hover:!text-ink transition-colors";

type Props = {
  onMenuClick: () => void;
};

export function TopBar({ onMenuClick }: Props) {
  return (
    <header className="flex h-[62px] w-full min-w-0 shrink-0 items-center gap-3 border-b border-border bg-bg px-3 sm:h-[70px] sm:gap-4 sm:px-5">
      {/* Left: menu + brand (mobile / tablet only) */}
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-white lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-[22px] w-[22px]" />
        </button>

        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 lg:hidden"
          aria-label="Survive.fun home"
        >
          <Image
            src={BRAND_LOGO_SRC}
            alt=""
            width={35}
            height={35}
            className="brand-logo-match-accent h-[35px] w-[35px] shrink-0 object-contain"
          />
          <BrandWordmark className="text-[0.9625rem] leading-none sm:text-[1.1rem]" />
        </Link>
      </div>

      <MarketSearchBar />

      <div className="flex shrink-0 items-center">
        <WalletConnectButton className={CONNECT_CLASS} />
      </div>
    </header>
  );
}
