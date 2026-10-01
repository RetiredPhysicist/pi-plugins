import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBashExitCode } from "../bash-exit-code.ts";

describe("parseBashExitCode", () => {
	it("returns 0 for successful commands", () => {
		assert.equal(
			parseBashExitCode({
				isError: false,
				content: [{ type: "text", text: "hello\n" }],
			}),
			0,
		);
	});

	it("parses explicit exit codes from bash output", () => {
		assert.equal(
			parseBashExitCode({
				isError: true,
				content: [
					{
						type: "text",
						text: "something failed\n\nCommand exited with code 42",
					},
				],
			}),
			42,
		);
	});

	it("returns 130 for aborted commands", () => {
		assert.equal(
			parseBashExitCode({
				isError: true,
				content: [{ type: "text", text: "Command aborted" }],
			}),
			130,
		);
	});

	it("returns 124 for timed out commands", () => {
		assert.equal(
			parseBashExitCode({
				isError: true,
				content: [{ type: "text", text: "Command timed out after 30 seconds" }],
			}),
			124,
		);
	});

	it("defaults to 1 for generic errors", () => {
		assert.equal(
			parseBashExitCode({
				isError: true,
				content: [{ type: "text", text: "unknown failure" }],
			}),
			1,
		);
	});
});
