"use client";

import { useWallet } from "@1sat/react";
import { GitFork } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { HeadRecord } from "@/lib/gib-api";
import { forkRepo } from "@/lib/gib-wallet";
import { routes } from "@/lib/routes";

/** Forks the repository at this head into a new origin owned by the wallet. */
export function ForkButton({ head }: { head: HeadRecord }) {
	const { wallet, status, identityKey, connect } = useWallet();
	const [busy, setBusy] = useState(false);
	const connected = status === "connected" && wallet && identityKey;

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={busy}
			onClick={async () => {
				if (!connected) {
					await connect().catch(() => undefined);
					return;
				}
				setBusy(true);
				try {
					const result = await forkRepo(wallet, head, identityKey);
					toast.success("Forked", {
						description: (
							<span>
								New repository{" "}
								<Link href={routes.repo(result.origin)} className="underline">
									{result.origin.slice(0, 12)}…
								</Link>
								. It appears once the overlay indexes the push.
							</span>
						),
						duration: 15000,
					});
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Fork failed");
				} finally {
					setBusy(false);
				}
			}}
		>
			<GitFork className="size-4" />
			{busy ? "Forking…" : "Fork"}
		</Button>
	);
}
