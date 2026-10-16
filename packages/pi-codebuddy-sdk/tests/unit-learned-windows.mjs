/**
 * Tests for the learned-window store (src/learned-windows.js).
 *
 * Served windows arrive per turn inside `modelUsage` and used to live only in
 * memory, so every new process re-registered the name estimate. The store keeps
 * them on disk and re-applies them after `buildModels()`.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	LEARNED_WINDOWS_KEY,
	applyLearnedWindows,
	pruneLearnedWindows,
	readLearnedWindows,
	recordServedWindows,
	writeLearnedWindows,
} from "../src/learned-windows.js";

const model = (id, contextWindow = 131_072, maxTokens = 8192) => ({ id, contextWindow, maxTokens });
const windowChange = (id, field, to) => ({ id, field, from: 131_072, to });

let tmp;

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "cb-learned-"));
	process.env.CODEBUDDY_SDK_LEARNED_WINDOWS_PATH = join(tmp, "learned.json");
	delete globalThis[LEARNED_WINDOWS_KEY];
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env.CODEBUDDY_SDK_LEARNED_WINDOWS_PATH;
	delete globalThis[LEARNED_WINDOWS_KEY];
});

describe("learned window store", () => {
	it("persists recorded values for the next process", () => {
		const map = readLearnedWindows();
		assert.deepEqual(map, {});

		const touched = recordServedWindows(map, [
			windowChange("step-5-preview", "contextWindow", 1_000_000),
			windowChange("step-5-preview", "maxTokens", 64_000),
			windowChange("glm-5.3", "contextWindow", 1_000_000),
		]);
		assert.equal(touched, true);
		writeLearnedWindows(map);

		// A new process: drop the in-process cache and read the file back.
		delete globalThis[LEARNED_WINDOWS_KEY];
		assert.deepEqual(readLearnedWindows(), {
			"glm-5.3": { contextWindow: 1_000_000 },
			"step-5-preview": { contextWindow: 1_000_000, maxTokens: 64_000 },
		});

		const onDisk = JSON.parse(readFileSync(join(tmp, "learned.json"), "utf8"));
		assert.equal(onDisk["step-5-preview"].maxTokens, 64_000);
	});

	it("reports no change for empty, non-positive or unchanged values", () => {
		const map = { "hy3": { contextWindow: 192_000 } };
		assert.equal(recordServedWindows(map, [windowChange("hy3", "contextWindow", 192_000)]), false);
		assert.equal(recordServedWindows(map, [windowChange("hy3", "maxTokens", 0)]), false);
		assert.equal(recordServedWindows(map, []), false);
		assert.deepEqual(map, { "hy3": { contextWindow: 192_000 } });
	});

	it("drops ids the backend no longer serves", () => {
		const map = { "hy3": { contextWindow: 192_000 }, "gone-model": { contextWindow: 1 } };
		assert.deepEqual(pruneLearnedWindows(map, ["hy3", "glm-5.3"]), { "hy3": { contextWindow: 192_000 } });
	});

	it("ignores a corrupt or unusable store", () => {
		writeFileSync(join(tmp, "learned.json"), "not json");
		assert.deepEqual(readLearnedWindows(), {});

		delete globalThis[LEARNED_WINDOWS_KEY];
		writeFileSync(
			join(tmp, "learned.json"),
			JSON.stringify({ good: { contextWindow: 1000 }, bad: { contextWindow: "many" }, empty: {} }),
		);
		assert.deepEqual(readLearnedWindows(), { good: { contextWindow: 1000 } });
	});
});

describe("applyLearnedWindows", () => {
	it("overwrites estimates for exact ids only", () => {
		const models = [model("glm-5.3"), model("glm-5.3-flash"), model("kimi-k2.7")];
		const applied = applyLearnedWindows(models, { "glm-5.3": { contextWindow: 1_000_000, maxTokens: 64_000 } });
		assert.deepEqual(applied[0], { id: "glm-5.3", contextWindow: 1_000_000, maxTokens: 64_000 });
		// The learned id must not leak into a longer model id.
		assert.deepEqual(applied[1], model("glm-5.3-flash"));
		assert.deepEqual(applied[2], model("kimi-k2.7"));
	});

	it("keeps user overrides authoritative", () => {
		const models = [model("hy4-preview", 960_000, 64_000), model("hy3")];
		const applied = applyLearnedWindows(
			models,
			{ "hy4-preview": { contextWindow: 1_000_000 }, "hy3": { contextWindow: 192_000 } },
			(id) => id === "hy4-preview",
		);
		assert.deepEqual(applied[0], model("hy4-preview", 960_000, 64_000));
		assert.deepEqual(applied[1], model("hy3", 192_000, 8192));
	});

	it("does not mutate the input list", () => {
		const models = [model("hy3")];
		applyLearnedWindows(models, { "hy3": { contextWindow: 192_000 } });
		assert.deepEqual(models, [model("hy3")]);
	});
});
