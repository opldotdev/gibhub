import { highlight } from "sugar-high";
import { Markdown } from "@/components/markdown";
import { formatBytes } from "@/lib/format";
import { contentUrl, isImageType, isTextType } from "@/lib/ordfs";

const CODE_EXT = new Set([
	"js",
	"jsx",
	"ts",
	"tsx",
	"mjs",
	"cjs",
	"json",
	"go",
	"rs",
	"py",
	"rb",
	"java",
	"kt",
	"swift",
	"c",
	"h",
	"cpp",
	"hpp",
	"cs",
	"css",
	"scss",
	"html",
	"xml",
	"yaml",
	"yml",
	"toml",
	"sh",
	"bash",
	"zsh",
	"sql",
	"graphql",
	"zig",
]);

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function BlobView({
	name,
	outpoint,
	contentType,
	size,
	text,
	truncated,
	origin,
	headRef,
	root,
	dir,
}: {
	name: string;
	outpoint: string;
	contentType?: string;
	size?: number;
	text: string | null;
	truncated: boolean;
	origin: string;
	headRef: string;
	root: string;
	dir: string[];
}) {
	if (isImageType(contentType)) {
		return (
			<div className="border p-4 flex justify-center bg-muted/30">
				<img src={contentUrl(outpoint)} alt={name} className="max-h-[70vh]" />
			</div>
		);
	}
	if (text === null || !(isTextType(contentType) || CODE_EXT.has(ext(name)))) {
		return (
			<div className="border p-6 text-sm text-muted-foreground flex flex-col gap-2 items-start">
				<span>
					Binary file{size !== undefined ? ` · ${formatBytes(size)}` : ""}
					{contentType ? ` · ${contentType}` : ""}
				</span>
				<a href={contentUrl(outpoint)} className="underline" download={name}>
					Download {name}
				</a>
			</div>
		);
	}
	if (ext(name) === "md" || ext(name) === "markdown") {
		return (
			<div className="border p-6">
				<Markdown
					source={text}
					origin={origin}
					headRef={headRef}
					root={root}
					dir={dir}
				/>
				{truncated && <Truncated outpoint={outpoint} />}
			</div>
		);
	}
	const lines = text.split("\n");
	const html = CODE_EXT.has(ext(name)) ? highlight(text) : escapeHtml(text);
	return (
		<div className="border overflow-x-auto">
			<div className="flex text-xs font-mono">
				<pre className="select-none text-right text-muted-foreground px-3 py-3 border-r bg-muted/30">
					{lines.map((_, i) => `${i + 1}\n`)}
				</pre>
				<pre className="px-3 py-3 flex-1">
					<code dangerouslySetInnerHTML={{ __html: html }} />
				</pre>
			</div>
			{truncated && <Truncated outpoint={outpoint} />}
		</div>
	);
}

function Truncated({ outpoint }: { outpoint: string }) {
	return (
		<p className="text-xs text-muted-foreground p-3 border-t">
			File truncated for display.{" "}
			<a href={contentUrl(outpoint)} className="underline">
				View raw
			</a>
		</p>
	);
}

function escapeHtml(s: string) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
