import { describe, expect, test } from "bun:test";
import {
	BEEF_V2,
	Beef,
	P2PKH,
	PrivateKey,
	Transaction,
	UnlockingScript,
} from "@bsv/sdk";
import { buildSubmission } from "./gib-submit";

/**
 * A stand-in for the transactions a push submits. The new format is not on
 * api.1sat.app yet, so what is pinned here is the one thing the site decides
 * on its own: that the head transaction is serialized last, which is the
 * transaction the engine judges.
 */
function fakeTx(seed: number, sourceTxid: string): Transaction {
	const key = PrivateKey.fromRandom();
	const tx = new Transaction();
	tx.addInput({
		sourceTXID: sourceTxid,
		sourceOutputIndex: seed,
		unlockingScript: new UnlockingScript(),
		sequence: 0xffffffff,
	});
	tx.addOutput({
		lockingScript: new P2PKH().lock(key.toPublicKey().toHash()),
		satoshis: 1 + seed,
	});
	return tx;
}

const someTxid = (byte: string) => byte.repeat(64);

function beefOf(...txs: Transaction[]): number[] {
	const beef = new Beef(BEEF_V2);
	for (const tx of txs) beef.mergeTransaction(tx);
	return beef.toBinary();
}

describe("buildSubmission", () => {
	test("puts the head transaction last and carries the push with it", () => {
		const root = fakeTx(1, someTxid("a"));
		const store = fakeTx(2, someTxid("b"));
		const head = fakeTx(3, someTxid("c"));

		const body = buildSubmission(beefOf(head), head.id("hex"), [
			beefOf(root),
			beefOf(store),
		]);
		const parsed = Beef.fromBinary(body);

		expect(parsed.version).toBe(BEEF_V2);
		expect(parsed.txs.length).toBe(3);
		// The content transactions are not ancestors of the head, so only an
		// explicit move decides the order the engine reads.
		expect(parsed.txs[parsed.txs.length - 1]?.txid).toBe(head.id("hex"));
		const txids = parsed.txs.map((t) => t.txid);
		expect(txids).toContain(root.id("hex"));
		expect(txids).toContain(store.id("hex"));
	});

	test("is a no-op on order when the head is already last", () => {
		const head = fakeTx(4, someTxid("d"));
		const parsed = Beef.fromBinary(
			buildSubmission(beefOf(head), head.id("hex"), []),
		);
		expect(parsed.txs.length).toBe(1);
		expect(parsed.txs[0]?.txid).toBe(head.id("hex"));
	});

	test("refuses a BEEF that does not carry the head it names", () => {
		const head = fakeTx(5, someTxid("e"));
		const other = fakeTx(6, someTxid("f"));
		expect(() => buildSubmission(beefOf(other), head.id("hex"), [])).toThrow(
			/not in its own BEEF/,
		);
	});
});
