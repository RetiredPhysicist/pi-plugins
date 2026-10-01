import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	buildDetailPreview,
	flattenHistoryLine,
	isMultilineHistory,
	needsDetailPreview,
	normalizeHistoryText,
	normalizeHistoryLines,
	truncateTailPure,
	truncateToWidthPure,
	wrapLinePure,
	ELLIPSIS,
} from "../history-preview.ts";

describe("normalizeHistoryText", () => {
	it("collapses newlines to spaces", () => {
		assert.equal(normalizeHistoryText("npm install\npi /reload"), "npm install pi /reload");
	});

	it("collapses repeated whitespace", () => {
		assert.equal(normalizeHistoryText("foo   bar"), "foo bar");
	});

	it("strips control characters including DEL", () => {
		assert.equal(normalizeHistoryText("a\u0007b"), "a b");
		assert.equal(normalizeHistoryText("a\u007fb"), "a b");
	});

	it("normalizes CRLF", () => {
		assert.equal(normalizeHistoryText("line1\r\nline2"), "line1 line2");
	});

	it("flattenHistoryLine alias", () => {
		assert.equal(flattenHistoryLine("a\nb"), "a b");
	});
});

describe("normalizeHistoryLines", () => {
	it("keeps line breaks", () => {
		assert.deepEqual(normalizeHistoryLines("npm install\npi /reload"), [
			"npm install",
			"pi /reload",
		]);
	});

	it("sanitizes each line independently", () => {
		assert.deepEqual(normalizeHistoryLines("foo\u0007bar\nbaz"), ["foo bar", "baz"]);
	});
});

describe("isMultilineHistory", () => {
	it("detects newline", () => {
		assert.equal(isMultilineHistory("a\nb"), true);
		assert.equal(isMultilineHistory("single"), false);
	});
});

describe("truncateToWidthPure", () => {
	it("returns text when it fits", () => {
		assert.equal(truncateToWidthPure("short", 10), "short");
	});

	it("truncates with ellipsis at end", () => {
		assert.equal(truncateToWidthPure("hello world", 8), `hello w${ELLIPSIS}`);
	});
});

describe("truncateTailPure", () => {
	it("keeps the end of long text", () => {
		const r = truncateTailPure("CREATE USER atuin WITH PASSWORD 'secret'", 20);
		assert.ok(r.startsWith(ELLIPSIS));
		assert.ok(r.includes("secret"));
		assert.ok(!r.includes("CREATE"));
	});
});

describe("wrapLinePure", () => {
	it("splits long lines by width", () => {
		assert.deepEqual(wrapLinePure("abcdefgh", 3), ["abc", "def", "gh"]);
	});

	it("returns single chunk when it fits", () => {
		assert.deepEqual(wrapLinePure("abc", 10), ["abc"]);
	});
});

describe("needsDetailPreview", () => {
	it("true for multiline", () => {
		assert.equal(needsDetailPreview("a\nb", 80), true);
	});

	it("true when normalized text exceeds list width", () => {
		const long = "x".repeat(50);
		assert.equal(needsDetailPreview(long, 20), true);
	});

	it("false for short single line", () => {
		assert.equal(needsDetailPreview("npm install", 40), false);
	});
});

describe("buildDetailPreview", () => {
	it("returns empty for short single line", () => {
		assert.deepEqual(buildDetailPreview("npm install", 40), []);
	});

	it("wraps multiline content", () => {
		const lines = buildDetailPreview("npm install\npi /reload", 12);
		assert.ok(lines.length >= 2);
		assert.equal(lines[0], "npm install");
		assert.equal(lines[1], "pi /reload");
	});

	it("shows head and tail for very long single line", () => {
		const long = `git commit -m "${"a".repeat(40)}" --allow-empty`;
		const lines = buildDetailPreview(long, 20, 2);
		assert.equal(lines.length, 2);
		assert.ok(lines[0]!.endsWith(ELLIPSIS));
		assert.ok(lines[1]!.startsWith(ELLIPSIS));
	});

	it("shows tail for moderately long single line", () => {
		const text = "npm run build --project=my-app";
		const lines = buildDetailPreview(text, 15, 2);
		assert.equal(lines.length, 1);
		assert.ok(lines[0]!.startsWith(ELLIPSIS));
		assert.ok(lines[0]!.includes("my-app"));
	});

	it("respects maxLines for multiline wrap", () => {
		const text = "line one is long enough to wrap\nline two\nline three";
		const lines = buildDetailPreview(text, 10, 2);
		assert.equal(lines.length, 2);
	});
});
