/**
 * The site's shared BRC-169 resolver. Server only: pages and route handlers
 * import this; client code goes through /api/handles so the domain fetches
 * and cache live in one place.
 */
import type { Commit } from "./gib-api";
import {
	type AuthorHandles,
	authorHandleKeys,
	createHandleResolver,
	matchAuthorHandles,
	type ResolvedHandle,
	type VerifiedHandle,
	verifyHandle,
} from "./handles";

const globalRef = globalThis as {
	__gibHandleResolver?: ReturnType<typeof createHandleResolver>;
};
if (!globalRef.__gibHandleResolver) {
	globalRef.__gibHandleResolver = createHandleResolver();
}
export const handleResolver = globalRef.__gibHandleResolver;

/** Resolves a set of handle keys, never throwing; unresolved keys map to null. */
export async function resolveMany(
	keys: string[],
): Promise<Record<string, ResolvedHandle | null>> {
	const out: Record<string, ResolvedHandle | null> = {};
	await Promise.all(
		keys.map(async (key) => {
			out[key] = await handleResolver.resolve(key).catch(() => null);
		}),
	);
	return out;
}

/** Verified author handles for a list of heads, each checked against its own signer. */
export async function authorHandles(
	heads: { outpoint: string; identity: string; commit?: Commit }[],
): Promise<AuthorHandles> {
	const resolved = await resolveMany(authorHandleKeys(heads));
	return matchAuthorHandles(heads, (key) => resolved[key]);
}

/** Author and committer handles of one commit, verified against the viewed head's signer. */
export async function commitHandles(
	commit: Commit | undefined,
	headIdentity: string,
): Promise<{ author?: VerifiedHandle; committer?: VerifiedHandle }> {
	if (!commit) return {};
	const [author, committer] = await Promise.all([
		handleResolver.resolve(commit.author?.email).catch(() => null),
		handleResolver.resolve(commit.committer?.email).catch(() => null),
	]);
	return {
		author: verifyHandle(commit.author?.email, author, headIdentity),
		committer: verifyHandle(commit.committer?.email, committer, headIdentity),
	};
}
