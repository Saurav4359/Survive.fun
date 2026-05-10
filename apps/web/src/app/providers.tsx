"use client";

import type { WalletError } from "@solana/wallet-adapter-base";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clusterApiUrl } from "@solana/web3.js";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { WalletToastBridge } from "@/components/WalletToastBridge";
import { useMarketsLiveSync } from "@/hooks/useMarketsLiveSync";
import {
  emitWalletToast,
  shouldSkipWalletProviderOnError,
  toastMessageForWalletAdapterError,
} from "@/utils/walletErrorToast";

import "@solana/wallet-adapter-react-ui/styles.css";

const network = WalletAdapterNetwork.Devnet;

const endpoint =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || clusterApiUrl(network);

/**
 * Mounted once inside the provider tree so socket events automatically patch
 * the markets-list and per-market caches on every page. Render-tree neutral.
 */
function GlobalSocketSync(): null {
  useMarketsLiveSync();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  const onWalletError = useCallback((error: WalletError) => {
    if (shouldSkipWalletProviderOnError(error)) return;
    emitWalletToast({
      title: toastMessageForWalletAdapterError(error),
    });
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={onWalletError}
      >
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <WalletToastBridge />
              <GlobalSocketSync />
              {children}
            </ToastProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
