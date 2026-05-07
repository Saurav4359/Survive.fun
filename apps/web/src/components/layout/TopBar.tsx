"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useToast } from "@/components/ToastProvider";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useMarketSearchStore } from "@/stores/marketSearchStore";
import { RPC_URL } from "@/utils/constants";
import { formatUSDC } from "@/utils/format";

function rpcCluster(): "devnet" | "testnet" | "mainnet-beta" {
  const u = RPC_URL.toLowerCase();
  if (u.includes("devnet")) return "devnet";
  if (u.includes("testnet")) return "testnet";
  return "mainnet-beta";
}

function depositHref(): string {
  return rpcCluster() === "devnet"
    ? "https://faucet.solana.com/"
    : "https://phantom.app/learn/how-to-buy-crypto";
}

const CONNECT_CLASS =
  "!rounded-lg !border !border-accent !bg-accent !px-4 !py-2 !font-mono !text-xs !font-bold !uppercase !tracking-widest !text-[var(--on-accent)] hover:!border-accent-bright hover:!bg-accent-bright";

type Props = {
  onMenuClick: () => void;
};

export function TopBar({ onMenuClick }: Props) {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const toast = useToast();
  const query = useMarketSearchStore((s) => s.query);
  const setQuery = useMarketSearchStore((s) => s.setQuery);
  const balances = useWalletBalances();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const usdc = balances.data?.usdc ?? 0;
  const displayBalance = formatUSDC(usdc);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const copyAddr = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      toast({ variant: "success", title: "Copied", message: "Address copied." });
      setOpen(false);
    } catch {
      toast({ variant: "error", title: "Copy failed" });
    }
  }, [publicKey, toast]);

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-[var(--bg-primary)]/95 px-3 backdrop-blur-md sm:h-16 sm:gap-4 sm:px-5">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for tokens..."
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          autoComplete="off"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {!connected ? (
          <WalletConnectButton className={CONNECT_CLASS} />
        ) : (
          <>
            <div className="relative" ref={wrapRef}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm font-semibold tabular-nums text-foreground transition hover:border-accent/50"
                aria-expanded={open}
              >
                {displayBalance}
                <ChevronDown
                  className={`h-4 w-4 text-muted transition ${open ? "rotate-180" : ""}`}
                />
              </button>
              {open ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                  <p className="px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Your balance
                  </p>
                  <p className="px-4 pt-2 font-display text-2xl font-bold tabular-nums text-foreground">
                    {formatUSDC(usdc)}
                  </p>
                  <p className="px-4 pt-1 font-mono text-xs text-fg-soft">USDC (betting)</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 px-3">
                    <a
                      href={depositHref()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border bg-surface py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-accent-bright hover:border-accent"
                    >
                      Deposit
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        toast({
                          variant: "info",
                          title: "Withdraw",
                          message: "Send assets from your wallet app.",
                        });
                      }}
                      className="rounded-lg border border-border bg-surface py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-fg-soft hover:border-accent hover:text-accent-bright"
                    >
                      Withdraw
                    </button>
                  </div>
                  <Link
                    href="/bets"
                    onClick={() => setOpen(false)}
                    className="mx-3 mt-2 block rounded-lg border border-border py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-fg-soft hover:border-accent hover:text-accent-bright"
                  >
                    History
                  </Link>
                  <div className="mt-3 border-t border-border px-4 pt-3">
                    <button
                      type="button"
                      onClick={() => void copyAddr()}
                      className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent-bright"
                    >
                      Copy address
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setVisible(true);
                      }}
                      className="ml-4 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent-bright"
                    >
                      Switch
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <WalletConnectButton className={`${CONNECT_CLASS} !hidden sm:!inline-flex`} />
          </>
        )}
      </div>
    </header>
  );
}
