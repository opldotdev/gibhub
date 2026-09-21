/**
 * The gib overlay's BRC-24 lookup service (`ls_gib`), at
 * `${STACK_URL}/1sat/gib/overlay/lookup`.
 *
 * The site uses one of its three queries: `branches`, a repository's branches
 * with each one's tip, plus the `defaultBranch` and `owner` of the genesis
 * push. That is the branch list the chain shows, as opposed to the
 * `defaultBranch` label a publisher wrote into `.gib`, and unlike the REST
 * branch routes it says which branches their publisher has stopped
 * extending. (`headsSince` and `txs` are what a client cloning a repository
 * needs; this site browses through ORDFS and does not clone.)
 *
 * A BRC-24 answer carries its payload in `result`, JSON-encoded as a string.
 */

import { toOrdinalOutpoint } from "./format";
import { stackApiUrl } from "./stack";

export const LOOKUP_SERVICE = "ls_gib";
export const TOPIC = "tm_gib";
export const OVERLAY_PATH = "/1sat/gib/overlay";

/** At most 100 branches per page; the overlay's own cap. */
export const MAX_BRANCHES = 100;

/** A position in a repository's branch list, echoed back to page. */
export interface BranchPage {
	branch: string;
	identity?: string;
}

/** One branch of a repository: a (repository origin, branch, identity) triple. */
export interface BranchRecord {
	branch: string;
	identity: string;
	/** The newest head the overlay holds for this branch. */
	tip: string;
	/** The commit that head publishes, when the overlay read it. */
	sha?: string;
	root: string;
	/**
	 * The tip coin was spent with no successor: the publisher has stopped
	 * extending this branch. Still served, still forkable — nothing is
	 * retracted by a burn.
	 */
	spent?: boolean;
	score: number;
}

export interface BranchesResult {
	query: string;
	origin: string;
	/**
	 * The branch and publisher of the repository's genesis push — the
	 * earliest head the overlay holds. On every page, so a client never
	 * pages looking for the default. Absent when the overlay holds nothing.
	 */
	defaultBranch?: string;
	owner?: string;
	branches: BranchRecord[];
	more: boolean;
	next?: BranchPage;
}

interface LookupAnswer {
	type?: string;
	result?: unknown;
}

/** The overlay collapses lookup failures to an opaque 500; treat them as "no answer". */
async function lookup<T>(query: object): Promise<T | null> {
	const init: RequestInit & { next?: { revalidate: number } } = {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ service: LOOKUP_SERVICE, query }),
	};
	if (typeof window === "undefined") init.next = { revalidate: 30 };
	const res = await fetch(stackApiUrl(`${OVERLAY_PATH}/lookup`), init);
	if (!res.ok) return null;
	const answer = (await res.json()) as LookupAnswer;
	const raw = answer?.result;
	if (raw == null) return null;
	// Per the BRC-24 response shape the payload is a JSON string; accept an
	// already-decoded object too rather than depend on that.
	if (typeof raw === "string") {
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	}
	return raw as T;
}

/**
 * A repository's branches, ordered by branch name then publisher. A
 * repository the overlay holds nothing for is an empty list with no
 * `defaultBranch` — "nothing here" rather than "I cannot answer", which is
 * a null return.
 */
export async function lookupBranches(
	origin: string,
	opts: { limit?: number; since?: BranchPage } = {},
): Promise<BranchesResult | null> {
	const result = await lookup<BranchesResult>({
		type: "branches",
		origin: toOrdinalOutpoint(origin),
		limit: Math.min(opts.limit ?? MAX_BRANCHES, MAX_BRANCHES),
		...(opts.since ? { since: opts.since } : {}),
	});
	if (!result || !Array.isArray(result.branches)) return null;
	return result;
}

/**
 * The branch a repository opens on: what the chain shows first, then the
 * `.gib` label its publisher wrote, and nothing invented beyond that.
 */
export const defaultBranchName = (
	branches: BranchesResult | null,
	meta?: { defaultBranch?: string },
) => branches?.defaultBranch || meta?.defaultBranch || undefined;
