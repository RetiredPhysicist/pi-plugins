import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __test } from "../src/index.js";
import { getSessionPath } from "../src/cb-session-io.js";

const success = { type: "result", subtype: "success", result: "DEFAULT-OK" };
const modelError = "400 model [opus] service info not found\nCurrently supported models for your account:\n  - glm-5.2";

// Exercise the real AskCodebuddy query path without starting a CLI subprocess.
function fakeQuery(messages = [success], error) {
	let args;
	let closed = false;
	return {
		get args() { return args; },
		get closed() { return closed; },
		run(input) {
			args = input;
			return {
				async *[Symbol.asyncIterator]() {
					if (error) throw error;
					yield* messages;
				},
				interrupt: async () => {},
				transport: { close() { closed = true; } },
			};
		},
	};
}

describe("AskCodebuddy model selection", () => {
	let configDir;
	let previousConfigDir;
	beforeEach(() => {
		previousConfigDir = process.env.CODEBUDDY_CONFIG_DIR;
		configDir = mkdtempSync(join(tmpdir(), "askcodebuddy-model-"));
		process.env.CODEBUDDY_CONFIG_DIR = configDir;
	});
	afterEach(() => {
		__test.resetSharedSession();
		if (previousConfigDir === undefined) delete process.env.CODEBUDDY_CONFIG_DIR;
		else process.env.CODEBUDDY_CONFIG_DIR = previousConfigDir;
		rmSync(configDir, { recursive: true, force: true });
	});

	for (const isolated of [false, true]) {
		it(`omits every model option when model is absent (isolated=${isolated})`, async () => {
			const fake = fakeQuery();
			const context = [{ role: "user", content: "Earlier question", timestamp: 1 }];
			const result = await __test.promptAndWait("say hi", "none", new Map(), undefined, { isolated, context }, fake.run);
			assert.equal(result.responseText, "DEFAULT-OK");
			assert.equal(Object.hasOwn(fake.args.options, "model"), false);
			assert.equal(Object.hasOwn(fake.args.options.extraArgs, "model"), false);
			assert.equal(fake.closed, true);
			if (!isolated) {
				const session = __test.getSharedSession();
				assert.equal(fake.args.options.resume, session.sessionId);
				// The imported shared session must not claim a guessed default model.
				const records = readFileSync(getSessionPath(session.sessionId, session.cwd), "utf8").trim().split("\n").map(JSON.parse);
				assert.ok(records.length > 0);
				assert.ok(records.every((record) => !Object.hasOwn(record, "model")));
				const later = __test.syncSharedSession([...context, { role: "user", content: "Next turn", timestamp: 2 }], session.cwd);
				assert.equal(later.sessionId, session.sessionId);
			}
		});
	}

	it("honours an explicit ID even when it is absent from the cached catalog", async () => {
		const fake = fakeQuery();
		await __test.promptAndWait("say hi", "none", new Map(), undefined, { model: "glm-5.2", isolated: true }, fake.run);
		assert.equal(fake.args.options.extraArgs.model, "glm-5.2");
	});

	it("resolves an explicit shorthand against the catalog", async () => {
		const fake = fakeQuery();
		await __test.promptAndWait("say hi", "none", new Map(), undefined, { model: "deepseek", isolated: true }, fake.run);
		assert.equal(fake.args.options.extraArgs.model, "deepseek-v4.1-flash");
	});

	for (const source of ["throw", "result", "stream"]) {
		it(`makes an unavailable explicit model actionable (${source})`, async () => {
			const messages = source === "stream"
				? [{ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: modelError } } }, { ...success, is_error: true }]
				: [{ type: "result", subtype: "error_during_execution", errors: [modelError] }];
			const fake = fakeQuery(messages, source === "throw" ? new Error(modelError) : undefined);
			await assert.rejects(
				__test.promptAndWait("say hi", "none", new Map(), undefined, { model: "opus", isolated: true }, fake.run),
				(error) => {
					assert.match(error.message, /CodeBuddy model "opus" is unavailable for this account/);
					assert.match(error.message, /omit model to use the CLI's account default/);
					assert.match(error.message, /glm-5\.2/);
					return true;
				},
			);
			assert.equal(fake.args.options.extraArgs.model, "opus");
			assert.equal(fake.closed, true);
		});
	}

	it("preserves unrelated query errors", async () => {
		const error = new Error("Connection refused");
		const fake = fakeQuery([], error);
		await assert.rejects(__test.promptAndWait("say hi", "none", new Map(), undefined, {}, fake.run), (actual) => actual === error);
		assert.equal(fake.closed, true);
	});
});
