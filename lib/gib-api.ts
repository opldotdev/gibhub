/**
 * Typed client for the 1sat-stack gib overlay REST API (/1sat/gib).
 *
 * Every function returns null on 404 and throws on other failures. Server
 * components pass a revalidate window; client callers get plain fetches.
 */

import { shortOutpoint, toOrdinalOutpoint } from "./format";
import { stackApiUrl } from "./stack";

export interface Signature {
	name: string;
	email: string;
	time: number;
	tz: string;
}

export interface Commit {
	sha: string;
	tree: string;
	parents: string[];
	author?: Signature;
	committer?: Signature;
	message: string;
}

export interface Spend {
	txid: string;
	/** Successor head for a push; absent for a branch deletion. */
	next?: string;
	score: number;
}

/** The tree's `.gib` file, as indexed by the overlay. Labels, not ids. */
export interface RepoMeta {
	name?: string;
	description?: string;
	defaultBranch?: string;
}

export interface HeadRecord {
	outpoint: string;
	txid: string;
	vout: number;
	origin: string;
	branch: string;
	root: string;
	identity: string;
	commit?: Commit;
	prev?: string;
	spend?: Spend;
	meta?: RepoMeta;
	score: number;
	height: number;
}

export interface RepoRecord {
	origin: string;
	owner: string;
	firstOutpoint: string;
	name?: string;
	description?: string;
	defaultBranch?: string;
	firstScore: number;
	lastScore: number;
	heads: number;
	branches: number;
}

export interface RepoResponse extends RepoRecord {
	branchHeads: HeadRecord[];
}

/** A git commit as a DAG node: heads publishing it and heads building on it. */
export interface CommitResponse {
	sha: string;
	heads: HeadRecord[];
	children: HeadRecord[];
}

export interface BranchResponse {
	origin: string;
	branch: string;
	head?: HeadRecord;
	history: HeadRecord[];
}

export interface Paging {
	limit?: number;
	from?: number;
	rev?: boolean;
}

export interface FetchOpts {
	/** Next.js ISR window in seconds (server components only). */
	revalidate?: number;
}

const DEFAULT_REVALIDATE = 30;

async function getJson<T>(
	path: string,
	params: object = {},
	opts: FetchOpts = {},
): Promise<T | null> {
	const url = new URL(stackApiUrl(`/1sat/gib${path}`));
	for (const [key, value] of Object.entries(
		params as Record<string, unknown>,
	)) {
		if (value !== undefined && value !== "")
			url.searchParams.set(key, String(value));
	}
	const init: RequestInit & { next?: { revalidate: number } } = {
		headers: { accept: "application/json" },
	};
	if (typeof window === "undefined") {
		init.next = { revalidate: opts.revalidate ?? DEFAULT_REVALIDATE };
	}
	const res = await fetch(url, init);
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new Error(`gib api ${path}: ${res.status} ${res.statusText}`);
	}
	return (await res.json()) as T;
}

export const listRepos = (paging: Paging = {}, opts?: FetchOpts) =>
	getJson<RepoRecord[]>("/repos", paging, opts).then((r) => r ?? []);

export const listReposByIdentity = (
	identity: string,
	paging: Paging = {},
	opts?: FetchOpts,
) =>
	getJson<RepoRecord[]>(`/identity/${identity}/repos`, paging, opts).then(
		(r) => r ?? [],
	);

export const getRepo = (origin: string, opts?: FetchOpts) =>
	getJson<RepoResponse>(`/repo/${toOrdinalOutpoint(origin)}`, {}, opts);

export const listBranches = (
	origin: string,
	identity?: string,
	opts?: FetchOpts,
) =>
	getJson<HeadRecord[]>(
		`/repo/${toOrdinalOutpoint(origin)}/branches`,
		{ identity },
		opts,
	).then((r) => r ?? []);

export const getBranch = (
	origin: string,
	branch: string,
	paging: Paging = {},
	opts?: FetchOpts,
) =>
	getJson<BranchResponse>(
		`/repo/${toOrdinalOutpoint(origin)}/branch/${branch
			.split("/")
			.map(encodeURIComponent)
			.join("/")}`,
		paging,
		opts,
	);

export const getHead = (outpoint: string, opts?: FetchOpts) =>
	getJson<HeadRecord>(`/head/${toOrdinalOutpoint(outpoint)}`, {}, opts);

export const getCommit = (sha: string, opts?: FetchOpts) =>
	getJson<CommitResponse>(`/commit/${sha.toLowerCase()}`, {}, opts);

export interface HeadFilter extends Paging {
	origin?: string;
	branch?: string;
	identity?: string;
	unspent?: boolean;
}

export const listHeads = (filter: HeadFilter = {}, opts?: FetchOpts) =>
	getJson<HeadRecord[]>("/heads", filter, opts).then((r) => r ?? []);

/** Display name for a repository: `.gib` name, else the shortened origin. */
export function repoName(repo: { origin: string; name?: string }): string {
	return repo.name?.trim() || shortOutpoint(repo.origin);
}

/** Picks the branch a repo page opens on: `.gib` defaultBranch, main, master, else newest. */
export function defaultBranchHead(
	heads: HeadRecord[],
	defaultBranch?: string,
): HeadRecord | undefined {
	return (
		(defaultBranch
			? heads.find((h) => h.branch === defaultBranch)
			: undefined) ??
		heads.find((h) => h.branch === "main") ??
		heads.find((h) => h.branch === "master") ??
		heads[0]
	);
}
