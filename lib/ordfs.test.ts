import { describe, expect, test } from "bun:test";
import { DIR_CONTENT_TYPE, dirEncode, dirName } from "@1sat/actions";
import {
	type DirEntry,
	decodeBinaryManifest,
	decodeJsonManifest,
	isGitStorePath,
	loadGitStoreTip,
	withoutGitStore,
} from "./ordfs";

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

describe("gib's .git object store", () => {
	const rootTxid =
		"9c1a4f6b8d2e0a7c3b5d9e1f2a4c6b8d0e2f4a6c8b0d2e4f6a8c0b2d4e6f8a0c";
	const storeTxid =
		"1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f";

	const dirResponse = (bytes: Uint8Array) =>
		new Response(bytes.slice().buffer as ArrayBuffer, {
			headers: { "content-type": DIR_CONTENT_TYPE },
		});

	test("withoutGitStore drops gib's store and nothing else", () => {
		const entries: DirEntry[] = [
			{ name: ".git", outpoint: `${rootTxid}_1`, kind: "dir" },
			{ name: ".github", outpoint: `${rootTxid}_2`, kind: "dir" },
			{ name: ".gitignore", outpoint: `${rootTxid}_3`, kind: "file" },
			{ name: "src", outpoint: `${rootTxid}_4`, kind: "dir" },
		];
		expect(withoutGitStore(entries).map((e) => e.name)).toEqual([
			".github",
			".gitignore",
			"src",
		]);
	});

	test("isGitStorePath only catches the store itself", () => {
		expect(isGitStorePath([".git"])).toBe(true);
		expect(isGitStorePath([".git", "abc"])).toBe(true);
		expect(isGitStorePath([".github", "workflows"])).toBe(false);
		expect(isGitStorePath([])).toBe(false);
	});

	test("loadGitStoreTip follows the store's `.` entry to the tip commit", async () => {
		const commit = new TextEncoder().encode(
			"tree 69d6165cf2469d25bb718c957cb2a1353fb25c04\n" +
				"author David Case <d@example.com> 1789800000 -0400\n\nTip\n",
		);
		const root = dirEncode({
			version: 1,
			entries: [
				{
					name: dirName(".git"),
					isDir: true,
					ref: { kind: "outpoint", txid: storeTxid, vout: 0 },
				},
				{
					name: dirName("README.md"),
					isDir: false,
					ref: { kind: "same-tx", vout: 1 },
				},
			],
		});
		const store = dirEncode({
			version: 1,
			entries: [
				{
					name: dirName("."),
					isDir: false,
					ref: { kind: "same-tx", vout: 2 },
				},
			],
		});
		const original = globalThis.fetch;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes(`${rootTxid}_0`)) return dirResponse(root);
			if (url.includes(`${storeTxid}_0`)) return dirResponse(store);
			if (url.includes(`${storeTxid}_2`))
				return new Response(commit.slice().buffer as ArrayBuffer);
			return new Response(null, { status: 404 });
		}) as unknown as typeof fetch;
		try {
			const bytes = await loadGitStoreTip(`${rootTxid}_0`);
			expect(bytes && new TextDecoder().decode(bytes)).toBe(
				new TextDecoder().decode(commit),
			);
		} finally {
			globalThis.fetch = original;
		}
	});

	test("loadGitStoreTip is null for a root with no store", async () => {
		const root = dirEncode({
			version: 1,
			entries: [
				{
					name: dirName("README.md"),
					isDir: false,
					ref: { kind: "same-tx", vout: 1 },
				},
			],
		});
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			dirResponse(root)) as unknown as typeof fetch;
		try {
			expect(await loadGitStoreTip(`${rootTxid}_0`)).toBeNull();
		} finally {
			globalThis.fetch = original;
		}
	});
});
