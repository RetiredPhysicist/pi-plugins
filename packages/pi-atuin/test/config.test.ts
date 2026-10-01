import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../config.ts";

describe("DEFAULT_CONFIG", () => {
	it("records agent bash history by default", () => {
		assert.equal(DEFAULT_CONFIG.recordAgentHistory, true);
	});
});
