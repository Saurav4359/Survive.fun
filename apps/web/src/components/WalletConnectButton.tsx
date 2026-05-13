"use client";

import { WalletConnectButtonInner } from "./WalletConnectButtonInner";

type Props = {
  className?: string;
};

export function WalletConnectButton(props: Props) {
  return <WalletConnectButtonInner {...props} />;
}
