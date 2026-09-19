"use client";

import { useWallet } from "@1sat/react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { HeadRecord } from "@/lib/gib-api";
import { burnHead } from "@/lib/gib-wallet";

/** Deletes a branch you own by burning its head coin. */
export function DeleteBranchButton({ head }: { head: HeadRecord }) {
	const { wallet, status } = useWallet();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	if (status !== "connected" || !wallet || head.spend) return null;

	return (
		<Button
			variant="ghost"
			size="sm"
			className="text-destructive"
			disabled={busy}
			onClick={async () => {
				if (
					!window.confirm(
						`Delete branch "${head.branch}"? This burns the head coin. The content stays on chain.`,
					)
				) {
					return;
				}
				setBusy(true);
				try {
					const txid = await burnHead(wallet, head);
					toast.success(`Branch ${head.branch} deleted`, {
						description: `tx ${txid.slice(0, 16)}…`,
					});
					await queryClient.invalidateQueries({ queryKey: ["gib-basket"] });
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Delete failed");
				} finally {
					setBusy(false);
				}
			}}
		>
			<Trash2 className="size-4" />
			{busy ? "Deleting…" : "Delete"}
		</Button>
	);
}
