import { describe, expect, it } from "bun:test";
import { pushDropLock } from "@1sat/actions";
import { Inscription } from "@1sat/templates";
import { PrivateKey, ProtoWallet, Utils, type WalletInterface } from "@bsv/sdk";
import { decodeHeadScript, gitHash, parseCommit } from "./gib-head";
import { GIB_PROTOCOL, GIT_COMMIT_TYPE } from "./gib-wallet";

const commitText =
	"tree 69d6165cf2469d25bb718c957cb2a1353fb25c04\n" +
	"parent a4606daa9d623ebbf2b79504805b4b83eba23ca4\n" +
	"author David Case <d@example.com> 1789800000 -0400\n" +
	"committer David Case <d@example.com> 1789800001 -0400\n" +
	"\n" +
	"Add .gib repository metadata\n\nBody line.\n";
const commitBytes = new TextEncoder().encode(commitText);

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
});

describe("decodeHeadScript", () => {
	it("decodes a head minted the way the site and CLI mint them", async () => {
		const wallet = new ProtoWallet(
			PrivateKey.fromRandom(),
		) as unknown as WalletInterface;
		const identity = (await wallet.getPublicKey({ identityKey: true }))
			.publicKey;
		const origin = `${"ab".repeat(32)}_70`;
		const root = origin;
		const lock = await pushDropLock(
			wallet,
			{
				fields: ["gib", origin, "feat/gib", root, identity].map((s) =>
					Utils.toArray(s, "utf8"),
				),
				protocolID: GIB_PROTOCOL,
				keyID: root,
				counterparty: "anyone",
				forSelf: true,
			},
			{ includeSignature: true },
		);
		const script = Inscription.create(commitBytes, GIT_COMMIT_TYPE, {
			scriptPrefix: lock,
		}).lock();
		const head = decodeHeadScript(script.toHex(), `${"cd".repeat(32)}_0`);
		expect(head).toBeDefined();
		expect(head?.origin).toBe(origin);
		expect(head?.branch).toBe("feat/gib");
		expect(head?.root).toBe(root);
		expect(head?.identity).toBe(identity);
		expect(head?.commit?.sha).toBe(gitHash("commit", commitBytes));
		expect(head?.vout).toBe(0);
	});

	it("returns undefined for a non-gib script", () => {
		expect(
			decodeHeadScript(`76a914${"00".repeat(20)}88ac`, `${"ef".repeat(32)}_0`),
		).toBeUndefined();
	});
});
