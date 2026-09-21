"use client";

import { GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { shortKey, shortOutpoint } from "@/lib/format";
import type { HeadRecord } from "@/lib/gib-api";
import type { BranchRecord } from "@/lib/gib-lookup";
import { routes } from "@/lib/routes";

/**
 * Branch selector. Options come from the overlay's `branches` lookup — a
 * branch is a (repository origin, branch, publisher) triple, so the same
 * name published by two identities is two entries and the publisher is
 * shown to disambiguate. A branch whose publisher has stopped extending it
 * is still listed and still browsable: nothing is retracted by a burn.
 * Selecting navigates to that branch's tip tree.
 */
export function BranchPicker({
	origin,
	branches,
	current,
	labels = {},
}: {
	origin: string;
	branches: BranchRecord[];
	current?: HeadRecord;
	/** Verified handle per identity key, used instead of the key when disambiguating. */
	labels?: Record<string, string>;
}) {
	const router = useRouter();
	const dupes = new Set(
		branches.map((b) => b.branch).filter((b, i, all) => all.indexOf(b) !== i),
	);
	const isTip = current && branches.some((b) => b.tip === current.outpoint);
	return (
		<label className="flex items-center gap-2 border px-2 py-1 bg-card">
			<GitBranch className="size-4 text-muted-foreground" />
			<select
				className="bg-transparent font-mono text-sm outline-none max-w-64"
				value={current?.outpoint ?? ""}
				onChange={(e) => {
					if (e.target.value) router.push(routes.tree(origin, e.target.value));
				}}
			>
				{current && !isTip && (
					<option value={current.outpoint}>
						{current.branch} @ {shortOutpoint(current.outpoint, 6, 3)}
					</option>
				)}
				{branches.map((b) => (
					<option key={`${b.branch}:${b.identity}`} value={b.tip}>
						{b.branch}
						{dupes.has(b.branch)
							? ` (${labels[b.identity] ?? shortKey(b.identity)})`
							: ""}
						{b.spent ? " — no longer extended" : ""}
					</option>
				))}
				{branches.length === 0 && !current && (
					<option value="">no branches</option>
				)}
			</select>
		</label>
	);
}
