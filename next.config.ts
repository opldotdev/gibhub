import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactCompiler: true,
	// @1sat/actions lazily imports xdelta3-wasm (vcdiff) whose Node loader
	// requires "fs". The site never applies patches client-side (ORDFS does),
	// so stub it in the browser bundle.
	turbopack: {
		resolveAlias: {
			"xdelta3-wasm": { browser: "./lib/empty.ts" },
		},
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{
						key: "Permissions-Policy",
						value: "camera=(), geolocation=(), microphone=()",
					},
				],
			},
		];
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "api.1sat.app",
				pathname: "/content/**",
			},
		],
	},
};

export default nextConfig;
