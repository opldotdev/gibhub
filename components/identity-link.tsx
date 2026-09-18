import Link from "next/link";
import { shortKey } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * A publisher identity. Today this is the raw root identity key; a name
 * registry (1sat.name) can front it later without changing callers.
 */
export function IdentityLink({
	identity,
	className,
}: {
	identity: string;
	className?: string;
}) {
	return (
		<Link
			href={routes.user(identity)}
			title={identity}
			className={cn("font-mono hover:underline", className)}
		>
			{shortKey(identity)}
		</Link>
	);
}
