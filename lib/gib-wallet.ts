/**
 * Wallet-side gib operations: fork (new genesis + head) and delete (burn).
 *
 * Conventions mirror the gib CLI exactly so heads minted here are
 * indistinguishable from CLI pushes: PushDrop protocol `[1, "gib branch"]`,
 * keyID = the root outpoint, counterparty `anyone`, fields as UTF-8 strings,
 * the git commit object inscribed after the lock, basket `gib`, tags
 * `origin:` / `branch:`, labels `push:<sha>`.
 *
 * Client-side only: every call goes through the connected BRC-100 wallet.
 */

import {
	completeSignedAction,
	DIR_CONTENT_TYPE,
	DIR_VERSION,
	dirEncode,
	dirEntryNameCompare,
	dirName,
	type DirEntry as SdkDirEntry,
	stampManagedOutputIds,
} from "@1sat/actions";
import { B, Encoding, Inscription } from "@1sat/templates";
import {
	type CreateActionArgs,
	OP,
	PushDrop,
	Script,
	Utils,
	type WalletInterface,
	type WalletProtocol,
} from "@bsv/sdk";
import { outpointTxid, outpointVout, toOrdinalOutpoint } from "./format";
import type { HeadRecord } from "./gib-api";
import { contentUrl, loadDirectory } from "./ordfs";
import { GIB_BASKET } from "./stack";

export const GIB_PROTOCOL: WalletProtocol = [1, "gib branch"];
export const GIT_COMMIT_TYPE = "application/x-git-commit";
const UNLOCK_LENGTH = 73;

export const originTag = (origin: string) => `origin:${origin}`;
export const branchTag = (branch: string) => `branch:${branch}`;
export const pushLabel = (sha: string) => `push:${sha}`;

export const headCustomInstructions = (root: string) =>
	JSON.stringify({
		protocolID: GIB_PROTOCOL,
		keyID: root,
		counterparty: "anyone",
	});

/**
 * Zero-sat data output. Must start with OP_FALSE OP_RETURN (provably
 * unspendable) or miners treat it as dust and never mine it; the B template
 * emits only the bare OP_RETURN fragment.
 */
function dataOutputScript(bytes: Uint8Array, contentType: string): Script {
	return new Script([
		{ op: OP.OP_FALSE },
		...B.lock(bytes, contentType, Encoding.Binary).chunks,
	]);
}

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
	labels: string[],
): Promise<{ txid: string; outpoint: string }> {
	const lock = await new PushDrop(wallet).lock(
		headFields(fields),
		GIB_PROTOCOL,
		fields.root,
		"anyone",
		true,
		true,
	);
	const locking = Inscription.create(commitBytes, GIT_COMMIT_TYPE, {
		scriptPrefix: lock,
	}).lock();
	const args: CreateActionArgs = {
		description: `gib head ${fields.branch}`.slice(0, 50),
		outputs: [
			{
				lockingScript: locking.toHex(),
				satoshis: 1,
				outputDescription: "gib commit head",
				basket: GIB_BASKET,
				tags: [originTag(fields.origin), branchTag(fields.branch)],
				customInstructions: headCustomInstructions(fields.root),
			},
		],
		labels,
		options: { randomizeOutputs: false, signAndProcess: true },
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
		labels: [pushLabel("delete")],
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
			const script = await new PushDrop(wallet)
				.unlock(
					GIB_PROTOCOL,
					keyID,
					"anyone",
					"all",
					false,
					source.satoshis ?? 1,
					source.lockingScript,
				)
				.sign(tx, idx);
			return { [idx]: { unlockingScript: script.toHex() } };
		},
		{ acceptDelayedBroadcast: false },
	);
	if (done.error || !done.txid) {
		throw new Error(done.error ?? "wallet returned no txid for the burn");
	}
	return done.txid;
}

/**
 * Forks a repository at a head: publishes a new root manifest whose entries
 * cite the forked tree's outpoints (no content copied), then mints a head
 * for it. The new manifest's outpoint is the fork's origin. The forked
 * head's commit object is reused verbatim since the tree is identical.
 */
export async function forkRepo(
	wallet: WalletInterface,
	head: HeadRecord,
	identity: string,
): Promise<{ origin: string; head: string }> {
	const entries = await loadDirectory(head.root);
	const manifest: SdkDirEntry[] = entries.map((e) => ({
		name: dirName(e.name),
		isDir: e.kind === "dir",
		exec: e.exec,
		symlink: e.symlink,
		ref: {
			kind: "outpoint",
			txid: outpointTxid(e.outpoint),
			vout: outpointVout(e.outpoint),
		},
	}));
	manifest.sort(dirEntryNameCompare);
	const rootBytes = dirEncode({ version: DIR_VERSION, entries: manifest });

	const commitRes = await fetch(contentUrl(head.outpoint));
	if (!commitRes.ok) {
		throw new Error(`could not fetch the commit object (${commitRes.status})`);
	}
	const commitBytes = new Uint8Array(await commitRes.arrayBuffer());
	const sha = head.commit?.sha ?? "fork";
	const labels = [pushLabel(sha)];

	const content = await wallet.createAction({
		description: `gib fork of ${head.branch}`.slice(0, 50),
		outputs: [
			{
				lockingScript: dataOutputScript(rootBytes, DIR_CONTENT_TYPE).toHex(),
				satoshis: 0,
				outputDescription: "gib root manifest",
			},
		],
		labels,
		options: { randomizeOutputs: false, signAndProcess: true },
	});
	if (!content.txid)
		throw new Error("wallet returned no txid for the manifest");
	const root = `${content.txid}_0`;

	const minted = await mintHead(
		wallet,
		{ origin: root, branch: head.branch, root, identity },
		commitBytes,
		labels,
	);
	return { origin: root, head: minted.outpoint };
}
