/**
 * Decode a commit head from its own locking script, so the wallet's basket
 * outputs can be listed without asking the overlay.
 *
 * A head is a **bare** PushDrop coin — nothing is inscribed on it — with six
 * fields: `["gib", repository origin, branch, root, identity, branched-from]`.
 * The git commit objects are no longer on the token. They live in the `.git`
 * object store inside the root the head names, so a head is read in two
 * steps: the token from its own output (`decodeHeadScript`), the commit from
 * the root it points at (`loadTipCommit`).
 *
 * Mirrors `pkg/template/gib` in 1sat-stack: outpoint fields may be 36 raw
 * bytes or a `txid_vout` string, the identity may be 33 raw bytes or 66 hex
 * characters, and an absent branched-from field reads back as `OP_FALSE`,
 * which the SDK's PushDrop decoder reports as a single zero byte.
 */
import { pushDropDecode } from "@1sat/actions";
import { Hash, LockingScript, Utils } from "@bsv/sdk";
import { isOutpoint, outpointTxid, outpointVout } from "./format";
import type { Commit, HeadRecord, Signature } from "./gib-api";
import { loadGitStoreTip } from "./ordfs";

/** Fields a head carries, before the optional trailing signature. */
export const HEAD_FIELD_COUNT = 6;
const OUTPOINT_BYTES = 36;
const PUBKEY_BYTES = 33;

/** git object id: sha1("<type> <len>\0" + body). */
export function gitHash(type: "commit" | "tree" | "blob", body: Uint8Array) {
	const header = Utils.toArray(`${type} ${body.length}\0`, "utf8");
	return Utils.toHex(Hash.sha1([...header, ...body]));
}

function parseSignature(line: string | undefined): Signature | undefined {
	if (!line) return undefined;
	const m = /^(.*?) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(line);
	if (!m) return undefined;
	return { name: m[1], email: m[2], time: Number(m[3]), tz: m[4] };
}

/** Parse a raw git commit object into the overlay's Commit shape. */
export function parseCommit(body: Uint8Array): Commit {
	const text = new TextDecoder().decode(body);
	const sep = text.indexOf("\n\n");
	const header = sep < 0 ? text : text.slice(0, sep);
	const message = sep < 0 ? "" : text.slice(sep + 2);
	let tree = "";
	const parents: string[] = [];
	let author: Signature | undefined;
	let committer: Signature | undefined;
	for (const line of header.split("\n")) {
		// Continuation lines belong to multi-line headers (gpgsig).
		if (line.startsWith(" ")) continue;
		const sp = line.indexOf(" ");
		const key = sp < 0 ? line : line.slice(0, sp);
		const value = sp < 0 ? "" : line.slice(sp + 1);
		if (key === "tree") tree = value;
		else if (key === "parent") parents.push(value);
		else if (key === "author") author = parseSignature(value);
		else if (key === "committer") committer = parseSignature(value);
	}
	return {
		sha: gitHash("commit", body),
		tree,
		parents,
		author,
		committer,
		message,
	};
}

/**
 * True for an optional field nothing was written to. PushDrop encodes an
 * empty push minimally as OP_FALSE, which is the same opcode a single zero
 * byte encodes to, so the two cannot be told apart once on chain.
 */
export const isAbsentField = (field: number[]) =>
	field.length === 0 || (field.length === 1 && field[0] === 0);

/** An outpoint field: 36 raw bytes (txid || vout LE), or `txid_vout` text. */
export function readOutpointField(field: number[]): string | undefined {
	if (field.length === OUTPOINT_BYTES) {
		const txid = Utils.toHex(field.slice(0, 32).reverse());
		const vout =
			field[32] | (field[33] << 8) | (field[34] << 16) | (field[35] << 24);
		return `${txid}_${vout >>> 0}`;
	}
	const text = Utils.toUTF8(field);
	return isOutpoint(text) ? toOrdinal(text) : undefined;
}

const toOrdinal = (s: string) => s.replace(".", "_");

/** An identity field: 33 raw compressed bytes, or 66 hex characters. */
export function readIdentityField(field: number[]): string | undefined {
	if (field.length === PUBKEY_BYTES) return Utils.toHex(field);
	const text = Utils.toUTF8(field).toLowerCase();
	return /^0[23][0-9a-f]{64}$/.test(text) ? text : undefined;
}

/**
 * A head record built from the wallet's copy of the output. `commit` is
 * absent — it is not on the token any more; `loadTipCommit` reads it from
 * the root. `score` and `height` are unknown locally (0), and `spend` is
 * absent because the wallet only returns spendable coins.
 */
export function decodeHeadScript(
	scriptHex: string,
	outpoint: string,
): HeadRecord | undefined {
	try {
		const { fields } = pushDropDecode(LockingScript.fromHex(scriptHex));
		// Six fields, or six and the signature the wallet seals with.
		if (
			fields.length < HEAD_FIELD_COUNT ||
			fields.length > HEAD_FIELD_COUNT + 1
		) {
			return undefined;
		}
		if (Utils.toUTF8(fields[0]) !== "gib") return undefined;
		const origin = readOutpointField(fields[1]);
		const branch = Utils.toUTF8(fields[2]);
		const root = readOutpointField(fields[3]);
		const identity = readIdentityField(fields[4]);
		if (!origin || !branch || !root || !identity) return undefined;
		const rawFrom = fields[5];
		const branchedFrom = isAbsentField(rawFrom)
			? undefined
			: readOutpointField(rawFrom);
		// A branched-from field that is present but unreadable is not a head
		// this decoder understands; refusing beats showing a wrong parent.
		if (!isAbsentField(rawFrom) && !branchedFrom) return undefined;
		return {
			outpoint,
			txid: outpointTxid(outpoint),
			vout: outpointVout(outpoint),
			origin,
			branch,
			root,
			identity,
			branchedFrom,
			score: 0,
			height: 0,
		};
	} catch {
		return undefined;
	}
}

/**
 * The commit a head publishes, read from the tree instead of the token: the
 * `.` entry of the root's `.git` object store, which points at the tip
 * commit object. Undefined when the root carries no readable store — a
 * head whose `.git` cites objects it did not republish still names its sha,
 * but only the overlay knows that, so the answer here is "unknown".
 */
export async function loadTipCommit(root: string): Promise<Commit | undefined> {
	const bytes = await loadGitStoreTip(root);
	if (!bytes) return undefined;
	try {
		const commit = parseCommit(bytes);
		return commit.tree ? commit : undefined;
	} catch {
		return undefined;
	}
}
