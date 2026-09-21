import { notFound, redirect } from "next/navigation";
import { BlobView } from "@/components/blob-view";
import { CopyButton } from "@/components/copy-button";
import { ExplorerLink } from "@/components/explorer-link";
import { PathBreadcrumbs } from "@/components/path-breadcrumbs";
import { RepoHeader } from "@/components/repo-header";
import {
	isUnsupportedManifest,
	UnsupportedManifest,
} from "@/components/unsupported-manifest";
import { formatBytes, shortOutpoint, toOrdinalOutpoint } from "@/lib/format";
import { getRepo } from "@/lib/gib-api";
import { lookupBranches } from "@/lib/gib-lookup";
import {
	contentUrl,
	type DirEntry,
	fetchText,
	isGitStorePath,
	isImageType,
	resolvePath,
} from "@/lib/ordfs";
import { resolveRef } from "@/lib/resolve-ref";
import { routes } from "@/lib/routes";

export const revalidate = 30;

type Params = Promise<{ origin: string; ref: string; path: string[] }>;

export default async function BlobPage({ params }: { params: Params }) {
	const { origin: rawOrigin, ref: headRef, path: rawPath } = await params;
	const origin = toOrdinalOutpoint(rawOrigin);
	const path = rawPath.map(decodeURIComponent);

	// gib's object store is not a file of this repository.
	if (isGitStorePath(path)) notFound();

	const [repo, resolved, branches] = await Promise.all([
		getRepo(origin),
		resolveRef(origin, headRef),
		lookupBranches(origin),
	]);
	if (!repo || !resolved) notFound();
	const { head } = resolved;

	let entry: DirEntry | null = null;
	try {
		entry = await resolvePath(head.root, path);
	} catch (err) {
		if (!isUnsupportedManifest(err)) throw err;
		return (
			<div>
				<RepoHeader
					repo={repo}
					heads={repo.branchHeads}
					branches={branches}
					current={head}
					tab="code"
				/>
				<UnsupportedManifest error={err} />
			</div>
		);
	}
	if (!entry) notFound();
	if (entry.kind === "dir") redirect(routes.tree(origin, head.outpoint, path));

	const text = isImageType(entry.contentType)
		? null
		: await fetchText(entry.outpoint);
	const name = path[path.length - 1] ?? "";

	return (
		<div>
			<RepoHeader
				repo={repo}
				heads={repo.branchHeads}
				branches={branches}
				current={head}
				tab="code"
			/>
			<PathBreadcrumbs
				origin={origin}
				headRef={head.outpoint}
				path={path}
				rootLabel={shortOutpoint(origin)}
			/>
			<div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
				<span>{formatBytes(entry.size)}</span>
				{entry.contentType && <span>{entry.contentType}</span>}
				<span className="font-mono flex items-center gap-1">
					{shortOutpoint(entry.outpoint)}
					<CopyButton value={entry.outpoint} label="Copy outpoint" />
				</span>
				<a href={contentUrl(entry.outpoint)} className="underline ml-auto">
					Raw
				</a>
				<ExplorerLink
					outpoint={entry.outpoint}
					label="Transaction holding this file on bananablocks"
				>
					<span className="underline">Explorer</span>
				</ExplorerLink>
			</div>
			<BlobView
				name={name}
				outpoint={entry.outpoint}
				contentType={entry.contentType}
				size={entry.size}
				text={text?.text ?? null}
				truncated={text?.truncated ?? false}
				origin={origin}
				headRef={head.outpoint}
				root={head.root}
				dir={path.slice(0, -1)}
			/>
		</div>
	);
}
