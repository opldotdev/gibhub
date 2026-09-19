import { FolderTree, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Activity } from "@/components/activity";
import { IdentityLink } from "@/components/identity-link";
import { Badge } from "@/components/ui/badge";
import { firstLine, shortOutpoint, shortSha, timeAgo } from "@/lib/format";
import type { HeadRecord } from "@/lib/gib-api";
import { routes } from "@/lib/routes";

/** A list of pushes (commit heads), newest first. */
export function HeadList({
	heads,
	showRepo = false,
	showBranch = true,
	empty = "No pushes yet.",
	actions,
}: {
	heads: HeadRecord[];
	showRepo?: boolean;
	showBranch?: boolean;
	empty?: string;
	/** Per-head controls rendered on the right (client components only). */
	actions?: (head: HeadRecord) => ReactNode;
}) {
	if (heads.length === 0) {
		return <p className="text-sm text-muted-foreground">{empty}</p>;
	}
	return (
		<ul className="divide-y border">
			{heads.map((head) => {
				const deleted = head.spend && !head.spend.next;
				const subject = firstLine(head.commit?.message);
				return (
					<li key={head.outpoint} className="p-3 flex gap-3 items-start">
						<div className="flex-1 min-w-0 flex flex-col gap-1">
							<div className="flex items-center gap-2 flex-wrap">
								<Link
									href={routes.commit(head.origin, head.outpoint)}
									className="font-medium hover:underline truncate"
								>
									{subject || (
										<span className="text-muted-foreground italic">
											(no commit object)
										</span>
									)}
								</Link>
								{showBranch && (
									<Badge variant="secondary" className="font-mono">
										{head.branch}
									</Badge>
								)}
								{deleted && (
									<Badge variant="destructive" className="gap-1">
										<Trash2 className="size-3" /> deleted
									</Badge>
								)}
							</div>
							<div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
								{showRepo && (
									<Link
										href={routes.repo(head.origin)}
										className="font-mono hover:underline"
									>
										{shortOutpoint(head.origin)}
									</Link>
								)}
								<IdentityLink identity={head.identity} />
								{head.commit?.author?.name && (
									<span>as {head.commit.author.name}</span>
								)}
								<span>
									{head.commit?.author?.time ? (
										timeAgo(head.commit.author.time)
									) : (
										<Activity score={head.score} />
									)}
								</span>
							</div>
						</div>
						<div className="flex items-center gap-2 text-xs font-mono text-muted-foreground shrink-0">
							{actions?.(head)}
							{head.commit?.sha && (
								<Link
									href={routes.commit(head.origin, head.outpoint)}
									className="hover:underline"
									title={head.commit.sha}
								>
									{shortSha(head.commit.sha)}
								</Link>
							)}
							<Link
								href={routes.tree(head.origin, head.outpoint)}
								className="hover:text-foreground"
								title="Browse tree at this push"
							>
								<FolderTree className="size-4" />
							</Link>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
