/**
 * Decode a commit head from its own locking script, so the wallet's
 * basket outputs can be listed without asking the overlay. Mirrors the
 * CLI (gib-cli src/token.ts): PushDrop fields ["gib", origin, branch,
 * root, identity] before an ord envelope carrying the git commit object.
 */
import { pushDropDecode } from "@1sat/actions";
import { Inscription } from "@1sat/templates";
import { Hash, LockingScript, OP, Script, Utils } from "@bsv/sdk";
import { outpointTxid, outpointVout } from "./format";
import type { Commit, HeadRecord, Signature } from "./gib-api";

/** The script up to the ord envelope (OP_0 OP_IF "ord"), i.e. the PushDrop lock. */
function prefixBeforeOrd(script: Script): Script {
	const chunks = script.chunks;
	for (let i = 0; i < chunks.length - 2; i++) {
		const marker = chunks[i + 2];
		if (
			chunks[i]?.op === OP.OP_0 &&
			chunks[i + 1]?.op === OP.OP_IF &&
			marker?.data != null &&
			marker.data.length === 3 &&
			Utils.toUTF8(marker.data) === "ord"
		) {
			const p = new Script();
			for (let j = 0; j < i; j++) p.chunks.push(chunks[j]);
			return p;
		}
	}
	return script;
}

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
 * A head record built from the wallet's copy of the output. `score` and
 * `height` are unknown locally (0); `spend` is absent because the wallet
 * only returns spendable coins.
 */
export function decodeHeadScript(
	scriptHex: string,
	outpoint: string,
): HeadRecord | undefined {
	try {
		const script = LockingScript.fromHex(scriptHex);
		const { fields } = pushDropDecode(
			new LockingScript(prefixBeforeOrd(script).chunks),
		);
		const [tag, origin, branch, root, identity] = fields.map((f) =>
			Utils.toUTF8(f),
		);
		if (tag !== "gib" || !origin || !branch || !root || !identity)
			return undefined;
		const insc = Inscription.decode(script);
		const commit = insc ? parseCommit(insc.file.content) : undefined;
		return {
			outpoint,
			txid: outpointTxid(outpoint),
			vout: outpointVout(outpoint),
			origin,
			branch,
			root,
			identity,
			commit,
			score: 0,
			height: 0,
		};
	} catch {
		return undefined;
	}
}
