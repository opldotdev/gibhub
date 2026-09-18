"use client";

import { useWallet } from "@1sat/react";
import { LogOut, User, Wallet } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortKey } from "@/lib/format";
import { routes } from "@/lib/routes";

export function ConnectWalletButton() {
	const { status, identityKey, connect, disconnect } = useWallet();
	const connecting = status === "detecting" || status === "connecting";

	if (status === "connected" && identityKey) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="font-mono text-xs">
						<span className="size-2 rounded-full bg-emerald-500" />
						{shortKey(identityKey)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel className="font-mono text-xs break-all max-w-64">
						{identityKey}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link href={routes.me()}>
							<Wallet className="size-4" /> My repos
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link href={routes.user(identityKey)}>
							<User className="size-4" /> Public profile
						</Link>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => disconnect()}>
						<LogOut className="size-4" /> Disconnect
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<Button
			size="sm"
			disabled={connecting}
			onClick={async () => {
				try {
					await connect();
				} catch (err) {
					toast.error(
						err instanceof Error ? err.message : "Wallet connection failed",
					);
				}
			}}
		>
			<Wallet className="size-4" />
			{connecting ? "Connecting…" : "Connect wallet"}
		</Button>
	);
}
