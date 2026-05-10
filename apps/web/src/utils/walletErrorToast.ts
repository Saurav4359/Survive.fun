import {
  WalletConnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletSendTransactionError,
  WalletSignTransactionError,
  WalletWindowClosedError,
} from "@solana/wallet-adapter-base";

export const WALLET_TOAST_EVENT = "survive:wallet-toast";

export type WalletToastDetail = {
  title: string;
  message?: string;
};

export function emitWalletToast(detail: WalletToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WALLET_TOAST_EVENT, { detail }));
}

/** Maps adapter-level errors (connect / modal) to short copy; tx failures are mapped in `transactions.ts`. */
export function toastMessageForWalletAdapterError(error: WalletError): string {
  if (error instanceof WalletNotConnectedError) {
    return "Please connect wallet";
  }
  if (
    error instanceof WalletSignTransactionError ||
    error instanceof WalletWindowClosedError
  ) {
    return "Transaction cancelled";
  }
  if (error instanceof WalletConnectionError) {
    const m = (error.message ?? "").toLowerCase();
    if (
      m.includes("fetch") ||
      m.includes("network") ||
      m.includes("failed to connect")
    ) {
      return "Network error, try again";
    }
  }
  return error.message?.trim() || "Wallet error";
}

export function shouldSkipWalletProviderOnError(error: WalletError): boolean {
  return (
    error instanceof WalletSignTransactionError ||
    error instanceof WalletSendTransactionError
  );
}
