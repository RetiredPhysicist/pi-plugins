import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	formatRecordAgentHistoryStatus,
	toggleRecordAgentHistory,
} from "../commands.ts";

describe("record-agent-history toggle", () => {
	it("flips the current value", () => {
		assert.equal(toggleRecordAgentHistory(true), false);
		assert.equal(toggleRecordAgentHistory(false), true);
	});

	it("formats status for notify", () => {
		assert.equal(formatRecordAgentHistoryStatus(true), "Agent bash history recording: on");
		assert.equal(formatRecordAgentHistoryStatus(false), "Agent bash history recording: off");
	});
});
