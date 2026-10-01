import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuzzySearch } from "../fuzzy-match.ts";
import { normalizeHistoryText } from "../history-preview.ts";

describe("fuzzy search with normalized history text", () => {
	const items = [
		{ text: "npm install\npi /reload" },
		{ text: "git commit -m fix" },
		{ text: "npm test" },
	];

	it("misses cross-line substring on raw text", () => {
		const results = fuzzySearch("install pi", items, (i) => i.text);
		assert.equal(results.length, 0);
	});

	it("matches cross-line substring after normalization", () => {
		const results = fuzzySearch("install pi", items, (i) => normalizeHistoryText(i.text));
		assert.equal(results.length, 1);
		assert.equal(results[0]!.item.text, "npm install\npi /reload");
	});

	it("indices align with normalized text", () => {
		const results = fuzzySearch("reload", items, (i) => normalizeHistoryText(i.text));
		assert.equal(results.length, 1);
		const normalized = normalizeHistoryText(results[0]!.item.text);
		const idx = results[0]!.result.indices[0]!;
		assert.equal(normalized.slice(idx, idx + 6), "reload");
	});

	it("still matches single-line entries", () => {
		const results = fuzzySearch("git commit", items, (i) => normalizeHistoryText(i.text));
		assert.equal(results.length, 1);
		assert.equal(results[0]!.item.text, "git commit -m fix");
	});
});
