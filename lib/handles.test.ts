import { describe, expect, it } from "bun:test";
import {
	authorHandleKeys,
	clampTtl,
	createHandleResolver,
	MANIFEST_TTL,
	MAX_TTL,
	MIN_TTL,
	matchAuthorHandles,
	NEGATIVE_TTL,
	parseHandle,
	parseResolveResponse,
	resolveUrlFromManifest,
	verifyHandle,
} from "./handles";

const ALICE = `02${"a1".repeat(32)}`;
const BOB = `03${"b2".repeat(32)}`;

describe("parseHandle", () => {
	it("accepts the fully-qualified form and lowercases it", () => {
		const p = parseHandle("@Alice@1Sat.Name");
		expect(p?.handle).toBe("alice");
		expect(p?.domain).toBe("1sat.name");
		expect(p?.key).toBe("@alice@1sat.name");
		expect(p?.display).toBe("@alice@1sat.name");
		expect(p?.tag).toBeUndefined();
	});

	it("accepts the paymail form and normalizes it to @handle@domain", () => {
		expect(parseHandle("alice@1sat.name")?.key).toBe("@alice@1sat.name");
	});

	it("strips a +tag for resolution but keeps it for display", () => {
		const p = parseHandle("alice+work@1sat.name");
		expect(p?.key).toBe("@alice@1sat.name");
		expect(p?.display).toBe("@alice+work@1sat.name");
		expect(p?.tag).toBe("work");
	});

	it("allows internal punctuation only", () => {
		expect(parseHandle("a.b_c-d@example.com")?.handle).toBe("a.b_c-d");
		expect(parseHandle(".alice@example.com")).toBeUndefined();
		expect(parseHandle("alice.@example.com")).toBeUndefined();
		expect(parseHandle("al ice@example.com")).toBeUndefined();
	});

	it("rejects a dotless ecosystem (alias) rather than probing it", () => {
		expect(parseHandle("@alice@handcash")).toBeUndefined();
		expect(parseHandle("alice@localhost")).toBeUndefined();
	});

	it("rejects names, empty input, and malformed tokens", () => {
		expect(parseHandle(undefined)).toBeUndefined();
		expect(parseHandle("")).toBeUndefined();
		expect(parseHandle("David Case")).toBeUndefined();
		expect(parseHandle("@alice")).toBeUndefined();
		expect(parseHandle("@example.com")).toBeUndefined();
		expect(parseHandle("a@b@c.com")).toBeUndefined();
		expect(parseHandle("alice@-bad.com")).toBeUndefined();
		expect(parseHandle("Ålice@example.com")).toBeUndefined();
		expect(parseHandle(`${"a".repeat(65)}@example.com`)).toBeUndefined();
	});
});

describe("resolveUrlFromManifest", () => {
	it("uses metanet.handles.resolve when present", () => {
		expect(
			resolveUrlFromManifest(
				{
					metanet: {
						handles: { version: "1.0", resolve: "https://r.example.com/x" },
					},
				},
				"example.com",
			),
		).toBe("https://r.example.com/x");
	});

	it("defaults to the well-known path when resolve is absent", () => {
		expect(
			resolveUrlFromManifest(
				{ metanet: { handles: { version: "1.2" } } },
				"example.com",
			),
		).toBe("https://example.com/.well-known/metanet-handles/resolve");
	});

	it("treats a domain without metanet.handles as unresolvable", () => {
		expect(
			resolveUrlFromManifest(
				{ metanet: { trust: { publicKey: ALICE } } },
				"example.com",
			),
		).toBeNull();
		expect(resolveUrlFromManifest({}, "example.com")).toBeNull();
		expect(resolveUrlFromManifest(null, "example.com")).toBeNull();
	});

	it("rejects an unknown major version or a non-https resolve URL", () => {
		expect(
			resolveUrlFromManifest(
				{ metanet: { handles: { version: "2.0" } } },
				"example.com",
			),
		).toBeNull();
		expect(
			resolveUrlFromManifest(
				{
					metanet: {
						handles: { version: "1.0", resolve: "http://example.com/r" },
					},
				},
				"example.com",
			),
		).toBeNull();
	});
});

describe("clampTtl", () => {
	it("bounds ttl to [MIN_TTL, MAX_TTL] and defaults when missing", () => {
		expect(clampTtl(0)).toBe(MIN_TTL);
		expect(clampTtl(3600)).toBe(3600);
		expect(clampTtl(10 ** 9)).toBe(MAX_TTL);
		expect(clampTtl(undefined)).toBe(MIN_TTL);
		expect(clampTtl("3600")).toBe(MIN_TTL);
		expect(clampTtl(Number.NaN)).toBe(MIN_TTL);
	});
});

describe("parseResolveResponse", () => {
	const parsed = parseHandle("@alice@1sat.name");
	if (!parsed) throw new Error("fixture");
	const good = {
		metanetHandles: "1.0",
		handle: "alice",
		domain: "1sat.name",
		identityKey: ALICE,
		certificate: { subject: ALICE },
		ttl: 3600,
		revoked: false,
		displayName: "Alice",
		avatarURL: "https://1sat.name/a.png",
	};

	it("keeps the binding and only the display fields that are present", () => {
		const r = parseResolveResponse(good, parsed);
		expect(r?.identityKey).toBe(ALICE);
		expect(r?.ttl).toBe(3600);
		expect(r?.displayName).toBe("Alice");
		expect(r?.avatarURL).toBe("https://1sat.name/a.png");
		const bare = parseResolveResponse(
			{ identityKey: ALICE, certificate: {}, ttl: 60 },
			parsed,
		);
		expect(bare?.displayName).toBeUndefined();
		expect(bare?.avatarURL).toBeUndefined();
	});

	it("rejects a bad key, a missing certificate, a subject mismatch, revocation, or an echo mismatch", () => {
		expect(
			parseResolveResponse({ ...good, identityKey: "abc" }, parsed),
		).toBeNull();
		expect(
			parseResolveResponse({ ...good, certificate: undefined }, parsed),
		).toBeNull();
		expect(
			parseResolveResponse({ ...good, certificate: { subject: BOB } }, parsed),
		).toBeNull();
		expect(parseResolveResponse({ ...good, revoked: true }, parsed)).toBeNull();
		expect(parseResolveResponse({ ...good, handle: "bob" }, parsed)).toBeNull();
		expect(
			parseResolveResponse({ ...good, metanetHandles: "2.0" }, parsed),
		).toBeNull();
	});
});

describe("verifyHandle", () => {
	const resolved = {
		handle: "alice",
		domain: "1sat.name",
		identityKey: ALICE,
	};

	it("is verified only when the resolved key signed the head", () => {
		const v = verifyHandle("alice@1sat.name", resolved, ALICE);
		expect(v?.display).toBe("@alice@1sat.name");
		expect(v?.identityKey).toBe(ALICE);
		expect(verifyHandle("alice@1sat.name", resolved, BOB)).toBeUndefined();
	});

	it("is not verified without a binding or with a binding for another handle", () => {
		expect(verifyHandle("alice@1sat.name", null, ALICE)).toBeUndefined();
		expect(verifyHandle("alice@1sat.name", undefined, ALICE)).toBeUndefined();
		expect(verifyHandle("bob@1sat.name", resolved, ALICE)).toBeUndefined();
		expect(verifyHandle("David Case", resolved, ALICE)).toBeUndefined();
	});
});

describe("matchAuthorHandles", () => {
	const commit = { author: { email: "alice@1sat.name" } };
	const heads = [
		{ outpoint: "h1", identity: ALICE, commit },
		{ outpoint: "h2", identity: BOB, commit },
		{ outpoint: "h3", identity: ALICE, commit: { author: { email: "x" } } },
	];
	const bindings: Record<
		string,
		{ handle: string; domain: string; identityKey: string }
	> = {
		"@alice@1sat.name": {
			handle: "alice",
			domain: "1sat.name",
			identityKey: ALICE,
		},
	};

	it("verifies the same commit on Alice's head but not on Bob's", () => {
		const out = matchAuthorHandles(heads, (key) => bindings[key]);
		expect(Object.keys(out)).toEqual(["h1"]);
		expect(out.h1?.display).toBe("@alice@1sat.name");
	});

	it("collects distinct resolution keys", () => {
		expect(authorHandleKeys(heads)).toEqual(["@alice@1sat.name"]);
	});
});

type Route = (url: string) => { status: number; body?: unknown } | Error;

function mockFetch(route: Route) {
	const calls: string[] = [];
	const impl = (async (input: string | URL | Request) => {
		const url = String(input);
		calls.push(url);
		const r = route(url);
		if (r instanceof Error) throw r;
		return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
			status: r.status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
	return { impl, calls };
}

const manifest = {
	metanet: {
		handles: { version: "1.0", resolve: "https://1sat.name/resolve" },
	},
};
const binding = (ttl = 3600, domain = "1sat.name") => ({
	metanetHandles: "1.0",
	handle: "alice",
	domain,
	identityKey: ALICE,
	certificate: { subject: ALICE },
	ttl,
	revoked: false,
});

describe("createHandleResolver", () => {
	it("discovers through manifest.json, resolves with the tag stripped, and caches for ttl", async () => {
		const { impl, calls } = mockFetch((url) => {
			if (url === "https://1sat.name/manifest.json")
				return { status: 200, body: manifest };
			if (url === "https://1sat.name/resolve?handle=alice")
				return { status: 200, body: binding(600) };
			return { status: 404 };
		});
		let t = 1_000_000;
		const r = createHandleResolver({ fetch: impl, now: () => t });
		const first = await r.resolve("Alice+conf@1sat.name");
		expect(first?.identityKey).toBe(ALICE);
		expect(calls).toEqual([
			"https://1sat.name/manifest.json",
			"https://1sat.name/resolve?handle=alice",
		]);
		t += 599_000;
		expect((await r.resolve("@alice@1sat.name"))?.identityKey).toBe(ALICE);
		expect(calls.length).toBe(2);
		t += 2_000;
		await r.resolve("@alice@1sat.name");
		expect(calls.length).toBe(3);
		expect(calls[2]).toBe("https://1sat.name/resolve?handle=alice");
	});

	it("shares in-flight lookups for the same handle", async () => {
		const { impl, calls } = mockFetch((url) =>
			url.endsWith("manifest.json")
				? { status: 200, body: manifest }
				: { status: 200, body: binding() },
		);
		const r = createHandleResolver({ fetch: impl });
		await Promise.all([
			r.resolve("alice@1sat.name"),
			r.resolve("@alice@1sat.name"),
			r.resolve("alice+x@1sat.name"),
		]);
		expect(calls.length).toBe(2);
	});

	it("does not probe the well-known path when the manifest has no metanet.handles", async () => {
		const { impl, calls } = mockFetch((url) =>
			url.endsWith("manifest.json")
				? { status: 200, body: { metanet: { trust: { publicKey: ALICE } } } }
				: { status: 200, body: binding() },
		);
		const r = createHandleResolver({ fetch: impl });
		expect(await r.resolve("alice@example.com")).toBeNull();
		expect(await r.resolve("bob@example.com")).toBeNull();
		expect(calls).toEqual(["https://example.com/manifest.json"]);
	});

	it("caches a negative manifest for NEGATIVE_TTL and a positive one for MANIFEST_TTL", async () => {
		let t = 0;
		let manifestBody: unknown = { status: 500 };
		const { impl, calls } = mockFetch((url) =>
			url.endsWith("manifest.json")
				? (manifestBody as { status: number; body?: unknown })
				: { status: 200, body: binding(60, "example.com") },
		);
		const r = createHandleResolver({ fetch: impl, now: () => t });
		expect(await r.resolve("alice@example.com")).toBeNull();
		t += (NEGATIVE_TTL - 1) * 1000;
		expect(await r.resolve("alice@example.com")).toBeNull();
		expect(calls.length).toBe(1);
		t += 2_000;
		manifestBody = {
			status: 200,
			body: { metanet: { handles: { version: "1.0" } } },
		};
		expect((await r.resolve("alice@example.com"))?.identityKey).toBe(ALICE);
		expect(calls.slice(1)).toEqual([
			"https://example.com/manifest.json",
			"https://example.com/.well-known/metanet-handles/resolve?handle=alice",
		]);
		t += (MANIFEST_TTL - 1) * 1000;
		await r.resolve("bob@example.com");
		expect(calls.length).toBe(4);
		expect(calls[3]).toContain("handle=bob");
	});

	it("treats 404, 410, 503, network errors, and bad JSON as unresolved without throwing", async () => {
		for (const outcome of [
			{ status: 404, body: { error: { code: "handle-not-found" } } },
			{ status: 410, body: { error: { code: "handle-revoked" } } },
			{ status: 503 },
			{ status: 200, body: "not an object" },
			new Error("network down"),
		] as const) {
			const { impl } = mockFetch((url) =>
				url.endsWith("manifest.json")
					? { status: 200, body: manifest }
					: outcome,
			);
			const r = createHandleResolver({ fetch: impl });
			expect(await r.resolve("alice@1sat.name")).toBeNull();
		}
	});

	it("returns null for input that is not a handle without touching the network", async () => {
		const { impl, calls } = mockFetch(() => ({ status: 200, body: manifest }));
		const r = createHandleResolver({ fetch: impl });
		expect(await r.resolve("David Case")).toBeNull();
		expect(await r.resolve("@alice@handcash")).toBeNull();
		expect(calls).toEqual([]);
	});
});
