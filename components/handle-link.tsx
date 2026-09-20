import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import type { VerifiedHandle } from "@/lib/handles";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * A verified BRC-169 handle: the author's domain resolved it to the key
 * that signed the head being viewed. Links to that identity's page. The
 * host's display name, when it sends one, is unattested and only goes in
 * the tooltip, labelled as such.
 */
export function HandleLink({
	handle,
	className,
}: {
	handle: VerifiedHandle;
	className?: string;
}) {
	const title = [
		`Verified: ${handle.domain} resolves ${handle.display} to the key that signed this head`,
		handle.displayName &&
			`Display name (host-supplied, unattested): ${handle.displayName}`,
	]
		.filter(Boolean)
		.join("\n");
	return (
		<Link
			href={routes.user(handle.identityKey)}
			title={title}
			className={cn(
				"inline-flex items-center gap-1 hover:underline",
				className,
			)}
		>
			<span>{handle.display}</span>
			<BadgeCheck className="size-3.5 text-primary" aria-label="verified" />
		</Link>
	);
}
