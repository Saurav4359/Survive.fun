"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useMarketSearchStore } from "@/stores/marketSearchStore";
import { RPC_URL } from "@/utils/constants";
import { formatSolBetLine } from "@/utils/format";

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
  "!rounded-md !border !border-accent !bg-transparent !px-4 !py-2 !font-mono !text-[11px] !font-bold !uppercase !tracking-[0.15em] !text-accent hover:!bg-accent hover:!text-ink transition-colors";

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

  const sol = balances.data?.sol ?? 0;
  const displayBalance = formatSolBetLine(sol);

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg px-3 sm:h-16 sm:gap-4 sm:px-5">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-white lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

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
        {!connected ? (
          <WalletConnectButton className={CONNECT_CLASS} />
        ) : (
          <div className="relative" ref={wrapRef}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm font-semibold tabular-nums text-white transition-colors hover:border-accent"
              aria-expanded={open}
            >
              {displayBalance}
              <ChevronDown
                className={`h-4 w-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
              />
            </motion.button>
            <AnimatePresence>
              {open ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-border bg-card py-3 shadow-glow-sm"
                >
                  <p className="px-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                    Your balance
                  </p>
                  <p className="px-4 pt-2 font-mono text-2xl font-bold tabular-nums text-white">
                    {formatSolBetLine(sol)}
                  </p>
                  <p className="px-4 pt-1 font-mono text-xs text-fg-soft">
                    SOL · {rpcCluster()}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 px-3">
                    <a
                      href={depositHref()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border bg-surface py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-accent transition-colors hover:border-accent"
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
                      className="rounded-md border border-border bg-surface py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-fg-soft transition-colors hover:border-accent hover:text-accent"
                    >
                      Withdraw
                    </button>
                  </div>
                  <Link
                    href="/bets"
                    onClick={() => setOpen(false)}
                    className="mx-3 mt-2 block rounded-md border border-border py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-fg-soft transition-colors hover:border-accent hover:text-accent"
                  >
                    History
                  </Link>
                  <div className="mt-3 border-t border-border px-4 pt-3">
                    <button
                      type="button"
                      onClick={() => void copyAddr()}
                      className="font-mono text-[10px] uppercase tracking-wider text-fg-muted transition-colors hover:text-accent"
                    >
                      Copy address
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setVisible(true);
                      }}
                      className="ml-4 font-mono text-[10px] uppercase tracking-wider text-fg-muted transition-colors hover:text-accent"
                    >
                      Switch
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </div>
    </header>
  );
}
