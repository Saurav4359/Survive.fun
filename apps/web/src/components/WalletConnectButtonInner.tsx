"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { formatSolBetLine, formatWallet } from "@/utils/format";

const CONNECTED_BTN_CLASS =
  "flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm font-semibold tabular-nums text-white transition-colors hover:border-accent";

type Props = {
  /** Applied when disconnected (e.g. TopBar lime outline). */
  className?: string;
};

export function WalletConnectButtonInner({ className }: Props) {
  const { connected, connecting, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const toast = useToast();
  const balances = useWalletBalances();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sol = balances.data?.sol ?? 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const copyAddr = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      toast({ variant: "success", title: "Copied", message: "Address copied." });
      setMenuOpen(false);
    } catch {
      toast({ variant: "error", title: "Copy failed" });
    }
  }, [publicKey, toast]);

  if (connecting) {
    return (
      <button
        type="button"
        disabled
        className={className ?? CONNECTED_BTN_CLASS}
        aria-busy
      >
        Connecting...
      </button>
    );
  }

  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className={
          className ??
          `${CONNECTED_BTN_CLASS} border-accent text-accent hover:bg-accent hover:text-ink`
        }
      >
        Connect Wallet
      </button>
    );
  }

  const addr = publicKey.toBase58();

  return (
    <div className="relative" ref={wrapRef}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => setMenuOpen((v) => !v)}
        className={CONNECTED_BTN_CLASS}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="max-w-[120px] truncate font-mono text-xs sm:max-w-none sm:text-sm">
          {formatWallet(addr)}
        </span>
        <span className="hidden text-fg-muted sm:inline">·</span>
        <span className="font-mono tabular-nums text-fg-soft sm:text-white">
          {formatSolBetLine(sol)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-fg-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </motion.button>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-md border border-border bg-card py-2 shadow-glow-sm"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:bg-surface hover:text-accent"
              onClick={() => void copyAddr()}
            >
              Copy address
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:bg-surface hover:text-accent"
              onClick={() => {
                setMenuOpen(false);
                setVisible(true);
              }}
            >
              Switch wallet
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-rug transition-colors hover:bg-surface"
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
            >
              Disconnect
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
