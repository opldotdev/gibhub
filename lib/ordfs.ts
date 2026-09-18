/**
 * ORDFS reads: directory manifests, path resolution, and file content.
 *
 * The gateway resolves paths and applies patch chains itself
 * (`/content/{root}/path/to/file`), so file bytes always come from there.
 * Listing a directory needs the manifest bytes, fetched raw and decoded
 * here. JSON manifests (`ord-fs/json`) are decoded locally; binary
 * `ordfs/dir` manifests are decoded by the @1sat SDK codec once it ships,
 * see decodeBinaryManifest.
 */

import { outpointTxid, toOrdinalOutpoint } from "./format";
import { STACK_URL, stackApiUrl } from "./stack";

export const JSON_MANIFEST_TYPE = "ord-fs/json";
export const BINARY_MANIFEST_TYPE = "ordfs/dir";
export const PATCH_TYPE = "ordfs/patch";

export type EntryKind = "file" | "dir";

export interface DirEntry {
	name: string;
	outpoint: string;
	kind: EntryKind;
	contentType?: string;
	size?: number;
}

export interface OrdfsMetadata {
	outpoint: string;
	origin?: string;
	contentType: string;
	contentLength: number;
	sequence?: number;
}

export class UnsupportedManifestError extends Error {
	constructor(contentType: string) {
		super(`unsupported directory manifest type: ${contentType}`);
		this.name = "UnsupportedManifestError";
	}
}

export const contentUrl = (outpoint: string, path = "") =>
	`${STACK_URL}/content/${toOrdinalOutpoint(outpoint)}${path ? `/${path}` : ""}`;

export const rawContentUrl = (outpoint: string) =>
	`${contentUrl(outpoint)}?raw=true`;

export const isManifestType = (contentType: string | undefined) => {
	const base = (contentType ?? "").split(";")[0]?.trim();
	return base === JSON_MANIFEST_TYPE || base === BINARY_MANIFEST_TYPE;
};

const baseType = (contentType: string | null | undefined) =>
	(contentType ?? "").split(";")[0]?.trim() ?? "";

function serverFetchInit(revalidate: number): RequestInit {
	if (typeof window !== "undefined") return {};
	return { next: { revalidate } } as RequestInit;
}

/** Resolves a manifest pointer (`_N` sibling or full outpoint). */
export function resolvePointer(manifestOutpoint: string, pointer: string) {
	if (pointer.startsWith("_")) {
		return `${outpointTxid(manifestOutpoint)}_${pointer.slice(1)}`;
	}
	return toOrdinalOutpoint(pointer);
}

/**
 * Adapter for binary `ordfs/dir` manifests. Wire the @1sat SDK decoder
 * here when it lands; until then binary trees report as unsupported.
 */
export function decodeBinaryManifest(
	_bytes: Uint8Array,
	_manifestOutpoint: string,
): Record<string, string> {
	throw new UnsupportedManifestError(BINARY_MANIFEST_TYPE);
}

/** Fetches bulk metadata for up to 100 outpoints. */
export async function bulkMetadata(
	outpoints: string[],
): Promise<Record<string, OrdfsMetadata | null>> {
	if (outpoints.length === 0) return {};
	const res = await fetch(stackApiUrl("/1sat/ordfs/metadata"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ outpoints }),
		...serverFetchInit(3600),
	});
	if (!res.ok) throw new Error(`ordfs metadata: ${res.status}`);
	return (await res.json()) as Record<string, OrdfsMetadata | null>;
}

export async function getMetadata(
	outpoint: string,
): Promise<OrdfsMetadata | null> {
	const res = await fetch(
		stackApiUrl(`/1sat/ordfs/metadata/${toOrdinalOutpoint(outpoint)}`),
		serverFetchInit(3600),
	);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`ordfs metadata: ${res.status}`);
	return (await res.json()) as OrdfsMetadata;
}

/**
 * Lists a directory manifest's entries, classified as file or dir via bulk
 * metadata. Immutable by outpoint, so cached aggressively.
 */
export async function loadDirectory(
	manifestOutpoint: string,
): Promise<DirEntry[]> {
	const outpoint = toOrdinalOutpoint(manifestOutpoint);
	const res = await fetch(rawContentUrl(outpoint), serverFetchInit(3600));
	if (!res.ok) throw new Error(`ordfs content ${outpoint}: ${res.status}`);
	const type = baseType(res.headers.get("content-type"));

	let pointers: Record<string, string>;
	if (type === JSON_MANIFEST_TYPE) {
		pointers = (await res.json()) as Record<string, string>;
	} else if (type === BINARY_MANIFEST_TYPE) {
		pointers = decodeBinaryManifest(
			new Uint8Array(await res.arrayBuffer()),
			outpoint,
		);
	} else {
		throw new UnsupportedManifestError(type || "unknown");
	}

	const names = Object.keys(pointers).sort((a, b) => a.localeCompare(b));
	const resolved = names.map((name) => ({
		name,
		outpoint: resolvePointer(outpoint, pointers[name] as string),
	}));

	const meta: Record<string, OrdfsMetadata | null> = {};
	for (let i = 0; i < resolved.length; i += 100) {
		Object.assign(
			meta,
			await bulkMetadata(resolved.slice(i, i + 100).map((e) => e.outpoint)),
		);
	}

	const entries: DirEntry[] = resolved.map(({ name, outpoint: op }) => {
		const m = meta[op];
		const contentType = m?.contentType;
		return {
			name,
			outpoint: op,
			kind: isManifestType(contentType) ? "dir" : "file",
			contentType: contentType ? baseType(contentType) : undefined,
			size: m?.contentLength,
		};
	});
	// Directories first, like every code host.
	return entries.sort((a, b) =>
		a.kind === b.kind
			? a.name.localeCompare(b.name)
			: a.kind === "dir"
				? -1
				: 1,
	);
}

/**
 * Walks path components from a root manifest and returns the entry at the
 * end (or null when any component is missing).
 */
export async function resolvePath(
	rootOutpoint: string,
	path: string[],
): Promise<DirEntry | null> {
	let current: DirEntry = {
		name: "",
		outpoint: toOrdinalOutpoint(rootOutpoint),
		kind: "dir",
	};
	for (const component of path) {
		if (current.kind !== "dir") return null;
		const entries = await loadDirectory(current.outpoint);
		const next = entries.find((e) => e.name === component);
		if (!next) return null;
		current = next;
	}
	return current;
}

const TEXT_TYPES =
	/^(text\/|application\/(json|javascript|typescript|xml|x-sh|x-yaml|toml|x-httpd-php|wasm-text)|image\/svg)/;
const MAX_TEXT_BYTES = 512 * 1024;

export const isTextType = (contentType: string | undefined) =>
	TEXT_TYPES.test(baseType(contentType));

export const isImageType = (contentType: string | undefined) =>
	baseType(contentType).startsWith("image/") &&
	baseType(contentType) !== "image/svg+xml";

/** Fetches resolved (patch-applied) file bytes as text, size-capped. */
export async function fetchText(
	outpoint: string,
): Promise<{ text: string; truncated: boolean; contentType: string } | null> {
	const res = await fetch(contentUrl(outpoint), serverFetchInit(3600));
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`ordfs content ${outpoint}: ${res.status}`);
	const buf = new Uint8Array(await res.arrayBuffer());
	const truncated = buf.length > MAX_TEXT_BYTES;
	const text = new TextDecoder().decode(
		truncated ? buf.subarray(0, MAX_TEXT_BYTES) : buf,
	);
	return {
		text,
		truncated,
		contentType: baseType(res.headers.get("content-type")),
	};
}
