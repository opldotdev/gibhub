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
import { defaultBranchHead, getRepo } from "@/lib/gib-api";
import { type DirEntry, fetchText, loadDirectory } from "@/lib/ordfs";

export const revalidate = 30;

type Params = Promise<{ origin: string }>;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { origin } = await params;
	return { title: shortOutpoint(toOrdinalOutpoint(origin)) };
}

const README_RE = /^readme(\.(md|markdown|txt))?$/i;

export default async function RepoPage({ params }: { params: Params }) {
	const { origin: rawOrigin } = await params;
	const origin = toOrdinalOutpoint(rawOrigin);
	const repo = await getRepo(origin);
	if (!repo) notFound();

	const head = defaultBranchHead(repo.branchHeads);
	let entries: DirEntry[] = [];
	let treeError: unknown = null;
	if (head) {
		try {
			entries = await loadDirectory(head.root);
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
