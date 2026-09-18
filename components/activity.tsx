import { timeAgo } from "@/lib/format";

/** Renders when something happened from an overlay score. */
export function Activity({ score }: { score: number }) {
	if (score > 1e9) {
		return (
			<time dateTime={new Date(score * 1000).toISOString()}>
				{timeAgo(Math.floor(score))}
			</time>
		);
	}
	if (score > 0) {
		return <span>block {Math.floor(score).toLocaleString()}</span>;
	}
	return null;
}
