import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileTree } from "@/components/file-tree";
import { Markdown } from "@/components/markdown";
import { RepoHeader } from "@/components/repo-header";
import {
	isUnsupportedManifest,
	UnsupportedManifest,
} from "@/components/unsupported-manifest";
import { shortOutpoint, toOrdinalOutpoint } from "@/lib/format";
import { defaultBranchHead, getRepo, repoName } from "@/lib/gib-api";
import { lookupBranches } from "@/lib/gib-lookup";
import {
	type DirEntry,
	fetchText,
	loadDirectory,
	withoutGitStore,
} from "@/lib/ordfs";

export const revalidate = 30;

type Params = Promise<{ origin: string }>;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { origin } = await params;
	const repo = await getRepo(toOrdinalOutpoint(origin));
	return {
		title: repo ? repoName(repo) : shortOutpoint(toOrdinalOutpoint(origin)),
		description: repo?.description,
	};
}

const README_RE = /^readme(\.(md|markdown|txt))?$/i;

export default async function RepoPage({ params }: { params: Params }) {
	const { origin: rawOrigin } = await params;
	const origin = toOrdinalOutpoint(rawOrigin);
	const [repo, branches] = await Promise.all([
		getRepo(origin),
		lookupBranches(origin),
	]);
	if (!repo) notFound();

	// The branch to open on is the genesis push's, which is what the chain
	// shows; `.gib`'s defaultBranch is only the label its publisher wrote.
	const head = defaultBranchHead(
		repo.branchHeads,
		branches?.defaultBranch || repo.defaultBranch,
	);
	let entries: DirEntry[] = [];
	let treeError: unknown = null;
	if (head) {
		try {
			// `.git` is gib's object store, not the project's files.
			entries = withoutGitStore(await loadDirectory(head.root));
		} catch (err) {
			treeError = err;
		}
	}
	const unsupported = treeError !== null && isUnsupportedManifest(treeError);
	const failed = treeError !== null && !unsupported;
	const readme = entries.find(
		(e) => e.kind === "file" && README_RE.test(e.name),
	);
	const readmeText = readme ? await fetchText(readme.outpoint) : null;

	return (
		<div>
			<RepoHeader
				repo={repo}
				heads={repo.branchHeads}
				branches={branches}
				current={head}
				tab="code"
			/>
			{!head && (
				<p className="text-sm text-muted-foreground border p-6">
					This repository has no current branch heads. Every branch was deleted.
				</p>
			)}
			{head && unsupported && <UnsupportedManifest error={treeError} />}
			{head && failed && (
				<p className="text-sm text-destructive border p-6">
					Failed to load tree: {String(treeError)}
				</p>
			)}
			{head && !treeError && (
				<FileTree
					origin={origin}
					headRef={head.outpoint}
					path={[]}
					entries={entries}
				/>
			)}
			{head && readme && readmeText && (
				<section className="mt-6 border">
					<div className="px-4 py-2 border-b text-sm font-mono text-muted-foreground">
						{readme.name}
					</div>
					<div className="p-6">
						{/\.(md|markdown)$/i.test(readme.name) ? (
							<Markdown
								source={readmeText.text}
								origin={origin}
								headRef={head.outpoint}
								root={head.root}
							/>
						) : (
							<pre className="text-sm whitespace-pre-wrap">
								{readmeText.text}
							</pre>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
