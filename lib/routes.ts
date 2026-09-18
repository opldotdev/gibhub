import { toOrdinalOutpoint } from "./format";

const enc = (s: string) => encodeURIComponent(s);
const encPath = (path: string[]) => path.map(enc).join("/");

export const routes = {
	home: () => "/",
	me: () => "/me",
	user: (identity: string) => `/u/${identity}`,
	repo: (origin: string) => `/r/${toOrdinalOutpoint(origin)}`,
	tree: (origin: string, ref: string, path: string[] = []) =>
		`/r/${toOrdinalOutpoint(origin)}/tree/${enc(ref)}${path.length ? `/${encPath(path)}` : ""}`,
	blob: (origin: string, ref: string, path: string[]) =>
		`/r/${toOrdinalOutpoint(origin)}/blob/${enc(ref)}/${encPath(path)}`,
	commits: (origin: string, branch: string) =>
		`/r/${toOrdinalOutpoint(origin)}/commits/${branch.split("/").map(enc).join("/")}`,
	commit: (origin: string, headOutpoint: string) =>
		`/r/${toOrdinalOutpoint(origin)}/commit/${toOrdinalOutpoint(headOutpoint)}`,
};
