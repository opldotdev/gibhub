import Link from "next/link";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export default function NotFound() {
	return (
		<div className="py-24 flex flex-col items-center gap-4 text-center">
			<h1 className="text-2xl font-semibold">Not found</h1>
			<p className="text-muted-foreground max-w-md">
				Nothing on chain answers to that address, or the overlay has not indexed
				it yet.
			</p>
			<Button asChild variant="outline">
				<Link href={routes.home()}>Back to explore</Link>
			</Button>
		</div>
	);
}
