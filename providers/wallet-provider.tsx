"use client";

import { WalletProvider as OneSatWalletProvider } from "@1sat/react";
import type { ReactNode } from "react";

/**
 * BRC-100 wallet connection. Auto-detects the 1Sat browser extension,
 * the desktop wallet on localhost:3321, and XDM hosts; remembers the last
 * provider and reconnects on load.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
	return (
		<OneSatWalletProvider autoReconnect autoDetect>
			{children}
		</OneSatWalletProvider>
	);
}
