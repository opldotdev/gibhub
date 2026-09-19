"use client";

import { useWallet } from "@1sat/react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { DeleteBranchButton } from "@/components/delete-branch-button";
import { HeadList } from "@/components/head-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { shortOutpoint, toOrdinalOutpoint } from "@/lib/format";
import { getHead, type HeadRecord } from "@/lib/gib-api";
import { routes } from "@/lib/routes";
import { GIB_BASKET } from "@/lib/stack";

interface BasketHead {
	outpoint: string;
	head: HeadRecord | null;
}

/**
 * The connected wallet's own branches: every coin in the gib basket, looked
 * up in the overlay so the decoded head (branch, root, commit) comes from
 * one place. Coins the overlay has not indexed yet are listed by outpoint.
 */
export function MyRepos() {
	const { wallet, status, identityKey, connect } = useWallet();

	const query = useQuery({
		queryKey: ["gib-basket", identityKey],
		enabled: status === "connected" && !!wallet,
		queryFn: async (): Promise<BasketHead[]> => {
			if (!wallet) return [];
			const list = await wallet.listOutputs({
				basket: GIB_BASKET,
				includeTags: true,
				limit: 1000,
			});
			const outpoints = list.outputs
				.filter((o) => o.spendable !== false)
				.map((o) => toOrdinalOutpoint(o.outpoint));
			const heads = await Promise.all(
				outpoints.map(async (outpoint) => ({
					outpoint,
					head: await getHead(outpoint).catch(() => null),
				})),
			);
			return heads.sort((a, b) => (b.head?.score ?? 0) - (a.head?.score ?? 0));
		},
	});

	if (status !== "connected") {
		return (
			<div className="py-24 flex flex-col items-center gap-4 text-center">
				<Wallet className="size-8 text-muted-foreground" />
				<h1 className="text-xl font-semibold">Your repositories</h1>
				<p className="text-muted-foreground max-w-md">
					Connect a BRC-100 wallet to list the branches you publish. Your commit
					heads live in the <span className="font-mono">{GIB_BASKET}</span>{" "}
					basket.
				</p>
				<Button
					onClick={() => connect().catch(() => undefined)}
					disabled={status === "detecting" || status === "connecting"}
				>
					Connect wallet
				</Button>
			</div>
		);
	}

	if (query.isPending) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-6 w-48" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		);
	}
	if (query.isError) {
		return (
			<p className="text-sm text-destructive">
				Could not read the wallet basket: {String(query.error)}
			</p>
		);
	}

	const indexed = query.data.filter(
		(b): b is BasketHead & { head: HeadRecord } => !!b.head,
	);
	const pending = query.data.filter((b) => !b.head);
	const byOrigin = new Map<string, HeadRecord[]>();
	for (const { head } of indexed) {
		byOrigin.set(head.origin, [...(byOrigin.get(head.origin) ?? []), head]);
	}

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="text-xl font-semibold">Your repositories</h1>
				<p className="text-sm text-muted-foreground">
					{byOrigin.size} {byOrigin.size === 1 ? "repository" : "repositories"},{" "}
					{indexed.length} {indexed.length === 1 ? "branch" : "branches"} in
					your wallet.{" "}
					{identityKey && (
						<Link href={routes.user(identityKey)} className="underline">
							Public profile
						</Link>
					)}
				</p>
			</div>
			{byOrigin.size === 0 && pending.length === 0 && (
				<p className="text-sm text-muted-foreground border p-6">
					No commit heads in the <span className="font-mono">{GIB_BASKET}</span>{" "}
					basket. Push a repository with gib to mint one.
				</p>
			)}
			{[...byOrigin.entries()].map(([origin, heads]) => (
				<section key={origin}>
					<h2 className="font-mono font-medium mb-2">
						<Link
							href={routes.repo(origin)}
							className="hover:underline"
							title={origin}
						>
							{shortOutpoint(origin)}
						</Link>
					</h2>
					<HeadList
						heads={heads}
						actions={(h) => <DeleteBranchButton head={h} />}
					/>
				</section>
			))}
			{pending.length > 0 && (
				<section>
					<h2 className="font-medium mb-2">Not indexed yet</h2>
					<p className="text-xs text-muted-foreground mb-2">
						These basket coins are not in the overlay yet. They show up once the
						push is seen by the stack.
					</p>
					<ul className="border divide-y text-sm font-mono">
						{pending.map((b) => (
							<li key={b.outpoint} className="px-3 py-2">
								{b.outpoint}
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
