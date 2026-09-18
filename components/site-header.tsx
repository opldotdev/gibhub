import { GitBranch } from "lucide-react";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { routes } from "@/lib/routes";

export function SiteHeader() {
	return (
		<header className="border-b bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40">
			<div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
				<Link
					href={routes.home()}
					className="flex items-center gap-2 font-semibold tracking-tight"
				>
					<GitBranch className="size-5 text-primary" />
					<span>gibhub</span>
				</Link>
				<nav className="flex items-center gap-4 text-sm text-muted-foreground">
					<Link href={routes.home()} className="hover:text-foreground">
						Explore
					</Link>
					<Link href={routes.me()} className="hover:text-foreground">
						My repos
					</Link>
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle />
					<ConnectWalletButton />
				</div>
			</div>
		</header>
	);
}
