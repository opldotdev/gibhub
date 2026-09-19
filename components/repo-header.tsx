import { GitBranch, History } from "lucide-react";
import Link from "next/link";
import { BranchPicker } from "@/components/branch-picker";
import { CopyButton } from "@/components/copy-button";
import { ForkButton } from "@/components/fork-button";
import { IdentityLink } from "@/components/identity-link";
import { shortOutpoint } from "@/lib/format";
import type { HeadRecord, RepoRecord } from "@/lib/gib-api";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function RepoHeader({
	repo,
	heads,
	current,
	tab,
}: {
	repo: RepoRecord;
	/** Current heads (one per branch, possibly per publisher). */
	heads: HeadRecord[];
	/** The head the page is showing, if any. */
	current?: HeadRecord;
	tab: "code" | "commits";
}) {
	const branch = current?.branch ?? "";
	return (
		<div className="flex flex-col gap-3 mb-4">
			<div className="flex items-center gap-2 flex-wrap">
				<h1 className="text-xl font-semibold font-mono" title={repo.origin}>
					<Link href={routes.repo(repo.origin)} className="hover:underline">
						{shortOutpoint(repo.origin)}
					</Link>
				</h1>
				<CopyButton value={repo.origin} label="Copy origin" />
				<span className="text-sm text-muted-foreground">
					by <IdentityLink identity={repo.owner} />
				</span>
			</div>
			<div className="flex items-center gap-3 flex-wrap text-sm">
				<BranchPicker origin={repo.origin} heads={heads} current={current} />
				{current && <ForkButton head={current} />}
				<nav className="flex items-center gap-1 ml-auto">
					<Tab
						href={
							current
								? routes.tree(repo.origin, current.outpoint)
								: routes.repo(repo.origin)
						}
						active={tab === "code"}
					>
						<GitBranch className="size-4" /> Code
					</Tab>
					<Tab
						href={routes.commits(repo.origin, branch || "main")}
						active={tab === "commits"}
					>
						<History className="size-4" /> Commits
					</Tab>
				</nav>
			</div>
		</div>
	);
}

function Tab({
	href,
	active,
	children,
}: {
	href: string;
	active: boolean;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"flex items-center gap-1.5 px-3 py-1.5 border-b-2 hover:text-foreground",
				active
					? "border-primary text-foreground"
					: "border-transparent text-muted-foreground",
			)}
		>
			{children}
		</Link>
	);
}
