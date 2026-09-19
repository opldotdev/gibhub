import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { contentUrl } from "@/lib/ordfs";
import { routes } from "@/lib/routes";

const isRelative = (url: string) =>
	!/^[a-z][a-z0-9+.-]*:/i.test(url) &&
	!url.startsWith("#") &&
	!url.startsWith("/");

function joinPath(base: string[], rel: string): string[] {
	const parts = [...base];
	for (const seg of rel.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return parts;
}

/**
 * Renders markdown from a repository. Relative image sources resolve to
 * ORDFS content under the tree root; relative links resolve to blob pages
 * at the same ref, so READMEs work the way they do on any code host.
 */
export function Markdown({
	source,
	origin,
	headRef,
	root,
	dir = [],
}: {
	source: string;
	origin: string;
	headRef: string;
	root: string;
	/** Directory of the markdown file, as path components. */
	dir?: string[];
}) {
	return (
		<div className="markdown">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				urlTransform={(url, key) => {
					if (!isRelative(url)) return url;
					const target = joinPath(dir, url.split("#")[0] ?? "");
					if (key === "src") return contentUrl(root, target.join("/"));
					return routes.blob(origin, headRef, target);
				}}
			>
				{source}
			</ReactMarkdown>
		</div>
	);
}
