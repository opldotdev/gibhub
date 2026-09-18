const trimTrailingSlash = (url: string) => url.replace(/\/$/, "");

/** 1Sat stack serving ORDFS content and the gib overlay. */
export const STACK_URL = trimTrailingSlash(
	process.env.NEXT_PUBLIC_ONESAT_STACK_URL || "https://api.1sat.app",
);

/** Wallet basket holding the connected user's commit heads. */
export const GIB_BASKET = process.env.NEXT_PUBLIC_GIB_BASKET || "gib";

export const APP_URL = trimTrailingSlash(
	process.env.NEXT_PUBLIC_APP_URL || "https://gibhub.net",
);

export const stackApiUrl = (path: string) =>
	`${STACK_URL}/${path.replace(/^\//, "")}`;
