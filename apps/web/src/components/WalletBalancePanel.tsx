"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { RPC_URL } from "@/utils/constants";
import { formatSolAmount, formatUSDC, formatWallet } from "@/utils/format";

const DEFAULT_CONNECT_CLASS =
  "!rounded-md !border !border-accent !bg-transparent !px-4 !py-2 !font-mono !text-[11px] !font-bold !uppercase !tracking-[0.15em] !text-accent hover:!bg-accent hover:!text-ink transition-colors";

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

type Props = {
  connectButtonClassName?: string;
};

export function WalletBalancePanel({
  connectButtonClassName = DEFAULT_CONNECT_CLASS,
}: Props) {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const toast = useToast();
  const [hideAmounts, setHideAmounts] = useState(false);

  const balances = useWalletBalances();
  const usdc = balances.data?.usdc ?? 0;
  const sol = balances.data?.sol ?? 0;
  const loading = balances.isPending && connected;
  const addr = publicKey?.toBase58();

  const copyAddress = useCallback(async () => {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      toast({
        variant: "success",
        title: "Copied",
        message: "Wallet address copied.",
      });
    } catch {
      toast({ variant: "error", title: "Copy failed" });
    }
  }, [addr, toast]);

  const onWithdrawInfo = useCallback(() => {
    toast({
      variant: "info",
      title: "Send crypto",
      message: "Use Phantom (or your wallet) to send SOL or tokens.",
    });
  }, [toast]);

  if (!connected || !publicKey || !addr) {
    return <WalletConnectButton className={connectButtonClassName} />;
  }

  const explorerUrl = `https://solscan.io/account/${encodeURIComponent(addr)}?cluster=${rpcCluster()}`;

  return (
    <div className="w-full max-w-[420px] border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
          Your balance
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void balances.refetch()}
            disabled={balances.isFetching}
            className="rounded-md p-2 text-fg-muted transition-colors hover:bg-surface hover:text-accent disabled:opacity-50"
            aria-label="Refresh balances"
          >
            <RefreshCw
              className={`h-4 w-4 ${balances.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => setHideAmounts((v) => !v)}
            className="rounded-md p-2 text-fg-muted transition-colors hover:bg-surface hover:text-accent"
            aria-label={hideAmounts ? "Show balances" : "Hide balances"}
          >
            {hideAmounts ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3" aria-busy>
            <div className="h-10 w-40 animate-pulse bg-surface" />
            <div className="h-5 w-28 animate-pulse bg-surface" />
          </div>
        ) : (
          <>
            <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-white sm:text-[2.5rem]">
              {hideAmounts ? "••••" : formatUSDC(usdc)}
            </p>
            <p className="mt-1 font-mono text-sm text-fg-soft">
              {hideAmounts
                ? "••• SOL"
                : `${formatSolAmount(sol)} SOL available`}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
              USDC · {rpcCluster()}
            </p>
          </>
        )}
      </div>

      <div className="mt-5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => void copyAddress()}
          className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-md border border-accent/60 bg-bg px-4 py-2.5 font-mono text-xs font-semibold text-accent transition-colors hover:border-accent"
        >
          <span className="truncate">{formatWallet(addr)}</span>
          <Copy className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        </motion.button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <a
          href={depositHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-border bg-bg px-3 py-3 transition-colors hover:border-accent"
        >
          <ArrowDownLeft className="h-4 w-4 text-accent" aria-hidden />
          <p className="mt-2 font-display text-sm font-semibold text-white">
            Deposit
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-fg-muted">
            {rpcCluster() === "devnet" ? "Faucet" : "Buy / transfer"}
          </p>
        </a>
        <button
          type="button"
          onClick={onWithdrawInfo}
          className="border border-border bg-bg px-3 py-3 text-left transition-colors hover:border-accent"
        >
          <ArrowUpRight className="h-4 w-4 text-accent" aria-hidden />
          <p className="mt-2 font-display text-sm font-semibold text-white">
            Withdraw
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-fg-muted">
            Send to wallet
          </p>
        </button>
        <a
          href="https://phantom.app/learn/how-to-buy-crypto"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-border bg-bg px-3 py-3 transition-colors hover:border-accent"
        >
          <CreditCard className="h-4 w-4 text-accent" aria-hidden />
          <p className="mt-2 font-display text-sm font-semibold text-white">
            Buy crypto
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-fg-muted">
            Card / bank
          </p>
        </a>
        <Link
          href="/bets"
          className="border border-border bg-bg px-3 py-3 transition-colors hover:border-accent"
        >
          <Clock className="h-4 w-4 text-accent" aria-hidden />
          <p className="mt-2 font-display text-sm font-semibold text-white">
            History
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-fg-muted">
            Your bets
          </p>
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-[0.15em]">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-fg-muted transition-colors hover:text-accent"
        >
          View on Solscan
        </a>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="text-fg-muted transition-colors hover:text-accent"
          >
            Switch
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="text-fg-muted transition-colors hover:text-rug"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
