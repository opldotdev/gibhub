import { notFound, redirect } from "next/navigation";
import { FileTree } from "@/components/file-tree";
import { PathBreadcrumbs } from "@/components/path-breadcrumbs";
import { RepoHeader } from "@/components/repo-header";
import {
	isUnsupportedManifest,
	UnsupportedManifest,
} from "@/components/unsupported-manifest";
import { shortOutpoint, toOrdinalOutpoint } from "@/lib/format";
import { getRepo } from "@/lib/gib-api";
import { type DirEntry, loadDirectory, resolvePath } from "@/lib/ordfs";
import { resolveRef } from "@/lib/resolve-ref";
import { routes } from "@/lib/routes";

export const revalidate = 30;

type Params = Promise<{ origin: string; headRef: string; path?: string[] }>;

export default async function TreePage({ params }: { params: Params }) {
	const { origin: rawOrigin, headRef, path: rawPath = [] } = await params;
	const origin = toOrdinalOutpoint(rawOrigin);
	const path = rawPath.map(decodeURIComponent);

	const [repo, resolved] = await Promise.all([
		getRepo(origin),
		resolveRef(origin, headRef),
	]);
	if (!repo || !resolved) notFound();
	const { head } = resolved;

	let entries: DirEntry[] = [];
	let treeError: unknown = null;
	try {
		const entry = await resolvePath(head.root, path);
		if (!entry) notFound();
		if (entry.kind === "file") {
			redirect(routes.blob(origin, head.outpoint, path));
		}
		entries = await loadDirectory(entry.outpoint);
	} catch (err) {
		if (!isUnsupportedManifest(err)) throw err;
		treeError = err;
	}

	return (
		<div>
			<RepoHeader
				repo={repo}
				heads={repo.branchHeads}
				current={head}
				tab="code"
			/>
			<PathBreadcrumbs
				origin={origin}
				headRef={head.outpoint}
				path={path}
				rootLabel={shortOutpoint(origin)}
			/>
			{treeError ? (
				<UnsupportedManifest error={treeError} />
			) : (
				<FileTree
					origin={origin}
					headRef={head.outpoint}
					path={path}
					entries={entries}
				/>
			)}
		</div>
	);
}
