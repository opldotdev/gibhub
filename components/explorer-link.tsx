import { ExternalLink } from "lucide-react";
import { outpointExplorerUrl, txExplorerUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";

/** Icon link to the block explorer page of the transaction holding a resource. */
export function ExplorerLink({
	txid,
	outpoint,
	label = "View transaction on bananablocks",
	className,
	children,
}: {
	txid?: string;
	outpoint?: string;
	label?: string;
	className?: string;
	children?: React.ReactNode;
}) {
	const href = txid
		? txExplorerUrl(txid)
		: outpoint
			? outpointExplorerUrl(outpoint)
			: undefined;
	if (!href) return null;
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			title={label}
			aria-label={label}
			className={cn(
				"inline-flex items-center gap-1 text-muted-foreground hover:text-foreground",
				className,
			)}
		>
			{children}
			<ExternalLink className="size-3.5" />
		</a>
	);
}
