import Link from "next/link";
import { Fragment } from "react";
import { routes } from "@/lib/routes";

export function PathBreadcrumbs({
	origin,
	headRef,
	path,
	rootLabel,
}: {
	origin: string;
	headRef: string;
	path: string[];
	rootLabel: string;
}) {
	return (
		<div className="font-mono text-sm flex items-center gap-1 flex-wrap mb-3">
			<Link
				href={routes.tree(origin, headRef)}
				className="hover:underline font-medium"
			>
				{rootLabel}
			</Link>
			{path.map((seg, i) => {
				const isLast = i === path.length - 1;
				const sub = path.slice(0, i + 1);
				return (
					<Fragment key={sub.join("/")}>
						<span className="text-muted-foreground">/</span>
						{isLast ? (
							<span>{seg}</span>
						) : (
							<Link
								href={routes.tree(origin, headRef, sub)}
								className="hover:underline"
							>
								{seg}
							</Link>
						)}
					</Fragment>
				);
			})}
		</div>
	);
}
