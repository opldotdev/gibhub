import { describe, expect, it } from "bun:test";
import { pushDropLock } from "@1sat/actions";
import { Inscription } from "@1sat/templates";
import { PrivateKey, ProtoWallet, Utils, type WalletInterface } from "@bsv/sdk";
import { decodeHeadScript, gitHash, parseCommit } from "./gib-head";
import { GIB_PROTOCOL, GIT_COMMIT_TYPE, headFields } from "./gib-wallet";

const commitText =
	"tree 69d6165cf2469d25bb718c957cb2a1353fb25c04\n" +
	"parent a4606daa9d623ebbf2b79504805b4b83eba23ca4\n" +
	"author David Case <d@example.com> 1789800000 -0400\n" +
	"committer David Case <d@example.com> 1789800001 -0400\n" +
	"\n" +
	"Add .gib repository metadata\n\nBody line.\n";
const commitBytes = new TextEncoder().encode(commitText);

const ORIGIN = `${"ab".repeat(32)}_70`;
const ROOT = `${"12".repeat(32)}_3`;
const SOURCE_HEAD = `${"34".repeat(32)}_0`;
const OUTPOINT = `${"cd".repeat(32)}_0`;

async function testWallet() {
	const wallet = new ProtoWallet(
		PrivateKey.fromRandom(),
	) as unknown as WalletInterface;
	const identity = (await wallet.getPublicKey({ identityKey: true })).publicKey;
	return { wallet, identity };
}

/** A head locked exactly the way `mintHead` locks one. */
const lockHead = (wallet: WalletInterface, fields: number[][], keyID = ROOT) =>
	pushDropLock(
		wallet,
		{
			fields,
			protocolID: GIB_PROTOCOL,
			keyID,
			counterparty: "anyone",
			forSelf: true,
		},
		{ includeSignature: true },
	);

describe("parseCommit", () => {
	it("reads header fields, message, and the git sha", () => {
		const c = parseCommit(commitBytes);
		expect(c.tree).toBe("69d6165cf2469d25bb718c957cb2a1353fb25c04");
		expect(c.parents).toEqual(["a4606daa9d623ebbf2b79504805b4b83eba23ca4"]);
		expect(c.author?.name).toBe("David Case");
		expect(c.author?.time).toBe(1789800000);
		expect(c.committer?.tz).toBe("-0400");
		expect(c.message.startsWith("Add .gib repository metadata")).toBe(true);
		expect(c.sha).toBe(gitHash("commit", commitBytes));
		expect(c.sha).toMatch(/^[0-9a-f]{40}$/);
	});

	it("skips the continuation lines of a multi-line header", () => {
		const signed = new TextEncoder().encode(
			"tree 69d6165cf2469d25bb718c957cb2a1353fb25c04\n" +
				"author David Case <d@example.com> 1789800000 -0400\n" +
				"gpgsig -----BEGIN PGP SIGNATURE-----\n" +
				" tree not-a-tree\n" +
				" -----END PGP SIGNATURE-----\n" +
				"\nSigned\n",
		);
		expect(parseCommit(signed).tree).toBe(
			"69d6165cf2469d25bb718c957cb2a1353fb25c04",
		);
	});
});

describe("decodeHeadScript", () => {
	it("decodes a bare six-field head the way the site mints one", async () => {
		const { wallet, identity } = await testWallet();
		const script = await lockHead(
			wallet,
			headFields({
				origin: ORIGIN,
				branch: "feat/gib",
				root: ROOT,
				identity,
			}),
		);
		const head = decodeHeadScript(script.toHex(), OUTPOINT);
		expect(head).toBeDefined();
		expect(head?.origin).toBe(ORIGIN);
		expect(head?.branch).toBe("feat/gib");
		expect(head?.root).toBe(ROOT);
		expect(head?.identity).toBe(identity);
		expect(head?.vout).toBe(0);
		// The commit is not on the token any more; it is read from the root.
		expect(head?.commit).toBeUndefined();
		// An ordinary push has no second parent. PushDrop writes the empty
		// field as OP_FALSE, which reads back as a single zero byte.
		expect(head?.branchedFrom).toBeUndefined();
	});

	it("reads the branched-from outpoint when the head names one", async () => {
		const { wallet, identity } = await testWallet();
		const script = await lockHead(
			wallet,
			headFields({
				origin: ORIGIN,
				branch: "feat/mine",
				root: ROOT,
				identity,
				branchedFrom: SOURCE_HEAD,
			}),
		);
		expect(decodeHeadScript(script.toHex(), OUTPOINT)?.branchedFrom).toBe(
			SOURCE_HEAD,
		);
	});

	it("accepts raw-byte outpoints and a raw identity key", async () => {
		const { wallet, identity } = await testWallet();
		// The stack's reference encoder writes 36-byte outpoints and a 33-byte
		// compressed key; the decoder has to take either form.
		const rawOutpoint = (outpoint: string) => {
			const txid = Utils.toArray(outpoint.slice(0, 64), "hex").reverse();
			const vout = Number(outpoint.slice(65));
			return [
				...txid,
				vout & 0xff,
				(vout >> 8) & 0xff,
				(vout >> 16) & 0xff,
				(vout >> 24) & 0xff,
			];
		};
		const script = await lockHead(wallet, [
			Utils.toArray("gib", "utf8"),
			rawOutpoint(ORIGIN),
			Utils.toArray("main", "utf8"),
			rawOutpoint(ROOT),
			Utils.toArray(identity, "hex"),
			rawOutpoint(SOURCE_HEAD),
		]);
		const head = decodeHeadScript(script.toHex(), OUTPOINT);
		expect(head?.origin).toBe(ORIGIN);
		expect(head?.root).toBe(ROOT);
		expect(head?.identity).toBe(identity);
		expect(head?.branchedFrom).toBe(SOURCE_HEAD);
	});

	it("refuses the old five-field head with an inscribed commit", async () => {
		// A clean break: the format that carried the commit on the output does
		// not decode, and must not be read as a head with a missing field.
		const { wallet, identity } = await testWallet();
		const lock = await lockHead(
			wallet,
			["gib", ORIGIN, "feat/gib", ROOT, identity].map((s) =>
				Utils.toArray(s, "utf8"),
			),
		);
		const legacy = Inscription.create(commitBytes, GIT_COMMIT_TYPE, {
			scriptPrefix: lock,
		}).lock();
		expect(decodeHeadScript(legacy.toHex(), OUTPOINT)).toBeUndefined();
	});

	it("returns undefined for a non-gib script", () => {
		expect(
			decodeHeadScript(`76a914${"00".repeat(20)}88ac`, `${"ef".repeat(32)}_0`),
		).toBeUndefined();
	});
});
