/**
 * Handing a new head to the overlay.
 *
 * A head reaches `tm_gib` one way: a client submits it, with the content
 * transactions that prove the push, in the same BEEF. There is no queue, no
 * event bridge and no chain feed behind this module any more — the overlay
 * accepts what it is handed and checks it against itself, fetching nothing.
 * A head this site mints and does not submit is on chain and invisible.
 *
 * Admission reads the push from the submitted BEEF alone, so a submission
 * must carry, besides the head transaction itself:
 *
 *   - the transaction holding the head's `root` (an `ordfs/dir`),
 *   - the transaction holding that root's `.git` object store, and
 *   - the transaction holding the branched-from head, when the token names
 *     one.
 *
 * An atomic BEEF would prune everything the head does not spend, and a
 * push's content is not an ancestor of the head, so the submission is a
 * BEEF V2 with the head transaction **last** — that is the transaction the
 * engine judges.
 */

import { BEEF_V2, Beef } from "@bsv/sdk";
import { outpointTxid } from "./format";
import { OVERLAY_PATH, TOPIC } from "./gib-lookup";
import { GIT_STORE, loadManifest } from "./ordfs";
import { stackApiUrl } from "./stack";

/** BEEF for one transaction from the stack's repair route. Null when it has none. */
export async function fetchBeef(txid: string): Promise<number[] | null> {
	try {
		const res = await fetch(stackApiUrl(`/1sat/beef/${txid}`));
		if (!res.ok) return null;
		const bytes = new Uint8Array(await res.arrayBuffer());
		return bytes.length ? Array.from(bytes) : null;
	} catch {
		return null;
	}
}

/**
 * Merges the head's own BEEF with the transactions its push relies on and
 * serializes the result with the head last. Pure: everything it needs is
 * passed in, so the ordering rule can be tested without a network or a
 * wallet.
 */
export function buildSubmission(
	headBeef: number[] | Uint8Array,
	headTxid: string,
	extras: (number[] | Uint8Array)[],
): number[] {
	const beef = Beef.fromBinary(headBeef);
	for (const extra of extras) beef.mergeBeef(extra);
	// V2 so a transaction can ride along without a proof of its own.
	beef.version = BEEF_V2;
	// sortTxs puts dependencies before dependents and clears the pending-sort
	// flag, so the explicit move below survives serialization. The content
	// transactions are not ancestors of the head, so nothing but this move
	// decides where the head lands.
	beef.sortTxs();
	const index = beef.txs.findIndex((tx) => tx.txid === headTxid);
	if (index < 0) {
		throw new Error("the head transaction is not in its own BEEF");
	}
	if (index !== beef.txs.length - 1) {
		const [head] = beef.txs.splice(index, 1);
		beef.txs.push(head);
	}
	return beef.toBinary();
}

/** The outpoint of a published root's `.git` store, or null when it has none. */
export async function gitStoreOutpoint(root: string): Promise<string | null> {
	try {
		const entry = (await loadManifest(root)).find((e) => e.name === GIT_STORE);
		return entry?.outpoint ?? null;
	} catch {
		return null;
	}
}

export interface SubmitHeadArgs {
	/** The BEEF the wallet returned for the transaction holding the head. */
	headBeef: number[] | Uint8Array;
	headTxid: string;
	/** The `ordfs/dir` root the head names. */
	root: string;
	/** The head this one branched from or merged in, when there is one. */
	branchedFrom?: string;
}

/**
 * Submits a minted head to the gib topic manager. Resolves to the overlay's
 * answer, or throws — callers treat a failure as "minted but not indexed",
 * never as a failed mint: the coin is on chain either way.
 */
export async function submitHead(args: SubmitHeadArgs): Promise<void> {
	const needed = new Set<string>();
	needed.add(outpointTxid(args.root));
	const store = await gitStoreOutpoint(args.root);
	if (store) needed.add(outpointTxid(store));
	if (args.branchedFrom) needed.add(outpointTxid(args.branchedFrom));
	needed.delete(args.headTxid);

	const extras: number[][] = [];
	for (const txid of needed) {
		const beef = await fetchBeef(txid);
		if (beef) extras.push(beef);
	}

	const body = buildSubmission(args.headBeef, args.headTxid, extras);
	const res = await fetch(stackApiUrl(`${OVERLAY_PATH}/submit`), {
		method: "POST",
		headers: {
			"content-type": "application/octet-stream",
			// OpenAPI "simple" style with explode — comma-separated, not JSON.
			"x-topics": TOPIC,
		},
		body: new Uint8Array(body),
	});
	if (!res.ok) {
		throw new Error(`overlay submit: ${res.status} ${res.statusText}`);
	}
}
