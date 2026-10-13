/**
 * Served modelUsage overwrites both the catalog entry and the live model
 * object pi reads for its context panel.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncServedWindow } from "../src/served-window.js";

describe("syncServedWindow", () => {
	it("applies the served window to every matching target", () => {
		const catalog = { contextWindow: 131_072, maxTokens: 8192 };
		const live = { contextWindow: 131_072, maxTokens: 8192 };
		const changes = syncServedWindow(
			{ "step-5-preview": { contextWindow: 1_000_000, maxOutputTokens: 64_000 } },
			() => [catalog, live],
		);
		assert.equal(catalog.contextWindow, 1_000_000);
		assert.equal(catalog.maxTokens, 64_000);
		assert.equal(live.contextWindow, 1_000_000);
		assert.equal(live.maxTokens, 64_000);
		assert.equal(changes.length, 4);
	});

	it("leaves targets alone when the served value is missing or unchanged", () => {
		const model = { contextWindow: 960_000, maxTokens: 64_000 };
		const changes = syncServedWindow(
			{ "hy4-preview": { contextWindow: 960_000, maxOutputTokens: 0 } },
			() => [model],
		);
		assert.deepEqual(model, { contextWindow: 960_000, maxTokens: 64_000 });
		assert.deepEqual(changes, []);
	});

	it("returns no changes without modelUsage", () => {
		assert.deepEqual(syncServedWindow(undefined, () => [{ contextWindow: 1 }]), []);
	});
});
