const OUTPOINT_RE = /^[0-9a-f]{64}[_.]\d+$/i;

/** True for txid_vout or txid.vout. */
export const isOutpoint = (s: string) => OUTPOINT_RE.test(s);

/** Normalizes an outpoint to the ORDFS / gib form (txid_vout). */
export const toOrdinalOutpoint = (s: string) => s.replace(".", "_");

export const outpointTxid = (outpoint: string) => outpoint.slice(0, 64);

export const outpointVout = (outpoint: string) =>
	Number.parseInt(outpoint.slice(65), 10);

/** c657be5a…007c_0 */
export function shortOutpoint(outpoint: string, head = 8, tail = 4): string {
	if (!isOutpoint(outpoint)) return outpoint;
	const txid = outpointTxid(outpoint);
	return `${txid.slice(0, head)}…${txid.slice(-tail)}${outpoint.slice(64)}`;
}

/** 02a1b2…9f0e */
export function shortKey(key: string, head = 6, tail = 4): string {
	if (key.length <= head + tail + 1) return key;
	return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

export function shortSha(sha: string | undefined, len = 7): string {
	return sha ? sha.slice(0, len) : "";
}

export function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined || Number.isNaN(bytes)) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Relative time for a unix timestamp in seconds. */
export function timeAgo(unixSeconds: number | undefined, now = Date.now()) {
	if (!unixSeconds) return "";
	const diff = Math.max(0, Math.floor(now / 1000) - unixSeconds);
	const units: [number, string][] = [
		[60, "second"],
		[60, "minute"],
		[24, "hour"],
		[30, "day"],
		[12, "month"],
	];
	let value = diff;
	let unit = "second";
	for (const [size, name] of units) {
		unit = name;
		if (value < size) break;
		value = Math.floor(value / size);
		unit = name === "month" ? "year" : unit;
	}
	if (unit === "second" && value < 10) return "just now";
	return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

/**
 * Best-effort time for a head: the git author timestamp, else the mempool
 * score (unix seconds) the overlay assigned when it first saw the head.
 */
export function headTime(head: {
	commit?: { author?: { time?: number } } | null;
	score: number;
	height: number;
}): number | undefined {
	if (head.commit?.author?.time) return head.commit.author.time;
	if (head.height === 0 && head.score > 1e9) return Math.floor(head.score);
	return undefined;
}

export function firstLine(message: string | undefined): string {
	if (!message) return "";
	const line = message.split("\n", 1)[0] ?? "";
	return line.trim();
}

export function messageBody(message: string | undefined): string {
	if (!message) return "";
	const idx = message.indexOf("\n");
	return idx < 0 ? "" : message.slice(idx + 1).trim();
}
