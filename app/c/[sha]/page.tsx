import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { HeadList } from "@/components/head-list";
import { firstLine, messageBody, shortSha, timeAgo } from "@/lib/format";
import { getCommit } from "@/lib/gib-api";
import { routes } from "@/lib/routes";

export const revalidate = 30;

type Params = Promise<{ sha: string }>;

const SHA_RE = /^([0-9a-f]{40}|[0-9a-f]{64})$/;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { sha } = await params;
	return { title: `commit ${shortSha(sha)}` };
}

/**
 * A git commit as a node in the on-chain DAG: where it is published (every
 * head, across repositories and forks), what it builds on, and what builds
 * on it. Parents and children resolve through the overlay's sha index, so
 * history can be followed across origins.
 */
export default async function CommitShaPage({ params }: { params: Params }) {
	const { sha: raw } = await params;
	const sha = raw.toLowerCase();
	if (!SHA_RE.test(sha)) notFound();
	const node = await getCommit(sha);
	if (!node) notFound();

	const commit = node.heads.find((h) => h.commit)?.commit;

	return (
		<div className="flex flex-col gap-6">
			<div className="border p-4 flex flex-col gap-2">
				<div className="text-xs text-muted-foreground font-mono flex items-center gap-1 break-all">
					commit {sha}
					<CopyButton value={sha} />
				</div>
				<h1 className="text-lg font-semibold">
					{commit ? (
						firstLine(commit.message)
					) : (
						<span className="text-muted-foreground italic">
							Commit object not published on any indexed head
						</span>
					)}
				</h1>
				{commit && messageBody(commit.message) && (
					<pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground">
						{messageBody(commit.message)}
					</pre>
				)}
				{commit?.author && (
					<p className="text-xs text-muted-foreground">
						{commit.author.name}
						{commit.author.time > 0 && ` · ${timeAgo(commit.author.time)}`}
					</p>
				)}
				{commit && commit.parents.length > 0 && (
					<div className="text-xs font-mono flex flex-wrap gap-2">
						<span className="text-muted-foreground">parents</span>
						{commit.parents.map((p) => (
							<Link
								key={p}
								href={routes.commitSha(p)}
								className="hover:underline"
							>
								{shortSha(p, 12)}
							</Link>
						))}
					</div>
				)}
			</div>

			<section>
				<h2 className="text-sm font-semibold mb-2">
					Published as {node.heads.length}{" "}
					{node.heads.length === 1 ? "head" : "heads"}
				</h2>
				<HeadList
					heads={node.heads}
					showRepo
					empty="No indexed head carries this commit; it is only known as a parent."
				/>
			</section>

			<section>
				<h2 className="text-sm font-semibold mb-2">
					Built on by {node.children.length}{" "}
					{node.children.length === 1 ? "commit" : "commits"}
				</h2>
				<HeadList
					heads={node.children}
					showRepo
					empty="Nothing indexed builds on this commit yet."
				/>
			</section>
		</div>
	);
}
