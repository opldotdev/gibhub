import Link from "next/link";
import { notFound } from "next/navigation";
import { HeadList } from "@/components/head-list";
import { RepoHeader } from "@/components/repo-header";
import { Button } from "@/components/ui/button";
import { toOrdinalOutpoint } from "@/lib/format";
import { getBranch, getRepo } from "@/lib/gib-api";
import { authorHandles } from "@/lib/handles-server";
import { routes } from "@/lib/routes";

export const revalidate = 30;

type Params = Promise<{ origin: string; ref: string[] }>;
type Search = Promise<{ from?: string }>;

const PAGE = 30;

export default async function CommitsPage({
	params,
	searchParams,
}: {
	params: Params;
	searchParams: Search;
}) {
	const { origin: rawOrigin, ref } = await params;
	const { from } = await searchParams;
	const origin = toOrdinalOutpoint(rawOrigin);
	const branch = ref.map(decodeURIComponent).join("/");

	const [repo, data] = await Promise.all([
		getRepo(origin),
		getBranch(origin, branch, {
			limit: PAGE,
			from: from ? Number(from) : undefined,
		}),
	]);
	if (!repo || !data) notFound();
	const handles = await authorHandles(data.history);

	const last = data.history[data.history.length - 1];
	const more = data.history.length === PAGE && last;

	return (
		<div>
			<RepoHeader
				repo={repo}
				heads={repo.branchHeads}
				current={data.head ?? data.history[0]}
				tab="commits"
			/>
			<h2 className="text-sm text-muted-foreground mb-3">
				Push history of{" "}
				<span className="font-mono text-foreground">{branch}</span>
				{!data.head && data.history.length > 0 && " (deleted)"}
			</h2>
			<HeadList
				heads={data.history}
				handles={handles}
				showBranch={false}
				empty="No pushes on this branch."
				branchable
			/>
			{more && (
				<div className="mt-4">
					<Button asChild variant="outline" size="sm">
						<Link href={`${routes.commits(origin, branch)}?from=${last.score}`}>
							Older
						</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
