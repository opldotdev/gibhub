import { GitBranch, GitCommitHorizontal } from "lucide-react";
import Link from "next/link";
import { Activity } from "@/components/activity";
import { IdentityLink } from "@/components/identity-link";
import { shortOutpoint } from "@/lib/format";
import { type RepoRecord, repoName } from "@/lib/gib-api";
import { routes } from "@/lib/routes";

export function RepoList({
	repos,
	empty = "No repositories yet.",
}: {
	repos: RepoRecord[];
	empty?: string;
}) {
	if (repos.length === 0) {
		return <p className="text-sm text-muted-foreground">{empty}</p>;
	}
	return (
		<ul className="divide-y border">
			{repos.map((repo) => (
				<li key={repo.origin} className="p-4 flex flex-col gap-1">
					<div className="flex items-baseline gap-2 flex-wrap">
						<Link
							href={routes.repo(repo.origin)}
							className={`font-medium hover:underline ${repo.name ? "" : "font-mono"}`}
							title={repo.origin}
						>
							{repoName(repo)}
						</Link>
						{repo.name && (
							<span className="text-xs text-muted-foreground font-mono">
								{shortOutpoint(repo.origin)}
							</span>
						)}
						<span className="text-xs text-muted-foreground">
							by <IdentityLink identity={repo.owner} />
						</span>
					</div>
					{repo.description && (
						<p className="text-sm text-muted-foreground">{repo.description}</p>
					)}
					<div className="flex items-center gap-4 text-xs text-muted-foreground">
						<span className="flex items-center gap-1">
							<GitBranch className="size-3" /> {repo.branches}{" "}
							{repo.branches === 1 ? "branch" : "branches"}
						</span>
						<span className="flex items-center gap-1">
							<GitCommitHorizontal className="size-3" /> {repo.heads}{" "}
							{repo.heads === 1 ? "push" : "pushes"}
						</span>
						<span>
							updated <Activity score={repo.lastScore} />
						</span>
					</div>
				</li>
			))}
		</ul>
	);
}
