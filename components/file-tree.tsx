import { File, Folder } from "lucide-react";
import Link from "next/link";
import { formatBytes } from "@/lib/format";
import type { DirEntry } from "@/lib/ordfs";
import { routes } from "@/lib/routes";

export function FileTree({
	origin,
	headRef,
	path,
	entries,
}: {
	origin: string;
	headRef: string;
	path: string[];
	entries: DirEntry[];
}) {
	return (
		<div className="border">
			<table className="w-full text-sm">
				<tbody className="divide-y">
					{path.length > 0 && (
						<tr className="hover:bg-muted/50">
							<td className="px-3 py-2" colSpan={3}>
								<Link
									href={routes.tree(origin, headRef, path.slice(0, -1))}
									className="font-mono hover:underline"
								>
									..
								</Link>
							</td>
						</tr>
					)}
					{entries.map((entry) => {
						const target = [...path, entry.name];
						const href =
							entry.kind === "dir"
								? routes.tree(origin, headRef, target)
								: routes.blob(origin, headRef, target);
						return (
							<tr key={entry.name} className="hover:bg-muted/50">
								<td className="px-3 py-2 w-full">
									<Link
										href={href}
										className="flex items-center gap-2 hover:underline"
									>
										{entry.kind === "dir" ? (
											<Folder className="size-4 text-primary shrink-0" />
										) : (
											<File className="size-4 text-muted-foreground shrink-0" />
										)}
										<span className="font-mono truncate">{entry.name}</span>
										{entry.symlink && (
											<span className="text-xs text-muted-foreground">
												symlink
											</span>
										)}
										{entry.exec && (
											<span className="text-xs text-muted-foreground">
												exec
											</span>
										)}
									</Link>
								</td>
								<td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
									{entry.kind === "file" ? entry.contentType : ""}
								</td>
								<td className="px-3 py-2 text-xs text-muted-foreground text-right whitespace-nowrap">
									{entry.kind === "file" ? formatBytes(entry.size) : ""}
								</td>
							</tr>
						);
					})}
					{entries.length === 0 && (
						<tr>
							<td
								className="px-3 py-6 text-center text-muted-foreground"
								colSpan={3}
							>
								Empty directory
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}
