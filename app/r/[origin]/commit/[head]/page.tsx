import { FolderTree } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity } from "@/components/activity";
import { BranchButton } from "@/components/branch-button";
import { CopyButton } from "@/components/copy-button";
import { HandleLink } from "@/components/handle-link";
import { HeadList } from "@/components/head-list";
import { IdentityLink } from "@/components/identity-link";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { txExplorerUrl } from "@/lib/explorer";
import {
	firstLine,
	messageBody,
	shortOutpoint,
	timeAgo,
	toOrdinalOutpoint,
} from "@/lib/format";
import {
	getCommit,
	getHead,
	getRepo,
	type HeadRecord,
	type Signature,
} from "@/lib/gib-api";
import { lookupBranches } from "@/lib/gib-lookup";
import type { VerifiedHandle } from "@/lib/handles";
import { authorHandles, commitHandles } from "@/lib/handles-server";
import { routes } from "@/lib/routes";

export const revalidate = 30;

type Params = Promise<{ origin: string; head: string }>;

export default async function CommitPage({ params }: { params: Params }) {
	const { origin: rawOrigin, head: rawHead } = await params;
	const origin = toOrdinalOutpoint(rawOrigin);
	const [repo, head, branches] = await Promise.all([
		getRepo(origin),
		getHead(toOrdinalOutpoint(rawHead)),
		lookupBranches(origin),
	]);
	if (!repo || !head || head.origin !== origin) notFound();
	const commit = head.commit;
	// The token's second parent. Alongside a spend it is a merge; on its own
	// it is where this branch began. Resolving it gives the branch name and
	// publisher it came from, and the repository origin to link it under.
	const [node, from] = await Promise.all([
		commit ? getCommit(commit.sha) : null,
		head.branchedFrom ? getHead(head.branchedFrom) : null,
	]);
	const elsewhere =
		node?.heads.filter((h) => h.outpoint !== head.outpoint) ?? [];
	const children = node?.children ?? [];
	const deleted = head.spend && !head.spend.next;
	// Handles are verified against this head's signer only; the same commit
	// on another publisher's head is checked against that head in its list.
	const [handles, related] = await Promise.all([
		commitHandles(commit, head.identity),
		authorHandles([...elsewhere, ...children]),
	]);

	return (
		<div>
			<RepoHeader
				repo={repo}
				heads={repo.branchHeads}
				branches={branches}
				current={head}
				tab="commits"
			/>
			<div className="border">
				<div className="p-4 border-b flex flex-col gap-2">
					<div className="flex items-start gap-2 flex-wrap">
						<h2 className="text-lg font-semibold flex-1">
							{firstLine(commit?.message) || (
								<span className="text-muted-foreground italic">
									The overlay holds no commit object for this head
								</span>
							)}
						</h2>
						<Badge variant="secondary" className="font-mono">
							{head.branch}
						</Badge>
						{deleted && <Badge variant="destructive">deleted</Badge>}
						{head.branchedFrom && (
							<Badge variant="outline">
								{head.prev ? "merge" : "branched"}
							</Badge>
						)}
						{!head.spend && <Badge>current</Badge>}
					</div>
					{commit && messageBody(commit.message) && (
						<pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground">
							{messageBody(commit.message)}
						</pre>
					)}
					<div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
						<span>
							published by <IdentityLink identity={head.identity} />
						</span>
						<span>
							<Activity score={head.score} />
						</span>
						<span className="ml-auto flex items-center gap-2">
							<BranchButton head={head} />
							<Button asChild variant="outline" size="sm">
								<Link href={routes.tree(origin, head.outpoint)}>
									<FolderTree className="size-4" /> Browse files
								</Link>
							</Button>
						</span>
					</div>
				</div>
				<dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 p-4 text-sm">
					{commit && (
						<>
							<Term>commit</Term>
							<dd className="font-mono flex items-center gap-1 break-all">
								<Link
									href={routes.commitSha(commit.sha)}
									className="hover:underline"
								>
									{commit.sha}
								</Link>
								<CopyButton value={commit.sha} />
							</dd>
							<Term>tree</Term>
							<Mono value={commit.tree} />
							{commit.parents.map((p) => (
								<ParentRow key={p} sha={p} />
							))}
							<Term>author</Term>
							<dd>
								<Person sig={commit.author} handle={handles.author} />
							</dd>
							<Term>committer</Term>
							<dd>
								<Person sig={commit.committer} handle={handles.committer} />
							</dd>
						</>
					)}
					<Term>head</Term>
					<Mono value={head.outpoint} />
					<Term>root</Term>
					<dd className="font-mono flex items-center gap-1 break-all">
						<Link
							href={routes.tree(origin, head.outpoint)}
							className="hover:underline"
						>
							{head.root}
						</Link>
						<CopyButton value={head.root} />
					</dd>
					{head.branchedFrom && (
						<>
							<Term>{head.prev ? "merged in" : "branched from"}</Term>
							<dd className="font-mono break-all">
								<BranchedFrom
									outpoint={head.branchedFrom}
									head={from}
									fallbackOrigin={origin}
								/>
							</dd>
						</>
					)}
					{head.prev && (
						<>
							<Term>previous push</Term>
							<dd className="font-mono break-all">
								<Link
									href={routes.commit(origin, head.prev)}
									className="hover:underline"
								>
									{shortOutpoint(head.prev, 12, 6)}
								</Link>
							</dd>
						</>
					)}
					{head.spend?.next && (
						<>
							<Term>next push</Term>
							<dd className="font-mono break-all">
								<Link
									href={routes.commit(origin, head.spend.next)}
									className="hover:underline"
								>
									{shortOutpoint(head.spend.next, 12, 6)}
								</Link>
							</dd>
						</>
					)}
					{head.spend && (
						<>
							<Term>spent in</Term>
							<dd className="font-mono break-all">
								<a
									href={txExplorerUrl(head.spend.txid)}
									className="hover:underline"
									rel="noreferrer"
									target="_blank"
								>
									{head.spend.txid}
								</a>
							</dd>
						</>
					)}
					<Term>transaction</Term>
					<dd className="font-mono break-all">
						<a
							href={txExplorerUrl(head.txid)}
							className="hover:underline"
							rel="noreferrer"
							target="_blank"
						>
							{head.txid}
						</a>
					</dd>
				</dl>
			</div>
			{(elsewhere.length > 0 || children.length > 0) && (
				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<section>
						<h2 className="text-sm font-semibold mb-2">Also published as</h2>
						<HeadList
							heads={elsewhere}
							showRepo
							handles={related}
							empty="Only this head carries this commit."
						/>
					</section>
					<section>
						<h2 className="text-sm font-semibold mb-2">Built on by</h2>
						<HeadList
							heads={children}
							showRepo
							handles={related}
							empty="Nothing indexed builds on this commit yet."
						/>
					</section>
				</div>
			)}
		</div>
	);
}

/**
 * The head a push branched from or merged in. Linked under its own
 * repository origin when the overlay knows it — a branch may fork from a
 * head this site has never shown — and left as a bare outpoint when it does
 * not, because a link that 404s is worse than none.
 */
function BranchedFrom({
	outpoint,
	head,
	fallbackOrigin,
}: {
	outpoint: string;
	head: HeadRecord | null;
	fallbackOrigin: string;
}) {
	if (!head) {
		return <span title={outpoint}>{shortOutpoint(outpoint, 12, 6)}</span>;
	}
	return (
		<Link
			href={routes.commit(head.origin || fallbackOrigin, outpoint)}
			className="hover:underline"
		>
			{shortOutpoint(outpoint, 12, 6)}
			<span className="text-muted-foreground"> · {head.branch}</span>
		</Link>
	);
}

function Term({ children }: { children: React.ReactNode }) {
	return <dt className="text-muted-foreground">{children}</dt>;
}

function Mono({ value }: { value: string }) {
	return (
		<dd className="font-mono flex items-center gap-1 break-all">
			{value}
			<CopyButton value={value} />
		</dd>
	);
}

function ParentRow({ sha }: { sha: string }) {
	return (
		<>
			<Term>parent</Term>
			<dd className="font-mono flex items-center gap-1 break-all">
				<Link href={routes.commitSha(sha)} className="hover:underline">
					{sha}
				</Link>
				<CopyButton value={sha} />
			</dd>
		</>
	);
}

/**
 * A git signature. With a verified handle the email slot shows the handle
 * (linked, with the verified mark); otherwise the raw `Name <email>`.
 */
function Person({ sig, handle }: { sig?: Signature; handle?: VerifiedHandle }) {
	if (!sig) return <span className="text-muted-foreground">unknown</span>;
	return (
		<span>
			{sig.name}
			{handle ? (
				<span className="text-muted-foreground">
					{" "}
					&lt;
					<HandleLink handle={handle} className="text-foreground" />
					&gt;
				</span>
			) : (
				sig.email && (
					<span className="text-muted-foreground"> &lt;{sig.email}&gt;</span>
				)
			)}
			{sig.time > 0 && (
				<span className="text-muted-foreground">
					{" "}
					· {new Date(sig.time * 1000).toUTCString()} ({timeAgo(sig.time)})
				</span>
			)}
		</span>
	);
}
