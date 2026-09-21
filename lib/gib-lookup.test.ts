import { afterEach, describe, expect, test } from "bun:test";
import {
	type BranchesResult,
	defaultBranchName,
	lookupBranches,
} from "./gib-lookup";

const ORIGIN = `${"ab".repeat(32)}_0`;
const original = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = original;
});

/**
 * A local stand-in for `ls_gib`. The new format is not on api.1sat.app yet,
 * so the shapes here are the ones `pkg/gib/lookup_sync.go` serializes:
 * a BRC-24 answer whose `result` is the payload JSON-encoded as a string.
 */
function fakeLookup(
	result: unknown,
	seen: { body?: Record<string, unknown> } = {},
) {
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		seen.body = JSON.parse(String(init?.body));
		return new Response(
			JSON.stringify({ type: "freeform", result: JSON.stringify(result) }),
			{ headers: { "content-type": "application/json" } },
		);
	}) as unknown as typeof fetch;
	return seen;
}

const answer: BranchesResult = {
	query: "branches",
	origin: ORIGIN,
	defaultBranch: "trunk",
	owner: `02${"11".repeat(32)}`,
	branches: [
		{
			branch: "feature/x",
			identity: `02${"11".repeat(32)}`,
			tip: `${"cd".repeat(32)}_0`,
			sha: "a".repeat(40),
			root: `${"ef".repeat(32)}_3`,
			score: 900002.000000001,
		},
		{
			branch: "trunk",
			identity: `03${"22".repeat(32)}`,
			tip: `${"dc".repeat(32)}_0`,
			root: `${"fe".repeat(32)}_7`,
			spent: true,
			score: 900001.000000004,
		},
	],
	more: false,
};

describe("lookupBranches", () => {
	test("asks ls_gib for a repository's branches and unwraps the result", async () => {
		const seen = fakeLookup(answer);
		const result = await lookupBranches(ORIGIN, { limit: 100 });
		expect(seen.body?.service).toBe("ls_gib");
		expect(seen.body?.query).toEqual({
			type: "branches",
			origin: ORIGIN,
			limit: 100,
		});
		expect(result?.defaultBranch).toBe("trunk");
		expect(result?.branches.map((b) => b.branch)).toEqual([
			"feature/x",
			"trunk",
		]);
		// A branch nobody extends any more is still a branch.
		expect(result?.branches[1]?.spent).toBe(true);
	});

	test("caps the page at the overlay's own limit and echoes a cursor", async () => {
		const seen = fakeLookup({ ...answer, branches: [] });
		await lookupBranches(ORIGIN, {
			limit: 5000,
			since: { branch: "trunk", identity: "02ab" },
		});
		const query = seen.body?.query as Record<string, unknown>;
		expect(query.limit).toBe(100);
		expect(query.since).toEqual({ branch: "trunk", identity: "02ab" });
	});

	test("a repository the overlay holds nothing for is an empty list", async () => {
		fakeLookup({
			query: "branches",
			origin: ORIGIN,
			branches: [],
			more: false,
		});
		const result = await lookupBranches(ORIGIN);
		expect(result?.branches).toEqual([]);
		expect(result?.defaultBranch).toBeUndefined();
	});

	test("an overlay that cannot answer is null, not an empty list", async () => {
		globalThis.fetch = (async () =>
			new Response("boom", { status: 500 })) as unknown as typeof fetch;
		expect(await lookupBranches(ORIGIN)).toBeNull();
	});

	test("accepts an already-decoded result object", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ type: "freeform", result: answer }), {
				headers: { "content-type": "application/json" },
			})) as unknown as typeof fetch;
		expect((await lookupBranches(ORIGIN))?.defaultBranch).toBe("trunk");
	});
});

describe("defaultBranchName", () => {
	test("prefers the chain's answer over the .gib label", () => {
		expect(defaultBranchName(answer, { defaultBranch: "main" })).toBe("trunk");
	});

	test("falls back to .gib, then to nothing invented", () => {
		expect(defaultBranchName(null, { defaultBranch: "main" })).toBe("main");
		expect(defaultBranchName(null, {})).toBeUndefined();
	});
});
