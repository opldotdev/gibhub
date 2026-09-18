import { HeadList } from "@/components/head-list";
import { RepoList } from "@/components/repo-list";
import { listHeads, listRepos } from "@/lib/gib-api";

export const revalidate = 30;

export default async function ExplorePage() {
	const [repos, pushes] = await Promise.all([
		listRepos({ limit: 20 }),
		listHeads({ limit: 20 }),
	]);
	return (
		<div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
			<section>
				<h2 className="text-lg font-semibold mb-3">Repositories</h2>
				<RepoList
					repos={repos}
					empty="No repositories indexed yet. Push one with gib and it shows up here."
				/>
			</section>
			<section>
				<h2 className="text-lg font-semibold mb-3">Recent pushes</h2>
				<HeadList heads={pushes} showRepo empty="No pushes indexed yet." />
			</section>
		</div>
	);
}
