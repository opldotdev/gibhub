import { describe, expect, test } from "bun:test";
import { dirEncode, dirName } from "@1sat/actions";
import { decodeBinaryManifest, decodeJsonManifest } from "./ordfs";

const manifestTxid =
	"c657be5a7dacd7bb7343d92b7195d1366dbecd3ec31874576189efd28eee007c";
const otherTxid =
	"e6f27ce723b2923e93227ecef64b6cecf9464bd0c6ba71a66502aa20c5de82a1";

describe("binary ordfs/dir manifests", () => {
	test("decodes what the SDK encodes, resolving same-tx and full refs", () => {
		const bytes = dirEncode({
			version: 1,
			entries: [
				{
					name: dirName("LICENSE"),
					isDir: false,
					ref: { kind: "outpoint", txid: otherTxid, vout: 3 },
				},
				{
					name: dirName("README.md"),
					isDir: false,
					ref: { kind: "same-tx", vout: 1 },
				},
				{
					name: dirName("build.sh"),
					isDir: false,
					exec: true,
					ref: { kind: "same-tx", vout: 6 },
				},
				{
					name: dirName("src"),
					isDir: true,
					ref: { kind: "same-tx", vout: 11 },
				},
			],
		});
		const entries = decodeBinaryManifest(bytes, `${manifestTxid}_0`);
		expect(entries.map((e) => e.name)).toEqual([
			"LICENSE",
			"README.md",
			"build.sh",
			"src",
		]);
		expect(entries[0]?.outpoint).toBe(`${otherTxid}_3`);
		expect(entries[1]?.outpoint).toBe(`${manifestTxid}_1`);
		expect(entries[2]?.exec).toBe(true);
		expect(entries[3]?.isDir).toBe(true);
		expect(entries[3]?.outpoint).toBe(`${manifestTxid}_11`);
	});

	test("rejects garbage", () => {
		expect(() =>
			decodeBinaryManifest(new Uint8Array([9, 0, 0]), `${manifestTxid}_0`),
		).toThrow();
	});
});

describe("legacy ord-fs/json manifests", () => {
	test("resolves _N siblings and full outpoints", () => {
		const entries = decodeJsonManifest(
			{ "index.html": "_1", js: `${otherTxid}_2` },
			`${manifestTxid}_4`,
		);
		expect(entries).toEqual([
			{ name: "index.html", outpoint: `${manifestTxid}_1` },
			{ name: "js", outpoint: `${otherTxid}_2` },
		]);
	});
});
