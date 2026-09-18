"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({
	value,
	label,
}: {
	value: string;
	label?: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="ghost"
			size="icon"
			className="size-6"
			aria-label={label ?? "Copy"}
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				} catch {
					// clipboard unavailable
				}
			}}
		>
			{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
		</Button>
	);
}
