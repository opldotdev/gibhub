/**
 * BRC-169 handles for commit authors.
 *
 * gib does not add anything to the head token for this. The handle is
 * whatever sits in the git commit's author/committer email slot, exactly
 * as git shows it. Resolution is best effort: the author's domain is asked
 * (manifest.json, then the resolve endpoint) for the identity key behind
 * the handle, and the handle counts as verified only when that key is the
 * one that signed the head being viewed. No lookups across heads, no index.
 *
 * Only the parts of BRC-169 needed for that are implemented: the grammar
 * (section 2.1), manifest discovery (5.1), the resolve endpoint (5.2),
 * errors (5.3), and caching (5.4).
 */

export interface ParsedHandle {
	/** Lowercase handle, no tag, no domain. */
	handle: string;
	/** Optional `+tag`, lowercase, stripped before resolution (section 3.1). */
	tag?: string;
	/** Lowercase FQDN. */
	domain: string;
	/** Resolution key: `@handle@domain`, tag stripped. */
	key: string;
	/** Display form: `@handle[+tag]@domain`. */
	display: string;
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const TAG_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isDomain(s: string): boolean {
	if (s.length > 253 || !s.includes(".")) return false;
	return s.split(".").every((label) => LABEL_RE.test(label));
}

/**
 * Parses `@handle[+tag]@domain` or the paymail form `handle[+tag]@domain`
 * (section 2.1 rules 7 and 9), normalized to lowercase. Returns undefined
 * for anything else: plain names, a dotless ecosystem (an alias, which
 * this site does not resolve), or an invalid grammar.
 */
export function parseHandle(
	input: string | undefined,
): ParsedHandle | undefined {
	if (!input) return undefined;
	const raw = input.trim().toLowerCase();
	const body = raw.startsWith("@") ? raw.slice(1) : raw;
	const at = body.indexOf("@");
	if (at <= 0 || at !== body.lastIndexOf("@")) return undefined;
	const local = body.slice(0, at);
	const domain = body.slice(at + 1);
	const plus = local.indexOf("+");
	const handle = plus < 0 ? local : local.slice(0, plus);
	const tag = plus < 0 ? undefined : local.slice(plus + 1);
	if (!HANDLE_RE.test(handle)) return undefined;
	if (tag !== undefined && !TAG_RE.test(tag)) return undefined;
	if (!isDomain(domain)) return undefined;
	return {
		handle,
		tag,
		domain,
		key: `@${handle}@${domain}`,
		display: `@${handle}${tag ? `+${tag}` : ""}@${domain}`,
	};
}

/** What the resolve endpoint told us about a handle. */
export interface ResolvedHandle {
	handle: string;
	domain: string;
	identityKey: string;
	/** Host-supplied and unattested (section 2.4.8); shown only when present. */
	displayName?: string;
	avatarURL?: string;
}

/** A commit author whose handle resolved to the key that signed the viewed head. */
export interface VerifiedHandle extends ResolvedHandle {
	/** Display form, e.g. `@alice@1sat.name`. */
	display: string;
}

/** Cache bounds. A ttl outside them is clamped; failures are cached briefly. */
export const MIN_TTL = 60;
export const MAX_TTL = 86_400;
export const NEGATIVE_TTL = 300;
export const MANIFEST_TTL = 3_600;
export const FETCH_TIMEOUT_MS = 3_000;

export function clampTtl(ttl: unknown): number {
	const n = typeof ttl === "number" && Number.isFinite(ttl) ? ttl : MIN_TTL;
	return Math.min(MAX_TTL, Math.max(MIN_TTL, Math.floor(n)));
}

const KEY_RE = /^0[23][0-9a-f]{64}$/;

function majorVersion(v: unknown): number | undefined {
	if (typeof v !== "string") return undefined;
	const major = Number.parseInt(v.split(".")[0] ?? "", 10);
	return Number.isFinite(major) ? major : undefined;
}

/** The resolve URL for a domain per section 5.1, or null when the domain does not offer handles. */
export function resolveUrlFromManifest(
	manifest: unknown,
	domain: string,
): string | null {
	const handles = (
		manifest as { metanet?: { handles?: Record<string, unknown> } } | null
	)?.metanet?.handles;
	if (!handles || typeof handles !== "object") return null;
	if (majorVersion(handles.version) !== 1) return null;
	const resolve = handles.resolve;
	if (resolve === undefined) {
		return `https://${domain}/.well-known/metanet-handles/resolve`;
	}
	if (typeof resolve !== "string") return null;
	try {
		const url = new URL(resolve);
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

/** Reads a 200 body from the resolve endpoint (section 5.2); null when it is not a usable binding. */
export function parseResolveResponse(
	body: unknown,
	parsed: ParsedHandle,
): (ResolvedHandle & { ttl: number }) | null {
	const r = body as Record<string, unknown> | null;
	if (!r || typeof r !== "object") return null;
	const major = majorVersion(r.metanetHandles);
	if (major !== undefined && major !== 1) return null;
	if (r.revoked === true) return null;
	const identityKey =
		typeof r.identityKey === "string" ? r.identityKey.toLowerCase() : "";
	if (!KEY_RE.test(identityKey)) return null;
	const cert = r.certificate as Record<string, unknown> | undefined;
	if (!cert || typeof cert !== "object") return null;
	if (
		typeof cert.subject === "string" &&
		cert.subject.toLowerCase() !== identityKey
	) {
		return null;
	}
	if (typeof r.handle === "string" && r.handle.toLowerCase() !== parsed.handle)
		return null;
	if (typeof r.domain === "string" && r.domain.toLowerCase() !== parsed.domain)
		return null;
	const out: ResolvedHandle & { ttl: number } = {
		handle: parsed.handle,
		domain: parsed.domain,
		identityKey,
		ttl: clampTtl(r.ttl),
	};
	if (typeof r.displayName === "string" && r.displayName.trim()) {
		out.displayName = r.displayName.trim();
	}
	if (typeof r.avatarURL === "string" && /^https:\/\//.test(r.avatarURL)) {
		out.avatarURL = r.avatarURL;
	}
	return out;
}

interface Entry<T> {
	value: T;
	expires: number;
}

export interface ResolverOptions {
	fetch?: typeof fetch;
	now?: () => number;
	timeoutMs?: number;
}

/**
 * Server-side resolver with an in-memory cache for manifests (per domain)
 * and bindings (per handle). In-flight lookups are shared so a page listing
 * twenty commits by one author asks the domain once. Never throws: any
 * failure is a null binding, cached for NEGATIVE_TTL.
 */
export function createHandleResolver(opts: ResolverOptions = {}) {
	const fetchImpl = opts.fetch ?? fetch;
	const now = opts.now ?? (() => Date.now());
	const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
	const manifests = new Map<string, Entry<string | null>>();
	const bindings = new Map<string, Entry<ResolvedHandle | null>>();
	const inflight = new Map<string, Promise<ResolvedHandle | null>>();

	async function getJson(
		url: string,
	): Promise<{ status: number; body: unknown } | null> {
		try {
			const res = await fetchImpl(url, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(timeoutMs),
				cache: "no-store",
			});
			let body: unknown = null;
			try {
				body = await res.json();
			} catch {
				body = null;
			}
			return { status: res.status, body };
		} catch {
			return null;
		}
	}

	async function resolveEndpoint(domain: string): Promise<string | null> {
		const cached = manifests.get(domain);
		if (cached && cached.expires > now()) return cached.value;
		const res = await getJson(`https://${domain}/manifest.json`);
		const url =
			res && res.status === 200
				? resolveUrlFromManifest(res.body, domain)
				: null;
		manifests.set(domain, {
			value: url,
			expires: now() + (url ? MANIFEST_TTL : NEGATIVE_TTL) * 1000,
		});
		return url;
	}

	async function lookup(
		parsed: ParsedHandle,
	): Promise<(ResolvedHandle & { ttl: number }) | null> {
		const endpoint = await resolveEndpoint(parsed.domain);
		if (!endpoint) return null;
		const url = new URL(endpoint);
		url.searchParams.set("handle", parsed.handle);
		const res = await getJson(url.toString());
		if (res?.status !== 200) return null;
		return parseResolveResponse(res.body, parsed);
	}

	async function resolve(
		input: string | undefined,
	): Promise<ResolvedHandle | null> {
		const parsed = parseHandle(input);
		if (!parsed) return null;
		const cached = bindings.get(parsed.key);
		if (cached && cached.expires > now()) return cached.value;
		const pending = inflight.get(parsed.key);
		if (pending) return pending;
		const p = lookup(parsed)
			.catch(() => null)
			.then((result) => {
				let value: ResolvedHandle | null = null;
				let ttl = NEGATIVE_TTL;
				if (result) {
					const { ttl: resultTtl, ...rest } = result;
					ttl = resultTtl;
					value = rest;
				}
				bindings.set(parsed.key, { value, expires: now() + ttl * 1000 });
				inflight.delete(parsed.key);
				return value;
			});
		inflight.set(parsed.key, p);
		return p;
	}

	return { resolve };
}

export type HandleResolver = ReturnType<typeof createHandleResolver>;

/**
 * The verification rule: a handle is verified for a head only when the
 * domain's answer is the identity key that signed that head. The same
 * commit on someone else's head is not verified there.
 */
export function verifyHandle(
	input: string | undefined,
	resolved: ResolvedHandle | null | undefined,
	headIdentity: string,
): VerifiedHandle | undefined {
	const parsed = parseHandle(input);
	if (!parsed || !resolved) return undefined;
	if (resolved.identityKey.toLowerCase() !== headIdentity.toLowerCase())
		return undefined;
	if (resolved.handle !== parsed.handle || resolved.domain !== parsed.domain)
		return undefined;
	return { ...resolved, display: parsed.display };
}

/** Verified author handle per head outpoint; heads without one are absent. */
export type AuthorHandles = Record<string, VerifiedHandle>;

/** Per-head verification over already-resolved bindings (pure; shared by server and client). */
export function matchAuthorHandles(
	heads: {
		outpoint: string;
		identity: string;
		commit?: { author?: { email: string } };
	}[],
	resolved: (key: string) => ResolvedHandle | null | undefined,
): AuthorHandles {
	const out: AuthorHandles = {};
	for (const head of heads) {
		const email = head.commit?.author?.email;
		const parsed = parseHandle(email);
		if (!parsed) continue;
		const verified = verifyHandle(email, resolved(parsed.key), head.identity);
		if (verified) out[head.outpoint] = verified;
	}
	return out;
}

/** The distinct resolution keys among a list of heads' author emails. */
export function authorHandleKeys(
	heads: { commit?: { author?: { email: string } } }[],
): string[] {
	const keys = new Set<string>();
	for (const head of heads) {
		const parsed = parseHandle(head.commit?.author?.email);
		if (parsed) keys.add(parsed.key);
	}
	return [...keys].sort();
}
