"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

type Props = {
  className?: string;
};

/**
 * Wallet adapter buttons depend on `window` / extensions and render different DOM
 * on the server vs client — defer until mounted to avoid hydration errors.
 */
export function WalletConnectButton({ className }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className={className}
        aria-label="Loading wallet button"
      >
        Connect wallet
      </button>
    );
  }

  return <WalletMultiButton className={className} />;
}
