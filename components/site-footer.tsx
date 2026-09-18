import { STACK_URL } from "@/lib/stack";

export function SiteFooter() {
	return (
		<footer className="border-t text-xs text-muted-foreground">
			<div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap gap-x-6 gap-y-1">
				<span>
					gib: git on BSV. Content is on-chain; this site only reads it.
				</span>
				<span className="font-mono">stack: {STACK_URL}</span>
			</div>
		</footer>
	);
}
