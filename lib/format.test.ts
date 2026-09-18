import { describe, expect, test } from "bun:test";
import {
	firstLine,
	formatBytes,
	headTime,
	isOutpoint,
	messageBody,
	shortKey,
	shortOutpoint,
	timeAgo,
	toOrdinalOutpoint,
} from "./format";
import { resolvePointer } from "./ordfs";
import { routes } from "./routes";

const txid = "c657be5a7dacd7bb7343d92b7195d1366dbecd3ec31874576189efd28eee007c";

describe("outpoints", () => {
	test("accepts both separators and normalizes to underscore", () => {
		expect(isOutpoint(`${txid}_0`)).toBe(true);
		expect(isOutpoint(`${txid}.12`)).toBe(true);
		expect(isOutpoint("main")).toBe(false);
		expect(toOrdinalOutpoint(`${txid}.12`)).toBe(`${txid}_12`);
	});

	test("shortens for display", () => {
		expect(shortOutpoint(`${txid}_0`)).toBe("c657be5a…007c_0");
		expect(shortKey("02abcdef0123456789")).toBe("02abcd…6789");
	});

	test("resolves manifest pointers", () => {
		expect(resolvePointer(`${txid}_4`, "_1")).toBe(`${txid}_1`);
		expect(resolvePointer(`${txid}_4`, `${"a".repeat(64)}.7`)).toBe(
			`${"a".repeat(64)}_7`,
		);
	});
});

describe("routes", () => {
	test("encodes branch names with slashes and paths", () => {
		expect(routes.commits(`${txid}.0`, "feature/x")).toBe(
			`/r/${txid}_0/commits/feature/x`,
		);
		expect(routes.blob(`${txid}_0`, `${txid}_1`, ["src", "a b.ts"])).toBe(
			`/r/${txid}_0/blob/${txid}_1/src/a%20b.ts`,
		);
	});
});

describe("commit text", () => {
	test("splits subject and body", () => {
		expect(firstLine("Fix thing\n\nDetails here\n")).toBe("Fix thing");
		expect(messageBody("Fix thing\n\nDetails here\n")).toBe("Details here");
		expect(messageBody("only subject")).toBe("");
	});

	test("head time prefers author time then mempool score", () => {
		expect(
			headTime({
				commit: { author: { time: 1700000000 } },
				score: 0,
				height: 0,
			}),
		).toBe(1700000000);
		expect(headTime({ score: 1700000123.5, height: 0 })).toBe(1700000123);
		expect(headTime({ score: 900000.000001, height: 900000 })).toBeUndefined();
	});
});

describe("formatting", () => {
	test("bytes", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(undefined)).toBe("");
	});

	test("time ago", () => {
		const now = 1_700_000_000_000;
		expect(timeAgo(1_700_000_000 - 5, now)).toBe("just now");
		expect(timeAgo(1_700_000_000 - 90, now)).toBe("1 minute ago");
		expect(timeAgo(1_700_000_000 - 3 * 86400, now)).toBe("3 days ago");
	});
});
