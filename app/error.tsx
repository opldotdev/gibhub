"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className="py-24 flex flex-col items-center gap-4 text-center">
			<h1 className="text-2xl font-semibold">Something went wrong</h1>
			<p className="text-muted-foreground max-w-md font-mono text-sm break-all">
				{error.message}
			</p>
			<Button variant="outline" onClick={() => reset()}>
				Try again
			</Button>
		</div>
	);
}
