import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch, fuzzySearch } from "../fuzzy-match.js";

describe("fuzzyMatch", () => {
	it("exact substring match", () => {
		const r = fuzzyMatch("npm", "npm install");
		assert.ok(r);
		assert.ok(r.score > 1000);
		assert.deepEqual(r.indices, [0, 1, 2]);
	});

	it("substring at position > 0", () => {
		const r = fuzzyMatch("install", "npm install");
		assert.ok(r);
		assert.ok(r.indices[0] === 4);
	});

	it("fuzzy character match", () => {
		const r = fuzzyMatch("ni", "npm install");
		assert.ok(r);
		assert.ok(r.indices.length === 2);
	});

	it("word boundary bonus", () => {
		const a = fuzzyMatch("in", "npm install");
		const b = fuzzyMatch("in", "npmxinstall");
		assert.ok(a);
		assert.ok(b);
		assert.ok(a.score > b.score);
	});

	it("empty query matches everything", () => {
		const r = fuzzyMatch("", "anything");
		assert.ok(r);
		assert.equal(r.score, 1);
		assert.equal(r.indices.length, 0);
	});

	it("no match returns null", () => {
		const r = fuzzyMatch("xyz", "npm install");
		assert.equal(r, null);
	});

	it("case insensitive", () => {
		const r = fuzzyMatch("NPM", "npm install");
		assert.ok(r);
		assert.ok(r.score > 0);
	});

	it("single char query", () => {
		const r = fuzzyMatch("n", "npm install");
		assert.ok(r);
		assert.equal(r.indices.length, 1);
	});
});

describe("fuzzySearch", () => {
	const items = [
		{ text: "npm install" },
		{ text: "git commit" },
		{ text: "npm test" },
		{ text: "git push" },
		{ text: "ls -la" },
	];

	it("returns all items when query is empty", () => {
		const results = fuzzySearch("", items, (i) => i.text);
		assert.equal(results.length, items.length);
	});

	it("filters by query", () => {
		const results = fuzzySearch("npm", items, (i) => i.text);
		assert.equal(results.length, 2);
		assert.ok(results.every((r) => r.item.text.includes("npm")));
	});

	it("respects limit", () => {
		const results = fuzzySearch("git", items, (i) => i.text, 1);
		assert.equal(results.length, 1);
	});

	it("sorted by score descending", () => {
		const results = fuzzySearch("npm", items, (i) => i.text);
		for (let i = 1; i < results.length; i++) {
			assert.ok(results[i - 1].result.score >= results[i].result.score);
		}
	});

	it("returns empty for no matches", () => {
		const results = fuzzySearch("zzz", items, (i) => i.text);
		assert.equal(results.length, 0);
	});
});
