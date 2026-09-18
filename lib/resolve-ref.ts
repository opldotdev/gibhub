import { isOutpoint, toOrdinalOutpoint } from "./format";
import { getBranch, getHead, type HeadRecord } from "./gib-api";

export interface ResolvedRef {
	head: HeadRecord;
	/** Branch name when the ref was a branch (or the head is current). */
	branch: string;
	/** True when `ref` named a branch rather than a specific head. */
	isBranch: boolean;
}

/**
 * Resolves a URL ref to a head. A ref is either a head outpoint (an
 * immutable snapshot) or a branch name (its current head).
 */
export async function resolveRef(
	origin: string,
	ref: string,
): Promise<ResolvedRef | null> {
	const decoded = decodeURIComponent(ref);
	if (isOutpoint(decoded)) {
		const head = await getHead(toOrdinalOutpoint(decoded));
		if (!head || head.origin !== toOrdinalOutpoint(origin)) return null;
		return { head, branch: head.branch, isBranch: false };
	}
	const branch = await getBranch(origin, decoded, { limit: 1 });
	if (!branch?.head) return null;
	return { head: branch.head, branch: decoded, isBranch: true };
}

/** Ref to put in links: the head outpoint, so links stay valid forever. */
export const refForLinks = (head: HeadRecord) => head.outpoint;
