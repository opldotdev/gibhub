"use client";

import { GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { shortKey, shortOutpoint } from "@/lib/format";
import type { HeadRecord } from "@/lib/gib-api";
import { routes } from "@/lib/routes";

/**
 * Branch selector. Options are the repository's current heads; when more
 * than one publisher has a head for the same branch name, the publisher is
 * shown to disambiguate. Selecting navigates to that head's tree.
 */
export function BranchPicker({
	origin,
	heads,
	current,
	labels = {},
}: {
	origin: string;
	heads: HeadRecord[];
	current?: HeadRecord;
	/** Verified handle per identity key, used instead of the key when disambiguating. */
	labels?: Record<string, string>;
}) {
	const router = useRouter();
	const dupes = new Set(
		heads.map((h) => h.branch).filter((b, i, all) => all.indexOf(b) !== i),
	);
	const isCurrent =
		current && heads.some((h) => h.outpoint === current.outpoint);
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
				{current && !isCurrent && (
					<option value={current.outpoint}>
						{current.branch} @ {shortOutpoint(current.outpoint, 6, 3)}
					</option>
				)}
				{heads.map((h) => (
					<option key={h.outpoint} value={h.outpoint}>
						{h.branch}
						{dupes.has(h.branch)
							? ` (${labels[h.identity] ?? shortKey(h.identity)})`
							: ""}
					</option>
				))}
				{heads.length === 0 && !current && (
					<option value="">no branches</option>
				)}
			</select>
		</label>
	);
}
