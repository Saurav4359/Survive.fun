"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
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
  "!rounded-lg !border !border-accent !bg-accent !font-mono !text-xs !font-bold !uppercase !tracking-widest !text-ink transition-colors hover:!border-accent-bright hover:!bg-transparent hover:!text-accent-bright";

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
  /** Passed through to `WalletConnectButton` when disconnected. */
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
        message: "Wallet address copied to clipboard.",
      });
    } catch {
      toast({
        variant: "error",
        title: "Copy failed",
        message: "Could not copy to clipboard.",
      });
    }
  }, [addr, toast]);

  const onWithdrawInfo = useCallback(() => {
    toast({
      variant: "info",
      title: "Send crypto",
      message:
        "Use Phantom (or your wallet) to send SOL or tokens to another address.",
    });
  }, [toast]);

  if (!connected || !publicKey || !addr) {
    return <WalletConnectButton className={connectButtonClassName} />;
  }

  const explorerUrl = `https://solscan.io/account/${encodeURIComponent(addr)}?cluster=${rpcCluster()}`;

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card/95 p-5 shadow-[0_0_48px_-12px_rgba(6,182,212,0.22)] backdrop-blur-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          Your balance
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void balances.refetch()}
            disabled={balances.isFetching}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-accent-bright disabled:opacity-50"
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
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-accent-bright"
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
            <div className="h-10 w-40 animate-pulse rounded-md bg-border/80" />
            <div className="h-5 w-28 animate-pulse rounded-md bg-border/60" />
          </div>
        ) : (
          <>
            <p className="font-display text-4xl font-bold tabular-nums tracking-tight text-foreground sm:text-[2.75rem]">
              {hideAmounts ? "••••" : formatUSDC(usdc)}
            </p>
            <p className="mt-1 font-mono text-sm text-fg-soft">
              {hideAmounts
                ? "••• SOL available"
                : `${formatSolAmount(sol)} SOL available`}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              USDC (betting) · {rpcCluster()}
            </p>
          </>
        )}
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => void copyAddress()}
          className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 py-2.5 font-mono text-xs font-semibold text-accent-bright transition-colors hover:border-accent-bright hover:bg-accent/20"
        >
          <span className="truncate">{formatWallet(addr)}</span>
          <Copy className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <a
          href={depositHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border border-border bg-surface/90 px-3 py-3 transition-colors hover:border-accent/45"
        >
          <ArrowDownLeft
            className="h-5 w-5 text-accent group-hover:text-accent-bright"
            aria-hidden
          />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            Deposit
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            {rpcCluster() === "devnet" ? "Faucet / transfer" : "Buy / transfer"}
          </p>
        </a>
        <button
          type="button"
          onClick={onWithdrawInfo}
          className="rounded-xl border border-border bg-surface/90 px-3 py-3 text-left transition-colors hover:border-accent/45"
        >
          <ArrowUpRight className="h-5 w-5 text-accent" aria-hidden />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            Withdraw
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">Send to wallet</p>
        </button>
        <a
          href="https://phantom.app/learn/how-to-buy-crypto"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border border-border bg-surface/90 px-3 py-3 transition-colors hover:border-accent/45"
        >
          <CreditCard
            className="h-5 w-5 text-accent group-hover:text-accent-bright"
            aria-hidden
          />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            Buy crypto
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">Card / bank</p>
        </a>
        <Link
          href="/bets"
          className="group rounded-xl border border-border bg-surface/90 px-3 py-3 transition-colors hover:border-accent/45"
        >
          <Clock
            className="h-5 w-5 text-accent group-hover:text-accent-bright"
            aria-hidden
          />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            History
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">Your bets</p>
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-wider">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted transition-colors hover:text-accent-bright"
        >
          View on Solscan
        </a>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="text-muted transition-colors hover:text-accent-bright"
          >
            Switch wallet
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="text-muted transition-colors hover:text-rug"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
