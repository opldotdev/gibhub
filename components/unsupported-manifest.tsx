import { UnsupportedManifestError } from "@/lib/ordfs";

/** Shown when a tree uses a manifest format this build cannot decode. */
export function UnsupportedManifest({ error }: { error: unknown }) {
	const message =
		error instanceof UnsupportedManifestError
			? error.message
			: error instanceof Error
				? error.message
				: "unknown error";
	return (
		<div className="border border-dashed p-6 text-sm text-muted-foreground">
			<p className="font-medium text-foreground">
				Can&apos;t list this tree yet
			</p>
			<p className="mt-1">{message}</p>
			<p className="mt-1">
				Binary <code className="font-mono">ordfs/dir</code> manifests are
				decoded by the @1sat SDK codec, which this build does not include yet.
				Files are still served by ORDFS.
			</p>
		</div>
	);
}

export const isUnsupportedManifest = (err: unknown) =>
	err instanceof UnsupportedManifestError;
