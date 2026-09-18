import { APP_URL } from "@/lib/stack";

/**
 * Web app manifest. When NEXT_PUBLIC_TRUST_PUBLIC_KEY is set, a
 * `babbage.trust` block is included so the 1Sat desktop wallet treats this
 * origin as trusted (see wallet-desktop http-server manifest trust).
 */
export function GET() {
	const manifest: Record<string, unknown> = {
		name: "gibhub",
		short_name: "gibhub",
		start_url: "/",
		display: "standalone",
		background_color: "#030404",
		theme_color: "#030404",
		description: "Browse git repositories published on BSV with gib.",
		icons: [{ src: "/gibhub.svg", sizes: "any", type: "image/svg+xml" }],
	};
	const publicKey = process.env.NEXT_PUBLIC_TRUST_PUBLIC_KEY;
	if (publicKey) {
		manifest.babbage = {
			trust: { name: "gibhub", publicKey, url: APP_URL },
		};
	}
	return Response.json(manifest, {
		headers: { "cache-control": "public, max-age=3600" },
	});
}
