/**
 * ORDFS reads: directory manifests, path resolution, and file content.
 *
 * The gateway resolves paths and applies patch chains itself
 * (`/content/{root}/path/to/file`), so file bytes always come from there.
 * Listing a directory needs the manifest bytes, fetched raw and decoded
 * here: binary `ordfs/dir` via the @1sat SDK codec, legacy `ord-fs/json`
 * locally.
 */

import {
	DIR_CONTENT_TYPE,
	dirDecode,
	dirNameString,
	JSON_MANIFEST_CONTENT_TYPE_LEGACY,
} from "@1sat/actions";
import { outpointTxid, toOrdinalOutpoint } from "./format";
import { STACK_URL, stackApiUrl } from "./stack";

export const JSON_MANIFEST_TYPE = JSON_MANIFEST_CONTENT_TYPE_LEGACY;
export const BINARY_MANIFEST_TYPE = DIR_CONTENT_TYPE;
export const PATCH_TYPE = "ordfs/patch";

export type EntryKind = "file" | "dir";

export interface DirEntry {
	name: string;
	outpoint: string;
	kind: EntryKind;
	/** git mode 100755 */
	exec?: boolean;
	/** content is a relative target path */
	symlink?: boolean;
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

const baseType = (contentType: string | null | undefined) =>
	(contentType ?? "").split(";")[0]?.trim() ?? "";

export const isManifestType = (contentType: string | undefined) => {
	const base = baseType(contentType);
	return base === JSON_MANIFEST_TYPE || base === BINARY_MANIFEST_TYPE;
};

function serverFetchInit(revalidate: number): RequestInit {
	if (typeof window !== "undefined") return {};
	return { next: { revalidate } } as RequestInit;
}

/** Resolves a JSON manifest pointer (`_N` sibling or full outpoint). */
export function resolvePointer(manifestOutpoint: string, pointer: string) {
	if (pointer.startsWith("_")) {
		return `${outpointTxid(manifestOutpoint)}_${pointer.slice(1)}`;
	}
	return toOrdinalOutpoint(pointer);
}

/** A manifest entry before metadata enrichment. */
interface RawEntry {
	name: string;
	outpoint: string;
	/** Known from the binary format; undefined for legacy JSON. */
	isDir?: boolean;
	exec?: boolean;
	symlink?: boolean;
}

/** Decodes a binary `ordfs/dir` manifest into entries with resolved outpoints. */
export function decodeBinaryManifest(
	bytes: Uint8Array,
	manifestOutpoint: string,
): RawEntry[] {
	const txid = outpointTxid(manifestOutpoint);
	return dirDecode(bytes).entries.map((e) => ({
		name: dirNameString(e.name),
		outpoint:
			e.ref.kind === "same-tx"
				? `${txid}_${e.ref.vout}`
				: `${e.ref.txid}_${e.ref.vout}`,
		isDir: e.isDir,
		exec: e.exec,
		symlink: e.symlink,
	}));
}

/** Decodes a legacy `ord-fs/json` manifest (`{ name: "_N" | "txid_vout" }`). */
export function decodeJsonManifest(
	pointers: Record<string, string>,
	manifestOutpoint: string,
): RawEntry[] {
	return Object.entries(pointers).map(([name, pointer]) => ({
		name,
		outpoint: resolvePointer(manifestOutpoint, pointer),
	}));
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
 * Lists a directory manifest's entries with content type and size from bulk
 * metadata. Immutable by outpoint, so cached aggressively.
 */
export async function loadDirectory(
	manifestOutpoint: string,
): Promise<DirEntry[]> {
	const outpoint = toOrdinalOutpoint(manifestOutpoint);
	const res = await fetch(rawContentUrl(outpoint), serverFetchInit(3600));
	if (!res.ok) throw new Error(`ordfs content ${outpoint}: ${res.status}`);
	const type = baseType(res.headers.get("content-type"));

	let raw: RawEntry[];
	if (type === BINARY_MANIFEST_TYPE) {
		raw = decodeBinaryManifest(
			new Uint8Array(await res.arrayBuffer()),
			outpoint,
		);
	} else if (type === JSON_MANIFEST_TYPE) {
		raw = decodeJsonManifest(
			(await res.json()) as Record<string, string>,
			outpoint,
		);
	} else {
		throw new UnsupportedManifestError(type || "unknown");
	}

	const meta: Record<string, OrdfsMetadata | null> = {};
	for (let i = 0; i < raw.length; i += 100) {
		Object.assign(
			meta,
			await bulkMetadata(raw.slice(i, i + 100).map((e) => e.outpoint)),
		);
	}

	const entries: DirEntry[] = raw.map((e) => {
		const m = meta[e.outpoint];
		const contentType = m?.contentType ? baseType(m.contentType) : undefined;
		return {
			name: e.name,
			outpoint: e.outpoint,
			kind: (e.isDir ?? isManifestType(contentType)) ? "dir" : "file",
			exec: e.exec,
			symlink: e.symlink,
			contentType,
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
