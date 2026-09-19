/**
 * Wallet-side gib operations: branch (new head on the same origin) and delete (burn).
 *
 * Conventions mirror the gib CLI exactly so heads minted here are
 * indistinguishable from CLI pushes: PushDrop protocol `[1, "gib branch"]`,
 * keyID = the root outpoint, counterparty `anyone`, fields as UTF-8 strings,
 * the git commit object inscribed after the lock, basket `gib`, tags
 * `origin:` / `branch:` / `commit:<sha>`, fixed labels `gib push` / `gib delete`.
 *
 * Client-side only: every call goes through the connected BRC-100 wallet.
 */

import {
	completeSignedAction,
	pushDropCustomInstructions,
	pushDropLock,
	stampManagedOutputIds,
	unlockByScript,
} from "@1sat/actions";
import { Inscription } from "@1sat/templates";
import {
	type CreateActionArgs,
	Utils,
	type WalletInterface,
	type WalletProtocol,
} from "@bsv/sdk";
import { outpointTxid, outpointVout, toOrdinalOutpoint } from "./format";
import type { HeadRecord } from "./gib-api";
import { contentUrl } from "./ordfs";
import { GIB_BASKET } from "./stack";

export const GIB_PROTOCOL: WalletProtocol = [1, "gib branch"];
export const GIT_COMMIT_TYPE = "application/x-git-commit";
const UNLOCK_LENGTH = 73;

export const originTag = (origin: string) => `origin:${origin}`;
export const branchTag = (branch: string) => `branch:${branch}`;
/**
 * Fixed action labels: BRC-100 wallets gate each distinct label string as
 * its own permission, so a per-commit label would prompt on every push.
 * The commit sha lives in a tag on the basketed head output instead.
 */
export const LABEL_PUSH = "gib push";
export const LABEL_DELETE = "gib delete";
export const commitTag = (sha: string) => `commit:${sha}`;

export const headCustomInstructions = (root: string) =>
	pushDropCustomInstructions({
		protocolID: GIB_PROTOCOL,
		keyID: root,
		counterparty: "anyone",
	});

export interface HeadFields {
	origin: string;
	branch: string;
	root: string;
	/** Compressed identity public key, hex. */
	identity: string;
}

const headFields = (t: HeadFields): number[][] =>
	["gib", t.origin, t.branch, t.root, t.identity].map((s) =>
		Utils.toArray(s, "utf8"),
	);

/** Mints a sealed commit head: PushDrop lock + inscribed git commit object. */
export async function mintHead(
	wallet: WalletInterface,
	fields: HeadFields,
	commitBytes: Uint8Array,
	sha: string | undefined,
): Promise<{ txid: string; outpoint: string }> {
	const lock = await pushDropLock(
		wallet,
		{
			fields: headFields(fields),
			protocolID: GIB_PROTOCOL,
			keyID: fields.root,
			counterparty: "anyone",
			forSelf: true,
		},
		{ includeSignature: true },
	);
	const locking = Inscription.create(commitBytes, GIT_COMMIT_TYPE, {
		scriptPrefix: lock,
	}).lock();
	const args: CreateActionArgs = {
		description: `gib head ${sha ?? fields.branch}`.slice(0, 50),
		outputs: [
			{
				lockingScript: locking.toHex(),
				satoshis: 1,
				outputDescription: "gib commit head",
				basket: GIB_BASKET,
				tags: [
					originTag(fields.origin),
					branchTag(fields.branch),
					...(sha ? [commitTag(sha)] : []),
				],
				customInstructions: headCustomInstructions(fields.root),
			},
		],
		labels: [LABEL_PUSH],
		options: { randomizeOutputs: false },
	};
	stampManagedOutputIds(args);
	const result = await wallet.createAction(args);
	if (!result.txid) throw new Error("wallet returned no txid for the head");
	return { txid: result.txid, outpoint: `${result.txid}_0` };
}

/**
 * Deletes a branch by spending its head coin with no successor. The coin
 * must be in this wallet's gib basket; its customInstructions carry the
 * keyID (the root it was sealed under).
 */
export async function burnHead(
	wallet: WalletInterface,
	head: Pick<HeadRecord, "outpoint" | "origin" | "branch">,
): Promise<string> {
	const outpoint = toOrdinalOutpoint(head.outpoint);
	const walletOutpoint = `${outpointTxid(outpoint)}.${outpointVout(outpoint)}`;
	const listed = await wallet.listOutputs({
		basket: GIB_BASKET,
		tags: [originTag(head.origin), branchTag(head.branch)],
		tagQueryMode: "all",
		include: "entire transactions",
		includeCustomInstructions: true,
		limit: 100,
	});
	const coin = listed.outputs.find((o) => o.outpoint === walletOutpoint);
	if (!coin) throw new Error("this head is not in your wallet's gib basket");
	if (!listed.BEEF?.length)
		throw new Error("wallet returned no BEEF for the head");
	const instructions = JSON.parse(coin.customInstructions ?? "{}") as {
		keyID?: string;
	};
	const keyID = instructions.keyID;
	if (!keyID)
		throw new Error("head coin has no keyID in its customInstructions");
	const beef = Array.from(listed.BEEF);

	const created = await wallet.createAction({
		description: `gib delete ${head.branch}`.slice(0, 50),
		inputBEEF: beef,
		inputs: [
			{
				outpoint: walletOutpoint,
				inputDescription: "gib commit token burn",
				unlockingScriptLength: UNLOCK_LENGTH,
			},
		],
		labels: [LABEL_DELETE],
		options: { signAndProcess: false },
	});

	const done = await completeSignedAction(
		wallet,
		created,
		beef,
		async (tx) => {
			const txid = outpointTxid(outpoint);
			const vout = outpointVout(outpoint);
			const idx = tx.inputs.findIndex(
				(i) => i.sourceTXID === txid && i.sourceOutputIndex === vout,
			);
			if (idx < 0)
				throw new Error("head input missing from funded transaction");
			const input = tx.inputs[idx];
			const source = input?.sourceTransaction?.outputs[input.sourceOutputIndex];
			if (!source) throw new Error("head input source missing");
			const r = await unlockByScript(
				wallet,
				tx,
				idx,
				source.lockingScript,
				source.satoshis ?? 1,
				{ protocolID: GIB_PROTOCOL, keyID, counterparty: "anyone" },
			);
			if ("error" in r) throw new Error(`unlock head: ${r.error}`);
			return { [idx]: { unlockingScript: r.unlockingScript } };
		},
		{ acceptDelayedBroadcast: false },
	);
	if (done.error || !done.txid) {
		throw new Error(done.error ?? "wallet returned no txid for the burn");
	}
	return done.txid;
}

/**
 * Publishes a new branch on the same repository from an existing head: a
 * head under the connected wallet's identity, same origin, same root, same
 * commit object (fetched from ORDFS and reused verbatim). No content is
 * copied and no new origin is minted; the shared DAG shows how it relates.
 */
export async function branchFromHead(
	wallet: WalletInterface,
	head: HeadRecord,
	branch: string,
	identity: string,
): Promise<{ origin: string; head: string }> {
	const name = branch.trim();
	if (!name) throw new Error("branch name is required");
	const commitRes = await fetch(contentUrl(head.outpoint));
	if (!commitRes.ok) {
		throw new Error(`could not fetch the commit object (${commitRes.status})`);
	}
	const commitBytes = new Uint8Array(await commitRes.arrayBuffer());
	const minted = await mintHead(
		wallet,
		{ origin: head.origin, branch: name, root: head.root, identity },
		commitBytes,
		head.commit?.sha,
	);
	return { origin: head.origin, head: minted.outpoint };
}
