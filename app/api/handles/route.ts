import { NextResponse } from "next/server";
import { parseHandle } from "@/lib/handles";
import { resolveMany } from "@/lib/handles-server";

export const dynamic = "force-dynamic";

const MAX_HANDLES = 50;

/**
 * GET /api/handles?handle=@alice@1sat.name&handle=bob@example.com
 *
 * Resolves handles through the server's shared BRC-169 cache and returns
 * `{ [key]: ResolvedHandle | null }` keyed by the normalized `@handle@domain`.
 * The caller applies the verification rule (does the identity key match the
 * head's signer?) itself; this endpoint only reports what each domain said.
 */
export async function GET(request: Request) {
	const keys = new Set<string>();
	for (const raw of new URL(request.url).searchParams.getAll("handle")) {
		const parsed = parseHandle(raw);
		if (parsed) keys.add(parsed.key);
		if (keys.size >= MAX_HANDLES) break;
	}
	const resolved = await resolveMany([...keys]);
	return NextResponse.json(resolved, {
		headers: { "cache-control": "private, max-age=60" },
	});
}
