import { FolderTree } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity } from "@/components/activity";
import { CopyButton } from "@/components/copy-button";
import { IdentityLink } from "@/components/identity-link";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	firstLine,
	messageBody,
	shortOutpoint,
	timeAgo,
	toOrdinalOutpoint,
} from "@/lib/format";
import { getHead, getRepo, type Signature } from "@/lib/gib-api";
import { routes } from "@/lib/routes";

export const revalidate = 30;

type Params = Promise<{ origin: string; head: string }>;

export default async function CommitPage({ params }: { params: Params }) {
	const { origin: rawOrigin, head: rawHead } = await params;
	const origin = toOrdinalOutpoint(rawOrigin);
	const [repo, head] = await Promise.all([
		getRepo(origin),
		getHead(toOrdinalOutpoint(rawHead)),
	]);
	if (!repo || !head || head.origin !== origin) notFound();
	const commit = head.commit;
	const deleted = head.spend && !head.spend.next;

	return (
		<div>
			<RepoHeader
				repo={repo}
				heads={repo.branchHeads}
				current={head}
				tab="commits"
			/>
			<div className="border">
				<div className="p-4 border-b flex flex-col gap-2">
					<div className="flex items-start gap-2 flex-wrap">
						<h2 className="text-lg font-semibold flex-1">
							{firstLine(commit?.message) || (
								<span className="text-muted-foreground italic">
									No commit object on this head
								</span>
							)}
						</h2>
						<Badge variant="secondary" className="font-mono">
							{head.branch}
						</Badge>
						{deleted && <Badge variant="destructive">deleted</Badge>}
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
						<Button asChild variant="outline" size="sm" className="ml-auto">
							<Link href={routes.tree(origin, head.outpoint)}>
								<FolderTree className="size-4" /> Browse files
							</Link>
						</Button>
					</div>
				</div>
				<dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 p-4 text-sm">
					{commit && (
						<>
							<Term>commit</Term>
							<Mono value={commit.sha} />
							<Term>tree</Term>
							<Mono value={commit.tree} />
							{commit.parents.map((p) => (
								<ParentRow key={p} sha={p} />
							))}
							<Term>author</Term>
							<dd>
								<Person sig={commit.author} />
							</dd>
							<Term>committer</Term>
							<dd>
								<Person sig={commit.committer} />
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
									href={`https://whatsonchain.com/tx/${head.spend.txid}`}
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
							href={`https://whatsonchain.com/tx/${head.txid}`}
							className="hover:underline"
							rel="noreferrer"
							target="_blank"
						>
							{head.txid}
						</a>
					</dd>
				</dl>
			</div>
		</div>
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
			<Mono value={sha} />
		</>
	);
}

function Person({ sig }: { sig?: Signature }) {
	if (!sig) return <span className="text-muted-foreground">unknown</span>;
	return (
		<span>
			{sig.name}
			{sig.email && (
				<span className="text-muted-foreground"> &lt;{sig.email}&gt;</span>
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
