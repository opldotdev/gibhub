import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactCompiler: true,
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
