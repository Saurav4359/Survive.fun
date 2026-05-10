"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

type Props = {
  className?: string;
};

const WalletConnectButtonInner = dynamic(
  () =>
    import("./WalletConnectButtonInner").then((m) => ({
      default: m.WalletConnectButtonInner,
    })),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="rounded-md border border-border px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-fg-muted"
        aria-label="Loading wallet controls"
      >
        Connect Wallet
      </button>
    ),
  },
) as ComponentType<Props>;

export function WalletConnectButton(props: Props) {
  return <WalletConnectButtonInner {...props} />;
}
