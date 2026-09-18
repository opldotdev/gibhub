import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { APP_URL } from "@/lib/stack";
import { QueryProvider } from "@/providers/query-provider";
import { WalletProvider } from "@/providers/wallet-provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
	variable: "--font-sans",
	subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "gibhub",
		template: "%s · gibhub",
	},
	description:
		"Browse git repositories published on BSV with gib: branches are signed coins, files are on-chain outputs.",
	metadataBase: new URL(APP_URL),
	openGraph: {
		title: "gibhub",
		description: "On-chain git, browsable.",
		url: APP_URL,
		siteName: "gibhub",
		type: "website",
	},
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased font-sans min-h-screen flex flex-col`}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem
					disableTransitionOnChange
				>
					<QueryProvider>
						<WalletProvider>
							<SiteHeader />
							<main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
								{children}
							</main>
							<SiteFooter />
							<Toaster position="bottom-right" />
						</WalletProvider>
					</QueryProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
