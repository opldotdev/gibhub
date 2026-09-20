import { APP_URL } from "@/lib/stack";

/**
 * `/manifest.json` — the web app manifest, plus the two wallet-facing blocks
 * a BRC-100 wallet looks for at this exact path.
 *
 * `metanet.groupPermissions` is BRC-73: everything the site can ask of a
 * wallet, declared up front, so the wallet asks once as one grouped request
 * instead of prompting per call. Shape and placement follow
 * `WalletPermissionsManager.fetchManifestPermissions` in
 * @bsv/wallet-toolbox, which reads `manifest.metanet || manifest.babbage`
 * and then `.groupPermissions`, and validates nothing — an entry in the
 * wrong shape is silently carried into the prompt.
 *
 * `babbage.trust`, when NEXT_PUBLIC_TRUST_PUBLIC_KEY is set, is the separate
 * trusted-origin block the 1Sat desktop wallet reads (name + publicKey).
 * It stays under `babbage` because that is where that reader looks.
 */

/**
 * Only levels 1 and 2 are meaningful here: level 0 never prompts, so
 * declaring it is a no-op.
 */
const LEVEL_1 = 1 as const;

/**
 * Action labels are not their own category in BRC-73. The permissions
 * manager gates label `x` as the level-1 protocol `action label x`, so that
 * is how `gib push` and `gib delete` are declared.
 *
 * Counterparty is deliberately absent from every entry: the manager forces
 * counterparty to "" for level-1 protocols, so a declared one is ignored —
 * and a literal "" is treated as a reserved slot and drops the entry.
 */
const groupPermissions = {
	description:
		"gibhub needs these only to publish or delete a branch from your wallet. Browsing repositories needs none of them.",
	spendingAuthorization: {
		// A branch head is a 1-satoshi coin; the rest is mining fees. This is
		// a monthly allowance, counted by the wallet across the calendar month.
		amount: 10_000,
		description: "Fund the 1-satoshi branch heads you publish, and their fees",
	},
	protocolPermissions: [
		{
			protocolID: [LEVEL_1, "identity key retrieval"],
			description: "Read your identity public key, to show your repositories",
		},
		{
			protocolID: [LEVEL_1, "gib branch"],
			description: "Sign and unlock the branch heads you publish",
		},
		{
			protocolID: [LEVEL_1, "action label gib push"],
			description: "Label a transaction that publishes a branch",
		},
		{
			protocolID: [LEVEL_1, "action label gib delete"],
			description: "Label a transaction that deletes a branch",
		},
	],
	basketAccess: [
		{
			basket: "gib",
			description: "Keep and list the branch heads you publish",
		},
	],
};

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
		metanet: { schemaVersion: 1, groupPermissions },
	};
	const publicKey = process.env.NEXT_PUBLIC_TRUST_PUBLIC_KEY;
	if (publicKey) {
		manifest.babbage = {
			trust: { name: "gibhub", publicKey, url: APP_URL },
		};
	}
	return Response.json(manifest, {
		headers: {
			"cache-control": "public, max-age=3600",
			// A wallet running in a page fetches this cross-origin. The document
			// is public and carries no credentials.
			"access-control-allow-origin": "*",
		},
	});
}
