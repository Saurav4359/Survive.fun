"use client";

import { useEffect } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  WALLET_TOAST_EVENT,
  type WalletToastDetail,
} from "@/utils/walletErrorToast";

export function WalletToastBridge(): null {
  const toast = useToast();

  useEffect(() => {
    const fn = (e: Event) => {
      const d = (e as CustomEvent<WalletToastDetail>).detail;
      if (!d?.title) return;
      toast({
        variant: "error",
        title: d.title,
        message: d.message,
      });
    };
    window.addEventListener(WALLET_TOAST_EVENT, fn);
    return () => window.removeEventListener(WALLET_TOAST_EVENT, fn);
  }, [toast]);

  return null;
}
