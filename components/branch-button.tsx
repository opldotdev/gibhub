"use client";

import { useWallet } from "@1sat/react";
import { useQueryClient } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { HeadRecord } from "@/lib/gib-api";
import { branchFromHead } from "@/lib/gib-wallet";
import { routes } from "@/lib/routes";

/** git check-ref-format, the parts that matter for a single branch name. */
export function branchNameError(name: string): string | undefined {
	const n = name.trim();
	if (!n) return "Enter a branch name.";
	if (/[\s~^:?*[\\]/.test(n) || /[\x00-\x1f\x7f]/.test(n))
		return "No spaces or ~ ^ : ? * [ \\ in a branch name.";
	if (n.startsWith("-") || n.startsWith("/") || n.endsWith("/"))
		return "A branch name cannot start with - or / or end with /.";
	if (n.includes("..") || n.includes("//") || n.includes("@{"))
		return "A branch name cannot contain .. // or @{.";
	if (
		n.endsWith(".") ||
		n.endsWith(".lock") ||
		n.split("/").some((p) => p.startsWith("."))
	)
		return "A branch name cannot end with . or .lock, or have a part starting with a dot.";
	return undefined;
}

/**
 * Publishes a branch from this head under the connected wallet's identity:
 * same repository, same commit, a name the user picks (defaults to the
 * source branch).
 */
export function BranchButton({
	head,
	size = "sm",
}: {
	head: HeadRecord;
	size?: "sm" | "xs";
}) {
	const { wallet, status, identityKey, connect } = useWallet();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(head.branch || "main");
	const [busy, setBusy] = useState(false);
	const inputId = useId();
	const connected = status === "connected" && wallet && identityKey;
	const error = branchNameError(name);
	const sameAsSource =
		identityKey === head.identity && name.trim() === head.branch;

	const submit = async () => {
		if (!connected || error) return;
		setBusy(true);
		try {
			const result = await branchFromHead(wallet, head, name, identityKey);
			setOpen(false);
			queryClient.invalidateQueries({ queryKey: ["gib-basket"] });
			toast.success(`Published ${name.trim()}`, {
				description: (
					<span>
						New head{" "}
						<Link
							href={routes.commit(result.origin, result.head)}
							className="underline"
						>
							{result.head.slice(0, 12)}…
						</Link>
						. It appears in the branch list once the overlay indexes it.
					</span>
				),
				duration: 15000,
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Branch failed");
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Button
				variant="outline"
				size={size === "xs" ? "sm" : size}
				className={size === "xs" ? "h-7 px-2 text-xs" : undefined}
				onClick={async () => {
					if (!connected) {
						await connect().catch(() => undefined);
						return;
					}
					setName(head.branch || "main");
					setOpen(true);
				}}
				title="Publish a branch from this commit under your identity"
			>
				<GitBranch className="size-4" />
				Branch
			</Button>
			<Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
				<DialogContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
						className="flex flex-col gap-4"
					>
						<DialogHeader>
							<DialogTitle>Branch from this commit</DialogTitle>
							<DialogDescription>
								Publishes a head under your identity on this repository,
								pointing at commit{" "}
								<span className="font-mono">
									{head.commit?.sha.slice(0, 12) ?? head.outpoint.slice(0, 12)}
								</span>
								. Nothing is copied.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-1.5">
							<label htmlFor={inputId} className="text-sm font-medium">
								Branch name
							</label>
							<Input
								id={inputId}
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
								spellCheck={false}
								className="font-mono"
							/>
							{name.trim() && error && (
								<p className="text-xs text-destructive">{error}</p>
							)}
							{sameAsSource && (
								<p className="text-xs text-muted-foreground">
									You already publish {head.branch} here; this mints another
									head with the same name.
								</p>
							)}
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setOpen(false)}
								disabled={busy}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={busy || !!error}>
								{busy ? "Publishing…" : "Publish branch"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
