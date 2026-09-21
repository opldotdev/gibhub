import { GitBranch, History } from "lucide-react";
import Link from "next/link";
import { BranchButton } from "@/components/branch-button";
import { BranchPicker } from "@/components/branch-picker";
import { CopyButton } from "@/components/copy-button";
import { ExplorerLink } from "@/components/explorer-link";
import { HandleLink } from "@/components/handle-link";
import { IdentityLink } from "@/components/identity-link";
import { shortOutpoint } from "@/lib/format";
import { type HeadRecord, type RepoRecord, repoName } from "@/lib/gib-api";
import type { BranchesResult, BranchRecord } from "@/lib/gib-lookup";
import { authorHandles } from "@/lib/handles-server";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Repository title bar. Owner and branch labels carry a BRC-169 handle only
 * when that identity's own current head on this repository origin has a
 * verified one.
 */
export async function RepoHeader({
	repo,
	heads,
	branches,
	current,
	tab,
}: {
	repo: RepoRecord;
	/** Current heads, for the handle labels: they carry the commit authors. */
	heads: HeadRecord[];
	/**
	 * The repository's branches as the overlay's `branches` lookup reports
	 * them — the chain's answer, including branches nobody is extending any
	 * more. Null when the overlay could not answer.
	 */
	branches: BranchesResult | null;
	/** The head the page is showing, if any. */
	current?: HeadRecord;
	tab: "code" | "commits";
}) {
	// The genesis push names the repository's default branch; the `.gib`
	// label is only a fallback, and "main" only when there is nothing else.
	const defaultBranch = branches?.defaultBranch || repo.defaultBranch || "main";
	const branch = current?.branch ?? "";
	const owner = branches?.owner || repo.owner;
	// The lookup is the branch list. When the overlay cannot answer it, the
	// current heads from the REST route are a narrower stand-in — every
	// branch that still has one — rather than an empty picker.
	const branchList: BranchRecord[] =
		branches?.branches ??
		heads.map((h) => ({
			branch: h.branch,
			identity: h.identity,
			tip: h.outpoint,
			sha: h.commit?.sha,
			root: h.root,
			score: h.score,
		}));
	const handles = await authorHandles(heads);
	const labels: Record<string, string> = {};
	for (const h of heads) {
		const verified = handles[h.outpoint];
		if (verified && !labels[h.identity]) labels[h.identity] = verified.display;
	}
	const ownerHandle = heads.find(
		(h) => h.identity === owner && handles[h.outpoint],
	);
	return (
		<div className="flex flex-col gap-3 mb-4">
			<div className="flex items-center gap-2 flex-wrap">
				<h1
					className={`text-xl font-semibold ${repo.name ? "" : "font-mono"}`}
					title={repo.origin}
				>
					<Link href={routes.repo(repo.origin)} className="hover:underline">
						{repoName(repo)}
					</Link>
				</h1>
				{repo.name && (
					<span className="text-xs text-muted-foreground font-mono">
						{shortOutpoint(repo.origin)}
					</span>
				)}
				<CopyButton value={repo.origin} label="Copy origin" />
				<ExplorerLink
					outpoint={repo.origin}
					label="Origin transaction on bananablocks"
				/>
				<span className="text-sm text-muted-foreground flex items-center gap-1">
					by{" "}
					{ownerHandle && (
						<HandleLink
							handle={handles[ownerHandle.outpoint]}
							className="text-foreground"
						/>
					)}
					<IdentityLink identity={owner} />
				</span>
			</div>
			{repo.description && (
				<p className="text-sm text-muted-foreground">{repo.description}</p>
			)}
			<div className="flex items-center gap-3 flex-wrap text-sm">
				<BranchPicker
					origin={repo.origin}
					branches={branchList}
					current={current}
					labels={labels}
				/>
				{current && <BranchButton head={current} />}
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
						href={routes.commits(repo.origin, branch || defaultBranch)}
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
