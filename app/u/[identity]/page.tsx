import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { HeadList } from "@/components/head-list";
import { RepoList } from "@/components/repo-list";
import { shortKey } from "@/lib/format";
import { listHeads, listReposByIdentity } from "@/lib/gib-api";

export const revalidate = 30;

type Params = Promise<{ identity: string }>;

const KEY_RE = /^0[23][0-9a-f]{64}$/i;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { identity } = await params;
	return { title: shortKey(identity) };
}

export default async function UserPage({ params }: { params: Params }) {
	const { identity } = await params;
	if (!KEY_RE.test(identity)) notFound();
	const [repos, pushes] = await Promise.all([
		listReposByIdentity(identity, { limit: 50 }),
		listHeads({ identity, limit: 20 }),
	]);
	return (
		<div>
			<div className="mb-6">
				<h1 className="text-xl font-semibold font-mono flex items-center gap-2 break-all">
					{shortKey(identity, 10, 8)}
					<CopyButton value={identity} label="Copy identity key" />
				</h1>
				<p className="text-xs text-muted-foreground font-mono break-all mt-1">
					{identity}
				</p>
			</div>
			<div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
				<section>
					<h2 className="text-lg font-semibold mb-3">Repositories</h2>
					<RepoList
						repos={repos}
						empty="This identity has not pushed anything the overlay has seen."
					/>
				</section>
				<section>
					<h2 className="text-lg font-semibold mb-3">Recent pushes</h2>
					<HeadList heads={pushes} showRepo />
				</section>
			</div>
		</div>
	);
}
